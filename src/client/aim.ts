/**
 * Aim assist. The bots aim like machines, so aiming is near-effortless:
 * point anywhere within 90 degrees of an enemy in sight (touch stick, tap,
 * arrow keys or mouse, scoped or not) and the aim snaps straight onto them.
 */

/** Half-angle of the cone the assist looks in (radians: 90 degrees either side of the aim), and how far. */
export const ASSIST_CONE = Math.PI / 2;
export const ASSIST_RANGE = 650;

const wrap = (a: number) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

/**
 * The aim to use from (ox, oy) given the raw `aim`: the direction of the
 * enemy nearest the aim line inside the cone (in range and in sight), or
 * the raw aim if there is none. Nearer misses win; distance breaks ties.
 */
export function assistAim(ox: number, oy: number, aim: number, targets: readonly { x: number; y: number }[], sight: (x0: number, y0: number, x1: number, y1: number) => boolean, range = ASSIST_RANGE): number {
  let best = aim;
  let bestScore = Infinity;
  for (const t of targets) {
    const dx = t.x - ox;
    const dy = t.y - oy;
    const d = Math.hypot(dx, dy);
    if (d < 4 || d > range) continue;
    const a = Math.atan2(dy, dx);
    const err = Math.abs(wrap(a - aim));
    const cone = ASSIST_CONE;
    if (err > cone) continue;
    const score = err / cone + d / range / 4;
    if (score >= bestScore || !sight(ox, oy, t.x, t.y)) continue;
    bestScore = score;
    best = a;
  }
  return best;
}
