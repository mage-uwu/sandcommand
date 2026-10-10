import { TILE, backwallPixels } from './backwall-tile.ts';

/** Drawing the rock face behind the ground (backwall-tile.ts makes its tile). */

let pattern: CanvasPattern | null = null;

function backwallPattern(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  if (pattern) return pattern;
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const cx = c.getContext('2d');
  if (!cx) return '#2c1914';
  const img = cx.createImageData(TILE, TILE);
  img.data.set(backwallPixels());
  cx.putImageData(img, 0, 0);
  pattern = ctx.createPattern(c, 'repeat');
  return pattern ?? '#2c1914';
}

/**
 * Fill the given world-space rects (x, y, w, h) with the rock face, then
 * sink it into the dark with depth: clear just under the surface, near
 * black at the bottom of the world.
 */
export function drawBackwall(ctx: CanvasRenderingContext2D, rects: number[], worldH: number): void {
  if (rects.length === 0) return;
  ctx.fillStyle = backwallPattern(ctx);
  for (let i = 0; i < rects.length; i += 4) ctx.fillRect(rects[i], rects[i + 1], rects[i + 2], rects[i + 3]);
  const g = ctx.createLinearGradient(0, worldH * 0.2, 0, worldH);
  g.addColorStop(0, 'rgba(8,4,8,0.08)');
  g.addColorStop(0.5, 'rgba(8,4,10,0.3)');
  g.addColorStop(1, 'rgba(4,2,8,0.58)');
  ctx.fillStyle = g;
  for (let i = 0; i < rects.length; i += 4) ctx.fillRect(rects[i], rects[i + 1], rects[i + 2], rects[i + 3]);
}
