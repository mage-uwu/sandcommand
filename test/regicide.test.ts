import { describe, expect, it } from 'vitest';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, ACTOR_W, CHUNK_COUNT, WORLD_W } from '../src/shared/constants.ts';
import { ClassId } from '../src/shared/body.ts';
import { Mat } from '../src/shared/materials.ts';
import { GameMode, Phase, Team } from '../src/shared/protocol.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { generateWorld, lastComplexes } from '../src/shared/worldgen.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';

type Internals = { damage: (p: Player, n: number, by: number, w: number) => void };
const kill = (world: World, p: Player, by: Player) => (world as unknown as Internals).damage(p, 999, by.id, 0);
function until(world: World, cond: () => boolean, max = 3000): void {
  for (let t = 0; t < max && !cond(); t++) world.step();
}
const regicide = (seed: number, n: number) => {
  const world = new World(seed, { mode: 'ffa', rotation: [GameMode.Regicide], tanks: false });
  const ps = Array.from({ length: n }, (_, i) => world.addPlayer(`p${i}`, { send() {} })!);
  until(world, () => world.phase === Phase.Live);
  return { world, ps };
};

describe('Regicide', () => {
  it('maps always get two big fortresses, red west and green east, each with a steel vault', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const t = new Terrain();
      generateWorld(t, seed, true);
      const forts = lastComplexes.filter((c) => c.fortress);
      expect(forts.length).toBe(2);
      const [west, east] = forts;
      expect(west.fortress!.team).toBe(Team.Red);
      expect(east.fortress!.team).toBe(Team.Green);
      expect(west.x1).toBeLessThan(WORLD_W / 2);
      expect(east.x0).toBeGreaterThan(WORLD_W / 2);
      for (const f of forts) {
        expect(f.x1 - f.x0).toBeGreaterThanOrEqual(300); // large
        expect(Math.max(...f.basements)).toBe(3); // deep
        const k = f.fortress!.king;
        // The king's spot: room for a clone, standing on steel, deep below the ground floor.
        const x = Math.floor(k.x - ACTOR_W / 2);
        expect(t.rectSolid(x, k.y - ACTOR_H, x + ACTOR_W - 1, k.y - 1)).toBe(false);
        expect(t.get(k.x, k.y)).toBe(Mat.Metal);
        expect(k.y).toBeGreaterThan(f.floor + 100);
        expect(f.fortress!.spawns.length).toBeGreaterThan(10);
      }
      // No ordinary complex crowds them.
      for (const c of lastComplexes.filter((c) => !c.fortress)) {
        for (const f of forts) expect(c.x1 <= f.x0 - 64 || c.x0 >= f.x1 + 64).toBe(true);
      }
    }
  });

  it('the same seed without the flag builds no fortresses', () => {
    generateWorld(new Terrain(), 3);
    expect(lastComplexes.some((c) => c.fortress)).toBe(false);
  });

  it('crowns a heavy king per side in his vault; soldiers start at their fortress, no rockets', () => {
    const { world, ps } = regicide(41, 8);
    expect(world.mapFortresses).toBe(true);
    for (const team of [Team.Red, Team.Green]) {
      const king = world.players[world.kings[team]]!;
      expect(king.team).toBe(team);
      expect(king.alive).toBe(true);
      expect(king.body.cls).toBe(ClassId.Heavy);
      const vault = world.fortresses[team].king;
      expect(Math.abs(king.cx - vault.x)).toBeLessThan(6);
      expect(Math.abs(king.body.y + ACTOR_H - vault.y)).toBeLessThan(3);
    }
    for (const p of ps) {
      expect(p.alive).toBe(true);
      expect(p.delivering).toBe(-1);
      const fort = world.fortresses[p.team];
      const xs = fort.spawns.map((s) => s.x);
      expect(p.cx).toBeGreaterThan(Math.min(...xs) - 20);
      expect(p.cx).toBeLessThan(Math.max(...xs) + 20);
    }
  });

  it('a fallen soldier comes back by drop rocket after ten seconds, at his own fortress', () => {
    const { world, ps } = regicide(42, 6);
    const soldier = ps.find((p) => !world.isKing(p))!;
    const enemy = ps.find((p) => p.team !== soldier.team)!;
    kill(world, soldier, enemy);
    expect(soldier.alive).toBe(false);
    for (let k = 0; k < 30 * 9; k++) world.step();
    expect(soldier.alive).toBe(false);
    expect(soldier.delivering).toBe(-1); // not yet
    until(world, () => soldier.delivering >= 0, 30 * 3);
    expect(soldier.delivering).toBeGreaterThanOrEqual(0);
    until(world, () => soldier.alive, 30 * 10);
    expect(soldier.alive).toBe(true);
    const xs = world.fortresses[soldier.team].spawns.map((s) => s.x);
    expect(soldier.cx).toBeGreaterThan(Math.min(...xs) - 200);
    expect(soldier.cx).toBeLessThan(Math.max(...xs) + 200);
    expect(world.phase).toBe(Phase.Live);
  });

  it('the king is mortal: his death ends the wave, and the other side wins', () => {
    const { world, ps } = regicide(43, 6);
    const redKing = world.players[world.kings[Team.Red]]!;
    const assassin = ps.find((p) => p.team === Team.Green)!;
    kill(world, redKing, assassin);
    world.step();
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).toBe(Team.Green);
    for (const p of ps) expect(p.wins).toBe(p.team === Team.Green ? 1 : 0);
    expect(redKing.pendingSpawn).toBe(false); // no coming back
  });

  it('a king who leaves the game hands the crown on instead of losing it', () => {
    const { world } = regicide(44, 6);
    const old = world.kings[Team.Red];
    world.removePlayer(old);
    world.step();
    expect(world.phase).toBe(Phase.Live);
    expect(world.kings[Team.Red]).not.toBe(old);
    expect(world.players[world.kings[Team.Red]]?.team).toBe(Team.Red);
  });

  it('late joiners are dealt into the smaller side and drop in as reinforcements', () => {
    const { world } = regicide(45, 5);
    const late = world.addPlayer('late', { send() {} })!;
    expect(late.inWave).toBe(true);
    expect(late.team === Team.Red || late.team === Team.Green).toBe(true);
    until(world, () => late.alive, 30 * 16);
    expect(late.alive).toBe(true);
  });

  it('rotates in as the third mode, and clients build the fortresses from the seed', () => {
    const world = new World(46, { mode: 'ffa' });
    expect(world.modeOfWave(3)).toBe(GameMode.Regicide);
    const frames: Uint8Array[] = [];
    const w2 = new World(47, { mode: 'ffa', rotation: [GameMode.Regicide] });
    const a = w2.addPlayer('a', { send: (d) => frames.push(d) })!;
    w2.addPlayer('b', { send() {} });
    const game = new Game();
    game.myId = a.id;
    until(w2, () => w2.phase === Phase.Live);
    w2.step();
    for (const f of frames) {
      const r = new Reader(f);
      r.u8();
      const tick = r.u32();
      const ack = r.u16();
      game.applyFrame(tick, ack, r);
    }
    // The newcomer made the fortress map itself: every chunk matches.
    let same = 0;
    for (let ci = 0; ci < CHUNK_COUNT; ci++) if (game.terrain.chunkHash(ci) === w2.terrain.chunkHash(ci)) same++;
    expect(same).toBe(CHUNK_COUNT);
    expect(game.roundState?.mode).toBe(GameMode.Regicide);
    expect(game.roundState?.kings).toEqual([w2.kings[0], w2.kings[1]]);
    expect(game.isKing(w2.kings[0])).toBe(true);
  });
});
