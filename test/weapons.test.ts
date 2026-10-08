import { describe, expect, it } from 'vitest';
import { BTN_FIRE, BTN_RELOAD, BTN_SCOPE } from '../src/shared/actor.ts';
import { Reader } from '../src/shared/codec.ts';
import { TICK_RATE, WORLD_W } from '../src/shared/constants.ts';
import { Part } from '../src/shared/body.ts';
import { Mat } from '../src/shared/materials.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { PROJ, SHOULDER_X, SHOULDER_Y, WEAPONS, WeaponId, fireInterval, weaponOfProj } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

/** A flat arena with one clone standing on it, ready to shoot. */
function range(link: { send(d: Uint8Array): void } = { send() {} }): { world: World; p: Player; shots: { x: number; y: number; kind: number }[] } {
  const world = new World(21);
  const t = world.terrain;
  for (let x = 0; x < WORLD_W; x++) {
    for (let y = 0; y < 400; y++) if (t.get(x, y) !== Mat.Air) t.set(x, y, Mat.Air);
    for (let y = 400; y < 420; y++) t.set(x, y, Mat.Bedrock);
  }
  world.terrainReplaced();
  const p = world.addPlayer('gunner', link)!;
  deliverAll(world, [p]);
  for (let k = 0; k < 60; k++) world.step(); // let the rocket leave and the clone settle
  // Record every shot the server fires (where it left the gun, and what).
  const shots: { x: number; y: number; kind: number }[] = [];
  const pr = world.projectiles;
  const spawn = pr.spawn.bind(pr);
  pr.spawn = (id, kind, owner, x, y, vx, vy) => {
    if (owner === p.id) shots.push({ x, y, kind });
    return spawn(id, kind, owner, x, y, vx, vy);
  };
  return { world, p, shots };
}

let seq = 0;
const ammoOf = (p: Player, weapon: number) => p.inv.find((it) => it.weapon === weapon)!.ammo;
function hold(world: World, p: Player, buttons: number, weapon: number, ticks: number, aim = 0): void {
  for (let k = 0; k < ticks; k++) {
    world.input(p.id, { seq: ++seq & 0xffff, buttons, aim: quantizeAim(aim), inv: world.equip(p, weapon) });
    world.step();
  }
}

describe('weapon table', () => {
  it('every weapon has a complete, sane row', () => {
    for (const w of WEAPONS) {
      expect(w.muzzle).toBeGreaterThan(0);
      expect(w.rpm).toBeGreaterThan(0);
      expect(w.scope).toBeGreaterThan(0);
      expect(w.clip).toBeGreaterThanOrEqual(0);
      if (w.clip > 0) expect(w.reload).toBeGreaterThan(0);
      if (w.proj >= 0) expect(PROJ[w.proj]).toBeTruthy();
    }
    expect(weaponOfProj(WEAPONS[WeaponId.Sniper].proj)?.name).toBe('Sniper');
  });
});

describe('firing', () => {
  it('rate of fire: a held rifle fires at its rpm', () => {
    const { world, p, shots } = range();
    const rifle = WEAPONS[WeaponId.Rifle];
    hold(world, p, BTN_FIRE, WeaponId.Rifle, 2 * TICK_RATE);
    const expected = (rifle.rpm / 60) * 2;
    expect(shots.length).toBeGreaterThanOrEqual(expected - 1);
    expect(shots.length).toBeLessThanOrEqual(expected + 1);
  });

  it('a fractional interval averages out exactly (no rounding up to whole ticks)', () => {
    const { world, p, shots } = range();
    const rifle = WEAPONS[WeaponId.Rifle] as { rpm: number };
    const rpm = rifle.rpm;
    rifle.rpm = 500; // 3.6 ticks between shots
    try {
      hold(world, p, BTN_FIRE, WeaponId.Rifle, 3 * TICK_RATE);
    } finally {
      rifle.rpm = rpm;
    }
    // 500 rpm for 3 s is 25 shots; rounding the interval up to 4 ticks would give 23.
    expect(shots.length).toBeGreaterThanOrEqual(25);
    expect(shots.length).toBeLessThanOrEqual(26);
  });

  it('semi-auto weapons fire once per press; holding does nothing more', () => {
    const { world, p, shots } = range();
    hold(world, p, BTN_FIRE, WeaponId.Sniper, 3 * TICK_RATE);
    expect(shots.length).toBe(1);
    // Pressing again after the bolt cycles fires again.
    hold(world, p, 0, WeaponId.Sniper, 1);
    hold(world, p, BTN_FIRE, WeaponId.Sniper, 1);
    expect(shots.length).toBe(2);
    expect(shots[1].kind).toBe(WEAPONS[WeaponId.Sniper].proj);
  });

  it('shots leave from the muzzle offset, never through a wall in front of it', () => {
    const { world, p, shots } = range();
    const rifle = WEAPONS[WeaponId.Rifle];
    hold(world, p, BTN_FIRE, WeaponId.Rifle, 1);
    const sx = p.body.x + SHOULDER_X;
    const sy = p.body.y + SHOULDER_Y;
    expect(shots[0].x).toBeCloseTo(sx + rifle.muzzle, 0);
    expect(shots[0].y).toBeCloseTo(sy, 0);
    // A one-cell wall closer than the muzzle: the shot starts at the wall.
    const wx = Math.floor(sx + 6);
    for (let y = 300; y < 400; y++) world.terrain.set(wx, y, Mat.Rock);
    hold(world, p, 0, WeaponId.Rifle, 10);
    hold(world, p, BTN_FIRE, WeaponId.Rifle, 1);
    const last = shots[shots.length - 1];
    expect(last.x).toBeLessThanOrEqual(wx + 1);
  });
});

describe('digger', () => {
  it('digs a wall you are pressed against (it bites at the first solid cell along the aim)', () => {
    const { world, p } = range();
    const wx = Math.floor(p.body.x) + 9; // right against the clone's right side
    for (let y = 300; y < 400; y++) for (let x = wx; x < wx + 3; x++) world.terrain.set(x, y, Mat.Concrete);
    hold(world, p, 0, WeaponId.Digger, 2);
    let left = 0;
    const count = () => {
      left = 0;
      for (let y = Math.floor(p.body.y); y < p.body.y + 14; y++) for (let x = wx; x < wx + 3; x++) if (world.terrain.isSolid(x, y)) left++;
      return left;
    };
    const before = count();
    for (const aim of [-0.5, -0.25, 0, 0.25, 0.5, 0.7]) hold(world, p, BTN_FIRE, WeaponId.Digger, 8, aim);
    expect(count()).toBeLessThan(before / 3);
  });
});

describe('magazines and reloading', () => {
  it('a clip empties, the weapon reloads for its reload time, then fires again', () => {
    const { world, p, shots } = range();
    const rifle = WEAPONS[WeaponId.Rifle];
    let emptiedAt = -1;
    let resumedAt = -1;
    for (let t = 0; t < 400 && resumedAt < 0; t++) {
      const before = shots.length;
      hold(world, p, BTN_FIRE, WeaponId.Rifle, 1);
      if (shots.length === rifle.clip && emptiedAt < 0) {
        emptiedAt = t;
        expect(ammoOf(p, WeaponId.Rifle)).toBe(0);
        expect(p.reloadLeft).toBeGreaterThan(0);
      }
      if (emptiedAt >= 0 && shots.length > before && shots.length > rifle.clip) resumedAt = t;
    }
    expect(emptiedAt).toBeGreaterThan(0);
    expect(resumedAt - emptiedAt).toBeGreaterThanOrEqual(rifle.reload);
    expect(resumedAt - emptiedAt).toBeLessThanOrEqual(rifle.reload + Math.ceil(fireInterval(rifle)) + 1);
  });

  it('R reloads early; switching weapons cancels it and keeps each magazine', () => {
    const { world, p } = range();
    const rifle = WEAPONS[WeaponId.Rifle];
    hold(world, p, BTN_FIRE, WeaponId.Rifle, 20);
    const left = ammoOf(p, WeaponId.Rifle);
    expect(left).toBeLessThan(rifle.clip);
    hold(world, p, BTN_RELOAD, WeaponId.Rifle, 1);
    expect(p.reloadLeft).toBeGreaterThan(0);
    // Switch away mid-reload: cancelled, the rifle keeps what it had.
    hold(world, p, 0, WeaponId.Sniper, 1);
    expect(p.reloadLeft).toBe(0);
    expect(ammoOf(p, WeaponId.Rifle)).toBe(left);
    // Back to the rifle and let the reload finish this time.
    hold(world, p, BTN_RELOAD, WeaponId.Rifle, 1);
    hold(world, p, 0, WeaponId.Rifle, rifle.reload + 1);
    expect(ammoOf(p, WeaponId.Rifle)).toBe(rifle.clip);
  });

  it('a clone missing its off arm fires and reloads slower', () => {
    const { world, p, shots } = range();
    p.parts.mask &= ~(1 << Part.OffArm);
    p.mob.oneHanded = true;
    hold(world, p, BTN_FIRE, WeaponId.Rifle, 2 * TICK_RATE);
    expect(shots.length).toBeLessThan((WEAPONS[WeaponId.Rifle].rpm / 60) * 2 * 0.7);
  });

  it("the client's HUD state (ammo, reload) arrives in its own record", () => {
    const frames: Uint8Array[] = [];
    const { world, p } = range({ send: (d) => frames.push(d) });
    const game = new Game();
    game.myId = p.id;
    hold(world, p, BTN_FIRE, WeaponId.Sniper, 1);
    hold(world, p, BTN_RELOAD, WeaponId.Sniper, 1);
    const last = frames[frames.length - 1];
    const r = new Reader(last);
    r.u8();
    const tick = r.u32();
    const ack = r.u16();
    game.applyFrame(tick, ack, r);
    expect(game.ammo).toBe(WEAPONS[WeaponId.Sniper].clip - 1);
    expect(game.reloadLeft).toBeGreaterThan(0);
  });
});

describe('scope', () => {
  it("scoping pushes the client's view (and interest area) out along the barrel by the scope distance", () => {
    const { world, p } = range();
    hold(world, p, 0, WeaponId.Sniper, 1, 0);
    const cx = p.camX;
    hold(world, p, BTN_SCOPE, WeaponId.Sniper, 1, 0);
    expect(p.camX - cx).toBeCloseTo(WEAPONS[WeaponId.Sniper].scope, 0);
    hold(world, p, BTN_SCOPE, WeaponId.Rifle, 1, Math.PI / 2);
    expect(p.camY - p.cy).toBeCloseTo(WEAPONS[WeaponId.Rifle].scope, 0);
  });
});
