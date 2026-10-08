/**
 * Line of sight down a scope: how far a straight line from (ox, oy) along
 * `aim` runs before the first solid cell, up to `max` cells. The scoped view
 * (client) and the interest area it is sent (server) both stop there, so a
 * scope never looks through or past terrain: what it shows is what a shot
 * down that line can reach.
 */
export function sightLine(t: { isSolid(x: number, y: number): boolean }, ox: number, oy: number, aim: number, max: number): number {
  const c = Math.cos(aim);
  const s = Math.sin(aim);
  for (let d = 1; d < max; d++) if (t.isSolid(Math.floor(ox + c * d), Math.floor(oy + s * d))) return d;
  return max;
}
