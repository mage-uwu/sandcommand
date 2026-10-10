import { describe, expect, it } from 'vitest';
import { ACTOR_H, ACTOR_W, WORLD_W } from '../src/shared/constants.ts';
import { rubbleOf } from '../src/shared/particles.ts';
import { MAT_ADAMANT, MAT_COLOR, MAT_HARD, MAT_LOOSE, MAT_NAME, Mat, isDeadGround } from '../src/shared/materials.ts';
import { GameMode, Phase, Team } from '../src/shared/protocol.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { Biome, MapKind, biomeOf, generateWorld, lastBiome, lastBuried, lastComplexes, lastFlora, lastMonuments } from '../src/shared/worldgen.ts';
import { World } from '../src/server/world.ts';

/** The first seed (from `from`) whose map of `kind` is deadland. */
const deadSeed = (kind: number, from = 1) => {
  for (let s = from; ; s++) if (biomeOf(s, kind) === Biome.Deadland) return s;
};

describe('the deadland', () => {
  it('has its own materials: trinitite glass, gravel, ash, char and the Progenitors\' cement', () => {
    const dead = [Mat.Glass, Mat.Gravel, Mat.Ash, Mat.Char, Mat.Cement];
    expect(dead.map((m) => MAT_NAME[m])).toEqual(['trinitite', 'gravel', 'ash', 'char', 'cement']);
    for (const m of dead) {
      expect(MAT_COLOR[m]).toBeDefined();
      expect(isDeadGround(m)).toBe(true);
    }
    expect(isDeadGround(Mat.Dirt)).toBe(false);
    expect(MAT_COLOR[Mat.Glass][1]).toBeGreaterThan(MAT_COLOR[Mat.Glass][0] + 40); // green glass
    // Cement is hard and tough (the monuments shrug off small arms); gravel and ash pour.
    expect(MAT_HARD[Mat.Cement] && MAT_ADAMANT[Mat.Cement]).toBe(true);
    expect(MAT_LOOSE[Mat.Gravel] && MAT_LOOSE[Mat.Ash]).toBe(true);
    // Knocked loose, glass breaks to gravel and char crumbles to ash.
    expect(rubbleOf(Mat.Glass)).toBe(Mat.Gravel);
    expect(rubbleOf(Mat.Char)).toBe(Mat.Ash);
  });

  const t = new Terrain();
  const seed = deadSeed(MapKind.Plain);
  generateWorld(t, seed, MapKind.Plain);
  const monuments = [...lastMonuments];
  const complexes = [...lastComplexes];
  const flora = [...lastFlora];
  const buried = [...lastBuried];

  it('a crust of debris over the marslike deep, tens of feet to a couple of hundred', () => {
    expect(lastBiome).toBe(Biome.Deadland);
    const depths: number[] = [];
    let deadTop = 0;
    let cols = 0;
    for (let x = 40; x < WORLD_W - 40; x += 7) {
      const y0 = t.surfaceY(x);
      if (monuments.some((o) => Math.abs(o.x - x) < 90) || complexes.some((c) => x > c.x0 - 20 && x < c.x1 + 20)) continue; // (not through a monument's foot, or a ruin)
      cols++;
      if ([1, 4, 8].some((d) => isDeadGround(t.get(x, y0 + d)))) deadTop++;
      let y = y0;
      while (y < y0 + 400 && (isDeadGround(t.get(x, y)) || t.get(x, y) === Mat.Air || t.get(x, y) === Mat.Concrete || t.get(x, y) === Mat.Cobble || t.get(x, y) === Mat.Glyph)) y++;
      depths.push(y - y0);
    }
    expect(cols).toBeGreaterThan(5);
    expect(deadTop / cols).toBeGreaterThan(0.8);
    expect(Math.min(...depths)).toBeGreaterThan(30);
    expect(Math.max(...depths)).toBeLessThan(400);
    // And under it the marslike ground, as everywhere.
    const deep = new Map<number, number>();
    for (let x = 100; x < WORLD_W - 100; x += 50) {
      const m = t.get(x, t.surfaceY(x) + 380);
      deep.set(m, (deep.get(m) ?? 0) + 1);
    }
    expect([...deep.keys()].some((m) => !isDeadGround(m))).toBe(true);
  });

  it('it was civilised once: buried concrete buildings, steel rubble, and a few ruins breaking the surface', () => {
    expect(buried.length).toBeGreaterThanOrEqual(8);
    expect(buried.some((b) => b.exposed)).toBe(true);
    expect(buried.some((b) => !b.exposed)).toBe(true);
    for (const f of buried) {
      const b = { ...f, x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.w), h: Math.round(f.h) };
      // Each one's shell is old concrete: count it in its box.
      let shell = 0;
      for (let y = b.y - (b.h >> 1); y < b.y + (b.h >> 1); y++) for (let x = b.x - (b.w >> 1); x < b.x + (b.w >> 1); x++) if (t.get(x, y) === Mat.OldConcrete) shell++;
      expect(shell).toBeGreaterThan(b.w * 4);
    }
    // The exposed ones' broken tops stand out of the ground: their concrete is what's on top
    // (unless a monument has come down on it).
    const exposed = buried.filter((b) => b.exposed);
    const showing = exposed.filter((b) => {
      let top = 0;
      for (let x = Math.round(b.x - b.w / 2); x < b.x + b.w / 2; x++) if (t.get(x, t.surfaceY(x)) === Mat.OldConcrete) top++;
      return top > b.w / 4;
    });
    expect(showing.length).toBeGreaterThanOrEqual(Math.ceil(exposed.length / 2));
    // Rusted steel all through the crust: beams, rebar, steel frames.
    let rust = 0;
    for (let i = 0; i < t.mat.length; i += 3) if (t.mat[i] === Mat.Rust) rust++;
    expect(rust).toBeGreaterThan(500);
    expect(MAT_HARD[Mat.OldConcrete] && MAT_HARD[Mat.Rust]).toBe(true);
    expect(rubbleOf(Mat.OldConcrete)).toBe(Mat.Gravel);
  });

  it('every monument is anchored in a footing of softer pour, and pour seals the dust here and there', () => {
    let pour = 0;
    for (let i = 0; i < t.mat.length; i++) if (t.mat[i] === Mat.Pour) pour++;
    expect(pour).toBeGreaterThan(4000);
    expect(MAT_HARD[Mat.Pour]).toBe(false); // softer than the cement it holds
    // Pour beside the foot of most caltrops.
    const caltrops = monuments.filter((o) => o.kind === 'caltrop');
    const anchored = caltrops.filter((c) => {
      for (let x = c.x - 260; x <= c.x + 260; x += 2) for (let y = c.y; y < c.y + 360; y++) if (t.get(x, y) === Mat.Pour) return true;
      return false;
    });
    expect(anchored.length).toBeGreaterThanOrEqual(caltrops.length * 0.7);
    // Some of it lies over the dust: pour, with ash, gravel or char straight under it.
    let over = 0;
    for (let x = 8; x < WORLD_W - 8; x++) {
      // (Under whatever stands on it: the first pour down the column.)
      let y = t.surfaceY(x);
      while (y < 900 && t.get(x, y) !== Mat.Pour) y++;
      if (y >= 900) continue;
      while (t.get(x, y) === Mat.Pour) y++;
      if ([Mat.Ash, Mat.Gravel, Mat.Char, Mat.Glass].includes(t.get(x, y) as never)) over++;
    }
    expect(over).toBeGreaterThan(100);
  });

  it('the monuments\' cement all but shrugs off a digger: one cell at a time, where concrete gives up a hole', () => {
    const dig = (m: number) => {
      const tt = new Terrain();
      for (let y = 500; y < 540; y++) for (let x = 500; x < 540; x++) tt.set(x, y, m);
      return tt.carve(520, 520, 5, 2);
    };
    expect(dig(Mat.Cement)).toBeLessThanOrEqual(1);
    expect(dig(Mat.Concrete)).toBeGreaterThan(8);
    expect(dig(Mat.Pour)).toBeGreaterThan(40); // soft
  });

  it('nothing grows on it: no grass, no flora on the crust', () => {
    let grass = 0;
    for (let x = 8; x < WORLD_W - 8; x += 3) if (t.get(x, t.surfaceY(x)) === Mat.Grass) grass++;
    expect(grass).toBe(0);
    for (const f of flora) expect(isDeadGround(t.get(f.x, f.y))).toBe(false);
  });

  it('a landscape of thorns: menacing cement caltrops dwarfing a clone, with slabs and spikes', () => {
    expect(monuments.length).toBeGreaterThanOrEqual(6);
    const caltrops = monuments.filter((o) => o.kind === 'caltrop');
    expect(caltrops.length).toBeGreaterThanOrEqual(monuments.length / 2); // caltrops above all
    // Measure each caltrop's cement: how far it stands above the ground beside it.
    let colossal = 0;
    for (const c of caltrops) {
      let top = c.y;
      for (let x = c.x - 160; x <= c.x + 160; x++) for (let y = Math.max(0, c.y - 320); y < c.y; y++) if (t.get(x, y) === Mat.Cement && y < top) top = y;
      const ground = Math.min(t.surfaceY(c.x - 340), t.surfaceY(c.x + 340));
      if (ground - top > ACTOR_H * 8) colossal++;
    }
    expect(colossal).toBeGreaterThan(0);
    // Balanced wrong, but they'd stand: the hub (the centre of mass) between two feet or more, or right over a single one.
    for (const c of caltrops) {
      const feet = c.feet!;
      expect(feet.length).toBeGreaterThan(0);
      if (feet.length >= 2) {
        expect(c.x).toBeGreaterThanOrEqual(Math.min(...feet));
        expect(c.x).toBeLessThanOrEqual(Math.max(...feet));
      } else expect(Math.abs(feet[0] - c.x)).toBeLessThanOrEqual(c.w! * 0.4);
    }
    // Solid cement: every caltrop's hub is a block of it.
    for (const c of caltrops) expect(t.get(c.x, c.y)).toBe(Mat.Cement);
  });

  it('no bunkers, no works: ancient ruins, small and tunnelled, are all that is built', () => {
    expect(complexes.length).toBeGreaterThanOrEqual(4);
    for (const c of complexes) {
      expect(c.ruin).toBe(true);
      expect(c.tower).toBeFalsy();
      expect(c.x1 - c.x0).toBeLessThan(560); // a passage, not a bunker block
    }
    let glyph = 0;
    for (const c of complexes) for (let x = c.x0; x < c.x1; x++) for (let y = c.floor - 60; y < c.floor + 220; y++) if (t.get(x, y) === Mat.Glyph) glyph++;
    expect(glyph).toBeGreaterThan(100);
    let concrete = 0;
    for (let i = 0; i < t.mat.length; i += 5) if (t.mat[i] === Mat.Concrete || t.mat[i] === Mat.Metal) concrete++;
    expect(concrete).toBe(0);
  });

  it('Regicide on the deadland: the two fortresses are deep ruins, red west and green east, each with a king\'s chamber', () => {
    const s = deadSeed(MapKind.Fortress);
    const ft = new Terrain();
    generateWorld(ft, s, MapKind.Fortress);
    expect(lastBiome).toBe(Biome.Deadland);
    const forts = lastComplexes.filter((c) => c.fortress);
    expect(forts.length).toBe(2);
    const [west, east] = forts;
    expect(west.fortress!.team).toBe(Team.Red);
    expect(east.fortress!.team).toBe(Team.Green);
    expect(west.x1).toBeLessThan(WORLD_W / 2);
    expect(east.x0).toBeGreaterThan(WORLD_W / 2);
    for (const f of forts) {
      expect(f.ruin).toBe(true);
      const k = f.fortress!.king;
      const x = Math.floor(k.x - ACTOR_W / 2);
      expect(ft.rectSolid(x, k.y - ACTOR_H, x + ACTOR_W - 1, k.y - 1)).toBe(false); // room to stand
      expect(ft.isSolid(k.x, k.y)).toBe(true); // on a floor
      expect(k.y).toBeGreaterThan(ft.surfaceY(k.x) + 20); // underground
      expect(f.fortress!.spawns.length).toBeGreaterThanOrEqual(3);
      for (const sp of f.fortress!.spawns) {
        const sx = Math.floor(sp.x - ACTOR_W / 2);
        expect(ft.rectSolid(sx, sp.y - ACTOR_H, sx + ACTOR_W - 1, sp.y - 1)).toBe(false);
      }
    }
  });

  it('a deadland Regicide wave plays: kings crowned in their ruins, bots out across the thorns', () => {
    let world: World | null = null;
    for (let s = 1; s < 60 && !world; s++) {
      const w = new World(s, { mode: 'ffa', bots: 8, rotation: [GameMode.Regicide], tanks: false });
      w.addPlayer('watcher', { send() {} });
      for (let k = 0; k < 3000 && w.phase !== Phase.Live; k++) w.step();
      if (lastBiome === Biome.Deadland) world = w;
    }
    expect(world).not.toBeNull();
    const w = world!;
    expect(w.phase).toBe(Phase.Live);
    for (const team of [Team.Red, Team.Green]) {
      const king = w.players[w.kings[team]]!;
      expect(king.team).toBe(team);
      const f = w.fortresses[team];
      expect(Math.abs(king.cx - f.king.x)).toBeLessThan(120);
    }
    // Out of their ruins and across the landscape of thorns: each side's bots reach the other half of the map.
    const crossed = [false, false];
    for (let k = 0; k < 30 * 120 && w.phase === Phase.Live && !(crossed[0] && crossed[1]); k++) {
      w.step();
      for (const p of w.players) if (p && p.bot && p.alive && (p.team === Team.Red ? p.cx > WORLD_W / 2 : p.cx < WORLD_W / 2)) crossed[p.team] = true;
    }
    expect(w.phase === Phase.Victory || (crossed[0] && crossed[1])).toBe(true);
  }, 120_000);
});
