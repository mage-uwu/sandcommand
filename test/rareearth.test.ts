import { describe, expect, it } from 'vitest';
import { BTN_FIRE } from '../src/shared/actor.ts';
import { ACTOR_H, WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { invByte } from '../src/shared/items.ts';
import { MAT_COUNT, MAT_COLOR, MAT_NAME, Mat, RARE_EARTH_VALUE } from '../src/shared/materials.ts';
import { rubbleOf } from '../src/shared/particles.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { WeaponId } from '../src/shared/weapons.ts';
import { MapKind, generateWorld } from '../src/shared/worldgen.ts';
import { type Player, World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

describe('rare earth', () => {
  it('is a full material: named, coloured, and stays itself when knocked loose', () => {
    expect(Mat.RareEarth).toBe(MAT_COUNT - 1);
    expect(MAT_NAME[Mat.RareEarth]).toBe('rare earth');
    expect(MAT_COLOR.length).toBe(MAT_COUNT);
    expect(rubbleOf(Mat.RareEarth)).toBe(Mat.RareEarth);
  });

  it('grows as small crystals deep in natural ground, on every kind of map', () => {
    const t = new Terrain();
    for (const kind of [MapKind.Plain, MapKind.Fortress, MapKind.Siege]) {
      generateWorld(t, 4242 + kind, kind);
      // Crystals: count connected clumps and their sizes.
      const seen = new Uint8Array(WORLD_W * WORLD_H);
      const sizes: number[] = [];
      for (let i = 0; i < t.mat.length; i++) {
        if (t.mat[i] !== Mat.RareEarth || seen[i]) continue;
        let n = 0;
        const stack = [i];
        seen[i] = 1;
        while (stack.length) {
          const j = stack.pop()!;
          n++;
          for (const k of [j - 1, j + 1, j - WORLD_W, j + WORLD_W, j - WORLD_W - 1, j - WORLD_W + 1, j + WORLD_W - 1, j + WORLD_W + 1]) {
            if (k >= 0 && k < t.mat.length && !seen[k] && t.mat[k] === Mat.RareEarth) {
              seen[k] = 1;
              stack.push(k);
            }
          }
        }
        sizes.push(n);
      }
      expect(sizes.length).toBeGreaterThan(30);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(60); // small: never a vein
      const cells = sizes.reduce((a, b) => a + b, 0);
      let gold = 0;
      for (let i = 0; i < t.mat.length; i++) if (t.mat[i] === Mat.Gold) gold++;
      expect(cells * 20).toBeLessThan(gold); // far rarer than gold
    }
  });

  it('a dug cell of it banks ten times a cell of gold', () => {
    const dig = (mat: number) => {
      const world = new World(91);
      const a = world.addPlayer('a', { send() {} })!;
      deliverAll(world, [a]);
      const t = world.terrain;
      const FLOOR = 400;
      for (let x = 200; x < 900; x++) {
        for (let y = 40; y < FLOOR; y++) t.set(x, y, x >= 520 && x < 560 && y > FLOOR - 40 ? mat : Mat.Air);
        for (let y = FLOOR; y < FLOOR + 20; y++) t.set(x, y, Mat.Bedrock);
      }
      world.terrainReplaced();
      a.body.x = 508;
      a.body.y = FLOOR - ACTOR_H;
      a.body.vx = a.body.vy = 0;
      world.equip(a, WeaponId.Digger);
      a.gold = 0;
      let seq = 0;
      const p: Player = a;
      for (let k = 0; k < 20; k++) {
        world.input(p.id, { seq: ++seq, buttons: BTN_FIRE, aim: quantizeAim(0), inv: invByte(p.slot, p.invVersion, false) });
        world.step();
      }
      return a.gold;
    };
    const gold = dig(Mat.Gold);
    const rare = dig(Mat.RareEarth);
    expect(gold).toBeGreaterThan(5);
    expect(rare).toBe(gold * RARE_EARTH_VALUE);
  });
});
