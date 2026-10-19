/**
 * The spider droid's sprites: hand-authored pixel art (droid-grids.ts),
 * one pixel to a world cell like the clones', baked to canvases on demand.
 * The chassis pitches with the ground and the head turns with the aim,
 * rotated nearest-neighbour (bakeRotated) so both stay on the pixel grid.
 * Its legs are drawn in pixels too (render.ts drawDroid).
 */
import { CHASSIS, CHASSIS_PIVOT, DBARE, DDIM, DHEAD, DHEAD_PIVOT, DPAL, type Grid } from './droid-grids.ts';
import { ANGLE_STEPS } from './sprites.ts';
import { type Baked, bakeRotated } from './tarantula-sprites.ts';

const flipX = (g: Grid): Grid => g.map((r) => [...r].reverse().join(''));
const flipY = (g: Grid): Grid => [...g].reverse();
const step = (a: number) => ((Math.round((a / (Math.PI * 2)) * ANGLE_STEPS) % ANGLE_STEPS) + ANGLE_STEPS) % ANGLE_STEPS;

export class DroidArt {
  private readonly cache = new Map<string, Baked>();
  private get(key: string, make: () => Baked): Baked {
    let v = this.cache.get(key);
    if (!v) {
      if (this.cache.size > 800) this.cache.clear();
      this.cache.set(key, (v = make()));
    }
    return v;
  }
  /** The chassis, pitched to `tilt`; its hip pivot at the canvas's (r, r). `team`: its light (0xrrggbb). */
  chassis(team: number, left: boolean, plated: boolean, tilt: number): Baked {
    const k = step(tilt);
    return this.get(`c${team}|${left ? 1 : 0}${plated ? 1 : 0}|${k}`, () => {
      const g = left ? flipX(CHASSIS) : CHASSIS;
      const px = left ? CHASSIS[0].length - CHASSIS_PIVOT[0] : CHASSIS_PIVOT[0];
      return bakeRotated(g, { ...(plated ? DPAL : DBARE), t: team }, (k / ANGLE_STEPS) * Math.PI * 2, px, CHASSIS_PIVOT[1]);
    });
  }
  /** The head at the aim (kept upright either way); the gun's mount at the canvas's (r, r). `dim`: its eye flickering low. */
  head(aim: number, left: boolean, dim: boolean): Baked {
    const k = step(aim);
    return this.get(`h${left ? 1 : 0}${dim ? 1 : 0}|${k}`, () => {
      const g = left ? flipY(DHEAD) : DHEAD;
      const py = left ? DHEAD.length - DHEAD_PIVOT[1] : DHEAD_PIVOT[1];
      return bakeRotated(g, dim ? DDIM : DPAL, (k / ANGLE_STEPS) * Math.PI * 2, DHEAD_PIVOT[0], py);
    });
  }
}
