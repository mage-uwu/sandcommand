import { describe, expect, it } from 'vitest';
import { ACTOR_H, ACTOR_W, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { MOD_H, MOD_W, SLAB, Style, TOWER_W } from '../src/shared/structures.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { Biome, generateWorld, lastBiome, lastComplexes } from '../src/shared/worldgen.ts';
import { WeaponId } from '../src/shared/weapons.ts';
import { bannerLines, layoutSub } from '../src/client/banner.ts';

/** Air cells reachable from (x, y) inside a box (4-connected flood fill). */
function flood(t: Terrain, x: number, y: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const w = x1 - x0;
  const seen = new Uint8Array(w * (y1 - y0));
  const stack = [x, y];
  while (stack.length) {
    const cy = stack.pop()!;
    const cx = stack.pop()!;
    if (cx < x0 || cy < y0 || cx >= x1 || cy >= y1) continue;
    const i = (cy - y0) * w + (cx - x0);
    if (seen[i] || t.isSolid(cx, cy)) continue;
    seen[i] = 1;
    stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
  }
  return seen;
}

describe('bunker complexes', () => {
  const t = new Terrain();

  it('cover roughly 10-60% of gentle ground, varying from map to map; rugged maps get sniper towers instead', () => {
    const seen: number[] = [];
    for (let seed = 100; seed < 120; seed++) {
      generateWorld(t, seed);
      let built = 0;
      for (const c of lastComplexes) if (!c.tower) built += c.x1 - c.x0;
      const cover = built / (WORLD_W - 192);
      if (lastBiome === Biome.Dunes || lastBiome === Biome.Meadows) {
        seen.push(cover);
        expect(cover).toBeGreaterThanOrEqual(0.08);
        expect(cover).toBeLessThanOrEqual(0.6);
      } else expect(lastComplexes.filter((c) => c.tower).length).toBeGreaterThanOrEqual(3);
    }
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.15);
  });

  it('sit on the modular grid and are made of concrete and metal', () => {
    generateWorld(t, 7);
    expect(lastComplexes.length).toBeGreaterThan(3);
    for (const c of lastComplexes) {
      if (c.tower) continue;
      expect((c.x0 - 96) % MOD_W).toBe(0);
      expect((c.x1 - c.x0) % MOD_W).toBe(0);
      // Floor slab of concrete, metal roof on the first module (some modules
      // come pre-shot, so look at most of each, not one cell).
      let slab = 0;
      for (let x = c.x0; x < c.x1; x++) if (t.get(x, c.floor + 1) === Mat.Concrete) slab++;
      expect(slab / (c.x1 - c.x0)).toBeGreaterThan(0.6);
      // Metal roofs (the best-kept one, since modules come pre-shot; a ruin's may be gone entirely).
      let best = 0;
      for (let k = 0; k < c.heights.length; k++) {
        const top = c.floor - c.heights[k] * MOD_H;
        let roof = 0;
        for (let x = c.x0 + k * MOD_W; x < c.x0 + (k + 1) * MOD_W; x++) if (t.get(x, top + 1) === Mat.Metal) roof++;
        best = Math.max(best, roof / MOD_W);
      }
      if (c.style !== Style.Ruined) expect(best).toBeGreaterThan(0.4);
    }
  });

  it('can be entered: every room, storey and basement is reachable from outside', () => {
    for (const seed of [7, 8, 9]) {
      generateWorld(t, seed);
      for (const c of lastComplexes) {
        if (c.tower) continue;
        const top = c.floor - Math.max(...c.heights) * MOD_H - 24; // (clear of any battlements)
        const bottom = c.floor + SLAB + Math.max(...c.basements) * MOD_H + 4;
        const x0 = c.x0 - 260;
        const x1 = c.x1 + 260;
        // From the open sky above the complex, through doors, holes and shafts.
        const reach = flood(t, Math.floor((c.x0 + c.x1) / 2), top, x0, top, x1, bottom);
        const at = (x: number, y: number) => reach[(y - top) * (x1 - x0) + (x - x0)] === 1;
        // Somewhere across a room's floor, reachable (rubble heaps and gold bars may sit on parts of it).
        const reachedAcross = (mx: number, y: number) => {
          for (let x = mx + 2 * SLAB; x < mx + MOD_W - 2 * SLAB; x++) if (at(x, y)) return true;
          return false;
        };
        for (let k = 0; k < c.heights.length; k++) {
          // Inside each ground-floor room, at standing height, with room for a clone.
          const rx = c.x0 + k * MOD_W + 2 * SLAB + 4;
          let room = false;
          for (let x = rx; x < c.x0 + (k + 1) * MOD_W - 2 * SLAB - ACTOR_W && !room; x += 2) room = !t.rectSolid(x, c.floor - ACTOR_H, x + ACTOR_W - 1, c.floor - 1);
          expect(room).toBe(true);
          expect(reachedAcross(c.x0 + k * MOD_W, c.floor - 2)).toBe(true);
          for (let j = 0; j < c.basements[k]; j++) {
            const by = c.floor + SLAB + j * MOD_H + MOD_H - SLAB - 2;
            expect(reachedAcross(c.x0 + k * MOD_W, by)).toBe(true);
          }
        }
      }
    }
  });

  it('come in styles, with grand halls, steel bank vaults full of gold, and loot', () => {
    const styles = new Set<number>();
    let halls = 0;
    let vaults = 0;
    for (let seed = 100; seed < 112; seed++) {
      generateWorld(t, seed);
      for (const c of lastComplexes) {
        if (c.tower) continue;
        styles.add(c.style!);
        for (const h of c.halls ?? []) {
          halls++;
          expect(h.y1 - h.y0).toBeGreaterThan(MOD_H * 1.5); // two storeys tall
          expect(h.x1 - h.x0).toBeGreaterThan(MOD_W * 1.5); // two modules wide
          expect(c.loot?.some((l) => l.x > h.x0 && l.x < h.x1)).toBe(true);
        }
        for (const v of c.vaults ?? []) {
          vaults++;
          let gold = 0;
          let steel = 0;
          for (let x = v.x0; x < v.x1; x++) {
            for (let y = v.y0; y < v.y1; y++) if (t.get(x, y) === Mat.Gold) gold++;
            if (t.get(x, v.y1 - 1) === Mat.Metal) steel++;
          }
          expect(gold).toBeGreaterThan(20);
          expect(steel / (v.x1 - v.x0)).toBeGreaterThan(0.5);
        }
      }
    }
    expect(styles.size).toBe(4);
    expect(halls).toBeGreaterThan(5);
    expect(vaults).toBeGreaterThan(5);
    void Style;
  });

  it('sniper towers: every storey and the roof reachable from the ground, a sniper rifle up top', () => {
    let towers = 0;
    for (const seed of [100, 101, 103, 104]) {
      generateWorld(t, seed);
      for (const c of lastComplexes) {
        if (!c.tower) continue;
        towers++;
        expect(c.x1 - c.x0).toBe(TOWER_W);
        const storeys = c.heights[0];
        expect(storeys).toBeGreaterThanOrEqual(3);
        const roof = c.floor - storeys * MOD_H;
        // From the ground beside its door.
        const x0 = c.x0 - 60;
        const x1 = c.x1 + 60;
        const reach = flood(t, c.x0 + 8, c.floor - 3, x0, roof - 40, x1, c.floor);
        const at = (x: number, y: number) => reach[(y - (roof - 40)) * (x1 - x0) + (x - x0)] === 1;
        for (let lv = 0; lv < storeys; lv++) {
          let any = false;
          for (let x = c.x0 + 8; x < c.x1 - 8 && !any; x++) any = at(x, c.floor - lv * MOD_H - 3);
          expect(any).toBe(true);
        }
        expect(c.loot?.[0].weapon).toBe(WeaponId.Sniper);
        expect(c.loot![0].y).toBeLessThan(roof);
      }
    }
    expect(towers).toBeGreaterThan(5);
  });

  it('come out the same from the same seed', () => {
    generateWorld(t, 42);
    const a = JSON.stringify(lastComplexes);
    const h = t.chunkHash(400);
    generateWorld(t, 42);
    expect(JSON.stringify(lastComplexes)).toBe(a);
    expect(t.chunkHash(400)).toBe(h);
  });
});

describe('centre-screen banners', () => {
  // (One "pixel" per character, for the test.)
  const measure = (t: string) => t.length;
  it('take the first segment as the headline and pack the rest into lines that fit', () => {
    const l = layoutSub('reinforcements in 4s by drop rocket · spectating Rex · click for next', 30, measure);
    expect(l.head).toBe('reinforcements in 4s by drop rocket');
    expect(l.hints.length).toBeGreaterThanOrEqual(1);
    for (const h of l.hints) expect(h.length).toBeLessThanOrEqual(30);
    expect(l.hints.join(' ')).toContain('spectating Rex');
    expect(l.hints.join(' ')).toContain('click for next');
  });
  it('break a hint too long for any line at spaces, and never overflow', () => {
    const long = 'extraction · four teams · bring the golden idol up from the bottom of the labyrinth';
    const l = layoutSub(long, 24, measure);
    expect(l.head).toBe('extraction');
    for (const h of l.hints) expect(h.length).toBeLessThanOrEqual(24);
    expect(l.hints.join(' ').replace(/ +· +/g, ' ')).toContain('bring the golden idol up from the bottom of the labyrinth'.split(' ').slice(0, 3).join(' '));
  });
  it('spell the title in five even rows of block letters', () => {
    const rows = bannerLines('Fragged 3!');
    expect(rows.length).toBe(5);
    expect(new Set(rows.map((r) => r.length)).size).toBe(1);
    expect(rows.join('')).toContain('█');
    expect(bannerLines('ab')[0].length).toBeGreaterThan(bannerLines('a')[0].length);
  });
  it('handle an empty subtitle', () => {
    expect(layoutSub('', 50, measure)).toEqual({ head: '', hints: [] });
  });
});
