import { describe, expect, it } from 'vitest';
import { Reader } from '../src/shared/codec.ts';
import { GameMode, Phase, TEAMS_IN_MODE, Team } from '../src/shared/protocol.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';

type Internals = { damage: (p: Player, n: number, by: number, w: number) => void; phaseTimer: number };
const kill = (world: World, p: Player, by: Player) => (world as unknown as Internals).damage(p, 999, by.id, 0);
function until(world: World, cond: () => boolean, max = 3000): void {
  for (let t = 0; t < max && !cond(); t++) world.step();
}
const pvp = (seed: number, n: number, send?: (d: Uint8Array) => void) => {
  const world = new World(seed, { mode: 'ffa', rotation: [GameMode.Pvp], tanks: false });
  const ps = Array.from({ length: n }, (_, i) => world.addPlayer(`p${i}`, { send: i === 0 && send ? send : () => {} })!);
  until(world, () => world.phase === Phase.Live);
  until(world, () => ps.every((p) => p.alive), 1200);
  return { world, ps };
};

describe('PvP', () => {
  it('the rotation favours Regicide, PvP and team waves, with Last Man Standing out of it', () => {
    const world = new World(90, { mode: 'ffa' });
    const r = world.rotation;
    expect(r).not.toContain(GameMode.Lms);
    for (const m of [GameMode.Regicide, GameMode.Pvp, GameMode.Lts]) expect(r.filter((x) => x === m).length).toBeGreaterThanOrEqual(2);
    expect(r.filter((x) => x === GameMode.Extraction).length).toBeLessThanOrEqual(1);
  });

  it('is all against all: no teams, and everyone is fair game', () => {
    expect(TEAMS_IN_MODE[GameMode.Pvp]).toBe(0);
    const { ps } = pvp(91, 3);
    for (const p of ps) expect(p.team).toBe(Team.None);
  });

  it('the fallen respawn by drop rocket within seconds, and deaths are counted', () => {
    const { world, ps } = pvp(92, 2);
    const [a, b] = ps;
    kill(world, a, b);
    expect(a.alive).toBe(false);
    expect(a.pendingSpawn).toBe(true);
    expect(b.waveKills).toBe(1);
    expect(a.waveDeaths).toBe(1);
    let back = -1;
    for (let t = 0; t < 30 * 20 && back < 0; t++) {
      world.step();
      if (a.alive) back = t;
    }
    expect(back).toBeGreaterThan(0);
    expect(back).toBeLessThan(30 * 15); // a few seconds' wait, then the rocket ride down
    expect(world.phase).toBe(Phase.Live); // one death doesn't end it
  });

  it('runs five minutes; then the most kills wins (fewer deaths breaks a tie)', () => {
    const { world, ps } = pvp(93, 3);
    const [a, b, c] = ps;
    expect((world as unknown as Internals).phaseTimer).toBeGreaterThan(30 * 60 * 5 - 30 * 30);
    a.waveKills = 4;
    a.waveDeaths = 3;
    b.waveKills = 4;
    b.waveDeaths = 1;
    c.waveKills = 2;
    (world as unknown as Internals).phaseTimer = 1;
    world.step();
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).toBe(b.id);
    expect(b.wins).toBe(1);
  });

  it('clients get the leader and their own score', () => {
    const frames: Uint8Array[] = [];
    const { world, ps } = pvp(94, 2, (d) => frames.push(d));
    const [a, b] = ps;
    kill(world, b, a);
    for (let k = 0; k < 10; k++) world.step();
    const game = new Game();
    game.myId = a.id;
    for (const f of frames) {
      const r = new Reader(f);
      r.u8();
      const tick = r.u32();
      const ack = r.u16();
      game.applyFrame(tick, ack, r);
    }
    expect(game.roundState?.mode).toBe(GameMode.Pvp);
    expect(game.roundState?.pvp).toEqual({ leader: a.id, leaderKills: 1, kills: 1, deaths: 0 });
  });
});
