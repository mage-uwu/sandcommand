import { describe, expect, it } from 'vitest';
import { ClassId, Part, has, newStrike, resetBody } from '../src/shared/body.ts';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, ACTOR_MAX_HP } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { NO_OWNER, W_CLAW, W_CRAB } from '../src/shared/particles.ts';
import { BEAST_BUILD, BeastKind, CRAB_HP, CRAB_HIVE_REACH, CRAB_TRIGGER, CSPIDER_R, POSSESSED_REGEN_DELAY, POSSESSED_TOUGH, bodyPoints, crawler, newBeast } from '../src/shared/wildlife.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

/** A cave: solid rock, a tunnel (x 880..1260, y 380..440), `n` clones standing on its floor from x 960. */
function cave(n = 1) {
  const world = new World(7);
  (world as unknown as { beastSpawnAt: number }).beastSpawnAt = 1e9; // (only the ones we put there)
  const frames: Uint8Array[] = [];
  const ps: Player[] = Array.from({ length: n }, (_, i) => world.addPlayer(`p${i}`, { send: i === 0 ? (d) => frames.push(d) : () => {} })!);
  deliverAll(world, ps);
  const t = world.terrain;
  for (let y = 300; y < 520; y++) for (let x = 760; x < 1400; x++) t.set(x, y, x >= 880 && x <= 1260 && y >= 380 && y <= 440 ? Mat.Air : Mat.Rock);
  world.terrainReplaced();
  ps.forEach((p, i) => {
    resetBody(p.parts, ClassId.Medium, 0);
    p.hp = 100;
    p.body.x = 960 + i * 80;
    p.body.y = 441 - ACTOR_H;
    p.body.vx = p.body.vy = 0;
  });
  world.beasts.fill(null);
  return { world, ps, frames };
}
const putCrab = (world: World, x: number, y: number) => {
  const b = newBeast(world.terrain, BeastKind.CoralCrab, x, y, -1);
  world.beasts[1] = b;
  bodyPoints(world.terrain, b, world.beastPts[1]);
  return b;
};
type Hidden = { damage(v: Player, n: number, by: number, w: number): void; applyStrike(p: Player, res: ReturnType<typeof newStrike>, by: number, w: number, x: number, y: number): void };
const hidden = (w: World) => w as unknown as Hidden;

describe('the coral crab', () => {
  it('a small crawler (about half a cave spider), surprisingly tough for its size', () => {
    expect(crawler(BeastKind.CoralCrab)).toBe(true);
    expect(BEAST_BUILD[BeastKind.CoralCrab].r).toBeLessThan(CSPIDER_R * 0.65);
    expect(BEAST_BUILD[BeastKind.CoralCrab].hp).toBe(CRAB_HP);
  });

  it('at rest a gem cluster; a clone near, it wakes, scurries and lunges, and lodges onto them', () => {
    const { world, ps } = cave();
    const b = putCrab(world, 1060, 440);
    b.gem = true;
    b.frozen = 1e6;
    world.step();
    expect(b.gem).toBe(true);
    let latched = false;
    for (let k = 0; k < 30 * 8 && !latched; k++) {
      world.step();
      ps[0].body.x = 960;
      ps[0].body.vx = 0;
      latched = b.hold === ps[0].id;
    }
    expect(b.gem).toBe(false);
    expect(latched).toBe(true);
    // (It rides them where they go.)
    ps[0].body.x = 920;
    world.step();
    expect(Math.abs(world.beastPts[1][0] - ps[0].cx)).toBeLessThan(6);
  });

  it('it bites till they drop, and they rise again possessed: whole, at full health, four times as tough, the crab gone into them', () => {
    const { world, ps } = cave();
    const p = ps[0];
    const b = putCrab(world, 970, 440);
    b.hold = p.id;
    const tough = p.parts.tough;
    const deaths = p.deaths;
    for (let k = 0; k < 30 * 20 && !p.possessed; k++) {
      world.step();
      p.body.x = 960;
    }
    expect(p.possessed).toBe(true);
    expect(p.alive).toBe(true);
    expect(p.hp).toBe(ACTOR_MAX_HP);
    expect(p.parts.tough).toBeCloseTo(tough * POSSESSED_TOUGH);
    expect(p.deaths).toBe(deaths + 1);
    expect(world.beasts.some((x) => x?.kind === BeastKind.CoralCrab)).toBe(false);
  });

  it('possessed, they live on with their head blown off; only their health running out ends them, and a crab crawls out', () => {
    const { world, ps } = cave();
    const p = ps[0];
    hidden(world).damage(p, 500, NO_OWNER, W_CRAB);
    expect(p.possessed).toBe(true);
    const res = newStrike();
    res.vital = true;
    res.detached.push(Part.Head);
    p.parts.mask &= ~(1 << Part.Head);
    hidden(world).applyStrike(p, res, NO_OWNER, 0, p.cx, p.cy - 6);
    expect(p.alive).toBe(true);
    expect(has(p.parts.mask, Part.Head)).toBe(false);
    // (Four times as tough: what would kill a clone outright, it shrugs off.)
    hidden(world).damage(p, 500, NO_OWNER, 0);
    expect(p.alive).toBe(true);
    hidden(world).damage(p, 5000, NO_OWNER, 0);
    expect(p.alive).toBe(false);
    expect(p.possessed).toBe(false);
    expect(world.beasts.some((x) => x?.kind === BeastKind.CoralCrab)).toBe(true);
  });

  it("the possessed are the coral's: one another's side, everyone else's enemy; their claws kill, and the killed rise possessed too", () => {
    const { world, ps } = cave(3);
    const [a, b, c] = ps;
    a.team = b.team = c.team = 1 as never;
    hidden(world).damage(a, 500, NO_OWNER, W_CRAB);
    expect(world.hostile(a, b)).toBe(true);
    expect(world.friendly(a.id, b)).toBe(false);
    expect(world.friendly(b.id, c)).toBe(true);
    // Up against b: the claws.
    a.body.x = b.body.x - 6;
    b.hp = 30;
    const kills = a.kills;
    for (let k = 0; k < 60 && !b.possessed; k++) {
      a.body.x = b.body.x - 6;
      world.step();
    }
    expect(b.possessed).toBe(true);
    expect(b.alive).toBe(true);
    expect(a.kills).toBe(kills + 1);
    expect(world.friendly(a.id, b)).toBe(true);
    expect(world.hostile(b, c)).toBe(true);
    // (A clone's claws don't strike the possessed.)
    expect(W_CLAW).not.toBe(W_CRAB);
  });

  it('every client hears who is possessed', () => {
    const { world, ps, frames } = cave(2);
    const game = new Game();
    const pump = () => {
      for (const f of frames.splice(0)) {
        const r = new Reader(f);
        r.u8();
        const tick = r.u32();
        const ack = r.u16();
        game.applyFrame(tick, ack, r);
      }
    };
    world.step();
    pump();
    expect(game.possessedIds.size).toBe(0);
    hidden(world).damage(ps[1], 500, NO_OWNER, W_CRAB);
    world.step();
    pump();
    expect([...game.possessedIds]).toEqual([ps[1].id]);
    expect(game.feed.some((f) => f.text.includes('possessed by a coral crab'))).toBe(true);
  });

  it('one mind: what a possessed clone sees, the crabs know, and a crab far off wakes from its gem rest and comes', () => {
    const { world, ps } = cave(2);
    const [host, prey] = ps;
    hidden(world).damage(host, 500, NO_OWNER, W_CRAB);
    host.body.x = 1100;
    prey.body.x = 1180;
    // A crab at rest down the tunnel: too far to sense the prey itself, in the hive's reach.
    const b = putCrab(world, 900, 440);
    b.gem = true;
    b.frozen = 1e6;
    const d = Math.abs(world.beastPts[1][0] - prey.cx);
    expect(d).toBeGreaterThan(CRAB_TRIGGER);
    expect(d).toBeLessThan(CRAB_HIVE_REACH);
    for (let k = 0; k < 12; k++) {
      host.body.x = 1100;
      prey.body.x = 1180;
      world.step();
    }
    expect(world.hiveSees(prey.id)).toBe(true);
    expect(world.hiveSees(host.id)).toBe(false);
    expect(b.gem).toBe(false);
    expect(b.target).toBe(prey.id);
  });

  it('the possessed heal back to full fast, a moment after the last hurt; blown to pieces, they no longer do', () => {
    const { world, ps } = cave();
    const p = ps[0];
    hidden(world).damage(p, 500, NO_OWNER, W_CRAB);
    hidden(world).damage(p, 300, NO_OWNER, 0);
    const low = p.hp;
    expect(low).toBeLessThan(ACTOR_MAX_HP * 0.5);
    for (let k = 0; k < POSSESSED_REGEN_DELAY - 2; k++) world.step();
    expect(p.hp).toBe(low);
    for (let k = 0; k < 30 * 3; k++) world.step();
    expect(p.hp).toBe(ACTOR_MAX_HP);
    // In pieces: arms and a leg gone.
    p.parts.mask &= ~((1 << Part.GunArm) | (1 << Part.OffArm) | (1 << Part.LegB));
    hidden(world).damage(p, 300, NO_OWNER, 0);
    const torn = p.hp;
    for (let k = 0; k < 30 * 4; k++) world.step();
    // (Not healing: if anything, bleeding from its stumps.)
    expect(p.hp).toBeLessThanOrEqual(torn);
  });
});
