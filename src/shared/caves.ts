import { WORLD_H, WORLD_W } from './constants.ts';
import { Mat, isSoil } from './materials.ts';
import { Rng, hash2 } from './rng.ts';
import { ACTOR_H } from './constants.ts';
import { Backdrop, type Complex, HOLE_W, LINING, MOD_H, MOD_W, SCALE, SLAB, Style, WALL, buildComplex, fill, markBackdrop, markBox } from './structures.ts';

/**
 * Cave maps: under the bunkers, a great tunnel system, the underground
 * battle highway. Built after the bunkers, as part of map generation (so
 * clients carve the identical caves from the seed):
 *
 * - **The highway**: one vast tunnel, 60 to 80 cells high, running the
 *   length of the map below every bunker's deepest basement, winding up and
 *   down with the land above it (gently enough to walk, roll or crawl
 *   along). Its walls are rimmed with basalt; stalactites hang from its roof,
 *   boulders and rubble mounds lie on its floor.
 * - **Citadels**: two or three huge domed caverns along it. About half
 *   have an underground fortress standing in it (a fortified or steel-built
 *   bunker complex, as tall as the dome allows), a paved road through, and
 *   a gatehouse hanging from the roof over the highway either side. The
 *   rest are natural citadels (see naturalCitadel): rock, no fort.
 * - **The deep run**: a second, lower tunnel some 100 to 170 cells under
 *   the highway (and under the citadels' basements), wherever there's room
 *   above the bedrock, joined to the highway by three to five long sloping
 *   passages.
 * - **Shafts**: every bunker complex (and sniper tower) sinks a
 *   concrete-lined shaft from its deepest basement (its ground floor, if it
 *   has none) straight down into the highway, and every citadel one on down
 *   into the deep run: wide enough for a clone, a spider droid, a
 *   tarantula. So the bunkers are all connected underground.
 * - **Ramps**: two or three long sloping tunnels from open ground down into
 *   the highway, for tanks and anything else that can't jet.
 * - **Galleries**: winding side tunnels off the highway, each ending in a
 *   chamber with a seam of gold in it.
 *
 * Integer arithmetic, hashes and the seeded Rng (plus the odd square root),
 * so every engine carves the same caves.
 */
export interface Shaft {
  /** Centre column. */
  x: number;
  /** The floor it opens out of (the basement's standing surface), and the highway floor it drops to. */
  top: number;
  bottom: number;
  /** Down from a citadel into the deep run (else from a bunker into the highway). */
  deep: boolean;
}

export interface Ramp {
  /** Its mouth on the surface and its foot in the highway (standing points). */
  top: { x: number; y: number };
  bottom: { x: number; y: number };
}

export interface Cavern {
  /** Centre, half-width, and its level floor. */
  x: number;
  hw: number;
  floor: number;
  /** A natural citadel: rock, no fortress (a butte for its keep, rock arches for its gates). */
  natural: boolean;
}

export interface CaveNet {
  /** The highway's floor (standing surface) and roof per column; 0 where it doesn't run. */
  floor: Int32Array;
  ceil: Int32Array;
  shafts: Shaft[];
  ramps: Ramp[];
  /** The citadels' fortresses (bunker complexes, standing in their caverns). */
  citadels: Complex[];
  /** Every great cavern on the highway: a citadel's (with its fortress), or a natural one (none). */
  caverns: Cavern[];
  /** The deep run: a second, lower tunnel under the highway (floor and roof per column; 0 where none). */
  lowFloor: Int32Array;
  lowCeil: Int32Array;
  /** Sloping passages down from the highway (top) to the deep run (bottom). */
  links: Ramp[];
}

/** The highway: its extent, height, and how far below the bunkers it keeps. */
const HWY_X0 = 40;
const HWY_X1 = WORLD_W - 40;
const HWY_H = 62;
const HWY_H_VAR = 18;
const UNDER_BUNKERS = 26;
/** Its floor keeps this far above the bedrock. */
const FLOOR_MIN = 30;
/** Shaft width (inside its lining): a tarantula fits. */
const SHAFT_W = HOLE_W + 8;
/** A ramp's slope (cells down per cell along) and headroom. */
const RAMP_SLOPE = 0.55;
const RAMP_H = 50;
/** The steepest a tunnel floor rises (cells per cell): walkable. */
const MAX_RISE = 0.7;
/** Citadel gatehouses: gates tall and wide enough for a tarantula, between square posts. */
const GATE_H = 50;
const GATE_W = 44;
const POST = 14;

/** Smooth 1D value noise in [0, 1). */
function vn(x: number, scale: number, salt: number): number {
  const f = x / scale;
  const i = Math.floor(f);
  let t = f - i;
  t = t * t * (3 - 2 * t);
  const a = hash2(i, 0, salt) / 4294967296;
  const b = hash2(i + 1, 0, salt) / 4294967296;
  return a + (b - a) * t;
}

const at = (x: number, y: number) => y * WORLD_W + x;
const inside = (x: number, y: number) => x >= 4 && x < WORLD_W - 4 && y >= 0 && y < WORLD_H - 12;

/**
 * A dripstone formation (Mat.Dripstone) growing from (x, root): a stalactite
 * hanging down (`dir` 1) or a stalagmite standing up (`dir` -1), `len` cells
 * long and `w` half-wide at its root, tapering to a point, ringed every few
 * cells with a slight bulge (the drip lines). It only fills open air.
 */
export function dripstone(m: Uint8Array, x: number, root: number, dir: number, len: number, w: number, salt: number): void {
  for (let k = 0; k < len; k++) {
    const t = k / len;
    let half = w * Math.pow(1 - t, 0.75);
    if (k > 1 && k % 6 === 3) half += 0.8; // a drip ring
    half += ((hash2(x, k, salt) & 3) - 1.5) * 0.15;
    const y = root + dir * k;
    for (let dx = -Math.ceil(half); dx <= Math.ceil(half); dx++) {
      if (Math.abs(dx) > half + 0.25) continue;
      if (inside(x + dx, y) && m[at(x + dx, y)] === Mat.Air) m[at(x + dx, y)] = Mat.Dripstone;
    }
  }
}

/** Natural ground a formation can grow from (never a bunker's concrete or steel, nor the ancient stone). */
const natural = (v: number) => isSoil(v) || v === Mat.Rock;

/**
 * Dripstone through the natural caves of any map: stalactites from their
 * roofs, the odd stalagmite on their floors, wherever a cave is roomy enough
 * (never on bunkers or near the surface).
 */
export function dripCaves(m: Uint8Array, heights: Int32Array, seed: number): void {
  const rng = new Rng(seed ^ 0xd419);
  const tries = 900;
  let hung = 0;
  let stood = 0;
  for (let n = 0; n < tries && (hung < 46 || stood < 18); n++) {
    const x = 20 + rng.int(WORLD_W - 40);
    let y = heights[x] + 30 + rng.int(Math.max(1, WORLD_H - heights[x] - 80));
    if (!inside(x, y)) continue;
    const up = rng.next() < 0.7;
    if (up) {
      // Up to a roof: open air under it, natural rock or soil in it.
      while (y > heights[x] + 20 && m[at(x, y)] === Mat.Air) y--;
      if (m[at(x, y)] === Mat.Air || !natural(m[at(x, y)]) || hung >= 46) continue;
      let room = 0;
      while (room < 120 && inside(x, y + 1 + room) && m[at(x, y + 1 + room)] === Mat.Air) room++;
      if (room < 24) continue;
      // (In a big cave, a tunnel, a cavern, a tarantula still walks under it.)
      const len = Math.min(room >= 48 ? room - 48 : Math.floor(room * 0.4), 8 + rng.int(18));
      if (len < 5) continue;
      dripstone(m, x, y + 1, 1, len, 2 + rng.int(3), seed ^ x);
      hung++;
    } else {
      // Down to a floor.
      while (y < WORLD_H - 20 && m[at(x, y)] === Mat.Air) y++;
      if (m[at(x, y)] === Mat.Air || !natural(m[at(x, y)]) || stood >= 18) continue;
      let room = 0;
      while (room < 50 && inside(x, y - 1 - room) && m[at(x, y - 1 - room)] === Mat.Air) room++;
      if (room < 30) continue;
      dripstone(m, x, y - 1, -1, 4 + rng.int(5), 2 + rng.int(2), seed ^ x ^ 0x77);
      stood++;
    }
  }
}

/** A tunnel's bed: where its floor would open into a cave below, a rock floor this deep bridges it. */
const BED = 8;

/** Lay rock under a floor at (x, y) wherever it's open (so the way across stays whole). */
function bed(m: Uint8Array, x: number, y: number, depth = BED): void {
  for (let k = 0; k < depth; k++) if (inside(x, y + k) && m[at(x, y + k)] === Mat.Air) m[at(x, y + k)] = Mat.Rock;
}

/** Carve one cell to air (never the bedrock or a vault's steel). */
function dig(m: Uint8Array, x: number, y: number): void {
  if (!inside(x, y)) return;
  const v = m[at(x, y)];
  if (v !== Mat.Bedrock && v !== Mat.Metal) m[at(x, y)] = Mat.Air;
}

/** Carve a disc (worm tunnels, chambers), leaving structures alone. */
function digDisc(m: Uint8Array, cx: number, cy: number, r: number): void {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (!inside(x, y)) continue;
      const v = m[at(x, y)];
      if (v === Mat.Concrete || v === Mat.Metal || v === Mat.Bedrock) continue;
      m[at(x, y)] = Mat.Air;
    }
  }
}

/**
 * A tunnel's detail (between columns x0 and x1, its floor and roof per
 * column): its walls rimmed with basalt, patchily; stalactites hanging from
 * its roof; boulders and rubble mounds on its floor.
 */
function decorate(m: Uint8Array, floor: Int32Array, ceil: Int32Array, x0: number, x1: number, rng: Rng, salt: number): void {
  for (let x = x0; x < x1; x++) {
    if (!floor[x]) continue;
    for (let k = 0; k < 3; k++) {
      for (const y of [floor[x] + k, ceil[x] - 1 - k]) {
        if (!inside(x, y) || !isSoil(m[at(x, y)])) continue;
        if (hash2(x >> 1, y >> 1, salt) % 100 < 62 - k * 18) m[at(x, y)] = Mat.Rock;
      }
    }
  }
  for (let x = x0 + 20 + rng.int(40); x < x1 - 30; x += 30 + rng.int(70)) {
    if (!floor[x]) continue;
    const room = floor[x] - ceil[x];
    const len = Math.min(Math.floor(room * 0.35), 6 + rng.int(18));
    const w = 2 + rng.int(4);
    dripstone(m, x, ceil[x], 1, len, w, salt ^ x);
  }
  for (let x = x0 + 60 + rng.int(80); x < x1 - 60; x += 90 + rng.int(160)) {
    const h = 4 + rng.int(9);
    const w = 8 + rng.int(18);
    const mat = rng.next() < 0.5 ? Mat.Rock : Mat.Rubble;
    for (let dx = -w; dx <= w; dx++) {
      const fx = x + dx;
      if (!floor[fx]) continue;
      const hgt = Math.round(h * (1 - (dx * dx) / (w * w)));
      for (let dy = 1; dy <= hgt; dy++) if (inside(fx, floor[fx] - dy) && m[at(fx, floor[fx] - dy)] === Mat.Air) m[at(fx, floor[fx] - dy)] = mat;
    }
  }
}

/**
 * A natural citadel: a great domed cavern (centre `cx`, half-width `hw`,
 * its floor at `fl`, `domeH` high) with nature's own fortress in it, all
 * rock and no masonry:
 * - **the keep**: a vast mass of basalt hanging from the dome over the
 *   middle, its underside a low arch the highway runs under, with chambers
 *   inside it one over another (a hole up into the lowest from beneath, a
 *   chimney between them, windows out each side, gold in their walls);
 * - **the gates**: a curtain of rock hanging from the roof either side, an
 *   arch under it for the highway;
 * - **galleries**: rock ledges jutting from the walls at different heights;
 * - great stalactites from the dome, and low stalagmites on the floor.
 * The floor rolls gently and rises to meet the highway at either end.
 * `floor` and `ceil` (per column) are updated to the cavern's.
 */
function naturalCitadel(m: Uint8Array, floor: Int32Array, ceil: Int32Array, cx: number, hw: number, fl: number, domeH: number, rng: Rng, salt: number): void {
  const bottomAt = new Int32Array(2 * hw + 1);
  for (let x = cx - hw; x <= cx + hw; x++) {
    const u = (x - cx) / hw;
    const dome = Math.round(fl - domeH * Math.sqrt(Math.max(0, 1 - u * u)) + (vn(x, 13, salt) - 0.5) * 16);
    const e = Math.max(0, (Math.abs(u) - 0.72) / 0.28);
    const roll = Math.round((vn(x, 45, salt ^ 1) - 0.5) * 10 * (1 - e));
    const bottom = Math.round(fl + roll + (floor[x] - fl) * e * e);
    const cl = Math.min(ceil[x], dome);
    for (let y = cl; y < bottom; y++) dig(m, x, y);
    bed(m, x, bottom);
    floor[x] = bottom;
    ceil[x] = cl;
    bottomAt[x - cx + hw] = bottom;
  }
  const put = (x: number, y: number, mat: number) => {
    if (inside(x, y) && m[at(x, y)] === Mat.Air) m[at(x, y)] = mat;
  };
  const bot = (x: number) => bottomAt[Math.max(0, Math.min(2 * hw, x - cx + hw))];

  // The keep: a vast mass of basalt hanging from the dome over the middle of
  // the cavern, flared where it meets the roof, its underside a low arch the
  // highway runs under. Inside it, chambers one over another: a hole up into
  // the lowest from under it, a chimney between them, windows out each side.
  const kw = 46 + rng.int(26); // half-width
  const under = (x: number) => bot(x) - GATE_H - 6 - Math.round(Math.sqrt(Math.max(0, 1 - ((x - cx) / kw) ** 2)) * 8) + Math.round((vn(x, 6, salt ^ 2) - 0.5) * 4);
  const mass = (halfW: number, ax: number, edge: (x: number) => number, s2: number) => {
    for (let dx = -halfW - 22; dx <= halfW + 22; dx++) {
      const x = ax + dx;
      const e = edge(x);
      for (let y = ceil[x]; y < e; y++) {
        const fromRoof = y - ceil[x];
        const w = halfW + Math.max(0, 22 - fromRoof) + Math.round((vn(y, 7, s2) - 0.5) * 6);
        if (Math.abs(dx) <= w) put(x, y, (hash2(x >> 2, y >> 2, s2) & 7) === 0 ? Mat.Regolith : Mat.Rock);
      }
    }
  };
  mass(kw, cx, under, salt ^ 3);
  const base = under(cx);
  let floorY = base - 8; // the lowest chamber's floor
  let prevHole = cx + rng.int(kw) - (kw >> 1);
  // A hole up through the underside into the first chamber.
  for (let y = base + 2; y >= floorY - 2; y--) for (let x = prevHole - 8; x < prevHole + 8; x++) if (inside(x, y) && m[at(x, y)] !== Mat.Air && y >= floorY) m[at(x, y)] = Mat.Air;
  for (let n = 0; n < 3; n++) {
    const chH = (n === 0 ? 20 : 24) + rng.int(8);
    const top = floorY - chH;
    // (Rock enough over it to hold: the first always fits, the rest if there's room.)
    if (top < ceil[cx] + (n === 0 ? 12 : 26)) break;
    const cw = Math.round(kw * (0.7 + 0.2 * rng.next()));
    // The chamber: a rough-walled oval room, its floor flat.
    for (let dx = -cw; dx <= cw; dx++) {
      const x = cx + dx;
      const r = Math.sqrt(Math.max(0, 1 - (dx / cw) ** 2));
      const roofY = Math.round(floorY - chH * (0.55 + 0.45 * r) + (vn(x, 5, salt ^ (n + 9)) - 0.5) * 4);
      for (let y = roofY; y < floorY; y++) if (inside(x, y)) m[at(x, y)] = Mat.Air;
    }
    // Windows out to the cavern each side, at its floor.
    for (const side of [-1, 1]) for (let x = cx + side * cw; Math.abs(x - cx) < kw + 40; x += side) for (let y = floorY - 16; y < floorY; y++) if (inside(x, y) && m[at(x, y)] !== Mat.Air && (x - cx) * side > 0) m[at(x, y)] = Mat.Air;
    // Gold in its walls.
    const gx = cx + rng.int(2 * cw) - cw;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -5; dx <= 5; dx++) if ((dx * dx) / 25 + (dy * dy) / 9 <= 1 && inside(gx + dx, top - 4 + dy) && m[at(gx + dx, top - 4 + dy)] === Mat.Rock) m[at(gx + dx, top - 4 + dy)] = Mat.Gold;
    // A chimney up into the next one.
    const nextFloor = top - 7;
    const hole = cx + rng.int(cw) - (cw >> 1);
    for (let y = nextFloor; y < top + 2; y++) for (let x = hole - 8; x < hole + 8; x++) if (inside(x, y)) m[at(x, y)] = Mat.Air;
    prevHole = hole;
    floorY = nextFloor;
  }
  void prevHole;

  // The gates: a curtain of rock hanging from the roof each side, an arch
  // under it for the highway.
  for (const side of [-1, 1]) {
    const ax = cx + side * Math.round(kw + (hw - kw) * 0.5);
    const gw = 16 + rng.int(10);
    mass(gw, ax, (x) => bot(x) - GATE_H - Math.round(Math.sqrt(Math.max(0, 1 - ((x - ax) / (gw + 22)) ** 2)) * 10), salt ^ (side + 20));
  }

  // Ledges jutting from the walls: galleries to fight from.
  for (const side of [-1, 1]) {
    for (let n = 0; n < 2; n++) {
      // (Headroom from the highest floor under it, where the floor rises to the wall: a tarantula walks under the lowest.)
      let high = fl;
      for (let k = 0; k < 70; k++) high = Math.min(high, bot(cx + side * (hw - k)));
      const ly = high - 64 - n * 34 - rng.int(14);
      const len = 26 + rng.int(24);
      // From the wall at that height, inward.
      let wx = cx + side * hw;
      while (Math.abs(wx - cx) > 10 && inside(wx, ly) && m[at(wx, ly)] !== Mat.Air) wx -= side;
      for (let k = 0; k < len; k++) {
        const x = wx - side * k;
        const thick = Math.max(3, 9 - Math.floor((k * 6) / len));
        for (let t = 0; t < thick; t++) put(x, ly + t, Mat.Rock);
      }
    }
  }

  // Great stalactites from the dome, low stalagmites on the floor (clear of the gates and the keep).
  for (let n = 0; n < 6 + rng.int(4); n++) {
    const x = cx - hw + 20 + rng.int(2 * hw - 40);
    if (Math.abs(x - cx) < kw + 30) continue; // (not into the keep's chambers)
    const len = Math.min(Math.floor((bot(x) - ceil[x]) * 0.4), bot(x) - ceil[x] - 64, 18 + rng.int(34));
    if (len < 6) continue;
    dripstone(m, x, ceil[x], 1, len, 3 + rng.int(5), salt ^ x);
  }
  for (let n = 0; n < 5 + rng.int(4); n++) {
    const x = cx - hw + 20 + rng.int(2 * hw - 40);
    // (Clear of the keep, and on the level floor: toward the ends it's eased lower later.)
    if (Math.abs(x - cx) < kw + 30 || Math.abs(x - cx) > hw * 0.7) continue;
    dripstone(m, x, bot(x) - 1, -1, 4 + rng.int(5), 3 + rng.int(3), salt ^ x ^ 0x5a);
  }
}

/**
 * A concrete-lined shaft from complex `c`'s deepest basement (its ground
 * floor if it has none; down the middle of a sniper tower; never through a
 * king's vault or a bank vault) straight down through the rock into the tunnel below it
 * (`roof` and `floor` per column). Noted in `out`.
 */
function sinkShaft(m: Uint8Array, c: Complex, roof: Int32Array, floor: Int32Array, rng: Rng, out: Shaft[], deep: boolean): void {
  const vault = c.fortress ? Math.floor((c.fortress.king.x - c.x0) / MOD_W) : -1;
  // (Nor a bank vault: its steel stays whole, its gold where it is.)
  const banked = (j: number) => (c.vaults ?? []).some((v) => c.x0 + (j + 1) * MOD_W > v.x0 && c.x0 + j * MOD_W < v.x1);
  let k = -1;
  for (let j = 0; j < c.basements.length; j++) {
    if (j === vault || banked(j)) continue;
    if (k < 0 || c.basements[j] > c.basements[k] || (c.basements[j] === c.basements[k] && rng.next() < 0.5)) k = j;
  }
  if (k < 0) return;
  const mx = c.x0 + k * MOD_W;
  const sx = c.tower ? (c.x0 + c.x1 - SHAFT_W) >> 1 : mx + WALL + 2 * SCALE + rng.int(Math.max(1, MOD_W - 2 * WALL - SHAFT_W - 4 * SCALE));
  if (sx < HWY_X0 || sx + SHAFT_W >= HWY_X1) return;
  const fy = c.basements[k] > 0 ? c.floor + SLAB + c.basements[k] * MOD_H - SLAB : c.floor;
  // (The tunnel must run under every column of it.)
  let bottom = 0;
  for (let x = sx - LINING; x < sx + SHAFT_W + LINING; x++) {
    if (!roof[x]) return;
    bottom = Math.max(bottom, roof[x]);
  }
  if (bottom <= fy + SLAB) return;
  // Lining down to the tunnel's roof, the shaft open down the middle (through the floor slab, steel or not).
  fill(m, sx - LINING, fy + SLAB, sx, bottom, Mat.Concrete);
  fill(m, sx + SHAFT_W, fy + SLAB, sx + SHAFT_W + LINING, bottom, Mat.Concrete);
  fill(m, sx, fy, sx + SHAFT_W, fy + SLAB, Mat.Air);
  for (let x = sx; x < sx + SHAFT_W; x++) for (let y = fy + SLAB; y < roof[x] + 1; y++) dig(m, x, y);
  // (The lining's foot, trimmed to the roof where the roof dips lower.)
  for (let x = sx - LINING; x < sx + SHAFT_W + LINING; x++) for (let y = roof[x]; y < bottom; y++) if (m[at(x, y)] === Mat.Concrete) m[at(x, y)] = Mat.Air;
  out.push({ x: sx + SHAFT_W / 2, top: fy, bottom: floor[sx + SHAFT_W / 2], deep });
}

/**
 * A sloping passage `h` high from (x, y) heading `dir`, down at `slope`,
 * until its floor meets `target`'s floor (a tunnel's per-column floor, 0
 * where none) within `maxLen` cells; carved only if `ok` passes every column
 * on its way. Its floor is laid in basalt. Returns its foot, or null.
 */
function passage(m: Uint8Array, x: number, y: number, dir: number, slope: number, h: number, target: Int32Array, maxLen: number, salt: number, ok: (px: number, py: number) => boolean): { x: number; y: number } | null {
  let ex = x;
  let ey = y;
  let found = false;
  for (let n = 0; n < maxLen; n++) {
    ex += dir;
    ey += slope;
    if (ex < HWY_X0 + 10 || ex > HWY_X1 - 10 || !ok(ex, ey)) return null;
    if (target[ex] && ey >= target[ex] - 1) {
      found = true;
      break;
    }
  }
  if (!found) return null;
  for (let px = x, py = y; px !== ex + dir; px += dir, py += slope) {
    const fy = Math.round(py);
    const roof = fy - h + Math.round((vn(px, 10, salt) - 0.5) * 8);
    for (let yy = roof; yy < fy; yy++) dig(m, px, yy);
    for (let k = 0; k < 2; k++) if (inside(px, fy + k) && isSoil(m[at(px, fy + k)])) m[at(px, fy + k)] = Mat.Rock;
  }
  return { x: ex, y: target[ex] };
}

export function carveCaves(m: Uint8Array, heights: Int32Array, seed: number, complexes: Complex[], backdrop?: Uint8Array): CaveNet {
  const rng = new Rng(seed ^ 0xca7e5);
  const floor = new Int32Array(WORLD_W);
  const ceil = new Int32Array(WORLD_W);
  const lowFloor = new Int32Array(WORLD_W);
  const lowCeil = new Int32Array(WORLD_W);
  const net: CaveNet = { floor, ceil, shafts: [], ramps: [], citadels: [], caverns: [], lowFloor, lowCeil, links: [] };

  // ---------------------------------------------------------------- the highway
  // Its line: the lie of the land above, smoothed, ~210 cells down, wandering.
  const pre = new Float64Array(WORLD_W + 1);
  for (let x = 0; x < WORLD_W; x++) pre[x + 1] = pre[x] + heights[x];
  const mean = (x: number, r: number) => {
    const a = Math.max(0, x - r);
    const b = Math.min(WORLD_W, x + r + 1);
    return (pre[b] - pre[a]) / (b - a);
  };
  // Below every bunker's deepest basement (and its foundations' footing).
  const below = new Float64Array(WORLD_W);
  for (const c of complexes) {
    const deepest = Math.max(c.floor + SLAB + Math.max(0, ...c.basements) * MOD_H, c.strongroom?.y1 ?? 0) + SLAB + UNDER_BUNKERS;
    for (let x = Math.max(0, c.x0 - 24); x < Math.min(WORLD_W, c.x1 + 24); x++) below[x] = Math.max(below[x], deepest);
  }
  const top = new Float64Array(WORLD_W);
  const hh = new Float64Array(WORLD_W);
  const p1 = rng.range(0, 6.283);
  const p2 = rng.range(0, 6.283);
  for (let x = 0; x < WORLD_W; x++) {
    hh[x] = HWY_H + vn(x, 260, seed ^ 0x51) * HWY_H_VAR;
    const centre = mean(x, 180) + 210 + Math.sin(x * 0.0021 + p1) * 46 + Math.sin(x * 0.0067 + p2) * 18;
    top[x] = Math.max(centre - hh[x] / 2, below[x]);
  }
  // Ease it down under the bunkers at a walkable slope (no step can be steeper than 1 in 2).
  for (let x = 1; x < WORLD_W; x++) top[x] = Math.max(top[x], top[x - 1] - 0.5);
  for (let x = WORLD_W - 2; x >= 0; x--) top[x] = Math.max(top[x], top[x + 1] - 0.5);
  for (let x = HWY_X0; x < HWY_X1; x++) {
    const fl = Math.min(WORLD_H - 12 - FLOOR_MIN, Math.round(top[x] + hh[x] + (vn(x, 14, seed ^ 0x52) - 0.5) * 4));
    const cl = Math.min(fl - 36, Math.round(top[x] + (vn(x, 9, seed ^ 0x53) - 0.5) * 14));
    floor[x] = fl;
    ceil[x] = cl;
    for (let y = cl; y < fl; y++) dig(m, x, y);
    bed(m, x, fl);
  }
  decorate(m, floor, ceil, HWY_X0, HWY_X1, rng, seed ^ 0x54);

  // ---------------------------------------------------------------- citadels
  const nCit = 2 + rng.int(2);
  for (let i = 0; i < nCit; i++) {
    const span = (HWY_X1 - HWY_X0) / nCit;
    const cx = Math.round(HWY_X0 + (i + 0.5) * span + rng.range(-0.2, 0.2) * span);
    const len = 3 + rng.int(2);
    const half = Math.round((len * MOD_W) / 2);
    const hw = half + 160 + rng.int(40);
    if (cx - hw < HWY_X0 + 20 || cx + hw > HWY_X1 - 20) continue;
    // Its floor: a little below the highway's there (room for a basement under it).
    const fl = (Math.min(floor[cx] + 24, WORLD_H - 12 - FLOOR_MIN - SLAB - 2 * MOD_H - 28) >> 2) << 2;
    // Its dome: as high as it can go without breaking into a bunker or the open air.
    let roof = 0;
    for (let x = cx - hw; x <= cx + hw; x++) roof = Math.max(roof, below[x] - UNDER_BUNKERS + 12, heights[x] + 40);
    const headroom = fl - roof;
    // About half are natural citadels: nature's fortress, no fort in it.
    const natural = rng.next() < 0.5;
    if (natural) {
      if (headroom < 150) continue;
      naturalCitadel(m, floor, ceil, cx, hw, fl, Math.min(headroom, 160 + rng.int(60)), rng, seed ^ 0x91 ^ i);
      net.caverns.push({ x: cx, hw, floor: fl, natural: true });
      continue;
    }
    const cap = Math.min(3, Math.floor((headroom - 44) / MOD_H));
    if (cap < 1) continue;
    const domeH = Math.min(headroom, cap * MOD_H + 70);
    for (let x = cx - hw; x <= cx + hw; x++) {
      const u = (x - cx) / hw;
      const dome = Math.round(fl - domeH * Math.sqrt(Math.max(0, 1 - u * u)) + (vn(x, 11, seed ^ 0x61 ^ i) - 0.5) * 10);
      // The floor: level across the middle, rising to meet the highway at its ends.
      const e = Math.max(0, (Math.abs(u) - 0.72) / 0.28);
      const bottom = Math.round(fl + (floor[x] - fl) * e * e);
      const cl = Math.min(ceil[x], dome);
      for (let y = cl; y < bottom; y++) dig(m, x, y);
      bed(m, x, bottom);
      // Paved: a concrete road across the level floor.
      if (e === 0) fill(m, x, bottom, x + 1, bottom + 3, Mat.Concrete);
      floor[x] = bottom;
      ceil[x] = cl;
    }
    // The fortress itself, standing on the cavern floor.
    const site = new Int32Array(WORLD_W);
    site.fill(fl);
    const x0 = cx - half;
    const style = rng.next() < 0.5 ? Style.Fortified : Style.Steelworks;
    const c = buildComplex(m, site, x0, len, rng, undefined, style, cap);
    if (!c) continue;
    net.citadels.push(c);
    net.caverns.push({ x: cx, hw, floor: fl, natural: false });
    if (backdrop) markBackdrop(backdrop, c);
    // A gatehouse across the cavern either side of it: a wall down from the
    // cavern roof to a steel-headed gate the highway runs under (tall enough
    // for a tarantula), portcullis teeth along its foot, and a guard room in
    // it over the gate: a hole up into it from the gateway, slits both ways.
    for (const side of [-1, 1]) {
      const gx0 = side < 0 ? cx - half - 20 - GATE_W - 2 * POST : cx + half + 20;
      const gx1 = gx0 + 2 * POST + GATE_W;
      const lintel = fl - GATE_H;
      for (let x = gx0; x < gx1; x++) fill(m, x, ceil[x] - 2, x + 1, lintel, Mat.Concrete);
      fill(m, gx0, lintel - 4, gx1, lintel, Mat.Metal);
      for (let x = gx0 + 3; x + 2 < gx1 - 2; x += 7) fill(m, x, lintel, x + 2, lintel + 4, Mat.Metal);
      const ry1 = lintel - 4 - SLAB; // the guard room's floor
      const ry0 = ry1 - (ACTOR_H + 10) * SCALE;
      let room = true;
      for (let x = gx0; x < gx1; x++) if (ceil[x] > ry0 - SLAB) room = false;
      if (!room) continue;
      fill(m, gx0 + WALL, ry0, gx1 - WALL, ry1, Mat.Air);
      const hx = (gx0 + gx1 - HOLE_W) >> 1;
      fill(m, hx, ry1, hx + HOLE_W, lintel, Mat.Air);
      fill(m, gx0, ry1 - 12 * SCALE, gx0 + WALL, ry1 - 9 * SCALE, Mat.Air);
      fill(m, gx1 - WALL, ry1 - 12 * SCALE, gx1, ry1 - 9 * SCALE, Mat.Air);
      if (backdrop) markBox(backdrop, gx0 + WALL, ry0, gx1 - WALL, ry1, Backdrop.Concrete);
    }
  }

  // Where the highway meets a cavern's lower floor, dig its floor down to a walkable slope.
  const easeFloor = (fl: Int32Array, from: number, to: number) => {
    const want = new Float64Array(WORLD_W);
    for (let x = from; x < to; x++) want[x] = fl[x];
    for (let x = from + 1; x < to; x++) if (fl[x] && fl[x - 1]) want[x] = Math.max(want[x], want[x - 1] - MAX_RISE);
    for (let x = to - 2; x >= from; x--) if (fl[x] && fl[x + 1]) want[x] = Math.max(want[x], want[x + 1] - MAX_RISE);
    for (let x = from; x < to; x++) {
      const w = Math.min(WORLD_H - 12 - 8, Math.round(want[x]));
      if (!fl[x] || w <= fl[x]) continue;
      for (let y = fl[x]; y < w; y++) dig(m, x, y);
      bed(m, x, w);
      fl[x] = w;
    }
  };
  easeFloor(floor, HWY_X0, HWY_X1);

  // ---------------------------------------------------------------- the deep run
  // A second tunnel a good way under the highway (under the citadels' basements too),
  // wherever there's room above the bedrock.
  const deep = new Float64Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) deep[x] = floor[x] ? floor[x] + 70 : 0;
  for (const c of net.citadels) {
    const bottom = c.floor + SLAB + Math.max(0, ...c.basements) * MOD_H + SLAB + UNDER_BUNKERS;
    for (let x = Math.max(0, c.x0 - 24); x < Math.min(WORLD_W, c.x1 + 24); x++) deep[x] = Math.max(deep[x], bottom);
  }
  const lowTop = new Float64Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) lowTop[x] = Math.max(deep[x], floor[x] + 100 + vn(x, 300, seed ^ 0x81) * 70);
  for (let x = 1; x < WORLD_W; x++) lowTop[x] = Math.max(lowTop[x], lowTop[x - 1] - 0.5);
  for (let x = WORLD_W - 2; x >= 0; x--) lowTop[x] = Math.max(lowTop[x], lowTop[x + 1] - 0.5);
  for (let x = HWY_X0 + 80; x < HWY_X1 - 80; x++) {
    const lh = 46 + Math.round(vn(x, 200, seed ^ 0x82) * 14);
    const fl = Math.min(WORLD_H - 12 - 22, Math.round(lowTop[x] + lh + (vn(x, 14, seed ^ 0x83) - 0.5) * 4));
    const cl = Math.round(Math.max(lowTop[x], fl - lh) + (vn(x, 9, seed ^ 0x84) - 0.5) * 12);
    if (fl - cl < 40) continue; // (no room above the bedrock here)
    lowFloor[x] = fl;
    lowCeil[x] = cl;
    for (let y = cl; y < fl; y++) dig(m, x, y);
    bed(m, x, fl, 6);
  }
  easeFloor(lowFloor, HWY_X0 + 80, HWY_X1 - 80);
  decorate(m, lowFloor, lowCeil, HWY_X0 + 80, HWY_X1 - 80, rng, seed ^ 0x85);
  // Linked to the highway by long sloping passages down.
  const nLinks = 3 + rng.int(3);
  for (let tries = 0; tries < 50 && net.links.length < nLinks; tries++) {
    const lx = HWY_X0 + 120 + rng.int(HWY_X1 - HWY_X0 - 240);
    if (!floor[lx] || net.links.some((r) => Math.abs(r.top.x - lx) < 360) || net.caverns.some((c) => Math.abs(lx - c.x) < c.hw + 120)) continue;
    const dir = rng.next() < 0.5 ? -1 : 1;
    const foot = passage(m, lx, floor[lx], dir, 0.6, 46, lowFloor, 500, seed ^ 0x86, (px) => !net.caverns.some((c) => Math.abs(px - c.x) < c.hw + 20));
    if (foot) net.links.push({ top: { x: lx, y: floor[lx] }, bottom: foot });
  }

  // ---------------------------------------------------------------- shafts from the bunkers
  // Every bunker (and sniper tower) down into the highway; every citadel on down into the deep run.
  for (const c of complexes) sinkShaft(m, c, ceil, floor, rng, net.shafts, false);
  for (const c of net.citadels) sinkShaft(m, c, lowCeil, lowFloor, rng, net.shafts, true);

  // ---------------------------------------------------------------- ramps from the surface
  const nRamps = 2 + rng.int(2);
  for (let tries = 0; tries < 60 && net.ramps.length < nRamps; tries++) {
    const sx = HWY_X0 + 200 + rng.int(HWY_X1 - HWY_X0 - 400);
    const dir = sx < WORLD_W / 2 ? 1 : -1;
    // Clear of the other ramps, and of the bunkers: its mouth out in the open, and
    // wherever it passes under one, its roof well below the deepest basement.
    if (net.ramps.some((r) => Math.abs(r.top.x - sx) < 400)) continue;
    const foot = passage(m, sx, heights[sx], dir, RAMP_SLOPE, RAMP_H, floor, 1100, seed ^ 0x71, (px, py) => {
      if (net.caverns.some((c) => Math.abs(px - c.x) < c.hw + 20)) return false;
      for (let k = -30; k <= 30; k += 10) {
        const q = Math.max(0, Math.min(WORLD_W - 1, px + k));
        if (below[q] > 0 && py - RAMP_H < below[q] - UNDER_BUNKERS + 8) return false;
      }
      return true;
    });
    if (foot) net.ramps.push({ top: { x: sx, y: heights[sx] }, bottom: foot });
  }

  // ---------------------------------------------------------------- galleries
  const nGal = 8 + rng.int(7);
  for (let g = 0; g < nGal; g++) {
    let x = HWY_X0 + 40 + rng.int(HWY_X1 - HWY_X0 - 80);
    if (net.caverns.some((c) => Math.abs(x - c.x) < c.hw + 30)) continue; // (not out of a cavern: its floor stays whole)
    let y = (floor[x] + ceil[x]) >> 1;
    let a = (rng.next() < 0.5 ? 0 : Math.PI) + rng.range(-0.8, 0.8);
    const r = 9 + rng.int(6);
    const steps = 60 + rng.int(120);
    for (let s = 0; s < steps; s++) {
      a += rng.range(-0.25, 0.25);
      x = Math.round(x + Math.cos(a) * 2.5);
      y = Math.round(y + Math.sin(a) * 2.5);
      // Never up into the open, a bunker's foundations, or down into the bedrock.
      if (x < 30 || x > WORLD_W - 30 || y > WORLD_H - 40 || y < heights[x] + 50 || y < below[x] - UNDER_BUNKERS + 8) break;
      digDisc(m, x, y, r);
    }
    // A chamber at its end, a seam of gold in its floor.
    const cr = 18 + rng.int(12);
    if (y + cr < WORLD_H - 30 && y - cr > heights[x] + 40) {
      digDisc(m, x, y, cr);
      const gx = x + rng.int(cr) - (cr >> 1);
      const gy = y + cr - 3;
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -9; dx <= 9; dx++) {
          if ((dx * dx) / 81 + (dy * dy) / 25 > 1) continue;
          if (inside(gx + dx, gy + dy) && isSoil(m[at(gx + dx, gy + dy)])) m[at(gx + dx, gy + dy)] = Mat.Gold;
        }
      }
    }
  }
  return net;
}

/**
 * Which level of the caves a clone with its feet at (x, feetY) is on: 2 in
 * the deep run, 1 in the highway (or a citadel's cavern), 0 anywhere else
 * (the surface, the bunkers).
 */
export function caveLevel(net: CaveNet, x: number, feetY: number): number {
  const ix = Math.max(0, Math.min(WORLD_W - 1, Math.floor(x)));
  if (net.lowFloor[ix] > 0 && feetY >= net.lowCeil[ix] - 4 && feetY <= net.lowFloor[ix] + 6) return 2;
  if (net.floor[ix] > 0 && feetY >= net.ceil[ix] - 4 && feetY <= net.floor[ix] + 6) return 1;
  return 0;
}

/** Is (x, feetY) on a ramp or link passage (within its sloping band)? */
export function onPassage(r: Ramp, x: number, feetY: number): boolean {
  const xa = Math.min(r.top.x, r.bottom.x);
  const xb = Math.max(r.top.x, r.bottom.x);
  if (x < xa || x > xb) return false;
  const y = r.top.y + ((r.bottom.y - r.top.y) * (x - r.top.x)) / (r.bottom.x - r.top.x || 1);
  return feetY >= y - 8 && feetY <= y + 10;
}
