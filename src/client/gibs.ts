import { GRAVITY, WORLD_H, WORLD_W } from '../shared/constants.ts';
import { type Collider, contact, newHit } from '../shared/field.ts';

// Gib piece ids; the art lives in sprites.ts (kept DOM-free here so the
// simulation can run in tests).
export const GIB_HELMET = 0;
export const GIB_TORSO = [1, 2];
export const GIB_ARM = 3;
export const GIB_LEG = [4, 5];
export const GIB_PACK = 6;
export const GIB_MEAT = [7, 8, 9];

const GIB_LIFE = 14; // seconds before a resting gib fades out
const GIB_E = 0.35; // gibs bounce more than sand
const GIB_MU = 0.55;
const hit = newHit();
const vel = { x: 0.5, y: 0.5 }; // doubles from the start: no boxing

function blastImpulse(
  x: Float32Array,
  y: Float32Array,
  vx: Float32Array,
  vy: Float32Array,
  n: number,
  cx: number,
  cy: number,
  radius: number,
  strength: number,
): void {
  const r2 = radius * radius;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - cx;
    const dy = y[i] - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r2) continue;
    const d = Math.sqrt(d2) + 1;
    const k = (strength * (1 - d / radius)) / d;
    vx[i] += dx * k;
    vy[i] += dy * k - strength * 0.2;
  }
}

/**
 * Cosmetic body parts. Same SoA style and the same swept collider + contact
 * model as the shared grain kernels: rigid pieces that bounce and slide with
 * restitution and Coulomb friction, tumble in 90° steps, trail blood while
 * fast, and come to rest. Never networked: every client builds them from the
 * kill record.
 */
export class Gibs {
  n = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly px: Float32Array; // previous tick position, for render interpolation
  readonly py: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly spin: Float32Array; // accumulated rotation, quarter turns
  readonly spinRate: Float32Array;
  readonly life: Float32Array;
  readonly piece: Uint8Array;
  readonly team: Uint32Array;
  readonly resting: Uint8Array;

  constructor(readonly cap: number) {
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.px = new Float32Array(cap);
    this.py = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.spin = new Float32Array(cap);
    this.spinRate = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.piece = new Uint8Array(cap);
    this.team = new Uint32Array(cap);
    this.resting = new Uint8Array(cap);
  }

  spawn(x: number, y: number, vx: number, vy: number, piece: number, team: number): void {
    let i = this.n;
    if (i >= this.cap) i = (Math.random() * this.cap) | 0;
    else this.n++;
    this.x[i] = this.px[i] = x;
    this.y[i] = this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.spin[i] = Math.floor(Math.random() * 4);
    this.spinRate[i] = (Math.random() - 0.5) * 0.08;
    this.life[i] = GIB_LIFE + Math.random() * 4;
    this.piece[i] = piece;
    this.team[i] = team;
    this.resting[i] = 0;
  }

  private removeAt(i: number): void {
    const l = --this.n;
    this.x[i] = this.x[l];
    this.y[i] = this.y[l];
    this.px[i] = this.px[l];
    this.py[i] = this.py[l];
    this.vx[i] = this.vx[l];
    this.vy[i] = this.vy[l];
    this.spin[i] = this.spin[l];
    this.spinRate[i] = this.spinRate[l];
    this.life[i] = this.life[l];
    this.piece[i] = this.piece[l];
    this.team[i] = this.team[l];
    this.resting[i] = this.resting[l];
  }

  /** Radial blast impulse (same falloff as grains). */
  impulse(cx: number, cy: number, radius: number, strength: number): void {
    blastImpulse(this.x, this.y, this.vx, this.vy, this.n, cx, cy, radius, strength);
    for (let i = 0; i < this.n; i++) {
      const dx = this.x[i] - cx;
      const dy = this.y[i] - cy;
      if (dx * dx + dy * dy < radius * radius) {
        this.resting[i] = 0;
        this.spinRate[i] = (Math.random() - 0.5) * 0.6;
      }
    }
  }

  step(col: Collider, dt: number, blood: Blood): void {
    const t = col.terrain;
    const g = GRAVITY * dt;
    let i = 0;
    while (i < this.n) {
      this.px[i] = this.x[i];
      this.py[i] = this.y[i];
      this.life[i] -= dt;
      if (this.life[i] <= 0 || this.y[i] > WORLD_H) {
        this.removeAt(i);
        continue;
      }
      if (this.resting[i]) {
        // Wake up if the ground under it was blown away.
        if (t.isSolid(Math.floor(this.x[i]), Math.floor(this.y[i]) + 1)) {
          i++;
          continue;
        }
        this.resting[i] = 0;
      }
      this.vy[i] += g;
      col.sweep(this.x[i], this.y[i], this.vx[i] * dt, this.vy[i] * dt, hit);
      if (hit.hit) {
        vel.x = this.vx[i];
        vel.y = this.vy[i];
        const jn = contact(vel, hit.nx, hit.ny, GIB_E, GIB_MU);
        this.vx[i] = vel.x;
        this.vy[i] = vel.y;
        // Tumble in proportion to how hard it struck.
        this.spinRate[i] = (Math.random() - 0.5) * Math.min(0.5, jn / 400);
        if (jn > 90 && this.piece[i] !== GIB_HELMET) blood.splat(hit.x, hit.y, 2, jn * 0.2);
        if (hit.ny < -0.5 && vel.x * vel.x + vel.y * vel.y < 20 * 20) {
          this.resting[i] = 1;
          this.vx[i] = this.vy[i] = 0;
          this.spin[i] = Math.round(this.spin[i]); // settle flat on a quarter turn
        }
      }
      this.x[i] = Math.max(0, Math.min(WORLD_W - 1, hit.x));
      this.y[i] = hit.y;
      this.spin[i] += this.spinRate[i] * Math.hypot(this.vx[i], this.vy[i]) * dt;
      // Fast meat leaves a blood trail.
      if (!this.resting[i] && this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i] > 120 * 120 && Math.random() < 0.5) {
        blood.drop(hit.x, hit.y, this.vx[i] * 0.1, this.vy[i] * 0.1);
      }
      i++;
    }
  }

  /**
   * Burst a clone into parts. `violence` grows with overkill; explosive deaths
   * also scatter harder. Part offsets follow the body layout so the helmet
   * starts at the top and boots at the bottom.
   */
  burst(cx: number, cy: number, vx: number, vy: number, team: number, violence: number, blood: Blood): void {
    const v = Math.min(2.6, 1 + violence * 0.6);
    const fling = (ox: number, oy: number, piece: number, speed: number) => {
      const a = Math.atan2(oy - 2, ox) + (Math.random() - 0.5) * 1.6;
      const s = speed * (0.4 + Math.random() * 0.8) * v;
      this.spawn(cx + ox, cy + oy, vx * 0.5 + Math.cos(a) * s, vy * 0.5 + Math.sin(a) * s - 50 - Math.random() * 50, piece, team);
    };
    fling(0, -6, GIB_HELMET, 70);
    fling(-1, -1, GIB_TORSO[0], 50);
    fling(1, 0, GIB_TORSO[1], 50);
    fling(-3, -1, GIB_ARM, 80);
    fling(3, -1, GIB_ARM, 80);
    fling(-1, 5, GIB_LEG[0], 60);
    fling(1, 5, GIB_LEG[1], 60);
    fling(-3, 0, GIB_PACK, 45);
    const meat = Math.round(8 + 6 * v);
    for (let k = 0; k < meat; k++) {
      fling((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10, GIB_MEAT[k % GIB_MEAT.length], 90);
    }
    blood.splat(cx, cy, Math.round(24 + 14 * v), 70 + 30 * v, vx * 0.3, vy * 0.3);
  }
}

/**
 * Blood droplets. When a drop hits terrain it stains that cell in the
 * client-only stain layer, which the chunk rasterizer blends in.
 */
export class Blood {
  n = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly life: Float32Array;
  /** Per-cell stain intensity (0-255). Cosmetic, never networked. */
  readonly stain = new Uint8Array(WORLD_W * WORLD_H);

  constructor(readonly cap: number) {
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.life = new Float32Array(cap);
  }

  drop(x: number, y: number, vx: number, vy: number): void {
    let i = this.n;
    if (i >= this.cap) i = (Math.random() * this.cap) | 0;
    else this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = 1.6;
  }

  splat(x: number, y: number, count: number, speed: number, vx = 0, vy = 0): void {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * Math.random();
      this.drop(x, y, vx + Math.cos(a) * s, vy + Math.sin(a) * s - speed * 0.25);
    }
  }

  impulse(cx: number, cy: number, radius: number, strength: number): void {
    blastImpulse(this.x, this.y, this.vx, this.vy, this.n, cx, cy, radius, strength);
  }

  step(col: Collider, dt: number): void {
    const t = col.terrain;
    const g = GRAVITY * dt;
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      this.vy[i] += g;
      col.sweep(this.x[i], this.y[i], this.vx[i] * dt, this.vy[i] * dt, hit);
      if (hit.hit) {
        const { cx, cy } = hit;
        if (cx >= 0 && cy >= 0 && cx < WORLD_W && cy < WORLD_H) {
          const c = cy * WORLD_W + cx;
          this.stain[c] = Math.min(255, this.stain[c] + 110);
          t.markRenderDirty(cx, cy);
        }
      }
      if (hit.hit || this.life[i] <= 0 || hit.y > WORLD_H) {
        const l = --this.n;
        this.x[i] = this.x[l];
        this.y[i] = this.y[l];
        this.vx[i] = this.vx[l];
        this.vy[i] = this.vy[l];
        this.life[i] = this.life[l];
        continue;
      }
      this.x[i] = hit.x;
      this.y[i] = hit.y;
      i++;
    }
  }
}
