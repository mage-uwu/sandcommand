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

/** Where a lock acquired by the cone (not the line itself) aims on a clone: centre mass, hitbox-local. */
const CENTRE = { lx: ACTOR_W / 2, ly: 6 };

/**
 * Scope lock-on, once a tick while scoping (`cone`: the weapon's lock cone
 * half-angle, 0 when not scoping a lock-capable weapon). It's radial: any
 * enemy within the cone around the aim, and in the clear line of fire, is
 * locked onto (the one nearest the crosshair if there are several), at
 * centre mass. Put the line itself on someone and it locks onto exactly that
 * point on them (head or chest). The lock follows them while they stay in
 * the line of fire and within reach of the aim; sweeping the line across
 * them moves the locked point; pulling well off them or losing sight of
 * them lets go (and the cone looks for someone else). Returns the aim to
 * fire on.
 */
export function scopeLock(g: Game, ox: number, oy: number, aim: number, cone: number): number {
  if (cone <= 0) {
    g.scopeLock = null;
    return aim;
  }
  const lof = lineOfFire(g, ox, oy, aim, 2000);
  const along = (v: RemoteView) => {
    // The point the line enters them at, a cell or two in.
    const d = lof.dist + 2;
    return {
      id: v.id,
      lx: Math.max(1, Math.min(ACTOR_W - 1, ox + Math.cos(aim) * d - v.x)),
      ly: Math.max(1, Math.min(ACTOR_H - 1, oy + Math.sin(aim) * d - v.y)),
    };
  };
  const angleTo = (v: RemoteView, lx: number, ly: number) => Math.atan2(v.y + ly - oy, v.x + lx - ox);
  const off = (a: number) => Math.abs(Math.atan2(Math.sin(aim - a), Math.cos(aim - a)));
  const inSight = (v: RemoteView, a: number) => lineOfFire(g, ox, oy, a, 2000).hit?.id === v.id;
  // The line itself on an enemy: lock exactly there.
  if (lof.hit && lof.foe) {
    g.scopeLock = along(lof.hit);
    return aim;
  }
  // Keep a lock we have while it's within reach of the aim and in sight.
  const lock = g.scopeLock;
  if (lock) {
    const v = g.remoteViews().find((r) => r.id === lock.id);
    if (v && v.flags & F_ALIVE) {
      const a = angleTo(v, lock.lx, lock.ly);
      if (off(a) < cone + 0.2 && inSight(v, a)) return a;
    }
    g.scopeLock = null;
  }
  // Anyone else in the cone: the enemy nearest the crosshair that a shot could reach.
  let best: RemoteView | null = null;
  let bestOff = cone;
  let bestA = aim;
  for (const v of g.remoteViews()) {
    if (!(v.flags & F_ALIVE) || v.id === g.myId || g.tankPilots.has(v.id)) continue;
    if (g.myTeam !== Team.None && g.teamOf[v.id] === g.myTeam) continue;
    const a = angleTo(v, CENTRE.lx, CENTRE.ly);
    const o = off(a);
    if (o < bestOff && inSight(v, a)) {
      best = v;
      bestOff = o;
      bestA = a;
    }
  }
  if (!best) return aim;
  g.scopeLock = { id: best.id, ...CENTRE };
  return bestA;
}
