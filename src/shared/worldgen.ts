import { WORLD_H, WORLD_W } from './constants.ts';
import { Mat } from './materials.ts';
import { Rng, hash2 } from './rng.ts';
import { Terrain } from './terrain.ts';

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 2D value noise in [0,1). */
function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smooth(fx - ix);
  const ty = smooth(fy - iy);
  const k = 1 / 4294967296;
  const a = hash2(ix, iy, seed) * k;
  const b = hash2(ix + 1, iy, seed) * k;
  const c = hash2(ix, iy + 1, seed) * k;
  const d = hash2(ix + 1, iy + 1, seed) * k;
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function fbm(x: number, y: number, scale: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x, y, scale, seed + o * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    scale *= 0.5;
  }
  return sum / norm;
}

/**
 * Server-only procedural generation. Clients never run this — they receive
 * chunk snapshots — so it is free to use floating point and trig.
 */
export function generateWorld(t: Terrain, seed: number): void {
  const rng = new Rng(seed);
  const p1 = rng.range(0, Math.PI * 2);
  const p2 = rng.range(0, Math.PI * 2);
  const p3 = rng.range(0, Math.PI * 2);
  const heights = new Int32Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) {
    const h =
      WORLD_H * 0.36 +
      Math.sin(x * 0.0041 + p1) * 70 +
      Math.sin(x * 0.011 + p2) * 28 +
      Math.sin(x * 0.031 + p3) * 7 +
      (fbm(x, 0, 96, seed ^ 0x51, 3) - 0.5) * 60;
    heights[x] = Math.floor(h);
  }

  const m = t.mat;
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      let v: number = Mat.Air;
      const surf = heights[x];
      if (y >= surf) {
        const depth = y - surf;
        v = depth < 10 ? Mat.Sand : Mat.Dirt;
        if (depth > 6 && fbm(x, y, 48, seed ^ 0xa1, 3) > 0.66) v = Mat.Rock;
        if (depth > 50 && fbm(x, y, 14, seed ^ 0xb7, 2) > 0.8 - Math.min(depth, 500) / 6000) v = Mat.Gold;
        // Caves widen with depth.
        const cave = fbm(x, y, 64, seed ^ 0xc3, 3);
        const caveT = 0.69 - Math.min(depth, 400) / 4000;
        if (depth > 30 && cave > caveT) v = Mat.Air;
      }
      if (y >= WORLD_H - 12 || x < 4 || x >= WORLD_W - 4) v = Mat.Bedrock;
      m[y * WORLD_W + x] = v;
    }
  }
  t.rebuildAllPlanes();
}
