import { describe, expect, it } from 'vitest';
import type { BeastState } from '../src/shared/frame.ts';
import { BeastKind } from '../src/shared/wildlife.ts';
import { Game } from '../src/client/game.ts';

const beast = (slot: number, kind: number, seed: number, x: number, same = false): BeastState => ({
  slot,
  kind,
  seed,
  hp: 1,
  lift: 0,
  attached: true,
  frozen: true,
  coiled: false,
  gem: false,
  frenzy: false,
  carry: false,
  infected: false,
  pts: Array.from({ length: 20 }, (_, i) => (i & 1 ? 500 : x - (i >> 1) * 3)),
  same,
});

describe('creature slots on the client', () => {
  it("a death in a slot the server has already reused: the dead one goes (in gibs); the newborn stays, and stays while it's unchanged", () => {
    const game = new Game();
    game.beasts([beast(3, BeastKind.Millipede, 10, 400)]);
    // The millipede dies; in the same tick a new one is spawned into its slot (a lair's restock, a brood).
    game.beasts([beast(3, BeastKind.Asp, 77, 900)]);
    game.beastDie(3, BeastKind.Millipede, 1);
    expect(game.beastViews.get(3)?.seed).toBe(77);
    expect(game.segmentGibs.length).toBeGreaterThan(0); // (the dead one's, where it was)
    expect(Math.min(...game.segmentGibs.map((g) => g.x))).toBeLessThan(450);
    // Lying in wait: the server sends only that it's unchanged. Still there.
    for (let k = 0; k < 5; k++) game.beasts([beast(3, 0, 0, 0, true)]);
    expect(game.beastViews.get(3)?.seed).toBe(77);
  });

  it('a death of the same kind into a reused slot: still only the one that left', () => {
    const game = new Game();
    game.beasts([beast(5, BeastKind.Millipede, 10, 400)]);
    game.beasts([beast(5, BeastKind.Millipede, 11, 1200)]);
    game.beastDie(5, BeastKind.Millipede, 1);
    expect(game.beastViews.get(5)?.seed).toBe(11);
  });

  it('an ordinary death (nothing new in its slot) still bursts it', () => {
    const game = new Game();
    game.beasts([beast(2, BeastKind.Millipede, 10, 400)]);
    game.beasts([]);
    game.beastDie(2, BeastKind.Millipede, 1);
    expect(game.beastViews.has(2)).toBe(false);
    expect(game.segmentGibs.length).toBeGreaterThan(0);
  });
});
