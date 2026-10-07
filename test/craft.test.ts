import { describe, expect, it } from 'vitest';
import { ACTOR_H, ACTOR_W, WORLD_W } from '../src/shared/constants.ts';
import { CRAFT_H, CRAFT_W, CraftPhase, groundBelow } from '../src/shared/craft.ts';
import { Mat } from '../src/shared/materials.ts';
import { PK } from '../src/shared/particles.ts';
import { ProjKind } from '../src/shared/weapons.ts';
import { World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

function countMetal(world: World): number {
  let n = 0;
  for (const m of world.terrain.mat) if (m === Mat.Metal) n++;
  return n;
}

/** Flat open arena so rockets have somewhere predictable to land. */
function arena(world: World): void {
  const t = world.terrain;
  for (let x = 0; x < WORLD_W; x++) {
    for (let y = 0; y < 400; y++) if (t.get(x, y) !== Mat.Air) t.set(x, y, Mat.Air);
    for (let y = 400; y < 420; y++) t.set(x, y, Mat.Bedrock);
  }
}

describe('drop rockets', () => {
  it('deliver a clone: fall in, brake on thrust, drop it beside the hatch, leave', () => {
    const world = new World(3);
    arena(world);
    const p = world.addPlayer('newbie', { send() {} })!;
    expect(p.alive).toBe(false);
    let maxThrust = 0;
    let started = false;
    let releasedAt = -1;
    for (let t = 0; t < 900 && releasedAt < 0; t++) {
      world.step();
      const c = world.crafts.find((k) => k !== null);
      if (c) {
        started = true;
        if (c.y + CRAFT_H > 300) maxThrust = Math.max(maxThrust, c.thrust);
      }
      if (p.alive) releasedAt = t;
    }
    expect(started).toBe(true);
    expect(maxThrust).toBeGreaterThan(0.6); // retro burn near the ground
    expect(releasedAt).toBeGreaterThan(0);
    expect(releasedAt).toBeLessThan(300); // under 10 s from launch to boots on the ground
    expect(p.body.y + ACTOR_H).toBeGreaterThan(390); // dropped near the ground, not from the sky
    expect(p.hp).toBeGreaterThan(90);
    const c = world.crafts.find((k) => k !== null)!;
    expect(p.body.x >= c.x + CRAFT_W || p.body.x + ACTOR_W <= c.x).toBe(true); // out of the side hatch
    // The rocket leaves.
    for (let t = 0; t < 300 && world.crafts.some((k) => k !== null); t++) world.step();
    expect(world.crafts.every((k) => k === null)).toBe(true);
    expect(p.alive).toBe(true);
  });

  it('can be shot down: passenger thrown clear, hull becomes scrap metal', () => {
    const world = new World(5);
    arena(world);
    const shooter = world.addPlayer('shooter', { send() {} })!;
    const rider = world.addPlayer('rider', { send() {} })!;
    deliverAll(world, [shooter, rider]);
    // Send the rider back down and shoot its rocket on the way in.
    rider.alive = false;
    rider.respawn = 1;
    let craft = world.crafts.find((k) => k !== null && k.passenger === rider.id);
    for (let t = 0; t < 400 && !craft; t++) {
      world.step();
      craft = world.crafts.find((k) => k !== null && k.passenger === rider.id);
    }
    expect(craft).toBeTruthy();
    const metal0 = countMetal(world);
    let id = 9000;
    let destroyed = false;
    for (let t = 0; t < 120 && !destroyed; t++) {
      const c = world.crafts.find((k) => k !== null && (k.passenger === rider.id || k.delivered === rider.id));
      if (!c) {
        destroyed = true;
        break;
      }
      // Rifle rounds from just beside the hull.
      world.projectiles.spawn(id++, ProjKind.Bullet, shooter.id, c.x - 6, c.y + CRAFT_H / 2, 880, 0);
      world.step();
    }
    expect(destroyed).toBe(true);
    expect(world.grains.count(PK.Hull)).toBeGreaterThan(20); // heavy fragments in flight
    // Fragments come down and settle as scrap-metal terrain.
    for (let t = 0; t < 600 && world.grains.count(PK.Hull) > 0; t++) world.step();
    expect(countMetal(world) - metal0).toBeGreaterThan(20);
  });

  it('hull fragments maim bystanders', () => {
    const world = new World(8);
    arena(world);
    const a = world.addPlayer('a', { send() {} })!;
    const b = world.addPlayer('b', { send() {} })!;
    for (let t = 0; t < 1200 && !(a.alive && b.alive && world.crafts.every((k) => k === null)); t++) world.step();
    // Park b next to a hovering rocket for a, then blow it up from outside.
    a.alive = false;
    a.respawn = 1;
    for (let t = 0; t < 600; t++) {
      world.step();
      const c = world.crafts.find((k) => k !== null && k.passenger === a.id);
      if (c && c.phase === CraftPhase.Drop) break;
    }
    const c = world.crafts.find((k) => k !== null && (k.passenger === a.id || k.delivered === a.id))!;
    expect(c).toBeTruthy();
    b.body.x = c.x + CRAFT_W + 6;
    b.body.y = c.y + CRAFT_H - ACTOR_H;
    const wounds0 = b.parts.wounds.reduce((s, w) => s + w, 0);
    const hp0 = b.hp;
    (world as unknown as { destroyCraft: (slot: number, by: number) => void }).destroyCraft(world.crafts.indexOf(c), 255);
    for (let t = 0; t < 20; t++) world.step();
    const wounds1 = b.parts.wounds.reduce((s, w) => s + w, 0);
    expect(wounds1 > wounds0 || b.hp < hp0 || !b.alive).toBe(true);
  });

  it('crashes if it hits the ground too fast', () => {
    const world = new World(2);
    arena(world);
    const p = world.addPlayer('p', { send() {} })!;
    world.step();
    const c = world.crafts.find((k) => k !== null)!;
    // Too low and too fast for the retro burn to save it.
    c.y = 400 - CRAFT_H - 6;
    c.vy = 420;
    world.step();
    world.step();
    expect(world.crafts.every((k) => k === null || k.passenger !== p.id)).toBe(true);
    expect(p.alive).toBe(true); // passenger thrown clear of the wreck
    expect(world.grains.count(PK.Hull)).toBeGreaterThan(0);
    expect(groundBelow(world.terrain, 100, 0)).toBe(400);
  });
});
