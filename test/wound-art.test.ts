import { describe, expect, it } from 'vitest';
import { FLESH, HIVE, woundPixels } from '../src/client/wound-art.ts';
import type { Wound } from '../src/client/wounds.ts';

/** A clone's sprite (10 x 16): a block of body, cells 2..7 across, rows 0..15. */
const body = (x: number, y: number) => x >= 2 && x <= 7 && y >= 0 && y < 16;

describe('wounds painted into the sprite', () => {
  it('only on the clone itself, never off it', () => {
    const w: Wound[] = [{ u: 2.5, v: -6, r: 2.4, at: 0 }];
    for (const p of woundPixels(w, 1, FLESH, 10_000, body)) expect(body(p.x, p.y)).toBe(true);
  });

  it('a bullet hole, a tear, a gaping wound: bigger, rawer, bone in the worst', () => {
    const at = (r: number) => woundPixels([{ u: 0, v: -5, r, at: 0 }], 1, FLESH, 600, body);
    const hole = at(0.8);
    const tear = at(1.5);
    const gape = at(2.4);
    expect(hole.some((p) => p.c === FLESH.core)).toBe(true);
    expect(hole.some((p) => p.c === FLESH.meat)).toBe(false);
    expect(tear.some((p) => p.c === FLESH.meat)).toBe(true);
    expect(gape.some((p) => p.c === FLESH.bone)).toBe(true);
    expect(new Set(gape.map((p) => `${p.x},${p.y}`)).size).toBeGreaterThan(new Set(hole.map((p) => `${p.x},${p.y}`)).size);
  });

  it('the blood runs further down the longer it is open, and in its facing: mirrored', () => {
    const run = (t: number) => woundPixels([{ u: 1, v: -5, r: 1.5, at: 0 }], 1, FLESH, t, body).filter((p) => p.c === FLESH.run || p.c === FLESH.runEnd);
    expect(Math.max(...run(4000).map((p) => p.y))).toBeGreaterThan(Math.max(...run(100).map((p) => p.y)));
    const right = woundPixels([{ u: 1.5, v: -5, r: 0.8, at: 0 }], 1, FLESH, 2000, body).find((p) => p.c === FLESH.core)!;
    const left = woundPixels([{ u: 1.5, v: -5, r: 0.8, at: 0 }], -1, FLESH, 2000, body).find((p) => p.c === FLESH.core)!;
    expect(right.x).toBeGreaterThan(left.x);
  });

  it("the possessed ooze the crab's blue", () => {
    const px = woundPixels([{ u: 0, v: -4, r: 1.5, at: 0 }], 1, HIVE, 3000, body);
    expect(px.some((p) => p.c === HIVE.run)).toBe(true);
    expect(px.some((p) => p.c === FLESH.run)).toBe(false);
  });
});
