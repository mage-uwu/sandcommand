import { Mat } from '../shared/materials.ts';
import type { Terrain } from '../shared/terrain.ts';
import { type Decor, DecorKind } from './decor.ts';

/**
 * The bunker fittings' pixel art (decor.ts places them): each baked once to
 * a small canvas, one pixel a cell, in the bunkers' palette of grey steel,
 * rust and faded paint. Lamps and telltales are lit live.
 */

type Px = (x: number, y: number, rgb: number, a?: number) => void;

/** 3x5 stencil letters. */
const FONT: Record<string, string[]> = {
  L: ['x..', 'x..', 'x..', 'x..', 'xxx'],
  B: ['xx.', 'x.x', 'xx.', 'x.x', 'xx.'],
  V: ['x.x', 'x.x', 'x.x', '.x.', '.x.'],
  A: ['.x.', 'x.x', 'xxx', 'x.x', 'x.x'],
  U: ['x.x', 'x.x', 'x.x', 'x.x', 'xxx'],
  T: ['xxx', '.x.', '.x.', '.x.', '.x.'],
  '1': ['.x.', 'xx.', '.x.', '.x.', 'xxx'],
  '2': ['xx.', '..x', '.x.', 'x..', 'xxx'],
  '3': ['xx.', '..x', '.x.', '..x', 'xx.'],
  '4': ['x.x', 'x.x', 'xxx', '..x', '..x'],
  '5': ['xxx', 'x..', 'xx.', '..x', 'xx.'],
};

function hash(a: number, b: number): number {
  let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

const shade = (rgb: number, k: number) => {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (c((rgb >> 16) & 255) << 16) | (c((rgb >> 8) & 255) << 8) | c(rgb & 255);
};

const TEAM_RGB = [0xb83a30, 0x3e9a48];

function paint(d: Decor, px: Px): void {
  const { w, h, seed } = d;
  const r = (i: number) => hash(seed, i);
  switch (d.kind) {
    case DecorKind.Lamp: {
      const cord = h - 5;
      for (let y = 0; y < cord; y++) px(3, y, 0x1c1a1c);
      for (let x = 1; x < 6; x++) px(x, cord, x === 1 ? 0x6a6e74 : 0x44484e);
      for (let y = cord + 1; y < cord + 4; y++) {
        px(1, y, 0x2a2c30);
        px(5, y, 0x2a2c30);
        for (let x = 2; x < 5; x++) px(x, y, y === cord + 2 ? 0x2a2c30 : x === 2 ? 0xfff2b8 : 0xffd870);
      }
      px(3, cord + 4, 0x2a2c30);
      break;
    }
    case DecorKind.Pipes: {
      const base = r(1) < 0.5 ? 0x7a6a5c : 0x5a6a72;
      for (let x = 0; x < w; x++) {
        const rust = hash(seed + x, 7) < 0.12 ? 0.8 : 1;
        px(x, 1, shade(base, 1.3 * rust));
        px(x, 2, shade(base, 1 * rust));
        px(x, 3, shade(base, 0.62 * rust));
        if (x % 18 === 4) for (let y = 0; y < 4; y++) {
          px(x, y, shade(base, 0.55));
          px(x + 1, y, shade(base, 0.8));
        }
      }
      const vx = 6 + Math.floor(r(2) * Math.max(1, w - 12));
      px(vx, 0, 0xb02a20);
      px(vx - 1, 0, 0x801a14);
      px(vx + 1, 0, 0x801a14);
      break;
    }
    case DecorKind.Cable: {
      const sag = 2 + Math.floor(r(1) * 5);
      for (let x = 0; x < w; x++) {
        const u = (x - w / 2) / (w / 2);
        const y = 1 + Math.round(sag * (1 - u * u));
        px(x, y, 0x161416);
      }
      px(0, 0, 0x6a6e74);
      px(0, 1, 0x6a6e74);
      px(w - 1, 0, 0x6a6e74);
      px(w - 1, 1, 0x6a6e74);
      break;
    }
    case DecorKind.Vent: {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
          px(x, y, edge ? (y === 0 || x === 0 ? 0x7c8086 : 0x3a3c40) : y % 2 ? 0x18181a : 0x5c6066);
        }
      }
      break;
    }
    case DecorKind.Fusebox: {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
          px(x, y, edge ? 0x2c2e32 : x === 1 || y === 1 ? 0x8c9096 : x === w >> 1 ? 0x4a4c50 : 0x6c7076);
        }
      }
      // A warning flash on its door.
      px(2, h - 3, 0xe8c030);
      px(3, h - 3, 0xe8c030);
      px(2, h - 2, 0x1c1c1c);
      break;
    }
    case DecorKind.Poster: {
      const paper = 0xb8ae94;
      const v = Math.floor(r(1) * 3);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (x === w - 1 && y === 0) continue; // (a torn corner)
          const fade = 0.82 + 0.18 * hash(seed + x * 3, y);
          px(x, y, shade(x === 0 || y === h - 1 || x === w - 1 || y === 0 ? 0x8a8068 : paper, fade));
        }
      }
      if (v === 0) {
        // A ringed planet.
        for (let y = 2; y < 8; y++) for (let x = 2; x < 7; x++) if ((x - 4.5) ** 2 + (y - 5) ** 2 < 5) px(x, y, y < 5 ? 0xa86a8a : 0x6a7a9a);
        for (let x = 1; x < 8; x++) px(x, 5 + (x < 4 ? 1 : x > 5 ? -1 : 0), 0xe0c090);
      } else if (v === 1) {
        // A clone, saluting.
        for (let y = 3; y < 10; y++) px(4, y, 0x3a4a3a);
        px(4, 2, 0xd0a080);
        px(3, 5, 0x3a4a3a);
        px(5, 4, 0x3a4a3a);
        px(6, 3, 0x3a4a3a);
        px(3, 10, 0x3a4a3a);
        px(5, 10, 0x3a4a3a);
      } else {
        // KEEP OUT: red bars.
        for (let y = 2; y < h - 2; y += 3) for (let x = 2; x < w - 2; x++) if (hash(x, y + seed) < 0.8) px(x, y, 0xb02a20);
      }
      for (let y = 1; y < h - 1; y++) if (hash(seed, y + 40) < 0.25) px(w - 2, y, 0x9a9078); // (water stains)
      break;
    }
    case DecorKind.Rack: {
      for (let x = 0; x < w; x++) {
        px(x, 0, 0x5a4a3a);
        px(x, h - 1, 0x3a3028);
      }
      for (let row = 0; row < 3; row++) {
        const y = 2 + row * 2;
        if (r(row + 3) < 0.25) continue; // (one taken)
        for (let x = 2; x < w - 1; x++) px(x, y, x < 5 ? 0x5a3e28 : x < 10 ? 0x2c2c30 : 0x1a1a1c);
        px(6, y + 1, 0x2c2c30); // magazine
      }
      break;
    }
    case DecorKind.Gauge: {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const d = Math.hypot(x - 3, y - 3);
          if (d > 3.5) continue;
          px(x, y, d > 2.6 ? 0x3a3c40 : 0xd8d4c8);
        }
      }
      const a = -2.4 + r(1) * 3;
      px(3, 3, 0x1a1a1a);
      px(3 + Math.round(Math.cos(a) * 2), 3 + Math.round(Math.sin(a) * 2), 0xc02020);
      break;
    }
    case DecorKind.Stencil: {
      const text = d.text ?? '';
      const ink = 0xc8a838;
      let cx = 0;
      for (const ch of text) {
        const g = FONT[ch];
        if (g) for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (g[y][x] === 'x' && hash(seed + cx + x, y) > 0.05) px(cx + x, y, ink, 0.85);
        cx += 4;
      }
      // Hazard stripes under it.
      for (let y = h - 2; y < h; y++) for (let x = 0; x < w; x++) px(x, y, (x + y) % 6 < 3 ? 0xd0a828 : 0x1c1c1c, 0.9);
      break;
    }
    case DecorKind.Banner: {
      const c = TEAM_RGB[d.team ?? 0] ?? TEAM_RGB[0];
      for (let x = 0; x < w; x++) px(x, 0, 0x3a3028);
      for (let y = 1; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const tail = h - 1 - y;
          if (tail < 3 && Math.abs(x - 3) < 3 - tail) continue; // (swallowtail)
          px(x, y, shade(c, x % 3 === 1 ? 0.78 : x === 0 ? 1.15 : 1));
        }
      }
      // Its emblem: a pale diamond.
      for (let y = 4; y < 9; y++) for (let x = 1; x < 6; x++) if (Math.abs(x - 3) + Math.abs(y - 6) <= 2) px(x, y, 0xe8e0c8);
      break;
    }
  }
}

const cache = new Map<string, HTMLCanvasElement>();

function art(d: Decor): HTMLCanvasElement {
  const key = `${d.kind}|${d.w}|${d.h}|${d.seed}|${d.text ?? ''}|${d.team ?? ''}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = d.w;
  c.height = d.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(d.w, d.h);
  paint(d, (x, y, rgb, a = 1) => {
    if (x < 0 || y < 0 || x >= d.w || y >= d.h) return;
    const o = (y * d.w + x) * 4;
    img.data[o] = (rgb >> 16) & 255;
    img.data[o + 1] = (rgb >> 8) & 255;
    img.data[o + 2] = rgb & 255;
    img.data[o + 3] = Math.round(a * 255);
  });
  ctx.putImageData(img, 0, 0);
  if (cache.size > 2000) cache.clear();
  cache.set(key, c);
  return c;
}

/** Still there? A lamp needs its ceiling; anything needs the room around it open (not buried, not filled in). */
function standing(t: Terrain, d: Decor): boolean {
  if (d.kind === DecorKind.Lamp || d.kind === DecorKind.Banner) {
    if (t.get(d.x + 3, d.y - 1) === Mat.Air) return false;
  }
  const cx = d.x + (d.w >> 1);
  const cy = d.y + (d.h >> 1);
  return t.get(cx, cy) === Mat.Air && t.get(d.x, d.y + d.h - 1) === Mat.Air && t.get(d.x + d.w - 1, d.y + d.h - 1) === Mat.Air;
}

/** Draw the fittings in view (world space), lamps lit. */
export function drawDecor(ctx: CanvasRenderingContext2D, t: Terrain, list: readonly Decor[], x0: number, y0: number, x1: number, y1: number, now: number): void {
  for (const d of list) {
    if (d.x + d.w < x0 - 30 || d.x > x1 + 30 || d.y + d.h < y0 - 40 || d.y > y1 + 10) continue;
    if (!standing(t, d)) continue;
    if (d.kind === DecorKind.Lamp) {
      // Its pool of light first, under it; now and then one flickers.
      const flick = hash(d.seed, 1) < 0.15 && hash(d.seed, Math.floor(now / 90)) < 0.3 ? 0.3 : 1;
      const lx = d.x + 3.5;
      const ly = d.y + d.h - 2;
      const g = ctx.createRadialGradient(lx, ly, 1, lx, ly + 6, 30);
      g.addColorStop(0, `rgba(255,220,140,${0.22 * flick})`);
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(lx - 30, ly - 4, 60, 40);
      if (flick < 1) continue;
    }
    ctx.drawImage(art(d), d.x, d.y);
    if (d.kind === DecorKind.Fusebox) {
      // Telltales winking.
      for (let k = 0; k < 3; k++) {
        const on = hash(d.seed + k, Math.floor(now / (400 + k * 170))) < 0.6;
        ctx.fillStyle = on ? (k === 0 ? '#ff4030' : '#50ff60') : '#202020';
        ctx.fillRect(d.x + d.w - 3, d.y + 2 + k * 2, 1, 1);
      }
    }
  }
}
