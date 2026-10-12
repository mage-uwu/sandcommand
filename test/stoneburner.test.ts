import { describe, expect, it } from 'vitest';
import { BTN_FIRE } from '../src/shared/actor.ts';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, ACTOR_W, WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { invByte } from '../src/shared/items.ts';
import { Mat } from '../src/shared/materials.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { W_STONEBURNER } from '../src/shared/particles.ts';
import { BURNER_FUSE, BURNER_STRIKE, BurnerPhase, FOOT_LIFE, STONE_CRATER_R, blinkOn, blinkPeriod } from '../src/shared/stoneburner.ts';
import { WeaponId } from '../src/shared/weapons.ts';
import { newTank } from '../src/shared/tank.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 700;
/** A sandbox: flat dirt from FLOOR down (bedrock at the bottom), open air over it; `n` clones in it, frames to the first fed to a client. */
function range(n: number) {
  const world = new World(11, { mode: 'sandbox', bots: 0 });
  world.wildlife = false;
  const frames: Uint8Array[] = [];
  const ps: Player[] = Array.from({ length: n }, (_, i) => world.addPlayer(`p${i}`, { send: i === 0 ? (d) => frames.push(d) : () => {} })!);
  deliverAll(world, ps);
  const t = world.terrain;
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) t.set(x, y, y < FLOOR ? Mat.Air : y > WORLD_H - 20 ? Mat.Bedrock : Mat.Dirt);
  world.terrainReplaced();
  const place = (p: Player, x: number, y = FLOOR) => {
    p.body.x = x - ACTOR_W / 2;
    p.body.y = y - ACTOR_H;
    p.body.vx = p.body.vy = 0;
    p.hp = 100;
  };
  return { world, ps, frames, place };
}
const pump = (game: Game, frames: Uint8Array[]) => {
  for (const f of frames.splice(0)) {
    const r = new Reader(f);
    r.u8();
    const tick = r.u32();
    const ack = r.u16();
    game.applyFrame(tick, ack, r);
  }
};
/** Throw the Stoneburner `p` holds, aimed `aim`. */
function throwIt(world: World, p: Player, aim: number): void {
  const inv = world.equip(p, WeaponId.Stoneburner);
  let seq = 1;
  // (A moment to get it in hand.)
  for (let k = 0; k < 20; k++) {
    world.input(p.id, { seq: seq++, buttons: 0, aim: quantizeAim(aim), inv });
    world.step();
  }
  world.input(p.id, { seq: seq++, buttons: BTN_FIRE, aim: quantizeAim(aim), inv });
  world.step();
  world.input(p.id, { seq: seq++, buttons: 0, aim: quantizeAim(aim), inv: invByte(p.slot, p.invVersion) });
}

describe('the Stoneburner', () => {
  it('its beacon blinks faster and faster as the countdown runs out', () => {
    expect(blinkPeriod(BURNER_FUSE)).toBe(30);
    expect(blinkPeriod(30)).toBeLessThan(5);
    let early = 0;
    let late = 0;
    for (let k = 0; k < 90; k++) {
      if (blinkOn(BURNER_FUSE - k) && !blinkOn(BURNER_FUSE - k + 1)) early++;
      if (blinkOn(90 - k) && !blinkOn(90 - k + 1)) late++;
    }
    expect(late).toBeGreaterThan(early * 3);
  });

  it('thrown once and gone from the hand; the beacon sticks where it lands and counts down 15 s', () => {
    const { world, ps, place } = range(2);
    const [a] = ps;
    place(a, 1000);
    place(ps[1], 3000);
    throwIt(world, a, -0.6);
    expect(a.inv.some((it) => it.weapon === WeaponId.Stoneburner)).toBe(false);
    expect(world.burners.length).toBe(1);
    const b = world.burners[0];
    for (let k = 0; k < 90 && b.phase === BurnerPhase.Flying; k++) world.step();
    expect(b.phase).toBe(BurnerPhase.Stuck);
    expect(b.x).toBeGreaterThan(1020); // (thrown, not dropped)
    expect(Math.abs(b.y - FLOOR)).toBeLessThan(4);
    const x0 = b.x;
    for (let k = 0; k < 60; k++) world.step();
    expect(b.x).toBe(x0); // (stuck fast)
    expect(b.fuse).toBeGreaterThan(BURNER_FUSE - 200);
  });

  it('stuck to a clone, it goes where they go', () => {
    const { world, ps, place } = range(2);
    const [a, v] = ps;
    place(a, 1000);
    place(v, 1040);
    throwIt(world, a, 0);
    for (let k = 0; k < 20 && world.burners[0].phase === BurnerPhase.Flying; k++) world.step();
    const b = world.burners[0];
    expect(b.phase).toBe(BurnerPhase.Stuck);
    v.body.x += 200;
    world.step();
    expect(Math.abs(b.x - v.cx)).toBeLessThan(ACTOR_W);
  });

  it('the strike: everyone close in dies (its thrower too), further out it burns and shoves, the far side of the map feels nothing; a great crater; and every client sees it', () => {
    const { world, ps, frames, place } = range(6);
    const [a, near, mid, behind, far, open300] = ps;
    const gz = 1500;
    place(a, gz - 60);
    place(near, gz + 100);
    place(mid, gz + 500);
    place(open300, gz - 300);
    // (Down a hole of its own, deep under the ground: the heat goes over it.)
    for (let y = FLOOR; y < FLOOR + 260; y++) for (let x = gz + 520 - 8; x < gz + 520 + 8; x++) world.terrain.set(x, y, Mat.Air);
    world.terrainReplaced();
    place(behind, gz + 520, FLOOR + 260);
    place(far, 3800);
    world.burners.push({ x: gz, y: FLOOR - 1, vx: 0, vy: 0, phase: BurnerPhase.Stuck, fuse: 2, owner: a.id, onPlayer: 255, onTank: -1, ox: 0, oy: 0, age: 0 } as never);
    const hp = () => ps.map((p) => (p.alive ? p.hp : 0));
    for (let k = 0; k < BURNER_STRIKE + 6; k++) {
      for (const p of [mid, behind, far]) if (p.alive && k < BURNER_STRIKE) p.hp = 100;
      world.step();
    }
    const after = hp();
    // The flash: everyone near is dead, whoever's side they're on, its thrower too; 300 cells off in the open, still dead.
    expect(a.alive).toBe(false);
    expect(near.alive).toBe(false);
    expect(open300.alive).toBe(false);
    expect(a.lastWeapon).toBe(W_STONEBURNER);
    expect(near.lastHitBy).toBe(a.id);
    // Further out: hurt, badly, and thrown.
    expect(mid.alive ? mid.hp : 0).toBeLessThan(100);
    // Behind cover at the same range: hurt far less.
    expect(after[3]).toBeGreaterThan(after[2]);
    // The far end of the map: untouched.
    expect(far.alive).toBe(true);
    expect(far.hp).toBe(100);
    // The crater: open ground well down under where it struck.
    expect(world.terrain.isSolid(gz, FLOOR + STONE_CRATER_R - 20)).toBe(false);
    // Every client heard of it.
    const game = new Game();
    game.myId = a.id;
    pump(game, frames);
    expect(game.stoneBurns.length).toBe(1);
    expect(Math.abs(game.stoneBurns[0].x - gz)).toBeLessThan(2);
  });

  it('a tank within the flash is wrecked', () => {
    const { world, ps, place } = range(2);
    place(ps[0], 300);
    place(ps[1], 3800);
    const k = newTank(2000 + 280, FLOOR - 24);
    k.chute = false;
    world.tanks[0] = k;
    world.stoneBurn(2000, FLOOR - 1, 255);
    world.step();
    expect(world.tanks[0]).toBe(null);
  });

  it("the molten core burns its way down for 40 s, slower as it goes, and smoulders out", () => {
    const { world, ps, place } = range(2);
    place(ps[0], 300);
    place(ps[1], 3800);
    world.stoneBurn(2000, FLOOR - 1, 255);
    expect(world.feet.length).toBe(1);
    const f = world.feet[0];
    const y0 = f.y;
    for (let k = 0; k < 30 * 10; k++) world.step();
    const y10 = f.y;
    for (let k = 0; k < 30 * 10; k++) world.step();
    const y20 = f.y;
    expect(y10).toBeGreaterThan(y0 + 20);
    expect(y20 - y10).toBeLessThan(y10 - y0); // (slowing)
    expect(world.terrain.isSolid(2000, y20)).toBe(false); // (burned its way down)
    for (let k = 0; k < FOOT_LIFE; k++) world.step();
    expect(world.feet.length).toBe(0);
  });
});
