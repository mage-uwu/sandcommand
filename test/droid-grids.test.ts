import { describe, expect, it } from 'vitest';
import { CHASSIS, CHASSIS_PIVOT, DBARE, DDIM, DHEAD, DHEAD_PIVOT, DPAL, DROID_GRIDS } from '../src/client/droid-grids.ts';

describe('spider droid pixel art', () => {
  it('every grid is rectangular and drawn only in its palette (the team light aside)', () => {
    for (const g of DROID_GRIDS) {
      for (const row of g) {
        expect(row.length).toBe(g[0].length);
        for (const ch of row) if (ch !== '.' && ch !== 't') expect(DPAL[ch], `'${ch}'`).toBeDefined();
      }
    }
    // (The variants recolour; they add nothing.)
    for (const p of [DBARE, DDIM]) expect(Object.keys(p).sort()).toEqual(Object.keys(DPAL).sort());
  });

  it('the chassis carries its team light and glowing vent; the head its red eye', () => {
    expect(CHASSIS.join('')).toContain('t');
    expect(CHASSIS.join('')).toContain('O');
    expect(DHEAD.join('')).toContain('x');
  });

  it('pivots sit within their grids: the hip line in the chassis, the gun mount under the chin', () => {
    expect(CHASSIS_PIVOT[0]).toBeGreaterThan(0);
    expect(CHASSIS_PIVOT[0]).toBeLessThan(CHASSIS[0].length);
    expect(CHASSIS_PIVOT[1]).toBeLessThan(CHASSIS.length);
    expect(DHEAD_PIVOT[1]).toBeGreaterThan(DHEAD.length - 1.5);
  });
});
