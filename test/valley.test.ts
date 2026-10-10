import { describe, expect, it } from 'vitest';
import { BTN_UP, newBody, stepBody } from '../src/shared/actor.ts';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, DT, WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { FloraKind } from '../src/shared/frosting.ts';
import { Mat } from '../src/shared/materials.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { Biome, MapKind, biomeOf, generateWorld, lastComplexes, lastFlora, lastValley, lastWater } from '../src/shared/worldgen.ts';
import { floodWater, paintWater, solveLevel } from '../src/shared/water.ts';
import { World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';

const valleySeed = (from = 1) => {
  for (let s = from; ; s++) if (biomeOf(s, MapKind.Plain) === Biome.Valley) return s;
};

describe('the Valley of Souls', () => {
  const t = new Terrain();
  generateWorld(t, valleySeed(), MapKind.Plain);
  const v = lastValley!;
  const water = lastWater.map((b) => ({ ...b }));
  const flora = [...lastFlora];
  const room = (k: string) => v.rooms.find((r) => r.kind === k)!;
  const count = (mat: number, x0: number, y0: number, x1: number, y1: number) => {
    let n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (t.get(x, y) === mat) n++;
    return n;
  };

  it('only ever an ordinary map, about one in seven; no bunkers in it', () => {
    let n = 0;
    for (let s = 1; s <= 700; s++) if (biomeOf(s, MapKind.Plain) === Biome.Valley) n++;
    expect(n / 700).toBeGreaterThan(0.06);
    expect(n / 700).toBeLessThan(0.18);
    for (let s = 1; s < 100; s++) {
      expect(biomeOf(s, MapKind.Fortress)).not.toBe(Biome.Valley);
      expect(biomeOf(s, MapKind.Siege)).not.toBe(Biome.Valley);
    }
    expect(lastComplexes.length).toBe(0);
  });

  it('a grand canyon: rims capped with grey rock, a deep floor, a pool on it', () => {
    const rimY = Math.min(t.surfaceY(v.x0 - 200), t.surfaceY(v.x1 + 200));
    // (The floor: its median height either side of the dome, caltrops and teeth aside.)
    const ys: number[] = [];
    for (let x = v.dome.x - 700; x <= v.dome.x + 700; x += 10) if (Math.abs(x - v.dome.x) > 340) ys.push(t.surfaceY(x));
    ys.sort((p, q) => p - q);
    const floorY = ys[ys.length >> 1];
    expect(floorY - rimY).toBeGreaterThan(160);
    expect(t.get(v.x0 - 200, t.surfaceY(v.x0 - 200) + 2)).toBe(Mat.Rock);
    // The pool: water on the floor.
    expect(t.wet(v.pool.x, t.surfaceY(v.pool.x) - 1) || t.wet(v.pool.x, v.pool.y)).toBe(true);
  });

  it('the warning at its peak: a cement dome sealing the shaft, caltrops round it, the Maw full of teeth under it', () => {
    const d = v.dome;
    // The dome's crown is cement, and under it the shaft runs open down into the Maw.
    let crown = d.y - d.r - 2;
    while (t.get(d.x, crown) === Mat.Air) crown++;
    expect([Mat.Cement, Mat.RuinStone]).toContain(t.get(d.x, crown)); // (cement, a masonry keystone on its crown)
    const maw = room('maw');
    for (let y = d.y + 4; y < maw.y - maw.ry; y += 6) expect(t.get(d.x, y)).toBe(Mat.Air);
    expect(count(Mat.Cement, d.x - d.r - 260, d.y - 160, d.x + d.r + 260, d.y)).toBeGreaterThan(3000); // the dome and the caltrops
    expect(count(Mat.Cement, maw.x - maw.rx - 10, maw.y - maw.ry - 10, maw.x + maw.rx + 10, maw.y + maw.ry + 10)).toBeGreaterThan(400); // the jaws
    // And next to no life in the Maw.
    expect(flora.filter((f) => Math.abs(f.x - maw.x) < maw.rx && Math.abs(f.y - maw.y) < maw.ry).length).toBeLessThan(6);
  });

  it('deeper, the calm: sargasso weed, cisterns, a forest of petrified trunks with roots in the water, gems', () => {
    const kinds = new Set(v.rooms.map((r) => r.kind));
    for (const k of ['maw', 'sargasso', 'basin', 'forest', 'cistern', 'gems', 'nest']) expect(kinds).toContain(k);
    const sarg = room('sargasso');
    expect(flora.filter((f) => f.kind === FloraKind.Kelp && Math.abs(f.x - sarg.x) < sarg.rx + 10).length).toBeGreaterThan(8);
    // The forest: petrified wood from the floor to the roof.
    const forest = room('forest');
    expect(count(Mat.Petrified, forest.x - forest.rx, forest.y - forest.ry - 10, forest.x + forest.rx, forest.y + forest.ry + 10)).toBeGreaterThan(1500);
    // Its roots trail down into the cistern's water.
    const cis = room('cistern');
    let wetRoots = 0;
    for (let y = cis.y - cis.ry; y <= cis.y + cis.ry; y++) for (let x = cis.x - cis.rx; x <= cis.x + cis.rx; x++) if (t.get(x, y) === Mat.Petrified && (t.wet(x - 1, y) || t.wet(x + 1, y))) wetRoots++;
    expect(wetRoots).toBeGreaterThan(5);
    // No blister coral anywhere in the calm.
    const c = v.calm;
    expect(flora.some((f) => f.kind === FloraKind.Blister && f.x > c.x0 && f.x < c.x1 && f.y > c.y0)).toBe(false);
  });

  it('the nest at the bottom: spectacularly rich in GEMMs, giant crystals and coral', () => {
    const nest = room('nest');
    const box = [nest.x - nest.rx - 14, nest.y - nest.ry - 14, nest.x + nest.rx + 14, nest.y + nest.ry * 1.1 + 14] as const;
    expect(count(Mat.GemCrystal, ...box)).toBeGreaterThan(2500);
    expect(count(Mat.Gold, ...box)).toBeGreaterThan(3000);
    expect(flora.filter((f) => Math.abs(f.x - nest.x) < nest.rx && Math.abs(f.y - nest.y) < nest.ry * 2).length).toBeGreaterThan(30);
  });

  it('standing water: each body holds its volume, its surface level', () => {
    expect(water.length).toBeGreaterThanOrEqual(3);
    for (const b of water) {
      const n = floodWater(t, b.x, b.y, b.level, 1e6);
      expect(n).toBeLessThanOrEqual(b.volume);
      expect(n).toBeGreaterThan(b.volume * 0.75);
      // Flat: the cells along its surface row that are water have air (not water) over them.
      expect(t.wet(b.x, b.level)).toBe(true);
      expect(t.wet(b.x, b.level - 1)).toBe(false);
    }
  });
});

describe('water', () => {
  /** A tank 100 wide, 60 deep, in solid rock, its top open. */
  function tank(): Terrain {
    const t = new Terrain();
    for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) t.mat[y * WORLD_W + x] = y < 400 || (x >= 1000 && x < 1100 && y < 460) ? Mat.Air : Mat.Rock;
    t.rebuildAllPlanes();
    return t;
  }

  it('fills from the bottom to the level its volume reaches', () => {
    const t = tank();
    const b = { x: 1050, y: 459, volume: 100 * 20, level: 459 };
    b.level = solveLevel(t, b);
    expect(b.level).toBe(440); // 20 rows of 100
    paintWater(t, [b]);
    expect(t.wet(1050, 440) && t.wet(1099, 459)).toBe(true);
    expect(t.wet(1050, 439)).toBe(false);
  });

  it('dig into its side below the waterline and it spreads into the new space, the level dropping', () => {
    const t = tank();
    const b = { x: 1050, y: 459, volume: 2000, level: 459 };
    b.level = solveLevel(t, b);
    // A pocket 50 wide and 20 deep off its bottom.
    for (let y = 440; y < 460; y++) for (let x = 1100; x < 1150; x++) t.set(x, y, Mat.Air);
    expect(solveLevel(t, b)).toBeGreaterThan(445);
    expect(floodWater(t, b.x, b.y, solveLevel(t, b), 1e6)).toBeLessThanOrEqual(2000);
  });

  it('a clone in water floats and swims (up held strokes upward, without fuel)', () => {
    const t = tank();
    const b = { x: 1050, y: 459, volume: 4000, level: 459 };
    b.level = solveLevel(t, b);
    paintWater(t, [b]);
    const sink = newBody(1046, 440);
    const air = newBody(1046, 300);
    for (let k = 0; k < 10; k++) {
      stepBody(sink, 0, t, DT);
      stepBody(air, 0, t, DT);
    }
    expect(sink.vy).toBeLessThan(air.vy * 0.5); // sinking slowly, if at all
    const swim = newBody(1046, 445);
    swim.fuel = 0;
    for (let k = 0; k < 20; k++) stepBody(swim, BTN_UP, t, DT);
    expect(swim.y).toBeLessThan(440); // up it came
    void ACTOR_H;
  });

  it('the server keeps the levels as the ground changes, and clients paint the same water', () => {
    const inbox: Uint8Array[] = [];
    const world = new World(valleySeed());
    for (let s = 2; lastValley === null && s < 60; s++) new World(valleySeed(s));
    const a = world.addPlayer('a', { send: (d) => inbox.push(d) })!;
    const game = new Game();
    game.myId = a.id;
    const pump = () => {
      for (const m of inbox.splice(0)) {
        const r = new Reader(m);
        r.u8();
        const tk = r.u32();
        const ack = r.u16();
        game.applyFrame(tk, ack, r);
      }
    };
    world.step();
    pump();
    const same = () => {
      let diff = 0;
      for (const b of world.water) for (let y = b.level - 2; y <= b.y + 2; y++) for (let x = b.x - 140; x <= b.x + 140; x++) if (world.terrain.wet(x, y) !== game.terrain.wet(x, y)) diff++;
      return diff;
    };
    expect(world.water.length).toBeGreaterThan(0);
    expect(same()).toBe(0);
    // Blow a hole in the basin's floor: the water drains into it.
    const basin = world.water.reduce((p, q) => (q.volume > p.volume ? q : p));
    const before = basin.level;
    for (let k = 0; k < 4; k++) world.carve(basin.x, basin.y + 6 + k * 8, 10, 10, 0);
    for (let k = 0; k < 20; k++) world.step();
    pump();
    expect(basin.level).toBeGreaterThan(before);
    // Once the debris has come to rest (it settles on each side in its own time), the same water again.
    for (let k = 0; k < 150; k++) world.step();
    pump();
    let cells = 0;
    for (const b of world.water) cells += floodWater(world.terrain, b.x, b.y, b.level, 1e6);
    expect(same()).toBeLessThan(cells * 0.005);
  });
});
