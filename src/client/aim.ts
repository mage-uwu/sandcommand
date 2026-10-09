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

/** The simulation's tick (s): shots fall a step at a time, a little more than the smooth arc. */
const TICK = 1 / 30;

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

/**
 * The launch angle that lands a shot fired at `speed` from (ox, oy), falling
 * at `gravity` (screen y is down, so it falls toward +y), on a target at
 * (x, y) moving at (vx, vy): the low arc of the two that reach, with its
 * flight time. The target is led by refining the flight time a few rounds;
 * the drop is that of the game's own stepping (velocity, then position,
 * once a tick), which falls half a tick's worth more than the smooth arc.
 * A target out of reach gets the farthest-reaching throw its way (45
 * degrees up, on the level), so the shot at least falls as near as it can.
 * `shooter` is the part of the thrower's own velocity the shot inherits;
 * `muzzle`, how far along the aim from (ox, oy) the shot sets off.
 */
export function ballisticAim(
  ox: number,
  oy: number,
  t: { x: number; y: number; vx: number; vy: number },
  speed: number,
  gravity: number,
  shooter: { vx: number; vy: number } = { vx: 0, vy: 0 },
  /** How far out along the aim the shot leaves (the muzzle). */
  muzzle = 0,
): { aim: number; tof: number; reach: boolean } | null {
  if (speed <= 0) return null;
  // Relative to the inherited motion, the shot leaves at plain `speed`.
  const rvx = t.vx - shooter.vx;
  const rvy = t.vy - shooter.vy;
  const v2 = speed * speed;
  let tof = Math.hypot(t.x - ox, t.y - oy) / speed;
  let aim = Math.atan2(t.y - oy, t.x - ox);
  let reach = true;
  for (let k = 0; k < 6; k++) {
    const sx = ox + Math.cos(aim) * muzzle;
    const sy = oy + Math.sin(aim) * muzzle;
    const px = t.x + rvx * tof - sx;
    // The stepped fall adds g*dt*t/2 over the smooth one: aim that much higher.
    const py = t.y + rvy * tof - sy - 0.5 * gravity * TICK * tof;
    if (gravity <= 0) {
      aim = Math.atan2(py, px);
      tof = Math.hypot(px, py) / speed;
      continue;
    }
    const dx = Math.abs(px);
    const up = -py; // height to climb
    const disc = v2 * v2 - gravity * (gravity * dx * dx + 2 * up * v2);
    let el: number; // elevation above level
    if (disc < 0) {
      // Out of reach: the throw that gets nearest (45 degrees, tipped toward the target's height).
      el = Math.PI / 4 + Math.atan2(up, dx) / 2;
      reach = false;
    } else {
      el = Math.atan2(v2 - Math.sqrt(disc), gravity * dx);
      reach = true;
    }
    aim = px >= 0 ? -el : el - Math.PI;
    const c = Math.cos(el);
    tof = c > 1e-3 ? dx / (speed * c) : Math.sqrt(Math.max(0, 2 * Math.max(up, 0) / gravity)) + Math.abs(py) / speed;
  }
  return { aim, tof, reach };
}
