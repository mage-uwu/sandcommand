import { describe, expect, it } from 'vitest';
import { BTN_FIRE, BTN_LOCK, BTN_RIGHT, shoulderAt } from '../src/shared/actor.ts';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { LASER_MIN, WeaponId } from '../src/shared/weapons.ts';
import { World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

/**
 * A player's client sees everyone a moment late (smoothed between frames,
 * and the trip to the server and back): LAG ticks. Aiming at a running
 * target where it's seen, the shot lands behind it, unless the shot is
 * locked on (BTN_LOCK), and the server sets it true on where the target is.
 */
const LAG = 8;

function duel(seed: number) {
  const world = new World(seed, { mode: 'sandbox', bots: 0 });
  world.wildlife = false;
  const t = world.terrain;
  for (let x = 0; x < WORLD_W; x++) {
    for (let y = 0; y < 400; y++) if (t.get(x, y) !== Mat.Air) t.set(x, y, Mat.Air);
    for (let y = 400; y < 420; y++) t.set(x, y, Mat.Bedrock);
  }
  // The shooter up on a pillar, looking down across the runner's path (a target crossing the line of fire, not running along it).
  for (let y = 250; y < 400; y++) for (let x = 990; x < 1012; x++) t.set(x, y, Mat.Bedrock);
  world.terrainReplaced();
  const p = world.addPlayer('shooter', { send() {} })!;
  const q = world.addPlayer('runner', { send() {} })!;
  deliverAll(world, [p, q]);
  for (let k = 0; k < 90 && !(p.alive && q.alive); k++) world.step();
  for (const [c, x, y] of [
    [p, 996, 250],
    [q, 1100, 400],
  ] as const) {
    resetBody(c.parts, ClassId.Medium, 0);
    c.hp = 100;
    c.body.x = x;
    c.body.y = y - 14;
    c.body.vx = c.body.vy = 0;
  }
  return { world, p, q };
}

/** Run the target right for a while (so it's moving flat out), firing `weapon` at where the shooter's client sees it; true if it was hit. */
function shootRunner(weapon: number, lock: boolean, seed: number): boolean {
  const { world, p, q } = duel(seed);
  let seq = 0;
  let qseq = 0;
  const seen: { x: number; y: number }[] = [];
  const inv = world.equip(p, weapon);
  // (The laser charged up a good while: a bare tap's beam is too weak to get through anything.)
  const charge = weapon === WeaponId.Laser ? LASER_MIN + 40 : 1;
  const sh = { x: 0, y: 0 };
  const mask = q.parts.mask;
  for (let k = 0; k < 80; k++) {
    if (k === 29) expect(Math.abs(q.body.vx)).toBeGreaterThan(30); // (it really is running)
    world.input(q.id, { seq: ++qseq & 0xffff, buttons: BTN_RIGHT, aim: 0, inv: 0 });
    seen.push({ x: q.cx, y: q.cy });
    const view = seen[Math.max(0, seen.length - 1 - LAG)];
    const s = shoulderAt(p.body.x, p.body.y, p.body.stance, false, sh);
    const aim = Math.atan2(view.y - s.y, view.x - s.x);
    // Fire (the laser charges a few ticks, then lets go) once it's been running a while.
    const firing = k >= 30 - charge + 1 && k <= 30;
    world.input(p.id, { seq: ++seq & 0xffff, buttons: (firing ? BTN_FIRE : 0) | (lock ? BTN_LOCK : 0), aim: quantizeAim(aim), inv });
    world.step();
  }
  // (Struck: hurt, or a part shot off: from behind, a slug takes the jetpack off its back.)
  return !q.alive || q.hp < 100 || q.parts.mask !== mask;
}

describe('a locked-on shot goes where the target really is', () => {
  for (const [name, weapon] of [
    ['sniper', WeaponId.Sniper],
    ['laser', WeaponId.Laser],
  ] as const) {
    it(`${name}: aimed at a running clone where a lagging client sees it, it misses; locked on, it hits`, () => {
      let free = 0;
      let locked = 0;
      for (const seed of [3, 5, 9]) {
        if (shootRunner(weapon, false, seed)) free++;
        if (shootRunner(weapon, true, seed)) locked++;
      }
      expect(free).toBe(0);
      expect(locked).toBe(3);
    });
  }

  it('locked on to nothing near the aim, the shot goes where it was aimed', () => {
    const { world, p, q } = duel(3);
    const ALL = q.parts.mask;
    // Aimed well away (straight up): no target within the slack, so no help.
    let seq = 0;
    const inv = world.equip(p, WeaponId.Sniper);
    world.input(p.id, { seq: ++seq, buttons: BTN_FIRE | BTN_LOCK, aim: quantizeAim(-Math.PI / 2), inv });
    for (let k = 0; k < 20; k++) world.step();
    expect(q.hp).toBe(100);
    expect(q.parts.mask).toBe(ALL);
  });
});
