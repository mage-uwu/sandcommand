import { describe, expect, it } from 'vitest';
import { Mat } from '../src/shared/materials.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { MapKind, generateWorld, lastComplexes } from '../src/shared/worldgen.ts';
import { DecorKind, placeDecor } from '../src/client/decor.ts';
import { backwallPixels } from '../src/client/backwall-tile.ts';

describe('bunker fittings', () => {
  it('fill the rooms with lamps, pipes, signs and the like, all off the floor and in open air', () => {
    const t = new Terrain();
    generateWorld(t, 5, MapKind.Fortress);
    const list = placeDecor(t, lastComplexes, 5);
    const kinds = new Set(list.map((d) => d.kind));
    expect(list.length).toBeGreaterThan(80);
    for (const k of [DecorKind.Lamp, DecorKind.Vent, DecorKind.Stencil, DecorKind.Banner]) expect(kinds.has(k)).toBe(true);
    for (const d of list) {
      for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) expect(t.get(x, y)).toBe(Mat.Air);
      // Hung from the ceiling, or on the wall well above the floor: never something to take cover behind.
      if (d.kind === DecorKind.Lamp || d.kind === DecorKind.Banner) expect(t.get(d.x + 3, d.y - 1)).not.toBe(Mat.Air);
      else expect(t.get(d.x + (d.w >> 1), d.y + d.h + 6)).toBe(Mat.Air);
    }
    // The same map, the same fittings.
    expect(placeDecor(t, lastComplexes, 5)).toEqual(list);
  });
});

describe('the rock face behind the ground', () => {
  it('is a seamless tile, darker than the ground in front of it', () => {
    const px = backwallPixels();
    expect(px.length).toBe(256 * 256 * 4);
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
    const mean = sum / (256 * 256);
    expect(mean).toBeGreaterThan(25);
    expect(mean).toBeLessThan(80); // (rust soil in front is ~80 on its own)
    // Its edges meet: the left column is as like the right as any two neighbouring columns.
    const col = (x: number) => {
      let d = 0;
      for (let y = 0; y < 256; y++) d += Math.abs(px[(y * 256 + x) * 4] - px[(y * 256 + ((x + 1) % 256)) * 4]);
      return d;
    };
    expect(col(255)).toBeLessThan(col(100) * 3 + 2000);
  });
});
