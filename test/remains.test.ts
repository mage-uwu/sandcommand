import { describe, expect, it } from 'vitest';
import { WORLD_W } from '../src/shared/constants.ts';
import { Collider, DistanceField } from '../src/shared/field.ts';
import { Mat } from '../src/shared/materials.ts';
import { PK, Particles } from '../src/shared/particles.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { DT } from '../src/shared/constants.ts';
import { Game } from '../src/client/game.ts';

/** A rock floor at y 600. */
function floor(t: Terrain): void {
  for (let x = 0; x < WORLD_W; x++) for (let y = 600; y < 620; y++) t.mat[y * WORLD_W + x] = Mat.Rock;
  t.rebuildAllPlanes();
}

describe('gibs settle into the ground', () => {
  it('a gib that comes to rest is buried (handed on to become part of the ground), not faded out', () => {
    const t = new Terrain();
    floor(t);
    const f = new DistanceField(t);
    f.update();
    const col = new Collider(t, f);
    const p = new Particles(64);
    p.spawn(PK.Gib, 500, 580, 30, 0, 30 * 20, 3, 7);
    const buried: { x: number; y: number; aux: number; color: number }[] = [];
    let ticks = 0;
    for (; ticks < 30 * 10 && p.n; ticks++) p.step(col, DT, { bury: (x, y, _s, aux, color) => buried.push({ x, y, aux, color }) });
    expect(buried.length).toBe(1);
    expect(p.n).toBe(0);
    // Lying on the floor, where it came to rest: its piece and colour as drawn.
    expect(buried[0].y).toBeGreaterThan(590);
    expect(buried[0].y).toBeLessThan(600);
    expect(buried[0].aux).toBe(3);
    expect(buried[0].color).toBe(7);
    // (Well before its life ran out: it settled, then went in.)
    expect(ticks).toBeLessThan(30 * 5);
  });

  it('with nothing to bury it (the server), a resting gib fades out as before', () => {
    const t = new Terrain();
    floor(t);
    const f = new DistanceField(t);
    f.update();
    const col = new Collider(t, f);
    const p = new Particles(64);
    p.spawn(PK.Gib, 500, 590, 0, 0, 90, 3, 7);
    for (let k = 0; k < 89; k++) p.step(col, DT, {});
    expect(p.n).toBe(1);
    for (let k = 0; k < 4; k++) p.step(col, DT, {});
    expect(p.n).toBe(0);
  });

  it("a dead creature's segment, settled, is queued to go into the ground; a blast knocks remains loose", () => {
    const game = new Game();
    floor(game.terrain);
    game.segmentGibs.push({ x: 700, y: 596, vx: 0, vy: 0, a: 0, va: 0, kind: 0, seed: 1, i: 2, life: 30 * 20 });
    for (let k = 0; k < 60 && game.segmentGibs.length; k++) game.localTick(0, 0, () => {});
    expect(game.segmentGibs.length).toBe(0);
    expect(game.buriedSegments.length).toBe(1);
    expect(game.buriedSegments[0].kind).toBe(0);
    // Remains in the ground (as the renderer stamps them), then a blast there.
    for (let x = 695; x < 705; x++) game.remains.set(598 * WORLD_W + x, 0xff3040a0);
    game.remains.set(598 * WORLD_W + 900, 0xff3040a0);
    game.carved(700, 600, 6, 1, 0, [700, 600, Mat.Rock], []);
    expect([...game.remains.keys()]).toEqual([598 * WORLD_W + 900]); // (the far one's untouched)
  });
});
