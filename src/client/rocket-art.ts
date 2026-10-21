/**
 * The rockets in flight, as gritty Soviet-era pixel art: drab olive tubes
 * gone to rust, chipped paint, a red warhead, a scorched tail. Tiny grids
 * drawn a cell at a time in the rocket's own frame (nose along +x, centred
 * on the rocket), so they turn with it and stay in the game's pixels.
 */

import { DART, type Grid, MISSILE, PAL, ROCKET } from './rocket-grids.ts';

function drawGrid(ctx: CanvasRenderingContext2D, grid: Grid, pal: Record<string, string>): void {
  const h = grid.length;
  const w = grid[0].length;
  const ox = -Math.ceil(w / 2);
  const oy = -Math.floor(h / 2) - 0.5;
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < w; x++) {
      const c = row[x];
      if (c === '.') continue;
      ctx.fillStyle = pal[c];
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

/** A flame out the tail (`len` cells back from `x0`), sputtering, with smoke-grey at its ragged end. */
function tailFlame(ctx: CanvasRenderingContext2D, x0: number, len: number, half: number): void {
  ctx.fillStyle = '#ff7a20';
  ctx.fillRect(x0 - len, -half, len, half * 2);
  ctx.fillStyle = '#ffd860';
  ctx.fillRect(x0 - len + 1, -half * 0.55, len - 1, half * 1.1);
  ctx.fillStyle = '#fff6d8';
  ctx.fillRect(x0 - 1.5, -half * 0.35, 1.5, half * 0.7);
}

/** The bazooka's rocket at the origin, heading along +x. */
export function drawRocket(ctx: CanvasRenderingContext2D, now: number, i: number): void {
  tailFlame(ctx, -6, 2 + ((now / 31 + i) % 3), 1);
  drawGrid(ctx, ROCKET, PAL);
}

/** The AT missile at the origin, heading along +x; its seeker head blinking red. */
export function drawMissile(ctx: CanvasRenderingContext2D, now: number, i: number): void {
  tailFlame(ctx, -6, 3 + ((now / 29 + i) % 3), 1);
  drawGrid(ctx, MISSILE, { ...PAL, S: (now / 90) % 2 < 1 ? '#ff3020' : '#7a1008' });
}

/** The tarantula's missile at the origin, heading along +x. */
export function drawDart(ctx: CanvasRenderingContext2D, now: number, i: number): void {
  tailFlame(ctx, -5, 2 + ((now / 27 + i) % 3), 0.75);
  drawGrid(ctx, DART, PAL);
}
