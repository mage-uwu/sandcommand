import { describe, expect, it } from 'vitest';
import { Reader } from '../src/shared/codec.ts';
import { HELD, SHORT, WORLD_W } from '../src/shared/constants.ts';
import { applyFrameRecords, nullHandler, type RemoteActor } from '../src/shared/frame.ts';
import { Mat } from '../src/shared/materials.ts';
import { GameMode, Phase } from '../src/shared/protocol.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { findPath } from '../src/server/nav.ts';
import { World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';

/** A busy match (bots in every slot) with one human, its frames kept. */
function match(mode: number) {
  const world = new World(77 + mode, { mode: 'ffa', bots: 32, rotation: [mode] });
  const frames: Uint8Array[] = [];
  const me = world.addPlayer('me', { send: (d) => frames.push(d) })!;
  for (let t = 0; t < 6000 && world.phase !== Phase.Live; t++) world.step();
  for (let t = 0; t < 120; t++) world.step();
  // (The client gets every frame from the start, as a real one does.)
  return { world, frames, me };
}

describe('replication, tiered (actors and vehicles held or short when they can be)', () => {
  it('a client still has every actor in view, its health, weapon and body never more than a tick behind the server', () => {
    const { world, frames, me } = match(GameMode.Regicide);
    const game = new Game();
    const pump = () => {
      for (const f of frames.splice(0)) {
        const r = new Reader(f);
        r.u8();
        const tick = r.u32();
        const ack = r.u16();
        game.applyFrame(tick, ack, r);
      }
    };
    pump();
    let worst = 0;
    const behind = new Map<number, number>();
    for (let k = 0; k < 30 * 8; k++) {
      world.step();
      pump();
      for (const o of world.players) {
        if (!o || o === me) continue;
        const inView = Math.abs(o.cx - me.camX) < 600 && Math.abs(o.cy - me.camY) < 340;
        const snaps = (game as unknown as { snaps: Map<number, { hp: number; weapon: number; parts: number }[]> }).snaps.get(o.id);
        if (!inView) continue;
        expect(snaps, `actor ${o.id} in view`).toBeDefined();
        const last = snaps!.at(-1)!;
        const same = last.hp === Math.max(0, Math.ceil(o.hp)) && last.weapon === o.weapon && last.parts === o.parts.mask;
        const n = same ? 0 : (behind.get(o.id) ?? 0) + 1;
        behind.set(o.id, n);
        worst = Math.max(worst, n);
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('most actor entries are short or held: far fewer bytes than a full record each', () => {
    const { world, frames } = match(GameMode.Pvp);
    frames.length = 0;
    let full = 0;
    let short = 0;
    let held = 0;
    for (let k = 0; k < 30 * 4; k++) {
      world.step();
      for (const f of frames.splice(0)) {
        const r = new Reader(f);
        r.u8();
        r.u32();
        r.u16();
        applyFrameRecords(r, new Terrain(), {
          ...nullHandler,
          actors: (list: RemoteActor[], h: readonly number[]) => {
            held += h.length;
            for (const a of list) if (a.short) short++;
            else full++;
          },
        });
      }
    }
    expect(full + short + held).toBeGreaterThan(100);
    expect(short + held).toBeGreaterThan(full);
    expect(HELD & SHORT).toBe(0);
  });
});

describe('the route planner keeps what it knows of the ground between searches (nav.ts)', () => {
  it('until the ground changes: then it sees the change', () => {
    const FLOOR = 600;
    const t = new Terrain();
    for (let y = 0; y < 1024; y++) for (let x = 0; x < WORLD_W; x++) t.mat[y * WORLD_W + x] = y >= FLOOR ? Mat.Bedrock : Mat.Air;
    t.rebuildAllPlanes();
    expect(findPath(t, 500, FLOOR, 900, FLOOR).reached).toBe(true);
    // A wall of bedrock from the sky to the floor: no way past it now.
    for (let y = 0; y < FLOOR; y++) for (let x = 700; x < 712; x++) t.set(x, y, Mat.Bedrock);
    expect(findPath(t, 500, FLOOR, 900, FLOOR).reached).toBe(false);
    // Dug through again: a way once more.
    for (let y = FLOOR - 40; y < FLOOR; y++) for (let x = 700; x < 712; x++) t.set(x, y, Mat.Air);
    expect(findPath(t, 500, FLOOR, 900, FLOOR).reached).toBe(true);
  });
});
