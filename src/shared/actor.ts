import {
  ACTOR_AIR_ACCEL,
  ACTOR_FUEL_BURN,
  ACTOR_FUEL_REGEN,
  ACTOR_GROUND_ACCEL,
  ACTOR_H,
  ACTOR_JET_ACCEL,
  ACTOR_JUMP_SPEED,
  ACTOR_MAX_FALL,
  ACTOR_MAX_FUEL,
  ACTOR_MAX_RISE,
  ACTOR_RUN_SPEED,
  ACTOR_STEP_UP,
  ACTOR_W,
  GRAVITY,
} from './constants.ts';
import type { Terrain } from './terrain.ts';
import { CLASSES, ClassId } from './body.ts';

export const BTN_LEFT = 1;
export const BTN_RIGHT = 2;
export const BTN_UP = 4;
export const BTN_DOWN = 8;
export const BTN_FIRE = 16;
/** Hold to aim down the scope: the view pushes out along the barrel. */
export const BTN_SCOPE = 32;
export const BTN_RELOAD = 64;

/** The part of an actor that client-side prediction replays. */
export interface Body {
  x: number; // top-left, world cells
  y: number;
  vx: number;
  vy: number;
  fuel: number;
  onGround: boolean;
  jetting: boolean;
  /** Legs still attached (0..2): two run, one hobbles, none crawls. */
  legs: number;
  /** Jetpack still attached. */
  jet: boolean;
  /** Clone class (body.ts): scales run speed, jetpack thrust and fuel use. */
  cls: number;
}

export function newBody(x: number, y: number): Body {
  return { x, y, vx: 0, vy: 0, fuel: ACTOR_MAX_FUEL, onGround: false, jetting: false, legs: 2, jet: true, cls: ClassId.Medium };
}

export function copyBody(dst: Body, src: Body): void {
  dst.x = src.x;
  dst.y = src.y;
  dst.vx = src.vx;
  dst.vy = src.vy;
  dst.fuel = src.fuel;
  dst.onGround = src.onGround;
  dst.jetting = src.jetting;
  dst.legs = src.legs;
  dst.jet = src.jet;
  dst.cls = src.cls;
}

/** Run speed and jump strength by legs attached (0, 1, 2). */
const LEG_SPEED = [0.25, 0.55, 1];
const LEG_JUMP = [0, 0.7, 1];

function collides(t: Terrain, x: number, y: number): boolean {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  return t.rectSolid(ix, iy, ix + ACTOR_W - 1, iy + ACTOR_H - 1);
}

/**
 * Advance one body by one fixed tick. Shared verbatim by the authoritative
 * server and the client's predictor, so given the same terrain and inputs the
 * results are identical. Returns the downward impact speed if the body landed
 * this tick (for fall damage), else 0.
 */
export function stepBody(b: Body, buttons: number, t: Terrain, dt: number): number {
  // Unstick: terrain may have been deposited on top of us.
  if (collides(t, b.x, b.y)) {
    for (let s = 1; s <= 12; s++) {
      if (!collides(t, b.x, b.y - s)) {
        b.y -= s;
        break;
      }
    }
  }

  const cls = CLASSES[b.cls] ?? CLASSES[ClassId.Medium];
  const dir = (buttons & BTN_RIGHT ? 1 : 0) - (buttons & BTN_LEFT ? 1 : 0);
  if (dir !== 0 || b.onGround) {
    const accel = (b.onGround ? ACTOR_GROUND_ACCEL : ACTOR_AIR_ACCEL) * dt;
    const dv = dir * ACTOR_RUN_SPEED * LEG_SPEED[b.legs] * cls.run - b.vx;
    b.vx += dv > accel ? accel : dv < -accel ? -accel : dv;
  }

  b.jetting = false;
  if (buttons & BTN_UP) {
    if (b.onGround && b.legs > 0) {
      b.vy = -ACTOR_JUMP_SPEED * LEG_JUMP[b.legs];
      b.onGround = false;
    } else if (b.jet && b.fuel > 0) {
      b.vy -= ACTOR_JET_ACCEL * cls.jet * dt;
      b.fuel = Math.max(0, b.fuel - ACTOR_FUEL_BURN * cls.fuel * dt);
      b.jetting = true;
    }
  } else if (b.onGround) {
    b.fuel = Math.min(ACTOR_MAX_FUEL, b.fuel + ACTOR_FUEL_REGEN * dt);
  }

  b.vy += GRAVITY * dt;
  if (b.vy > ACTOR_MAX_FALL) b.vy = ACTOR_MAX_FALL;
  if (b.vy < -ACTOR_MAX_RISE) b.vy = -ACTOR_MAX_RISE;

  // Horizontal sweep in <=1 cell steps, auto-climbing small ledges.
  let rem = b.vx * dt;
  while (rem !== 0) {
    const step = rem > 1 ? 1 : rem < -1 ? -1 : rem;
    const nx = b.x + step;
    if (!collides(t, nx, b.y)) {
      b.x = nx;
    } else {
      let climbed = false;
      if (b.onGround && b.legs > 0) {
        for (let s = 1; s <= ACTOR_STEP_UP; s++) {
          if (!collides(t, nx, b.y - s)) {
            b.x = nx;
            b.y -= s;
            climbed = true;
            break;
          }
        }
      }
      if (!climbed) {
        b.vx = 0;
        break;
      }
    }
    rem -= step;
  }

  // Vertical sweep.
  let impact = 0;
  rem = b.vy * dt;
  while (rem !== 0) {
    const step = rem > 1 ? 1 : rem < -1 ? -1 : rem;
    if (!collides(t, b.x, b.y + step)) {
      b.y += step;
      rem -= step;
    } else {
      if (step > 0) impact = b.vy;
      b.vy = 0;
      break;
    }
  }
  if (b.y < -400) {
    b.y = -400;
    if (b.vy < 0) b.vy = 0;
  }
  b.onGround = collides(t, b.x, b.y + 1);
  return impact;
}
