/**
 * The possessed, in pixels: not a new sprite, but the coral grown onto the
 * clone's own. Each body sprite (and each arm-and-gun sprite) a possessed
 * clone is drawn with is read pixel by pixel, and an infected copy of it
 * made to lay over it, fitted exactly to its shape:
 *
 * - **Pallor.** Its colours drained to a dead grey-violet (the shading kept).
 * - **The crust.** Coral spreading from where the crab went in (the back of
 *   the shoulder, the pack, the back of the head, the back leg): a ragged
 *   crust in one strain's colours (pink, teal or emerald), darker at its
 *   edges, flecked bright.
 * - **Veins.** Dark tendrils running on past the crust's edge.
 * - **The crab's legs**, clutching round its back and chest.
 * - **Spines.** Branching coral grown out past its outline (off the back of
 *   the head, the shoulder and the pack), dark at the root, bright at the tips.
 * - **Its eye**, a coral glow; its mouth, black (the drool is drawn live).
 *
 * Cached per source sprite and strain; the copy has a margin (M) round it for
 * the spines.
 */

/** The margin round an infected copy (for the spines). */
export const M = 4;

/** A coral strain (pink, teal, emerald): dark, mid, light, tip. */
const STRAINS: readonly (readonly [number, number, number])[][] = [
  [
    [0x3a, 0x0c, 0x24],
    [0xb0, 0x30, 0x60],
    [0xff, 0x6a, 0x9a],
    [0xff, 0xd0, 0xe0],
  ],
  [
    [0x06, 0x2a, 0x28],
    [0x16, 0x96, 0x88],
    [0x4a, 0xe0, 0xc8],
    [0xc8, 0xff, 0xf4],
  ],
  [
    [0x0a, 0x2a, 0x12],
    [0x1a, 0x8a, 0x40],
    [0x56, 0xd8, 0x78],
    [0xd0, 0xff, 0xd8],
  ],
];
const VEIN: readonly [number, number, number] = [0x24, 0x0a, 0x22];
/** Rot: dark patches in the dead flesh. */
const ROT: readonly [number, number, number] = [0x3a, 0x2c, 0x34];
/** A spine's stalk: dead, dark coral. */
const STALK: readonly [number, number, number] = [0x34, 0x1c, 0x28];
const CRAB_LEG: readonly [number, number, number] = [0x6a, 0x22, 0x3a];
const MOUTH: readonly [number, number, number] = [0x10, 0x04, 0x0a];

/** A fixed hash in [0, 1) of a few integers. */
const hsh = (a: number, b: number, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export interface Infected {
  c: HTMLCanvasElement;
  /** Where its mouth is on the source sprite (null: no head), for the drool. */
  mouth: { x: number; y: number } | null;
}

const bodies = new WeakMap<HTMLCanvasElement, Infected[]>();
const arms = new WeakMap<HTMLCanvasElement, HTMLCanvasElement[]>();

function pixels(src: HTMLCanvasElement): Uint8ClampedArray {
  return src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
}

/** The dead grey-violet a colour drains to (its shading kept). */
function pallor(r: number, g: number, b: number): [number, number, number] {
  const l = 0.3 * r + 0.55 * g + 0.15 * b;
  return [Math.round(l * 0.5 + 40), Math.round(l * 0.48 + 38), Math.round(l * 0.5 + 44)];
}

/**
 * An infected copy of a clone's body sprite (10x16, facing `left` as baked),
 * in strain `strain`: drawn over the sprite at (-M, -M) from where it goes.
 */
export function infectBody(src: HTMLCanvasElement, left: boolean, strain: number): Infected {
  let list = bodies.get(src);
  if (!list) bodies.set(src, (list = []));
  const s = ((strain % STRAINS.length) + STRAINS.length) % STRAINS.length;
  if (list[s]) return list[s];
  const w = src.width;
  const h = src.height;
  const px = pixels(src);
  const W = w + M * 2;
  const H = h + M * 2;
  const out = new Uint8ClampedArray(W * H * 4);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] > 0;
  const put = (x: number, y: number, c: readonly number[], a = 255) => {
    const X = x + M;
    const Y = y + M;
    if (X < 0 || Y < 0 || X >= W || Y >= H) return;
    const i = (Y * W + X) * 4;
    out[i] = c[0];
    out[i + 1] = c[1];
    out[i + 2] = c[2];
    out[i + 3] = a;
  };
  // (The grid faces right: front at high x. Baked facing left, mirrored.)
  const gx = (x: number) => (left ? w - 1 - x : x);
  const pal = STRAINS[s];
  // Where the crab went in, and where the coral spreads from (grid space): the back of
  // the shoulder, the pack, the back of the head, the back leg; each with its reach.
  const seeds: [number, number, number][] = [
    [2, 5, 2.4],
    [1, 8, 1.8],
    [3, 1, 1.5],
    [4, 13, 1.1 + (s === 1 ? 0.6 : 0)],
    [6, 8, s === 2 ? 1.3 : 0.5],
  ];
  const field = (x: number, y: number) => {
    let f = Infinity;
    for (const [sx, sy, r] of seeds) f = Math.min(f, Math.hypot(gx(x) - sx, y - sy) / r);
    return f + (hsh(x >> 1, y >> 1, 77 + s) - 0.5) * 0.5;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      const i = (y * w + x) * 4;
      const outline = px[i] + px[i + 1] + px[i + 2] < 90;
      const f = field(x, y);
      const n = hsh(x, y, 13 + s);
      if (f < 1) {
        // The crust: dark at its ragged edge, flecked bright, the odd bare patch of pallid skin.
        if (outline) put(x, y, pal[0]);
        else if (f > 0.7) put(x, y, n < 0.6 ? pal[0] : pal[1]);
        else put(x, y, n < 0.08 ? pal[3] : n < 0.3 ? pal[2] : n < 0.75 ? pal[1] : pal[0]);
        continue;
      }
      if (outline) continue; // (its outline stays its own)
      // Veins, branching on past the crust's edge.
      if (f < 1.8 && (gx(x) + y * 2) % 5 === 0 && n < 0.6) {
        put(x, y, VEIN);
        continue;
      }
      // Dead flesh, rotting in patches.
      put(x, y, hsh(x >> 1, (y + 1) >> 1, 5 + s) < 0.22 ? ROT : pallor(px[i], px[i + 1], px[i + 2]));
    }
  }
  // The crab's legs, clutching round from its back over the chest.
  for (const [y0, y1] of [
    [5, 3],
    [6, 7],
    [8, 10],
  ]) {
    for (let k = 0; k <= 5; k++) {
      const x = gx(2 + k);
      const y = Math.round(y0 + ((y1 - y0) * k) / 5);
      if (solid(x, y)) put(x, y, k === 2 ? pal[2] : CRAB_LEG);
    }
  }
  // Spines: branching coral grown out of it, off the back of the head, the shoulder and the pack.
  // (Each step joins the last, bending now and then: coral, not a nail; a dead stalk, live tips.)
  const spine = (x0: number, y0: number, dx: number, dy: number, len: number, k: number) => {
    let x = x0;
    let y = y0;
    for (let n = 1; n <= len; n++) {
      const bend = hsh(k, n, 41 + s) < 0.4;
      x += bend && dy !== 0 ? 0 : dx;
      y += bend && dy === 0 ? -1 : dy;
      put(gx(x), y, n === len ? pal[3] : n === len - 1 ? pal[2] : STALK);
      // A twig off the stalk, half way.
      if (n === 2 && len > 3) put(gx(x + dx), y - 1, pal[2]);
    }
  };
  if (solid(gx(3), 0)) spine(3, 0, -1, -1, 3 + (s === 0 ? 1 : 0), 1);
  spine(1, 5, -1, -1, 4, 3);
  spine(0, 8, -1, 0, 2 + (s === 2 ? 1 : 0), 4);
  // Its eye: a coral glow where the visor (or the eye) was. Its mouth: black.
  let mouth: { x: number; y: number } | null = null;
  if (solid(gx(6), 2) || solid(gx(6), 3)) {
    // (A sunken socket round it.)
    put(gx(6), 2, MOUTH);
    put(gx(6), 3, MOUTH);
    put(gx(7), 3, VEIN);
    put(gx(7), 2, pal[3]);
    put(gx(6), 4, MOUTH);
    mouth = { x: gx(6), y: 4 };
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const img = new ImageData(out, W, H);
  c.getContext('2d')!.putImageData(img, 0, 0);
  return (list[s] = { c, mouth });
}

/**
 * An infected copy of an arm-and-gun sprite (square, 2r across, pivot at its
 * middle): the arm (out from the shoulder to the hand) drained and crusted,
 * the gun left as it is.
 */
export function infectArm(src: HTMLCanvasElement, r: number, strain: number): HTMLCanvasElement {
  let list = arms.get(src);
  if (!list) arms.set(src, (list = []));
  const s = ((strain % STRAINS.length) + STRAINS.length) % STRAINS.length;
  if (list[s]) return list[s];
  const w = src.width;
  const h = src.height;
  const px = pixels(src);
  const out = new Uint8ClampedArray(w * h * 4);
  const pal = STRAINS[s];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] === 0) continue;
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r);
      if (d > 3.2) continue;
      const n = hsh(x, y, 91 + s);
      const c = d < 1.6 && n < 0.7 ? (n < 0.15 ? pal[3] : pal[1]) : px[i] + px[i + 1] + px[i + 2] < 90 ? pal[0] : pallor(px[i], px[i + 1], px[i + 2]);
      out[i] = c[0];
      out[i + 1] = c[1];
      out[i + 2] = c[2];
      out[i + 3] = 255;
    }
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(out, w, h), 0, 0);
  return (list[s] = c);
}
