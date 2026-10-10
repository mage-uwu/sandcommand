/**
 * The rock face behind the ground: what shows wherever a cave, a tunnel or a
 * crater has been opened below the surface. A seamless 256-cell tile, one
 * pixel a cell like the terrain, drawn in world space so it stays put as the
 * camera moves:
 *
 * - fractured blocks of rock (a cellular pattern), each lit from the top left
 *   with a dark fissure round it;
 * - rust soil drifting into darker basalt in big soft patches, with faint
 *   strata running through both;
 * - the odd glint of a mineral speck.
 *
 * It's kept well darker than the terrain in front, and sinks into deeper
 * dark the further down it is (drawBackwall's overlay), so the playfield
 * always reads in front of it.
 */

export const TILE = 256;
const CELL = 16; // fracture blocks: TILE / CELL per side, so it wraps
const N = TILE / CELL;

function hash(x: number, y: number, s: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Tileable value noise over `period` lattice cells. */
function noise(x: number, y: number, scale: number, s: number): number {
  const period = TILE / scale;
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  let tx = fx - ix;
  let ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const w = (v: number) => ((v % period) + period) % period;
  const a = hash(w(ix), w(iy), s);
  const b = hash(w(ix + 1), w(iy), s);
  const c = hash(w(ix), w(iy + 1), s);
  const d = hash(w(ix + 1), w(iy + 1), s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** The tile's pixels (RGBA). Pure, so it can be tested without a DOM. */
export function backwallPixels(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(TILE * TILE * 4);
  // One feature point per block, jittered.
  const fx = new Float32Array(N * N);
  const fy = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      fx[j * N + i] = (i + 0.15 + 0.7 * hash(i, j, 1)) * CELL;
      fy[j * N + i] = (j + 0.15 + 0.7 * hash(i, j, 2)) * CELL;
    }
  }
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      // Nearest and second-nearest feature (wrapping).
      const ci = Math.floor(x / CELL);
      const cj = Math.floor(y / CELL);
      let d1 = 1e9;
      let d2 = 1e9;
      let best = 0;
      let bx = 0;
      let by = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = ci + di;
          const j = cj + dj;
          const k = (((j % N) + N) % N) * N + (((i % N) + N) % N);
          const px0 = fx[k] + (i < 0 ? -TILE : i >= N ? TILE : 0);
          const py0 = fy[k] + (j < 0 ? -TILE : j >= N ? TILE : 0);
          const d = Math.hypot(x - px0, y - py0);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = k;
            bx = px0;
            by = py0;
          } else if (d < d2) d2 = d;
        }
      }
      // Soil or basalt, in soft patches; faint strata through it.
      const patch = noise(x, y, 64, 3) * 0.7 + noise(x, y, 16, 4) * 0.3;
      const basalt = Math.max(0, Math.min(1, (patch - 0.42) * 3));
      let r = 104 - basalt * 34;
      let g = 56 - basalt * 6;
      let b = 42 + basalt * 18;
      const strata = Math.sin(((y + noise(x, y, 32, 5) * 22) * Math.PI * 2) / 37);
      let k = 0.92 + strata * 0.06;
      // Each block lit from the top left (toward its centre from there), with its own shade.
      k *= 0.86 + 0.2 * hash(best, 0, 6);
      const lx = (bx - x) / CELL;
      const ly = (by - y) / CELL;
      k *= 1 + (lx + ly) * 0.18;
      // Fissures between blocks: dark, with a lit lip on their lower side.
      const edge = d2 - d1;
      if (edge < 1.1) k *= 0.42;
      else if (edge < 2.1) k *= by > y ? 0.8 : 1.14;
      // Grit.
      k *= 0.94 + 0.12 * hash(x, y, 7);
      // A mineral glint now and then.
      const sp = hash(x, y, 8);
      if (sp > 0.9975) {
        r = 170;
        g = 128;
        b = 70;
        k = 1;
      }
      const o = (y * TILE + x) * 4;
      px[o] = r * k;
      px[o + 1] = g * k;
      px[o + 2] = b * k;
      px[o + 3] = 255;
    }
  }
  return px;
}

