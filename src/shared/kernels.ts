import { GRAVITY, WORLD_H, WORLD_W } from './constants.ts';
import { type Collider, contact, newHit } from './field.ts';
import { PROJ } from './weapons.ts';

/**
 * Projectiles, in the same structure-of-arrays layout as the other particle
 * systems (see particles.ts for the grain kernels). Each tick is one vector
 * integration pass, then one swept test per projectile: the terrain sweep
 * sphere-traces the distance field, and actors are tested with a continuous
 * segment-vs-AABB slab test along the swept path, so a bullet costs a handful
 * of probes regardless of speed.
 */

const GRAV_BY_KIND = new Float32Array(PROJ.map((p) => p.gravity));
const BOUNCE_BY_KIND = new Float32Array(PROJ.map((p) => p.bounce));
const THRUST_BY_KIND = new Float32Array(PROJ.map((p) => p.thrust ?? 0));

/** Deterministic [0, 1) from a projectile id, so server and clients fly a runaway engine the same way. */
function idHash(id: number, s: number): number {
  let n = Math.imul(id ^ Math.imul(s, 0x9e3779b1), 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Initial heading of a self-propelled projectile: roughly up (it was holding a ship up), skewed. */
function launchHeading(id: number): number {
  return -Math.PI / 2 + (idHash(id, 1) - 0.5) * 1.2;
}

/** Spin rate (rad/s) of a self-propelled projectile `age` ticks after launch: it spins out faster and faster. */
export function runawaySpin(id: number, age: number): number {
  return (idHash(id, 2) < 0.5 ? -1 : 1) * (1.5 + idHash(id, 3) * 2.5) * (1 + age / 25);
}
const hit = newHit();
const vel = { x: 0.5, y: 0.5 }; // doubles from the start: no boxing

/**
 * Find the first actor (other than `owner`) whose box the segment
 * (x0,y0)->(x1,y1) enters. Returns its index and writes the entry fraction to
 * `out.t`, or returns -1.
 */
export type SegmentQuery = (x0: number, y0: number, x1: number, y1: number, owner: number, out: { t: number }, kind: number) => number;

/** Slab test: entry fraction of a segment into an AABB, or -1. */
export function segmentBox(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number,
): number {
  let tmin = 0;
  let tmax = 1;
  if (dx === 0) {
    if (x0 < bx0 || x0 >= bx1) return -1;
  } else {
    let a = (bx0 - x0) / dx;
    let b = (bx1 - x0) / dx;
    if (a > b) [a, b] = [b, a];
    if (a > tmin) tmin = a;
    if (b < tmax) tmax = b;
  }
  if (dy === 0) {
    if (y0 < by0 || y0 >= by1) return -1;
  } else {
    let a = (by0 - y0) / dy;
    let b = (by1 - y0) / dy;
    if (a > b) [a, b] = [b, a];
    if (a > tmin) tmin = a;
    if (b < tmax) tmax = b;
  }
  return tmin <= tmax ? tmin : -1;
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
  /** Heading (radians) of a self-propelled projectile (its thrust axis). */
  readonly ang: Float32Array;

  constructor(readonly cap: number) {
    this.id = new Uint32Array(cap);
    this.kind = new Uint8Array(cap);
    this.owner = new Uint8Array(cap);
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.life = new Uint16Array(cap);
    this.ang = new Float32Array(cap);
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
    this.ang[i] = THRUST_BY_KIND[kind] > 0 ? launchHeading(id) : 0;
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
    this.ang[i] = this.ang[last];
  }

  /**
   * `segment` finds actors along each swept path (clients pass null and leave
   * actor hits to the server). `onEnd` fires before the projectile is removed.
   */
  step(col: Collider, dt: number, segment: SegmentQuery | null, onEnd: ProjEnd): void {
    const n = this.n;
    const { x, y, vx, vy, kind } = this;
    const g = GRAVITY * dt;
    // Pass 1: vector integrate (gather gravity scale by kind).
    for (let i = 0; i < n; i++) vy[i] += g * GRAV_BY_KIND[kind[i]];
    // Self-propelled (runaway engines): burn along a heading that spins ever faster.
    for (let i = 0; i < n; i++) {
      const T = THRUST_BY_KIND[kind[i]];
      if (T === 0) continue;
      const def = PROJ[kind[i]];
      const age = def.life - this.life[i];
      if (age < (def.burn ?? 0)) {
        this.ang[i] += runawaySpin(this.id[i], age) * dt;
        vx[i] += Math.cos(this.ang[i]) * T * dt;
        vy[i] += Math.sin(this.ang[i]) * T * dt;
      } else this.ang[i] += runawaySpin(this.id[i], def.burn ?? 0) * 0.5 * dt; // tumbling
      const d = 1 - Math.min(1, (def.drag ?? 0) * dt);
      vx[i] *= d;
      vy[i] *= d;
    }

    // Pass 2: swept collision.
    const q = { t: 0 };
    let i = 0;
    while (i < this.n) {
      const k = kind[i];
      const px = x[i];
      const py = y[i];
      const dx = vx[i] * dt;
      const dy = vy[i] * dt;
      col.sweep(px, py, dx, dy, hit);
      // Actors along the part of the path that is actually free.
      if (segment) {
        const a = segment(px, py, hit.x, hit.y, this.owner[i], q, k);
        if (a >= 0) {
          onEnd(i, px + (hit.x - px) * q.t, py + (hit.y - py) * q.t, a, true);
          this.removeAt(i);
          continue;
        }
      }
      x[i] = hit.x;
      y[i] = hit.y;
      if (hit.hit) {
        const b = BOUNCE_BY_KIND[k];
        if (b > 0) {
          vel.x = vx[i];
          vel.y = vy[i];
          contact(vel, hit.nx, hit.ny, b, 0.35);
          vx[i] = vel.x;
          vy[i] = vel.y;
        } else {
          onEnd(i, hit.x, hit.y, -1, true);
          this.removeAt(i);
          continue;
        }
      }
      if (--this.life[i] === 0 || hit.y >= WORLD_H || hit.x < 0 || hit.x >= WORLD_W) {
        // Bullets fizzle; explosives detonate on fuse / timeout.
        onEnd(i, hit.x, hit.y, -1, k !== 0 && hit.y < WORLD_H);
        this.removeAt(i);
        continue;
      }
      i++;
    }
  }
}
