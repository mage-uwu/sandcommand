import { describe, expect, it } from 'vitest';
import { ROCKET_GRIDS, ROCKET_PAL_KEYS } from '../src/client/rocket-grids.ts';

describe('rockets in flight, pixel art', () => {
  it('every grid is rectangular and drawn only in its palette', () => {
    for (const g of ROCKET_GRIDS) {
      for (const row of g) {
        expect(row.length).toBe(g[0].length);
        for (const ch of row) if (ch !== '.') expect(ROCKET_PAL_KEYS, `'${ch}'`).toContain(ch);
      }
    }
  });
});
