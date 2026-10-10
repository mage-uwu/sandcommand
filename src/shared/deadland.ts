import { WORLD_H, WORLD_W } from './constants.ts';
import { Mat } from './materials.ts';
import { Rng, hash2 } from './rng.ts';
import { type Complex, markBox } from './structures.ts';

/**
 * Deadland: a biome of TABAR. The deep is marslike, but over it lies the
 * ruin of the Progenitors: a crust tens to hundreds of feet thick of cement,
 * char, broken dragon's teeth, trinitite glass, gravel and ash, and on the
 * surface their monuments, a hostile brutalist field like the Landscape of
 * Thorns, left to rot for eons:
 *
 * - **caltrops**: colossal three-armed cement caltrops, dwarfing a clone,
 *   standing on two legs or stabbed into the ground on one, some toppled;
 * - **slabs**: great tilted slabs, half sunk;
 * - **thorns**: clusters of tall, leaning cement spikes;
 * - **teeth**: broken dragon's teeth, scattered.
 *
 * Integer-friendly and seeded like the rest of worldgen.
 */

const at = (x: number, y: number) => y * WORLD_W + x;
const inside = (x: number, y: number) => x >= 4 && x < WORLD_W - 4 && y >= 0 && y < WORLD_H - 12;
const u01 = (x: number, y: number, s: number) => (hash2(x, y, s) >>> 0) / 4294967296;

/** How deep the ruin crust lies over the marslike ground in column x (cells, 45..155). */
export function crustDepth(x: number, seed: number, n: (x: number) => number): number {
  void seed;
  return Math.round(45 + n(x) * 110);
}

/**
 * What the crust is made of at (x, y), `d` cells under the surface of a
 * crust `depth` deep: a skin of ash, gravel, glass glaze and exposed cement
 * pavement; under it, charred fill packed with broken cement slabs and
 * fragments, toppled dragon's teeth, trinitite shards, and lenses of ash and
 * gravel. `ash` and `grit` are noise samples (0..1) at the cell.
 */
export function crustCell(x: number, y: number, d: number, depth: number, seed: number, ash: number, grit: number): number {
  // The skin.
  if (d < 3) {
    if (ash > 0.62) return Mat.Ash;
    if (grit > 0.66) return Mat.Glass;
    if (grit < 0.22) return Mat.Cement; // the old pavement, showing through
    return Mat.Gravel;
  }
  // Broken cement: a block in some cells of a coarse grid, each tilted and sized its own way.
  const gx = Math.floor((x + 7) / 26);
  const gy = Math.floor((y + 3) / 15);
  const pick = u01(gx, gy, seed ^ 0xc3e7);
  if (pick < 0.34) {
    const cx = gx * 26 - 7 + 13 + (u01(gx, gy, seed ^ 1) - 0.5) * 8;
    const cy = gy * 15 - 3 + 7.5 + (u01(gx, gy, seed ^ 2) - 0.5) * 4;
    const a = (u01(gx, gy, seed ^ 3) - 0.5) * 0.9;
    const hw = 5 + u01(gx, gy, seed ^ 4) * 7;
    const hh = 2 + u01(gx, gy, seed ^ 5) * 3.5;
    const dx = x - cx;
    const dy = y - cy;
    const lx = dx * Math.cos(a) + dy * Math.sin(a);
    const ly = -dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return pick < 0.12 ? Mat.OldConcrete : Mat.Cement; // (some of it the city's, not the Progenitors')
  } else if (pick > 0.93) {
    // A dragon's tooth, toppled every which way: a triangle.
    const cx = gx * 26 - 7 + 13;
    const cy = gy * 15 - 3 + 8;
    const a = u01(gx, gy, seed ^ 6) * Math.PI * 2;
    const dx = x - cx;
    const dy = y - cy;
    const lx = dx * Math.cos(a) + dy * Math.sin(a);
    const ly = -dx * Math.sin(a) + dy * Math.cos(a);
    if (ly > -5 && ly < 5 && Math.abs(lx) < (5 - ly) * 0.7) return Mat.Cement;
  }
  // Trinitite shards: slivers in a finer grid.
  const sx = Math.floor(x / 11);
  const sy = Math.floor(y / 8);
  if (u01(sx, sy, seed ^ 0x61a5) < 0.12) {
    const cx = sx * 11 + 5.5;
    const cy = sy * 8 + 4;
    const a = u01(sx, sy, seed ^ 7) * Math.PI;
    const dx = x - cx;
    const dy = y - cy;
    const lx = dx * Math.cos(a) + dy * Math.sin(a);
    const ly = -dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) < 3.5 && Math.abs(ly) < 0.9) return Mat.Glass;
  }
  // The city's steel: rusted beams lying every which way, and loose rebar, bent.
  const bx = Math.floor(x / 40);
  const by = Math.floor(y / 22);
  if (u01(bx, by, seed ^ 0xbea7) < 0.1) {
    const cx = bx * 40 + 20 + (u01(bx, by, seed ^ 9) - 0.5) * 16;
    const cy = by * 22 + 11 + (u01(bx, by, seed ^ 10) - 0.5) * 8;
    const a = (u01(bx, by, seed ^ 11) - 0.5) * 2.4;
    const half = 7 + u01(bx, by, seed ^ 12) * 10;
    const dx = x - cx;
    const dy = y - cy;
    const lx = dx * Math.cos(a) + dy * Math.sin(a);
    const ly = -dx * Math.sin(a) + dy * Math.cos(a);
    // An I-beam: two flanges and the web between them.
    if (Math.abs(lx) <= half && (Math.abs(ly) >= 1.5 && Math.abs(ly) <= 2.5 || (Math.abs(ly) < 1.5 && Math.abs(lx) < half - 1))) return Mat.Rust;
  }
  const rx = Math.floor(x / 17);
  const ry = Math.floor(y / 13);
  if (u01(rx, ry, seed ^ 0x5eba) < 0.08) {
    const cx = rx * 17 + 8;
    const cy = ry * 13 + 6;
    const a = u01(rx, ry, seed ^ 13) * Math.PI;
    const bend = (u01(rx, ry, seed ^ 14) - 0.5) * 0.08;
    const dx = x - cx;
    const dy = y - cy;
    const lx = dx * Math.cos(a) + dy * Math.sin(a);
    const ly = -dx * Math.sin(a) + dy * Math.cos(a) - bend * lx * lx;
    if (Math.abs(lx) < 7 && Math.abs(ly) < 0.6) return Mat.Rust;
  }
  // Strata: now and then a slab layer, broken by gaps (the old floors).
  if ((d + Math.floor(grit * 3)) % 37 === 0 && u01(Math.floor(x / 30), Math.floor(d / 37), seed ^ 8) < 0.6) return Mat.Cement;
  // Lenses: ash and gravel pockets (loose: they pour when undercut), commoner near the top.
  const up = Math.max(0, 1 - d / (depth * 0.5)) * 0.12;
  if (ash > 0.72 - up && d > 6) return Mat.Ash;
  if (grit > 0.78 - up && d > 6) return Mat.Gravel;
  // The fill: char, burnt black-grey.
  void depth;
  return Mat.Char;
}

export interface Buried {
  /** Centre, size and tilt (radians) of the building's shell. */
  x: number;
  y: number;
  w: number;
  h: number;
  tilt: number;
  /** Its top storeys stand out of the ground, broken off. */
  exposed: boolean;
}

/** One storey of a buried building, slab to slab (cells). */
const STOREY = 26;

/**
 * The city under the crust: the deadland was civilised once, long before the
 * fires. Concrete buildings of one to four storeys lie buried in it, settled
 * askew, gutted, their top floors sheared away; window holes in their walls,
 * floor slabs with rusted rebar hanging off the broken ends, some framed in
 * steel. Most rooms are packed solid with ash and char; now and then one is
 * still hollow. A few stand high enough that their broken top storeys break
 * the surface, wall stubs and empty windows against the sky.
 */
export function placeBuried(m: Uint8Array, seed: number, heights: Int32Array, crust: Int32Array, backdrop?: Uint8Array): Buried[] {
  const rng = new Rng(seed ^ 0xb0e1d);
  const out: Buried[] = [];
  const want = 12 + rng.int(6);
  for (let tries = 0; tries < 300 && out.length < want; tries++) {
    const x = 150 + rng.int(WORLD_W - 300);
    const w = 60 + rng.int(110);
    const storeys = 1 + rng.int(4);
    const h = storeys * STOREY + 5;
    const g = heights[x];
    const exposed = rng.next() < 0.3;
    // Exposed: its top 8-30 cells over the ground. Buried: anywhere in the crust, older ones down into the deep.
    const top = exposed ? g - 18 - rng.int(36) : g + 8 + rng.int(Math.max(1, crust[x] + 20 - h));
    const cy = top + h / 2;
    if (cy + h / 2 > WORLD_H - 60) continue;
    if (out.some((o) => Math.abs(o.x - x) < (o.w + w) / 2 + 24 && Math.abs(o.y - cy) < (o.h + h) / 2 + 12)) continue;
    const tilt = (rng.next() - 0.5) * (exposed ? 0.12 : 0.4);
    const steel = rng.next() < 0.35; // a steel frame: its inner columns are beams
    const collapse = rng.next(); // how much of its far end has fallen in
    const side = rng.next() < 0.5;
    const b: Buried = { x, y: Math.round(cy), w, h, tilt, exposed };
    out.push(b);
    const c = Math.cos(tilt);
    const sn = Math.sin(tilt);
    const R = Math.ceil(Math.hypot(w, h) / 2) + 2;
    const s0 = seed ^ (x * 131 + top);
    /** Ruin: the far end fallen in, stepping down; chunks gone; exposed tops sheared off jagged. */
    const broken = (ix: number, iy: number, above: boolean) => {
      if (ix < 0 || ix >= w) return true;
      const u = side ? ix / w : 1 - ix / w;
      if (u > 1 - collapse * 0.5 && iy < (u - (1 - collapse * 0.5)) * 2 * h) return true;
      if (u01(Math.floor(ix / 7), Math.floor(iy / 7), s0) > 0.86) return true;
      return above && iy < 2 + u01(Math.floor(ix / 4), 0, s0 ^ 1) * 10 + (g - top) * 0.2;
    };
    for (let yy = Math.floor(cy - R); yy <= cy + R; yy++) {
      for (let xx = x - R; xx <= x + R; xx++) {
        if (!inside(xx, yy) || m[at(xx, yy)] === Mat.Bedrock) continue;
        const dx = xx - x;
        const dy = yy - cy;
        const lx = dx * c + dy * sn + w / 2;
        const ly = -dx * sn + dy * c + h / 2;
        if (lx < 0 || lx >= w || ly < 0 || ly >= h) continue;
        const ix = Math.floor(lx);
        const iy = Math.floor(ly);
        const above = yy < heights[xx];
        const sy = iy % STOREY;
        const outer = ix < 6 || ix >= w - 6;
        const column = !outer && ix % 40 >= 36;
        const slab = sy < 5 || iy >= h - 5;
        const windowHole = outer && sy >= 10 && sy < 19;
        const gone = broken(ix, iy, above);
        let v = -1;
        if (!gone && slab) v = Mat.OldConcrete;
        else if (!gone && outer && !windowHole) v = Mat.OldConcrete;
        else if (!gone && column) v = steel ? Mat.Rust : Mat.OldConcrete;
        else if (!gone && !above && !slab && !outer && !column) {
          // A room: packed with the crust's fill, or now and then still hollow.
          const room = Math.floor(iy / STOREY) * 7 + Math.floor(ix / 40);
          if (u01(room, 0, s0 ^ 2) < 0.35) {
            v = Mat.Air;
            if (backdrop) backdrop[at(xx, yy)] = 1;
          } else {
            // Silted up over the ages: level bands of char, ash and gravel.
            const band = u01(Math.floor(yy / 3), 0, s0 ^ 3);
            v = band < 0.5 ? Mat.Char : band < 0.8 ? Mat.Ash : Mat.Gravel;
          }
        } else if (gone && !slab && !above) {
          // Rebar off a slab's broken end, drooping into the gap.
          const base = iy - sy + 2;
          for (let k = 2; k < 11 && v < 0; k++) {
            if (iy !== base + Math.floor((k * k) / 24)) continue;
            if (!broken(ix - k, base, false) || !broken(ix + k, base, false)) v = Mat.Rust;
          }
        }
        if (v >= 0) m[at(xx, yy)] = v;
      }
    }
  }
  return out;
}

export interface Monument {
  kind: 'caltrop' | 'slab' | 'thorns' | 'teeth';
  x: number;
  y: number;
  /** A caltrop: where its legs come down, and how thick its arms are. */
  feet?: number[];
  w?: number;
}

/**
 * While the monuments go up: which piece each cell of cement is (0: none),
 * and the piece being drawn. No piece is ever drawn touching another's
 * cement: where two meet a seam is left between them, so each keeps its own
 * hard outline, leaning on the other but never merging into it.
 */
let own: Uint8Array | null = null;
let piece = 0;
/** A new piece (a whole caltrop, a slab, a spike, a tooth). */
const nextPiece = () => (piece = (piece % 255) + 1);

/** Write `mat` at (x, y), unless it's cement that would touch another piece's. */
function put(m: Uint8Array, x: number, y: number, mat: number): void {
  const i = at(x, y);
  if (own) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const o = own[i + dy * WORLD_W + dx];
        if (o !== 0 && o !== piece) return;
      }
    }
    own[i] = piece;
  }
  m[i] = mat;
}

/** Fill a convex polygon (world cells) with `mat`, inside the map. */
function poly(m: Uint8Array, pts: readonly [number, number][], mat: number): void {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [, y] of pts) {
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(WORLD_H - 13, Math.ceil(y1)); y++) {
    let xa = Infinity;
    let xb = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) {
        const x = ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax);
        xa = Math.min(xa, x);
        xb = Math.max(xb, x);
      }
    }
    for (let x = Math.ceil(xa); x <= Math.floor(xb); x++) if (inside(x, y)) put(m, x, y, mat);
  }
}

/** An arm: from (x, y) along `a`, `len` long, `w` thick at the root and a little less at its flat-cut end. */
function arm(m: Uint8Array, x: number, y: number, a: number, len: number, w: number): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const w1 = w * 0.85; // (barely tapering: blunt, brutal)
  poly(
    m,
    [
      [x - s * w, y + c * w],
      [x + c * len - s * w1, y + s * len + c * w1],
      [x + c * len + s * w1, y + s * len - c * w1],
      [x + s * w, y - c * w],
    ],
    Mat.Cement,
  );
}

const topOf = (m: Uint8Array, x: number) => {
  let y = 0;
  while (y < WORLD_H - 12 && m[at(x, y)] === Mat.Air) y++;
  return y;
};

/**
 * The monuments over the deadland, clear of the bunkers (`spans`): eight to
 * twelve great pieces (caltrops most of all) with teeth strewn between.
 */
export function placeMonuments(m: Uint8Array, seed: number, spans: readonly { x0: number; x1: number }[]): Monument[] {
  const rng = new Rng(seed ^ 0xde4d1a);
  const out: Monument[] = [];
  const clear = (x0: number, x1: number) => spans.every((c) => x1 + 24 < c.x0 || x0 - 24 > c.x1);
  own = new Uint8Array(WORLD_W * WORLD_H);
  piece = 0;
  const teeth: [number, number, number][] = [];
  /** Is (px, py) already some piece's cement? */
  const taken2 = (px: number, py: number) => {
    const ix = Math.round(px);
    const iy = Math.round(py);
    return inside(ix, iy) && own![at(ix, iy)] !== 0;
  };
  // The ground as it lay before any monument came down on it.
  const top0 = new Int32Array(WORLD_W);
  for (let x = 4; x < WORLD_W - 4; x++) top0[x] = topOf(m, x);
  const taken = (col: number) => spans.some((c) => col > c.x0 - 10 && col < c.x1 + 10);
  /** Pour into column `col` from `y0` down to `y1`: over the dust (air above the old ground) and through the crust, never into a ruin. */
  const pourCol = (col: number, y0: number, y1: number) => {
    if (col < 5 || col >= WORLD_W - 5 || taken(col)) return;
    for (let y = Math.max(1, y0); y < Math.min(WORLD_H - 14, y1); y++) {
      const i = at(col, y);
      const v = m[i];
      if (v === Mat.Air ? y < top0[col] : v === Mat.Ash || v === Mat.Gravel || v === Mat.Char || v === Mat.Glass || v === Mat.OldConcrete || v === Mat.Rust) m[i] = Mat.Pour;
    }
  };
  /**
   * A footing where a monument meets the ground at cx (`half` wide either
   * side): a block of softer pour sunk deep round it and heaped up against
   * it, and an apron of the same spread thin over the dust round about, as
   * if whatever happened here was sealed under it.
   */
  const footing = (cx: number, half: number) => {
    cx = Math.round(cx);
    if (cx < 8 || cx >= WORLD_W - 8) return;
    const g0 = top0[cx];
    half = Math.round(half) + 6 + rng.int(8);
    // A great pile: as high as the leg is wide, its flanks easing out over the dust.
    const H = Math.min(48, 12 + Math.round(half * 0.7) + rng.int(10));
    const flank = Math.round(H * 1.8);
    const depth = 18 + rng.int(16);
    const reach = [-1, 1].map(() => half + flank + 24 + rng.int(60));
    for (let side = 0; side < 2; side++) {
      const dir = side === 0 ? -1 : 1;
      for (let d = side; d <= reach[side]; d++) {
        const col = cx + dir * d;
        if (col < 5 || col >= WORLD_W - 5) break;
        const g = top0[col];
        if (d > reach[side] - 8 && u01(col, 0, seed ^ 0x9002) < 0.5) continue; // a ragged edge
        const lump = Math.round((u01(col >> 2, 0, seed ^ 0x9003) - 0.5) * 3);
        // The apron: thin over the dust, thinning out.
        const out = Math.max(0, (d - half - flank) / Math.max(1, reach[side] - half - flank));
        let top = g - Math.max(1, Math.round(2 + 4 * (1 - out)));
        let bottom = g;
        if (d <= half) {
          top = Math.min(top, g0 - H + lump);
          bottom = g0 + depth;
        } else if (d <= half + flank) {
          const k = (d - half) / flank;
          top = Math.min(top, Math.round(g0 - H * Math.pow(1 - k, 1.4)) + lump);
          bottom = Math.max(g, Math.round(g0 + depth * (1 - k)));
        }
        pourCol(col, top, bottom);
      }
    }
  };
  // The caltrops are the deadland: a field of them across the whole map, of every size.
  const want = 30;
  // Each piece's reach either side (they crowd, but never pile into one another).
  const reach: number[] = [];
  for (let tries = 0; tries < 900 && out.length < want; tries++) {
    const x = 70 + rng.int(WORLD_W - 140);
    const r = rng.next();
    const size = rng.next();
    // Caltrops on a menacing scale: a few small, most towering, one in six colossal (a clone is 14 cells tall).
    const len = size < 0.15 ? 50 + rng.int(30) : size > 0.84 ? 200 + rng.int(100) : 100 + rng.int(70);
    const span = r < 0.84 ? len * 0.8 : 70;
    // (They crowd in and lean on one another; they never merge: see `put`.)
    if (!clear(x - span * 0.5, x + span * 0.5) || out.some((o, i) => Math.abs(o.x - x) < (reach[i] + span) * 0.48)) continue;
    const g = topOf(m, x);
    if (g >= WORLD_H - 80) continue;
    if (r < 0.84) {
      // A caltrop: three blunt arms 120 degrees apart, a squared hub. The
      // colossal ones stand as tripods, one arm to the sky and two legs
      // splayed under it (an arch to pass beneath); the rest lie any way,
      // the hub set so the lowest tip is driven into the ground.
      const w = Math.max(8, Math.round(len * (0.17 + rng.next() * 0.05)));
      // Balanced so it looks wrong but would stand: on two legs or more with
      // the hub (its centre of mass: the arms are alike) between their feet,
      // however hard it leans; or poised on one leg straight down, the hub
      // right over the point. Anything that would topple is turned again.
      let rot = 0;
      let dirs: number[] = [];
      let L = 0;
      let hubY = 0;
      let ok = false;
      let legs: number[] = [];
      for (let k = 0; k < 16 && !ok; k++) {
        const mode = rng.next();
        rot = len >= 200 ? -Math.PI / 2 + (rng.next() - 0.5) * 0.5 : mode < 0.35 ? Math.PI / 2 + (rng.next() - 0.5) * 0.3 : rng.next() * Math.PI * 2;
        dirs = [0, 1, 2].map((q) => rot + (q * Math.PI * 2) / 3);
        const lowest = Math.max(...dirs.map((a) => Math.sin(a)));
        const highest = Math.min(...dirs.map((a) => Math.sin(a)));
        // (Never out of the top of the sky.)
        L = Math.min(len, Math.floor((g - 24) / Math.max(0.1, lowest - highest)));
        if (L < 40) continue;
        // Every leg driven into the ground where it comes down (not just level with the hub's foot).
        hubY = g - lowest * L + 10 + rng.int(8);
        const feet: number[] = [];
        for (const a of dirs) {
          const sa = Math.sin(a);
          if (sa < 0.15) continue;
          const tx = Math.max(5, Math.min(WORLD_W - 6, Math.round(x + Math.cos(a) * L * 0.92)));
          hubY = Math.max(hubY, top0[tx] + 8 - sa * L * 0.92);
          feet.push(tx);
        }
        // Up against a piece already standing: an arm may rest its end on it
        // (that holds it up too), but nothing runs through one.
        let clash = taken2(x, hubY);
        for (const a of dirs) {
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          for (let q = 0; q <= L && !clash; q += 3) {
            const px = x + ca * q;
            const py = hubY + sa * q;
            if (![0, -0.9, 0.9].some((f) => taken2(px - sa * w * f, py + ca * w * f))) continue;
            if (q < L * 0.7) clash = true;
            else if (sa > -0.2) feet.push(Math.round(px));
            break;
          }
        }
        if (clash) continue;
        if (feet.length >= 2) ok = Math.min(...feet) + w * 0.3 <= x && x <= Math.max(...feet) - w * 0.3;
        else if (feet.length === 1) ok = Math.abs(feet[0] - x) <= w * 0.4;
        legs = feet;
      }
      if (!ok) continue;
      // A footing wherever an arm goes into the ground (poured round it once it stands).
      const feet: [number, number][] = [];
      for (const a of dirs) {
        const sa = Math.sin(a);
        if (sa < 0.15) continue;
        for (let k = 0; k <= L; k += 2) {
          const px = Math.round(x + Math.cos(a) * k);
          if (px < 5 || px >= WORLD_W - 5) break;
          if (hubY + sa * k >= top0[px]) {
            feet.push([px, Math.min(w * 1.6, w / (2 * sa))]);
            break;
          }
        }
      }
      nextPiece();
      for (const a of dirs) arm(m, x, hubY, a, L, w);
      const hc = Math.cos(rot);
      const hs = Math.sin(rot);
      const hw = w * 1.15;
      poly(
        m,
        [
          [x + (-hw * hc + hw * hs), hubY + (-hw * hs - hw * hc)],
          [x + (hw * hc + hw * hs), hubY + (hw * hs - hw * hc)],
          [x + (hw * hc - hw * hs), hubY + (hw * hs + hw * hc)],
          [x + (-hw * hc - hw * hs), hubY + (-hw * hs + hw * hc)],
        ],
        Mat.Cement,
      );
      for (const [fx, fw] of feet) footing(fx, fw);
      out.push({ kind: 'caltrop', x, y: Math.round(hubY), feet: legs, w });
      reach.push(L * 0.8);
    } else if (r < 0.9) {
      // A slab, tilted and half sunk.
      if (taken2(x, g)) continue;
      nextPiece();
      const hw = 60 + rng.int(70);
      const hh = 14 + rng.int(12);
      const a = (rng.next() < 0.5 ? -1 : 1) * (0.08 + rng.next() * 0.35);
      const cy = g - hh * 0.6;
      const c = Math.cos(a);
      const s = Math.sin(a);
      poly(
        m,
        [
          [x - c * hw + s * hh, cy - s * hw - c * hh],
          [x + c * hw + s * hh, cy + s * hw - c * hh],
          [x + c * hw - s * hh, cy + s * hw + c * hh],
          [x - c * hw - s * hh, cy - s * hw + c * hh],
        ].map(([px, py]) => [px, py] as [number, number]),
        Mat.Cement,
      );
      footing(x, hw * c * 0.9);
      out.push({ kind: 'slab', x, y: Math.round(cy) });
      reach.push(hw);
    } else if (r < 0.97) {
      // Thorns: a cluster of tall, leaning spikes, in one footing.
      const n = 3 + rng.int(5);
      for (let k = 0; k < n; k++) {
        nextPiece();
        const sx = x + (k - n / 2) * (10 + rng.int(8));
        const sg = topOf(m, Math.max(5, Math.min(WORLD_W - 6, sx)));
        const h = 60 + rng.int(90);
        const w = 5 + rng.int(5);
        const lean = (rng.next() - 0.5) * 0.6;
        poly(
          m,
          [
            [sx - w, sg + 6],
            [sx + w, sg + 6],
            [sx + lean * h + 0.6, sg - h],
            [sx + lean * h - 0.6, sg - h],
          ],
          Mat.Cement,
        );
      }
      footing(x, n * 7);
      out.push({ kind: 'thorns', x, y: g });
      reach.push(40);
    } else {
      out.push({ kind: 'teeth', x, y: g });
      reach.push(30);
    }
    // Teeth strewn round every piece (once all the monuments stand, so none ends up inside one).
    const t = 2 + rng.int(5);
    for (let k = 0; k < t; k++) teeth.push([x + (rng.next() - 0.5) * 140, 6 + rng.int(8), (rng.next() - 0.5) * (rng.next() < 0.4 ? 2.4 : 0.4)]);
  }
  // The teeth: small upright or toppled pyramids, never on a monument.
  for (const [tx, h, a] of teeth) {
    const ix = Math.max(6, Math.min(WORLD_W - 7, Math.round(tx)));
    if (!clear(ix - 8, ix + 8)) continue;
    const tg = topOf(m, ix);
    if (taken2(ix, tg) || taken2(ix, tg - 4)) continue;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const base = h * 0.7;
    const P = (px: number, py: number): [number, number] => [ix + px * c - py * s, tg + 3 + px * s + py * c];
    nextPiece();
    poly(m, [P(-base, 0), P(base, 0), P(0, -h)], Mat.Cement);
  }
  own = null;
  // And here and there, a seal on its own: a broad cap of pour over the dust, nothing standing on it.
  for (let k = 2 + rng.int(4), tries = 0; k > 0 && tries < 40; tries++) {
    const x = 120 + rng.int(WORLD_W - 240);
    const r = 50 + rng.int(80);
    if (!clear(x - r, x + r) || out.some((o, i) => Math.abs(o.x - x) < reach[i] * 0.5 + r)) continue;
    k--;
    const th = 4 + rng.int(5);
    for (let col = x - r; col <= x + r; col++) {
      const u = 1 - Math.abs(col - x) / r;
      if (u < 0.08 && u01(col, 1, seed ^ 0x5ea1) < 0.5) continue;
      pourCol(col, top0[col] - Math.max(1, Math.round(th * Math.sqrt(u))), top0[col] + Math.round(th * u));
    }
  }
  return out;
}

// ------------------------------------------------------------------- ruins

/**
 * The deadland's only buildings: no bunkers, but the Progenitors' own
 * ruins, small and ancient. A stepped portal of glyph stone on the surface,
 * a cobble tunnel slanting down through the crust from it, and one to three
 * chambers below (the deeper, the older), their walls of cobble banded with
 * glyphs, broken through here and there, rubble heaped on their floors,
 * and a stair climbing out the far side.
 * Their masonry (ruin stone and glyph blocks) yields as grudgingly as the
 * caltrops' cement: the old builders built to last.
 *
 * On a Regicide map the two fortresses are ruins too, deeper ones, the
 * king's chamber at the bottom; the caltrops round them are their walls.
 */
export function placeRuins(m: Uint8Array, seed: number, fortresses: boolean, backdrop?: Uint8Array): Complex[] {
  const rng = new Rng(seed ^ 0x2a1e5);
  const out: Complex[] = [];
  const set = (x: number, y: number, v: number) => {
    if (inside(x, y) && m[at(x, y)] !== Mat.Bedrock) m[at(x, y)] = v;
  };
  const box = (x0: number, y0: number, x1: number, y1: number, kind: number) => {
    if (backdrop) markBox(backdrop, Math.max(0, x0), Math.max(0, y0), Math.min(WORLD_W, x1), Math.min(WORLD_H, y1), kind);
  };
  /** A chamber: open inside x0..x1, top..floor; cobble walls, floor and roof; a glyph band; a breach or two; rubble. */
  const chamber = (x0: number, x1: number, top: number, floor: number) => {
    for (let y = top - 4; y < floor + 4; y++) {
      for (let x = x0 - 4; x < x1 + 4; x++) {
        const inner = x >= x0 && x < x1 && y >= top && y < floor;
        if (inner) set(x, y, Mat.Air);
        else if (m[at(x, y)] !== Mat.Air) set(x, y, (y === top + 6 || y === top - 2) && (x + y) % 5 !== 0 ? Mat.RuinGlyph : Mat.RuinStone);
      }
    }
    // Breaches: the wall gone in places, the crust showing through (char, not stone).
    for (let k = rng.int(3); k > 0; k--) {
      const bx = x0 + rng.int(Math.max(1, x1 - x0));
      for (let y = top - 4; y < top; y++) for (let x = bx - 3; x < bx + 3; x++) if (m[at(x, y)] === Mat.RuinStone || m[at(x, y)] === Mat.RuinGlyph) set(x, y, Mat.Char);
    }
    // Rubble heaped against a wall.
    const rx = rng.next() < 0.5 ? x0 : x1 - 10;
    for (let x = 0; x < 10; x++) for (let k = 0; k < Math.max(0, 4 - Math.abs(x - 5)); k++) set(rx + x, floor - 1 - k, Mat.Gravel);
    box(x0, top, x1, floor, 3);
  };
  /** The tunnel: from the surface at x down along `dir`, `len` cells across, half a cell down per cell; returns its foot. */
  const tunnel = (x: number, g: number, dir: number, len: number) => {
    for (let s = -6; s <= len; s++) {
      const cx = x + dir * s;
      const fl = g + 2 + Math.max(0, Math.floor(s * 0.5));
      const top = topOf(m, cx);
      for (let y = fl - 25; y <= fl + 2; y++) {
        const inner = y >= fl - 20 && y < fl;
        if (inner) set(cx, y, Mat.Air);
        else if (m[at(cx, y)] !== Mat.Air) set(cx, y, Mat.RuinStone); // (lined where it runs through the ground; open where it runs out under the sky)
      }
      box(cx, Math.max(fl - 20, top), cx + 1, fl, 4);
    }
    return { x: x + dir * len, floor: g + 2 + Math.floor(len * 0.5) };
  };
  /** The way out: from a chamber's far end at (x, floor), a stair climbing along `dir` to the surface; returns where it comes out. */
  const exit = (x: number, floor: number, dir: number) => {
    let s = -2;
    let cx = x;
    let fl = floor;
    for (; s < 400; s++) {
      cx = x + dir * s;
      fl = floor - Math.max(0, Math.floor(s * 0.9));
      const g = topOf(m, cx);
      if (fl <= g + 2) break; // daylight
      for (let y = fl - 33; y <= fl + 2; y++) {
        const inner = y >= fl - 28 && y < fl; // (headroom for a clone on a steep stair)
        if (inner) set(cx, y, Mat.Air);
        else if (m[at(cx, y)] !== Mat.Air) set(cx, y, Mat.RuinStone);
      }
      box(cx, Math.max(fl - 28, g), cx + 1, fl, 4); // (the wall behind only under the ground, not up in the sky)
    }
    // Open the mouth over the last few steps.
    for (let k = 0; k < 6; k++) for (let y = fl - 28; y < fl; y++) set(cx + dir * k, y, Mat.Air);
    return { x: cx, g: Math.min(fl, topOf(m, cx)) };
  };
  /** The portal over a tunnel's mouth: two glyph pillars, a lintel, stepped capstones. */
  const portal = (x: number, g: number) => {
    for (const side of [-1, 1]) for (let y = g - 26; y < g + 2; y++) for (let k = 0; k < 4; k++) set(x + side * (8 + k), y, Mat.RuinGlyph);
    for (let step = 0; step < 3; step++) {
      const half = 12 + 3 - step * 3;
      for (let y = g - 26 - (step + 1) * 3; y < g - 26 - step * 3; y++) for (let xx = x - half; xx <= x + half; xx++) set(xx, y, Mat.RuinGlyph);
    }
    for (let y = g - 22; y < g + 2; y++) for (let xx = x - 7; xx <= x + 7; xx++) set(xx, y, Mat.Air);
  };
  const clear = (x0: number, x1: number) => out.every((c) => x1 + 120 < c.x0 || x0 - 120 > c.x1);
  /** One ruin with its portal at x; `rooms` chambers; `team` >= 0: a Regicide fortress. */
  const ruin = (x: number, rooms: number, team: number): Complex | null => {
    const g = topOf(m, x);
    if (g > WORLD_H - 260) return null;
    const dir = x < WORLD_W / 2 ? 1 : -1;
    portal(x, g);
    let foot = tunnel(x, g, dir, 60 + rng.int(40));
    let x0 = Math.min(x, foot.x) - 16;
    let x1 = Math.max(x, foot.x) + 16;
    // (In the portal's mouth: the ground outside is anyone's, and a monument may stand on it.)
    const spawns: { x: number; y: number }[] = [{ x, y: g + 2 }];
    let king = { x: foot.x, y: foot.floor };
    for (let r = 0; r < rooms; r++) {
      const w = (team >= 0 && r === rooms - 1 ? 70 : 44) + rng.int(24);
      const h = 22 + rng.int(6);
      const cx0 = dir > 0 ? foot.x - 4 : foot.x - w + 4;
      chamber(cx0, cx0 + w, foot.floor - h, foot.floor);
      x0 = Math.min(x0, cx0 - 6);
      x1 = Math.max(x1, cx0 + w + 6);
      for (let k = 0; k < 3; k++) spawns.push({ x: cx0 + 16 + Math.floor(((w - 32) * k) / 2), y: foot.floor }); // (clear of the rubble)
      king = { x: cx0 + w / 2, y: foot.floor };
      if (r < rooms - 1) {
        // On down: a stair from the chamber's far end to the next.
        const fx = dir > 0 ? cx0 + w - 4 : cx0 + 4;
        foot = tunnel(fx, foot.floor - 2, dir, 40 + rng.int(30));
      }
    }
    // And out the far side, up to the surface again: a ruin is a passage, never a trap.
    const out2 = exit(dir > 0 ? x1 - 10 : x0 + 10, king.y, dir);
    x0 = Math.min(x0, out2.x - 16);
    x1 = Math.max(x1, out2.x + 16);
    const c: Complex = { x0, x1, floor: king.y, heights: [], basements: [], ruin: true };
    if (team >= 0) c.fortress = { team, king, spawns };
    return c;
  };
  if (fortresses) {
    // Regicide: a deep ruin near each end, red's in the west, green's in the east.
    for (const team of [0, 1]) {
      const x = team === 0 ? 420 + rng.int(160) : WORLD_W - 420 - rng.int(160);
      const c = ruin(x, 3, team);
      if (c) out.push(c);
    }
  }
  const want = 4 + rng.int(4);
  for (let tries = 0; tries < 60 && out.filter((c) => !c.fortress).length < want; tries++) {
    const x = 200 + rng.int(WORLD_W - 400);
    if (!clear(x - 160, x + 160)) continue;
    const c = ruin(x, 1 + rng.int(2), -1);
    if (c) out.push(c);
  }
  return out.sort((a, b) => a.x0 - b.x0);
}
