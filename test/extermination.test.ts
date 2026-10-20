import { describe, expect, it } from 'vitest';
import { Reader } from '../src/shared/codec.ts';
import { seedFor } from './helpers.ts';
import { CALL_COST, CallKind, GameMode, Phase, TEAMS_IN_MODE, Team } from '../src/shared/protocol.ts';
import { MapKind } from '../src/shared/worldgen.ts';
import { LAIR_DENS } from '../src/shared/lair.ts';
import { BEAST_BUILD, BeastKind, wyrm, wyrmScale } from '../src/shared/wildlife.ts';
import { ACTOR_H, ACTOR_W, WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { W_BASILISK } from '../src/shared/particles.ts';
import { WeaponId } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';

type Internals = { damage: (p: Player, n: number, by: number, w: number) => void; phaseTimer: number };
function until(world: World, cond: () => boolean, max = 3000): void {
  for (let t = 0; t < max && !cond(); t++) world.step();
}
/** The lair's quarry: its basilisks, and its dragon. */
const basilisks = (world: World) => world.beasts.map((b, k) => ({ b, k })).filter((o) => o.b && wyrm(o.b.kind));
const exterm = (seed: number, n: number, send?: (d: Uint8Array) => void, bots = 0, kind: number = MapKind.Lair) => {
  const world = new World(seedFor(seed, kind), { mode: 'ffa', rotation: [GameMode.Extermination], tanks: false, bots });
  const ps = Array.from({ length: n }, (_, i) => world.addPlayer(`p${i}`, { send: i === 0 && send ? send : () => {} })!);
  until(world, () => world.phase === Phase.Live);
  until(world, () => ps.every((p) => p.alive), 1200);
  return { world, ps };
};

describe('Extermination', () => {
  it('is fought in the lair: three basilisks and a dragon, one hibernating on the floor of each den, and everyone on one side', () => {
    const { world, ps } = exterm(301, 3);
    expect(TEAMS_IN_MODE[GameMode.Extermination]).toBe(1);
    expect(world.mapKind).toBe(MapKind.Lair);
    expect(world.lair?.dens.length).toBe(LAIR_DENS);
    const bs = basilisks(world);
    expect(bs.length).toBe(LAIR_DENS);
    expect(bs.filter(({ b }) => b!.kind === BeastKind.Dragon).length).toBe(1);
    for (const { b } of bs) {
      expect(b!.frozen).toBeGreaterThan(30 * 60 * 10); // (asleep the whole wave, unless woken)
      expect(world.lair!.dens.some((d) => Math.abs(b!.x - d.floorX) < 8 && Math.abs(b!.y - d.floorY) < 16 * wyrmScale(b!.kind))).toBe(true);
    }
    for (const p of ps) expect(p.team).toBe(Team.Red);
    expect(world.friendly(ps[0].id, ps[1])).toBe(true);
  });

  it('a cache of heavy weapons lies by every chute mouth, and the basilisks (and the dragon) are half as tough as a wild one', () => {
    const { world } = exterm(308, 2);
    for (const mx of world.lair!.mouths) {
      const near = world.items.filter((it) => Math.abs(it.x - mx) < 60);
      for (const w of [WeaponId.Bazooka, WeaponId.ATCannon, WeaponId.Autocannon]) expect(near.map((it) => it.weapon)).toContain(w);
    }
    for (const { b } of basilisks(world)) expect(b!.hp).toBe(BEAST_BUILD[b!.kind].hp / 2);
  });

  it('woken, a basilisk stays on its own ground: it finds its way through the cave to a clone and kills it', () => {
    const { world, ps } = exterm(309, 2);
    const [a, other] = ps;
    // (Only the basilisks: the lesser life out of the way.)
    for (let i = 0; i < world.beasts.length; i++) if (world.beasts[i] && world.beasts[i]!.kind !== BeastKind.Basilisk) world.beasts[i] = null;
    (world as unknown as { beastSpawnAt: number }).beastSpawnAt = 1e9;
    // (The other far off, up top over the far end.)
    other.body.x = WORLD_W - 100;
    other.body.y = world.terrain.surfaceY(WORLD_W - 100) - ACTOR_H;
    const lair = world.lair!;
    // A clone on the floor of the first chamber, well along from its den (the others asleep far off).
    const d = lair.dens[0];
    const x = d.floorX + 160;
    let y = d.floorY - 30;
    while (!world.terrain.isSolid(Math.round(x), y + 1) && y < WORLD_H - 20) y++;
    a.body.x = x - ACTOR_W / 2;
    a.body.y = y + 1 - ACTOR_H;
    a.body.vx = a.body.vy = 0;
    const { b, k } = basilisks(world).sort((p0, q) => Math.abs(p0.b!.fx - d.floorX) - Math.abs(q.b!.fx - d.floorX))[0];
    world.hurtBeast(k, 1, a.id);
    let highest = Infinity;
    for (let t = 0; t < 30 * 40 && a.alive; t++) {
      a.hp = Math.min(a.hp, 100);
      world.step();
      if (b!.frenzy > 0) highest = Math.min(highest, b!.fy);
    }
    expect(a.alive).toBe(false);
    expect(a.lastWeapon).toBe(W_BASILISK);
    // It never went for the surface.
    expect(highest).toBeGreaterThan(world.terrain.surfaceY(Math.round(d.floorX)) + 60);
  });

  it('fought on foot, mostly: one tank by parachute, no free gold, and radio calls refused once three vehicles are about', () => {
    const world = new World(310, { mode: 'ffa', rotation: [GameMode.Extermination], bots: 0 });
    const ps = Array.from({ length: 2 }, (_, i) => world.addPlayer(`p${i}`, { send() {} })!);
    for (let t = 0; t < 3000 && world.phase !== Phase.Live; t++) world.step();
    expect(world.tanks.filter(Boolean).length).toBe(1);
    for (const p of ps) expect(p.gold).toBeLessThan(CALL_COST);
    for (let t = 0; t < 1200 && !ps[0].alive; t++) world.step();
    const [a] = ps;
    world.equip(a, WeaponId.Radio);
    const call = () => {
      a.gold = 1e6;
      a.callCd = 0;
      return world.call(a.id, CallKind.Tank);
    };
    expect(call()).toBe(true);
    expect(call()).toBe(true);
    expect(world.tanks.filter(Boolean).length + world.ships.filter(Boolean).length).toBe(3);
    expect(call()).toBe(false);
  });

  it('the lair crawls with millipedes and hangs with wasps\' nests, kept up; but no basilisk ever comes back', () => {
    const { world, ps } = exterm(302, 2);
    const count = (k: number) => world.beasts.filter((o) => o?.kind === k).length;
    // From the start: nests on the roof, millipedes (and a few asps and cave spiders) about the cave.
    expect(count(BeastKind.Nest)).toBeGreaterThanOrEqual(3);
    expect(count(BeastKind.Millipede) + count(BeastKind.Asp) + count(BeastKind.Spider)).toBeGreaterThanOrEqual(10);
    expect(count(BeastKind.Millipede)).toBeGreaterThan(count(BeastKind.Asp));
    const lair = world.lair!;
    for (const b of world.beasts) {
      if (!b || b.kind === BeastKind.Seeder) continue;
      expect(b.x).toBeGreaterThan(lair.x0 - 200);
      expect(b.x).toBeLessThan(lair.x1 + 200);
    }
    // Killed off, they come back; a basilisk killed doesn't.
    const k = world.beasts.findIndex((o) => o?.kind === BeastKind.Basilisk);
    world.hurtBeast(k, 1e9, ps[0].id);
    for (let i = 0; i < world.beasts.length; i++) if (world.beasts[i]?.kind === BeastKind.Millipede) world.beasts[i] = null;
    for (let t = 0; t < 30 * 60; t++) world.step();
    expect(count(BeastKind.Millipede) + count(BeastKind.Asp) + count(BeastKind.Spider)).toBeGreaterThan(0);
    expect(basilisks(world).length).toBe(LAIR_DENS - 1);
  });

  it('the fallen come back by drop rocket', () => {
    const { world, ps } = exterm(303, 2);
    const [a] = ps;
    (world as unknown as Internals).damage(a, 999, 255, 0);
    expect(a.alive).toBe(false);
    expect(a.pendingSpawn).toBe(true);
    until(world, () => a.alive, 30 * 30);
    expect(a.alive).toBe(true);
    expect(world.phase).toBe(Phase.Live);
  });

  it('kill all four and everyone wins (the fallen too)', () => {
    const { world, ps } = exterm(304, 2);
    const bs = basilisks(world);
    for (const { k } of bs.slice(0, 3)) world.hurtBeast(k, 1e9, ps[0].id);
    world.step();
    expect(world.phase).toBe(Phase.Live); // (one still alive)
    world.hurtBeast(bs[3].k, 1e9, ps[1].id);
    world.step();
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).toBe(Team.Red);
    for (const p of ps) expect(p.wins).toBe(1);
  });

  it('time runs out with any alive: the basilisks win', () => {
    const { world, ps } = exterm(305, 2);
    world.hurtBeast(basilisks(world)[0].k, 1e9, ps[0].id);
    (world as unknown as Internals).phaseTimer = 1;
    world.step();
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).toBe(255);
    for (const p of ps) expect(p.wins).toBe(0);
  });

  it('clients see how many are left, where, and which are awake', () => {
    const frames: Uint8Array[] = [];
    const { world, ps } = exterm(306, 2, (d) => frames.push(d));
    const bs = basilisks(world);
    world.hurtBeast(bs[0].k, 1e9, ps[0].id);
    world.hurtBeast(bs[1].k, 1, ps[0].id); // (woken)
    for (let k = 0; k < 3; k++) world.step();
    const game = new Game();
    game.myId = ps[0].id;
    for (const f of frames) {
      const r = new Reader(f);
      r.u8();
      const tick = r.u32();
      const ack = r.u16();
      game.applyFrame(tick, ack, r);
    }
    const lair = game.roundState?.lair;
    expect(game.roundState?.mode).toBe(GameMode.Extermination);
    expect(lair?.total).toBe(4);
    expect(lair?.beasts.length).toBe(3);
    expect(lair?.beasts.filter((b) => b.awake).length).toBe(1);
    const b1 = world.beasts[bs[1].k]!;
    expect(lair?.beasts.some((b) => b.awake && Math.abs(b.x - b1.fx) < 40 && Math.abs(b.y - b1.fy) < 40)).toBe(true);
  });

  it('bots go down into the lair and take the fight to the basilisks', () => {
    const { world } = exterm(307, 1, undefined, 6);
    until(world, () => world.players.filter((p) => p?.bot && p.alive).length >= 4, 30 * 20);
    const hp0 = basilisks(world).map(({ b }) => b!.hp);
    let woke = false;
    for (let t = 0; t < 30 * 90 && !woke; t++) {
      world.step();
      woke = basilisks(world).some(({ b }) => b!.frozen === 0) || basilisks(world).length < 4;
    }
    expect(woke).toBe(true);
    void hp0;
  });
});
