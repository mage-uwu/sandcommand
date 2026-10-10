/**
 * The scenery behind the battlefield, Cortex Command / Metal Slug style, on
 * an alien world: pixel-art parallax layers over the sky gradient. A ringed
 * gas giant and two small moons hang in the sky; far dusty-rose ranges lit
 * from the top left with frost on the peaks, a darker maroon range in front
 * of them, rust mesas, buttes and needle spires nearer still, and thin
 * wisps of dust drifting across. Each layer is baked once into a
 * horizontally seamless tile, one pixel per world cell, and drawn scaled up
 * with no smoothing.
 */

/** 4x4 ordered-dither thresholds (0..15): the classic 16-bit fade. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Tile width (cells): every layer repeats with this period. */
const TW = 1024;
/** worldgen's Biome.Deadland (not imported: this module stays free of worldgen). */
const DEADLAND = 4;

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
  // Needle spires (hoodoos) between them: thin and sheer, a knob on top.
  for (let i = 0; i < 14; i++) {
    const cx = hash(i, s + 11) * TW;
    const w = 2 + hash(i, s + 12) * 3;
    const top = 30 + hash(i, s + 13) * (height - 36);
    for (let x = Math.floor(cx - w - 2); x <= cx + w + 2; x++) {
      const xx = ((x % TW) + TW) % TW;
      const dx = Math.abs(x - cx);
      const v = dx <= w ? top - dx * 1.5 + (dx < 1.5 ? 3 : 0) : top * 0.3 - (dx - w) * 2;
      h[xx] = Math.max(h[xx], v);
    }
  }
  for (let x = 0; x < TW; x++) h[x] = Math.max(h[x], 8 + noise1(x, 64, s + 5) * 14) + (noise1(x, 6, s + 6) - 0.5) * 2;
  const lit: RGB = [186, 100, 66];
  const base: RGB = [148, 74, 52];
  const shade: RGB = [108, 52, 44];
  const band: RGB = [126, 60, 46];
  const rim: RGB = [214, 134, 88];
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

/** Wisps of high dust: long, flat, thin puffs, lit on top (the clouds of a thin, dry sky). */
function clouds(height: number, s: number): HTMLCanvasElement {
  const W = TW * 2;
  const light: RGB = [246, 214, 198];
  const mid: RGB = [222, 182, 172];
  const dark: RGB = [184, 140, 146];
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
    // (Squashed flat and drawn out: wisps, not cumulus.)
    const rx = r * 2.2;
    const ry = r * 0.4;
    for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(height, cy + ry * 0.7); y++) {
      for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) occ[y * W + ((x % W) + W) % W] = 1;
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
        d[y * W + x] = rgb(c, 190);
      }
    }
  });
}

/**
 * The sky's bodies, fixed far off: a ringed gas giant low over the hills,
 * banded lavender and teal, lit from the upper left and dithered into
 * shadow, its ring tilted across it (behind it above, in front below); and
 * two small cratered moons.
 */
function heavens(height: number): HTMLCanvasElement {
  const W = TW * 2;
  return canvasOf(W, height, (d) => {
    const put = (x: number, y: number, c: number) => {
      if (y >= 0 && y < height) d[y * W + (((x % W) + W) % W)] = c;
    };
    // The giant. (This layer barely moves, so only its first few hundred
    // cells, and the last few before them, are ever on screen: it hangs there.)
    const gx = 150;
    const gy = height - 96;
    const R = 30;
    const bands: RGB[] = [
      [196, 176, 214],
      [150, 170, 196],
      [214, 196, 206],
      [132, 150, 182],
      [182, 164, 204],
      [120, 162, 170],
    ];
    const tilt = -0.32;
    const tc = Math.cos(tilt);
    const ts = Math.sin(tilt);
    for (let y = gy - R * 2; y < gy + R * 2; y++) {
      for (let x = gx - R * 2; x < gx + R * 2; x++) {
        const dx = x - gx;
        const dy = y - gy;
        // The ring: a band of a tilted, flattened ellipse round the centre.
        const u = dx * tc - dy * ts;
        const v = dx * ts + dy * tc;
        const rr = Math.hypot(u, v / 0.22);
        const rk = rr > R * 1.35 && rr < R * 1.95 ? (rr < R * 1.62 ? 1 : 2) : 0;
        const front = rk !== 0 && v > 0;
        if (dx * dx + dy * dy <= R * R && !front) {
          const b = bands[Math.max(0, Math.floor((dy / R + 1) * 3.2 + Math.sin(dx * 0.07) * 0.3)) % bands.length];
          // Lit from the upper left: a terminator dithered across the lower right.
          const lit = Math.max(0, Math.min(1, (-dx * 0.75 - dy * 0.45) / R + 0.55));
          const dark = lit < 0.15 || (lit < 0.45 && (0.45 - lit) * 32 > BAYER[(y & 3) * 4 + (x & 3)]);
          const k = dark ? 0.42 : 1;
          // (Through the dusty air: a little of the sky shows through it.)
          put(x, y, px(Math.round(b[0] * k), Math.round(b[1] * k), Math.round(b[2] * k), 205));
        } else if (rk) put(x, y, rk === 1 ? px(226, 206, 196, 170) : px(186, 160, 168, 120));
      }
    }
    // Two moons: a lumpy grey one, and a speck further off.
    const moon = (mx: number, my: number, r: number, s: number) => {
      for (let y = my - r - 1; y <= my + r + 1; y++) {
        for (let x = mx - r - 1; x <= mx + r + 1; x++) {
          const dx = x - mx;
          const dy = y - my;
          const lump = r * (1 + (hash(Math.round(Math.atan2(dy, dx) * 3) + 8, s) - 0.5) * 0.25);
          if (dx * dx + dy * dy > lump * lump) continue;
          const c = hash(x * 7 + y, s + 1) < 0.08 ? 120 : dx + dy * 0.5 > r * 0.3 ? 132 : 188;
          put(x, y, px(c, Math.round(c * 0.95), Math.round(c * 0.92)));
        }
      }
    };
    moon(36, 112, 6, 5);
    moon(W - 110, 92, 3, 9);
  });
}

/**
 * The deadland's skyline: the Progenitors' monuments on the horizon, a
 * Landscape of Thorns in silhouette. Colossal three-armed caltrops (on two
 * legs, or stabbed in on one), thorn spikes, tilted slabs, over low rubble.
 * Lit on their left faces, shaded on their right, as the mountains are.
 */
function thorns(height: number, s: number, scale: number, col: { lit: RGB; base: RGB; shade: RGB }): HTMLCanvasElement {
  type Quad = [number, number][];
  const shapes: Quad[] = [];
  const ground = new Float32Array(TW);
  for (let x = 0; x < TW; x++) ground[x] = 6 + noise1(x, 70, s + 1) * 10 + (noise1(x, 9, s + 2) - 0.5) * 3;
  const armQuad = (x: number, y: number, a: number, len: number, w: number): Quad => {
    const c = Math.cos(a);
    const n = Math.sin(a);
    const w1 = w * 0.65;
    return [
      [x - n * w, y + c * w],
      [x + c * len - n * w1, y + n * len + c * w1],
      [x + c * len + n * w1, y + n * len - c * w1],
      [x + n * w, y - c * w],
    ];
  };
  const count = Math.round(16 / scale);
  for (let i = 0; i < count; i++) {
    const cx = (i + 0.15 + hash(i, s + 3) * 0.7) * (TW / count);
    const g = height - 1 - ground[Math.floor(cx) % TW];
    const kind = hash(i, s + 4);
    if (kind < 0.55) {
      const len = (20 + hash(i, s + 5) * 26) * scale;
      const w = (4 + hash(i, s + 6) * 3) * scale;
      const rot = hash(i, s + 7) * Math.PI * 2;
      const dirs = [0, 1, 2].map((k) => rot + (k * Math.PI * 2) / 3);
      const low = Math.max(...dirs.map((a) => Math.sin(a)));
      const hy = g - low * len + 4 * scale;
      for (const a of dirs) shapes.push(armQuad(cx, hy, a, len, w));
      shapes.push(armQuad(cx - w, hy, 0, w * 2, w)); // the hub
    } else if (kind < 0.8) {
      const n = 3 + Math.floor(hash(i, s + 8) * 4);
      for (let k = 0; k < n; k++) {
        const sx = cx + (k - n / 2) * 4 * scale;
        const h = (16 + hash(i * 7 + k, s + 9) * 34) * scale;
        const lean = (hash(i * 7 + k, s + 10) - 0.5) * 0.5;
        const w = (1.5 + hash(i * 7 + k, s + 11) * 1.5) * scale;
        shapes.push([
          [sx - w, g + 3],
          [sx + w, g + 3],
          [sx + lean * h + 0.4, g - h],
          [sx + lean * h - 0.4, g - h],
        ]);
      }
    } else {
      const hw = (16 + hash(i, s + 12) * 18) * scale;
      const hh = (4 + hash(i, s + 13) * 4) * scale;
      const a = (hash(i, s + 14) < 0.5 ? -1 : 1) * (0.1 + hash(i, s + 15) * 0.35);
      const c = Math.cos(a);
      const n = Math.sin(a);
      const y = g - hh * 0.6;
      shapes.push([
        [cx - c * hw + n * hh, y - n * hw - c * hh],
        [cx + c * hw + n * hh, y + n * hw - c * hh],
        [cx + c * hw - n * hh, y + n * hw + c * hh],
        [cx - c * hw - n * hh, y - n * hw + c * hh],
      ]);
    }
  }
  // Rasterize: a pixel is solid if it's in the rubble or inside any shape (wrapping round the layer's width).
  const solid = new Uint8Array(TW * height);
  for (let x = 0; x < TW; x++) for (let y = Math.floor(height - 1 - ground[x]); y < height; y++) solid[y * TW + x] = 1;
  const inQuad = (q: Quad, x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
      const [xi, yi] = q[i];
      const [xj, yj] = q[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  for (const q of shapes) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [x, y] of q) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(height - 1, Math.ceil(y1)); y++) {
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) if (inQuad(q, x + 0.5, y + 0.5)) solid[y * TW + (((x % TW) + TW) % TW)] = 1;
    }
  }
  return canvasOf(TW, height, (d) => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < TW; x++) {
        if (!solid[y * TW + x]) continue;
        const l = solid[y * TW + ((x + TW - 1) % TW)];
        const r = solid[y * TW + ((x + 1) % TW)];
        const c = !l ? col.lit : !r ? col.shade : col.base;
        // A little dither in the deep of the rubble.
        d[y * TW + x] = rgb((BAYER[(y & 3) * 4 + (x & 3)] & 7) === 0 && y > height - 6 ? col.shade : c);
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
  /** Which biome's skyline (worldgen Biome): the deadland has its own. */
  private biome = -1;

  /** Show the skyline for `biome` (rebuilt only when it changes). */
  setBiome(biome: number): void {
    if (biome === this.biome) return;
    this.biome = biome;
    this.layers = null;
  }

  private build(): Layer[] {
    if (this.biome === DEADLAND) {
      // Ash-grey ranges far off, and in front of them the monuments on the horizon, nearer and darker.
      return [
        { img: heavens(220), f: 0.02, base: 330, fill: '', drift: 0 },
        { img: clouds(110, 41), f: 0.05, base: 250, fill: '', drift: 3 },
        { img: mountains(130, 90, [260, 120, 60, 24], 11, { lit: [150, 146, 140], base: [124, 120, 118], shade: [102, 98, 100] }), f: 0.12, base: 400, fill: 'rgb(124,120,118)', drift: 0 },
        { img: thorns(190, 61, 1.8, { lit: [138, 136, 130], base: [106, 104, 100], shade: [80, 78, 78] }), f: 0.25, base: 425, fill: 'rgb(106,104,100)', drift: 0 },
        { img: thorns(240, 83, 2.8, { lit: [120, 118, 112], base: [80, 78, 76], shade: [56, 54, 56] }), f: 0.42, base: 455, fill: 'rgb(80,78,76)', drift: 0 },
      ];
    }
    return [
      { img: heavens(220), f: 0.02, base: 330, fill: '', drift: 0 },
      { img: clouds(110, 41), f: 0.05, base: 250, fill: '', drift: 3 },
      {
        img: mountains(150, 125, [260, 120, 60, 24], 11, { lit: [178, 124, 138], base: [146, 96, 116], shade: [120, 76, 100], snow: [238, 222, 230], snowShade: [196, 170, 196], snowline: 92 }),
        f: 0.12,
        base: 400,
        fill: 'rgb(146,96,116)',
        drift: 0,
      },
      { img: mountains(105, 80, [180, 80, 34, 14], 23, { lit: [140, 78, 84], base: [112, 60, 70], shade: [90, 46, 60] }), f: 0.25, base: 425, fill: 'rgb(112,60,70)', drift: 0 },
      { img: mesas(85, 37), f: 0.42, base: 455, fill: 'rgb(108,52,44)', drift: 0 },
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
