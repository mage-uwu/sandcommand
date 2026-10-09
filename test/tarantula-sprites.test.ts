import { describe, expect, it } from 'vitest';
import { BODY_HIP, RACK_MOUTHS, TARANTULA_GRIDS } from '../src/client/tarantula-grids.ts';

describe('tarantula sprites', () => {
  it('are rectangular grids in its own palette (iron, steel, ceramic), the hip line on the body', () => {
    const known = new Set('.KiIjmsSGcCWerRoyt');
    for (const g of TARANTULA_GRIDS) {
      expect(g.length).toBeGreaterThan(4);
      for (const row of g) {
        expect(row.length).toBe(g[0].length);
        for (const ch of row) expect(known.has(ch)).toBe(true);
      }
    }
    const [body, , rack] = TARANTULA_GRIDS;
    expect(body[BODY_HIP[1]][BODY_HIP[0]]).not.toBe('.');
    for (const [x, y] of RACK_MOUTHS) expect(rack[Math.floor(y)][x]).toBe('K');
  });
});
