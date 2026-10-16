import { describe, expect, it } from 'vitest';
import { GameMode, Phase, Team } from '../src/shared/protocol.ts';
import { World } from '../src/server/world.ts';

type Internals = { damage(p: unknown, n: number, by: number, w: number): void; kings: number[] };
function until(world: World, cond: () => boolean, max = 3000): void {
  for (let t = 0; t < max && !cond(); t++) world.step();
}
/** A room on `mode`, one human among bots, live. */
function room(mode: number, bots = 5) {
  const world = new World(41, { mode: 'ffa', rotation: [mode], tanks: false, bots });
  const me = world.addPlayer('me', { send() {} })!;
  until(world, () => world.phase === Phase.Live);
  until(world, () => me.alive, 1200);
  return { world, me };
}
const sides = (world: World, n: number) => {
  const c = new Array(n).fill(0);
  for (const p of world.players) if (p && p.team < n) c[p.team]++;
  return c;
};

describe('changing team', () => {
  it('only once dead: alive, the ask is ignored', () => {
    const { world, me } = room(GameMode.Regicide);
    const was = me.team;
    world.changeTeam(me.id, 1 - was);
    expect(me.team).toBe(was);
  });

  it('dead in a respawn mode: switched at once, a bot from that side crossing over to keep it even; back on the new side', () => {
    const { world, me } = room(GameMode.Regicide);
    // (Not a king: kings can't.)
    const k = (world as unknown as Internals).kings;
    if (k.includes(me.id)) return;
    const was = me.team;
    const before = sides(world, 2);
    (world as unknown as Internals).damage(me, 999, 255, 0);
    expect(me.alive).toBe(false);
    world.changeTeam(me.id, 1 - was);
    expect(me.team).toBe(1 - was);
    expect(sides(world, 2)).toEqual(before);
    until(world, () => me.alive, 30 * 30);
    expect(me.alive).toBe(true);
    expect(me.team).toBe(1 - was);
  });

  it('not to a team the mode has, nor in modes without sides', () => {
    const { world, me } = room(GameMode.Regicide);
    (world as unknown as Internals).damage(me, 999, 255, 0);
    const was = me.team;
    world.changeTeam(me.id, 3);
    expect(me.team).toBe(was);
    const pvp = room(GameMode.Pvp);
    (pvp.world as unknown as Internals).damage(pvp.me, 999, 255, 0);
    pvp.world.changeTeam(pvp.me.id, 1);
    expect(pvp.me.team).toBe(Team.None);
  });

  it("Last Team Standing (out for the wave): it's kept, and holds from the next wave's draw", () => {
    const { world, me } = room(GameMode.Lts);
    const was = me.team;
    (world as unknown as Internals).damage(me, 999, 255, 0);
    world.changeTeam(me.id, 1 - was);
    expect(me.team).toBe(was); // (not mid-wave)
    expect(me.teamWish).toBe(1 - was);
    let waves = 0;
    for (let w = 0; w < 3; w++) {
      const wave = world.wave;
      until(world, () => world.wave > wave && world.phase === Phase.Live, 30 * 60 * 8);
      if (world.wave === wave) break;
      waves++;
      expect(me.team).toBe(1 - was);
    }
    expect(waves).toBeGreaterThan(0);
  });
});
