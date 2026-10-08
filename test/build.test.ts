import { describe, expect, it } from 'vitest';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, WORLD_W } from '../src/shared/constants.ts';
import { BUILD_GRID, BUILD_REACH, BuildResult, PIECES, applyBuild, canBuild } from '../src/shared/build.ts';
import { Mat } from '../src/shared/materials.ts';
import { applyCarve } from '../src/shared/particles.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { WeaponId } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

const GROUND = 400;
function flat(t: Terrain): void {
  for (let x = 0; x < WORLD_W; x++) {
    for (let y = 0; y < GROUND; y++) if (t.get(x, y) !== Mat.Air) t.set(x, y, Mat.Air);
    for (let y = GROUND; y < GROUND + 20; y++) t.set(x, y, Mat.Bedrock);
  }
}
const piece = (name: string) => PIECES.findIndex((p) => p.name === name);
const BUNKER = piece('Bunker');
const BLOCK = piece('Block');

describe('placement rules', () => {
  const t = new Terrain();
  flat(t);
  const sx = 500;
  const sy = GROUND - 10;
  const onGround = (i: number) => GROUND - PIECES[i].h;

  it('accepts a piece standing on the ground within reach, with the gold', () => {
    expect(canBuild(t, BUNKER, 520, onGround(BUNKER), sx, sy, 60, [])).toBe(BuildResult.Ok);
  });
  it('costs gold', () => {
    expect(canBuild(t, BUNKER, 520, onGround(BUNKER), sx, sy, 59, [])).toBe(BuildResult.Gold);
  });
  it('only within reach', () => {
    expect(canBuild(t, BLOCK, sx + BUILD_REACH + 16, onGround(BLOCK), sx, sy, 99, [])).toBe(BuildResult.Far);
  });
  it('only on the grid and on the map', () => {
    expect(canBuild(t, BLOCK, 501, onGround(BLOCK), sx, sy, 99, [])).toBe(BuildResult.World);
    expect(canBuild(t, BLOCK, -BUILD_GRID, onGround(BLOCK), 0, sy, 99, [])).toBe(BuildResult.World);
  });
  it('must touch something to anchor to', () => {
    expect(canBuild(t, BLOCK, 520, GROUND - 40, sx, sy, 99, [])).toBe(BuildResult.Floating);
  });
  it('can be set into a hillside, but not buried in it', () => {
    expect(canBuild(t, BLOCK, 520, GROUND - 4, sx, sy, 99, [])).toBe(BuildResult.Ok); // half sunk
    expect(canBuild(t, BLOCK, 520, GROUND, sx, sy + 10, 99, [])).toBe(BuildResult.Room); // fully inside
  });
  it('never over a body, but a bunker can go up around someone standing in its doorway', () => {
    const gx = 520;
    const gy = onGround(BUNKER);
    expect(canBuild(t, BUNKER, gx, gy, sx, sy, 60, [{ x: gx + 1, y: GROUND - ACTOR_H, w: 8, h: ACTOR_H }])).toBe(BuildResult.Blocked); // in the wall
    expect(canBuild(t, BUNKER, gx, gy, sx, sy, 60, [{ x: gx + 12, y: GROUND - ACTOR_H, w: 8, h: ACTOR_H }])).toBe(BuildResult.Ok); // inside
  });
});

describe('fortifications', () => {
  it('a bunker fits a clone: 18 cells of headroom, a doorway taller than a clone', () => {
    const p = PIECES[BUNKER];
    const col = (x: number) => Array.from({ length: p.h }, (_, y) => p.cells[y * p.w + x]);
    const inside = col(p.w / 2);
    expect(inside.filter((m) => m === Mat.Air).length).toBeGreaterThanOrEqual(ACTOR_H + 2);
    const door = col(p.w - 2);
    expect(door.filter((m) => m === Mat.Air).length).toBeGreaterThan(ACTOR_H);
  });

  it('concrete shrugs off small arms but not explosions', () => {
    const t = new Terrain();
    flat(t);
    const placed: number[] = [];
    applyBuild(t, BLOCK, 520, GROUND - 8, placed);
    expect(placed.length / 3).toBe(64);
    const removed: number[] = [];
    const detached: number[] = [];
    applyCarve(t, 524, GROUND - 4, 2, 0, removed, detached); // a rifle round's chip: a scratch at most
    expect(removed.length / 3).toBeLessThanOrEqual(1);
    applyCarve(t, 524, GROUND - 4, 20, 9, removed, detached); // a rocket's core
    expect(removed.length).toBeGreaterThan(0);
  });
});

function setup(): { world: World; p: Player; frames: Uint8Array[] } {
  const frames: Uint8Array[] = [];
  const world = new World(31);
  flat(world.terrain);
  world.terrainReplaced();
  const p = world.addPlayer('engineer', { send: (d) => frames.push(d) })!;
  deliverAll(world, [p]);
  for (let k = 0; k < 90; k++) world.step();
  return { world, p, frames };
}
let seq = 0;
function holdTool(world: World, p: Player, weapon: number, ticks = 1): void {
  for (let k = 0; k < ticks; k++) {
    world.input(p.id, { seq: ++seq & 0xffff, buttons: 0, aim: quantizeAim(0), inv: world.equip(p, weapon) });
    world.step();
  }
}

describe('materializer on the server', () => {
  it('new players can afford one bunker', () => {
    const { p } = setup();
    expect(p.gold).toBe(60);
  });

  it('builds, charges gold, and every client replays the same cells', () => {
    const { world, p, frames } = setup();
    const game = new Game();
    game.myId = p.id;
    for (const f of frames) {
      const r = new Reader(f);
      r.u8();
      const tick = r.u32();
      const ack = r.u16();
      game.applyFrame(tick, ack, r);
    }
    frames.length = 0;
    holdTool(world, p, WeaponId.Materializer);
    const gx = Math.round((p.body.x + 20) / BUILD_GRID) * BUILD_GRID;
    const gy = GROUND - PIECES[BUNKER].h;
    world.build(p.id, BUNKER, gx, gy);
    holdTool(world, p, WeaponId.Materializer);
    expect(p.gold).toBe(0);
    let concrete = 0;
    for (let y = gy; y < GROUND; y++) for (let x = gx; x < gx + PIECES[BUNKER].w; x++) if (world.terrain.get(x, y) === Mat.Concrete) concrete++;
    expect(concrete).toBeGreaterThan(50);
    expect(world.terrain.get(gx + 4, gy)).toBe(Mat.Metal); // the roof
    for (const f of frames) {
      const r = new Reader(f);
      r.u8();
      const tick = r.u32();
      const ack = r.u16();
      game.applyFrame(tick, ack, r);
    }
    expect(game.gold).toBe(0);
    for (let y = gy; y < GROUND; y++) for (let x = gx; x < gx + PIECES[BUNKER].w; x++) expect(game.terrain.get(x, y)).toBe(world.terrain.get(x, y));
  });

  it('only with the materializer in hand, and not faster than its rate', () => {
    const { world, p } = setup();
    const gy = GROUND - PIECES[BLOCK].h;
    const gx = Math.round((p.body.x + 20) / BUILD_GRID) * BUILD_GRID;
    holdTool(world, p, WeaponId.Rifle);
    world.build(p.id, BLOCK, gx, gy);
    holdTool(world, p, WeaponId.Rifle);
    expect(p.gold).toBe(60);
    holdTool(world, p, WeaponId.Materializer);
    world.build(p.id, BLOCK, gx, gy);
    holdTool(world, p, WeaponId.Materializer);
    expect(p.gold).toBe(60 - PIECES[BLOCK].cost);
    // Straight away again, next to it: too soon.
    world.build(p.id, BLOCK, gx + 8, gy);
    holdTool(world, p, WeaponId.Materializer);
    expect(p.gold).toBe(60 - PIECES[BLOCK].cost);
    holdTool(world, p, WeaponId.Materializer, 30);
    world.build(p.id, BLOCK, gx + 8, gy);
    holdTool(world, p, WeaponId.Materializer);
    expect(p.gold).toBe(60 - 2 * PIECES[BLOCK].cost);
  });
});
