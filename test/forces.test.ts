import { describe, expect, it } from 'vitest';
import { ACTOR_H, ACTOR_W, DT, WORLD_W } from '../src/shared/constants.ts';
import { Collider, DistanceField } from '../src/shared/field.ts';
import { Mat } from '../src/shared/materials.ts';
import { ActorField, NO_OWNER, PK, Particles, W_DEBRIS } from '../src/shared/particles.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { ProjKind } from '../src/shared/weapons.ts';
import { World } from '../src/server/world.ts';

function flatWorld(): Collider {
  const t = new Terrain();
  for (let x = 0; x < WORLD_W; x++) for (let y = 800; y < 1024; y++) t.mat[y * WORLD_W + x] = Mat.Bedrock;
  t.rebuildAllPlanes();
  const f = new DistanceField(t);
  f.update();
  return new Collider(t, f);
}

function bodyAt(x: number, y: number): ActorField {
  const a = new ActorField(ACTOR_W, ACTOR_H);
  a.add(7, x, y, 0, 0);
  return a;
}

describe('particles act on players', () => {
  it('a fast grain transfers momentum and wounds; a slow one only nudges', () => {
    const col = flatWorld();
    const fast = new Particles(8);
    const af = bodyAt(500, 700);
    fast.spawnGrain(491, 706, 400, 0, Mat.Rubble, 60, 3); // thrown debris, owner 3, ~13 cells per tick
    fast.step(col, DT, {}, af);
    expect(af.dvx[0]).toBeGreaterThan(5); // shoved in the grain's direction
    expect(af.dmg[0]).toBeGreaterThan(0);
    expect(af.dmgBy[0]).toBe(3);
    expect(af.dmgWeapon[0]).toBe(W_DEBRIS);
    expect(fast.vx[0]).toBeLessThan(0); // rebounded off the body

    const slow = new Particles(8);
    const af2 = bodyAt(500, 700);
    slow.spawnGrain(498, 706, 80, 0, Mat.Sand, 60);
    slow.step(col, DT, {}, af2);
    expect(af2.dvx[0]).toBeGreaterThan(0);
    expect(af2.dmg[0]).toBe(0); // below the hurt threshold
  });

  it('shrapnel embeds and cuts; harmless kinds pass through', () => {
    const col = flatWorld();
    const p = new Particles(8);
    const af = bodyAt(500, 700);
    p.spawn(PK.Shrapnel, 490, 706, 420, 0, 30, ProjKind.Grenade, 0, 2);
    p.spawn(PK.Smoke, 503, 706, 0, 0, 30);
    p.step(col, DT, {}, af);
    expect(p.count(PK.Shrapnel)).toBe(0); // stopped in the body
    expect(p.count(PK.Smoke)).toBe(1); // smoke does not interact
    expect(af.dmg[0]).toBeGreaterThan(5);
    expect(af.dmgBy[0]).toBe(2);
    expect(af.dmgWeapon[0]).toBe(ProjKind.Grenade);
  });

  it('a dense sand flow drags a body along with it', () => {
    const col = flatWorld();
    const p = new Particles(4096);
    const af = bodyAt(600, 600);
    // A sheet of sand sliding right through where the body stands.
    for (let i = 0; i < 300; i++) p.spawnGrain(600 + (i % 8), 600 + ((i / 8) | 0) * 0.37, 150, 0, Mat.Sand, 600, NO_OWNER);
    p.step(col, DT, {}, af);
    expect(af.dvx[0]).toBeGreaterThan(20);
  });

  it('a blast shoves bodies away through the air field', () => {
    const col = flatWorld();
    const p = new Particles(8);
    const left = new ActorField(ACTOR_W, ACTOR_H);
    left.add(1, 470, 600, 0, 0); // left of the blast
    left.add(2, 522, 600, 0, 0); // right of the blast
    p.blast(500, 607, 60, 260);
    p.step(col, DT, {}, left);
    expect(left.dvx[0]).toBeLessThan(-10);
    expect(left.dvx[1]).toBeGreaterThan(10);
  });

  it('server: rocket shrapnel wounds a player outside the blast radius, credited to the shooter', () => {
    const world = new World(9);
    const shooter = world.addPlayer('shooter', { send() {} })!;
    const victim = world.addPlayer('victim', { send() {} })!;
    for (let i = 0; i < 3; i++) world.step();
    // Put both on a flat shelf in open air so only particles can connect.
    const t = world.terrain;
    for (let x = 900; x < 1100; x++) for (let y = 300; y < 310; y++) t.set(x, y, Mat.Bedrock);
    for (let x = 900; x < 1100; x++) for (let y = 200; y < 300; y++) t.set(x, y, Mat.Air);
    shooter.body.x = 905;
    shooter.body.y = 300 - ACTOR_H;
    victim.body.x = 1000;
    victim.body.y = 300 - ACTOR_H;
    const hp0 = victim.hp;
    // Rocket strikes the shelf 45 cells from the victim (rocket splash radius is 34).
    world.projectiles.spawn(999, ProjKind.Rocket, shooter.id, 955, 280, 0, 380);
    let knockedLeftOrUp = false;
    for (let k = 0; k < 20; k++) {
      world.step();
      if (victim.body.vx > 5 || victim.body.vy < -5) knockedLeftOrUp = true;
    }
    expect(victim.hp).toBeLessThan(hp0); // hurt by shrapnel/debris, not splash
    expect(knockedLeftOrUp).toBe(true); // pushed away from the blast
    if (!victim.alive) expect(shooter.kills).toBe(1);
  });
});
