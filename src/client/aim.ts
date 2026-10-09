/**
 * Aim assist. The bots aim like machines, so aiming is near-effortless:
 * point anywhere within 90 degrees of an enemy in sight (touch stick, tap,
 * arrow keys or mouse, scoped or not) and the aim snaps straight onto them.
 */

/** Half-angle of the cone the assist looks in (radians: 90 degrees either side of the aim), and how far. */
export const ASSIST_CONE = Math.PI / 2;
export const ASSIST_RANGE = 650;

import { ballisticAim } from '../shared/ballistics.ts';

export { ballisticAim };

const wrap = (a: number) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

/**
 * When two enemies are both roughly where you're aiming (the second within
 * this many radians of the best-aligned one), the aim is ambiguous: it goes
 * to the closer one, the more immediate threat.
 */
export const ASSIST_AMBIGUITY = 0.4;

/** A point the assist may snap onto: where, how it's moving, and what it belongs to (`g`: a clone, a ship...). */
export interface AssistTarget {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  /** Which thing it's on (a clone's head and body share one). Points without one are each their own. */
  g?: number;
  /** Its centre mass (a clone's body, a ship's hull, a tank): what auto mode aims at. */
  core?: boolean;
}

/**
 * Stickiness: once snapped onto something, the aim stays on it while it's
 * still within this many radians of the best-lined-up enemy, so a jittery
 * thumb (or a sweeping mouse) doesn't flick between targets.
 */
export const ASSIST_STICKY = 0.3;

/**
 * The aim to use from (ox, oy) given the raw `aim`: the direction of an
 * enemy point inside the cone (in range and in sight), or the raw aim if
 * there is none.
 *
 * - **Which enemy.** The one best lined up with the aim, unless another is
 *   about as well lined up (within ASSIST_AMBIGUITY of it): then the
 *   closest of those. A clear point at someone still picks them; a rough
 *   one goes to whoever is nearest.
 * - **Which point on it.** By angle alone, so nudging the aim picks between
 *   them: a head over a body, one engine pod over the next.
 */
export function assistAim(
  ox: number,
  oy: number,
  aim: number,
  targets: readonly AssistTarget[],
  sight: (x0: number, y0: number, x1: number, y1: number) => boolean,
  range = ASSIST_RANGE,
  /** Set to the point it snapped onto, how it's moving, and what it's on (`on` false if none): for the target marker, and leading the shot. */
  mark?: { x: number; y: number; vx?: number; vy?: number; g?: number; on: boolean },
  /** What it was snapped onto last (`g`): it stays on that while it reasonably can. */
  prev?: number,
  /**
   * A hard lock: stay on `prev` (while it's in range and in sight) as long as
   * it's within this many radians of the aim, whoever else is better lined
   * up; only a deliberate swing past it lets go. Without it, the softer
   * stickiness (ASSIST_STICKY) applies.
   */
  hold?: number,
): number {
  // Everything in the cone and in range, best lined up first.
  const cand: { t: AssistTarget; a: number; err: number; d: number; g: number; seen: number }[] = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const dx = t.x - ox;
    const dy = t.y - oy;
    const d = Math.hypot(dx, dy);
    if (d < 4 || d > range) continue;
    const a = Math.atan2(dy, dx);
    const err = Math.abs(wrap(a - aim));
    if (err > ASSIST_CONE) continue;
    cand.push({ t, a, err, d, g: t.g ?? -1 - i, seen: -1 });
  }
  cand.sort((p, q) => p.err - q.err || p.d - q.d);
  const visible = (c: (typeof cand)[number]) => {
    if (c.seen < 0) c.seen = sight(ox, oy, c.t.x, c.t.y) ? 1 : 0;
    return c.seen === 1;
  };
  const first = cand.find(visible);
  if (!first) return aim;
  // Still on what it had last, if that's reasonably lined up: stay on it.
  let pick = first;
  const held = prev === undefined ? undefined : cand.find((c) => c.g === prev && c.err <= (hold ?? first.err + ASSIST_STICKY) && visible(c));
  if (held) pick = held;
  // Otherwise the ambiguous ones (about as well lined up): the closest of them wins...
  else
    for (const c of cand) {
      if (c.err > first.err + ASSIST_AMBIGUITY) break;
      if (c.d < pick.d - 1e-6 && visible(c)) pick = c;
    }
  // ...and on it, the point nearest the aim.
  let best = pick;
  for (const c of cand) {
    if (c.g === pick.g && visible(c)) {
      best = c;
      break;
    }
  }
  if (mark) {
    mark.x = best.t.x;
    mark.y = best.t.y;
    mark.vx = best.t.vx ?? 0;
    mark.vy = best.t.vy ?? 0;
    mark.g = best.g;
    mark.on = true;
  }
  return best.a;
}

/** How far the mouse has to swing off a locked target to let go of it (radians, ~30 degrees): a deliberate move, not a wobble. */
export const MOUSE_LOCK_BREAK = 0.52;

/** Auto mode keeps its target until another is this much closer (as a fraction of the held one's distance). */
export const AUTO_SWITCH = 0.7;

/**
 * Auto mode (touch): the target to track with no thumb on the fire pad, in
 * any direction: the nearest enemy in range and in sight, by its centre
 * mass. It keeps the one it had (`prev`) while that's still in sight,
 * unless another comes well closer (AUTO_SWITCH). Null if nobody's there.
 */
export function autoTarget(
  ox: number,
  oy: number,
  targets: readonly AssistTarget[],
  sight: (x0: number, y0: number, x1: number, y1: number) => boolean,
  range: number,
  prev?: number,
): { t: AssistTarget; g: number; d: number } | null {
  const cores: { t: AssistTarget; g: number; d: number }[] = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t.core) continue;
    const d = Math.hypot(t.x - ox, t.y - oy);
    if (d < 4 || d > range) continue;
    cores.push({ t, g: t.g ?? -1 - i, d });
  }
  cores.sort((p, q) => p.d - q.d);
  let best: (typeof cores)[number] | null = null;
  for (const c of cores) {
    if (sight(ox, oy, c.t.x, c.t.y)) {
      best = c;
      break;
    }
  }
  if (!best) return null;
  if (prev !== undefined && best.g !== prev) {
    const held = cores.find((c) => c.g === prev);
    if (held && held.d * AUTO_SWITCH < best.d && sight(ox, oy, held.t.x, held.t.y)) return held;
  }
  return best;
}

/**
 * Lead a moving target: where to aim from (ox, oy) so a shot at `speed`
 * (cells/s; 0 for instant, which needs no lead) meets a target at (x, y)
 * moving at (vx, vy). A shot that falls (`gravity`, cells/s^2) is aimed
 * along its real arc (see `ballisticAim`); a flat one straight at where the
 * target will be. Returns a point along the aim to fire at (for a flat
 * shot, where it meets the target).
 */
export function leadPoint(ox: number, oy: number, t: { x: number; y: number; vx: number; vy: number }, speed: number, gravity: number): { x: number; y: number } {
  if (speed <= 0) return { x: t.x, y: t.y };
  const b = ballisticAim(ox, oy, t, speed, gravity)!;
  const d = speed * b.tof;
  return { x: ox + Math.cos(b.aim) * d, y: oy + Math.sin(b.aim) * d };
}
