import { describe, expect, it } from 'vitest';
import { BTN_FIRE } from '../src/shared/actor.ts';
import { ACTOR_MAX_HP, ACTOR_W, WORLD_W } from '../src/shared/constants.ts';
import { Part, has } from '../src/shared/body.ts';
import { Mat } from '../src/shared/materials.ts';
import { Team, quantizeAim } from '../src/shared/protocol.ts';
import { HEAL_R, MEND_TICKS, PROJ, ProjKind, REGROW_TICKS, WEAPONS, WeaponId } from '../src/shared/weapons.ts';
import { invByte } from '../src/shared/items.ts';
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
/** Use the repair kit once (a press), then let `ticks` go by with the trigger released. */
function useKit(world: World, p: Player, ticks: number): void {
  const inv = world.equip(p, WeaponId.RepairKit);
  world.input(p.id, { seq: ++seq & 0xffff, buttons: BTN_FIRE, aim: quantizeAim(0), inv });
  world.step();
  for (let k = 0; k < ticks; k++) {
    world.input(p.id, { seq: ++seq & 0xffff, buttons: 0, aim: quantizeAim(0), inv: invByte(p.slot, p.invVersion) });
    world.step();
  }
}
const kits = (p: Player) => p.inv.filter((it) => it.weapon === WeaponId.RepairKit).length;

describe('repair kit', () => {
  it('every clone carries one; it\'s used once, and gone', () => {
    const { world, a } = arena();
    expect(kits(a)).toBe(1);
    expect(WEAPONS[WeaponId.RepairKit].name).toBe('Repair Kit');
    useKit(world, a, 2);
    expect(kits(a)).toBe(0);
    expect(a.inv.length).toBeGreaterThan(0);
    expect(a.slot).toBeLessThan(a.inv.length);
  });

  it('its health wave mends its user over the next few seconds: health, wounds', () => {
    const { world, a } = arena();
    a.hp = 30;
    a.parts.wounds[Part.Torso] = 20;
    useKit(world, a, 20);
    expect(a.hp).toBeGreaterThan(45);
    expect(a.parts.wounds[Part.Torso]).toBeLessThan(10);
    for (let k = 0; k < MEND_TICKS; k++) world.step();
    expect(a.hp).toBe(ACTOR_MAX_HP);
    expect(a.parts.wounds[Part.Torso]).toBe(0);
    expect(a.mend).toBe(0);
  });

  it('regrows lost limbs, one at a time, even a lost gun arm', () => {
    const { world, a } = arena();
    a.parts.mask &= ~((1 << Part.GunArm) | (1 << Part.LegF));
    a.mob.canFire = false;
    a.mob.legs = 1;
    useKit(world, a, REGROW_TICKS + 2);
    expect(has(a.parts.mask, Part.GunArm)).toBe(true); // the gun arm first
    expect(has(a.parts.mask, Part.LegF)).toBe(false);
    expect(a.mob.canFire).toBe(true);
    for (let k = 0; k < REGROW_TICKS + 2; k++) world.step();
    expect(has(a.parts.mask, Part.LegF)).toBe(true);
    expect(a.mob.legs).toBe(2);
    expect(a.body.legs).toBe(2);
  });

  it('the wave catches teammates around the user (out to its reach), never an enemy', () => {
    const { world, a, b } = arena();
    const c = world.addPlayer('far', { send() {} })!;
    const e = world.addPlayer('enemy', { send() {} })!;
    deliverAll(world, [c, e]);
    for (let k = 0; k < 30; k++) world.step();
    a.team = b.team = c.team = Team.Red;
    e.team = Team.Green;
    for (const [p, dx] of [
      [b, HEAL_R - 20],
      [c, HEAL_R + 60],
      [e, -30],
    ] as const) {
      p.body.x = a.body.x + dx;
      p.body.y = a.body.y;
      p.body.vx = p.body.vy = 0;
    }
    for (const p of [a, b, c, e]) p.hp = 40;
    useKit(world, a, 40);
    expect(a.hp).toBeGreaterThan(70);
    expect(b.hp).toBeGreaterThan(70);
    expect(c.hp).toBe(40); // (out of its reach)
    expect(e.hp).toBe(40);
    void ACTOR_W;
  });

  it('without teams, it mends only its user', () => {
    const { world, a, b } = arena();
    a.hp = b.hp = 40;
    useKit(world, a, 30);
    expect(a.hp).toBeGreaterThan(70);
    expect(b.hp).toBe(40);
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
