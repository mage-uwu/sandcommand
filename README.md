# SandCommand

A Cloudflare-native multiplayer shooter inspired by **Cortex Command**: up to
**64 clones per room** fight free-for-all waves in one fully destructible
4096×1024-cell world, with bots in every seat no human has taken.
Every explosion carves terrain, throws debris, and the debris settles back as
rubble. All of it is simulated on one authoritative Durable Object and
streamed to every player at 30 Hz.

```
npm install
npm run dev          # builds the client and runs wrangler dev on :8787
npm test             # terrain, codec, replication and prediction tests
npm run bench        # headless 64-player server benchmark
npm run bench:ffa    # one human + 63 bots playing free-for-all waves for 2 minutes
npm run bench:physics # particle/field scaling, collider probes, big collapse
npm run loadtest     # 64 real WebSocket bots against a running server
npm run deploy       # wrangler deploy (needs a Cloudflare account)
```

Controls: **A/D** run, **W/Space** jump (hold for jetpack), **mouse** aim and
fire, **right mouse / Shift** scope, **R** reload, **1/2 (Q/E, wheel)** cycle
through what you carry, **3 (F)** pick up the weapon at your feet, **4 (G)**
drop the one in hand, **Tab** scoreboard, **Enter** chat. With the Materializer out, the wheel or a click
on the menu picks a fortification and a click builds it. Dig gold with the Digger. Clones gib on
death and spill half their gold as gold rubble that anyone can dig up.

## Free for all

Every room plays free-for-all waves (`stepRound` in `src/server/world.ts`):

1. **Countdown.** Once there are two clones, a 4-second countdown starts.
2. **The wave.** Everyone in the room is in it. Drop rockets bring them in
   over a couple of seconds, each landing as far as it can from clones and
   other incoming rockets.
3. **One life.** Nobody respawns. When you die you spectate your killer
   (click for the next clone), and the server moves what it sends you to
   whoever you're watching. Players who join mid-wave watch it and play in
   the next one.
4. **Last clone standing wins.** The winner gets a win on the scoreboard
   (Tab: wins, kills, deaths) and a 7-second victory lap. A wave has a
   4-minute clock (top of the screen). If time runs out, the survivor with
   the most kills that wave wins, so nobody wins by hiding in a bunker.
   Big messages (WAVE 3 IN 2, FRAGGED, HAWKINS WINS) are retro console
   banners in block letters (`src/client/banner.ts`).
5. **A new wave on a fresh map.** The next wave gets a new seed: new
   terrain, with nothing carried over (rockets, dropped weapons, debris in
   flight).

## Team deathmatch

Waves alternate between free-for-all and **team deathmatch**: odd waves
FFA, even waves TDM (`rotation` in the `World` options; `modeOfWave`).
The countdown banner says which one is coming.

- **Even teams.** When a TDM wave starts, everyone is dealt into **red** and
  **green** (`drawTeams`). Humans are dealt first, so two humans end up on
  opposite sides, then bots even up the numbers.
- **Opposite sides.** Red's rockets come down on the left 40% of the map,
  green's on the right 40%.
- **No friendly fire.** Teammates can't hurt each other with bullets,
  blasts, shrapnel, debris or rocket crashes (`World.friendly`). Your own
  blasts still hurt you.
- **Fight to the last clone.** One life each, as in FFA. The last team with
  a clone standing wins, and every member scores the win, the fallen
  included. If the clock runs out, the team with more clones left wins,
  then the team with more kills that wave.
- **Bots** only hunt the other team.
- **Spectating.** When you're out you watch your own side while any of it
  stands.
- **On screen.** Clones, name tags and the minimap wear team colours. The
  top bar shows `RED 12 v 9 GREEN`, with your side marked. Banners announce
  RED WINS or GREEN WINS.
- **Wire.** The team table goes out as `R_TEAMS`, only when it changes, and
  to newcomers. `R_ROUND` carries the wave's mode and each team's clones
  left.

**Bots fill every seat no human has**, up to 64. When a human joins a full
room, a bot gives up its seat, a dead one if there is one.
- **Same rules as humans.** A bot is a `BotBrain` in `src/server/bots.ts`:
  it reads the world directly and emits the same input command a client
  sends. So it plays by exactly the same rules: rate of fire, magazines,
  inventory, rockets, classes.
- **What it does.** It picks the nearest living clone, closes to its
  weapon's fighting range, then strafes. It jumps or jets over walls and up
  to targets, and leads its shots by flight time, lifting lobbed ones.
- **Weapon use.** It throws grenades up close now and then, and fetches a
  gun from the ground if it lost its own. Up close with a launcher it
  switches to a gun if it has one.
- **Getting unstuck.** It jumps or jets over walls with headroom, digs
  straight through anything else (sweeping the beam so the hole is
  clone-sized), and digs straight at a target hiding the other side of a
  floor or wall, or straight above or below, however high. When boxed in, it clears the nearest leftover
  pixels.
- **Fairness.** Bots get a beat to look around after landing, a reaction
  delay on each new target, per-bot aim error, and no point-blank bazooka
  shots.

Thinking is cheap and staggered: targets twice a second, line of sight
every 4 ticks, steering and aim every tick. A room of one human and 63 bots
costs about 0.7 ms a tick (`npm run bench:ffa`), and a full 64-clone wave
usually lasts 20–75 s, bunkers and all.

**New maps cost almost no bandwidth.** The map generator is shared code, so
the server sends the seed (`R_WAVE`) and each client generates the same
terrain itself. The generator uses floating-point trig, which different
JavaScript engines may round differently, so the record also carries every
chunk's hash. A client that comes out different on a chunk asks for that
chunk again. The wave record opens the frame, so every record after it
applies to the new terrain. Round state rides in a small per-frame
`R_ROUND` record.

**Joining works the same way.** A newcomer's first frame carries the
current map's seed and hashes. The server remembers each chunk's version
when the map was generated. Any chunk nobody has touched since counts as
already held, so only chunks that changed are downloaded. On the 4096-wide
map, a client has all 1024 chunks about 1.5 s after joining.

Generating the map takes about 0.4 s. Each octave of the noise caches its
lattice-corner hashes along a row, and each cell stops at the first material
that applies (caves, then gold, rock, sand lenses), which gives bit-identical
terrain in less than half the time.

## Bunkers

Every map has bunker complexes on the surface (`src/shared/structures.ts`),
built on a modular grid of 64×48-cell modules as part of map generation.
Walls and floor slabs are 6 cells thick, and doorways are 34 cells tall
against a 14-cell clone. Everything is built at twice the clone's scale
(`SCALE` in `structures.ts`), so rooms feel like rooms.
Clients build identical ones from the seed. Between 15% and 60% of the
surface is built on (random per map), in complexes of 2–7 modules with open
ground between them. Each complex is assembled like this:

- **Levelled site.** It stands on a concrete foundation, cutting a notch
  into a hillside or filling a dip down to solid ground.
- **Rooms and towers.** Ground-floor rooms have metal roofs, and some
  modules rise into towers 2–3 storeys high.
- **Ways through.** Doorways join neighbouring rooms, holes in the floor
  slabs join storeys (jet up, drop down), and doors at the ends lead
  outside. Firing slits look out where a tower overlooks a lower roof.
- **Underground.** Basements below are reached by shafts, with doorways
  between neighbouring basements. Sometimes a lined escape tunnel runs out
  under the open ground and climbs to a hatch.
- **Battle damage.** Some modules come pre-shot.

Everything is concrete and metal plate, so small arms barely scratch it.
Explosion cores and diggers get through. The digger bites at the first
solid cell along its aim, so a wall you're pressed against gets dug.
Building uses only integer arithmetic and the seeded RNG, so every engine
produces the same complexes.

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

`Terrain` (`src/shared/terrain.ts`) keeps a material byte per cell, plus four
**bitplanes** (`solid`, `hard`, `fixed`, `loose`) packed 32 cells per `Uint32` word.
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
- **Collapse detection** evaluates the stability rule for loose material
  (sand, rubble) 32 cells at a time with shifted words:
  `loose & (~below | (~belowLeft & ~left) | (~belowRight & ~right))`. A loose
  face therefore can't stand steeper than 45°. See *Falling sand* below.

The geometry is integer-only (`Math.sqrt` is correctly rounded in IEEE 754), so
a carve gives bit-identical results on every engine. Rows and words are
independent, which makes each kernel trivially splittable across lanes or
workers. The tests check every kernel against a naive per-cell reference.

### Physics: continuous vectors and fields, not cellular automata

Nothing moves through the world as a per-cell automaton, and there is no
separate effects system. **One particle engine** (`src/shared/particles.ts`)
computes everything that flies: terrain grains (debris, collapsing sand,
spilled gold), sparks, flames, smoke, dust, blood and gibs. They are all one
structure-of-arrays particle with a *kind*. A row of per-kind parameters sets
gravity or buoyancy, drag, restitution, friction, how strongly the kind
couples to each field, and what happens on contact: grains become terrain,
blood stains the surface, gibs tumble and rest, sparks die once spent. One
step advances every kind, so a tick costs O(N) in the things that are moving
plus O(field cells touched). It never scales with the size of the grid, and
it doesn't snowball. The server runs the same engine with grains only.
Clients run every kind in one instance, and draw them all into one pixel
buffer.

| Piece | File | What it does |
| --- | --- | --- |
| **Distance field** | `src/shared/field.ts` | Capped 3-4 chamfer distance to terrain at 4×4-cell resolution (512×256). Updated incrementally: a dirty 16×16 tile only triggers work if a 4×4 block's occupancy actually flipped (most bullet chips don't), and then only the masked window within `FIELD_R` is re-swept by the two chamfer passes. About 470 field cells per carve, of 131k. |
| **Swept collider** | `src/shared/field.ts` | Sphere-traces through the distance field (one lookup per clearance-sized jump) and only drops to exact bitplane tests within about one cell of a surface. 1.6 probes per move against 10.2 for per-cell marching. |
| **Contact normals** | `Terrain.normalAt` | Gradient of local occupancy (eight masked popcounts over a 5×5 window). Falls back to the reversed motion direction when the gradient doesn't oppose the motion, for example in pits. |
| **Contact model** | `contact()` | Restitution along the normal and Coulomb friction along the tangent, shared by grains, gibs and grenades. A body rests on a slope while `tan θ ≤ μ(1+e)`, so sliding, piling and an angle of repose come out of one rule. |
| **Mass field** | `src/shared/particles.ts` | Grains splat count and momentum into the coarse grid. Crowded grains blend toward the local mean velocity (PIC-style), so a landing sends a deceleration wave up through the falling mass. They're also pushed down the gradient of *excess* density, clamped to about one tick of gravity: pressure with no neighbour search, which can't add energy. |
| **Flow advection** | `Particles.step` | Light kinds (smoke, dust, flame, blood) blend toward that field's mean velocity, so smoke caught in a falling sand stream is dragged down with it. |
| **Air field** | `Particles.blast` | An explosion writes a radial wind into a sparse coarse field that decays over about 8 ticks. Every particle samples its own cell, with per-kind coupling (smoke billows, heavy grains barely move). Many explosions in one tick cost O(blast area), not O(particles × explosions). |
| **Pixel buffer** | `src/client/particle-layer.ts` | Every particle, gib sprites included, is written straight into one u32 buffer covering the view, uploaded once per frame, and scaled with the terrain's nearest-neighbour zoom. No per-particle canvas calls. |
| **Projectiles** | `src/shared/kernels.ts` | Same swept collider. Hits on clones use a continuous segment-vs-AABB slab test along the swept path, through the actor spatial hash, so a bullet costs a handful of probes at any speed. |

The data layout is still structure-of-arrays (parallel `Float32Array`s). Each
system runs a branch-free integration pass that maps onto SIMD lanes, then a
resolve pass. The only discrete step is at the very end of a grain's life. A
grain that has come to rest is projected onto the cell lattice: a bounded walk
down open diagonals to the nearest cell where the stability rule holds. It
runs once per grain when it settles, never as a per-tick grid update. A
grain that is out of time is dropped onto support, so material is always
conserved.

### Particles act on players

As in Cortex Command, particles are physical, not decoration. They push and
hurt clones, so the server runs every kind that can (grains, shrapnel,
embers) and is authoritative for the results.

- **Actor field.** Each tick the live bodies are splatted into the coarse
  field grid (`ActorField`). A moving particle finds the bodies near its swept
  path with a few cell lookups, then runs an exact slab test against those
  only. Coupling 64 bodies to 64k particles is a 7.3 ms whole-engine step.
  The naive per-body tests alone take 101 ms.
- **Impacts transfer momentum.** On a hit, the body receives
  `pmass × (v_particle − v_body)`. Damage is `hurt × (relative speed −
  hurtSpeed) / 100`, so a fast grain bruises, a slow one only nudges, and
  shrapnel cuts. Per kind, the particle then embeds (shrapnel), rebounds
  (grains, gibs) or passes through (flames, which `burn` per second of
  contact instead).
- **Fields push bodies.** Each body samples the fields over the cells it
  covers. A dense sand flow drags it toward the flow's velocity (landslides
  carry you off), and the explosion air field blends it toward the blast wind.
  That is now the *only* explosion knockback.
- **Explosions are mostly particles.** A rocket or grenade spawns seeded
  shrapnel and embers on the server. Clients mirror the same shower from the
  seed in the projectile-end record. Only the overpressure is applied
  directly, so close range is lethal and fragments still sting far beyond
  the blast radius. Averaged over 12 seeds, a grenade does 123 damage at 8
  cells, 69 at 20, 32 at 35 and about 6 at 100.
- **Credit.** Every particle carries an owner. Shrapnel credits the thrower,
  and sand you undercut onto someone credits you. The kill feed shows
  `[Debris]`, `[Fire]`, "was buried" and "burned". Self-inflicted particle
  damage is halved.

### Modular bodies: sharpness, mass and wounds

Clones are built from parts, Cortex Command style (`src/shared/body.ts`):
head, torso, gun arm, off arm, two legs, plus a helmet, a vest and the
jetpack. Each part has a region of the hitbox, a structural **integrity** and
a **wound limit**. Armour covers a base part and is struck first.

Every hit (bullet, shrapnel, thrown debris) carries an **energy** = mass ×
sharpness × relative speed (`pmass`, `sharp` in the particle kind table, and
`mass`, `sharp` on projectiles). Layer by layer, energy above a layer's
integrity penetrates: the layer takes the hit's wound points and the rest of
the energy carries on into the layer beneath. Energy below a layer's
integrity is stopped there and only bruises. Burns, blast overpressure and
hard landings don't need to penetrate: they go into the outermost layer
(blasts hit every part at once, so limbs get blown clean off).

| Hit | Energy | Result |
| --- | --- | --- |
| Rifle round (0.5 × 0.8 × 880) | 352 | Through a helmet (140) or vest (160) and into flesh: two headshots kill |
| Sniper slug (1.1 × 0.95 × 1500) | ~1570 | Through any armour with energy to spare; 38 wounds per layer, so one headshot kills |
| Shrapnel (0.5 × 0.85 × ~460–760) | ~200–320 | Bullet-grade: through a helmet or vest, 12 wounds a layer. A grenade throws 56 fragments, a rocket 36, as tracers |
| Debris grain (0.25 × 0.15 × 300) | ~11 | Bruises and shoves, rarely wounds |

**Classes.** Every clone rolls one at spawn (35% scout, 40% medium, 25%
heavy), shown on the sprite and in the HUD:

| Class | Armour | Jetpack | Run |
| --- | --- | --- | --- |
| Scout | green army helmet, no vest; armour 0.7× as hard | 1.15× thrust, 0.8× fuel use | 1.12× |
| Medium | helmet and vest (the standard clone) | 1× | 1× |
| Heavy | metal plate over everything: armour 3× as hard, every part takes 2.5× the wounds, blasts, fire and falls do 0.4× | 0.6× thrust (it still lifts, slowly), 1.5× fuel use | 0.85× |

A rifle round stops at a heavy's plate, two shots to a medium's head kill,
and shrapnel goes straight through a scout's helmet. Class rides in two
spare bits of the actor flags, and movement scaling lives in the shared
`stepBody`, so prediction stays exact.

A part whose wounds reach its limit is **torn off**. The server broadcasts an
`R_DETACH` record, and every client throws that part as a gib with a blood
fountain. Losing the head or torso kills; the kill feed marks headshots.
Arm joints are built strong (a 44-wound limit, double the original), so it
takes about three rifle rounds to shoot the gun out of a clone's hands.
Otherwise the clone fights on, crippled, and both server and client
prediction use the same `mobility()`:

- one leg hobbles (55% speed, weaker jump); no legs crawls and only the
  jetpack can lift it
- no jetpack, no flight
- no gun arm, no shooting or digging; no off arm, three times the spread and
  slower recovery
- open stumps bleed out, credited to whoever caused them

The attached-part mask rides in every actor record (2 bytes), so sprites
draw what's left: a bare head once the helmet is gone, a stripped chest, and
stumps. Your own record also carries per-part health for the HUD paper doll.

### Falling sand

Loose material (sand and rubble) needs support. A carve's full effect,
`applyCarve`, is to remove cells and then run `Terrain.collapseFrom`. That
collapse is activity-driven. Each row is examined only around cells that
changed in it or just below it (the carve's span, then whatever detached),
widening sideways only when a cell at the edge falls. It stops at the first
row above the carve where nothing fell, so its cost follows the size of the
landslide. Detached cells become grains that pour into the hole, slump to the
repose angle and settle back as terrain. Worldgen ships dunes and buried sand
lenses, and starts stable: loose cells generated over a cave get a dirt
crust.

The collapse is deterministic and part of the carve, so **a landslide costs
the same 12-byte `R_CARVE` as the explosion that caused it**. Every client in
range reproduces the detachment and the grain shower. Only the cells where
grains finally come to rest are sent, as `R_PIXELS`. If a collapse exceeds the
server's grain capacity, the excess drops straight onto support instead of
vanishing.

Collapse makes a cell depend on the cells below it and beside it. So the
replication bookkeeping has a rule: a client's copy of a chunk only stays "in
sync" through an op if every chunk of that op in its own chunk row and below
was in sync too. Otherwise it is re-sent. The op's chunk list is exactly the
set of cells the kernel *read*, not just the ones it changed.

### Replication: chunks, versions and event streaming

The world is cut into 1024 chunks of 64×64 cells. Terrain is **never streamed
as state while you watch it change**. Clients receive *operations* and
re-run them locally:

| Record | Size | Meaning |
| --- | --- | --- |
| `R_CARVE` | 12 B | `x, y, r, core, seed, debrisMax` |
| `R_PIXELS` | 5 + 3n B | rubble that settled in one chunk this tick |
| `R_CHUNK` | RLE | full snapshot, only when needed |

**Debris and collapses cost no bandwidth.** The client applies the same
carve to the same chunk state, gets the same removed and detached cells, seeds
the same Mulberry32 RNG, and calls the same `releaseCarve`. The debris shower
and landslide start out identical on every screen. Flight is cosmetic on
clients (grain-grain coupling depends on which grains a client has, so
trajectories can drift). Only the final resting pixels are authoritative, and
only those are sent.

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
torso, limbs, jetpack and meat (`gibBurst` in `src/client/effects.ts`): gib particles in the shared engine. The parts tumble,
bounce and leave blood trails, and blood droplets stain the terrain in a
client-only stain layer that the chunk rasterizer blends in. Gibs are
cosmetic, but the gold a clone spills is real. The server throws it from the
seed and deposits it as terrain, and every client throws the same shower from
the same seed. Explosive and high-overkill deaths scatter harder.

### Weapons

Every weapon is one row of `WEAPONS` in `src/shared/weapons.ts`, and that
row drives everything: the server's trigger, magazine and projectile spawn,
the client's sprite, muzzle flash, HUD and camera. Add a row and the weapon
exists everywhere.

| Weapon | Fires | Muzzle | Rate | Mode | Clip | Reload | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Rifle | bullet, 880 cells/s | 13 | 450 rpm | auto | 30 | 1.8 s | 110 |
| Bazooka | rocket, 380 | 14 | 60 rpm | semi | 1 | 2.2 s | 140 |
| Grenade | grenade, 330 | 6 | 70 rpm | semi | 3 | 2.5 s | 90 |
| Sniper | slug, 1500 | 17 | 50 rpm | semi | 5 | 2.8 s | 300 |
| Digger | carves terrain | 11 | 900 rpm | auto | ∞ | – | 40 |
| Materializer | builds (see below) | 9 | 100 pieces/min | click | ∞ | – | 60 |

How each field works:

- **Muzzle offset** is measured in cells along the barrel from the shoulder
  pivot (`SHOULDER_X/Y`). Aim is measured from the same pivot, and the gun
  sprite rotates about it. Shots spawn at the muzzle, and the client draws
  the flash in the same place. If the barrel is pushed into a wall, the
  shot starts at the wall: no shooting through it.
- **Rate of fire** is in rounds per minute. The server keeps a fractional
  cooldown and adds the interval on each shot, so 70 rpm averages exactly
  70, not 30 ticks / 26 ticks rounded.
- **Semi-auto** weapons need a fresh press per shot.
- **Projectile type** is a `ProjKind` row in `PROJ`: mass, sharpness and
  damage for direct hits, plus carve, splash, fragments and fuse.
  `ballistic` rounds chip terrain and puff dust. Kills are credited by
  projectile and named by the weapon that fires it.
- **Clip** belongs to the item: each weapon you carry (or find on the
  ground) keeps its own magazine. An
  empty clip reloads itself, and **R** reloads early. Switching weapons
  cancels a reload. The magazine count and reload timer ride in the
  client's own `R_SELF` record for the HUD. Other players see the
  reloading pose through an `F_RELOAD` actor flag.
- **Scope distance:** holding right mouse or Shift pushes the view that far
  down the barrel and halves spread. The server moves that client's
  interest area by the same offset, so it is sent the chunks and players
  it is now looking at.
- **Losing the off arm** makes firing 1.6× slower, reloading 1.5× slower,
  and triples spread.

### Inventory and weapons on the ground

You don't carry every weapon. Each clone spawns with a random kit
(`spawnLoadout` in `src/shared/items.ts`): always a primary (rifle, sniper or
bazooka), a digger and a materializer. It often has grenades too, and
sometimes a second gun. You carry up to five items, each with its own
magazine. **1/2** cycle through them, **4** throws the one in hand, and **3**
picks up the nearest weapon in reach. With full hands, picking up swaps the
held weapon for the new one. Dying spills the whole kit where you fell, so
the dead sniper's rifle is there for the taking. Dropped weapons are cleared
away after 90 s.

- **Ground items are physical.** They fly, bounce, settle and get thrown
  around by blasts. `stepItem` is shared: the server sends an item's full
  state once, when a client first sees it, and again only when something
  changes it (it lands, a blast kicks it, someone takes it). In between,
  the client simulates the same physics, so a gun lying on the ground costs
  no bandwidth.
- **Selection is instant.** Your client applies a weapon switch at once and
  sends the selected slot in each input command, tagged with the
  inventory's version. When the server changes your inventory (a pick-up,
  drop, death or respawn), the version moves on. The server then ignores
  selections made against the old inventory, and the client adopts the
  server's slot.
- **Pick up and drop** are held in that same byte for a few ticks, and the
  server acts on the rising edge, so a tap shorter than a tick still
  counts.

### Fortifications: the materializer

The Materializer turns gold into terrain (`src/shared/build.ts`). Pick a
piece from the menu (click it, or use the mouse wheel). A ghost snaps to a
4-cell grid under the cursor, green where the server will accept it and red
with the reason where it won't. Click to build. New players join with 60
gold, enough for one bunker. After that, you dig gold up or take it off the
dead.

| Piece | Size (cells) | Material | Cost |
| --- | --- | --- | --- |
| Block | 8 × 8 | concrete | 8 |
| Wall | 4 × 20 | concrete | 10 |
| Floor | 20 × 4 | concrete | 10 |
| Ramp (either way) | 16 × 16 | concrete | 12 |
| Plate | 8 × 8 | metal | 20 |
| Bunker | 28 × 20 | concrete walls, metal roof, firing slit, doorway | 60 |

**Placement rules** live in one shared function, `canBuild`. The server
validates every request with it, and the client's ghost previews with the
same function, so green means it will build. A piece must:

- sit on the grid, inside the map, and within reach (80 cells of the
  shoulder);
- be affordable;
- not cover anyone's body or a rocket, though a bunker can go up around
  someone standing inside it;
- be at least half open space, since a piece fills open cells and leaves
  existing terrain alone, so it can be set into a hillside;
- touch something to anchor to.

The build rate comes from the weapon row (100 pieces a minute).

**Built cells are terrain.** Concrete is a new hard material, as is metal:
rifle rounds barely scratch it, and only explosion cores and diggers get
through. It joins the distance field, collisions and the collapse rules, and
crumbles into rubble when blown apart.

**Networking.** A build is a 7-byte `R_BUILD` op (piece, builder, grid
position). It goes through the same chunk-version bookkeeping as carves.
Every client replays `applyBuild` against its own terrain, so a whole bunker
costs less bandwidth than a rifle burst. Clients add a cyan materialize
shimmer and a beam from the builder. Your exact gold rides in your own
`R_SELF` record, so the HUD and the ghost's cost check never wait for the
once-a-second scoreboard.

### Drop rockets

Every clone arrives by drop rocket, including your first spawn and every
respawn (`src/shared/craft.ts`). Up to 64 can be in the air at once.

**A rocket is a rigid body.** It has a position, velocity, angle and spin.
Gravity, the main engine (which pushes along the nose), attitude torque and
quadratic air drag act on it. It collides with terrain through impulses at
points around its hull outline:

- The solver runs sequential impulses with accumulated, clamped totals per
  contact, plus Coulomb friction and moment of inertia.
- Penetration is measured along the occupancy-gradient normal (bisected to
  the surface) and pushed out.
- Substeps scale with speed, so nothing tunnels.

So a rocket can land on its fins, tip over, cartwheel down a slope,
nose-dive, or come to rest lying on its side. A touchdown faster than the
crash speed destroys it outright. Softer impacts break the part that hit.

**You fly it.** While riding in, A/D steer, W burns, S cuts the engine, and
a click bails out. With no stick input, a fly-by-wire autopilot takes over:

- It falls at terminal speed, then fires a late retro burn. The target speed
  is the one from which a planned deceleration stops exactly at hover
  height, with that deceleration fed forward so the burn tracks the curve.
- It leans toward its drop point, refusing to burn far off vertical, so it
  rights itself first.
- It hovers, drops you out of a side hatch, and flies home.

If it tips over with you aboard, it opens the hatch after a couple of
seconds. An empty rocket that can't get home scuttles itself.

**It gibs.** A rocket is built from five parts: nose cone, hull, two fins and
engine. Each has its own hit points, and every hit lands on the part it
entered. Hits are tested against the rotated hull, in the rocket's own frame.
What each loss does:

- **Engine:** no thrust. It falls like a stone, so bail out.
- **One fin:** lopsided drag twists it under power.
- **Both fins:** less steering.
- **Nose cone:** the hull behind it is exposed.
- **Hull:** the end.

A part that comes off flies away with the velocity of where it was on the
spinning hull, as heavy `Hull` fragments in the particle engine plus a
tumbling sprite gib, and the recoil spins the rocket.

**Everything composes with the field engine:**

- **Exhaust:** real flame particles, plus a jet written into the air field
  along the engine axis that blows sand, gibs and clones away.
- **Particle hits:** rockets sit in the actor field (as the AABB of the
  rotated hull, mass 60). Shrapnel, debris and grains hit and hurt them.
- **Blasts:** they damage every part in reach, and the shove spins the
  rocket.
- **Crushing:** a rocket hitting a clone hard crushes it, credited to its
  passenger.
- **Destruction:** a crater, a blast wave, and a shower of `Hull` fragments.

Those fragments maim like shrapnel, push the sand, and settle as **scrap
metal** terrain, so the battlefield fills with wreckage. A rocket is immune
to its own exhaust and isn't dragged by its own jet.

**Networking.** `stepCraft` is pure and shared. The server runs it
authoritatively. The passenger's client gets its rocket at full precision
(`R_CRAFT_SELF`), so it predicts the rocket exactly as it predicts its own
clone: rebase on the server state, replay unacknowledged inputs, ease out
corrections. Tests check that the replay matches the server exactly at
66 ms and 198 ms of latency. Other rockets stream as `R_CRAFTS` (16 B each,
angle and part mask included) and are interpolated, angle included. Losing a
part and blowing up are one seeded record each (`R_CRAFT_PART`,
`R_CRAFT_BOOM`), from which every client mirrors the same fragment shower.

## Measured numbers

`npm run bench` runs Node 22 on a 4-core container, with 64 bots firing all
weapons (60% trigger duty) and running and jetpacking at random, over a world
with dunes, so collapses happen constantly:

```
sim       avg 0.85 ms  p99 4.7 ms      (grains, shrapnel, embers, body parts, collapses, drop rockets, ground items)
replicate avg 0.87 ms  p99 2.6 ms      (budget per tick: 33.3 ms)
downstream per client: avg 18.2 KB/s; room egress 1.14 MB/s
```

`npm run bench:ffa` (one human, 63 server-side bots, free-for-all waves for
two minutes, map resets included):

```
sim       avg 0.57 ms  p99 4.0 ms      (bot AI and rounds included)
downstream to the human: 22.9 KB/s
```

`npm run bench:physics`:

```
1)  grain step cost vs N        N=1k 404 ns, 4k 265 ns, 16k 328 ns, 64k 158 ns per grain-tick
1b) all 7 kinds mixed           N=1k 483 ns, 4k 391 ns, 16k 172 ns, 64k 148 ns per particle-tick
1c) E explosions, 32k particles E=1 0.49 vs 0.009 ms, E=8 2.9 vs 0.14 ms, E=32 3.7 vs 0.30 ms
                                (per-explosion scan vs air-field writes)
2)  probes per swept move       sphere-traced 1.63 vs per-cell marching 10.18 (6.3x fewer)
3)  distance-field update       ~90-120 us per carve, ~470 of 131,072 field cells recomputed
4)  400x120 sand slab undercut  46,735 grains released, all 46,735 deposited, worst tick ~25 ms
```

In the browser (headless Chromium, software rendering on a shared 4-core
box), 40,000 particles of every kind on screen render at a median 16.7 ms
frame (60 fps), with p95 at 33 ms.

Per-grain cost is flat as N grows, so stepping scales linearly. The worst
landslide tick includes the landing. Everyday collapses are a few hundred to
a few thousand grains, which costs a millisecond or two. The tests in
`test/fields.test.ts` check the field against a brute-force reference after
incremental edits. They also check that the collider never tunnels through
1-cell walls, that the SWAR collapse matches a per-cell reference, that a
stable world stays stable after any sequence of carves, and that a collapse
conserves material, including when the grain system is at capacity.

`npm run loadtest` runs 64 real WebSocket bots against `wrangler dev`
(workerd). Each bot decodes every frame into its own terrain replica. Bots
and server share the same 4 cores:

```
rooms={"room-1":64}  rejected=0  decodeErrors=0
frames/s per bot: min 30.0 avg 30.1
frame gap ms: p50 32 p95 46
downstream per bot: ~31 KB/s
server tick (from the room's telemetry log): avg ~4.2 ms, up to ~2.6k grains live
```

With 70 bots, the lobby packs `{"room-2":64,"room-3":6}` and rejects nobody.
RTT tails in the local load test are dominated by the bot harness and workerd
competing for the same CPU. Measure from a separate machine for real
numbers.

## Deploying

```
npm install
npx wrangler login
npm run deploy        # same as: npx wrangler deploy
```

`wrangler.jsonc` declares the two Durable Object classes (SQLite-backed, so
the Workers Free plan works) and the static assets in `public/`. The browser
client `public/app.js` is a build output and is not checked in. Wrangler's
`build.command` builds it before every `deploy` and `dev`, so Cloudflare's Git
integration (Workers Builds), or any bare `npx wrangler deploy` on a fresh
clone, ships the game and not just the menu. Rooms are created on demand. A
`GameRoom` lives wherever its first player connected from, and all of that
match's sockets pin to it.

## Not done yet

- Teams, brains, buying bodies and drop ships, which are the Cortex Command
  meta-game. Free-for-all is the only mode so far.
- Delta-compressing actor records against the last acknowledged frame.
- Running the kernels in a WASM SIMD module. They are already laid out for it.
- A learned (neural) surrogate for dense granular flow. The field formulation
  above is the natural place to plug one in, but nothing here uses one today.
- Sound.
