import { GRAVITY, WORLD_H, WORLD_W } from './constants.ts';
import { Mat } from './materials.ts';
import type { Rng } from './rng.ts';
import type { Terrain } from './terrain.ts';
import { PROJ } from './weapons.ts';

/**
 * Data-oriented (structure-of-arrays) simulation kernels.
 *
 * Each system stores its components in parallel typed arrays and advances in
 * two passes:
 *   1. a branch-free integration pass over contiguous Float32Arrays (the shape
 *      JITs auto-vectorize and that maps 1:1 onto 4-wide SIMD lanes / WASM
 *      f32x4 or onto independent worker slices);
 *   2. a sweep/resolve pass that queries the SWAR terrain bitplanes.
 * Elements never interact with each other, so any index range can be stepped
 * independently and in parallel. Removal is swap-with-last, keeping arrays
 * dense.
 */

const GRAV_BY_KIND = new Float32Array(PROJ.map((p) => p.gravity));
const BOUNCE_BY_KIND = new Float32Array(PROJ.map((p) => p.bounce));

/** Flying terrain debris thrown by explosions. Settles back into terrain. */
export class DebrisField {
  n = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly mat: Uint8Array;
  readonly life: Uint16Array;

  constructor(readonly cap: number) {
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.mat = new Uint8Array(cap);
    this.life = new Uint16Array(cap);
  }

  spawn(x: number, y: number, vx: number, vy: number, mat: number, life: number): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.mat[i] = mat;
    this.life[i] = life;
  }

  private removeAt(i: number): void {
    const last = --this.n;
    this.x[i] = this.x[last];
    this.y[i] = this.y[last];
    this.vx[i] = this.vx[last];
    this.vy[i] = this.vy[last];
    this.mat[i] = this.mat[last];
    this.life[i] = this.life[last];
  }

  /**
   * Advance all debris. When a grain hits terrain it slides down-slope into a
   * resting cell and `onSettle` is invoked (server deposits it; clients just
   * drop their cosmetic copy and wait for the authoritative pixel op).
   */
  step(t: Terrain, dt: number, onSettle?: (x: number, y: number, mat: number) => void): void {
    const n = this.n;
    const { x, y, vx, vy } = this;
    const g = GRAVITY * dt;
    // Pass 1: vector integrate.
    for (let i = 0; i < n; i++) {
      vy[i] += g;
      vx[i] *= 0.996;
    }
    // Pass 2: sweep against bitplanes.
    let i = 0;
    while (i < this.n) {
      const dx = vx[i] * dt;
      const dy = vy[i] * dt;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
      const sx = dx / steps;
      const sy = dy / steps;
      let px = x[i];
      let py = y[i];
      let hit = false;
      for (let s = 0; s < steps; s++) {
        const nx = px + sx;
        const ny = py + sy;
        if (t.isSolid(Math.floor(nx), Math.floor(ny))) {
          hit = true;
          break;
        }
        px = nx;
        py = ny;
      }
      x[i] = px;
      y[i] = py;
      if (hit) {
        if (onSettle) settle(t, Math.floor(px), Math.floor(py), this.mat[i], onSettle);
        this.removeAt(i);
        continue;
      }
      if (--this.life[i] === 0 || py >= WORLD_H) {
        this.removeAt(i);
        continue;
      }
      i++;
    }
  }
}

function settle(
  t: Terrain,
  cx: number,
  cy: number,
  mat: number,
  onSettle: (x: number, y: number, mat: number) => void,
): void {
  if (t.isSolid(cx, cy) || cy < 0) return;
  for (let k = 0; k < 64; k++) {
    if (!t.isSolid(cx, cy + 1)) {
      cy++;
      continue;
    }
    const dir = (cx + cy) & 1 ? 1 : -1;
    if (!t.isSolid(cx + dir, cy + 1) && !t.isSolid(cx + dir, cy)) {
      cx += dir;
      cy++;
      continue;
    }
    if (!t.isSolid(cx - dir, cy + 1) && !t.isSolid(cx - dir, cy)) {
      cx -= dir;
      cy++;
      continue;
    }
    break;
  }
  onSettle(cx, cy, mat);
}

/** Material a destroyed cell turns into when it lands again. */
export function rubbleOf(mat: number): number {
  if (mat === Mat.Sand || mat === Mat.Gold) return mat;
  return Mat.Rubble;
}

/**
 * Deterministically throw debris from the cells removed by a carve. Both the
 * server and every client in range call this with the same removed-cell list
 * (they apply the same carve op to the same chunk state) and the same seed, so
 * the debris shower costs zero bandwidth.
 */
export function throwDebris(
  field: DebrisField,
  removed: number[], // packed triples: x, y, mat
  cx: number,
  cy: number,
  max: number,
  rng: Rng,
): void {
  const cells = removed.length / 3;
  if (cells === 0 || max === 0) return;
  const count = Math.min(max, Math.ceil(cells / 3));
  for (let k = 0; k < count; k++) {
    const j = rng.int(cells) * 3;
    const x = removed[j] + 0.5;
    const y = removed[j + 1] + 0.5;
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy) + 1;
    const sp = rng.range(70, 260);
    const vx = (dx / d) * sp + rng.range(-40, 40);
    const vy = (dy / d) * sp - rng.range(60, 170);
    field.spawn(x, y, vx, vy, rubbleOf(removed[j + 2]), 150);
  }
}

export interface ProjEnd {
  (i: number, x: number, y: number, actor: number, detonate: boolean): void;
}

/** Bullets, rockets and grenades. */
export class Projectiles {
  n = 0;
  readonly id: Uint32Array;
  readonly kind: Uint8Array;
  readonly owner: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly life: Uint16Array;

  constructor(readonly cap: number) {
    this.id = new Uint32Array(cap);
    this.kind = new Uint8Array(cap);
    this.owner = new Uint8Array(cap);
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.life = new Uint16Array(cap);
  }

  spawn(id: number, kind: number, owner: number, x: number, y: number, vx: number, vy: number): number {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.id[i] = id;
    this.kind[i] = kind;
    this.owner[i] = owner;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = PROJ[kind].life;
    return i;
  }

  indexOf(id: number): number {
    for (let i = 0; i < this.n; i++) if (this.id[i] === id) return i;
    return -1;
  }

  removeAt(i: number): void {
    const last = --this.n;
    this.id[i] = this.id[last];
    this.kind[i] = this.kind[last];
    this.owner[i] = this.owner[last];
    this.x[i] = this.x[last];
    this.y[i] = this.y[last];
    this.vx[i] = this.vx[last];
    this.vy[i] = this.vy[last];
    this.life[i] = this.life[last];
  }

  /**
   * `hitActor(x, y, owner)` returns the index of an actor occupying that point
   * (or -1); clients pass null and leave actor hits to the server.
   * `onEnd` fires before the projectile is removed.
   */
  step(
    t: Terrain,
    dt: number,
    hitActor: ((x: number, y: number, owner: number) => number) | null,
    onEnd: ProjEnd,
  ): void {
    const n = this.n;
    const { x, y, vx, vy, kind } = this;
    const g = GRAVITY * dt;
    // Pass 1: vector integrate (gather gravity scale by kind).
    for (let i = 0; i < n; i++) vy[i] += g * GRAV_BY_KIND[kind[i]];

    // Pass 2: sweep.
    let i = 0;
    while (i < this.n) {
      const k = kind[i];
      const dx = vx[i] * dt;
      const dy = vy[i] * dt;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
      const sx = dx / steps;
      const sy = dy / steps;
      let px = x[i];
      let py = y[i];
      let ended = false;
      for (let s = 0; s < steps; s++) {
        const nx = px + sx;
        const ny = py + sy;
        if (hitActor) {
          const a = hitActor(nx, ny, this.owner[i]);
          if (a >= 0) {
            onEnd(i, nx, ny, a, true);
            ended = true;
            break;
          }
        }
        const fx = Math.floor(nx);
        const fy = Math.floor(ny);
        if (t.isSolid(fx, fy)) {
          const b = BOUNCE_BY_KIND[k];
          if (b > 0) {
            const blockX = t.isSolid(fx, Math.floor(py));
            const blockY = t.isSolid(Math.floor(px), fy);
            if (blockX || !blockY) vx[i] = -vx[i] * b;
            if (blockY || !blockX) vy[i] = -vy[i] * b;
            vx[i] *= 0.8;
            break;
          }
          onEnd(i, px, py, -1, true);
          ended = true;
          break;
        }
        px = nx;
        py = ny;
      }
      if (ended) {
        this.removeAt(i);
        continue;
      }
      x[i] = px;
      y[i] = py;
      if (--this.life[i] === 0 || py >= WORLD_H || px < 0 || px >= WORLD_W) {
        // Bullets fizzle; explosives detonate on fuse / timeout.
        onEnd(i, px, py, -1, k !== 0 && py < WORLD_H);
        this.removeAt(i);
        continue;
      }
      i++;
    }
  }
}
