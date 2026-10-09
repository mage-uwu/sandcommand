import { Rng, hash2 } from '../shared/rng.ts';
import { type Relic, RelicKind, SIZE, isPainting } from './relics.ts';

/**
 * How the relics (relics.ts) look: each painted cell by cell as pixel art
 * (one pixel a world cell), weathered by its seed, and drawn on the caves'
 * back wall.
 */
type RGB = readonly [number, number, number];
const OCHRE: RGB = [196, 122, 62];
const RED: RGB = [148, 52, 40];
const CHALK: RGB = [222, 212, 190];
const CHAR: RGB = [44, 32, 30];
const BONE: RGB = [212, 202, 178];
const BONE_DK: RGB = [148, 138, 118];
const STONE: RGB = [182, 148, 98];
const STONE_DK: RGB = [128, 100, 66];
const METAL: RGB = [86, 92, 104];
const METAL_DK: RGB = [52, 56, 66];
const GLOW: RGB = [110, 226, 214];

/** A small pixel canvas drawn cell by cell. */
class Pix {
  readonly data: Uint32Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint32Array(w * h);
  }
  set(x: number, y: number, c: RGB, a = 255): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = ((a << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
  }
  get(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.data[y * this.w + x];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  ring(cx: number, cy: number, rx: number, ry: number, c: RGB, from = 0, to = Math.PI * 2): void {
    const n = Math.ceil((rx + ry) * 3);
    for (let i = 0; i <= n; i++) {
      const a = from + ((to - from) * i) / n;
      this.set(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, c);
    }
  }
  disc(cx: number, cy: number, r: number, c: RGB): void {
    const R = Math.ceil(r);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= r * r) this.set(cx + x, cy + y, c);
  }
}

/** A thin, tall figure (head with a halo ring), feet at (x, y); `arm` raised or not. */
function figure(p: Pix, x: number, y: number, c: RGB, h: number, arm: boolean, spear = false): void {
  p.line(x, y - h * 0.35, x, y - h * 0.8, c); // body
  p.line(x, y - h * 0.35, x - 2, y, c); // legs
  p.line(x, y - h * 0.35, x + 2, y, c);
  p.set(x, y - h * 0.9, c); // head
  p.set(x, y - h * 0.95, c);
  if (arm) p.line(x, y - h * 0.75, x + 3, y - h * 1.05, c);
  else p.line(x, y - h * 0.75, x - 2, y - h * 0.5, c);
  p.line(x, y - h * 0.75, x + 2, y - h * 0.5, c);
  if (spear) p.line(x + 3, y - h * 0.3, x + 5, y - h * 1.0, c);
}

function paint(kind: number, rng: Rng): Pix {
  const [w, h] = SIZE[kind];
  const p = new Pix(w, h);
  switch (kind) {
    case RelicKind.Hands: {
      // Stencilled hands: pigment sprayed round each, the hand itself left bare. Six fingers.
      const n = 2 + rng.int(2);
      const LEN = [3, 5, 6, 6, 5, 4];
      for (let i = 0; i < n; i++) {
        const cx = n === 2 ? 14 + i * 22 + rng.int(3) : 9 + i * 17 + rng.int(2);
        const cy = 11 + rng.int(3) - 1;
        const col = rng.next() < 0.7 ? RED : OCHRE;
        const hand = (x: number, y: number) => {
          const dx = x - cx;
          const dy = y - cy;
          if (dy >= 0 && dy <= 5 && Math.abs(dx) <= 5 - (dy > 3 ? 1 : 0)) return true; // palm
          if (dy > 5 && dy <= 8 && Math.abs(dx) <= 2) return true; // wrist
          for (let f = 0; f < 6; f++) if (dx === -5 + 2 * f && dy < 0 && dy >= -LEN[f]) return true; // six fingers
          return false;
        };
        for (let y = cy - 10; y <= cy + 10; y++) {
          for (let x = cx - 9; x <= cx + 9; x++) {
            const d = Math.hypot((x - cx) * 0.95, y - cy - 1);
            if (d > 8.5 || hand(x, y)) continue;
            // (Solid close round the hand, so its shape shows; thinning out at the edge.)
            if (d < 7 || rng.next() < (8.5 - d) / 2) p.set(x, y, col, 210);
          }
        }
      }
      break;
    }
    case RelicKind.Ringworld: {
      // The ringed world and its two moons, and them under it.
      p.ring(9, 7, 4, 4, OCHRE);
      p.ring(9, 7, 8, 2, OCHRE, -0.25, Math.PI + 0.25);
      p.set(20, 3, CHALK);
      p.set(25, 5, CHALK);
      const n = 3 + rng.int(2);
      for (let i = 0; i < n; i++) figure(p, 6 + i * 8 + rng.int(2), h - 2, RED, 13 + rng.int(3), i === n - 1);
      break;
    }
    case RelicKind.Beast: {
      // The six-legged beast (in chalk): a body, a head, legs bent high like a spider's.
      p.ring(28, 9, 6, 3, CHALK);
      p.rect(24, 8, 9, 3, CHALK);
      p.disc(35, 8, 1, CHALK);
      for (let l = 0; l < 6; l++) {
        const hx = 24 + l * 2;
        const dir = l < 3 ? -1 : 1;
        const kx = hx + dir * 3;
        p.line(hx, 10, kx, 4 + (l % 2), CHALK);
        p.line(kx, 4 + (l % 2), kx + dir * 3, h - 3, CHALK);
      }
      // Its hunters.
      for (let i = 0; i < 3; i++) figure(p, 4 + i * 5, h - 3, RED, 10, false, true);
      // A spiral over it all.
      for (let i = 0; i < 40; i++) {
        const a = i * 0.45;
        p.set(16 + Math.cos(a) * i * 0.1, 3 + Math.sin(a) * i * 0.08, OCHRE);
      }
      break;
    }
    case RelicKind.Procession: {
      // A stepped pyramid that shines, figures walking to it, marks beneath.
      const px = 33;
      const base = h - 6;
      for (let s = 0; s < 4; s++) {
        const half = 9 - s * 2;
        p.line(px - half, base - s * 3, px + half, base - s * 3, OCHRE);
        p.line(px - half, base - s * 3, px - half, base - s * 3 - 3, OCHRE);
        p.line(px + half, base - s * 3, px + half, base - s * 3 - 3, OCHRE);
      }
      for (let r = 0; r < 7; r++) {
        const a = Math.PI + (r * Math.PI) / 6;
        p.line(px + Math.cos(a) * 3, base - 14 + Math.sin(a) * 3, px + Math.cos(a) * 6, base - 14 + Math.sin(a) * 6, CHALK);
      }
      const n = 4 + rng.int(2);
      for (let i = 0; i < n; i++) figure(p, 3 + i * 4, base, RED, 9, false);
      for (let x = 2; x < w - 2; x += 3) {
        const g = rng.int(3);
        if (g === 0) p.line(x, h - 3, x, h - 1, CHAR);
        else if (g === 1) p.line(x - 1, h - 2, x + 1, h - 2, CHAR);
        else p.set(x, h - 2, CHAR);
      }
      break;
    }
    case RelicKind.Skull: {
      // A long, high-domed cranium in profile, great eye sockets, no jaw.
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const u = (x - 13) / 11;
          const v = (y - 8) / 7;
          if (u * u + v * v > 1) continue;
          const shade = u + v * 0.6 > 0.5;
          p.set(x, y, shade ? BONE_DK : BONE);
        }
      }
      p.disc(6, 8, 2.6, CHAR); // eye socket: huge
      p.disc(6, 8, 1, BONE_DK);
      p.line(2, 6, 9, 5, BONE_DK); // brow ridge
      p.line(3, 12, 9, 13, BONE_DK); // where the jaw was
      p.set(2, 10, CHAR); // nasal slit
      p.set(2, 11, CHAR);
      for (let i = 0; i < 5; i++) p.set(13 + i * 2, 3 + (i & 1), BONE_DK); // a suture line over the long dome
      break;
    }
    case RelicKind.Ring: {
      // An arc of a great ring: dark metal, notched, a seam of light along it.
      const cx = w / 2;
      const cy = h + 6;
      for (let a = Math.PI * 1.08; a <= Math.PI * 1.92; a += 0.01) {
        for (let r = 17; r <= 20; r++) p.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r === 20 ? METAL_DK : METAL);
        p.set(cx + Math.cos(a) * 18.5, cy + Math.sin(a) * 18.5, GLOW, 150);
      }
      for (let k = 0; k < 7; k++) {
        const a = Math.PI * (1.15 + k * 0.11);
        p.set(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20, CHAR);
        p.set(cx + Math.cos(a) * 19, cy + Math.sin(a) * 19, METAL_DK);
      }
      break;
    }
    case RelicKind.Head: {
      // A toppled stone head lying on its side: long face, a ring for a crown.
      for (let y = 2; y < h; y++) {
        for (let x = 0; x < w - 4; x++) {
          const u = (x - 12) / 12;
          const v = (y - 9) / 6;
          if (u * u + v * v > 1) continue;
          p.set(x, y, v > 0.3 ? STONE_DK : STONE);
        }
      }
      // (Lying face up, its brow to the right: a long nose, a heavy-lidded eye, thin lips, a long chin.)
      p.line(4, 5, 13, 4, STONE_DK); // the profile's top edge
      for (let i = 0; i < 4; i++) p.set(9 + i, 2 + (i > 1 ? 1 : 0), STONE); // the nose, standing up
      p.set(10, 1, STONE_DK);
      p.line(14, 7, 18, 7, CHAR); // the eye: a long, closed slit under a heavy lid
      p.line(14, 6, 18, 6, STONE_DK);
      p.line(5, 7, 8, 7, STONE_DK); // lips
      p.line(1, 9, 3, 10, STONE_DK); // the long chin
      p.ring(24, 9, 2, 6, STONE_DK); // the crown ring, seen edge on
      p.ring(25, 9, 2, 6, STONE);
      break;
    }
  }
  return p;
}

/** Painted relics, cached by their seed (each weathered its own way). */
const cache = new Map<number, HTMLCanvasElement>();

function art(r: Relic): HTMLCanvasElement {
  let c = cache.get(r.seed);
  if (c) return c;
  const p = paint(r.kind, new Rng(r.seed));
  // Weathering: paintings flake away in patches; relics just pit a little.
  const flake = r.kind === RelicKind.Hands ? 0.06 : isPainting(r.kind) ? 0.2 : 0.05;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x;
      if (!p.data[i]) continue;
      const patch = (hash2(x >> 2, y >> 2, r.seed) >>> 0) / 4294967296;
      const fine = (hash2(x, y, r.seed ^ 0x55) >>> 0) / 4294967296;
      if (fine < flake * (0.5 + patch)) p.data[i] = 0;
    }
  }
  c = document.createElement('canvas');
  c.width = p.w;
  c.height = p.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(p.w, p.h);
  new Uint32Array(img.data.buffer).set(p.data);
  ctx.putImageData(img, 0, 0);
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  cache.set(r.seed, c);
  return c;
}

/**
 * Draw the relics in view (world transform set), on the caves' back wall:
 * after the dark cave backdrop, before the terrain (which hides any part of
 * one in the rock). Paintings faint; relics a little less so.
 */
export function drawRelics(ctx: CanvasRenderingContext2D, relics: readonly Relic[], x0: number, y0: number, x1: number, y1: number): void {
  for (const r of relics) {
    const [w, h] = SIZE[r.kind];
    if (r.x + w < x0 || r.x > x1 || r.y + h < y0 || r.y > y1) continue;
    ctx.globalAlpha = isPainting(r.kind) ? 0.62 : 0.88;
    ctx.drawImage(art(r), r.x, r.y);
  }
  ctx.globalAlpha = 1;
}
