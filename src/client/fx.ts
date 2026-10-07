import { GRAVITY } from '../shared/constants.ts';
import type { Terrain } from '../shared/terrain.ts';

/**
 * Purely cosmetic particles (sparks, smoke, blood, jet exhaust). Same SoA
 * layout as the simulation kernels; never networked.
 */
export class Fx {
  n = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly grav: Float32Array;
  readonly color: Uint32Array;
  readonly size: Uint8Array;

  constructor(readonly cap: number) {
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.color = new Uint32Array(cap);
    this.size = new Uint8Array(cap);
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, color: number, grav = 1, size = 1): void {
    let i = this.n;
    if (i >= this.cap) i = (Math.random() * this.cap) | 0; // overwrite a random one
    else this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = grav;
    this.color[i] = color;
    this.size[i] = size;
  }

  burst(x: number, y: number, count: number, speed: number, life: number, color: number, grav = 1, size = 1): void {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + Math.random() * 0.5), color, grav, size);
    }
  }

  step(t: Terrain, dt: number): void {
    const g = GRAVITY * dt;
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const last = --this.n;
        this.x[i] = this.x[last];
        this.y[i] = this.y[last];
        this.vx[i] = this.vx[last];
        this.vy[i] = this.vy[last];
        this.life[i] = this.life[last];
        this.maxLife[i] = this.maxLife[last];
        this.grav[i] = this.grav[last];
        this.color[i] = this.color[last];
        this.size[i] = this.size[last];
        continue;
      }
      this.vy[i] += g * this.grav[i];
      const nx = this.x[i] + this.vx[i] * dt;
      const ny = this.y[i] + this.vy[i] * dt;
      if (this.grav[i] > 0 && t.isSolid(Math.floor(nx), Math.floor(ny))) {
        this.vx[i] *= -0.3;
        this.vy[i] *= -0.3;
      } else {
        this.x[i] = nx;
        this.y[i] = ny;
      }
      i++;
    }
  }
}
