# SandCommand

A Cloudflare-native multiplayer sandbox shooter inspired by **Cortex Command**:
up to **64 clones per room** share one fully destructible 2048×1024-cell world.
Every explosion carves terrain, throws debris, and the debris settles back as
rubble. All of it is simulated on one authoritative Durable Object and
streamed to every player at 30 Hz.

```
npm install
npm run dev          # builds the client and runs wrangler dev on :8787
npm test             # terrain, codec, replication and prediction tests
npm run bench        # headless 64-player server benchmark
npm run loadtest     # 64 real WebSocket bots against a running server
npm run deploy       # wrangler deploy (needs a Cloudflare account)
```

Controls: **A/D** run, **W/Space** jump (hold for jetpack), **mouse** aim and
fire, **1–4 / Q/E / wheel** switch weapon (Rifle, Bazooka, Grenade, Digger),
**Tab** scoreboard, **Enter** chat. Dig gold with the Digger. Clones gib on
death and spill half their gold as gold rubble that anyone can dig up.

## Architecture

```
browser ──/api/join──▶ Worker ──RPC──▶ Lobby DO  (packs players into rooms ≤ 64)
browser ══/ws?room══▶ Worker ──────▶ GameRoom DO (one per match: authoritative sim)
                         └──────────▶ static assets (public/)
```

| Path | Role |
| --- | --- |
| `src/shared/` | Engine code that runs on **both** server and client: terrain, physics, kernels, protocol |
| `src/server/world.ts` | Authoritative simulation and replication. Platform-agnostic, so tests and the benchmark drive it directly |
| `src/server/room.ts` | `GameRoom` Durable Object: sockets, fixed-timestep loop, telemetry |
| `src/server/lobby.ts` | `Lobby` Durable Object: matchmaking with seat reservations |
| `src/client/` | Canvas renderer, input, prediction/interpolation, HUD |

### Terrain: SWAR bitplanes

`Terrain` (`src/shared/terrain.ts`) keeps a material byte per cell, plus three
**bitplanes** (`solid`, `hard`, `fixed`) packed 32 cells per `Uint32` word.
Every physics query runs against the bitplanes as SIMD-within-a-register
operations:

- **AABB collision** ANDs one span mask per row: an 8×14 clone tests 14–28
  words, not 112 bytes.
- **Carving a disc** builds an outer span mask and an inner "core" mask per
  row. Soft cells go with `mask & solid & ~hard`, hard rock only with
  `core & solid & ~fixed`, and bedrock never. One AND clears up to 32 cells.
- **Removed cells** are enumerated with `clz32` on the removed-bits word, so
  the cost scales with how many cells were destroyed, not with the area of
  the circle.

The geometry is integer-only (`Math.sqrt` is correctly rounded in IEEE 754), so
a carve gives bit-identical results on every engine. Rows and words are
independent, which makes each kernel trivially splittable across lanes or
workers. The tests check every kernel against a naive per-cell reference.

### Entities: structure-of-arrays kernels

Debris and projectiles (`src/shared/kernels.ts`) store their components in
parallel `Float32Array`s and advance in two passes. The first is a
branch-free integration pass over contiguous arrays, the shape that JITs
auto-vectorize and that maps onto 4-wide SIMD or WASM `f32x4`. The second is
a sweep/resolve pass against the terrain bitplanes. Elements never interact,
so any index range can be stepped on its own. Removal is swap-with-last.

### Replication: chunks, versions and event streaming

The world is cut into 512 chunks of 64×64 cells. Terrain is **never streamed
as state while you watch it change**. Clients receive *operations* and
re-run them locally:

| Record | Size | Meaning |
| --- | --- | --- |
| `R_CARVE` | 12 B | `x, y, r, core, seed, debrisMax` |
| `R_PIXELS` | 5 + 3n B | rubble that settled in one chunk this tick |
| `R_CHUNK` | RLE | full snapshot, only when needed |

**Debris costs no bandwidth.** The client applies the same carve to the same
chunk state, gets the same list of removed cells, seeds the same Mulberry32
RNG, and calls the same `throwDebris`. The flying debris shower is therefore
identical on every screen. Only the final resting pixels are sent, because
those are the authoritative changes.

**Per-client chunk versions.** The server keeps a version counter for every
chunk, and for every client the version it believes that client holds (`-1`
means unknown or stale). Each tick:

1. Each op is forwarded only if it touches a chunk the client both holds and
   can see. Forwarding advances the client's version for that chunk if it
   matched the op's pre-version, and invalidates it otherwise.
2. An op the client does not receive invalidates its copies of the chunks it
   touched. Destruction on the far side of the map costs that client nothing
   now.
3. Stale chunks inside the interest rectangle are re-sent as RLE snapshots,
   nearest first, under a per-client byte budget per tick. Snapshots are
   cached per chunk version, so 64 players loading the same area encode it
   once.

`test/replication.test.ts` checks the invariant this relies on: *every chunk a
client is believed to hold is bit-identical to the server's*. It runs with
teleporting players, late joiners, leavers, and constant destruction in and
out of view.

**Entities use interest management too.** Clones inside your view (plus a
margin) are sent every tick as 14-byte quantized records. Clones outside it
are sent as 3-byte radar blips every 15 ticks. Each actor record, op and
projectile event is **encoded once per tick and fanned out** to every
interested client as a byte copy.

### Latency hiding

- **Own clone: prediction and reconciliation.** `stepBody` is shared verbatim
  by server and client. The client applies each input immediately. When a
  frame arrives, it rebases on the server state (sent as float64, so no
  rounding) and replays the inputs the server hasn't acknowledged. Remaining
  error is eased out visually. `test/prediction.test.ts` runs the real
  client `Game` against the real `World` at 33, 132 and 297 ms one-way
  latency. Steady-state prediction error is zero.
- **Other clones:** rendered 3 ticks (100 ms) in the past and interpolated
  between snapshots, with a smoothed estimate of the server clock.
- **Projectiles:** sent once as a spawn event (exact float32 state) and then
  simulated locally with the same kernel. The server sends one end event for
  impacts and explosions.
- **Input queue:** the server keeps at most 3 queued commands per player, so a
  client whose clock runs fast cannot build up latency.

### Clones and gibs

Clones are palette-indexed pixel sprites (`src/client/sprites.ts`) with walk,
idle and airborne frames, tinted per player. The walk cycle advances with
distance travelled, so feet don't skate. Weapons and arms are pre-rotated in
64 steps with nearest-neighbour inverse mapping, so a gun at any angle stays
on the world's pixel grid.

Every death gibs the clone. The kill record (`R_KILL`, 18 B) carries position,
velocity, overkill and a seed. Each client bursts the clone into helmet,
torso, limbs, jetpack and meat (`src/client/gibs.ts`). The parts tumble,
bounce and leave blood trails, and blood droplets stain the terrain in a
client-only stain layer that the chunk rasterizer blends in. Gibs are
cosmetic, but the gold a clone spills is real. The server throws it from the
seed and deposits it as terrain, and every client throws the same shower from
the same seed. Explosive and high-overkill deaths scatter harder.

## Measured numbers

`npm run bench` runs Node 22 on a 4-core container, with 64 bots firing all
weapons (60% trigger duty) and running and jetpacking at random:

```
sim       avg 0.31 ms  p99 1.5 ms
replicate avg 1.04 ms  p99 3.8 ms      (budget per tick: 33.3 ms)
downstream per client: avg 25.6 KB/s; room egress 1.6 MB/s
```

`npm run loadtest` runs 64 real WebSocket bots against `wrangler dev`
(workerd). Each bot decodes every frame into its own terrain replica. Bots
and server share the same 4 cores:

```
rooms={"room-1":64}  rejected=0  decodeErrors=0
frames/s per bot: min 30.0 avg 30.1
frame gap ms: p50 32 p95 46
downstream per bot: ~27 KB/s
server tick (from the room's telemetry log): avg ~3 ms
```

With 70 bots, the lobby packs `{"room-2":64,"room-3":6}` and rejects nobody.
RTT tails in the local load test are dominated by the bot harness and workerd
competing for the same CPU. Measure from a separate machine for real
numbers.

## Deploying

`wrangler.jsonc` declares the two Durable Object classes (SQLite-backed), and
the static assets in `public/`. `npm run deploy` builds the client bundle and
deploys. Rooms are created on demand. A `GameRoom` lives wherever its first
player connected from, and all of that match's sockets pin to it.

## Not done yet

- Falling-sand cellular automaton for unsupported sand (ops are ready: it would
  emit `R_PIXELS`).
- Teams, brains, buying bodies and drop ships, which are the Cortex Command
  meta-game.
- Delta-compressing actor records against the last acknowledged frame.
- Running the kernels in a WASM SIMD module. They are already laid out for it.
- Sound.
