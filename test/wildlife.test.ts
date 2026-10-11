import { describe, expect, it } from 'vitest';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { ACTOR_H, GRAVITY, WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { PROJ, ProjKind, WeaponId } from '../src/shared/weapons.ts';
import { ASP_DISGUISE_MIN, BeastKind, newBeast, MILLI_FREEZE_MAX, onCeiling, MILLI_COIL_BREAK, MILLI_COIL_TICKS, MILLI_GAP, MILLI_HP, MILLI_HUNT, MILLI_R, MILLI_SEGS, bodyPoints, crawlStep, fallStep, newMillipede, pushTrail } from '../src/shared/wildlife.ts';
import { World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { Reader } from '../src/shared/codec.ts';
import { deliverAll } from './helpers.ts';

/** Solid rock with a room (x0..x1, y0..y1) open in it. */
function room(x0: number, y0: number, x1: number, y1: number): Terrain {
  const t = new Terrain();
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) t.mat[y * WORLD_W + x] = x >= x0 && x <= x1 && y >= y0 && y <= y1 ? Mat.Air : Mat.Rock;
  t.rebuildAllPlanes();
  return t;
}

describe('the millipede crawls any surface', () => {
  it('goes along the floor, up the wall, across the ceiling and down again, always holding on', () => {
    const t = room(1000, 400, 1100, 460);
    const b = newMillipede(t, 1050, 460, 1);
    expect(b.trail.length).toBe((MILLI_SEGS * MILLI_GAP + 1) * 2);
    const seen = { floor: false, wall: false, ceiling: false, back: false };
    for (let k = 0; k < 400; k++) {
      crawlStep(t, b);
      pushTrail(b);
      expect(b.attached).toBe(true);
      expect(t.isSolid(b.x, b.y)).toBe(false);
      // Ground beside it, always.
      expect(t.isSolid(b.x + 1, b.y) || t.isSolid(b.x - 1, b.y) || t.isSolid(b.x, b.y + 1) || t.isSolid(b.x, b.y - 1)).toBe(true);
      if (b.y === 460 && b.x > 1060) seen.floor = true;
      if (b.x === 1100 && b.y > 410 && b.y < 450) seen.wall = true;
      if (b.y === 400 && b.x > 1010 && b.x < 1090) seen.ceiling = true;
      if (seen.ceiling && b.x === 1000) seen.back = true;
    }
    expect(seen).toEqual({ floor: true, wall: true, ceiling: true, back: true });
  });

  it('its body follows its head, bending round the corner it took', () => {
    const t = room(1000, 400, 1100, 460);
    const b = newMillipede(t, 1060, 460, 1);
    for (let k = 0; k < 60; k++) {
      crawlStep(t, b);
      pushTrail(b);
    }
    // Head up the right wall, tail still on the floor.
    const pts = bodyPoints(t, b, []);
    // (Its points are centred in its body, up off the surface by its girth.)
    expect(pts[0]).toBeGreaterThan(1100 - MILLI_R - 1.5);
    expect(pts[1]).toBeLessThan(450);
    expect(pts[pts.length - 1]).toBeGreaterThan(460 - MILLI_R - 1.5);
  });

  it('dug out from under, it falls, and takes hold where it lands', () => {
    const t = room(1000, 300, 1100, 460);
    const b = newMillipede(t, 1050, 460, 1);
    // Up onto the ceiling first.
    while (!(b.y === 300 && b.x < 1060)) {
      crawlStep(t, b);
      pushTrail(b);
    }
    // The roof over it gone (blown away): nothing to hold.
    for (let y = 280; y < 300; y++) for (let x = b.x - 20; x <= b.x + 20; x++) t.set(x, y, Mat.Air);
    crawlStep(t, b);
    expect(b.attached).toBe(false);
    for (let k = 0; k < 200 && !b.attached; k++) fallStep(t, b, 1 / 30, GRAVITY);
    expect(b.attached).toBe(true);
    expect(b.y).toBe(460);
  });
});

describe('millipedes in the world', () => {
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
  const put = (world: World, x: number, y: number, dir: number) => {
    const b = newMillipede(world.terrain, x, y, dir);
    world.beasts[0] = b;
    bodyPoints(world.terrain, b, world.beastPts[0]);
    return b;
  };

  it('rears up and spits venom at a clone it sees; the venom burns on long after the hit', () => {
    const { world, a } = cave();
    put(world, 1180, 440, -1);
    let reared = false;
    let hit = -1;
    for (let k = 0; k < 30 * 8 && hit < 0; k++) {
      world.step();
      if ((world.beasts[0]?.lift ?? 0) > 0.5) reared = true;
      if (a.venom > 0) hit = k;
    }
    expect(reared).toBe(true);
    expect(hit).toBeGreaterThanOrEqual(0);
    // Take the millipede away: the venom does its harm all the same, a little at a time.
    world.beasts.fill(null);
    const hp = a.hp;
    for (let k = 0; k < 30 * 2; k++) world.step();
    expect(a.hp).toBeLessThan(hp - 8);
    expect(a.hp).toBeGreaterThan(hp - 20); // (not all at once)
  });

  it('it comes after a clone along the walls and roof, coils round them like a rope and bites: dead', () => {
    const { world, a } = cave();
    // Far down the tunnel, on the roof, going away from the clone.
    const b = put(world, 1240, 380, 1);
    b.spitCd = 1e9; // (no spitting: it has to come and get them)
    let coiled = -1;
    let heldAt = 0;
    for (let k = 0; k < 30 * 12 && a.alive; k++) {
      world.step();
      if (coiled < 0 && b.coil === a.id) {
        coiled = k;
        heldAt = a.body.x;
      }
      // Held fast while it's wound round them.
      if (coiled >= 0 && b.coil === a.id) expect(Math.abs(a.body.x - heldAt)).toBeLessThan(0.5);
    }
    expect(coiled).toBeGreaterThanOrEqual(0);
    expect(a.alive).toBe(false);
  });

  it('hurt hard enough while it holds someone, it lets them go', () => {
    const { world, a } = cave();
    const b = put(world, 1000, 440, -1);
    b.spitCd = 1e9;
    for (let k = 0; k < 30 * 5 && b.coil < 0; k++) world.step();
    expect(b.coil).toBe(a.id);
    world.hurtBeast(0, MILLI_COIL_BREAK + 1, a.id);
    expect(b.coil).toBe(-1);
    for (let k = 0; k < MILLI_COIL_TICKS + 5; k++) world.step();
    expect(a.alive).toBe(true);
  });

  it('with nothing about it freezes still; prey in sight, it thaws and lunges very fast', () => {
    const { world, a } = cave();
    // The clone out of sight (walled off at the far end).
    for (let y = 380; y <= 440; y++) for (let x = 1000; x < 1010; x++) world.terrain.set(x, y, Mat.Rock);
    world.terrainReplaced();
    const b = put(world, 1200, 440, -1);
    b.spitCd = 1e9;
    b.wander = 1;
    world.step();
    world.step();
    expect(b.frozen).toBeGreaterThan(0);
    const still = b.x;
    for (let k = 0; k < 60; k++) world.step();
    expect(b.x).toBe(still);
    // The wall gone: it sees them, thaws, and comes at them fast.
    for (let y = 380; y <= 440; y++) for (let x = 1000; x < 1010; x++) world.terrain.set(x, y, Mat.Air);
    world.terrainReplaced();
    let moved = 0;
    for (let k = 0; k < 20; k++) {
      const x0 = b.x;
      world.step();
      moved += Math.abs(b.x - x0);
    }
    expect(b.frozen).toBe(0);
    expect(moved / 20).toBeGreaterThan(MILLI_HUNT / 30); // (faster than it hunts: a lunge)
    void a;
  });

  describe('scavenging', () => {
    /** The cave with the clone walled off, and a wall (x0..x1) of `mat` across the tunnel. */
    function split(x0: number, x1: number, mat: number) {
      const { world, a } = cave();
      for (let y = 380; y <= 440; y++) for (let x = 900; x < 910; x++) world.terrain.set(x, y, Mat.Rock);
      for (let y = 380; y <= 440; y++) for (let x = x0; x <= x1; x++) world.terrain.set(x, y, mat);
      world.terrainReplaced();
      const b = put(world, 1240, 440, -1);
      b.spitCd = 1e9;
      b.wander = 1e9; // (never settles to freeze here)
      void a;
      return { world, b };
    }
    const reach = (world: World, b: ReturnType<typeof put>, ticks: number) => {
      let minX = b.x;
      let maxX = b.x;
      for (let k = 0; k < ticks; k++) {
        world.step();
        minX = Math.min(minX, b.x);
        maxX = Math.max(maxX, b.x);
      }
      return { minX, maxX };
    };

    it('mouths its way through a thin wall into the open passage beyond', () => {
      const { world, b } = split(1100, 1104, Mat.Dirt);
      const { minX } = reach(world, b, 1500);
      expect(minX).toBeLessThan(1090);
    });

    it('will not dig blind: a thick wall with no opening it can reach stays whole', () => {
      const { world, b } = split(1060, 1104, Mat.Dirt);
      const { minX } = reach(world, b, 1500);
      expect(minX).toBeGreaterThan(1050);
      expect(world.terrain.isSolid(1080, 438)).toBe(true);
    });

    it('cement, iron and the like are beyond its jaws', () => {
      for (const mat of [Mat.Cement, Mat.Iron]) {
        const { world, b } = split(1100, 1104, mat);
        const { minX } = reach(world, b, 1500);
        expect(minX).toBeGreaterThan(1098);
      }
    });

    it('roams the whole length of a long tunnel rather than pacing one spot', () => {
      const { world } = cave();
      for (let y = 380; y <= 440; y++) for (let x = 900; x < 910; x++) world.terrain.set(x, y, Mat.Rock);
      world.terrainReplaced();
      const b = put(world, 1100, 440, -1);
      b.spitCd = 1e9;
      b.wander = 1e9;
      const { minX, maxX } = reach(world, b, 3000);
      expect(maxX - minX).toBeGreaterThan(250);
    });
  });

  it('resting on a ceiling, it drops onto a clone that comes under it, and coils them', () => {
    const { world, a } = cave();
    // On the roof, a little way along from the clone, lying in wait.
    const b = put(world, 1000, 380, 1);
    while (!onCeiling(world.terrain, b) || Math.abs(b.x - 990) > 3) {
      crawlStep(world.terrain, b);
      pushTrail(b);
    }
    bodyPoints(world.terrain, b, world.beastPts[0]);
    b.frozen = 30 * 100;
    b.spitCd = 1e9;
    let dropped = false;
    for (let k = 0; k < 30 * 3 && b.coil < 0; k++) {
      world.step();
      if (!b.attached) dropped = true;
    }
    expect(dropped).toBe(true);
    expect(b.coil).toBe(a.id);
  });

  it('lies in wait for up to two minutes', () => {
    expect(MILLI_FREEZE_MAX).toBe(30 * 120);
  });

  it('a health wave washes the venom out', () => {
    const { world, a } = cave();
    a.venom = 80;
    (world as unknown as { mendTick(p: unknown): void }).mendTick(a);
    expect(a.venom).toBe(0);
  });

  it('armoured: it takes dozens of slugs to kill', () => {
    const { world, a } = cave();
    const b = put(world, 1180, 440, -1);
    b.spitCd = 1e9;
    let shots = 0;
    for (let k = 0; k < 400 && world.beasts[0]; k++) {
      b.coilCd = 1e9; // (no coiling the shooter)
      const pts = world.beastPts[0];
      const sx = a.cx;
      const sy = a.cy - 4;
      const ang = Math.atan2(pts[11] - sy, pts[10] - sx);
      (world as unknown as { spawnProj(id: number, kind: number, owner: number, x: number, y: number, vx: number, vy: number): void }).spawnProj(90000 + k, ProjKind.Slug, a.id, sx, sy, Math.cos(ang) * 6000, Math.sin(ang) * 6000);
      shots++;
      world.step();
      a.venom = 0;
      a.hp = 100;
    }
    // Armoured like a spider mech: it takes dozens of sniper slugs.
    expect(world.beasts[0]).toBe(null);
    expect(shots).toBeGreaterThan(20);
    expect(shots).toBeLessThan(45);
  });

  it('clients see it crawl, see who is poisoned, and see it die', () => {
    const inbox: Uint8Array[] = [];
    const world = new World(7);
    (world as unknown as { beastSpawnAt: number }).beastSpawnAt = 1e9;
    const a = world.addPlayer('a', { send: (d) => inbox.push(d) })!;
    deliverAll(world, [a]);
    const game = new Game();
    game.myId = a.id;
    const pump = () => {
      for (const m of inbox.splice(0)) {
        const r = new Reader(m);
        r.u8();
        const tk = r.u32();
        const ack = r.u16();
        game.applyFrame(tk, ack, r);
      }
    };
    const t = world.terrain;
    for (let y = 300; y < 520; y++) for (let x = 760; x < 1400; x++) t.set(x, y, x >= 880 && x <= 1260 && y >= 380 && y <= 440 ? Mat.Air : Mat.Rock);
    world.terrainReplaced();
    a.body.x = 960;
    a.body.y = 441 - ACTOR_H;
    world.beasts.fill(null);
    const b = put(world, 1180, 440, -1);
    b.spitCd = 1e9;
    world.step();
    pump();
    const v = game.beastViews.get(0)!;
    expect(v).toBeDefined();
    expect(v.cur.length).toBe(MILLI_SEGS * 2);
    // Where the server has its body, within a fraction of a cell.
    const pts = world.beastPts[0];
    for (let i = 0; i < pts.length; i++) expect(Math.abs(v.cur[i] - pts[i])).toBeLessThan(0.5);
    // Poisoned: the client hears of it.
    a.venom = 50;
    world.step();
    pump();
    expect(game.myVenom).toBeGreaterThan(40);
    // Killed: gone from the client.
    world.hurtBeast(0, 1e6, a.id);
    world.step();
    pump();
    expect(game.beastViews.size).toBe(0);
  });

  it('bots turn their guns on one coming at them', () => {
    const world = new World(75);
    (world as unknown as { beastSpawnAt: number }).beastSpawnAt = 1e9;
    const bot = world.addBot()!;
    deliverAll(world, [bot]);
    world.step();
    const t = world.terrain;
    for (let y = 300; y < 520; y++) for (let x = 760; x < 1400; x++) t.set(x, y, x >= 880 && x <= 1260 && y >= 380 && y <= 440 ? Mat.Air : Mat.Rock);
    world.terrainReplaced();
    world.equip(bot, WeaponId.Rifle);
    world.beasts.fill(null);
    const b = put(world, 1150, 440, -1);
    b.spitCd = 1e9;
    bot.body.x = 960;
    bot.body.y = 441 - ACTOR_H;
    bot.body.vx = 0;
    let hurt = false;
    for (let k = 0; k < 30 * 8 && !hurt; k++) {
      bot.hp = 100;
      bot.venom = 0;
      world.step();
      if (!world.beasts[0] || world.beasts[0].hp < MILLI_HP) hurt = true;
    }
    expect(hurt).toBe(true);
  });

  describe('the gem asp', () => {
    const putAsp = (world: World, x: number, y: number, dir: number) => {
      const b = newBeast(world.terrain, BeastKind.Asp, x, y, dir);
      world.beasts[1] = b;
      bodyPoints(world.terrain, b, world.beastPts[1]);
      return b;
    };

    it('about a clone in size; with nobody about it curls up on the floor as a gem, and holds it for minutes', () => {
      const { world, a } = cave();
      // The clone walled off (out of sight).
      for (let y = 380; y <= 440; y++) for (let x = 1000; x < 1010; x++) world.terrain.set(x, y, Mat.Rock);
      world.terrainReplaced();
      const b = putAsp(world, 1150, 440, 1);
      const pts = world.beastPts[1];
      expect(Math.hypot(pts[0] - pts[pts.length - 2], pts[1] - pts[pts.length - 1])).toBeLessThan(ACTOR_H * 1.4);
      b.wander = 1;
      for (let k = 0; k < 60 && !b.gem; k++) world.step();
      expect(b.gem).toBe(true);
      expect(b.frozen).toBeGreaterThanOrEqual(ASP_DISGUISE_MIN - 60);
      const at = [...world.beastPts[1]];
      for (let k = 0; k < 30 * 20; k++) world.step();
      expect(b.gem).toBe(true);
      expect(world.beastPts[1]).toEqual(at); // (not a twitch)
      void a;
    });

    it('a clone in sight but well off, it holds; near, it uncoils, hisses and strikes: a bite and venom', () => {
      const { world, a } = cave();
      const b = putAsp(world, 1150, 440, -1);
      b.gem = true;
      b.frozen = 30 * 200;
      bodyPoints(world.terrain, b, world.beastPts[1]);
      // Well off (190 cells), in plain sight: it stays a gem.
      for (let k = 0; k < 60; k++) world.step();
      expect(b.gem).toBe(true);
      // The clone walks up to it.
      a.body.x = 1100;
      let hissed = false;
      let bitten = false;
      for (let k = 0; k < 30 * 4 && !bitten; k++) {
        const hp = a.hp;
        world.step();
        if (b.lift > 0.5) hissed = true;
        if (a.hp < hp - 10) bitten = true;
      }
      expect(b.gem).toBe(false);
      expect(hissed).toBe(true);
      expect(bitten).toBe(true);
      expect(a.venom).toBeGreaterThan(0);
    });

    it('no armour: a few rounds kill it', () => {
      const { world, a } = cave();
      putAsp(world, 1100, 440, -1);
      let shots = 0;
      for (let k = 0; k < 60 && world.beasts[1]; k++) {
        const pts = world.beastPts[1];
        const sx = a.cx;
        const sy = a.cy;
        const ang = Math.atan2(pts[3] - sy, pts[2] - sx);
        (world as unknown as { spawnProj(id: number, kind: number, owner: number, x: number, y: number, vx: number, vy: number): void }).spawnProj(80000 + k, ProjKind.Bullet, a.id, sx, sy, Math.cos(ang) * 900, Math.sin(ang) * 900);
        shots++;
        world.step();
        a.hp = 100;
        a.venom = 0;
      }
      expect(world.beasts[1]).toBe(null);
      expect(shots).toBeLessThan(15);
    });
  });

  it('both kinds come up in the caves', () => {
    const world = new World(12);
    world.beasts.fill(null);
    const kinds = new Set<number>();
    for (let k = 0; k < 8; k++) {
      (world as unknown as { spawnBeast(): boolean }).spawnBeast();
    }
    for (const b of world.beasts) if (b) kinds.add(b.kind);
    expect(kinds.has(BeastKind.Millipede)).toBe(true);
    expect(kinds.has(BeastKind.Asp)).toBe(true);
  });

  it('on a real map they turn up in the caves, holding on to the rock', () => {
    let seen = 0;
    for (const seed of [11, 12, 13]) {
      const world = new World(seed);
      for (let k = 0; k < 120; k++) world.step();
      for (let k = 0; k < world.beasts.length; k++) {
        const b = world.beasts[k];
        if (!b) continue;
        seen++;
        const t = world.terrain;
        expect(t.isSolid(b.x, b.y)).toBe(false);
        expect(b.y).toBeGreaterThan(t.surfaceY(b.x) + 40);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
