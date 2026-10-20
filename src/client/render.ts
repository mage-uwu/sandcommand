import { ACTOR_H, ACTOR_RUN_SPEED, ACTOR_W, ACTOR_MAX_FUEL, ACTOR_MAX_HP, CHUNK, CHUNK_COUNT, CHUNK_SHIFT, CHUNKS_X, CHUNKS_Y, VIEW_HALF_H, VIEW_HALF_W, WORLD_H, WORLD_W, TICK_RATE, GRAVITY } from '../shared/constants.ts';
import { FACTIONS } from '../shared/factions.ts';
import { type Wound, beastDamage, beastScars } from './wounds.ts';
import { MAT_COLOR, Mat } from '../shared/materials.ts';
import { CALL_COST, TARANTULA_COST, MOLE_COST, WATCHDOG_COST, CallKind, Evac, GameMode, Phase, VOTE_MODES, F_ALIVE, F_CLASS_SHIFT, F_FIRING, F_GROUND, F_JET, F_RELOAD, TEAM_NAMES, TEAMS_IN_MODE, Team, classOfFlags, dequantizeAim } from '../shared/protocol.ts';
import { EVAC_H, EVAC_W, SPIKE_DEPTH, TrapKind } from '../shared/dungeon.ts';
import { sightLine } from '../shared/scope.ts';
import { BIOME_NAMES, Biome, MapKind } from '../shared/worldgen.ts';
import { VBack } from '../shared/valley.ts';
import { lineOfFire } from './scope.ts';
import { hash2 } from '../shared/rng.ts';
import { LASER_MAX, PROJ, ProjKind, PROJ_BUILD, HEAL_R, HEAL_SPREAD, MEND_TICKS, laserWidth, SHOULDER_X, SHOULDER_Y, WEAPONS, WeaponId, lockReach } from '../shared/weapons.ts';
import { BUILD_GRID, BUILD_REACH, BUILD_RESULT_TEXT, BuildResult, PIECES, pieceCode, pieceOf, snapPiece } from '../shared/build.ts';
import { type CraftView, type Game, type PlayerInfo, type RemoteView, type ShipView, type TankView, TEAM_COLORS, kdRatio, scoreOf } from './game.ts';
import type { RoundState } from '../shared/frame.ts';
import { layoutSub } from './banner.ts';
import { fit as fitText, keyChip, panel, rankBadge, rrect, track, uiFont, withAlpha } from './hud-ui.ts';
import type { InputState } from './input.ts';
import type { Link } from './net.ts';
import type { Coach } from './tutorial.ts';
import { MOTHER_NAME } from './mother-script.ts';
import { drawFlora, drawGeysers } from './flora-art.ts';
import { ClassId, DROID_LEGS, DROID_PARTS, DroidPart, PARTS, Part, has } from '../shared/body.ts';
import { CRAFT_H, CRAFT_HP, CraftPart } from '../shared/craft.ts';
import { CLOUD_MS } from '../shared/stoneburner.ts';
import { stickyBlink } from '../shared/sticky.ts';
import { drawBeacons, drawFeet, drawStoneFlash } from './stoneburner-art.ts';
import { StoneCloud, drawCloudWash, drawShock } from './stone-cloud.ts';
import { BTN_FIRE, HIP_X, HIP_Y, STANCE_DROP, STANCE_LEAN, Stance, shoulderAt } from '../shared/actor.ts';
import { BAY_AT, ENGINE_NOZZLE_Y, ENGINE_X, SHIP_H, SHIP_HP, SHIP_MISSION_NAMES, SHIP_W, ShipPart, TURRET_AT, hasShipPart } from '../shared/dropship.ts';
import { CANNON_INTERVAL, CANNON_PIVOT, SMG_LEN, SMG_PIVOT, TANK_H, TANK_HP, TANK_PARTS, tankSink, tankW, tankH, tankMaxHp, isDog, TANK_MAX_FUEL, TANK_PART_HP, TANK_W, TankPart, cannonAngle, hasTankPart, gunPivotY, isPet, isSpider, SPIDER_LASER_PIVOT, SPIDER_RACK_PIVOT, TARANTULA_SCALE, isMole, MOLE_SCALE, MOLE_PLASMA_PIVOT, MOLE_PLASMA_LEN, MOLE_SMG_PIVOT } from '../shared/tank.ts';
import { ParticleLayer } from './particle-layer.ts';
import { drawAsp, drawAspGem, drawBasilisk, drawBasiliskGib, drawCoralGrowth, drawCritterGib, drawMillipede, drawNest, drawSeeder, drawSegmentGib } from './beast-art.ts';
import { drawDragon, drawDragonGib } from './dragon-art.ts';
import { knownPlayers, objective } from './objectives.ts';
import { drawCaveSpider, drawSpiderGib, drawWebGib, drawWebNest } from './spider-art.ts';
import { BEAST_BUILD, BeastKind, CORAL_LIMBS } from '../shared/wildlife.ts';
import { backWallColor, dripColor, structColor, frostColor, grassBlade, noise, soilColor, cementColor, oldConcreteColor, pourColor, rustColor } from './texture.ts';
import { drawRelics } from './relic-art.ts';
import { drawBackwall } from './backwall.ts';
import { drawDecor } from './decor-art.ts';
import type { Terrain } from '../shared/terrain.ts';
import { DroidArt } from './droid-art.ts';
import { DPAL } from './droid-grids.ts';
import { RACK_MOUTHS, RACK_PIVOT, TarantulaArt } from './tarantula-sprites.ts';
import { Backdrop } from './backdrop.ts';
import { type BodyFrame, CROWN, SpriteCache, TANK_SPRITE_TOP, MOLE_FRILL_AT, WALK_CYCLE } from './sprites.ts';

/** Most terrain chunks re-rasterized per frame (the rest wait for the next). */
const CHUNKS_PER_FRAME = 64;

/** World cells per minimap pixel: the minimap is 256 pixels wide whatever the world's width. */
const MINI_SCALE = WORLD_W / 256;

/** Precomputed RGBA (little-endian u32) palette: 4 shade variants per material, plus a lit variant. */
const PALETTE = new Uint32Array(MAT_COLOR.length * 8);
for (let m = 0; m < MAT_COLOR.length; m++) {
  const [r, g, b] = MAT_COLOR[m];
  for (let v = 0; v < 8; v++) {
    const lit = v >= 4;
    const k = (0.84 + (v & 3) * 0.07) * (lit ? 1.25 : 1);
    const cr = Math.min(255, Math.round(r * k));
    const cg = Math.min(255, Math.round(g * k));
    const cb = Math.min(255, Math.round(b * k));
    PALETTE[m * 8 + v] = (255 << 24) | (cb << 16) | (cg << 8) | cr;
  }
}

/**
 * The sky of an alien world, Mars-like: a dark violet zenith, dusty rose,
 * then butterscotch haze down to the horizon (world y 500 at the bottom).
 */
function skyGradient(ctx: CanvasRenderingContext2D, offY: number, z: number, biome = 0): CanvasGradient {
  const g = ctx.createLinearGradient(0, offY + -300 * z, 0, offY + 500 * z);
  if (biome === Biome.Deadland) {
    // The deadland's sky: soot-dark overhead, an ashen haze down to a sickly olive horizon.
    g.addColorStop(0, '#16141a');
    g.addColorStop(0.4, '#3e3c40');
    g.addColorStop(0.72, '#6e6a5e');
    g.addColorStop(0.9, '#8e8a70');
    g.addColorStop(1, '#a29c7c');
    return g;
  }
  g.addColorStop(0, '#1e1030');
  g.addColorStop(0.4, '#6a3f5c');
  g.addColorStop(0.72, '#c27a5a');
  g.addColorStop(0.9, '#e0a070');
  g.addColorStop(1, '#ebb784');
  return g;
}

/**
 * Rare earth: faceted violet crystal. Lit on its upper-left faces, shadowed
 * on its lower-right ones, and here and there a white glint, so a crystal
 * reads as a gem in the rock, not a patch of colour.
 */
function crystalColor(t: Terrain, x: number, y: number): number {
  const other = (dx: number, dy: number) => t.get(x + dx, y + dy) !== Mat.RareEarth;
  const h = hash2(x, y);
  let r = 170;
  let g = 70;
  let b = 236;
  if (other(0, -1) || other(-1, 0)) {
    r = 232;
    g = 150;
    b = 255;
  } else if (other(0, 1) || other(1, 0)) {
    r = 104;
    g = 34;
    b = 168;
  }
  if ((h & 15) === 0) r = g = b = 255;
  return (255 << 24) | (b << 16) | (g << 8) | r;
}

/**
 * Water over whatever's behind it (`under`): a clear, deepening blue-green,
 * lighter rippled bands near the top, and a bright line at the surface.
 */
function waterColor(t: Terrain, x: number, y: number, under: number): number {
  const ur = under & 255;
  const ug = (under >> 8) & 255;
  const ub = (under >> 16) & 255;
  if (!t.wet(x, y - 1)) return gemRgb(176, 232, 236); // the surface
  let depth = 1;
  while (depth < 40 && t.wet(x, y - depth)) depth++;
  const a = Math.min(0.82, 0.45 + depth * 0.012);
  const ripple = depth < 6 && ((x + depth * 3) & 7) < 2 ? 18 : 0;
  return gemRgb(ur * (1 - a) + (34 + ripple) * a, ug * (1 - a) + (118 + ripple) * a, ub * (1 - a) + (150 + ripple) * a);
}

/**
 * Petrified wood, as in the Sea of Corruption's forest under the sand: pale,
 * cool blue-grey stone, smooth as a column, shaded round across its girth
 * (lit on the left, falling into blue shadow on the right). Cut tops pale,
 * undersides dark, so stumps, logs and the vaults' lattice read.
 */
function petrifiedColor(t: Terrain, x: number, y: number): number {
  // Across it: how far to its edge each side (the round shading of a column; a
  // lattice strut is a little column too).
  let l = 0;
  while (l < 20 && t.get(x - l - 1, y) === Mat.Petrified) l++;
  let r = 0;
  while (r < 20 && t.get(x + r + 1, y) === Mat.Petrified) r++;
  const u = (l + 0.5) / (l + r + 1); // 0 at the left edge, 1 at the right
  // Lit from the upper left, cool and pale; the far side falls into blue shadow.
  // (A thin strut of the vaults' lattice: flat, a little shadowed, so the honeycomb reads.)
  let k = l + r < 9 ? 0.82 - u * 0.12 : 0.5 + 0.7 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * (1.2 - u * 0.75);
  // Smooth, stone-hard bark: only faint long streaks up it.
  const streak = Math.sin((x + Math.sin(y * 0.013) * 2) * 1.9) * 0.5 + 0.5;
  k *= 0.95 + streak * 0.07 + (hu(x, Math.floor(y / 11), 0x9e7) - 0.5) * 0.06;
  const above = t.get(x, y - 1) === Mat.Air;
  const below = t.get(x, y + 1) === Mat.Air;
  // A cut top (a stump's, a log's): pale, with a ring or two in it; an underside, dark.
  if (above) k = Math.max(k, 1.05) * (((x * 7) % 5) === 0 ? 0.88 : 1);
  else if (t.get(x, y - 2) === Mat.Air) k *= 1.08;
  if (below) k *= 0.6;
  const re = 128 * k;
  const gr = 146 * k;
  const bl = 160 * k;
  return gemRgb(re, gr, bl);
}

/**
 * DUNE's limestone: pale cream and tan in bedded layers that roll a little
 * with the dunes, a darker seam now and then, fine cracks down it, the odd
 * fossil fleck; the face open to the air bleached paler.
 */
function limestoneColor(t: Terrain, x: number, y: number): number {
  const bed = y + Math.sin(x * 0.011) * 6 + Math.sin(x * 0.047) * 2;
  const layer = Math.floor(bed / 7);
  let k = 0.86 + hu(layer, 0, 0x11e) * 0.18;
  if (((bed % 7) + 7) % 7 < 0.9) k *= 0.86; // (a bedding seam)
  if (hu(Math.floor(x / 3), layer, 0x5ea) > 0.93 && ((x * 13 + y * 7) & 7) === 0) k *= 0.8; // (a crack)
  k *= 0.97 + hu(x, y, 0x3a1) * 0.06;
  if (t.get(x, y - 1) === Mat.Air || t.get(x, y - 2) === Mat.Air) k *= 1.08;
  const fossil = hu(x, y, 0xf05) > 0.996;
  const [r, g, b] = fossil ? [168, 150, 126] : [214, 196, 158];
  return gemRgb(r * k, g * k, b * k);
}

/** A hash of (x, y) in [0, 1) (salted by `s`). */
const hu = (x: number, y: number, s: number) => (hash2(x, y, s) >>> 0) / 4294967296;

/**
 * The dome's hollow, seen from inside: an ancient rotunda after the
 * Pantheon, bleak and brutal. A drum wall of great stone courses, niches
 * sunk in it between plain pilasters, a heavy cornice; over that the dome's
 * far half, coffered in rows that narrow toward the top (latitude and
 * longitude projected), each coffer stepped in twice; at the crown the
 * oculus, sealed with a plug of cement. No light comes in: grey, dim,
 * streaked with the grime of ages, a little paler toward the top.
 */
function rotundaColor(t: Terrain, x: number, y: number, d: { x: number; y: number; r: number }): number {
  const R = d.r - 14;
  const dx = x - d.x;
  const e = Math.max(0, ((d.y - y) * 1.08) / R); // up the wall: 0 at the floor, 1 at the crown
  let k = 0.5 + e * 0.14 + 0.05 * noise(x, y, 20, 62) + hu(x, y, 61) * 0.035;
  // Grime streaks down from the coffers.
  if (hu(x >> 1, 0, 63) > 0.82) k *= 0.9;
  if (e < 0.3) {
    // The drum: courses of great blocks, niches between pilasters.
    const nh = d.y - y; // height above the floor
    const course = Math.floor(nh / 9);
    const bx = (((x + (course & 1) * 9) % 18) + 18) % 18;
    if (nh % 9 === 0 || bx === 0) k *= 0.78;
    const bay = ((((dx + 408) % 34) + 34) % 34) - 17; // -17..16 across each bay
    const top = R * 0.24;
    if (Math.abs(bay) < 6 && nh < top + Math.sqrt(Math.max(0, 36 - bay * bay)) * 0.9) k *= Math.abs(bay) > 4 ? 0.62 : 0.4; // a niche, its arched head
    else if (Math.abs(bay) > 14) k *= 1.12; // a pilaster
  } else if (e < 0.36) {
    // The cornice: a pale band, its shadow under it.
    k *= e < 0.315 ? 0.55 : 1.18;
  } else {
    const lat = Math.asin(Math.min(1, e));
    if (lat > 1.32) {
      // The oculus, sealed: a dark ring round a plug of cement.
      k *= lat < 1.38 ? 0.42 : 0.7;
    } else {
      const lon = Math.asin(Math.max(-1, Math.min(1, dx / (R * Math.cos(lat) + 0.001))));
      // Five rows of coffers up to the crown, twenty-eight round (the Pantheon's count).
      const rowF = ((lat - 0.39) / (1.32 - 0.39)) * 5;
      const colF = (lon / Math.PI) * 28;
      const fr = rowF - Math.floor(rowF);
      const fc = colF - Math.floor(colF);
      const edge = Math.min(fr, 1 - fr, fc, 1 - fc);
      if (edge < 0.07) k *= 1.1; // the ribs between coffers
      else if (edge < 0.15) k *= 0.82; // the first step in
      else if (edge < 0.24) k *= 0.68; // the second
      else k *= 0.6; // the coffer's deep panel
      if (fr < 0.12) k *= 0.85; // each row's shadowed lower lip
    }
  }
  void t;
  return gemRgb(112 * k, 109 * k, 104 * k);
}

/** The shaft's lining: great weathered ashlar blocks, dark, their joints darker. */
/**
 * Where a pass runs through a petrified trunk's foot: the roots there, set
 * back behind the play (a back wall): the same pale stone, shaded round across
 * each root, but dimmed and cooled, so you see it's behind you.
 */
const isRoot = (backdrop: Uint8Array, x: number, y: number) => x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H && (backdrop[y * WORLD_W + x] === VBack.Roots || backdrop[y * WORLD_W + x] === VBack.RootsFront);

/**
 * A root standing in front of the play (where a pass runs under a trunk): the
 * trunk's own pale stone, shaded round across it, a touch darker than the
 * solid wood (a hint it isn't there to stand on), outlined against what's behind.
 */
function rootsFrontColor(backdrop: Uint8Array, x: number, y: number): number {
  const is = (xx: number, yy: number) => xx >= 0 && xx < WORLD_W && yy >= 0 && yy < WORLD_H && backdrop[yy * WORLD_W + xx] === VBack.RootsFront;
  let l = 0;
  while (l < 12 && is(x - l - 1, y)) l++;
  let r = 0;
  while (r < 12 && is(x + r + 1, y)) r++;
  const u = (l + 0.5) / (l + r + 1);
  let k = 0.55 + 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * (1.2 - u * 0.75);
  if (!is(x, y - 1)) k *= 1.1;
  if (!is(x, y + 1)) k *= 0.75;
  if (!is(x - 1, y) || !is(x + 1, y)) k *= 0.7;
  k *= 0.88;
  return gemRgb(128 * k, 146 * k, 160 * k);
}

function rootsBackColor(backdrop: Uint8Array, x: number, y: number): number {
  const is = (xx: number, yy: number) => isRoot(backdrop, xx, yy);
  let l = 0;
  while (l < 20 && is(x - l - 1, y)) l++;
  let r = 0;
  while (r < 20 && is(x + r + 1, y)) r++;
  const u = (l + 0.5) / (l + r + 1);
  let k = l + r < 9 ? 0.8 - u * 0.12 : 0.5 + 0.7 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * (1.2 - u * 0.75);
  if (!is(x, y - 1)) k *= 1.06;
  if (!is(x, y + 1)) k *= 0.7;
  if (!is(x - 1, y) || !is(x + 1, y)) k *= 0.8; // (a dark outline round each root, against the cave behind)
  k *= 0.52;
  return gemRgb(112 * k, 132 * k, 152 * k);
}

function ashlarColor(t: Terrain, x: number, y: number): number {
  const course = Math.floor(y / 12);
  const bx = (((x + (course & 1) * 13) % 26) + 26) % 26;
  const by = ((y % 12) + 12) % 12;
  let k = 0.48 + 0.08 * noise(x, y, 16, 64) + hu(x, y, 65) * 0.04;
  if (by === 0 || bx === 0) k *= 0.62;
  else if (by === 1 || bx === 1) k *= 1.08;
  void t;
  return gemRgb(104 * k, 100 * k, 94 * k);
}

/** The three GEMM colours: pink, turquoise, emerald. */
const GEMS: readonly (readonly [number, number, number])[] = [
  [236, 92, 172],
  [48, 210, 204],
  [52, 206, 104],
];
/** Which colour a GEMM deposit (or crystal) is: one per stretch of ground, so a vein is all one gem. */
const gemOf = (x: number, y: number) => GEMS[hash2(Math.floor(x / 200), Math.floor(y / 200) + 911) % 3];
const gemRgb = (r: number, g: number, b: number) => (255 << 24) | (Math.min(255, Math.round(b)) << 16) | (Math.min(255, Math.round(g)) << 8) | Math.min(255, Math.round(r));

/**
 * A GEMM deposit: the old vein texture (speckled, lit where it's exposed,
 * darker where it meets the rock) in its gem's colour, with a glint of
 * crystal here and there.
 */
function gemDepositColor(t: Terrain, x: number, y: number): number {
  const [r, g, b] = gemOf(x, y);
  const h = hash2(x, y);
  let k = 0.74 + ((h >>> 4) & 15) / 40;
  const own = (m: number) => m === Mat.Gold || m === Mat.GemCrystal;
  if (t.get(x, y - 1) === Mat.Air) k *= 1.28;
  else if (!own(t.get(x, y - 1)) || !own(t.get(x - 1, y))) k *= 1.1;
  else if (!own(t.get(x, y + 1)) || !own(t.get(x + 1, y))) k *= 0.7;
  if ((h & 31) === 0) return gemRgb(255, 250, 255); // a glint
  if ((h & 31) < 3) k *= 0.62; // a speck of matrix
  return gemRgb(r * k, g * k, b * k);
}

/** A GEMM crystal: bright, faceted (bands of light across its faces), lit top and left, a white glint at its heart now and then. */
function gemCrystalColor(t: Terrain, x: number, y: number): number {
  const [r, g, b] = gemOf(x, y);
  const other = (dx: number, dy: number) => t.get(x + dx, y + dy) !== Mat.GemCrystal;
  const h = hash2(x, y);
  let k = [1.18, 1.0, 0.88, 1.36][((x - y) >> 1) & 3];
  if (other(0, -1) || other(-1, 0)) k = 1.5;
  else if (other(0, 1) || other(1, 0)) k = 0.6;
  if ((h & 15) === 0) return gemRgb(255, 255, 255);
  // Lighter than the deposit: mixed toward white.
  return gemRgb((r * 0.8 + 50) * k, (g * 0.8 + 50) * k, (b * 0.8 + 50) * k);
}

/**
 * Trinitite: the deadland's green glass, fused out of the sand by the old
 * fires. Glossy: a pale sheen on its upper faces, deep bottle green under,
 * bubbles and dark flaws through it, and a glint here and there.
 */
function glassColor(t: Terrain, x: number, y: number): number {
  const h = hash2(x, y);
  let r = 74;
  let g = 156;
  let b = 84;
  if (t.get(x, y - 1) !== Mat.Glass || t.get(x - 1, y) !== Mat.Glass) {
    r = 150;
    g = 214;
    b = 140;
  } else if (t.get(x, y + 1) !== Mat.Glass) {
    r = 36;
    g = 92;
    b = 50;
  } else if ((h & 31) < 3) {
    r = 40;
    g = 100;
    b = 56; // a flaw
  } else if ((h & 31) === 5) {
    r = 120;
    g = 196;
    b = 128; // a bubble
  }
  if ((h & 63) === 7) r = g = b = 230;
  return (255 << 24) | (b << 16) | (g << 8) | r;
}

/** The most cells of remains kept (Game.remains: the oldest go first). */
const REMAINS_MAX = 300_000;
/** What each stain tint dries to: red blood, then an asp's goo by gem (pink, turquoise, emerald). */
const STAIN_RGB = [
  [110, 12, 14],
  [196, 30, 110],
  [24, 160, 150],
  [30, 150, 74],
] as const;

/** Blend an ABGR terrain pixel toward dried blood (or an asp's goo, by tint) by stain intensity. */
function bloodied(c: number, stain: number, tint = 0): number {
  const k = Math.min(0.8, stain / 300);
  const [sr, sg, sb] = STAIN_RGB[tint] ?? STAIN_RGB[0];
  const r = c & 255;
  const g = (c >> 8) & 255;
  const b = (c >> 16) & 255;
  const nr = Math.round(r + (sr - r) * k);
  const ng = Math.round(g + (sg - g) * k);
  const nb = Math.round(b + (sb - b) * k);
  return (255 << 24) | (nb << 16) | (ng << 8) | nr;
}

/**
 * Over the rock face in a dug-out space: soft shadow where it meets the
 * ground, deepest under an overhang (as if the cave were lit from its
 * mouth). Black at that much alpha, else transparent.
 */
function caveShade(t: Terrain, x: number, y: number): number {
  const R = 7;
  let a = 0;
  for (const [dx, dy, w] of SHADE_DIRS) {
    let d = 1;
    while (d <= R && t.get(x + dx * d, y + dy * d) === Mat.Air) d++;
    if (d <= R) a = Math.max(a, (1 - (d - 1) / R) * w);
  }
  if (a <= 0.02) return 0;
  return ((Math.round(a * 255) & 255) << 24) | 0x060408;
}
const SHADE_DIRS: readonly [number, number, number][] = [
  [0, -1, 0.62],
  [-1, 0, 0.42],
  [1, 0, 0.42],
  [0, 1, 0.3],
];

/** Build menu buttons (Renderer.menuHit): turn the piece a quarter, mirror it. */
export const MENU_ROTATE = -2;
export const MENU_MIRROR = -3;

/** Each mode as the vote shows it (by GameMode). */
const VOTE_NAMES = ['LAST MAN', 'TEAMS', 'REGICIDE', 'EXTRACTION', 'PVP', 'SIEGE', 'EXTERMINATION'];

export class Renderer {
  /** Scratch: the underground rects behind the terrain this frame (x, y, w, h). */
  private readonly backRects: number[] = [];
  readonly ctx: CanvasRenderingContext2D;
  private readonly beastPts: number[] = [];
  /** The colour the ground at a cell is drawn in (for the millipede's dirt camouflage). */
  private readonly groundColor = (x: number, y: number): number => PALETTE[this.groundTerrain!.get(x, y) * 8 + (hash2(x, y) & 3)];
  private groundTerrain: Terrain | null = null;

  /** The wildlife in view: the ones coiled round someone, or the rest. */
  private drawBeasts(ctx: CanvasRenderingContext2D, game: Game, alpha: number, now: number, coiled: boolean, camX: number, camY: number, halfW: number, halfH: number): void {
    this.groundTerrain = game.terrain;
    for (const [slot, v] of game.beastViews) {
      if (v.coiled !== coiled) continue;
      // (At the render time the clones and vehicles round it are drawn at: Game.beastPose.)
      const pose = game.beastPose(v);
      const pts = this.beastPts;
      pts.length = 0;
      for (let i = 0; i < pose.pts.length; i++) pts.push(pose.pts[i]);
      // (By its head, with room for its body: a basilisk's is long.)
      const m = v.kind === BeastKind.Dragon ? 720 : v.kind === BeastKind.Basilisk ? 240 : 80;
      if (pts[0] < camX - halfW - m || pts[0] > camX + halfW + m || pts[1] < camY - halfH - m || pts[1] > camY + halfH + m) continue;
      const lift = pose.lift;
      if (v.kind === BeastKind.Basilisk) drawBasilisk(ctx, pts, v.seed, v.frozen, v.frenzy, now);
      else if (v.kind === BeastKind.Dragon) drawDragon(ctx, pts, v.seed, v.frozen, v.frenzy, now, lift);
      else if (v.kind === BeastKind.Spider) drawCaveSpider(ctx, game.terrain, this.groundColor, slot, pts, v.seed, lift, v.frozen, v.attached, now, v.carry);
      else if (v.kind === BeastKind.Web) drawWebNest(ctx, game.terrain, pts[0], pts[1], v.seed, Math.round(v.lift * 255), now);
      else if (v.kind === BeastKind.Seeder) drawSeeder(ctx, pts, v.seed, now);
      else if (v.kind === BeastKind.Nest) drawNest(ctx, game.terrain, pts[0], pts[1], v.seed, v.hp, now);
      else if (v.kind === BeastKind.Asp) {
        if (v.gem) drawAspGem(ctx, game.terrain, gemOf, pts, v.seed, now);
        else drawAsp(ctx, game.terrain, pts, v.seed, lift, now);
      } else drawMillipede(ctx, game.terrain, this.groundColor, pts, v.seed, lift, v.frozen, now);
      // Its wounds (wounds.ts): how hurt it is, as everyone sees it.
      if (!v.gem && v.kind !== BeastKind.Web && v.kind !== BeastKind.Nest && v.kind !== BeastKind.Seeder) this.drawScars(ctx, v.kind, pts, v.seed, beastDamage(v.hp, v.top), now);
    }
  }

  /**
   * A creature's wounds (beastScars: which segments are cut, how badly):
   * pixel gashes slashed across its segments, a dark wet core in a rim of
   * its own blood; the bad ones wider, flesh showing in them. A dragon's
   * are its own: deep rents through the plates, its burning blood glowing
   * molten in the worst of them (and pulsing, in its frenzy of pain).
   */
  private drawScars(ctx: CanvasRenderingContext2D, kind: number, pts: readonly number[], seed: number, dmg: number, now: number): void {
    if (dmg <= 0.04 || pts.length < 4) return;
    const segs = pts.length >> 1;
    const r = BEAST_BUILD[kind].r;
    const dragon = kind === BeastKind.Dragon;
    // Its blood: [rim, core, what shows in the deep ones].
    const [rim, core, deep] = dragon
      ? ['#a0242a', '#2a0406', '#e8601a']
      : kind === BeastKind.Basilisk
        ? ['#7a0c0a', '#240406', '#e8c8a0']
        : kind === BeastKind.Spider
          ? ['#8aa040', '#2a3010', '#e0e8b0']
          : kind === BeastKind.Asp
            ? ['#3a8a7a', '#0c2420', '#c8f0e0']
            : ['#6a3a10', '#201006', '#e8c890'];
    const hot = dragon ? 0.55 + 0.3 * Math.sin(now / 130) : 1;
    for (const s of beastScars(seed, segs, dmg)) {
      const i = s.seg;
      const j = i < segs - 1 ? i + 1 : i - 1;
      const a = Math.atan2(pts[i * 2 + 1] - pts[j * 2 + 1], pts[i * 2] - pts[j * 2]);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Where on the segment: off to one side of its spine, a little along it.
      const off = s.side * r * 0.22;
      const along = (s.at - 0.5) * r * 0.6;
      const cx = pts[i * 2] + ca * along - sa * off;
      const cy = pts[i * 2 + 1] + sa * along + ca * off;
      // A gash across the body, raked back: a ragged lens, longer and gaping wider the worse it is
      // (kept within the body: no longer than it's thick).
      const g = a + Math.PI / 2 + s.side * 0.55;
      const gx = Math.cos(g);
      const gy = Math.sin(g);
      // (Its whole length within the body's girth, however it's raked.)
      const halfL = Math.max(0.8, Math.min(r * 0.58, r * (0.22 + s.sev * 0.4)));
      const halfW = Math.max(0.6, halfL * (0.14 + s.sev * 0.14));
      const box = Math.ceil(halfL) + 1;
      const x0 = Math.round(cx);
      const y0 = Math.round(cy);
      for (let py = -box; py <= box; py++) {
        for (let px = -box; px <= box; px++) {
          const dx = x0 + px + 0.5 - cx;
          const dy = y0 + py + 0.5 - cy;
          const u = dx * gx + dy * gy;
          const w = -dx * gy + dy * gx;
          if (Math.abs(u) > halfL) continue;
          // (Tapered to its ends, the edges torn: a little in and out along it.)
          const jag = 0.75 + 0.5 * (((Math.imul(seed + i * 31 + Math.round(u * 2), 2654435761) >>> 24) & 255) / 255);
          const hw = halfW * (1 - (u / halfL) ** 2) * jag;
          if (hw <= 0.15 || Math.abs(w) > hw + 0.35) continue;
          const t = Math.abs(w) / (hw + 0.35);
          ctx.fillStyle = t > 0.72 ? rim : core;
          if (t <= 0.22 && s.sev > 0.7 && Math.abs(u) < halfL * 0.6) {
            // The worst: what's under it shows (flesh; a dragon's burning blood, pulsing).
            ctx.fillStyle = deep;
            if (dragon) ctx.globalAlpha = hot;
          }
          ctx.fillRect(x0 + px, y0 + py, 1, 1);
          ctx.globalAlpha = 1;
        }
      }
    }
  }
  /**
   * Coral a seeder sowed, growing out of a clone's limbs (CORAL_LIMBS, how far
   * grown each): tufts out of each leg, the off arm, and the gun arm along
   * from the shoulder; lying down, all of it along the body.
   */
  private drawCoral(ctx: CanvasRenderingContext2D, x: number, y: number, aim: number, stance: number, parts: number, levels: readonly number[], id: number, now: number): void {
    const left = Math.cos(aim) < 0;
    const ix = Math.round(x);
    const iy = Math.round(y);
    const out = left ? 1 : -1; // (out the back: away from the gun)
    for (let i = 0; i < CORAL_LIMBS.length; i++) {
      const g = levels[i] ?? 0;
      const part = CORAL_LIMBS[i];
      if (g <= 0 || !has(parts, part)) continue;
      const seed = id * 31 + i * 7;
      if (stance === Stance.Prone) {
        drawCoralGrowth(ctx, ix + 1 + i * 2, iy + ACTOR_H - 3, ix + 2 + i * 2, iy + ACTOR_H - 2, out, g, seed, now);
        continue;
      }
      if (part === Part.GunArm) {
        const sh = shoulderAt(x, y, stance, left, this.shPt);
        const ex = Math.round(sh.x + Math.cos(aim) * 2.5);
        const ey = Math.round(sh.y + Math.sin(aim) * 2.5);
        drawCoralGrowth(ctx, Math.min(ex, Math.round(sh.x)), Math.min(ey, Math.round(sh.y)), Math.max(ex, Math.round(sh.x)), Math.max(ey, Math.round(sh.y)), left ? -1 : 1, g, seed, now);
        continue;
      }
      const d = PARTS[part];
      const rx0 = left ? ACTOR_W - 1 - d.rx1 : d.rx0;
      const rx1 = left ? ACTOR_W - 1 - d.rx0 : d.rx1;
      let ry0 = d.ry0 + STANCE_DROP[stance];
      let ry1 = d.ry1 + STANCE_DROP[stance];
      if (part === Part.LegB || part === Part.LegF) {
        // (The legs fold under a crouch: squeezed into the bottom of the box.)
        const legH = stance === Stance.Crouch ? 3 : 5;
        ry0 = ACTOR_H - legH;
        ry1 = ACTOR_H - 1;
      }
      const ox = part === Part.LegF ? -out : out;
      drawCoralGrowth(ctx, ix + rx0, iy + ry0, ix + rx1, iy + ry1, ox, g, seed, now);
    }
  }
  private chunkCanvas: (HTMLCanvasElement | null)[] = new Array(CHUNK_COUNT).fill(null);
  private chunkImage = new ImageData(CHUNK, CHUNK);
  private chunkPixels = new Uint32Array(this.chunkImage.data.buffer);
  /** What stands in front of the play in each chunk (the forest's front roots), drawn over the actors; null where there's none. */
  private frontCanvas: (HTMLCanvasElement | null)[] = new Array(CHUNK_COUNT).fill(null);
  private frontImage = new ImageData(CHUNK, CHUNK);
  private frontPixels = new Uint32Array(this.frontImage.data.buffer);
  private mini: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  private miniImage: ImageData;
  private miniPixels: Uint32Array;
  readonly sprites = new SpriteCache();
  private readonly backdrop = new Backdrop();
  /** Aiming down the scope this frame (camera pushed out, overlay drawn). */
  private scoped = false;
  /** The scope's line of sight this frame: from the shoulder along the aim to the first solid cell. */
  private sight: { x: number; y: number; aim: number; mouseAim: number; cone: number; dist: number } | null = null;
  /** Not scoped, but the aim assist has snapped onto something: the scope's laser and lock show anyway. */
  private assistSight = false;
  private readonly particleLayer = new ParticleLayer();
  zoom = 3;
  /** The Stoneburner's fireball (a shader, set up the first time one's drawn). */
  private readonly stoneCloud = new StoneCloud();
  camX = WORLD_W / 2;
  /** Debug only (?debug, window.sc): pin the view to a world point. */
  lookAt: { x: number; y: number } | null = null;
  camY = WORLD_H / 3;
  private fps = 60;
  private lastFrame = performance.now();
  rasterizedThisFrame = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.mini = document.createElement('canvas');
    this.mini.width = WORLD_W / MINI_SCALE;
    this.mini.height = WORLD_H / MINI_SCALE;
    this.miniCtx = this.mini.getContext('2d')!;
    this.miniImage = this.miniCtx.createImageData(this.mini.width, this.mini.height);
    this.miniPixels = new Uint32Array(this.miniImage.data.buffer);
    this.miniPixels.fill(0xff1a1412);
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(innerWidth * dpr);
    const h = Math.floor(innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    // Integer zoom that never shows more than the server's interest rectangle.
    // Prefer ~480 world cells across, never less zoom than the interest limit.
    const minZoom = Math.ceil(Math.max(w / (2 * VIEW_HALF_W), h / (2 * VIEW_HALF_H)));
    this.zoom = Math.max(1, minZoom, Math.round(w / 480));
  }

  /** Re-rasterize chunks whose terrain changed since last frame. */
  private updateChunks(game: Game): void {
    const t = game.terrain;
    this.rasterizedThisFrame = 0;
    // A whole new map is a lot of texturing: spread it over frames, the
    // chunks around the camera first (whatever is in view is never stale).
    const cx0 = Math.max(0, Math.floor((this.camX - VIEW_HALF_W) / CHUNK) - 1);
    const cx1 = Math.min(CHUNKS_X - 1, Math.floor((this.camX + VIEW_HALF_W) / CHUNK) + 1);
    const cy0 = Math.max(0, Math.floor((this.camY - VIEW_HALF_H) / CHUNK) - 1);
    const cy1 = Math.min(CHUNKS_Y - 1, Math.floor((this.camY + VIEW_HALF_H) / CHUNK) + 1);
    const visit = (ci: number) => {
      if (!t.dirty[ci] || !game.loaded[ci]) return;
      t.dirty[ci] = 0;
      this.rasterize(game, ci);
      this.rasterizedThisFrame++;
    };
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) visit(cy * CHUNKS_X + cx);
    for (let ci = 0; ci < CHUNK_COUNT && this.rasterizedThisFrame < CHUNKS_PER_FRAME; ci++) visit(ci);
  }

  private rasterize(game: Game, ci: number): void {
    const t = game.terrain;
    const ox = (ci % CHUNKS_X) << CHUNK_SHIFT;
    const oy = Math.floor(ci / CHUNKS_X) << CHUNK_SHIFT;
    const px = this.chunkPixels;
    const fpx = this.frontPixels;
    fpx.fill(0);
    let fronts = 0;
    const stain = game.stain;
    const stainTint = game.stainTint;
    const remains = game.remains;
    const backdrop = game.backdrop;
    const skyline = game.skyline;
    for (let y = 0; y < CHUNK; y++) {
      const wy = oy + y;
      const row = wy * WORLD_W + ox;
      for (let x = 0; x < CHUNK; x++) {
        const m = t.mat[row + x];
        if (m === Mat.Air) {
          // Inside a bunker: its back wall instead of the open backdrop.
          const bd = backdrop[row + x];
          let c: number;
          if (bd === VBack.Rotunda && game.valley) c = rotundaColor(t, ox + x, wy, game.valley.dome);
          else if (bd === VBack.Ashlar) c = ashlarColor(t, ox + x, wy);
          else if (bd === VBack.Roots) c = rootsBackColor(backdrop, ox + x, wy);
          else if (bd === VBack.RootsFront) {
            // A root in front: the pass's roots behind it, and it, over whoever walks through.
            c = rootsBackColor(backdrop, ox + x, wy);
            fpx[y * CHUNK + x] = rootsFrontColor(backdrop, ox + x, wy);
            fronts++;
          }
          else if (bd) c = backWallColor(t, bd, ox + x, wy);
          else if (wy > skyline[ox + x] + 3) c = caveShade(t, ox + x, wy);
          else c = grassBlade(t, ox + x, wy);
          // Remains lying here (gibs settled into the ground): drawn as part of it.
          if (remains.size) {
            const rm = remains.get(row + x);
            if (rm !== undefined) c = rm;
          }
          // Under standing water: tinted deep and clear, a bright line at its surface.
          if (t.water && t.water[row + x]) c = waterColor(t, ox + x, wy, c);
          px[y * CHUNK + x] = c;
          continue;
        }
        const wx = ox + x;
        let c: number;
        if (m === Mat.Concrete || m === Mat.Metal || m === Mat.Cobble || m === Mat.Glyph || m === Mat.Iron || m === Mat.Sandbag || m === Mat.Door) c = structColor(t, m, wx, wy);
        else if (m === Mat.RuinStone || m === Mat.RuinGlyph) c = structColor(t, m === Mat.RuinStone ? Mat.Cobble : Mat.Glyph, wx, wy); // (the labyrinth's masonry, but breakable)
        else if (m === Mat.Grass || m === Mat.Snow) c = frostColor(t, m, wx, wy);
        else if (m === Mat.Dripstone) c = dripColor(t, wx, wy);
        else if (m === Mat.RareEarth) c = crystalColor(t, wx, wy);
        else if (m === Mat.Gold) c = gemDepositColor(t, wx, wy);
        else if (m === Mat.GemCrystal) c = gemCrystalColor(t, wx, wy);
        else if (m === Mat.Glass) c = glassColor(t, wx, wy);
        else if (m === Mat.Cement) c = cementColor(t, wx, wy);
        else if (m === Mat.OldConcrete) c = oldConcreteColor(t, wx, wy);
        else if (m === Mat.Rust) c = rustColor(t, wx, wy);
        else if (m === Mat.Pour) c = pourColor(t, wx, wy);
        else if (m === Mat.Petrified) c = petrifiedColor(t, wx, wy);
        else if (m === Mat.Limestone) c = limestoneColor(t, wx, wy);
        else {
          const exposed = wy > 0 && t.mat[row + x - WORLD_W] === Mat.Air;
          c = soilColor(m, wx, wy, PALETTE[m * 8 + (hash2(wx, wy) & 3) + (exposed ? 4 : 0)]);
        }
        const st = stain[row + x];
        if (st) c = bloodied(c, st, stainTint[row + x]);
        px[y * CHUNK + x] = c;
      }
    }
    let c = this.chunkCanvas[ci];
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = CHUNK;
      this.chunkCanvas[ci] = c;
    }
    c.getContext('2d')!.putImageData(this.chunkImage, 0, 0);
    if (fronts) {
      let f = this.frontCanvas[ci];
      if (!f) {
        f = document.createElement('canvas');
        f.width = f.height = CHUNK;
        this.frontCanvas[ci] = f;
      }
      f.getContext('2d')!.putImageData(this.frontImage, 0, 0);
    } else this.frontCanvas[ci] = null;

    // Minimap: one pixel per 8x8 block, colored by the block's dominant material.
    const mx0 = ox / MINI_SCALE;
    const my0 = oy / MINI_SCALE;
    const mw = WORLD_W / MINI_SCALE;
    for (let by = 0; by < CHUNK / MINI_SCALE; by++) {
      for (let bx = 0; bx < CHUNK / MINI_SCALE; bx++) {
        const x0 = ox + bx * MINI_SCALE;
        const y0 = oy + by * MINI_SCALE;
        const n = t.countSolid(x0, y0, x0 + MINI_SCALE - 1, y0 + MINI_SCALE - 1);
        const m = t.mat[(y0 + 4) * WORLD_W + x0 + 4];
        const color = n > 32 ? PALETTE[(m === Mat.Air ? Mat.Dirt : m) * 8 + 1] : 0xff2a201a;
        this.miniPixels[(my0 + by) * mw + mx0 + bx] = color;
      }
    }
    this.miniDirty = true;
  }
  private miniDirty = false;

  /** For stamping a dead creature's segments into the remains: drawn here, read back. */
  private buryCanvas: HTMLCanvasElement | null = null;

  /**
   * Work the gibs that settled since last frame into the ground: each one's
   * pixels, just as it's drawn (dried a shade darker), into the remains
   * layer (Game.remains), in the open cells it lies in; their chunks redrawn.
   */
  private buryRemains(game: Game): void {
    const rm = game.remains;
    const t = game.terrain;
    const put = (wx: number, wy: number, c: number) => {
      if (wx < 0 || wy < 0 || wx >= WORLD_W || wy >= WORLD_H || t.isSolid(wx, wy)) return;
      // (Dried: a shade darker, fully opaque.)
      const r = Math.round((c & 0xff) * 0.82);
      const g = Math.round(((c >> 8) & 0xff) * 0.82);
      const b = Math.round(((c >> 16) & 0xff) * 0.82);
      const k = wy * WORLD_W + wx;
      rm.delete(k); // (newest last: the oldest go first when there are too many)
      rm.set(k, (0xff000000 | (b << 16) | (g << 8) | r) >>> 0);
      t.markRenderDirty(wx, wy);
    };
    for (const g of game.buried) {
      const rot = ((g.spin % 4) + 4) % 4;
      const sp = this.sprites.gibPixels(g.color, g.aux & 0x7f, rot);
      const x0 = Math.floor(g.x - sp.w / 2);
      const y0 = Math.floor(g.y - sp.h / 2);
      for (let y = 0; y < sp.h; y++) for (let x = 0; x < sp.w; x++) {
        const c = sp.data[y * sp.w + x];
        if (c >>> 24 > 128) put(x0 + x, y0 + y, c);
      }
    }
    game.buried.length = 0;
    if (game.buriedSegments.length) {
      const S = 192;
      const c = (this.buryCanvas ??= Object.assign(document.createElement('canvas'), { width: S, height: S }));
      const bx = c.getContext('2d', { willReadFrequently: true })!;
      for (const g of game.buriedSegments) {
        const ox = Math.round(g.x) - S / 2;
        const oy = Math.round(g.y) - S / 2;
        bx.setTransform(1, 0, 0, 1, 0, 0);
        bx.clearRect(0, 0, S, S);
        bx.imageSmoothingEnabled = false;
        bx.translate(-ox, -oy);
        if (g.kind === BeastKind.Basilisk) drawBasiliskGib(bx, g.x, g.y, g.a, g.seed, g.i);
        else if (g.kind === BeastKind.Dragon) drawDragonGib(bx, g.x, g.y, g.a, g.seed, g.i);
        else if (g.kind === BeastKind.Spider) drawSpiderGib(bx, g.x, g.y, g.a, g.seed, g.i);
        else if (g.kind === BeastKind.Web) drawWebGib(bx, g.x, g.y, g.a, g.seed, g.i);
        else if (g.kind === BeastKind.Seeder || g.kind === BeastKind.Nest) drawCritterGib(bx, g.x, g.y, g.a, g.kind, g.seed, g.i);
        else drawSegmentGib(bx, t, this.groundColor, g.x, g.y, g.a, g.kind, g.seed, g.i, performance.now());
        const d = new Uint32Array(bx.getImageData(0, 0, S, S).data.buffer);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const v = d[y * S + x];
          if (v >>> 24 > 128) put(ox + x, oy + y, v);
        }
      }
      game.buriedSegments.length = 0;
    }
    // Too many: the oldest go (as if trodden into the dirt).
    if (rm.size > REMAINS_MAX) {
      for (const k of rm.keys()) {
        rm.delete(k);
        t.markRenderDirty(k % WORLD_W, Math.floor(k / WORLD_W));
        if (rm.size <= REMAINS_MAX * 0.9) break;
      }
    }
  }

  draw(game: Game, input: InputState, net: Link, alpha: number): void {
    this.game = game;
    const now = performance.now();
    this.fps = this.fps * 0.95 + (1000 / Math.max(1, now - this.lastFrame)) * 0.05;
    this.lastFrame = now;
    this.buryRemains(game);
    this.updateChunks(game);
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const z = this.zoom;

    // Camera follows the interpolated, smoothed own body.
    const b = game.body;
    const pb = game.prevBody;
    game.smoothX *= 0.85;
    game.smoothY *= 0.85;
    // (Riding on top of a vehicle: on our seat on it, as it's drawn this frame.)
    const riding = game.ridingAt(alpha);
    const selfX = riding ? riding.x : pb.x + (b.x - pb.x) * alpha + game.smoothX;
    const selfY = riding ? riding.y : pb.y + (b.y - pb.y) * alpha + game.smoothY;
    const flying = game.alive ? game.pilotedShip() : null;
    const dogged = game.alive ? game.remoteDog() : null;
    this.scoped = game.alive && input.scoping && !game.drive && !flying && !dogged; // in a tank, right mouse is the cannon; flying, it's the bombs
    if (dogged) {
      // Driving the watchdog by remote: the view rides with it, looking toward the mouse.
      const lookX = (input.mouseX * (W / innerWidth) - W / 2) / z;
      const lookY = (input.mouseY * (H / innerHeight) - H / 2) / z;
      this.camX += (dogged.x + tankW(dogged) / 2 + lookX * 0.3 - this.camX) * 0.25;
      this.camY += (dogged.y + tankH(dogged) / 2 + lookY * 0.3 - this.camY) * 0.25;
    } else if (flying) {
      // Remote-piloting our dropship: the view rides with it, looking ahead
      // toward the mouse and down at the ground it's working over.
      const lookX = (input.mouseX * (W / innerWidth) - W / 2) / z;
      const lookY = (input.mouseY * (H / innerHeight) - H / 2) / z;
      this.camX += (flying.x + SHIP_W / 2 + lookX * 0.3 - this.camX) * 0.2;
      this.camY += (flying.y + SHIP_H / 2 + 50 + lookY * 0.3 - this.camY) * 0.2;
    } else if (this.scoped) {
      // Scoping: push the view out along the barrel by the weapon's scope
      // distance (the server moves this client's interest area the same way).
      // It stops where the line of sight does: never through or past terrain.
      const mx = this.camX + (input.mouseX * (W / innerWidth) - W / 2) / z;
      const my = this.camY + (input.mouseY * (H / innerHeight) - H / 2) / z;
      const sh = shoulderAt(selfX, selfY, b.stance, game.aimMark ? game.aimMark.x < selfX + ACTOR_W / 2 : mx < selfX + ACTOR_W / 2, this.shPt);
      // (Locked on: down the line to them.) Clones stop the line as walls do.
      const mouseAim = Math.atan2(my - sh.y, mx - sh.x);
      const aim = game.lockAim ?? mouseAim;
      const reach = lineOfFire(game, sh.x, sh.y, aim, WEAPONS[game.weapon]?.scope ?? 0).dist;
      this.sight = { x: sh.x, y: sh.y, aim, mouseAim, cone: WEAPONS[game.weapon]?.lockCone ?? 0, dist: sightLine(game.terrain, sh.x, sh.y, aim, 2000) };
      // Snapped onto someone (auto-aim or the scope's lock): the scope goes to them, however far.
      const am = game.aimMark;
      const tx = am ? am.x : sh.x + Math.cos(aim) * reach;
      const ty = am ? am.y : sh.y + Math.sin(aim) * reach;
      this.camX += (tx - this.camX) * 0.12;
      this.camY += (ty - this.camY) * 0.12;
    } else if (game.alive) {
      // Look ahead toward the mouse a little, like CC's aim-follow camera.
      const lookX = (input.mouseX * (W / innerWidth) - W / 2) / z;
      const lookY = (input.mouseY * (H / innerHeight) - H / 2) / z;
      // Building holds the view on the clone so the ghost stays under the cursor.
      const look = game.building ? 0 : 0.25;
      const tx = selfX + ACTOR_W / 2 + lookX * look;
      const ty = selfY + ACTOR_H / 2 + lookY * look;
      this.camX += (tx - this.camX) * 0.25;
      this.camY += (ty - this.camY) * 0.25;
    } else {
      // Riding in: follow our own drop rocket down, leading toward the ground.
      game.rideSmoothX *= 0.85;
      game.rideSmoothY *= 0.85;
      game.rideSmoothA *= 0.85;
      const mine = game.myCraft(alpha);
      if (mine) {
        // Lead along the flight path so you can see where you'll land.
        this.camX += (mine.x + mine.vx * 0.3 - this.camX) * 0.2;
        this.camY += (mine.y + 30 + mine.vy * 0.3 - this.camY) * 0.2;
      } else if (game.spectate !== 255) {
        // Out of the wave: follow whoever we're watching.
        const v = game.remoteViews().find((r) => r.id === game.spectate);
        if (v) {
          this.camX += (v.x + ACTOR_W / 2 - this.camX) * 0.15;
          this.camY += (v.y + ACTOR_H / 2 - this.camY) * 0.15;
        }
      }
    }
    // (Debug only, ?debug: the view pinned to a spot on the map.)
    if (this.lookAt) {
      this.camX = this.lookAt.x;
      this.camY = this.lookAt.y;
    }
    // Snapped by the aim assist (unscoped): the same laser and lock the scope shows.
    this.assistSight = false;
    if (!this.scoped && !flying && !dogged && game.alive && !game.drive && game.lockAim !== null && game.aimMark) {
      const sh = shoulderAt(selfX, selfY, b.stance, game.aimMark.x < selfX + ACTOR_W / 2, this.shPt);
      this.sight = { x: sh.x, y: sh.y, aim: game.lockAim, mouseAim: game.lockAim, cone: 0, dist: 0 };
      this.assistSight = true;
    }
    const halfW = W / z / 2;
    const halfH = H / z / 2;
    this.camX = Math.max(halfW, Math.min(WORLD_W - halfW, this.camX));
    this.camY = Math.max(halfH - 200, Math.min(WORLD_H - halfH, this.camY));
    const shake = game.shake;
    const camX = this.camX + (Math.random() - 0.5) * shake;
    const camY = this.camY + (Math.random() - 0.5) * shake;
    // World -> device pixel transform, snapped so chunk seams never shimmer.
    const offX = Math.round(W / 2 - camX * z);
    const offY = Math.round(H / 2 - camY * z);

    // Background: an alien sky, fading into deep cave dark by world depth.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = skyGradient(ctx, offY, z, game.biome);
    ctx.fillRect(0, 0, W, H);
    // Clouds, blue ranges and mesas (the deadland: its monuments) in parallax over the sky.
    this.backdrop.setBiome(game.biome);
    this.backdrop.draw(ctx, W, H, (W / 2 - offX) / z, (H / 2 - offY) / z, z, now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.setTransform(z, 0, 0, z, offX, offY);
    ctx.imageSmoothingEnabled = false;

    // Cave backdrop: below each column's skyline, dug-out space shows the rock face behind the ground.
    const bx0 = Math.max(0, Math.floor(camX - halfW));
    const bx1 = Math.min(WORLD_W - 1, Math.ceil(camX + halfW));
    const bottom = Math.min(WORLD_H, camY + halfH + 1);
    const rects = this.backRects;
    rects.length = 0;
    let runStart = bx0;
    for (let x = bx0 + 1; x <= bx1 + 1; x++) {
      if (x > bx1 || game.skyline[x] !== game.skyline[runStart]) {
        const top = game.skyline[runStart] + 3;
        if (top < bottom) rects.push(runStart, top, x - runStart, bottom - top);
        runStart = x;
      }
    }
    drawBackwall(ctx, rects, WORLD_H);

    // Now and then, on a cave's back wall: a trace of whoever was here first.
    if (game.relics.length) drawRelics(ctx, game.relics, camX - halfW, camY - halfH, camX + halfW, camY + halfH);

    // A Stoneburner strike's shock wave, over the site (behind the ground: only the half in the sky shows; stone-cloud.ts).
    for (let i = game.stoneBurns.length - 1; i >= 0; i--) {
      const sb = game.stoneBurns[i];
      const t = (now - sb.at) / 1000;
      if (t * 1000 > CLOUD_MS) {
        game.stoneBurns.splice(i, 1);
        continue;
      }
      drawShock(ctx, sb.x, sb.y, t);
    }

    // Terrain chunks in view.
    const vx0 = Math.max(0, Math.floor((camX - halfW) / CHUNK));
    const vx1 = Math.min(CHUNKS_X - 1, Math.floor((camX + halfW) / CHUNK));
    const vy0 = Math.max(0, Math.floor((camY - halfH) / CHUNK));
    const vy1 = Math.min(CHUNKS_Y - 1, Math.floor((camY + halfH) / CHUNK));
    for (let cy = vy0; cy <= vy1; cy++) {
      for (let cx = vx0; cx <= vx1; cx++) {
        const ci = cy * CHUNKS_X + cx;
        const c = this.chunkCanvas[ci];
        if (c && game.loaded[ci]) ctx.drawImage(c, cx * CHUNK, cy * CHUNK);
        else {
          ctx.fillStyle = 'rgba(10,8,8,0.85)';
          ctx.fillRect(cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
        }
      }
    }

    // The alien flora, on the ground and in the caves.
    if (game.flora.length) drawFlora(ctx, game.terrain, game.flora, game.floraDead, game.floraSwell, camX - halfW, camY - halfH, camX + halfW, camY + halfH, now);

    // The bunkers' fittings: lamps, pipes, signs and the like, on their back walls.
    if (game.decor.length) drawDecor(ctx, game.terrain, game.decor, camX - halfW, camY - halfH, camX + halfW, camY + halfH, now);

    // Bunker doors: a lamp over each, green if it opens for us, red if not
    // (amber, blinking, while it moves); gone once the door's blown out.
    for (const d of game.doors) {
      if (d.x1 < camX - halfW - 8 || d.x0 > camX + halfW + 8 || d.y1 < camY - halfH || d.y0 > camY + halfH + 8) continue;
      const t = game.terrain;
      const cx = (d.x0 + d.x1) >> 1;
      let shut = 0;
      for (let y = d.y0; y < d.y1; y++) if (t.get(cx, y) === Mat.Door) shut++;
      if (t.get(cx, d.y0 - 1) === Mat.Air) continue; // (blown out: the blast takes the housing over it)
      const ours = game.myTeam === Team.None || game.myTeam === d.team;
      const moving = shut > 0 && shut < d.y1 - d.y0;
      const ly = d.y0 - 4;
      ctx.fillStyle = '#1a1a1e';
      ctx.fillRect(cx - 2, ly - 1, 4, 3);
      ctx.fillStyle = moving ? ((now / 140) % 2 < 1 ? '#ffb020' : '#5a3a08') : ours ? '#50ff70' : '#ff3a30';
      ctx.fillRect(cx - 1, ly, 2, 1);
      ctx.fillStyle = moving ? 'rgba(255,176,32,0.18)' : ours ? 'rgba(80,255,112,0.16)' : 'rgba(255,58,48,0.16)';
      ctx.fillRect(cx - 3, ly - 2, 6, 5);
    }

    // Extraction: the labyrinth's traps, and the extraction rocket.
    if (game.dungeon) this.drawTraps(ctx, game, camX - halfW, camY - halfH, camX + halfW, camY + halfH);
    const rsE = game.roundState;
    if (rsE?.evac && rsE.evac.state !== Evac.None) this.drawEvac(ctx, rsE.evac, now);

    // Drop rockets.
    for (const c of game.craftViews()) this.drawCraft(ctx, c, game, now);
    const ride = game.myCraft(alpha);
    if (ride && game.ride) this.drawCraft(ctx, ride, game, now);

    // Landmines: ours and our side's plain to see (a light winks green once armed, amber
    // while arming); the enemy's only a dull, half-buried disc for those who look.
    for (const m of game.mineList) {
      const ours = m.owner === game.myId || (m.team !== Team.None && m.team === game.myTeam);
      const x = m.x;
      const y = m.y;
      ctx.fillStyle = ours ? '#141a10' : 'rgba(20,24,16,0.75)';
      ctx.fillRect(x - 3, y - 2, 7, 2);
      ctx.fillStyle = ours ? '#5a6a34' : 'rgba(70,78,52,0.7)';
      ctx.fillRect(x - 2, y - 2, 5, 1);
      if (ours) {
        ctx.fillStyle = !m.armed ? ((now / 120) % 2 < 1 ? '#ffb020' : '#503008') : (now / 600) % 1 < 0.15 ? '#60ff60' : '#1a4a1a';
        ctx.fillRect(x, y - 3, 1, 1);
      }
    }

    // Stoneburner beacons (and the missile coming down on one), and the molten cores of strikes past.
    if (game.footList.length) drawFeet(ctx, game.footList, now);
    if (game.burnerList.length) drawBeacons(ctx, game.burnerList, now);
    // Sticky charges: a small dark puck, a hazard stripe, and its red light blinking faster as it runs down.
    for (const c of game.chargeList) {
      const x = Math.round(c.x) - 2;
      const y = Math.round(c.y) - 1;
      ctx.fillStyle = '#14130f';
      ctx.fillRect(x - 0.5, y - 0.5, 5, 3);
      ctx.fillStyle = '#4a4c3a';
      ctx.fillRect(x, y, 4, 2);
      ctx.fillStyle = '#d8a428';
      ctx.fillRect(x, y + 1, 4, 1);
      const on = !c.stuck || c.fuse % stickyBlink(c.fuse) < stickyBlink(c.fuse) / 2;
      if (on && c.stuck) {
        ctx.fillStyle = 'rgba(255,40,30,0.35)';
        ctx.fillRect(x - 1, y - 2, 6, 4);
      }
      ctx.fillStyle = on && c.stuck ? '#ff3b2a' : '#5a1410';
      ctx.fillRect(x + 1.5, y - 0.5, 1, 1);
    }

    // Tanks (behind the clones, so a clone walking past shows in front).
    const wmx = (input.mouseX * (W / innerWidth) - offX) / z;
    const wmy = (input.mouseY * (H / innerHeight) - offY) / z;
    for (const t of game.tankViews(alpha)) {
      const mine = (t.slot === game.driveSlot && !!game.drive) || (t.slot === game.rc && game.alive);
      // (Driving it ourselves: the guns follow our mouse now, not the last word from the server.)
      const aim = mine ? (game.rc === t.slot && game.lockAim !== null ? game.lockAim : Math.atan2(wmy - gunPivotY(t), wmx - (t.x + tankW(t) / 2))) : t.aim;
      if (isSpider(t)) this.drawTarantula(ctx, t, mine ? Math.cos(aim) < 0 : t.faceLeft, aim, game, now);
      else if (isMole(t)) this.drawMole(ctx, t, mine ? Math.cos(aim) < 0 : t.faceLeft, aim, game, now);
      else this.drawTank(ctx, t, mine ? Math.cos(aim) < 0 : t.faceLeft, aim, game, now);
    }

    // Dropships.
    for (const sh of game.shipViews()) this.drawShip(ctx, sh, game, now);
    // Wildlife, drawn between the last two frames it was sent in (a coiled one later, over its victim).
    this.drawBeasts(ctx, game, alpha, now, false, camX, camY, halfW, halfH);

    // Remote clones (not those riding inside a tank).
    const views = game.remoteViews(alpha).filter((v) => !game.tankPilots.has(v.id));
    for (const v of views) {
      if (!(v.flags & F_ALIVE)) continue;
      const info = game.players.get(v.id);
      const aimR = dequantizeAim(v.aim);
      const lean = this.pose(v.id, v.stance, Math.cos(aimR) < 0, v.vx, v.vy, (v.flags & F_GROUND) !== 0, (v.flags & F_JET) !== 0, now);
      this.drawActor(ctx, v.x, v.y, aimR, this.fireFlags(game, v.flags, v.weapon, v.id, now), info?.rgb ?? 0xcccccc, v.weapon, v.moving, now, v.parts, v.stance, lean, v.faction, game.kickOf(v.id, now), v.id, v.hp);
      const coral = game.coralIn.get(v.id);
      if (coral) this.drawCoral(ctx, v.x, v.y, aimR, v.stance, v.parts, coral, v.id, now);
      // Someone charging a laser: their muzzle glows (we can't see how full, so it pulses).
      if (v.weapon === WeaponId.Laser && v.flags & F_FIRING) {
        const sh = shoulderAt(v.x, v.y, v.stance, Math.cos(aimR) < 0, this.shPt);
        this.drawLaserCharge(ctx, sh.x + Math.cos(aimR) * WEAPONS[WeaponId.Laser].muzzle, sh.y + Math.sin(aimR) * WEAPONS[WeaponId.Laser].muzzle, 0.35 + 0.25 * Math.sin(now / 120), now);
      }
    }
    // Scoped: the line a shot would take, to the wall it would hit or the
    // first clone in its way (bracketed): only what you can actually hit.
    if ((this.scoped || this.assistSight) && this.sight) this.drawSightLine(ctx, game, now);

    // Own clone (hidden inside its tank while driving).
    if (game.alive && !game.drive) {
      const wx = (input.mouseX * (W / innerWidth) - offX) / z;
      const wy = (input.mouseY * (H / innerHeight) - offY) / z;
      // (Snapped onto someone: facing them, the gun on that shoulder, as the shot will leave it.)
      const mySh = shoulderAt(selfX, selfY, b.stance, game.aimMark ? game.aimMark.x < selfX + ACTOR_W / 2 : wx < selfX + ACTOR_W / 2, this.shPt);
      const myAim = game.lockAim ?? Math.atan2(wy - mySh.y, wx - mySh.x);
      const reloading = game.reloadLeft > 0;
      const dry = (WEAPONS[game.weapon]?.clip ?? 0) > 0 && game.ammo === 0;
      const flags =
        F_ALIVE |
        (b.onGround ? F_GROUND : 0) |
        (b.jetting ? F_JET : 0) |
        (input.buttons() & BTN_FIRE && !reloading && !dry && game.weapon === WeaponId.Digger ? F_FIRING : 0) |
        (game.weapon !== WeaponId.Digger && game.shotFlash(game.myId, now) ? F_FIRING : 0) |
        (reloading ? F_RELOAD : 0) |
        (b.cls << F_CLASS_SHIFT);
      const lean = this.pose(-1, b.stance, Math.cos(myAim) < 0, b.vx, b.vy, b.onGround, b.jetting, now);
      game.myLeft = Math.cos(myAim) < 0;
      this.drawActor(ctx, selfX, selfY, myAim, flags, game.players.get(game.myId)?.rgb ?? 0xffffff, game.weapon, !riding && Math.abs(b.vx) > 5, now, game.parts, b.stance, lean, b.faction, game.kickOf(game.myId, now), game.myId, game.hp);
      if (game.myCoral.length) this.drawCoral(ctx, selfX, selfY, myAim, b.stance, game.parts, game.myCoral, game.myId, now);
      if (game.laserCharge > 0) {
        const m = WEAPONS[WeaponId.Laser].muzzle;
        this.drawLaserCharge(ctx, mySh.x + Math.cos(myAim) * m, mySh.y + Math.sin(myAim) * m, game.laserCharge / LASER_MAX, now);
      }
    }

    // Every particle the field engine owns (grains, sparks, flames, smoke,
    // dust, blood, gibs): one pixel buffer covering the view, one upload.
    const lx = Math.floor(camX - halfW) - 1;
    const ly = Math.floor(camY - halfH) - 1;
    this.particleLayer.render(game.particles, this.sprites, alpha, lx, ly, Math.ceil(halfW * 2) + 3, Math.ceil(halfH * 2) + 3);
    ctx.drawImage(this.particleLayer.canvas, lx, ly);

    // A millipede coiled round its prey, over them; a dead one's segments tumbling.
    this.drawBeasts(ctx, game, alpha, now, true, camX, camY, halfW, halfH);
    for (const g of game.segmentGibs) {
      if (g.x < camX - halfW - 10 || g.x > camX + halfW + 10 || g.y < camY - halfH - 10 || g.y > camY + halfH + 10) continue;
      ctx.globalAlpha = Math.min(1, g.life / 30);
      if (g.kind === BeastKind.Basilisk) drawBasiliskGib(ctx, g.x, g.y, g.a, g.seed, g.i);
      else if (g.kind === BeastKind.Dragon) drawDragonGib(ctx, g.x, g.y, g.a, g.seed, g.i);
      else if (g.kind === BeastKind.Spider) drawSpiderGib(ctx, g.x, g.y, g.a, g.seed, g.i);
      else if (g.kind === BeastKind.Web) drawWebGib(ctx, g.x, g.y, g.a, g.seed, g.i);
      else if (g.kind === BeastKind.Seeder || g.kind === BeastKind.Nest) drawCritterGib(ctx, g.x, g.y, g.a, g.kind, g.seed, g.i);
      else drawSegmentGib(ctx, game.terrain, this.groundColor, g.x, g.y, g.a, g.kind, g.seed, g.i, now);
    }
    ctx.globalAlpha = 1;

    // What stands in front of the play: the forest's front roots, over whoever ducks behind them.
    for (let cy = vy0; cy <= vy1; cy++) {
      for (let cx = vx0; cx <= vx1; cx++) {
        const f = this.frontCanvas[cy * CHUNKS_X + cx];
        if (f && game.loaded[cy * CHUNKS_X + cx]) ctx.drawImage(f, cx * CHUNK, cy * CHUNK);
      }
    }

    // Geysers: their glowing mouths.
    if (game.geyserList.length) drawGeysers(ctx, game.geyserList, camX - halfW, camY - halfH, camX + halfW, camY + halfH, now);

    // Weapons lying on the ground (spinning while they fly), and a prompt
    // over the one we'd pick up.
    for (const [, it] of game.groundItems) {
      if (it.weapon === WeaponId.Idol) this.drawIdolGlow(ctx, it.x, it.y - 4, now);
      const ang = it.rest || it.weapon === WeaponId.Idol ? (it.left ? Math.PI : 0) : (now / 90) % (Math.PI * 2);
      const g = this.sprites.gun(it.weapon, ang);
      ctx.drawImage(g.c, Math.round(it.x) - g.r, Math.round(it.y) - 1 - g.r);
    }
    const near = game.nearestItem();
    if (near && WEAPONS[near.weapon]) {
      const d = WEAPONS[near.weapon];
      ctx.font = `${Math.max(4, Math.round(11 / z))}px ui-monospace, monospace`;
      const label = `${input.touch ? '⬆' : '[3]'} ${d.name}${d.clip > 0 ? ` ${near.ammo}/${d.clip}` : ''}`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(near.x - tw / 2 - 1, near.y - 13, tw + 2, 6);
      ctx.fillStyle = '#ffd34a';
      ctx.textAlign = 'center';
      ctx.fillText(label, near.x, near.y - 8);
      ctx.textAlign = 'left';
    }

    // Over an empty tank in reach: how to climb in.
    const surfable = game.boardableTank() ? null : game.surfableTank();
    const boardable = game.boardableTank() ?? surfable;
    if (boardable) {
      ctx.font = `${Math.max(4, Math.round(11 / z))}px ui-monospace, monospace`;
      const label = surfable ? `${input.touch ? '⬆' : '[3]'} ride on top` : `${input.touch ? '⬆' : '[3]'} climb in`;
      const tx = boardable.x + tankW(boardable) / 2;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(tx - tw / 2 - 1, boardable.y - 19, tw + 2, 6);
      ctx.fillStyle = '#9fe870';
      ctx.textAlign = 'center';
      ctx.fillText(label, tx, boardable.y - 14);
      ctx.textAlign = 'left';
    }

    // The tutorial: a bobbing arrow over what it wants you to look at.
    const ct = game.coach?.target;
    if (ct) {
      const bob = Math.sin(now / 180) * 3;
      const ay = ct.y - 10 + bob;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.moveTo(ct.x - 5, ay - 1);
      ctx.lineTo(ct.x + 5, ay - 1);
      ctx.lineTo(ct.x, ay + 7);
      ctx.fill();
      ctx.fillStyle = '#ffe14a';
      ctx.beginPath();
      ctx.moveTo(ct.x - 4, ay);
      ctx.lineTo(ct.x + 4, ay);
      ctx.lineTo(ct.x, ay + 5);
      ctx.fill();
      ctx.fillRect(ct.x - 1, ay - 6, 2, 6);
    }

    // Up by a friendly dropship's roof: how to climb on.
    const roof = game.surfableShip();
    if (roof && !boardable) {
      ctx.font = `${Math.max(4, Math.round(11 / z))}px ui-monospace, monospace`;
      const label = `${input.touch ? '⬆' : '[3]'} ride on top`;
      const tx = roof.x + SHIP_W / 2;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(tx - tw / 2 - 1, roof.y - 7, tw + 2, 6);
      ctx.fillStyle = '#9fe870';
      ctx.textAlign = 'center';
      ctx.fillText(label, tx, roof.y - 2);
      ctx.textAlign = 'left';
    }

    // Materializer beams (anyone's), fading out.
    for (const bm of game.beams) {
      const t = (now - bm.at) / 300;
      if (t >= 1) continue;
      ctx.strokeStyle = bm.tracer ? `rgba(255,246,200,${0.9 * (1 - t) ** 2})` : `rgba(140,232,255,${0.8 * (1 - t)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bm.x0, bm.y0);
      ctx.lineTo(bm.x1, bm.y1);
      ctx.stroke();
    }
    if (game.building) {
      const wx = (input.mouseX * (W / innerWidth) - offX) / z;
      const wy = (input.mouseY * (H / innerHeight) - offY) / z;
      this.drawBuildGhost(ctx, game, input, wx, wy, selfX, selfY, z);
    }

    // Projectiles.
    const p = game.projectiles;
    for (let i = 0; i < p.n; i++) {
      const k = p.kind[i];
      const x = p.x[i];
      const y = p.y[i];
      if (k === 8) {
        // Runaway engine: the rocket pod tumbling along its heading, its flame out the bell while it burns.
        const burning = PROJ[k].life - p.life[i] < (PROJ[k].burn ?? 0);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.ang[i] + Math.PI / 2); // the pod's nose is up in the sprite; heading points out of the nose
        if (burning) {
          const len = 4 + ((now / 31 + i) % 3);
          ctx.fillStyle = '#ff8a24';
          ctx.fillRect(-3, 5, 6, len);
          ctx.fillStyle = '#ffd860';
          ctx.fillRect(-2, 5, 4, len - 1);
          ctx.fillStyle = '#fffbe0';
          ctx.fillRect(-1, 5, 2, len - 2);
        }
        ctx.drawImage(this.sprites.shipEngine(), -5, -6);
        ctx.restore();
      } else if (k === 14) {
        // AT missile: an olive body with a red seeker head and fins, a flame out the back.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.ang[i] || Math.atan2(p.vy[i], p.vx[i]));
        const len = 3 + ((now / 29 + i) % 3);
        ctx.fillStyle = '#ff8a24';
        ctx.fillRect(-5 - len, -1, len, 2);
        ctx.fillStyle = '#fffbe0';
        ctx.fillRect(-5 - len + 1, -0.5, len - 1, 1);
        ctx.fillStyle = '#3c4628';
        ctx.fillRect(-5, -1.5, 8, 3);
        ctx.fillRect(-5, -2.5, 2, 5);
        ctx.fillStyle = (now / 90) % 2 < 1 ? '#ff3030' : '#a01010';
        ctx.fillRect(3, -1, 2, 2);
        ctx.restore();
      } else if (k === ProjKind.FireSpit) {
        // A dragon's spit: a glob of burning blood, a dark red heart in a halo of flame.
        const op = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, 'rgba(255,200,80,0.9)');
        g.addColorStop(0.5, 'rgba(255,90,20,0.45)');
        g.addColorStop(1, 'rgba(200,30,10,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 9, y - 9, 18, 18);
        ctx.globalCompositeOperation = op;
        ctx.fillStyle = '#6a0408';
        ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
        ctx.fillStyle = '#ff8a20';
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 2, 2, 1);
      } else if (k === ProjKind.Venom) {
        // Millipede venom: a wet, dark-red glob, a bright glint on it, drawn out a little along its flight.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(p.vy[i], p.vx[i]));
        ctx.fillStyle = '#5a0606';
        ctx.beginPath();
        ctx.ellipse(-0.5, 0, 2.6, 1.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b01010';
        ctx.beginPath();
        ctx.ellipse(0, 0, 1.8, 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff9a8a';
        ctx.fillRect(0.3, -0.8, 0.8, 0.6);
        ctx.restore();
      } else if (k === ProjKind.Plasma) {
        // Mole plasma: a white-hot core in a blue glow, swelling and fading as it burns out.
        const age = 1 - p.life[i] / PROJ[k].life;
        const r = 1.5 + age * 3;
        ctx.fillStyle = `rgba(80,180,255,${0.35 * (1 - age * 0.6)})`;
        ctx.beginPath();
        ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = age < 0.5 ? '#e8ffff' : '#8ae8ff';
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
      } else if (k === ProjKind.SpiderMissile) {
        // Tarantula missile: a slim grey dart, a yellow nose band, a flame out the back.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(p.vy[i], p.vx[i]));
        const len = 2 + ((now / 27 + i) % 3);
        ctx.fillStyle = '#ff8a24';
        ctx.fillRect(-4 - len, -0.75, len, 1.5);
        ctx.fillStyle = '#fffbe0';
        ctx.fillRect(-4 - len + 1, -0.35, len - 1, 0.7);
        ctx.fillStyle = '#8a9096';
        ctx.fillRect(-4, -1, 6, 2);
        ctx.fillStyle = '#4d5359';
        ctx.fillRect(-4, -1.8, 1.5, 3.6);
        ctx.fillStyle = '#d8b030';
        ctx.fillRect(1, -1, 1, 2);
        ctx.fillStyle = '#30353a';
        ctx.fillRect(2, -0.6, 1, 1.2);
        ctx.restore();
      } else if (k === 7) {
        // Dropship bomb: a dark finned casing, nose down, a red band.
        ctx.fillStyle = '#2a2e30';
        ctx.fillRect(x - 1.5, y - 3, 3, 5);
        ctx.fillRect(x - 2.5, y - 4, 5, 1);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(x - 1.5, y, 3, 1);
      } else if (k === 4) {
        // Tank shell: a fat dark slug with a hot base.
        ctx.fillStyle = '#3a3a30';
        ctx.fillRect(x - 2, y - 2, 4, 4);
        ctx.fillStyle = '#ffb040';
        ctx.fillRect(x - p.vx[i] * 0.006 - 1, y - p.vy[i] * 0.006 - 1, 2, 2);
      } else if (k === ProjKind.Bolt) {
        // Blaster bolt: a short hot-cyan dart of light with a white core.
        const sp = Math.hypot(p.vx[i], p.vy[i]) + 1e-6;
        const dx = p.vx[i] / sp;
        const dy = p.vy[i] / sp;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(80,220,255,0.45)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - dx * 9, y - dy * 9);
        ctx.stroke();
        ctx.strokeStyle = '#eaffff';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - dx * 7, y - dy * 7);
        ctx.stroke();
        ctx.lineCap = 'butt';
      } else if (k === ProjKind.AutoShell) {
        // Autocannon shell: a squat steel slug, a glowing tracer base.
        ctx.fillStyle = '#2c2e2a';
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        ctx.fillStyle = '#ffc060';
        ctx.fillRect(x - p.vx[i] * 0.005 - 0.75, y - p.vy[i] * 0.005 - 0.75, 1.5, 1.5);
      } else if (PROJ[k]?.ballistic) {
        ctx.strokeStyle = '#fff3b0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        // A short streak behind it (a sniper slug's full tracer is drawn when it lands).
        const sp = Math.hypot(p.vx[i], p.vy[i]) + 1e-6;
        const len = Math.min(sp * 0.012, 24);
        ctx.lineTo(x - (p.vx[i] / sp) * len, y - (p.vy[i] / sp) * len);
        ctx.stroke();
      } else if (k === 1) {
        ctx.fillStyle = '#d8d8d8';
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      } else {
        ctx.fillStyle = '#4a5a32';
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        ctx.fillStyle = (now / 120) % 2 < 1 ? '#ff4040' : '#401010';
        ctx.fillRect(x - 0.5, y - 2.5, 1, 1);
      }
    }

    // Health waves: a ring of nanobots racing out from whoever used the kit,
    // then every clone it caught (its side's) mending in a drift of green crosses.
    for (let i = game.healWaves.length - 1; i >= 0; i--) {
      const hw = game.healWaves[i];
      const age = (now - hw.at) / 1000;
      const spread = HEAL_SPREAD / 30;
      if (age > MEND_TICKS / 30) {
        game.healWaves.splice(i, 1);
        continue;
      }
      if (age < spread * 1.6) {
        const u = Math.min(1, age / spread);
        const r = 4 + (HEAL_R - 4) * (1 - (1 - u) * (1 - u));
        const a = age < spread ? 1 : 1 - (age - spread) / (spread * 0.6);
        ctx.lineWidth = 6;
        ctx.strokeStyle = `rgba(90,240,190,${0.18 * a})`;
        ctx.beginPath();
        ctx.arc(hw.x, hw.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(210,255,236,${0.85 * a})`;
        ctx.beginPath();
        ctx.arc(hw.x, hw.y, r, 0, Math.PI * 2);
        ctx.stroke();
        // Crosses riding the front.
        for (let k = 0; k < 14; k++) {
          const th = (k / 14) * Math.PI * 2 + age * 1.5;
          const px = Math.round(hw.x + Math.cos(th) * r);
          const py = Math.round(hw.y + Math.sin(th) * r);
          ctx.fillStyle = k % 2 ? `rgba(120,255,170,${a})` : `rgba(240,255,250,${a})`;
          ctx.fillRect(px - 1, py, 3, 1);
          ctx.fillRect(px, py - 1, 1, 3);
        }
        if (age < 0.12) {
          ctx.fillStyle = `rgba(200,255,230,${0.5 * (1 - age / 0.12)})`;
          ctx.beginPath();
          ctx.arc(hw.x, hw.y, 14, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // The mending: everyone caught, by this client's reckoning (its side, inside the ring).
      const left = 1 - age / (MEND_TICKS / 30);
      const mending: { x: number; y: number; id: number }[] = views.map((v) => ({ x: v.x + 4, y: v.y + 7, id: v.id }));
      if (game.alive) mending.push({ x: game.body.x + 4, y: game.body.y + 7, id: game.myId });
      for (const m of mending) {
        const t = game.teamOf[m.id] ?? 255;
        if (m.id !== hw.owner && (hw.team === 255 || t !== hw.team)) continue;
        if (Math.hypot(m.x - hw.x, m.y - hw.y) > HEAL_R + 40) continue;
        for (let k = 0; k < 3; k++) {
          const ph = (now / 900 + k / 3 + m.id * 0.17) % 1;
          const px = Math.round(m.x + Math.sin(ph * 9 + k * 2 + m.id) * 5);
          const py = Math.round(m.y + 4 - ph * 16);
          ctx.fillStyle = `rgba(110,255,160,${(1 - ph) * left})`;
          ctx.fillRect(px - 1, py, 3, 1);
          ctx.fillRect(px, py - 1, 1, 3);
        }
      }
    }

    // Laser beams: a hot magenta glow around a white core, wider the stronger
    // the charge, fading out (a strong beam lingers longer).
    for (let i = game.laserBeams.length - 1; i >= 0; i--) {
      const bm = game.laserBeams[i];
      const life = 220 + 520 * bm.power;
      const t = (now - bm.at) / life;
      if (t >= 1) {
        game.laserBeams.splice(i, 1);
        continue;
      }
      const w = laserWidth(bm.power) * 2 * (1 - t * 0.6);
      const a = 1 - t;
      ctx.lineCap = 'round';
      for (const [k, col] of [
        [2.2, `rgba(255,40,140,${0.25 * a})`],
        [1.2, `rgba(255,90,190,${0.6 * a})`],
        [0.45, `rgba(255,240,255,${a})`],
      ] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(0.5, w * k);
        ctx.beginPath();
        ctx.moveTo(bm.x0, bm.y0);
        ctx.lineTo(bm.x1, bm.y1);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }

    // A Stoneburner strike's fireball, over everything round ground zero (stone-cloud.ts); then its light over everything in view, warm, fading as it cools.
    for (const sb of game.stoneBurns) this.stoneCloud.draw(ctx, sb.x, sb.y, (now - sb.at) / 1000, sb.seed, { x0: camX - halfW, y0: camY - halfH, x1: camX + halfW, y1: camY + halfH });
    for (const sb of game.stoneBurns) drawCloudWash(ctx, sb.x, sb.y, (now - sb.at) / 1000, { x0: camX - halfW, y0: camY - halfH, x1: camX + halfW, y1: camY + halfH });

    // Explosion flashes.
    for (let i = game.flashes.length - 1; i >= 0; i--) {
      const fl = game.flashes[i];
      const t = (now - fl.at) / 250;
      if (t >= 1) {
        game.flashes.splice(i, 1);
        continue;
      }
      ctx.fillStyle = `rgba(255,220,140,${0.6 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, fl.r * (0.5 + t * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }

    // Name tags (screen space for crisp text).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = W / innerWidth;
    ctx.font = `${Math.round(11 * dpr)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    // Dropships: whose they are, how much hull is left, bombs aboard.
    for (const sh of game.shipViews()) {
      const sx = offX + (sh.x + SHIP_W / 2) * z;
      const sy = offY + (sh.y - 6) * z - 10 * dpr;
      const info = game.players.get(sh.owner);
      // Our side's dropships say what they're up to.
      const ours = sh.owner === game.myId || (sh.team !== Team.None && sh.team === game.myTeam);
      const doing = sh.piloted ? 'REMOTE PILOT' : SHIP_MISSION_NAMES[sh.mission];
      const tag = `${info?.name ?? '?'}'s dropship  ✸${sh.bombs}${ours && !sh.leaving ? `  · ${doing}` : ''}`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(tag, sx + dpr, sy + dpr);
      ctx.fillStyle = info?.color ?? '#ccc';
      ctx.fillText(tag, sx, sy);
      if (sh.hp < SHIP_HP) {
        const w = 44 * dpr;
        ctx.fillStyle = '#300';
        ctx.fillRect(sx - w / 2, sy + 3 * dpr, w, 3 * dpr);
        ctx.fillStyle = sh.hp > SHIP_HP * 0.35 ? '#d8c040' : '#e33';
        ctx.fillRect(sx - w / 2, sy + 3 * dpr, (w * sh.hp) / SHIP_HP, 3 * dpr);
      }
    }
    // Enemies our dropships have eyes on: red brackets on them, or an arrow
    // at the screen's edge pointing their way.
    const spotted = game.spottedNow();
    if (spotted.length) {
      const pulse = 0.65 + 0.35 * Math.sin(now / 160);
      ctx.strokeStyle = `rgba(255,90,60,${pulse})`;
      ctx.fillStyle = `rgba(255,90,60,${pulse})`;
      ctx.lineWidth = Math.max(1, 1.5 * dpr);
      const live = new Map(views.map((v) => [v.id, v]));
      for (const e of spotted) {
        const v = live.get(e.id);
        const wx = v ? v.x + ACTOR_W / 2 : e.x;
        const wy = v ? v.y + ACTOR_H / 2 : e.y;
        const sx = offX + wx * z;
        const sy = offY + wy * z;
        const m = 18 * dpr;
        if (sx > m && sx < W - m && sy > m && sy < H - m) {
          const r = (ACTOR_H / 2 + 3) * z;
          const c = r * 0.45;
          for (const [kx, ky] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            ctx.beginPath();
            ctx.moveTo(sx + kx * r, sy + ky * (r - c));
            ctx.lineTo(sx + kx * r, sy + ky * r);
            ctx.lineTo(sx + kx * (r - c), sy + ky * r);
            ctx.stroke();
          }
        } else {
          const cx0 = W / 2;
          const cy0 = H / 2;
          const a = Math.atan2(sy - cy0, sx - cx0);
          const t = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
          const ax = cx0 + Math.cos(a) * t;
          const ay = cy0 + Math.sin(a) * t;
          ctx.beginPath();
          ctx.moveTo(ax + Math.cos(a) * 9 * dpr, ay + Math.sin(a) * 9 * dpr);
          ctx.lineTo(ax + Math.cos(a + 2.5) * 7 * dpr, ay + Math.sin(a + 2.5) * 7 * dpr);
          ctx.lineTo(ax + Math.cos(a - 2.5) * 7 * dpr, ay + Math.sin(a - 2.5) * 7 * dpr);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    // Tanks: who's driving, and how much hull is left.
    for (const t of game.tankViews(alpha)) {
      const sx = offX + (t.x + tankW(t) / 2) * z;
      const sy = offY + (t.y - (isDog(t) ? 14 : isSpider(t) ? 4 : isMole(t) ? 22 : 8)) * z - 10 * dpr;
      // A watchdog (or a tarantula) wears its owner's name; a tank its driver's.
      const who = isPet(t) ? t.owner : t.pilot;
      if (who !== 255 && (who !== game.myId || isPet(t))) {
        const info = game.players.get(who);
        const tag = isPet(t) ? `${who === game.myId ? 'your' : `${info?.name ?? '?'}'s`} ${isSpider(t) ? 'tarantula' : 'watchdog'}` : (info?.name ?? '?');
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(tag, sx + dpr, sy + dpr);
        ctx.fillStyle = info?.color ?? '#ccc';
        ctx.fillText(tag, sx, sy);
      }
      const max = tankMaxHp(t);
      if (t.hp < max) {
        const w = (isDog(t) ? 28 : isSpider(t) ? 48 : isMole(t) ? 32 : 40) * dpr;
        ctx.fillStyle = '#300';
        ctx.fillRect(sx - w / 2, sy + 3 * dpr, w, 3 * dpr);
        ctx.fillStyle = t.hp > max * 0.35 ? '#d8c040' : '#e33';
        ctx.fillRect(sx - w / 2, sy + 3 * dpr, (w * t.hp) / max, 3 * dpr);
      }
    }
    for (const v of views) {
      if (!(v.flags & F_ALIVE)) continue;
      const info = game.players.get(v.id);
      const sx = offX + (v.x + ACTOR_W / 2) * z;
      const sy = offY + v.y * z - 8 * dpr;
      const tag = game.isKing(v.id) ? `♛ ${info?.name ?? '?'}` : (info?.name ?? '?');
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(tag, sx + dpr, sy + dpr);
      ctx.fillStyle = info?.color ?? '#ccc';
      ctx.fillText(tag, sx, sy);
      // A human (not a bot): a tiny star over their name.
      if (info && !info.bot) drawStar(ctx, sx, sy - 11 * dpr, 3.2 * dpr);
      if (v.hp < ACTOR_MAX_HP) {
        const w = 24 * dpr;
        ctx.fillStyle = '#300';
        ctx.fillRect(sx - w / 2, sy + 3 * dpr, w, 3 * dpr);
        ctx.fillStyle = '#e33';
        ctx.fillRect(sx - w / 2, sy + 3 * dpr, (w * v.hp) / ACTOR_MAX_HP, 3 * dpr);
      }
    }
    // Our own clone: our name over it in white, bold and outlined, so we can always pick ourselves out.
    if (game.alive && !game.drive) {
      const me = game.players.get(game.myId);
      const sx = offX + (selfX + ACTOR_W / 2) * z;
      const sy = offY + selfY * z - 8 * dpr;
      const tag = game.isKing(game.myId) ? `♛ ${me?.name ?? 'YOU'}` : (me?.name ?? 'YOU');
      ctx.save();
      ctx.font = `bold ${Math.round(12 * dpr)}px ui-monospace, monospace`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(tag, sx, sy);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tag, sx, sy);
      ctx.restore();
    }

    // The aim assist's target: a small red reticle on whatever the aim has snapped to.
    const am = game.alive ? game.aimMark : null;
    if (am) {
      const tx = offX + am.x * z;
      const ty = offY + am.y * z;
      const r = (5 + Math.sin(now / 120)) * dpr;
      ctx.strokeStyle = 'rgba(255,70,50,0.95)';
      ctx.lineWidth = Math.max(1, 1.5 * dpr);
      ctx.beginPath();
      ctx.arc(tx, ty, r, 0, Math.PI * 2);
      for (const [kx, ky] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(tx + kx * (r + 1 * dpr), ty + ky * (r + 1 * dpr));
        ctx.lineTo(tx + kx * (r + 4 * dpr), ty + ky * (r + 4 * dpr));
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,70,50,0.95)';
      ctx.fillRect(tx - dpr, ty - dpr, 2 * dpr, 2 * dpr);
    }

    // Crosshair.
    if (game.alive) {
      const mx = input.mouseX * dpr;
      const my = input.mouseY * dpr;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      ctx.moveTo(mx - 8 * dpr, my);
      ctx.lineTo(mx - 3 * dpr, my);
      ctx.moveTo(mx + 3 * dpr, my);
      ctx.lineTo(mx + 8 * dpr, my);
      ctx.moveTo(mx, my - 8 * dpr);
      ctx.lineTo(mx, my - 3 * dpr);
      ctx.moveTo(mx, my + 3 * dpr);
      ctx.lineTo(mx, my + 8 * dpr);
      ctx.stroke();
    }

    if (game.laserCharge > 0) {
      // The laser's charge: a ring filling round the crosshair, and how full.
      const f = game.laserCharge / LASER_MAX;
      const mx = input.mouseX * dpr;
      const my = input.mouseY * dpr;
      const r = 16 * dpr;
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = f >= 1 ? '#ffffff' : '#ff5ab4';
      ctx.beginPath();
      ctx.arc(mx, my, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      ctx.stroke();
      ctx.font = `bold ${Math.round(10 * dpr)}px ui-monospace, monospace`;
      ctx.fillStyle = '#ffd0ec';
      ctx.textAlign = 'center';
      ctx.fillText(f >= 1 ? 'MAX' : `${Math.round(f * 100)}%`, mx, my + r + 12 * dpr);
      ctx.textAlign = 'left';
    }
    if (this.scoped) {
      // Scope: a fine reticle, nothing over the view. Locked onto someone,
      // it's centred on them (wherever the pointer or thumb is), gliding
      // over when the target changes; otherwise on the pointer. Under it,
      // the range to what it's on, against how far the gun can lock on
      // (lockReach, by its scope): LOCK on a target, red past its reach.
      const am = game.aimMark;
      const tx = am ? am.x * z + offX : input.mouseX * dpr;
      const ty = am ? am.y * z + offY : input.mouseY * dpr;
      if (!this.spot || !this.spotWasScoped) this.spot = { x: tx, y: ty };
      const k = am ? 0.35 : 1;
      this.spot.x += (tx - this.spot.x) * k;
      this.spot.y += (ty - this.spot.y) * k;
      const mx = this.spot.x;
      const my = this.spot.y;
      const wx = (mx - offX) / z;
      const wy = (my - offY) / z;
      const dist = Math.hypot(wx - (game.body.x + ACTOR_W / 2), wy - (game.body.y + ACTOR_H / 2));
      const reach = lockReach(WEAPONS[game.weapon]);
      const out = !am && dist > reach;
      const col = am ? 'rgba(255,90,90,0.9)' : out ? 'rgba(255,120,90,0.55)' : 'rgba(160,255,160,0.75)';
      const arm = 14 * dpr;
      const gap = 4 * dpr;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = Math.max(1, dpr) * 3;
      const cross = () => {
        ctx.beginPath();
        ctx.moveTo(mx - arm, my);
        ctx.lineTo(mx - gap, my);
        ctx.moveTo(mx + gap, my);
        ctx.lineTo(mx + arm, my);
        ctx.moveTo(mx, my - arm);
        ctx.lineTo(mx, my - gap);
        ctx.moveTo(mx, my + gap);
        ctx.lineTo(mx, my + arm);
        ctx.stroke();
      };
      cross();
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, dpr);
      cross();
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(mx - dpr / 2), Math.round(my - dpr / 2), Math.max(1, dpr), Math.max(1, dpr));
      ctx.font = `bold ${Math.round(10 * dpr)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      const label = am ? `LOCK ${Math.round(dist / 10)}m` : out ? `${Math.round(dist / 10)}m · OUT OF RANGE` : `${Math.round(dist / 10)}m / ${Math.round(reach / 10)}m`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(label, mx + dpr, my + arm + 13 * dpr + dpr);
      ctx.fillStyle = col;
      ctx.fillText(label, mx, my + arm + 13 * dpr);
      ctx.textAlign = 'left';
    }

    this.spotWasScoped = this.scoped;

    if (game.hurtFlash > 0.02) {
      ctx.fillStyle = `rgba(160,0,0,${game.hurtFlash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }

    this.drawHud(game, input, net, views, dpr, W, H);
    if (game.coach) this.drawCoach(game.coach, dpr, W);
    // A Stoneburner strike's flash: every screen in the room goes white, HUD and all, and fades back.
    drawStoneFlash(ctx, W, H, now - game.stoneFlashAt);
  }

  /**
   * The tutorial's prompt: a terminal-green card at the top of the screen
   * with the Mother's current objective (she briefs each one first:
   * mother-ui.ts), what to do, and (for a few seconds) what just happened.
   */
  private drawCoach(c: Coach, dpr: number, W: number): void {
    const ctx = this.ctx;
    const s = dpr * Math.min(1, innerHeight / 560, innerWidth / 1000);
    const MONO = 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
    const bw = Math.min(W - 24 * s, 560 * s);
    const pad = 10 * s;
    const fs = Math.max(10, Math.round(13 * s));
    ctx.font = `${fs}px ${MONO}`;
    const words = c.body.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > bw - pad * 2 && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    if (line) lines.push(line);
    const lh = fs * 1.35;
    const head = fs * 1.6;
    const bh = pad * 2 + head + lines.length * lh + (c.note ? lh * 1.2 : 0);
    const x = (W - bw) / 2;
    const y = 12 * s;
    ctx.fillStyle = 'rgba(6,14,10,0.82)';
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeStyle = c.done ? '#ffe14a' : '#5dff9a';
    ctx.lineWidth = Math.max(1, s);
    ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = c.done ? '#ffe14a' : '#5dff9a';
    ctx.font = `bold ${fs}px ${MONO}`;
    ctx.fillText(c.done ? `> ${c.title.toUpperCase()}` : `> ${MOTHER_NAME} · OBJECTIVE ${c.n}/${c.of} · ${c.title.toUpperCase()}`, x + pad, y + pad + fs);
    ctx.font = `${fs}px ${MONO}`;
    ctx.fillStyle = '#e6f5ea';
    lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad + head + (i + 0.8) * lh));
    if (c.note) {
      ctx.fillStyle = '#ffd34a';
      ctx.fillText(c.note, x + pad, y + pad + head + (lines.length + 1) * lh);
    }
  }

  /** Backdrop behind the join screen. */
  drawIdle(): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // The game's sky and scenery, panning slowly, behind the join screen.
    const z = Math.max(2, Math.round(H / 260));
    const camY = 300;
    const offY = H / 2 - camY * z;
    ctx.fillStyle = skyGradient(ctx, offY, z);
    ctx.fillRect(0, 0, W, H);
    const now = performance.now();
    this.backdrop.setBiome(0);
    this.backdrop.draw(ctx, W, H, 2048 + now / 60, camY, z, now);
  }

  /**
   * A spider droid: a squat gunmetal chassis slung between six tin legs,
   * three fanned out behind and three in front, a domed turret on top (the
   * gun goes on it, drawn with the clones' guns). It walks on a tripod gait
   * (alternate legs lift and swing) keyed to the distance it has covered, so
   * its feet don't skate; in the air the legs hang. Legs shot off leave
   * sparking sockets; with its plating gone the chassis shows scorched.
   */
  /** The game being drawn (for the droids' feet to find the ground). */
  private game: Game | null = null;
  /** Each droid's feet, planted in the world, by player id (see droidFeet). */
  private readonly droidGaits = new Map<number, DroidGait>();
  private readonly tArt = new TarantulaArt();
  private readonly dArt = new DroidArt();

  /**
   * Where a droid's six feet are this frame (world cells), spider style.
   * Each foot stays planted where it landed until the body has moved on far
   * enough from it; then it steps: a quick lifted arc onto a new hold ahead,
   * on the ground or, clinging, the wall. The legs step in two alternating
   * tripods (as a real spider's do), never all at once. In the air the feet
   * curl in under it. Also how much the body dips as its weight shifts.
   */
  private droidFeet(id: number, x: number, y: number, left: boolean, grounded: boolean, now: number, k = 1): { x: Float32Array; y: Float32Array; bob: number; tilt: number } {
    // (`k`: its scale. A tarantula is a droid three times over: longer strides, slower steps.)
    let gait = this.droidGaits.get(id);
    if (!gait) {
      gait = { x: new Float32Array(6), y: new Float32Array(6), fx: new Float32Array(6), fy: new Float32Array(6), t: new Float32Array(6).fill(1), at: now, init: false, lx: x, ly: y, bob: 0, tilt: 0 };
      this.droidGaits.set(id, gait);
      if (this.droidGaits.size > 80) this.droidGaits.delete(this.droidGaits.keys().next().value!);
    }
    const dt = Math.min(0.1, Math.max(0, (now - gait.at) / 1000));
    gait.at = now;
    const vx = dt > 0 ? (x - gait.lx) / dt : 0;
    gait.lx = x;
    gait.ly = y;
    const terrain = this.game?.terrain;
    const solid = (cx: number, cy: number) => !!terrain && terrain.isSolid(Math.floor(cx), Math.floor(cy));
    const cx = x + (ACTOR_W * k) / 2;
    // On a wall (in the air, a wall at its side): its feet grip the wall.
    let wall = 0;
    if (!grounded) {
      for (const side of [1, -1]) {
        const wx = side > 0 ? x + ACTOR_W * k : x - 1;
        if (solid(wx, y + 4 * k) || solid(wx, y + 10 * k)) {
          wall = side;
          break;
        }
      }
    }
    // The ground's surface in column `fx` near height `fy`: down to it, or (inside it) up out of it.
    const surface = (fx: number, fy: number, depth: number): number => {
      let yy = Math.floor(fy);
      if (solid(fx, yy)) {
        for (let u = 0; u < depth && solid(fx, yy - 1); u++) yy--;
        return yy;
      }
      for (let d = 0; d < depth; d++, yy++) if (solid(fx, yy + 1)) return yy + 1;
      return fy; // (nothing there: stand as on the flat)
    };
    // The lie of the land under it: the slope between the ground ahead and
    // behind (where its outer feet stand). Its body pitches to match (nose
    // up a rise, down a fall); on a wall it rears up the face.
    const foot = y + ACTOR_H * k;
    let slope = 0;
    if (grounded) {
      const span = 9 * k;
      const gl = surface(cx - span, foot, 14 * k);
      const gr = surface(cx + span, foot, 14 * k);
      slope = Math.max(-DROID_MAX_TILT, Math.min(DROID_MAX_TILT, Math.atan2(gr - gl, 2 * span)));
    }
    const want = wall !== 0 ? -wall * DROID_WALL_TILT : slope;
    gait.tilt += (want - gait.tilt) * (gait.init ? Math.min(1, dt * 10) : 1);
    const tilt = gait.tilt;
    // Shorter strides climbing, longer going down (by how steep it is, the way it's heading).
    const uphill = Math.abs(vx) > 2 ? Math.max(-1, Math.min(1, (-Math.sin(slope) * Math.sign(vx)) / Math.sin(DROID_MAX_TILT))) : 0;
    const stride = DROID_STRIDE * k * (1 - 0.4 * uphill);
    // Its legs lift perpendicular to its body (off the slope, off the wall).
    const upX = Math.sin(tilt);
    const upY = -Math.cos(tilt);
    const tx = (leg: number): [number, number] => {
      const rest = DROID_REST[leg] * (left ? -1 : 1) * k;
      if (wall !== 0) {
        // Up and down the wall, the front legs reaching up it.
        const wx = wall > 0 ? x + ACTOR_W * k + 0.5 : x - 0.5;
        const along = DROID_REST[leg] * 0.85 * k;
        return [wx, y + 9 * k - along];
      }
      if (!grounded) return [cx + rest * 0.45, y + (ACTOR_H + 1.5) * k]; // tucked in, dangling
      // Spread along the slope, ahead of where it's going (more the faster), on the ground there.
      const fx = cx + rest * Math.cos(slope) + vx * 0.07;
      return [fx, surface(fx, foot + rest * Math.sin(slope), 16 * k)];
    };
    let stepping = 0;
    for (let leg = 0; leg < 6; leg++) if (gait.t[leg] < 1) stepping++;
    const busy = [0, 0];
    for (let leg = 0; leg < 6; leg++) if (gait.t[leg] < 1) busy[DROID_TRIPOD[leg]]++;
    for (let leg = 0; leg < 6; leg++) {
      const [gx, gy] = tx(leg);
      if (!gait.init || (!grounded && wall === 0)) {
        // First sight of it, or in the air: the feet go straight where they belong.
        const k = gait.init ? Math.min(1, dt * 14) : 1;
        gait.x[leg] += (gx - gait.x[leg]) * k;
        gait.y[leg] += (gy - gait.y[leg]) * k;
        if (!gait.init) {
          gait.x[leg] = gx;
          gait.y[leg] = gy;
        }
        gait.t[leg] = 1;
        continue;
      }
      if (gait.t[leg] < 1) {
        // Mid-step: an arc from where it lifted to the hold ahead.
        gait.t[leg] = Math.min(1, gait.t[leg] + dt / (DROID_STEP_TIME * Math.sqrt(k)));
        const t = gait.t[leg];
        const e = t * t * (3 - 2 * t);
        const lift = Math.sin(Math.PI * t) * 2.2 * k;
        gait.x[leg] = gait.fx[leg] + (gx - gait.fx[leg]) * e + upX * lift;
        gait.y[leg] = gait.fy[leg] + (gy - gait.fy[leg]) * e + upY * lift;
        continue;
      }
      const off = Math.hypot(gait.x[leg] - gx, gait.y[leg] - gy);
      // Way off (it teleported, or fell): just put it there.
      if (off > 14 * k) {
        gait.x[leg] = gx;
        gait.y[leg] = gy;
        continue;
      }
      // Strayed too far from where it belongs: step, if the other tripod's planted.
      const other = 1 - DROID_TRIPOD[leg];
      // (Left far behind, at a sprint, it steps whatever the others are doing.)
      if ((off > stride && busy[other] === 0) || off > stride * 2.2) {
        gait.fx[leg] = gait.x[leg];
        gait.fy[leg] = gait.y[leg];
        gait.t[leg] = 0;
        busy[DROID_TRIPOD[leg]]++;
      }
    }
    gait.init = true;
    // The body dips a touch as it shifts its weight onto the planted legs.
    const target = stepping > 0 ? 0.35 : 0;
    gait.bob += (target - gait.bob) * Math.min(1, dt * 18);
    return { x: gait.x, y: gait.y, bob: gait.bob, tilt };
  }

  private drawDroid(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    left: boolean,
    grounded: boolean,
    parts: number,
    team: number,
    moving: boolean,
    now: number,
    aim = left ? Math.PI : 0,
    id = -1,
    /** Its scale. */
    k = 1,
  ): void {
    // Its feet are planted in the world (see droidFeet).
    const feet = this.droidFeet(id, x, y, left, grounded, now, k);
    const ox = x;
    const oy = y;
    if (k !== 1) {
      // Bigger: the whole droid drawn in its own scaled frame (from its box's top-left).
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, k);
      x = 0;
      y = 0;
    }
    // Droid-local (as facing right, from the hitbox's top-left) to world.
    const X = (dx: number) => (left ? x + ACTOR_W - dx : x + dx);
    const Y = (dy: number) => y + dy;
    const side = left ? -1 : 1;
    const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
    const K = hex(DPAL.K);
    // Legs first (behind the chassis), each a two-bone limb with its foot
    // planted in the world (see droidFeet): a short thigh rising steeply from
    // the hip to a high, sharp knee, and a long shin down to the foot, set
    // wide of the body. Drawn in whole pixels: an outlined drab strut for the
    // thigh, a bare rod for the shin, a rusted bolt at the knee.
    const bob = feet.bob;
    const HIP_Y = 9.6 + bob;
    // The body pitches with the ground (feet.tilt) about the middle of its
    // hip line: the chassis and the hips; the head stays on the gun's pivot
    // (where shots leave), its neck bending to reach it.
    const tilt = feet.tilt;
    const tc = Math.cos(tilt);
    const ts = Math.sin(tilt);
    const pivX = X(4);
    const pivY = Y(HIP_Y);
    const rot = (px: number, py: number): [number, number] => [pivX + (px - pivX) * tc - (py - pivY) * ts, pivY + (px - pivX) * ts + (py - pivY) * tc];
    // The body's up (its knees bend that way).
    const upX = ts;
    const upY = -tc;
    // A pixel strut from (x0, y0) to (x1, y1), `wa` pixels thick tapering to `wb`, in colour `c`.
    const strut = (x0: number, y0: number, x1: number, y1: number, wa: number, wb: number, c: string) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      ctx.fillStyle = c;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const w = Math.max(1, Math.round(wa + (wb - wa) * f));
        ctx.fillRect(Math.round(x0 + (x1 - x0) * f - w / 2), Math.round(y0 + (y1 - y0) * f - w / 2), w, w);
      }
    };
    // The far legs (every other one) first, in shadow; then the near ones.
    for (const leg of [1, 4, 0, 2, 3, 5]) {
      const part = DROID_LEGS[leg];
      const [hx, hy] = rot(X(DROID_HIP_X[leg]), Y(HIP_Y));
      if (!has(parts, part)) {
        // A sparking socket where the leg was, a torn wire hanging.
        ctx.fillStyle = K;
        ctx.fillRect(Math.round(hx) - 1, Math.round(hy), 2, 1);
        ctx.fillStyle = hex(DPAL.R);
        ctx.fillRect(Math.round(hx), Math.round(hy) + 1, 1, 1);
        if ((now / 90 + part) % 4 < 1) {
          ctx.fillStyle = (now / 45) % 2 < 1 ? '#ffd060' : '#fff6c0';
          ctx.fillRect(Math.round(hx) - side, Math.round(hy) + 2, 1, 1);
        }
        continue;
      }
      const fx = x + (feet.x[leg] - ox) / k;
      const fy = y + (feet.y[leg] - oy) / k;
      // Two-bone IK, the knee bent up (away from the ground, or the wall).
      const dx = fx - hx;
      const dy = fy - hy;
      const d = Math.min(Math.hypot(dx, dy), DROID_THIGH + DROID_SHIN - 0.05);
      const a = Math.atan2(dy, dx);
      const cosA = (DROID_THIGH * DROID_THIGH + d * d - DROID_SHIN * DROID_SHIN) / (2 * DROID_THIGH * d || 1);
      const bend = Math.acos(Math.max(-1, Math.min(1, cosA)));
      // (Of the two ways the knee can bend, the higher, off its back: a spider's ^.)
      const k1x = hx + Math.cos(a - bend) * DROID_THIGH;
      const k1y = hy + Math.sin(a - bend) * DROID_THIGH;
      const k2x = hx + Math.cos(a + bend) * DROID_THIGH;
      const k2y = hy + Math.sin(a + bend) * DROID_THIGH;
      const [kx, ky] = (k1x - hx) * upX + (k1y - hy) * upY > (k2x - hx) * upX + (k2y - hy) * upY ? [k1x, k1y] : [k2x, k2y];
      const far = leg === 1 || leg === 4;
      // A dark line under each (its shadow side); the thigh a drab plate two pixels thick, worn
      // bright along its top; the shin a bare rod, to a steel point.
      strut(hx, hy + 1, kx, ky + 1, 2, 2, K);
      strut(kx + 1, ky, fx + 1, fy, 1, 1, K);
      strut(hx, hy, kx, ky, 2, 2, hex(far ? DPAL.d : DPAL.m));
      strut(hx, hy - 1, kx, ky - 1, 1, 1, hex(far ? DPAL.m : DPAL.h));
      strut(kx, ky, fx, fy, 1, 1, hex(far ? DPAL.m : DPAL.l));
      ctx.fillStyle = hex(far ? DPAL.l : DPAL.w);
      ctx.fillRect(Math.round(fx), Math.round(fy) - 1, 1, 1); // (the steel point it stands on)
      // The knee: a rusted bolt through the joint, a glint on it.
      ctx.fillStyle = K;
      ctx.fillRect(Math.round(kx) - 1, Math.round(ky) - 1, 2, 2);
      ctx.fillStyle = hex(far ? DPAL.r : DPAL.R);
      ctx.fillRect(Math.round(kx) - 1, Math.round(ky) - 1, 1, 1);
    }
    // The chassis (the grids in droid-grids.ts), pitched with the ground about its hip line;
    // stripped of its plating, a scorched frame that spits sparks.
    const plated = has(parts, DroidPart.Plating);
    const body = this.dArt.chassis(team, left, plated, tilt);
    ctx.drawImage(body.c, Math.round(pivX) - body.r, Math.round(pivY) - body.r);
    if (!plated && (now / 110) % 5 < 1) {
      const [sx, sy] = rot(X(1 + ((now / 50) % 7)), Y(HIP_Y + 1));
      ctx.fillStyle = (now / 40) % 2 < 1 ? '#ffb040' : '#fff0b0';
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
    // On the move, its exhaust stack coughs: dark puffs rising off the back, thinning as they go.
    if (moving) {
      const [ex, ey] = rot(X(-0.5), Y(6 + bob));
      for (let p = 0; p < 2; p++) {
        const ph = ((now / 85 + p * 4) % 8) / 8;
        ctx.fillStyle = `rgba(34,30,24,${(0.7 * (1 - ph)).toFixed(2)})`;
        const w = ph > 0.5 ? 2 : 1;
        ctx.fillRect(Math.round(ex - side * ph * 3), Math.round(ey - 1 - ph * 6), w, w);
      }
    }
    // The head on its neck: a short pixel post from the chassis's back up to the gun's mount.
    const head = has(parts, DroidPart.Turret);
    const [nx, ny] = rot(X(4), Y(8.4 + bob));
    const topY = head ? Y(4.5) : ny - 1.5;
    strut(nx + side, ny, X(4) + side, topY, 1, 1, K);
    strut(nx, ny, X(4), topY, 1, 1, hex(DPAL.l));
    if (head) {
      // The head turns with the aim (the gun mounted under its chin): its eye flickers now and then.
      const h = this.dArt.head(aim, left, (now / 150) % 6 >= 5);
      ctx.drawImage(h.c, Math.round(X(4)) - h.r, Math.round(Y(4)) - h.r);
    }
    if (k !== 1) ctx.restore();
  }

  /**
   * A clone's wounds, in pixels on its body where it was hit (its hip
   * frame: `posed`): a dark core in a ragged red rim, fresh ones wet and
   * bright for a moment, the big ones a darker gash. A synthetic (the Legion)
   * leaks oil and shows bare circuitry; a droid takes scorched dents, a hot
   * ember in a fresh one.
   */
  private drawWounds(
    ctx: CanvasRenderingContext2D,
    wounds: readonly Wound[],
    posed: (dx: number, dy: number) => number[],
    face: number,
    droid: boolean,
    synthetic: boolean,
    now: number,
  ): void {
    const [core, rim, wet] = droid ? ['#120c08', '#3a2a1e', '#ff9a30'] : synthetic ? ['#0c0e10', '#2a3a44', '#7ad0ff'] : ['#3a0406', '#8c1010', '#e8343a'];
    for (const w of wounds) {
      const [wx, wy] = posed(w.u * face, w.v);
      const x = Math.round(wx);
      const y = Math.round(wy);
      const fresh = now - w.at < 450;
      ctx.fillStyle = rim;
      if (w.r >= 1.2) {
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
      }
      if (w.r >= 2) ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = core;
      ctx.fillRect(x, y, 1, 1);
      if (w.r >= 2) ctx.fillRect(x, y + 1, 1, 1);
      if (fresh) {
        ctx.fillStyle = wet;
        ctx.fillRect(x + (w.u > 0 ? 1 : -1), y - (w.r >= 1.2 ? 1 : 0), 1, 1);
      }
    }
  }

  private drawActor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    aim: number,
    flags: number,
    team: number,
    weapon: number,
    moving: boolean,
    now: number,
    parts: number,
    stance: number = Stance.Stand,
    lean = 0,
    faction = 0,
    kick = 0,
    /** Who it is (a droid's feet are remembered per droid; its wounds are its own). */
    id = -1,
    /** Its health (0..ACTOR_MAX_HP): how many of its wounds show. */
    hp = ACTOR_MAX_HP,
  ): void {
    const left = Math.cos(aim) < 0;
    const face = left ? -1 : 1;
    const ix = Math.round(x);
    const iy = Math.round(y);
    // A spider droid: no clone at all (its chassis, legs and turret are drawn whole; the gun goes on the turret below).
    const droid = classOfFlags(flags) === ClassId.Droid;
    if (droid) {
      this.drawDroid(ctx, x, y, left, (flags & F_GROUND) !== 0, parts, team, moving, now, aim, id);
      lean = 0;
      stance = Stance.Stand;
    }
    // Walk cycle advances with distance travelled, so feet don't skate.
    const frame: BodyFrame = !(flags & F_GROUND) ? 'air' : moving ? WALK_CYCLE[Math.floor(ix / (stance === Stance.Stand ? 3 : 2)) & 3] : 'idle';
    const sprite = droid ? null : this.sprites.body(team, frame, left, parts, classOfFlags(flags), faction);
    // The torso pivots at the hip (leaning with the stance and the ragdoll
    // sway); crouched, the legs fold under it; prone, the whole clone lies down.
    const hipX = ix + HIP_X + 0.5;
    const hipY = iy + HIP_Y + STANCE_DROP[stance];
    const a = lean * face;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    // A point given relative to the hip in the standing pose, posed.
    const posed = (dx: number, dy: number) => [hipX + dx * cos - dy * sin, hipY + dx * sin + dy * cos];
    if (droid) {
      // (Drawn above.)
    } else if (stance === Stance.Prone) {
      ctx.save();
      ctx.translate(hipX, hipY);
      ctx.rotate(a);
      ctx.drawImage(sprite!, -5.5, -11);
      ctx.restore();
    } else {
      const legH = stance === Stance.Crouch ? 3 : 5;
      ctx.drawImage(sprite!, 0, 11, 10, 5, ix - 1, iy + ACTOR_H - legH, 10, legH);
      ctx.save();
      ctx.translate(hipX, hipY);
      ctx.rotate(a);
      ctx.drawImage(sprite!, 0, 0, 10, 11, -5.5, -11, 10, 11);
      ctx.restore();
    }

    // Its wounds, where it was hit (wounds.ts), riding its pose.
    if (id >= 0 && hp < ACTOR_MAX_HP && this.game) this.drawWounds(ctx, this.game.wounds.shown(id, (hp / ACTOR_MAX_HP) * 100), posed, face, droid, !!FACTIONS[faction]?.synthetic, now);

    // A king wears the crown on the head.
    if (!droid && has(parts, Part.Crown)) {
      ctx.save();
      ctx.translate(hipX, hipY);
      ctx.rotate(a);
      this.drawCrown(ctx, frame, left, now);
      ctx.restore();
    }

    // Jetpack exhaust under the pack (pack is on the clone's back).
    if (!droid && flags & F_JET && has(parts, Part.Jetpack)) {
      const [px, py] = posed(left ? 2.5 : -4.5, -1);
      const fx = Math.round(px);
      const fy = Math.round(py) - 9;
      const flick = Math.floor(now / 40) % 3;
      ctx.fillStyle = '#fff6c0';
      ctx.fillRect(fx + 1, fy + 8, 1, 1);
      ctx.fillStyle = '#ffc040';
      ctx.fillRect(fx, fy + 9, 3, 1);
      ctx.fillRect(fx + 1, fy + 10, 1, 2 + flick);
      ctx.fillStyle = '#ff6a20';
      ctx.fillRect(fx + (flick === 1 ? 0 : 2), fy + 10 + flick, 1, 2);
    }

    // Arm + weapon, pre-rotated onto the pixel grid, pivoting at the (posed) shoulder.
    const [psx, psy] = posed(SHOULDER_X - HIP_X - 0.5, SHOULDER_Y - HIP_Y);
    const sx = Math.round(psx);
    const sy = Math.round(psy);
    if (droid ? !has(parts, DroidPart.Turret) : !has(parts, Part.GunArm)) {
      // Arm (and the gun with it) gone: a bloody stump at the shoulder. A
      // droid's turret shot off: a sparking socket.
      if (droid) {
        // (On top of the neck stub, below where the head was.)
        if ((now / 70) % 3 < 1) {
          ctx.fillStyle = '#ffe080';
          ctx.fillRect(sx + Math.round(Math.sin(now / 37) * 1.5), sy + 1, 1, 1);
        }
        return;
      }
      ctx.fillStyle = '#a01818';
      ctx.fillRect(left ? sx - 1 : sx, sy, 2, 2);
      return;
    }
    if (!WEAPONS[weapon]) return; // empty-handed
    if (flags & F_RELOAD) {
      // Reloading: gun tipped down in front, bobbing as the magazine goes in.
      const down = 1.05 + Math.sin(now / 90) * 0.12;
      const g = this.sprites.gun(weapon, left ? Math.PI - down : down);
      ctx.drawImage(g.c, sx - g.r, sy - g.r);
      return;
    }
    if (weapon === WeaponId.RepairKit) {
      // The med case: carried by its handle at the side (it's no gun), its charge pulsing through the vents.
      const gk = this.sprites.gun(weapon, left ? Math.PI : 0);
      const kx = sx + face * 2;
      const ky = sy + 4;
      const pulse = 0.5 + 0.5 * Math.sin(now / 160);
      ctx.fillStyle = `rgba(90,240,200,${0.12 + 0.18 * pulse})`;
      ctx.fillRect(kx - 6, ky - 2, 12, 11);
      ctx.drawImage(gk.c, kx - gk.r, ky - gk.r);
      return;
    }
    if (weapon === WeaponId.Idol) {
      // The idol is held up, upright, shining.
      this.drawIdolGlow(ctx, sx + face * 4, sy - 2, now);
      const gi = this.sprites.gun(weapon, left ? Math.PI : 0);
      ctx.drawImage(gi.c, sx - gi.r, sy - gi.r);
      return;
    }
    // Recoil: the gun jumps back along the barrel (and the muzzle up a touch) as it fires.
    const back = kick * 3;
    const lift = kick * 0.18 * (left ? 1 : -1);
    const g = this.sprites.gun(weapon, aim + lift);
    ctx.drawImage(g.c, Math.round(sx - g.r - Math.cos(aim) * back), Math.round(sy - g.r - Math.sin(aim) * back));
    if (flags & F_FIRING && WEAPONS[weapon]?.proj !== PROJ_BUILD) {
      // Flash at the weapon's muzzle offset (where the server spawns its shots).
      const m = (WEAPONS[weapon]?.muzzle ?? 8) + 1;
      const mx = Math.round(sx + Math.cos(aim) * m);
      const my = Math.round(sy + Math.sin(aim) * m);
      if (weapon === WeaponId.Digger) {
        ctx.fillStyle = 'rgba(255,230,120,0.45)';
        ctx.fillRect(mx - 2, my - 2, 5, 5);
        ctx.fillStyle = 'rgba(255,250,210,0.8)';
        ctx.fillRect(mx - 1, my - 1, 3, 3);
      } else if (Math.floor(now / 33) % 2 === 0) {
        ctx.fillStyle = '#ffd040';
        ctx.fillRect(mx - 1, my, 3, 1);
        ctx.fillRect(mx, my - 1, 1, 3);
        ctx.fillStyle = '#fffbe0';
        ctx.fillRect(mx, my, 1, 1);
      }
    }
  }

  /**
   * The firing flag as the muzzle flash reads it: only a shot actually gone
   * out (a round or a beam), never just the trigger down (a gun cycling, a
   * gatling spinning up, a laser charging: its glow shows that). The digger
   * sprays as long as it's held.
   */
  private fireFlags(game: Game, flags: number, weapon: number, id: number, now: number): number {
    if (weapon === WeaponId.Digger) return flags;
    return (flags & ~F_FIRING) | (game.shotFlash(id, now) ? F_FIRING : 0);
  }

  /**
   * Ragdoll-ish torso sway, per clone, purely cosmetic: a damped spring on
   * the lean, pulled toward the stance's lean, tipped into the run, thrown
   * around in the air (and flat into a jetpack dash), jolted on landing.
   * Everything it reads is already replicated (stance, velocity, flags), so
   * every client poses everyone the same way with no extra traffic.
   */
  private pose(id: number, stance: number, left: boolean, vx: number, vy: number, ground: boolean, jet: boolean, now: number): number {
    let p = this.poses.get(id);
    if (!p) this.poses.set(id, (p = { lean: STANCE_LEAN[stance], vel: 0, at: now, air: !ground, vy }));
    const dt = Math.min(0.05, Math.max(0, (now - p.at) / 1000));
    p.at = now;
    const face = left ? -1 : 1;
    let target = STANCE_LEAN[stance] + Math.max(-0.2, Math.min(0.2, ((vx * face) / ACTOR_RUN_SPEED) * 0.14));
    if (!ground) {
      target += Math.max(-0.35, Math.min(0.35, -vy / 900)) + Math.sin(now / 70 + id) * 0.08 * Math.min(1, Math.abs(vy) / 250);
      if (jet && stance === Stance.Crouch && Math.abs(vx) > 60) target = 1.05; // flat into the dash
    }
    if (ground && p.air && p.vy > 160) p.vel += Math.min(9, p.vy / 45); // landing jolt
    p.air = !ground;
    p.vy = vy;
    const acc = 140 * (target - p.lean) - 13 * p.vel;
    p.vel += acc * dt;
    p.lean += p.vel * dt;
    p.lean = Math.max(-0.6, Math.min(1.6, p.lean));
    return p.lean;
  }
  private readonly poses = new Map<number, { lean: number; vel: number; at: number; air: boolean; vy: number }>();
  private readonly shPt = { x: 0, y: 0 };

  /**
   * Materializer preview: the build grid around the cursor, the reach ring,
   * and the selected piece as a ghost, green where the server will accept it
   * (same canBuild) and red with the reason where it won't.
   */
  private drawBuildGhost(ctx: CanvasRenderingContext2D, game: Game, input: InputState, wx: number, wy: number, selfX: number, selfY: number, z: number): void {
    const code = pieceCode(input.piece, input.orient);
    const piece = pieceOf(code);
    if (!piece || this.overMenu(input.mouseX, input.mouseY)) return;
    const g = snapPiece(piece, wx, wy, this.snap);
    const res = game.canBuildHere(code, g.x, g.y);
    const ok = res === BuildResult.Ok;
    // Grid, fading out from the cursor.
    const R = 40;
    const gx0 = Math.floor((wx - R) / BUILD_GRID) * BUILD_GRID;
    const gy0 = Math.floor((wy - R) / BUILD_GRID) * BUILD_GRID;
    const lw = 1 / z;
    ctx.fillStyle = 'rgba(140,232,255,0.16)';
    for (let x = gx0; x <= wx + R; x += BUILD_GRID) ctx.fillRect(x, wy - R, lw, 2 * R);
    for (let y = gy0; y <= wy + R; y += BUILD_GRID) ctx.fillRect(wx - R, y, 2 * R, lw);
    // Reach ring.
    ctx.strokeStyle = 'rgba(140,232,255,0.25)';
    ctx.lineWidth = lw;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(selfX + SHOULDER_X, selfY + SHOULDER_Y, BUILD_REACH, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // The piece itself.
    ctx.fillStyle = ok ? 'rgba(120,255,160,0.45)' : 'rgba(255,90,80,0.4)';
    for (let y = 0; y < piece.h; y++) {
      for (let x = 0; x < piece.w; x++) if (piece.cells[y * piece.w + x]) ctx.fillRect(g.x + x, g.y + y, 1, 1);
    }
    ctx.strokeStyle = ok ? 'rgba(160,255,190,0.9)' : 'rgba(255,120,110,0.9)';
    ctx.strokeRect(g.x, g.y, piece.w, piece.h);
    if (!ok) {
      ctx.fillStyle = '#ffb0a8';
      ctx.font = `${Math.max(4, Math.round(12 / z))}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(BUILD_RESULT_TEXT[res], g.x + piece.w / 2, g.y - 2);
      ctx.textAlign = 'left';
    }
  }

  private readonly snap = { x: 0, y: 0 };
  /** Screen rects (device px) of the build menu entries, for clicks. */
  private readonly menuRects: { x: number; y: number; w: number; h: number; i: number }[] = [];
  private readonly pieceIcons: HTMLCanvasElement[] = [];

  /** Build menu entry under a CSS-pixel point, or -1. */
  /** Radio call menu entry (CallKind) under a CSS-pixel point, or -1. */
  callMenuHit(cssX: number, cssY: number): number {
    const dpr = this.canvas.width / innerWidth;
    const x = cssX * dpr;
    const y = cssY * dpr;
    for (const r of this.callRects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.i;
    return -1;
  }
  private readonly callRects: { x: number; y: number; w: number; h: number; i: number }[] = [];

  /**
   * Our drones, when we've any: a strip along the bottom-right listing the
   * clone and each drone in the order P steps through them, the one we're
   * driving lit, and the key (or button) to step on.
   */
  private drawRemotes(game: Game, input: InputState, s: number, W: number, H: number): void {
    const list = game.remotes();
    if (!list.length || !game.alive) return;
    const ctx = this.ctx;
    const at = game.remoteIndex();
    const names = ['YOU', ...list.map((r) => r.name)];
    ctx.font = `bold ${Math.round(11 * s)}px ui-monospace, monospace`;
    const pad = 8 * s;
    const gap = 6 * s;
    const lead = input.touch ? 'DRONE ▸' : 'P ▸';
    const widths = names.map((n) => ctx.measureText(n).width + pad * 2);
    const total = ctx.measureText(lead).width + gap + widths.reduce((a, b) => a + b + gap, 0);
    let x = W - total - 14 * s;
    const y = H - (input.touch ? 190 : 96) * s;
    const h = 20 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 6 * s, y - 4 * s, total + 12 * s, h + 8 * s);
    ctx.fillStyle = '#9fe870';
    ctx.textAlign = 'left';
    ctx.fillText(lead, x, y + h * 0.7);
    x += ctx.measureText(lead).width + gap;
    names.forEach((n, i) => {
      const on = i - 1 === at;
      ctx.fillStyle = on ? 'rgba(160,232,112,0.85)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, widths[i], h);
      ctx.fillStyle = on ? '#0c1408' : '#d8e0e8';
      ctx.fillText(n, x + pad, y + h * 0.7);
      x += widths[i] + gap;
    });
  }

  /** The radio's menu: call in a dropship or a tank, for GEMMs. */
  private drawCallMenu(game: Game, input: InputState, s: number, H: number): void {
    const ctx = this.ctx;
    const rowH = 46 * s;
    const w = 340 * s;
    const x0 = 14 * s;
    const entries = game.radioEntries();
    const sel = Math.max(0, Math.min(entries.length - 1, game.radioSel));
    const y0 = Math.max(250 * s, H / 2 - (entries.length * rowH) / 2);
    this.callRects.length = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x0 - 4 * s, y0 - 24 * s, w + 8 * s, entries.length * rowH + 28 * s);
    ctx.textAlign = 'left';
    ctx.font = `bold ${Math.round(12 * s)}px ui-monospace, monospace`;
    ctx.fillStyle = '#9fe870';
    ctx.fillText(input.touch ? 'RADIO  aim to choose · fire or tap to call' : 'RADIO  aim or wheel to choose · click to call', x0, y0 - 8 * s);
    entries.forEach((e, i) => {
      const cost = e.cost;
      const afford = e.free || game.gold >= cost;
      const y = y0 + i * rowH;
      const on = i === sel;
      ctx.fillStyle = on ? (afford ? 'rgba(160,232,112,0.34)' : 'rgba(255,112,96,0.18)') : afford ? 'rgba(160,232,112,0.14)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(x0, y + 2 * s, w, rowH - 4 * s);
      ctx.strokeStyle = on ? '#fff' : afford ? '#9fe870' : '#555';
      ctx.lineWidth = on ? 2 * s : s;
      ctx.strokeRect(x0, y + 2 * s, w, rowH - 4 * s);
      if (on) {
        // The selector: a pointer at the row's left edge.
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(x0 - 3 * s, y + rowH / 2 - 6 * s);
        ctx.lineTo(x0 + 5 * s, y + rowH / 2);
        ctx.lineTo(x0 - 3 * s, y + rowH / 2 + 6 * s);
        ctx.fill();
      }
      ctx.font = `bold ${Math.round(14 * s)}px ui-monospace, monospace`;
      ctx.fillStyle = '#fff';
      ctx.fillText(e.name, x0 + 8 * s, y + 20 * s);
      ctx.fillStyle = afford ? '#ffd34a' : '#ff7060';
      ctx.textAlign = 'right';
      ctx.fillText(e.free ? 'remote' : `${cost} GEMMs`, x0 + w - 8 * s, y + 20 * s);
      ctx.textAlign = 'left';
      ctx.font = `${Math.round(11 * s)}px ui-monospace, monospace`;
      ctx.fillStyle = '#c8d0d8';
      ctx.fillText(e.blurb, x0 + 8 * s, y + 36 * s);
      this.callRects.push({ x: x0, y, w, h: rowH, i: e.kind });
    });
  }

  /**
   * A dropship: four engine pods on struts over a gunship hull (in its
   * caller's team colours), nozzles glowing with each engine's throttle,
   * a turret swivelling at either end and the bomb-bay doors swinging open
   * in its belly; all tilted with the hull. Lost parts are simply gone.
   */
  private drawShip(ctx: CanvasRenderingContext2D, sh: ShipView, game: Game, now: number): void {
    const sp = this.sprites;
    const team = (sh.team !== 255 ? TEAM_COLORS[sh.team]?.rgb : undefined) ?? game.players.get(sh.owner)?.rgb ?? 0x8090a0;
    const x = Math.round(sh.x);
    const y = Math.round(sh.y);
    ctx.save();
    ctx.translate(sh.x + SHIP_W / 2, sh.y + SHIP_H / 2);
    ctx.rotate(sh.a);
    ctx.translate(-(x + SHIP_W / 2), -(y + SHIP_H / 2));
    ctx.drawImage(sp.shipHull(team), x, y);
    for (let e = 0; e < 4; e++) {
      if (!hasShipPart(sh.parts, ShipPart.EngineA + e)) continue;
      const ex = x + ENGINE_X[e] - 5;
      // The rocket flame under the bell: longer with the throttle, flickering; white-hot core.
      const t = sh.thrust[e] * (0.75 + 0.25 * Math.sin(now / 29 + e * 1.7));
      const len = 1 + Math.round(t * 5);
      const ny = y + ENGINE_NOZZLE_Y;
      ctx.fillStyle = '#ff8a24';
      ctx.fillRect(ex + 2, ny, 6, Math.max(1, len - 2));
      ctx.fillRect(ex + 3, ny, 4, len);
      ctx.fillStyle = '#ffd860';
      ctx.fillRect(ex + 3, ny, 4, Math.max(1, len - 2));
      ctx.fillStyle = '#fffbe0';
      ctx.fillRect(ex + 4, ny, 2, Math.max(1, len - 3));
      ctx.drawImage(sp.shipEngine(), ex, y);
    }
    // Bomb bay: closed doors are a seam; open, two flaps hang down.
    if (hasShipPart(sh.parts, ShipPart.Doors)) {
      ctx.fillStyle = '#20262c';
      if (sh.doors) {
        ctx.fillRect(x + BAY_AT[0] - 5, y + BAY_AT[1] - 1, 10, 2);
        ctx.fillStyle = '#4a5560';
        ctx.fillRect(x + BAY_AT[0] - 6, y + BAY_AT[1], 2, 4);
        ctx.fillRect(x + BAY_AT[0] + 4, y + BAY_AT[1], 2, 4);
      } else ctx.fillRect(x + BAY_AT[0], y + BAY_AT[1] - 2, 1, 2);
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(x + BAY_AT[0] - 5, y + BAY_AT[1] - 2, 10, 3); // a torn hole
    }
    // Turrets: a ball mount and twin barrels on the aim (relative to the tilted hull).
    for (const side of [0, 1]) {
      if (!hasShipPart(sh.parts, ShipPart.TurretL + side)) continue;
      const [tx, ty] = TURRET_AT[side];
      const g = sp.tankGun(true, sh.aim[side] - sh.a);
      ctx.drawImage(g.c, Math.round(x + tx - g.r), Math.round(y + ty - g.r));
      ctx.fillStyle = '#2e363e';
      ctx.fillRect(x + tx - 3, y + ty - 3, 6, 6);
      ctx.fillStyle = '#9aa8b4';
      ctx.fillRect(x + tx - 2, y + ty - 2, 3, 2);
      if (sh.fired[side] && (now / 45) % 2 < 1) {
        const a = sh.aim[side] - sh.a;
        ctx.fillStyle = '#fff4b0';
        ctx.fillRect(Math.round(x + tx + Math.cos(a) * 11) - 1, Math.round(y + ty + Math.sin(a) * 11) - 1, 3, 3);
      }
    }
    ctx.restore();
  }

  /** What a click on the build menu hit: a piece (its index), MENU_ROTATE, MENU_MIRROR, or -1 (nothing). */
  menuHit(cssX: number, cssY: number): number {
    const dpr = this.canvas.width / innerWidth;
    const x = cssX * dpr;
    const y = cssY * dpr;
    for (const r of this.menuRects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.i;
    return -1;
  }

  private overMenu(cssX: number, cssY: number): boolean {
    if (this.menuRects.length === 0) return false;
    const dpr = this.canvas.width / innerWidth;
    const first = this.menuRects[0];
    const last = this.menuRects[this.menuRects.length - 1];
    return cssX * dpr >= first.x && cssX * dpr < first.x + first.w + 4 && cssY * dpr >= first.y && cssY * dpr < last.y + last.h;
  }

  /** A piece (a build code: which, turned how) drawn in its materials, one pixel per cell (scaled up in the menu). */
  private pieceIcon(code: number): HTMLCanvasElement {
    let c = this.pieceIcons[code];
    if (c) return c;
    const p = pieceOf(code)!;
    c = this.pieceIcons[code] = document.createElement('canvas');
    c.width = p.w;
    c.height = p.h;
    const ctx = c.getContext('2d')!;
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const m = p.cells[y * p.w + x];
        if (!m) continue;
        const [r, g, b] = MAT_COLOR[m];
        const seam = m === Mat.Concrete && (x === 0 || y === 0) ? 1.15 : m === Mat.Concrete && (x === p.w - 1 || y === p.h - 1) ? 0.7 : 1;
        ctx.fillStyle = `rgb(${Math.round(r * seam)},${Math.round(g * seam)},${Math.round(b * seam)})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  /** Driving: the tank's parts (blown off ones crossed out), the cannon's load, and the controls. */
  private drawTankHud(game: Game, input: InputState, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    const st = game.myTankState!;
    const x0 = W / 2 - 230 * s;
    const y0 = H - 92 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x0, y0, 460 * s, 44 * s);
    ctx.font = `bold ${Math.round(12 * s)}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    const names = game.drive && isMole(game.drive) ? ['HULL', 'PLASMA', 'SMG', 'FRILL', 'HATCH'] : ['HULL', 'CANNON', 'SMG', 'ARMOUR', 'SHIELD'];
    for (let part = 0; part < TANK_PARTS; part++) {
      const x = x0 + 8 * s + part * 90 * s;
      const on = hasTankPart(st.parts, part);
      const f = Math.max(0, Math.min(1, st.partHp[part] / TANK_PART_HP[part]));
      ctx.fillStyle = on ? '#e8e0c8' : '#a05040';
      ctx.fillText(on ? names[part] : `${names[part]} LOST`, x, y0 + 16 * s);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, y0 + 22 * s, 80 * s, 6 * s);
      ctx.fillStyle = !on ? '#553' : f > 0.5 ? '#8fd060' : f > 0.25 ? '#e0c040' : '#e05040';
      ctx.fillRect(x, y0 + 22 * s, 80 * s * f, 6 * s);
    }
    // Cannon load.
    if (hasTankPart(st.parts, TankPart.Cannon)) {
      const load = 1 - Math.min(1, st.cannonCd / (CANNON_INTERVAL * TICK_RATE));
      ctx.fillStyle = load >= 1 ? '#ffd34a' : 'rgba(255,211,74,0.5)';
      ctx.fillRect(x0 + 8 * s + 90 * s, y0 + 32 * s, 80 * s * load, 3 * s);
    }
    ctx.font = `${Math.round(11 * s)}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.textAlign = 'center';
    const help = input.touch ? 'tap: SMG   ◎ cannon   ▲ jets   ⬆ climb out' : 'LMB/RShift: SMG   RMB/LShift: cannon   W: jets   3/F: climb out';
    ctx.fillText(help, W / 2, y0 - 6 * s);
    ctx.textAlign = 'left';
  }

  /** The materializer's menu: every piece with its icon and gold cost; click or wheel to pick. */
  private drawBuildMenu(game: Game, input: InputState, s: number, H: number): void {
    const ctx = this.ctx;
    const rowH = 40 * s;
    const w = 170 * s;
    const x0 = 14 * s;
    const tools = 30 * s; // (the turn and mirror buttons under the list)
    const y0 = Math.max(250 * s, H / 2 - (PIECES.length * rowH + tools) / 2);
    this.menuRects.length = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x0 - 4 * s, y0 - 24 * s, w + 8 * s, PIECES.length * rowH + tools + 28 * s);
    ctx.fillStyle = '#8ae8ff';
    ctx.textAlign = 'left';
    ctx.font = `bold ${Math.round(12 * s)}px ui-monospace, monospace`;
    ctx.fillText('MATERIALIZER  (wheel)', x0, y0 - 8 * s);
    ctx.font = `${Math.round(13 * s)}px ui-monospace, monospace`;
    for (let i = 0; i < PIECES.length; i++) {
      const p = PIECES[i];
      const y = y0 + i * rowH;
      const sel = i === input.piece;
      ctx.fillStyle = sel ? 'rgba(140,232,255,0.3)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(x0, y + 2 * s, w, rowH - 4 * s);
      if (sel) {
        ctx.strokeStyle = '#8ae8ff';
        ctx.lineWidth = s;
        ctx.strokeRect(x0, y + 2 * s, w, rowH - 4 * s);
      }
      const icon = this.pieceIcon(sel ? pieceCode(i, input.orient) : i);
      const k = Math.min((32 * s) / icon.width, (32 * s) / icon.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(icon, x0 + 4 * s + (32 * s - icon.width * k) / 2, y + 4 * s + (32 * s - icon.height * k) / 2, icon.width * k, icon.height * k);
      ctx.fillStyle = '#fff';
      ctx.fillText(p.name, x0 + 44 * s, y + 18 * s);
      ctx.fillStyle = game.gold >= p.cost ? '#ffd34a' : '#ff7060';
      ctx.fillText(`${p.cost} GEMMs`, x0 + 44 * s, y + 33 * s);
      this.menuRects.push({ x: x0, y, w, h: rowH, i });
    }
    // Turn (R) and mirror (X): buttons too, for touch.
    const ty = y0 + PIECES.length * rowH + 2 * s;
    const bw = (w - 4 * s) / 2;
    for (const [k, label, id] of [
      [0, input.touch ? '⟳ TURN' : '⟳ TURN  R', MENU_ROTATE],
      [1, input.touch ? '⇋ MIRROR' : '⇋ MIRROR  X', MENU_MIRROR],
    ] as const) {
      const bx = x0 + k * (bw + 4 * s);
      ctx.fillStyle = 'rgba(140,232,255,0.14)';
      ctx.fillRect(bx, ty, bw, tools - 6 * s);
      ctx.fillStyle = '#8ae8ff';
      ctx.font = `bold ${Math.round(11 * s)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(label, bx + bw / 2, ty + 16 * s);
      ctx.textAlign = 'left';
      this.menuRects.push({ x: bx, y: ty, w: bw, h: tools - 6 * s, i: id });
    }
  }

  /**
   * Line of fire down the scope (see `sight`): a faint laser to the wall or
   * clone that would take the shot, and brackets on that clone: red on an
   * enemy (solid, with a lock mark, once the scope has locked onto them),
   * grey on a teammate.
   */
  private drawSightLine(ctx: CanvasRenderingContext2D, game: Game, now: number): void {
    const s = this.sight!;
    if (s.cone > 0) {
      // The lock cone's edges, faint and dashed: anyone between them can be locked onto.
      ctx.strokeStyle = 'rgba(255,120,90,0.18)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      for (const side of [-1, 1]) {
        const a = s.mouseAim + side * s.cone;
        const len = sightLine(game.terrain, s.x, s.y, a, 420);
        ctx.moveTo(s.x + Math.cos(a) * 10, s.y + Math.sin(a) * 10);
        ctx.lineTo(s.x + Math.cos(a) * len, s.y + Math.sin(a) * len);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const def = WEAPONS[game.weapon];
    const fall = def && def.proj >= 0 && def.proj < PROJ.length ? PROJ[def.proj].gravity : 0;
    if (def && fall >= 0.3 && def.speed > 0) {
      this.drawArc(ctx, game, s.x, s.y, s.aim, def.speed, GRAVITY * fall, def.muzzle);
      return;
    }
    const lof = lineOfFire(game, s.x, s.y, s.aim, 2000);
    const ex = s.x + Math.cos(s.aim) * lof.dist;
    const ey = s.y + Math.sin(s.aim) * lof.dist;
    const hit = lof.hit;
    // Snapped by the assist onto something: a lock too (the assist's mark is the locked point).
    const mark = this.assistSight ? game.aimMark : null;
    const locked = !!hit && (game.scopeLock?.id === hit.id || (!!mark && lof.foe));
    // (A dropship part, which the line test doesn't know: the laser runs to the mark on it.)
    const toMark = !!mark && !hit && Math.hypot(mark.x - s.x, mark.y - s.y) <= lof.dist + 4;
    const lx1 = toMark ? mark!.x : ex;
    const ly1 = toMark ? mark!.y : ey;
    const hot = lof.foe || toMark;
    ctx.strokeStyle = hot ? 'rgba(255,70,50,0.55)' : 'rgba(255,90,70,0.22)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(s.x + Math.cos(s.aim) * 8, s.y + Math.sin(s.aim) * 8);
    ctx.lineTo(lx1, ly1);
    ctx.stroke();
    ctx.fillStyle = hot ? '#ff4030' : '#ffb0a0';
    ctx.fillRect(Math.round(lx1) - 1, Math.round(ly1) - 1, 2, 2);
    if (toMark) {
      ctx.font = '5px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOCK', mark!.x, mark!.y - 8);
      ctx.textAlign = 'left';
    }
    if (!hit) return;
    const p = locked ? 0 : 1 + Math.round(Math.sin(now / 90));
    const x0 = Math.round(hit.x) - 2 - p;
    const y0 = Math.round(hit.y) - 2 - p;
    const x1 = Math.round(hit.x) + ACTOR_W + 1 + p;
    const y1 = Math.round(hit.y) + ACTOR_H + 1 + p;
    ctx.fillStyle = lof.foe ? '#ff4030' : '#c0c8d0';
    const arm = locked ? 4 : 3;
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.fillRect(Math.min(cx, cx + sx * arm), cy, arm, 1);
      ctx.fillRect(cx, Math.min(cy, cy + sy * arm), 1, arm);
    }
    if (locked && (game.scopeLock || mark)) {
      // The locked point, and a tag.
      const lx = Math.round(mark ? mark.x : hit.x + game.scopeLock!.lx);
      const ly = Math.round(mark ? mark.y : hit.y + game.scopeLock!.ly);
      ctx.fillRect(lx - 2, ly, 5, 1);
      ctx.fillRect(lx, ly - 2, 1, 5);
      ctx.font = '5px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOCK', hit.x + ACTOR_W / 2, y0 - 2);
      ctx.textAlign = 'left';
    }
  }

  /**
   * A lobbed weapon's sight: the arc its shot will fly (stepped as the game
   * steps it), dotted, out to where it lands, and the mark it's aimed at.
   */
  private drawArc(ctx: CanvasRenderingContext2D, game: Game, ox: number, oy: number, aim: number, speed: number, g: number, muzzle: number): void {
    const mark = this.assistSight || game.scopeLock ? game.aimMark : null;
    const dt = 1 / 30;
    let x = ox + Math.cos(aim) * muzzle;
    let y = oy + Math.sin(aim) * muzzle;
    let vx = Math.cos(aim) * speed;
    let vy = Math.sin(aim) * speed;
    const hot = !!mark;
    ctx.fillStyle = hot ? 'rgba(255,70,50,0.75)' : 'rgba(255,140,110,0.4)';
    let near = Infinity;
    let end = false;
    for (let i = 0; i < 90 && !end; i++) {
      vy += g * dt;
      // Dots every couple of cells along the step, stopping at the ground.
      const n = Math.max(1, Math.ceil((Math.hypot(vx, vy) * dt) / 3));
      for (let j = 0; j < n; j++) {
        x += (vx * dt) / n;
        y += (vy * dt) / n;
        if (game.terrain.isSolid(Math.floor(x), Math.floor(y))) {
          end = true;
          break;
        }
        if ((i * n + j) % 2 === 0) ctx.fillRect(x - 0.4, y - 0.4, 0.8, 0.8);
        if (mark) {
          const d = Math.hypot(x - mark.x, y - mark.y);
          if (d > near + 6) end = true; // past the target: that's the arc that matters
          near = Math.min(near, d);
        }
      }
    }
    ctx.fillStyle = hot ? '#ff4030' : '#ffb0a0';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    if (mark) {
      const lx = Math.round(mark.x);
      const ly = Math.round(mark.y);
      ctx.fillRect(lx - 2, ly, 5, 1);
      ctx.fillRect(lx, ly - 2, 1, 5);
      ctx.font = '5px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(game.aimReach ? 'LOCK' : 'OUT OF RANGE', mark.x, mark.y - 8);
      ctx.textAlign = 'left';
    }
  }

  /** A laser gathering its charge at the muzzle: a flickering magenta-white ball, bigger the fuller it is. */
  private drawLaserCharge(ctx: CanvasRenderingContext2D, x: number, y: number, f: number, now: number): void {
    const r = 1 + f * 3.5 + Math.sin(now / 45) * 0.4;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, `rgba(255,110,200,${0.45 + f * 0.4})`);
    g.addColorStop(1, 'rgba(255,40,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
  }

  /** A soft golden halo around the idol, pulsing, so it can be spotted in the dark of the labyrinth. */
  private drawIdolGlow(ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void {
    const p = 0.5 + 0.5 * Math.sin(now / 260);
    const g = ctx.createRadialGradient(x, y, 1, x, y, 16 + p * 4);
    g.addColorStop(0, `rgba(255,220,110,${0.45 + 0.2 * p})`);
    g.addColorStop(1, 'rgba(255,200,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 22, y - 22, 44, 44);
  }

  /**
   * The labyrinth's booby traps in view: spikes bristling in their pits,
   * stone dart throwers set into the walls (a carved face, its mouth the
   * barrel), and brass pressure plates in the floor (gone once they've fired).
   */
  private drawTraps(ctx: CanvasRenderingContext2D, game: Game, x0: number, y0: number, x1: number, y1: number): void {
    const d = game.dungeon!;
    for (const t of d.traps) {
      if (t.x < x0 - 20 || t.x > x1 + 20 || t.y < y0 - 20 || t.y > y1 + 20) continue;
      if (t.kind === TrapKind.Spikes) {
        const bottom = t.y + SPIKE_DEPTH;
        for (let x = t.x + 1; x < t.x + t.w - 1; x += 3) {
          ctx.fillStyle = '#8a9096';
          ctx.fillRect(x, bottom - 3, 2, 3);
          ctx.fillStyle = '#c8ced4';
          ctx.fillRect(x, bottom - 4, 1, 1);
          ctx.fillStyle = '#7a1c14';
          ctx.fillRect(x + 1, bottom - 4, 1, 1);
        }
      } else if (t.kind === TrapKind.Darts) {
        // Built into the wall the dart comes out of.
        const wx = t.dir > 0 ? t.x - 1 : t.x - 4;
        ctx.fillStyle = '#6e6250';
        ctx.fillRect(wx, t.y - 5, 5, 10);
        ctx.fillStyle = '#9a8a6a';
        ctx.fillRect(wx, t.y - 5, 5, 1);
        ctx.fillStyle = '#40e0d0';
        ctx.fillRect(wx + 1, t.y - 3, 1, 1);
        ctx.fillRect(wx + 3, t.y - 3, 1, 1);
        ctx.fillStyle = '#120e0a';
        ctx.fillRect(t.dir > 0 ? t.x + 1 : t.x - 2, t.y - 1, 2, 2);
      } else if (!game.trapGone(t.id)) {
        ctx.fillStyle = '#5a4a2a';
        ctx.fillRect(t.x - t.w / 2, t.y - 1, t.w, 1);
        ctx.fillStyle = '#b89a50';
        ctx.fillRect(t.x - t.w / 2 + 1, t.y - 1, t.w - 2, 1);
      }
    }
  }

  /** The extraction rocket: flames while it flies, its hatch open and a beacon over it once it's down. */
  private drawEvac(ctx: CanvasRenderingContext2D, e: { state: number; x: number; y: number }, now: number): void {
    const landed = e.state === Evac.Landed;
    const x = Math.round(e.x - EVAC_W / 2);
    const y = Math.round(e.y);
    if (!landed) {
      const len = 10 + ((now / 40) % 3) * 3;
      ctx.fillStyle = '#ff8a24';
      ctx.fillRect(x + 5, y + EVAC_H, 8, len);
      ctx.fillStyle = '#ffd860';
      ctx.fillRect(x + 6, y + EVAC_H, 6, len - 3);
      ctx.fillStyle = '#fffbe0';
      ctx.fillRect(x + 7, y + EVAC_H, 4, len - 6);
    }
    ctx.drawImage(this.sprites.evac(landed), x, y);
    if ((now / 300) % 2 < 1) {
      ctx.fillStyle = 'rgba(255,60,40,0.5)';
      ctx.fillRect(x + 6, y - 3, 6, 4);
    }
    if (landed) {
      // Light spilling from the hatch, and a bouncing marker over the nose.
      ctx.fillStyle = 'rgba(255,230,150,0.22)';
      ctx.fillRect(x - 6, y + 22, EVAC_W + 12, EVAC_H - 22);
      const bob = Math.round(Math.sin(now / 180) * 2);
      ctx.fillStyle = '#ffd34a';
      ctx.font = '6px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EXTRACTION', e.x, y - 12 + bob);
      ctx.fillRect(e.x - 2, y - 9 + bob, 5, 1);
      ctx.fillRect(e.x - 1, y - 8 + bob, 3, 1);
      ctx.fillRect(e.x, y - 7 + bob, 1, 1);
      ctx.textAlign = 'left';
    }
  }

  /**
   * A king's crown, worn on the head: drawn in the torso's posed frame (hip
   * at the origin, the sprite's top-left at (-5.5, -11)) so it leans, ducks
   * and lies down with the head. A jewel glints now and then.
   */
  private drawCrown(ctx: CanvasRenderingContext2D, frame: BodyFrame, left: boolean, now: number): void {
    const top = this.sprites.headTop(frame);
    const x0 = -5.5 + (left ? 2 : 3);
    const y0 = -11 + top - 2;
    const col: Record<string, string> = { Y: '#ffd34a', y: '#a8801e', r: '#d03020' };
    for (let r = 0; r < CROWN.length; r++) {
      for (let c = 0; c < CROWN[r].length; c++) {
        const ch = CROWN[r][left ? CROWN[r].length - 1 - c : c];
        if (ch === '.') continue;
        ctx.fillStyle = col[ch];
        ctx.fillRect(x0 + c, y0 + r, 1, 1);
      }
    }
    if ((now / 400) % 4 < 0.5) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(x0 + (left ? 0 : 4), y0, 1, 1);
    }
  }

  /**
   * A tank, after Metal Slug's SV-001, in pixel-art layers from the sprite
   * cache: the cannon (its root hidden behind the dome, kicking back after a
   * shot), the hull, the tracks (links crawl and wheels turn as it rolls),
   * the armour plate and the vulcan, while each is still attached. Its
   * driver's head pokes out of the hatch in their colour; a parachute holds
   * it while it comes down; scorch marks spread as the hull weakens.
   */
  private drawTank(ctx: CanvasRenderingContext2D, t: TankView, faceLeft: boolean, aim: number, game: Game, now: number): void {
    const sp = this.sprites;
    const k = t.s ?? 1;
    const dog = isDog(t);
    // A watchdog is a tank drawn at its scale, in its own frame (from its top-left).
    const x = dog ? 0 : Math.round(t.x);
    const ty = dog ? 0 : Math.round(t.y);
    const y = ty - TANK_SPRITE_TOP;
    // Tank-local x (as drawn facing right) to world, mirrored when facing left.
    const wx = (lx: number, w = 0) => (faceLeft ? x + TANK_W - lx - w : x + lx);
    // Everything below is drawn in the hull's own frame, tilted with the
    // treads about the middle of the tread line (sunk so both ends touch).
    ctx.save();
    ctx.translate(t.x + tankW(t) / 2, t.y + tankH(t) + tankSink(t.a, k));
    ctx.rotate(t.a);
    if (dog) ctx.scale(k, k);
    ctx.translate(-(x + TANK_W / 2), -(ty + TANK_H));
    if (t.chute) ctx.drawImage(sp.tankChute(), x - 8, ty - 34);
    const shield = hasTankPart(t.parts, TankPart.Shield);
    if (t.pilot !== 255 && !shield && !dog) {
      // Shield blown off: the driver's head and shoulders, out in the open.
      const rgb = game.players.get(t.pilot)?.rgb ?? 0x7a8a50;
      ctx.fillStyle = '#141012';
      ctx.fillRect(wx(11, 6), y - 5, 6, 5);
      ctx.fillStyle = `#${rgb.toString(16).padStart(6, '0')}`;
      ctx.fillRect(wx(12, 4), y - 4, 4, 2);
      ctx.fillStyle = '#e0b48c';
      ctx.fillRect(wx(12, 4), y - 2, 4, 2);
      ctx.fillStyle = '#141012';
      ctx.fillRect(wx(14, 1), y - 2, 1, 1);
    }
    if (hasTankPart(t.parts, TankPart.Cannon)) {
      const a = cannonAngle(faceLeft, aim, t.a) - t.a; // relative to the tilted hull
      const g = sp.tankGun(false, a, dog);
      const kick = t.firedCannon ? 3 : 0;
      const px = (faceLeft ? x + TANK_W - CANNON_PIVOT[0] : x + CANNON_PIVOT[0]) - Math.cos(a) * kick;
      const py = ty + CANNON_PIVOT[1] - Math.sin(a) * kick;
      ctx.drawImage(g.c, Math.round(px - g.r), Math.round(py - g.r));
    }
    ctx.drawImage(sp.tankHull(faceLeft, dog), x, y);
    // The steel cupola over the hatch (12 wide, its foot on the hatch rim).
    if (shield) ctx.drawImage(sp.tankShield(faceLeft, dog), wx(9, 12), y - 4);
    if (dog) {
      // A watchdog: no hatch, no crew. A sensor mast with a winking light in its owner's colour.
      const rgb = game.players.get(t.owner)?.rgb ?? 0xff4040;
      ctx.fillStyle = '#141012';
      ctx.fillRect(wx(6, 1), y - 11, 1, 10);
      ctx.fillRect(wx(4, 5), y - 1, 5, 2);
      ctx.fillStyle = (now / 260) % 2 < 1 ? `#${rgb.toString(16).padStart(6, '0')}` : '#3a2a2a';
      ctx.fillRect(wx(5, 3), y - 13, 3, 3);
      // Its eye: a red slit in the glacis, brighter while it's at its owner's remote.
      ctx.fillStyle = t.remote ? '#7ff0ff' : (now / 140) % 4 < 3 ? '#ff3020' : '#901008';
      ctx.fillRect(wx(26, 4), ty + 6, 4, 2);
    }
    // Tracks: one frame per two cells rolled.
    ctx.drawImage(sp.tankTread(Math.floor((faceLeft ? -t.x : t.x) / 2), faceLeft, dog), x, y + 18);
    if (hasTankPart(t.parts, TankPart.Armor)) ctx.drawImage(sp.tankArmor(faceLeft, dog), x, y);
    if (hasTankPart(t.parts, TankPart.Smg)) {
      aim -= t.a; // the vulcan's swivel, relative to the tilted hull
      const g = sp.tankGun(true, aim, dog);
      const px = faceLeft ? x + TANK_W - SMG_PIVOT[0] : x + SMG_PIVOT[0];
      const py = ty + SMG_PIVOT[1];
      ctx.drawImage(g.c, Math.round(px - g.r), Math.round(py - g.r));
      if (t.firedSmg && (now / 45) % 2 < 1) {
        // Muzzle flash: a hot star at the barrel tips.
        const fx = Math.round(px + Math.cos(aim) * (SMG_LEN + 1));
        const fy = Math.round(py + Math.sin(aim) * (SMG_LEN + 1));
        ctx.fillStyle = '#fff4b0';
        ctx.fillRect(fx - 1, fy - 1, 3, 3);
        ctx.fillStyle = '#ffb030';
        ctx.fillRect(fx - 2, fy, 5, 1);
        ctx.fillRect(fx, fy - 2, 1, 5);
      }
    }
    // Battle damage: scorch blotches spread as the hull weakens, then it burns.
    const wear = 1 - t.hp / tankMaxHp(t);
    if (wear > 0.25) {
      ctx.fillStyle = 'rgba(16,12,8,0.55)';
      ctx.fillRect(wx(5, 4), ty + 8, 4, 2);
      ctx.fillRect(wx(6, 2), ty + 10, 2, 1);
      if (wear > 0.5) {
        ctx.fillRect(wx(18, 5), ty + 9, 5, 2);
        ctx.fillRect(wx(9, 3), ty + 2, 3, 2);
      }
      if (wear > 0.75 && (now / 90) % 3 < 2) {
        ctx.fillStyle = (now / 60) % 2 < 1 ? '#ff9a30' : '#ffd060';
        ctx.fillRect(wx(19, 2), ty + 7, 2, 2);
        ctx.fillRect(wx(7, 1), ty + 6, 1, 2);
      }
    }
    ctx.restore();
  }

  /**
   * A mole, in its own pixel art (sprites.ts): the low ochre hull with its
   * flamethrower on a hump, the hatch cover at the back, the SMG on its iron
   * jaw, and out front the great steel frill, spikes and horns, standing up
   * over the deck (gone once it's shot away). Drawn in a tank's design cells
   * at its scale, tilted with its treads.
   */
  private drawMole(ctx: CanvasRenderingContext2D, t: TankView, faceLeft: boolean, aim: number, game: Game, now: number): void {
    const sp = this.sprites;
    const k = t.s ?? MOLE_SCALE;
    const x = 0;
    const ty = 0;
    const y = ty - TANK_SPRITE_TOP;
    const wx = (lx: number, w = 0) => (faceLeft ? x + TANK_W - lx - w : x + lx);
    ctx.save();
    ctx.translate(t.x + tankW(t) / 2, t.y + tankH(t) + tankSink(t.a, k));
    ctx.rotate(t.a);
    ctx.scale(k, k);
    ctx.translate(-(x + TANK_W / 2), -(ty + TANK_H));
    if (t.chute) ctx.drawImage(sp.tankChute(), x - 8, ty - 34);
    const hatch = hasTankPart(t.parts, TankPart.Shield);
    if (t.pilot !== 255 && !hatch) {
      // Hatch cover blown off: the driver's head out of the hole.
      const rgb = game.players.get(t.pilot)?.rgb ?? 0x7a8a50;
      ctx.fillStyle = '#141012';
      ctx.fillRect(wx(2, 6), ty - 1, 6, 5);
      ctx.fillStyle = `#${rgb.toString(16).padStart(6, '0')}`;
      ctx.fillRect(wx(3, 4), ty, 4, 2);
      ctx.fillStyle = '#e0b48c';
      ctx.fillRect(wx(3, 4), ty + 2, 4, 2);
    }
    ctx.drawImage(sp.moleHull(faceLeft), x, y);
    if (hatch) ctx.drawImage(sp.moleHatch(faceLeft), wx(2, 7), ty + 1);
    // Treads: one frame per two cells rolled.
    ctx.drawImage(sp.moleTread(Math.floor((faceLeft ? -t.x : t.x) / 2), faceLeft), x, y + 18);
    if (hasTankPart(t.parts, TankPart.Cannon)) {
      const a = aim - t.a;
      const g = sp.moleNozzle(a);
      const px = faceLeft ? x + TANK_W - MOLE_PLASMA_PIVOT[0] : x + MOLE_PLASMA_PIVOT[0];
      const py = ty + MOLE_PLASMA_PIVOT[1];
      ctx.drawImage(g.c, Math.round(px - g.r), Math.round(py - g.r));
      if (t.firedCannon) {
        // A blue-white glow at the mouth while it's firing.
        const fx = px + Math.cos(a) * (MOLE_PLASMA_LEN + 1);
        const fy = py + Math.sin(a) * (MOLE_PLASMA_LEN + 1);
        ctx.fillStyle = 'rgba(110,232,255,0.35)';
        ctx.fillRect(fx - 3, fy - 3, 7, 7);
        ctx.fillStyle = (now / 40) % 2 < 1 ? '#e0ffff' : '#6ee8ff';
        ctx.fillRect(fx - 1, fy - 1, 3, 3);
      }
    }
    if (hasTankPart(t.parts, TankPart.Smg)) {
      const a = aim - t.a;
      const g = sp.moleGun(a);
      const px = faceLeft ? x + TANK_W - MOLE_SMG_PIVOT[0] : x + MOLE_SMG_PIVOT[0];
      const py = ty + MOLE_SMG_PIVOT[1];
      ctx.drawImage(g.c, Math.round(px - g.r), Math.round(py - g.r));
      if (t.firedSmg && (now / 45) % 2 < 1) {
        const fx = Math.round(px + Math.cos(a) * (SMG_LEN + 1));
        const fy = Math.round(py + Math.sin(a) * (SMG_LEN + 1));
        ctx.fillStyle = '#fff4b0';
        ctx.fillRect(fx - 1, fy - 1, 3, 3);
        ctx.fillStyle = '#ffb030';
        ctx.fillRect(fx - 2, fy, 5, 1);
        ctx.fillRect(fx, fy - 2, 1, 5);
      }
    }
    if (hasTankPart(t.parts, TankPart.Armor)) {
      const f = sp.moleFrill(faceLeft);
      ctx.drawImage(f, wx(MOLE_FRILL_AT[0], f.width), ty + MOLE_FRILL_AT[1]);
    }
    const wear = 1 - t.hp / tankMaxHp(t);
    if (wear > 0.25) {
      ctx.fillStyle = 'rgba(16,12,8,0.55)';
      ctx.fillRect(wx(6, 4), ty + 9, 4, 2);
      if (wear > 0.5) ctx.fillRect(wx(15, 5), ty + 10, 5, 2);
      if (wear > 0.75 && (now / 90) % 3 < 2) {
        ctx.fillStyle = (now / 60) % 2 < 1 ? '#ff9a30' : '#ffd060';
        ctx.fillRect(wx(16, 2), ty + 8, 2, 2);
      }
    }
    ctx.restore();
  }

  /**
   * A tarantula, in its own hand-made pixel art (tarantula-sprites.ts):
   * the chunky iron, steel and ceramic body tilted with the ground, the
   * camera head with the laser on an iron neck, the missile rack on its
   * back, both turning to the aim. Its six legs are pixel-drawn too, each a
   * steel thigh up to a ceramic-capped knee and an iron shin tapering to a
   * steel point, the feet planted in the world on the spider droid's gait
   * (droidFeet, at its scale). A parachute holds it while it comes down; as
   * the hull weakens it smokes, then burns.
   */
  private drawTarantula(ctx: CanvasRenderingContext2D, t: TankView, faceLeft: boolean, aim: number, game: Game, now: number): void {
    const k = t.s ?? TARANTULA_SCALE;
    const cx = t.x + tankW(t) / 2;
    if (t.chute) {
      ctx.save();
      ctx.translate(cx, t.y);
      ctx.scale(1.3, 1.3);
      ctx.drawImage(this.sprites.tankChute(), -TANK_W / 2 - 8, -34);
      ctx.restore();
    }
    const rgb = game.players.get(t.owner)?.rgb ?? 0xff4040;
    const side = faceLeft ? -1 : 1;
    const feet = this.droidFeet(1000 + t.slot, t.x, t.y, faceLeft, t.onGround, now, k);
    const tilt = feet.tilt;
    const tc = Math.cos(tilt);
    const ts = Math.sin(tilt);
    const hipX = Math.round(cx);
    const hipY = Math.round(t.y + 9.6 * k + feet.bob * k);
    const rot = (px: number, py: number): [number, number] => [hipX + (px - hipX) * tc - (py - hipY) * ts, hipY + (px - hipX) * ts + (py - hipY) * tc];
    // A pixel strut from (x0, y0) to (x1, y1), `wa` thick tapering to `wb`, in colour `c`.
    const strut = (x0: number, y0: number, x1: number, y1: number, wa: number, wb: number, c: string, grow = 0) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      ctx.fillStyle = c;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const w = Math.max(1, Math.round(wa + (wb - wa) * f) + grow);
        ctx.fillRect(Math.round(x0 + (x1 - x0) * f - w / 2), Math.round(y0 + (y1 - y0) * f - w / 2), w, w);
      }
    };
    const THIGH = DROID_THIGH * k;
    const SHIN = DROID_SHIN * k;
    // Far legs first (they're behind), a shade darker.
    for (const leg of [1, 4, 0, 2, 3, 5]) {
      const far = leg === 1 || leg === 4;
      const [hx, hy] = rot(hipX + side * TARANTULA_HIPS[leg], hipY);
      const fx = feet.x[leg];
      const fy = feet.y[leg];
      const dx = fx - hx;
      const dy = fy - hy;
      const d = Math.min(Math.hypot(dx, dy), THIGH + SHIN - 0.5);
      const a = Math.atan2(dy, dx);
      const bend = Math.acos(Math.max(-1, Math.min(1, (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d || 1))));
      const k1 = [hx + Math.cos(a - bend) * THIGH, hy + Math.sin(a - bend) * THIGH];
      const k2 = [hx + Math.cos(a + bend) * THIGH, hy + Math.sin(a + bend) * THIGH];
      // (The knee bends up off its back, at any tilt.)
      const [kx, ky] = (k1[0] - hx) * ts - (k1[1] - hy) * tc > (k2[0] - hx) * ts - (k2[1] - hy) * tc ? k1 : k2;
      // Outline, then the metal, then a lit edge along the top of the thigh.
      strut(hx, hy, kx, ky, 5, 4, '#121417', 2);
      strut(kx, ky, fx, fy, 4, 1, '#121417', 2);
      strut(hx, hy, kx, ky, 5, 4, far ? '#4a5560' : '#7d8a97');
      strut(kx, ky, fx, fy, 4, 1, far ? '#2a2725' : '#4a4440');
      strut(hx, hy - 1, kx, ky - 1, 1, 1, far ? '#6c7884' : '#b6c3ce');
      strut(kx, ky, fx, fy, 1, 1, far ? '#3e3a37' : '#6a625c');
      // The steel point it stands on.
      ctx.fillStyle = far ? '#6c7884' : '#b6c3ce';
      ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 2, 2, 2);
      // The knee: a ceramic cap over the joint.
      const qx = Math.round(kx) - 3;
      const qy = Math.round(ky) - 3;
      ctx.fillStyle = '#121417';
      ctx.fillRect(qx - 1, qy - 1, 8, 8);
      ctx.fillStyle = far ? '#9a958a' : '#dfd9cb';
      ctx.fillRect(qx, qy, 6, 6);
      ctx.fillStyle = far ? '#b3ad9f' : '#f7f3e8';
      ctx.fillRect(qx, qy, 4, 2);
      ctx.fillStyle = far ? '#7a756b' : '#b3ad9f';
      ctx.fillRect(qx + 1, qy + 4, 5, 2);
    }
    // The neck: an iron mast from its back up to the head's mount.
    const headX = cx;
    const headY = t.y + SPIDER_LASER_PIVOT[1] * k;
    const [nx, ny] = rot(hipX + side * 3, hipY - 9);
    const head = hasTankPart(t.parts, TankPart.Smg);
    strut(nx, ny, headX, head ? headY : ny - 4, 6, 5, '#121417', 2);
    strut(nx, ny, headX, head ? headY : ny - 4, 6, 5, '#58514c');
    strut(nx - 2, ny, headX - 2, head ? headY : ny - 4, 1, 1, '#7c736c');
    // The body.
    const b = this.tArt.body(rgb, faceLeft, hasTankPart(t.parts, TankPart.Armor), tilt);
    ctx.drawImage(b.c, hipX - b.r, hipY - b.r);
    // The missile rack on its back, turning to the aim.
    if (hasTankPart(t.parts, TankPart.Cannon)) {
      const [rx, ry] = rot(faceLeft ? t.x + tankW(t) - SPIDER_RACK_PIVOT[0] * k : t.x + SPIDER_RACK_PIVOT[0] * k, t.y + SPIDER_RACK_PIVOT[1] * k);
      const r = this.tArt.rack(aim, faceLeft);
      ctx.drawImage(r.c, Math.round(rx) - r.r, Math.round(ry) - r.r);
      if (t.firedCannon) {
        // A flash out of the tubes.
        const ca = Math.cos(aim);
        const sa = Math.sin(aim);
        for (const [mx, my] of RACK_MOUTHS) {
          const lx = mx - RACK_PIVOT[0];
          const ly = (my - RACK_PIVOT[1]) * (faceLeft ? -1 : 1);
          const fxp = rx + lx * ca - ly * sa;
          const fyp = ry + lx * sa + ly * ca;
          ctx.fillStyle = '#ffd860';
          ctx.fillRect(Math.round(fxp) - 1, Math.round(fyp) - 1, 3, 3);
          ctx.fillStyle = '#fffbe0';
          ctx.fillRect(Math.round(fxp), Math.round(fyp), 1, 1);
        }
      }
    } else if ((now / 90) % 4 < 1) {
      ctx.fillStyle = '#ffd060';
      ctx.fillRect(Math.round(hipX - side * 12), hipY - 12, 2, 2);
    }
    // The head on its mast: the laser's camera, turning to the aim.
    if (head) {
      const h = this.tArt.head(aim, faceLeft, t.firedSmg);
      ctx.drawImage(h.c, Math.round(headX) - h.r, Math.round(headY) - h.r);
    } else if ((now / 80) % 3 < 1) {
      ctx.fillStyle = '#ffd060';
      ctx.fillRect(Math.round(nx), Math.round(ny) - 6, 2, 2);
    }
    // Battle damage: smoke off the back as the hull weakens, then fire.
    const wear = 1 - t.hp / tankMaxHp(t);
    if (wear > 0.4) {
      const by = hipY - 8;
      const ph = (now / 70) % 6;
      ctx.fillStyle = 'rgba(30,26,22,0.5)';
      ctx.fillRect(Math.round(cx - 6 + ph), Math.round(by - 4 - ph * 1.5), 3, 3);
      if (wear > 0.7 && (now / 90) % 3 < 2) {
        ctx.fillStyle = (now / 60) % 2 < 1 ? '#ff9a30' : '#ffd060';
        ctx.fillRect(Math.round(cx - 4), by + 1, 2, 2);
        ctx.fillRect(Math.round(cx + 5), by + 2, 2, 2);
      }
    }
  }

  /** A drop rocket: hull in the passenger's colour, exhaust plume along its axis, damage sparks. */
  private drawCraft(ctx: CanvasRenderingContext2D, c: CraftView, game: Game, now: number): void {
    const team = c.passenger !== 255 ? (game.players.get(c.passenger)?.rgb ?? 0x8a9096) : 0x8a9096;
    const cx = Math.round(c.x);
    const cy = Math.round(c.y);
    if (c.thrust > 0.05 && c.parts & (1 << CraftPart.Engine)) {
      // Plume behind the nozzle, length by thrust.
      const len = Math.round(4 + c.thrust * 14 + ((now / 40) % 3));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(c.a);
      const ny = CRAFT_H / 2 + 1;
      ctx.fillStyle = 'rgba(255,170,60,0.85)';
      ctx.fillRect(-2, ny, 4, Math.round(len * 0.7));
      ctx.fillStyle = 'rgba(255,245,200,0.95)';
      ctx.fillRect(-1, ny, 2, Math.round(len * 0.45));
      ctx.fillStyle = 'rgba(255,90,30,0.6)';
      ctx.fillRect(-1, ny + Math.round(len * 0.7), 2, Math.round(len * 0.3));
      ctx.restore();
    }
    const spr = this.sprites.craft(team, c.parts, c.a);
    ctx.drawImage(spr.c, cx - spr.r, cy - spr.r);
    if (c.hp < CRAFT_HP / 2 && (now / 90) % 2 < 1) {
      // Damaged: sparks off the hull.
      ctx.fillStyle = '#ffd040';
      ctx.fillRect(cx - 4 + ((now / 50) % 8), cy - 5 + ((now / 70) % 10), 1, 1);
    }
  }

  /**
   * Body status: each part of the clone tinted by its health (green to red),
   * dark where it has been torn off, outlined where armour is still worn.
   */
  private drawPaperDoll(game: Game, s: number): void {
    const ctx = this.ctx;
    const ox = 200 * s;
    const oy = 12 * s;
    const k = 3 * s; // one hitbox cell
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(ox - 3 * s, oy - 3 * s, 8 * k + 6 * s, 14 * k + 6 * s);
    const col = (hp: number) => (hp <= 0 ? 'rgba(60,20,20,0.9)' : `hsl(${Math.round((hp / 100) * 120)},70%,45%)`);
    const droid = game.body.cls === ClassId.Droid;
    const defs = droid ? DROID_PARTS : PARTS;
    const rect = (p: number) => {
      const d = defs[p];
      ctx.fillRect(ox + d.rx0 * k, oy + d.ry0 * k, (d.rx1 - d.rx0 + 1) * k, (d.ry1 - d.ry0 + 1) * k);
    };
    if (droid) {
      // A droid's own doll: chassis (its plating outlined), turret on top, six legs beneath.
      for (const p of [DroidPart.Chassis, DroidPart.Turret, ...DROID_LEGS]) {
        ctx.fillStyle = col(game.partHp[p]);
        rect(p);
      }
      if (game.partHp[DroidPart.Plating] > 0) {
        ctx.lineWidth = Math.max(1, s);
        ctx.strokeStyle = col(game.partHp[DroidPart.Plating]);
        const d = DROID_PARTS[DroidPart.Plating];
        ctx.strokeRect(ox + d.rx0 * k + 0.5, oy + d.ry0 * k + 0.5, (d.rx1 - d.rx0 + 1) * k - 1, (d.ry1 - d.ry0 + 1) * k - 1);
      }
      return;
    }
    for (const p of [Part.Torso, Part.Jetpack, Part.OffArm, Part.LegB, Part.LegF, Part.Head, Part.GunArm]) {
      ctx.fillStyle = col(game.partHp[p]);
      rect(p);
    }
    ctx.lineWidth = Math.max(1, s);
    for (const p of [Part.Helmet, Part.Vest, Part.Crown]) {
      if (game.partHp[p] <= 0) continue;
      ctx.strokeStyle = col(game.partHp[p]);
      const d = PARTS[p];
      ctx.strokeRect(ox + d.rx0 * k + 0.5, oy + d.ry0 * k + 0.5, (d.rx1 - d.rx0 + 1) * k - 1, (d.ry1 - d.ry0 + 1) * k - 1);
    }
  }

  private drawHud(game: Game, input: InputState, net: Link, views: RemoteView[], dpr: number, W: number, H: number): void {
    const ctx = this.ctx;
    // HUD scale: device pixels per CSS pixel, shrunk on small (phone) screens.
    const s = dpr * Math.min(1, innerHeight / 560, innerWidth / 1000);
    const touch = input.touch;
    this.bannerBottom = 0;
    this.deathShown = false;
    this.teamRects.length = 0;
    this.respawnMax = game.alive ? 0 : Math.max(this.respawnMax, game.respawnTicks);
    ctx.textAlign = 'left';
    ctx.font = `${Math.round(12 * s)}px ui-monospace, monospace`;

    // Health / fuel bars.
    const bar = (yy: number, v: number, max: number, color: string, label: string) => {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(14 * s, yy, 180 * s, 14 * s);
      ctx.fillStyle = color;
      ctx.fillRect(16 * s, yy + 2 * s, (176 * s * Math.max(0, v)) / max, 10 * s);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, 20 * s, yy + 11 * s);
    };
    bar(14 * s, game.hp, ACTOR_MAX_HP, '#d23c3c', `HP ${game.hp}`);
    // Venom in our blood: the harm it has still to do, marked over the end of the health bar, pulsing, and the edges of the view stained red.
    const venom = game.myVenom;
    if (venom > 0) {
      const left = Math.min(venom, game.hp);
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 160);
      ctx.fillStyle = `rgba(120,0,40,${0.55 + 0.35 * pulse})`;
      ctx.fillRect(16 * s + (176 * s * Math.max(0, game.hp - left)) / ACTOR_MAX_HP, 16 * s, (176 * s * left) / ACTOR_MAX_HP, 10 * s);
      ctx.fillStyle = '#ff7a8a';
      ctx.fillText('VENOM', 200 * s, 25 * s);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(120,0,20,0)');
      g.addColorStop(1, `rgba(120,0,20,${Math.min(0.4, 0.1 + venom / 300) * pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    // A seeder's nest growing in our limbs: which, and how far along (full grown, it bursts out, or withers).
    const coral = game.myCoral;
    if (coral.some((c) => c > 0)) {
      const names = ['GUN ARM', 'ARM', 'LEG', 'LEG'];
      const worst = Math.max(...coral);
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / (worst >= 1 ? 90 : 220));
      ctx.fillStyle = `rgba(255,110,160,${pulse})`;
      ctx.fillText(`NEST ${coral.map((c, i) => (c > 0 ? `${names[i]} ${Math.round(c * 100)}%` : '')).filter(Boolean).join(' · ')}`, 14 * s, 150 * s);
    }
    if (game.drive) bar(32 * s, game.drive.fuel, TANK_MAX_FUEL, '#3c8cd2', `TANK JET ${Math.round(game.drive.fuel)}`);
    else bar(32 * s, game.body.fuel, ACTOR_MAX_FUEL, '#3c8cd2', `JET ${Math.round(game.body.fuel)}`);
    if (game.drive && game.myTankState) this.drawTankHud(game, input, s, W, H);
    const me = game.players.get(game.myId);
    ctx.fillStyle = '#ffd34a';
    ctx.fillText(`GEMMS ${game.gold}   K ${me?.kills ?? 0}  D ${me?.deaths ?? 0}`, 14 * s, 62 * s);
    // (Under it, where the clone's vendor and class used to be: the match card, drawn with the round.)
    if (game.building) this.drawBuildMenu(game, input, s, H);
    else this.menuRects.length = 0;
    if (game.calling) this.drawCallMenu(game, input, s, H);
    else this.callRects.length = 0;
    this.drawRemotes(game, input, s, W, H);
    if (game.alive) this.drawPaperDoll(game, s);

    // Inventory: what we carry, the one in hand highlighted.
    const slotW = 104 * s;
    const total = Math.max(1, game.inv.length) * slotW;
    const sx0 = W / 2 - total / 2;
    for (let i = 0; i < game.inv.length; i++) {
      const it = game.inv[i];
      const d = WEAPONS[it.weapon];
      const x = sx0 + i * slotW;
      const sel = i === game.slot;
      ctx.fillStyle = sel ? 'rgba(255,210,80,0.85)' : 'rgba(0,0,0,0.5)';
      ctx.fillRect(x + 2 * s, H - 34 * s, slotW - 4 * s, 24 * s);
      ctx.fillStyle = sel ? '#000' : '#ddd';
      ctx.fillText(d ? (d.clip > 1 ? `${d.name} ${it.ammo}` : d.name) : '?', x + 10 * s, H - 18 * s);
    }
    if (game.alive && !touch && !game.drive) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'center';
      ctx.fillText(game.inv.length ? '1/2 switch   3 pick up   4 drop' : 'empty-handed: 3 picks up a weapon', W / 2, H - 42 * s);
      ctx.textAlign = 'left';
    }
    // Magazine and reload for the weapon in hand.
    const def = WEAPONS[game.weapon];
    if (game.alive && def && def.clip > 0 && game.weapon === WeaponId.RepairKit) {
      // One use: a prompt instead of a magazine count.
      const ax = sx0 + total + 8 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(ax, H - 34 * s, 120 * s, 24 * s);
      ctx.fillStyle = '#7dffc0';
      ctx.fillText(input.touch ? 'FIRE: HEAL WAVE' : 'CLICK: HEAL WAVE', ax + 10 * s, H - 18 * s);
    } else if (game.alive && def && def.clip > 0) {
      const ax = sx0 + total + 8 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(ax, H - 34 * s, 120 * s, 24 * s);
      if (game.reloadLeft > 0) {
        const t = 1 - game.reloadLeft / def.reload;
        ctx.fillStyle = 'rgba(255,210,80,0.8)';
        ctx.fillRect(ax, H - 34 * s, 120 * s * Math.max(0, Math.min(1, t)), 24 * s);
        ctx.fillStyle = '#000';
        ctx.fillText('RELOADING', ax + 10 * s, H - 18 * s);
      } else {
        ctx.fillStyle = game.ammo === 0 ? '#ff7060' : game.ammo <= def.clip / 4 ? '#ffc060' : '#fff';
        ctx.fillText(`${game.ammo} / ${def.clip}`, ax + 10 * s, H - 18 * s);
      }
    }

    // Net stats.
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const lines = [
      `${game.room}  ${game.players.size}/64 players`,
      `ping ${Math.round(net.rttMs)} ms   in ${net.kbIn.toFixed(1)} KB/s`,
      `tick ${game.lastServerTick}  fps ${Math.round(this.fps)}`,
      `chunks ${countLoaded(game)}/${CHUNK_COUNT} known  particles ${game.particles.n} (drawn ${this.particleLayer.drawn})`,
    ];
    // On touch screens the bottom-right belongs to the buttons: the minimap
    // moves to the top-right, the kill feed under it, and the net stats go.
    const mw = this.mini.width * s;
    const mh = this.mini.height * s;
    const mx = W - mw - 14 * s;
    const my = touch ? 10 * s : H - mh - 14 * s;
    // How many real people are in the game (everyone else is a bot).
    let humans = 0;
    for (const [, pl] of game.players) if (!pl.bot) humans++;
    const online = `${humans} ${humans === 1 ? 'human' : 'humans'} online`;
    // The info panel (this, the net stats and the kill feed) only on request
    // (I), or while the scoreboard is up.
    const info = input.showInfo || input.scoreboard;
    if (info) {
      ctx.font = `bold ${Math.round(14 * s)}px ui-monospace, monospace`;
      const ox = touch ? mx - 10 * s : W - 14 * s;
      const oy = touch ? my + 14 * s : 22 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(online, ox + s, oy + s);
      ctx.fillStyle = '#9fe870';
      ctx.fillText(online, ox, oy);
    }
    ctx.font = `${Math.round(12 * s)}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    if (!touch && info) lines.forEach((l, i) => ctx.fillText(l, W - 14 * s, (40 + i * 15) * s));

    // Kill feed.
    const now = performance.now();
    // (Without the info panel, only notices for us show: not the kill feed.)
    const feedY = touch ? my + mh + 16 * s : info ? 100 * s : 22 * s;
    const shown = info ? game.feed : game.feed.filter((f) => !f.kill);
    const feed = touch ? shown.slice(-3) : shown;
    feed.forEach((f, i) => {
      const a = Math.max(0, Math.min(1, (8000 - (now - f.at)) / 1000));
      if (a <= 0) return;
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, W - 14 * s, feedY + i * 16 * s);
    });
    ctx.globalAlpha = 1;

    // Chat log.
    ctx.textAlign = 'left';
    game.chatLog.forEach((c, i) => {
      const a = input.typing ? 1 : Math.max(0, Math.min(1, (12000 - (now - c.at)) / 1000));
      if (a <= 0) return;
      ctx.globalAlpha = a;
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, 14 * s, H - 60 * s - (game.chatLog.length - i) * 15 * s);
    });
    ctx.globalAlpha = 1;

    // Minimap.
    if (this.miniDirty) {
      this.miniCtx.putImageData(this.miniImage, 0, 0);
      this.miniDirty = false;
    }
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.mini, mx, my, mw, mh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, mw, mh);
    const k = mw / WORLD_W;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.strokeRect(mx + (this.camX - VIEW_HALF_W) * k, my + (this.camY - VIEW_HALF_H) * k, VIEW_HALF_W * 2 * k, VIEW_HALF_H * 2 * k);
    for (const bl of game.radar) {
      ctx.fillStyle = game.colorOf(bl.id);
      ctx.fillRect(mx + bl.x * k - 1.5 * s, my + bl.y * k - 1.5 * s, 3 * s, 3 * s);
    }
    for (const v of views) {
      if (!(v.flags & F_ALIVE)) continue;
      ctx.fillStyle = game.colorOf(v.id);
      ctx.fillRect(mx + v.x * k - 1.5 * s, my + v.y * k - 1.5 * s, 3 * s, 3 * s);
    }
    // Spotted enemies: a red ring around their dot.
    ctx.strokeStyle = '#ff5a3c';
    ctx.lineWidth = Math.max(1, s);
    for (const e of game.spottedNow()) {
      ctx.beginPath();
      ctx.arc(mx + e.x * k, my + e.y * k, 4 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Kings stand out: a gold square around their dot (radar blips included).
    const rs0 = game.roundState;
    // Siege: the attackers' landing zone, a green band along the bottom.
    if (rs0 && rs0.mode === GameMode.Siege && game.siege) {
      const [l0, l1] = game.siege.lz;
      ctx.fillStyle = 'rgba(80,220,110,0.22)';
      ctx.fillRect(mx + l0 * k, my, (l1 - l0) * k, WORLD_H * k);
      ctx.fillStyle = 'rgba(120,255,150,0.8)';
      ctx.fillRect(mx + l0 * k, my + WORLD_H * k - 2 * s, (l1 - l0) * k, 2 * s);
    }
    if (rs0 && (rs0.mode === GameMode.Regicide || rs0.mode === GameMode.Siege)) {
      ctx.strokeStyle = '#ffd34a';
      ctx.lineWidth = Math.max(1, s);
      for (const bl of game.radar) if (game.isKing(bl.id)) ctx.strokeRect(mx + bl.x * k - 3 * s, my + bl.y * k - 3 * s, 6 * s, 6 * s);
      for (const v of views) if (v.flags & F_ALIVE && game.isKing(v.id)) ctx.strokeRect(mx + v.x * k - 3 * s, my + v.y * k - 3 * s, 6 * s, 6 * s);
    }
    // Extermination: the basilisks and the dragon (red when awake, dim asleep), for everyone to hunt.
    if (rs0?.lair && rs0.mode === GameMode.Extermination) {
      const pulse = 3.5 + Math.sin(performance.now() / 160);
      for (const b of rs0.lair.beasts) {
        ctx.fillStyle = b.awake ? '#ff4d3d' : 'rgba(200,190,170,0.85)';
        ctx.beginPath();
        ctx.arc(mx + b.x * k, my + Math.max(0, b.y) * k, (b.awake ? pulse : 3) * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Extraction: the idol (a pulsing gold diamond) and the extraction rocket, for everyone to race to.
    if (rs0?.idol && rs0.mode === GameMode.Extraction) {
      const ix = mx + rs0.idol.x * k;
      const iy = my + rs0.idol.y * k;
      const r = (3 + Math.sin(performance.now() / 200)) * s;
      ctx.fillStyle = '#ffd34a';
      ctx.beginPath();
      ctx.moveTo(ix, iy - r);
      ctx.lineTo(ix + r, iy);
      ctx.lineTo(ix, iy + r);
      ctx.lineTo(ix - r, iy);
      ctx.closePath();
      ctx.fill();
      if (rs0.evac && rs0.evac.state !== Evac.None) {
        ctx.fillStyle = '#fff';
        const ex = mx + rs0.evac.x * k;
        const ey = my + Math.max(0, rs0.evac.y) * k;
        ctx.fillRect(ex - 1.5 * s, ey - 3 * s, 3 * s, 6 * s);
      }
    }
    if (game.alive) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(mx + game.body.x * k - 2 * s, my + game.body.y * k - 2 * s, 4 * s, 4 * s);
    }

    // Last Man Standing: the round, and what's happening to us in it.
    const rs = game.roundState;
    if (rs) this.drawRound(game, rs, input.touch, s, W, H);
    this.voteRects.length = 0;
    if (rs?.vote && rs.phase === Phase.Victory) this.drawVote(rs.vote, Math.ceil(rs.timer / TICK_RATE), input.touch, s, W, H);

    // Driving the watchdog by remote: the controls, and what's left of it.
    const dog = game.alive ? game.remoteDog() : null;
    if (dog) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const py = H - 150 * s;
      ctx.fillRect(W / 2 - 320 * s, py, 640 * s, 56 * s);
      ctx.font = `bold ${Math.round(14 * s)}px ui-monospace, monospace`;
      ctx.fillStyle = '#fff';
      const spider = isSpider(dog);
      ctx.fillText(
        spider ? 'TARANTULA REMOTE   A/D walk (into a wall: up it)   W/S climb   click laser   right-click missiles   P next' : 'WATCHDOG REMOTE   A/D drive   W jets   click vulcan   right-click cannon   P next',
        W / 2,
        py + 22 * s,
      );
      const max = tankMaxHp(dog);
      const names = spider ? (['MISSILES', 'LASER', 'PLATING'] as const) : (['CANNON', 'VULCAN', 'ARMOUR'] as const);
      const lost = names.filter((_, i) => !hasTankPart(dog.parts, [TankPart.Cannon, TankPart.Smg, TankPart.Armor][i]));
      ctx.fillStyle = lost.length || dog.hp < max * 0.35 ? '#ff9060' : '#a0ffa0';
      ctx.fillText([`hull ${Math.max(0, Math.round((dog.hp / max) * 100))}%`, ...lost.map((l) => `${l} LOST`), 'your clone stands guard where you left it'].join('   '), W / 2, py + 44 * s);
      ctx.textAlign = 'left';
    }

    // Remote-piloting the dropship: the controls, and what's left of it.
    const flown = game.alive ? game.pilotedShip() : null;
    if (flown) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      // (Low on the screen, over the inventory bar: the ship flies up top.)
      const py = H - 150 * s;
      ctx.fillRect(W / 2 - 320 * s, py, 640 * s, 56 * s);
      ctx.font = `bold ${Math.round(14 * s)}px ui-monospace, monospace`;
      ctx.fillStyle = '#fff';
      ctx.fillText('REMOTE PILOT   A/D fly   W/S climb/sink   click guns   right-click bomb   P exit', W / 2, py + 22 * s);
      const lost = (['ENGINE A', 'ENGINE B', 'ENGINE C', 'ENGINE D', 'GUN L', 'GUN R', 'BAY'] as const).filter((_, i) => !hasShipPart(flown.parts, [ShipPart.EngineA, ShipPart.EngineB, ShipPart.EngineC, ShipPart.EngineD, ShipPart.TurretL, ShipPart.TurretR, ShipPart.Doors][i]));
      ctx.fillStyle = lost.length || flown.hp < SHIP_HP * 0.35 ? '#ff9060' : '#a0ffa0';
      ctx.fillText([`hull ${Math.max(0, Math.round((flown.hp / SHIP_HP) * 100))}%`, `bombs ${flown.bombs}`, ...lost.map((l) => `${l} LOST`)].join('   '), W / 2, py + 44 * s);
      ctx.textAlign = 'left';
    }

    // Death / respawn banner.
    if (!game.alive && game.myId >= 0 && (!rs || game.ride || game.myCraft())) {
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.round(22 * s)}px ui-monospace, monospace`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const secs = Math.ceil(game.respawnTicks / TICK_RATE);
      const ride = game.ride;
      if (ride && ride.passenger === game.myId) {
        // Piloting: controls and what is left of the rocket, out of the way at the top.
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(W / 2 - 260 * s, 40 * s, 520 * s, 56 * s);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(15 * s)}px ui-monospace, monospace`;
        ctx.fillText('A/D steer   W burn   S cut engine   click: bail out', W / 2, 62 * s);
        const status = [`hull ${Math.max(0, Math.round((ride.hp / CRAFT_HP) * 100))}%`];
        if (!(ride.parts & (1 << CraftPart.Engine))) status.push('ENGINE GONE');
        if (!(ride.parts & (1 << CraftPart.FinL)) || !(ride.parts & (1 << CraftPart.FinR))) status.push('FIN LOST');
        if (!(ride.parts & (1 << CraftPart.Nose))) status.push('NOSE LOST');
        ctx.fillStyle = status.length > 1 || ride.hp < 70 ? '#ff9060' : '#a0ffa0';
        ctx.fillText(status.join('   '), W / 2, 84 * s);
      } else if (game.myCraft()) this.drawBanner('INBOUND', 'drop rocket on its way', '#ffd34a', s, W, H);
      else this.drawDeath(game, { title: 'FRAGGED', color: '#ff4d3d', status: secs > 0 ? 'new clone in' : 'launching drop rocket', secs: secs > 0 ? secs : null, watching: null, touch: input.touch, teams: 0 }, s, W, H);
    }

    // Dead, or between rounds: our K/D and the leaderboard.
    const between = !!rs && (rs.phase === Phase.Countdown || rs.phase === Phase.Victory);
    const piloting = game.ride?.passenger === game.myId;
    // (Not over the ballot while the vote's up: Tab still shows the scoreboard.)
    const ballot = !!rs?.vote && rs.phase === Phase.Victory;
    if (!input.scoreboard && !ballot && !this.deathShown && game.myId >= 0 && (between || (!game.alive && !piloting))) this.drawKd(game, s, W, H);
    // Dead in a team mode: the choice of side.
    if (!input.scoreboard && !this.deathShown && !between && !game.alive && !piloting && rs && rs.phase === Phase.Live && TEAMS_IN_MODE[rs.mode] >= 2 && !game.isKing(game.myId)) this.drawTeamPick(game, TEAMS_IN_MODE[rs.mode], input.touch, s, W, H);

    if (input.scoreboard) this.drawScoreboard(game, s, W, H);
    else if (!between) this.drawObjective(game, views, s, W, H);
  }

  /**
   * The objective pointer (objectives.ts): while what we should be doing is
   * off screen, a small chevron at the screen's edge pointing toward it,
   * the word for it beside (KILL, COLLECT, EXTRACT...). Quiet: half
   * transparent, breathing a little, out of the way at the edge.
   */
  private drawObjective(game: Game, views: RemoteView[], s: number, W: number, H: number): void {
    const o = objective(game, knownPlayers(game, views, F_ALIVE));
    if (!o) return;
    const z = this.zoom;
    const dx = (o.x - this.camX) * z;
    const dy = (o.y - this.camY) * z;
    const m = 30 * s;
    // On screen: no pointer (you can see it).
    if (Math.abs(dx) < W / 2 - m && Math.abs(dy) < H / 2 - m) return;
    // To the edge (inset), along the way to it.
    const k = Math.min((W / 2 - m) / Math.max(1e-6, Math.abs(dx)), (H / 2 - m) / Math.max(1e-6, Math.abs(dy)));
    const px = W / 2 + dx * k;
    const py = H / 2 + dy * k;
    const a = Math.atan2(dy, dx);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.12 * Math.sin(performance.now() / 420);
    ctx.translate(px, py);
    ctx.rotate(a);
    // The chevron: a small open arrowhead, with a dark edge so it reads over anything.
    const r = 8 * s;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, -r * 0.8);
    ctx.lineTo(r * 0.5, 0);
    ctx.lineTo(-r * 0.6, r * 0.8);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 4 * s;
    ctx.stroke();
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 2 * s;
    ctx.stroke();
    ctx.restore();
    // The word, on the inside of it (toward the middle of the screen), upright.
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.font = `${Math.round(10 * s)}px ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    // (Beside it, never over it: to its right on the left edge, to its left on the right, under it at the top, over it at the bottom.)
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    let tx = px;
    let ty = py;
    if (Math.abs(ca) > 0.6) {
      ctx.textAlign = ca < 0 ? 'left' : 'right';
      tx = px - Math.sign(ca) * 12 * s;
    } else {
      ctx.textAlign = 'center';
      ty = py - Math.sign(sa) * 14 * s;
    }
    const dist = Math.round(Math.hypot(o.x - game.body.x, o.y - game.body.y) / 10);
    const label = `${o.verb} ${dist}m`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(label, tx + s, ty + s);
    ctx.fillStyle = o.color;
    ctx.fillText(label, tx, ty);
    ctx.restore();
  }

  /**
   * The standings: dead or between rounds, under the death card or the
   * round's message. Our numbers as tiles (kills, deaths, K/D, career K/D),
   * then the top clones by K/D (with our own row if we're not among them),
   * each with its rank badge, its colour, and its K, D and K/D. As many rows
   * as there's room for above the team picker.
   */
  private drawKd(game: Game, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    const me = game.players.get(game.myId);
    if (!me) return;
    const kd = (p: { kills: number; deaths: number }) => kdRatio(p.kills, p.deaths);
    const rows = [...game.players.values()].sort((a, b) => kd(b) - kd(a) || b.kills - a.kills || a.deaths - b.deaths);
    const rank = rows.findIndex((p) => p.id === game.myId);
    const w = Math.min(420 * s, W * 0.92);
    const pad = 14 * s;
    const rowH = 22 * s;
    const headH = 30 * s;
    const tileH = 46 * s;
    const colH = 20 * s;
    const x0 = (W - w) / 2;
    const y0 = Math.max(this.bannerBottom + 14 * s, H * 0.2);
    // (Room for the rows: down to just over the team picker.)
    const room = H - 128 * s - y0 - (headH + tileH + colH + pad * 2);
    const fit = Math.max(3, Math.min(8, Math.floor(room / rowH) - (rank >= 8 ? 1 : 0)));
    const top = rows.slice(0, fit);
    const extra = rank >= top.length;
    const h = pad + headH + tileH + 8 * s + colH + (top.length + (extra ? 1 : 0)) * rowH + (extra ? 8 * s : 0) + pad * 0.6;
    panel(ctx, x0, y0, w, h, s);
    ctx.save();
    ctx.textBaseline = 'middle';
    // The header: what this is, and where we stand.
    let y = y0 + pad + headH / 2 - 4 * s;
    ctx.textAlign = 'left';
    ctx.font = uiFont(12 * s, 800);
    track(ctx, 2 * s);
    ctx.fillStyle = '#e9e4da';
    ctx.fillText('MATCH STANDINGS', x0 + pad, y);
    ctx.textAlign = 'right';
    ctx.font = uiFont(12 * s, 700);
    track(ctx, 1 * s);
    ctx.fillStyle = '#ffc23d';
    ctx.fillText(`#${rank + 1}`, x0 + w - pad - ctx.measureText(` OF ${rows.length}`).width, y);
    ctx.fillStyle = '#9aa0a8';
    ctx.fillText(` OF ${rows.length}`, x0 + w - pad, y);
    // Our numbers, as tiles.
    const c = game.career;
    const tiles: [string, string][] = [
      ['KILLS', String(me.kills)],
      ['DEATHS', String(me.deaths)],
      ['K/D', kd(me).toFixed(2)],
      ['CAREER K/D', kdRatio(c.kills, c.deaths).toFixed(2)],
    ];
    const tg = 6 * s;
    const tw = (w - pad * 2 - tg * (tiles.length - 1)) / tiles.length;
    const ty = y0 + pad + headH;
    tiles.forEach(([label, value], i) => {
      const tx = x0 + pad + i * (tw + tg);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      rrect(ctx, tx, ty, tw, tileH, 6 * s);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.font = uiFont(19 * s, 800);
      track(ctx, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(value, tx + tw / 2, ty + tileH * 0.4);
      ctx.font = uiFont(8.5 * s, 700);
      track(ctx, 1.2 * s);
      ctx.fillStyle = '#8f959d';
      ctx.fillText(label, tx + tw / 2, ty + tileH * 0.78);
    });
    // The table.
    const cR = x0 + w - pad;
    const cD = cR - 44 * s;
    const cK = cD - 44 * s;
    y = ty + tileH + 8 * s + colH / 2;
    ctx.font = uiFont(9 * s, 700);
    track(ctx, 1.2 * s);
    ctx.fillStyle = '#7d838b';
    ctx.textAlign = 'left';
    ctx.fillText('PLAYER', x0 + pad + 30 * s, y);
    ctx.textAlign = 'right';
    ctx.fillText('K', cK, y);
    ctx.fillText('D', cD, y);
    ctx.fillText('K/D', cR, y);
    y += colH / 2;
    const row = (p: (typeof rows)[number], i: number, k: number) => this.drawStandingRow(game, p, i + 1, k, x0 + pad, y + k * rowH, w - pad * 2, rowH, s);
    top.forEach((p, i) => row(p, i, i));
    if (extra) {
      ctx.fillStyle = '#5c6168';
      ctx.textAlign = 'center';
      ctx.font = uiFont(10 * s, 700);
      ctx.fillText('• • •', x0 + w / 2, y + top.length * rowH + 4 * s);
      y += 8 * s;
      row(me, rank, top.length);
    }
    track(ctx, 0);
    ctx.restore();
  }

  /**
   * Last Man Standing banners: waiting, the countdown, clones left, who you're
   * watching once you're out, and the winner of each wave.
   */
  private drawRound(game: Game, rs: RoundState, touch: boolean, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    const secs = Math.ceil(rs.timer / TICK_RATE);
    const name = (id: number) => (id === game.myId ? 'YOU' : (game.players.get(id)?.name ?? '???'));
    const big = (text: string, sub: string, color = '#fff') => this.drawBanner(text, sub, color, s, W, H);
    const regicide = rs.mode === GameMode.Regicide;
    const extraction = rs.mode === GameMode.Extraction;
    const pvp = rs.mode === GameMode.Pvp;
    const siege = rs.mode === GameMode.Siege;
    const exterm = rs.mode === GameMode.Extermination;
    const teams = rs.mode === GameMode.Lts || regicide || extraction || siege;
    const teamCss = (t: number) => TEAM_COLORS[t]?.css ?? '#fff';
    if (rs.phase === Phase.Waiting) big(exterm ? 'EXTERMINATION' : siege ? 'SIEGE' : extraction ? 'EXTRACTION' : regicide ? 'REGICIDE' : pvp ? 'PVP' : teams ? 'LAST TEAM STANDING' : 'LAST MAN STANDING', 'waiting for players');
    else if (rs.phase === Phase.Countdown) {
      big(
        `WAVE ${rs.wave + 1} IN ${secs}`,
        // (The mode is the headline; the map's biome goes with the hints.)
        (exterm && game.mapKind === MapKind.Dune
          ? 'extermination · DUNE · everyone together · a barren desert, and two dragons under the sand · they will come up for you · kill them both · respawns'
          : exterm
          ? 'extermination · everyone together · three basilisks and a dragon hibernate in the giant cave below · kill them all · respawns'
          : siege
          ? 'siege · red holds the fortress and its king for 20 minutes · green has 300 lives to kill him'
          : extraction
          ? 'extraction · four teams · bring the golden idol up from the bottom of the labyrinth'
          : regicide
          ? 'regicide · kill their king · guard yours'
          : pvp
          ? 'pvp · all against all · respawns · most kills in 5 minutes wins'
          : teams
            ? 'last team standing · red vs green · one life each'
            : 'last man standing · one life each · every clone for itself') +
          (extraction || game.mapKind === MapKind.Dune ? '' : ` · ${BIOME_NAMES[game.biome]?.toLowerCase() ?? ''} map${game.caves ? ' · caves: a tunnel highway links the bunkers below' : ''}`),
        '#ffd34a',
      );
    } else if (rs.phase === Phase.Victory && extraction) {
      const mine = game.myTeam !== Team.None && rs.winner === game.myTeam;
      if (rs.winner === 255) big('NOBODY GOT OUT', `the idol stays buried · wave ${rs.wave} · next wave in ${secs}`);
      else big(`${TEAM_NAMES[rs.winner]} EXTRACTED`, `${mine ? 'your team got' : 'team ' + TEAM_NAMES[rs.winner].toLowerCase() + ' got'} the golden idol out · next wave in ${secs}`, teamCss(rs.winner));
    } else if (rs.phase === Phase.Victory && exterm) {
      if (rs.winner === 255) big('THE BEASTS WIN', `${rs.lair?.beasts.length ?? '?'} still alive · wave ${rs.wave} · next wave in ${secs}`, '#ff8070');
      else big('LAIR CLEARED', `every basilisk and the dragon dead · wave ${rs.wave} · next wave in ${secs}`, '#80ff80');
    } else if (rs.phase === Phase.Victory && pvp) {
      const won = rs.winner === game.myId;
      const who = (game.players.get(rs.winner)?.name ?? '').replace(/^BOT /, '');
      const mine = rs.pvp ? ` · you: ${rs.pvp.kills} kills, ${rs.pvp.deaths} deaths` : '';
      if (rs.winner === 255) big('DRAW', `nobody out-killed the rest${mine} · next wave in ${secs}`);
      else big(won ? 'YOU WIN!' : `${who} WINS`, `most kills: ${rs.pvp?.leaderKills ?? '?'}${mine} · next wave in ${secs}`, won ? '#80ff80' : '#ffd34a');
    } else if (rs.phase === Phase.Victory && siege) {
      const mine = game.myTeam !== Team.None && rs.winner === game.myTeam;
      if (rs.winner === Team.Red) big('THE FORTRESS HOLDS', `${mine ? 'you kept' : 'red kept'} the king alive · wave ${rs.wave} · next wave in ${secs}`, teamCss(Team.Red));
      else if (rs.winner === Team.Green) big('THE FORTRESS FALLS', `${mine ? 'you killed' : 'green killed'} the king · next wave in ${secs}`, teamCss(Team.Green));
      else big('STALEMATE', `wave ${rs.wave} · next wave in ${secs}`);
    } else if (rs.phase === Phase.Victory && regicide) {
      const loser = rs.winner === Team.Red ? Team.Green : Team.Red;
      const mine = game.myTeam !== Team.None && rs.winner === game.myTeam;
      if (rs.winner === 255) big('STALEMATE', `both kings stand · wave ${rs.wave} · next wave in ${secs}`);
      else big(`${TEAM_NAMES[rs.winner]} WINS`, `${mine ? 'you killed' : 'team ' + TEAM_NAMES[rs.winner].toLowerCase() + ' killed'} the ${TEAM_NAMES[loser].toLowerCase()} king · next wave in ${secs}`, teamCss(rs.winner));
    } else if (rs.phase === Phase.Victory && teams) {
      const mine = game.myTeam !== Team.None && rs.winner === game.myTeam;
      if (rs.winner === 255) big(rs.teamLeft[0] > 0 ? 'STALEMATE' : 'NO SURVIVORS', `wave ${rs.wave} · next wave in ${secs}`);
      else big(`${TEAM_NAMES[rs.winner]} WINS`, `${mine ? 'your team takes' : 'team ' + TEAM_NAMES[rs.winner].toLowerCase() + ' takes'} wave ${rs.wave} · next wave in ${secs}`, teamCss(rs.winner));
    } else if (rs.phase === Phase.Victory) {
      const won = rs.winner === game.myId;
      const who = (game.players.get(rs.winner)?.name ?? '').replace(/^BOT /, '');
      big(rs.winner === 255 ? 'NO SURVIVORS' : won ? 'YOU WIN!' : `${who} WINS`, `${rs.winner !== 255 && !won ? name(rs.winner) + ' takes ' : ''}wave ${rs.wave} · next wave in ${secs}`, won ? '#80ff80' : '#ffd34a');
    } else {
      // Live: the match card (wave, mode and clock, and how the sides stand)
      // on the same rows as HP and JET, plus the spectator banner once we're out.
      const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      const parts: { t: string; c: string }[] = [];
      const gap = { t: '  ', c: '#888' };
      let modeName = 'LAST MAN STANDING';
      let extra: { t: string; c: string } | null = null;
      if (extraction) {
        modeName = 'EXTRACTION';
        for (let t = 0; t < 4; t++) {
          if (t > 0) parts.push(gap);
          parts.push({ t: `${TEAM_NAMES[t]}${game.myTeam === t ? '*' : ''} ${rs.teamLeft[t] ?? 0}`, c: teamCss(t) });
        }
        const idol = rs.idol;
        const evac = rs.evac;
        let line = 'IDOL: deep in the sanctum';
        let color = '#ffd34a';
        if (idol && idol.holder !== 255) {
          const team = game.teamOf[idol.holder] ?? Team.None;
          line = idol.holder === game.myId ? 'YOU HAVE THE IDOL · get it to the surface' : `IDOL: carried by ${name(idol.holder)}${team !== Team.None ? ' (' + TEAM_NAMES[team] + ')' : ''}`;
          color = team !== Team.None ? teamCss(team) : color;
        } else if (idol && game.dungeon && Math.hypot(idol.x - game.dungeon.idol.x, idol.y - game.dungeon.idol.y) > 12) line = 'IDOL: dropped!';
        if (evac?.state === Evac.Inbound) line += evac.eta > 0 ? ` · EXTRACTION IN ${Math.ceil(evac.eta / TICK_RATE)}s` : ' · EXTRACTION LANDING';
        else if (evac?.state === Evac.Landed) line += ' · EXTRACTION WAITING';
        else if (evac?.state === Evac.Moving) line += ' · EXTRACTION MOVING';
        extra = { t: line, c: color };
      } else if (exterm) {
        modeName = 'EXTERMINATION';
        const lair = rs.lair;
        const left = lair?.beasts.length ?? 0;
        const awake = lair?.beasts.filter((b) => b.awake).length ?? 0;
        parts.push({ t: `BEASTS ${left}/${lair?.total ?? 4}`, c: left <= 1 ? '#80ff80' : '#ffd34a' }, gap, { t: `${awake} AWAKE`, c: awake > 0 ? '#ff8070' : '#9aa4ad' });
        extra = { t: awake > 0 ? 'KILL THEM · they hear you, and hunt you through the cave' : 'down the chutes into the lair · wake them, then kill them', c: awake > 0 ? '#ff8070' : '#c8d0d8' };
      } else if (pvp) {
        modeName = 'PVP';
        const st = rs.pvp;
        if (st) {
          const leading = st.leader === game.myId;
          const lead = st.leader === 255 ? 'nobody yet' : `${leading ? 'YOU' : name(st.leader).replace(/^BOT /, '')} ${st.leaderKills}`;
          parts.push({ t: `LEAD ${lead}`, c: leading ? '#80ff80' : '#ffd34a' }, gap, { t: `YOU ${st.kills}K ${st.deaths}D`, c: '#e8ecef' });
        }
      } else if (siege) {
        modeName = 'SIEGE';
        const id = rs.kings[Team.Red];
        const who = id === game.myId ? 'YOU' : (game.players.get(id)?.name ?? '?').replace(/^BOT /, '');
        const lives = rs.lives ?? 0;
        parts.push({ t: `♛ ${who}${game.myTeam === Team.Red && id !== game.myId ? ' (yours)' : ''}`, c: teamCss(Team.Red) }, { t: '  v  ', c: '#999' }, { t: `GREEN ${lives} LIVES`, c: lives <= 30 ? '#ff8070' : teamCss(Team.Green) });
        extra = { t: game.myTeam === Team.Red ? 'DEFEND · keep the king alive until the clock runs out' : game.myTeam === Team.Green ? 'ATTACK · cross the gap, break in, kill the king' : 'SIEGE', c: game.myTeam === Team.Green ? teamCss(Team.Green) : teamCss(Team.Red) };
        if (game.alive && game.isKing(game.myId) && secs > 20 * 60 - 5) big('YOU ARE KING', 'hold the vault · twenty minutes · if you fall, the fortress falls', teamCss(Team.Red));
      } else if (regicide) {
        modeName = 'REGICIDE';
        const king = (t: number) => {
          const id = rs.kings[t];
          const who = id === game.myId ? 'YOU' : (game.players.get(id)?.name ?? '?').replace(/^BOT /, '');
          return `♛ ${who}${game.myTeam === t && id !== game.myId ? ' (yours)' : ''}`;
        };
        parts.push({ t: king(Team.Red), c: teamCss(Team.Red) }, { t: '  v  ', c: '#999' }, { t: king(Team.Green), c: teamCss(Team.Green) });
        if (game.alive && game.isKing(game.myId) && secs > 12 * 60 - 5) big('YOU ARE KING', 'stay alive · if you fall, your side loses', teamCss(game.myTeam));
      } else if (teams) {
        modeName = 'TEAMS';
        const you = (t: number) => (game.myTeam === t ? '*' : '');
        parts.push({ t: `RED${you(Team.Red)} ${rs.teamLeft[0]}`, c: teamCss(Team.Red) }, { t: '  v  ', c: '#999' }, { t: `${rs.teamLeft[1]} GREEN${you(Team.Green)}`, c: teamCss(Team.Green) });
      } else parts.push({ t: `${rs.left} LEFT`, c: '#e8ecef' });
      this.drawMatchCard(`WAVE ${rs.wave} · ${modeName}`, clock, secs <= 30 ? '#ff8070' : '#ffd34a', parts, extra, s);
      if (!game.alive && !game.ride && !game.myCraft()) {
        const watching = game.spectate !== 255 ? game.spectate : null;
        const sides = rs.phase === Phase.Live && TEAMS_IN_MODE[rs.mode] >= 2 && !game.isKing(game.myId) ? TEAMS_IN_MODE[rs.mode] : 0;
        const dead = (status: string, secs: number | null) => this.drawDeath(game, { title: 'FRAGGED', color: '#ff4d3d', status, secs, watching, touch, teams: sides }, s, W, H);
        const spectating = watching !== null ? `spectating ${name(watching)} · ${touch ? 'tap' : 'click'} for next` : 'spectating';
        if (rs.out) dead('out for this wave', null);
        else if (rs.inWave && !game.fragged) {
          // Not on yet (just loaded in, or waiting for our rocket): loading out, not fragged.
          const back = Math.ceil(game.respawnTicks / TICK_RATE);
          const side = teams && game.myTeam !== Team.None ? `you fight for ${TEAM_NAMES[game.myTeam].toLowerCase()} · ` : '';
          big('LOADING OUT', `${side}${back > 1 ? `deploying in ${back}s` : 'drop rocket on its way'}`, teams && game.myTeam !== Team.None ? teamCss(game.myTeam) : '#ffd34a');
        } else if ((regicide || extraction || pvp || siege || exterm) && rs.inWave) {
          const back = Math.ceil(game.respawnTicks / TICK_RATE);
          dead(back > 0 ? 'redeploying in' : 'drop rocket inbound', back > 0 ? back : null);
        }
        else if (!rs.inWave) big('STAND BY', `wave in progress · you're in the next one · ${spectating}`, '#c8d0d8');
        else if (teams && game.myTeam !== Team.None) big('INBOUND', `you fight for ${TEAM_NAMES[game.myTeam].toLowerCase()} · drop rocket on its way`, teamCss(game.myTeam));
        else big('INBOUND', 'drop rocket on its way', '#ffd34a');
      }
    }
    ctx.textAlign = 'left';
  }

  /**
   * The match card: top left, under the HP and JET bars and the gold line,
   * as wide as the bars (wider if it must). Wave and mode, the clock (red in the last 30 s), and beneath them
   * how the sides stand; Extraction adds where the idol is under the card.
   */
  private drawMatchCard(title: string, clock: string, clockColor: string, parts: { t: string; c: string }[], extra: { t: string; c: string } | null, s: number): void {
    const ctx = this.ctx;
    const x = 14 * s;
    const y = 70 * s;
    const h = 32 * s;
    const pad = 8 * s;
    const small = `${Math.round(11 * s)}px ui-monospace, monospace`;
    const bold = `bold ${Math.round(12 * s)}px ui-monospace, monospace`;
    const big = `bold ${Math.round(14 * s)}px ui-monospace, monospace`;
    ctx.font = bold;
    const tw = ctx.measureText(title).width;
    ctx.font = big;
    const cw = ctx.measureText(clock).width;
    ctx.font = small;
    const pw = parts.reduce((w, p) => w + ctx.measureText(p.t).width, 0);
    const w = Math.max(tw + cw + pad * 3, pw + pad * 2, 180 * s);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = clockColor;
    ctx.fillRect(x, y, 2 * s, h);
    ctx.textAlign = 'left';
    ctx.font = bold;
    ctx.fillStyle = '#c8d0d8';
    ctx.fillText(title, x + pad, y + 13 * s);
    ctx.textAlign = 'right';
    ctx.font = big;
    ctx.fillStyle = clockColor;
    ctx.fillText(clock, x + w - pad, y + 14 * s);
    ctx.textAlign = 'left';
    ctx.font = small;
    let px = x + pad;
    for (const p of parts) {
      ctx.fillStyle = p.c;
      ctx.fillText(p.t, px, y + 27 * s);
      px += ctx.measureText(p.t).width;
    }
    if (extra) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const ew = ctx.measureText(extra.t).width + pad * 2;
      ctx.fillRect(x, y + h + 2 * s, ew, 16 * s);
      ctx.fillStyle = extra.c;
      ctx.fillText(extra.t, x + pad, y + h + 14 * s);
    }
  }

  /** The scope's reticle centre (canvas px), gliding toward the target; and whether we were scoped last frame. */
  private spot: { x: number; y: number } | null = null;
  private spotWasScoped = false;

  /** When the current big message first showed (it slides in each time it changes). */
  private bannerKey = '';
  private bannerAt = 0;
  /** This frame: the bottom of the big message or death card (device px), so what's under it can stack below. */
  private bannerBottom = 0;
  /** This frame: the death card is up (it holds the standings and the team switch itself). */
  private deathShown = false;
  /** The longest wait to come back we've seen since we died (ticks): the death card's bar fills toward it. */
  private respawnMax = 0;

  /** Team buttons (Renderer.teamHit), device px, by team. */
  private readonly teamRects: { x: number; y: number; w: number; h: number; i: number }[] = [];

  /** The team button under a CSS-pixel point, or -1. */
  teamHit(cssX: number, cssY: number): number {
    const dpr = this.canvas.width / innerWidth;
    const x = cssX * dpr;
    const y = cssY * dpr;
    for (const r of this.teamRects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.i;
    return -1;
  }

  /**
   * Dead, in a team mode: a card for each side (its colour, its name, how
   * many fight for it; ours lit and tagged), to switch to one with a click
   * or tap (or C for the next), down by the bottom of the screen, under the
   * standings.
   */
  private drawTeamPick(game: Game, n: number, touch: boolean, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    const gap = 8 * s;
    const bw = Math.min(150 * s, (W * 0.92 - gap * (n - 1)) / n);
    const bh = 54 * s;
    const total = n * bw + (n - 1) * gap;
    const x0 = (W - total) / 2;
    const y0 = H - 112 * s;
    const counts = new Array<number>(n).fill(0);
    for (const p of game.players.values()) {
      const t = game.teamOf[p.id] ?? Team.None;
      if (t < n) counts[t]++;
    }
    const teamCss = (t: number) => TEAM_COLORS[t]?.css ?? '#fff';
    ctx.save();
    ctx.textBaseline = 'middle';
    // The heading: what this is, and how.
    ctx.textAlign = 'left';
    ctx.font = uiFont(10.5 * s, 800);
    track(ctx, 2 * s);
    const head = touch ? 'TAP A TEAM TO SWITCH' : 'SWITCH TEAM';
    const hw = ctx.measureText(head).width + (touch ? 0 : 8 * s + 24 * s);
    const hy = y0 - 14 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(head, W / 2 - hw / 2 + s, hy + s);
    ctx.fillStyle = '#d9dde2';
    ctx.fillText(head, W / 2 - hw / 2, hy);
    if (!touch) keyChip(ctx, 'C', W / 2 - hw / 2 + ctx.measureText(head).width + 8 * s, hy, 10 * s, s);
    for (let t = 0; t < n; t++) {
      const x = x0 + t * (bw + gap);
      const mine = game.myTeam === t;
      const col = teamCss(t);
      panel(ctx, x, y0, bw, bh, s, undefined, 0.8);
      // Its colour washing up from the bottom: strong on ours.
      ctx.save();
      rrect(ctx, x, y0, bw, bh, 8 * s);
      ctx.clip();
      const g = ctx.createLinearGradient(0, y0 + bh, 0, y0);
      g.addColorStop(0, withAlpha(col, mine ? 0.55 : 0.2));
      g.addColorStop(1, withAlpha(col, mine ? 0.12 : 0.02));
      ctx.fillStyle = g;
      ctx.fillRect(x, y0, bw, bh);
      ctx.fillStyle = col;
      ctx.fillRect(x, y0 + bh - 3 * s, bw, 3 * s);
      ctx.restore();
      if (mine) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2 * s;
        rrect(ctx, x + s, y0 + s, bw - 2 * s, bh - 2 * s, 7 * s);
        ctx.stroke();
      }
      ctx.textAlign = 'left';
      ctx.font = uiFont(16 * s, 900, true);
      track(ctx, 1.5 * s);
      ctx.fillStyle = mine ? '#ffffff' : col;
      ctx.fillText(TEAM_NAMES[t], x + 12 * s, y0 + bh * 0.4);
      ctx.font = uiFont(10 * s, 600);
      track(ctx, 0.5 * s);
      ctx.fillStyle = mine ? 'rgba(255,255,255,0.85)' : '#9aa0a8';
      ctx.fillText(`${counts[t]} ${counts[t] === 1 ? 'clone' : 'clones'}`, x + 12 * s, y0 + bh * 0.72);
      if (mine) {
        // (Tagged: you're here.)
        ctx.font = uiFont(8 * s, 800);
        track(ctx, 1 * s);
        const tag = 'YOURS';
        const tw2 = ctx.measureText(tag).width + 10 * s;
        ctx.fillStyle = col;
        rrect(ctx, x + bw - tw2 - 8 * s, y0 + 8 * s, tw2, 14 * s, 7 * s);
        ctx.fill();
        ctx.fillStyle = '#0d0d10';
        ctx.textAlign = 'center';
        ctx.fillText(tag, x + bw - tw2 / 2 - 8 * s, y0 + 15 * s);
      }
      this.teamRects.push({ x, y: y0, w: bw, h: bh, i: t });
    }
    track(ctx, 0);
    ctx.restore();
  }

  /** Vote buttons (Renderer.voteHit), device px, by index into VOTE_MODES. */
  private readonly voteRects: { x: number; y: number; w: number; h: number; i: number }[] = [];

  /** The vote button (an index into VOTE_MODES) under a CSS-pixel point, or -1. */
  voteHit(cssX: number, cssY: number): number {
    const dpr = this.canvas.width / innerWidth;
    const x = cssX * dpr;
    const y = cssY * dpr;
    for (const r of this.voteRects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.i;
    return -1;
  }

  /**
   * The vote on the next wave's mode, under the result: a button for each
   * mode (its key, its name, its votes so far), ours lit gold, the
   * leaders' bars filled; and how long until the count.
   */
  private drawVote(vote: { counts: number[]; mine: number }, secs: number, touch: boolean, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    const MONO = 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
    const n = Math.min(vote.counts.length, VOTE_MODES.length);
    const cols = W / s < 760 ? 3 : n;
    const rows = Math.ceil(n / cols);
    const gap = 8 * s;
    const bw = Math.min(150 * s, (W * 0.92 - gap * (cols - 1)) / cols);
    const bh = 46 * s;
    const total = cols * bw + (cols - 1) * gap;
    const x0 = (W - total) / 2;
    const y0 = H * 0.6;
    const top = Math.max(1, ...vote.counts);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x0 - 12 * s, y0 - 30 * s, total + 24 * s, rows * bh + (rows - 1) * gap + 42 * s);
    ctx.font = `bold ${Math.round(13 * s)}px ${MONO}`;
    ctx.fillStyle = '#ffd34a';
    ctx.fillText(`VOTE: NEXT MODE · ${secs}s`, W / 2, y0 - 12 * s);
    for (let i = 0; i < n; i++) {
      const mode = VOTE_MODES[i];
      const x = x0 + (i % cols) * (bw + gap);
      const y = y0 + Math.floor(i / cols) * (bh + gap);
      const votes = vote.counts[i];
      const mine = vote.mine === mode;
      ctx.fillStyle = mine ? 'rgba(255,211,74,0.28)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, bw, bh);
      // (Its share of the votes so far, along the bottom.)
      if (votes > 0) {
        ctx.fillStyle = votes === top ? '#ffd34a' : '#8a96a0';
        ctx.fillRect(x, y + bh - 4 * s, (bw * votes) / top, 4 * s);
      }
      if (mine) {
        ctx.strokeStyle = '#ffd34a';
        ctx.lineWidth = Math.max(1, 2 * s);
        ctx.strokeRect(x + s, y + s, bw - 2 * s, bh - 2 * s);
      }
      ctx.fillStyle = mine ? '#ffe9a0' : '#e8ecef';
      ctx.font = `bold ${Math.round(11 * s)}px ${MONO}`;
      ctx.fillText(`${touch ? '' : i + 1 + ' '}${VOTE_NAMES[mode]}`, x + bw / 2, y + 18 * s);
      ctx.font = `${Math.round(11 * s)}px ${MONO}`;
      ctx.fillStyle = '#b8c2ca';
      ctx.fillText(`${votes} vote${votes === 1 ? '' : 's'}`, x + bw / 2, y + 34 * s);
      this.voteRects.push({ x, y, w: bw, h: bh, i });
    }
    ctx.restore();
  }

  /**
   * A big title across the screen at `top` (device px): heavy italic caps,
   * spaced, lit from above in its colour with a glow, over a hard shadow,
   * an accent bar drawing out under it. Sized to fit; `ease` (0..1) slides
   * and fades it in. Returns the bottom of the bar.
   */
  private drawTitle(text: string, color: string, top: number, ease: number, s: number, W: number): number {
    const ctx = this.ctx;
    const maxW = W * 0.86;
    let size = 58 * s;
    ctx.font = uiFont(size, 900, true);
    track(ctx, size * 0.08);
    const wanted = ctx.measureText(text.toUpperCase()).width;
    if (wanted > maxW) {
      size *= maxW / wanted;
      ctx.font = uiFont(size, 900, true);
      track(ctx, size * 0.08);
    }
    const label = text.toUpperCase();
    const k = 1 + (1 - ease) * 0.12;
    const cy = top + size * 0.55;
    ctx.save();
    ctx.translate(W / 2, cy);
    ctx.scale(k, k);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillText(label, 3 * s, 4 * s);
    ctx.shadowColor = color;
    ctx.shadowBlur = 28 * s;
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, color);
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.fillText(label, 0, 0);
    ctx.restore();
    track(ctx, 0);
    // The accent bar, drawing out from the middle, brightest at its centre.
    const by = top + size * 1.12;
    const bw = Math.min(maxW, 260 * s) * ease;
    const bar = ctx.createLinearGradient(W / 2 - bw / 2, 0, W / 2 + bw / 2, 0);
    bar.addColorStop(0, withAlpha(color, 0));
    bar.addColorStop(0.5, color);
    bar.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = bar;
    ctx.fillRect(W / 2 - bw / 2, by, bw, Math.max(2, 3 * s));
    return by + 3 * s;
  }

  /** When the current message, or death card, first showed (each slides in as it changes). */
  private easeIn(key: string): number {
    const now = performance.now();
    if (key !== this.bannerKey) {
      this.bannerKey = key;
      this.bannerAt = now;
    }
    const t = Math.min(1, (now - this.bannerAt) / 320);
    return 1 - (1 - t) * (1 - t) * (1 - t);
  }

  /** A soft dark band behind a message, from `y0` to `y1`, fading out at its edges (so it reads over anything). */
  private shade(y0: number, y1: number, a: number, W: number): void {
    const ctx = this.ctx;
    const pad = (y1 - y0) * 0.35 + 20;
    const g = ctx.createLinearGradient(0, y0 - pad, 0, y1 + pad);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.25, `rgba(6,6,10,${0.55 * a})`);
    g.addColorStop(0.75, `rgba(6,6,10,${0.55 * a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y0 - pad, W, y1 - y0 + pad * 2);
  }

  /**
   * A big centre-screen message ("WAVE 3", "RED WINS", "LOADING OUT"): the
   * title (drawTitle), then the status (the subtitle's first segment) in
   * spaced caps and the hints under it, dimmer, wrapped to fit (banner.ts).
   */
  private drawBanner(text: string, sub: string, color: string, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    const ease = this.easeIn(text);
    const maxW = W * 0.84;
    ctx.font = uiFont(13 * s, 500);
    const lay = layoutSub(sub, maxW, (x) => ctx.measureText(x).width);
    const top = H * 0.15;
    // (The band first, sized from a guess at the title's height.)
    const est = top + 58 * s * 1.2 + (lay.head ? 30 * s : 0) + lay.hints.length * 19 * s + 10 * s;
    ctx.save();
    ctx.globalAlpha = ease;
    this.shade(top, est, 1, W);
    let y = this.drawTitle(text, color, top, ease, s, W) + 14 * s;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (lay.head) {
      let hs = 15 * s;
      ctx.font = uiFont(hs, 700);
      track(ctx, 2 * s);
      while (hs > 8 && ctx.measureText(lay.head.toUpperCase()).width > maxW) {
        hs--;
        ctx.font = uiFont(hs, 700);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(lay.head.toUpperCase(), W / 2 + s, y + 8 * s + s);
      ctx.fillStyle = '#f4f4f6';
      ctx.fillText(lay.head.toUpperCase(), W / 2, y + 8 * s);
      y += 26 * s;
      track(ctx, 0);
    }
    ctx.font = uiFont(13 * s, 500);
    ctx.fillStyle = 'rgba(214,220,228,0.78)';
    for (const line of lay.hints) {
      ctx.fillText(line, W / 2, y + 8 * s);
      y += 19 * s;
    }
    ctx.restore();
    this.bannerBottom = Math.max(this.bannerBottom, y);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  /**
   * One row of the standings at (x, y), `w` wide, `rowH` tall: rank badge,
   * colour, name, K, D and K/D; ours lit (`k` odd rows striped).
   */
  private drawStandingRow(game: Game, p: PlayerInfo, rank: number, k: number, x: number, y: number, w: number, rowH: number, s: number): void {
    const ctx = this.ctx;
    const mine = p.id === game.myId;
    if (mine) {
      ctx.fillStyle = 'rgba(255,194,61,0.14)';
      rrect(ctx, x - 6 * s, y + 1 * s, w + 12 * s, rowH - 2 * s, 4 * s);
      ctx.fill();
    } else if (k % 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      ctx.fillRect(x - 6 * s, y, w + 12 * s, rowH);
    }
    const my = y + rowH / 2;
    const cR = x + w;
    const cD = cR - 44 * s;
    const cK = cD - 44 * s;
    const fs = Math.min(12.5 * s, rowH * 0.58);
    ctx.textBaseline = 'middle';
    rankBadge(ctx, rank, x + 9 * s, my, Math.min(8 * s, rowH * 0.38));
    ctx.fillStyle = p.color;
    ctx.fillRect(x + 22 * s, my - rowH * 0.27, 3 * s, rowH * 0.54);
    ctx.textAlign = 'left';
    ctx.font = uiFont(fs, mine ? 800 : 600);
    track(ctx, 0);
    ctx.fillStyle = mine ? '#ffd56a' : '#e8e8ea';
    ctx.fillText(fitText(ctx, mine ? `${p.name} (you)` : p.name, cK - 30 * s - (x + 30 * s)), x + 30 * s, my);
    ctx.textAlign = 'right';
    ctx.font = uiFont(fs, 700);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(p.kills), cK, my);
    ctx.fillStyle = '#b9bec5';
    ctx.fillText(String(p.deaths), cD, my);
    ctx.fillStyle = mine ? '#ffd56a' : '#ffffff';
    ctx.fillText(kdRatio(p.kills, p.deaths).toFixed(2), cR, my);
  }

  /** A small spaced-caps label at (x, y) (its left, middle). Returns its width. */
  private label(text: string, x: number, y: number, s: number, color = '#9aa0a8', size = 9): number {
    const ctx = this.ctx;
    ctx.font = uiFont(size * s, 800);
    track(ctx, 1.8 * s);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    const w = ctx.measureText(text).width;
    track(ctx, 0);
    return w;
  }

  /**
   * The death card: the screen's edges stained red, the title, and under it
   * one card with everything a dead clone needs, in order: who killed us
   * (their name in their colour, their score, the weapon in a tag) or what
   * did; the way back (redeploying, the time left, a bar filling toward
   * it; or out for the wave); where we stand (our place and numbers, and the
   * top of the standings, as many rows as there's room for); in a team mode
   * the sides, to switch to one (a click or tap, or C); and along its foot,
   * who we're watching and how to watch the next.
   */
  private drawDeath(game: Game, d: { title: string; color: string; status: string; secs: number | null; watching: number | null; touch: boolean; teams: number }, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    this.deathShown = true;
    const ease = this.easeIn(d.title + '·death');
    const now = performance.now();
    ctx.save();
    // The edges of the view, stained red, breathing.
    const pulse = 0.85 + 0.15 * Math.sin(now / 520);
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    v.addColorStop(0, 'rgba(90,0,0,0)');
    v.addColorStop(1, `rgba(110,6,6,${0.42 * ease * pulse})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = ease;
    const top = H * 0.07;
    const titleBottom = this.drawTitle(d.title, d.color, top, ease, s, W);
    const cw = Math.min(460 * s, W * 0.94);
    const cx = (W - cw) / 2;
    const cy = titleBottom + 12 * s;
    const pad = 16 * s;
    const iw = cw - pad * 2;
    const ix = cx + pad;
    // What goes in it, and how tall each part is.
    const killer = game.deathBy ? game.players.get(game.deathBy.id) : undefined;
    const cause = game.deathCause.replace(/ \[(.*)\]$/, ' · $1');
    const whoH = killer ? 62 * s : cause ? 50 * s : 0;
    const backH = 40 * s;
    const teamH = d.teams >= 2 ? 50 * s : 0;
    const footH = d.watching !== null ? 34 * s : 0;
    const me = game.players.get(game.myId);
    const kd = (p: { kills: number; deaths: number }) => kdRatio(p.kills, p.deaths);
    const rows = [...game.players.values()].sort((a, b) => kd(b) - kd(a) || b.kills - a.kills || a.deaths - b.deaths);
    const rank = rows.findIndex((p) => p.id === game.myId);
    const rowH = 21 * s;
    const fixed = whoH + backH + teamH + footH + pad * 0.5;
    // (The standings take what room is left above the inventory bar: up to five rows, ours always among them.)
    const room = H - 60 * s - cy - fixed - 30 * s;
    const nRows = me ? Math.max(0, Math.min(5, Math.floor(room / rowH))) : 0;
    const standH = nRows > 0 ? 30 * s + nRows * rowH + 8 * s : 0;
    const ch = fixed + standH;
    panel(ctx, cx, cy, cw, ch, s, killer?.color ?? d.color, 0.9);
    let y = cy + 6 * s;
    const divider = () => {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(ix, y, iw, Math.max(1, s));
    };
    // Who, or what.
    if (killer && game.deathBy) {
      this.label('KILLED BY', ix + 4 * s, y + 13 * s, s);
      ctx.font = uiFont(10 * s, 800);
      track(ctx, 1.2 * s);
      const wl = game.deathBy.weapon.toUpperCase();
      const ww = ctx.measureText(wl).width + 16 * s;
      const wy = y + 24 * s;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      rrect(ctx, ix + iw - ww, wy - 11 * s, ww, 22 * s, 11 * s);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = Math.max(1, s);
      rrect(ctx, ix + iw - ww + 0.5, wy - 11 * s + 0.5, ww - 1, 22 * s - 1, 11 * s);
      ctx.stroke();
      ctx.fillStyle = '#f2f2f2';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(wl, ix + iw - ww / 2, wy);
      track(ctx, 0);
      ctx.textAlign = 'left';
      ctx.font = uiFont(21 * s, 800);
      ctx.fillStyle = killer.color;
      ctx.fillText(fitText(ctx, killer.name, iw - ww - 12 * s), ix + 4 * s, y + 32 * s);
      ctx.font = uiFont(10.5 * s, 600);
      ctx.fillStyle = '#b4b9c0';
      ctx.fillText(`${killer.kills} kills · ${killer.deaths} deaths · K/D ${kd(killer).toFixed(2)}`, ix + 4 * s, y + 51 * s);
      y += whoH;
      divider();
    } else if (cause) {
      this.label('CAUSE OF DEATH', ix + 4 * s, y + 13 * s, s);
      ctx.font = uiFont(16 * s, 700);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(fitText(ctx, cause.charAt(0).toUpperCase() + cause.slice(1), iw - 4 * s), ix + 4 * s, y + 33 * s);
      y += whoH;
      divider();
    }
    // The way back.
    const ry = y + 15 * s;
    this.label(d.status.toUpperCase(), ix + 4 * s, ry, s, '#e6e8eb', 10.5);
    if (d.secs !== null) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = uiFont(15 * s, 800);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${Math.floor(d.secs / 60)}:${String(d.secs % 60).padStart(2, '0')}`, ix + iw, ry);
    }
    const barY = ry + 12 * s;
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    rrect(ctx, ix, barY, iw, 4 * s, 2 * s);
    ctx.fill();
    const prog = d.secs === null ? (d.status.startsWith('out') ? 0 : 1) : this.respawnMax > 0 ? Math.max(0, Math.min(1, 1 - game.respawnTicks / this.respawnMax)) : 0;
    if (prog > 0) {
      ctx.fillStyle = d.color;
      rrect(ctx, ix, barY, Math.max(4 * s, iw * prog), 4 * s, 2 * s);
      ctx.fill();
    }
    y += backH;
    // Where we stand.
    if (nRows > 0 && me) {
      divider();
      const hy = y + 15 * s;
      this.label('STANDINGS', ix + 4 * s, hy, s);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = uiFont(10.5 * s, 700);
      const tail = `  of ${rows.length}   ·   ${me.kills} K   ${me.deaths} D   ${kd(me).toFixed(2)} K/D`;
      ctx.fillStyle = '#9aa0a8';
      ctx.fillText(tail, ix + iw, hy);
      ctx.fillStyle = '#ffc23d';
      ctx.font = uiFont(10.5 * s, 800);
      ctx.fillText(`#${rank + 1}`, ix + iw - (ctx.measureText(tail).width + 0), hy);
      y += 30 * s;
      // (The top, with ours in the last place if it isn't up there.)
      const list = rows.slice(0, nRows).map((p, i) => ({ p, r: i + 1 }));
      if (rank >= nRows) list[nRows - 1] = { p: me, r: rank + 1 };
      list.forEach((e, k) => this.drawStandingRow(game, e.p, e.r, k, ix + 4 * s, y + k * rowH, iw - 8 * s, rowH, s));
      y += nRows * rowH + 8 * s;
    }
    // The sides.
    if (d.teams >= 2) {
      divider();
      const ty = y + 10 * s;
      const th = 30 * s;
      const lw = this.label('TEAM', ix + 4 * s, ty + th / 2, s);
      let bx = ix + 4 * s + lw + 8 * s;
      if (!d.touch) bx += keyChip(ctx, 'C', bx, ty + th / 2, 9 * s, s) + 10 * s;
      const gap = 6 * s;
      const bw = (ix + iw - bx - gap * (d.teams - 1)) / d.teams;
      const counts = new Array<number>(d.teams).fill(0);
      for (const p of game.players.values()) {
        const t = game.teamOf[p.id] ?? Team.None;
        if (t < d.teams) counts[t]++;
      }
      for (let t = 0; t < d.teams; t++) {
        const x = bx + t * (bw + gap);
        const col = TEAM_COLORS[t]?.css ?? '#fff';
        const mine = game.myTeam === t;
        ctx.fillStyle = withAlpha(col, mine ? 0.5 : 0.12);
        rrect(ctx, x, ty, bw, th, 6 * s);
        ctx.fill();
        ctx.strokeStyle = withAlpha(col, mine ? 1 : 0.55);
        ctx.lineWidth = Math.max(1, (mine ? 2 : 1) * s);
        rrect(ctx, x + 0.5, ty + 0.5, bw - 1, th - 1, 6 * s);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = uiFont(Math.min(12 * s, bw / 6), 900, true);
        track(ctx, 1 * s);
        ctx.fillStyle = mine ? '#ffffff' : col;
        ctx.fillText(`${TEAM_NAMES[t]}${bw > 90 * s ? `  ${counts[t]}` : ''}`, x + bw / 2, ty + th / 2);
        track(ctx, 0);
        this.teamRects.push({ x, y: ty, w: bw, h: th, i: t });
      }
      y += teamH;
    }
    // Along its foot: who we're watching.
    if (d.watching !== null) {
      ctx.save();
      rrect(ctx, cx, cy, cw, ch, 8 * s);
      ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(cx, cy + ch - footH, cw, footH);
      ctx.restore();
      const fy = cy + ch - footH / 2;
      const who = game.players.get(d.watching);
      const lw = this.label('SPECTATING', ix + 4 * s, fy, s);
      ctx.font = uiFont(12.5 * s, 700);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = who?.color ?? '#fff';
      ctx.font = uiFont(10 * s, 700);
      const nextW = ctx.measureText('NEXT').width;
      ctx.font = uiFont(12.5 * s, 700);
      const chipW = (d.touch ? 28 : 42) * s;
      ctx.fillText(fitText(ctx, who ? who.name : '—', iw - lw - 30 * s - chipW - nextW), ix + 4 * s + lw + 10 * s, fy);
      ctx.textAlign = 'right';
      ctx.font = uiFont(10 * s, 700);
      ctx.fillStyle = '#c9cdd3';
      ctx.fillText('NEXT', ix + iw, fy);
      const label = d.touch ? 'TAP' : 'CLICK';
      ctx.font = uiFont(9 * s, 700);
      track(ctx, 0.5 * s);
      const kw = Math.max(9 * s * 1.7, ctx.measureText(label).width + 9 * s * 0.9);
      track(ctx, 0);
      keyChip(ctx, label, ix + iw - nextW - 6 * s - kw, fy, 9 * s, s);
    }
    ctx.restore();
    this.bannerBottom = Math.max(this.bannerBottom, cy + ch);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  /**
   * The scoreboard (held Tab): every clone, ranked by wins, then score
   * (scoreOf: clones and creatures killed, less a point a teamkill), then
   * gold; rank badge, colour, wins, score, kills, wildlife, deaths, K/D;
   * ours lit. Two
   * columns when they won't fit in one; if they still don't, the last line
   * says how many more there are (and ours is always shown).
   */
  private drawScoreboard(game: Game, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    const rows = [...game.players.values()].sort((a, b) => b.wins - a.wins || scoreOf(b) - scoreOf(a) || b.gold - a.gold);
    const pad = 16 * s;
    const headH = 44 * s;
    const colH = 20 * s;
    const avail = H - 40 * s - headH - colH - pad * 2;
    const perOne = Math.max(1, Math.floor(avail / (22 * s)));
    const cols = rows.length > perOne && W > 760 * s ? 2 : 1;
    const perCol = Math.min(Math.ceil(rows.length / cols), perOne);
    // (What fits: everyone, or all but the last line, which counts the rest; ours swapped in if it fell off.)
    const cap = cols * perCol;
    const list = rows.map((p, i) => ({ p, rank: i + 1 }));
    let shown = list;
    let more = 0;
    if (list.length > cap) {
      shown = list.slice(0, cap - 1);
      const mine = list.findIndex((e) => e.p.id === game.myId);
      if (mine >= cap - 1) shown[cap - 2] = list[mine];
      more = list.length - shown.length;
    }
    const rowH = Math.min(24 * s, Math.max(14 * s, avail / Math.max(1, perCol)));
    const colW = Math.min(500 * s, (W * 0.94 - pad * 2 - (cols - 1) * 18 * s) / cols);
    const w = colW * cols + (cols - 1) * 18 * s + pad * 2;
    const h = pad * 2 + headH + colH + perCol * rowH;
    const x0 = (W - w) / 2;
    const y0 = Math.max(20 * s, (H - h) / 2);
    panel(ctx, x0, y0, w, h, s, undefined, 0.92);
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = uiFont(20 * s, 900, true);
    track(ctx, 2 * s);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('SCOREBOARD', x0 + pad, y0 + pad + 12 * s);
    ctx.textAlign = 'right';
    ctx.font = uiFont(11 * s, 700);
    track(ctx, 1.2 * s);
    ctx.fillStyle = '#9aa0a8';
    ctx.fillText(`${rows.length} ${rows.length === 1 ? 'CLONE' : 'CLONES'}`, x0 + w - pad, y0 + pad + 12 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x0 + pad, y0 + pad + headH - 8 * s, w - pad * 2, Math.max(1, s));
    for (let c = 0; c < cols; c++) {
      const cx = x0 + pad + c * (colW + 18 * s);
      const cR = cx + colW - 6 * s;
      const cD = cR - 50 * s;
      const cB = cD - 54 * s;
      const cK = cB - 62 * s;
      const cS = cK - 44 * s;
      const cW = cS - 52 * s;
      let y = y0 + pad + headH + colH / 2;
      ctx.font = uiFont(9 * s, 700);
      track(ctx, 1.2 * s);
      ctx.fillStyle = '#7d838b';
      ctx.textAlign = 'left';
      ctx.fillText('PLAYER', cx + 32 * s, y);
      ctx.textAlign = 'right';
      ctx.fillText('WINS', cW, y);
      ctx.fillText('SCORE', cS, y);
      ctx.fillText('KILLS', cK, y);
      ctx.fillText('WILDLIFE', cB, y);
      ctx.fillText('DEATHS', cD, y);
      ctx.fillText('K/D', cR, y);
      y += colH / 2;
      shown.slice(c * perCol, (c + 1) * perCol).forEach(({ p, rank }, i) => {
        const ry = y + i * rowH;
        const my = ry + rowH / 2;
        const mine = p.id === game.myId;
        if (mine) {
          ctx.fillStyle = 'rgba(255,194,61,0.14)';
          rrect(ctx, cx - 4 * s, ry + s, colW + 4 * s, rowH - 2 * s, 4 * s);
          ctx.fill();
        } else if (i % 2) {
          ctx.fillStyle = 'rgba(255,255,255,0.025)';
          ctx.fillRect(cx - 4 * s, ry, colW + 4 * s, rowH);
        }
        rankBadge(ctx, rank, cx + 9 * s, my, Math.min(8 * s, rowH * 0.38));
        ctx.fillStyle = p.color;
        ctx.fillRect(cx + 22 * s, my - rowH * 0.28, 3 * s, rowH * 0.56);
        ctx.textAlign = 'left';
        ctx.font = uiFont(Math.min(12.5 * s, rowH * 0.56), mine ? 800 : 600);
        track(ctx, 0);
        ctx.fillStyle = mine ? '#ffd56a' : '#e8e8ea';
        ctx.fillText(fitText(ctx, p.name, cW - 40 * s - (cx + 32 * s)), cx + 32 * s, my);
        ctx.textAlign = 'right';
        ctx.font = uiFont(Math.min(12.5 * s, rowH * 0.56), 700);
        ctx.fillStyle = '#ffd56a';
        ctx.fillText(String(p.wins), cW, my);
        const sc = scoreOf(p);
        ctx.font = uiFont(Math.min(12.5 * s, rowH * 0.56), 800);
        ctx.fillStyle = sc < 0 ? '#ff7a6a' : '#ffffff';
        ctx.fillText(String(sc), cS, my);
        ctx.font = uiFont(Math.min(12.5 * s, rowH * 0.56), 700);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(p.kills), cK, my);
        ctx.fillStyle = '#8fd8ee';
        ctx.fillText(String(p.beasts), cB, my);
        ctx.fillStyle = '#b9bec5';
        ctx.fillText(String(p.deaths), cD, my);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(kdRatio(p.kills, p.deaths).toFixed(2), cR, my);
      });
      if (more && c === cols - 1) {
        const ry = y + (shown.length - c * perCol) * rowH;
        ctx.textAlign = 'center';
        ctx.font = uiFont(Math.min(11 * s, rowH * 0.5), 700);
        track(ctx, 1.2 * s);
        ctx.fillStyle = '#7d838b';
        ctx.fillText(`+${more} MORE`, cx + colW / 2, ry + rowH / 2);
        track(ctx, 0);
      }
    }
    track(ctx, 0);
    ctx.restore();
  }
}

function countLoaded(game: Game): number {
  let n = 0;
  for (let i = 0; i < CHUNK_COUNT; i++) n += game.loaded[i];
  return n;
}

/** A spider droid's remembered feet (world cells), each foot's step (from, and progress 0..1; 1 = planted). */
interface DroidGait {
  x: Float32Array;
  y: Float32Array;
  fx: Float32Array;
  fy: Float32Array;
  t: Float32Array;
  at: number;
  init: boolean;
  lx: number;
  ly: number;
  bob: number;
  /** Body pitch (radians, clockwise on screen), easing toward the ground's slope. */
  tilt: number;
}
/** Droid legs (in DROID_LEGS order: back outer to front outer): hips along the chassis (droid-local x, facing right). */
const DROID_HIP_X = [0.6, 1.9, 3.2, 4.8, 6.1, 7.4];
/** Where each foot rests, out from the body's centre (cells, + ahead): wide, a spider's stance. */
const DROID_REST = [-11.5, -7.8, -4.2, 4.2, 7.8, 11.5];
/** Which of the two alternating tripods each leg steps with (outer and inner one side, middle the other). */
const DROID_TRIPOD = [0, 1, 0, 1, 0, 1];
/** Thigh and shin lengths (cells): a short rise to the knee, a long reach down. */
const DROID_THIGH = 5.2;
const DROID_SHIN = 9;
/** How far a foot may lag where it belongs before it steps, and how long a step takes (s). */
const DROID_STRIDE = 3.6;
const DROID_STEP_TIME = 0.085;
/** The tarantula's hips along its body (world cells either side of its centre, facing right; DROID_LEGS order). */
const TARANTULA_HIPS = [-15, -10, -5, 5, 10, 15];
/** The steepest its body pitches to the ground's slope, and how far it rears up a wall it's climbing (radians). */
const DROID_MAX_TILT = 0.6;
const DROID_WALL_TILT = 0.9;

/** A tiny five-pointed star at (x, y), `r` across its points: gold, a dark edge. */
function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    if (k) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.lineWidth = Math.max(1, r * 0.45);
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.stroke();
  ctx.fillStyle = '#ffe27a';
  ctx.fill();
}
