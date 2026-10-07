/**
 * Headless server benchmark: 64 bot players hammering every weapon in one
 * room. Reports simulation + replication cost per tick and bandwidth per
 * client. Run with `npm run bench`.
 */
import { BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP } from '../src/shared/actor.ts';
import { MAX_PLAYERS, TICK_RATE } from '../src/shared/constants.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { Rng } from '../src/shared/rng.ts';
import { World } from '../src/server/world.ts';

const TICKS = Number(process.env.TICKS ?? 900);
const world = new World(12345);
const bytes = new Float64Array(MAX_PLAYERS);
const ids: number[] = [];
for (let i = 0; i < MAX_PLAYERS; i++) {
  const p = world.addPlayer(`bot${i}`, { send: (d) => (bytes[p.id] += d.length) })!;
  ids.push(p.id);
}
const rng = new Rng(1);
let seq = 0;
const step: number[] = [];
const repl: number[] = [];
let maxDebris = 0;
let maxProj = 0;
const t0 = performance.now();
for (let t = 0; t < TICKS; t++) {
  if (t === 60) bytes.fill(0); // exclude the initial chunk download
  for (const id of ids) {
    const r = rng.next();
    const buttons = (r < 0.45 ? BTN_RIGHT : r < 0.9 ? BTN_LEFT : 0) | (rng.next() < 0.35 ? BTN_UP : 0) | (rng.next() < 0.6 ? BTN_FIRE : 0);
    world.input(id, { seq: ++seq & 0xffff, buttons, aim: quantizeAim(rng.range(0, Math.PI * 2)), weapon: rng.int(4) });
  }
  world.step();
  step.push(world.lastStepMs);
  repl.push(world.lastReplicateMs);
  maxDebris = Math.max(maxDebris, world.debris.n);
  maxProj = Math.max(maxProj, world.projectiles.n);
}
const wall = performance.now() - t0;
const pct = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)];
const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const secs = (TICKS - 60) / TICK_RATE;
const kbps = [...bytes].map((b) => b / secs / 1024);
console.log(`players=${MAX_PLAYERS} ticks=${TICKS} wall=${wall.toFixed(0)}ms (${(wall / TICKS).toFixed(2)} ms/tick, budget ${(1000 / TICK_RATE).toFixed(1)})`);
console.log(`sim       avg ${avg(step).toFixed(3)} ms  p99 ${pct(step, 0.99).toFixed(3)} ms`);
console.log(`replicate avg ${avg(repl).toFixed(3)} ms  p99 ${pct(repl, 0.99).toFixed(3)} ms`);
console.log(`peak debris ${maxDebris}, peak projectiles ${maxProj}`);
console.log(`downstream per client: avg ${avg(kbps).toFixed(1)} KB/s, max ${Math.max(...kbps).toFixed(1)} KB/s; room egress ${(kbps.reduce((s, v) => s + v, 0) / 1024).toFixed(2)} MB/s`);
