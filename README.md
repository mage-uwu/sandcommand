# COMSAND

A Cloudflare-native multiplayer shooter inspired by **Cortex Command**: up to
**64 clones per room** fight waves of Last Man Standing and Last Team Standing in one fully destructible
4096×1024-cell world, with bots in every seat no human has taken.
Every explosion carves terrain, throws debris, and the debris settles back as
rubble. All of it is simulated on one authoritative Durable Object and
streamed to every player at 30 Hz.

The war is fought on **TABAR**, an alien world of coral and strange plant
life whose gold and rare earth have drawn an intergalactic mining war. The
planet had masters once: the long-extinct **Progenitors** (Tabarians), an
Atlantis-like, future-primitive people known now only by their pyramids,
ziggurats and rare ornate ruins, the relics and cave art in Extraction's
labyrinth, and the landscape of thorns they left over the **Deadland** (see
[Biomes](#biomes)).

```
npm install
npm run dev          # builds the client and runs wrangler dev on :8787
npm test             # terrain, codec, replication and prediction tests
npm run bench        # headless 64-player server benchmark
npm run bench:ffa    # one human + 63 bots playing Last Man Standing waves for 2 minutes
npm run bench:physics # particle/field scaling, collider probes, big collapse
npm run loadtest     # 64 real WebSocket bots against a running server
npm run deploy       # wrangler deploy (needs a Cloudflare account)
```

Controls: **A/D** run, **W/Space** jump (hold for jetpack), **S** crouch (hold
to go prone; **S** while jetting dashes), **mouse** aim and
fire, **right mouse / left Shift** scope, **R** reload, **1/2 (Q/E, wheel)** cycle
through what you carry, **3 (F)** pick up the weapon at your feet, **4 (G)**
drop the one in hand, **Tab** scoreboard, **Enter** chat, **M** mute all sound, **N** sound effects, **V** aim assist, **I** info panel. With the Materializer out, the wheel or a click
on the menu picks a fortification and a click builds it. Dig gold with the Digger.

**Rare earth** (`Mat.RareEarth`, `src/shared/rare-earth.ts`). Small violet
crystals, deep in the natural ground, worth **ten times their weight in
gold**: every cell dug out with the Digger banks 10 gold, against gold's 1
(`digValue`).
- Each map grows about 56. Each crystal is a 3×3 core with two to four stubby
  shards splaying out of it, and likelier the deeper you go.
- They only grow in soil and rock, never in a bunker, ruin or cave.
- They're drawn as faceted gems: lit upper-left faces, shadowed lower-right,
  the odd white glint.
- Knocked loose, they stay rare earth. Bots that go prospecting weigh them at
  their worth.

**Tutorial** (the menu's **Tutorial** button; `src/client/tutorial.ts`,
`src/client/local.ts`). A single-player lesson that runs entirely in the
browser. It's the server's own `World`, stepped at 30 Hz in the page and
linked to the client the way the socket would be, so nothing goes over the
network.
- **The arena.** A stretch of the map is flattened into open rolling ground,
  from the map's west wall to a ramp at the far end.
- **The steps.** Nine of them, each done when you've actually done it:
  1. run
  2. jetpack
  3. pick up the rifle lying ahead
  4. shoot it
  5. dig the gold pocket under the ground
  6. dig the rare earth crystals beside it
  7. call in a vehicle by radio: a tank, or a mole, watchdog or dropship
  8. get aboard: climb in, ride on top, or drive it by remote
  9. wipe out a mob of four beginner bots that drop in ahead (they don't
     respawn)
- **The coach.** A card at the top gives the step, and a bobbing arrow points
  at what to look for. Command tops your gold up to a tank's price once
  you've dug the crystals.
- **PC or mobile.** The prompts are written for the controls you're using:
  keyboard and mouse, or the touch sticks and buttons. That's detected from a
  coarse pointer, or the first touch, and switches live.
- **Leaving.** **✕ Leave tutorial** quits at any time. At the end it returns
  to the menu by itself.
- **Hooks.** The `World` needed only two hooks for it, `dropZone` and
  `kitFor`.

**Keyboard-only aim** (no mouse needed), like the phone's fire pad: the
**arrow keys** pick an aim direction from your clone (any of eight, with
diagonals), and the aim assist snaps it at once onto the enemy nearest that
way (within 90°), with the laser and LOCK on them. Tap an arrow toward
someone and you're locked on. The direction holds when you let go, and the
crosshair sits out along it as you move. **Left Shift** scopes and **right
Shift** fires. Right Shift also clicks, so it builds and picks radio calls.
Moving the mouse hands aim back to it.

**Aim assist** (`src/client/aim.ts`). The bots aim like machines, so aiming
is near-effortless: point anywhere within 90° either side of an enemy you
can see, scoped or not, and the aim snaps straight onto them. When enemies
compete it takes the one best lined up with your aim. When it's ambiguous,
with another about as well lined up (within about 23° of it), it takes the
**closest** of them, the more immediate threat. So a rough point goes to
whoever is nearest, and a clear point at someone still picks them.
On the enemy it picked, the point goes by angle alone. A head is a target
of its own beside centre mass: aim a touch high for the headshot, a touch
low for the body. On a dropship, nudge between its hull and pods.

**Locked on, it stays on.** Once the aim has locked onto someone it stays
on them while they're in sight, whoever else comes into view. Changing
targets takes a deliberate act:
- **Touch.** A tap or a hold on the fire pad, anywhere roughly their way
  (within 90°), fires at the target you're locked onto. A **swipe** (the
  finger travelling ~36 px) picks a new one, the way it swiped.
- **Mouse.** Swing the pointer well off them (about 30°).
- **Keys.** Point the arrow keys a new way.

Lose sight of them and it moves on to the next at once. This is what makes
scoping easy: lock on and stay focused on your mark.

**Lock first, then fire.** A thumb coming down on the fire pad locks on
before a round goes. A target not already locked waits a moment (~0.1 s)
for the lock to settle and the scope to arrive, so a snap shot with a
sniper lands on the mark, not where the thumb happened to point. A quick
tap's shot waits with it. A target already locked (by AUTO, or from
before) fires at once.

**Never fires for you.** The aim assist only ever aims. Firing is always
your tap, hold or click.

**The fire pad only fires locked on** (touch). With a gun, sweeping the
fire pad around just aims, with no spraying, until it lands on someone.
Then it locks on (the lock-first beat) and fires for as long as you hold.
The pad shows it: a cool grey knob while it's only aiming, red-hot once
it's locked. A target you lose sight of mid-burst stops the burst. The
exceptions, which fire wherever the pad points:
- grenades (thrown, or from the GL);
- the digger;
- the tools (aimed at walls, the ground or friends);
- a tank's guns.

The mouse and keyboard fire on the click as ever (`wheelMayFire`).

**Fire goes down the laser.** Snapped on (or scope-locked), the client
flags its input as locked (`BTN_LOCK`). The server then holds the muzzle on
the target: no recoil climb, and the braced (halved) spread of a scope.
The shot leaves from the shoulder the clone turns to: the one facing the
target, even with the pointer on the other side. The aim, the drawn arm
and the laser are all taken from that shoulder too, so the shots go where
the laser points. Crouched or prone clones have both
points lower. A small pulsing red reticle sits on whatever it has snapped
to. The snap is shown the way the scope shows a lock, scoped or not: a red
laser runs from the gun to the target, brackets close on a snapped clone,
and a LOCK tag marks it (on a dropship, at the hull or pod it picked).
**Zoom and aim are one.** Snapped onto someone when you scope, the scope
goes straight to them, however far out (past the weapon's usual scope
distance), and the reticle stays on them. The scope's spotlight (the
clear circle in its dark vignette) is centred on them too, wherever your
pointer or thumb is, and glides over when the target changes. **It leads
them:** the aim (and
the laser) points where a moving target will be when the shot gets there,
from their velocity and your round's speed (`ballisticAim` in
`src/client/aim.ts`). **Rounds that drop are aimed along their arc:** for
the GL, grenades and the like it solves the launch angle that lands the
round on the target. It takes the low arc, and it counts the game's
30 Hz stepping, the muzzle and the speed your own running lends the shot.
The laser becomes a dotted arc out to where the round comes down, tagged
LOCK, or OUT OF RANGE when the target is too far or too high to reach. Then
it throws as far as it can their way. That holds for auto-aim and the
scope's lock alike. Instant weapons (the laser) need no lead, and the
sniper's 24000-cell/s slug hardly any. Enemy dropships are targets too: the hull, and each engine pod still on
its pylons, so aiming near a pod picks that pod. Scoped, it reaches as far
as the scope sees, and the scope's lock-on works on dropships too. It works
for mouse, touch and keyboard aim. It reaches 650
cells, or as far as the pointer with the mouse, up to 900. Your arm and the
aim line show the snap. Teammates are ignored, and so are tools aimed at
the ground or at friends (digger, materializer, radio, repair kit).
**V** turns it off or on for the mouse, and the choice is remembered.

**K/D.** While you're dead, and between rounds, a card shows your kills,
deaths and K/D for the session, your rank, and your **career** record. The
career record is your lifetime kills and deaths, kept in this browser
(`sc.career`). Under it is a leaderboard of the top eight clones by K/D,
with your own row added if you're not among them. **Tab** still shows the
full scoreboard. Clones gib on
death and spill half their gold as gold rubble that anyone can dig up.

**On phones and tablets** (`src/client/touch.ts`) touch controls switch on
by themselves the first time a finger touches the screen, or straight away
on a touch-first device.
The screen splits down the middle:
- **Left half: movement.** One big floating stick: put a thumb down
  anywhere on the left and drag. Push left or right to run, up to jump and
  jetpack, down to crouch. In a drop rocket the same stick steers, burns
  and cuts the engine.
- **Right half: fire.** A fire pad sits at the centre of the right half,
  not on your clone. Touch in the direction you want to shoot, measured
  from the pad's centre, and you fire that way for as long as your finger
  stays down, following it round. A quick tap gets a shot off.
- **Aim assist does the rest.** The direction snaps onto any enemy in sight
  within 90° of it, with the laser and LOCK showing on whoever it picked
  (`src/client/aim.ts`). Point roughly their way and tap. Teammates are
  ignored.
- **AUTO (on by default; the AUTO button, top left, toggles it and the
  choice is remembered).** With no thumb on the fire pad, the gun finds the
  nearest enemy in sight by itself, in any direction and within its
  weapon's reach. It aims at their centre mass, leading them (on the arc,
  for a lob), and **stays locked on**. It never fires for you: a tap or
  hold on the fire pad fires at once at the target it's on (no lock-on
  wait).
  - **Keeping a target.** It stays on the enemy it has unless another comes
    well closer.
  - **Taking over.** Tap or hold the fire pad and you fire at that lock; a
    swipe picks another target.
- **Taps on a spot.** With the Materializer out, a tap on the right builds
  there, and taps on its menu pick the piece. With the radio up, taps pick
  from its menu. Once you're out of the wave, a tap moves to the next clone
  to watch.
- **Item block (bottom-right corner, 2 by 2).** ◀ and ▶ step through what
  you carry. ▲ PICK picks up the weapon at your feet; hold it to drop the
  one in hand. ◎ ZOOM toggles the scope (in a tank: hold to fire the
  cannon). Empty magazines reload themselves.
- **Layout.** Everything is placed from the visible viewport (not CSS `vh`,
  which on phones counts the browser's hidden bars), and re-placed when it
  changes. The fire pad is sized to the screen and kept clear of the item
  block.
- **Top-left.** SCORE shows the scoreboard, CHAT opens chat.
- **Screen layout.** The HUD shrinks on small screens. The minimap moves to
  the top-right so the buttons have the corner. Deploy goes fullscreen and
  locks landscape where the browser allows it.

## Soundtrack

A dark, lo-fi theme after Crystal Castles and witch house, synthesized
live with Web Audio (`src/client/music.ts`). There are no audio files.
- **Harmony:** a D-minor progression (Dm7, Bbmaj7, Gm7, Am7) at a slow,
  half-time 70 BPM.
- **Pads:** detuned saw pads with a sub-octave triangle, under a low-pass
  whose cutoff drifts on a slow LFO.
- **Arpeggios:** square-wave sixteenths, bitcrushed to 5 bits and fed
  through a dotted-eighth delay. Now and then a step drops out or jumps
  an octave.
- **Low end and drums:** an 808 sub with a little drive, and a half-time
  trap kit (kick on one and the "and" of three, snare on three, hi-hats
  with triplet rolls).
- **Texture:** sparse glassy bells in minor pentatonic, tape hiss, and a
  long, dark generated reverb.

It runs in 8-bar sections: pads and bells, then the arp, then the drop
(drums and 808), a fuller drop with rolls, a breakdown, and back in. It
plays from Deploy (browsers only allow audio after a click) and is
muffled behind a low-pass while you're dead, spectating or between waves.
**M** mutes all sound (music and effects), and the choice is remembered. `composeBar(bar, seed)` is
pure and tested: what plays in each bar comes from the bar number and a
per-session seed, so every session's variation differs.

## Sound effects

Every sound is synthesized too, from noise bursts and swept oscillators
(`src/client/sfx.ts`):

| Source | Sound |
|---|---|
| **Rifle** | A sharp crack over a short, punchy body. |
| **Light rifle** | A bigger, full-power crack with a rolling report. |
| **SMG** | A dull, quick suppressed "thup". |
| **Autocannon** | A hard, deep "dunk" with a mechanical clank. |
| **Blaster** | A bright, falling "pew". |
| **Gatling, tank and dropship guns** | A lower, chunkier report, thinned out at full rate. |
| **Shotgun** | One big, wide boom per shell, not nine. |
| **Sniper** | A .50-cal supersonic crack, a deep boom, an echo rolling back, and a hard strike where it lands. |
| **Bazooka and tank cannon** | A thump and a roaring whoosh. |
| **Grenade launcher** | A hollow "thoomp". |
| **Thrown grenades, bombs, darts** | A swish, a bomb-bay clunk, a blowpipe "fft". |
| **Laser** | A zap sweeping down, fuller the longer it charged, with a rising whine while you charge it. |
| **Explosions** | A crack, a roar and a sub-bass thump, sized by blast radius, then debris pattering down. |
| **Gore** | Meaty thwacks on hits, a bone crack and a wet tear for a lost limb, and squelches, cracking bones and a thud for a gibbing. Synthetic mercenaries clank and spark instead. |
| **Thrusters** | Dropship pods, drop rockets and runaway engines roar; jetpacks and tank jets hiss. |

Sounds are placed in the world. They fade and lose their highs with
distance from the clone you're playing or watching, and pan to the side
they're on. Big guns and blasts carry further. A short room reverb slaps
gunshots back, and a limiter keeps a 64-player firefight from clipping.
A voice budget drops the quietest sounds when too many play at once.
**N** toggles the effects, and the choice is remembered.

### nightttt

The second song, which takes turns with the theme: the theme plays its 48
bars, then "nightttt" its 64, and round again (`SONGS` in
`src/client/music.ts`). The feed says "♪ now playing" as each one starts.
- **Key and tempo.** D Locrian, the darkest mode (a flat second and a flat
  fifth), at a house tempo of 124 BPM. It runs Dø7 → E♭ → B♭ → A♭, and the
  A♭ is a tritone off the root.
- **Octave bass.** Sixteenths that jump between the root and the octave
  above: a square and a saw through a resonant low-pass that snaps open and
  shut, a little driven.
- **Bloops.** Sine blips that drop an octave into their note through a
  resonant filter sweeping down, scattered on sixteenths into the delay and
  reverb.
- **Crushed house beat.** Four on the floor, a clap on two and four, an
  open hat on the off-beats and closed hats on sixteenths, all through a
  3-bit crusher. The echo retunes to the tempo.
- **Arrangement.** It runs in 8-bar sections: a pad intro, the bass coming
  in, the drop, a bloopier full section, a breakdown, a riser of doubling
  claps with no kick, the drop again, and a kick-and-bass outro.
`composeNight(bar, seed)` is pure and tested, like the theme's.

## Mercenary vendors (factions)

Factions are mercenary vendors: the outfit that built and supplied a clone
(`src/shared/factions.ts`). Every clone rolls its vendor when it spawns,
like its class, so every side fields a mix of them. The red/green team
colour stays on the torso, so you can still tell sides apart.

| Vendor | Look | Handling and toughness |
|---|---|---|
| **Guild-Tech** (≈45%) | Grey helmets, cyan visors, olive fatigues: the original clones | The baseline |
| **Rust Nomads** (≈30%) | Tan headwraps trailing loose ends, amber goggles, leather and rusty kit; red bandanas for scouts, scrap plate for heavies | 10% faster runners and frugal on fuel, but thinner-skinned |
| **Synth Legion** (≈25%) | Chrome and gunmetal with a red optic and an antenna; white plastic scouts, black-armoured heavies | Slower and much tougher; lost limbs don't bleed, they spark; they die in scrap and sparks, not blood |

The vendor scales the class's movement (in the shared, predicted physics)
and toughness. It rides in spare bits of each actor's parts word, so it
adds nothing to the frame. The HUD names your body's vendor and class.

## Stances and ragdoll

Hold **S** (touch: pull the move stick down) to crouch. Keep holding on the
ground and the clone goes prone (`stepBody` in `src/shared/actor.ts`).
- **Hitbox.** It shrinks from the top, 14 → 10 → 6 cells, with the feet
  fixed. Shots at standing height pass over a prone clone. Hits on a
  crouched or prone clone are mapped onto the right body part.
- **Movement.** You move at half speed crouched and a crawl prone. You stand
  back up only where there's headroom.
- **Shoulder.** It pivots forward with the torso, so aiming and shots leave
  from where the clone actually is (`shoulderAt`).
- **Jet dash.** Crouching while jetpacking angles the thrust about 55°
  forward into a dash, up to 250 cells/s.
- **Networking.** Stance is part of the predicted body. It rides in the
  spare top bits of each actor's parts word, so it costs no bandwidth.
- **Drawing.** The torso pivots at the hip. Crouched, the legs fold under
  it; prone, the whole clone lies along the ground.
- **Ragdoll.** On top of the stance, a cosmetic spring on the lean tips the
  torso into a run, throws it around in the air, lays it flat into a dash
  and jolts it on landing. It reads only replicated state (stance,
  velocity, flags), so every client poses every clone alike, with no extra
  traffic and nothing to desync.

## Collisions

Clones bump into enemy clones and enemy dropships; your own side passes
through (`World.bodyCollisions`).
- **Clone on clone.** Overlapping enemies are pushed apart, sideways or one
  off the other's head. They trade momentum along the push, so a charge
  shoves the other on and slows you. The test is swept: a clone fast enough
  to cross another's whole width in a tick still hits them.
- **Clone on dropship.** A clone in an enemy dropship's hull or pods is
  thrown clear: along the ship's motion when it sweeps into you, else out
  away from the hull. The ship barely gives, being far heavier.
- **Damage.** A gentle bump or a sprint into someone is only a shove. Past
  260 cells/s of closing speed (a jetpack ram, a fall onto someone's head),
  both take wounds by how hard, each credited to the other. Past 160 cells/s
  into a dropship, the clone takes wounds and the hull takes damage. The
  kill feed calls these kills **Ram**.

## Last Man Standing

Every room plays Last Man Standing waves (`stepRound` in `src/server/world.ts`):

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
   4-minute clock. The **match card** shows it, top left under the HP and
   JET bars (where the clone's vendor and class used to be): the wave, the mode and the clock (red in the last 30 s),
   and beneath them how the sides stand (kings, clones left, the PvP
   leader). If time runs out, the survivor with
   the most kills that wave wins, so nobody wins by hiding in a bunker.
   Big messages (WAVE 3 IN 2, FRAGGED, HAWKINS WINS) are retro console
   banners: block letters made of █, glowing in the message's colour. They
   slide in on a dark, scanlined band edged in that colour. Under the title
   is a terminal prompt with a blinking cursor: the status line, then dim
   green hints. Dead, the status line is how you died, in the kill feed's
   terms (`> KILLED BY REX [SNIPER]_`, `> BURIED IN A CAVE-IN_`, `> CRUSHED
   BY FALLING ROCK [REX BROUGHT IT DOWN]_`), and the countdown to your next
   clone comes after it (`causeOfDeath` in `src/client/game.ts`). Everything is sized and
   wrapped to fit any screen (`src/client/banner.ts`).
5. **A new wave on a fresh map.** The next wave gets a new seed: new
   terrain, with nothing carried over (rockets, dropped weapons, debris in
   flight).

## Last Team Standing

**Last Team Standing** (the team waves): red against green, one life each,
and the last team with a clone standing wins. The countdown banner says
which mode is coming.

**The rotation** (`DEFAULT_ROTATION` in `src/server/world.ts`; `rotation` in
the `World` options): Regicide → PvP → Last Team Standing → Siege, then
Regicide → PvP → Last Team Standing → Extraction, and round again. Last Man Standing (one life each, every
clone for itself) is out of the rotation, though a room can still be given
it.

## PvP

All against all, with respawns, no teams (`GameMode.Pvp`):
- **Length.** A wave runs **5 minutes**.
- **Respawns.** The fallen drop back in by rocket after 5 seconds, so
  nobody sits out.
- **Winning.** When time's up, the most kills this wave wins. Fewer deaths
  breaks a tie, and if that's level too, it's a draw.
- **HUD.** The top bar shows the clock, the current leader and their
  kills, and your own kills and deaths this wave. The victory banner names
  the winner and their kill count.

- **Even teams.** When an LTS wave starts, everyone is dealt into **red** and
  **green** (`drawTeams`). Humans are dealt first, so two humans end up on
  opposite sides, then bots even up the numbers.
- **Opposite sides.** Red's rockets come down on the left 40% of the map,
  green's on the right 40%.
- **No friendly fire.** Teammates can't hurt each other with bullets,
  blasts, shrapnel, debris or rocket crashes (`World.friendly`). Your own
  blasts still hurt you.
- **Fight to the last clone.** One life each, as in Last Man Standing. The last team with
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
- **Skill, 1 to 5.** Every bot has its own (`Player.skill`): 1 Beginner,
  2 Recruit, 3 Veteran, 4 Elite, 5 Expert. A match is an ensemble, not one
  setting.
  - **The spread.** It clusters round Veteran: about 8% Beginners, 22%
    Recruits, 40% Veterans, 22% Elites and 8% Experts (`SKILL_SHARE`). So
    a full match has a couple of pushovers and a couple of aces among
    mostly middling bots.
  - **Balanced teams.** At each wave's start, `World.dealSkills` deals the
    pool so every team comes out even. It goes strongest first, each level
    to the team with the lowest total that still has a bot to give it to,
    and humans count as Veterans. A bot that joins mid-wave draws from the
    same spread.
  - **Aim error.** From 2.6× at Beginner to 0.3× at Expert.
  - **Reaction time.** The delay before shooting at a new target, and the
    look-around after landing, runs from 2.6× down to 0.35×.
  - **Leading.** A Beginner leads a moving target by 15% of what it
    should, a Recruit by 55%.
  - **Range.** How far off it will shoot: 210 cells at Beginner, up to 470
    at Expert.
  - **Hesitation.** A Beginner holds off the trigger half the time, a
    Recruit a quarter.

  Veteran is the bots as they always were. In a test duel against a target,
  Experts did several times a Beginner's damage.

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

## Frosting: craters, gem caverns, geysers and flora

Each map is grown with some extra frosting after its bunkers and caves.
Worldgen does it, seeded, so every client grows the same
(`src/shared/frosting.ts`).

**Craters.**
- Seven to twelve old impact bowls, pressed into flat open ground. None on
  the mountains, where there's no flat ground.
- Each has a raised rim of thrown-up rust soil. Its floor is lined with
  pale drift sand, dark scorched regolith or rust dust, never turf: the
  grass and snow go on the rims.
- They're kept clear of bunkers, towers and the siege works.

**Gem caverns.**
- Two to four geodes, hollowed out of the rock at least 140 cells under the
  surface.
- A rock shell surrounds the hollow. A dozen or so big rare earth prisms,
  up to 15 cells long, point in from the walls, floor and roof.
- Each cavern holds 250+ cells of rare earth: thousands of gold for
  whoever digs down to one.

**Geysers.**
- *The vents.* Black-smoker vents: a squat mound of dark regolith with a
  rock chimney and a sulphur-crusted mouth. Four to six stand on the
  surface and three to five on big cave floors, each ringed by a thicket
  of tube worms.
- *Smoke.* They're neutral: a lazy wisp of steam rises off each one. It's
  ordinary pixel smoke particles, the guns' kind.
- *Setting one off.* Shots and blasts near the mouth wear the vent down
  (`World.hitGeysers`). Out of hit points, it rumbles for a moment
  (thick, fast smoke and sparks) and blows. Left alone, one also goes off
  by itself now and then, with a 1.5 s rumble of warning first.
- *The blast.* A blast at the mouth, then a fountain of rock chunks, hot
  shrapnel and embers. The server spawns the burst and clients mirror it
  from the blow record's seed (`geyserBurst`, `R_GEYSER_BLOW`).
- *The deadly smoke.* After the blast it hangs over the vent for four
  seconds. It's drawn as yellow-green smoke particles filling the space
  where it chokes anyone not sealed in a tank. Kills go to whoever shot
  the vent (kill feed: *Geyser*).
- *Afterwards.* It can't blow again for 40 seconds. Dig its chimney out
  and it's choked for good.
- *Network.* The geysers' state (rumbling, venting, choked) reaches clients
  in `R_GEYSERS`.

**Flora** (client-drawn, `src/client/flora-art.ts`). Placed by worldgen and
drawn only while the ground it grows from stands, so digging or blasting it
out takes the plant with it.
- **Centipede plants:** segmented, curling stalks with a pair of barbed
  legs on every segment and a glowing bud. They sway. Dense on the meadows,
  sparse in the dunes, none on snow.
- **Coral:** gritty pixel-art sprites, each grown from its seed in one of
  seven real-coral forms: staghorn, lattice sea fan, grooved brain dome,
  frilled table plates, pipe organ, knobbly finger, swaying whip.
  - Shaded per pixel: a dark outline, lit upper-left edges, darker at the
    root, and grit (pores and specks).
  - Tips glow in the caves.
  - Six reef palettes.
- **Tube worms:** white tubes with pulsing crimson plumes, round every
  geyser.
- **Hanging coral:** strands from cave roofs, beaded with light.
- **Puffballs:** clumps of swollen, spotted caps.

## Scenery

The battlefield is an alien world, a Mars of sorts. The sky runs from a
dark violet zenith through dusty rose to a butterscotch haze at the
horizon. Over it sit pixel-art parallax layers in the Cortex Command /
Metal Slug style (`src/client/backdrop.ts`):
- **The heavens:** a ringed gas giant hanging over the hills, banded
  lavender and teal, lit from the upper left with a dithered terminator,
  hazed by the dusty air, its ring passing behind it above and in front
  below; and two small cratered moons. The layer barely moves.
- **Dust wisps:** long, flat streaks of high dust in pale salmon, drifting
  on their own.
- **Far mountains:** dusty-rose ranges with faceted faces, lit toward the
  light and shaded on the far side, split from each summit. Their crags and
  frost caps fade into the base colour with ordered 4×4 Bayer dithering.
- **Mid range:** a darker maroon range in front of them.
- **Mesas:** rust mesas and buttes on talus slopes, banded with strata,
  with thin needle spires (hoodoos) between them.

Each layer is baked once into a seamless 1024-cell tile, one pixel per
world cell, and drawn scaled up with no smoothing. The join screen pans
slowly across the same scene.

## Bunker look

Bunkers are drawn like a Cortex Command or Metal Slug bunker from around
2002, not as bolted-together tiles (`src/client/texture.ts`):
- **Concrete** is cast in big staggered panels with recessed joints. It is
  mottled and gritty, with pockmarks and hairline cracks, and grime streaks
  run down from every ledge.
- **Steel** comes in riveted plates, brushed and rusting in blotches.
- **Edges** are bevelled, with light from the top left.
- **Back walls.** Every room has a back wall: dark panelled concrete with
  bolts, vent grilles and conduit runs, shadowed into its corners. The
  king's vault has a steel wall. The map generator lays these down as a
  backdrop layer (client side only), so they stay when the front walls are
  blown away.
- **Cost.** Texturing is a pure function of the terrain around each cell,
  so chunks always meet seamlessly. It costs about 0.14 ms per chunk, and a
  new map is textured over a few frames, nearest the camera first.

## Regicide

A team mode, and a favourite of the rotation (see above).
- **Two fortresses.** A marslike Regicide map always has two large fortresses built
  into it (on the Deadland they are deep Progenitor ruins instead; see
  [The Deadland](#the-deadland)), one per team: red's in the west, green's in the east, about
  1500 cells apart. Each is six modules wide, with two- and three-storey
  towers and battlements on every roof. It has steel facing on its outer
  walls, gates at both ends, and three basement levels. Ordinary bunkers
  fill the rest of the map but keep clear of the fortresses. The generator
  builds them from the seed (`placeStructures(…, fortresses)` in
  `src/shared/structures.ts`). `R_WAVE` carries a flag, so every client
  builds the same map.
- **The king.** One clone per team is crowned and starts as a heavy, deep
  in his fortress's **king's vault**. The vault is a steel-lined room at the
  bottom of the deepest basement, reached only by a shaft from the floor
  above. A king wears his **crown on his head**, in place of a helmet
  (`Part.Crown` in `src/shared/body.ts`). It's armour with integrity 600
  (1800 on a heavy), so it stops every small-arms round, a sniper slug
  included. Only blasts and big guns wear it down, and slowly: it takes
  well over a dozen close rocket blasts. Once it's knocked off (it
  clatters away as a gib), his head is as soft as anyone's. It leans,
  ducks and lies down with the head. Name tags carry ♛, and the minimap
  rings kings in gold. The top bar shows both kings.
- **Soldiers.** Soldiers start already at their posts: in the fortress's
  rooms and on its roofs, with no drop rockets. When one dies, he comes
  back after **10 seconds** by drop rocket, landing at his own fortress.
  Players who join mid-wave are dealt to the smaller side and drop in the
  same way.
- **Winning.** The king never respawns. When a king dies, the other team
  wins the wave, and every member scores. A king who leaves the game hands
  the crown to a living teammate. Waves run six minutes; if both kings are
  still alive at the end, the side with more kills takes it.
- **Bots.** About half the bots assault: they go straight for the enemy king
  and dig through whatever is in the way. The rest fight whoever is
  nearest. A bot king holds his vault and shoots whatever comes into view.

## Siege

Red holds a fortress for ten minutes and green tries to take it. Two
teams play, and the map is built for the mode (`MapKind.Siege`,
`src/shared/siege.ts`). It's in the rotation. **`?room=siege`** joins a
second match that plays nothing but Siege.

**The map.** The fortress stands at one end of the map (which end comes
from the seed).
- **The fortress.** It is twelve modules long, up to four storeys high,
  with three basements. The king's vault is at the bottom of its deepest
  basement.
- **Doors and slabs.** It has steel doors at its gates, and inside it at
  every third ground-floor doorway, so it can be held room by room. Slabs
  are poured on its walls.
- **Outposts.** Three fortified outposts and two sniper towers belong to
  the defenders. They are strung out toward the attackers' end, and their
  doors are red's.
- **Works.** On the side facing the attackers, the fortress and every
  outpost have works in depth: trench lines, row after row of dragon's
  teeth, and iron blocks.
- **Level ground.** Their sites are levelled before the terrain is laid,
  easing back into the land around them.

**The landing zone.** It is a 400-cell strip near the far end, about
1800 cells from the fortress's walls, shown as a green band on the
minimap. Every attacker comes down there by drop rocket, so every attacker
has the whole gap to close.

**Defenders (red).**
- **The king.** He is a crowned heavy in the vault, as in Regicide.
- **Soldiers.** They start at their posts in the fortress and the outposts.
- **Respawns.** A dead soldier is back in 10 s, landing at the fortress.
  Their respawns are unlimited.

**Attackers (green).**
- **Lives.** The team shares **300 lives**. Every death spends one, and a
  dead attacker is back in 6 s while any lives are left. With none left,
  the fallen stay down.

**Armour.** Both sides start with armour in place, so the mode is brutal
from the first second.
- **Defenders.** Three empty tanks and four watchdogs, each watchdog a
  soldier's. They stand in front of the gate and among the outposts.
- **Attackers.** Three tanks and four watchdogs, waiting in the landing
  zone.
- **Tarantulas, sometimes.** Half of all sieges, the attackers also get a
  tarantula, standing beside their landing zone. One in five, the defenders
  get one, out past their gate's armour. The two are rolled separately, so
  some sieges open with one on each side (`SIEGE_ATK_TARANTULA`,
  `SIEGE_DEF_TARANTULA`). Each belongs to one of its side's soldiers, never
  the king.

`MAX_TANKS` is 16 to make room for both sides' armour and some radio calls.

**Winning.**
- **Green wins** the moment the king dies.
- **Red wins** if he is still alive after ten minutes, or once the
  attackers are out of lives with no clone still fighting.
- **Abdication.** A king who leaves hands the crown to a living defender.

**Bots.**
- **Attackers.** About half assault the king directly. The rest fight their
  way in.
- **Defenders.** They hold their ground: most stay in the fortress and the
  ground in front of it, and the bolder ones go out as far as the last
  outpost.
- **The king.** He holds his vault.

In a headless 32-bot siege the attackers reached the walls and spent about
155 lives, the armour was wrecked inside two minutes, and the fortress held.

## Extraction

The fourth mode. **Four teams** (red, green, blue, gold) race down one
massive labyrinth for the **golden idol** at its bottom and out again on an
extraction rocket. Everyone respawns by drop rocket after 10 seconds,
landing around their own team's well. A wave runs 12 minutes.
- **The map** (`src/shared/dungeon.ts`, `MapKind.Dungeon`) is unusually
  deep. The desert sits high (about 140 cells down), and almost everything
  under it is one labyrinth, about 880 cells deep. It's a 63 × 16 grid of
  stone rooms carved as a maze: a depth-first maze biased toward long
  galleries, plus extra doorways and shafts so it plays as a dungeon with
  many routes. Rooms side by side join through full-height doorways (tanks
  fit); rooms above and below join through shafts you jet up or drop down.
- **Ancient stone.** The upper five rows are an alien temple: carved
  sandstone in big ashlar blocks, some engraved with glyphs that glow teal
  (`Mat.Glyph`). Below that are cobblestone ruins: rounded stones in dark
  mortar, with moss in the damp (`Mat.Cobble`). Both are *fixed*, so
  nothing digs or blasts through them. You find the way through.
- **Open spaces.** Up to nine large spaces break up the grid. **Temple
  halls** are tall chambers with ledges where the floors were (clear over
  the middle of each cell, so you can still jet between levels) and
  statues for cover. **Caverns** are irregular voids with rubble heaps and
  boulders on their floors.
- **Landmarks.** A **step pyramid** stands over the middle. It has a shrine
  on its apex, a shaft straight down its heart into the labyrinth, and a
  gallery through its base at ground level. Each team has a **well**, a
  cobble-lined shaft flanked by two obelisks. The inner teams' wells open
  into the top row nearer the middle; the outer teams' wells drop deeper,
  so every team has about as far to go. At the bottom centre is the
  **sanctum**, a glyph-lined hall with the idol on a stepped altar.
- **Booby traps.** There are about 180 per map; the server springs them
  and the client draws them, both from the seed.
  - **Spike pits** in floors bite the legs of anyone who stands in them.
  - **Dart throwers** are carved stone faces in a room's wall. They fire
    across the room whenever someone's in it, at chest height, so going
    prone ducks them.
  - **Brass pressure plates** blow up under whoever steps on them, clone
    or tank, once (`R_TRAPS` carries which have gone off).

  Rooms also hold loot: weapons on the floor, and gold nuggets to dig. Three
  **vacant tanks** wait in the labyrinth, in halls where there's room to
  drive.
- **The idol** is an item (`WeaponId.Idol`). You carry it in your
  inventory, it spills when you die, and you can drop it to pass it on.
  It's heavy: its carrier runs at 80% speed and burns jetpack fuel 50%
  faster (thrust is untouched, so anyone can still climb). Its glow shows
  in the dark, and the minimap shows it to everyone as a pulsing gold
  diamond.
- **Extraction.** Carry the idol up out of the labyrinth into the open (or
  onto the pyramid's steps) and the **extraction rocket** is sent for it.
  It takes 20 seconds to come, so hold out. It lands a little way off.
  Get the idol aboard and your team wins; the rocket lifts off with
  carrier and prize. If the idol surfaces far from where the rocket waits,
  it flies over to land nearer. When time runs out, whoever holds the idol
  takes the wave.
- **Bots** (`src/server/maze.ts`) route through the labyrinth with a
  breadth-first search over its grid graph, cell by cell. They walk
  through doorways, drop down shafts, and jet up them, resting on a ledge
  when the jetpack runs low. Carrying the idol, they climb out by the
  nearest well and run for the rocket. When a teammate has it, they stay
  with them; otherwise they go after it, wherever it is. With 48 bots a
  wave usually ends in two to four minutes, the idol changing hands a few
  times on the way up.
- **Networking.** The map is built from the seed like every other (its
  kind rides in `R_WAVE`). `R_ROUND` adds each team's clones left, where
  the idol is and who carries it, and the rocket's state, position and
  ETA.

## Tanks

Metal Slug style tanks (`src/shared/tank.ts`), drawn as pixel art after
the SV-001 (`src/client/sprites.ts`). The art is a domed turret with a
vision slit and a roof hatch for the driver's head, an olive hull with
rivets and a hazard stripe, tracks whose links crawl and road wheels turn,
a riveted steel plate, a cannon with a muzzle brake, twin vulcan barrels,
and a striped parachute. Each part is a separate layer, so it disappears
when blown off. Each wave, **one or two
come down by parachute** at spread-out spots and land empty (one in three
is a mole, below).
- **Getting in and out.** Walk up to an empty tank and press **3 / F**
  (touch: ⬆) to climb in. The same key climbs back out through the roof
  hatch. Your clone rides inside; you can see its head poking out of the
  hatch.
- **Tread suspension.** The hull settles onto the ground under its rear and
  front treads through a damped spring. It tilts to match hills, both
  tread ends touching, and rocks a little. In the air it levels out
  quickly, leaning a touch into its motion, and it jolts on landing. Cannon recoil pitches the nose up, and blasts rock
  it.
- **Terrain.** The treads climb whatever they can get a grip on: any step
  up to 14 cells for each cell they advance. That covers steep hills (65°
  and more), jagged rock and rubble, and they keep gripping a cell or three
  off the ground, so a bump mid-climb doesn't stop them. Only sheer walls
  taller than that need the jets. Uphill costs at most 40% of the speed,
  downhill gains a little, and a big step costs a little momentum. Rolling
  over a dip, the treads follow the ground down instead of hopping off it.
  An idle tank slides off very steep ground.
- **Tilted parts.** The art, the cannon and SMG mounts, the muzzles, the
  part hit zones and an exposed driver's head all rotate with the hull.
  Tilt is part of the predicted state, at full precision for the driver.
- **Driving.** **A/D** drive the treads. **W** fires the lift jets (their
  own fuel, weaker than a jetpack). They push straight up whatever the
  hull's tilt, and A/D steer in the air. **S** drops you faster while
  airborne.
- **Two guns.** **Left mouse** fires the vulcan SMG, which swivels all the
  way round (or **right Shift**). **Right mouse / left Shift** (touch: hold ◎) fires the cannon: a
  heavy lobbed shell with a big blast, aimed out the front (25° down to 72°
  up), with recoil. A tank's own rounds never hit it.
- **Tough.** The hull holds 75× a clone's health (7500), and every part
  is just as hardened. Penetrating hits
  wound the part they strike; weak shrapnel only scratches. Explosives do
  1.5× against it.
- **Parts that blow off.** The **cannon**, the **SMG**, the **external
  armour plate** and the **hatch shield** can each be blown off. The plate covers the nose and roof
  and soaks half of every blast while it lasts. A lost gun can't fire.
  Every part flies off as real scrap fragments.
- **When the hull goes** the tank explodes (crater, fragments, a blast that
  hurts clones, rockets and other tanks) and kills its driver, credited to
  whoever did it.
- **Safe inside.** A hard steel **shield** (a cupola with a vision slit)
  covers the hatch. While it holds, the driver can't be hit at all: bullets,
  blasts and shrapnel hit the tank. Blow the shield off and the driver's
  head and shoulders stick out of the hatch, where he can be shot like any
  clone. Teammates' fire doesn't hurt a team tank. A tank
  landing on a clone crushes it, and it shoves clones out of its way.
- **Bots.** About half the bots go for a nearby empty tank. They drive at
  cannon range, hose targets with the vulcan, and shell their way through
  walls, or through floors when the target is hidden. A tank that stays
  stuck gets abandoned.
- **Networking.** Tanks go out every frame (`R_TANKS`; there are only a
  few). The driver's client predicts its own tank from a full-precision
  `R_TANK_SELF`, the same way it predicts its clone and its drop rocket.
  Parts blown off and explosions go out as seeded records (`R_TANK_PART`,
  `R_TANK_BOOM`), so every client throws the same scrap.

## Radio and dropship

Every clone carries a **Radio** (`WeaponId.Radio`, always in the kit
alongside the digger and the materializer). With the radio in hand, a menu
comes up: click **Dropship** or **Tank** to call it in for **1500 gold**,
a **Mole** for **1100**, a **Watchdog** for **1000**, or a **Tarantula** for **3000**. The radio then needs 30 seconds to recharge
(`World.call`, `C_CALL`).

**Choosing on the radio** (`src/client/radio.ts`). One line of the menu is
highlighted, and firing calls whatever is highlighted. Three things move the
highlight, and the latest wins:
- **The aim.** Straight up picks the top line, straight down the bottom
  one. That works with the mouse, the arrow keys or the touch fire pad,
  which stays an aim stick while the radio is out.
- **The wheel.** One line per notch.
- **Pointing.** Hovering a line, or tapping it.

Only a real swing of the aim moves the highlight, so a line picked with the
wheel holds until you swing. Firing means a click, right Shift, a tap, or
pushing the fire pad past halfway.

**Remote control with a fleet** (`World.remotesOf`, `togglePilot`). **P**
steps through every drone you have, then back to your clone: each dropship,
each watchdog, each tarantula, in that order. **Shift+P** goes the other way.
- Whatever you step off goes back to its own brain, and one that's gone
  drops out of the list.
- Touch has a **DRONE** button that does the same.
- A strip at the bottom right lists **YOU** and each drone, the one you're
  driving lit.
- The radio's last line is the remote, naming the drone it hands you next.

- **Watchdog** (`src/server/watchdog.ts`). A small unmanned robot tank,
  parachuted in beside you. It's two-thirds the size of a tank and
  two-thirds as tough, and it carries the same vulcan and cannon. A
  `Tank` with `s` = 2/3 and an `owner`: every tank geometry function
  scales by `s`. It wears bare machined steel, not the tanks' olive camouflage, and has a sensor mast with a light in your colour, and a
  red eye. There's no seat in it and nobody can climb in. You get one at a
  time; it shuts down if you leave the game.
  - **On its own** (the default) it **guards you**. With nothing about, it
    heels at your side. When a hostile comes within 420 cells, it **gets
    between you and the nearest one**: onto the ground halfway toward the
    threat, up to 70 cells out in front of you, so whatever comes has to
    come through it first.
  - **Its guns.** It hoses the nearest hostile it can see within 280 cells
    with the vulcan, leading it. It lobs cannon shells on the arc that
    lands (the shared ballistic solver) at enemy vehicles, and at clones
    more than 60 cells from you. It never fires with you in the line.
  - **Getting about.** It jets over what its treads can't climb, and
    follows you up to a higher level. It slips past you and your side
    rather than shoving you about.
  - **By remote** (**P**, or *Drive watchdog* on the radio menu) you drive
    it yourself, like the dropship: A/D treads, W jets, click the vulcan,
    right-click the cannon, with auto-aim. Your clone stands inert and
    shootable where you left it, and the view rides with the watchdog. **P**
    cycles: your dropship, then your watchdog, then your tarantula, then back to the clone. Its
    autonomy takes over again the moment you let go.
  - **Destroyed.** A watchdog destroyed while you drive it doesn't take you
    with it.
  - **As a target.** It counts as a vehicle: AT missiles seek it, mines
    under it go off, and enemy bots shoot at it.

- **Tarantula** (`TankKind.Tarantula`). An ultraheavy spider droid, three
  times a spider droid's size (24 x 42 cells), parachuted in beside you.
  It has **twice a tank's hull**. Under the hood it is a `Tank` with a
  `kind`: its design cells are a spider droid's own, scaled by `s` = 3,
  so the tank geometry (hit testing, part centres, muzzles) works
  unchanged. It has its own hand-made pixel art
  (`src/client/tarantula-grids.ts`, drawn by `tarantula-sprites.ts`), chunkier than a spider droid: an
  iron hip frame, blued-steel flanks with its owner's stripe and rivets,
  white ceramic armour plates over its back and segmented abdomen (shot
  away, scorched iron shows), a ceramic-and-steel camera head with the
  laser's red lens on an iron mast, and a hazard-striped iron missile rack.
  The body tilts with the ground and the head and rack turn with the aim,
  rotated nearest-neighbour so they stay on the pixel grid. Its legs are
  pixel-drawn: steel thighs up to ceramic-capped knees, iron shins tapering
  to steel points, the feet planted in the world on the spider droids'
  tripod gait. You
  get one at a time (a watchdog besides is fine), nobody can climb in, and
  it shuts down if you leave the game.
  - **Its guns.**
    - **Missiles.** An **automatic missile launcher**: a twin-tube rack on
      its back that turns all the way round. It fires a stream of
      straight-flying missiles, about two a second from alternating tubes
      (`ProjKind.SpiderMissile`). Each has a **hand grenade's blast**.
    - **Laser.** A **laser** in its head fires thin instant beams like the
      laser rifle's, five a second, automatically. Each beam does three
      times its old damage. It goes through every clone in its way and
      stops at terrain or a vehicle (`World.beam`, shared with the laser
      rifle).
    - **Vaporizing.** The laser **vaporizes** what it touches. Every
      soldier it passes through takes a burn on top of the beam. Where it
      lands, it takes a bite out of the ground: 11 cells across, hard
      material within 6, with almost no debris
      (`SPIDER_VAPOR_R`/`_CORE`/`_BURN`).
    - **Digging with it.** Five beams a second dig about as fast as a
      digger in soil, and faster through concrete. Pig iron still resists
      it, and a door takes damage instead.
  - **On its own** it thinks as the watchdog does, with its own kit
    (`SPIDER_KIT`): it looks further (560 cells) and screens further out
    (90). Its laser reaches 420 cells and needs no leading, its missiles
    520, and it fires both at once down the same line. It holds fire with
    you in the line, and saves the missiles for vehicles and clones over
    60 cells from you.
  - **Getting about.**
    - **Walking and climbing.** It walks, its legs stepping up 18 cells a
      stride and keeping the body level. Pushing into a sheer wall, or
      holding W with one alongside, it **walks straight up it** and over
      the top (S climbs down).
    - **Leaping.** On open ground, W **leaps**: about three bodies high
      (120 cells), with a shove the way it's walking.
    - **Gliding.** Holding W on the way down fires its **belly rockets**.
      Their thrust is less than its weight, so they can't lift it, but they
      ease its fall to a gentle 70 cells/s and let it steer wider than it
      walks. A leap that would carry 90 cells glides almost 300.
    - **Rocket charge.** The rockets run on a charge that lasts about 4.5 s
      and refills on the ground.
    - **Landing.** It lands on whoever is underneath.
  - **Its parts.** The laser head, the missile rack and the plating can
    each be shot off. Rounds flying under its belly pass between its legs.
  - **By remote**: A/D walk (into a wall to climb it), W leaps (and,
    held, glides) or climbs a wall alongside, S climbs down. Click fires
    the laser, right-click the missiles.

- **Tank.** An empty tank is parachuted onto your position. Climb in, or
  leave it for a teammate.
- **Mole** (`TankKind.Mole`, `newMole`). A smaller tank for tunnel fighting,
  parachuted in empty like a tank, and one in three of the wave's tank
  drops.
  - **Size and hull.** It is four-fifths a tank's size (26 x 18 cells) with
    **70% of its hull**.
  - **No cannon.** In its place is a **plasma flamethrower** on a hump on
    its back that swivels all the way round. Right mouse / Shift fires it,
    twenty gouts a second, for as long as it's held (`ProjKind.Plasma`).
    - **Range.** Each gout reaches about 110 cells, drifting up as it burns
      out, so it falls short of anyone further off.
    - **Damage.** It sears whoever it reaches (10 a layer), and leaves a lick
      of flame where it lands that burns whoever stands in it.
    - **Digging.** Each gout burns a hole into the ground (5 cells, hard
      material within 3), so a mole digs as it fires. Two seconds of it
      clears a tunnel through soil or concrete. Pig iron still resists it,
      and a door takes the damage instead.
  - **SMG.** A **heavier, faster SMG** sits on its iron jaw: 900 rounds a
    minute of 22-a-layer rounds (`ProjKind.MoleRound`), against the tank's
    720 of 14.
  - **The frill.** Out front stands a great steel **frill**, triceratops
    style: a fan-shaped plate rising from its nose and flaring back over the
    deck, spikes round its rim, two bone-white horns at its foot.
    - **Cover.** It has a hit box of its own, standing above the hull
      (`MOLE_FRILL_BOX`), so fire from the front strikes it before the
      **three riders** standing on the mole's back behind it.
    - **Toughness.** It has 3600 hit points (more than a tank's armour
      plate).
    - **Losing it.** Shot away, it flies off as steel scrap, and the riders
      are open from the front too. From behind they always were.
  - **Livery.** Its own pixel art in a mining machine's ochre and rust,
    with a blue-glowing nozzle (`moleHull`/`moleFrill`/`moleNozzle` in
    `sprites.ts`).
  - **Bots.** Driving one, a bot uses the SMG at range and the flamethrower
    up close, and burns its way through when blocked or when its target is
    behind a wall.
- **Tank surfing.** Press **3** beside a friendly vehicle to climb up and
  ride on top of it, and **3** again (or jump) to get off. A teammate's tank,
  watchdog or tarantula is friendly; in a free-for-all, only your own
  watchdog or tarantula is. A watchdog carries two riders, a tank or a mole three,
  a tarantula five, standing on its deck (the tank's rear deck and glacis,
  the mole's back behind its frill, the tarantula's back) and going wherever it goes, so vehicles become convoys.
  Riders aim and shoot as ever: their shots pass over their own vehicle, and
  its guns fire over them. They're thrown clear when it's destroyed.
  Bots use it: with a fight still a way off and a friendly vehicle near them
  heading for it, they get on, shoot from the deck, and hop off when the
  fight is close, or the ride stops or turns away (`World.mount`,
  `seatRiders`; seats in `surfSeat`, `src/shared/tank.ts`).
  **Dropships carry riders too.** Three clones can stand on the roof of a
  friendly dropship's hull, between its pylons: one of your own, or (with
  teams) one of your side's. Jetpack up level with the roof and press **3**.
  - You ride wherever its brain flies it: scouting, covering, strafing,
    bombing. You shoot from up top; its turrets and bombs never hit you, and
    your shots never hit it.
  - Jump or press **3** to get off. You're thrown clear if it's shot down or
    turns for home (`shipSeat`, `SHIP_RIDERS` in `src/shared/dropship.ts`).
  - Its record lists its riders like a tank's. Clients draw them on its roof
    as they draw it.
  - Your own riding state reaches you as the vehicle's slot and seat, with a
    top bit marking a dropship.
  Each vehicle's record lists its riders and their seats. Every client draws
  them on those seats on the vehicle as it draws it, never from the riders'
  own snapshots. The driver's vehicle is predicted ahead of those snapshots,
  so riders drawn from them would slide and stutter about the deck. The
  mole's seats sit on its humped hull (the hatch, then the flamethrower's
  cupola), each with its own deck height.
- **Dropship** (`src/shared/dropship.ts`). An aerial gunship that hangs
  from four engine pods on struts, like a modern drone. Nobody pilots it.
  The pods are chunky rocket motors, two on an open-truss pylon either
  side, out past the hull's ends, so they're exposed to fire from below.
  Hits are tested against the real hull, pods and turrets, not the ship's
  bounding box, so shots pass through the open space under the pylons. An autopilot tilts the hull to move and shares lift and attitude torque
  between the engines still attached; it holds attitude first and lift
  second. It flies in, then works on its own (`World.planShip`). In team
  modes it works for the **whole team**, not only its caller. A few times
  a second it picks a mission, shown on its tag to its own side:
  - **Intercepting.** An enemy dropship within 700 cells of it, or of
    any of its side, comes first: air superiority. It flies to a stand-off
    about 170 cells beside the enemy, matches its altitude, and weaves in
    and out and up and down on its own rhythm. Its turrets reach 460 cells
    against ships and take enemy ships ahead of soldiers. Each turret aims
    for one of the engine pods hanging out on the enemy's pylons, so a
    dogfight usually ends with pods shot off and the loser spinning down,
    in around 15–20 s. Remote pilots can fight other dropships by hand
    too, since gun rounds hit an enemy ship's hull, pods and turrets.
  - **Ramming.** Rival dropships collide. Hulls that meet are pushed apart
    and bounce, and both take hull damage by how fast they closed (a
    nudge below 25 cells/s is free), credited to the other's caller, with
    a spin kick. Ships on one side pass through each other.
  - **Covering.** When an enemy is close to an ally, it flies over that
    enemy. It picks the ally under the most pressure: nearest the threat,
    hurt, and its caller first.
  - **Striking.** Otherwise it goes after enemies within 900 cells of
    any ally. Groups and enemies already spotted come first.
  - **Scouting.** Otherwise it flies 300–700 cells out ahead of its lead
    (its caller, or the nearest teammate while the caller is down). It
    heads the enemy's way, or the way the lead faces, and sweeps back and
    forth.
  - **Leash.** It never strays further than 750 cells from its side
    (1100 in team modes). It climbs over the highest ground between
    itself and its goal, so it doesn't fly into hills or towers.
  - **Spotting.** Enemies in its sight (620 cells, with a clear line)
    are spotted for its side for 4 s (`R_SPOTTED`). Spotted enemies get red
    brackets on screen, an arrow at the screen's edge when off screen,
    and a red ring on the minimap. A fresh contact is called in on the
    feed: "▲ dropship: 3 contacts, 420m east".
  - **Turrets.** It strafes enemies in sight with a turret on either side.
  - **Bombs.** It bombs whichever enemy is under it (it carries **8**,
    each with five times a bazooka's blast). It leads each bomb by its
    fall time, drops only with a clear line down, and never bombs an enemy
    standing next to an ally.
  - **Leaving.** It flies home after two minutes, when it has no bombs or
    turrets left and has been idle a while, or when its caller leaves. In
    team modes it stays on while any of the caller's team is still in the
    match.
- **Remote piloting.** The caller can fly their dropship by hand from
  anywhere. Press **P**, or pick **PILOT DROPSHIP** on the radio menu, to
  take over (`CallKind.Pilot`); press P again to hand it back. Your clone
  stays where it stood: alive, inert and as shootable as ever. The view
  rides with the ship.
  - **Controls.** A/D slide it, W/S climb and sink (never into the
    ground), click fires both turrets at the mouse, right-click drops a
    bomb.
  - **Stability.** The autopilot still keeps it level and holding the
    point you steer it to.
  - **Ending it.** Piloting ends when the ship goes down or heads home, or
    when your clone dies. Whenever nobody is flying it, the autopilot's own
    brain (covering, striking, scouting, spotting) is back in charge.
- **Bots fight back.** When an enemy dropship is in sight within 360
  cells, and nearer than the clone it's fighting, a bot turns its gun on
  the ship. It aims for an engine pod still on its pylon (else the hull)
  and leads the ship's motion. It won't use grenades, tools or the radio
  for this.
- **Bots buy air support too.** Now and then a bot takes on a rare
  objective: prospecting. Each life it has a 15% chance.
  - **Finding gold.** When no enemy is close and in sight, it looks for
    real gold within about 220 cells either side and 250 down: a seam
    with plenty of gold around it, not a stray speck.
  - **What it skips.** Seams under a bunker's concrete or steel, or under
    stone that never yields, are skipped. Rock in the way only makes a
    seam count as further off.
  - **Digging.** It walks until it's right over the seam and sinks a shaft
    straight down to it, the digger beam sweeping a little either way so
    the shaft is wide enough to drop down. Then it banks the gold, moving
    on through the seam.
  - **Giving up.** If four seconds of digging bring in nothing, it gives
    that seam up and finds another.
  - **What it saves for.** Not only dropships. Each bot has a *wish*: a
    watchdog, mole, tank, dropship or tarantula. It saves that wish's price
    and calls it in once it's banked, then picks the next.
  - **The odds.** Watchdogs are likeliest (cheap, and they fight beside
    it). Moles, tanks and dropships are about equal. A tarantula, at 3000
    gold, is mostly for the better bots (`wishOdds` in `bots.ts`).
  - **Never the impossible.** It never wishes for something it can't have.
    That rules out a second watchdog or tarantula of its own, a dropship
    while one of its side's is already up, and anything once the slots are
    full.
  - **A tank or mole it bought.** It goes and climbs in, from further off
    than for any other empty tank, whatever the fighting.
  - **Endgame.** With four enemies or fewer left in a wave, it stops
    digging and finishes the fight.
- **Damage.** The dropship has about half a tank's toughness (3750 hull).
  Each engine, each turret and the bay doors can be shot off separately.
  Without doors it can't bomb. On three engines it leans on the rest and
  keeps flying; lose more and it flips and crashes. **An engine shot loose
  keeps burning**: it's a runaway rocket (`ProjKind.Engine`) that thrusts
  along a heading spinning ever faster for 2.5 s. It spins out, tumbles,
  and blows up like a big rocket on the terrain or the clone it smashes
  into, credited to whoever shot it off. Its spin and heading come from its
  projectile id, so every client flies it the same way. When the hull goes, it
  explodes along with whatever bombs it still carries. Its caller's and
  teammates' fire doesn't hurt it.
- **Networking.** Dropships go out every frame (`R_SHIPS`, 24 bytes each).
  Each record carries position, tilt, parts, bombs, turret aims, doors, its
  mission and per-engine throttle for the exhaust. Parts lost and the final explosion
  are seeded records (`R_SHIP_PART`, `R_SHIP_BOOM`).

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

Complexes vary in style and layout:
- **Styles.** Each complex is built in one of four styles. *Concrete* is
  the classic look. *Steelworks* has metal walls and ceilings and a steel
  back wall. *Ruined* has most modules shot through and rubble heaped on
  the floors. *Fortified* has steel facing on its outer walls and merlons
  along its roofs.
- **Grand halls.** Some complexes open a hall two storeys high across two
  modules, with mezzanine ledges and a heavy gun on the floor (Gatling,
  shotgun, GL or laser).
- **Bank vaults.** Some have a steel-lined vault in the deepest basement,
  sometimes two modules wide, with gold bars stacked on its floor.
- **Sniper towers.** Narrow towers 3–5 storeys tall stand clear of the
  complexes. Each has doors on both sides, firing slits on every storey,
  holes in alternate floors, and a battlemented metal roof with a sniper
  rifle lying on it.
- **Map loot.** Guns placed by the generator spawn when the wave starts
  and don't expire.

### Bunker works

`src/shared/fortifications.ts` adds the following after the complexes are
built. It uses its own random stream, so the complexes themselves come out
exactly as before.

- **Steel doors.** Outer ground-floor doorways get a 34-cell sliding steel
  door: every door on a Fortified complex or fortress, and 60% of the rest.
  Ruins get none.
  - **Whose door it is.** Each door belongs to a side. A fortress's doors
    belong to its own team. Any other bunker's belong to the side its
    soldiers land on: west is red, east is green.
  - **Opening and closing.** The server (`World.stepDoors`) slides a door
    up, two rows a tick, while one of its own side is within about 22
    cells. It slides back down once none is near and nothing stands in the
    doorway.
  - **No teams, no lock.** In Last Man Standing and PvP it opens for
    anyone.
  - **Breaching.** Door steel never carves. Instead a door has hit points:
    60% of a tank's hull. It takes damage the way a hull does. A round that
    can't punch armour barely scratches it. A shaped charge takes a share of
    the whole door. Blasts dent it with their overpressure, and diggers and
    lasers wear it down.
  - **Blown out.** Once its hit points are gone, the door blows out with a
    bite of the wall above it, and the doorway stays open for good.
  - **Lamp.** A lamp over each door shows green if it opens for you and red
    if it doesn't. It blinks amber while the door moves.
- **Reinforcing slabs.** A 12-cell concrete slab is poured against the
  outer end walls, above the doors. Every Fortified complex and fortress
  gets one, and 60% of the others. A wall takes far more to breach.
- **Strongrooms.** 40% of complexes of two or more modules get a great vault
  under their deepest basement.
  - **Size and build.** It is a storey and a half high, up to three modules
    long, cast in pig iron with a steel floor.
  - **Way in.** A shaft drops into an antechamber, and a steel door leads
    on into the vault.
  - **Inside.** Gold is stacked along its floor, and a heavy gun lies there.
  - **Caves.** The cave highway keeps below it, and no cave shaft goes
    through it.
- **Pig iron** (`Mat.Iron`). This material is hard and *tough*: a carve's
  core takes it only within half its radius, so a blast or a digger bites a
  quarter as much of it as of concrete. It goes into strongroom linings and
  great **iron blocks**, 16–22 cells square, sunk into the open ground near
  the bunkers.
- **Dragon's teeth.** Rows of 3–5 concrete pyramids stand in the open,
  18 cells wide and 24 tall. Their sides are 18 cells sheer, more than a
  tank's tracks can climb even off a bounce. Between them is room for a
  clone to land.
- **Fittings** (`src/client/decor.ts`, client side, purely for looks).
  Rooms get fittings on the back wall or hanging from the ceiling, never on
  the floor, so nothing looks like cover that isn't:
  - caged lamps casting pools of light, some flickering;
  - pipe runs with valves, and sagging cables;
  - vents, fuse boxes with winking telltales, and gauges;
  - faded posters and rifle racks;
  - stencilled level markers (L2, B1) over hazard stripes, and VAULT in the
    strongrooms;
  - a fortress's team banners.

  A lamp goes out when the ceiling it hangs from is shot away. Anything
  buried or filled in disappears.
- **Sandbags** (`Mat.Sandbag`). Piles 12 cells tall stand outside the doors
  and on some roofs. That hides a crouching clone (10) but not a standing
  one (14).
- **Trenches.** Trenches are dug into level natural ground beyond the
  bunkers.
  - **Depth.** They are 17 cells deep, so a standing clone is out of sight.
  - **Fire step.** It is half that depth, against the front wall. A clone
    standing on it has its head over the lip, and crouching drops it back
    out of sight.
  - **Getting in and out.** A half step leads up to the fire step, and
    4-cell stairs climb out at the back.
  - **Parados.** Sandbags are heaped on the back lip.

## Biomes

Each map's seed picks a biome (`biomeOf` in `src/shared/worldgen.ts`). The
countdown banner names it. Four biomes are **marslike**: rust soil over
basalt, the base of everything, and the deep of every map, the Deadland's
included. The fifth is the **Deadland**.

| Biome | Terrain |
|---|---|
| **Marslike dunes** | Rolling dunes of rust dust over the soil. Patches of lichen. |
| **Marslike canyons** | A high rock plateau cut by 3–5 deep ravines, 45–120 cells wide and up to 340 deep. The rock is banded with strata and the ravine floors are sand. Some ravines have a natural rock bridge. Extra sniper towers. |
| **Marslike highlands** | Ridged mountains up to 330 cells above the valleys, rockier underground, and capped with snow above the snowline. Many sniper towers. |
| **Marslike meadows** | Gentle hills under a thin crust of rust dust, mostly lichened over. |
| **Deadland** | A crust of Progenitor debris over the marslike deep, and a landscape of thorns: cement caltrops on a menacing scale. No bunkers; ancient ruins instead. See below. |

About one ordinary map in four is Deadland, rolled separately from the seed
so the marslike maps keep their biomes. Regicide maps are Deadland one time
in five and otherwise Dunes or Meadows, so the forts have room to stand.
Siege maps are only Dunes or Meadows, since the megafortress wants marslike
ground. Extraction's labyrinth is always Dunes.

### The Deadland

A hostile brutalist architect's wet dream, left to rot for eons
(`src/shared/deadland.ts`).
- **Materials.** Five new ones (`Mat.Glass`..`Mat.Cement`, with
  `isDeadGround`):
  - **Trinitite**: green glass, with a sheen on top, flaws, bubbles and glints. Knocked loose, it breaks to gravel.
  - **Gravel**: loose, with light and dark pebbles.
  - **Ash**: loose drifts of soot-black and bone-white ash, flecked with each other.
  - **Char**: burnt fill, with the odd long-cold cinder. It crumbles to ash.
  - **Cement**: the Progenitors' cement, hard and tough like the bunkers' concrete (small arms barely mark it).
- **The crust.** Some 45–155 cells deep (20–200 ft), over the marslike ground:
  - On top: a skin of ash, glass, cement pavement and gravel.
  - Below: char, with toppled cement blocks, broken dragon's teeth, glass slivers, cement strata, and lenses of ash and gravel.
  - Nothing grows on it. There is no grass or flora, the caves stay out of it, and no works are dug into it.
- **The landscape of thorns.** Fields of cement monuments across the map, inspired by the proposed "landscape of thorns" nuclear-waste marker. The caltrops are the Deadland:
  - **Caltrops.** Three blunt arms with a squared hub, 50–300 cells long against a clone's 14. One in six is colossal, standing as a tripod with one arm to the sky and two legs splayed over an arch you can pass beneath. The rest lie at any angle, with the lowest tip driven into the ground.
  - **Other pieces.** Tilted slabs, groves of spikes, and dragon's teeth strewn round every piece.
  - **The look.** Each piece reads as one single pour, a sterile monolith. It has a slow cloud of tone and faint weather streaks, but no courses or joints. A hard dark outline runs wherever it ends, with a lit lip on the top and left and a shaded one below and right, so it reads as made, not grown.
  - **The sky.** Under and between the arms, the sky shows, not a cave's dark. The client's skyline skips pure-cement runs with air beneath them (`groundFrom` in `src/client/game.ts`).
- **Ruins, not bunkers.** No player bunkers are built on the Deadland. The massive caltrops are the fortification. Instead there are 4–7 small Progenitor ruins, each a passage:
  - A stepped glyph-stone portal on the surface.
  - A cobble tunnel slanting down through the crust.
  - One to three cobble chambers, banded with glyphs, breached here and there, with rubble on their floors.
  - A stair climbing out the far side to daylight again.
  - Cobble and glyph stone never yield.
- **Regicide on the Deadland.** The two fortresses are deep ruins, red's in the west and green's in the east. Each has three chambers, with the king's chamber at the bottom and spawns down its length. The caltrops round them are their walls.
- **Sky and backdrop.** The sky is an ashen, sallow gradient. The parallax layers hold grey mountains and two ranks of thorn silhouettes: caltrops, spikes and slabs over rubble (`Backdrop.setBiome`).
- **Bots.** If a bot walks toward its goal but gets no nearer for five seconds (wedged under a caltrop's arm, say), it backs off and jets up, then comes at the goal again from higher up.

**Cave maps** (`src/shared/caves.ts`). About two marslike maps in five (ordinary
or Regicide, never the labyrinth or the Deadland; `cavesOf` by the seed) are cave maps:
under the bunkers runs a vast tunnel system, the underground battle
highway, and the countdown banner says so.
- **The highway**: one tunnel 60–80 cells high the length of the map,
  following the land above it some 210 cells down, wandering, always below
  every bunker's deepest basement, and never steeper than you can walk or
  roll. Its walls are rimmed with basalt; stalactites hang from its roof,
  boulders and rubble mounds lie on its floor.
- **Citadels**: two or three huge domed caverns on it. About half hold an
  underground fortress (a fortified or steel-built bunker complex, as tall
  as the dome allows, halls, vaults and loot included), a paved road across
  the cavern floor, and a gatehouse on the highway at either side: a wall
  down from the cavern roof to a steel-headed gate the highway runs under
  (portcullis teeth along its foot, tall enough for a tarantula), with a
  guard room in it over the gate (a hole up into it from the gateway,
  firing slits both ways).
- **Natural citadels**: the other half are nature's fortresses, no masonry
  at all. A vast mass of basalt hangs from the dome over the middle (the
  keep), its underside a low arch the highway runs under, with chambers
  inside it one over another: a hole up into the lowest from beneath, a
  chimney between them, windows out each side, gold in their walls. Either
  side, a curtain of rock hangs from the roof over the highway (the gates).
  Rock ledges jut from the walls high enough for a tarantula to walk under,
  great stalactites hang from the dome, low stalagmites dot the rolling
  floor.
- Everything in a cavern hangs or stands clear of the way through: the
  highway stays walkable end to end, under every gate and keep. Wherever a
  tunnel or cavern floor would open into a natural cave below it, a bed of
  rock bridges it.
- **The deep run**: a second tunnel some 100–170 cells under the highway
  (and under the citadels' basements), wherever there's room above the
  bedrock, joined to it by three to five long sloping passages.
- **Shafts**: every bunker complex and sniper tower sinks a concrete-lined
  shaft, wide enough for a tarantula, from its deepest basement (or ground
  floor) straight down into the highway; every citadel one on down into the
  deep run. They never go through a king's vault or a bank vault. So every
  bunker on the map is connected underground.
- **Ramps**: two or three long sloping tunnels from open ground down into
  the highway, for tanks and anything else that can't jet. Where one passes
  under a bunker, it stays well below its basements.
- **Galleries**: winding side tunnels off the highway, each ending in a
  chamber with a seam of gold in its floor.

Bots find their way through it (`caveNav` in `src/server/bots.ts`): with
their target on another level (the surface, the highway, the deep run) and
out of sight, they take the nearest way there, walking ramps and passages,
jetting up shafts (resting beside one when the jetpack runs low), and
dropping down the shaft in a basement they stand in.

**Dripstone** (`Mat.Dripstone`, `dripstone` and `dripCaves` in
`src/shared/caves.ts`). Stalactites hang from the roofs of the natural caves
on every map (the odd stalagmite stands on their floors), and from the
highway's roof and the natural citadels' domes on cave maps. Each is a
tapering spike of pale calcite, drawn pixel-art style (`dripColor` in
`src/client/texture.ts`): flow streaks down it, drip rings across it, lit
from the left with a shadowed right edge, and a glistening drop on a
stalactite's tip. Dripstone is brittle: anything that chips a formation (a
single bullet, a blast, the digger) breaks the whole of it off at once.
A third of it comes down as heavy chunks of stone (`PK.Stone`: heavier than
hull scrap, they land hard), the rest as grit, and all of it settles as
rubble. A big stalactite shot down onto a clone can kill it outright, and
the kill is the shooter's ("Falling Rock" in the feed). It happens inside
the shared carve (`applyCarve` in `src/shared/particles.ts`), so every
replica breaks the same formations from the same carve record, with no
extra traffic.

**Traces** (`src/client/relics.ts`, drawn by `relic-art.ts`). Now and then, deep in a cave, something
older than the war: a faded painting on the back wall, or a relic half sunk
in a cave floor. Never explained, never in the way: purely cosmetic (each
client places them from the seed and the terrain; no gameplay, no network),
and rare, one or two a map at most, a few more on cave maps, sometimes none.
The paintings are in weathered ochre, red, chalk: stencilled hands with six
fingers; tall thin figures under a ringed world and two moons (the same sky
as now); a six-legged beast and the hunters facing it; a procession to a
stepped pyramid that shines. The relics: a long, high-domed fossil skull
with great eye sockets; an arc of a vast ring of dark metal, notched, a seam
of light still faintly in it; a toppled stone head, long-faced, crowned with
a ring. Terrain in front hides them, so dug-out rock reveals what was there.

**The ground** (`src/shared/materials.ts`, `soilAt` in worldgen). The soil
is rust red (iron oxide), and a soil noise threads its varieties through
it: **ochre** (yellow-orange) in pockets within 90 cells of the surface,
**oxblood clay** in deeper pockets and in thin wavy bands, and dark,
gritty **regolith** in patches that grow commoner the deeper you dig. The
dunes are **rust dust** (`Mat.RustSand`), loose like sand. **Pale sand**
stays for buried lenses and dry riverbeds. Rock is a dark basalt. Each soil
has its own grain when drawn (`soilColor` in `src/client/texture.ts`):
clods in the rust soil, basalt pebbles in the regolith, bright grains in
the ochre, streaks in the clay, wind ripples in the dust.

**Frosting.** After the bunkers are built, the top of the natural ground
gets a cover: alien lichen 2–3 cells deep in patches (not on rock or steep
slopes), or frost on the high Highlands. Bunkers never get it. The lichen
(`Mat.Grass`) is a teal crust tipped pale aqua and violet, with fronds
poking into the air above it and the odd glowing violet spore-head. Frost
(`Mat.Snow`) is drawn with a bright crust, lilac shadows and glints.

**The rock face behind the ground** (`src/client/backwall.ts`) shows wherever
a cave, tunnel or crater opens below the surface. It is a seamless tile,
one pixel per cell, drawn in world space.
- **Rock.** Fractured blocks of rock, each lit from the top left, with dark
  fissures between them.
- **Colour.** Rust soil fades into darker basalt in soft patches, with faint
  strata and the odd mineral glint.
- **Depth.** It sinks into deeper dark the further down it is.
- **Shadow.** Soft shadow falls where it meets the ground, deepest under
  overhangs.

## Architecture

```
browser ══/ws══▶ Worker ──────▶ GameRoom DO "main" (the one match: authoritative sim)
browser ──/api/rooms──▶ Worker ──RPC──▶ Lobby DO  (how many are in the match, for the menu)
                   └──────────▶ static assets (public/)
```

**One room, one runtime.** There is only ever one match: every player is
sent to the same Durable Object (`MAIN_ROOM` in `src/server/worker.ts`),
whatever room a client asks for, so everyone plays together and the cost is
a single room's. The match holds 64. Bots fill every slot no human has and
give theirs up as humans arrive, so the 65th human is turned away with
"room full". The room stops ticking when its last human leaves.
The info panel in the top-right corner (hidden by default: **I** toggles
it, and it shows while the scoreboard is up) has how many humans are on
(bots aside; on a phone, beside the minimap), the net stats and the kill
feed. Notices meant for you (sound on/off, aim assist, dropship contacts)
show there either way. Clients tell bots by their **BOT** tag, which the
server reserves for bots: a human who calls themselves "BOT …" loses it.

| Path | Role |
| --- | --- |
| `src/shared/` | Engine code that runs on **both** server and client: terrain, physics, kernels, protocol |
| `src/server/world.ts` | Authoritative simulation and replication. Platform-agnostic, so tests and the benchmark drive it directly |
| `src/server/room.ts` | `GameRoom` Durable Object: sockets, fixed-timestep loop, telemetry |
| `src/server/lobby.ts` | `Lobby` Durable Object: the room board (the match's population, for the menu) |
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
| Sniper slug (0.069 × 0.95 × 24000) | ~1570 | Through any armour (but a king's crown) with energy to spare; 80 wounds per layer: one headshot kills anyone, one body shot kills a scout or a medium, a limb hit takes the limb off. It shoves 2.4× its momentum |
| Shrapnel (0.5 × 0.85 × ~460–760) | ~200–320 | Bullet-grade: through a helmet or vest, 12 wounds a layer. A grenade throws 56 fragments, a rocket 36, as tracers |
| Debris grain (0.25 × 0.15 × 300) | ~11 | Bruises and shoves, rarely wounds |

**Classes.** Every clone rolls one at spawn (33% scout, 38% medium, 22%
heavy, 7% droid), shown on the sprite and in the HUD:

| Class | Armour | Jetpack | Run |
| --- | --- | --- | --- |
| Scout | green army helmet, no vest; armour 0.7× as hard | 1.15× thrust, 0.8× fuel use | 1.12× |
| Medium | helmet and vest (the standard clone) | 1× | 1× |
| Heavy | metal plate over everything: armour 3× as hard, every part takes 2.5× the wounds, blasts, fire and falls do 0.4× | 0.6× thrust (it still lifts, slowly), 1.5× fuel use | 0.85× |
| Droid | no clone at all (see below): about a quarter of a tank | none: it climbs instead | 1.45× |

**The spider droid** (`ClassId.Droid`) is a body class of its own, not
anthropomorphic: a squat gunmetal chassis slung low between **six tin
legs**, three either side, and above it on a narrow steel **T** (a thin
stem up to a crossbar header) **its head: the turret**, a camera shape with
**any gun** slung under it. Its flat face, with a red lens in a steel
bezel, looks out along the gun, the body tapering away behind (`]<`). It
pivots with the aim, so the camera is always looking where the gun points,
and the gun is its face (it carries, picks up,
switches and reloads like any clone). The head is built round the point the
shots leave from, so it fires exactly from its face.

- **Its parts** (`DROID_PARTS` in `src/shared/body.ts`). It reuses the
  ten part slots, and the same mask bits on the wire, with its own
  meanings, so nothing that carries part masks had to change:
  - the turret (the head's slot): shoot it off and it can't fire;
  - the chassis (the torso's): vital, and its wounds are the droid's HP;
  - armour plating over the chassis;
  - six legs (the arms', legs', helmet's and vest's slots).
- **Legs.** Each leg is durable (170 wounds) and comes off on its own as a
  spinning tin strut, in sparks, not blood. On four legs or more it
  scuttles, on two or three it limps, on fewer it drags itself.
- **Toughness.** All told it's about **a quarter of a tank**: some 120
  rifle rounds to the body (117 is a quarter of a tank's hull). Killed,
  it's scrapped into flying legs, plates and its turret dome.
- **Movement.** Fast (1.45×, faster than a scout) and **extremely flexible
  on steep terrain**. It takes big steps in its stride, and pushing
  against a wall, or holding **W** with one within reach either side
  (up a shaft, say), it walks straight up it and over the top (`CLIMB_SPEED`
  in the shared `stepBody`, so prediction stays exact). It has no jetpack,
  and it never crouches or lies down.
- **Leap and glide.** In place of a jetpack it has a spring and thrusters.
  - **Leap.** **W** springs it 1.55× as hard as a clone's jump, about
    80 cells (six bodies), over twice a clone's height.
  - **Glide.** Holding W on the way down fires little blue thrusters under
    its chassis. Their thrust is less than its weight, so they never lift
    it, but they ease the fall to 50 cells/s and let it steer 1.35× wider
    than it runs. A glide carries well over half again as far as a plain
    leap.
  - **Fuel.** They burn its fuel (16 a second, refilling on the ground).
  - **Walls.** A wall within reach still catches it to climb.
- **Its look.** Drawn procedurally, like a real spider. Six long legs
  splay wide from hips along the chassis, each a two-bone limb (a short
  thigh, a long needle shin) solved so the knee rides high above the body
  in a sharp **^**. Its feet are planted: each stays where it set down until
  the body has moved past it, then lifts in a quick arc to a hold ahead,
  alternating tripods (front and back of one side with the middle of the
  other), so the body glides while the legs tick, with a slight bob as each
  tripod lifts. Feet find the ground under them (up a step, down a ledge);
  on a wall they grip the face, front legs reaching up it; in the air they
  tuck in. It **follows the lie of the land**: the chassis pitches to the
  slope between its outer feet (nose up a rise, down a fall, rearing up a
  wall it climbs), its feet spread along the slope, its knees bend off its
  back whatever the angle, and its strides shorten climbing and lengthen
  going down. The head stays on the gun's pivot, where shots leave, its
  neck bending to the tilted body. (All of it drawing only: its hitbox
  stays upright.) A tarantula walks exactly the same way, three times
  over. It has a running light in its owner's colour and a red sensor
  eye. Lost legs leave sparking sockets, and with its plating gone the
  chassis shows scorched. The HUD's paper doll becomes the droid's own.
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

**Muzzle effects come out of the barrel, as drawn.** A clone's muzzle
flash, gun smoke, sniper wake, laser beam and digger dust all start at its
gun's muzzle as each client draws it: the drawn clone's shoulder plus the
weapon's `muzzle` length along the shot (`Game.drawnMuzzle`). They never
start at the clone's middle.
- Other clones are drawn a little in the past, so this is not quite where
  the server fired from.
- Vehicles' guns fire from their own muzzles, where the server spawned the
  round.

| Weapon | Fires | Muzzle | Rate | Mode | Clip | Reload | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Rifle | bullet, 880 cells/s | 13 | 450 rpm | auto | 30 | 1.8 s | 110 |
| Bazooka | rocket, 380 | 14 | 60 rpm | semi | 1 | 2.2 s | 140 |
| Grenade | grenade, 330 | 6 | 70 rpm | semi | 3 | 2.5 s | 90 |
| Sniper | slug, 24000 (near instant) | 17 | 50 rpm | semi | 5 | 2.8 s | 600 |
| Digger | carves terrain | 11 | 900 rpm | auto | ∞ | – | 40 |
| Materializer | builds (see below) | 9 | 100 pieces/min | click | ∞ | – | 60 |
| Radio | calls support (see below) | 6 | – | click | ∞ | – | 60 |
| Repair Kit | health wave (see below) | 4 | once | click | 1 (used up) | – | 40 |
| Shotgun | 9 pellets, 900 | 14 | 75 rpm | semi | 6 | 3.3 s | 80 |
| GL | bomblet, 340 | 13 | 150 rpm | semi | 6 | 3.5 s | 110 |
| Gatling | heavy round, 960 | 17 | 1100 rpm (after spin-up) | auto | 100 | 5 s | 120 |
| Laser | instant beam (see below) | 15 | hold, release | charge | 8 | 4 s | 400 |
| AT Cannon | heat-seeking missile, 200 → 430 | 16 | 20 rpm | semi | 1 | 9 s | 160 |
| Light Rifle | full-power round, 1100 | 15 | 480 rpm | semi | 7 | 2 s | 220 |
| SMG | light round, 760 | 11 | 900 rpm | auto | 40 | 2 s | 70 |
| Autocannon | solid shell, 420 | 18 | 150 rpm | auto | 12 | 4 s | 140 |
| Mine | lays a landmine (see below) | 6 | 60 rpm | click | 2 | 5 s | 60 |
| Blaster | light bolt, 1300 | 14 | 600 rpm | auto | 30 | 2.5 s | 160 |

Four heavier guns are in the spawn pool too:
- **Shotgun:** a military combat shotgun. Each shell is a spread of nine
  heavy pellets that die out at close range. Point-blank it kills a scout
  or medium outright and tears a heavy's armour apart. Each pellet shoves
  only a little, so the first ones don't knock the target clear of the
  rest; a whole shell shoves hard. Six shells, a slow reload, a big kick.
- **GL:** a grenade launcher that lobs six small bomblets on an arc. They
  bounce about and pop on a 1.7 s fuse, each a third of a hand grenade
  (splash 30 against 90).
- **Gatling:** the barrels spin up for half a second before it fires (and
  spin down when you let go). Then it pours out 100 heavy rounds (24
  wounds each, against the rifle's 16), loose (spread 0.08 against 0.035),
  with steady recoil.
- **Laser:** hold the trigger to charge, up to 8 s (a ring round the
  crosshair fills, and the muzzle glows); let go to fire. The beam is
  instant and **goes straight through every soldier in its way at full
  strength**. It stops at terrain or a vehicle, which it hits.
  - Charge sets width and power: a quick tap is a narrow sliver
    (24 wounds), a full charge a thick, devastating beam (180 wounds, wide
    enough to cut through the body whatever it hits first).
  - A strong beam burns a crater where it lands, and kicks you back.
  - Beams go out as `R_BEAM` records and kills show as Laser in the feed.

The **AT Cannon** (anti-tank) is not in the spawn pool as a primary. About
one clone in nine carries one as its backup gun, and it lies in the
bunkers' grand halls with the other heavy guns.
- **The missile.** It fires a single missile that leaves the tube slowly,
  then burns up to 430 cells/s.
- **Heat seeking.** After a brief arming delay it turns (up to about
  140°/s) toward the hottest enemy vehicle it can see within 700 cells and
  70° of its heading: a tank someone is driving, a dropship, or a drop
  rocket with a clone aboard. Never its own side's. With nothing hot in
  view it flies straight, like a heavy rocket. The server and each client
  steer it from their own view of the vehicles, and the server's word is
  final where it lands.
- **Shaped charge.** A direct hit puts 46% of a tank's whole hull straight
  through the armour (dropships take less), on top of the warhead and its
  blast. One missile takes about half a tank (47.6% in the tests).
- **The cost.** One missile a load, and **nine seconds** to load the next.

Five more, the newest:
- **Light Rifle** (M1 Garand style). Semi-automatic: one round per pull,
  as fast as you can pull (up to 480 rpm, faster than the rifle). Seven
  rounds to an en-bloc clip. Its full-power round flies at 1100 cells/s
  and wounds 26 a layer (the rifle's 16), and it's precise (spread 0.012
  against 0.035), with a 220-cell scope. It mixes precise damage with a
  modest clip.
- **SMG** (Type 05 style). A suppressed bullpup that hoses out 900 rpm of
  light rounds (10 wounds each), 40 to a magazine, with a 2 s reload. Its
  rounds die out after about 150 cells, so it belongs up close, where it
  still gets through a vest.
- **Autocannon.** Low-velocity (420 cells/s), heavy solid shells that don't
  explode. One shell carries enough energy to punch through any armour,
  even a heavy's, and wounds 70 a layer: enough to take a head or limb off
  outright. The shock of the hit also wrenches every other part of the body
  (`shatter` in `PROJ`), so limbs come off. Its kills gib like an
  explosion's. Each shell leaves a smoke trail, punches a small hole where
  it lands, and goes with a deep "dunk".
- **Mine.** Click to lay a landmine on the ground just in front of you
  (you need ground under you: not in mid-air). You carry two, and another
  pair is ready 5 s after the last is laid. More details under
  **Landmines** below.
- **Blaster.** The laser's SMG cousin: 600 rpm of weightless cyan bolts that
  fly dead straight at 1300 cells/s. Each wounds 12 a layer (less than a
  rifle round), and sparks where it lands.

The new guns are in the spawn pool. Landmines sometimes replace a clone's
grenades. The autocannon is in the bunkers' grand halls, and the rest turn
up in the labyrinth's loot. Bots use all of them, the mines too: with
nobody about, now and then they leave one behind.

#### Landmines

- **Who sets them off.** A mine is armed 1.5 s after it is laid. Then the
  first enemy clone to step on it, or enemy tank (or watchdog) to roll over
  it, sets it off. The clone that laid it, and its side, never do.
- **The blast.** Modest: less than a grenade (splash 70 within 30 cells).
  It's credited to the mine's owner as **Mine** in the kill feed.
- **Limits.** Each clone keeps at most four down; laying a fifth clears its
  oldest. Dig out the ground under one and it drops to whatever is below.
- **What you see.** Your own side's mines are plain to see: a light winks
  amber while one arms, then green. An enemy's mine is only a dull,
  half-buried disc, for those who look.
- **On the wire.** The server keeps them in `World.mines` and sends the
  whole list (`R_MINES`) whenever it changes.

The **sniper** is near instant: its slug flies 800 cells a tick and crosses
the whole map in about five ticks, so you point and click. It's light for
its speed, so its energy and knockback are what they were at 1500 cells/s.
It leaves a tracer streak from muzzle to impact that hangs in the air for a
moment.

The **repair kit** is a single-use med case. The clone carries it by its
handle rather than aiming it like a gun. One click sets it off
(`World.healWave`), and the kit is used up and gone from the inventory.

- **The wave.** A ring of nanobots races out to 72 cells in about half a
  second.
- **Who it reaches.** It catches you and every teammate it passes. Without
  teams, it catches only you.
- **Mending.** Everyone it catches mends for 4 s. Every tick they get back
  1.25 health, and wounds close on every part.
- **Lost limbs.** Once a clone is above 60% health, a missing limb regrows
  every 1.3 s: gun arm first, then the off arm, legs, and jetpack.
- **Looks.** Clients draw the ring and green crosses drifting off everyone
  mending (`R_HEAL`).
- **Bots.** A bot uses its kit when it's hurt or maimed and nobody is
  shooting at it.

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
- **Scope distance:** holding right mouse or left Shift pushes the view up
  to that far down the barrel and halves spread. It goes **only as far as
  the line of sight**: a raycast from the shoulder along the aim
  (`sightLine` in `src/shared/scope.ts`) stops at the first solid cell, so
  a scope never looks through or past terrain. The server moves that
  client's interest area the same way, so it is sent only what the scope
  can see. Clones are part of the line too: the first one in it stops it,
  as it would stop the shot. While scoped, a faint laser runs from the
  barrel to where the shot would land, and brackets mark the first clone in
  its path (grey for a teammate). What the scope shows is what you can hit.
- **Scope lock-on** (`src/client/scope.ts`) is radial. Scoped with a gun
  that can lock, any enemy inside a cone around your aim, and in the clear
  line of fire, is locked onto: the one nearest the crosshair if there are
  several, at centre mass. Put the line itself on someone and it locks
  onto exactly that point on them (head or chest), so headshots stay
  yours to line up.
  - **Holding:** the lock follows them while they stay in sight and within
    reach of your aim (cone + about 11°). Sweeping across them moves the
    locked point.
  - **Breaking:** pulling well off them, or losing sight of them, breaks it,
    and the cone looks for someone else.
  - **Cone sizes** (`lockCone`): sniper ±9°, bazooka ±3.4°, rifle ±2.9°.
    Grenades are lobbed, so they never lock.
  - **On screen:** the cone's edges show as faint dashed lines; a lock
    shows solid brackets, the locked point and a LOCK tag.
- **Recoil:** every gun shoves its shooter back along the barrel and climbs
  the muzzle a little with each shot; the climb settles back over a
  moment. Crouched you feel about half of the shove, prone under a third.
  | Weapon | Shove (cells/s) | Climb per shot |
  | --- | --- | --- |
  | Rifle | 9 | 0.03 rad (holding the trigger, it walks up) |
  | Bazooka | 55 | 0.05 rad |
  | Grenade | 8 | none |
  | Sniper | 130 | 0.14 rad |

  Every clone's gun visibly jumps back as it fires, and your own shots
  jolt the view.
- **The sniper** fires like a .50-cal: a hard muzzle blast with smoke
  thrown out sideways from the brake. The slug is near instant, so what
  you see is its wake: a supersonic vapour trail hanging along the whole
  path, billowing at the muzzle and thinning out, then a heavy strike
  that throws grit and sparks back out of the hole.
- **Losing the off arm** makes firing 1.6× slower, reloading 1.5× slower,
  and triples spread.

### Inventory and weapons on the ground

You don't carry every weapon. Each clone spawns with a random kit
(`spawnLoadout` in `src/shared/items.ts`): always a primary (rifle, sniper or
bazooka), a digger, a materializer, a radio and a repair kit. It often has grenades too, and
sometimes a second gun. You carry up to seven items, each with its own
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
piece from the menu (click it, or use the mouse wheel).

- **Turning and mirroring.** **R** turns the piece a quarter clockwise and
  **X** mirrors it left to right, as you see it. The menu has TURN and
  MIRROR buttons for touch too.
- **Uses.** A floor stands up as a wall, a bunker's roof becomes its side,
  a ramp faces either way, or a bunker goes up with its door on the left.
- **On the wire.** One byte names a piece with its orientation (`pieceCode`
  and `pieceOf` in `build.ts`): the index in the low five bits, then two
  bits of quarter turns and one of mirror. Requests and the `R_BUILD`
  record stay the same size, and validation (`canBuild`) and replay
  (`applyBuild`) are the same shared code.
- **Building.** A ghost of the turned piece snaps to a 4-cell grid under
  the cursor, green where the server will accept it and red with the
  reason where it won't. Click to build. New players join with 60
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
spinning hull, as heavy `Hull` fragments in the particle engine, and the
recoil spins the rocket. The part itself gibs: what's left of it tumbles
off, six to eight torn plate and nozzle shards burst out of it, and sparks,
a lick of flame and smoke go with them.

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

`npm run bench:ffa` (one human, 63 server-side bots, Last Man Standing waves for
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

(That run predates the single room: it used the old per-room matchmaker.
Now every bot joins the one match, `main`, and past 64 humans the rest are
turned away.)
RTT tails in the local load test are dominated by the bot harness and workerd
competing for the same CPU. Measure from a separate machine for real
numbers.

## Install as an app (PWA)

The game installs to a phone's home screen (or as a desktop app) and runs
**full screen, in landscape**, like a native game:

- **Android, desktop Chrome and Edge.** An **Install app** button shows on
  the menu.
- **iPhone and iPad.** The menu says how: Share, then **Add to Home Screen**.
- **Files.** `public/manifest.webmanifest` (fullscreen display, landscape,
  icons from the clone sprite in `public/icons/`), Apple's home-screen tags
  in `index.html`, and `src/client/pwa.ts`.

It's **online only**, and an installed copy **never runs an old version**:

- **The service worker caches nothing.** `public/sw.js` sends every request
  straight to the network, past the HTTP cache too, and deletes any cache
  it finds. Offline you get a "no connection" page with a retry button,
  not a stale game that couldn't connect anyway.
- **Everything is revalidated on every load** (`public/_headers`:
  `no-cache`; the worker script and the build id `no-store`), and the
  service worker is registered with `updateViaCache: 'none'`.
- **Each build has an id.** `scripts/build-client.mjs` bakes it into
  `app.js` and publishes it as `/version.json`. An open copy (an installed
  app can stay open for days) checks it when it comes back to the
  foreground and every 3 minutes. When a newer build is live, it reloads
  onto it at the next safe moment: on the menu, or dead and waiting for a
  respawn, never mid-fight. Then it puts you straight back into the match.
  A protocol change (the server redeployed under you) does the same.

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

## Security and abuse limits

The server trusts nothing a client sends. Every action is validated on the
authoritative tick: builds against the same rules the preview shows, radio
calls against gold and cooldown, inputs against the body. On top of that,
`src/server/guard.ts` sets limits that keep a bot or a flood from taking the
match down.

**At the Worker** (`worker.ts`), before a Durable Object wakes:
- `/ws` takes only a GET WebSocket upgrade whose `Origin` is this site (or
  localhost, for development). Other pages can't open game sockets in a
  visitor's browser, and lazy scripts without an Origin are refused.
- `/api/*` is GET only. Each isolate caches `/api/rooms` for 2 s, so a flood
  of menu loads never reaches the Lobby.

**Per address** (in each room, keyed by Cloudflare's `CF-Connecting-IP`):
- At most 6 live sockets, which allows for households, LAN parties and
  carrier NAT.
- Connection attempts: a burst of 10, then 12 a minute.
- Refusals arrive as an `S_REJECT` with the reason, so a real player sees
  why.

**Per socket:**

| Budget | Limit |
| --- | --- |
| All messages | 60/s, burst 120 |
| Chat | 1 per 2 s, burst 4 |
| Builds | 5/s |
| Radio calls | 2/s |
| Pings | 2/s |
| Map resyncs | 128 chunks/s, burst a full map |

- An honest client sends one input a tick plus a ping a second, so these
  budgets have room to spare.
- Over-budget messages are dropped and count as strikes. Oversized messages
  (over 4 KB), text frames, unknown messages and malformed messages count
  for more.
- Strikes decay over time. A socket that piles up 200 is closed with 1008,
  and the kick is logged.
- A socket silent for 90 s is closed. Clients ping every second, and a
  throttled background tab still pings once a minute.

**Text:**
- Names keep only letters, digits, space, `_ - .`, up to 16 characters. A
  name can't wear the bots' BOT tag.
- Chat loses control characters, invisible characters and bidi-override
  characters. It loses stacked combining marks ("zalgo") and is capped at
  120 characters.
- Chat and names never execute.
  - They travel as length-prefixed strings, are scrubbed by the server
    before broadcast and again by the client on receipt
    (`src/shared/text.ts`), and are painted with canvas `fillText`.
  - No path turns player text into HTML, a URL or script. The client has no
    HTML-string sinks at all: no `innerHTML`, `eval` or string timers. The
    touch controls are built node by node.
  - The page's CSP enforces Trusted Types (`require-trusted-types-for
    'script'`), so even a future slip that assigned player text to an HTML
    sink would be refused by the browser. The only policy, `sw`, passes
    `/sw.js` to the service worker registration and nothing else.
  - `test/chatsafe.test.ts` sends XSS payloads through the real
    server-to-wire-to-client path, scans every client module for sinks, and
    checks the CSP.

**Static pages** (`public/_headers`) carry these headers:
- A strict Content-Security-Policy: own scripts only, no eval, Trusted
  Types, no framing, no plugins.
- `X-Frame-Options: DENY`, `nosniff`, a same-origin referrer policy and
  COOP.
- A Permissions-Policy that denies camera, microphone and geolocation.

**In the Cloudflare dashboard** (not code; recommended for a public
deployment):
- DDoS protection for L3/4 and HTTP is on by default for every zone.
- **Security → WAF → Rate limiting rules:** for example, block an IP that
  sends more than 30 requests to `/ws` or 100 to `/api/` in 10 s. This stops
  a connect flood at the edge before it costs a Worker invocation.
- **Security → Bots → Bot Fight Mode** (or Super Bot Fight Mode on paid
  plans) challenges known automation. The game's own requests are ordinary
  browser traffic, so it doesn't get in the way.
- **Security → Settings → Security Level:** "High" during an attack, or
  "I'm Under Attack" mode. It puts a JS challenge in front of the menu page,
  and the game socket follows from a page that passed it.

## Not done yet

- Brains, buying bodies and drop ships, which are the Cortex Command
  meta-game. Last Man Standing and Last Team Standing are the only modes so far.
- Delta-compressing actor records against the last acknowledged frame.
- Running the kernels in a WASM SIMD module. They are already laid out for it.
- A learned (neural) surrogate for dense granular flow. The field formulation
  above is the natural place to plug one in, but nothing here uses one today.
- Sound.
