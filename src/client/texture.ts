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

const STRUCT = (m: number) => m === Mat.Concrete || m === Mat.Metal || m === Mat.Iron || m === Mat.Door;

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

/**
 * Cobblestone: irregular rounded stones in dark mortar (a jittered grid of
 * stone centres; the mortar runs where two centres are nearly equidistant),
 * each stone lit on its top left, moss creeping over some in the damp.
 */
function cobble(t: Terrain, x: number, y: number): number {
  const gx = Math.floor(x / 7);
  const gy = Math.floor(y / 6);
  let d1 = 1e9;
  let d2 = 1e9;
  let sx = 0;
  let sy = 0;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = (gx + i) * 7 + 1 + h(gx + i, gy + j, 41) * 5;
      const cy = (gy + j) * 6 + 1 + h(gx + i, gy + j, 42) * 4;
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy) * 1.3;
      if (d < d1) {
        d2 = d1;
        d1 = d;
        sx = cx;
        sy = cy;
        id = (gx + i) * 7919 + (gy + j);
      } else if (d < d2) d2 = d;
    }
  }
  const edge = Math.sqrt(d2) - Math.sqrt(d1);
  let k = 0.82 + 0.3 * h(id, 0, 43);
  if (edge < 0.9) k = 0.42; // mortar
  else {
    // Rounded: lit toward the top left of each stone, shaded bottom right.
    const lx = x - sx;
    const ly = y - sy;
    k *= 1 - (lx + ly) * 0.045;
    if (edge < 1.8) k *= 0.85;
  }
  k *= (0.94 + 0.1 * h(x, y, 44)) * bevel(t, x, y);
  let r = 98 * k;
  let g = 94 * k;
  let b = 90 * k;
  const moss = noise(x, y, 30, 45);
  if (moss > 0.62 && edge >= 0.9) {
    const a = Math.min(0.6, (moss - 0.62) * 2.5);
    r += (64 * k - r) * a;
    g += (96 * k - g) * a;
    b += (52 * k - b) * a;
  }
  return abgr(r, g, b);
}

/** One block of an alien glyph: a 5x4 symbol of strokes from the block's hash (bit per cell). */
function glyphBit(bx: number, by: number, gx: number, gy: number): boolean {
  const bits = Math.floor(h(bx, by, 51) * 0xfffff);
  // Symmetric about its vertical axis, and always a frame stroke on top: reads as a carved sign.
  const col = gx < 3 ? gx : 4 - gx;
  return gy === 0 ? col !== 0 : ((bits >> (col * 4 + gy)) & 1) === 1;
}

/**
 * Temple sandstone: big ashlar blocks in running bond, weathered, a few
 * carved with alien glyphs whose grooves glow teal, like the step pyramid's
 * faces and the upper halls of the labyrinth.
 */
function glyphStone(t: Terrain, x: number, y: number): number {
  const course = Math.floor(y / 10);
  const ox = x + (course & 1) * 9;
  const bx = Math.floor(ox / 18);
  const px = ((ox % 18) + 18) % 18;
  const py = ((y % 10) + 10) % 10;
  let k = (0.86 + 0.18 * noise(x, y, 26, 52)) * (0.9 + 0.16 * h(bx, course, 53)) * (0.95 + 0.07 * h(x, y, 54));
  if (px === 0 || py === 0) k *= 0.6;
  else if (px === 1 || py === 1) k *= 1.12;
  else if (px === 17 || py === 9) k *= 0.82;
  let r = 188 * k;
  let g = 152 * k;
  let b = 100 * k;
  // Carved glyphs on some blocks: the groove is dark, lit from within.
  if (h(bx, course, 55) < 0.16 && px >= 6 && px <= 12 && py >= 3 && py <= 7) {
    const gx = Math.floor((px - 6) * 5 / 7);
    const gy = py - 3;
    if (gy < 4 && glyphBit(bx, course, gx, gy)) {
      const glow = 0.75 + 0.25 * h(bx, course, 56);
      r = 64 * glow;
      g = 226 * glow;
      b = 208 * glow;
    }
  }
  const kb = bevel(t, x, y);
  return abgr(r * kb, g * kb, b * kb);
}

/**
 * Frosting on the topsoil. Lichen (Mat.Grass: it's an alien world): a
 * teal-cyan crust, its top row tipped pale aqua or violet here and there,
 * deepening to a dark sea-green mat underneath. Frost (Mat.Snow): a bright
 * crust lit from above, cold lilac in its depths and shadows, the odd glint.
 */
export function frostColor(t: Terrain, m: number, x: number, y: number): number {
  let d = 0; // depth below open air
  while (d < 4 && matAt(t, x, y - d - 1) !== Mat.Air) d++;
  const n = h(x, y, 61);
  if (m === Mat.Snow) {
    if (n < 0.012) return abgr(255, 255, 255);
    const k = (d === 0 ? 1.04 : d === 1 ? 0.97 : 0.88 - (d - 2) * 0.04) * (0.96 + 0.06 * noise(x, y, 9, 62));
    const shade = matAt(t, x + 1, y) === Mat.Air ? 0.9 : 1;
    return abgr(226 * k * shade, 220 * k * shade, 242 * k);
  }
  const blade = h(x, 0, 63);
  let r = 50;
  let g = 150;
  let b = 140;
  if (d === 0) {
    if (blade < 0.12) {
      r = 168;
      g = 112;
      b = 206; // violet tips
    } else {
      r = blade < 0.4 ? 120 : 76;
      g = blade < 0.4 ? 222 : 190;
      b = blade < 0.4 ? 200 : 170;
    }
  } else if (d >= 2) {
    r = 34;
    g = 90;
    b = 92;
  }
  const k = 0.92 + 0.14 * n;
  return abgr(r * k, g * k, b * k);
}

/**
 * Air just over grass: a blade or two poking up (from the column's hash), so
 * a turf edge reads as grass, not a green stripe. 0: nothing there.
 */
export function grassBlade(t: Terrain, x: number, y: number): number {
  const below1 = matAt(t, x, y + 1) === Mat.Grass;
  const below2 = !below1 && matAt(t, x, y + 2) === Mat.Grass && matAt(t, x, y + 1) === Mat.Air;
  if (!below1 && !below2) return 0;
  const tall = h(x, 7, 64);
  if (below1 ? tall < 0.45 : tall < 0.82) return 0;
  // Lichen fronds; now and then a glowing violet spore-head on a tall one.
  if (!below1 && tall > 0.95) return abgr(206, 140, 255);
  return below1 ? abgr(70, 186, 168) : abgr(110, 214, 196);
}

/**
 * Dripstone, pixel-art style: pale calcite in vertical flow streaks with
 * darker drip rings across it, lit from the left (a bright left edge, a
 * shadowed right one, a dark outline below), and on the very tip of a
 * stalactite a glistening drop.
 */
export function dripColor(t: Terrain, x: number, y: number): number {
  const air = (dx: number, dy: number) => matAt(t, x + dx, y + dy) === Mat.Air;
  const drip = (dx: number, dy: number) => matAt(t, x + dx, y + dy) === Mat.Dripstone;
  // The tip of a stalactite: open below and either side, dripstone above.
  if (air(0, 1) && air(-1, 0) && air(1, 0) && drip(0, -1)) return (h(x, y, 81) < 0.5 ? abgr(236, 242, 246) : abgr(198, 222, 230));
  let k = 0.9 + 0.1 * noise(x * 3, y * 0.4, 6, 82); // flow streaks run down it
  if (((y + Math.floor(noise(x, 0, 9, 83) * 3)) % 5) === 0) k *= 0.88; // drip rings
  if (air(-1, 0)) k *= 1.2;
  else if (air(1, 0)) k *= 0.74;
  if (air(0, 1) && !drip(0, -1)) k *= 0.8; // the underside of a stalagmite's base, the foot of a stalactite
  if (air(1, 0) && air(0, 1)) k *= 0.85;
  return abgr(206 * k, 184 * k, 150 * k);
}

/**
 * Natural ground (`m`: dirt and its varieties, sand, rust dust), from its
 * palette shade `c` (ABGR): grit and texture by kind. Rust soil with the
 * odd dark clod; regolith full of basalt pebbles; ochre with bright
 * grains; clay streaked; rust dust in wind ripples. Others pass through.
 */
export function soilColor(m: number, x: number, y: number, c: number): number {
  const n = h(x, y, 71);
  let k = 1;
  if (m === Mat.Dirt) {
    if (n < 0.04) k = 0.72;
    else k = 0.94 + 0.12 * noise(x, y, 5, 72);
  } else if (m === Mat.Regolith) {
    if (n < 0.1) k = 0.6;
    else if (n > 0.96) k = 1.35;
  } else if (m === Mat.Ochre) {
    if (n > 0.95) k = 1.3;
    else k = 0.92 + 0.14 * noise(x, y, 7, 73);
  } else if (m === Mat.Clay) {
    k = 0.9 + 0.16 * noise(x * 0.4, y * 2, 4, 74);
  } else if (m === Mat.RustSand) {
    // Ripples: faint diagonal bands, as the wind leaves them.
    k = (x + y * 3 + Math.floor(noise(x, y, 9, 75) * 6)) % 9 < 2 ? 1.1 : 1;
  } else return c;
  if (k === 1) return c;
  return abgr((c & 255) * k, ((c >> 8) & 255) * k, ((c >> 16) & 255) * k);
}

/** Pig iron: great cast blocks, dark and mottled, casting seams, a bloom of rust here and there. */
function pigIron(t: Terrain, x: number, y: number): number {
  const px = ((x % 24) + 24) % 24;
  const py = ((y % 24) + 24) % 24;
  let k = (0.82 + 0.3 * noise(x, y, 6, 81)) * (0.94 + 0.1 * h(x, y, 82));
  if (px === 0 || py === 0) k *= 0.6;
  else if (px === 1 || py === 1) k *= 1.18;
  if (h(x, y, 83) < 0.03) k *= 0.7; // casting pit
  k *= bevel(t, x, y) * (1 - grime(t, x, y) * 0.5);
  const rust = Math.max(0, noise(x, y, 14, 84) - 0.62) * 2.4;
  return abgr((88 + rust * 70) * k, (84 + rust * 22) * k, (94 - rust * 30) * k);
}

/** Sandbags: 8x4 bags laid in staggered courses, burlap weave, dark where they meet. */
function sandbag(t: Terrain, x: number, y: number): number {
  const course = Math.floor(y / 4);
  const ox = x + (course & 1) * 4;
  const px = ((ox % 8) + 8) % 8;
  const py = ((y % 4) + 4) % 4;
  let k = 0.9 + 0.12 * h(x, y, 85);
  if ((x + y) & 1) k *= 0.95; // weave
  if (px === 0 || py === 3) k *= 0.62; // between bags
  else if (py === 0) k *= 1.14; // the bag's rounded top
  else if (px === 7 || px === 1) k *= 0.85;
  if (matAt(t, x, y - 1) === Mat.Air) k *= 1.12;
  const tint = (h(Math.floor(ox / 8), course, 86) - 0.5) * 22; // each bag its own shade
  return abgr(150 * k + tint, 132 * k + tint * 0.8, 92 * k + tint * 0.4);
}

/** A sliding steel door: heavy horizontal slats with dark seams, a band of studs. */
function doorSteel(t: Terrain, x: number, y: number): number {
  const py = ((y % 6) + 6) % 6;
  let k = 0.9 + 0.08 * h(Math.floor(x / 2), y, 87);
  if (py === 5) k *= 0.5;
  else if (py === 0) k *= 1.22;
  else if (py === 2 && ((x % 4) + 4) % 4 === 1) k *= 1.4; // a stud
  if (matAt(t, x - 1, y) !== Mat.Door) k *= 1.15;
  if (matAt(t, x + 1, y) !== Mat.Door) k *= 0.7;
  return abgr(112 * k, 124 * k, 132 * k);
}

/** A built solid (concrete, steel, pig iron, sandbags, a door, ancient cobble or temple stone) at (x, y). */
export function structColor(t: Terrain, m: number, x: number, y: number): number {
  if (m === Mat.Iron) return pigIron(t, x, y);
  if (m === Mat.Sandbag) return sandbag(t, x, y);
  if (m === Mat.Door) return doorSteel(t, x, y);
  if (m === Mat.Cobble) return cobble(t, x, y);
  if (m === Mat.Glyph) return glyphStone(t, x, y);
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
  if (kind === 3 || kind === 4) {
    // The labyrinth's back walls: the same stone as its walls, deep in shadow (temple halls a warmer dark).
    const c = kind === 3 ? glyphStone(t, x, y) : cobble(t, x, y);
    const s = k * 0.38;
    return abgr((c & 255) * s, ((c >> 8) & 255) * s, ((c >> 16) & 255) * s);
  }
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
