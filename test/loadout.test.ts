import { describe, expect, it } from 'vitest';
import { Reader } from '../src/shared/codec.ts';
import { World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';

type Internals = { damage: (p: unknown, n: number, by: number, w: number) => void };

describe('the death banner', () => {
  it('loading in, or waiting to come down, isn\'t being fragged', () => {
    const frames: Uint8Array[] = [];
    const world = new World(81);
    const p = world.addPlayer('me', { send: (d) => frames.push(d) })!;
    const game = new Game();
    game.myId = p.id;
    const feed = () => {
      for (const f of frames) {
        const r = new Reader(f);
        r.u8();
        const tick = r.u32();
        const ack = r.u16();
        game.applyFrame(tick, ack, r);
      }
      frames.length = 0;
    };
    // Just loaded in, our rocket not yet down: not fragged.
    for (let k = 0; k < 5; k++) world.step();
    feed();
    expect(game.alive).toBe(false);
    expect(game.fragged).toBe(false);
    // Down and fighting, then killed: fragged.
    for (let k = 0; k < 30 * 20 && !p.alive; k++) world.step();
    feed();
    expect(game.alive).toBe(true);
    (world as unknown as Internals).damage(p, 999, p.id, 0);
    world.step();
    feed();
    expect(game.alive).toBe(false);
    expect(game.fragged).toBe(true);
    // Back on the ground: no longer.
    for (let k = 0; k < 30 * 30 && !p.alive; k++) world.step();
    feed();
    expect(game.alive).toBe(true);
    expect(game.fragged).toBe(false);
  });
});
