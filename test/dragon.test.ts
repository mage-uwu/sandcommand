import { describe, expect, it } from 'vitest';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { ACTOR_H, WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { ProjKind, projName } from '../src/shared/weapons.ts';
import { BASILISK_HP, BASILISK_R, BEAST_BUILD, BeastKind, DRAGON_HP, DRAGON_R, bodyPoints, burrows, newBeast, wyrm } from '../src/shared/wildlife.ts';
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
  it('is the basilisk three times over: three times the girth and length, three times the health', () => {
    expect(DRAGON_R).toBeCloseTo(BASILISK_R * 3);
    expect(DRAGON_HP).toBe(BASILISK_HP * 3);
    expect(BEAST_BUILD[BeastKind.Dragon].gap).toBe(BEAST_BUILD[BeastKind.Basilisk].gap * 3);
    expect(wyrm(BeastKind.Dragon) && burrows(BeastKind.Dragon)).toBe(true);
    expect(projName(ProjKind.FireSpit)).toBe('Dragon');
  });

  it('woken, it bores up and spits flaming blood at the clone it sees, and the fire burns them', () => {
    const { world, a, b } = lair();
    const k = world.beasts.indexOf(b);
    world.hurtBeast(k, 1, 255);
    expect(b.frenzy).toBeGreaterThan(0);
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
});
