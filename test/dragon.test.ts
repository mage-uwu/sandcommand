import { describe, expect, it } from 'vitest';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { ACTOR_H, WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { ProjKind, projName } from '../src/shared/weapons.ts';
import { BASILISK_HP, BASILISK_R, BEAST_BUILD, BeastKind, DRAGON_HP, DRAGON_R, DRAGON_BREATH_PER, DRAGON_BREATH_TICKS, DRAGON_BROOD_MAX, DRAGON_BROOD_MIN, DRAGON_RATTLE, DRAGON_ROAR, bodyPoints, burrows, newBeast, wyrm } from '../src/shared/wildlife.ts';
import { World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

const SURF = 200;
/** Solid rock under open sky (the surface at y 200), bedrock at the bottom; a clone on the surface; a dragon asleep in the rock. */
function lair() {
  const world = new World(7, { mode: 'sandbox', bots: 0 });
  (world as unknown as { beastSpawnAt: number }).beastSpawnAt = 1e9;
  const t = world.terrain;
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) t.mat[y * WORLD_W + x] = y < SURF ? Mat.Air : y >= WORLD_H - 12 ? Mat.Bedrock : Mat.Rock;
  t.rebuildAllPlanes();
  world.terrainReplaced();
  const a = world.addPlayer('a', { send() {} })!;
  deliverAll(world, [a]);
  resetBody(a.parts, ClassId.Medium, 0);
  a.hp = 100;
  a.body.x = 1900;
  a.body.y = SURF - ACTOR_H;
  a.body.vx = a.body.vy = 0;
  world.beasts.fill(null);
  const b = newBeast(t, BeastKind.Dragon, 1500, 520, 1);
  b.frozen = 30 * 200;
  world.beasts[0] = b;
  bodyPoints(t, b, world.beastPts[0]);
  return { world, a, b };
}

describe('the dragon', () => {
  it('is the basilisk three times over (three times the girth and each segment), twice as many segments, and twenty-four times the health', () => {
    expect(DRAGON_R).toBeCloseTo(BASILISK_R * 3);
    expect(DRAGON_HP).toBe(BASILISK_HP * 24); // (three times, for its size; then eight times as strong)
    expect(BEAST_BUILD[BeastKind.Dragon].gap).toBe(BEAST_BUILD[BeastKind.Basilisk].gap * 3);
    // (And twice the segments: six times as long, the last of them its rattle.)
    expect(BEAST_BUILD[BeastKind.Dragon].segs).toBe(BEAST_BUILD[BeastKind.Basilisk].segs * 2);
    expect(DRAGON_RATTLE).toBeGreaterThan(2);
    expect(wyrm(BeastKind.Dragon) && burrows(BeastKind.Dragon)).toBe(true);
    expect(projName(ProjKind.FireSpit)).toBe('Dragon');
  });

  it('woken, it bores up and spits flaming blood at the clone it sees, and the fire burns them', () => {
    const { world, a, b } = lair();
    const k = world.beasts.indexOf(b);
    world.hurtBeast(k, 1, 255);
    expect(b.frenzy).toBeGreaterThan(0);
    b.brood = 1e9; // (its spit alone, not its brood)
    let spat = false;
    const pr = (world as unknown as { projectiles: { n: number; kind: Uint8Array } }).projectiles;
    for (let t = 0; t < 30 * 25 && a.alive && a.hp >= 100; t++) {
      // (Held where it is: the target, not the chase.)
      a.body.x = 1900;
      a.body.y = Math.min(a.body.y, SURF - ACTOR_H);
      world.step();
      for (let i = 0; i < pr.n; i++) if (pr.kind[i] === ProjKind.FireSpit) spat = true;
    }
    expect(spat).toBe(true);
    expect(!a.alive || a.hp < 100).toBe(true);
  });

  it('now and then it stops dead and roars, jaws wide, and spits 2-4 millipedes and asps out at the clone it is after', () => {
    const { world, a, b } = lair();
    const k = world.beasts.indexOf(b);
    world.hurtBeast(k, 1, 255);
    let roared = -1;
    let at: [number, number] = [0, 0];
    let still = true;
    let maxLift = 0;
    const brood = () => world.beasts.filter((c) => c && (c.kind === BeastKind.Millipede || c.kind === BeastKind.Asp));
    for (let t = 0; t < 30 * 40 && roared < 0; t++) {
      a.hp = 100;
      a.body.x = 1900;
      a.body.y = Math.min(a.body.y, SURF - ACTOR_H);
      world.step();
      if (b.rear > 0) {
        roared = t;
        at = [b.fx, b.fy];
      }
    }
    expect(roared).toBeGreaterThanOrEqual(0);
    expect(brood().length).toBe(0);
    for (let t = 0; t < DRAGON_ROAR + 2; t++) {
      a.hp = 100;
      world.step();
      maxLift = Math.max(maxLift, b.lift);
      if (b.rear > 0 && Math.hypot(b.fx - at[0], b.fy - at[1]) > 0.01) still = false;
    }
    // (Stock still while it roars, its jaws (lift) flung wide.)
    expect(still).toBe(true);
    expect(maxLift).toBeGreaterThan(0.8);
    expect(b.rear).toBe(0);
    const out = brood();
    expect(out.length).toBeGreaterThanOrEqual(DRAGON_BROOD_MIN);
    expect(out.length).toBeLessThanOrEqual(DRAGON_BROOD_MAX);
    // Flung, through the air, at it; and set on it.
    for (const c of out) {
      expect(c!.target).toBe(a.id);
      expect(c!.hurtBy).toBe(a.id);
    }
    expect(out.some((c) => !c!.attached)).toBe(true);
    // (They come down near it.)
    for (let t = 0; t < 30 * 3; t++) {
      a.hp = 100;
      world.step();
    }
    const near = brood().filter((c) => Math.hypot(c!.fx - a.cx, c!.fy - a.cy) < 200 || Math.hypot(c!.x - a.cx, c!.y - a.cy) < 200);
    expect(near.length).toBeGreaterThan(0);
  });

  it('its breath is a sustained shotgun blast: dozens of globs of burning blood over a second, fanned out, re-aimed at the clone', () => {
    const { world, a, b } = lair();
    world.hurtBeast(world.beasts.indexOf(b), 1, 255);
    b.brood = 1e9; // (its breath alone)
    const shots: { t: number; vx: number; vy: number }[] = [];
    const w = world as unknown as { spawnProj: (...args: number[]) => unknown };
    const real = w.spawnProj.bind(world);
    let t = 0;
    w.spawnProj = (id: number, kind: number, owner: number, x: number, y: number, vx: number, vy: number, ...rest: number[]) => {
      if (kind === ProjKind.FireSpit) shots.push({ t, vx, vy });
      return real(id, kind, owner, x, y, vx, vy, ...rest);
    };
    for (; t < 30 * 25 && shots.length < DRAGON_BREATH_TICKS * DRAGON_BREATH_PER; t++) {
      a.hp = 100;
      a.body.x = 1900;
      a.body.y = Math.min(a.body.y, SURF - ACTOR_H);
      world.step();
    }
    expect(shots.length).toBeGreaterThanOrEqual(DRAGON_BREATH_TICKS * DRAGON_BREATH_PER);
    const breath = shots.slice(0, DRAGON_BREATH_TICKS * DRAGON_BREATH_PER);
    // (Poured out over the breath's ticks, not all at once; fanned out, not one line.)
    expect(breath[breath.length - 1].t - breath[0].t).toBeGreaterThanOrEqual(DRAGON_BREATH_TICKS - 2);
    const angles = breath.map((s) => Math.atan2(s.vy, s.vx));
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(0.2);
  });

  it("it bores a tunnel three times a basilisk's", () => {
    const { world, b } = lair();
    const k = world.beasts.indexOf(b);
    world.hurtBeast(k, 1, 255);
    for (let t = 0; t < 30 * 4; t++) world.step();
    // (Somewhere along where it went, a bore wider than a basilisk's whole tunnel.)
    let widest = 0;
    for (let x = 1200; x < 1800; x += 4) {
      let run = 0;
      for (let y = SURF + 4; y < 700; y++) {
        if (!world.terrain.isSolid(x, y)) widest = Math.max(widest, ++run);
        else run = 0;
      }
    }
    expect(widest).toBeGreaterThan(9 * 2 * 1.8);
  });
  it("laid out in its den, it folds back on itself rather than run off the map's edge", () => {
    const { world } = lair();
    const b = newBeast(world.terrain, BeastKind.Dragon, 300, 520, 1);
    const pts = bodyPoints(world.terrain, b, []);
    expect(pts.length).toBe(BEAST_BUILD[BeastKind.Dragon].segs * 2);
    for (let i = 0; i < pts.length; i += 2) {
      expect(pts[i]).toBeGreaterThanOrEqual(0);
      expect(pts[i]).toBeLessThan(WORLD_W);
    }
  });
});
