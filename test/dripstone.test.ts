import { describe, expect, it } from 'vitest';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { dripstone } from '../src/shared/caves.ts';
import { ACTOR_H, ACTOR_W, WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { PK, Particles, applyCarve, releaseCarve } from '../src/shared/particles.ts';
import { Rng } from '../src/shared/rng.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { ProjKind } from '../src/shared/weapons.ts';
import { MapKind, generateWorld } from '../src/shared/worldgen.ts';
import { World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 500;
const ROOF = FLOOR - 140;
const SX = 1200; // the stalactite's column

/** A cave: rock floor and roof, open between; a stalactite hanging over the floor at SX. */
function cave(m: Uint8Array): void {
  for (let x = 0; x < WORLD_W; x++) {
    for (let y = 0; y < WORLD_H; y++) {
      const v = y >= FLOOR || (y < ROOF && y > ROOF - 40) ? Mat.Rock : Mat.Air;
      m[y * WORLD_W + x] = v;
    }
  }
  dripstone(m, SX, ROOF, 1, 40, 5, 7);
}

const dripCells = (t: Terrain) => {
  let n = 0;
  for (let i = 0; i < t.mat.length; i++) if (t.mat[i] === Mat.Dripstone) n++;
  return n;
};

describe('dripstone', () => {
  it('grows in the natural caves of ordinary maps', () => {
    const t = new Terrain();
    for (const seed of [3, 4]) {
      generateWorld(t, seed, MapKind.Plain);
      expect(dripCells(t)).toBeGreaterThan(400);
    }
  });

  it('breaks off whole when anything chips it, the same on every replica', () => {
    const a = new Terrain();
    const b = new Terrain();
    cave(a.mat);
    cave(b.mat);
    a.rebuildAllPlanes();
    b.rebuildAllPlanes();
    const whole = dripCells(a);
    expect(whole).toBeGreaterThan(100);
    // A rifle round's chip near its tip.
    const ra: number[] = [];
    const da: number[] = [];
    const rb: number[] = [];
    const db: number[] = [];
    applyCarve(a, SX, ROOF + 30, 2, 0, ra, da);
    applyCarve(b, SX, ROOF + 30, 2, 0, rb, db);
    expect(dripCells(a)).toBe(0); // all of it came down
    expect(da).toEqual(db);
    expect(Array.from(a.mat)).toEqual(Array.from(b.mat));
    // It comes down as heavy chunks and grit, identically on both.
    const pa = new Particles(4096);
    const pb = new Particles(4096);
    releaseCarve(pa, ra, da, SX, ROOF + 30, 0, new Rng(9));
    releaseCarve(pb, rb, db, SX, ROOF + 30, 0, new Rng(9));
    expect(pa.count(PK.Stone)).toBeGreaterThan(whole / 4);
    expect(pa.count(PK.Stone)).toBe(pb.count(PK.Stone));
    expect(Array.from(pa.x.slice(0, pa.n))).toEqual(Array.from(pb.x.slice(0, pb.n)));
  });

  it('shot down onto a clone under it, it hurts (and it was the shooter who did it)', () => {
    const world = new World(77);
    const a = world.addPlayer('shooter', { send() {} })!;
    const b = world.addPlayer('under', { send() {} })!;
    deliverAll(world, [a, b]);
    cave(world.terrain.mat);
    world.terrain.rebuildAllPlanes();
    world.terrainReplaced();
    for (const [p, x] of [
      [a, SX - 200],
      [b, SX - ACTOR_W / 2],
    ] as const) {
      resetBody(p.parts, ClassId.Medium, 0);
      p.hp = 100;
      p.body.x = x;
      p.body.y = FLOOR - ACTOR_H;
      p.body.vx = p.body.vy = 0;
    }
    world.step();
    // One rifle round into the stalactite.
    world.projectiles.spawn(91001, ProjKind.Bullet, a.id, SX - 40, ROOF + 12, 880, 0);
    let hurt = false;
    for (let k = 0; k < 90 && !hurt; k++) {
      b.body.x = SX - ACTOR_W / 2; // (standing right under it)
      world.step();
      if (b.hp < 100 || !b.alive) hurt = true;
    }
    expect(dripCells(world.terrain)).toBe(0);
    expect(hurt).toBe(true);
    expect(b.lastHitBy).toBe(a.id);
  });
});
