import { describe, expect, it } from 'vitest';
import { ACTOR_H, ACTOR_W } from '../src/shared/constants.ts';
import { Evac, GameMode, Phase, Team } from '../src/shared/protocol.ts';
import { Game } from '../src/client/game.ts';
import { knownPlayers, objective } from '../src/client/objectives.ts';

const ALIVE = 1;
/** A client: us (id 0) at (1000, 500), in `mode`, live; others where given (id -> [x, y, team]). */
function at(mode: number, others: Record<number, [number, number, number]>, myTeam: number = Team.None, extra: Record<string, unknown> = {}) {
  const game = new Game();
  game.myId = 0;
  game.alive = true;
  game.body.x = 1000 - ACTOR_W / 2;
  game.body.y = 500 - ACTOR_H / 2;
  const teams = new Uint8Array(64).fill(Team.None);
  teams[0] = myTeam;
  const views: { id: number; x: number; y: number; flags: number }[] = [];
  for (const [id, [x, y, t]] of Object.entries(others)) {
    teams[+id] = t;
    views.push({ id: +id, x: x - ACTOR_W / 2, y: y - ACTOR_H / 2, flags: ALIVE });
  }
  game.teamOf = teams;
  (game as unknown as { roundState: unknown }).roundState = { phase: Phase.Live, mode, kings: [255, 255], teamLeft: [], ...extra };
  return objective(game, knownPlayers(game, views, ALIVE));
}

describe('objective pointers', () => {
  it('PvP and last man standing: KILL, the nearest enemy (teammates aside)', () => {
    const o = at(GameMode.Pvp, { 1: [1600, 500, Team.None], 2: [1200, 480, Team.None] });
    expect(o).toMatchObject({ verb: 'KILL', x: 1200, y: 480 });
    const t = at(GameMode.Lts, { 1: [1100, 500, Team.Red], 2: [1900, 500, Team.Green] }, Team.Red);
    expect(t).toMatchObject({ verb: 'KILL', x: 1900 });
  });

  it('far players count too, by their radar blips', () => {
    const game = new Game();
    game.myId = 0;
    game.alive = true;
    game.body.x = 1000;
    game.body.y = 500;
    game.radar = [{ id: 5, x: 3000, y: 200 }];
    (game as unknown as { roundState: unknown }).roundState = { phase: Phase.Live, mode: GameMode.Pvp, kings: [255, 255], teamLeft: [] };
    expect(objective(game, knownPlayers(game, [], ALIVE))).toMatchObject({ verb: 'KILL', x: 3000, y: 200 });
  });

  it('Regicide: KILL their king (not the nearer grunt); a king himself gets none', () => {
    const o = at(GameMode.Regicide, { 1: [1100, 500, Team.Green], 2: [2500, 300, Team.Green] }, Team.Red, { kings: [9, 2] });
    expect(o).toMatchObject({ verb: 'KILL', x: 2500, y: 300 });
    expect(at(GameMode.Regicide, { 1: [1100, 500, Team.Green] }, Team.Red, { kings: [0, 1] })).toBe(null);
  });

  it('Siege: attackers KILL the king; a defender strayed far is sent back to DEFEND him', () => {
    expect(at(GameMode.Siege, { 3: [600, 400, Team.Red], 4: [1050, 500, Team.Red] }, Team.Green, { kings: [3, 255] })).toMatchObject({ verb: 'KILL', x: 600 });
    expect(at(GameMode.Siege, { 3: [200, 400, Team.Red], 4: [1050, 500, Team.Green] }, Team.Red, { kings: [3, 255] })).toMatchObject({ verb: 'DEFEND', x: 200 });
    // (Near him: fight.)
    expect(at(GameMode.Siege, { 3: [1100, 500, Team.Red], 4: [1300, 500, Team.Green] }, Team.Red, { kings: [3, 255] })).toMatchObject({ verb: 'KILL', x: 1300 });
  });

  it('Extraction: COLLECT the idol; carrying it, EXTRACT (to the rocket, or up); a teammate has it, ESCORT; an enemy, KILL', () => {
    const idol = (holder: number) => ({ idol: { x: 1500, y: 800, holder }, evac: { state: Evac.None, x: 0, y: 0, eta: 0 } });
    expect(at(GameMode.Extraction, {}, Team.Red, idol(255))).toMatchObject({ verb: 'COLLECT', x: 1500, y: 800 });
    const up = at(GameMode.Extraction, {}, Team.Red, idol(0))!;
    expect(up.verb).toBe('EXTRACT');
    expect(up.y).toBeLessThan(500);
    expect(at(GameMode.Extraction, {}, Team.Red, { idol: { x: 1000, y: 500, holder: 0 }, evac: { state: Evac.Landed, x: 2000, y: 100, eta: 0 } })).toMatchObject({ verb: 'EXTRACT', x: 2000, y: 100 });
    expect(at(GameMode.Extraction, { 7: [1500, 800, Team.Red] }, Team.Red, idol(7))).toMatchObject({ verb: 'ESCORT' });
    expect(at(GameMode.Extraction, { 7: [1500, 800, Team.Blue] }, Team.Red, idol(7))).toMatchObject({ verb: 'KILL' });
  });

  it('Extermination: KILL the nearest beast, the awake ones first', () => {
    const lair = { total: 4, beasts: [{ x: 1100, y: 600, awake: false }, { x: 2500, y: 700, awake: true }] };
    expect(at(GameMode.Extermination, {}, Team.Red, { lair })).toMatchObject({ verb: 'KILL', x: 2500 });
  });

  it('nothing while dead, or between rounds', () => {
    const game = new Game();
    game.myId = 0;
    game.alive = false;
    (game as unknown as { roundState: unknown }).roundState = { phase: Phase.Live, mode: GameMode.Pvp, kings: [255, 255], teamLeft: [] };
    expect(objective(game, new Map([[1, { x: 0, y: 0 }]]))).toBe(null);
    game.alive = true;
    (game as unknown as { roundState: unknown }).roundState = { phase: Phase.Countdown, mode: GameMode.Pvp, kings: [255, 255], teamLeft: [] };
    expect(objective(game, new Map([[1, { x: 0, y: 0 }]]))).toBe(null);
  });
});
