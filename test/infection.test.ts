import { describe, expect, it } from 'vitest';
import { GameMode, Phase, TEAMS_IN_MODE, Team, VOTE_MODES } from '../src/shared/protocol.ts';
import { NO_OWNER, W_CRAB } from '../src/shared/particles.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { BeastKind } from '../src/shared/wildlife.ts';
import { MapKind, generateWorld, lastComplexes, lastLair, lastSiege } from '../src/shared/worldgen.ts';
import { INFECTION_LIVES, type Player, World } from '../src/server/world.ts';

type Internals = { damage: (p: Player, n: number, by: number, w: number) => void };
const hurt = (world: World, p: Player, n: number, w = 0) => (world as unknown as Internals).damage(p, n, NO_OWNER, w);

function until(world: World, cond: () => boolean, max = 3000): void {
  for (let t = 0; t < max && !cond(); t++) world.step();
}

describe('infection map', () => {
  it("siege's fortress at one end; a hive cave under the far half, open to the sky, its tunnel coming up by the fortress's gate", () => {
    const t = new Terrain();
    for (const seed of [11, 1000]) {
      generateWorld(t, seed, MapKind.Infection);
      const sg = lastSiege!;
      const hive = lastLair!;
      expect(sg).not.toBeNull();
      expect(hive).not.toBeNull();
      expect(lastComplexes.some((c) => c.fortress)).toBe(true);
      // The hive: under the far half, clear of the fortress.
      const fortMid = (sg.fort[0] + sg.fort[1]) / 2;
      const hiveMid = (hive.x0 + hive.x1) / 2;
      expect(Math.abs(hiveMid - fortMid)).toBeGreaterThan(1500);
      expect(sg.side === 0 ? hive.x0 > sg.fort[1] + 1000 : hive.x1 < sg.fort[0] - 1000).toBe(true);
      // Its dens are open (air over each one's floor).
      for (const d of hive.dens) expect(t.isSolid(d.floorX, d.floorY - 10)).toBe(false);
      // A way up out of it beside the gate: the tunnel's mouth, among its chutes.
      const gate = sg.side === 0 ? sg.fort[1] : sg.fort[0];
      expect(hive.mouths.some((x) => Math.abs(x - gate) < 80)).toBe(true);
    }
  });
});

describe('infection', () => {
  it('a mode of its own: everyone on one side, in the vote and the rotation', () => {
    expect(TEAMS_IN_MODE[GameMode.Infection]).toBe(1);
    expect(VOTE_MODES).toContain(GameMode.Infection);
  });

  function infection(seed: number) {
    const world = new World(seed, { mode: 'ffa', bots: 12, rotation: [GameMode.Infection] });
    const me = world.addPlayer('watcher', { send() {} })!;
    until(world, () => world.phase === Phase.Live);
    expect(world.mapKind).toBe(MapKind.Infection);
    return { world, me };
  }
  const defenders = (world: World) => world.players.filter((p): p is Player => !!p && !p.expedition);
  const expedition = (world: World) => world.players.filter((p): p is Player => !!p && p.expedition);

  it('opens with the defenders at their posts in the fortress and the lost expedition at the bottom of the hive, crabs all round them; nests in the other dens, guarded', () => {
    const { world, me } = infection(31);
    expect(world.infectionLives).toBe(INFECTION_LIVES);
    for (const p of world.players) if (p) expect(p.team).toBe(Team.Red);
    // Humans are never the expedition.
    expect(me.expedition).toBe(false);
    const fort = world.siege!.fort;
    for (const p of defenders(world)) {
      expect(p.alive).toBe(true);
      expect(p.cx).toBeGreaterThan(fort[0] - 900);
      expect(p.cx).toBeLessThan(fort[1] + 900);
    }
    const lost = expedition(world);
    expect(lost.length).toBeGreaterThanOrEqual(3);
    const hive = world.lair!;
    const crabs = world.beasts.filter((b) => b?.kind === BeastKind.CoralCrab);
    for (const p of lost) {
      expect(p.alive).toBe(true);
      expect(p.cx).toBeGreaterThan(hive.x0);
      expect(p.cx).toBeLessThan(hive.x1);
      // Crabs close by.
      expect(crabs.some((c) => Math.hypot(c!.x - p.cx, c!.y - p.cy) < 260)).toBe(true);
    }
    const nests = world.beasts.filter((b) => b?.kind === BeastKind.Nest);
    expect(nests.filter((b) => b!.gem).length).toBe(hive.dens.length - 1);
    expect(nests.filter((b) => !b!.gem).length).toBeGreaterThanOrEqual(hive.dens.length - 1);
    expect(world.beasts.filter((b) => b?.kind === BeastKind.Millipede).length).toBeGreaterThanOrEqual(2);
  });

  it('the crab nests brood crabs', () => {
    const { world } = infection(32);
    const count = () => world.beasts.filter((b) => b?.kind === BeastKind.CoralCrab).length;
    // (Clear the first lot, so the nests have room to brood.)
    world.beasts.forEach((b, k) => {
      if (b?.kind === BeastKind.CoralCrab) world.beasts[k] = null;
    });
    world.players.forEach((p) => p && (p.possessed = false));
    until(world, () => count() > 0, 30 * 30);
    expect(count()).toBeGreaterThan(0);
  });

  it("each defender's death spends a respawn; the expedition's are free and they come back down in the hive", () => {
    const { world } = infection(33);
    const d = defenders(world)[0];
    hurt(world, d, 9999);
    expect(world.infectionLives).toBe(INFECTION_LIVES - 1);
    expect(d.pendingSpawn).toBe(true);
    const e = expedition(world)[0];
    hurt(world, e, 9999);
    expect(world.infectionLives).toBe(INFECTION_LIVES - 1);
    until(world, () => e.alive, 600);
    expect(e.alive).toBe(true);
    expect(e.cx).toBeGreaterThan(world.lair!.x0);
    expect(e.cx).toBeLessThan(world.lair!.x1);
  });

  it('respawns spent and every defender down or possessed: overrun, the hive wins', () => {
    const { world } = infection(34);
    world.infectionLives = 0;
    const defs = defenders(world);
    // Half killed outright, half taken by crabs.
    defs.forEach((p, i) => hurt(world, p, 9999, i % 2 ? W_CRAB : 0));
    for (const p of defs) {
      p.pendingSpawn = false;
      p.delivering = -1;
    }
    world.step();
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).toBe(255);
  });

  it('fifteen minutes held: the defenders win', () => {
    const { world } = infection(35);
    world.phaseTimer = 1;
    world.step();
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).toBe(Team.Red);
  });

  it('the possessed are let be by the hive\'s other creatures too', () => {
    const { world } = infection(36);
    const d = defenders(world)[0];
    hurt(world, d, 9999, W_CRAB);
    expect(d.possessed).toBe(true);
    for (let k = 0; k < 30; k++) world.step();
    for (const b of world.beasts) if (b && b.kind !== BeastKind.Nest) expect(b.target === d.id && b.kind !== BeastKind.CoralCrab ? 'targets possessed' : 'ok').toBe('ok');
  });
});
