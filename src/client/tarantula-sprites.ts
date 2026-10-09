/**
 * The tarantula's own sprites, hand-authored pixel art in the style of the
 * tanks' (character grids baked to canvases, dark outlines, banded light
 * from the top left), built heavier than a spider droid: an iron underframe,
 * blued-steel side plating, and white ceramic armour plates over its back
 * and its segmented abdomen. The body tilts with the ground and the head
 * and the missile rack turn with the aim, rotated nearest-neighbour so they
 * stay on the pixel grid. Its legs are drawn in pixels too (render.ts).
 */
import { ANGLE_STEPS } from './sprites.ts';

import { BARE, BODY, BODY_HIP, type Grid, HEAD, HEAD_PIVOT, HOT, PAL, RACK, RACK_PIVOT } from './tarantula-grids.ts';

export { RACK_MOUTHS, RACK_PIVOT } from './tarantula-grids.ts';

const flipX = (g: Grid): Grid => g.map((r) => [...r].reverse().join(''));
const flipY = (g: Grid): Grid => [...g].reverse();

const step = (a: number) => ((Math.round((a / (Math.PI * 2)) * ANGLE_STEPS) % ANGLE_STEPS) + ANGLE_STEPS) % ANGLE_STEPS;

/** Rotate a grid about a pivot onto a square canvas, nearest-neighbour (crisp). */
function bakeRotated(g: Grid, pal: Record<string, number>, angle: number, px: number, py: number): { c: HTMLCanvasElement; r: number } {
  const h = g.length;
  const w = g[0].length;
  let r = 0;
  for (const [cx, cy] of [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ]) {
    r = Math.max(r, Math.hypot(cx - px, cy - py));
  }
  r = Math.ceil(r);
  const size = r * 2;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const dx = tx + 0.5 - r;
      const dy = ty + 0.5 - r;
      const sx = Math.floor(cos * dx + sin * dy + px);
      const sy = Math.floor(-sin * dx + cos * dy + py);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const rgb = pal[g[sy][sx]];
      if (rgb === undefined) continue;
      const o = (ty * size + tx) * 4;
      img.data[o] = (rgb >> 16) & 255;
      img.data[o + 1] = (rgb >> 8) & 255;
      img.data[o + 2] = rgb & 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { c, r };
}

export interface Baked {
  c: HTMLCanvasElement;
  r: number;
}

export class TarantulaArt {
  private readonly cache = new Map<string, Baked>();
  private get(key: string, make: () => Baked): Baked {
    let v = this.cache.get(key);
    if (!v) {
      if (this.cache.size > 600) this.cache.clear();
      this.cache.set(key, (v = make()));
    }
    return v;
  }
  /** The body, tilted; its hip centre at the canvas's (r, r). `team`: the stripe's colour (0xrrggbb). */
  body(team: number, left: boolean, plated: boolean, tilt: number): Baked {
    const k = step(tilt);
    return this.get(`b${team}|${left ? 1 : 0}${plated ? 1 : 0}|${k}`, () => {
      const g = left ? flipX(BODY) : BODY;
      const px = left ? BODY[0].length - BODY_HIP[0] : BODY_HIP[0];
      return bakeRotated(g, { ...(plated ? PAL : BARE), t: team }, (k / ANGLE_STEPS) * Math.PI * 2, px, BODY_HIP[1] + 0.5);
    });
  }
  /** The head at the aim (kept upright either way); its pivot at the canvas's (r, r). */
  head(aim: number, left: boolean, hot: boolean): Baked {
    const k = step(aim);
    return this.get(`h${left ? 1 : 0}${hot ? 1 : 0}|${k}`, () => {
      const g = left ? flipY(HEAD) : HEAD;
      const py = left ? HEAD.length - HEAD_PIVOT[1] : HEAD_PIVOT[1];
      return bakeRotated(g, hot ? HOT : PAL, (k / ANGLE_STEPS) * Math.PI * 2, HEAD_PIVOT[0], py);
    });
  }
  /** The missile rack at the aim; its pivot at the canvas's (r, r). */
  rack(aim: number, left: boolean): Baked {
    const k = step(aim);
    return this.get(`r${left ? 1 : 0}|${k}`, () => {
      const g = left ? flipY(RACK) : RACK;
      const py = left ? RACK.length - RACK_PIVOT[1] : RACK_PIVOT[1];
      return bakeRotated(g, PAL, (k / ANGLE_STEPS) * Math.PI * 2, RACK_PIVOT[0], py);
    });
  }
}
