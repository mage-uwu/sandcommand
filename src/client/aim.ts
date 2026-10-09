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
 * target nearest the player's own aim angle inside the cone (in range and
 * in sight), or the raw aim if there is none. Competing targets are decided
 * by angle alone (distance only breaks exact ties), so nudging the aim picks
 * between them: a head over a body, one engine pod over the next.
 */
export function assistAim(
  ox: number,
  oy: number,
  aim: number,
  targets: readonly { x: number; y: number; vx?: number; vy?: number }[],
  sight: (x0: number, y0: number, x1: number, y1: number) => boolean,
  range = ASSIST_RANGE,
  /** Set to the point it snapped onto, and how it's moving (`on` false if none): for the target marker, and leading the shot. */
  mark?: { x: number; y: number; vx?: number; vy?: number; on: boolean },
): number {
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
    const score = err + d * 1e-7;
    if (score >= bestScore || !sight(ox, oy, t.x, t.y)) continue;
    bestScore = score;
    best = a;
    if (mark) {
      mark.x = t.x;
      mark.y = t.y;
      mark.vx = t.vx ?? 0;
      mark.vy = t.vy ?? 0;
      mark.on = true;
    }
  }
  return best;
}

/**
 * Lead a moving target: where to aim from (ox, oy) so a shot at `speed`
 * (cells/s; 0 for instant, which needs no lead) meets a target at (x, y)
 * moving at (vx, vy), aiming high to cancel the drop of a shot that falls
 * at `gravity` (cells/s^2). A few rounds of refining the flight time.
 */
export function leadPoint(ox: number, oy: number, t: { x: number; y: number; vx: number; vy: number }, speed: number, gravity: number): { x: number; y: number } {
  if (speed <= 0) return { x: t.x, y: t.y };
  let px = t.x;
  let py = t.y;
  for (let k = 0; k < 3; k++) {
    const tof = Math.hypot(px - ox, py - oy) / speed;
    px = t.x + t.vx * tof;
    py = t.y + t.vy * tof - 0.5 * gravity * tof * tof;
  }
  return { x: px, y: py };
}
