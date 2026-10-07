import { DT, GRAVITY, WORLD_H } from './constants.ts';
import { type Collider, FH, FIELD_SHIFT, FW, contact, newHit } from './field.ts';
import { MAT_LOOSE, Mat } from './materials.ts';
import type { Rng } from './rng.ts';
import type { Terrain } from './terrain.ts';

/**
 * Continuous granular material: explosion debris, collapsing sand and spilled
 * gold are all grains with float positions and velocities. Each tick costs
 * O(N) in live grains plus O(cells they occupy), with no per-cell automaton
 * and no pairwise interactions:
 *
 *   1. integrate     gravity + drag over contiguous Float32Arrays
 *   2. grain fields  grains splat count and momentum into a coarse grid;
 *                    crowded grains blend toward the local mean velocity
 *                    (PIC) and are pushed down the density gradient (pressure
 *                    without neighbour search)
 *   3. sweep         swept collision through the terrain distance field, then
 *                    restitution + Coulomb friction against the surface normal
 *   4. settle        a grain resting on support for a few ticks becomes a
 *                    terrain cell again (server deposits it; clients drop their
 *                    mirrored copy and wait for the authoritative pixel op)
 */
export const GRAIN_E = 0.12; // restitution
export const GRAIN_MU = 0.65; // Coulomb friction: repose angle ~ atan(mu * (1 + e)) ~ 36 deg
const SETTLE_SPEED = 2.2 * GRAVITY * DT; // cells/s, ~2 ticks of gravity
const SETTLE_TICKS = 2;
const CROWD_SETTLE = 3;
const STACK_SCAN = 8;
const PROJECT_STEPS = 32; // cells to look up for a free spot when the resting cell was just filled
const CROWD = 6; // grains per field cell before pressure kicks in
const PRESSURE = 14; // velocity per tick per unit density difference
const MAX_SPEED = 700;
const PUSH_MAX = GRAVITY * DT * 1.2; // per-tick cap on pressure push
const PIC_MIN = 3; // grains in a field cell before they share momentum
const PIC_BLEND = 0.5; // fraction of the way to the cell's mean velocity per tick

const density = new Uint16Array(FW * FH);
const momX = new Float32Array(FW * FH);
const momY = new Float32Array(FW * FH);
const touched: number[] = [];
const hit = newHit();
const vel = { x: 0.5, y: 0.5 }; // doubles from the start: no boxing
const free = { x: 0, y: 0 };

/**
 * Project a grain that has come to rest at (cx, cy) onto a terrain cell where
 * it can stay: the first free cell at or just above it (dense flows overlap,
 * so a neighbour may have just taken this one), then, for loose material,
 * down open diagonals until the 45-degree stability rule holds. A bounded
 * walk run once per grain when it settles, never a per-tick grid update.
 */
const STUCK = 0;
const SETTLED = 1;
const PARTIAL = 2;

function projectRest(t: Terrain, cx: number, cy: number, loose: boolean, out: { x: number; y: number }): number {
  let y = cy;
  while (t.isSolid(cx, y)) if (--y < cy - STACK_SCAN) return STUCK;
  let x = cx;
  for (let step = 0; step < PROJECT_STEPS; step++) {
    if (!t.isSolid(x, y + 1)) {
      y++; // drop onto support
      continue;
    }
    if (!loose || t.looseStableAt(x, y)) break;
    // Unstable: move to the lower diagonal on an open side (left first).
    if (!t.isSolid(x - 1, y) && !t.isSolid(x - 1, y + 1)) x--;
    else if (!t.isSolid(x + 1, y) && !t.isSolid(x + 1, y + 1)) x++;
    else break; // both diagonals blocked: stable in every way that matters
  }
  out.x = x;
  out.y = y;
  if (!t.isSolid(x, y + 1)) return PARTIAL;
  if (loose && !t.looseStableAt(x, y) && !(t.isSolid(x - 1, y + 1) && t.isSolid(x + 1, y + 1))) {
    // Ran out of steps mid-descent.
    const blockedL = t.isSolid(x - 1, y) || t.isSolid(x - 1, y + 1);
    const blockedR = t.isSolid(x + 1, y) || t.isSolid(x + 1, y + 1);
    if (!(blockedL && blockedR)) return PARTIAL;
  }
  return SETTLED;
}

/**
 * Nearest free cell for a buried grain. Deterministic order: a small ring
 * first (sideways settling), then straight up through the pile via the
 * bitplane (the common case after a dense landing), then wider rings for
 * grains trapped under an overhang.
 */
function nearestAir(t: Terrain, cx: number, cy: number, out: { x: number; y: number }): boolean {
  if (ring(t, cx, cy, 1, 2, out)) return true;
  for (let k = 3; cy - k >= -1; k++) {
    if (!t.isSolid(cx, cy - k)) {
      out.x = cx;
      out.y = cy - k;
      return true;
    }
  }
  return ring(t, cx, cy, 3, 32, out);
}

function ring(t: Terrain, cx: number, cy: number, r0: number, r1: number, out: { x: number; y: number }): boolean {
  for (let r = r0; r <= r1; r++) {
    for (let dy = -r; dy <= r; dy++) {
      const span = r - Math.abs(dy);
      for (let s = -1; s <= 1; s += 2) {
        const dx = span * s;
        if (!t.isSolid(cx + dx, cy + dy)) {
          out.x = cx + dx;
          out.y = cy + dy;
          return true;
        }
        if (span === 0) break;
      }
    }
  }
  return false;
}

export class Grains {
  n = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly mat: Uint8Array;
  readonly life: Uint16Array;
  readonly rest: Uint8Array;
  /** Scratch: grain sat in a crowded field cell this tick. */
  private readonly crowd: Uint8Array;

  constructor(readonly cap: number) {
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.mat = new Uint8Array(cap);
    this.life = new Uint16Array(cap);
    this.rest = new Uint8Array(cap);
    this.crowd = new Uint8Array(cap);
  }

  /** Returns false (and spawns nothing) when at capacity. */
  spawn(x: number, y: number, vx: number, vy: number, mat: number, life: number): boolean {
    if (this.n >= this.cap) return false;
    const i = this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.mat[i] = mat;
    this.life[i] = life;
    this.rest[i] = 0;
    return true;
  }

  private removeAt(i: number): void {
    const l = --this.n;
    this.x[i] = this.x[l];
    this.y[i] = this.y[l];
    this.vx[i] = this.vx[l];
    this.vy[i] = this.vy[l];
    this.mat[i] = this.mat[l];
    this.life[i] = this.life[l];
    this.rest[i] = this.rest[l];
    this.crowd[i] = this.crowd[l];
  }

  /** Radial blast impulse: velocity += strength * falloff along (p - c). */
  impulse(cx: number, cy: number, radius: number, strength: number): void {
    const r2 = radius * radius;
    for (let i = 0; i < this.n; i++) {
      const dx = this.x[i] - cx;
      const dy = this.y[i] - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      const d = Math.sqrt(d2) + 1;
      const k = (strength * (1 - d / radius)) / d;
      this.vx[i] += dx * k;
      this.vy[i] += dy * k - strength * 0.2;
      this.rest[i] = 0;
    }
  }

  step(col: Collider, dt: number, onSettle?: (x: number, y: number, mat: number) => void): void {
    const n = this.n;
    const { x, y, vx, vy } = this;
    const t = col.terrain;

    // 1. Integrate.
    const g = GRAVITY * dt;
    for (let i = 0; i < n; i++) {
      vy[i] = Math.min(MAX_SPEED, vy[i] + g);
      vx[i] = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vx[i] * 0.998));
    }

    // 2. Grain fields on the coarse grid: count and momentum. Crowded grains
    //    blend toward their cell's mean velocity (PIC-style), so a landing
    //    sends a deceleration wave up through the falling mass instead of
    //    grains passing through each other; and they are pushed down the
    //    density gradient (pressure without any neighbour search).
    for (let i = 0; i < n; i++) {
      const c = fieldIndex(x[i], y[i]);
      if (c < 0) continue;
      if (density[c]++ === 0) touched.push(c);
      momX[c] += vx[i];
      momY[c] += vy[i];
    }
    for (let i = 0; i < n; i++) {
      const c = fieldIndex(x[i], y[i]);
      if (c < 0) continue;
      const k = density[c];
      this.crowd[i] = k > CROWD ? 1 : 0;
      if (k >= PIC_MIN) {
        vx[i] += (momX[c] / k - vx[i]) * PIC_BLEND;
        vy[i] += (momY[c] / k - vy[i]) * PIC_BLEND;
      }
      if (k <= CROWD) continue;
      // Pressure from the gradient of *excess* density, clamped to about one
      // tick of gravity: it can separate overlapping grains and hold a pile
      // up, but can never inject more energy than gravity removes.
      const fx = c % FW;
      const ex = (j: number) => (density[j] > CROWD ? density[j] - CROWD : 0);
      const e = k - CROWD;
      const l = fx > 0 ? ex(c - 1) : e;
      const r = fx < FW - 1 ? ex(c + 1) : e;
      const u = c >= FW ? ex(c - FW) : e;
      const d = c + FW < density.length ? ex(c + FW) : e;
      const px = (l - r) * PRESSURE * dt;
      const py = (u - d) * PRESSURE * dt;
      vx[i] += px > PUSH_MAX ? PUSH_MAX : px < -PUSH_MAX ? -PUSH_MAX : px;
      vy[i] += py > PUSH_MAX ? PUSH_MAX : py < -PUSH_MAX ? -PUSH_MAX : py;
    }
    for (const c of touched) {
      density[c] = 0;
      momX[c] = 0;
      momY[c] = 0;
    }
    touched.length = 0;

    // 3 + 4. Sweep, respond, settle.
    let i = 0;
    while (i < this.n) {
      let px = x[i];
      let py = y[i];
      if (t.isSolid(Math.floor(px), Math.floor(py))) {
        // Buried by a deposit (grains landing in a dense block overlap the
        // cells their neighbours just settled into): move to the nearest free
        // cell. Rare and bounded, so a small ring search is fine.
        if (!nearestAir(t, Math.floor(px), Math.floor(py), free)) {
          i++; // nowhere to go yet: keep it (never destroy material) and retry next tick
          continue;
        }
        px = free.x + 0.5;
        py = free.y + 0.5;
        x[i] = px;
        y[i] = py;
      }
      col.sweep(px, py, vx[i] * dt, vy[i] * dt, hit);
      px = hit.x;
      py = hit.y;
      x[i] = px;
      y[i] = py;
      if (hit.hit) {
        vel.x = vx[i];
        vel.y = vy[i];
        contact(vel, hit.nx, hit.ny, GRAIN_E, GRAIN_MU);
        vx[i] = vel.x;
        vy[i] = vel.y;
      }
      // Resting = supported from below and slower than a couple of ticks of
      // gravity (a resting body re-gains g*dt every tick, so a stricter
      // threshold would make resting contact jitter forever).
      const cx = Math.floor(px);
      const cy = Math.floor(py);
      const supported = t.isSolid(cx, cy + 1);
      // Inside a packed crowd, residual pressure jitter is not motion: such a
      // grain is part of a static pile and may settle at a looser threshold.
      const settleV = this.crowd[i] ? SETTLE_SPEED * CROWD_SETTLE : SETTLE_SPEED;
      const slow = vx[i] * vx[i] + vy[i] * vy[i] < settleV * settleV;
      this.rest[i] = supported && slow ? this.rest[i] + 1 : 0;
      if (this.rest[i] >= SETTLE_TICKS) {
        // Come to rest: project onto the lattice (one bounded walk, at settle
        // time only) and become terrain.
        const p = projectRest(t, cx, cy, MAT_LOOSE[this.mat[i]], free);
        if (p === SETTLED) {
          onSettle?.(free.x, free.y, this.mat[i]);
          this.removeAt(i);
          continue;
        }
        if (p === PARTIAL) {
          // Long way down to a stable spot: carry on from where the walk got
          // to next tick, so each tick's work stays bounded.
          x[i] = free.x + 0.5;
          y[i] = free.y + 0.5;
          this.rest[i] = SETTLE_TICKS - 1;
        }
      }
      if (py >= WORLD_H) {
        this.removeAt(i);
        continue;
      }
      if (--this.life[i] === 0) {
        // Out of time: always conserve material. Move to a free cell if
        // buried, then drop onto the support below and deposit there.
        if (onSettle) {
          let fx = cx;
          let fy = cy;
          if (t.isSolid(fx, fy) && nearestAir(t, fx, fy, free)) {
            fx = free.x;
            fy = free.y;
          }
          dropToSupport(t, fx, fy, this.mat[i], onSettle);
        }
        this.removeAt(i);
        continue;
      }
      i++;
    }
  }
}

function fieldIndex(x: number, y: number): number {
  const fx = Math.floor(x) >> FIELD_SHIFT;
  const fy = Math.floor(y) >> FIELD_SHIFT;
  if (fx < 0 || fy < 0 || fx >= FW || fy >= FH) return -1;
  return fy * FW + fx;
}

/** Bounds of the last applyCarve's effect (inclusive terrain rect). */
export const carveExtent = { x0: 0, y0: 0, x1: 0, y1: 0 };

/**
 * The complete, deterministic effect of a carve op, run identically by the
 * server and every client holding the chunk: remove cells, then detach loose
 * material the carve left unstable (Terrain.collapseFrom). Returns removed
 * cells; `removed` and `detached` receive x, y, mat triples; `carveExtent`
 * receives every cell read or written, for chunk version bookkeeping.
 */
export function applyCarve(
  t: Terrain,
  x: number,
  y: number,
  r: number,
  core: number,
  removed: number[],
  detached: number[],
): number {
  removed.length = 0;
  detached.length = 0;
  carveExtent.x0 = x - r;
  carveExtent.x1 = x + r;
  carveExtent.y0 = y - r;
  carveExtent.y1 = y + r;
  const n = t.carve(x, y, r, core, (cx, cy, m) => {
    removed.push(cx, cy, m);
  });
  if (n === 0) return 0;
  t.collapseFrom(x, y, r, (cx, cy, m) => detached.push(cx, cy, m), carveExtent);
  return n;
}

/**
 * Drop a cell straight down onto the first support below it (used when the
 * grain system is at capacity, so collapsing material is never lost).
 */
export function dropToSupport(t: Terrain, x: number, y: number, mat: number, deposit: (x: number, y: number, mat: number) => void): void {
  for (let yy = Math.max(0, y); yy < WORLD_H - 1; yy++) {
    if (t.isSolid(x, yy)) return; // nothing free below (cannot happen right after a detach)
    if (t.isSolid(x, yy + 1)) {
      deposit(x, yy, mat);
      return;
    }
  }
}

/** Material a destroyed cell turns into when it lands again. */
export function rubbleOf(mat: number): number {
  if (mat === Mat.Sand || mat === Mat.Gold) return mat;
  return Mat.Rubble;
}

/**
 * Throw debris from a carve and release the collapse it caused. The server and
 * every client in range call this with identical inputs (same op, same chunk
 * state, same seed), so the shower and the collapse cost zero bandwidth.
 */
export function releaseCarve(
  grains: Grains,
  removed: number[],
  detached: number[],
  cx: number,
  cy: number,
  max: number,
  rng: Rng,
  overflow?: (x: number, y: number, mat: number) => void,
): void {
  const cells = removed.length / 3;
  if (cells > 0 && max > 0) {
    const count = Math.min(max, Math.ceil(cells / 3));
    for (let k = 0; k < count; k++) {
      const j = rng.int(cells) * 3;
      const x = removed[j] + 0.5;
      const y = removed[j + 1] + 0.5;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) + 1;
      const sp = rng.range(70, 260);
      grains.spawn(x, y, (dx / d) * sp + rng.range(-40, 40), (dy / d) * sp - rng.range(60, 170), rubbleOf(removed[j + 2]), 240);
    }
  }
  // Collapsing material starts nearly at rest and just falls.
  // Draw both random numbers before spawning so the RNG stream (and so every
  // mirrored grain) is identical whether or not this side has capacity.
  for (let j = 0; j < detached.length; j += 3) {
    const vx = rng.range(-6, 6);
    const vy = rng.range(0, 12);
    if (!grains.spawn(detached[j] + 0.5, detached[j + 1] + 0.5, vx, vy, detached[j + 2], 600)) {
      overflow?.(detached[j], detached[j + 1], detached[j + 2]);
    }
  }
}

/** Gold spilled by a dying clone. Mirrored by clients from the kill record's seed. */
export function spillGold(grains: Grains, x: number, y: number, vx: number, vy: number, count: number, rng: Rng): void {
  for (let i = 0; i < count; i++) {
    grains.spawn(x, y, vx * 0.5 + rng.range(-110, 110), vy * 0.5 + rng.range(-230, -50), Mat.Gold, 240);
  }
}
