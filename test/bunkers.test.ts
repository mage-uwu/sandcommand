import { describe, expect, it } from 'vitest';
import { BTN_RIGHT, STANCE_H, Stance } from '../src/shared/actor.ts';
import { ACTOR_H, WORLD_W } from '../src/shared/constants.ts';
import { BAGS_H, IRON, STEP_D, STRONGROOM_H, TOOTH_GAP, TOOTH_H, TOOTH_W, TRENCH_D, lastWorks } from '../src/shared/fortifications.ts';
import { invByte } from '../src/shared/items.ts';
import { MAT_TOUGH, Mat } from '../src/shared/materials.ts';
import { Team, quantizeAim } from '../src/shared/protocol.ts';
import { DOOR_H, SLAB, WALL } from '../src/shared/structures.ts';
import { TANK_H, TANK_STEP_UP, TANK_W, newTank } from '../src/shared/tank.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { MapKind, generateWorld, lastComplexes } from '../src/shared/worldgen.ts';
import { type Player, World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 400;

function yard(world: World): void {
  const t = world.terrain;
  for (let x = 300; x < 2400; x++) {
    for (let y = 60; y < FLOOR; y++) t.set(x, y, Mat.Air);
    for (let y = FLOOR; y < FLOOR + 20; y++) t.set(x, y, Mat.Bedrock);
  }
  world.terrainReplaced();
}

let seq = 0;
function send(world: World, p: Player, buttons: number, pickup = false): void {
  world.input(p.id, { seq: ++seq & 0xffff, buttons, aim: quantizeAim(0), inv: invByte(p.slot, p.invVersion, pickup) });
}

/** A block of `m`, `n` cells square, at (x, y). */
function block(t: Terrain, x: number, y: number, n: number, m: number): void {
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) t.set(x + i, y + j, m);
}

describe('pig iron', () => {
  it('a blast bites a quarter as much of it as of concrete', () => {
    const t = new Terrain();
    block(t, 500, 300, 60, Mat.Concrete);
    block(t, 900, 300, 60, Mat.Iron);
    const concrete = t.carve(530, 330, 20, 10);
    const iron = t.carve(930, 330, 20, 10);
    expect(MAT_TOUGH[Mat.Iron]).toBe(true);
    expect(iron).toBeGreaterThan(0);
    expect(iron / concrete).toBeGreaterThan(0.15);
    expect(iron / concrete).toBeLessThan(0.35);
    // The same carve, the same cells, on every replica.
    const u = new Terrain();
    block(u, 500, 300, 60, Mat.Concrete);
    block(u, 900, 300, 60, Mat.Iron);
    u.carve(530, 330, 20, 10);
    u.carve(930, 330, 20, 10);
    expect(Array.from(u.mat)).toEqual(Array.from(t.mat));
  });
});

describe('bunker works', () => {
  const t = new Terrain();
  const maps: { seed: number; kind: number }[] = [
    { seed: 5, kind: MapKind.Fortress },
    { seed: 7, kind: MapKind.Plain },
    { seed: 8, kind: MapKind.Plain },
    { seed: 101, kind: MapKind.Plain },
  ];

  it('steel doors in the bunkers\' outer doorways, each its side\'s (a fortress\'s always its own)', () => {
    let doors = 0;
    for (const { seed, kind } of maps) {
      generateWorld(t, seed, kind);
      for (const c of lastComplexes) {
        for (const d of c.doors ?? []) {
          doors++;
          expect(d.y1 - d.y0).toBe(DOOR_H);
          for (let y = d.y0; y < d.y1; y++) for (let x = d.x0; x < d.x1; x++) expect(t.get(x, y)).toBe(Mat.Door);
          if (c.fortress) expect(d.team).toBe(c.fortress.team);
          else expect(d.team).toBe((c.x0 + c.x1) / 2 < WORLD_W / 2 ? Team.Red : Team.Green);
        }
        if (c.fortress) expect(c.doors!.length).toBe(2); // both gates
      }
    }
    expect(doors).toBeGreaterThan(12);
  });

  it('reinforcing slabs against the outer walls, above the doors', () => {
    let slabs = 0;
    for (const { seed, kind } of maps) {
      generateWorld(t, seed, kind);
      for (const c of lastComplexes) {
        if (c.tower) continue;
        const y = c.floor - DOOR_H - 6;
        let thick = 0;
        for (let x = c.x0 - 1; t.get(x, y) === Mat.Concrete || t.get(x, y) === Mat.Metal; x--) thick++;
        if (thick >= 10) slabs++;
      }
    }
    expect(slabs).toBeGreaterThan(6);
  });

  it('strongrooms: a storey and a half of pig iron under the bunker, gold inside, a steel door', () => {
    let rooms = 0;
    for (let seed = 1; seed < 30 && rooms < 3; seed++) {
      generateWorld(t, seed);
      for (const c of lastComplexes) {
        const s = c.strongroom;
        if (!s) continue;
        rooms++;
        expect(c.vaults).toContain(s);
        expect(s.y0).toBeGreaterThan(c.floor + SLAB);
        expect(s.x1 - s.x0).toBeGreaterThan(100);
        expect(t.get(s.x0 - 1, s.y0 + 20)).toBe(Mat.Iron);
        expect(t.get(s.x1, s.y0 + 20)).toBe(Mat.Iron);
        expect(t.get((s.x0 + s.x1) >> 1, s.y0 - IRON)).toBe(Mat.Iron);
        let gold = 0;
        for (let y = s.y0; y < s.y1; y++) for (let x = s.x0; x < s.x1; x++) if (t.get(x, y) === Mat.Gold) gold++;
        expect(gold).toBeGreaterThan(30);
        // Its inner door, at the foot of the iron wall between antechamber and vault.
        expect(c.doors!.some((d) => d.y1 === s.y0 + STRONGROOM_H && d.x0 > s.x0 && d.x1 < s.x1)).toBe(true);
      }
    }
    expect(rooms).toBeGreaterThanOrEqual(3);
  });

  it('sandbags, trenches, dragon\'s teeth and iron blocks in the ground around them', () => {
    const n = { bags: 0, trenches: 0, teeth: 0, cubes: 0 };
    for (const { seed, kind } of maps) {
      generateWorld(t, seed, kind);
      const w = lastWorks;
      n.bags += w.sandbags.length;
      n.trenches += w.trenches.length;
      n.teeth += w.teeth.length;
      n.cubes += w.cubes.length;
      for (const b of w.sandbags) {
        // Hides a crouching clone, not a standing one.
        expect(b.y1 - b.y0).toBeGreaterThan(STANCE_H[Stance.Crouch]);
        expect(b.y1 - b.y0).toBeLessThan(ACTOR_H);
        expect(t.get((b.x0 + b.x1) >> 1, b.y1 - 2)).toBe(Mat.Sandbag);
      }
      for (const tr of w.trenches) {
        // Deep enough to stand in unseen; the fire step half way, so a standing clone looks out over the lip.
        expect(tr.floor - tr.ground).toBe(TRENCH_D);
        expect(tr.floor - tr.ground).toBeGreaterThan(ACTOR_H);
        expect(tr.step.y0 - tr.ground).toBe(STEP_D);
        expect(ACTOR_H - STEP_D).toBeGreaterThan(3);
        const mid = (tr.x0 + tr.x1) >> 1;
        expect(t.get(mid, tr.floor - 1)).toBe(Mat.Air);
        expect(t.get(mid, tr.ground + 2)).toBe(Mat.Air);
        expect(t.get(mid, tr.floor)).not.toBe(Mat.Air);
        const sx = (tr.step.x0 + tr.step.x1) >> 1;
        expect(t.get(sx, tr.step.y0 - 1)).toBe(Mat.Air);
        expect(t.get(sx, tr.step.y0)).not.toBe(Mat.Air);
      }
      for (const d of w.teeth) {
        expect(d.y1 - d.y0).toBe(TOOTH_H);
        expect(t.get(d.x0, d.y1 - TANK_STEP_UP - 3)).toBe(Mat.Concrete); // sheer: no tank climbs on (even off a bounce)
      }
      for (const b of w.cubes) expect(t.get((b.x0 + b.x1) >> 1, (b.y0 + b.y1) >> 1)).toBe(Mat.Iron);
    }
    expect(n.bags).toBeGreaterThan(10);
    expect(n.trenches).toBeGreaterThan(3);
    expect(n.teeth).toBeGreaterThan(9);
    expect(n.cubes).toBeGreaterThan(5);
  });

  it('a row of dragon\'s teeth stops a tank', () => {
    const world = new World(55);
    const p = world.addPlayer('driver', { send() {} })!;
    deliverAll(world, [p]);
    yard(world);
    const x0 = 900;
    for (let i = 0; i < 3; i++) {
      const tx = x0 + i * (TOOTH_W + TOOTH_GAP);
      for (let k = 0; k < TOOTH_W; k++) {
        const d = Math.abs(2 * k + 1 - TOOTH_W);
        const h = TOOTH_H - Math.floor((d * 6) / (TOOTH_W - 1));
        for (let y = FLOOR - h; y < FLOOR; y++) world.terrain.set(tx + k, y, Mat.Concrete);
      }
    }
    world.terrainReplaced();
    p.body.x = 700;
    p.body.y = FLOOR - ACTOR_H;
    world.tanks[0] = newTank(700, FLOOR - TANK_H - 2);
    for (let k = 0; k < 10; k++) world.step();
    send(world, p, 0, true);
    world.step();
    send(world, p, 0, false);
    world.step();
    expect(p.tank).toBe(0);
    const tank = world.tanks[0]!;
    for (let k = 0; k < 30 * 8; k++) {
      send(world, p, BTN_RIGHT);
      world.step();
    }
    expect(tank.x + TANK_W).toBeLessThanOrEqual(x0 + 1); // (still short of the first tooth)
    expect(tank.x).toBeGreaterThan(800); // (it got there)
  });
});

describe('bunker doors', () => {
  function doorYard(teams: number[]) {
    const world = new World(57);
    const ps = teams.map((_, i) => world.addPlayer(`p${i}`, { send() {} })!);
    deliverAll(world, ps);
    yard(world);
    // A wall with a doorway, a door in it (red's).
    const dx = 1000;
    for (let y = FLOOR - 120; y < FLOOR; y++) for (let x = dx; x < dx + WALL; x++) world.terrain.set(x, y, y >= FLOOR - DOOR_H ? Mat.Door : Mat.Concrete);
    world.terrainReplaced();
    world.doors = [{ x0: dx, y0: FLOOR - DOOR_H, x1: dx + WALL, y1: FLOOR, team: Team.Red, open: 0, broken: false }];
    ps.forEach((p, i) => {
      p.team = teams[i];
      p.body.x = 600;
      p.body.y = FLOOR - ACTOR_H;
      p.body.vx = p.body.vy = 0;
    });
    return { world, ps, door: world.doors[0] };
  }
  const shut = (world: World, x: number) => world.terrain.get(x, FLOOR - 2) === Mat.Door && world.terrain.get(x, FLOOR - DOOR_H) === Mat.Door;
  const walkTo = (world: World, p: Player, x: number) => {
    for (let k = 0; k < 40; k++) {
      p.body.x = x;
      p.body.y = FLOOR - ACTOR_H;
      p.body.vx = 0;
      world.step();
    }
  };

  it('slides up for its own side, and shuts again behind them', () => {
    const { world, ps, door } = doorYard([Team.Red]);
    expect(shut(world, door.x0)).toBe(true);
    walkTo(world, ps[0], door.x0 - 14);
    expect(door.open).toBe(DOOR_H);
    for (let y = door.y0; y < door.y1; y++) expect(world.terrain.get(door.x0 + 2, y)).toBe(Mat.Air);
    // Through it and away: it comes back down.
    walkTo(world, ps[0], door.x0 + 200);
    expect(door.open).toBe(0);
    expect(shut(world, door.x0)).toBe(true);
    expect(door.broken).toBe(false);
  });

  it('stays shut for the enemy; in a free-for-all it opens for anyone', () => {
    const a = doorYard([Team.Green]);
    walkTo(a.world, a.ps[0], a.door.x0 - 14);
    expect(a.door.open).toBe(0);
    expect(shut(a.world, a.door.x0)).toBe(true);
    const b = doorYard([Team.None]);
    walkTo(b.world, b.ps[0], b.door.x0 - 14);
    expect(b.door.open).toBe(DOOR_H);
  });

  it('won\'t shut on a clone standing in the doorway; blown open, it stays open', () => {
    const { world, ps, door } = doorYard([Team.Red, Team.Green]);
    walkTo(world, ps[0], door.x0 - 14);
    expect(door.open).toBe(DOOR_H);
    // The friend goes; an enemy slips into the doorway before it shuts.
    ps[0].body.x = 200;
    walkTo(world, ps[1], door.x0 - 1);
    expect(door.open).toBe(DOOR_H);
    // Away from it: it shuts. Then a blast takes a bite out of it.
    walkTo(world, ps[1], 300);
    expect(door.open).toBe(0);
    world.carve(door.x0 + 3, door.y0 + 10, 6, 6, 0);
    world.step();
    expect(door.broken).toBe(true);
    walkTo(world, ps[0], door.x0 - 14);
    expect(world.terrain.get(door.x0 + 3, door.y1 - 2)).toBe(Mat.Door); // (no longer works)
  });
});
