import { describe, expect, it } from 'vitest';
import { BTN_FIRE, DIG_PULL, newBody, stepBody } from '../src/shared/actor.ts';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { ACTOR_H, DT, WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { invByte } from '../src/shared/items.ts';
import { Mat } from '../src/shared/materials.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { WeaponId } from '../src/shared/weapons.ts';
import { World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 600;
function flat(): Terrain {
  const t = new Terrain();
  for (let x = 0; x < WORLD_W; x++) for (let y = FLOOR; y < FLOOR + 20; y++) t.mat[y * WORLD_W + x] = Mat.Bedrock;
  t.rebuildAllPlanes();
  return t;
}

describe('the digger', () => {
  it('pulls the clone a little toward where it aims (in the air, and on the ground)', () => {
    const t = flat();
    const air = newBody(500, 300);
    const still = newBody(500, 300);
    for (let k = 0; k < 15; k++) {
      stepBody(air, 0, t, DT, 0); // aimed right
      stepBody(still, 0, t, DT);
    }
    expect(air.vx).toBeCloseTo(DIG_PULL * DT * 15, 0);
    expect(air.x - still.x).toBeGreaterThan(5);
    // Aimed up, it falls a little slower; aimed down, faster.
    const up = newBody(500, 300);
    for (let k = 0; k < 15; k++) stepBody(up, 0, t, DT, -Math.PI / 2);
    expect(up.y).toBeLessThan(still.y);
    // On the ground: a slow drift.
    const g = newBody(500, FLOOR - ACTOR_H);
    for (let k = 0; k < 5; k++) stepBody(g, 0, t, DT);
    const x0 = g.x;
    for (let k = 0; k < 30; k++) stepBody(g, 0, t, DT, Math.PI);
    expect(g.x).toBeLessThan(x0 - 3);
    expect(g.x).toBeGreaterThan(x0 - 30);
  });

  it("the server pulls the same way while the digger runs (and only then)", () => {
    const world = new World(7, { mode: 'sandbox', bots: 0 });
    world.wildlife = false;
    const a = world.addPlayer('a', { send() {} })!;
    deliverAll(world, [a]);
    const tt = world.terrain;
    for (let y = 0; y < WORLD_H; y++) for (let x = 400; x < 1400; x++) tt.set(x, y, y >= FLOOR ? Mat.Bedrock : Mat.Air);
    world.terrainReplaced();
    a.body.x = 800;
    a.body.y = FLOOR - ACTOR_H;
    a.body.vx = a.body.vy = 0;
    world.equip(a, WeaponId.Digger);
    for (let k = 0; k < 5; k++) world.step();
    const x0 = a.body.x;
    for (let k = 0; k < 30; k++) {
      world.input(a.id, { seq: k + 1, buttons: BTN_FIRE, aim: quantizeAim(0), inv: invByte(a.slot, a.invVersion, false) });
      world.step();
    }
    expect(a.body.x).toBeGreaterThan(x0 + 3);
  });

  it("a spider droid's bites are wider than a clone's", () => {
    const bite = (cls: number) => {
      const world = new World(7, { mode: 'sandbox', bots: 0 });
      world.wildlife = false;
      const a = world.addPlayer('a', { send() {} })!;
      deliverAll(world, [a]);
      const tt = world.terrain;
      for (let y = 0; y < WORLD_H; y++) for (let x = 400; x < 1400; x++) tt.set(x, y, y >= FLOOR || x >= 820 ? Mat.Dirt : Mat.Air);
      world.terrainReplaced();
      resetBody(a.parts, cls, 0);
      a.body.cls = cls;
      a.body.x = 808;
      a.body.y = FLOOR - ACTOR_H;
      a.body.vx = a.body.vy = 0;
      world.equip(a, WeaponId.Digger);
      for (let k = 0; k < 3; k++) world.step();
      const solid = () => {
        let n = 0;
        for (let y = FLOOR - 40; y < FLOOR; y++) for (let x = 820; x < 860; x++) if (tt.isSolid(x, y)) n++;
        return n;
      };
      // The first bite the digger takes (it may take a moment to come up).
      const s0 = solid();
      for (let k = 0; k < 30; k++) {
        world.input(a.id, { seq: k + 1, buttons: BTN_FIRE, aim: quantizeAim(0), inv: invByte(a.slot, a.invVersion, false) });
        world.step();
        if (solid() < s0) break;
      }
      return s0 - solid();
    };
    const clone = bite(ClassId.Medium);
    const droid = bite(ClassId.Droid);
    expect(clone).toBeGreaterThan(40);
    expect(droid).toBeGreaterThan(clone * 1.3);
  });
});
