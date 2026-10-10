import { MAT_COLOR } from '../shared/materials.ts';
import { PK, type Particles } from '../shared/particles.ts';
import type { SpriteCache } from './sprites.ts';

/**
 * Every particle the field engine owns is drawn by writing pixels straight
 * into one buffer covering the view (one u32 per world cell), which is then
 * uploaded once and scaled up with the terrain's crisp nearest-neighbour
 * zoom. That is one linear pass with no per-particle canvas calls, so tens of
 * thousands of particles cost about the same as clearing the buffer.
 *
 * Two passes: translucent kinds (smoke, dust) composite first, then opaque
 * ones (grains, sparks, flames, blood, gib sprites) on top.
 */

// ABGR (little-endian RGBA bytes) packing.
const pack = (r: number, g: number, b: number, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const fromRgb = (rgb: number, a = 255) => pack((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, a);

const MAT_LUT = new Uint32Array(MAT_COLOR.map(([r, g, b]) => pack(r, g, b)));
/** A stone chunk's shadowed side. */
const STONE_DK = pack(132, 112, 88);

/** Flame colour by remaining life (index 0 = dying, 15 = fresh). */
const FLAME_LUT = new Uint32Array(16);
for (let i = 0; i < 16; i++) {
  const t = i / 15;
  const r = 255;
  const g = Math.round(60 + 195 * t * t);
  const b = Math.round(20 + 200 * Math.max(0, t - 0.6) * 2.5);
  const a = Math.round(120 + 135 * t);
  FLAME_LUT[i] = pack(r, Math.min(255, g), Math.min(255, b), a);
}
const SPARK_HOT = pack(255, 248, 200);
const SPARK_COOL = pack(255, 170, 60);
const BLOOD = pack(138, 12, 12);

export class ParticleLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private buf: Uint32Array;
  ox = 0;
  oy = 0;
  w = 1;
  h = 1;
  drawn = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(1, 1);
    this.buf = new Uint32Array(this.img.data.buffer);
  }

  /** Fill the buffer for the world rect starting at (ox, oy), size w x h cells. */
  render(p: Particles, sprites: SpriteCache, alpha: number, ox: number, oy: number, w: number, h: number): void {
    if (w !== this.w || h !== this.h) {
      this.w = this.canvas.width = w;
      this.h = this.canvas.height = h;
      this.img = this.ctx.createImageData(w, h);
      this.buf = new Uint32Array(this.img.data.buffer);
    }
    this.ox = ox;
    this.oy = oy;
    const buf = this.buf;
    buf.fill(0);
    const { x, y, px, py, kind, life, maxLife, aux, color } = p;
    let drawn = 0;

    // Pass 1: translucent smoke and dust.
    for (let i = 0; i < p.n; i++) {
      const k = kind[i];
      if (k !== PK.Smoke && k !== PK.Dust) continue;
      const cx = Math.floor(px[i] + (x[i] - px[i]) * alpha) - ox;
      const cy = Math.floor(py[i] + (y[i] - py[i]) * alpha) - oy;
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
      const t = life[i] / maxLife[i];
      const o = cy * w + cx;
      if (k === PK.Smoke && color[i] === 0) {
        const v = 70 + ((i * 37) & 31);
        blendOver(buf, o, v, v - 4, v - 8, Math.round(150 * t));
      } else if (k === PK.Smoke) {
        // Tinted smoke (a geyser's deadly cloud): its colour, a little varied.
        const c = color[i];
        const d = (i * 37) & 15;
        blendOver(buf, o, ((c >> 16) & 255) - d, ((c >> 8) & 255) - d, (c & 255) - d, Math.round(160 * t));
      } else {
        const c = color[i];
        blendOver(buf, o, (c >> 16) & 255, (c >> 8) & 255, c & 255, Math.round(220 * t));
      }
      drawn++;
    }

    // Pass 2: opaque kinds and gib sprites.
    for (let i = 0; i < p.n; i++) {
      const k = kind[i];
      if (k === PK.Smoke || k === PK.Dust) continue;
      const fx = px[i] + (x[i] - px[i]) * alpha;
      const fy = py[i] + (y[i] - py[i]) * alpha;
      if (k === PK.Gib) {
        const rot = ((Math.round(p.spin[i]) % 4) + 4) % 4;
        const s = sprites.gibPixels(color[i], aux[i] & 0x7f, rot);
        const fade = life[i] < 30 ? life[i] / 30 : 1;
        blit(buf, w, h, s.data, s.w, s.h, Math.floor(fx - s.w / 2) - ox, Math.floor(fy - s.h / 2) - oy, fade);
        drawn++;
        continue;
      }
      const cx = Math.floor(fx) - ox;
      const cy = Math.floor(fy) - oy;
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
      const o = cy * w + cx;
      switch (k) {
        case PK.Grain:
          buf[o] = MAT_LUT[aux[i]];
          break;
        case PK.Spark:
          buf[o] = life[i] * 2 > maxLife[i] ? SPARK_HOT : SPARK_COOL;
          break;
        case PK.Flame: {
          const c = FLAME_LUT[Math.min(15, Math.floor((life[i] / maxLife[i]) * 16))];
          blendOver(buf, o, c & 255, (c >> 8) & 255, (c >> 16) & 255, c >>> 24);
          break;
        }
        case PK.Blood:
          buf[o] = BLOOD;
          break;
        case PK.Stone: {
          // A chunk of dripstone: two cells square, lit top left, dark bottom right.
          buf[o] = MAT_LUT[17];
          if (cx + 1 < w) buf[o + 1] = MAT_LUT[17];
          if (cy + 1 < h) {
            buf[o + w] = STONE_DK;
            if (cx + 1 < w) buf[o + w + 1] = STONE_DK;
          }
          break;
        }
        case PK.Shrapnel: {
          // A hot tracer streak back along its path, like a bullet's.
          buf[o] = SPARK_HOT;
          const vx = x[i] - px[i];
          const vy = y[i] - py[i];
          const dist = Math.sqrt(vx * vx + vy * vy) + 1e-6;
          const len = Math.min(10, Math.floor(dist));
          for (let k = 1; k <= len; k++) {
            const tx = Math.floor(fx - (vx / dist) * k) - ox;
            const ty = Math.floor(fy - (vy / dist) * k) - oy;
            if (tx >= 0 && ty >= 0 && tx < w && ty < h) blendOver(buf, ty * w + tx, 255, 190, 90, Math.round(210 * (1 - k / (len + 1))));
          }
          break;
        }
        default:
          buf[o] = fromRgb(color[i]);
      }
      drawn++;
    }
    this.drawn = drawn;
    this.ctx.putImageData(this.img, 0, 0);
  }
}

/** Source-over composite of an RGBA colour onto a buffer pixel. */
function blendOver(buf: Uint32Array, o: number, r: number, g: number, b: number, a: number): void {
  if (a <= 0) return;
  const d = buf[o];
  const da = d >>> 24;
  if (da === 0 || a >= 255) {
    buf[o] = pack(r, g, b, Math.min(255, a));
    return;
  }
  const sa = a / 255;
  const oa = sa + (da / 255) * (1 - sa);
  const mix = (sc: number, dc: number) => Math.round((sc * sa + dc * (da / 255) * (1 - sa)) / oa);
  buf[o] = pack(mix(r, d & 255), mix(g, (d >> 8) & 255), mix(b, (d >> 16) & 255), Math.round(oa * 255));
}

/** Copy a sprite's opaque pixels into the buffer, optionally faded. */
function blit(buf: Uint32Array, bw: number, bh: number, src: Uint32Array, sw: number, sh: number, dx: number, dy: number, fade: number): void {
  for (let y = 0; y < sh; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= bh) continue;
    for (let x = 0; x < sw; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= bw) continue;
      const c = src[y * sw + x];
      if (c >>> 24 === 0) continue;
      buf[ty * bw + tx] = fade >= 1 ? c : ((c & 0xffffff) | (Math.round(255 * fade) << 24)) >>> 0;
    }
  }
}
