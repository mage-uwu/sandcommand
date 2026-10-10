import { describe, expect, it } from 'vitest';
import { BTN_FIRE, BTN_RIGHT, BTN_SCOPE } from '../src/shared/actor.ts';
import { ACTOR_H } from '../src/shared/constants.ts';
import { SHIP_BOMBS, SHIP_W } from '../src/shared/dropship.ts';
import { Mat } from '../src/shared/materials.ts';
import { isDog, isMole, isSpider } from '../src/shared/tank.ts';
import { CALL_COST, CallKind, quantizeAim } from '../src/shared/protocol.ts';
import { ProjKind, WeaponId } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

/** A caller with a dropship on station overhead. */
function withShip(seed: number) {
  const world = new World(seed);
  const a = world.addPlayer('caller', { send() {} })!;
  deliverAll(world, [a]);
  a.gold = CALL_COST;
  world.equip(a, WeaponId.Radio);
  world.step();
  expect(world.call(a.id, CallKind.Dropship)).toBe(true);
  for (let k = 0; k < 30 * 8; k++) world.step();
  const slot = world.ships.findIndex(Boolean);
  return { world, a, slot, sh: world.ships[slot]! };
}

describe('remote-piloting your dropship', () => {
  it('only its caller can take it, and then flies it while the clone stands inert', () => {
    const { world, a, slot, sh } = withShip(81);
    const b = world.addPlayer('other', { send() {} })!;
    deliverAll(world, [b]);
    expect(world.call(b.id, CallKind.Pilot)).toBe(false); // not their ship
    expect(world.call(a.id, CallKind.Pilot)).toBe(true);
    expect(a.pilot).toBe(slot);
    expect(sh.pilot).toBe(a.id);
    const x0 = sh.x;
    const bx = a.body.x;
    for (let k = 0; k < 30 * 4; k++) {
      a.buttons = BTN_RIGHT; // A/D fly the ship, not the clone
      world.step();
    }
    expect(sh.x - x0).toBeGreaterThan(150);
    expect(Math.abs(a.body.x - bx)).toBeLessThan(2);
    expect(a.alive).toBe(true);
  });

  it("its guns fire on the pilot's aim, and right mouse drops a bomb", () => {
    const { world, a, sh } = withShip(82);
    world.call(a.id, CallKind.Pilot);
    const pr = world.projectiles;
    const gun = () => Array.from(pr.kind.subarray(0, pr.n)).filter((k) => k === ProjKind.ShipGun).length;
    a.aimQ = quantizeAim(Math.PI / 2); // straight down
    let shots = 0;
    for (let k = 0; k < 20; k++) {
      a.buttons = BTN_FIRE;
      world.step();
      shots = Math.max(shots, gun());
    }
    expect(shots).toBeGreaterThan(0);
    expect(sh.aim[0]).toBeCloseTo(Math.PI / 2, 2);
    for (let k = 0; k < 4; k++) {
      a.buttons = BTN_SCOPE;
      world.step();
    }
    expect(sh.bombs).toBe(SHIP_BOMBS - 1);
  });

  it('handing it back (or dying) returns it to the autopilot and its support role', () => {
    const { world, a, sh } = withShip(83);
    world.call(a.id, CallKind.Pilot);
    a.buttons = 0;
    world.step();
    expect(world.call(a.id, CallKind.Pilot)).toBe(true); // P again: hand it back
    expect(a.pilot).toBe(-1);
    expect(sh.pilot).toBe(255);
    for (let k = 0; k < 30; k++) world.step();
    expect(sh.mission).not.toBe(-1); // planning again
    // Take it again, then the clone dies: the autopilot takes over.
    world.call(a.id, CallKind.Pilot);
    (world as unknown as { damage: (p: Player, n: number, by: number, w: number) => void }).damage(a, 999, a.id, 255);
    world.step();
    expect(a.pilot).toBe(-1);
    expect(sh.pilot).toBe(255);
  });
});

describe('bots that save up for air support', () => {
  /** A lone bot (a prospector) on the surface. */
  function lone(seed: number): { world: World; bot: Player } {
    const world = new World(seed);
    const bot = world.addBot()!;
    deliverAll(world, [bot]);
    world.step(); // (its first think rolls this life's objective: then force it on)
    (bot.bot as unknown as { prospector: boolean }).prospector = true;
    return { world, bot };
  }

  it('mines gold on purpose when nobody is about', () => {
    const { world, bot } = lone(84);
    // A seam of gold just under the ground a little way off.
    const gx = Math.floor(bot.cx + 50);
    for (let x = gx; x < gx + 14; x++) {
      const top = world.terrain.surfaceY(x);
      for (let y = top + 2; y < top + 12; y++) world.terrain.set(x, y, Mat.Gold);
    }
    const g0 = bot.gold;
    for (let k = 0; k < 30 * 30 && bot.gold < g0 + 40; k++) world.step();
    expect(bot.gold).toBeGreaterThan(g0 + 40);
  });

  it('digs a shaft straight down to a seam buried deep underground', () => {
    const { world, bot } = lone(86);
    // A seam 70 cells under the ground just beside it, and nothing nearer.
    const gx = Math.floor(bot.cx + 30);
    const top = world.terrain.surfaceY(gx);
    for (let x = gx; x < gx + 16; x++) for (let y = top + 70; y < top + 80; y++) world.terrain.set(x, y, Mat.Gold);
    const g0 = bot.gold;
    let deepest = 0;
    for (let k = 0; k < 30 * 45 && bot.gold < g0 + 40; k++) {
      world.step();
      deepest = Math.max(deepest, bot.body.y - (top - ACTOR_H));
    }
    expect(deepest).toBeGreaterThan(40); // it went down after it
    expect(bot.gold).toBeGreaterThan(g0 + 40);
  });

  it('prospecting is a rare objective, rolled each life', () => {
    let on = 0;
    // (rolled at spawn: count over many fresh lives)
    const { world: w2, bot } = lone(88);
    const b = bot.bot as unknown as { prospector: boolean; wasAlive: boolean };
    for (let life = 0; life < 300; life++) {
      b.wasAlive = false;
      w2.step();
      if (b.prospector) on++;
    }
    expect(on).toBeGreaterThan(15);
    expect(on).toBeLessThan(90); // ~15%
  });

  it('with the gold banked, it gets on the radio and calls in a dropship', () => {
    const { world, bot } = lone(85);
    (bot.bot as unknown as { wish: number }).wish = CallKind.Dropship;
    bot.gold = CALL_COST + 10;
    bot.callCd = 0;
    for (let k = 0; k < 30 * 3 && !world.ships.some(Boolean); k++) world.step();
    const sh = world.ships.find(Boolean);
    expect(sh?.owner).toBe(bot.id);
    expect(bot.gold).toBeLessThan(CALL_COST);
    void ACTOR_H;
    void SHIP_W;
  });

  it('saves for all sorts: watchdogs most, then moles, tanks and dropships; tarantulas mostly the better bots', () => {
    const { bot } = lone(90);
    const brain = bot.bot as unknown as { pickWish: (p: Player, can: (k: number) => boolean) => number };
    const tally = (skill: number) => {
      bot.skill = skill;
      const n = new Map<number, number>();
      for (let i = 0; i < 2000; i++) {
        const k = brain.pickWish(bot, () => true);
        n.set(k, (n.get(k) ?? 0) + 1);
      }
      return n;
    };
    const mid = tally(3);
    for (const k of [CallKind.Watchdog, CallKind.Mole, CallKind.Tank, CallKind.Dropship, CallKind.Tarantula]) expect(mid.get(k) ?? 0).toBeGreaterThan(50);
    expect(mid.get(CallKind.Watchdog)!).toBeGreaterThan(mid.get(CallKind.Tank)!);
    expect(tally(5).get(CallKind.Tarantula)!).toBeGreaterThan(tally(1).get(CallKind.Tarantula)! * 3);
    // Never what it can't have.
    for (let i = 0; i < 200; i++) expect(brain.pickWish(bot, (k) => k !== CallKind.Watchdog)).not.toBe(CallKind.Watchdog);
    expect(brain.pickWish(bot, () => false)).toBe(-1);
  });

  it('a bot that buys a tank (or a mole) goes and climbs into it', () => {
    for (const kind of [CallKind.Tank, CallKind.Mole]) {
      const { world, bot } = lone(91);
      (bot.bot as unknown as { wish: number }).wish = kind;
      bot.gold = 5000;
      bot.callCd = 0;
      for (let k = 0; k < 30 * 3 && !world.tanks.some(Boolean); k++) world.step();
      const t = world.tanks.find(Boolean)!;
      expect(t).toBeDefined();
      expect(isMole(t)).toBe(kind === CallKind.Mole);
      for (let k = 0; k < 30 * 30 && bot.tank < 0; k++) world.step();
      expect(world.tanks[bot.tank]).toBe(t);
    }
  });

  it('a watchdog or a tarantula, it lets fight beside it; and it never buys a second of either', () => {
    const { world, bot } = lone(92);
    const brain = bot.bot as unknown as { wish: number };
    brain.wish = CallKind.Watchdog;
    bot.gold = 20000;
    for (let k = 0; k < 30 * 20; k++) {
      bot.callCd = 0;
      world.step();
    }
    const mine = (f: (t: NonNullable<World['tanks'][number]>) => boolean) => world.tanks.filter((t) => t && t.owner === bot.id && f(t)).length;
    expect(mine(isDog)).toBe(1);
    expect(mine(isSpider)).toBeLessThanOrEqual(1);
    // With the gold, it went on to buy other things too.
    expect(world.tanks.filter(Boolean).length + world.ships.filter(Boolean).length).toBeGreaterThan(1);
  });
});

