import { describe, expect, it } from 'vitest';
import { ClassId, DROID_LEGS, Part, has, resetBody } from '../src/shared/body.ts';
import { ACTOR_H } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { ProjKind } from '../src/shared/weapons.ts';
import { W_SPIDER } from '../src/shared/particles.ts';
import { ASP_HP, BEAST_BUILD, BeastKind, CSPIDER_FREEZE_MIN, CSPIDER_HP, CSPIDER_PACK_MAX, CSPIDER_PACK_MIN, MILLI_HUNT, bodyPoints, crawler, nestCentre, newBeast } from '../src/shared/wildlife.ts';
import { World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

/** A cave: solid rock, a tunnel (x 880..1260, y 380..440), a clone standing on its floor at x 960. */
function cave(seed = 7) {
  const world = new World(seed);
  (world as unknown as { beastSpawnAt: number }).beastSpawnAt = 1e9; // (only the ones we put there)
  const a = world.addPlayer('a', { send() {} })!;
  deliverAll(world, [a]);
  const t = world.terrain;
  for (let y = 300; y < 520; y++) for (let x = 760; x < 1400; x++) t.set(x, y, x >= 880 && x <= 1260 && y >= 380 && y <= 440 ? Mat.Air : Mat.Rock);
  world.terrainReplaced();
  resetBody(a.parts, ClassId.Medium, 0);
  a.hp = 100;
  a.body.x = 960;
  a.body.y = 441 - ACTOR_H;
  a.body.vx = a.body.vy = 0;
  world.beasts.fill(null);
  return { world, a };
}
const putSpider = (world: World, x: number, y: number, dir: number) => {
  const b = newBeast(world.terrain, BeastKind.Spider, x, y, dir);
  world.beasts[1] = b;
  bodyPoints(world.terrain, b, world.beastPts[1]);
  return b;
};
/** Hold the clone where they are (the target, not the chase), unhurt. */
const hold = (a: ReturnType<typeof cave>['a']) => {
  a.body.x = 960;
  a.body.y = 441 - ACTOR_H;
  a.body.vx = a.body.vy = 0;
};

describe('the cave spider', () => {
  it('a crawler, about a clone in size (a head and a fat abdomen), tougher than an asp', () => {
    expect(crawler(BeastKind.Spider)).toBe(true);
    expect(BEAST_BUILD[BeastKind.Spider].hp).toBe(CSPIDER_HP);
    expect(CSPIDER_HP).toBeGreaterThan(ASP_HP * 2);
    const { world } = cave();
    putSpider(world, 1150, 440, 1);
    expect(world.beastPts[1].length).toBe(4);
  });

  it('with nobody about it wanders, then freezes still on the rock and waits', () => {
    const { world, a } = cave();
    // The clone walled off (out of sight).
    for (let y = 380; y <= 440; y++) for (let x = 1000; x < 1010; x++) world.terrain.set(x, y, Mat.Rock);
    world.terrainReplaced();
    const b = putSpider(world, 1150, 440, 1);
    b.wander = 30;
    for (let k = 0; k < 90 && b.frozen === 0; k++) world.step();
    expect(b.frozen).toBeGreaterThanOrEqual(CSPIDER_FREEZE_MIN - 90);
    const at = [...world.beastPts[1]];
    for (let k = 0; k < 30 * 8; k++) world.step();
    expect(world.beastPts[1]).toEqual(at); // (not a twitch)
    void a;
  });

  it('prey in sight: it wakes and runs at them, far faster than a millipede hunts, and bites: a heavy bite and a shove', () => {
    const { world, a } = cave();
    const b = putSpider(world, 1220, 440, -1);
    b.frozen = 30 * 60;
    bodyPoints(world.terrain, b, world.beastPts[1]);
    const x0 = world.beastPts[1][0];
    // A second in: well on its way (more than a millipede's hunting pace would carry it).
    for (let k = 0; k < 30; k++) {
      hold(a);
      world.step();
    }
    expect(b.frozen).toBe(0);
    expect(x0 - world.beastPts[1][0]).toBeGreaterThan(MILLI_HUNT * 1.2);
    let bitten = false;
    for (let k = 0; k < 30 * 5 && !bitten; k++) {
      hold(a);
      const hp = a.hp;
      world.step();
      if (a.hp < hp - 10) {
        bitten = true;
        expect(Math.abs(a.body.vx)).toBeGreaterThan(30);
      }
    }
    expect(bitten).toBe(true);
    expect(a.lastWeapon).toBe(W_SPIDER);
  });

  it('its bite goes for the limbs: it tears arms and legs clean off (a droid\'s metal legs too)', () => {
    for (const cls of [ClassId.Medium, ClassId.Droid]) {
      const { world, a } = cave();
      resetBody(a.parts, cls, 0);
      const limbs = cls === ClassId.Droid ? DROID_LEGS : [Part.GunArm, Part.OffArm, Part.LegB, Part.LegF];
      const count = () => limbs.filter((l) => has(a.parts.mask, l)).length;
      const b = putSpider(world, 1000, 440, -1);
      let bites = 0;
      for (let k = 0; k < 30 * 20 && count() > limbs.length - 2 && a.alive; k++) {
        hold(a);
        a.hp = 100;
        const before = b.coilCd;
        world.step();
        if (b.coilCd > before) bites++;
      }
      // Two limbs gone, in a handful of bites.
      expect(count(), `class ${cls}`).toBeLessThanOrEqual(limbs.length - 2);
      expect(bites, `class ${cls}`).toBeLessThanOrEqual(8);
      expect(a.lastWeapon).toBe(W_SPIDER);
    }
  });

  it('it closes the last stretch with a dash, or leaps at them through the air, fangs out', () => {
    let dashed = false;
    let leapt = false;
    for (const seed of [7, 8, 9]) {
      const { world, a } = cave(seed);
      const b = putSpider(world, 1100, 440, -1);
      for (let k = 0; k < 30 * 6 && !(dashed && leapt); k++) {
        hold(a);
        a.hp = 100;
        world.step();
        if (b.lunge > 0) dashed = true;
        if (b.flung > 0) leapt = true;
        if (b.lunge > 0 || b.flung > 0) expect(b.lift).toBeGreaterThan(0);
      }
    }
    expect(dashed).toBe(true);
    expect(leapt).toBe(true);
  });

  it('unarmoured but tough for its size: it takes well over a dozen rifle rounds', () => {
    const { world, a } = cave();
    putSpider(world, 1100, 440, -1);
    world.beasts[1]!.frozen = 30 * 600;
    // (Out of reach: walled off from the clone but for a slot to shoot through.)
    let shots = 0;
    for (let k = 0; k < 80 && world.beasts[1]; k++) {
      const pts = world.beastPts[1];
      const ang = Math.atan2(pts[1] - a.cy, pts[0] - a.cx);
      (world as unknown as { spawnProj(id: number, kind: number, owner: number, x: number, y: number, vx: number, vy: number): void }).spawnProj(80000 + k, ProjKind.Bullet, a.id, a.cx, a.cy, Math.cos(ang) * 900, Math.sin(ang) * 900);
      shots++;
      world.step();
      hold(a);
      a.hp = 100;
    }
    expect(world.beasts[1]).toBe(null);
    expect(shots).toBeGreaterThan(12);
    expect(shots).toBeLessThan(40);
  });

  it('they come up in the caves among the millipedes and asps', () => {
    const kinds = new Set<number>();
    for (const seed of [12, 13, 14]) {
      const world = new World(seed);
      world.beasts.fill(null);
      for (let k = 0; k < 10; k++) (world as unknown as { spawnBeast(): boolean }).spawnBeast();
      for (const b of world.beasts) if (b) kinds.add(b.kind);
    }
    expect(kinds.has(BeastKind.Spider)).toBe(true);
    expect(kinds.has(BeastKind.Millipede)).toBe(true);
    expect(kinds.has(BeastKind.Asp)).toBe(true);
  });
});

describe('cave spider packs and their web', () => {
  /** A web on the tunnel's roof at x 1150, and `n` spiders of its pack on the floor under it. */
  function pack(n: number, xs: number[] = []) {
    const { world, a } = cave();
    const web = newBeast(world.terrain, BeastKind.Web, 1150, 380, 1);
    world.beasts[1] = web;
    nestCentre(web, world.beastPts[1]);
    const spiders = [];
    for (let i = 0; i < n; i++) {
      const b = newBeast(world.terrain, BeastKind.Spider, xs[i] ?? 1140 + i * 8, 440, -1);
      b.home = 1;
      world.beasts[2 + i] = b;
      bodyPoints(world.terrain, b, world.beastPts[2 + i]);
      spiders.push(b);
    }
    return { world, a, web, spiders };
  }

  it('they come up in packs of two to five, with a web of their own on the roof over them; a pack counts as two crawlers', () => {
    const sizes = new Set<number>();
    for (const seed of [12, 13, 14, 15, 16, 17]) {
      const world = new World(seed);
      world.beasts.fill(null);
      const w = world as unknown as { spawnPack(x: number, y: number): boolean; crawlers(): number; spawnBeast(): boolean };
      // (The first crawler up is a spider: a pack. A try now and then finds nowhere to come up.)
      for (let n = 0; n < 6 && !world.beasts.some((b) => b); n++) w.spawnBeast();
      const webs = world.beasts.filter((b) => b?.kind === BeastKind.Web);
      const spiders = world.beasts.filter((b) => b?.kind === BeastKind.Spider);
      expect(webs.length).toBe(1);
      expect(spiders.length).toBeGreaterThanOrEqual(CSPIDER_PACK_MIN);
      expect(spiders.length).toBeLessThanOrEqual(CSPIDER_PACK_MAX);
      const k = world.beasts.indexOf(webs[0]);
      for (const s of spiders) expect(s!.home).toBe(k);
      // On the rock (the roof, if it could), above the pack.
      const web = webs[0]!;
      expect(world.terrain.isSolid(web.x + web.hx, web.y + web.hy)).toBe(true);
      expect(web.y).toBeLessThanOrEqual(spiders[0]!.y);
      expect(w.crawlers()).toBe(2);
      sizes.add(spiders.length);
    }
    expect(sizes.size).toBeGreaterThan(1);
  });

  it('one that sees prey calls its pack onto them', () => {
    // A rock wall at x 1100 between the clone and the pack, but for the one this side of it.
    const { world, a, spiders } = pack(3, [1060, 1150, 1170]);
    for (let y = 380; y <= 440; y++) for (let x = 1100; x < 1106; x++) world.terrain.set(x, y, Mat.Rock);
    world.terrainReplaced();
    for (const s of spiders) s.frozen = 30 * 60;
    let all = false;
    for (let k = 0; k < 12 && !all; k++) {
      hold(a);
      world.step();
      all = spiders.every((s) => s.target === a.id);
    }
    // (All three on the clone at once: the two behind the wall that can't see them too.)
    expect(all).toBe(true);
  });

  it('shoot their web and the whole pack turns on you', () => {
    const { world, a, spiders } = pack(3);
    for (const s of spiders) s.frozen = 30 * 60;
    // (Walled off: none of them can see the clone.)
    for (let y = 380; y <= 440; y++) for (let x = 1000; x < 1010; x++) world.terrain.set(x, y, Mat.Rock);
    world.terrainReplaced();
    world.hurtBeast(1, 10, a.id);
    expect(spiders.every((s) => s.hurtBy === a.id && s.frozen === 0)).toBe(true);
  });

  it('a limb torn off is carried home in its jaws and worked into the web', () => {
    const { world, a, web, spiders } = pack(1);
    const b = spiders[0];
    let carried = false;
    for (let k = 0; k < 30 * 40 && web.limbs === 0; k++) {
      if (b.carry === 0 && !carried) hold(a);
      a.hp = 100;
      world.step();
      if (b.carry > 0) {
        carried = true;
        // (Jaws full: it bites nobody on the way.)
        expect(b.target).toBe(-1);
        // The clone out of its way, so it's free to go home.
        a.body.x = 900;
      }
    }
    expect(carried).toBe(true);
    expect(web.limbs).toBe(1);
    expect(b.carry).toBe(0);
    // (Sent to clients: how many it holds.)
    expect(Math.round(web.lift * 255)).toBe(1);
  });

  it('its web gone, the pack fights on, homeless (and drops what it was carrying)', () => {
    const { world, a, spiders } = pack(2);
    spiders[0].carry = 3;
    world.hurtBeast(1, 1e6, a.id);
    expect(world.beasts[1]).toBe(null);
    expect(spiders.every((s) => s.home === -1)).toBe(true);
    expect(spiders[0].carry).toBe(0);
  });
});
