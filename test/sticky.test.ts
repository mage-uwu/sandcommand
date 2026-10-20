import { describe, expect, it } from 'vitest';
import { BTN_FIRE } from '../src/shared/actor.ts';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, ACTOR_W, WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { INV_MAX, STICKY_ODDS, invByte, spawnLoadout } from '../src/shared/items.ts';
import { Mat } from '../src/shared/materials.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { Rng } from '../src/shared/rng.ts';
import { STICKY_CORE_R, STICKY_FUSE, STICKY_ON_VEHICLE, stickyCore } from '../src/shared/sticky.ts';
import { newTank, tankMaxHp } from '../src/shared/tank.ts';
import { PROJ, ProjKind, WeaponId } from '../src/shared/weapons.ts';
import { bodyPoints, newMillipede } from '../src/shared/wildlife.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 700;
/** A sandbox: flat dirt from FLOOR down, open air over it; `n` clones in it, the frames to the first fed to a client. */
function range(n: number) {
  const world = new World(12, { mode: 'sandbox', bots: 0 });
  world.wildlife = false;
  const frames: Uint8Array[] = [];
  const ps: Player[] = Array.from({ length: n }, (_, i) => world.addPlayer(`p${i}`, { send: i === 0 ? (d) => frames.push(d) : () => {} })!);
  deliverAll(world, ps);
  const t = world.terrain;
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) t.set(x, y, y < FLOOR ? Mat.Air : y > WORLD_H - 20 ? Mat.Bedrock : Mat.Dirt);
  world.terrainReplaced();
  const place = (p: Player, x: number) => {
    p.body.x = x - ACTOR_W / 2;
    p.body.y = FLOOR - ACTOR_H;
    p.body.vx = p.body.vy = 0;
    p.hp = 100;
  };
  return { world, ps, frames, place };
}
/** Throw the sticky charge `p` holds, aimed `aim`. */
function throwIt(world: World, p: Player, aim: number): void {
  const inv = world.equip(p, WeaponId.Sticky);
  let seq = 1;
  for (let k = 0; k < 20; k++) {
    world.input(p.id, { seq: seq++, buttons: 0, aim: quantizeAim(aim), inv });
    world.step();
  }
  world.input(p.id, { seq: seq++, buttons: BTN_FIRE, aim: quantizeAim(aim), inv });
  world.step();
  world.input(p.id, { seq: seq++, buttons: 0, aim: quantizeAim(aim), inv: invByte(p.slot, p.invVersion) });
}
/** A charge stuck fast where it is, about to go off (to whatever's given). */
const stuck = (world: World, x: number, y: number, owner: number, on: Partial<{ onPlayer: number; onTank: number; onBeast: number }> = {}) =>
  world.charges.push({ x, y, vx: 0, vy: 0, stuck: true, fuse: 2, owner, onPlayer: 255, onTank: -1, onBeast: -1, ox: 0, oy: 0, age: 0, ...on } as never);

describe('the sticky charge', () => {
  it('a ferocious core close in (four grenades), a grenade\'s reach at 1.2 times its blast further out, slow fragments', () => {
    const g = PROJ[ProjKind.Grenade];
    const s = PROJ[ProjKind.Sticky];
    expect(stickyCore(0)).toBe(4 * g.splashDamage);
    expect(stickyCore(STICKY_CORE_R)).toBe(0);
    expect(STICKY_CORE_R).toBeLessThan(g.splashR / 3);
    expect(s.splashDamage).toBeCloseTo(1.2 * g.splashDamage);
    expect(s.splashR).toBe(g.splashR);
  });

  it('thrown once and gone from the hand, it sticks to the clone it hits, rides with them, and goes off six seconds later: them dead, a clone further off barely scratched', () => {
    const { world, ps, place } = range(3);
    const [a, v, by] = ps;
    place(a, 1000);
    place(v, 1040);
    place(by, 1110);
    throwIt(world, a, -0.1);
    expect(a.inv.some((it) => it.weapon === WeaponId.Sticky)).toBe(false);
    expect(world.charges.length).toBe(1);
    const c = world.charges[0];
    for (let k = 0; k < 30 && !c.stuck; k++) world.step();
    expect(c.stuck).toBe(true);
    expect(c.onPlayer).toBe(v.id);
    // (It goes where they go.)
    v.body.x += 6;
    world.step();
    expect(Math.abs(c.x - v.cx)).toBeLessThan(ACTOR_W);
    for (let k = 0; k < STICKY_FUSE - 8; k++) world.step();
    expect(world.charges.length).toBe(1);
    expect(v.alive).toBe(true);
    for (let k = 0; k < 12; k++) world.step();
    expect(world.charges.length).toBe(0);
    expect(v.alive).toBe(false);
    expect(by.alive).toBe(true);
    expect(by.hp).toBeGreaterThan(60);
  });

  it('stuck to a vehicle, it guts it: nearly half its hull at a stroke', () => {
    const { world, ps, place } = range(1);
    place(ps[0], 300);
    const k = newTank(2000, FLOOR - 24);
    k.chute = false;
    world.tanks[0] = k;
    const hp0 = k.hp;
    stuck(world, k.x + 10, k.y + 8, ps[0].id, { onTank: 0 });
    for (let n = 0; n < 6; n++) world.step();
    const lost = hp0 - (world.tanks[0]?.hp ?? 0);
    expect(lost).toBeGreaterThan(tankMaxHp(k) * STICKY_ON_VEHICLE);
  });

  it('stuck to a creature, it tears it apart', () => {
    const { world, ps, place } = range(1);
    place(ps[0], 300);
    const m = newMillipede(world.terrain, 2000, FLOOR - 1, 1);
    m.frozen = 1e9;
    world.beasts[0] = m;
    bodyPoints(world.terrain, m, world.beastPts[0]);
    stuck(world, world.beastPts[0][0], world.beastPts[0][1], ps[0].id, { onBeast: 0 });
    for (let n = 0; n < 6; n++) world.step();
    expect(world.beasts[0]).toBeNull();
    expect(ps[0].beastKills).toBe(1);
  });

  it('a common pick: in about two kits in five, never more than the inventory holds', () => {
    let n = 0;
    const N = 2000;
    for (let s = 1; s <= N; s++) {
      const inv = spawnLoadout(new Rng(s * 7919));
      expect(inv.length).toBeLessThanOrEqual(INV_MAX);
      if (inv.some((it) => it.weapon === WeaponId.Sticky)) n++;
    }
    // (Dealt STICKY_ODDS of the time; a kit already full has no room for it.)
    expect(n / N).toBeGreaterThan(0.33);
    expect(n / N).toBeLessThan(STICKY_ODDS);
  });

  it('every client sees it stuck there, counting down, then gone', () => {
    const { world, ps, frames, place } = range(1);
    place(ps[0], 1000);
    const game = new Game();
    const pump = () => {
      for (const f of frames.splice(0)) {
        const r = new Reader(f);
        r.u8();
        const tick = r.u32();
        const ack = r.u16();
        game.applyFrame(tick, ack, r);
      }
    };
    world.charges.push({ x: 1060, y: FLOOR - 1, vx: 0, vy: 0, stuck: true, fuse: STICKY_FUSE, owner: ps[0].id, onPlayer: 255, onTank: -1, onBeast: -1, ox: 0, oy: 0, age: 0 } as never);
    world.chargesRev++;
    world.step();
    pump();
    expect(game.chargeList.length).toBe(1);
    expect(game.chargeList[0].stuck).toBe(true);
    expect(Math.abs(game.chargeList[0].x - 1060)).toBeLessThan(2);
    for (let k = 0; k < STICKY_FUSE + 4; k++) world.step();
    pump();
    expect(game.chargeList.length).toBe(0);
  });
});
