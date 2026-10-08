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
/** Fifteen times a clone's health. */
export const TANK_HP = 15 * ACTOR_MAX_HP;
/** Hits below this penetration energy only scratch the armour. */
export const TANK_INTEGRITY = 120;
export const MAX_TANKS = 4;
export const TANK_MAX_FUEL = 100;
const RUN = 64;
const GROUND_ACCEL = 420;
const AIR_ACCEL = 140;
export const TANK_STEP_UP = 6;
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
} as const;
export const TANK_PARTS = 4;
export const ALL_TANK_PARTS = (1 << TANK_PARTS) - 1;
export const TANK_PART_HP = [TANK_HP, 320, 220, 520];
export const TANK_PART_NAMES = ['hull', 'cannon', 'SMG', 'armour'];
/** Part centres, tank-local (facing right, from the top-left corner). */
export const TANK_PART_CENTER: readonly (readonly [number, number])[] = [
  [16, 12],
  [21, 3],
  [27, 11],
  [14, 6],
];

export const hasTankPart = (mask: number, part: number) => (mask & (1 << part)) !== 0;

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
  };
}

/** Which part is at tank-local (lx, ly) (from the top-left); missing parts expose the hull. */
export function tankPartAt(t: Tank, lx: number, ly: number): number {
  const fx = t.faceLeft ? TANK_W - lx : lx;
  let p: number = TankPart.Hull;
  // Matches the sprite (client/sprites.ts): cannon out of the dome front,
  // vulcan housing on the nose, the plate over the roof and the glacis.
  if (fx >= 17 && ly < 6 && hasTankPart(t.parts, TankPart.Cannon)) p = TankPart.Cannon;
  else if (fx >= 24 && ly >= 9 && ly <= 13 && hasTankPart(t.parts, TankPart.Smg)) p = TankPart.Smg;
  else if ((fx >= 25 || ly < 8) && hasTankPart(t.parts, TankPart.Armor)) p = TankPart.Armor;
  return p;
}

/** A tank-local point (facing right) in world cells, mirrored when facing left. */
export function tankPoint(t: { x: number; y: number; faceLeft: boolean }, lx: number, ly: number, out: { x: number; y: number }): { x: number; y: number } {
  out.x = t.x + (t.faceLeft ? TANK_W - lx : lx);
  out.y = t.y + ly;
  return out;
}

/** The cannon's actual firing angle for an aim: elevation clamped, always out the front. */
export function cannonAngle(faceLeft: boolean, aim: number): number {
  let e = -Math.atan2(Math.sin(aim), Math.abs(Math.cos(aim))); // elevation above horizontal
  e = Math.max(-CANNON_DOWN, Math.min(CANNON_UP, e));
  return faceLeft ? Math.PI + e : -e;
}

/** Muzzle of the cannon or the SMG (world), and the angle it fires at. */
export function tankMuzzle(t: { x: number; y: number; faceLeft: boolean }, cannon: boolean, aim: number, out: { x: number; y: number; a: number }): { x: number; y: number; a: number } {
  const [px, py] = cannon ? CANNON_PIVOT : SMG_PIVOT;
  const a = cannon ? cannonAngle(t.faceLeft, aim) : aim;
  const len = cannon ? CANNON_LEN : SMG_LEN;
  out.x = t.x + (t.faceLeft ? TANK_W - px : px) + Math.cos(a) * len;
  out.y = t.y + py + Math.sin(a) * len;
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
  if (dir !== 0 || k.onGround) {
    const accel = (k.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt;
    const dv = dir * RUN - k.vx;
    k.vx += dv > accel ? accel : dv < -accel ? -accel : dv;
  }
  k.jetting = false;
  if (driven & BTN_UP && k.fuel > 0) {
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

  // Horizontal sweep in <=1 cell steps; the treads climb small steps.
  let rem = k.vx * dt;
  while (rem !== 0) {
    const step = rem > 1 ? 1 : rem < -1 ? -1 : rem;
    const nx = k.x + step;
    if (!collides(t, nx, k.y)) k.x = nx;
    else {
      let climbed = false;
      if (k.onGround) {
        for (let s = 1; s <= TANK_STEP_UP; s++) {
          if (!collides(t, nx, k.y - s)) {
            k.x = nx;
            k.y -= s;
            climbed = true;
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
}
