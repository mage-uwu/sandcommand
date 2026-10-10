import { describe, expect, it } from 'vitest';
import { BTN_FIRE, BTN_RIGHT, BTN_UP } from '../src/shared/actor.ts';
import { ACTOR_W } from '../src/shared/constants.ts';
import { invByte } from '../src/shared/items.ts';
import { Mat } from '../src/shared/materials.ts';
import { CALL_COST, CallKind, quantizeAim } from '../src/shared/protocol.ts';
import { WeaponId } from '../src/shared/weapons.ts';
import { shipSeat } from '../src/shared/dropship.ts';
import { MOB_SIZE, STEP_COUNT, TStep, Tutorial } from '../src/client/tutorial.ts';

/** Play the tutorial by driving the World directly, as a player would press keys. */
describe('tutorial', () => {
  it('walks a new player from landing to wiping out the mob, one step at a time', () => {
    const tut = new Tutorial('Recruit', { send() {} });
    const w = tut.world;
    const me = tut.me;
    let seq = 0;
    const press = (buttons: number, aim = 0, pickup = false) => {
      w.input(me.id, { seq: ++seq & 0xffff, buttons, aim: quantizeAim(aim), inv: invByte(me.slot, me.invVersion, pickup) });
      w.step();
      tut.update();
    };
    const until = (cond: () => boolean, act: () => void, max = 900) => {
      for (let k = 0; k < max && !cond(); k++) act();
      expect(cond(), `stuck at step ${tut.step}: ${tut.coach(false).title} (x ${me.cx.toFixed(0)}, alive ${me.alive}, gold ${me.gold})`).toBe(true);
    };
    // Down by rocket into the arena, with only a digger and a radio.
    until(() => me.alive, () => press(0), 1200);
    expect(Math.abs(me.cx - tut.arena.spawn)).toBeLessThan(80);
    expect(me.inv.map((i) => i.weapon)).toEqual([WeaponId.Digger, WeaponId.Radio]);
    expect(tut.coach(false).body).toMatch(/A and D/);
    expect(tut.coach(true).body).toMatch(/left stick/);

    // 1. Run.
    until(() => tut.step === TStep.Jet, () => press(BTN_RIGHT));
    // 2. Jetpack.
    until(() => tut.step === TStep.Gun, () => press(BTN_UP));
    // 3. The rifle lies ahead: walk onto it and pick it up.
    const gunX = tut.arena.gun;
    expect(tut.coach(false).target).not.toBeNull();
    until(() => tut.step === TStep.Shoot, () => {
      const dx = gunX - me.cx;
      press(Math.abs(dx) > 3 ? (dx > 0 ? BTN_RIGHT : 1) : 0, 0, Math.abs(dx) < 8 && w.tick % 4 === 0);
    }, 1500);
    // 4. Shoot it.
    w.equip(me, WeaponId.Rifle);
    until(() => tut.step === TStep.Gold, () => press(BTN_FIRE));
    // 5. Dig the gold: stand over the pocket, digger aimed down.
    const g = tut.arena.gold;
    me.body.x = g.x - ACTOR_W / 2;
    me.body.y = w.terrain.surfaceY(g.x) - 14;
    w.equip(me, WeaponId.Digger);
    until(() => tut.step === TStep.Rare, () => {
      press(BTN_FIRE, Math.PI / 2);
    }, 1500);
    expect(me.gold).toBeGreaterThan(0);
    // 6. The rare earth.
    const r = tut.arena.rare;
    const rx = (r.x0 + r.x1) / 2;
    me.body.x = rx - ACTOR_W / 2;
    me.body.y = w.terrain.surfaceY(rx) - 14;
    let found = false;
    for (let y = r.y0; y <= r.y1 && !found; y++) for (let x = r.x0; x <= r.x1; x++) if (w.terrain.get(x, y) === Mat.RareEarth) found = true;
    expect(found).toBe(true);
    until(() => tut.step === TStep.Tank, () => press(BTN_FIRE, Math.PI / 2), 1500);
    // Enough for a tank, one way or another.
    expect(me.gold).toBeGreaterThanOrEqual(CALL_COST);
    // 7. Call it in.
    w.equip(me, WeaponId.Radio);
    me.callCd = 0;
    expect(w.call(me.id, CallKind.Tank)).toBe(true);
    press(0);
    expect(tut.step).toBe(TStep.Board);
    // 8. Climb in once it's down.
    const tank = w.tanks.find((t) => t !== null)!;
    until(() => tank.onGround && !tank.chute, () => press(0), 900);
    until(() => tut.step === TStep.Mob, () => {
      const dx = tank.x + 16 - me.cx;
      press(Math.abs(dx) > 4 ? (dx > 0 ? BTN_RIGHT : 1) : 0, 0, w.tick % 3 === 0);
    }, 900);
    // 9. The mob comes down ahead; each one killed is gone for good.
    until(() => w.players.filter((p) => p?.bot && p.alive).length === MOB_SIZE, () => press(0), 1500);
    expect(tut.coach(false).target).not.toBeNull();
    for (const p of w.players) if (p?.bot && p.alive) (w as unknown as { damage: (p: unknown, n: number, by: number, wpn: number) => void }).damage(p, 999, me.id, 0);
    until(() => tut.step === TStep.Done, () => press(0), 300);
    expect(w.players.filter((p) => p?.bot).length).toBe(0);
    expect(tut.coach(true).done).toBe(true);
    expect(STEP_COUNT).toBe(9);
  });
});

describe('tutorial: any vehicle, any way aboard', () => {
  /** Landed, and skipped ahead to buying a vehicle, gold in hand and the radio out. */
  const atShop = () => {
    const tut = new Tutorial('Recruit', { send() {} });
    const w = tut.world;
    const me = tut.me;
    for (let k = 0; k < 1200 && !me.alive; k++) {
      w.step();
      tut.update();
    }
    tut.step = TStep.Tank;
    me.gold = 5000;
    w.equip(me, WeaponId.Radio);
    me.callCd = 0;
    let seq = 0;
    const press = (buttons: number, pickup = false) => {
      w.input(me.id, { seq: ++seq & 0xffff, buttons, aim: quantizeAim(0), inv: invByte(me.slot, me.invVersion, pickup) });
      w.step();
      tut.update();
    };
    return { tut, w, me, press };
  };

  it('a dropship counts as the vehicle, and riding on its roof as getting aboard', () => {
    const { tut, w, me, press } = atShop();
    expect(w.call(me.id, CallKind.Dropship)).toBe(true);
    press(0);
    expect(tut.step).toBe(TStep.Board);
    expect(tut.coach(false).body).toMatch(/roof/);
    const sh = w.ships.find((s) => s !== null)!;
    for (let k = 0; k < 400 && tut.step === TStep.Board; k++) {
      // Hold just over a roof seat (as if jetpacking up to it) and press pick-up.
      const s = shipSeat(sh, 0, { x: 0, y: 0 });
      me.body.x = s.x - ACTOR_W / 2;
      me.body.y = s.y - 16;
      me.body.vx = me.body.vy = 0;
      press(0, k % 2 === 0);
    }
    expect(me.surfShip).toBeGreaterThanOrEqual(0);
    expect(tut.step).toBe(TStep.Mob);
    expect(tut.coach(false).body).toMatch(/up top/);
  });

  it('a watchdog counts too, and riding on top of it', () => {
    const { tut, w, me, press } = atShop();
    expect(w.call(me.id, CallKind.Watchdog)).toBe(true);
    press(0);
    expect(tut.step).toBe(TStep.Board);
    const dog = w.tanks.find((t) => t !== null)!;
    for (let k = 0; k < 900 && !(dog.onGround && !dog.chute); k++) press(0);
    for (let k = 0; k < 300 && tut.step === TStep.Board; k++) {
      me.body.x = dog.x + 4;
      me.body.y = dog.y - 14;
      me.body.vx = me.body.vy = 0;
      press(0, k % 2 === 0);
    }
    expect(me.surf).toBeGreaterThanOrEqual(0);
    expect(tut.step).toBe(TStep.Mob);
  });
});
