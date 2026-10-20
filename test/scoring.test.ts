import { describe, expect, it } from 'vitest';
import { Reader } from '../src/shared/codec.ts';
import { applyFrameRecords, nullHandler } from '../src/shared/frame.ts';
import { GameMode, S_FRAME, Team } from '../src/shared/protocol.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { bodyPoints, newMillipede } from '../src/shared/wildlife.ts';
import { type Player, World } from '../src/server/world.ts';
import { scoreOf } from '../src/client/game.ts';

type Internals = { damage: (p: Player, n: number, by: number, w: number) => void };
const kill = (world: World, p: Player, by: Player) => (world as unknown as Internals).damage(p, 999, by.id, 0);
const until = (world: World, cond: () => boolean, max = 3000) => {
  for (let t = 0; t < max && !cond(); t++) world.step();
};

describe('scoring', () => {
  it('a kill on your own side is no kill: it costs a point', () => {
    const world = new World(31, { mode: 'ffa', rotation: [GameMode.Lts] });
    const ps = Array.from({ length: 4 }, (_, i) => world.addPlayer(`p${i}`, { send() {} })!);
    until(world, () => world.wave >= 1 && ps.every((p) => p.alive && p.team !== Team.None));
    const a = ps[0];
    const mate = ps.find((p) => p !== a && p.team === a.team)!;
    const foe = ps.find((p) => p.team !== a.team)!;
    expect(mate).toBeTruthy();
    expect(foe).toBeTruthy();
    kill(world, mate, a);
    expect(a.kills).toBe(0);
    expect(a.teamKills).toBe(1);
    expect(a.waveKills).toBe(0);
    kill(world, foe, a);
    expect(a.kills).toBe(1);
    expect(scoreOf({ kills: a.kills, beasts: a.beastKills, teamKills: a.teamKills })).toBe(0);
  });

  it('killing a creature counts as a wildlife kill, to whoever hurt it last', () => {
    const world = new World(32, { mode: 'ffa', rotation: [GameMode.Pvp] });
    const a = world.addPlayer('a', { send() {} })!;
    const b = world.addPlayer('b', { send() {} })!;
    until(world, () => a.alive && b.alive);
    world.beasts.fill(null);
    const m = newMillipede(world.terrain, 1000, 400, 1);
    world.beasts[0] = m;
    bodyPoints(world.terrain, m, world.beastPts[0]);
    // Shot by a, then finished by something nobody did: still a's.
    world.hurtBeast(0, m.hp * 0.6, a.id);
    world.hurtBeast(0, m.hp * 2, 255);
    expect(world.beasts[0]).toBeNull();
    expect(a.beastKills).toBe(1);
    expect(b.beastKills).toBe(0);
    expect(a.kills).toBe(0);
  });

  it('clients are told every clone\'s wildlife kills and teamkills', () => {
    const world = new World(33, { mode: 'ffa', rotation: [GameMode.Pvp] });
    const inbox: Uint8Array[] = [];
    const a = world.addPlayer('a', { send: (m: Uint8Array) => inbox.push(m) })!;
    a.beastKills = 3;
    a.teamKills = 2;
    let got: { beasts: number; teamKills: number } | undefined;
    const h = { ...nullHandler, scores: (list: { id: number; beasts: number; teamKills: number }[]) => (got = list.find((s) => s.id === a.id) ?? got) };
    for (let t = 0; t < 120 && !got; t++) {
      world.step();
      for (const m of inbox.splice(0)) {
        const r = new Reader(m);
        if (r.u8() !== S_FRAME) continue;
        r.u32();
        r.u16();
        applyFrameRecords(r, new Terrain(), h);
      }
    }
    expect(got).toBeTruthy();
    expect(got!.beasts).toBe(3);
    expect(got!.teamKills).toBe(2);
  });
});
