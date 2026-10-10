import { describe, expect, it } from 'vitest';
import { WORLD_W } from '../src/shared/constants.ts';
import { GameMode, Phase, Team } from '../src/shared/protocol.ts';
import { ATTACKERS, DEFENDERS, SIEGE_LIVES, SIEGE_TICKS, siegeSide } from '../src/shared/siege.ts';
import { MOD_H, MOD_W } from '../src/shared/structures.ts';
import { isDog } from '../src/shared/tank.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { MapKind, generateWorld, lastComplexes, lastSiege } from '../src/shared/worldgen.ts';
import { type Player, World } from '../src/server/world.ts';

type Internals = { damage: (p: Player, n: number, by: number, w: number) => void };
const kill = (world: World, p: Player, by: Player) => (world as unknown as Internals).damage(p, 999, by.id, 0);

function until(world: World, cond: () => boolean, max = 3000): void {
  for (let t = 0; t < max && !cond(); t++) world.step();
}

describe('siege map', () => {
  it('a massive fortress at one end (the king\'s vault in it, doors inside and out), outposts before it, the landing zone far off', () => {
    const t = new Terrain();
    const sides = new Set<number>();
    for (const seed of [11, 1000]) {
      generateWorld(t, seed, MapKind.Siege);
      const sg = lastSiege!;
      expect(sg).not.toBeNull();
      expect(sg.side).toBe(siegeSide(seed));
      sides.add(sg.side);
      const fort = lastComplexes.find((c) => c.fortress)!;
      expect(fort.fortress!.team).toBe(DEFENDERS);
      expect(fort.x1 - fort.x0).toBeGreaterThanOrEqual(12 * MOD_W);
      expect(Math.max(...fort.heights)).toBe(4);
      expect(Math.max(...fort.basements)).toBe(3);
      expect(fort.fortress!.king.y).toBeGreaterThan(fort.floor + 2 * MOD_H);
      // Gates at both ends and doors inside it, all the defenders'.
      expect(fort.doors!.length).toBeGreaterThanOrEqual(4);
      expect(fort.doors!.every((d) => d.team === DEFENDERS)).toBe(true);
      expect(fort.doors!.filter((d) => d.x0 > fort.x0 + MOD_W && d.x1 < fort.x1 - MOD_W).length).toBeGreaterThanOrEqual(2);
      // Outposts, the defenders', between it and the landing zone.
      const outposts = lastComplexes.filter((c) => c.owner === DEFENDERS && !c.tower);
      expect(outposts.length).toBeGreaterThanOrEqual(2);
      for (const o of outposts) {
        expect(o.doors!.every((d) => d.team === DEFENDERS)).toBe(true);
        expect(Math.abs((o.x0 + o.x1) / 2 - (fort.x0 + fort.x1) / 2)).toBeLessThan(Math.abs((sg.lz[0] + sg.lz[1]) / 2 - (fort.x0 + fort.x1) / 2));
      }
      // The landing zone: narrow, at the far end, a long way from the walls.
      expect(sg.lz[1] - sg.lz[0]).toBeLessThanOrEqual(400);
      const gap = sg.side === 0 ? sg.lz[0] - fort.x1 : fort.x0 - sg.lz[1];
      expect(gap).toBeGreaterThan(1500);
      expect(sg.side === 0 ? sg.lz[0] > WORLD_W / 2 : sg.lz[1] < WORLD_W / 2).toBe(true);
    }
    expect(sides.size).toBe(2); // (either end, by the seed)
  });
});

describe('siege', () => {
  function siegeWorld(seed: number) {
    const world = new World(seed, { mode: 'ffa', bots: 12, rotation: [GameMode.Siege] });
    world.addPlayer('watcher', { send() {} });
    until(world, () => world.phase === Phase.Live);
    expect(world.mapKind).toBe(MapKind.Siege);
    return world;
  }
  const side = (world: World, team: number) => world.players.filter((p): p is Player => !!p && p.team === team);

  it('opens with the king in his vault, the defenders at their posts, and armour for both sides', () => {
    const world = siegeWorld(21);
    expect(world.siegeLives).toBe(SIEGE_LIVES);
    const king = world.players[world.kings[DEFENDERS]]!;
    expect(king.alive).toBe(true);
    expect(king.team).toBe(DEFENDERS);
    expect(world.kings[ATTACKERS]).toBe(255);
    const fort = world.fortresses[DEFENDERS]!;
    expect(Math.abs(king.cx - fort.king.x)).toBeLessThan(10);
    // Defenders start on the ground, in place; attackers come down by rocket.
    for (const p of side(world, DEFENDERS)) expect(p.alive).toBe(true);
    // Tanks (empty, anyone's) and watchdogs (each a soldier's) for both sides.
    const tanks = world.tanks.filter((t) => t && !isDog(t));
    const dogs = world.tanks.filter((t) => t && isDog(t));
    expect(tanks.length).toBeGreaterThanOrEqual(5);
    expect(dogs.length).toBeGreaterThanOrEqual(6);
    const dogTeams = dogs.map((d) => world.players[d!.owner]!.team);
    expect(dogTeams).toContain(DEFENDERS);
    expect(dogTeams).toContain(ATTACKERS);
    // The attackers' armour waits in their landing zone.
    const lz = world.siege!.lz;
    expect(world.tanks.filter((t) => t && t.x >= lz[0] - 10 && t.x < lz[1]).length).toBeGreaterThanOrEqual(5);
  });

  it('the attackers all come down in their landing zone', () => {
    const world = siegeWorld(22);
    const lz = world.siege!.lz;
    const atk = side(world, ATTACKERS);
    until(world, () => atk.filter((p) => p.alive).length >= Math.min(4, atk.length), 900);
    const down = atk.filter((p) => p.alive);
    expect(down.length).toBeGreaterThan(0);
    for (const p of down) {
      expect(p.cx).toBeGreaterThan(lz[0] - 80);
      expect(p.cx).toBeLessThan(lz[1] + 80);
    }
  });

  it('each attacker death spends a life; with none left, the attackers are out and the fortress holds', () => {
    const world = siegeWorld(23);
    const atk = side(world, ATTACKERS);
    const def = side(world, DEFENDERS).find((p) => !world.isKing(p))!;
    until(world, () => atk.some((p) => p.alive), 900);
    const a = atk.find((p) => p.alive)!;
    kill(world, a, def);
    expect(world.siegeLives).toBe(SIEGE_LIVES - 1);
    expect(a.pendingSpawn).toBe(true);
    // Defenders die for free.
    kill(world, def, a);
    expect(world.siegeLives).toBe(SIEGE_LIVES - 1);
    expect(def.pendingSpawn).toBe(true);
    // Out of lives: whoever falls now stays down, and once none are left, red wins.
    world.siegeLives = 0;
    for (let n = 0; n < 40 && world.phase === Phase.Live; n++) {
      for (const p of atk) {
        if (p.alive) kill(world, p, def);
        p.pendingSpawn = false;
        p.delivering = -1;
      }
      world.step();
    }
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).toBe(DEFENDERS);
  });

  it('the king falls: green takes it', () => {
    const world = siegeWorld(24);
    const king = world.players[world.kings[DEFENDERS]]!;
    const a = side(world, ATTACKERS)[0];
    kill(world, king, a);
    world.step();
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).toBe(ATTACKERS);
  });

  it('ten minutes with the king standing: red holds', () => {
    const world = siegeWorld(25);
    expect(world.phaseTimer).toBeGreaterThan(SIEGE_TICKS - 30 * 5);
    world.phaseTimer = 1;
    world.step();
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).toBe(DEFENDERS);
    void Team;
  });
});
