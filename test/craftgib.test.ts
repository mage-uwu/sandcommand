import { it, expect } from 'vitest';
import { World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { Reader } from '../src/shared/codec.ts';
import { PK } from '../src/shared/particles.ts';
import { GIB_NOSE, GIB_FIN } from '../src/client/effects.ts';
it('a drop rocket\'s nose cone shot off flies off as its own piece', () => {
  const inbox: Uint8Array[] = [];
  const world = new World(7, { mode: 'sandbox', bots: 0 });
  const a = world.addPlayer('a', { send: (d) => inbox.push(d) })!;
  world.addPlayer('b', { send() {} });
  const game = new Game(); game.myId = a.id;
  const pump = () => { for (const m of inbox.splice(0)) { const r = new Reader(m); r.u8(); const tk = r.u32(); const ack = r.u16(); game.applyFrame(tk, ack, r); } };
  for (let t = 0; t < 400 && !world.crafts.some(Boolean); t++) { world.step(); pump(); }
  const k = world.crafts.findIndex(Boolean);
  const W = world as unknown as { hurtCraftPart(s: number, p: number, d: number, by: number): void };
  const before = game.particles.n;
  W.hurtCraftPart(k, 1, 100, 255);
  world.step(); pump();
  let nose = 0, fin = 0, gibs = 0;
  for (let i = 0; i < game.particles.n; i++) if (game.particles.kind[i] === PK.Gib) { gibs++; const piece = game.particles.aux[i] & 0x7f; if (piece === GIB_NOSE) nose++; if (piece === GIB_FIN) fin++; }
  expect(nose).toBe(1);
  expect(gibs).toBeGreaterThan(nose);
  void before;
  void fin;
});
