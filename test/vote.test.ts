import { MapKind } from '../src/shared/worldgen.ts';
import { describe, expect, it } from 'vitest';
import { Reader } from '../src/shared/codec.ts';
import { GameMode, Phase, VOTE_MODES } from '../src/shared/protocol.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';

type Internals = { phaseTimer: number };
function until(world: World, cond: () => boolean, max = 3000): void {
  for (let t = 0; t < max && !cond(); t++) world.step();
}
/** A room with the usual rotation (or `rotation`), `n` humans, played to the end of its first wave. */
function ended(seed: number, n: number, rotation?: number[], send?: (d: Uint8Array) => void) {
  const world = new World(seed, { mode: 'ffa', tanks: false, bots: 0, rotation });
  const ps: Player[] = Array.from({ length: n }, (_, i) => world.addPlayer(`p${i}`, { send: i === 0 && send ? send : () => {} })!);
  until(world, () => world.phase === Phase.Live);
  (world as unknown as Internals).phaseTimer = 1;
  world.step();
  expect(world.phase).toBe(Phase.Victory);
  return { world, ps };
}
const nextWave = (world: World) => until(world, () => world.phase === Phase.Countdown || world.phase === Phase.Live, 30 * 30);

describe('the vote on the next mode', () => {
  it('the most votes decide the next wave (the map is built for it too)', () => {
    const { world, ps } = ended(501, 3);
    expect(world.voting).toBe(true);
    world.vote(ps[0].id, GameMode.Extermination);
    world.vote(ps[1].id, GameMode.Extermination);
    world.vote(ps[2].id, GameMode.Siege);
    expect(world.voteCounts()[VOTE_MODES.indexOf(GameMode.Extermination)]).toBe(2);
    nextWave(world);
    expect(world.waveMode).toBe(GameMode.Extermination);
    // (Built for it: the lair, or DUNE, by the map's seed.)
    expect([MapKind.Lair, MapKind.Dune]).toContain(world.mapKind);
    expect(world.lair !== null).toBe(world.mapKind === MapKind.Lair);
    until(world, () => world.phase === Phase.Live);
    expect(world.modeOfWave(world.wave)).toBe(GameMode.Extermination);
  });

  it('a vote can be changed until the count; a tie is drawn between the leaders', () => {
    const { world, ps } = ended(502, 2);
    world.vote(ps[0].id, GameMode.Pvp);
    world.vote(ps[0].id, GameMode.Extraction); // (changed their mind)
    world.vote(ps[1].id, GameMode.Siege);
    expect(world.voteCounts()[VOTE_MODES.indexOf(GameMode.Pvp)]).toBe(0);
    nextWave(world);
    expect([GameMode.Extraction, GameMode.Siege]).toContain(world.waveMode);
  });

  it('everyone voted: the count comes early', () => {
    const { world, ps } = ended(503, 2);
    const left = (world as unknown as Internals).phaseTimer;
    expect(left).toBeGreaterThan(30 * 10); // (time to vote)
    for (const p of ps) world.vote(p.id, GameMode.Lts);
    expect((world as unknown as Internals).phaseTimer).toBeLessThanOrEqual(30 * 2);
  });

  it('nobody votes: the rotation carries on', () => {
    const { world } = ended(504, 2);
    const planned = world.modeOfWave(world.wave + 1);
    nextWave(world);
    expect(world.waveMode).toBe(planned);
  });

  it("bots don't vote, nothing outside the list counts, and no voting mid-wave", () => {
    const world = new World(505, { mode: 'ffa', tanks: false, bots: 4 });
    const h = world.addPlayer('h', { send() {} })!;
    until(world, () => world.phase === Phase.Live);
    world.vote(h.id, GameMode.Siege);
    expect(h.vote).toBe(255); // (mid-wave)
    (world as unknown as Internals).phaseTimer = 1;
    world.step();
    for (const p of world.players) if (p?.bot) world.vote(p.id, GameMode.Siege);
    world.vote(h.id, GameMode.Lms);
    expect(world.voteCounts().every((c) => c === 0)).toBe(true);
  });

  it('a room that plays one mode has no vote', () => {
    const { world, ps } = ended(506, 2, [GameMode.Siege]);
    expect(world.voting).toBe(false);
    world.vote(ps[0].id, GameMode.Pvp);
    nextWave(world);
    expect(world.waveMode).toBe(GameMode.Siege);
  });

  it('clients see the tally and their own vote', () => {
    const frames: Uint8Array[] = [];
    const { world, ps } = ended(507, 2, undefined, (d) => frames.push(d));
    world.vote(ps[0].id, GameMode.Regicide);
    world.vote(ps[1].id, GameMode.Extermination);
    world.step();
    const game = new Game();
    game.myId = ps[0].id;
    for (const f of frames) {
      const r = new Reader(f);
      r.u8();
      const tick = r.u32();
      const ack = r.u16();
      game.applyFrame(tick, ack, r);
    }
    const v = game.roundState?.vote;
    expect(v?.mine).toBe(GameMode.Regicide);
    expect(v?.counts).toEqual(VOTE_MODES.map((m) => (m === GameMode.Regicide || m === GameMode.Extermination ? 1 : 0)));
  });
});
