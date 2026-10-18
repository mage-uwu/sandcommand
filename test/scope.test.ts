import { describe, expect, it } from 'vitest';
import { BTN_SCOPE } from '../src/shared/actor.ts';
import { ClassId, Part, has, newBodyState, newStrike, strike } from '../src/shared/body.ts';
import { WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { sightLine } from '../src/shared/scope.ts';
import { PROJ, ProjKind, WEAPONS, WeaponId } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { lineOfFire, scopeLock } from '../src/client/scope.ts';
import type { Game } from '../src/client/game.ts';
import { BTN_DOWN, BTN_FIRE, Stance } from '../src/shared/actor.ts';
import { ACTOR_H, ACTOR_W } from '../src/shared/constants.ts';
import { F_ALIVE, Team } from '../src/shared/protocol.ts';
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

/** A client-side view of the world, just what the scope reads. */
function fakeGame(views: { id: number; x: number; y: number }[], solidX = 1e9, myTeam: number = Team.None, teams: Record<number, number> = {}) {
  const teamOf = new Uint8Array(64).fill(Team.None);
  for (const [id, t] of Object.entries(teams)) teamOf[Number(id)] = t;
  return {
    terrain: { isSolid: (x: number) => x >= solidX },
    remoteViews: () => views.map((v) => ({ ...v, flags: F_ALIVE })),
    myId: 0,
    myTeam,
    teamOf,
    tankPilots: new Set<number>(),
    scopeLock: null,
  } as unknown as Game;
}

const CONE = WEAPONS[WeaponId.Sniper].lockCone!;

describe('scope lock-on', () => {
  it('clones are part of the line of fire: the first one in it stops it', () => {
    const g = fakeGame([{ id: 2, x: 200, y: 46 }, { id: 3, x: 120, y: 46 }], 400);
    const lof = lineOfFire(g, 100, 50, 0, 600);
    expect(lof.hit?.id).toBe(3);
    expect(lof.dist).toBeCloseTo(20, 0);
    // Behind a wall, nobody.
    expect(lineOfFire(fakeGame([{ id: 2, x: 200, y: 46 }], 150), 100, 50, 0, 600).hit).toBeNull();
  });

  it('scoped onto an enemy, the aim locks on and follows them; pull well off and it lets go', () => {
    const views = [{ id: 5, x: 300, y: 40 }];
    const g = fakeGame(views);
    const ox = 100;
    const oy = 50;
    // The line crosses their head: locked onto the head.
    let aim = scopeLock(g, ox, oy, Math.atan2(42 - oy, 300 - ox), CONE);
    expect(g.scopeLock?.id).toBe(5);
    expect(g.scopeLock!.ly).toBeLessThan(5);
    // They move; the mouse doesn't, quite: the aim follows the locked point.
    views[0].y = 30;
    aim = scopeLock(g, ox, oy, aim, CONE);
    expect(Math.abs(oy + Math.tan(aim) * (300 - ox) - (30 + g.scopeLock!.ly))).toBeLessThan(1.5);
    // Pulled right off them: the lock breaks.
    scopeLock(g, ox, oy, aim + 0.6, CONE);
    expect(g.scopeLock).toBeNull();
    // And it never locks onto a teammate.
    const mates = fakeGame([{ id: 7, x: 300, y: 40 }], 1e9, Team.Red, { 0: Team.Red, 7: Team.Red });
    scopeLock(mates, ox, oy, Math.atan2(46 - oy, 300 - ox), CONE);
    expect(mates.scopeLock).toBeNull();
    void ACTOR_W;
    void ACTOR_H;
  });

  it('is radial: anyone in the cone around the aim gets locked, the nearest to the crosshair first', () => {
    const ox = 100;
    const oy = 50;
    // Two enemies off to the side of the line (clear of it), both inside the sniper's cone; one well outside it.
    // Boxes are 8x14: centre mass at (x + 4, y + 6).
    const g = fakeGame([
      { id: 4, x: 396, y: 50 + 35 - 6 },
      { id: 5, x: 396, y: 50 - 20 - 6 },
      { id: 6, x: 396, y: 50 + 120 - 6 },
    ]);
    const aim = scopeLock(g, ox, oy, 0, CONE);
    expect(g.scopeLock?.id).toBe(5);
    // Locked at centre mass: the aim runs to it.
    expect(aim).toBeCloseTo(Math.atan2(-20, 300), 5);
    // Outside the cone, or behind a wall: nobody.
    const far = fakeGame([{ id: 6, x: 396, y: 50 + 120 - 6 }]);
    scopeLock(far, ox, oy, 0, CONE);
    expect(far.scopeLock).toBeNull();
    const walled = fakeGame([{ id: 5, x: 396, y: 50 - 20 - 6 }], 250);
    scopeLock(walled, ox, oy, 0, CONE);
    expect(walled.scopeLock).toBeNull();
    // No cone (not scoping a lock-capable weapon): no lock at all.
    const none = fakeGame([{ id: 5, x: 300, y: 46 }]);
    expect(scopeLock(none, ox, oy, 0, 0)).toBe(0);
    expect(none.scopeLock).toBeNull();
    expect(WEAPONS[WeaponId.Grenade].lockCone ?? 0).toBe(0); // lobbed: never locks
    expect(CONE).toBeGreaterThan(WEAPONS[WeaponId.Rifle].lockCone! * 2);
  });

  it("the server's scoped view stops at a clone in the line too", () => {
    const { world, p } = arena(500);
    const q = world.addPlayer('target', { send() {} })!;
    deliverAll(world, [p, q]);
    for (const o of [p, q]) o.body.vx = 0;
    q.body.x = p.body.x + 80;
    q.body.y = p.body.y;
    for (let k = 0; k < 2; k++) {
      q.body.x = p.body.x + 80;
      q.body.y = p.body.y;
      world.input(p.id, { seq: 900 + k, buttons: BTN_SCOPE, aim: quantizeAim(0), inv: world.equip(p, WeaponId.Sniper) });
      world.step();
    }
    expect(p.camX).toBeLessThan(q.body.x + ACTOR_W);
    expect(p.camX).toBeGreaterThan(q.body.x - 10);
  });
});

describe('recoil', () => {
  /** Fire one shot of `weapon` aiming right from a standstill (in `stance`), and see how the shooter is shoved. */
  const shove = (weapon: number, stance: number) => {
    const { world, p } = arena(900);
    // Get down (held), then fire.
    const down = stance === Stance.Stand ? 0 : BTN_DOWN;
    for (let k = 0; k < (stance === Stance.Prone ? 20 : stance === Stance.Crouch ? 2 : 0); k++) {
      world.input(p.id, { seq: 990 + k, buttons: down, aim: quantizeAim(0), inv: world.equip(p, weapon) });
      world.step();
    }
    expect(p.body.stance).toBe(stance);
    p.body.vx = 0;
    p.body.vy = 0;
    p.cooldown = 0;
    world.input(p.id, { seq: 1000, buttons: BTN_FIRE | down, aim: quantizeAim(0), inv: world.equip(p, weapon) });
    const x0 = p.body.x;
    world.step();
    return { vx: p.body.vx, dx: p.body.x - x0, p, world };
  };

  it('every gun kicks its shooter back; the sniper hardest; bracing (crouched, prone) soaks it up', () => {
    const rifle = shove(WeaponId.Rifle, Stance.Stand).vx;
    const sniper = shove(WeaponId.Sniper, Stance.Stand).vx;
    expect(rifle).toBeLessThan(0);
    expect(sniper).toBeLessThan(rifle * 4);
    const prone = shove(WeaponId.Sniper, Stance.Prone).vx;
    expect(prone).toBeGreaterThan(sniper * 0.5);
    expect(prone).toBeLessThan(0);
  });

  it('holding the trigger, the muzzle climbs; let go and it settles', () => {
    const { world, p } = arena(900);
    for (let k = 0; k < 20; k++) {
      world.input(p.id, { seq: 1100 + k, buttons: BTN_FIRE, aim: quantizeAim(0), inv: world.equip(p, WeaponId.Rifle) });
      world.step();
    }
    expect(p.climb).toBeGreaterThan(0.04);
    for (let k = 0; k < 30; k++) {
      world.input(p.id, { seq: 1200 + k, buttons: 0, aim: quantizeAim(0), inv: world.equip(p, WeaponId.Rifle) });
      world.step();
    }
    expect(p.climb).toBeLessThan(0.01);
    void (null as unknown as Player);
  });
});
