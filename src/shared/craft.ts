import { GRAVITY, WORLD_H, WORLD_W, WORDS_PER_ROW } from './constants.ts';
import type { Terrain } from './terrain.ts';

/**
 * Drop rockets, Cortex Command style. Every clone arrives in one: it falls in
 * from above the sky line, fires its retro thruster to brake, hovers just off
 * the ground, drops its passenger, then burns back up and leaves. The
 * autopilot is a deterministic controller on the server; rockets are physical
 * bodies that particles hit, blasts shove and weapons destroy.
 */
export const CRAFT_W = 12;
export const CRAFT_H = 26;
export const CRAFT_HP = 140;
/** Hits below this penetration energy only scratch the hull. */
export const CRAFT_INTEGRITY = 100;
export const MAX_CRAFTS = 64;
const THRUST_MAX = 2.4 * GRAVITY; // cells/s^2 at full burn
const BRAKE = 0.6 * (THRUST_MAX - GRAVITY); // planned retro-burn deceleration
const FALL_SPEED = 240; // terminal descent speed before the burn
const HOVER = 3; // cells of clearance when dropping off
const CRASH_SPEED = 170; // touching ground faster than this destroys the rocket
const DROP_TICKS = 24; // ticks spent hovering at the drop point
export const DROP_RELEASE_TICK = 8; // passenger leaves on this tick of the hover

export const CraftPhase = {
  Descend: 0,
  Drop: 1,
  Ascend: 2,
} as const;

export interface Craft {
  x: number; // top-left
  y: number;
  vx: number;
  vy: number;
  thrust: number; // 0..1, drives exhaust particles and the air jet
  hp: number;
  phase: number;
  passenger: number; // player id aboard, or 255
  /** Player this rocket delivered (never crushed by it), or 255. */
  delivered: number;
  timer: number;
  targetX: number;
  /** Who damaged it last (credit for its destruction). */
  lastHitBy: number;
}

export function newCraft(x: number, passenger: number): Craft {
  return {
    x,
    y: -CRAFT_H - 30,
    vx: 0,
    vy: 160,
    thrust: 0,
    hp: CRAFT_HP,
    phase: CraftPhase.Descend,
    passenger,
    delivered: 255,
    timer: 0,
    targetX: x,
    lastHitBy: 255,
  };
}

function boxSolid(t: Terrain, x: number, y: number): boolean {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  return t.rectSolid(ix, iy, ix + CRAFT_W - 1, iy + CRAFT_H - 1);
}

/** First solid row under the craft's footprint, scanning down from `y0` (bitplane words). */
export function groundBelow(t: Terrain, x: number, y0: number): number {
  const x0 = Math.max(0, Math.floor(x));
  const x1 = Math.min(WORLD_W - 1, x0 + CRAFT_W - 1);
  const w0 = x0 >>> 5;
  const w1 = x1 >>> 5;
  const lo = -1 << (x0 & 31);
  const hi = -1 >>> (31 - (x1 & 31));
  for (let y = Math.max(0, Math.floor(y0)); y < WORLD_H; y++) {
    const row = y * WORDS_PER_ROW;
    if (w0 === w1) {
      if (t.solid[row + w0] & lo & hi) return y;
    } else if (t.solid[row + w0] & lo || t.solid[row + w1] & hi) return y;
  }
  return WORLD_H;
}

export interface CraftStep {
  crashed: boolean;
  release: boolean; // drop the passenger this tick
  gone: boolean; // left the world through the top
}

/**
 * One tick of flight: autopilot sets the thrust, then gravity, thrust and the
 * external velocity changes already applied (particle impacts, blast wind)
 * move the body through the terrain with a swept box test.
 */
export function stepCraft(c: Craft, t: Terrain, dt: number, out: CraftStep): CraftStep {
  out.crashed = out.release = out.gone = false;
  const bottom = c.y + CRAFT_H;
  const h = groundBelow(t, c.x, Math.max(0, bottom)) - bottom; // clearance
  // Autopilot: pick a target vertical speed, then the thrust that gets there.
  let targetVy: number;
  if (c.phase === CraftPhase.Descend) {
    // Fall fast, then a late retro burn: the speed from which a burn at
    // BRAKE deceleration stops exactly at hover height.
    targetVy = Math.max(18, Math.min(FALL_SPEED, Math.sqrt(2 * BRAKE * Math.max(0, h - HOVER))));
    if (h <= HOVER + 1 && Math.abs(c.vy) < 30) {
      c.phase = CraftPhase.Drop;
      c.timer = 0;
    }
  } else if (c.phase === CraftPhase.Drop) {
    targetVy = (h - HOVER) * 2;
    if (++c.timer === DROP_RELEASE_TICK) out.release = true;
    if (c.timer >= DROP_TICKS) c.phase = CraftPhase.Ascend;
  } else {
    targetVy = -260;
  }
  const want = (targetVy - c.vy) * 5; // desired acceleration (cells/s^2, +down)
  const thrust = Math.max(0, Math.min(THRUST_MAX, GRAVITY - want));
  c.thrust = thrust / THRUST_MAX;
  c.vy += (GRAVITY - thrust) * dt;
  // Hold station over the drop point.
  c.vx += ((c.targetX - c.x) * 0.8 - c.vx) * 0.08;

  // Swept move in <= 1 cell steps.
  let rem = c.vx * dt;
  while (rem !== 0) {
    const s = rem > 1 ? 1 : rem < -1 ? -1 : rem;
    if (boxSolid(t, c.x + s, c.y)) {
      c.vx = 0;
      break;
    }
    c.x += s;
    rem -= s;
  }
  rem = c.vy * dt;
  while (rem !== 0) {
    const s = rem > 1 ? 1 : rem < -1 ? -1 : rem;
    if (boxSolid(t, c.x, c.y + s)) {
      if (s > 0 && c.vy > CRASH_SPEED) out.crashed = true;
      c.vy = 0;
      break;
    }
    c.y += s;
    rem -= s;
  }
  if (c.y < -CRAFT_H - 60 && c.phase === CraftPhase.Ascend) out.gone = true;
  return out;
}
