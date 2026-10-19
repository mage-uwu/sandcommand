import { describe, expect, it } from 'vitest';
import { WOUNDS_MAX, WoundBook, beastDamage, beastScars, woundSize } from '../src/client/wounds.ts';

describe('wounds', () => {
  it('a hit pins a wound where it struck; a near one deepens it; the book keeps the newest few', () => {
    const b = new WoundBook();
    b.hit(3, 1, -4, 20, 0);
    expect(b.shown(3, 80)).toEqual([{ u: 1, v: -4, r: woundSize(20), at: 0 }]);
    b.hit(3, 1.5, -4, 20, 10);
    const [w] = b.shown(3, 60);
    expect(b.shown(3, 60).length).toBe(1);
    expect(w.r).toBeGreaterThan(woundSize(20));
    for (let k = 0; k < 20; k++) b.hit(3, -3 + (k % 7), -8 + k * 0.6, 10, 20 + k);
    expect(b.shown(3, 0).length).toBe(WOUNDS_MAX);
  });

  it('only as many show as the clone is hurt: healed, they close (oldest first); dead, they go', () => {
    const b = new WoundBook();
    for (let k = 0; k < 6; k++) b.hit(1, -3 + k, -6 + k * 2, 15, k);
    expect(b.shown(1, 40).length).toBe(6);
    expect(b.shown(1, 90).length).toBe(2);
    expect(b.shown(1, 90)[1].at).toBe(5); // (the newest)
    expect(b.shown(1, 100).length).toBe(0);
    b.clear(1);
    expect(b.shown(1, 10).length).toBe(0);
  });

  it("a creature's scars: none unhurt, the same on every client for the same seed and damage, and they only grow", () => {
    expect(beastScars(7, 15, 0)).toEqual([]);
    expect(beastScars(7, 15, 0.5)).toEqual(beastScars(7, 15, 0.5));
    const a = beastScars(7, 15, 0.3);
    const b = beastScars(7, 15, 0.8);
    expect(b.length).toBeGreaterThan(a.length);
    for (const s of a) {
      const t = b.find((o) => o.seg === s.seg && o.side === s.side && o.at === s.at)!;
      expect(t).toBeDefined();
      expect(t.sev).toBeGreaterThanOrEqual(s.sev);
    }
    // (Badly hurt, most of it is cut, some to the bone.)
    expect(beastScars(7, 30, 0.9).filter((s) => s.sev > 0.7).length).toBeGreaterThan(5);
  });

  it('measured from the most of it seen: a lair beast at half strength starts unmarked', () => {
    expect(beastDamage(128, 128)).toBe(0);
    expect(beastDamage(64, 128)).toBeCloseTo(0.5);
    expect(beastDamage(0, 255)).toBe(1);
  });
});
