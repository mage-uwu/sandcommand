import { describe, expect, it } from 'vitest';
import { BTN_FIRE, BTN_LOCK } from '../src/shared/actor.ts';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { ACTOR_H, ACTOR_W, WORLD_W } from '../src/shared/constants.ts';
import { spawnLoadout, PRIMARIES, INV_MAX } from '../src/shared/items.ts';
import { Mat } from '../src/shared/materials.ts';
import { Team, quantizeAim } from '../src/shared/protocol.ts';
import { Rng } from '../src/shared/rng.ts';
import { PROJ, ProjKind, PROJ_MINE, WEAPONS, WeaponId, projName } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 400;

/** A flat, open yard and two clones standing on it, `gap` cells apart (both mediums, full health). */
function yard(seed: number, gap = 120) {
  const world = new World(seed);
  const a = world.addPlayer('a', { send() {} })!;
  const b = world.addPlayer('b', { send() {} })!;
  deliverAll(world, [a, b]);
  const t = world.terrain;
  for (let x = 0; x < WORLD_W; x++) for (let y = 0; y < FLOOR + 60; y++) t.set(x, y, y >= FLOOR ? Mat.Bedrock : Mat.Air);
  world.terrainReplaced();
  for (const [p, x] of [
    [a, 1000],
    [b, 1000 + gap],
  ] as const) {
    resetBody(p.parts, ClassId.Medium, 0);
    p.hp = 100;
    p.body.x = x;
    p.body.y = FLOOR - ACTOR_H;
    p.body.vx = p.body.vy = 0;
    p.body.onGround = true;
  }
  // Face each other (a shot from a meets b's front, not its jetpack).
  a.aimQ = quantizeAim(0);
  b.aimQ = quantizeAim(Math.PI);
  world.step();
  return { world, a, b };
}

/** Fire one projectile of `kind` (owned by `a`) level at `b`'s chest from just short of it; step until it's gone. */
function shoot(world: World, a: Player, b: Player, kind: number, speed: number): void {
  const id = 90000 + Math.floor(Math.random() * 1000);
  const y = b.body.y + 7.3; // the chest, under the arm
  world.projectiles.spawn(id, kind, a.id, b.body.x - 16, y, speed, 0);
  for (let k = 0; k < 60 && world.projectiles.indexOf(id) >= 0; k++) world.step();
}

describe('new weapons', () => {
  it('are all in the table, named and fired as asked', () => {
    const lr = WEAPONS[WeaponId.LightRifle];
    expect(lr.name).toBe('Light Rifle');
    expect(lr.auto).toBe(false); // semi-automatic
    expect(lr.clip).toBe(7);
    const rifle = WEAPONS[WeaponId.Rifle];
    expect(PROJ[lr.proj].damage).toBeGreaterThan(PROJ[rifle.proj].damage);
    expect(lr.speed).toBeGreaterThan(rifle.speed);
    expect(lr.rpm).toBeGreaterThan(rifle.rpm);
    expect(lr.spread).toBeLessThan(rifle.spread);

    const smg = WEAPONS[WeaponId.Smg];
    expect(smg.auto).toBe(true);
    expect(smg.rpm).toBeGreaterThan(rifle.rpm);
    expect(PROJ[smg.proj].damage).toBeLessThan(PROJ[rifle.proj].damage);
    expect(PROJ[smg.proj].life).toBeLessThan(PROJ[rifle.proj].life); // a close-quarters gun

    const ac = WEAPONS[WeaponId.Autocannon];
    expect(ac.speed).toBeLessThan(500); // low velocity
    expect(PROJ[ac.proj].splashR).toBe(0); // it doesn't explode
    expect(PROJ[ac.proj].shatter).toBeGreaterThan(0);

    const bl = WEAPONS[WeaponId.Blaster];
    expect(bl.auto).toBe(true);
    expect(bl.rpm).toBeGreaterThanOrEqual(600);
    expect(PROJ[bl.proj].gravity).toBe(0);

    expect(WEAPONS[WeaponId.Mine].proj).toBe(PROJ_MINE);
    expect(projName(ProjKind.Landmine)).toBe('Mine');
    expect(projName(ProjKind.AutoShell)).toBe('Autocannon');
  });

  it('a light-rifle round hits harder than a rifle round, an SMG round softer', () => {
    const loss = (kind: number, speed: number) => {
      const { world, a, b } = yard(201);
      shoot(world, a, b, kind, speed);
      return 100 - b.hp;
    };
    const rifle = loss(ProjKind.Bullet, WEAPONS[WeaponId.Rifle].speed);
    const light = loss(ProjKind.LightRound, WEAPONS[WeaponId.LightRifle].speed);
    const smg = loss(ProjKind.SmgRound, 300); // (up close: its round doesn't carry)
    expect(rifle).toBeGreaterThan(0);
    expect(light).toBeGreaterThan(rifle * 1.3);
    expect(smg).toBeGreaterThan(0);
    expect(smg).toBeLessThan(rifle);
  });

  it('one autocannon shell takes a clone apart', () => {
    const { world, a, b } = yard(202);
    shoot(world, a, b, ProjKind.AutoShell, WEAPONS[WeaponId.Autocannon].speed);
    const limbs = [2, 3, 4, 5].filter((p) => !(b.parts.mask & (1 << p))).length;
    expect(!b.alive || limbs >= 1).toBe(true);
  });

  it('blaster bolts fly dead straight and hurt', () => {
    const { world, a, b } = yard(203, 300);
    shoot(world, a, b, ProjKind.Bolt, WEAPONS[WeaponId.Blaster].speed);
    expect(b.hp).toBeLessThan(100);
  });

  it('they turn up in clones\' kits (and the kit still fits)', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let k = 0; k < 400; k++) {
      const inv = spawnLoadout(rng);
      expect(inv.length).toBeLessThanOrEqual(INV_MAX);
      for (const it of inv) seen.add(it.weapon);
    }
    for (const w of [WeaponId.LightRifle, WeaponId.Smg, WeaponId.Autocannon, WeaponId.Blaster, WeaponId.Mine]) expect(seen.has(w)).toBe(true);
    expect(PRIMARIES).toContain(WeaponId.Autocannon);
  });
});

/** `a` lays a mine (facing right) and steps it past arming. */
function layOne(world: World, a: Player): void {
  world.equip(a, WeaponId.Mine);
  a.aimQ = quantizeAim(0);
  for (let k = 0; k < 15; k++) world.step();
  a.buttons = BTN_FIRE;
  world.step();
  a.buttons = 0;
  for (let k = 0; k < 50; k++) world.step();
}

describe('landmines', () => {
  it('are laid on the ground in front of the clone, and arm after a moment', () => {
    const { world, a } = yard(211);
    world.equip(a, WeaponId.Mine);
    a.aimQ = quantizeAim(0);
    for (let k = 0; k < 15; k++) world.step();
    a.buttons = BTN_FIRE;
    world.step();
    a.buttons = 0;
    expect(world.mines.length).toBe(1);
    const m = world.mines[0];
    expect(m.owner).toBe(a.id);
    expect(m.x).toBeGreaterThan(a.cx);
    expect(m.y).toBe(FLOOR);
    expect(m.arm).toBeGreaterThan(0);
    expect(a.inv[a.slot].ammo).toBe(WEAPONS[WeaponId.Mine].clip - 1);
    for (let k = 0; k < 50; k++) world.step();
    expect(m.arm).toBe(0);
  });

  it('go off under an enemy, and hurt', () => {
    const { world, a, b } = yard(212, 300);
    layOne(world, a);
    const m = world.mines[0];
    b.body.x = m.x - ACTOR_W / 2;
    for (let k = 0; k < 6; k++) world.step();
    expect(world.mines.length).toBe(0);
    expect(b.hp).toBeLessThan(100);
  });

  it("never go off under the clone that laid them, or its side", () => {
    const { world, a, b } = yard(213, 300);
    a.team = b.team = Team.Red;
    layOne(world, a);
    const m = world.mines[0];
    a.body.x = m.x - ACTOR_W / 2;
    for (let k = 0; k < 6; k++) world.step();
    b.body.x = m.x - ACTOR_W / 2;
    a.body.x = 900;
    for (let k = 0; k < 6; k++) world.step();
    expect(world.mines.length).toBe(1);
    expect(b.hp).toBe(100);
  });

  it('need ground to sit on', () => {
    const { world, a } = yard(214);
    a.body.y = FLOOR - 200;
    a.body.onGround = false;
    world.equip(a, WeaponId.Mine);
    world.step();
    a.body.y = FLOOR - 200;
    a.body.vy = 0;
    expect(world.layMine(a)).toBe(false);
  });
});

describe('locked-on fire', () => {
  /** Hold the rifle's trigger for a second and a half, level; the worst angle (off the aim line) of the rounds it fires. */
  const worst = (lock: boolean) => {
    const { world, a } = yard(221, 600);
    world.equip(a, WeaponId.Rifle);
    a.aimQ = quantizeAim(0);
    for (let k = 0; k < 15; k++) world.step();
    const pr = world.projectiles;
    const seen = new Set<number>();
    let off = 0;
    for (let k = 0; k < 45; k++) {
      a.buttons = BTN_FIRE | (lock ? BTN_LOCK : 0);
      world.step();
      for (let i = 0; i < pr.n; i++) {
        if (pr.kind[i] !== ProjKind.Bullet || pr.owner[i] !== a.id || seen.has(pr.id[i])) continue;
        seen.add(pr.id[i]);
        off = Math.max(off, Math.abs(Math.atan2(pr.vy[i], pr.vx[i] - a.body.vx * 0.25)));
      }
    }
    expect(seen.size).toBeGreaterThan(8);
    return off;
  };
  it('goes down the sight line: no recoil climb, braced spread', () => {
    const spread = WEAPONS[WeaponId.Rifle].spread;
    expect(worst(true)).toBeLessThan(spread * 0.5 + 0.02);
    expect(worst(false)).toBeGreaterThan(spread + 0.025); // (unlocked, the muzzle climbs)
  });
});

