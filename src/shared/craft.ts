import { BTN_DOWN, BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP } from './actor.ts';
import { GRAVITY, WORLD_H, WORLD_W, WORDS_PER_ROW } from './constants.ts';
import type { Terrain } from './terrain.ts';

/**
 * Drop rockets, Cortex Command style. Every clone arrives in one.
 *
 * A rocket is a rigid body: position, velocity, angle and spin, pushed by
 * gravity, its main engine (along the nose) and attitude torque, and
 * colliding with terrain through impulses at points around its hull, so it
 * can land on its fins, tip over, cartwheel down a slope or nose-dive.
 *
 * Whoever rides in it flies it (left/right rotate, up burns, down cuts the
 * engine, a fresh press of fire bails out). With no stick input a
 * fly-by-wire autopilot takes over: it falls in, fires a late retro burn,
 * hovers, drops its passenger and leaves.
 *
 * It is built from parts that can be shot off: losing the engine kills
 * thrust, losing fins costs steering and unbalances it, losing the nose
 * cone exposes the hull. The hull going is the end.
 *
 * `stepCraft` is pure and shared: the server runs it authoritatively and the
 * passenger's client replays it over unacknowledged inputs to predict its
 * own rocket, exactly as it predicts its own clone.
 */
export const CRAFT_W = 12;
export const CRAFT_H = 26;
export const CRAFT_HP = 140;
/** Hits below this penetration energy only scratch a part. */
export const CRAFT_INTEGRITY = 100;
export const MAX_CRAFTS = 64;
export const THRUST_MAX = 2.4 * GRAVITY; // cells/s^2 at full burn
/** Rotational inertia per unit mass of a W x H plate (cells^2). */
export const CRAFT_INERTIA = (CRAFT_W * CRAFT_W + CRAFT_H * CRAFT_H) / 12;
const BRAKE = 0.6 * (THRUST_MAX - GRAVITY); // planned retro-burn deceleration
const FALL_SPEED = 240; // terminal descent speed before the burn
const HOVER = 3; // cells of clearance when dropping off
/** Touching terrain faster than this destroys the rocket outright. */
export const CRASH_SPEED = 190;
/** Impacts above this damage the part that hit. */
export const IMPACT_HARM_SPEED = 55;
const DROP_TICKS = 24; // ticks spent hovering at the drop point
export const DROP_RELEASE_TICK = 8; // passenger leaves on this tick of the hover
const STEER = 10; // rad/s^2 of attitude torque with everything attached
const MAX_TILT = 0.6; // autopilot lean limit (rad)
const SCUTTLE_TICKS = 30 * 15; // an empty rocket stuck this long blows itself up
const RESTITUTION = 0.15;
const AIR_DRAG = 0.009; // per cell/s of speed
const FRICTION = 0.6;

export const CraftPhase = {
  Descend: 0,
  Drop: 1,
  Ascend: 2,
} as const;

export const CraftPart = {
  Hull: 0,
  Nose: 1,
  FinL: 2,
  FinR: 3,
  Engine: 4,
} as const;
export const CRAFT_PARTS = 5;
export const ALL_CRAFT_PARTS = (1 << CRAFT_PARTS) - 1;
export const CRAFT_PART_HP = [CRAFT_HP, 45, 30, 30, 50];
/** Part centres in body-local cells (u right, v toward the nozzle). */
export const CRAFT_PART_CENTER: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, -9],
  [-5, 8],
  [5, 8],
  [0, 11],
];

export const hasCraftPart = (mask: number, part: number) => (mask & (1 << part)) !== 0;

/** Which part is at body-local (u, v); missing parts expose the hull. */
export function craftPartAt(mask: number, u: number, v: number): number {
  let p: number = CraftPart.Hull;
  if (v < -5) p = CraftPart.Nose;
  else if (v >= 10 && u >= -3 && u <= 3) p = CraftPart.Engine;
  else if (v >= 5 && u < -3) p = CraftPart.FinL;
  else if (v >= 5 && u > 3) p = CraftPart.FinR;
  return hasCraftPart(mask, p) ? p : CraftPart.Hull;
}

export interface Craft {
  x: number; // centre of mass
  y: number;
  vx: number;
  vy: number;
  a: number; // radians, 0 = nose up, positive = clockwise on screen
  w: number; // angular velocity, rad/s
  thrust: number; // 0..1, drives exhaust particles and the air jet
  hp: number; // hull
  parts: number; // attached-part mask
  partHp: Float32Array;
  phase: number;
  passenger: number; // player id aboard, or 255
  /** Player this rocket delivered (never crushed by it), or 255. */
  delivered: number;
  timer: number;
  targetX: number;
  /** Who damaged it last (credit for its destruction). */
  lastHitBy: number;
  /** Pilot buttons last tick (bailing out needs a fresh press). */
  prevButtons: number;
}

export function newCraft(x: number, passenger: number): Craft {
  const partHp = new Float32Array(CRAFT_PARTS);
  for (let i = 0; i < CRAFT_PARTS; i++) partHp[i] = CRAFT_PART_HP[i];
  return {
    x,
    y: -CRAFT_H - 30,
    vx: 0,
    vy: 160,
    a: 0,
    w: 0,
    thrust: 0,
    hp: CRAFT_HP,
    parts: ALL_CRAFT_PARTS,
    partHp,
    phase: CraftPhase.Descend,
    passenger,
    delivered: 255,
    timer: 0,
    targetX: x,
    lastHitBy: 255,
    prevButtons: 0,
  };
}

/** Body-local (u, v) -> world. */
export function craftToWorld(c: Craft, u: number, v: number, out: { x: number; y: number }): { x: number; y: number } {
  const cos = Math.cos(c.a);
  const sin = Math.sin(c.a);
  out.x = c.x + u * cos - v * sin;
  out.y = c.y + u * sin + v * cos;
  return out;
}

/** World -> body-local (u, v). */
export function craftToLocal(c: Craft, wx: number, wy: number, out: { x: number; y: number }): { x: number; y: number } {
  const cos = Math.cos(c.a);
  const sin = Math.sin(c.a);
  const dx = wx - c.x;
  const dy = wy - c.y;
  out.x = dx * cos + dy * sin;
  out.y = -dx * sin + dy * cos;
  return out;
}

/** Half extents of the rotated hull's axis-aligned bounding box. */
export function craftHalfExtents(a: number, out: { x: number; y: number }): { x: number; y: number } {
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  out.x = (CRAFT_W / 2) * cos + (CRAFT_H / 2) * sin;
  out.y = (CRAFT_W / 2) * sin + (CRAFT_H / 2) * cos;
  return out;
}

/** First solid row under a CRAFT_W footprint starting at column x, scanning down from `y0` (bitplane words). */
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

/**
 * Contact points around the hull outline (body-local) for a set of attached
 * parts: shoot the fins off and it rests on its hull corners instead.
 */
const contactCache: Float64Array[] = [];
function contactPoints(mask: number): Float64Array {
  let pts = contactCache[mask];
  if (pts) return pts;
  const list: number[] = [];
  const add = (u: number, v: number) => list.push(u, v);
  if (hasCraftPart(mask, CraftPart.Nose)) {
    add(0, -12.5);
    add(-3, -8);
    add(3, -8);
  } else {
    add(-5, -5.5);
    add(5, -5.5);
  }
  add(-5.5, -2);
  add(5.5, -2);
  add(-5.5, 4);
  add(5.5, 4);
  if (hasCraftPart(mask, CraftPart.FinL)) add(-6, 12.5);
  else add(-5, 9);
  if (hasCraftPart(mask, CraftPart.FinR)) add(6, 12.5);
  else add(5, 9);
  if (hasCraftPart(mask, CraftPart.Engine)) {
    add(-2, 12.5);
    add(2, 12.5);
  } else {
    add(-3, 9.5);
    add(3, 9.5);
  }
  pts = contactCache[mask] = Float64Array.from(list);
  return pts;
}

/** Is any hull point resting on terrain (within a cell below it)? */
function touching(c: Craft, t: Terrain, cos: number, sin: number): boolean {
  const pts = contactPoints(c.parts);
  for (let k = 0; k < pts.length; k += 2) {
    const rx = pts[k] * cos - pts[k + 1] * sin;
    const ry = pts[k] * sin + pts[k + 1] * cos;
    if (t.isSolid(Math.floor(c.x + rx), Math.floor(c.y + ry + 1))) return true;
  }
  return false;
}

export interface CraftStep {
  crashed: boolean;
  release: boolean; // drop the passenger this tick
  gone: boolean; // left the world through the top
  /** Hardest terrain impact this tick (normal speed) and where it hit, body-local. */
  impact: number;
  impactU: number;
  impactV: number;
}

export function newCraftStep(): CraftStep {
  return { crashed: false, release: false, gone: false, impact: 0, impactU: 0, impactV: 0 };
}

const nrm = { x: 0, y: 0 };
/** Per-substep contact scratch: rx, ry, nx, ny, u, v per point. */
const contacts = new Float64Array(6 * 16);
const accN = new Float64Array(16);
const accT = new Float64Array(16);
const bounce = new Float64Array(16);

/**
 * One tick of flight. `buttons` are the passenger's inputs this tick (ignored
 * when empty). Velocity changes already applied from outside (particle
 * impacts, blasts, bullets) carry straight into the integration.
 */
export function stepCraft(c: Craft, t: Terrain, dt: number, out: CraftStep, buttons: number): CraftStep {
  out.crashed = out.release = out.gone = false;
  out.impact = out.impactU = out.impactV = 0;
  const engine = hasCraftPart(c.parts, CraftPart.Engine);
  const finL = hasCraftPart(c.parts, CraftPart.FinL);
  const finR = hasCraftPart(c.parts, CraftPart.FinR);
  const fins = (finL ? 1 : 0) + (finR ? 1 : 0);
  let cos = Math.cos(c.a);
  let sin = Math.sin(c.a);
  const piloted = c.passenger !== 255;
  const pressed = piloted ? buttons : 0;
  const stick = pressed & (BTN_UP | BTN_DOWN | BTN_LEFT | BTN_RIGHT);
  if (piloted && pressed & BTN_FIRE && !(c.prevButtons & BTN_FIRE)) {
    // Bail out; the empty rocket heads home.
    out.release = true;
    c.phase = CraftPhase.Ascend;
  }
  c.prevButtons = pressed;

  // Clearance under the rotated hull.
  const bottom = c.y + (CRAFT_H / 2) * Math.abs(cos) + (CRAFT_W / 2) * Math.abs(sin);
  const h = groundBelow(t, c.x - CRAFT_W / 2, Math.max(0, bottom)) - bottom;

  const grounded = touching(c, t, cos, sin);
  // Autopilot vertical profile.
  let targetVy: number;
  if (c.phase === CraftPhase.Descend && grounded && Math.abs(c.a) > 0.8) {
    // Tipped over with someone aboard: open the hatch after a moment.
    targetVy = 0;
    if (++c.timer > 60 && piloted) {
      out.release = true;
      c.phase = CraftPhase.Ascend;
      c.timer = 0;
    }
  } else if (c.phase === CraftPhase.Descend) {
    c.timer = 0;
    // Fall fast, then a late retro burn: the speed from which a burn at
    // BRAKE deceleration stops exactly at hover height.
    targetVy = Math.max(18, Math.min(FALL_SPEED, Math.sqrt(2 * BRAKE * Math.max(0, h - HOVER))));
    if (!stick && h <= HOVER + 1 && Math.abs(c.vy) < 30 && Math.abs(c.a) < 0.3) {
      c.phase = CraftPhase.Drop;
      c.timer = 0;
    }
  } else if (c.phase === CraftPhase.Drop) {
    targetVy = (h - HOVER) * 2;
    if (++c.timer === DROP_RELEASE_TICK && piloted) out.release = true;
    if (c.timer >= DROP_TICKS) c.phase = CraftPhase.Ascend;
  } else {
    targetVy = -260;
    // An empty rocket that can't get home (lying wrecked on its side)
    // eventually scuttles itself rather than litter the sky forever.
    if (++c.timer > SCUTTLE_TICKS) out.crashed = true;
  }

  // Throttle: hold the profile through whatever tilt we have, unless the
  // pilot is burning (up) or has cut the engine (down).
  // The autopilot never burns far off vertical (no rocket sleds): it rights
  // the hull first.
  const upright = Math.max(0, Math.min(1, (cos - 0.5) * 2.5));
  // On the braking curve the target itself decelerates at BRAKE: feed that
  // forward so the burn tracks the curve instead of lagging into the ground.
  const ff = c.phase === CraftPhase.Descend && targetVy > 18 && targetVy < FALL_SPEED && c.vy > 0 ? BRAKE : 0;
  let thrust = Math.max(0, Math.min(THRUST_MAX, (GRAVITY + ff - (targetVy - c.vy) * 8) / Math.max(0.5, cos))) * upright;
  if (pressed & BTN_UP) thrust = THRUST_MAX;
  else if (pressed & BTN_DOWN) thrust = 0;
  if (!engine) thrust = 0;
  c.thrust = thrust / THRUST_MAX;

  // Attitude: fins give most of the authority, a small core of RCS remains.
  const auth = STEER * (0.3 + 0.35 * fins);
  let alpha: number;
  if (pressed & (BTN_LEFT | BTN_RIGHT)) {
    alpha = ((pressed & BTN_RIGHT ? 1 : 0) - (pressed & BTN_LEFT ? 1 : 0)) * auth;
    c.targetX = c.x; // hold here once the pilot lets go
  } else if (grounded) {
    // Resting on the ground: nothing to steer against.
    alpha = 0;
  } else {
    // Lean toward where we want to go (thrust then carries us there).
    const vxT = Math.max(-80, Math.min(80, (c.targetX - c.x) * 0.8));
    const aT = c.phase === CraftPhase.Ascend ? 0 : Math.max(-MAX_TILT, Math.min(MAX_TILT, (vxT - c.vx) * 0.006));
    alpha = Math.max(-auth, Math.min(auth, (aT - c.a) * 30 - c.w * 9));
  }
  // One fin gone: lopsided drag twists it under power.
  if (fins === 1) alpha += (finL ? 1 : -1) * 8 * (0.3 + c.thrust);
  c.w += alpha * dt;
  c.w *= Math.max(0, 1 - (0.6 + 0.5 * fins) * dt);
  c.vx += sin * thrust * dt;
  c.vy += (GRAVITY - cos * thrust) * dt;
  // Quadratic air drag: terminal speed ~260 falling, ~300 under full burn.
  const drag = Math.min(0.5, AIR_DRAG * Math.sqrt(c.vx * c.vx + c.vy * c.vy) * dt);
  c.vx -= c.vx * drag;
  c.vy -= c.vy * drag;

  // Integrate in substeps so nothing tunnels, resolving terrain contacts.
  const pts = contactPoints(c.parts);
  const speed = Math.abs(c.vx) + Math.abs(c.vy) + Math.abs(c.w) * CRAFT_H * 0.5;
  const n = Math.max(1, Math.min(16, Math.ceil((speed * dt) / 1.5)));
  const sdt = dt / n;
  for (let s = 0; s < n; s++) {
    c.x += c.vx * sdt;
    c.y += c.vy * sdt;
    c.a += c.w * sdt;
    cos = Math.cos(c.a);
    sin = Math.sin(c.a);
    // Gather the hull points that are in terrain this substep.
    let nc = 0;
    for (let k = 0; k < pts.length; k += 2) {
      const u = pts[k];
      const v = pts[k + 1];
      const rx = u * cos - v * sin;
      const ry = u * sin + v * cos;
      const ix = Math.floor(c.x + rx);
      const iy = Math.floor(c.y + ry);
      if (!t.isSolid(ix, iy)) continue;
      if (!t.normalAt(ix, iy, nrm)) {
        // Buried: push back toward the centre.
        const d = Math.sqrt(rx * rx + ry * ry) + 1e-9;
        nrm.x = -rx / d;
        nrm.y = -ry / d;
      }
      const o = nc++ * 6;
      contacts[o] = rx;
      contacts[o + 1] = ry;
      contacts[o + 2] = nrm.x;
      contacts[o + 3] = nrm.y;
      contacts[o + 4] = u;
      contacts[o + 5] = v;
    }
    if (nc === 0) continue;
    // Velocity: sequential impulses with accumulated, clamped totals per
    // contact (so an early overshoot can be taken back). Only a real impact
    // bounces; resting contacts just stop.
    for (let q = 0; q < nc; q++) {
      const o = q * 6;
      const vn = (c.vx - c.w * contacts[o + 1]) * contacts[o + 2] + (c.vy + c.w * contacts[o]) * contacts[o + 3];
      bounce[q] = vn < -40 ? -RESTITUTION * vn : 0;
      accN[q] = accT[q] = 0;
      if (-vn > out.impact) {
        out.impact = -vn;
        out.impactU = contacts[o + 4];
        out.impactV = contacts[o + 5];
      }
    }
    for (let iter = 0; iter < 8; iter++) {
      for (let q = 0; q < nc; q++) {
        const o = q * 6;
        const rx = contacts[o];
        const ry = contacts[o + 1];
        const nx = contacts[o + 2];
        const ny = contacts[o + 3];
        // Velocity of the contact point (v + w x r).
        let vpx = c.vx - c.w * ry;
        let vpy = c.vy + c.w * rx;
        const vn = vpx * nx + vpy * ny;
        const rn = rx * ny - ry * nx;
        const nNew = Math.max(0, accN[q] + (bounce[q] - vn) / (1 + (rn * rn) / CRAFT_INERTIA));
        let jn = nNew - accN[q];
        accN[q] = nNew;
        c.vx += jn * nx;
        c.vy += jn * ny;
        c.w += (rx * jn * ny - ry * jn * nx) / CRAFT_INERTIA;
        // Friction along the surface, bounded by the normal impulse so far.
        const tx = -ny;
        const ty = nx;
        vpx = c.vx - c.w * ry;
        vpy = c.vy + c.w * rx;
        const vt = vpx * tx + vpy * ty;
        const rt = rx * ty - ry * tx;
        const lim = FRICTION * accN[q];
        const tNew = Math.max(-lim, Math.min(lim, accT[q] - vt / (1 + (rt * rt) / CRAFT_INERTIA)));
        jn = tNew - accT[q];
        accT[q] = tNew;
        c.vx += jn * tx;
        c.vy += jn * ty;
        c.w += (rx * jn * ty - ry * jn * tx) / CRAFT_INERTIA;
      }
    }
    // Position: lift each point out along its normal by its measured depth.
    for (let q = 0; q < nc; q++) {
      const o = q * 6;
      const rx = contacts[o];
      const ry = contacts[o + 1];
      const nx = contacts[o + 2];
      const ny = contacts[o + 3];
      const solidAt = (d: number) => t.isSolid(Math.floor(c.x + rx + nx * d), Math.floor(c.y + ry + ny * d));
      let hi = 0.25;
      while (hi < 4 && solidAt(hi)) hi += 0.25;
      // Bisect to the actual surface, so resting contact doesn't hop.
      let lo = hi - 0.25;
      for (let b = 0; b < 5; b++) {
        const mid = (lo + hi) / 2;
        if (solidAt(mid)) lo = mid;
        else hi = mid;
      }
      c.x += nx * hi;
      c.y += ny * hi;
    }
  }
  if (c.a > Math.PI) c.a -= Math.PI * 2;
  else if (c.a < -Math.PI) c.a += Math.PI * 2;
  if (out.impact > CRASH_SPEED) out.crashed = true;
  if (c.y < -CRAFT_H - 60 && c.phase === CraftPhase.Ascend) out.gone = true;
  return out;
}

/** Copy every field stepCraft reads or writes (prediction rebasing). */
export function copyCraft(dst: Craft, src: Craft): void {
  dst.x = src.x;
  dst.y = src.y;
  dst.vx = src.vx;
  dst.vy = src.vy;
  dst.a = src.a;
  dst.w = src.w;
  dst.thrust = src.thrust;
  dst.hp = src.hp;
  dst.parts = src.parts;
  dst.partHp.set(src.partHp);
  dst.phase = src.phase;
  dst.passenger = src.passenger;
  dst.delivered = src.delivered;
  dst.timer = src.timer;
  dst.targetX = src.targetX;
  dst.lastHitBy = src.lastHitBy;
  dst.prevButtons = src.prevButtons;
}
