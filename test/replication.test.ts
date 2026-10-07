import { describe, expect, it } from 'vitest';
import { BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP } from '../src/shared/actor.ts';
import { Reader } from '../src/shared/codec.ts';
import { CHUNK_COUNT, CHUNKS_X, CHUNK, WORLD_W } from '../src/shared/constants.ts';
import { applyFrameRecords, nullHandler } from '../src/shared/frame.ts';
import { S_FRAME, quantizeAim } from '../src/shared/protocol.ts';
import { Rng } from '../src/shared/rng.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { World } from '../src/server/world.ts';

interface FakeClient {
  id: number;
  replica: Terrain;
  inbox: Uint8Array[];
  bytes: number;
}

function connect(world: World, name: string): FakeClient {
  const c: FakeClient = { id: -1, replica: new Terrain(), inbox: [], bytes: 0 };
  const p = world.addPlayer(name, {
    send: (d) => {
      c.inbox.push(d);
      c.bytes += d.length;
    },
  })!;
  c.id = p.id;
  return c;
}

function drain(c: FakeClient): void {
  for (const msg of c.inbox) {
    const r = new Reader(msg);
    expect(r.u8()).toBe(S_FRAME);
    r.u32();
    r.u16();
    applyFrameRecords(r, c.replica, nullHandler);
  }
  c.inbox.length = 0;
}

describe('chunked terrain replication', () => {
  it('every chunk a client is believed to hold is bit-identical to the server', () => {
    const world = new World(2024);
    const rng = new Rng(11);
    const clients: FakeClient[] = [];
    for (let i = 0; i < 16; i++) clients.push(connect(world, `bot${i}`));

    let seq = 0;
    for (let tick = 0; tick < 600; tick++) {
      // Late joiners and leavers.
      if (tick === 200) clients.push(connect(world, 'late'));
      if (tick === 300) {
        const gone = clients.splice(3, 1)[0];
        world.removePlayer(gone.id);
      }
      for (const c of clients) {
        const r = rng.next();
        const buttons =
          (r < 0.4 ? BTN_RIGHT : r < 0.8 ? BTN_LEFT : 0) | (rng.next() < 0.3 ? BTN_UP : 0) | (rng.next() < 0.5 ? BTN_FIRE : 0);
        world.input(c.id, { seq: ++seq & 0xffff, buttons, aim: quantizeAim(rng.range(0, Math.PI * 2)), weapon: rng.int(4) });
        // Teleport occasionally so interest sets sweep the whole map.
        const p = world.players[c.id]!;
        if (p.alive && rng.next() < 0.02) {
          p.body.x = 64 + rng.int(WORLD_W - 128);
          p.body.y = 100;
        }
      }
      // Background destruction everywhere, in and out of view.
      if (tick % 3 === 0) world.carve(rng.int(WORLD_W), 200 + rng.int(500), 8 + rng.int(20), 4, 32);
      world.step();
      for (const c of clients) drain(c);
    }

    let checked = 0;
    let inSync = 0;
    for (const c of clients) {
      const p = world.players[c.id]!;
      for (let ci = 0; ci < CHUNK_COUNT; ci++) {
        if (p.known[ci] === world.chunkVersion[ci]) {
          checked++;
          if (c.replica.chunkHash(ci) === world.terrain.chunkHash(ci)) inSync++;
          else throw new Error(`client ${c.id} chunk ${ci} diverged`);
        }
      }
      // The chunk under the camera must be synced.
      const ci = Math.floor(p.camY / CHUNK) * CHUNKS_X + Math.floor(p.camX / CHUNK);
      expect(p.known[ci]).toBe(world.chunkVersion[ci]);
    }
    expect(checked).toBeGreaterThan(clients.length * 50);
    expect(inSync).toBe(checked);
  });

  it('64 players fit in the per-client bandwidth budget', () => {
    const world = new World(77);
    const clients: FakeClient[] = [];
    for (let i = 0; i < 64; i++) clients.push(connect(world, `bot${i}`));
    expect(world.addPlayer('overflow', { send() {} })).toBeNull();
    const rng = new Rng(3);
    let seq = 0;
    // Warm-up: initial chunk download.
    for (let t = 0; t < 60; t++) {
      for (const c of clients) world.input(c.id, { seq: ++seq, buttons: 0, aim: 0, weapon: 0 });
      world.step();
      for (const c of clients) drain(c);
    }
    for (const c of clients) c.bytes = 0;
    const ticks = 300;
    for (let t = 0; t < ticks; t++) {
      for (const c of clients) {
        const buttons = (rng.next() < 0.5 ? BTN_RIGHT : BTN_LEFT) | (rng.next() < 0.3 ? BTN_UP : 0) | BTN_FIRE;
        world.input(c.id, { seq: ++seq & 0xffff, buttons, aim: quantizeAim(rng.range(0, Math.PI * 2)), weapon: rng.int(4) });
      }
      world.step();
      for (const c of clients) drain(c);
    }
    const avgKBps = clients.reduce((s, c) => s + c.bytes, 0) / clients.length / (ticks / 30) / 1024;
    // Everyone firing constantly, including explosives, should stay well under ~64 KB/s per client.
    expect(avgKBps).toBeLessThan(64);
  });
});
