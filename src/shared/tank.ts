import { BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP } from './actor.ts';
import { ACTOR_MAX_HP, GRAVITY } from './constants.ts';
import type { Terrain } from './terrain.ts';

/**
 * Tanks, Metal Slug style: a squat armoured box on treads with a turret
 * cannon, a vulcan SMG on the front and a pair of lift jets underneath.
 *
 * A tank arrives by air, swinging under a parachute; it lands empty and
 * whoever reaches it first climbs in (the pick-up key) and drives it
 * (A/D treads, W jets, fire the SMG, right mouse / Shift the cannon); the same key
 * climbs back out.
 *
 * It is built from parts that can be shot off: the cannon, the SMG, and an
 * external armour plate over the front and roof that soaks hits until it is
 * blown away. The hull holds fifteen clones' worth of punishment; when it
 * goes, the tank explodes and takes its driver with it.
 *
 * Unlike a drop rocket a tank never tips: it is an axis-aligned box whose
 * treads climb steps up to TANK_STEP_UP cells. `stepTank` is pure and shared:
 * the server runs it authoritatively and the driver's client replays it over
 * unacknowledged inputs to predict its own tank, as it does its clone.
 */
export const TANK_W = 32;
export const TANK_H = 22;
/** Seventy-five times a clone's health: a fortress on tracks. */
export const TANK_HP = 75 * ACTOR_MAX_HP;
/** Hits below this penetration energy only scratch the armour. */
export const TANK_INTEGRITY = 120;
export const MAX_TANKS = 4;
export const TANK_MAX_FUEL = 100;
const RUN = 80;
const GROUND_ACCEL = 640;
/** Steering in the air (coasting or on the jets). */
const AIR_ACCEL = 300;
/** The treads climb a step this tall for each cell they advance: steep hills and jagged ground, not sheer walls. */
export const TANK_STEP_UP = 14;
/** Rolling over a dip this deep (or less), the treads stay on the ground rather than hopping off it. */
const SNAP_DOWN = 10;
const JET_ACCEL = 1050; // vs GRAVITY 620: a slow, heavy climb
const FUEL_BURN = 32; // per second
const FUEL_REGEN = 22; // per second, on the ground
const MAX_FALL = 520;
const MAX_RISE = 150;
const CHUTE_FALL = 50; // descent speed under the parachute

export const TankPart = {
  Hull: 0,
  Cannon: 1,
  Smg: 2,
  Armor: 3,
  /** The steel cupola over the hatch: while it holds, the driver can't be touched. */
  Shield: 4,
} as const;
export const TANK_PARTS = 5;
export const ALL_TANK_PARTS = (1 << TANK_PARTS) - 1;
export const TANK_PART_HP = [TANK_HP, 1600, 1100, 2600, 1800];
export const TANK_PART_NAMES = ['hull', 'cannon', 'SMG', 'armour', 'shield'];
/** Part centres, tank-local (facing right, from the top-left corner). */
export const TANK_PART_CENTER: readonly (readonly [number, number])[] = [
  [16, 12],
  [21, 3],
  [27, 11],
  [14, 6],
  [13, -1],
];

export const hasTankPart = (mask: number, part: number) => (mask & (1 << part)) !== 0;

/** How high a driver's head sits out of the hatch (clone top, from the tank's top) once the shield is gone. */
export const EXPOSED_SEAT_Y = -8;
/** Rows of an exposed driver's body that stick out and can be hit (head and shoulders). */
export const EXPOSED_H = 6;

/** Turret pivot, cannon barrel length, and the cannon's elevation limits (radians above horizontal). */
export const CANNON_PIVOT = [15, 3] as const;
export const CANNON_LEN = 23;
export const CANNON_UP = 1.25;
export const CANNON_DOWN = 0.45;
/** The vulcan: pivot and barrel length. It swivels all the way round. */
export const SMG_PIVOT = [25, 11] as const;
export const SMG_LEN = 12;

/** Seconds between shots. */
export const SMG_INTERVAL = 60 / 720;
export const CANNON_INTERVAL = 60 / 40;
export const SMG_SPEED = 900;
export const SMG_SPREAD = 0.06;
export const CANNON_SPEED = 560;

export interface Tank {
  x: number; // top-left, world cells
  y: number;
  vx: number;
  vy: number;
  fuel: number;
  onGround: boolean;
  jetting: boolean;
  /** Still coming down under its parachute (nobody can board yet). */
  chute: boolean;
  hp: number; // hull
  parts: number; // attached-part mask
  partHp: Float32Array;
  /** Player id driving, or 255. */
  pilot: number;
  faceLeft: boolean;
  /** Turret aim, radians (screen axes). */
  aim: number;
  /** Seconds until each gun may fire again. */
  smgCd: number;
  cannonCd: number;
  /** Who damaged it last (credit for its destruction). */
  lastHitBy: number;
  /** Fired this tick (muzzle flashes on clients). */
  firedSmg: boolean;
  firedCannon: boolean;
  /** Hull tilt (radians, clockwise on screen: positive = right end lower) and its angular velocity. */
  a: number;
  w: number;
}

export function newTank(x: number, y: number): Tank {
  const partHp = new Float32Array(TANK_PARTS);
  for (let i = 0; i < TANK_PARTS; i++) partHp[i] = TANK_PART_HP[i];
  return {
    x,
    y,
    vx: 0,
    vy: CHUTE_FALL,
    fuel: TANK_MAX_FUEL,
    onGround: false,
    jetting: false,
    chute: true,
    hp: TANK_HP,
    parts: ALL_TANK_PARTS,
    partHp,
    pilot: 255,
    faceLeft: false,
    aim: 0,
    smgCd: 0,
    cannonCd: 0,
    lastHitBy: 255,
    firedSmg: false,
    firedCannon: false,
    a: 0,
    w: 0,
  };
}

/** Which part is at tank-local (lx, ly) (from the top-left); missing parts expose the hull. */
export function tankPartAt(t: { faceLeft: boolean; parts: number }, lx: number, ly: number): number {
  const fx = t.faceLeft ? TANK_W - lx : lx;
  let p: number = TankPart.Hull;
  // Matches the sprite (client/sprites.ts): cannon out of the dome front,
  // vulcan housing on the nose, the plate over the roof and the glacis.
  if (fx >= 9 && fx <= 18 && ly < 2 && hasTankPart(t.parts, TankPart.Shield)) p = TankPart.Shield;
  else if (fx >= 17 && ly < 6 && hasTankPart(t.parts, TankPart.Cannon)) p = TankPart.Cannon;
  else if (fx >= 24 && ly >= 9 && ly <= 13 && hasTankPart(t.parts, TankPart.Smg)) p = TankPart.Smg;
  else if ((fx >= 25 || ly < 8) && hasTankPart(t.parts, TankPart.Armor)) p = TankPart.Armor;
  return p;
}

type Posed = { x: number; y: number; faceLeft: boolean; a: number };

/** Inset of the tread contact points from the hull's ends (cells). */
const CONTACT = 3;

/**
 * How far the tilt pivot (the middle of the tread line) sits below the box:
 * the box rests on the higher end, the hull rotates down onto the lower one.
 */
export function tankSink(a: number): number {
  return (TANK_W / 2 - CONTACT) * Math.abs(Math.sin(a));
}

/**
 * A tank-local point (as drawn facing right, from the box's top-left) in
 * world cells: mirrored when facing left, then tilted with the hull about
 * the middle of its tread line.
 */
export function tankPoint(t: Posed, lx: number, ly: number, out: { x: number; y: number }): { x: number; y: number } {
  const dx = (t.faceLeft ? TANK_W - lx : lx) - TANK_W / 2;
  const dy = ly - TANK_H;
  const c = Math.cos(t.a);
  const s = Math.sin(t.a);
  out.x = t.x + TANK_W / 2 + dx * c - dy * s;
  out.y = t.y + TANK_H + tankSink(t.a) + dx * s + dy * c;
  return out;
}

/** World -> the tank's own (untilted, unmirrored) box coordinates: x along the box from its left end. */
export function tankLocal(t: Posed, wx: number, wy: number, out: { x: number; y: number }): { x: number; y: number } {
  const dx = wx - (t.x + TANK_W / 2);
  const dy = wy - (t.y + TANK_H + tankSink(t.a));
  const c = Math.cos(t.a);
  const s = Math.sin(t.a);
  out.x = TANK_W / 2 + dx * c + dy * s;
  out.y = TANK_H - dx * s + dy * c;
  return out;
}

/**
 * The cannon's actual firing angle (world) for an aim: elevation clamped
 * relative to the hull (so it tips with it), always out of the front.
 */
export function cannonAngle(faceLeft: boolean, aim: number, tilt = 0): number {
  const local = aim - tilt;
  let e = -Math.atan2(Math.sin(local), Math.abs(Math.cos(local))); // elevation above the hull's horizontal
  e = Math.max(-CANNON_DOWN, Math.min(CANNON_UP, e));
  return (faceLeft ? Math.PI + e : -e) + tilt;
}

const mzPt = { x: 0, y: 0 };
/** Muzzle of the cannon or the SMG (world), and the angle it fires at. */
export function tankMuzzle(t: Posed, cannon: boolean, aim: number, out: { x: number; y: number; a: number }): { x: number; y: number; a: number } {
  const [px, py] = cannon ? CANNON_PIVOT : SMG_PIVOT;
  const a = cannon ? cannonAngle(t.faceLeft, aim, t.a) : aim;
  const len = cannon ? CANNON_LEN : SMG_LEN;
  const p = tankPoint(t, px, py, mzPt);
  out.x = p.x + Math.cos(a) * len;
  out.y = p.y + Math.sin(a) * len;
  out.a = a;
  return out;
}

function collides(t: Terrain, x: number, y: number): boolean {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  return t.rectSolid(ix, iy, ix + TANK_W - 1, iy + TANK_H - 1);
}

/**
 * One tick of motion. `buttons` are the driver's (ignored when empty).
 * Returns the downward speed it hit the ground with this tick (crushes, and
 * the parachute coming off), else 0.
 */
/** First solid row in column x from y0 down, within `depth` (else y0 + depth). */
function groundAt(t: Terrain, x: number, y0: number, depth: number): number {
  const ix = Math.floor(x);
  for (let y = Math.floor(y0); y < y0 + depth; y++) if (t.isSolid(ix, y)) return y;
  return y0 + depth;
}

/** Steepest tilt the treads settle to. */
const MAX_TILT = 1.15;
/** Tread suspension: stiffness and damping of the hull's settling onto the ground; in the air it levels out (leaning a touch into its motion). */
const TILT_K = 80;
const TILT_D = 11;
const AIR_K = 14;
const AIR_D = 5;

export function stepTank(k: Tank, t: Terrain, dt: number, buttons: number): number {
  // Unstick: sand poured onto it, or it landed in a bunker's rubble.
  if (collides(t, k.x, k.y)) {
    for (let s = 1; s <= 16; s++) {
      if (!collides(t, k.x, k.y - s)) {
        k.y -= s;
        break;
      }
    }
  }
  const driven = k.pilot !== 255 && !k.chute ? buttons : 0;
  const dir = (driven & BTN_RIGHT ? 1 : 0) - (driven & BTN_LEFT ? 1 : 0);

  // Tread suspension: the hull settles onto the ground under its rear and
  // front treads (a damped spring, so it rocks a little); in the air it
  // drifts back level. Landings, recoil and blasts kick it (w).
  const sin0 = Math.sin(k.a);
  if (k.onGround) {
    const bottom = k.y + TANK_H;
    const gl = groundAt(t, k.x + CONTACT, bottom, 30);
    const gr = groundAt(t, k.x + TANK_W - CONTACT, bottom, 30);
    const target = Math.max(-MAX_TILT, Math.min(MAX_TILT, Math.atan2(gr - gl, TANK_W - 2 * CONTACT)));
    k.w += ((target - k.a) * TILT_K - k.w * TILT_D) * dt;
  } else {
    const lean = Math.max(-1, Math.min(1, k.vx / RUN)) * 0.12;
    k.w += ((lean - k.a) * AIR_K - k.w * AIR_D) * dt;
  }
  k.a += k.w * dt;
  if (k.a > 1.2) k.a = 1.2;
  else if (k.a < -1.2) k.a = -1.2;

  if (k.onGround) {
    const accel = GROUND_ACCEL * dt;
    // Uphill costs some speed, downhill gains a little (sin0 > 0: the right end is lower).
    const slope = Math.max(0.6, Math.min(1.25, 1 + 0.5 * sin0 * dir));
    const dv = dir * RUN * slope - k.vx;
    k.vx += dv > accel ? accel : dv < -accel ? -accel : dv;
  } else if (dir !== 0) {
    // In the air: steer with A/D (the jets' vectoring), up to a brisk drift.
    const accel = AIR_ACCEL * dt;
    const dv = dir * RUN * 1.1 - k.vx;
    k.vx += dv > accel ? accel : dv < -accel ? -accel : dv;
  } else k.vx *= 1 - Math.min(1, 0.8 * dt); // (coasting: air drag)
  // Left on a steep slope without throttle, it slides off.
  if (k.onGround && dir === 0 && Math.abs(k.a) > 0.7) k.vx += sin0 * GRAVITY * 0.5 * dt;
  k.jetting = false;
  if (driven & BTN_UP && k.fuel > 0) {
    // Lift jets push straight up, whatever the hull's tilt: steering is A/D's job.
    k.vy -= JET_ACCEL * dt;
    k.fuel = Math.max(0, k.fuel - FUEL_BURN * dt);
    k.jetting = true;
  } else if (k.onGround) k.fuel = Math.min(TANK_MAX_FUEL, k.fuel + FUEL_REGEN * dt);
  // Down: stand on the brakes in the air too (drop like the brick it is).
  if (driven & BTN_DOWN && !k.onGround) k.vy += GRAVITY * 0.6 * dt;
  k.vy += GRAVITY * dt;
  if (k.chute) {
    // Under the canopy: drag pulls the fall back to a gentle drift.
    k.vy = Math.min(k.vy, CHUTE_FALL);
    k.vx *= 1 - Math.min(1, 2 * dt);
  }
  if (k.vy > MAX_FALL) k.vy = MAX_FALL;
  if (k.vy < -MAX_RISE) k.vy = -MAX_RISE;

  // Horizontal sweep in <=1 cell steps. The treads climb whatever they can
  // get a grip on: any step up to TANK_STEP_UP per cell advanced (steep
  // hills, jagged rock, rubble), on the ground or just off it (a bump mid-climb).
  const gripping = k.onGround || collides(t, k.x, k.y + 3);
  const wasGround = k.onGround;
  let rem = k.vx * dt;
  while (rem !== 0) {
    const step = rem > 1 ? 1 : rem < -1 ? -1 : rem;
    const nx = k.x + step;
    if (!collides(t, nx, k.y)) k.x = nx;
    else {
      let climbed = false;
      if (gripping) {
        for (let s = 1; s <= TANK_STEP_UP; s++) {
          if (!collides(t, nx, k.y - s)) {
            k.x = nx;
            k.y -= s;
            climbed = true;
            // A big step is hard work: it costs some speed.
            if (s > 6) k.vx *= 0.94;
            break;
          }
        }
      }
      if (!climbed) {
        k.vx = 0;
        break;
      }
    }
    rem -= step;
  }
  // Rolling over a dip: the treads follow the ground down instead of hopping off it.
  if (wasGround && !k.jetting && k.vy >= 0 && !collides(t, k.x, k.y + 1)) {
    for (let s = 2; s <= SNAP_DOWN; s++) {
      if (collides(t, k.x, k.y + s)) {
        k.y += s - 1;
        break;
      }
    }
  }
  let impact = 0;
  rem = k.vy * dt;
  while (rem !== 0) {
    const step = rem > 1 ? 1 : rem < -1 ? -1 : rem;
    if (!collides(t, k.x, k.y + step)) {
      k.y += step;
      rem -= step;
    } else {
      if (step > 0) impact = k.vy;
      k.vy = 0;
      break;
    }
  }
  if (k.y < -400) {
    k.y = -400;
    if (k.vy < 0) k.vy = 0;
  }
  k.onGround = collides(t, k.x, k.y + 1);
  if (k.onGround && k.chute) k.chute = false; // touchdown: the canopy is cut away
  return impact;
}

/** Copy every field stepTank reads or writes (prediction rebasing). */
export function copyTankMotion(dst: Tank, src: Tank): void {
  dst.x = src.x;
  dst.y = src.y;
  dst.vx = src.vx;
  dst.vy = src.vy;
  dst.fuel = src.fuel;
  dst.onGround = src.onGround;
  dst.jetting = src.jetting;
  dst.chute = src.chute;
  dst.pilot = src.pilot;
  dst.parts = src.parts;
  dst.a = src.a;
  dst.w = src.w;
}
