import { describe, expect, it } from 'vitest';
import { ACTOR_H, ACTOR_W, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { F_ALIVE, quantizeAim } from '../src/shared/protocol.ts';
import { WEAPONS, WeaponId, lockReach } from '../src/shared/weapons.ts';
import { World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { scopeLock } from '../src/client/scope.ts';
import { deliverAll } from './helpers.ts';

describe('lock-on reach, gauged by the scope', () => {
  it('a close-in gun locks on near; a long gun as far as its scope looks', () => {
    const r = (w: number) => lockReach(WEAPONS[w]);
    expect(r(WeaponId.Smg)).toBeLessThan(r(WeaponId.Rifle));
    expect(r(WeaponId.Rifle)).toBeLessThan(r(WeaponId.LightRifle));
    expect(r(WeaponId.LightRifle)).toBeLessThan(r(WeaponId.Laser));
    expect(r(WeaponId.Laser)).toBeLessThan(r(WeaponId.Sniper));
    expect(r(WeaponId.Sniper)).toBeGreaterThan(1000);
    expect(r(WeaponId.Smg)).toBeLessThan(300);
  });

  it("the server sets a locked shot true only on a target within the weapon's reach", () => {
    const world = new World(5, { mode: 'ffa', bots: 0 });
    world.wildlife = false;
    const t = world.terrain;
    for (let x = 0; x < WORLD_W; x++) for (let y = 300; y < 420; y++) t.set(x, y, y >= 400 ? Mat.Bedrock : Mat.Air);
    world.terrainReplaced();
    const p = world.addPlayer('p', { send() {} })!;
    const q = world.addPlayer('q', { send() {} })!;
    deliverAll(world, [p, q]);
    for (let k = 0; k < 90 && !(p.alive && q.alive); k++) world.step();
    const w = world as unknown as { lockedAim(p: unknown, aim: number, speed: number, gravity: number, muzzle: number): number };
    const place = (dx: number) => {
      p.body.x = 1000;
      p.body.y = 400 - ACTOR_H;
      q.body.x = 1000 + dx;
      q.body.y = 400 - ACTOR_H;
    };
    for (const weapon of [WeaponId.Rifle, WeaponId.Sniper]) {
      world.equip(p, weapon);
      const reach = lockReach(WEAPONS[weapon]);
      // Just inside: aimed a touch off them, it's corrected onto them.
      place(reach - 30);
      const near = w.lockedAim(p, -0.02, 0, 0, 0);
      expect(near, `${weapon} near`).not.toBe(-0.02);
      // Beyond it: the aim as sent.
      place(reach + 60);
      expect(w.lockedAim(p, -0.004, 0, 0, 0), `${weapon} far`).toBe(-0.004);
    }
  });

  it('the scope locks on to an enemy within reach, not one beyond it', () => {
    const game = new Game();
    game.myId = 0;
    game.alive = true;
    for (const [dx, expectLock] of [
      [200, true],
      [600, false],
    ] as const) {
      game.scopeLock = null;
      // (Where this client sees them: no clock running here to interpolate by.)
      const view = { id: 4, x: 1000 + dx - ACTOR_W / 2, y: 500 - ACTOR_H / 2, vx: 0, vy: 0, aim: quantizeAim(0), flags: F_ALIVE, hp: 100, weapon: 0, moving: false, parts: 0x1ff, stance: 0, faction: 0 };
      (game as unknown as { remoteViews: () => unknown[] }).remoteViews = () => [view];
      const aim = scopeLock(game, 1000, 500, 0.02, 0.1, lockReach(WEAPONS[WeaponId.Rifle]));
      expect(!!game.scopeLock, `at ${dx}`).toBe(expectLock);
      if (!expectLock) expect(aim).toBe(0.02);
    }
  });
});
