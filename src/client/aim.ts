/**
 * Touch aim assist. A thumb on a stick can't hold a sniper's line, so when
 * the stick (or a tap) points close enough at an enemy in sight, the aim
 * settles on it. Only for touch: mouse aim is never touched.
 */

/** Half-angle of the cone the assist looks in (radians), and how far. */
export const ASSIST_CONE = 0.2;
export const ASSIST_RANGE = 420;

const wrap = (a: number) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

/**
 * The aim to use from (ox, oy) given the raw `aim`: the direction of the
 * enemy nearest the aim line inside the cone (in range and in sight), or
 * the raw aim if there is none. Nearer misses win; distance breaks ties.
 */
export function assistAim(ox: number, oy: number, aim: number, targets: readonly { x: number; y: number }[], sight: (x0: number, y0: number, x1: number, y1: number) => boolean): number {
  let best = aim;
  let bestScore = Infinity;
  for (const t of targets) {
    const dx = t.x - ox;
    const dy = t.y - oy;
    const d = Math.hypot(dx, dy);
    if (d < 4 || d > ASSIST_RANGE) continue;
    const a = Math.atan2(dy, dx);
    const err = Math.abs(wrap(a - aim));
    // Close targets subtend more: widen the cone a little for them.
    const cone = ASSIST_CONE + Math.min(0.2, 6 / d);
    if (err > cone) continue;
    const score = err / cone + d / ASSIST_RANGE / 4;
    if (score >= bestScore || !sight(ox, oy, t.x, t.y)) continue;
    bestScore = score;
    best = a;
  }
  return best;
}
