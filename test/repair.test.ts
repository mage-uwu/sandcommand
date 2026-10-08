import { describe, expect, it } from 'vitest';
import { BTN_FIRE } from '../src/shared/actor.ts';
import { ACTOR_MAX_HP, ACTOR_W, WORLD_W } from '../src/shared/constants.ts';
import { Part, has } from '../src/shared/body.ts';
import { Mat } from '../src/shared/materials.ts';
import { Team, quantizeAim } from '../src/shared/protocol.ts';
import { PROJ, ProjKind, REGROW_TICKS, REPAIR_REACH, WEAPONS, WeaponId } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

/** A flat arena with two clones standing on it, `a` facing `b` from 16 cells away. */
function arena() {
  const world = new World(31);
  const t = world.terrain;
  for (let x = 0; x < WORLD_W; x++) {
    for (let y = 0; y < 400; y++) if (t.get(x, y) !== Mat.Air) t.set(x, y, Mat.Air);
    for (let y = 400; y < 420; y++) t.set(x, y, Mat.Bedrock);
  }
  world.terrainReplaced();
  const a = world.addPlayer('medic', { send() {} })!;
  const b = world.addPlayer('patient', { send() {} })!;
  deliverAll(world, [a, b]);
  for (let k = 0; k < 60; k++) world.step();
  b.body.x = a.body.x + 16;
  b.body.y = a.body.y;
  b.body.vx = a.body.vx = 0;
  return { world, a, b };
}

let seq = 0;
function hold(world: World, p: Player, buttons: number, weapon: number, ticks: number, aim = 0): void {
  for (let k = 0; k < ticks; k++) {
    world.input(p.id, { seq: ++seq & 0xffff, buttons, aim: quantizeAim(aim), inv: world.equip(p, weapon) });
    world.step();
  }
}
const ammo = (p: Player) => p.inv.find((it) => it.weapon === WeaponId.RepairKit)!.ammo;

describe('repair kit', () => {
  it('every clone carries one', () => {
    const { a } = arena();
    expect(a.inv.some((it) => it.weapon === WeaponId.RepairKit)).toBe(true);
    expect(WEAPONS[WeaponId.RepairKit].name).toBe('Repair Kit');
  });

  it('sprayed with nobody in front, it heals its holder and closes their wounds', () => {
    const { world, a } = arena();
    a.hp = 30;
    a.parts.wounds[Part.Torso] = 20;
    hold(world, a, BTN_FIRE, WeaponId.RepairKit, 20, Math.PI); // facing away from b
    expect(a.hp).toBeGreaterThan(50);
    expect(a.parts.wounds[Part.Torso]).toBeLessThan(10);
    hold(world, a, BTN_FIRE, WeaponId.RepairKit, 60, Math.PI);
    expect(a.hp).toBe(ACTOR_MAX_HP);
    expect(a.parts.wounds[Part.Torso]).toBe(0);
  });

  it('regrows lost limbs, one at a time, even a lost gun arm', () => {
    const { world, a } = arena();
    a.parts.mask &= ~((1 << Part.GunArm) | (1 << Part.LegF));
    a.mob.canFire = false;
    a.mob.legs = 1;
    hold(world, a, BTN_FIRE, WeaponId.RepairKit, REGROW_TICKS + 2, Math.PI);
    expect(has(a.parts.mask, Part.GunArm)).toBe(true); // the gun arm first
    expect(has(a.parts.mask, Part.LegF)).toBe(false);
    expect(a.mob.canFire).toBe(true);
    hold(world, a, BTN_FIRE, WeaponId.RepairKit, REGROW_TICKS + 2, Math.PI);
    expect(has(a.parts.mask, Part.LegF)).toBe(true);
    expect(a.mob.legs).toBe(2);
    expect(a.body.legs).toBe(2);
  });

  it('heals a teammate it is aimed at (in reach), never an enemy', () => {
    const { world, a, b } = arena();
    expect(b.cx - a.cx).toBeLessThan(REPAIR_REACH);
    a.team = b.team = Team.Red;
    a.hp = b.hp = 40;
    hold(world, a, BTN_FIRE, WeaponId.RepairKit, 15, 0);
    expect(b.hp).toBeGreaterThan(55);
    expect(a.hp).toBeLessThan(45); // (a tick at most, before the grid sees the teleported patient)
    // On an enemy, the nanobots stay home.
    b.team = Team.Green;
    const hp = b.hp;
    hold(world, a, BTN_FIRE, WeaponId.RepairKit, 15, 0);
    expect(b.hp).toBe(hp);
    expect(a.hp).toBeGreaterThan(55);
    void ACTOR_W;
  });

  it('a canister runs dry and brews more', () => {
    const { world, a } = arena();
    const clip = WEAPONS[WeaponId.RepairKit].clip;
    hold(world, a, BTN_FIRE, WeaponId.RepairKit, clip + 2, Math.PI);
    expect(ammo(a)).toBe(0);
    hold(world, a, 0, WeaponId.RepairKit, WEAPONS[WeaponId.RepairKit].reload + 2, Math.PI);
    expect(ammo(a)).toBe(clip);
  });
});

describe('sniper', () => {
  it('slugs are near instant: across the map in a handful of ticks', () => {
    const { world, a } = arena();
    a.body.y = 380 - 14;
    hold(world, a, BTN_FIRE, WeaponId.Sniper, 1, 0);
    const pr = world.projectiles;
    const i = Array.from(pr.kind.subarray(0, pr.n)).indexOf(ProjKind.Slug);
    expect(i).toBeGreaterThanOrEqual(0);
    const id = pr.id[i];
    const x0 = pr.x[i];
    world.step();
    const j = pr.indexOf(id);
    expect(j < 0 || pr.x[j] - x0 > 600).toBe(true);
    // Its punch (energy = mass x speed) is what it always was.
    expect(PROJ[ProjKind.Slug].mass * WEAPONS[WeaponId.Sniper].speed).toBeCloseTo(1.1 * 1500);
    expect(Math.ceil(WORLD_W / (WEAPONS[WeaponId.Sniper].speed / 30))).toBeLessThanOrEqual(6);
  });
});
