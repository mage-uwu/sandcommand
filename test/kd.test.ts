import { describe, expect, it } from 'vitest';
import { Game, kdRatio } from '../src/client/game.ts';
import type { KillInfo } from '../src/shared/frame.ts';
import { ProjKind } from '../src/shared/weapons.ts';

const death = (killer: number, victim: number): KillInfo => ({ killer, victim, weapon: ProjKind.Bullet, x: 0, y: 0, vx: 0, vy: 0, overkill: 0, seed: 1, gold: 0, parts: 0x1ff });

describe('kills, deaths and K/D', () => {
  it('K/D is kills per death, kills alone while deathless', () => {
    expect(kdRatio(6, 3)).toBe(2);
    expect(kdRatio(4, 0)).toBe(4);
    expect(kdRatio(0, 5)).toBe(0);
  });

  it('the career record counts our own kills and deaths, nobody else’s', () => {
    const g = new Game();
    g.myId = 3;
    const k0 = g.career.kills;
    const d0 = g.career.deaths;
    g.kill(death(3, 7)); // we got one
    g.kill(death(7, 9)); // someone else's fight
    g.kill(death(3, 3)); // blew ourselves up: a death, not a kill
    g.kill(death(9, 3)); // we got got
    expect(g.career.kills).toBe(k0 + 1);
    expect(g.career.deaths).toBe(d0 + 2);
  });
});
