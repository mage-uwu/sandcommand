/**
 * Aiming a shot that falls: shared by the client's aim assist and the
 * server's own gunners (the watchdog).
 */

/** The simulation's tick (s): shots fall a step at a time, a little more than the smooth arc. */
const TICK = 1 / 30;

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
