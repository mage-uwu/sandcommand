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
import { FACTIONS } from './factions.ts';

export const BTN_LEFT = 1;
export const BTN_RIGHT = 2;
export const BTN_UP = 4;
export const BTN_DOWN = 8;
export const BTN_FIRE = 16;
/** Hold to aim down the scope: the view pushes out along the barrel. */
export const BTN_SCOPE = 32;
export const BTN_RELOAD = 64;

/**
 * Stance: hold down to crouch; keep holding on the ground to go prone.
 * The hitbox shrinks from the top (the feet stay put) and the torso pivots
 * forward at the hip; moving is slower the lower you are.
 */
export const Stance = { Stand: 0, Crouch: 1, Prone: 2 } as const;
/** Hitbox height per stance. */
export const STANCE_H = [ACTOR_H, 10, 6];
/** Torso lean per stance (radians, toward where the clone faces). */
export const STANCE_LEAN = [0, 0.6, 1.4];
/** How far the hip sinks per stance (cells). */
export const STANCE_DROP = [0, 2, 1];
const STANCE_RUN = [1, 0.5, 0.28];
/** Ticks of holding down (on the ground) before a crouch drops prone. */
export const PRONE_TICKS = 12;
/** Hip pivot (from the hitbox's top-left, standing) and hip-to-shoulder length. */
export const HIP_X = 4;
export const HIP_Y = 9;
const TORSO = 5;
/** Crouching on the jetpack angles the thrust this far off vertical (a dash), up to this speed. */
const DASH_ANGLE = 0.95;
const DASH_MAX = 250;

/** World position of the shoulder (where aim is measured and shots leave from) for a stance and facing. */
export function shoulderAt(x: number, y: number, stance: number, faceLeft: boolean, out: { x: number; y: number }): { x: number; y: number } {
  const lean = STANCE_LEAN[stance] ?? 0;
  out.x = x + HIP_X + Math.sin(lean) * TORSO * (faceLeft ? -1 : 1);
  out.y = y + HIP_Y + (STANCE_DROP[stance] ?? 0) - Math.cos(lean) * TORSO;
  return out;
}

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
  /** Faction (factions.ts): scales run speed, jetpack thrust and fuel use on top of the class. */
  faction: number;
  /** Stance (Stance.*), and how long down has been held. */
  stance: number;
  downTicks: number;
}

export function newBody(x: number, y: number): Body {
  return { x, y, vx: 0, vy: 0, fuel: ACTOR_MAX_FUEL, onGround: false, jetting: false, legs: 2, jet: true, cls: ClassId.Medium, faction: 0, stance: Stance.Stand, downTicks: 0 };
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
  dst.faction = src.faction;
  dst.stance = src.stance;
  dst.downTicks = src.downTicks;
}

/** Run speed and jump strength by legs attached (0, 1, 2). */
const LEG_SPEED = [0.25, 0.55, 1];
const LEG_JUMP = [0, 0.7, 1];

/** Does the hitbox at (x, y), `h` tall from the feet up, overlap terrain? */
function collides(t: Terrain, x: number, y: number, h = ACTOR_H): boolean {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  return t.rectSolid(ix, iy + ACTOR_H - h, ix + ACTOR_W - 1, iy + ACTOR_H - 1);
}

/**
 * Advance one body by one fixed tick. Shared verbatim by the authoritative
 * server and the client's predictor, so given the same terrain and inputs the
 * results are identical. Returns the downward impact speed if the body landed
 * this tick (for fall damage), else 0.
 */
export function stepBody(b: Body, buttons: number, t: Terrain, dt: number): number {
  // Stance: down crouches; held on the ground it goes prone. Standing back
  // up (or just rising a level) needs the headroom for it.
  const down = (buttons & BTN_DOWN) !== 0;
  b.downTicks = down ? Math.min(PRONE_TICKS, b.downTicks + 1) : 0;
  const want: number = !down ? Stance.Stand : b.onGround && b.downTicks >= PRONE_TICKS ? Stance.Prone : Stance.Crouch;
  if (want > b.stance) b.stance = want;
  else {
    while (b.stance > want && !collides(t, b.x, b.y, STANCE_H[b.stance - 1])) b.stance--;
    if (b.stance === Stance.Prone && !b.onGround && !collides(t, b.x, b.y, STANCE_H[Stance.Crouch])) b.stance = Stance.Crouch;
  }
  const h = STANCE_H[b.stance];

  // Unstick: terrain may have been deposited on top of us.
  if (collides(t, b.x, b.y, h)) {
    for (let s = 1; s <= 12; s++) {
      if (!collides(t, b.x, b.y - s, h)) {
        b.y -= s;
        break;
      }
    }
  }

  const base = CLASSES[b.cls] ?? CLASSES[ClassId.Medium];
  const fac = FACTIONS[b.faction] ?? FACTIONS[0];
  const cls = { run: base.run * fac.run, jet: base.jet * fac.jet, fuel: base.fuel * fac.fuel };
  const dir = (buttons & BTN_RIGHT ? 1 : 0) - (buttons & BTN_LEFT ? 1 : 0);
  // Crouched on a burning jetpack in the air: the thrust swings forward into a dash.
  const dashDir = dir !== 0 ? dir : Math.sign(b.vx);
  const dashing = down && !b.onGround && buttons & BTN_UP && b.jet && b.fuel > 0 && dashDir !== 0;
  if ((dir !== 0 || b.onGround) && !dashing) {
    const accel = (b.onGround ? ACTOR_GROUND_ACCEL : ACTOR_AIR_ACCEL) * dt;
    const dv = dir * ACTOR_RUN_SPEED * LEG_SPEED[b.legs] * cls.run * STANCE_RUN[b.stance] - b.vx;
    b.vx += dv > accel ? accel : dv < -accel ? -accel : dv;
  }

  b.jetting = false;
  if (buttons & BTN_UP) {
    if (b.onGround && b.legs > 0 && b.stance !== Stance.Prone) {
      b.vy = -ACTOR_JUMP_SPEED * LEG_JUMP[b.legs];
      b.onGround = false;
    } else if (b.jet && b.fuel > 0) {
      const thrust = ACTOR_JET_ACCEL * cls.jet * dt;
      if (dashing) {
        b.vx += Math.sin(DASH_ANGLE) * thrust * dashDir;
        b.vy -= Math.cos(DASH_ANGLE) * thrust;
        if (Math.abs(b.vx) > DASH_MAX) b.vx = Math.sign(b.vx) * DASH_MAX;
      } else b.vy -= thrust;
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
    if (!collides(t, nx, b.y, h)) {
      b.x = nx;
    } else {
      let climbed = false;
      if (b.onGround && b.legs > 0) {
        for (let s = 1; s <= ACTOR_STEP_UP; s++) {
          if (!collides(t, nx, b.y - s, h)) {
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
    if (!collides(t, b.x, b.y + step, h)) {
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
  b.onGround = collides(t, b.x, b.y + 1, h);
  return impact;
}
