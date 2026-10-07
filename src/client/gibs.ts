import { GRAVITY, WORLD_H, WORLD_W } from '../shared/constants.ts';
import type { Terrain } from '../shared/terrain.ts';

// Gib piece ids; the art lives in sprites.ts (kept DOM-free here so the
// simulation can run in tests).
export const GIB_HELMET = 0;
export const GIB_TORSO = [1, 2];
export const GIB_ARM = 3;
export const GIB_LEG = [4, 5];
export const GIB_PACK = 6;
export const GIB_MEAT = [7, 8, 9];

const GIB_LIFE = 14; // seconds before a resting gib fades out

/**
 * Cosmetic body parts. Same SoA style as the shared kernels: rigid pieces that
 * bounce, tumble in 90° steps, trail blood while fast, and come to rest on the
 * terrain. Never networked: every client builds them from the kill record.
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

  step(t: Terrain, dt: number, blood: Blood): void {
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
        if (!t.isSolid(Math.floor(this.x[i]), Math.floor(this.y[i]) + 2)) this.resting[i] = 0;
        else {
          i++;
          continue;
        }
      }
      this.vy[i] += g;
      const dx = this.vx[i] * dt;
      const dy = this.vy[i] * dt;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
      const sx = dx / steps;
      const sy = dy / steps;
      let x = this.x[i];
      let y = this.y[i];
      for (let s = 0; s < steps; s++) {
        const nx = x + sx;
        const ny = y + sy;
        const fx = Math.floor(nx);
        const fy = Math.floor(ny);
        if (t.isSolid(fx, fy)) {
          const blockX = t.isSolid(fx, Math.floor(y));
          const blockY = t.isSolid(Math.floor(x), fy);
          const impact = Math.hypot(this.vx[i], this.vy[i]);
          if (blockX || !blockY) this.vx[i] = -this.vx[i] * 0.35;
          if (blockY || !blockX) this.vy[i] = -this.vy[i] * 0.3;
          this.vx[i] *= 0.7;
          this.spinRate[i] = (Math.random() - 0.5) * Math.min(0.5, impact / 400);
          if (impact > 90 && this.piece[i] !== GIB_HELMET) blood.splat(x, y, 2, impact * 0.2);
          if (Math.abs(this.vy[i]) < 25 && Math.abs(this.vx[i]) < 20 && blockY) {
            this.resting[i] = 1;
            this.vx[i] = this.vy[i] = 0;
            // Settle flat on a quarter turn.
            this.spin[i] = Math.round(this.spin[i]);
          }
          break;
        }
        x = nx;
        y = ny;
      }
      this.x[i] = Math.max(0, Math.min(WORLD_W - 1, x));
      this.y[i] = y;
      this.spin[i] += this.spinRate[i] * Math.hypot(this.vx[i], this.vy[i]) * dt;
      // Fast meat leaves a blood trail.
      if (!this.resting[i] && this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i] > 120 * 120 && Math.random() < 0.5) {
        blood.drop(x, y, this.vx[i] * 0.1, this.vy[i] * 0.1);
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

  step(t: Terrain, dt: number): void {
    const g = GRAVITY * dt;
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      this.vy[i] += g;
      const dx = this.vx[i] * dt;
      const dy = this.vy[i] * dt;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
      let x = this.x[i];
      let y = this.y[i];
      let hit = false;
      for (let s = 0; s < steps; s++) {
        const nx = x + dx / steps;
        const ny = y + dy / steps;
        const fx = Math.floor(nx);
        const fy = Math.floor(ny);
        if (t.isSolid(fx, fy)) {
          if (fx >= 0 && fy >= 0 && fx < WORLD_W && fy < WORLD_H) {
            const c = fy * WORLD_W + fx;
            this.stain[c] = Math.min(255, this.stain[c] + 110);
            t.markDirtyRect(fx, fy, fx, fy);
          }
          hit = true;
          break;
        }
        x = nx;
        y = ny;
      }
      if (hit || this.life[i] <= 0 || y > WORLD_H) {
        const l = --this.n;
        this.x[i] = this.x[l];
        this.y[i] = this.y[l];
        this.vx[i] = this.vx[l];
        this.vy[i] = this.vy[l];
        this.life[i] = this.life[l];
        continue;
      }
      this.x[i] = x;
      this.y[i] = y;
      i++;
    }
  }
}
