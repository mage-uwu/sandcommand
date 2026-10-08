import { WORLD_H, WORLD_W } from '../shared/constants.ts';
import { Mat } from '../shared/materials.ts';
import type { Terrain } from '../shared/terrain.ts';

/**
 * Bunker surfacing, in the spirit of Cortex Command and Metal Slug: cast
 * concrete in big recessed panels, weathered and gritty, with pockmarks,
 * hairline cracks and grime streaking down from every ledge; steel in
 * riveted plates, brushed and rusting; bevelled edges lit from the top
 * left; and a dark back wall behind every room, shadowed into its corners.
 *
 * Everything is a pure function of the terrain around a cell and its world
 * position, so a chunk always rasterizes the same way and neighbouring
 * chunks meet seamlessly.
 */

/** Hash of a cell (and a salt) to [0, 1). */
function h(x: number, y: number, s = 0): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1) at `scale` cells. */
function noise(x: number, y: number, scale: number, s: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  let tx = fx - ix;
  let ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = h(ix, iy, s);
  const b = h(ix + 1, iy, s);
  const c = h(ix, iy + 1, s);
  const d = h(ix + 1, iy + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

const STRUCT = (m: number) => m === Mat.Concrete || m === Mat.Metal;

function matAt(t: Terrain, x: number, y: number): number {
  if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return Mat.Bedrock;
  return t.mat[y * WORLD_W + x];
}

function abgr(r: number, g: number, b: number): number {
  const cr = r < 0 ? 0 : r > 255 ? 255 : Math.round(r);
  const cg = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
  const cb = b < 0 ? 0 : b > 255 ? 255 : Math.round(b);
  return (255 << 24) | (cb << 16) | (cg << 8) | cr;
}

/** Light from the top left: highlight the faces open above and left, shadow those open below and right. */
function bevel(t: Terrain, x: number, y: number): number {
  let k = 1;
  if (matAt(t, x, y - 1) === Mat.Air) k *= 1.3;
  else if (matAt(t, x, y - 2) === Mat.Air) k *= 1.12;
  if (matAt(t, x - 1, y) === Mat.Air) k *= 1.1;
  if (matAt(t, x, y + 1) === Mat.Air) k *= 0.55;
  else if (matAt(t, x, y + 2) === Mat.Air) k *= 0.8;
  if (matAt(t, x + 1, y) === Mat.Air) k *= 0.72;
  return k;
}

/** Grime running down from a ledge: darkest just under an open top, fading over ~20 cells, heavier in streaky columns. */
function grime(t: Terrain, x: number, y: number): number {
  let d = 0;
  while (d < 20 && STRUCT(matAt(t, x, y - d - 1))) d++;
  if (d >= 20 || matAt(t, x, y - d - 1) !== Mat.Air) return 0;
  const streak = h(x, 0, 9);
  const heavy = streak > 0.6 ? (streak - 0.6) * 1.6 : 0;
  return (1 - d / 20) * (0.08 + heavy * 0.55);
}

/** Cast concrete: 32x24 panels laid in staggered courses. */
function concrete(t: Terrain, x: number, y: number): number {
  const course = Math.floor(y / 24);
  const ox = x + (course & 1) * 16;
  const px = ((ox % 32) + 32) % 32;
  const py = ((y % 24) + 24) % 24;
  let k = (0.86 + 0.26 * noise(x, y, 22, 1)) * (0.93 + 0.12 * h(x, y));
  if (h(x, y, 7) < 0.022) k *= 0.68; // pockmark
  // Recessed joints between panels: a dark groove, a lit lip below/right of it.
  if (px === 0 || py === 0) k *= 0.62;
  else if (px === 1 || py === 1) k *= 1.1;
  else {
    // A hairline crack wandering down some panels.
    const pc = Math.floor(ox / 32);
    if (h(pc, course, 3) < 0.4) {
      const len = 8 + Math.floor(h(pc, course, 5) * 14);
      if (py < len) {
        const start = 5 + Math.floor(h(pc, course, 4) * 22);
        const slope = (h(pc, course, 6) - 0.5) * 0.9;
        const cx = Math.round(start + py * slope + 1.6 * Math.sin(py * 0.8 + pc));
        if (px === cx) k *= 0.55;
        else if (px === cx + 1) k *= 1.07;
      }
    }
  }
  k *= bevel(t, x, y) * (1 - grime(t, x, y));
  const tint = (noise(x, y, 40, 2) - 0.5) * 14;
  return abgr(170 * k + tint, 162 * k + tint * 0.5, 144 * k - tint * 0.4);
}

/** Steel: 16x12 riveted plates, brushed, rusting in blotches. */
function steel(t: Terrain, x: number, y: number): number {
  const course = Math.floor(y / 12);
  const ox = x + (course & 1) * 8;
  const px = ((ox % 16) + 16) % 16;
  const py = ((y % 12) + 12) % 12;
  let k = (0.9 + 0.12 * noise(x, y, 18, 11)) * (0.95 + 0.08 * h(Math.floor(x / 3), y, 12));
  if (px === 0 || py === 0) k *= 0.55;
  else if (px === 1 || py === 1) k *= 1.15;
  else if ((px === 3 || px === 13) && (py === 3 || py === 9)) k *= 1.5; // rivet head
  else if ((px === 4 || px === 14) && (py === 4 || py === 10)) k *= 0.7; // its shadow
  if (h(x, y, 13) < 0.01) k *= 1.35; // scratch glint
  k *= bevel(t, x, y) * (1 - grime(t, x, y) * 0.7);
  let r = 126 * k;
  let g = 134 * k;
  let b = 146 * k;
  const rust = noise(x, y, 14, 5);
  if (rust > 0.6) {
    const a = Math.min(0.65, (rust - 0.6) * 2.4) * (0.7 + 0.3 * h(x, y, 14));
    r += (128 * k - r) * a;
    g += (74 * k - g) * a;
    b += (40 * k - b) * a;
  }
  return abgr(r, g, b);
}

/** A bunker solid (concrete or steel) at (x, y). */
export function structColor(t: Terrain, m: number, x: number, y: number): number {
  return m === Mat.Metal ? steel(t, x, y) : concrete(t, x, y);
}

/** How far (cells) a room's corners and edges cast shadow onto its back wall. */
const AO = 9;

function openRun(t: Terrain, x: number, y: number, dx: number, dy: number): number {
  let d = 1;
  while (d < AO && matAt(t, x + dx * d, y + dy * d) === Mat.Air) d++;
  return d;
}

/**
 * The back wall behind an air cell inside a bunker (`kind`: structures.ts
 * Backdrop): dark panelled concrete, or riveted steel in the king's vault,
 * shadowed toward whatever bounds the room. It stays when the front is
 * blown away, like the background layer of a Cortex Command bunker.
 */
export function backWallColor(t: Terrain, kind: number, x: number, y: number): number {
  const near = Math.min(openRun(t, x, y, -1, 0), openRun(t, x, y, 1, 0), openRun(t, x, y, 0, -1), openRun(t, x, y, 0, 1));
  let k = (0.5 + 0.5 * Math.min(1, (near - 1) / (AO - 2))) * (0.88 + 0.2 * noise(x, y, 26, 21)) * (0.95 + 0.08 * h(x, y, 22));
  if (kind === 2) {
    const course = Math.floor(y / 12);
    const px = (((x + (course & 1) * 8) % 16) + 16) % 16;
    const py = ((y % 12) + 12) % 12;
    if (px === 0 || py === 0) k *= 0.7;
    else if ((px === 3 || px === 13) && (py === 3 || py === 9)) k *= 1.3;
    return abgr(52 * k, 57 * k, 64 * k);
  }
  const course = Math.floor(y / 24);
  const ox = x + (course & 1) * 16;
  const px = ((ox % 32) + 32) % 32;
  const py = ((y % 24) + 24) % 24;
  if (px === 0 || py === 0) k *= 0.72;
  else if (px === 1 || py === 1) k *= 1.06;
  else if ((px === 3 || px === 29) && (py === 3 || py === 21)) k *= 1.35; // bolt heads at the panel corners
  else {
    // Some panels carry a vent grille: dark slats in a frame.
    const panel = h(Math.floor(ox / 32), course, 31);
    if (panel < 0.16 && px >= 10 && px <= 21 && py >= 8 && py <= 15) {
      if (px === 10 || px === 21 || py === 8 || py === 15) k *= 1.18;
      else k *= (py & 1) === 0 ? 0.45 : 0.85;
    } else if (panel > 0.9 && py >= 10 && py <= 13) {
      // ...others a run of conduit along the wall.
      k *= py === 10 ? 1.25 : py === 13 ? 0.6 : 1.05;
    }
  }
  return abgr(64 * k, 59 * k, 53 * k);
}
