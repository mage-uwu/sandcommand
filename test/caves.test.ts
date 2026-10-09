import { describe, expect, it } from 'vitest';
import { WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { caveLevel } from '../src/shared/caves.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { MapKind, cavesOf, generateWorld, lastCaves, lastComplexes } from '../src/shared/worldgen.ts';

const t = new Terrain();
const air = (x: number, y: number) => t.get(Math.round(x), Math.round(y)) === Mat.Air;
/** The first cave-map seed (from `from`) of a kind. */
const caveSeed = (kind: number, from = 1) => {
  for (let s = from; ; s++) if (cavesOf(s, kind)) return s;
};

describe('cave maps', () => {
  it('about two maps in five, ordinary or Regicide; never the labyrinth', () => {
    let n = 0;
    for (let s = 1; s <= 500; s++) if (cavesOf(s, MapKind.Plain)) n++;
    expect(n / 500).toBeGreaterThan(0.3);
    expect(n / 500).toBeLessThan(0.5);
    for (let s = 1; s <= 50; s++) expect(cavesOf(s, MapKind.Dungeon)).toBe(false);
    // An ordinary map without the flag has no caves.
    let plain = 1;
    while (cavesOf(plain, MapKind.Plain)) plain++;
    generateWorld(t, plain, MapKind.Plain);
    expect(lastCaves).toBe(null);
  });

  it('a highway runs the length of the map, tall and walkable, under every bunker', () => {
    generateWorld(t, caveSeed(MapKind.Plain), MapKind.Plain);
    const net = lastCaves!;
    let run = 0;
    for (let x = 0; x < WORLD_W; x++) if (net.floor[x] > 0) run++;
    expect(run / WORLD_W).toBeGreaterThan(0.95);
    let open = 0;
    let steep = 0;
    for (let x = 60; x < WORLD_W - 60; x++) {
      expect(net.floor[x] - net.ceil[x]).toBeGreaterThanOrEqual(36);
      if (air(x, (net.floor[x] + net.ceil[x]) / 2) && air(x, net.floor[x] - 16)) open++;
      if (Math.abs(net.floor[x + 8] - net.floor[x]) > 10) steep++;
    }
    expect(open / (WORLD_W - 120)).toBeGreaterThan(0.9); // (the odd boulder and stalactite)
    expect(steep).toBe(0); // you can walk (or roll) it end to end
    // Never through a bunker: its roof stays under every basement (citadels aside: they're in it).
    for (const c of lastComplexes) {
      if (net.citadels.includes(c)) continue;
      const bottom = c.floor + 12 + Math.max(0, ...c.basements) * 48;
      for (let x = c.x0; x < c.x1; x += 4) if (net.ceil[x]) expect(net.ceil[x]).toBeGreaterThan(bottom);
    }
  });

  it('every bunker has a shaft straight down into it; every ramp is open to the sky', () => {
    generateWorld(t, caveSeed(MapKind.Plain), MapKind.Plain);
    const net = lastCaves!;
    const surface = lastComplexes.filter((c) => !net.citadels.includes(c));
    const fromBunkers = net.shafts.filter((s) => !s.deep);
    expect(fromBunkers.length).toBeGreaterThanOrEqual(Math.ceil(surface.length * 0.8));
    for (const s of fromBunkers) {
      // Open from the room it starts in all the way down into the highway.
      for (let y = s.top - 4; y < net.ceil[Math.round(s.x)]; y += 2) expect(air(s.x, y)).toBe(true);
      expect(caveLevel(net, s.x, s.bottom)).toBe(1);
    }
    expect(net.ramps.length).toBeGreaterThanOrEqual(1);
    for (const r of net.ramps) {
      const dir = Math.sign(r.bottom.x - r.top.x);
      for (let x = r.top.x; dir * (r.bottom.x - x) > 4; x += dir * 4) {
        const y = r.top.y + ((r.bottom.y - r.top.y) * (x - r.top.x)) / (r.bottom.x - r.top.x);
        expect(air(x, y - 20)).toBe(true); // headroom all the way down
      }
      expect(caveLevel(net, r.bottom.x, r.bottom.y)).toBe(1);
    }
  });

  it('citadels: fortresses standing in great caverns on the highway, a deep run below linked to it', () => {
    let seed = caveSeed(MapKind.Plain);
    let citadels = 0;
    let deep = 0;
    for (let tries = 0; tries < 4; tries++, seed = caveSeed(MapKind.Plain, seed + 1)) {
      generateWorld(t, seed, MapKind.Plain);
      const net = lastCaves!;
      citadels += net.citadels.length;
      for (const c of net.citadels) {
        expect(lastComplexes).toContain(c);
        // Open cavern over its roof.
        const roof = c.floor - Math.max(...c.heights) * 48;
        expect(air((c.x0 + c.x1) / 2, roof - 16)).toBe(true);
        // On the highway: its floor is the highway's there.
        expect(caveLevel(net, (c.x0 + c.x1) / 2, c.floor)).toBe(1);
      }
      for (let x = 0; x < WORLD_W; x++) if (net.lowFloor[x]) deep++;
      expect(net.links.length).toBeGreaterThanOrEqual(1);
      for (const l of net.links) {
        expect(caveLevel(net, l.top.x, l.top.y)).toBe(1);
        expect(caveLevel(net, l.bottom.x, l.bottom.y)).toBe(2);
      }
    }
    expect(citadels).toBeGreaterThanOrEqual(4);
    expect(deep / (4 * WORLD_W)).toBeGreaterThan(0.5);
  });

  it('Regicide fortresses get them too, connected underground (never through the king\'s vault)', () => {
    generateWorld(t, caveSeed(MapKind.Fortress), MapKind.Fortress);
    const net = lastCaves!;
    for (const c of lastComplexes.filter((c) => c.fortress)) {
      const s = net.shafts.find((s) => s.x > c.x0 && s.x < c.x1);
      expect(s).toBeDefined();
      expect(Math.abs(s!.x - c.fortress!.king.x)).toBeGreaterThan(20);
    }
  });
});
