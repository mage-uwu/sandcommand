import { describe, expect, it } from 'vitest';
import { deliverAll } from './helpers.ts';
import { BTN_RIGHT, BTN_UP, newBody, stepBody } from '../src/shared/actor.ts';
import { Part, has, mobility, newBodyState, newStrike, partAt, strike, harm } from '../src/shared/body.ts';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, DT, WORLD_W } from '../src/shared/constants.ts';
import { applyFrameRecords, nullHandler } from '../src/shared/frame.ts';
import { Mat } from '../src/shared/materials.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { PROJ, ProjKind } from '../src/shared/weapons.ts';
import { World } from '../src/server/world.ts';

const RIFLE = PROJ[ProjKind.Bullet].mass * PROJ[ProjKind.Bullet].sharp * 880; // energy at muzzle speed
const SHRAPNEL = 0.4 * 1.0 * 400;

describe('modular body', () => {
  it('maps hit points to parts, mirrored by facing', () => {
    const all = newBodyState().mask;
    expect(partAt(all, 4, 1, false)).toBe(Part.Head);
    expect(partAt(all, 7, 4, false)).toBe(Part.GunArm); // front of the body facing right
    expect(partAt(all, 0, 4, true)).toBe(Part.GunArm); // same arm when facing left
    expect(partAt(all, 1, 11, false)).toBe(Part.LegB);
    expect(partAt(all, 6, 11, false)).toBe(Part.LegF);
    expect(partAt(all, 4, 6, false)).toBe(Part.Torso);
    // A missing arm exposes the torso behind it.
    expect(partAt(all & ~(1 << Part.GunArm), 7, 4, false)).toBe(Part.Torso);
  });

  it('armour stops what cannot beat its integrity; sharp fast things go through', () => {
    const s = newBodyState();
    const r = newStrike();
    strike(s, Part.Torso, SHRAPNEL, 7, r); // vest integrity 160
    expect(s.wounds[Part.Vest]).toBe(0);
    expect(s.wounds[Part.Torso]).toBe(0);
    expect(r.hp).toBeGreaterThan(0); // only a bruise
    expect(r.hp).toBeLessThan(6);
    const r2 = newStrike();
    strike(s, Part.Torso, RIFLE, 16, r2); // a rifle round punches through vest and into the chest
    expect(s.wounds[Part.Vest]).toBe(16);
    expect(s.wounds[Part.Torso]).toBe(16);
    expect(r2.hp).toBe(16); // only flesh wounds cost HP
  });

  it('limbs are torn off once their wounds reach the limit', () => {
    const s = newBodyState();
    const r = newStrike();
    for (let k = 0; k < 3; k++) strike(s, Part.LegF, SHRAPNEL, 7, r);
    expect(has(s.mask, Part.LegF)).toBe(true);
    strike(s, Part.LegF, SHRAPNEL, 7, r); // fourth fragment: 28 >= 26
    expect(has(s.mask, Part.LegF)).toBe(false);
    expect(r.detached).toEqual([Part.LegF]);
    expect(r.vital).toBe(false);
    expect(mobility(s.mask, { legs: 0, jet: false, canFire: false, oneHanded: false }).legs).toBe(1);
  });

  it('two rifle headshots kill through a helmet, and take the helmet with the head', () => {
    const s = newBodyState();
    const r = newStrike();
    strike(s, Part.Head, RIFLE, 16, r);
    expect(r.vital).toBe(false);
    strike(s, Part.Head, RIFLE, 16, r);
    expect(r.vital).toBe(true);
    expect(has(s.mask, Part.Head)).toBe(false);
    expect(has(s.mask, Part.Helmet)).toBe(false);
  });

  it('blast overpressure goes into armour first', () => {
    const s = newBodyState();
    const r = newStrike();
    harm(s, Part.Torso, 20, r);
    expect(s.wounds[Part.Vest]).toBe(20);
    expect(s.wounds[Part.Torso]).toBe(0);
    expect(r.hp).toBe(0);
  });

  it('missing legs and jetpack change movement (shared with client prediction)', () => {
    const t = new Terrain();
    for (let x = 0; x < WORLD_W; x++) for (let y = 600; y < 620; y++) t.mat[y * WORLD_W + x] = Mat.Bedrock;
    t.rebuildAllPlanes();
    const run = (legs: number, jet: boolean, buttons: number) => {
      const b = newBody(500, 600 - ACTOR_H);
      b.legs = legs;
      b.jet = jet;
      b.onGround = true;
      for (let k = 0; k < 30; k++) stepBody(b, buttons, t, DT);
      return b;
    };
    const two = run(2, true, BTN_RIGHT).x - 500;
    const one = run(1, true, BTN_RIGHT).x - 500;
    const none = run(0, true, BTN_RIGHT).x - 500;
    expect(one).toBeLessThan(two * 0.7);
    expect(none).toBeLessThan(one * 0.6);
    expect(none).toBeGreaterThan(0); // can still crawl
    expect(run(2, false, BTN_UP).y).toBeGreaterThanOrEqual(600 - ACTOR_H - 40); // jumps but cannot jet
    expect(run(0, true, BTN_UP).y).toBeLessThan(600 - ACTOR_H - 40); // legless but the jetpack still flies
  });

  it('server: shots sever a leg (broadcast, slower clone), a headshot kills', () => {
    const world = new World(4);
    const inbox: Uint8Array[] = [];
    const shooter = world.addPlayer('shooter', { send: (d) => inbox.push(d) })!;
    const victim = world.addPlayer('victim', { send() {} })!;
    deliverAll(world, [shooter, victim]);
    const t = world.terrain;
    for (let x = 900; x < 1100; x++) {
      for (let y = 300; y < 310; y++) t.set(x, y, Mat.Bedrock);
      for (let y = 200; y < 300; y++) t.set(x, y, Mat.Air);
    }
    shooter.body.x = 940;
    shooter.body.y = 300 - ACTOR_H;
    victim.body.x = 1000;
    victim.body.y = 300 - ACTOR_H;
    victim.aimQ = 0; // facing right, toward +x: the shooter is behind it
    let id = 5000;
    const shootAt = (y: number) => {
      world.projectiles.spawn(id++, ProjKind.Bullet, shooter.id, 985, y, 880, 0);
      world.step();
      world.step();
    };
    // Leg shots (low on the body).
    for (let k = 0; k < 2; k++) shootAt(300 - 3);
    expect(victim.alive).toBe(true);
    expect(victim.parts.mask & ((1 << Part.LegB) | (1 << Part.LegF))).not.toBe((1 << Part.LegB) | (1 << Part.LegF));
    expect(victim.body.legs).toBe(1);
    // Every client hears about the severed leg.
    let detaches = 0;
    const h = { ...nullHandler, detach: () => detaches++ };
    for (const m of inbox) {
      const r = new Reader(m);
      r.u8();
      r.u32();
      r.u16();
      applyFrameRecords(r, new Terrain(), h);
    }
    expect(detaches).toBeGreaterThan(0);
    // Two shots to the head.
    for (let k = 0; k < 2; k++) shootAt(300 - ACTOR_H + 1);
    expect(victim.alive).toBe(false);
    expect(has(victim.parts.mask, Part.Head)).toBe(false);
    expect(shooter.kills).toBe(1);
  });
});
