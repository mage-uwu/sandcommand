import { describe, expect, it } from 'vitest';
import { DT, WORLD_W } from '../src/shared/constants.ts';
import { Collider, DistanceField } from '../src/shared/field.ts';
import { Mat } from '../src/shared/materials.ts';
import { PK, Particles } from '../src/shared/particles.ts';
import { Terrain } from '../src/shared/terrain.ts';

function flatWorld(): { t: Terrain; col: Collider; field: DistanceField } {
  const t = new Terrain();
  for (let x = 0; x < WORLD_W; x++) for (let y = 800; y < 1024; y++) t.mat[y * WORLD_W + x] = Mat.Bedrock;
  t.rebuildAllPlanes();
  const field = new DistanceField(t);
  field.update();
  return { t, col: new Collider(t, field), field };
}

describe('unified particle engine', () => {
  it('runs every kind in one pass with per-kind behaviour', () => {
    const { col } = flatWorld();
    const p = new Particles(64);
    p.spawn(PK.Smoke, 500, 400, 0, 0, 90);
    p.spawn(PK.Flame, 520, 400, 0, 0, 90);
    p.spawn(PK.Spark, 540, 780, 0, 200, 90); // fired at the floor
    p.spawn(PK.Blood, 560, 780, 0, 200, 90);
    const stains: number[][] = [];
    for (let k = 0; k < 20; k++) p.step(col, DT, { stain: (x, y) => stains.push([x, y]) });
    const yOf = (kind: number) => {
      for (let i = 0; i < p.n; i++) if (p.kind[i] === kind) return p.y[i];
      return NaN;
    };
    expect(yOf(PK.Smoke)).toBeLessThan(400); // buoyant: rises
    expect(yOf(PK.Flame)).toBeLessThan(400);
    expect(p.count(PK.Blood)).toBe(0); // blood hit the floor ...
    expect(stains.length).toBe(1); // ... and stained it
    expect(stains[0][1]).toBe(800);
    expect(p.count(PK.Spark)).toBe(1); // still bouncing (e = 0.55) ...
    for (let k = 0; k < 60; k++) p.step(col, DT);
    expect(p.count(PK.Spark)).toBe(0); // ... until it is spent
  });

  it('a blast is a field: it pushes everything nearby outward, then decays', () => {
    const { col } = flatWorld();
    const p = new Particles(64);
    p.spawn(PK.Smoke, 480, 500, 0, 0, 300);
    p.spawn(PK.Smoke, 520, 500, 0, 0, 300);
    p.spawnGrain(480, 480, 0, 0, Mat.Sand, 300); // in the blast, up-left of centre
    p.spawnGrain(1500, 480, 0, 0, Mat.Sand, 300); // control, far away
    p.blast(500, 500, 60, 260);
    p.step(col, DT);
    expect(p.vx[0]).toBeLessThan(-10); // left of centre: pushed left
    expect(p.vx[1]).toBeGreaterThan(10); // right of centre: pushed right
    expect(p.vx[2]).toBeLessThan(-3); // heavy grains feel it too, less
    for (let k = 0; k < 6; k++) p.step(col, DT);
    expect(p.y[2]).toBeLessThan(p.y[3] - 2); // lifted relative to an undisturbed grain
    for (let k = 0; k < 40; k++) p.step(col, DT);
    expect((p as unknown as { airCells: number[] }).airCells.length).toBe(0); // air went quiet
  });

  it('light particles ride the mass flow of grains', () => {
    const { col } = flatWorld();
    const p = new Particles(4096);
    // A dense column of sand falling fast, with a smoke puff in the middle of it.
    for (let i = 0; i < 400; i++) p.spawnGrain(600 + (i % 4), 300 + i * 0.05, 0, 300, Mat.Sand, 600);
    p.spawn(PK.Smoke, 601.5, 310, 0, 0, 300);
    const smoke = p.n - 1;
    const y0 = p.y[smoke];
    for (let k = 0; k < 5; k++) p.step(col, DT);
    // Smoke alone rises; carried by the sand stream it is dragged down.
    let ys = NaN;
    for (let i = 0; i < p.n; i++) if (p.kind[i] === PK.Smoke) ys = p.y[i];
    expect(ys).toBeGreaterThan(y0 + 10);
  });

  it('gibs come to rest and then cost only a support check', () => {
    const { col } = flatWorld();
    const p = new Particles(16);
    p.spawn(PK.Gib, 500, 700, 40, 0, 900, 1, 0xff0000);
    for (let k = 0; k < 120; k++) p.step(col, DT);
    expect(p.count(PK.Gib)).toBe(1);
    expect(p.rest[0]).toBe(1);
    expect(p.y[0]).toBeGreaterThan(795);
    expect(p.y[0]).toBeLessThan(800);
  });
});
