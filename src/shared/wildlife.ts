import { WORLD_H, WORLD_W } from './constants.ts';
import type { Terrain } from './terrain.ts';

/**
 * Wildlife: the planet's own creatures. Nobody drives them, ever; the server
 * thinks for them (server/world.ts), and they fight everyone alike.
 *
 * The first is the **millipede**: a long, many-legged, plated crawler that
 * lives in the caves. It goes along any surface (floors, walls, ceilings
 * alike), its body bending to the ground under it; dug out from under, it
 * falls until it lands on something and takes hold again. When it has
 * someone in sight it rears its front up off the ground, spreads a cobra's
 * hood and spits a glob of blood-red venom; and it bites whoever it reaches.
 * Venom burns on in the blood: a dose does its harm a little at a time, for
 * seconds after the hit (World: Player.venom), and doses stack; only the
 * repair kit's health wave washes it out.
 *
 * Its crawl is a contour-follower on the terrain grid: the head is an open
 * cell with solid ground on one side (`side` says which: ground to the
 * right of the way it's heading, or to the left), and each step goes on
 * along the surface: into a wall ahead it turns up it; over an edge it
 * turns down round it. The body follows the head's trail.
 */

export const BeastKind = { Millipede: 0 } as const;

/** Body segments, cells of trail between them (so the body's length), hit radius. */
export const MILLI_SEGS = 15;
export const MILLI_GAP = 4;
export const MILLI_R = 3.6;
/**
 * Armoured like a vehicle (a spider mech's kind of toughness): a round with
 * the energy to get through its plates (World: TANK_INTEGRITY) does its full
 * harm, anything weaker a fifth of it; blasts hurt it by distance.
 */
export const MILLI_HP = 2400;
/** Crawl speeds (cells/s): wandering, hunting, and the lunge when it spots prey (very fast). */
export const MILLI_CRAWL = 26;
export const MILLI_HUNT = 70;
export const MILLI_LUNGE = 160;
/** How long a lunge lasts (ticks). */
export const MILLI_LUNGE_TICKS = 75;
/** Freezing (its camouflage: still, it's hard to see): how long it holds still, the least and the most (ticks), and how long it wanders between. */
export const MILLI_FREEZE_MIN = 30 * 6;
export const MILLI_FREEZE_MAX = 30 * 18;
export const MILLI_WANDER = 30 * 6;
/** How far it senses prey (with a line on it), and how far it spits. */
export const MILLI_SENSE = 280;
export const MILLI_SPIT_RANGE = 210;
/** Rearing to spit: ticks up, the tick it spits, the spit's speed; ticks between spits. */
export const MILLI_REAR = 20;
export const MILLI_SPIT_AT = 13;
export const MILLI_SPIT_SPEED = 330;
export const MILLI_SPIT_CD = 80;
/** How far its reared head lifts off the ground (cells), and how many segments lift. */
export const MILLI_LIFT = 13;
export const MILLI_NECK = 5;
/**
 * Its coil: a clone its head reaches (within MILLI_COIL_R) it wraps round
 * like a rope, holding them fast, and after MILLI_COIL_TICKS bites: harm
 * enough to kill most outright (a droid's frame takes less). Hurt hard
 * enough while it holds them (MILLI_COIL_BREAK), it lets go.
 */
export const MILLI_COIL_R = 9;
export const MILLI_COIL_TICKS = 18;
export const MILLI_COIL_KILL = 150;
export const MILLI_COIL_DROID = 70;
export const MILLI_COIL_BREAK = MILLI_HP * 0.06;
export const MILLI_COIL_SEGS = 8;
/** After a coil (bitten or broken off): ticks before it can coil again. */
export const MILLI_COIL_CD = 90;

/** Venom: a dose (harm it does in all), the most the blood holds, the harm a tick. */
export const VENOM_DOSE = 36;
export const VENOM_MAX = 110;
export const VENOM_RATE = 0.2;

export interface Beast {
  kind: number;
  /** The head's cell (open, ground beside it) and heading (one of the four ways). */
  x: number;
  y: number;
  hx: number;
  hy: number;
  /** Which hand the ground is on: 1 to the right of the heading (screen), -1 to the left. */
  side: number;
  /** Holding on to a surface (otherwise falling, at `vy` cells/s). */
  attached: boolean;
  vy: number;
  /** The head's trail, newest first: x, y pairs, one a step (MILLI_SEGS * MILLI_GAP of them). */
  trail: number[];
  hp: number;
  /** Rearing: ticks into it (0: down); and how far up the head is (0..1). */
  rear: number;
  lift: number;
  /** Ticks to its next spit and coil. */
  spitCd: number;
  coilCd: number;
  /** Frozen still (ticks left), wandering before it next freezes (ticks left), lunging (ticks left). */
  frozen: number;
  wander: number;
  lunge: number;
  /** Coiled round a clone (its id, or -1): ticks into it, where it holds them, the harm it's taken meanwhile. */
  coil: number;
  coilT: number;
  coilX: number;
  coilY: number;
  coilHurt: number;
  /** Its camouflage: which sections of it look like what (the client draws from it). */
  seed: number;
  /** Fractional steps owed by its speed. */
  owed: number;
  /** Who it's after (a player id, or -1), and who hurt it last. */
  target: number;
  hurtBy: number;
  /** When it next thinks about turning round (tick), and its progress (to tell it's stuck). */
  turnAt: number;
  lastX: number;
  lastY: number;
  still: number;
}

/** A millipede taking hold at (x, y) (an open cell), going `dir` (-1, 1) along the floor. */
export function newMillipede(t: Terrain, x: number, y: number, dir: number): Beast {
  const b: Beast = {
    kind: BeastKind.Millipede,
    x,
    y,
    hx: dir,
    hy: 0,
    side: dir,
    attached: true,
    vy: 0,
    trail: [],
    hp: MILLI_HP,
    rear: 0,
    lift: 0,
    spitCd: 30,
    coilCd: 0,
    frozen: 0,
    wander: MILLI_WANDER,
    lunge: 0,
    coil: -1,
    coilT: 0,
    coilX: 0,
    coilY: 0,
    coilHurt: 0,
    seed: (x * 7919 + y * 104729) & 255,
    owed: 0,
    target: -1,
    hurtBy: -1,
    turnAt: 0,
    lastX: x,
    lastY: y,
    still: 0,
  };
  reorient(t, b);
  // Its body laid out along the ground behind its head: crawl a copy of it backwards from there.
  const ghost = { ...b, trail: [] };
  turnRound(ghost);
  b.trail = [b.x, b.y];
  for (let k = 0; k < MILLI_SEGS * MILLI_GAP; k++) {
    crawlStep(t, ghost);
    b.trail.push(ghost.x, ghost.y);
  }
  return b;
}

const solidAt = (t: Terrain, x: number, y: number) => x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H || t.isSolid(x, y);

/** The ground side of a heading, for a beast with the ground on hand `side`. */
const groundX = (b: Beast) => (b.side > 0 ? -b.hy : b.hy);
const groundY = (b: Beast) => (b.side > 0 ? b.hx : -b.hx);

/** Go the other way along the same surface. */
export function turnRound(b: Beast): void {
  b.hx = -b.hx;
  b.hy = -b.hy;
  b.side = -b.side;
}

/** Find a heading that has ground on its hand here; false if there's no ground at all beside it. */
function reorient(t: Terrain, b: Beast): boolean {
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  // Keep the heading if it still works; else the first that does (preferring to keep going the same way round).
  if (solidAt(t, b.x + groundX(b), b.y + groundY(b))) return true;
  for (const [hx, hy] of dirs) {
    b.hx = hx;
    b.hy = hy;
    if (solidAt(t, b.x + groundX(b), b.y + groundY(b)) && !solidAt(t, b.x + hx, b.y + hy)) return true;
  }
  for (const [hx, hy] of dirs) {
    b.hx = hx;
    b.hy = hy;
    if (solidAt(t, b.x + groundX(b), b.y + groundY(b))) return true;
  }
  return false;
}

/**
 * One step along the surface (a cell). Into a wall ahead: turn up it (and
 * step, if that's open). Over an edge: step, then turn down round it and
 * step again so the ground's under it once more. With nothing to hold on to
 * (dug out, or it never had ground): let go (falling).
 */
export function crawlStep(t: Terrain, b: Beast): void {
  if (solidAt(t, b.x, b.y)) {
    // Buried (something filled its cell): up out of it.
    for (let k = 1; k < 8; k++) {
      if (!solidAt(t, b.x, b.y - k)) {
        b.y -= k;
        break;
      }
    }
  }
  if (!reorient(t, b)) {
    b.attached = false;
    return;
  }
  for (let turn = 0; turn < 4; turn++) {
    if (!solidAt(t, b.x + b.hx, b.y + b.hy)) break;
    // Concave corner: turn away from the ground (up the wall).
    const nx = b.side > 0 ? b.hy : -b.hy;
    const ny = b.side > 0 ? -b.hx : b.hx;
    b.hx = nx;
    b.hy = ny;
    if (turn === 3) return; // (boxed in: stay put)
  }
  b.x += b.hx;
  b.y += b.hy;
  if (!solidAt(t, b.x + groundX(b), b.y + groundY(b))) {
    // Convex corner: turn toward the ground (down round the edge), and step round it.
    const gx = groundX(b);
    const gy = groundY(b);
    b.hx = gx;
    b.hy = gy;
    if (!solidAt(t, b.x + gx, b.y + gy)) {
      b.x += gx;
      b.y += gy;
    }
    if (!solidAt(t, b.x + groundX(b), b.y + groundY(b)) && !reorient(t, b)) b.attached = false;
  }
}

/** Falling: down at its speed until it lands on something, then take hold. Returns the cells it fell. */
export function fallStep(t: Terrain, b: Beast, dt: number, gravity: number): void {
  b.vy = Math.min(600, b.vy + gravity * dt);
  let n = Math.max(1, Math.round(b.vy * dt));
  while (n-- > 0) {
    if (solidAt(t, b.x, b.y + 1)) {
      b.attached = true;
      b.vy = 0;
      b.hx = b.side;
      b.hy = 0;
      reorient(t, b);
      return;
    }
    b.y++;
    if (b.y >= WORLD_H - 2) return;
  }
}

/** Push the head's new cell onto the trail (the oldest falls off the end). */
export function pushTrail(b: Beast): void {
  b.trail.unshift(b.x, b.y);
  const n = MILLI_SEGS * MILLI_GAP * 2 + 2;
  if (b.trail.length > n) b.trail.length = n;
}

/**
 * Which way is open air from (x, y): the surface normal, from how the solid
 * cells lie in a 7x7 box round it (unit vector; straight up if it can't tell).
 */
export function openWay(t: Terrain, x: number, y: number): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (solidAt(t, Math.round(x) + dx, Math.round(y) + dy)) {
        const w = 1 / (dx * dx + dy * dy);
        sx -= dx * w;
        sy -= dy * w;
      }
    }
  }
  const l = Math.hypot(sx, sy);
  return l < 1e-6 ? { x: 0, y: -1 } : { x: sx / l, y: sy / l };
}

/**
 * Its body: MILLI_SEGS points (head first), along its trail every MILLI_GAP
 * steps, smoothed (the grid's stairsteps rounded off), centred half a cell
 * into the open; the neck lifted off the ground along its normal as it
 * rears. Flat: x, y pairs into `out`.
 */
export function bodyPoints(t: Terrain, b: Beast, out: number[]): number[] {
  out.length = 0;
  const tr = b.trail;
  const n = tr.length >> 1;
  for (let s = 0; s < MILLI_SEGS; s++) {
    const k = Math.min(n - 1, s * MILLI_GAP);
    let x = 0;
    let y = 0;
    let w = 0;
    for (let j = Math.max(0, k - 2); j <= Math.min(n - 1, k + 2); j++) {
      x += tr[j * 2];
      y += tr[j * 2 + 1];
      w++;
    }
    out.push(x / w + 0.5, y / w + 0.5);
  }
  if (b.coil >= 0) {
    // Coiled round a clone (centred at coilX, coilY): the fore-body wound round them in a
    // spiral from their feet up, the rest of it following its trail back from its head.
    const K = MILLI_COIL_SEGS;
    for (let s = MILLI_SEGS - 1; s >= K; s--) {
      out[s * 2] = out[(s - K) * 2];
      out[s * 2 + 1] = out[(s - K) * 2 + 1];
    }
    const spin = b.coilT * 0.35;
    for (let s = 0; s < K; s++) {
      const f = s / (K - 1);
      const a = spin + f * Math.PI * 2.6;
      out[s * 2] = b.coilX + Math.cos(a) * (4.8 + f * 1.2);
      out[s * 2 + 1] = b.coilY - 7 + (1 - f) * 14 + Math.sin(a) * 1.6;
    }
    return out;
  }
  if (b.lift > 0) {
    const up = openWay(t, b.x, b.y);
    for (let s = 0; s < MILLI_NECK; s++) {
      const f = b.lift * MILLI_LIFT * (1 - s / MILLI_NECK) ** 1.6;
      out[s * 2] += up.x * f;
      out[s * 2 + 1] += up.y * f;
    }
  }
  return out;
}

/** Distance from (px, py) to the nearest of its body points (flat pairs), and that point's index. */
export function nearestPoint(pts: readonly number[], px: number, py: number): { d: number; i: number } {
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const d = (pts[i] - px) ** 2 + (pts[i + 1] - py) ** 2;
    if (d < best) {
      best = d;
      bi = i >> 1;
    }
  }
  return { d: Math.sqrt(best), i: bi };
}

/** Where a segment from (x0, y0) by (dx, dy) first meets a circle (0..1 along it), or -1. */
export function segmentCircle(x0: number, y0: number, dx: number, dy: number, cx: number, cy: number, r: number): number {
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  if (a < 1e-9) return -1;
  const bb = fx * dx + fy * dy;
  const disc = bb * bb - a * c;
  if (disc < 0) return -1;
  const t = (-bb - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : -1;
}
