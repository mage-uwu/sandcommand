import { ACTOR_H, WORLD_H, WORLD_W } from './constants.ts';
import { Mat } from './materials.ts';
import { Rng } from './rng.ts';
import { WeaponId } from './weapons.ts';

/**
 * Bunker complexes on the surface, built on a modular grid as part of map
 * generation (so clients build the identical structures from the seed).
 *
 * A complex is a row of modules (MOD_W x MOD_H cells) standing on a levelled
 * concrete foundation: rooms at ground level, some modules rising into
 * towers, basements below. Neighbouring rooms connect through doorways,
 * storeys through holes in the floor slabs (jetpack up, drop down), and the
 * ends have doors to the outside. Some basements run an escape tunnel out
 * under the open ground that climbs to a hatch on the surface; some modules
 * are already shot up.
 *
 * Between 15% and 60% of the surface (random per map) is built on; the rest
 * is open ground. Everything is concrete and metal plate, so only explosion
 * cores and diggers get through. Integer arithmetic and the seeded Rng only,
 * so every engine builds the same thing.
 */
/** Size of everything below relative to a clone (8x14): 2 = built big, so rooms feel like rooms. */
export const SCALE = 2;
export const MOD_W = 32 * SCALE;
export const MOD_H = 24 * SCALE;
export const WALL = 3 * SCALE; // wall thickness
export const SLAB = 3 * SCALE; // floor / ceiling thickness
export const DOOR_H = (ACTOR_H + 3) * SCALE; // doorways
export const HOLE_W = 12 * SCALE; // floor holes and shafts a clone can jet through
const MARGIN = 96; // keep clear of the world's edge walls
const MAX_FOUNDATION = 90 * SCALE;
export const LINING = 2 * SCALE; // tunnel and shaft lining

export interface Complex {
  x0: number; // footprint, cells
  x1: number;
  floor: number; // ground-floor standing surface (y)
  heights: number[]; // storeys above ground per module
  basements: number[]; // storeys below ground per module
  /** Regicide fortresses only: whose it is, where its king starts, and where its soldiers do. */
  fortress?: Fortress;
  /** How it's built (Style). */
  style?: number;
  /** A freestanding sniper tower (one narrow column of storeys). */
  tower?: boolean;
  /** Grand halls (two storeys high, two modules wide) and steel-lined bank vaults in it: boxes, cells. */
  halls?: Box[];
  vaults?: Box[];
  /** Weapons waiting in it at the start of a wave (a sniper rifle up a tower, a heavy gun in a hall). */
  loot?: { x: number; y: number; weapon: number }[];
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * How a complex is built:
 * - Concrete: the standard bunker.
 * - Steelworks: walls and ceilings of riveted steel plate.
 * - Ruined: badly shot up, rubble heaped in its rooms.
 * - Fortified: steel-faced outer walls and battlements along every roof.
 */
export const Style = { Concrete: 0, Steelworks: 1, Ruined: 2, Fortified: 3 } as const;
/** Width of a sniper tower (cells). */
export const TOWER_W = 26 * SCALE;

/** A standing spot: x centre, y the surface a clone stands on. */
export interface Spot {
  x: number;
  y: number;
}

export interface Fortress {
  team: number; // 0 red (west), 1 green (east)
  /** The king's vault, at the bottom of the deepest basement. */
  king: Spot;
  /** Rooms, roofs and the ground outside its gates. */
  spawns: Spot[];
}

/** Regicide fortress layout, west to east (the east one is mirrored): storeys up, basements down. */
const FORT_STOREYS = [2, 2, 3, 3, 2, 2];
const FORT_BASEMENTS = [1, 2, 2, 3, 2, 1];
/** Module holding the king's vault (in the west fortress's order). */
const FORT_VAULT = 3;
/** First module of the west fortress (the east one sits as far in from the other edge). */
const FORT_INSET = 15;

/**
 * Build bunker complexes into `m` (a raw material grid, WORLD_W x WORLD_H)
 * along the surface `heights`. Returns the complexes for tests and spawning.
 */
/**
 * Backdrop kinds (cosmetic, client side): the wall behind a bunker's rooms,
 * which stays when the front is blown away.
 */
export const Backdrop = { None: 0, Concrete: 1, Steel: 2 } as const;

export function placeStructures(m: Uint8Array, heights: Int32Array, seed: number, fortresses = false, backdrop?: Uint8Array, extraTowers = 0): Complex[] {
  const rng = new Rng(seed ^ 0xb0b5);
  const coverage = 0.15 + rng.next() * 0.45;
  const nMods = Math.floor((WORLD_W - 2 * MARGIN) / MOD_W);
  const target = Math.round(nMods * coverage);
  const complexes = Math.max(1, Math.round(target / 4.5));
  const meanGap = Math.max(1, (nMods - target) / (complexes + 1));
  const out: Complex[] = [];
  // Regicide: two great fortresses first, one near each end; the ordinary
  // complexes fill in around them (never within a module of their walls).
  const reserved: [number, number][] = [];
  if (fortresses) {
    const len = FORT_STOREYS.length;
    for (const team of [0, 1]) {
      const i0 = team === 0 ? FORT_INSET : nMods - FORT_INSET - len;
      const storeys = team === 0 ? FORT_STOREYS : [...FORT_STOREYS].reverse();
      const basements = team === 0 ? FORT_BASEMENTS : [...FORT_BASEMENTS].reverse();
      const vault = team === 0 ? FORT_VAULT : len - 1 - FORT_VAULT;
      const c = buildComplex(m, heights, MARGIN + i0 * MOD_W, len, rng, { storeys, basements, vault, team });
      if (c) out.push(c);
      reserved.push([i0 - 1, i0 + len + 1]);
    }
  }
  let i = 1 + rng.int(Math.ceil(meanGap));
  let built = 0;
  while (built < target && i < nMods - 1) {
    let len = Math.min(target - built, 2 + rng.int(6), nMods - 1 - i);
    if (len < 1) break;
    if (len === 1 && target - built > 1) len = 2;
    const clash = reserved.find(([r0, r1]) => i < r1 && i + len > r0);
    if (clash) {
      i = clash[1];
      continue;
    }
    const x0 = MARGIN + i * MOD_W;
    // Too uneven a site for one this long (a dune, a ravine edge)? Try it shorter.
    const style = rng.int(4);
    let c: Complex | null = null;
    for (let l = len; l >= Math.min(2, len) && !c; l--) c = buildComplex(m, heights, x0, l, rng, undefined, style);
    if (c) out.push(c);
    built += len;
    i += len + 1 + rng.int(Math.max(1, Math.round(meanGap * 2 - 1)));
  }
  out.sort((a, b) => a.x0 - b.x0);
  if (backdrop) for (const c of out) markBackdrop(backdrop, c);
  // Escape tunnels from end basements, out under the open ground beside them.
  for (let k = 0; k < out.length; k++) {
    const c = out[k];
    if (rng.next() > 0.45 || c.fortress) continue;
    const right = rng.next() < 0.5;
    const end = right ? c.basements.length - 1 : 0;
    if (c.basements[end] === 0) continue;
    const limit = right ? (out[k + 1]?.x0 ?? WORLD_W - MARGIN) - 24 * SCALE : (out[k - 1]?.x1 ?? MARGIN) + 24 * SCALE;
    tunnel(m, heights, c, right, limit, rng);
  }
  // Sniper towers on open ground between the complexes.
  // (Rugged maps get more of them: they perch where no complex can.)
  const towers = 1 + rng.int(4) + extraTowers;
  for (let tries = 0, built = 0; tries < 40 + extraTowers * 20 && built < towers; tries++) {
    const cx = MARGIN + 60 + rng.int(WORLD_W - 2 * MARGIN - 120);
    const clear = out.every((c) => cx + TOWER_W / 2 + (c.fortress ? 64 : 30) < c.x0 || cx - TOWER_W / 2 - (c.fortress ? 64 : 30) > c.x1);
    if (!clear) continue;
    const tw = tower(m, heights, cx, rng, extraTowers > 0);
    if (!tw) continue;
    out.push(tw);
    if (backdrop) markBox(backdrop, tw.x0 + WALL, tw.floor - tw.heights[0] * MOD_H + SLAB, tw.x1 - WALL, tw.floor, Backdrop.Concrete);
    built++;
  }
  out.sort((a, b) => a.x0 - b.x0);
  return out;
}

export function markBox(bd: Uint8Array, x0: number, y0: number, x1: number, y1: number, kind: number): void {
  for (let y = Math.max(0, y0); y < Math.min(WORLD_H, y1); y++) bd.fill(kind, y * WORLD_W + Math.max(0, x0), y * WORLD_W + Math.min(WORLD_W, x1));
}

/**
 * A freestanding sniper tower: a narrow concrete column three to five
 * storeys tall on a levelled footing, doors at the bottom, firing slits on
 * both sides of every storey, holes up through each floor (alternating
 * sides), and an open roof behind battlements, where a sniper rifle waits.
 */
function tower(m: Uint8Array, heights: Int32Array, cx: number, rng: Rng, rugged = false): Complex | null {
  const x0 = cx - TOWER_W / 2;
  const x1 = x0 + TOWER_W;
  const hs: number[] = [];
  for (let x = x0; x < x1; x += 2) hs.push(heights[x]);
  hs.sort((a, b) => a - b);
  if (hs[hs.length - 1] - hs[0] > MOD_H * (rugged ? 1.5 : 1)) return null; // not on a cliff edge
  const floor = (hs[hs.length >> 1] >> 2) << 2;
  let storeys = 3 + rng.int(3);
  while (storeys > 2 && floor - storeys * MOD_H - 10 * SCALE < 12) storeys--;
  if (floor - storeys * MOD_H - 10 * SCALE < 12 || floor + SLAB > WORLD_H - 40) return null;
  const roof = floor - storeys * MOD_H;
  fill(m, x0 - 2 * SCALE, roof - 10 * SCALE, x1 + 2 * SCALE, floor, Mat.Air);
  fill(m, x0, floor, x1, floor + SLAB, Mat.Concrete);
  for (let x = x0; x < x1; x++) {
    for (let y = floor + SLAB, n = 0; y < WORLD_H - 12 && n < MAX_FOUNDATION; y++, n++) {
      if (m[y * WORLD_W + x] !== Mat.Air) break;
      m[y * WORLD_W + x] = Mat.Concrete;
    }
  }
  fill(m, x0, roof, x0 + WALL, floor, Mat.Concrete);
  fill(m, x1 - WALL, roof, x1, floor, Mat.Concrete);
  for (let lv = 0; lv < storeys; lv++) {
    const yTop = floor - (lv + 1) * MOD_H;
    const yFloor = floor - lv * MOD_H;
    fill(m, x0, yTop, x1, yTop + SLAB, lv === storeys - 1 ? Mat.Metal : Mat.Concrete);
    fill(m, x0 + WALL, yTop + SLAB, x1 - WALL, yFloor, Mat.Air);
    // Up through the ceiling, alternating sides (the top one opens onto the roof).
    const hx = (lv & 1) === 0 ? x0 + WALL : x1 - WALL - HOLE_W;
    fill(m, hx, yTop, hx + HOLE_W, yTop + SLAB, Mat.Air);
    if (lv > 0) {
      // Firing slits both ways at head height.
      fill(m, x0, yFloor - 12 * SCALE, x0 + WALL, yFloor - 9 * SCALE, Mat.Air);
      fill(m, x1 - WALL, yFloor - 12 * SCALE, x1, yFloor - 9 * SCALE, Mat.Air);
    }
  }
  fill(m, x0, floor - DOOR_H, x0 + WALL, floor, Mat.Air);
  fill(m, x1 - WALL, floor - DOOR_H, x1, floor, Mat.Air);
  // Battlements round the roof.
  const MERLON = 5 * SCALE;
  for (let x = x0; x + MERLON <= x1; x += 2 * MERLON) fill(m, x, roof - 5 * SCALE, x + MERLON, roof, Mat.Concrete);
  fill(m, x1 - MERLON, roof - 5 * SCALE, x1, roof, Mat.Concrete);
  return { x0, x1, floor, heights: [storeys], basements: [0], tower: true, style: Style.Concrete, loot: [{ x: cx, y: roof - 2, weapon: WeaponId.Sniper }] };
}

/** Every module's box, roof to deepest basement floor, gets a back wall (the king's vault, steelworks and bank vaults in steel). */
export function markBackdrop(bd: Uint8Array, c: Complex): void {
  if (c.tower) return;
  if (c.style === Style.Steelworks) {
    for (let k = 0; k < c.heights.length; k++) {
      const mx = c.x0 + k * MOD_W;
      markBox(bd, mx, c.floor - c.heights[k] * MOD_H + SLAB, mx + MOD_W, c.floor + SLAB + c.basements[k] * MOD_H, Backdrop.Steel);
    }
    return;
  }
  for (const v of c.vaults ?? []) markBox(bd, v.x0, v.y0, v.x1, v.y1, Backdrop.Steel);
  const vault = c.fortress ? Math.floor((c.fortress.king.x - c.x0) / MOD_W) : -1;
  for (let k = 0; k < c.heights.length; k++) {
    const mx = c.x0 + k * MOD_W;
    const top = c.floor - c.heights[k] * MOD_H + SLAB;
    const bottom = c.floor + SLAB + c.basements[k] * MOD_H;
    const steelFrom = k === vault ? c.floor + SLAB + (c.basements[k] - 1) * MOD_H : Infinity;
    for (let y = Math.max(0, top); y < Math.min(WORLD_H, bottom); y++) {
      bd.fill(y >= steelFrom ? Backdrop.Steel : Backdrop.Concrete, y * WORLD_W + mx, y * WORLD_W + mx + MOD_W);
    }
  }
  for (const v of c.vaults ?? []) markBox(bd, v.x0, v.y0, v.x1, v.y1, Backdrop.Steel);
}

export function fill(m: Uint8Array, x0: number, y0: number, x1: number, y1: number, mat: number): void {
  const xa = Math.max(4, x0);
  const xb = Math.min(WORLD_W - 4, x1);
  const ya = Math.max(0, y0);
  const yb = Math.min(WORLD_H - 12, y1);
  for (let y = ya; y < yb; y++) m.fill(mat, y * WORLD_W + xa, y * WORLD_W + xb);
}

/** A fixed layout for a fortress (instead of a random one). */
interface FortPlan {
  storeys: number[];
  basements: number[];
  vault: number; // module of the king's vault (it has the deepest basement)
  team: number;
}

/**
 * One complex of `len` modules from `x0`, levelled on `heights`. `cap`: the
 * most storeys any module may rise (a citadel under a cavern roof).
 */
export function buildComplex(m: Uint8Array, heights: Int32Array, x0: number, len: number, rng: Rng, plan?: FortPlan, style: number = Style.Concrete, cap = 3): Complex | null {
  const x1 = x0 + len * MOD_W;
  // Level the site at the median ground height under it (snapped to 4).
  const hs: number[] = [];
  for (let x = x0; x < x1; x += 4) hs.push(heights[x]);
  hs.sort((a, b) => a - b);
  // Not across a ravine or a mountainside: the ground under it can't vary too much.
  if (!plan && hs[hs.length - 1] - hs[0] > MOD_H * 1.6) return null;
  const wallMat = style === Style.Steelworks ? Mat.Metal : Mat.Concrete;
  let floor = (hs[hs.length >> 1] >> 2) << 2;
  const storeys: number[] = [];
  const basements: number[] = [];
  for (let k = 0; k < len; k++) {
    storeys.push(plan ? plan.storeys[k] : Math.min(cap, [1, 1, 1, 1, 2, 2, 3][rng.int(7)]));
    basements.push(plan ? plan.basements[k] : [0, 0, 1, 1, 1, 2][rng.int(6)]);
  }
  // A grand hall over two neighbouring modules (each at least two storeys tall for it).
  const hallK = !plan && cap >= 2 && len >= 2 && rng.next() < 0.45 ? rng.int(len - 1) : -1;
  if (hallK >= 0) {
    storeys[hallK] = Math.max(2, storeys[hallK]);
    storeys[hallK + 1] = Math.max(2, storeys[hallK + 1]);
  }
  const deepest = Math.max(...basements);
  if (plan) {
    // A fortress always gets built: shift the site into the depth that fits.
    floor = (Math.max(3 * MOD_H + 8, Math.min(WORLD_H - 41 - SLAB - deepest * MOD_H, floor)) >> 2) << 2;
  } else if (floor - 3 * MOD_H < 8 || floor + SLAB + deepest * MOD_H > WORLD_H - 40) return null;

  // Site: clear the ground above the floor (a notch where the hill rises),
  // pour the floor slab, and fill any dip beneath it down to solid ground.
  const top = floor - Math.max(...storeys) * MOD_H;
  fill(m, x0 - 2 * SCALE, top - 6 * SCALE, x1 + 2 * SCALE, floor, Mat.Air);
  fill(m, x0, floor, x1, floor + SLAB, Mat.Concrete);
  for (let x = x0; x < x1; x++) {
    for (let y = floor + SLAB, n = 0; y < WORLD_H - 12 && n < MAX_FOUNDATION; y++, n++) {
      if (m[y * WORLD_W + x] !== Mat.Air) break;
      m[y * WORLD_W + x] = Mat.Concrete;
    }
  }

  // Storeys above ground: ceilings (metal on top), then walls on each module
  // boundary as tall as the taller side.
  for (let k = 0; k < len; k++) {
    const mx = x0 + k * MOD_W;
    for (let lv = 0; lv < storeys[k]; lv++) {
      const yTop = floor - (lv + 1) * MOD_H;
      fill(m, mx, yTop, mx + MOD_W, yTop + SLAB, lv === storeys[k] - 1 ? Mat.Metal : wallMat);
    }
  }
  for (let b = 0; b <= len; b++) {
    const bx = b === len ? x1 - WALL : x0 + b * MOD_W;
    const left = b > 0 ? storeys[b - 1] : 0;
    const right = b < len ? storeys[b] : 0;
    const h = Math.max(left, right);
    fill(m, bx, floor - h * MOD_H, bx + WALL, floor, wallMat);
    for (let lv = 0; lv < h; lv++) {
      const yFloor = floor - lv * MOD_H; // standing surface of this storey
      const inside = lv < Math.min(left, right);
      if (inside) {
        // Rooms on both sides: a doorway (always at ground level).
        if (lv === 0 || rng.next() < 0.6 || plan) fill(m, bx, yFloor - DOOR_H, bx + WALL, yFloor, Mat.Air);
      } else if (lv === 0) {
        // An end of the complex: the way in (most ends have one; a fortress always has its gates).
        if (rng.next() < 0.8 || (b === 0 && len === 1) || plan) fill(m, bx, yFloor - DOOR_H, bx + WALL, yFloor, Mat.Air);
      } else if (rng.next() < 0.6) {
        // An upper storey looking out over a lower roof: a firing slit at head height.
        fill(m, bx, yFloor - 12 * SCALE, bx + WALL, yFloor - 9 * SCALE, Mat.Air);
      }
    }
  }
  // Hollow out the rooms, and cut holes between storeys.
  for (let k = 0; k < len; k++) {
    const mx = x0 + k * MOD_W;
    const ix0 = mx + WALL;
    const ix1 = k === len - 1 ? x1 - WALL : mx + MOD_W;
    for (let lv = 0; lv < storeys[k]; lv++) {
      const yTop = floor - (lv + 1) * MOD_H;
      fill(m, ix0, yTop + SLAB, ix1, floor - lv * MOD_H, Mat.Air);
      if (lv > 0) {
        const hx = ix0 + 2 * SCALE + rng.int(Math.max(1, ix1 - ix0 - HOLE_W - 4 * SCALE));
        fill(m, hx, yTop + MOD_H, hx + HOLE_W, yTop + MOD_H + SLAB, Mat.Air);
      }
    }
  }

  // Basements: concrete boxes with the rooms carved out, shafts from the
  // storey above, doorways to neighbouring basements.
  for (let k = 0; k < len; k++) {
    const mx = x0 + k * MOD_W;
    for (let j = 0; j < basements[k]; j++) {
      const by0 = floor + SLAB + j * MOD_H;
      const by1 = by0 + MOD_H;
      fill(m, mx, by0, mx + MOD_W, by1, Mat.Concrete);
      fill(m, mx + WALL, by0 + (j > 0 ? SLAB : 0), mx + MOD_W - WALL, by1 - SLAB, Mat.Air);
      // Shaft down from the room above (the ground floor, or the basement above).
      const sx = mx + WALL + 2 * SCALE + rng.int(MOD_W - 2 * WALL - HOLE_W - 4 * SCALE);
      fill(m, sx, by0 - SLAB - (j > 0 ? SLAB : 0), sx + HOLE_W, by0 + SLAB, Mat.Air);
    }
    for (let j = 0; j < basements[k] && k > 0; j++) {
      if (j >= basements[k - 1]) continue;
      const fy = floor + SLAB + (j + 1) * MOD_H - SLAB; // basement floor surface
      fill(m, mx - WALL, fy - DOOR_H, mx + WALL, fy, Mat.Air);
    }
  }

  if (plan) return fortify(m, x0, len, floor, storeys, basements, plan, rng);

  // A grand hall: two neighbouring modules' lower two storeys opened into one
  // tall room, with a mezzanine ledge along each end wall.
  const halls: Box[] = [];
  const loot: { x: number; y: number; weapon: number }[] = [];
  if (hallK >= 0) {
    const k = hallK;
    {
      const hx0 = x0 + k * MOD_W + WALL;
      const hx1 = k + 2 === len ? x1 - WALL : x0 + (k + 2) * MOD_W;
      const hy0 = floor - 2 * MOD_H + SLAB;
      fill(m, hx0, hy0, hx1, floor, Mat.Air);
      const LEDGE = 10 * SCALE;
      fill(m, hx0, floor - MOD_H, hx0 + LEDGE, floor - MOD_H + SLAB, Mat.Concrete);
      fill(m, hx1 - LEDGE, floor - MOD_H, hx1, floor - MOD_H + SLAB, Mat.Concrete);
      halls.push({ x0: hx0, y0: hy0, x1: hx1, y1: floor });
      const heavy = [WeaponId.Gatling, WeaponId.Shotgun, WeaponId.GrenadeLauncher, WeaponId.Laser, WeaponId.ATCannon, WeaponId.Autocannon];
      loot.push({ x: (hx0 + hx1) >> 1, y: floor - 2, weapon: heavy[rng.int(heavy.length)] });
    }
  }

  // A bank vault: the deepest basement room lined in steel (two modules wide
  // where the neighbour goes as deep), gold bars stacked along its floor.
  const vaults: Box[] = [];
  if (rng.next() < 0.35) {
    let k = 0;
    for (let i = 1; i < len; i++) if (basements[i] > basements[k]) k = i;
    const j = basements[k] - 1;
    if (j >= 0) {
      const wide = k + 1 < len && basements[k + 1] > j;
      const vx0 = x0 + k * MOD_W;
      const vx1 = vx0 + (wide ? 2 : 1) * MOD_W;
      const vy0 = floor + SLAB + j * MOD_H;
      const vy1 = vy0 + MOD_H;
      if (wide) fill(m, vx0 + MOD_W - WALL, vy0 + (j > 0 ? SLAB : 0), vx0 + MOD_W + WALL, vy1 - SLAB, Mat.Air);
      for (let y = vy0; y < vy1 + SLAB; y++) {
        for (let x = vx0; x < vx1; x++) {
          const i = y * WORLD_W + x;
          if (m[i] === Mat.Concrete) m[i] = Mat.Metal;
        }
      }
      const fy = vy1 - SLAB; // vault floor
      for (let gx = vx0 + WALL + 4; gx + 8 < vx1 - WALL - 2; gx += 14) {
        if (rng.next() < 0.25) continue;
        const h = 2 + rng.int(3) * 2;
        fill(m, gx, fy - h, gx + 8, fy, Mat.Gold);
      }
      vaults.push({ x0: vx0 + WALL, y0: vy0, x1: vx1 - WALL, y1: vy1 });
    }
  }

  if (style === Style.Fortified) {
    // Steel facing on the outer walls (doors left open) and battlements along every roof.
    const FACING = 2 * SCALE;
    fill(m, x0 - FACING, floor - storeys[0] * MOD_H, x0, floor - DOOR_H, Mat.Metal);
    fill(m, x1, floor - storeys[len - 1] * MOD_H, x1 + FACING, floor - DOOR_H, Mat.Metal);
    const MERLON = 6 * SCALE;
    for (let k = 0; k < len; k++) {
      const mx = x0 + k * MOD_W;
      const roof = floor - storeys[k] * MOD_H;
      for (let x = mx; x + MERLON <= mx + MOD_W; x += 2 * MERLON) fill(m, x, roof - 5 * SCALE, x + MERLON, roof, Mat.Concrete);
    }
  }

  // Battle damage: some modules come pre-shot (a ruin, most of them, badly).
  const ruined = style === Style.Ruined;
  for (let k = 0; k < len; k++) {
    if (rng.next() > (ruined ? 0.75 : 0.22)) continue;
    const mx = x0 + k * MOD_W;
    const holes = ruined ? 4 + rng.int(5) : 2 + rng.int(4);
    for (let n = 0; n < holes; n++) {
      const cx = mx + rng.int(MOD_W);
      const cy = floor - rng.int(storeys[k] * MOD_H);
      const r = (3 + rng.int(5)) * SCALE;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 4 || x >= WORLD_W - 4 || y < 0 || y >= WORLD_H - 12) continue;
          const v = m[y * WORLD_W + x];
          if (v === Mat.Concrete || v === Mat.Metal) m[y * WORLD_W + x] = Mat.Air;
        }
      }
    }
    if (ruined) {
      // Rubble heaped on the ground floor (on solid floor, never over a shaft down).
      const rx = mx + WALL + rng.int(MOD_W - 2 * WALL - 16);
      let solid = true;
      for (let j = 0; j < 16; j++) if (m[floor * WORLD_W + rx + j] === Mat.Air) solid = false;
      for (let j = 0; j < 16 && solid; j++) {
        const hgt = Math.max(0, 6 - Math.abs(j - 8)) + rng.int(2);
        fill(m, rx + j, floor - hgt, rx + j + 1, floor, Mat.Rubble);
      }
    }
  }
  return { x0, x1, floor, heights: storeys, basements, style, halls, vaults, loot };
}

/**
 * Finish a fortress: steel facing on its outer walls, battlements on every
 * roof, and the king's vault at the bottom of the deepest basement lined in
 * metal (only explosion cores and diggers get through). Then note where the
 * king and the soldiers start.
 */
function fortify(m: Uint8Array, x0: number, len: number, floor: number, storeys: number[], basements: number[], plan: FortPlan, rng: Rng): Complex {
  const x1 = x0 + len * MOD_W;
  const FACING = 2 * SCALE;
  // Steel over the outer walls, leaving the gates open.
  for (const [wx, h] of [
    [x0 - FACING, storeys[0]],
    [x1, storeys[len - 1]],
  ] as const) {
    fill(m, wx, floor - h * MOD_H, wx + FACING, floor - DOOR_H, Mat.Metal);
  }
  // Battlements: merlons along every roof, gaps to shoot through.
  const MERLON = 6 * SCALE;
  for (let k = 0; k < len; k++) {
    const mx = x0 + k * MOD_W;
    const roof = floor - storeys[k] * MOD_H;
    for (let x = mx; x + MERLON <= mx + MOD_W; x += 2 * MERLON) fill(m, x, roof - 5 * SCALE, x + MERLON, roof, Mat.Concrete);
  }
  // The vault: its whole module column at the deepest level turns to steel.
  const j = basements[plan.vault] - 1;
  const vx = x0 + plan.vault * MOD_W;
  const vy0 = floor + SLAB + j * MOD_H;
  const vy1 = vy0 + MOD_H;
  for (let y = vy0; y < vy1; y++) {
    for (let x = vx; x < vx + MOD_W; x++) if (m[y * WORLD_W + x] === Mat.Concrete) m[y * WORLD_W + x] = Mat.Metal;
  }
  // Under the vault floor, a steel plate too (so it can't be dug into from below cheaply).
  fill(m, vx, vy1, vx + MOD_W, vy1 + 2 * SCALE, Mat.Metal);
  const king: Spot = { x: vx + MOD_W / 2, y: vy1 - SLAB };
  // Soldiers: every above-ground room, the roofs, and the ground outside the gates.
  const spawns: Spot[] = [];
  for (let k = 0; k < len; k++) {
    const mx = x0 + k * MOD_W;
    for (let lv = 0; lv < storeys[k]; lv++) {
      for (let n = 0; n < 2; n++) spawns.push({ x: mx + WALL + 8 + rng.int(MOD_W - 2 * WALL - 16), y: floor - lv * MOD_H });
    }
    spawns.push({ x: mx + 8 + rng.int(MOD_W - 16), y: floor - storeys[k] * MOD_H - 5 * SCALE });
  }
  return { x0, x1, floor, heights: storeys, basements, fortress: { team: plan.team, king, spawns } };
}

/**
 * A lined escape tunnel from the end basement out under the open ground,
 * climbing to a hatch on the surface.
 */
function tunnel(m: Uint8Array, heights: Int32Array, c: Complex, right: boolean, limit: number, rng: Rng): void {
  const floorY = c.floor + SLAB + MOD_H - SLAB; // basement floor surface
  const ty = floorY - DOOR_H;
  const start = right ? c.x1 - WALL : c.x0 + WALL;
  const want = (64 + rng.int(180)) * SCALE;
  const end = right ? Math.min(start + want, limit) : Math.max(start - want, limit);
  if (Math.abs(end - start) < 40 * SCALE) return;
  const xa = Math.min(start, end);
  const xb = Math.max(start, end);
  fill(m, xa, ty - LINING, xb, floorY + LINING, Mat.Concrete);
  fill(m, xa, ty, xb, floorY, Mat.Air);
  // Up to the surface at the far end.
  const sx = right ? end - HOLE_W - LINING : end + LINING;
  const surface = Math.min(heights[sx], heights[sx + HOLE_W]);
  if (surface >= ty - 4) return;
  fill(m, sx - LINING, surface - 2, sx + HOLE_W + LINING, ty, Mat.Concrete);
  fill(m, sx, surface - 2, sx + HOLE_W, ty + LINING, Mat.Air);
}
