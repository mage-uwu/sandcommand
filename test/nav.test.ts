import { describe, expect, it } from 'vitest';
import { WORLD_W } from '../src/shared/constants.ts';
import { MAT_ADAMANT, MAT_FIXED, MAT_HARD, Mat } from '../src/shared/materials.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { GameMode, Phase, Team } from '../src/shared/protocol.ts';
import { Biome, lastBiome } from '../src/shared/worldgen.ts';
import { findPath, undiggable } from '../src/server/nav.ts';
import { World } from '../src/server/world.ts';

const FLOOR = 600;
/** Open air over a bedrock floor, and a wall of `mat` from x0 to x1, `h` tall (up to `top` if given a gap over it). */
function yard(mat: number, x0: number, x1: number, h: number): Terrain {
  const t = new Terrain();
  for (let y = 0; y < 1024; y++) for (let x = 0; x < WORLD_W; x++) t.mat[y * WORLD_W + x] = y >= FLOOR ? Mat.Bedrock : x >= x0 && x < x1 && y >= FLOOR - h ? mat : Mat.Air;
  t.rebuildAllPlanes();
  return t;
}

describe('the ruins and the monuments yield, grudgingly', () => {
  it('ruin masonry is as tough as the caltrops\' cement: hard, adamant, never fixed', () => {
    for (const m of [Mat.RuinStone, Mat.RuinGlyph]) {
      expect(MAT_HARD[m]).toBe(true);
      expect(MAT_ADAMANT[m]).toBe(true);
      expect(MAT_FIXED[m]).toBe(false);
    }
    // A big blast does bite it, a little.
    const t = yard(Mat.RuinStone, 400, 500, 80);
    expect(t.carve(450, FLOOR - 40, 20, 16)).toBeGreaterThan(0);
    // (The labyrinth's own stone still never yields.)
    expect(MAT_FIXED[Mat.Cobble] && MAT_FIXED[Mat.Glyph]).toBe(true);
    expect(undiggable(Mat.Cement) && undiggable(Mat.RuinStone) && undiggable(Mat.Iron)).toBe(true);
    expect(undiggable(Mat.Dirt) || undiggable(Mat.Concrete)).toBe(false);
  });
});

describe('bots plan their way (nav.ts)', () => {
  it('over a cement wall, never through it', () => {
    const t = yard(Mat.Cement, 600, 640, 120);
    const p = findPath(t, 500, FLOOR, 760, FLOOR);
    expect(p.reached).toBe(true);
    // It climbs: somewhere along the way it's above the wall's top.
    expect(Math.min(...p.pts.map((q) => q.y))).toBeLessThan(FLOOR - 120);
    expect(p.pts.some((q) => q.dig)).toBe(false);
  });

  it('through a thin wall of soft ground, where that\'s shorter than going over it', () => {
    const t = yard(Mat.Dirt, 600, 616, 400);
    const p = findPath(t, 500, FLOOR, 760, FLOOR);
    expect(p.reached).toBe(true);
    expect(p.pts.some((q) => q.dig)).toBe(true);
    expect(Math.min(...p.pts.map((q) => q.y))).toBeGreaterThan(FLOOR - 120);
  });

  it('boxed in by cement, a partial path still heads toward the goal', () => {
    const t = yard(Mat.Cement, 600, 640, 1000);
    const p = findPath(t, 500, FLOOR, 760, FLOOR, 3000);
    expect(p.reached).toBe(false);
    expect(p.pts.at(-1)!.x).toBeGreaterThan(560);
  });
});

describe('deadland bots', () => {
  it('a Regicide wave on the deadland: bots work their way across without digging into the cement', () => {
    let world: World | null = null;
    for (let s = 1; s < 60 && !world; s++) {
      const w = new World(s, { mode: 'ffa', bots: 8, rotation: [GameMode.Regicide], tanks: false });
      w.addPlayer('watcher', { send() {} });
      for (let k = 0; k < 3000 && w.phase !== Phase.Live; k++) w.step();
      if (lastBiome === Biome.Deadland) world = w;
    }
    const w = world!;
    const cement = () => {
      let n = 0;
      for (let i = 0; i < w.terrain.mat.length; i += 2) if (w.terrain.mat[i] === Mat.Cement) n++;
      return n;
    };
    const before = cement();
    const crossed = [false, false];
    for (let k = 0; k < 30 * 90 && w.phase === Phase.Live && !(crossed[0] && crossed[1]); k++) {
      w.step();
      for (const p of w.players) if (p && p.bot && p.alive && (p.team === Team.Red ? p.cx > WORLD_W / 2 : p.cx < WORLD_W / 2)) crossed[p.team] = true;
    }
    expect(w.phase === 3 || (crossed[0] && crossed[1])).toBe(true);
    // (Gunfire chips a little; nobody bored through a monument.)
    expect(before - cement()).toBeLessThan(before * 0.01);
  }, 120_000);
});
