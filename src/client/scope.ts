import { ACTOR_H, ACTOR_W } from '../shared/constants.ts';
import { segmentBox } from '../shared/kernels.ts';
import { F_ALIVE, Team } from '../shared/protocol.ts';
import { sightLine } from '../shared/scope.ts';
import type { Game, RemoteView } from './game.ts';

/**
 * The line of fire from (ox, oy) along `aim`: how far it runs before
 * terrain or a clone stops it (clones block a shot just as walls do), and
 * which clone, if one does. `foe`: that clone is fair game (not ourselves or
 * a teammate).
 */
export function lineOfFire(g: Game, ox: number, oy: number, aim: number, max: number): { dist: number; hit: RemoteView | null; foe: boolean } {
  const wall = sightLine(g.terrain, ox, oy, aim, max);
  const dx = Math.cos(aim) * wall;
  const dy = Math.sin(aim) * wall;
  let t = 1;
  let hit: RemoteView | null = null;
  for (const v of g.remoteViews()) {
    if (!(v.flags & F_ALIVE) || v.id === g.myId || g.tankPilots.has(v.id)) continue;
    const k = segmentBox(ox, oy, dx, dy, v.x, v.y, v.x + ACTOR_W, v.y + ACTOR_H);
    if (k >= 0 && k < t) {
      t = k;
      hit = v;
    }
  }
  const foe = !!hit && (g.myTeam === Team.None || g.teamOf[hit.id] !== g.myTeam);
  return { dist: wall * t, hit, foe };
}

/**
 * Scope lock-on, once a tick while scoping: put the crosshair's line on an
 * enemy and the aim locks onto that point on them (head or chest, wherever
 * it was), following them while they stay in the line of fire. Sweeping the
 * line across them moves the locked point; pulling the aim well off them
 * (or losing sight of them) breaks the lock. Returns the aim to fire on.
 */
export function scopeLock(g: Game, ox: number, oy: number, aim: number, scoping: boolean): number {
  if (!scoping) {
    g.scopeLock = null;
    return aim;
  }
  const lof = lineOfFire(g, ox, oy, aim, 2000);
  const at = (v: RemoteView) => {
    // The point the line enters them at, a cell or two in.
    const d = lof.dist + 2;
    return {
      id: v.id,
      lx: Math.max(1, Math.min(ACTOR_W - 1, ox + Math.cos(aim) * d - v.x)),
      ly: Math.max(1, Math.min(ACTOR_H - 1, oy + Math.sin(aim) * d - v.y)),
    };
  };
  const lock = g.scopeLock;
  if (lock) {
    if (lof.hit && lof.hit.id === lock.id) {
      g.scopeLock = at(lof.hit);
      return aim;
    }
    const v = g.remoteViews().find((r) => r.id === lock.id);
    if (v && v.flags & F_ALIVE) {
      const ta = Math.atan2(v.y + lock.ly - oy, v.x + lock.lx - ox);
      const off = Math.abs(Math.atan2(Math.sin(aim - ta), Math.cos(aim - ta)));
      if (off < 0.3 && lineOfFire(g, ox, oy, ta, 2000).hit?.id === lock.id) return ta;
    }
    g.scopeLock = null;
  }
  if (lof.hit && lof.foe) g.scopeLock = at(lof.hit);
  return aim;
}
