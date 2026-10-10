import { describe, expect, it } from 'vitest';
import { BTN_FIRE, shoulderAt } from '../src/shared/actor.ts';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, ACTOR_W } from '../src/shared/constants.ts';
import { invByte } from '../src/shared/items.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { WEAPONS, WeaponId } from '../src/shared/weapons.ts';
import { World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

/**
 * Gun smoke and flashes come out of the barrel as each client draws it:
 * the drawn clone's shoulder plus the weapon's muzzle length along the
 * shot. Never the clone's middle.
 */
describe('muzzle effects at the barrel', () => {
  it("another clone's shot: every flash and smoke particle starts at its drawn muzzle", () => {
    const inbox: Uint8Array[] = [];
    const world = new World(52);
    const a = world.addPlayer('watcher', { send: (d) => inbox.push(d) })!;
    const b = world.addPlayer('shooter', { send() {} })!;
    deliverAll(world, [a, b]);
    for (let k = 0; k < 30 * 30 && world.crafts.some((c) => c !== null); k++) world.step();
    a.body.x = b.body.x - 60;
    const game = new Game();
    game.myId = a.id;
    const pump = () => {
      for (const f of inbox.splice(0)) {
        const r = new Reader(f);
        r.u8();
        const t = r.u32();
        const ack = r.u16();
        game.applyFrame(t, ack, r);
      }
    };
    world.equip(b, WeaponId.Rifle);
    for (let k = 0; k < 40; k++) {
      world.step();
      pump();
    }
    // One round, up and away into the sky (nothing for it to hit).
    const aim = -1.1;
    const n0 = game.particles.n;
    world.input(b.id, { seq: 1, buttons: BTN_FIRE, aim: quantizeAim(aim), inv: invByte(b.slot, b.invVersion, false) });
    world.step();
    pump();
    const fresh: { x: number; y: number }[] = [];
    for (let i = n0; i < game.particles.n; i++) fresh.push({ x: game.particles.x[i], y: game.particles.y[i] });
    expect(fresh.length).toBeGreaterThan(0);
    const v = game.remoteViews().find((r) => r.id === b.id)!;
    const sh = shoulderAt(v.x, v.y, v.stance, false, { x: 0, y: 0 });
    const m = { x: sh.x + Math.cos(aim) * WEAPONS[WeaponId.Rifle].muzzle, y: sh.y + Math.sin(aim) * WEAPONS[WeaponId.Rifle].muzzle };
    const mid = { x: v.x + ACTOR_W / 2, y: v.y + ACTOR_H / 2 };
    for (const p of fresh) {
      // (Particles may have moved a tick's worth already.)
      expect(Math.hypot(p.x - m.x, p.y - m.y)).toBeLessThan(9);
      expect(Math.hypot(p.x - mid.x, p.y - mid.y)).toBeGreaterThan(Math.hypot(p.x - m.x, p.y - m.y));
    }
  });
});
