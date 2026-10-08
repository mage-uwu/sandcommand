import { describe, expect, it } from 'vitest';
import { Reader } from '../src/shared/codec.ts';
import { CHUNK_COUNT } from '../src/shared/constants.ts';
import { Phase } from '../src/shared/protocol.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';

type Internals = { damage: (p: Player, n: number, by: number, w: number) => void };
const kill = (world: World, p: Player, by: Player) => (world as unknown as Internals).damage(p, 999, by.id, 0);

/** Step until `cond` (or give up). */
function until(world: World, cond: () => boolean, max = 3000): void {
  for (let t = 0; t < max && !cond(); t++) world.step();
}
const inWave = (world: World) => world.players.filter((p): p is Player => !!p && p.inWave);

describe('free for all', () => {
  it('waits for two clones, counts down, and lands everyone by rocket once', () => {
    const world = new World(5, { mode: 'ffa' });
    const a = world.addPlayer('a', { send() {} })!;
    for (let t = 0; t < 60; t++) world.step();
    expect(world.phase).toBe(Phase.Waiting); // alone: no wave
    expect(a.alive).toBe(false);
    const b = world.addPlayer('b', { send() {} })!;
    until(world, () => world.phase === Phase.Live);
    expect(world.wave).toBe(1);
    until(world, () => a.alive && b.alive);
    expect(a.alive && b.alive).toBe(true);
  });

  it('one life: the dead stay out, spectate, and the last one standing wins', () => {
    const world = new World(6, { mode: 'ffa' });
    const ps = ['a', 'b', 'c'].map((n) => world.addPlayer(n, { send() {} })!);
    until(world, () => ps.every((p) => p.alive));
    const [a, b, c] = ps;
    kill(world, b, a);
    for (let t = 0; t < 200; t++) world.step();
    expect(b.alive).toBe(false); // no respawn mid-wave
    expect(b.delivering).toBe(-1);
    expect(b.spectate).toBe(a.id); // watching its killer
    expect(b.camX).toBeCloseTo(a.cx, 0);
    expect(world.phase).toBe(Phase.Live);
    kill(world, c, a);
    world.step();
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).toBe(a.id);
    expect(a.wins).toBe(1);
  });

  it('after the victory, a new wave starts on a fresh map with everyone back', () => {
    const world = new World(7, { mode: 'ffa' });
    const [a, b] = ['a', 'b'].map((n) => world.addPlayer(n, { send() {} })!);
    until(world, () => a.alive && b.alive);
    const seed0 = world.mapSeed;
    const h0 = Array.from({ length: CHUNK_COUNT }, (_, ci) => world.terrain.chunkHash(ci));
    kill(world, b, a);
    until(world, () => world.phase === Phase.Countdown && world.wave === 1);
    expect(world.mapSeed).not.toBe(seed0);
    const changed = h0.filter((h, ci) => world.terrain.chunkHash(ci) !== h).length;
    expect(changed).toBeGreaterThan(CHUNK_COUNT / 4); // a different landscape, not just a few dents
    expect(world.items.length).toBe(0); // b's dropped kit went with the old map
    until(world, () => world.wave === 2 && a.alive && b.alive);
    expect(a.alive && b.alive).toBe(true);
  });

  it('late joiners watch the wave and play in the next one', () => {
    const world = new World(8, { mode: 'ffa' });
    const [a, b] = ['a', 'b'].map((n) => world.addPlayer(n, { send() {} })!);
    until(world, () => a.alive && b.alive);
    const late = world.addPlayer('late', { send() {} })!;
    for (let t = 0; t < 300; t++) world.step();
    expect(late.alive).toBe(false);
    expect(late.inWave).toBe(false);
    kill(world, b, a);
    until(world, () => world.wave === 2 && late.alive);
    expect(late.alive).toBe(true);
  });

  it('bots fill every empty slot, and give theirs up to a human', () => {
    const world = new World(9, { mode: 'ffa', bots: 64 });
    world.addPlayer('human', { send() {} });
    world.step();
    expect(world.playerCount).toBe(64);
    expect(world.humanCount).toBe(1);
    const h2 = world.addPlayer('second human', { send() {} });
    expect(h2).not.toBeNull();
    expect(world.playerCount).toBe(64);
    expect(world.humanCount).toBe(2);
  });

  it('bots fight: a room of bots plays a wave down to its winner', () => {
    const world = new World(10, { mode: 'ffa', bots: 16 });
    world.addPlayer('watcher', { send() {} });
    until(world, () => world.phase === Phase.Live);
    const me = world.players.find((p) => p && !p.bot)!;
    // Our human sits this one out (dies at once) so the bots settle it.
    until(world, () => me.alive, 600);
    kill(world, me, me);
    let kills = 0;
    until(world, () => world.phase === Phase.Victory, 30 * 60 * 4);
    for (const p of world.players) if (p) kills += p.kills;
    expect(kills).toBeGreaterThan(5);
    expect(world.phase).toBe(Phase.Victory);
    const champ = world.players[world.winner];
    expect(champ?.bot).toBeTruthy();
    expect(inWave(world).filter((p) => p.alive).length).toBeLessThanOrEqual(1);
  }, 60_000);

  it('clients make the new map from the seed and agree with the server chunk for chunk', () => {
    const frames: Uint8Array[] = [];
    const world = new World(11, { mode: 'ffa' });
    const a = world.addPlayer('a', { send: (d) => frames.push(d) })!;
    const b = world.addPlayer('b', { send() {} })!;
    const game = new Game();
    game.myId = a.id;
    const pump = () => {
      for (const f of frames) {
        const r = new Reader(f);
        r.u8();
        const tick = r.u32();
        const ack = r.u16();
        game.applyFrame(tick, ack, r);
      }
      frames.length = 0;
    };
    until(world, () => a.alive && b.alive);
    pump();
    kill(world, b, a);
    until(world, () => world.wave === 1 && world.phase === Phase.Countdown);
    pump();
    expect(game.roundState?.phase).toBe(Phase.Countdown);
    expect(game.resyncWanted.length).toBe(0); // same engine here, so every hash matches
    for (let ci = 0; ci < CHUNK_COUNT; ci++) expect(game.terrain.chunkHash(ci)).toBe(world.terrain.chunkHash(ci));
  });
});
