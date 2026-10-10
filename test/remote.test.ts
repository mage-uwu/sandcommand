import { describe, expect, it } from 'vitest';
import { newShip } from '../src/shared/dropship.ts';
import { CallKind, Team } from '../src/shared/protocol.ts';
import { TARANTULA_SCALE, WATCHDOG_SCALE, TankKind, newTank, newTarantula } from '../src/shared/tank.ts';
import { World } from '../src/server/world.ts';
import { RadioSelector, lineFromAim } from '../src/client/radio.ts';
import { deliverAll } from './helpers.ts';

describe('the remote: P steps through every drone of ours', () => {
  /** A clone with two dropships, a watchdog and a tarantula of its own, all up and about. */
  function fleet() {
    const world = new World(303);
    const a = world.addPlayer('a', { send() {} })!;
    deliverAll(world, [a]);
    const x = a.body.x;
    const top = world.terrain.surfaceY(Math.floor(x));
    world.ships[1] = newShip(x - 40, top - 120, a.id, Team.None);
    world.ships[3] = newShip(x + 60, top - 140, a.id, Team.None);
    world.tanks[5] = newTarantula(x + 40, top - 50, a.id);
    world.tanks[2] = newTank(x - 60, top - 20, WATCHDOG_SCALE, a.id, TankKind.Watchdog);
    for (const k of [2, 5]) world.tanks[k]!.chute = false; // (landed)
    void TARANTULA_SCALE;
    return { world, a };
  }
  const where = (a: { pilot: number; rc: number }) => (a.pilot >= 0 ? `ship${a.pilot}` : a.rc >= 0 ? `tank${a.rc}` : 'clone');

  it('forward: dropships, then watchdogs, then tarantulas, then back to the clone', () => {
    const { world, a } = fleet();
    expect(world.remotesOf(a.id).length).toBe(4);
    const seen: string[] = [];
    for (let k = 0; k < 5; k++) {
      expect(world.call(a.id, CallKind.Pilot)).toBe(true);
      seen.push(where(a));
    }
    expect(seen).toEqual(['ship1', 'ship3', 'tank2', 'tank5', 'clone']);
    // Whatever it left is back on its own head.
    expect(world.ships[1]!.pilot).toBe(255);
    expect(world.tanks[5]!.pilot).toBe(255);
  });

  it('Shift+P: the other way round', () => {
    const { world, a } = fleet();
    const seen: string[] = [];
    for (let k = 0; k < 5; k++) {
      world.call(a.id, CallKind.PilotBack);
      seen.push(where(a));
    }
    expect(seen).toEqual(['tank5', 'tank2', 'ship3', 'ship1', 'clone']);
  });

  it('a drone gone mid-cycle drops out of it; with none at all, P does nothing', () => {
    const { world, a } = fleet();
    world.call(a.id, CallKind.Pilot); // ship1
    world.ships[3] = null;
    world.call(a.id, CallKind.Pilot);
    expect(where(a)).toBe('tank2');
    for (const k of [2, 5]) world.tanks[k] = null;
    world.ships[1] = null;
    world.call(a.id, CallKind.Pilot);
    expect(where(a)).toBe('clone');
    expect(world.call(a.id, CallKind.Pilot)).toBe(false);
  });
});

describe('the radio selector', () => {
  it('the aim\'s elevation picks the line: up the top, down the bottom', () => {
    expect(lineFromAim(-Math.PI / 2, 6)).toBe(0);
    expect(lineFromAim(Math.PI / 2, 6)).toBe(5);
    expect(lineFromAim(0, 5)).toBe(2);
    expect(lineFromAim(Math.PI, 5)).toBe(2); // (level, either side)
  });

  it('aim, wheel and hover move it; only a real swing of the aim takes it back from the wheel', () => {
    const r = new RadioSelector();
    let sel = 0;
    const tick = (aim: number, hover = -1, wheel = 0, fire = false) => {
      const o = r.update(sel, 6, aim, hover, wheel, fire);
      sel = o.sel;
      return o.call;
    };
    tick(0); // just out: stays on the top line
    expect(sel).toBe(0);
    tick(Math.PI / 2 - 0.01); // swung down
    expect(sel).toBe(5);
    tick(Math.PI / 2, -1, -2); // two notches up
    expect(sel).toBe(3);
    tick(Math.PI / 2 + 0.05); // a twitch: the wheel's pick holds
    expect(sel).toBe(3);
    tick(Math.PI / 2, 1); // the pointer over line 1
    expect(sel).toBe(1);
    tick(Math.PI / 2, -1, 9); // the wheel wraps
    expect(sel).toBe(4);
  });

  it('the trigger calls what\'s highlighted, once per press', () => {
    const r = new RadioSelector();
    const calls = [false, true, true, false, true].map((f) => r.update(2, 5, 0, -1, 0, f).call);
    expect(calls).toEqual([false, true, false, false, true]);
    r.reset();
    expect(r.update(2, 5, 0, -1, 0, true).call).toBe(true);
  });
});
