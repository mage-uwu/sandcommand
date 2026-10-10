import { describe, expect, it } from 'vitest';
import { WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { caveLevel } from '../src/shared/caves.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { Biome, MapKind, biomeOf, cavesOf, generateWorld, lastCaves, lastComplexes } from '../src/shared/worldgen.ts';

const t = new Terrain();
const air = (x: number, y: number) => t.get(Math.round(x), Math.round(y)) === Mat.Air;
/** The first cave-map seed (from `from`) of a kind. */
const caveSeed = (kind: number, from = 1) => {
  for (let s = from; ; s++) if (cavesOf(s, kind)) return s;
};

describe('cave maps', () => {
  it('about two marslike maps in five, ordinary or Regicide; never the labyrinth or the deadland', () => {
    let n = 0;
    for (let s = 1; s <= 500; s++) if (cavesOf(s, MapKind.Plain)) n++;
    expect(n / 500).toBeGreaterThan(0.25);
    for (let s = 1; s <= 200; s++) if (biomeOf(s, MapKind.Plain) === Biome.Deadland) expect(cavesOf(s, MapKind.Plain)).toBe(false);
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
      // (A natural citadel's keep and gates stand on its floor: the way is through them.)
      if (net.caverns.some((c) => c.natural && Math.abs(x - c.x) < c.hw)) {
        open++;
        continue;
      }
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
        // Its gates hang over the road: walkable under them, either side of it.
        // (Through the gate wall's outer edge, clear of the hole up into its guard room.)
        for (const x of [c.x0 - 24, c.x1 + 24]) {
          let clear = 0;
          for (let y = net.floor[x] - 1; y > net.floor[x] - 60 && air(x, y); y--) clear++;
          expect(clear).toBeGreaterThanOrEqual(44);
          expect(t.get(x, net.floor[x] - 52)).toBe(Mat.Metal); // (and a gate there: its steel header)
        }
      }
      for (let x = 0; x < WORLD_W; x++) if (net.lowFloor[x]) deep++;
      expect(net.links.length).toBeGreaterThanOrEqual(1);
      for (const l of net.links) {
        expect(caveLevel(net, l.top.x, l.top.y)).toBe(1);
        expect(caveLevel(net, l.bottom.x, l.bottom.y)).toBe(2);
      }
    }
    expect(citadels).toBeGreaterThanOrEqual(2);
    expect(deep / (4 * WORLD_W)).toBeGreaterThan(0.5);
  });

  it('natural citadels: no fort, a rock keep hanging over the highway with chambers in it, rock curtains for gates', () => {
    let natural = 0;
    let forts = 0;
    for (let seed = caveSeed(MapKind.Plain), tries = 0; tries < 8; tries++, seed = caveSeed(MapKind.Plain, seed + 1)) {
      generateWorld(t, seed, MapKind.Plain);
      const net = lastCaves!;
      forts += net.caverns.filter((c) => !c.natural).length;
      expect(net.caverns.filter((c) => !c.natural).length).toBe(net.citadels.length);
      for (const c of net.caverns.filter((c) => c.natural)) {
        natural++;
        // No masonry in it.
        for (const f of net.citadels) expect(f.x1 < c.x - c.hw || f.x0 > c.x + c.hw).toBe(true);
        // The keep: rock hanging over the middle, the highway open under it, a chamber inside.
        const fl = net.floor[c.x];
        expect(air(c.x, fl - 20)).toBe(true);
        let rock = 0;
        let rooms = 0;
        // (Several columns across it: one might run straight up the hole into a chamber.)
        for (let x = c.x - 30; x <= c.x + 30; x += 10) {
          let wasRock = false;
          for (let y = fl - 60; y > net.ceil[x]; y--) {
            const solid = !air(x, y);
            if (solid) rock++;
            if (wasRock && !solid) rooms++; // air over rock: a chamber's floor
            wasRock = solid;
          }
        }
        expect(rock).toBeGreaterThan(100);
        expect(rooms).toBeGreaterThanOrEqual(3);
        // Walkable from end to end along its floor: nothing across it under a tarantula's height.
        for (let x = c.x - c.hw + 8; x < c.x + c.hw - 8; x += 3) {
          let clear = 0;
          // (Above the odd low stalagmite, which you step over.)
          for (let y = net.floor[x] - 14; y > net.floor[x] - 60 && air(x, y); y--) clear++;
          expect(clear).toBeGreaterThan(28);
        }
      }
    }
    expect(natural).toBeGreaterThanOrEqual(3);
    expect(forts).toBeGreaterThanOrEqual(3);
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
