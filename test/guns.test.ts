import { describe, expect, it } from 'vitest';
import { BTN_FIRE } from '../src/shared/actor.ts';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { ACTOR_H, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { LASER_MAX, PROJ, ProjKind, WEAPONS, WeaponId, laserWound } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

/** A flat arena: a shooter, and `n` targets in a row in front of it, `gap` cells apart, starting `first` cells off. */
function arena(n = 0, first = 40, gap = 16) {
  const world = new World(77);
  const t = world.terrain;
  for (let x = 0; x < WORLD_W; x++) {
    for (let y = 0; y < 400; y++) if (t.get(x, y) !== Mat.Air) t.set(x, y, Mat.Air);
    for (let y = 400; y < 420; y++) t.set(x, y, Mat.Bedrock);
  }
  world.terrainReplaced();
  const p = world.addPlayer('shooter', { send() {} })!;
  const targets: Player[] = [];
  for (let k = 0; k < n; k++) targets.push(world.addPlayer(`t${k}`, { send() {} })!);
  deliverAll(world, [p, ...targets]);
  for (let k = 0; k < 40; k++) world.step();
  p.body.x = 1000;
  p.body.y = 400 - ACTOR_H;
  for (const [k, o] of targets.entries()) {
    o.body.x = 1000 + first + k * gap;
    o.body.y = 400 - ACTOR_H;
    o.body.vx = o.body.vy = 0;
    resetBody(o.parts, ClassId.Medium, 0);
    o.hp = 100;
  }
  world.step(); // (so the server's spatial grid has everyone where they now stand)
  for (const o of targets) o.hp = 100;
  return { world, p, targets };
}
let seq = 0;
function hold(world: World, p: Player, buttons: number, weapon: number, ticks: number, aim = 0): void {
  for (let k = 0; k < ticks; k++) {
    world.input(p.id, { seq: ++seq & 0xffff, buttons, aim: quantizeAim(aim), inv: world.equip(p, weapon) });
    world.step();
  }
}
/** Count projectiles the shooter launches, by kind. */
function watch(world: World, p: Player): number[] {
  const kinds: number[] = [];
  const spawn = world.projectiles.spawn.bind(world.projectiles);
  world.projectiles.spawn = (id, kind, owner, x, y, vx, vy) => {
    if (owner === p.id) kinds.push(kind);
    return spawn(id, kind, owner, x, y, vx, vy);
  };
  return kinds;
}
const ammo = (p: Player, w: number) => p.inv.find((it) => it.weapon === w)!.ammo;

describe('new guns', () => {
  it('every new gun is a primary a clone can spawn with', async () => {
    const { PRIMARIES } = await import('../src/shared/items.ts');
    for (const w of [WeaponId.Shotgun, WeaponId.GrenadeLauncher, WeaponId.Gatling, WeaponId.Laser]) expect(PRIMARIES).toContain(w);
  });

  it('shotgun: nine pellets a shell, six shells, a slow reload; brutal up close', () => {
    const def = WEAPONS[WeaponId.Shotgun];
    expect(def.clip).toBe(6);
    expect(def.reload).toBeGreaterThan(WEAPONS[WeaponId.Rifle].reload);
    const { world, p, targets } = arena(1, 30);
    const kinds = watch(world, p);
    hold(world, p, BTN_FIRE, WeaponId.Shotgun, 1);
    expect(kinds.filter((k) => k === ProjKind.Pellet).length).toBe(9);
    hold(world, p, 0, WeaponId.Shotgun, 4);
    const t = targets[0];
    expect(!t.alive || t.hp < 50).toBe(true);
    expect(t.body.vx).toBeGreaterThan(20); // knocked back
  });

  it('GL: six bouncing bomblets on a fuse, each a third of a hand grenade', () => {
    const def = WEAPONS[WeaponId.GrenadeLauncher];
    const b = PROJ[ProjKind.Bomblet];
    expect(def.clip).toBe(6);
    expect(b.bounce).toBeGreaterThan(0);
    expect(b.splashDamage * 3).toBeLessThanOrEqual(PROJ[ProjKind.Grenade].splashDamage);
    const { world, p } = arena();
    const kinds = watch(world, p);
    for (let k = 0; k < 6; k++) {
      hold(world, p, BTN_FIRE, WeaponId.GrenadeLauncher, 1, -0.6);
      hold(world, p, 0, WeaponId.GrenadeLauncher, 12, -0.6);
    }
    expect(kinds.filter((k) => k === ProjKind.Bomblet).length).toBe(6);
    expect(ammo(p, WeaponId.GrenadeLauncher) === 0 || p.reloadLeft > 0).toBe(true);
    // They bounce about, then pop on their fuse.
    for (let k = 0; k < b.life + 5; k++) world.step();
    expect(Array.from(world.projectiles.kind.subarray(0, world.projectiles.n)).includes(ProjKind.Bomblet)).toBe(false);
  });

  it('Gatling: spins up before it fires; a hundred rounds; heavier than the rifle, wilder', () => {
    const def = WEAPONS[WeaponId.Gatling];
    expect(def.clip).toBe(100);
    expect(def.spread).toBeGreaterThan(WEAPONS[WeaponId.Rifle].spread * 2);
    expect(PROJ[ProjKind.Heavy].damage).toBeGreaterThan(PROJ[ProjKind.Bullet].damage);
    const { world, p } = arena();
    const kinds = watch(world, p);
    hold(world, p, BTN_FIRE, WeaponId.Gatling, def.spinUp! - 2);
    expect(kinds.length).toBe(0); // still spinning up
    hold(world, p, BTN_FIRE, WeaponId.Gatling, 60);
    expect(kinds.filter((k) => k === ProjKind.Heavy).length).toBeGreaterThan(25);
  });

  it('laser: holding charges it (nothing fires), letting go fires; it goes through every soldier in its way', () => {
    const { world, p, targets } = arena(3, 40, 20);
    hold(world, p, BTN_FIRE, WeaponId.Laser, 60);
    const ammo0 = ammo(p, WeaponId.Laser);
    expect(p.charge).toBe(60);
    expect(targets.every((t) => t.hp === 100)).toBe(true);
    hold(world, p, 0, WeaponId.Laser, 1);
    expect(p.charge).toBe(0);
    expect(ammo(p, WeaponId.Laser)).toBe(ammo0 - 1);
    // All three hit, the last as hard as the first.
    const lost = targets.map((t) => (t.alive ? 100 - t.hp : 100));
    expect(Math.min(...lost)).toBeGreaterThan(20);
    expect(Math.abs(lost[2] - lost[0])).toBeLessThan(5);
  });

  it('laser: a full 8-second charge is a killing beam; a wall stops it', () => {
    expect(LASER_MAX).toBe(30 * 8);
    expect(laserWound(1)).toBeGreaterThan(laserWound(0.05) * 4);
    const { world, p, targets } = arena(2, 40, 40);
    // A wall between the two.
    for (let y = 300; y < 400; y++) for (let x = 1060; x < 1066; x++) world.terrain.set(x, y, Mat.Concrete);
    world.terrainReplaced();
    hold(world, p, BTN_FIRE, WeaponId.Laser, LASER_MAX + 30);
    expect(p.charge).toBe(LASER_MAX);
    hold(world, p, 0, WeaponId.Laser, 1);
    expect(targets[0].alive).toBe(false);
    expect(targets[1].hp).toBe(100);
  });
});
