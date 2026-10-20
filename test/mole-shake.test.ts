import { describe, expect, it } from 'vitest';
import { Game } from '../src/client/game.ts';
import { ProjKind } from '../src/shared/weapons.ts';

describe("a mole's plasma", () => {
  it('burns out where it digs without shaking the view or flashing (twenty a second)', () => {
    const g = new Game();
    g.body.x = 500;
    g.body.y = 300;
    for (let i = 0; i < 20; i++) g.projEnd(1000 + i, 505, 302, ProjKind.Plasma, true, i);
    expect(g.shake).toBe(0);
    expect(g.flashes.length).toBe(0);
  });

  it('(a grenade there still jolts it)', () => {
    const g = new Game();
    g.body.x = 500;
    g.body.y = 300;
    g.projEnd(1, 505, 302, ProjKind.Grenade, true, 1);
    expect(g.shake).toBeGreaterThan(0);
  });
});
