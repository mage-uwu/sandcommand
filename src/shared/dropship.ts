import { GRAVITY } from './constants.ts';
import type { Terrain } from './terrain.ts';

/**
 * The dropship: an aerial support gunship, called in by radio. Unlike a drop
 * rocket it is held up by four engine pods, like a modern drone: chunky
 * rocket motors out on pylons past the hull's ends, open to fire from
 * below. It stays on station: it hovers over whoever called it,
 * strafes enemies with a small turret on either side, and opens the bomb-bay
 * doors in its belly to drop heavy bombs (eight in all) on enemies below.
 *
 * Its engines, turrets, bay doors and hull can each be shot to pieces. An
 * autopilot shares the lift between whichever engines are left, so losing
 * one makes it lurch and work harder; losing too many brings it down. It has
 * about half a tank's toughness.
 *
 * `stepShip` is pure and shared. The server flies every dropship (they are
 * never piloted); clients just interpolate what they are sent.
 */
export const SHIP_W = 80;
export const SHIP_H = 30;
export const SHIP_HP = 3750;
export const MAX_SHIPS = 4;
export const SHIP_BOMBS = 8;
/** Hits below this penetration energy only scratch it. */
export const SHIP_INTEGRITY = 120;

export const ShipPart = {
  Hull: 0,
  EngineA: 1,
  EngineB: 2,
  EngineC: 3,
  EngineD: 4,
  Doors: 5,
  TurretL: 6,
  TurretR: 7,
} as const;
export const SHIP_PARTS = 8;
export const ALL_SHIP_PARTS = (1 << SHIP_PARTS) - 1;
export const SHIP_PART_HP = [SHIP_HP, 650, 650, 650, 650, 800, 550, 550];
export const SHIP_PART_NAMES = ['hull', 'engine', 'engine', 'engine', 'engine', 'bay doors', 'turret', 'turret'];

/** The hull: 44 cells long, centred in the box, its top under the pods' level. */
export const HULL_X = 18;
export const HULL_W = 44;
export const HULL_TOP = 13;
export const HULL_H = 14;
/**
 * The rocket pods (local x centres), two on an outrigger pylon either side,
 * out past the hull's ends so they're open to fire from below: pod centre
 * height, and where the nozzles' exhaust comes out.
 */
export const ENGINE_X = [5, 15, 65, 75];
export const ENGINE_Y = 5;
export const ENGINE_NOZZLE_Y = 11;
/** Turret pivots (local), port and starboard, under the hull's ends. */
export const TURRET_AT = [
  [HULL_X + 4, 25],
  [HULL_X + 40, 25],
] as const;
/** The bomb bay: centre of its doors in the belly (local). */
export const BAY_AT = [HULL_X + 22, 26] as const;
/** Part centres (local), for blasts and debris. */
export const SHIP_PART_CENTER: readonly (readonly [number, number])[] = [
  [HULL_X + 22, 18],
  [ENGINE_X[0], ENGINE_Y],
  [ENGINE_X[1], ENGINE_Y],
  [ENGINE_X[2], ENGINE_Y],
  [ENGINE_X[3], ENGINE_Y],
  [BAY_AT[0], BAY_AT[1]],
  [TURRET_AT[0][0], TURRET_AT[0][1]],
  [TURRET_AT[1][0], TURRET_AT[1][1]],
];

export const hasShipPart = (mask: number, part: number) => (mask & (1 << part)) !== 0;

/** Lift one engine gives at full throttle (cells/s^2): four comfortably hold it up, two barely. */
const ENGINE_MAX = 0.55 * GRAVITY;
/** Rotational inertia of the hull (cells^2). */
const INERTIA = (SHIP_W * SHIP_W) / 12;
const MAX_TILT = 0.45;
const CRUISE = 95;
const CLIMB = 75;
const DRAG = 0.7;

/**
 * What a dropship is doing (server brain, shown to its side): flying ahead
 * to find the enemy, covering an ally under fire, hitting enemies its side
 * knows of, or holding over its caller.
 */
export const ShipMission = {
  Escort: 0,
  Scout: 1,
  Cover: 2,
  Strike: 3,
  /** Dogfighting an enemy dropship: alongside it at its altitude, guns on it. */
  Intercept: 4,
} as const;
export const SHIP_MISSION_NAMES = ['ESCORT', 'SCOUTING', 'COVERING', 'STRIKING', 'INTERCEPTING'] as const;

export interface Ship {
  x: number; // box top-left, world cells
  y: number;
  vx: number;
  vy: number;
  /** Tilt (radians, clockwise: positive = right end lower) and its angular velocity. */
  a: number;
  w: number;
  hp: number;
  parts: number;
  partHp: Float32Array;
  /** Who called it in (its guns and bombs are theirs), and their team. */
  owner: number;
  team: number;
  bombs: number;
  /** Ticks since it was called; ticks until the next bomb; ticks the bay stays open. */
  age: number;
  bombCd: number;
  doors: number;
  /** Ticks since its last bomb (it heads home once it's out and idle). */
  sinceBomb: number;
  /** Turret aims (world radians) and cooldowns, port and starboard. */
  aim: [number, number];
  gunCd: [number, number];
  fired: [boolean, boolean];
  /** Throttle per engine (0..1), for the exhaust. */
  thrust: Float32Array;
  /** Where it holds station when its caller is gone. */
  anchorX: number;
  leaving: boolean;
  lastHitBy: number;
  /** The brain: its mission (ShipMission), where it's headed, who it's after or covering (255 none), and ticks to its next rethink. */
  mission: number;
  goalX: number;
  focus: number;
  planCd: number;
  /** Intercepting: the enemy dropship's slot it's after (255: none). */
  foeShip: number;
  /** Remote control: who's flying it (255: the autopilot), and the point they're holding it at. */
  pilot: number;
  holdX: number;
  holdY: number;
}

export function newShip(x: number, y: number, owner: number, team: number): Ship {
  const partHp = new Float32Array(SHIP_PARTS);
  for (let i = 0; i < SHIP_PARTS; i++) partHp[i] = SHIP_PART_HP[i];
  return {
    x,
    y,
    vx: 0,
    vy: 40,
    a: 0,
    w: 0,
    hp: SHIP_HP,
    parts: ALL_SHIP_PARTS,
    partHp,
    owner,
    team,
    bombs: SHIP_BOMBS,
    age: 0,
    bombCd: 60,
    doors: 0,
    sinceBomb: 0,
    aim: [Math.PI * 0.75, Math.PI * 0.25],
    gunCd: [0, 0],
    fired: [false, false],
    thrust: new Float32Array(4),
    anchorX: x + SHIP_W / 2,
    leaving: false,
    lastHitBy: 255,
    mission: ShipMission.Escort,
    goalX: x + SHIP_W / 2,
    focus: 255,
    planCd: 0,
    foeShip: 255,
    pilot: 255,
    holdX: x + SHIP_W / 2,
    holdY: y,
  };
}

/** Which part is at local (lx, ly) (from the box's top-left, untilted); missing parts expose the hull. */
export function shipPartAt(mask: number, lx: number, ly: number): number {
  let p: number = ShipPart.Hull;
  if (ly < HULL_TOP) {
    let best = 99;
    for (let i = 0; i < 4; i++) {
      const d = Math.abs(lx - ENGINE_X[i]);
      if (d <= 5 && d < best) {
        best = d;
        p = ShipPart.EngineA + i;
      }
    }
  } else if (ly >= HULL_TOP + 8 && lx < HULL_X + 8) p = ShipPart.TurretL;
  else if (ly >= HULL_TOP + 8 && lx >= HULL_X + HULL_W - 8) p = ShipPart.TurretR;
  else if (ly >= HULL_TOP + 10 && Math.abs(lx - BAY_AT[0]) <= 6) p = ShipPart.Doors;
  return hasShipPart(mask, p) ? p : ShipPart.Hull;
}

/**
 * Is there anything solid at local (lx, ly)? The box is mostly air: the
 * hull in the middle, the pods out on their pylons (open girders shots pass
 * through), the turrets under the hull's ends.
 */
export function shipSolidAt(mask: number, lx: number, ly: number): boolean {
  if (lx >= HULL_X + 1 && lx < HULL_X + HULL_W - 1 && ly >= HULL_TOP && ly < HULL_TOP + HULL_H) return true;
  if (ly >= 0 && ly <= ENGINE_NOZZLE_Y) {
    for (let i = 0; i < 4; i++) if (hasShipPart(mask, ShipPart.EngineA + i) && Math.abs(lx - ENGINE_X[i]) <= 4.5) return true;
  }
  for (let s = 0; s < 2; s++) {
    if (hasShipPart(mask, ShipPart.TurretL + s) && Math.abs(lx - TURRET_AT[s][0]) <= 4 && Math.abs(ly - TURRET_AT[s][1]) <= 4) return true;
  }
  return false;
}

/**
 * Where a segment (local, from (ax, ay) by (dx, dy)) first meets solid ship,
 * starting from fraction `t0` (its entry into the box): march in about
 * one-cell steps. Returns the fraction, or -1 if it passes clean through.
 */
export function shipSegmentSolid(mask: number, ax: number, ay: number, dx: number, dy: number, t0: number): number {
  const n = Math.ceil(Math.hypot(dx, dy)) + 1;
  for (let k = 0; k <= n; k++) {
    const t = t0 + ((1 - t0) * k) / n;
    if (shipSolidAt(mask, ax + dx * t, ay + dy * t)) return t;
  }
  return -1;
}

type Posed = { x: number; y: number; a: number };

/** A local point (untilted, from the box's top-left) in world cells, tilted with the hull about its centre. */
export function shipPoint(s: Posed, lx: number, ly: number, out: { x: number; y: number }): { x: number; y: number } {
  const dx = lx - SHIP_W / 2;
  const dy = ly - SHIP_H / 2;
  const c = Math.cos(s.a);
  const n = Math.sin(s.a);
  out.x = s.x + SHIP_W / 2 + dx * c - dy * n;
  out.y = s.y + SHIP_H / 2 + dx * n + dy * c;
  return out;
}

/** World -> local (untilted) box coordinates. */
export function shipLocal(s: Posed, wx: number, wy: number, out: { x: number; y: number }): { x: number; y: number } {
  const dx = wx - (s.x + SHIP_W / 2);
  const dy = wy - (s.y + SHIP_H / 2);
  const c = Math.cos(s.a);
  const n = Math.sin(s.a);
  out.x = SHIP_W / 2 + dx * c + dy * n;
  out.y = SHIP_H / 2 - dx * n + dy * c;
  return out;
}

function collides(t: Terrain, x: number, y: number): boolean {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  return t.rectSolid(ix, iy, ix + SHIP_W - 1, iy + SHIP_H - 1);
}

/**
 * One tick of flight toward the station (tx, ty) (the point its centre
 * should hold). The autopilot tilts the hull to move sideways, like a drone,
 * and shares lift and attitude torque between the engines still attached.
 * Returns the speed of any terrain impact this tick (0 if none).
 */
export function stepShip(s: Ship, t: Terrain, dt: number, tx: number, ty: number): number {
  const cx = s.x + SHIP_W / 2;
  const cy = s.y + SHIP_H / 2;
  const vxT = Math.max(-CRUISE, Math.min(CRUISE, (tx - cx) * 0.9));
  const vyT = Math.max(-CLIMB, Math.min(CLIMB, (ty - cy) * 1.2));
  // Lean into the way it wants to go; lift enough to make the climb it wants.
  const aT = Math.max(-MAX_TILT, Math.min(MAX_TILT, (vxT - s.vx) * 0.01));
  const cos = Math.cos(s.a);
  const lift = Math.max(0, (GRAVITY - (vyT - s.vy) * 3) / Math.max(0.5, cos));
  const alpha = (aT - s.a) * 30 - s.w * 9; // wanted angular acceleration
  // Share it out between the engines still attached: a small box-constrained
  // least-squares solve (coordinate descent, warm-started from last tick's
  // throttles) that holds attitude first and lift second, so a ship that has
  // lost an engine leans on the others instead of flipping over. Lift on the
  // right end (r > 0) turns the hull anticlockwise: torque -f*r.
  const T = alpha * INERTIA;
  const f = [0, 0, 0, 0];
  let total = 0;
  let torque = 0;
  for (let i = 0; i < 4; i++) {
    if (!hasShipPart(s.parts, ShipPart.EngineA + i)) continue;
    f[i] = s.thrust[i] * ENGINE_MAX;
    total += f[i];
    torque -= f[i] * (ENGINE_X[i] - SHIP_W / 2);
  }
  // Torque is weighed per 10 cells of lever arm: attitude still comes first,
  // but the solve stays well conditioned with the pods far out on pylons.
  const wT = 0.01;
  for (let sweep = 0; sweep < 16; sweep++) {
    for (let i = 0; i < 4; i++) {
      if (!hasShipPart(s.parts, ShipPart.EngineA + i)) continue;
      const r = ENGINE_X[i] - SHIP_W / 2;
      // Residuals without this engine, then its best throttle against them.
      const eL = lift - (total - f[i]);
      const eT = T - (torque + f[i] * r);
      const v = Math.max(0, Math.min(ENGINE_MAX, (eL - wT * r * eT) / (1 + wT * r * r)));
      total += v - f[i];
      torque -= (v - f[i]) * r;
      f[i] = v;
    }
  }
  for (let i = 0; i < 4; i++) s.thrust[i] = hasShipPart(s.parts, ShipPart.EngineA + i) ? f[i] / ENGINE_MAX : 0;
  s.w += (torque / INERTIA) * dt;
  s.w *= 1 - Math.min(1, 0.8 * dt);
  s.a += s.w * dt;
  if (s.a > 1.4) s.a = 1.4;
  else if (s.a < -1.4) s.a = -1.4;
  s.vx += Math.sin(s.a) * total * dt;
  s.vy += (GRAVITY - Math.cos(s.a) * total) * dt;
  s.vx -= s.vx * DRAG * dt;
  s.vy -= s.vy * DRAG * 0.5 * dt;

  // Move in <=1 cell steps against terrain; a hard touch is a crash.
  let impact = 0;
  for (const axis of [0, 1]) {
    let rem = (axis === 0 ? s.vx : s.vy) * dt;
    while (rem !== 0) {
      const step = rem > 1 ? 1 : rem < -1 ? -1 : rem;
      const nx = axis === 0 ? s.x + step : s.x;
      const ny = axis === 1 ? s.y + step : s.y;
      if (collides(t, nx, ny)) {
        const v = axis === 0 ? s.vx : s.vy;
        impact = Math.max(impact, Math.abs(v));
        if (axis === 0) s.vx = 0;
        else s.vy = 0;
        break;
      }
      s.x = nx;
      s.y = ny;
      rem -= step;
    }
  }
  return impact;
}
