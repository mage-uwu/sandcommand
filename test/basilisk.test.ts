import { describe, expect, it } from 'vitest';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { ACTOR_H, ACTOR_W, WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { W_BASILISK } from '../src/shared/particles.ts';
import { PROJ, ProjKind } from '../src/shared/weapons.ts';
import { BASILISK_CALM, BASILISK_HOLD, BASILISK_R, BASILISK_SLEEP_MAX, BeastKind, MILLI_R, bodyPoints, newBeast, wyrm } from '../src/shared/wildlife.ts';
import { World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';
import { Game } from '../src/client/game.ts';
import { Reader } from '../src/shared/codec.ts';
import { BASILISK_SEGS } from '../src/shared/wildlife.ts';

const SURF = 200;
/** A world of solid rock under open sky (the surface at y 200), a cave hollowed out deep under it (x 1000..1300, y 600..660), bedrock at the bottom. */
function deep(ceiling: number = Mat.Rock) {
  const world = new World(7, { mode: 'sandbox', bots: 0 });
  (world as unknown as { beastSpawnAt: number }).beastSpawnAt = 1e9;
  const t = world.terrain;
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const cave = x >= 1000 && x <= 1300 && y >= 600 && y <= 660;
      t.mat[y * WORLD_W + x] = y < SURF || cave ? Mat.Air : y >= WORLD_H - 12 ? Mat.Bedrock : Mat.Rock;
    }
  }
  // (Optionally a lid over the cave that won't yield: what it does then.)
  if (ceiling !== Mat.Rock) for (let y = 560; y < 600; y++) for (let x = 0; x < WORLD_W; x++) t.mat[y * WORLD_W + x] = ceiling;
  t.rebuildAllPlanes();
  world.terrainReplaced();
  const a = world.addPlayer('a', { send() {} })!;
  deliverAll(world, [a]);
  resetBody(a.parts, ClassId.Medium, 0);
  a.hp = 100;
  // Well away on the surface, to begin with.
  a.body.x = 3000;
  a.body.y = SURF - ACTOR_H;
  a.body.vx = a.body.vy = 0;
  world.beasts.fill(null);
  const b = newBeast(t, BeastKind.Basilisk, 1150, 652, -1);
  b.frozen = 30 * 200;
  world.beasts[0] = b;
  bodyPoints(t, b, world.beastPts[0]);
  return { world, a, b };
}

describe('the basilisk', () => {
  for (const kind of [BeastKind.Basilisk, BeastKind.Dragon]) it(`${kind === BeastKind.Dragon ? 'a dragon' : 'a basilisk'}'s bite: it holds the clone in its jaws, thrashing and dragging them about for a second, then flings them far`, () => {
    const { world, a, b: old } = deep();
    world.beasts[0] = null;
    const b = newBeast(world.terrain, kind, 1150, 652, -1);
    world.beasts[0] = b;
    bodyPoints(world.terrain, b, world.beastPts[0]);
    void old;
    if (kind === BeastKind.Dragon) {
      // (A dragon: the clone right by it, in the cave; woken by them.)
      a.body.x = 1100;
      a.body.y = 661 - ACTOR_H;
      world.hurtBeast(0, 1, a.id);
    } else {
      // (A basilisk: woken, it makes for the surface first; the clone up there in its way.)
      world.hurtBeast(0, 1, 255);
      for (let k = 0; k < 30 * 20 && !b.surfaced; k++) world.step();
      a.body.x = b.fx + 160;
      a.body.y = SURF - ACTOR_H;
    }
    a.hp = 100;
    let held = -1;
    let at = { x: 0, y: 0 };
    let dragged = 0;
    let released = -1;
    for (let k = 0; k < 30 * 10 && released < 0 && a.alive; k++) {
      world.step();
      a.hp = Math.max(a.hp, 60); // (kept alive: it's the hold we're watching)
      if (held < 0 && b.hold === a.id) {
        held = k;
        at = { x: a.cx, y: a.cy };
      }
      if (b.hold === a.id) {
        // In its mouth: right at its head.
        const pts = world.beastPts[0];
        expect(Math.hypot(a.cx - pts[0], a.cy - pts[1])).toBeLessThan(BASILISK_R * 3 * (kind === BeastKind.Dragon ? 3 : 1));
        dragged = Math.max(dragged, Math.hypot(a.cx - at.x, a.cy - at.y));
      }
      if (held >= 0 && b.hold !== a.id) released = k;
    }
    expect(held).toBeGreaterThanOrEqual(0);
    expect(released - held).toBeGreaterThanOrEqual(BASILISK_HOLD - 1);
    expect(released - held).toBeLessThanOrEqual(BASILISK_HOLD + 2);
    expect(dragged).toBeGreaterThan(4);
    // Flung: fast, and up.
    expect(Math.hypot(a.body.vx, a.body.vy)).toBeGreaterThan(400);
    expect(a.body.vy).toBeLessThan(0);
  });

  it('three times the millipede, and it hibernates very still for up to four minutes', () => {
    const { world, b } = deep();
    expect(BASILISK_R).toBeCloseTo(MILLI_R * 3);
    expect(BASILISK_SLEEP_MAX).toBe(30 * 240);
    const at = [...world.beastPts[0]];
    for (let k = 0; k < 30 * 40; k++) world.step();
    expect(world.beastPts[0]).toEqual(at);
    expect(b.frenzy).toBe(0);
  });

  it('a clone coming near wakes it in a frenzy', () => {
    const { world, a, b } = deep();
    a.body.x = 1060;
    a.body.y = 661 - ACTOR_H;
    for (let k = 0; k < 15; k++) world.step();
    expect(b.frenzy).toBeGreaterThan(0);
    expect(b.frozen).toBe(0);
  });

  it('woken, its first instinct is the surface: it bores straight up through the rock', () => {
    const { world, b } = deep();
    world.hurtBeast(0, 1, 255);
    let k = 0;
    for (; k < 30 * 20 && !b.surfaced; k++) world.step();
    expect(b.surfaced).toBe(true);
    expect(b.fy).toBeLessThan(SURF + 20); // (its own crater's floor, broken through)
    // A tunnel up behind it.
    let open = 0;
    for (let y = 300; y < 560; y += 10) if (!world.terrain.isSolid(Math.round(b.fx), y) || !world.terrain.isSolid(Math.round(b.fx) + 6, y) || !world.terrain.isSolid(Math.round(b.fx) - 6, y)) open++;
    expect(open).toBeGreaterThan(10);
  });

  it('up top it hunts what it sees, and its jaws kill', () => {
    const { world, a, b } = deep();
    a.parts.tough = 1; // (a bot's body: a human's is tougher, see toughness.test.ts)
    world.hurtBeast(0, 1, 255);
    for (let k = 0; k < 30 * 20 && !b.surfaced; k++) world.step();
    expect(b.surfaced).toBe(true);
    a.body.x = b.fx + 220;
    a.body.y = SURF - ACTOR_H;
    for (let k = 0; k < 30 * 15 && a.alive; k++) {
      a.hp = Math.min(a.hp, 100);
      world.step();
    }
    expect(a.alive).toBe(false);
    expect(a.lastWeapon).toBe(W_BASILISK);
  });

  it('nothing left to hunt, it dives back into the deep and sleeps', () => {
    const { world, b } = deep();
    world.hurtBeast(0, 1, 255);
    for (let k = 0; k < 30 * 20 && !b.surfaced; k++) world.step();
    for (let k = 0; k < BASILISK_CALM + 30 * 30 && b.frozen === 0; k++) world.step();
    expect(b.frozen).toBeGreaterThan(0);
    expect(b.frenzy).toBe(0);
    expect(b.fy).toBeGreaterThan(SURF + 80);
  });

  it("very hard to kill: rifle rounds barely scratch it, and it takes hundreds of sniper slugs", () => {
    const { world, a, b } = deep();
    const shoot = (kind: number, n: number) => {
      for (let k = 0; k < n && world.beasts[0]; k++) {
        const pts = world.beastPts[0];
        (world as unknown as { spawnProj(id: number, kind: number, owner: number, x: number, y: number, vx: number, vy: number): void }).spawnProj(70000 + k, kind, 255, pts[10], pts[11] - 20, 0, kind === ProjKind.Slug ? 6000 : 900);
        world.step();
        b.frenzy = 0; // (held where it is, the better to aim)
        b.frozen = 1e9;
      }
    };
    const hp0 = b.hp;
    shoot(ProjKind.Bullet, 60);
    expect(b.hp).toBeGreaterThan(hp0 * 0.95); // (sixty rounds: a few percent)
    const hp1 = b.hp;
    shoot(ProjKind.Slug, 20);
    const perSlug = (hp1 - b.hp) / 20;
    expect(perSlug).toBeGreaterThan(0);
    expect(hp0 / perSlug).toBeGreaterThan(200);
    expect(PROJ[ProjKind.Slug].damage).toBeGreaterThan(0);
    void a;
  });

  it('never bores through what will not yield: under a cement lid it cannot reach the surface', () => {
    const { world, b } = deep(Mat.Cement);
    const count = () => {
      let n = 0;
      for (let y = 560; y < 600; y++) for (let x = 0; x < WORLD_W; x++) if (world.terrain.get(x, y) === Mat.Cement) n++;
      return n;
    };
    const before = count();
    world.hurtBeast(0, 1, 255);
    for (let k = 0; k < 30 * 10; k++) world.step();
    expect(count()).toBe(before);
    expect(b.fy).toBeGreaterThan(560);
  });

  it('nothing to hold (open air, or the map\'s edge, which is no wall): it falls, it never flies', () => {
    for (const x of [1500, 3]) {
      const { world, a, b } = deep();
      a.body.x = x + 300;
      a.body.y = SURF - ACTOR_H;
      // Up in the open sky, awake, its prey on the ground off to one side and above-ish.
      b.fx = x + 0.5;
      b.fy = 60;
      b.x = Math.round(b.fx);
      b.y = 60;
      b.trail = b.trail.map((v, i) => (i % 2 ? 60 : b.fx));
      world.hurtBeast(0, 1, 255);
      b.surfaced = true;
      b.vx = b.vy = 0;
      b.flingCd = 1e9; // (no flinging: just what it does with nothing to hold)
      let y = b.fy;
      let rose = false;
      for (let k = 0; k < 30 * 3 && b.fy < SURF - 12; k++) {
        world.step();
        if (b.fy < y - 0.5) rose = true;
        y = b.fy;
      }
      expect(rose, `x ${x}`).toBe(false);
      expect(b.fy, `x ${x}`).toBeGreaterThan(SURF - 20); // (down on the ground)
      // Straight down, as anything drops: no gliding off toward its prey.
      expect(Math.abs(b.fx - (x + 0.5)), `x ${x}`).toBeLessThan(4);
    }
  });

  it('on the hunt it flings itself at its prey through the air, and sprints', () => {
    const { world, a, b } = deep();
    world.hurtBeast(0, 1, 255);
    for (let k = 0; k < 30 * 20 && !b.surfaced; k++) world.step();
    a.body.x = b.fx + 180;
    a.body.y = SURF - ACTOR_H;
    let flew = false;
    let sprinted = false;
    for (let k = 0; k < 30 * 15 && a.alive && !flew; k++) {
      a.hp = Math.min(a.hp, 100);
      world.step();
      if (b.flung > 0) flew = true;
      if (b.sprint > 0) sprinted = true;
    }
    expect(flew || !a.alive).toBe(true);
    expect(sprinted).toBe(true);
  });

  it('its body batters whoever it rolls into, awake and moving (not just its jaws)', () => {
    const { world, a, b } = deep();
    world.hurtBeast(0, 1, 255);
    for (let k = 0; k < 30 * 20 && !b.surfaced; k++) world.step();
    // Moving: let it go a few ticks, then stand a clone right on its body, well back from the head.
    for (let k = 0; k < 10; k++) world.step();
    const pts = world.beastPts[0];
    const i = 8;
    a.body.x = pts[i * 2] - ACTOR_W / 2;
    a.body.y = pts[i * 2 + 1] - ACTOR_H / 2;
    a.body.vx = a.body.vy = 0;
    a.hp = 100;
    b.coilCd = 1e9; // (no bite: the body only)
    b.vx = 60;
    const hp = a.hp;
    world.step();
    expect(Math.hypot(a.cx - pts[0], a.cy - pts[1])).toBeGreaterThan(BASILISK_R + 6);
    expect(a.hp).toBeLessThan(hp);
    expect(a.lastWeapon).toBe(W_BASILISK);
  });

  it('clients see it asleep in the rock, then in its frenzy', () => {
    const inbox: Uint8Array[] = [];
    const { world, a, b } = deep();
    const c = world.addPlayer('c', { send: (d) => inbox.push(d) })!;
    deliverAll(world, [c]);
    c.body.x = 1100;
    c.body.y = 560; // (in the rock over the cave: just watching)
    const game = new Game();
    game.myId = c.id;
    const pump = () => {
      for (const m of inbox.splice(0)) {
        const r = new Reader(m);
        r.u8();
        const tk = r.u32();
        const ack = r.u16();
        game.applyFrame(tk, ack, r);
      }
    };
    world.step();
    pump();
    const v = game.beastViews.get(0)!;
    expect(v.kind).toBe(BeastKind.Basilisk);
    expect(v.cur.length).toBe(BASILISK_SEGS * 2);
    expect(v.frozen).toBe(true);
    expect(v.frenzy).toBe(false);
    world.hurtBeast(0, 1, 255);
    world.step();
    pump();
    expect(game.beastViews.get(0)!.frenzy).toBe(true);
    void a;
    void b;
  });

  it('on a real map one comes up, deep, hibernating', () => {
    let found = 0;
    // (Not seed 11: a Valley of Souls map, its deep in the valley's calm, where nothing lives yet.)
    for (const seed of [12, 13, 14]) {
      const world = new World(seed);
      world.beasts.fill(null);
      expect((world as unknown as { spawnBasilisk(): boolean }).spawnBasilisk(), `seed ${seed}`).toBe(true);
      // (Or now and then a dragon in its place.)
      const b = world.beasts.find((o) => o && wyrm(o.kind))!;
      expect(b.frozen).toBeGreaterThan(0);
      expect(b.y).toBeGreaterThan(world.terrain.surfaceY(b.x) + 100);
      found++;
    }
    expect(found).toBe(3);
  });
});
