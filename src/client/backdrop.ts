/**
 * The scenery behind the battlefield, Cortex Command / Metal Slug style:
 * pixel-art parallax layers over the sky gradient. Far blue mountain ranges
 * lit from the top left with snow on the peaks, a darker range in front of
 * them, sandstone mesas and buttes nearer still, and puffy pixel clouds
 * drifting across. Each layer is baked once into a horizontally seamless
 * tile, one pixel per world cell, and drawn scaled up with no smoothing.
 */

/** 4x4 ordered-dither thresholds (0..15): the classic 16-bit fade. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Tile width (cells): every layer repeats with this period. */
const TW = 1024;

function hash(x: number, s: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(s, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Periodic 1D value noise with period TW, in [0, 1). */
function noise1(x: number, scale: number, s: number): number {
  const cells = Math.max(1, Math.round(TW / scale));
  const f = (((x / TW) * cells) % cells + cells) % cells;
  const i = Math.floor(f);
  let t = f - i;
  t = t * t * (3 - 2 * t);
  return hash(i, s) + (hash((i + 1) % cells, s) - hash(i, s)) * t;
}

/** Fractal ridge profile: elevation (cells above the layer's base) per column, seamless. */
function ridge(amp: number, scales: number[], s: number): Float32Array {
  const h = new Float32Array(TW);
  for (let x = 0; x < TW; x++) {
    let v = 0;
    let a = 1;
    let sum = 0;
    for (let k = 0; k < scales.length; k++) {
      // Sharpen into peaks: fold the noise around its middle.
      const n = noise1(x, scales[k], s + k * 17);
      v += (1 - Math.abs(n * 2 - 1)) * a;
      sum += a;
      a *= 0.5;
    }
    h[x] = (v / sum) * amp;
  }
  return h;
}

type RGB = readonly [number, number, number];
const px = (r: number, g: number, b: number, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const rgb = (c: RGB, a = 255) => px(c[0], c[1], c[2], a);

function canvasOf(w: number, h: number, paint: (data: Uint32Array) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  paint(new Uint32Array(img.data.buffer));
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * A mountain range in faceted pixel-art style: every column belongs to its
 * nearest peak; the face toward the light (left of the peak) is lit, the far
 * face shaded, split by a line slanting down from the summit, crags picked
 * out along the ridge, deep rock dithered into the base colour, and snow on
 * the high peaks with a ragged lower edge.
 */
function mountains(height: number, amp: number, scales: number[], s: number, col: { lit: RGB; base: RGB; shade: RGB; snow?: RGB; snowShade?: RGB; snowline?: number }): HTMLCanvasElement {
  const h = ridge(amp, scales, s);
  // Peaks: local maxima over a small window.
  const peaks: number[] = [];
  for (let x = 0; x < TW; x++) {
    let top = true;
    for (let k = -6; k <= 6 && top; k++) if (k && h[(x + k + TW) % TW] > h[x]) top = false;
    if (top) peaks.push(x);
  }
  // Each column's governing peak: the nearest one by distance, weighed by height.
  const peakOf = new Int32Array(TW);
  for (let x = 0; x < TW; x++) {
    let best = 0;
    let bestScore = Infinity;
    for (const p of peaks) {
      let dx = Math.abs(x - p);
      dx = Math.min(dx, TW - dx);
      const score = dx - h[p] * 0.4;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    peakOf[x] = best;
  }
  return canvasOf(TW, height, (d) => {
    for (let x = 0; x < TW; x++) {
      const top = Math.round(height - 1 - h[x]);
      const p = peakOf[x];
      let dx = x - p;
      if (dx > TW / 2) dx -= TW;
      if (dx < -TW / 2) dx += TW;
      const peakTop = height - 1 - h[p];
      for (let y = Math.max(0, top); y < height; y++) {
        const depth = y - top;
        const elev = height - 1 - y;
        // The light/shade split runs from the summit down and slightly out.
        const split = (y - peakTop) * 0.28 + (hash(y >> 2, p + s) - 0.5) * 3;
        let c: RGB = dx < split ? col.lit : col.shade;
        // Far below the ridge the faces fade into the range's base colour (dithered).
        const fade = (depth - 22) / 30;
        if (fade > 0 && (fade >= 1 || fade * 16 > BAYER[(y & 3) * 4 + (x & 3)])) c = col.base;
        // Crags: a darker lip just under the ridge here and there.
        if (depth === 1 && hash(x >> 2, s + 3) < 0.35) c = col.shade;
        if (col.snow && col.snowline !== undefined && elev > col.snowline + hash(x >> 1, s + 7) * 7 && depth < 24) {
          c = dx < split ? col.snow : col.snowShade!;
        }
        d[y * TW + x] = rgb(c);
      }
    }
  });
}

/**
 * Sandstone mesas and buttes: flat tops on sheer cliffs over talus slopes,
 * banded with strata, lit from the left.
 */
function mesas(height: number, s: number): HTMLCanvasElement {
  const h = new Float32Array(TW);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.2 + hash(i, s) * 0.6) * (TW / n);
    const w = 14 + hash(i, s + 1) * 46;
    const top = 26 + hash(i, s + 2) * (height - 40);
    for (let x = 0; x < TW; x++) {
      let dx = Math.abs(x - cx);
      dx = Math.min(dx, TW - dx);
      const cliff = top - Math.max(0, dx - w) * 3.2; // sheer sides
      const talus = top * 0.45 - Math.max(0, dx - w) * 0.55; // the scree fan below
      h[x] = Math.max(h[x], cliff, talus);
    }
  }
  for (let x = 0; x < TW; x++) h[x] = Math.max(h[x], 8 + noise1(x, 64, s + 5) * 14) + (noise1(x, 6, s + 6) - 0.5) * 2;
  const lit: RGB = [178, 128, 92];
  const base: RGB = [144, 100, 74];
  const shade: RGB = [108, 74, 60];
  const band: RGB = [122, 84, 64];
  const rim: RGB = [206, 156, 112];
  return canvasOf(TW, height, (d) => {
    for (let x = 0; x < TW; x++) {
      const top = Math.round(height - 1 - h[x]);
      const rise = h[(x + 1) % TW] - h[(x + TW - 1) % TW];
      for (let y = Math.max(0, top); y < height; y++) {
        const elev = height - 1 - y;
        let c: RGB = rise > 0.5 ? lit : rise < -0.5 ? shade : base;
        // Strata: horizontal bands, slightly wavy.
        if ((elev + Math.round(noise1(x, 40, s + 8) * 3)) % 9 === 0) c = c === lit ? base : band;
        if (y === top) c = rim;
        d[y * TW + x] = rgb(c);
      }
    }
  });
}

/** Puffy pixel cumulus: a cluster of round puffs on a flat base, lit on top. */
function clouds(height: number, s: number): HTMLCanvasElement {
  const W = TW * 2;
  const light: RGB = [246, 248, 252];
  const mid: RGB = [214, 226, 240];
  const dark: RGB = [176, 192, 220];
  const occ = new Uint8Array(W * height);
  const puffs: [number, number, number][] = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const cx = (i + hash(i, s) * 0.7) * (W / n);
    const cy = 20 + hash(i, s + 1) * (height - 50);
    const size = 8 + hash(i, s + 2) * 14;
    const k = 3 + Math.floor(hash(i, s + 3) * 5);
    for (let j = 0; j < k; j++) puffs.push([cx + (j - k / 2) * size * 0.9 + hash(j, i + s) * 6, cy - hash(i, j + s + 9) * size * 0.6, size * (0.6 + hash(j, i + s + 4) * 0.6)]);
    puffs.push([cx, cy + size * 0.2, size * 0.8]);
  }
  for (const [cx, cy, r] of puffs) {
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(height, cy + r * 0.55); y++) {
      for (let x = Math.floor(cx - r); x < cx + r; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) occ[y * W + ((x % W) + W) % W] = 1;
      }
    }
  }
  return canvasOf(W, height, (d) => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < W; x++) {
        if (!occ[y * W + x]) continue;
        // Light from above: the top rim bright, the underside in shade.
        const up = y > 1 && occ[(y - 2) * W + x];
        const down = y < height - 2 && occ[(y + 2) * W + x];
        const c = !up ? light : !down ? dark : mid;
        d[y * W + x] = rgb(c, 235);
      }
    }
  });
}

interface Layer {
  img: HTMLCanvasElement;
  /** Parallax factor (0 = fixed to the sky, 1 = moves with the world). */
  f: number;
  /** World y of the layer's bottom edge (where it meets the ground beyond). */
  base: number;
  /** Fill below the tile, so the layer reaches the bottom of the screen. */
  fill: string;
  /** Drift, cells per second (clouds). */
  drift: number;
}

export class Backdrop {
  private layers: Layer[] | null = null;

  private build(): Layer[] {
    return [
      { img: clouds(110, 41), f: 0.05, base: 250, fill: '', drift: 3 },
      {
        img: mountains(150, 125, [260, 120, 60, 24], 11, { lit: [132, 150, 196], base: [104, 120, 170], shade: [86, 100, 152], snow: [236, 240, 250], snowShade: [184, 196, 228], snowline: 92 }),
        f: 0.12,
        base: 400,
        fill: 'rgb(104,120,170)',
        drift: 0,
      },
      { img: mountains(105, 80, [180, 80, 34, 14], 23, { lit: [110, 106, 150], base: [86, 82, 126], shade: [70, 64, 108] }), f: 0.25, base: 425, fill: 'rgb(86,82,126)', drift: 0 },
      { img: mesas(85, 37), f: 0.42, base: 455, fill: 'rgb(108,74,60)', drift: 0 },
    ];
  }

  /**
   * Draw every layer for a camera at world (camX, camY), zoom `z`, onto a
   * W x H device-pixel view. Call after the sky gradient, before the world.
   */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, camX: number, camY: number, z: number, now: number): void {
    this.layers ??= this.build();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    for (const L of this.layers) {
      const tw = L.img.width;
      // Layer-space x of the screen's left edge, and the screen y of the layer's bottom.
      const lx = camX * L.f + (now / 1000) * L.drift - W / 2 / z;
      const bottom = Math.round(H / 2 + (L.base - camY * L.f - 300 * (1 - L.f)) * z);
      const top = bottom - L.img.height * z;
      if (top > H) continue;
      const start = Math.floor(lx / tw) * tw;
      for (let x = start; x < lx + W / z; x += tw) {
        ctx.drawImage(L.img, Math.round((x - lx) * z), top, tw * z, L.img.height * z);
      }
      if (L.fill && bottom < H) {
        ctx.fillStyle = L.fill;
        ctx.fillRect(0, bottom, W, H - bottom);
      }
    }
  }
}
