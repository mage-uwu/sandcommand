import { ACTOR_H, ACTOR_W } from '../shared/constants.ts';
import { Evac, GameMode, Phase, Team } from '../shared/protocol.ts';
import type { Game } from './game.ts';

/**
 * The objective pointer: where a human player should be heading right now,
 * and the one word for what to do there (KILL, COLLECT, EXTRACT, ESCORT,
 * DEFEND), from what this client already knows of the round. The HUD shows
 * it as a small, quiet arrow at the edge of the screen pointing that way
 * (render.ts drawObjective), only while it's off screen. Bots don't need it.
 *
 * - **Last man / teams / PvP:** KILL, the nearest enemy.
 * - **Regicide:** KILL, their king (a king himself gets no pointer: he
 *   stays alive).
 * - **Siege:** attackers KILL the king; defenders DEFEND him when they're
 *   far from him, else KILL the nearest attacker.
 * - **Extraction:** COLLECT the idol; with it, EXTRACT (to the rocket, or
 *   straight up for the surface while it isn't down yet); a teammate
 *   carrying it, ESCORT them; an enemy, KILL them.
 * - **Extermination:** KILL the nearest beast left (the awake ones first).
 * - **Infection:** KILL the nearest of the possessed (possessed yourself,
 *   the nearest of everyone else).
 */
export interface Objective {
  verb: string;
  x: number;
  y: number;
  /** Its colour (the HUD's: subtle, but telling). */
  color: string;
}

/** How far (cells) a Siege defender may stray from his king before he's pointed back. */
const DEFEND_R = 350;

/** Where everyone this client knows of is (player centres): those in view, and the radar's blips for the rest. */
export function knownPlayers(game: Game, views: readonly { id: number; x: number; y: number; flags: number }[], aliveFlag: number): Map<number, { x: number; y: number }> {
  const out = new Map<number, { x: number; y: number }>();
  for (const v of views) if (v.flags & aliveFlag) out.set(v.id, { x: v.x + ACTOR_W / 2, y: v.y + ACTOR_H / 2 });
  for (const b of game.radar) if (!out.has(b.id)) out.set(b.id, { x: b.x, y: b.y });
  out.delete(game.myId);
  return out;
}

/** The objective for us now (null: nothing to point at). `players`: knownPlayers. */
export function objective(game: Game, players: ReadonlyMap<number, { x: number; y: number }>): Objective | null {
  const rs = game.roundState;
  if (!rs || rs.phase !== Phase.Live || !game.alive) return null;
  const mx = game.body.x + ACTOR_W / 2;
  const my = game.body.y + ACTOR_H / 2;
  const team = game.myTeam;
  const enemy = (id: number) => team === Team.None || game.teamOf[id] !== team;
  const nearest = (pts: Iterable<{ x: number; y: number }>) => {
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const p of pts) {
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  };
  const nearestEnemy = () => nearest([...players].filter(([id]) => enemy(id)).map(([, p]) => p));
  const kill = (p: { x: number; y: number } | null): Objective | null => (p ? { verb: 'KILL', x: p.x, y: p.y, color: '#ff8070' } : null);
  switch (rs.mode) {
    case GameMode.Extraction: {
      const idol = rs.idol;
      if (!idol) return null;
      if (idol.holder === game.myId) {
        const evac = rs.evac;
        // With the idol: to the rocket, or (it isn't down yet) up, for the surface.
        if (evac && evac.state !== Evac.None) return { verb: 'EXTRACT', x: evac.x, y: Math.max(0, evac.y), color: '#80ff80' };
        return { verb: 'EXTRACT', x: mx, y: my - 600, color: '#80ff80' };
      }
      if (idol.holder !== 255) {
        if (!enemy(idol.holder)) return { verb: 'ESCORT', x: idol.x, y: idol.y, color: '#80d0ff' };
        return { verb: 'KILL', x: idol.x, y: idol.y, color: '#ff8070' };
      }
      return { verb: 'COLLECT', x: idol.x, y: idol.y, color: '#ffd34a' };
    }
    case GameMode.Regicide: {
      if (game.isKing(game.myId)) return null;
      const theirs = rs.kings[team === Team.Red ? 1 : 0];
      const p = theirs !== 255 ? players.get(theirs) : undefined;
      return p ? { verb: 'KILL', x: p.x, y: p.y, color: '#ffd34a' } : kill(nearestEnemy());
    }
    case GameMode.Siege: {
      if (game.isKing(game.myId)) return null;
      const king = rs.kings[0];
      const p = king !== 255 ? players.get(king) : undefined;
      if (team === Team.Red) {
        if (p && Math.hypot(p.x - mx, p.y - my) > DEFEND_R) return { verb: 'DEFEND', x: p.x, y: p.y, color: '#80d0ff' };
        return kill(nearestEnemy());
      }
      return p ? { verb: 'KILL', x: p.x, y: p.y, color: '#ffd34a' } : kill(nearestEnemy());
    }
    case GameMode.Infection: {
      const me = game.possessedIds.has(game.myId);
      return kill(nearest([...players].filter(([id]) => game.possessedIds.has(id) !== me).map(([, p]) => p)));
    }
    case GameMode.Extermination: {
      const beasts = rs.lair?.beasts ?? [];
      const awake = beasts.filter((b) => b.awake);
      return kill(nearest(awake.length ? awake : beasts));
    }
    default:
      return kill(nearestEnemy());
  }
}
