/**
 * Physics scaling benchmark for the continuous particle systems.
 *
 *   npm run bench:physics
 *
 * 1. Grain step cost vs N: should be flat per grain (O(N)).
 * 2. Probes per swept move: distance-field sphere tracing vs per-cell marching.
 * 3. Incremental distance-field update cost per carve.
 * 4. A large sand collapse, tick by tick.
 */
import { DT, WORLD_W } from '../src/shared/constants.ts';
import { Collider, DistanceField, newHit } from '../src/shared/field.ts';
import { Mat } from '../src/shared/materials.ts';
import { PK, Particles, applyCarve, releaseCarve } from '../src/shared/particles.ts';
import { Rng } from '../src/shared/rng.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { generateWorld } from '../src/shared/worldgen.ts';

const t = new Terrain();
generateWorld(t, 99);
const field = new DistanceField(t);
let s = performance.now();
field.update();
console.log(`full distance field build: ${(performance.now() - s).toFixed(1)} ms (${field.lastUpdateCells} field cells)`);
const col = new Collider(t, field);
const rng = new Rng(1);

// Keep the terrain fixed during the scaling runs: grains are stepped without a
// settle callback, so they come to rest and are dropped without depositing.
console.log('\n1) grain step cost vs N (in-flight grains over generated terrain)');
for (const N of [2_000, 1_000, 4_000, 16_000, 64_000]) {
  const warmup = N === 2_000; // first run only warms the JIT
  const g = new Particles(N);
  for (let i = 0; i < N; i++) g.spawnGrain(64 + rng.next() * (WORLD_W - 128), 20 + rng.next() * 250, rng.range(-150, 150), rng.range(-200, 50), Mat.Sand, 600);
  let ms = 0;
  let grainTicks = 0;
  for (let k = 0; k < 20; k++) {
    const n = g.n;
    const t0 = performance.now();
    g.step(col, DT);
    ms += performance.now() - t0;
    grainTicks += n;
  }
  if (!warmup) console.log(`  N=${String(N).padStart(6)}  ${(ms / 20).toFixed(3)} ms/tick   ${((ms * 1e6) / grainTicks).toFixed(0)} ns per grain-tick`);
}

console.log('\n1b) unified engine: all seven kinds mixed (grains, sparks, flames, smoke, dust, blood, gibs)');
for (const N of [2_000, 1_000, 4_000, 16_000, 64_000]) {
  const warmup = N === 2_000;
  const p = new Particles(N * 2);
  for (let i = 0; i < N; i++) {
    const k = i % 7;
    const x = 64 + rng.next() * (WORLD_W - 128);
    const y = 20 + rng.next() * 300;
    if (k === PK.Grain) p.spawnGrain(x, y, rng.range(-150, 150), rng.range(-200, 50), Mat.Sand, 600);
    else p.spawn(k, x, y, rng.range(-150, 150), rng.range(-200, 50), 600, k === PK.Gib ? 3 : 0, 0xcc4444);
  }
  let ms = 0;
  let pt = 0;
  for (let k = 0; k < 20; k++) {
    // An explosion every tick keeps the air field busy.
    p.blast(64 + rng.next() * (WORLD_W - 128), 150, 60, 260);
    const n = p.n;
    const t0 = performance.now();
    p.step(col, DT, { stain: () => {} });
    ms += performance.now() - t0;
    pt += n;
  }
  if (!warmup) console.log(`  N=${String(N).padStart(6)}  ${(ms / 20).toFixed(3)} ms/tick   ${((ms * 1e6) / pt).toFixed(0)} ns per particle-tick`);
}

console.log('\n1c) E explosions in one tick over 32k particles: air field vs per-explosion scan');
{
  const N = 32_000;
  for (const E of [1, 8, 32]) {
    const xs = new Float32Array(N);
    const ys = new Float32Array(N);
    const vxs = new Float32Array(N);
    const vys = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      xs[i] = rng.next() * WORLD_W;
      ys[i] = rng.next() * 600;
    }
    // Old approach: every explosion scans every particle.
    let t0 = performance.now();
    for (let rep = 0; rep < 20; rep++) {
      for (let e = 0; e < E; e++) {
        const cx = (e * 613) % WORLD_W;
        const cy = 300;
        for (let i = 0; i < N; i++) {
          const dx = xs[i] - cx;
          const dy = ys[i] - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= 67 * 67) continue;
          const d = Math.sqrt(d2) + 1;
          const k = (260 * (1 - d / 67)) / d;
          vxs[i] += dx * k;
          vys[i] += dy * k;
        }
      }
    }
    const scan = (performance.now() - t0) / 20;
    // Field approach: explosions write the air field (O(area)); the particles'
    // existing per-tick field sample picks it up, so the per-tick cost
    // attributable to blasts is just the writes.
    const p = new Particles(16);
    t0 = performance.now();
    for (let rep = 0; rep < 20; rep++) for (let e = 0; e < E; e++) p.blast((e * 613) % WORLD_W, 300, 67, 260);
    const field = (performance.now() - t0) / 20;
    console.log(`  E=${String(E).padStart(2)}  per-explosion scan ${scan.toFixed(3)} ms   air-field writes ${field.toFixed(3)} ms`);
  }
}

console.log('\n2) probes per swept move (20k random moves, 0-40 cells)');
const h = newHit();
let traced = 0;
let marched = 0;
for (let k = 0; k < 20_000; k++) {
  const x = 64 + rng.next() * (WORLD_W - 128);
  const y = 20 + rng.next() * 900;
  if (t.isSolid(Math.floor(x), Math.floor(y))) continue;
  const dx = rng.range(-28, 28);
  const dy = rng.range(-28, 28);
  col.sweep(x, y, dx, dy, h);
  traced += col.probes;
  marched += Math.max(1, Math.ceil(h.travelled)) + (h.hit ? 1 : 0); // per-cell DDA cost for the same path
}
console.log(`  sphere-traced: ${(traced / 20_000).toFixed(2)} probes/move   per-cell marching: ${(marched / 20_000).toFixed(2)} probes/move   (${(marched / traced).toFixed(1)}x fewer)`);

console.log('\n3) incremental distance-field update per carve');
const removed: number[] = [];
const detached: number[] = [];
let updMs = 0;
let updCells = 0;
for (let k = 0; k < 200; k++) {
  applyCarve(t, rng.int(WORLD_W), 200 + rng.int(500), 20, 9, removed, detached);
  const t0 = performance.now();
  field.update();
  updMs += performance.now() - t0;
  updCells += field.lastUpdateCells;
}
console.log(`  ${((updMs / 200) * 1000).toFixed(0)} us/carve, ${(updCells / 200).toFixed(0)} field cells recomputed (of ${512 * 256})`);

console.log('\n4) large sand collapse (undercut a 400x120 sand slab)');
// Warm the JIT on every code path a collapse uses (settle callback, buried-grain
// search, landing) with a small collapse first: a long-running room pays that
// deopt/reopt cost once, and it should not be mistaken for the algorithm's.
collapse(60, false);
collapse(400, true);

function collapse(width: number, report: boolean): void {
const t2 = new Terrain();
for (let x = 0; x < WORLD_W; x++) for (let y = 800; y < 1024; y++) t2.mat[y * WORLD_W + x] = Mat.Bedrock;
for (let x = 1000 - width / 2 - 200; x < 1000 + width / 2 + 200; x++) for (let y = 640; y < 660; y++) t2.mat[y * WORLD_W + x] = Mat.Dirt;
for (let x = 1000 - width / 2; x < 1000 + width / 2; x++) for (let y = 520; y < 640; y++) t2.mat[y * WORLD_W + x] = Mat.Sand;
t2.rebuildAllPlanes();
const f2 = new DistanceField(t2);
const c2 = new Collider(t2, f2);
const g2 = new Particles(200_000);
f2.update();
let released = 0;
for (let cx = 1000 - width / 2 + 20; cx <= 1000 + width / 2 - 20; cx += 30) {
  applyCarve(t2, cx, 650, 16, 0, removed, detached);
  releaseCarve(g2, removed, detached, cx, 650, 0, new Rng(cx));
  released += detached.length / 3;
}
if (report) console.log(`  ${released} grains released`);
let deposited = 0;
let peak = 0;
let fieldPeak = 0;
let peakAt = '';
for (let tick = 0; g2.n > 0 && tick < 900; tick++) {
  const n = g2.n;
  const t0 = performance.now();
  f2.update();
  const tf = performance.now() - t0;
  fieldPeak = Math.max(fieldPeak, tf);
  g2.step(c2, DT, {
    settle: (x, y, m) => {
      t2.set(x, y, m);
      deposited++;
    },
  });
  const ms = performance.now() - t0;
  if (ms > peak) peakAt = `tick ${tick} with ${n} live`;
  peak = Math.max(peak, ms);
  if (report && (tick % 15 === 0 || g2.n === 0)) console.log(`  tick ${String(tick).padStart(3)}  live ${String(n).padStart(6)}  ${ms.toFixed(2)} ms  (${((ms * 1e6) / Math.max(1, n)).toFixed(0)} ns/grain)`);
}
if (report) console.log(`  deposited ${deposited}/${released}, peak ${peak.toFixed(2)} ms/tick at ${peakAt} (field update peak ${fieldPeak.toFixed(2)} ms)`);
}
