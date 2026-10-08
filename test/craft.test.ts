import { describe, expect, it } from 'vitest';
import { BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP } from '../src/shared/actor.ts';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, ACTOR_W, DT, WORLD_W } from '../src/shared/constants.ts';
import {
  CRAFT_H,
  CRAFT_W,
  CraftPart,
  CraftPhase,
  type Craft,
  craftToWorld,
  groundBelow,
  hasCraftPart,
  newCraft,
  newCraftStep,
  stepCraft,
} from '../src/shared/craft.ts';
import { Mat } from '../src/shared/materials.ts';
import { PK } from '../src/shared/particles.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { Rng } from '../src/shared/rng.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { ProjKind } from '../src/shared/weapons.ts';
import { World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

function countMetal(world: World): number {
  let n = 0;
  for (const m of world.terrain.mat) if (m === Mat.Metal) n++;
  return n;
}

/** Flat open arena so rockets have somewhere predictable to land. */
function arena(t: Terrain): void {
  for (let x = 0; x < WORLD_W; x++) {
    for (let y = 0; y < 400; y++) if (t.get(x, y) !== Mat.Air) t.set(x, y, Mat.Air);
    for (let y = 400; y < 420; y++) t.set(x, y, Mat.Bedrock);
  }
}

type WorldInternals = {
  destroyCraft: (slot: number, by: number) => void;
  hurtCraftPart: (slot: number, part: number, dmg: number, by: number) => void;
};

/** Every hull contact point clear of terrain? */
function clearOfTerrain(c: Craft, t: Terrain): boolean {
  const pt = { x: 0, y: 0 };
  for (const [u, v] of [[0, -12], [-5, -2], [5, -2], [-5, 4], [5, 4], [-5, 9], [5, 9]]) {
    craftToWorld(c, u, v, pt);
    if (t.isSolid(Math.floor(pt.x), Math.floor(pt.y))) return false;
  }
  return true;
}

describe('drop rockets', () => {
  it('deliver a clone: fall in, brake on thrust, drop it beside the hatch, leave', () => {
    const world = new World(3);
    arena(world.terrain);
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
        if (c.y + CRAFT_H / 2 > 300) maxThrust = Math.max(maxThrust, c.thrust);
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
    expect(Math.abs(c.a)).toBeLessThan(0.3); // came down upright
    expect(p.body.x >= c.x + CRAFT_W / 2 || p.body.x + ACTOR_W <= c.x - CRAFT_W / 2).toBe(true); // out of the side hatch
    // The rocket leaves.
    for (let t = 0; t < 300 && world.crafts.some((k) => k !== null); t++) world.step();
    expect(world.crafts.every((k) => k === null)).toBe(true);
    expect(p.alive).toBe(true);
  });

  it('can be shot down: passenger thrown clear, hull becomes scrap metal', () => {
    const world = new World(5);
    arena(world.terrain);
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
      // Rifle rounds into the middle of the hull from just beside it.
      world.projectiles.spawn(id++, ProjKind.Bullet, shooter.id, c.x - 10, c.y, 880, 0);
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
    arena(world.terrain);
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
    b.body.x = c.x + CRAFT_W / 2 + 6;
    b.body.y = c.y + CRAFT_H / 2 - ACTOR_H;
    const wounds0 = b.parts.wounds.reduce((s, w) => s + w, 0);
    const hp0 = b.hp;
    (world as unknown as WorldInternals).destroyCraft(world.crafts.indexOf(c), 255);
    for (let t = 0; t < 20; t++) world.step();
    const wounds1 = b.parts.wounds.reduce((s, w) => s + w, 0);
    expect(wounds1 > wounds0 || b.hp < hp0 || !b.alive).toBe(true);
  });

  it('crashes if it hits the ground too fast', () => {
    const world = new World(2);
    arena(world.terrain);
    const p = world.addPlayer('p', { send() {} })!;
    world.step();
    const c = world.crafts.find((k) => k !== null)!;
    // Too low and too fast for the retro burn to save it.
    c.y = 400 - CRAFT_H / 2 - 6;
    c.vy = 420;
    world.step();
    world.step();
    expect(world.crafts.every((k) => k === null || k.passenger !== p.id)).toBe(true);
    expect(p.alive).toBe(true); // passenger thrown clear of the wreck
    expect(world.grains.count(PK.Hull)).toBeGreaterThan(0);
    expect(groundBelow(world.terrain, 100, 0)).toBe(400);
  });
});

describe('drop rocket physics', () => {
  it('lands tilted on its fins and tips over onto its side without sinking into the ground', () => {
    const t = new Terrain();
    arena(t);
    const c = newCraft(500, 255);
    c.parts &= ~(1 << CraftPart.Engine); // dead stick: no thrust
    c.y = 400 - CRAFT_H / 2 - 4;
    c.vy = 40;
    c.a = 0.5;
    const out = newCraftStep();
    for (let k = 0; k < 240; k++) {
      stepCraft(c, t, DT, out, 0);
      expect(out.crashed).toBe(false);
      expect(clearOfTerrain(c, t)).toBe(true);
    }
    // Lying on its side, at rest, on the surface.
    expect(Math.abs(c.a)).toBeGreaterThan(1.2);
    expect(Math.abs(c.vx) + Math.abs(c.vy)).toBeLessThan(5);
    expect(Math.abs(c.w)).toBeLessThan(0.5);
    expect(c.y).toBeGreaterThan(390);
  });

  it('tipped over with someone aboard, it opens the hatch', () => {
    const t = new Terrain();
    arena(t);
    const c = newCraft(500, 7);
    c.parts &= ~(1 << CraftPart.Engine);
    c.y = 400 - CRAFT_H / 2 - 4;
    c.vy = 40;
    c.a = 0.5;
    const out = newCraftStep();
    let releasedAt = -1;
    for (let k = 0; k < 240 && releasedAt < 0; k++) {
      stepCraft(c, t, DT, out, 0);
      if (out.release) releasedAt = k;
    }
    expect(releasedAt).toBeGreaterThan(60);
    expect(Math.abs(c.a)).toBeGreaterThan(0.8);
  });

  it('an off-centre impulse spins it, and the autopilot rights it again', () => {
    const t = new Terrain();
    arena(t);
    const c = newCraft(500, 255);
    c.y = 200;
    c.vy = 0;
    c.w = 4; // knocked spinning
    const out = newCraftStep();
    let maxTilt = 0;
    for (let k = 0; k < 120; k++) {
      stepCraft(c, t, DT, out, 0);
      maxTilt = Math.max(maxTilt, Math.abs(c.a));
    }
    expect(maxTilt).toBeGreaterThan(0.3);
    expect(Math.abs(c.a)).toBeLessThan(0.1);
  });

  it('the passenger flies it: steer, burn, bail out', () => {
    const t = new Terrain();
    arena(t);
    const c = newCraft(500, 7);
    c.y = 150;
    c.vy = 0;
    const out = newCraftStep();
    for (let k = 0; k < 15; k++) stepCraft(c, t, DT, out, BTN_RIGHT | BTN_UP);
    expect(c.a).toBeGreaterThan(0.3); // rotated clockwise (nose right)
    for (let k = 0; k < 20; k++) stepCraft(c, t, DT, out, BTN_UP);
    expect(c.vx).toBeGreaterThan(20); // burning along a nose that points right
    expect(c.vy).toBeLessThan(0); // full burn climbs
    for (let k = 0; k < 15; k++) stepCraft(c, t, DT, out, BTN_LEFT);
    expect(c.w).toBeLessThan(0);
    // Holding fire doesn't keep bailing; each press does once.
    stepCraft(c, t, DT, out, 0);
    stepCraft(c, t, DT, out, BTN_FIRE);
    expect(out.release).toBe(true);
    expect(c.phase).toBe(CraftPhase.Ascend);
    stepCraft(c, t, DT, out, BTN_FIRE);
    expect(out.release).toBe(false);
  });

  it('losing the engine kills thrust; losing a fin unbalances it', () => {
    const t = new Terrain();
    arena(t);
    const out = newCraftStep();
    const dead = newCraft(500, 255);
    dead.y = 100;
    dead.parts &= ~(1 << CraftPart.Engine);
    for (let k = 0; k < 20; k++) stepCraft(dead, t, DT, out, 0);
    expect(dead.thrust).toBe(0);
    expect(dead.vy).toBeGreaterThan(160); // falling like a stone

    const lop = newCraft(500, 7);
    lop.y = 100;
    lop.vy = 0;
    lop.parts &= ~(1 << CraftPart.FinR);
    for (let k = 0; k < 20; k++) stepCraft(lop, t, DT, out, BTN_UP);
    expect(Math.abs(lop.a)).toBeGreaterThan(0.3); // twisted off course under power
  });
});

describe('drop rocket parts', () => {
  it('shooting the engine off sends the part flying and the rocket down', () => {
    const world = new World(11);
    arena(world.terrain);
    const p = world.addPlayer('p', { send() {} })!;
    let c: Craft | undefined;
    for (let t = 0; t < 200 && !(c && c.y > 0); t++) {
      world.step();
      c = world.crafts.find((k) => k !== null) ?? undefined;
    }
    expect(c).toBeTruthy();
    const slot = world.crafts.indexOf(c!);
    const hull0 = world.grains.count(PK.Hull);
    (world as unknown as WorldInternals).hurtCraftPart(slot, CraftPart.Engine, 999, 255);
    expect(hasCraftPart(c!.parts, CraftPart.Engine)).toBe(false);
    expect(world.crafts[slot]).toBe(c); // the hull survives losing a part
    expect(world.grains.count(PK.Hull)).toBeGreaterThan(hull0); // the part, as fragments in the field engine
    // Nothing to brake with: it comes down hard.
    for (let t = 0; t < 300 && world.crafts[slot] === c; t++) world.step();
    expect(world.crafts[slot]).not.toBe(c);
    void p;
  });

  it('bullets tear off the part they hit', () => {
    const world = new World(12);
    arena(world.terrain);
    const shooter = world.addPlayer('s', { send() {} })!;
    const rider = world.addPlayer('r', { send() {} })!;
    deliverAll(world, [shooter, rider]);
    rider.alive = false;
    rider.respawn = 1;
    let c: Craft | undefined;
    for (let t = 0; t < 400 && !(c && c.y > 100); t++) {
      world.step();
      c = world.crafts.find((k) => k !== null && k.passenger === rider.id) ?? undefined;
    }
    expect(c).toBeTruthy();
    // Aim at the left fin (body-local (-5, 9)) from the left.
    let id = 7000;
    const pt = { x: 0, y: 0 };
    for (let t = 0; t < 40 && hasCraftPart(c!.parts, CraftPart.FinL); t++) {
      craftToWorld(c!, -5, 9, pt);
      // Lead it: the rocket moves before projectiles do this tick.
      world.projectiles.spawn(id++, ProjKind.Bullet, shooter.id, pt.x - 8 + c!.vx * DT, pt.y + c!.vy * DT, 880, 0);
      world.step();
      if (!world.crafts.includes(c!)) break;
    }
    expect(hasCraftPart(c!.parts, CraftPart.FinL)).toBe(false);
    expect(hasCraftPart(c!.parts, CraftPart.Nose)).toBe(true);
  });
});

describe('drop rocket prediction', () => {
  for (const latencyTicks of [2, 6]) {
    it(`the passenger's client predicts its own rocket exactly at ${latencyTicks * 33}ms one-way latency`, () => {
      const world = new World(77);
      arena(world.terrain);
      const game = new Game();
      // The client has the same flat terrain (as if every chunk had arrived).
      arena(game.terrain);
      const toClient: { at: number; data: Uint8Array }[] = [];
      const toServer: { at: number; cmd: Parameters<World['input']>[1] }[] = [];
      let now = 0;
      const p = world.addPlayer('pilot', { send: (d) => toClient.push({ at: now + latencyTicks, data: d }) })!;
      game.myId = p.id;
      const rng = new Rng(4);
      let buttons = 0;
      let ridden = 0;
      for (now = 0; now < 400 && !p.alive; now++) {
        // Steer and burn at random (never bail out).
        if (rng.next() < 0.1) {
          const r = rng.next();
          buttons = (r < 0.3 ? BTN_RIGHT : r < 0.6 ? BTN_LEFT : 0) | (rng.next() < 0.3 ? BTN_UP : 0);
        }
        game.localTick(buttons, quantizeAim(0), (seq) => toServer.push({ at: now + latencyTicks, cmd: { seq, buttons, aim: 0, inv: 0 } }));
        while (toServer.length && toServer[0].at <= now) world.input(p.id, toServer.shift()!.cmd);
        world.step();
        while (toClient.length && toClient[0].at <= now) {
          const r = new Reader(toClient.shift()!.data);
          r.u8();
          const tick = r.u32();
          const ack = r.u16();
          // Before the first input reaches the server there is nothing to
          // replay against (same warm-up as clone prediction): measure after.
          if (ack === 0) game.craftCorrections = 0;
          game.applyFrame(tick, ack, r);
          if (game.ride) ridden++;
        }
      }
      expect(ridden).toBeGreaterThan(30);
      // The first rebase is free; after that the replay must match the server.
      expect(game.craftCorrections).toBeLessThanOrEqual(1);
    });
  }
});
