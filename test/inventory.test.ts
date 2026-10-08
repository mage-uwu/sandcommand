import { describe, expect, it } from 'vitest';
import { Reader } from '../src/shared/codec.ts';
import { WORLD_W } from '../src/shared/constants.ts';
import { INV_MAX, ITEM_LIFE, PRIMARIES, invByte, spawnLoadout } from '../src/shared/items.ts';
import { Mat } from '../src/shared/materials.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { Rng } from '../src/shared/rng.ts';
import { WEAPONS, WeaponId } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

function arena(): World {
  const world = new World(41);
  const t = world.terrain;
  for (let x = 0; x < WORLD_W; x++) {
    for (let y = 0; y < 400; y++) if (t.get(x, y) !== Mat.Air) t.set(x, y, Mat.Air);
    for (let y = 400; y < 420; y++) t.set(x, y, Mat.Bedrock);
  }
  world.terrainReplaced();
  return world;
}

let seq = 0;
function send(world: World, p: Player, inv: number, ticks = 1, aim = 0): void {
  for (let k = 0; k < ticks; k++) {
    world.input(p.id, { seq: ++seq & 0xffff, buttons: 0, aim: quantizeAim(aim), inv });
    world.step();
  }
}
/** Press pick-up (or drop) the way a client does: held for a few ticks. */
function press(world: World, p: Player, key: 'pickup' | 'drop'): void {
  for (let k = 0; k < 3; k++) send(world, p, invByte(p.slot, p.invVersion, key === 'pickup', key === 'drop'));
  send(world, p, invByte(p.slot, p.invVersion));
}

describe('loadouts', () => {
  it('every clone gets a primary, a digger and a materializer; the rest is random', () => {
    const rng = new Rng(3);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const inv = spawnLoadout(rng);
      const ws = inv.map((it) => it.weapon);
      expect(PRIMARIES.includes(ws[0])).toBe(true);
      expect(ws).toContain(WeaponId.Digger);
      expect(ws).toContain(WeaponId.Materializer);
      expect(inv.length).toBeLessThanOrEqual(INV_MAX);
      for (const it of inv) expect(it.ammo).toBe(WEAPONS[it.weapon].clip);
      seen.add(ws.join(','));
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe('dropping and picking up', () => {
  it('a dropped gun lands, keeps its ammo, and another clone can take it', () => {
    const world = arena();
    const a = world.addPlayer('a', { send() {} })!;
    const b = world.addPlayer('b', { send() {} })!;
    deliverAll(world, [a, b]);
    for (let k = 0; k < 60; k++) world.step();
    // a fires a couple of sniper rounds, then throws the rifle away.
    send(world, a, world.equip(a, WeaponId.Sniper));
    const sniper = a.inv[a.slot];
    sniper.ammo = 3;
    const n0 = a.inv.length;
    press(world, a, 'drop');
    expect(a.inv.length).toBe(n0 - 1);
    expect(a.inv.some((it) => it === sniper)).toBe(false);
    expect(world.items.length).toBe(1);
    for (let k = 0; k < 120 && !world.items[0].rest; k++) world.step();
    const item = world.items[0];
    expect(item.rest).toBe(true);
    expect(item.weapon).toBe(WeaponId.Sniper);
    // b walks over (teleports, here) and picks it up.
    b.body.x = item.x - 4;
    b.body.y = item.y - 10;
    b.inv = b.inv.slice(0, 2);
    press(world, b, 'pickup');
    expect(world.items.length).toBe(0);
    expect(b.weapon).toBe(WeaponId.Sniper);
    expect(b.inv[b.slot].ammo).toBe(3);
  });

  it('with full hands, picking up swaps for the weapon held', () => {
    const world = arena();
    const a = world.addPlayer('a', { send() {} })!;
    deliverAll(world, [a]);
    for (let k = 0; k < 60; k++) world.step();
    while (a.inv.length < INV_MAX) a.inv.push({ weapon: WeaponId.Grenade, ammo: 3 });
    send(world, a, world.equip(a, WeaponId.Digger));
    (world as unknown as { spawnItem: (w: number, a: number, x: number, y: number, vx: number, vy: number) => void }).spawnItem(WeaponId.Bazooka, 1, a.cx, a.cy, 0, 0);
    press(world, a, 'pickup');
    expect(a.inv.length).toBe(INV_MAX);
    expect(a.weapon).toBe(WeaponId.Bazooka);
    expect(a.inv.some((it) => it.weapon === WeaponId.Digger)).toBe(false);
    expect(world.items.map((it) => it.weapon)).toEqual([WeaponId.Digger]);
  });

  it('death spills the whole kit on the ground', () => {
    const world = arena();
    const a = world.addPlayer('a', { send() {} })!;
    deliverAll(world, [a]);
    const kit = a.inv.map((it) => it.weapon).sort();
    (world as unknown as { damage: (p: Player, n: number, by: number, w: number) => void }).damage(a, 999, a.id, 255);
    expect(a.alive).toBe(false);
    expect(a.inv.length).toBe(0);
    expect(world.items.map((it) => it.weapon).sort()).toEqual(kit);
  });

  it('dropped weapons are cleared away eventually', () => {
    const world = arena();
    const a = world.addPlayer('a', { send() {} })!;
    deliverAll(world, [a]);
    press(world, a, 'drop');
    expect(world.items.length).toBe(1);
    for (let k = 0; k < ITEM_LIFE + 2; k++) world.step();
    expect(world.items.length).toBe(0);
  });
});

describe('selection', () => {
  it('a selection made against an old inventory is ignored', () => {
    const world = arena();
    const a = world.addPlayer('a', { send() {} })!;
    deliverAll(world, [a]);
    const v = a.invVersion;
    send(world, a, invByte(1, v));
    expect(a.slot).toBe(1);
    press(world, a, 'drop'); // version moves on
    const held = a.slot;
    send(world, a, invByte(0, v)); // stale: chosen before the drop
    expect(a.slot).toBe(held);
    send(world, a, invByte(0, a.invVersion));
    expect(a.slot).toBe(0);
  });
});

describe('replication', () => {
  it('clients see ground items appear, settle where the server has them, and vanish when taken', () => {
    const frames: Uint8Array[] = [];
    const world = arena();
    const a = world.addPlayer('a', { send: (d) => frames.push(d) })!;
    deliverAll(world, [a]);
    const game = new Game();
    game.myId = a.id;
    const pump = () => {
      for (const f of frames) {
        const r = new Reader(f);
        r.u8();
        const tick = r.u32();
        const ack = r.u16();
        game.applyFrame(tick, ack, r);
        game.localTick(0, 0, () => {});
      }
      frames.length = 0;
    };
    pump();
    expect(game.inv.length).toBe(a.inv.length);
    expect(game.weapon).toBe(a.weapon);
    press(world, a, 'drop');
    for (let k = 0; k < 90; k++) world.step();
    pump();
    expect(game.groundItems.size).toBe(1);
    const [ci] = [...game.groundItems.values()];
    const si = world.items[0];
    expect(ci.rest).toBe(true);
    expect(ci.x).toBeCloseTo(si.x, 5);
    expect(ci.y).toBeCloseTo(si.y, 5);
    a.body.x = si.x - 4;
    a.body.y = si.y - 10;
    press(world, a, 'pickup');
    pump();
    expect(game.groundItems.size).toBe(0);
  });
});
