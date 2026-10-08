import { describe, expect, it } from 'vitest';
import { BTN_SCOPE } from '../src/shared/actor.ts';
import { ClassId, Part, has, newBodyState, newStrike, strike } from '../src/shared/body.ts';
import { WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { sightLine } from '../src/shared/scope.ts';
import { PROJ, ProjKind, WEAPONS, WeaponId } from '../src/shared/weapons.ts';
import { World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

/** A flat arena with a wall `gap` cells in front of a clone. */
function arena(gap: number) {
  const world = new World(41);
  const t = world.terrain;
  for (let x = 0; x < WORLD_W; x++) {
    for (let y = 0; y < 400; y++) if (t.get(x, y) !== Mat.Air) t.set(x, y, Mat.Air);
    for (let y = 400; y < 420; y++) t.set(x, y, Mat.Bedrock);
  }
  const p = world.addPlayer('sniper', { send() {} })!;
  deliverAll(world, [p]);
  for (let k = 0; k < 60; k++) world.step();
  const wx = Math.floor(p.cx) + gap;
  for (let y = 300; y < 400; y++) for (let x = wx; x < wx + 6; x++) t.set(x, y, Mat.Concrete);
  world.terrainReplaced();
  return { world, p, wx };
}

describe('scope line of sight', () => {
  it('a sight line stops at the first solid cell', () => {
    const t = { isSolid: (x: number) => x >= 150 };
    expect(sightLine(t, 100, 50, 0, 600)).toBe(50);
    expect(sightLine(t, 100, 50, Math.PI, 600)).toBe(600);
  });

  it('scoping a sniper at a wall: the view (and what the server sends) stops at the wall', () => {
    const { world, p, wx } = arena(40);
    let seq = 0;
    for (let k = 0; k < 3; k++) {
      world.input(p.id, { seq: ++seq, buttons: BTN_SCOPE, aim: quantizeAim(0), inv: world.equip(p, WeaponId.Sniper) });
      world.step();
    }
    expect(WEAPONS[WeaponId.Sniper].scope).toBeGreaterThan(400);
    expect(p.camX).toBeLessThanOrEqual(wx + 1);
    expect(p.camX).toBeGreaterThan(wx - 10);
    // Turned away from the wall, the full scope reach.
    world.input(p.id, { seq: ++seq, buttons: BTN_SCOPE, aim: quantizeAim(Math.PI), inv: world.equip(p, WeaponId.Sniper) });
    world.step();
    expect(p.cx - p.camX).toBeGreaterThan(WEAPONS[WeaponId.Sniper].scope - 10);
  });
});

describe('sniper slug', () => {
  const slug = PROJ[ProjKind.Slug];
  const energy = slug.mass * slug.sharp * WEAPONS[WeaponId.Sniper].speed;
  const hit = (cls: number, part: number) => {
    const s = newBodyState(cls);
    const out = newStrike();
    strike(s, part, energy, slug.damage, out);
    return { s, out };
  };

  it('one round through the body kills a scout or a medium outright', () => {
    for (const cls of [ClassId.Scout, ClassId.Medium]) expect(hit(cls, Part.Torso).out.vital).toBe(true);
  });

  it('a headshot kills anyone, a heavy in his helmet included', () => {
    for (const cls of [ClassId.Scout, ClassId.Medium, ClassId.Heavy]) expect(hit(cls, Part.Head).out.vital).toBe(true);
  });

  it('a heavy survives one in the chest, badly hurt; limbs come off', () => {
    const { out } = hit(ClassId.Heavy, Part.Torso);
    expect(out.vital).toBe(false);
    expect(out.hp).toBeGreaterThan(60);
    expect(has(hit(ClassId.Medium, Part.GunArm).s.mask, Part.GunArm)).toBe(false);
  });

  it('knocks whoever it hits hard back', () => {
    expect((slug.mass * (slug.knock ?? 1) * WEAPONS[WeaponId.Sniper].speed) / 8).toBeGreaterThan(450);
  });
});
