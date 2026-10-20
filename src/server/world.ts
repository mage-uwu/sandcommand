import { type Body, BTN_DOWN, BTN_FIRE, BTN_LEFT, BTN_LOCK, BTN_RELOAD, BTN_RIGHT, BTN_SCOPE, BTN_UP, STANCE_H, Stance, newBody, shoulderAt, stepBody } from '../shared/actor.ts';
import { FACTION_SHIFT, STANCE_SHIFT } from '../shared/protocol.ts';
import { FACTIONS, rollFaction } from '../shared/factions.ts';
import {
  BAY_AT,
  MAX_SHIPS,
  SHIP_H,
  ENGINE_NOZZLE_Y,
  ENGINE_X,
  SHIP_INTEGRITY,
  SHIP_PARTS,
  SHIP_PART_CENTER,
  SHIP_HP,
  SHIP_W,
  type Ship,
  ShipMission,
  ShipPart,
  TURRET_AT,
  hasShipPart,
  newShip,
  shipLocal,
  shipPartAt,
  shipSegmentSolid,
  shipSolidAt,
  shipPoint,
  SHIP_RIDERS,
  shipSeat,
  stepShip,
} from '../shared/dropship.ts';
import {
  CANNON_INTERVAL,
  CANNON_SPEED,
  MAX_TANKS,
  SMG_INTERVAL,
  SMG_SPEED,
  SMG_SPREAD,
  TANK_H,
  TANK_INTEGRITY,
  TANK_PARTS,
  TANK_HP,
  TANK_W,
  EXPOSED_H,
  EXPOSED_SEAT_Y,
  type Tank,
  TankPart,
  hasTankPart,
  newTank,
  stepTank,
  tankMuzzle,
  tankPartAt,
  tankPoint,
  tankLocal,
  tankSink,
  tankW,
  gunPivotY,
  tankCoreY,
  tankH,
  isDog,
  TankKind,
  isPet,
  isMole,
  newMole,
  MOLE_SCALE,
  MOLE_FRILL_BOX,
  MOLE_SMG_INTERVAL,
  MOLE_PLASMA_INTERVAL,
  PLASMA_SPEED,
  isSpider,
  surfCapacity,
  surfSeat,
  designW,
  hitH,
  partCenter,
  newTarantula,
  SPIDER_BEAM_ENERGY,
  SPIDER_BEAM_WIDTH,
  SPIDER_BEAM_WOUND,
  SPIDER_VAPOR_BURN,
  SPIDER_VAPOR_CORE,
  SPIDER_VAPOR_R,
  SPIDER_LASER_INTERVAL,
  SPIDER_MISSILE_INTERVAL,
  SPIDER_MISSILE_SPEED,
  TARANTULA_SCALE,
  WATCHDOG_SCALE,
} from '../shared/tank.ts';
import { DOG_KIT, type DogFoe, type DogMemory, SPIDER_KIT, dogThink, newDogMemory } from './watchdog.ts';
import {
  CRAFT_H,
  CRAFT_INERTIA,
  CRAFT_HP,
  CRAFT_INTEGRITY,
  CRAFT_PARTS,
  CRAFT_PART_CENTER,
  CRAFT_W,
  type Craft,
  CraftPart,
  CraftPhase,
  IMPACT_HARM_SPEED,
  MAX_CRAFTS,
  craftHalfExtents,
  craftPartAt,
  craftToLocal,
  craftToWorld,
  hasCraftPart,
  newCraft,
  newCraftStep,
  stepCraft,
} from '../shared/craft.ts';
import {
  BLEED_PER_STUMP,
  DROID_HEADLESS_BLEED,
  headless,
  type BodyState,
  type Mobility,
  PART_COUNT,
  Part,
  DROID_LEGS,
  DroidPart,
  type StrikeResult,
  harm,
  has,
  mobility,
  newBodyState,
  newStrike,
  partAt,
  partHealth,
  resetBody,
  rollClass,
  strike,
  stumps,
} from '../shared/body.ts';
import { Writer, rleEncode } from '../shared/codec.ts';
import { BotBrain, botName } from './bots.ts';
import { type GroundItem, INV_DROP, INV_MAX, INV_PICKUP, type InvItem, ITEM_LIFE, MAX_ITEMS, NO_WEAPON, PICKUP_R, invByte, invSlot, invVersionBits, newItem, spawnLoadout, stepItem } from '../shared/items.ts';
import { BuildResult, type BuildBlocker, PIECES, pieceOf, applyBuild, canBuild } from '../shared/build.ts';
import {
  ACTOR_H,
  ACTOR_MAX_HP,
  ACTOR_W,
  BLIP_X,
  BLIP_Y,
  CHUNK,
  CHUNK_BYTES_PER_TICK,
  CHUNK_COUNT,
  CHUNK_INTEREST_MARGIN,
  CHUNK_SHIFT,
  CHUNKS_X,
  CHUNKS_Y,
  DT,
  ENTITY_INTEREST_MARGIN,
  FALL_DAMAGE_SPEED,
  GRAVITY,
  FAR_UPDATE_INTERVAL,
  MAX_PLAYERS,
  POS_SCALE,
  RESPAWN_TICKS,
  TICK_RATE,
  VEL_SCALE,
  VIEW_HALF_H,
  VIEW_HALF_W,
  WORLD_H,
  WORLD_W,
} from '../shared/constants.ts';
import { Collider, DistanceField } from '../shared/field.ts';
import { Projectiles, pickHeat, segmentBox } from '../shared/kernels.ts';
import { ActorField, NO_OWNER, PK, Particles, W_VENOM, W_ASP, W_COIL, W_SEED, W_BASILISK, W_BLISTER, W_GEYSER, W_CRAFT, W_SHIP, W_TANK, W_TRAP, W_LASER, W_RAM, W_STONEBURNER, W_DRAGON, W_SPIDER, applyCarve, carveExtent, craftFragments, craftPartFragments, dropToSupport, explosionFragments, releaseCarve, spillGold } from '../shared/particles.ts';
import { MAT_ADAMANT, MAT_FIXED, MAT_TOUGH, Mat, digValue } from '../shared/materials.ts';
import {
  F_ALIVE,
  F_FACE_LEFT,
  F_RELOAD,
  Phase,
  F_CLASS_SHIFT,
  F_FIRING,
  F_GROUND,
  F_JET,
  R_ACTORS,
  R_BLIPS,
  R_BUILD,
  R_ROUND,
  R_TRAPS,
  R_BEAM,
  R_HEAL,
  R_SPOTTED,
  R_MINES,
  R_GEYSERS,
  R_GEYSER_BLOW,
  R_FLORA,
  R_WATER,
  R_BEASTS,
  R_BEAST_DIE,
  R_VENOM,
  R_CORAL,
  R_BURNERS,
  R_STONEBURN,
  BEAST_SCALE,
  BEAST_SAME,
  GF_CAVE,
  GF_RUMBLE,
  GF_TOXIC,
  GF_DEAD,
  R_WAVE,
  R_TEAMS,
  R_TANKS,
  R_TANK_SELF,
  R_SHIPS,
  R_SHIP_PART,
  R_SHIP_BOOM,
  CALL_COST,
  callCost,
  WATCHDOG_COST,
  TARANTULA_COST,
  MOLE_COST,
  CallKind,
  R_TANK_PART,
  R_TANK_BOOM,
  Evac,
  GameMode,
  TEAMS_IN_MODE,
  VOTE_MODES,
  Team,
  R_ITEMS,
  R_ITEMS_GONE,
  R_CARVE,
  R_CHAT,
  R_CHUNK,
  R_CRAFTS,
  R_CRAFT_BOOM,
  R_CRAFT_PART,
  R_CRAFT_SELF,
  R_DETACH,
  R_HIT,
  R_KILL,
  R_PIXELS,
  R_PROJ_END,
  R_PROJ_SPAWN,
  R_ROSTER,
  R_SCORES,
  R_SELF,
  S_FRAME,
  Y_BIAS,
  dequantizeAim,
  quantizeAim,
} from '../shared/protocol.ts';
import { Rng, hash2 } from '../shared/rng.ts';
import { Terrain, forChunksInRect } from '../shared/terrain.ts';
import { BURNER_FUSE, BURNER_STICK_R, BURNER_STRIKE, BURNER_THROW, BurnerPhase, FOOT_LIFE, SLUDGE_BITE, SLUDGE_BLOBS, SLUDGE_R, STONE_CORE_R, STONE_COVER, STONE_CRATER_R, STONE_HARM, STONE_HARM_R, STONE_HEAT_R, STONE_KILL_R, STONE_NO_COVER, STONE_PUSH, STONE_PUSH_R } from '../shared/stoneburner.ts';
import { LASER_MAX, LASER_MIN, PROJ_LASER, laserEnergy, laserWidth, laserWound, PROJ_IDOL, BLAST_IMPULSE, DIGGER_CORE, DIGGER_CORE_DROID, DIGGER_R, DIGGER_R_DROID, DIGGER_REACH, PROJ, PROJ_BUILD, PROJ_DIG, PROJ_RADIO, PROJ_REPAIR, PROJ_MINE, PROJ_BURNER, ProjKind, REGROW_TICKS, HEAL_R, HEAL_SPREAD, MEND_TICKS, REPAIR_HP, REPAIR_WOUND, WeaponId, SHOULDER_X, SHOULDER_Y, WEAPONS, fireInterval, lockReach, muzzlePoint } from '../shared/weapons.ts';
import { type Dungeon, EVAC_H, EVAC_W, ROOM_B, ROOM_L, ROOM_R, ROOM_T, SPIKE_DEPTH, TrapKind, Y0, cellX, cellY } from '../shared/dungeon.ts';
import { sightLine } from '../shared/scope.ts';
import { MapKind, generateWorld, lastCaves, lastComplexes, lastDungeon, lastFlora, lastGeysers, lastLair, lastSiege, lastValley, lastWater } from '../shared/worldgen.ts';
import type { Lair } from '../shared/lair.ts';
import { ballisticAim } from '../shared/ballistics.ts';
import {
  type Beast,
  MILLI_COIL_BREAK,
  MILLI_COIL_CD,
  MILLI_COIL_DROID,
  MILLI_COIL_KILL,
  MILLI_COIL_R,
  MILLI_COIL_TICKS,
  MILLI_FREEZE_MAX,
  MILLI_FREEZE_MIN,
  MILLI_DROP_REACH,
  MILLI_DROP_STEER,
  MILLI_LUNGE,
  MILLI_LUNGE_TICKS,
  MILLI_ROOST,
  MILLI_SENSE_FROZEN,
  onCeiling,
  mouthOpening,
  noteSeen,
  patchOf,
  awayX,
  awayY,
  MILLI_MOUTH_R,
  MILLI_MOUTH_CD,
  MILLI_WANDER,
  MILLI_CRAWL,
  MILLI_HP,
  MILLI_HUNT,
  MILLI_R,
  MILLI_REAR,
  MILLI_SENSE,
  MILLI_SPIT_AT,
  MILLI_SPIT_CD,
  MILLI_SPIT_RANGE,
  MILLI_SPIT_SPEED,
  VENOM_DOSE,
  VENOM_MAX,
  VENOM_RATE,
  bodyPoints,
  fling,
  FLING_CD,
  flingStep,
  sprintTick,
  FLING_MIN,
  FLING_MAX,
  crawlStep,
  fallStep,
  nearestPoint,
  newMillipede,
  newBeast,
  onFloor,
  BeastKind,
  BEAST_BUILD,
  ASP_BITE,
  ASP_BITE_CD,
  ASP_BITE_R,
  ASP_BITE_VENOM,
  ASP_CRAWL,
  ASP_DISGUISE_MAX,
  ASP_DISGUISE_MIN,
  ASP_HISS,
  ASP_HUNT,
  ASP_SENSE,
  ASP_STRIKE,
  ASP_STRIKE_TICKS,
  ASP_TRIGGER,
  ASP_WANDER,
  pushTrail,
  segmentCircle,
  turnRound,
  CORAL_FATAL,
  CORAL_GROW,
  CORAL_HP,
  CORAL_LIMBS,
  CORAL_SEED,
  CORPSE_BROOD,
  CORPSE_BROOD_MORE,
  NEST_BROOD,
  NEST_BROOD_CD,
  NEST_LOOK,
  NEST_SENSE,
  SEEDER_DART,
  SEEDER_EXPIRE,
  SEEDER_IDLE,
  SEEDER_SENSE,
  SEEDER_STING,
  SEEDER_LEG,
  SEEDERS_MAX,
  NEST_FORAGE_CD,
  NEST_FORAGERS,
  SEEDER_STING_CD,
  SEEDER_STING_R,
  anchorNest,
  flierPoints,
  flyStep,
  nestCentre,
  newSeeder,
  hitScale,
  BASILISK_BITE,
  BASILISK_HOLD,
  BASILISK_MAUL,
  BASILISK_FLING,
  MILLI_FLING,
  MILLI_COIL_SEGS,
  DRAGON_ODDS,
  DRAGON_R,
  DRAGON_SPIT_CD,
  DRAGON_SPIT_RANGE,
  DRAGON_SPIT_SPEED,
  DRAGON_BREATH_PER,
  DRAGON_BREATH_SPREAD,
  DRAGON_BREATH_TICKS,
  DRAGON_BROOD_CD,
  DRAGON_BROOD_CROWD,
  DRAGON_BROOD_FLING,
  DRAGON_BROOD_MAX,
  DRAGON_BROOD_MIN,
  DRAGON_BROOD_RANGE,
  DRAGON_ROAR,
  DRAGON_ROAR_SPIT,
  wyrm,
  wyrmScale,
  BASILISK_BITE_CD,
  BASILISK_BORE,
  BASILISK_BORE_EVERY,
  BASILISK_CALM,
  BASILISK_CREEP,
  BASILISK_CRUSH,
  BASILISK_DEEP,
  BASILISK_FEEL,
  BASILISK_HP,
  BASILISK_HUNT,
  BASILISK_JAWS,
  BASILISK_R,
  BASILISK_RISE,
  BASILISK_SENSE,
  BASILISK_SLEEP_MAX,
  BASILISK_SLEEP_MIN,
  BASILISK_STIR,
  BASILISK_TOUCH,
  BASILISK_WAKE,
  boreStep,
  boreable,
  loopWatch,
  resetLoop,
  crawler,
  CSPIDER_BITE,
  CSPIDER_BITE_CD,
  CSPIDER_BITE_R,
  CSPIDER_CRAWL,
  CSPIDER_DASH,
  CSPIDER_DASH_R,
  CSPIDER_DASH_TICKS,
  CSPIDER_FREEZE_MAX,
  CSPIDER_FREEZE_MIN,
  CSPIDER_HUNT,
  CSPIDER_LEAP,
  CSPIDER_LEAP_CD,
  CSPIDER_LEAP_MAX,
  CSPIDER_SENSE,
  CSPIDER_SENSE_FROZEN,
  CSPIDER_SHARE,
  CSPIDER_SHOVE,
  CSPIDER_WANDER,
  CSPIDER_RIP,
  CSPIDER_MAUL,
  CSPIDER_HOLD,
  CSPIDER_HOLD_BITE,
  CSPIDER_HOLD_BREAK,
  CSPIDER_HOLD_DRAG,
  CSPIDER_HOLD_FLING,
  CSPIDER_PACK_MIN,
  CSPIDER_PACK_MAX,
  CSPIDER_PACK_CALL,
  CSPIDER_HOME_R,
  WEB_LIMBS,
  CSPIDER_CARRY_MAX,
} from '../shared/wildlife.ts';
import { WATER_TICKS, type WaterBody, paintWater, solveLevel } from '../shared/water.ts';
import { BLISTER_DAMAGE, BLISTER_FUSE_HIT, BLISTER_FUSE_TOUCH, BLISTER_R, BLISTER_TOUCH, type Flora, FloraKind, floraBox, GEYSER_BLAST, GEYSER_BLAST_R, GEYSER_CHANCE, GEYSER_CLOUD_R, GEYSER_COOLDOWN, GEYSER_FUSE, GEYSER_FUSE_SHOT, GEYSER_HP, GEYSER_TOXIC, GEYSER_TOXIC_TICKS, geyserBurst, geyserCloud } from '../shared/frosting.ts';
import { ATTACKERS, DEFENDERS, SIEGE_ATK_TARANTULA, SIEGE_DEF_TARANTULA, SIEGE_LIVES, SIEGE_TICKS, type SiegeMap } from '../shared/siege.ts';
import type { CaveNet } from '../shared/caves.ts';
import type { Fortress } from '../shared/structures.ts';
import { ClassId } from '../shared/body.ts';
import { cleanChat, cleanName } from './guard.ts';

export interface ClientLink {
  send(data: Uint8Array): void;
}

export interface InputCmd {
  seq: number;
  buttons: number;
  aim: number; // quantized u16
  /** Inventory selection and pick-up/drop keys (see invByte in items.ts). */
  inv: number;
}

export class Player {
  readonly body: Body;
  /** Modular body: which parts are attached and how wounded each is. */
  readonly parts: BodyState = newBodyState();
  readonly mob: Mobility = { legs: 2, jet: true, canFire: true, oneHanded: false };
  /** Last attacker and weapon, so bleeding out credits whoever caused it. */
  lastHitBy = 255;
  lastWeapon = 255;
  /** Drop rocket carrying this player in, or -1. */
  delivering = -1;
  alive = false;
  hp = ACTOR_MAX_HP;
  aimQ = 0;
  /** Weapon in hand (WeaponId of inv[slot]), NO_WEAPON with empty hands. */
  weapon = NO_WEAPON;
  /** What this clone carries: each weapon with its own magazine. */
  inv: InvItem[] = [];
  slot = 0;
  /** Bumped whenever the inventory changes under the client (pick-up, drop, death, respawn). */
  invVersion = 0;
  /** Latest inventory byte from the client, and the one before (for key edges). */
  invCmd = 0;
  prevInv = 0;
  /** Ticks until the next shot may leave (fractional: rate of fire is exact on average). */
  cooldown = 0;
  /** Ticks left on the current weapon's reload, 0 = not reloading. */
  reloadLeft = 0;
  /** Item in hand last tick (switching cancels a reload). */
  heldItem: InvItem | null = null;
  /** Hasn't been sent the map seed yet (newcomer). */
  needsMap = true;
  /** Server-side bot brain (null for humans). */
  bot: BotBrain | null = null;
  /** FFA: waves won; in this wave; waiting for its drop rocket; who it's watching while out (255 none). */
  wins = 0;
  waveKills = 0;
  /** Deaths this wave (PvP's tie-break: fewer wins). */
  waveDeaths = 0;
  /** End of a wave: the mode this player voted for next (255: no vote yet). */
  vote = 255;
  /** The team this player asked for (255: none): theirs from the next wave's draw (Last Team Standing; respawn modes switch at once). */
  teamWish = 255;
  inWave = false;
  pendingSpawn = false;
  spectate = 255;
  /** Last Team Standing: Team.Red / Team.Green for this wave, Team.None outside one. */
  team: number = Team.None;
  /** Tank slot this clone is driving, -1 on foot. */
  tank = -1;
  /** Ticks until this clone's radio can call in support again. */
  callCd = 0;
  /** Remote-piloting our dropship (its slot), or -1. The clone stands inert meanwhile. */
  pilot = -1;
  /** Remote-driving our watchdog (its tank slot), or -1. The clone stands inert meanwhile too. */
  rc = -1;
  /** Tank surfing: the vehicle (tank slot) this clone rides on top of, or -1; and its seat on it. */
  surf = -1;
  seat = 0;
  /** Dropship surfing: the dropship (ship slot) this clone rides on top of, or -1 (its seat is `seat`). */
  surfShip = -1;
  /** Nanobot work done toward regrowing this clone's next missing limb (repair kit). */
  regrow = 0;
  /** Venom in the blood (a millipede's): the harm still to come, a little each tick (VENOM_RATE). */
  venom = 0;
  /** Coral seeded in its limbs (a seeder's sting), by CORAL_LIMBS: how far grown (0..1; 1 full grown, crusted over). */
  readonly coral = new Float32Array(CORAL_LIMBS.length);
  /** Whether the nest in its limbs will kill it (rolled when it first takes hold, CORAL_FATAL). */
  coralFatal = false;
  /** Wildlife was in this client's view last frame (so an empty R_BEASTS tells it they've gone). */
  beastsSent = false;
  /** Each creature's record as this client last got it (World.beastRev; -1: it doesn't have it), so an unchanged one goes as a byte. */
  readonly beastSeen = new Int32Array(MAX_BEASTS).fill(-1);
  /** A bot's skill, 1 (beginner) to 5 (expert): dealt out by World.dealSkills. */
  skill = 3;
  /** Ticks of mending left from a health wave it was caught in, and the last wave that caught it. */
  mend = 0;
  mendWave = -1;
  /** Muzzle climb from recent shots (radians), settling back each tick. */
  climb = 0;
  /** Laser charge (ticks held), and how far the Gatling's barrels have spun up. */
  charge = 0;
  spin = 0;
  /** Extraction: the trap revision this client last got, and ticks until a spike pit can bite again. */
  trapsSeen = -1;
  /** The mines revision this client last got. */
  minesSeen = -1;
  burnersSeen = -1;
  /** The geysers' state as this client last heard it (World.geysersRev). */
  geysersSeen = -1;
  /** The flora's state as this client last heard it (World.floraRev). */
  floraSeen = -1;
  /** The water as this client last heard it (World.waterRev). */
  waterSeen = -1;
  spikeCd = 0;
  /** Last team table this client was sent (World.teamsRev). */
  teamsSeen = -1;
  /** Latest materializer request, applied on this player's next tick. */
  buildReq: { piece: number; gx: number; gy: number } | null = null;
  /** Buttons last tick, for semi-auto triggers and the reload key. */
  prevButtons = 0;
  respawn = 1;
  firing = false;
  kills = 0;
  deaths = 0;
  /** Gold banked: dug up, picked from the dead, spent on fortifications. Starts with enough for a bunker. */
  gold = STARTING_GOLD;
  inputs: InputCmd[] = [];
  buttons = 0;
  ack = 0;
  camX = WORLD_W / 2;
  camY = WORLD_H / 3;
  /** Chunk version this client is known to hold, -1 = unknown/stale. */
  readonly known = new Int32Array(CHUNK_COUNT).fill(-1);
  bytesOut = 0;
  lastChat = 0;
  /** Projectile ids this client was told about (for end events). */
  readonly seenProj = new Set<number>();
  /** Ground items this client knows about, and the revision it was last sent. */
  readonly knownItems = new Map<number, number>();

  constructor(
    readonly id: number,
    readonly name: string,
    readonly link: ClientLink,
  ) {
    this.body = newBody(0, 0);
  }

  get cx(): number {
    return this.body.x + ACTOR_W / 2;
  }
  get cy(): number {
    return this.body.y + ACTOR_H - STANCE_H[this.body.stance] / 2;
  }
  /** Top of the hitbox (it shrinks from the top when crouched or prone). */
  get top(): number {
    return this.body.y + ACTOR_H - STANCE_H[this.body.stance];
  }
}

/** A terrain mutation as replicated to clients: pre-encoded record + chunk versions. */
interface TerrainOp {
  bytes: Uint8Array;
  chunks: number[];
  pre: number[];
}

interface ProjRecord {
  bytes: Uint8Array;
  id: number;
  x: number;
  y: number;
}

const SNAPSHOT_SCRATCH = new Uint8Array(CHUNK * CHUNK);

/**
 * Authoritative room simulation. Platform-agnostic: the Durable Object feeds it
 * sockets and a clock; tests and the benchmark drive it directly.
 */
export class World {
  readonly terrain = new Terrain();
  /** Server particles are grains only: they are authoritative terrain changes. */
  readonly grains = new Particles(32768);
  /** Bodies as the particle engine sees them: particles hit, push and hurt players. */
  readonly actors = new ActorField(ACTOR_W, ACTOR_H);
  /** Drop rockets in flight, by slot. */
  readonly crafts: (Craft | null)[] = new Array(MAX_CRAFTS).fill(null);
  /** Tanks: dropped by parachute, driven by whoever climbs in. */
  readonly tanks: (Tank | null)[] = new Array(MAX_TANKS).fill(null);
  /** Wildlife (wildlife.ts): the creatures in the caves, by slot, and each one's body points this tick (for hits, and to send). */
  readonly beasts: (Beast | null)[] = new Array(MAX_BEASTS).fill(null);
  readonly beastPts: number[][] = Array.from({ length: MAX_BEASTS }, () => []);
  /** Is there wildlife on this world at all (the tutorial has none). */
  wildlife = true;
  private beastSpawnAt = 90;
  /** When a basilisk may next come up (one at a time; a long while after the last is killed). */
  private basiliskAt = 0;
  private readonly beastRng = new Rng(0xbea57);
  /** The valley's calm (no wildlife there: it's quiet, for now), and the venom list as last sent. */
  private calm: { x0: number; x1: number; y0: number } | null = null;
  private venomSent = '';
  private coralSent = '';
  /** Dropships: aerial support, called in by radio. */
  readonly ships: (Ship | null)[] = new Array(MAX_SHIPS).fill(null);
  /** Enemies spotted from the air, per side (spotKey): clone id -> the tick the sighting goes stale. */
  readonly spots = new Map<number, Map<number, number>>();
  /** Drop tanks into each wave (round rooms; sandbox rooms only on request). */
  readonly tankDrops: boolean;
  private readonly tankMz = { x: 0, y: 0, a: 0 };
  private readonly craftStep = newCraftStep();
  private readonly pt = { x: 0, y: 0 };
  private readonly pt2 = { x: 0, y: 0 };
  private readonly ext = { x: 0, y: 0 };
  readonly field = new DistanceField(this.terrain);
  readonly collider = new Collider(this.terrain, this.field);
  readonly projectiles = new Projectiles(4096);
  /** Scratch for the heat seekers' target list. */
  private readonly heat: { x: number; y: number }[] = [];
  readonly chunkVersion = new Uint32Array(CHUNK_COUNT);
  readonly players: (Player | null)[] = new Array(MAX_PLAYERS).fill(null);
  readonly rng: Rng;
  tick = 0;
  private nextProjId = 1;

  // Per-tick outputs, encoded once and fanned out to interested clients.
  private ops: TerrainOp[] = [];
  private projSpawns: ProjRecord[] = [];
  private projEnds: ProjRecord[] = [];
  private hits: ProjRecord[] = [];
  private readonly broadcast = new Writer(1024);
  private readonly actorRecords = new Writer(64 * 16);
  private readonly pendingPixels = new Map<number, number[]>();
  /** The bunkers' steel doors: where, whose, how many rows are open, its hit points, and whether it's been blown out. */
  doors: { x0: number; y0: number; x1: number; y1: number; team: number; open: number; hp: number; broken: boolean }[] = [];
  private readonly removedScratch: number[] = [];
  private readonly detachedScratch: number[] = [];
  private readonly chunkCache = new Map<number, { version: number; bytes: Uint8Array }>();
  private readonly frame = new Writer(64 * 1024);
  private readonly tmp = new Writer(256);

  // Spatial hash of actors by chunk, rebuilt each tick for hit tests.
  private readonly grid: number[][] = Array.from({ length: CHUNK_COUNT }, () => []);
  private readonly gridUsed: number[] = [];

  // Perf counters.
  lastStepMs = 0;
  lastReplicateMs = 0;

  /** Game mode: 'sandbox' (respawn forever) or 'ffa' (one life per wave, last one standing wins). */
  readonly mode: 'sandbox' | 'ffa';
  /** Wave modes the round room cycles through when nobody votes (wave 1 plays the one at rotationStart). */
  readonly rotation: readonly number[];
  /** Bumped whenever the team table changes (clients are re-sent it). */
  teamsRev = 0;
  /** What kind of map this is (worldgen MapKind: plain, Regicide's fortresses, Extraction's labyrinth); clients build it too. */
  mapKind: number = MapKind.Plain;
  /** Extraction: the labyrinth of this map. */
  dungeon: Dungeon | null = null;
  /** A cave map's tunnel network (caves.ts), for the bots to find their way through. */
  caves: CaveNet | null = null;
  /** Weapons the map's bunkers hold at the start of a wave (sniper rifles up the towers, heavy guns in the halls). */
  mapLoot: { x: number; y: number; weapon: number }[] = [];
  /** Extraction: mines gone off (bit per trap id), its revision, and every trap's rearm timer. */
  readonly trapSpent = new Uint8Array(32);
  trapsRev = 0;
  /** Landmines laid by clones (see layMine), and a revision bumped whenever the list changes. */
  readonly mines: Mine[] = [];
  /** Stoneburner beacons about (thrown, stuck, or their missile coming down), and the molten cores their strikes left (stoneburner.ts). */
  readonly burners: Burner[] = [];
  readonly feet: Foot[] = [];
  burnersRev = 0;
  minesRev = 0;
  /**
   * The map's geysers (frosting.ts): each vent's mouth, its hit points, the
   * ticks until it can blow again, its fuse while rumbling, the ticks its
   * deadly smoke has left, and who set it off (255: nobody, it went on its own).
   * (`calm`: ticks before it may go off on its own at the start of a map, so they don't all go together.)
   */
  geysers: { x: number; y: number; cave: boolean; hp: number; cd: number; calm: number; fuse: number; toxic: number; by: number; dead: boolean }[] = [];
  geysersRev = 0;
  /**
   * The map's flora (frosting.ts placeFlora): which plants are gone (shot
   * through, blasted, crushed, dug out from under), the blister corals
   * swelling to burst (index: ticks left, and who set it off), and by
   * column (64 wide) for the hit tests.
   */
  flora: Flora[] = [];
  floraDead = new Uint8Array(0);
  readonly floraFuse = new Map<number, { t: number; by: number }>();
  floraRev = 0;
  /** Standing water (water.ts): the bodies, levels kept solved as the ground changes (every WATER_TICKS). */
  water: WaterBody[] = [];
  waterRev = 0;
  /** Bots' path planning this tick (nav.ts navBudget): which tick, and how many searches so far. */
  navTick = -1;
  navUsed = 0;
  private floraCols: number[][] = [];
  /** The geysers' own dice (so they never shift the rest of the world's). */
  private geyserRng = new Rng(1);
  private nextMineId = 1;
  private trapCd = new Uint16Array(256);
  /** Extraction: the extraction rocket. */
  readonly evac = { state: Evac.None as number, x: 0, y: 0, vy: 0, toX: 0, idle: 0, team: 255, eta: 0 };
  /** Regicide: each team's fortress (by team), and each team's king (player id, 255 none). */
  fortresses: Fortress[] = [];
  readonly kings = [255, 255];
  /** Siege: the map's layout (fortress end, landing zone, vehicle spots), and the attackers' lives left. */
  siege: SiegeMap | null = null;
  siegeLives = 0;
  /** Extermination: the lair (its dens, and the tunnels down to them), and how many basilisks the wave began with. */
  lair: Lair | null = null;
  lairBeasts = 0;
  /** Extermination: each basilisk's den (where it goes back to sleep, calmed). */
  private readonly lairHome = new WeakMap<Beast, { x: number; y: number }>();
  /** DUNE's dragons: they hear everyone on the sand, wherever, and never go back down to sleep. */
  private readonly duneHunters = new WeakSet<Beast>();
  /** FFA: fill the room with bots up to this many clones (humans count first). */
  readonly botFill: number;
  /** Seed of the current map (each wave gets a new one). */
  mapSeed: number;
  /** FFA round state. */
  phase: number = Phase.Waiting;
  phaseTimer = 0;
  wave = 0;
  winner = 255;
  /** Pre-encoded R_WAVE record to open every frame of the tick a new wave's map is made. */
  private waveRecord: Uint8Array | null = null;

  /**
   * Scripted overrides (the tutorial, which runs a World in the browser):
   * where a clone's drop rocket comes down ([x0, x1)), and the kit it
   * comes down with. Unset, or returning undefined: the usual.
   */
  dropZone?: (p: Player) => [number, number] | undefined;
  kitFor?: (p: Player) => InvItem[] | undefined;

  constructor(seed = 1337, opts: { mode?: 'sandbox' | 'ffa'; bots?: number; rotation?: number[]; rotationStart?: number; tanks?: boolean } = {}) {
    this.rng = new Rng(seed ^ 0x9e3779b9);
    this.mode = opts.mode ?? 'sandbox';
    this.tankDrops = opts.tanks ?? this.mode === 'ffa';
    this.rotation = opts.rotation?.length ? opts.rotation : DEFAULT_ROTATION;
    this.rotationStart = Math.max(0, Math.floor(opts.rotationStart ?? 0));
    this.projectiles.seeker = (i, out) => this.heatTarget(i, out);
    this.botFill = Math.min(MAX_PLAYERS, opts.bots ?? 0);
    this.mapSeed = seed >>> 0;
    this.makeMap(this.mapKindFor(1));
    this.sealMap();
  }

  /** Chunk versions when the current map was generated (a chunk still at it is untouched). */
  private readonly pristine = new Uint32Array(CHUNK_COUNT);
  /** R_WAVE for the current map: its seed and every chunk's hash as generated. */
  private mapRecord: Uint8Array | null = null;

  /**
   * The terrain was rewritten wholesale outside the replication path (tests
   * building an arena): every chunk is stale for every client, and newcomers
   * can't make this map from a seed, so they download it until the next wave.
   */
  terrainReplaced(): void {
    for (let ci = 0; ci < CHUNK_COUNT; ci++) this.chunkVersion[ci]++;
    for (const p of this.players) p?.known.fill(-1);
    this.mapRecord = null;
    // Geysers whose vent the new ground buried (or left hanging in the air) are gone with it.
    const vent = (g: { x: number; y: number }) => this.terrain.get(g.x, g.y) === Mat.Air && this.terrain.get(g.x, g.y + 1) === Mat.Rock;
    if (!this.geysers.every(vent)) {
      this.geysers = this.geysers.filter(vent);
      this.geysersRev++;
    }
    // And the plants whose ground went with it, quietly (no gibs, no bursts: there was nothing to see).
    this.flora.forEach((f, i) => {
      if (!this.floraDead[i] && !this.rooted(f)) {
        this.floraDead[i] = 1;
        this.floraRev++;
      }
    });
    this.floraFuse.clear();
  }

  /** The kind of map wave `n` is fought on. */
  private mapKindFor(n: number): number {
    if (this.mode !== 'ffa') return MapKind.Plain;
    const mode = this.modeOfWave(n);
    // (Extermination: half the time the lair, half the time DUNE, by the map's seed.)
    if (mode === GameMode.Extermination) return hash2(this.mapSeed & 0xffff, this.mapSeed >>> 16, 0xd0e5) & 1 ? MapKind.Dune : MapKind.Lair;
    return mode === GameMode.Regicide ? MapKind.Fortress : mode === GameMode.Extraction ? MapKind.Dungeon : mode === GameMode.Siege ? MapKind.Siege : MapKind.Plain;
  }

  /** Generate the map for `mapSeed` (fortresses or a labyrinth, by kind) and note what's in it. */
  private makeMap(kind: number): void {
    this.mapKind = kind;
    generateWorld(this.terrain, this.mapSeed, kind);
    this.fortresses = [];
    for (const c of lastComplexes) if (c.fortress) this.fortresses[c.fortress.team] = c.fortress;
    this.dungeon = lastDungeon;
    this.caves = lastCaves;
    this.siege = lastSiege;
    this.lair = lastLair;
    this.mapLoot = lastComplexes.flatMap((c) => c.loot ?? []);
    // The lair: a cache of heavy weapons beside each tunnel mouth (rifles barely scratch a basilisk).
    if (lastLair) {
      lastLair.mouths.forEach((mx) => {
        LAIR_CACHE.forEach((weapon, i) => {
          const x = mx + TUNNEL_CLEAR + i * 10;
          this.mapLoot.push({ x, y: this.terrain.surfaceY(x) - 6, weapon });
        });
      });
    }
    // DUNE: the same caches, out on the sand (there's nowhere else to put them).
    if (kind === MapKind.Dune) {
      for (const f of DUNE_CACHES) {
        LAIR_CACHE.forEach((weapon, i) => {
          const x = Math.round(f * WORLD_W) + i * 10;
          this.mapLoot.push({ x, y: this.terrain.surfaceY(x) - 6, weapon });
        });
      }
    }
    this.doors = lastComplexes.flatMap((c) => (c.doors ?? []).map((d) => ({ ...d, open: 0, hp: DOOR_HP, broken: false })));
    // (Staggered, so they don't all go off on their own together early on.)
    this.geyserRng = new Rng(this.mapSeed ^ 0x6e75e5);
    this.geysers = lastGeysers.map((g) => ({ ...g, hp: GEYSER_HP, cd: 0, calm: 30 * 30 + this.geyserRng.int(30 * 90), fuse: 0, toxic: 0, by: 255, dead: false }));
    this.geysersRev++;
    this.flora = lastFlora;
    this.water = lastWater.map((b) => ({ ...b }));
    this.waterRev++;
    this.floraDead = new Uint8Array(lastFlora.length);
    this.floraFuse.clear();
    this.floraCols = Array.from({ length: (WORLD_W >> 6) + 1 }, () => []);
    lastFlora.forEach((f, i) => this.floraCols[f.x >> 6].push(i));
    this.floraRev++;
    this.trapSpent.fill(0);
    this.trapCd.fill(0);
    this.trapsRev++;
    this.evac.state = Evac.None;
    this.calm = lastValley?.calm ?? null;
    this.beasts.fill(null);
    this.beastSpawnAt = this.tick + 90;
  }

  /** Remember the freshly generated map, so newcomers can make it themselves instead of downloading it. */
  private sealMap(): void {
    this.pristine.set(this.chunkVersion);
    const w = new Writer(8 + CHUNK_COUNT * 4);
    w.u8(R_WAVE);
    w.u32(this.mapSeed);
    w.u8(this.mapKind);
    for (let ci = 0; ci < CHUNK_COUNT; ci++) w.u32(this.terrain.chunkHash(ci));
    this.mapRecord = w.finish();
  }

  get playerCount(): number {
    let n = 0;
    for (const p of this.players) if (p) n++;
    return n;
  }

  addPlayer(name: string, link: ClientLink): Player | null {
    let id = this.players.indexOf(null);
    if (id < 0) {
      // Full of bots: a human takes a bot's place (a dead one if possible).
      const bot = this.players.find((o) => o?.bot && !o.alive) ?? this.players.find((o) => o?.bot);
      if (!bot) return null;
      this.removePlayer(bot.id);
      id = bot.id;
    }
    // (The BOT tag is the bots' alone: clients tell humans from bots by it.)
    const clean = cleanName(name) || `Clone${id}`;
    return this.join(id, clean, link, null);
  }

  /** A server-side bot takes a free slot (FFA fills empty slots with them). */
  addBot(): Player | null {
    const id = this.players.indexOf(null);
    if (id < 0) return null;
    const p = this.join(id, botName(this.rng), { send() {} }, new BotBrain(this.rng.nextU32()));
    p.skill = drawSkill(this.rng.next());
    return p;
  }

  /**
   * Deal the bots their skills for a wave: a spread clustered round veteran
   * (SKILL_SHARE), so a match has a few beginners and a few experts among
   * mostly middling bots, and dealt so that every team comes out even (its
   * humans counting as veterans): strongest first, each to the team whose
   * total is lowest that still has a bot to give it to.
   */
  dealSkills(teams: number): void {
    const bots = this.players.filter((p): p is Player => !!p && !!p.bot);
    if (!bots.length) return;
    // The pool: shares of each level, rounded so they add up (largest remainders).
    const want = SKILL_SHARE.map((w) => w * bots.length);
    const count = want.map(Math.floor);
    const order = want.map((w, i) => [w - Math.floor(w), i] as const).sort((a, b) => b[0] - a[0] || Math.abs(a[1] - 2) - Math.abs(b[1] - 2));
    for (let k = 0, left = bots.length - count.reduce((a, b) => a + b, 0); k < left; k++) count[order[k][1]]++;
    const pool: number[] = [];
    for (let lv = 5; lv >= 1; lv--) for (let n = 0; n < count[lv - 1]; n++) pool.push(lv);
    const shuffle = <T>(a: T[]) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = this.rng.int(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    if (teams === 0) {
      shuffle(pool);
      bots.forEach((p, i) => (p.skill = pool[i]));
      return;
    }
    const sides = Array.from({ length: teams }, (_, t) => ({
      bots: shuffle(bots.filter((p) => p.team === t)),
      sum: 3 * this.players.filter((p) => p && !p.bot && p.team === t).length,
      dealt: 0,
    }));
    for (const lv of pool) {
      let best = -1;
      for (let t = 0; t < teams; t++) {
        const sd = sides[t];
        if (sd.dealt >= sd.bots.length) continue;
        if (best < 0 || sd.sum < sides[best].sum || (sd.sum === sides[best].sum && sd.bots.length - sd.dealt > sides[best].bots.length - sides[best].dealt)) best = t;
      }
      if (best < 0) break;
      const sd = sides[best];
      sd.bots[sd.dealt++].skill = lv;
      sd.sum += lv;
    }
  }

  get humanCount(): number {
    let n = 0;
    for (const p of this.players) if (p && !p.bot) n++;
    return n;
  }

  private join(id: number, clean: string, link: ClientLink, bot: BotBrain | null): Player {
    const p = new Player(id, clean, link);
    p.bot = bot;
    // In FFA you join between waves (spectating until the next one starts).
    if (this.mode === 'ffa') p.respawn = 0;
    this.players[id] = p;
    if (this.respawnLive) {
      // Regicide and Extraction have reinforcements: join the smallest side and drop in.
      // (PvP has no sides: straight in.)
      const n = TEAMS_IN_MODE[this.modeOfWave(this.wave)];
      const count = new Array<number>(n).fill(0);
      for (const o of this.players) if (o && o !== p && o.team < n) count[o.team]++;
      p.team = n > 0 ? count.indexOf(Math.min(...count)) : Team.None;
      p.inWave = true;
      p.pendingSpawn = true;
      p.respawn = REGICIDE_RESPAWN_TICKS;
    }
    this.teamsRev++; // whoever had this slot before may have had a team
    this.writeRoster(this.broadcast, p, true);
    if (bot) return p;
    // The newcomer needs the whole roster; it gets it in its first frame.
    const w = this.tmp.reset();
    for (const o of this.players) if (o && o !== p) this.writeRoster(w, o, true);
    this.pendingRoster.set(id, w.finish());
    return p;
  }

  // ---------------------------------------------------------------- Last Man Standing

  /** Clones still in the wave: alive, riding in, or waiting for their rocket. */
  remaining(team = -1): number {
    let n = 0;
    for (const p of this.players) if (p && this.inPlay(p) && (team < 0 || p.team === team)) n++;
    return n;
  }

  private inPlay(p: Player): boolean {
    return p.inWave && (p.alive || p.delivering >= 0 || p.pendingSpawn);
  }

  /** Mode of wave `n` (1-based): what the players voted for it, or else the rotation's. */
  modeOfWave(n: number): number {
    if (this.votedMode?.wave === n) return this.votedMode.mode;
    return this.rotation[(Math.max(1, n) - 1 + this.rotationStart) % this.rotation.length];
  }
  /** Where in the rotation wave 1 falls (a room starts somewhere new each time it's brought up). */
  private readonly rotationStart: number;
  /** The mode the players voted for, and the wave it's for. */
  private votedMode: { wave: number; mode: number } | null = null;

  /** Mode of the wave being played, or (between waves) of the next one. */
  get waveMode(): number {
    if (this.mode !== 'ffa') return GameMode.Lms;
    return this.modeOfWave(this.phase === Phase.Live || this.phase === Phase.Victory ? this.wave : this.wave + 1);
  }

  /** Teammates can't hurt each other (your own blasts still hurt you). */
  friendly(by: number, victim: Player): boolean {
    if (victim.team === Team.None || by === victim.id) return false;
    const a = by >= 0 && by < MAX_PLAYERS ? this.players[by] : null;
    return !!a && a.team === victim.team;
  }

  /**
   * One life each, last one standing wins:
   * waiting (fewer than two clones) -> countdown -> live -> victory -> a new
   * wave on a fresh map. Empty slots are filled with bots between waves.
   */
  private stepRound(): void {
    if (this.phase === Phase.Waiting || this.phase === Phase.Victory) this.fillBots();
    switch (this.phase) {
      case Phase.Waiting:
        if (this.humanCount > 0 && this.playerCount >= 2) this.setPhase(Phase.Countdown, COUNTDOWN_TICKS);
        break;
      case Phase.Countdown:
        if (this.playerCount < 2) this.setPhase(Phase.Waiting, 0);
        else if (--this.phaseTimer <= 0) this.startWave();
        break;
      case Phase.Live: {
        // Last one standing; or, when time runs out, the survivor with the
        // most kills this wave (so nobody can win by hiding in a bunker).
        const timeUp = --this.phaseTimer <= 0;
        if (this.modeOfWave(this.wave) === GameMode.Lts) {
          this.stepTeamRound(timeUp);
          break;
        }
        if (this.modeOfWave(this.wave) === GameMode.Regicide) {
          this.stepRegicide(timeUp);
          break;
        }
        if (this.modeOfWave(this.wave) === GameMode.Siege) {
          this.stepSiege(timeUp);
          break;
        }
        if (this.modeOfWave(this.wave) === GameMode.Extraction) {
          this.stepExtraction(timeUp);
          break;
        }
        if (this.modeOfWave(this.wave) === GameMode.Pvp) {
          if (timeUp) this.endPvp();
          break;
        }
        if (this.modeOfWave(this.wave) === GameMode.Extermination) {
          this.stepExtermination(timeUp);
          break;
        }
        if (this.remaining() <= 1 || timeUp) {
          let best: Player | null = null;
          for (const p of this.players) {
            if (!p || !p.inWave || !(p.alive || p.delivering >= 0 || p.pendingSpawn)) continue;
            if (!best || p.waveKills > best.waveKills || (p.waveKills === best.waveKills && p.hp > best.hp)) best = p;
          }
          this.winner = best ? best.id : 255;
          if (best) best.wins++;
          this.setPhase(Phase.Victory, this.rotation.length > 1 ? VOTE_TICKS : VICTORY_TICKS);
        }
        break;
      }
      case Phase.Victory:
        if (--this.phaseTimer <= 0) {
          if (this.voting) this.countVotes();
          this.newMap();
          this.setPhase(this.playerCount >= 2 ? Phase.Countdown : Phase.Waiting, COUNTDOWN_TICKS);
        }
        break;
    }
  }

  /**
   * Last Team Standing: the last team with a clone standing wins, every member
   * scoring the win (the fallen too). When time runs out, the team with
   * more clones left; then the one with more kills this wave.
   */
  private stepTeamRound(timeUp: boolean): void {
    const red = this.remaining(Team.Red);
    const green = this.remaining(Team.Green);
    if (red > 0 && green > 0 && !timeUp) return;
    let winner = 255;
    if (red !== green) winner = red > green ? Team.Red : Team.Green;
    else if (red > 0) {
      const kills = [0, 0];
      for (const p of this.players) if (p && p.inWave && p.team !== Team.None) kills[p.team] += p.waveKills;
      if (kills[0] !== kills[1]) winner = kills[0] > kills[1] ? Team.Red : Team.Green;
    }
    this.winner = winner;
    if (winner !== 255) for (const p of this.players) if (p && p.inWave && p.team === winner) p.wins++;
    this.setPhase(Phase.Victory, this.rotation.length > 1 ? VOTE_TICKS : VICTORY_TICKS);
  }

  /**
   * Regicide: a king falls, the other side wins (every member scores). A
   * king who leaves the game hands the crown to a living teammate. When time
   * runs out with both kings standing, it's a stalemate (kills don't decide it).
   * Both kings falling together goes to the side with more kills this wave.
   */
  private stepRegicide(timeUp: boolean): void {
    for (const team of [Team.Red, Team.Green]) {
      const k = this.kings[team];
      if (k !== 255 && this.players[k]) continue;
      // Abdicated (left the game): crown someone else, where they stand.
      const heir = this.players.find((p) => p && p.team === team && p.alive);
      this.kings[team] = heir ? heir.id : 255;
      if (heir) this.crown(heir);
    }
    let winner = 255;
    let fallen = false;
    for (const team of [Team.Red, Team.Green]) {
      const k = this.kings[team];
      const king = k !== 255 ? this.players[k] : null;
      if (!king || !king.alive) {
        winner = team === Team.Red ? Team.Green : Team.Red;
        fallen = true;
      }
    }
    if (!fallen && !timeUp) return;
    if (!fallen) winner = 255; // (time's up, both kings standing: a stalemate)
    else if (!this.kingAlive(Team.Red) && !this.kingAlive(Team.Green)) {
      const kills = [0, 0];
      for (const p of this.players) if (p && p.inWave && p.team !== Team.None) kills[p.team] += p.waveKills;
      winner = kills[0] === kills[1] ? 255 : kills[0] > kills[1] ? Team.Red : Team.Green;
    }
    this.winner = winner;
    if (winner !== 255) for (const p of this.players) if (p && p.inWave && p.team === winner) p.wins++;
    this.setPhase(Phase.Victory, this.rotation.length > 1 ? VOTE_TICKS : VICTORY_TICKS);
  }

  /**
   * Siege: the defenders' king falls, the attackers win; the attackers run
   * out of lives (and of clones still fighting) or the twenty minutes run out
   * with the king standing, the defenders do. A king who leaves hands the
   * crown on, as in Regicide.
   */
  private stepSiege(timeUp: boolean): void {
    const k = this.kings[DEFENDERS];
    if (k === 255 || !this.players[k]) {
      const heir = this.players.find((p) => p && p.team === DEFENDERS && p.alive);
      this.kings[DEFENDERS] = heir ? heir.id : 255;
      if (heir) this.crown(heir);
    }
    let winner = -1;
    if (!this.kingAlive(DEFENDERS)) winner = ATTACKERS;
    else if (timeUp || (this.siegeLives <= 0 && this.remaining(ATTACKERS) === 0)) winner = DEFENDERS;
    if (winner < 0) return;
    this.winner = winner;
    for (const p of this.players) if (p && p.inWave && p.team === winner) p.wins++;
    this.setPhase(Phase.Victory, this.rotation.length > 1 ? VOTE_TICKS : VICTORY_TICKS);
  }

  /**
   * PvP: when the five minutes are up, whoever has the most kills this wave
   * wins (fewer deaths breaks a tie; still level, nobody does).
   */
  private endPvp(): void {
    let best: Player | null = null;
    let tie = false;
    for (const p of this.players) {
      if (!p || !p.inWave) continue;
      if (!best || p.waveKills > best.waveKills || (p.waveKills === best.waveKills && p.waveDeaths < best.waveDeaths)) {
        best = p;
        tie = false;
      } else if (p.waveKills === best.waveKills && p.waveDeaths === best.waveDeaths) tie = true;
    }
    this.winner = best && !tie && best.waveKills > 0 ? best.id : 255;
    if (this.winner !== 255) best!.wins++;
    this.setPhase(Phase.Victory, this.rotation.length > 1 ? VOTE_TICKS : VICTORY_TICKS);
  }

  /**
   * Extermination: every basilisk dead, everyone wins together (the fallen
   * too); time runs out with any still alive, the basilisks do.
   */
  private stepExtermination(timeUp: boolean): void {
    const left = this.basilisksLeft();
    if (left > 0 && !timeUp) return;
    this.winner = left === 0 ? Team.Red : 255;
    if (left === 0) for (const p of this.players) if (p && p.inWave) p.wins++;
    this.setPhase(Phase.Victory, this.rotation.length > 1 ? VOTE_TICKS : VICTORY_TICKS);
  }

  /** Basilisks (and the dragon) still alive (Extermination's quarry). */
  basilisksLeft(): number {
    let n = 0;
    for (const b of this.beasts) if (b && wyrm(b.kind)) n++;
    return n;
  }

  /** An Extermination wave is being fought right now. */
  get exterminationLive(): boolean {
    return this.mode === 'ffa' && this.phase === Phase.Live && this.modeOfWave(this.wave) === GameMode.Extermination;
  }

  /**
   * Extermination opening: a basilisk hibernating on the floor of every den
   * but one, and in that one a dragon (sleeping the wave away, unless
   * someone wakes them: and that's easy), and
   * the cave's lesser life (stockLair). No gold handed out: it's fought on
   * foot, mostly (LAIR_VEHICLES).
   */
  private startExtermination(): void {
    this.beasts.fill(null);
    const lair = this.lair;
    if (lair) {
      const dragonDen = this.beastRng.int(lair.dens.length);
      lair.dens.forEach((d, k) => {
        const kind = k === dragonDen ? BeastKind.Dragon : BeastKind.Basilisk;
        // (Up off the floor by its girth: a dragon's is three times a basilisk's.)
        const y = d.floorY - 8 * wyrmScale(kind);
        const b = newBeast(this.terrain, kind, d.floorX, y, d.floorX < WORLD_W / 2 ? 1 : -1);
        b.seed = this.beastRng.int(256);
        b.frozen = EXTERMINATION_TICKS + 30 * 60;
        b.hp = BEAST_BUILD[kind].hp * LAIR_HP;
        this.lairHome.set(b, { x: d.floorX, y });
        this.beasts[k] = b;
        bodyPoints(this.terrain, b, this.beastPts[k]);
      });
    }
    // DUNE: two dragons under the sand, awake from the start: they come up after whoever walks it.
    if (this.mapKind === MapKind.Dune) {
      DUNE_DRAGONS.forEach((f, k) => {
        const x = Math.round(f * WORLD_W);
        const y = Math.min(WORLD_H - 80, this.terrain.surfaceY(x) + DUNE_DRAGON_DEPTH);
        const b = newBeast(this.terrain, BeastKind.Dragon, x, y, x < WORLD_W / 2 ? 1 : -1);
        b.seed = this.beastRng.int(256);
        b.hp = BEAST_BUILD[BeastKind.Dragon].hp * LAIR_HP;
        this.duneHunters.add(b);
        this.enrage(b);
        this.beasts[k] = b;
        bodyPoints(this.terrain, b, this.beastPts[k]);
      });
    }
    this.lairBeasts = this.basilisksLeft();
    // And its lesser life, there from the start.
    for (let n = 0; n < LAIR_NESTS + LAIR_CRAWLERS + 8 && lair && this.stockLair(); n++) {
      // (stocking)
    }
  }

  private kingAlive(team: number): boolean {
    const k = this.kings[team];
    return k !== 255 && !!this.players[k]?.alive;
  }

  /** A Regicide wave is being fought right now. */
  get regicideLive(): boolean {
    return this.mode === 'ffa' && this.phase === Phase.Live && this.modeOfWave(this.wave) === GameMode.Regicide;
  }

  /** A Siege wave is being fought right now. */
  get siegeLive(): boolean {
    return this.mode === 'ffa' && this.phase === Phase.Live && this.modeOfWave(this.wave) === GameMode.Siege;
  }

  /** A wave with a king to kill (Regicide's two, Siege's one) is being fought right now. */
  get kingLive(): boolean {
    return this.regicideLive || this.siegeLive;
  }

  /** Put the crown on a king's head (in place of a helmet). */
  private crown(p: Player): void {
    p.parts.mask = (p.parts.mask | (1 << Part.Crown)) & ~(1 << Part.Helmet);
    p.parts.wounds[Part.Crown] = 0;
  }

  // ---------------------------------------------------------------- Extraction

  /**
   * Extraction opening: the golden idol on its altar at the bottom of the
   * labyrinth, vacant tanks in their halls, loot lying in the rooms.
   * Everyone comes down by drop rocket around their team's well.
   */
  private startExtraction(): void {
    const d = this.dungeon;
    if (!d) return;
    this.spawnItem(WeaponId.Idol, 0, d.idol.x, d.idol.y, 0, 0);
    for (const t of d.tanks) {
      const slot = this.tanks.indexOf(null);
      if (slot < 0) break;
      const k = newTank(t.x, t.y);
      k.chute = false;
      this.tanks[slot] = k;
    }
    for (const l of d.loot) {
      this.spawnItem(l.weapon, WEAPONS[l.weapon].clip, l.x, l.y, 0, 0);
      this.items[this.items.length - 1].age = -EXTRACTION_TICKS; // lies there all wave
    }
    this.evac.state = Evac.None;
    this.evac.team = 255;
  }

  /** Whoever is carrying the golden idol, if anyone. */
  idolHolder(): Player | null {
    for (const p of this.players) if (p && p.alive && p.inv.some((it) => it.weapon === WeaponId.Idol)) return p;
    return null;
  }

  /** Where the idol is: its carrier, or where it lies. */
  idolAt(): { x: number; y: number; holder: number } | null {
    const h = this.idolHolder();
    if (h) return { x: h.cx, y: h.cy, holder: h.id };
    const it = this.items.find((o) => o.weapon === WeaponId.Idol);
    return it ? { x: it.x, y: it.y, holder: 255 } : null;
  }

  /** Out of the labyrinth, up in the open desert (or on the pyramid's steps). */
  surfaced(p: Player): boolean {
    return p.cy < Y0 - 16 && p.body.y + ACTOR_H <= this.terrain.surfaceY(Math.floor(p.cx)) + 3;
  }

  /** Where the extraction rocket would stand (its base) at column x: on the highest ground under it. */
  private evacGround(x: number): number {
    let g = WORLD_H;
    for (let dx = -EVAC_W / 2; dx <= EVAC_W / 2; dx += 3) g = Math.min(g, this.terrain.surfaceY(Math.max(0, Math.min(WORLD_W - 1, Math.floor(x + dx)))));
    return g;
  }

  /** A flat-enough spot to set the extraction rocket down, near x. */
  private landingX(x: number): number {
    for (let k = 0; k <= 16; k++) {
      for (const sgn of k ? [1, -1] : [1]) {
        const cx = Math.max(80, Math.min(WORLD_W - 80, x + sgn * (80 + k * 12)));
        let lo = WORLD_H;
        let hi = 0;
        for (let dx = -EVAC_W / 2; dx <= EVAC_W / 2; dx += 3) {
          const s = this.terrain.surfaceY(Math.floor(cx + dx));
          lo = Math.min(lo, s);
          hi = Math.max(hi, s);
        }
        if (hi - lo <= 6 && lo < Y0 - 10) return cx;
      }
    }
    return Math.max(80, Math.min(WORLD_W - 80, x + 40));
  }

  /** Is the idol's carrier at the landed rocket's hatch? */
  private boarding(p: Player): boolean {
    const e = this.evac;
    return e.state === Evac.Landed && Math.abs(p.cx - e.x) < EVAC_W / 2 + 8 && p.cy > e.y - 4 && p.cy < e.y + EVAC_H + 8;
  }

  /**
   * Extraction: when the idol comes up out of the labyrinth, the extraction
   * rocket is sent for it (and moves nearer if it comes up far from where the
   * rocket landed). Carry it aboard and your team wins. When time runs out,
   * whoever holds it takes the wave.
   */
  private stepExtraction(timeUp: boolean): void {
    const e = this.evac;
    const holder = this.idolHolder();
    if (holder && this.surfaced(holder)) {
      if (e.state === Evac.None) {
        // On its way: it takes a while to come (hold out up there).
        e.x = this.landingX(holder.cx);
        e.y = -EVAC_H - 120;
        e.vy = 280;
        e.eta = EVAC_ETA;
        e.state = Evac.Inbound;
      } else if (e.state === Evac.Landed && Math.abs(holder.cx - e.x) > 520 && e.idle > 30 * 15) {
        e.toX = this.landingX(holder.cx);
        e.vy = 0;
        e.state = Evac.Moving;
      }
    }
    if (holder && this.boarding(holder)) {
      // Aboard: the idol is theirs. The rocket lifts off with carrier and prize.
      e.state = Evac.Leaving;
      e.team = holder.team;
      e.vy = 0;
      holder.inv = [];
      this.invChanged(holder);
      this.leaveTank(holder, false);
      holder.alive = false;
      holder.respawn = 0;
      holder.pendingSpawn = false;
      this.endExtraction(holder.team);
      return;
    }
    if (timeUp) this.endExtraction(holder ? holder.team : 255);
  }

  private endExtraction(winner: number): void {
    this.winner = winner;
    if (winner !== 255) for (const p of this.players) if (p && p.inWave && p.team === winner) p.wins++;
    this.setPhase(Phase.Victory, this.rotation.length > 1 ? VOTE_TICKS : VICTORY_TICKS);
  }

  /** Fly the extraction rocket (scripted, not physical: nothing stops it). */
  private stepEvac(): void {
    const e = this.evac;
    switch (e.state) {
      case Evac.Inbound: {
        if (e.eta > 0) {
          e.eta--;
          break;
        }
        const ty = this.evacGround(e.x) - EVAC_H;
        e.vy = Math.max(30, Math.min(280, (ty - e.y) * 1.6));
        e.y = Math.min(ty, e.y + e.vy * DT);
        if (ty - e.y < 0.5) {
          e.y = ty;
          e.vy = 0;
          e.idle = 0;
          e.state = Evac.Landed;
        }
        break;
      }
      case Evac.Landed:
        e.idle++;
        e.y = this.evacGround(e.x) - EVAC_H; // the ground under it may have been blown away
        break;
      case Evac.Leaving:
        e.vy = Math.max(-640, e.vy - 520 * DT);
        e.y = Math.max(-400, e.y + e.vy * DT);
        break;
      case Evac.Moving:
        e.vy = Math.max(-420, e.vy - 520 * DT);
        e.y += e.vy * DT;
        if (e.y < -EVAC_H - 120) {
          e.x = e.toX;
          e.vy = 280;
          e.eta = EVAC_ETA / 2;
          e.state = Evac.Inbound;
        }
        break;
    }
  }

  /**
   * The labyrinth's booby traps: spike pits bite the legs of whoever stands
   * in them, dart throwers fire across their room at anyone in it, and
   * pressure plates blow up (once) under whoever steps on them, clone or tank.
   */
  private stepTraps(): void {
    const d = this.dungeon;
    if (!d || !this.extractionLive) return;
    for (const p of this.players) if (p && p.spikeCd > 0) p.spikeCd--;
    for (const t of d.traps) {
      if (t.kind === TrapKind.Spikes) {
        for (const p of this.players) {
          if (!p || !p.alive || p.tank >= 0 || p.spikeCd > 0) continue;
          const b = p.body;
          if (b.x + ACTOR_W <= t.x || b.x >= t.x + t.w || b.y + ACTOR_H <= t.y + 1 || b.y > t.y + SPIKE_DEPTH) continue;
          p.spikeCd = 12;
          const res = this.strikeScratch;
          res.hp = 0;
          res.detached.length = 0;
          res.vital = false;
          // Up through the boots: whichever legs are left, hard enough to pierce.
          for (const leg of [Part.LegF, Part.LegB]) if (has(p.parts.mask, leg)) strike(p.parts, leg, 240, 9, res);
          if (!has(p.parts.mask, Part.LegF) && !has(p.parts.mask, Part.LegB)) strike(p.parts, Part.Torso, 240, 9, res);
          b.vy = Math.min(b.vy, 0);
          this.applyStrike(p, res, NO_OWNER, W_TRAP, b.x + ACTOR_W / 2, t.y + 2);
        }
      } else if (t.kind === TrapKind.Darts) {
        if (this.trapCd[t.id] > 0) {
          this.trapCd[t.id]--;
          continue;
        }
        const x0 = cellX(t.c) + ROOM_L;
        const x1 = cellX(t.c) + ROOM_R;
        const y0 = cellY(t.r) + ROOM_T;
        const y1 = cellY(t.r) + ROOM_B;
        let seen = false;
        for (const p of this.players) if (p && p.alive && p.cx >= x0 && p.cx < x1 && p.cy >= y0 && p.cy < y1) seen = true;
        if (!seen) continue;
        this.spawnProj(this.nextProjId++, ProjKind.Dart, NO_OWNER, t.x, t.y, t.dir * 760, -6);
        this.trapCd[t.id] = 36 + this.rng.int(20);
      } else if (!(this.trapSpent[t.id >> 3] & (1 << (t.id & 7)))) {
        let stepped = false;
        for (const p of this.players) {
          if (p && p.alive && p.tank < 0 && Math.abs(p.cx - t.x) < t.w / 2 + 3 && Math.abs(p.body.y + ACTOR_H - t.y) < 2.5) stepped = true;
        }
        for (const k of this.tanks) if (k && t.x > k.x && t.x < k.x + tankW(k) && Math.abs(k.y + tankH(k) - t.y) < 4) stepped = true;
        if (!stepped) continue;
        this.trapSpent[t.id >> 3] |= 1 << (t.id & 7);
        this.trapsRev++;
        this.spawnProj(this.nextProjId++, ProjKind.Mine, NO_OWNER, t.x, t.y - 2, 0, 420);
      }
    }
  }

  /**
   * Lay a landmine on the ground just in front of the clone (it has to be
   * standing near some: not in mid-air). False if there's nowhere to put it.
   * Each clone keeps at most MINES_EACH down: laying another clears its oldest.
   */
  layMine(p: Player): boolean {
    const b = p.body;
    const left = Math.cos(dequantizeAim(p.aimQ)) < 0;
    const x = Math.round(p.cx + (left ? -9 : 9));
    const y0 = Math.floor(b.y + ACTOR_H / 2);
    let y = -1;
    for (let yy = y0; yy < y0 + 24; yy++) {
      if (this.terrain.isSolid(x, yy)) {
        y = yy;
        break;
      }
    }
    if (y < 0 || this.terrain.isSolid(x, y - 1)) return false;
    let own = 0;
    for (const m of this.mines) if (m.owner === p.id) own++;
    if (own >= MINES_EACH) this.mines.splice(this.mines.findIndex((m) => m.owner === p.id), 1);
    if (this.mines.length >= MAX_MINES) this.mines.shift();
    this.mines.push({ id: this.nextMineId++, x, y, owner: p.id, team: p.team, arm: MINE_ARM });
    this.minesRev++;
    return true;
  }

  /**
   * Landmines: armed a moment after they're laid, then the first enemy over
   * one (a clone's feet, or a tank's treads) sets it off. Ground dug or blown
   * out from under one lets it drop to whatever is below.
   */
  private stepMines(): void {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      // Settle onto whatever is under it now.
      if (!this.terrain.isSolid(m.x, m.y)) {
        let y = m.y;
        while (y < WORLD_H - 1 && !this.terrain.isSolid(m.x, y) && y < m.y + 8) y++;
        m.y = y;
        this.minesRev++;
        if (y >= WORLD_H - 1) {
          this.mines.splice(i, 1);
          continue;
        }
      }
      if (m.arm > 0) {
        if (--m.arm === 0) this.minesRev++;
        continue;
      }
      const foe = (id: number, team: number) => id !== m.owner && !(m.team !== Team.None && team === m.team);
      let tripped = false;
      for (const p of this.players) {
        if (!p || !p.alive || p.tank >= 0 || !foe(p.id, p.team)) continue;
        if (Math.abs(p.cx - m.x) < ACTOR_W / 2 + 2 && Math.abs(p.body.y + ACTOR_H - m.y) < 3) tripped = true;
      }
      for (const t of this.tanks) {
        if (!t || t.chute) continue;
        const who = t.pilot !== 255 ? t.pilot : t.owner;
        if (who === 255 || !foe(who, this.players[who]?.team ?? Team.None)) continue;
        if (m.x > t.x && m.x < t.x + tankW(t) && Math.abs(t.y + tankH(t) - m.y) < 4) tripped = true;
      }
      if (!tripped) continue;
      this.mines.splice(i, 1);
      this.minesRev++;
      this.spawnProj(this.nextProjId++, ProjKind.Landmine, m.owner, m.x, m.y - 2, 0, 420);
    }
  }

  /** An Extraction wave is being fought right now. */
  get extractionLive(): boolean {
    return this.mode === 'ffa' && this.phase === Phase.Live && this.modeOfWave(this.wave) === GameMode.Extraction;
  }

  /** A wave with reinforcements (soldiers come back by drop rocket) is being fought. */
  /** A PvP wave is being fought right now. */
  get pvpLive(): boolean {
    return this.mode === 'ffa' && this.phase === Phase.Live && this.modeOfWave(this.wave) === GameMode.Pvp;
  }

  get respawnLive(): boolean {
    return this.regicideLive || this.extractionLive || this.pvpLive || this.siegeLive || this.exterminationLive;
  }

  /** Is this clone a king (this wave)? */
  isKing(p: Player): boolean {
    return p.team !== Team.None && this.kings[p.team] === p.id;
  }

  /**
   * Regicide opening: a king for each side (a heavy, deep in its vault), and
   * every soldier already at their posts in and around the fortress. Only
   * reinforcements come by drop rocket.
   */
  private startRegicide(): void {
    const forts = this.fortresses;
    for (const team of [Team.Red, Team.Green]) {
      const side = this.players.filter((p): p is Player => !!p && p.team === team);
      const king = side.length ? side[this.rng.int(side.length)] : null;
      this.kings[team] = king ? king.id : 255;
      const fort = forts[team];
      for (const p of side) {
        p.pendingSpawn = false;
        if (!fort) {
          p.pendingSpawn = true; // no fortress (can't happen): drop in instead
          continue;
        }
        const spot = p === king ? fort.king : this.freeSpot(fort);
        this.placeClone(p, spot.x - ACTOR_W / 2 + (p === king ? 0 : this.rng.range(-3, 3)), spot.y - ACTOR_H, 0, 0);
        if (p === king) {
          resetBody(p.parts, ClassId.Heavy);
          p.body.cls = p.parts.cls;
          this.crown(p);
        }
      }
    }
    this.teamsRev++;
  }

  /**
   * Siege opening: the defenders' king (a heavy) in the vault and every
   * defender at a post in the fortress or its outposts, their tanks and
   * watchdogs drawn up in front; the attackers' armour waiting at the landing
   * zone, the attackers themselves on their way down to it. 300 lives.
   */
  private startSiege(): void {
    this.siegeLives = SIEGE_LIVES;
    const fort = this.fortresses[DEFENDERS];
    const side = this.players.filter((p): p is Player => !!p && p.team === DEFENDERS);
    const king = side.length ? side[this.rng.int(side.length)] : null;
    this.kings[DEFENDERS] = king ? king.id : 255;
    this.kings[ATTACKERS] = 255;
    for (const p of side) {
      if (!fort) continue; // (no fortress, can't happen: they drop in)
      p.pendingSpawn = false;
      const spot = p === king ? fort.king : this.freeSpot(fort);
      this.placeClone(p, spot.x - ACTOR_W / 2 + (p === king ? 0 : this.rng.range(-3, 3)), spot.y - ACTOR_H, 0, 0);
      if (p === king) {
        resetBody(p.parts, ClassId.Heavy);
        p.body.cls = p.parts.cls;
        this.crown(p);
      }
    }
    const sg = this.siege;
    if (sg) {
      for (const x of sg.defTanks) this.placeVehicle(x, -1);
      for (const x of sg.atkTanks) this.placeVehicle(x, -1);
      for (const x of sg.defDogs) this.placeVehicle(x, DEFENDERS);
      for (const x of sg.atkDogs) this.placeVehicle(x, ATTACKERS);
      // Now and then a tarantula too: half the sieges for the attackers (beside
      // their landing zone, on its far side), one in five for the defenders
      // (out past their gate's armour); rolled apart, so sometimes both.
      const out = sg.side === 0 ? 1 : -1;
      if (this.rng.next() < SIEGE_ATK_TARANTULA) this.placeTarantula(sg.side === 0 ? sg.lz[1] + 20 : sg.lz[0] - 20 - ACTOR_W * TARANTULA_SCALE, ATTACKERS, out);
      if (this.rng.next() < SIEGE_DEF_TARANTULA) this.placeTarantula((sg.defDogs[0] ?? sg.fort[out > 0 ? 1 : 0]) + out * 60, DEFENDERS, out);
    }
    this.teamsRev++;
  }

  /**
   * A vehicle standing on the ground at x at the start of a wave: an empty
   * tank (`team` -1, anyone's to climb into), or a watchdog for a soldier of
   * `team` who hasn't one yet.
   */
  private placeVehicle(x: number, team: number): void {
    const slot = this.tanks.indexOf(null);
    if (slot < 0) return;
    let owner = 255;
    if (team >= 0) {
      const free = this.players.filter((p): p is Player => !!p && p.team === team && !this.isKing(p) && !this.tanks.some((t) => t !== null && isDog(t) && t.owner === p.id));
      if (!free.length) return;
      owner = free[this.rng.int(free.length)].id;
    }
    const s = team >= 0 ? WATCHDOG_SCALE : 1;
    const w = Math.round(TANK_W * s);
    const h = tankH({ kind: team >= 0 ? TankKind.Watchdog : TankKind.Tank, s });
    x = Math.max(60, Math.min(WORLD_W - 60 - w, Math.round(x)));
    let top = WORLD_H;
    for (let gx = x; gx < x + w; gx += 2) top = Math.min(top, this.terrain.surfaceY(gx));
    this.tanks[slot] = newTank(x, top - h - 2, s, owner);
    this.dogMem.delete(slot);
  }

  /**
   * A tarantula standing at x at the start of a wave, one of `team`'s (a
   * soldier's, not its king's), stepped along `dir` clear of any vehicle
   * already there.
   */
  private placeTarantula(x: number, team: number, dir: number): void {
    const slot = this.tanks.indexOf(null);
    if (slot < 0) return;
    const free = this.players.filter((p): p is Player => !!p && p.team === team && !this.isKing(p));
    if (!free.length) return;
    const owner = free[this.rng.int(free.length)].id;
    const w = Math.round(ACTOR_W * TARANTULA_SCALE);
    const h = tankH({ kind: TankKind.Tarantula, s: TARANTULA_SCALE });
    for (let n = 0; n < 12 && this.tanks.some((t) => t !== null && x + w + 6 > t.x && x - 6 < t.x + tankW(t)); n++) x += dir * 40;
    x = Math.max(60, Math.min(WORLD_W - 60 - w, Math.round(x)));
    let top = WORLD_H;
    for (let gx = x; gx < x + w; gx += 2) top = Math.min(top, this.terrain.surfaceY(gx));
    this.tanks[slot] = newTarantula(x, top - h - 2, owner);
    this.dogMem.delete(slot);
  }

  /** Re-solve each body's level on the ground as it is now and repaint (clients repaint on the same tick); tell everyone if a level moved. */
  private settleWater(): void {
    let moved = false;
    for (const b of this.water) {
      const lv = solveLevel(this.terrain, b);
      if (lv !== b.level) {
        b.level = lv;
        moved = true;
      }
    }
    paintWater(this.terrain, this.water);
    if (moved) this.waterRev++;
  }

  /** Visit the living plants whose boxes overlap a rectangle. */
  private floraIn(x0: number, y0: number, x1: number, y1: number, fn: (i: number) => void): void {
    const c0 = Math.max(0, (x0 - 8) >> 6);
    const c1 = Math.min(this.floraCols.length - 1, (x1 + 8) >> 6);
    for (let c = c0; c <= c1; c++) {
      for (const i of this.floraCols[c]) {
        if (this.floraDead[i]) continue;
        const b = floraBox(this.flora[i]);
        if (b.x1 >= x0 && b.x0 <= x1 && b.y1 >= y0 && b.y0 <= y1) fn(i);
      }
    }
  }

  /** Does the plant's ground still stand (and its own spot stay open)? */
  private rooted(f: Flora): boolean {
    const t = this.terrain;
    if (!t.isSolid(f.x, f.y)) return false;
    return f.kind === FloraKind.Hanging ? !t.isSolid(f.x, f.y + 1) : !t.isSolid(f.x, f.y - 1);
  }

  /** A blast of radius r at (x, y) reaching plant i: torn up if the disc touches its box. */
  private hurtFlora(i: number, owner: number, x: number, y: number, r: number): void {
    const b = floraBox(this.flora[i]);
    const dx = Math.max(b.x0 - x, 0, x - b.x1);
    const dy = Math.max(b.y0 - y, 0, y - b.y1);
    if (dx * dx + dy * dy <= r * r) this.killFlora(i, owner);
  }

  /**
   * Plant i is hit: it's gone (the clients gib it). A blister coral doesn't
   * just go: it swells for a moment and bursts.
   */
  killFlora(i: number, owner: number, fuse = BLISTER_FUSE_HIT): void {
    if (this.floraDead[i]) return;
    if (this.flora[i].kind === FloraKind.Blister) {
      const f = this.floraFuse.get(i);
      if (!f) {
        this.floraFuse.set(i, { t: fuse, by: owner });
        this.floraRev++;
      } else if (f.t > fuse) {
        f.t = fuse;
        if (owner !== NO_OWNER) f.by = owner;
      }
      return;
    }
    this.floraDead[i] = 1;
    this.floraRev++;
  }

  /**
   * The flora, each tick: shots are handled as they fly (segmentActor) and
   * blasts as they carve; here, clones and vehicles brushing a blister coral
   * set it swelling, treads crush the rest, and swollen blisters burst.
   */
  private stepFlora(): void {
    if (!this.flora.length) return;
    if (this.tick % 3 === 0) {
      for (const p of this.players) {
        if (!p || !p.alive || p.tank >= 0) continue;
        const b = p.body;
        this.floraIn(b.x - BLISTER_TOUCH, p.top - BLISTER_TOUCH, b.x + ACTOR_W + BLISTER_TOUCH, b.y + ACTOR_H + BLISTER_TOUCH, (i) => {
          if (this.flora[i].kind === FloraKind.Blister) this.killFlora(i, NO_OWNER, BLISTER_FUSE_TOUCH);
        });
      }
      for (const k of this.tanks) {
        if (!k || k.chute) continue;
        this.floraIn(k.x, k.y, k.x + tankW(k), k.y + tankH(k) + 2, (i) => this.killFlora(i, isPet(k) ? k.owner : k.pilot === 255 ? NO_OWNER : k.pilot, BLISTER_FUSE_TOUCH));
      }
    }
    for (const [i, f] of this.floraFuse) {
      if (--f.t > 0) continue;
      this.floraFuse.delete(i);
      this.burstBlister(i, f.by);
    }
  }

  /** A blister coral bursts: a spray of caustic sap that scalds everyone close (sealed in a vehicle, they're safe). */
  /**
   * Wildlife (wildlife.ts): keep up their numbers (now and then a new one
   * comes up out of the deep, well away from everyone), and let each one
   * think and crawl. On every map and in every mode (not in the tutorial):
   * a mix of every kind of crawler, wasps' nests, and (deep down, on any
   * map but the labyrinth, whose ancient stone it would only bore into) a
   * basilisk.
   */
  private stepBeasts(): void {
    if (!this.wildlife) return;
    // (The lair: no new basilisks, but it crawls with millipedes and hangs with wasps' nests.)
    if (this.lair && this.tick >= this.beastSpawnAt) {
      this.beastSpawnAt = this.tick + BEAST_RESPAWN;
      this.stockLair();
    }
    if (!this.lair && this.mapKind !== MapKind.Dune && this.tick >= this.beastSpawnAt) {
      this.beastSpawnAt = this.tick + BEAST_RESPAWN;
      const want = this.caves ? BEASTS_CAVES : BEASTS_PLAIN;
      const nests = this.beasts.filter((b) => b?.kind === BeastKind.Nest).length;
      if (nests < (this.caves ? NESTS_CAVES : NESTS_PLAIN)) this.spawnNest();
      else if (!this.dungeon && this.tick >= this.basiliskAt && !this.beasts.some((b) => b && wyrm(b.kind))) {
        if (this.spawnBasilisk()) this.basiliskAt = Infinity;
      }
      else if (this.crawlers() < want) this.spawnBeast();
    }
    for (let k = 0; k < MAX_BEASTS; k++) {
      const b = this.beasts[k];
      // (Where its head was before it moves: its motion, for leading it with a locked-on shot.)
      const pts = this.beastPts[k];
      if (pts.length) {
        this.beastHead[k * 2] = pts[0];
        this.beastHead[k * 2 + 1] = pts[1];
      }
      if (b) {
        if (b.kind === BeastKind.Asp) this.stepAsp(k, b);
        else if (b.kind === BeastKind.Spider) this.stepSpider(k, b);
        else if (b.kind === BeastKind.Web) this.holdOn(k, b);
        else if (b.kind === BeastKind.Seeder) this.stepSeeder(k, b);
        else if (b.kind === BeastKind.Nest) this.stepNest(k, b);
        else if (wyrm(b.kind)) this.stepBasilisk(k, b);
        else this.stepMillipede(k, b);
      }
    }
    this.sendVenom();
    this.sendCoral();
  }

  /** A millipede, somewhere down in the caves: on a floor with room over it, deep, out of the water, far from any clone. */
  /** The lair's lesser life, kept up: LAIR_NESTS nests on its roof, LAIR_CRAWLERS millipedes (and the odd asp) on its floors and walls; one more of whichever's short. */
  private stockLair(): boolean {
    const nests = this.beasts.filter((b) => b?.kind === BeastKind.Nest).length;
    if (nests < LAIR_NESTS && this.spawnNest()) return true;
    const crawlers = this.crawlers();
    return crawlers < LAIR_CRAWLERS && this.spawnBeast(LAIR_ASP_SHARE);
  }

  private spawnBeast(aspShare = ASP_SHARE): boolean {
    const slot = this.beasts.indexOf(null);
    if (slot < 0) return false;
    const t = this.terrain;
    const rng = this.beastRng;
    for (let n = 0; n < 80; n++) {
      const x = 60 + rng.int(WORLD_W - 120);
      const surf = t.surfaceY(x);
      let y = surf + 60 + rng.int(Math.max(1, WORLD_H - surf - 100));
      if (t.isSolid(x, y)) continue;
      while (y < WORLD_H - 14 && !t.isSolid(x, y + 1)) y++;
      if (y >= WORLD_H - 14 || y < surf + 50 || t.wet(x, y)) continue;
      let room = 0;
      while (room < 10 && !t.isSolid(x, y - room - 1)) room++;
      if (room < 10) continue;
      const c = this.calm;
      if (c && x > c.x0 && x < c.x1 && y > c.y0) continue;
      if (this.players.some((p) => p && p.alive && Math.hypot(p.cx - x, p.cy - y) < 420)) continue;
      const roll = rng.next();
      // (A mix, always: any kind of crawler not about yet comes up first; then it's the luck of the roll.)
      const missing = CRAWLER_MIX.find((k) => !this.beasts.some((o) => o?.kind === k));
      const kind = missing ?? (roll < aspShare ? BeastKind.Asp : roll < aspShare + (1 - aspShare) * CSPIDER_SHARE ? BeastKind.Spider : BeastKind.Millipede);
      if (kind === BeastKind.Spider && this.beasts.filter((o) => o?.kind === BeastKind.Web).length < (this.lair ? LAIR_PACKS : PACKS)) return this.spawnPack(x, y);
      // (Enough packs about: a millipede instead.)
      const b = newBeast(t, kind === BeastKind.Spider ? BeastKind.Millipede : kind, x, y, rng.next() < 0.5 ? -1 : 1);
      b.turnAt = this.tick + 60;
      this.beasts[slot] = b;
      bodyPoints(t, b, this.beastPts[slot]);
      return true;
    }
    return false;
  }

  /**
   * How many crawlers are about, a pack of cave spiders counting as two
   * (each pack by its web; one whose web is gone, on its own).
   */
  private crawlers(): number {
    let n = 0;
    for (const b of this.beasts) {
      if (!b) continue;
      if (b.kind === BeastKind.Web) n += 2;
      else if (b.kind === BeastKind.Spider) n += this.webOf(b) ? 0 : 1;
      else if (crawler(b.kind)) n++;
    }
    return n;
  }

  /** A cave spider's web (its pack's nest), if it's still there. */
  private webOf(b: Beast): Beast | null {
    const w = b.home >= 0 ? this.beasts[b.home] : null;
    return w && w.kind === BeastKind.Web ? w : null;
  }

  /**
   * A pack of cave spiders come up at (x, y) (an open cell on a floor):
   * their web on the roof over it (or the nearest rock: a wall, the floor),
   * and CSPIDER_PACK_MIN..MAX of them on the floor round it, as many as
   * there's room for.
   */
  private spawnPack(x: number, y: number): boolean {
    const t = this.terrain;
    const rng = this.beastRng;
    const slot = this.beasts.indexOf(null);
    // (Room for its web and a pack, leaving room for wasps to hatch.)
    const free = this.beasts.filter((o) => !o).length - 1;
    if (slot < 0 || free - PACK_ROOM < CSPIDER_PACK_MIN) return false;
    let wy = y;
    while (wy > y - 60 && !t.isSolid(x, wy - 1)) wy--;
    if (!t.isSolid(x, wy - 1)) wy = y; // (no roof in reach: on the floor beside them)
    const web = newBeast(t, BeastKind.Web, x, wy, 1);
    web.seed = rng.int(256);
    this.beasts[slot] = web;
    nestCentre(web, this.beastPts[slot]);
    const n = Math.min(CSPIDER_PACK_MIN + rng.int(CSPIDER_PACK_MAX - CSPIDER_PACK_MIN + 1), free - PACK_ROOM);
    for (let i = 0; i < n; i++) {
      const s = this.beasts.indexOf(null);
      if (s < 0) break;
      // Spread along the floor either side (where there's floor), else bunched up.
      const off = (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 7;
      const sx = !t.isSolid(x + off, y) && t.isSolid(x + off, y + 1) ? x + off : x;
      const b = newBeast(t, BeastKind.Spider, sx, y, rng.next() < 0.5 ? -1 : 1);
      b.seed = rng.int(256);
      b.home = slot;
      b.turnAt = this.tick + 60;
      this.beasts[s] = b;
      bodyPoints(t, b, this.beastPts[s]);
    }
    return true;
  }

  /** A creature gone (killed, or fallen out of the world): a web's pack loses its home, and drops what it was carrying there. */
  private killBeast(k: number): void {
    const b = this.beasts[k];
    this.beasts[k] = null;
    if (b?.kind !== BeastKind.Web) return;
    for (const o of this.beasts) {
      if (o?.kind !== BeastKind.Spider || o.home !== k) continue;
      o.home = -1;
      o.carry = 0;
    }
  }

  /** A cave spider's pack (out to CSPIDER_PACK_CALL from (x, y)) turned on clone `id`: whoever isn't already after someone. */
  private callPack(home: number, x: number, y: number, id: number, hurt: boolean): void {
    if (home < 0) return;
    for (const o of this.beasts) {
      if (o?.kind !== BeastKind.Spider || o.home !== home) continue;
      const pts = this.beastPts[this.beasts.indexOf(o)];
      if (Math.hypot(pts[0] - x, pts[1] - y) > CSPIDER_PACK_CALL) continue;
      // (Called, it keeps after them out of its own sight, as if they'd hurt it; hurt, it turns on them whoever it was after.)
      if (hurt || o.hurtBy < 0) o.hurtBy = id;
      if (o.target >= 0 && !hurt) continue;
      o.target = id;
      o.frozen = 0;
      o.turnAt = this.tick;
    }
  }

  /** Who a creature goes for: whoever hurt it (not too far off), else the nearest clone it can see. */
  private beastTarget(b: Beast, hx: number, hy: number): number {
    const hurt = b.hurtBy >= 0 ? this.players[b.hurtBy] : null;
    if (hurt && hurt.alive && hurt.tank < 0 && Math.hypot(hurt.cx - hx, hurt.cy - hy) < MILLI_SENSE * 1.8) return hurt.id;
    // (Lying in wait, it sees further: a line on anyone in that reach wakes it.)
    let best = b.kind === BeastKind.Seeder ? SEEDER_SENSE : b.kind === BeastKind.Nest ? NEST_SENSE : b.kind === BeastKind.Asp ? ASP_SENSE : b.kind === BeastKind.Spider ? (b.frozen > 0 ? CSPIDER_SENSE_FROZEN : CSPIDER_SENSE) : b.frozen > 0 ? MILLI_SENSE_FROZEN : MILLI_SENSE;
    let id = -1;
    for (const p of this.players) {
      if (!p || !p.alive || p.tank >= 0 || p.pilot >= 0) continue;
      const d = Math.hypot(p.cx - hx, p.cy - hy);
      if (d < best && this.lineClear(hx, hy, p.cx, p.cy)) {
        best = d;
        id = p.id;
      }
    }
    return id;
  }

  /**
   * One tick of a millipede. It lies in wait, frozen still (its camouflage:
   * still, it's hard to see), wanders a while, freezes again. When it has
   * prey in sight it thaws at once and lunges, very fast, along the surfaces
   * after them (trying both ways along the ground and taking the one that
   * gets it nearer); in reach and with its spit ready, it rears up and spits
   * first. The clone its head reaches it coils round like a rope, holds fast
   * and bites (World: coilTick).
   */
  private stepMillipede(k: number, b: Beast): void {
    const t = this.terrain;
    const rng = this.beastRng;
    const pts = this.beastPts[k];
    const hx = pts.length ? pts[0] : b.x;
    const hy = pts.length ? pts[1] : b.y;
    if (b.spitCd > 0) b.spitCd--;
    if (b.coilCd > 0) b.coilCd--;
    if (b.coil >= 0) {
      this.coilTick(k, b);
      bodyPoints(t, b, pts);
      return;
    }
    if ((this.tick + k) % 6 === 0) {
      const before = b.target;
      b.target = this.beastTarget(b, hx, hy);
      // Prey spotted: thaw, and go for it, fast.
      if (b.target >= 0 && before < 0) {
        b.frozen = 0;
        b.lunge = MILLI_LUNGE_TICKS;
        b.turnAt = this.tick;
      }
    }
    let tgt = b.target >= 0 ? this.players[b.target] : null;
    if (tgt && (!tgt.alive || tgt.tank >= 0)) {
      tgt = null;
      b.target = -1;
    }
    // On a ceiling with its prey below: let go, and drop on them.
    if (tgt && b.rear === 0 && b.coilCd === 0 && onCeiling(t, b) && tgt.cy > hy + 8 && Math.abs(tgt.cx - hx) < MILLI_DROP_REACH && this.lineClear(hx, hy, tgt.cx, tgt.cy)) {
      b.attached = false;
      b.pounce = true;
      b.vy = 30;
      b.frozen = 0;
    }
    if (b.lunge > 0) b.lunge--;
    // On the attack: a sprint now and then, and (prey in reach, in sight) a fling, off whatever it holds, through the air at them.
    const pace = sprintTick(b, !!tgt, rng.next());
    if (tgt && b.attached && b.flung === 0 && b.rear === 0 && b.frozen === 0 && b.coilCd === 0 && b.flingCd === 0 && rng.next() < 0.15) {
      const d = Math.hypot(tgt.cx - hx, tgt.cy - hy);
      if (d > FLING_MIN && d < FLING_MAX && this.lineClear(hx, hy, tgt.cx, tgt.cy)) {
        b.fx = b.x + 0.5;
        b.fy = b.y + 0.5;
        fling(b, b.fx, b.fy, tgt.cx, tgt.cy);
        b.attached = false;
      }
    }
    // Rearing, and spitting at the top of it.
    if (b.rear > 0) {
      if (++b.rear === MILLI_SPIT_AT && tgt) this.spit(b, hx, hy, tgt);
      if (b.rear >= MILLI_REAR) {
        b.rear = 0;
        b.spitCd = MILLI_SPIT_CD + rng.int(30);
      }
    } else if (tgt && b.attached && b.spitCd === 0 && Math.hypot(tgt.cx - hx, tgt.cy - hy) > MILLI_COIL_R * 4 && Math.hypot(tgt.cx - hx, tgt.cy - hy) < MILLI_SPIT_RANGE && this.lineClear(hx, hy, tgt.cx, tgt.cy)) b.rear = 1;
    b.lift += ((b.rear > 0 ? 1 : 0) - b.lift) * 0.3;
    if (b.lift < 0.01) b.lift = 0;
    // Nothing about: wander a while, then freeze (and wait).
    if (!tgt && b.attached && b.rear === 0) {
      if (b.frozen > 0) b.frozen--;
      else if (--b.wander <= 0 && (!b.roost || onCeiling(t, b) || b.wander < -MILLI_WANDER * 4)) {
        // Rest here, wherever it is (wanting a ceiling, it goes on until it's on one, or gives up after a while).
        b.frozen = MILLI_FREEZE_MIN + rng.int(MILLI_FREEZE_MAX - MILLI_FREEZE_MIN);
        b.wander = MILLI_WANDER + rng.int(MILLI_WANDER);
        b.roost = rng.next() < MILLI_ROOST;
      }
    }
    if (b.flung > 0) {
      // Flung: through the air at them.
      flingStep(t, b, DT);
      if (b.y >= WORLD_H - 14) {
        this.beasts[k] = null;
        return;
      }
    } else if (!b.attached) {
      // Falling: its body follows its head down (dropping on prey, it steers at them as it falls).
      const y0 = b.y;
      fallStep(t, b, DT, GRAVITY);
      const y1 = b.y;
      for (let y = y0 + 1; y <= y1; y++) {
        b.y = y;
        pushTrail(b);
      }
      if (b.attached) b.pounce = false;
      else if (b.pounce && tgt) {
        // (MILLI_DROP_STEER cells a tick, on average: the whole cells, and the fraction now and then.)
        const steps = Math.floor(MILLI_DROP_STEER) + (rng.next() < MILLI_DROP_STEER % 1 ? 1 : 0);
        for (let n = 0; n < steps && Math.abs(tgt.cx - b.x) > 1; n++) {
          const nx = b.x + Math.sign(tgt.cx - b.x);
          if (t.isSolid(nx, b.y)) break;
          b.x = nx;
          pushTrail(b);
        }
      }
      if (b.y >= WORLD_H - 14) {
        this.beasts[k] = null;
        return;
      }
    } else if (b.rear === 0 && b.frozen === 0) {
      if (this.tick >= b.turnAt) {
        if (tgt) {
          // Which way along the ground gets it nearer: a few dozen steps each way, tried.
          const ahead = this.probeCrawl(b, false, tgt.cx, tgt.cy);
          const back = this.probeCrawl(b, true, tgt.cx, tgt.cy);
          if (back < ahead - 10) turnRound(b);
          b.turnAt = this.tick + 15;
        } else {
          // Scavenging: whichever way along the ground leads over more ground it hasn't been over.
          const ahead = this.probeNovel(b, false);
          const back = this.probeNovel(b, true);
          if (back > ahead + 3 || (back === ahead && rng.next() < 0.15)) turnRound(b);
          b.turnAt = this.tick + 60 + rng.int(90);
        }
      }
      // Getting nowhere (boxed in): turn round.
      if (Math.abs(b.x - b.lastX) + Math.abs(b.y - b.lastY) > 6) {
        b.lastX = b.x;
        b.lastY = b.y;
        b.still = 0;
      } else if (++b.still > 60) {
        turnRound(b);
        b.still = 0;
      }
      // (The sprint on its hunting pace: the lunge as it spots them is a burst of its own.)
      b.owed += (tgt ? (b.lunge > 0 ? MILLI_LUNGE : MILLI_HUNT * pace) : MILLI_CRAWL) * DT;
      while (b.owed >= 1 && b.attached) {
        b.owed--;
        // A thin wall ahead with an opening beyond: its mouth bites through (a body-sized hole, up
        // off its ground so the floor under it stays), and it flows on into the next passage.
        const gap = mouthOpening(t, b);
        if (gap > 0) {
          if (this.tick < b.biteAt) break;
          const ox = awayX(b) * MILLI_MOUTH_R;
          const oy = awayY(b) * MILLI_MOUTH_R;
          for (let k = 1; k <= gap; k += 2) this.carve(b.x + b.hx * k + ox, b.y + b.hy * k + oy, MILLI_MOUTH_R, 2, 2);
          b.biteAt = this.tick + MILLI_MOUTH_CD;
        }
        crawlStep(t, b);
        pushTrail(b);
        noteSeen(b);
        // Caught lapping a little island of rock (and not after anyone): drop off it at the first chance.
        if (tgt) resetLoop(b);
        else if (loopWatch(t, b)) {
          b.attached = false;
          b.vy = 30;
          break;
        }
        // (At a lunge's speed it can reach them mid-tick.)
        if (tgt && b.coilCd === 0 && Math.hypot(tgt.cx - b.x, tgt.cy - b.y) < MILLI_COIL_R) break;
      }
    }
    bodyPoints(t, b, pts);
    // Its head on a clone: coil round them.
    if (b.coilCd === 0 && b.rear === 0) {
      for (const p of this.players) {
        if (!p || !p.alive || p.tank >= 0 || this.shielded(p) || p.surf >= 0 || p.surfShip >= 0) continue;
        if (Math.hypot(p.cx - pts[0], p.cy - pts[1]) > MILLI_COIL_R + 3) continue;
        b.coil = p.id;
        b.coilT = 0;
        b.coilX = p.cx;
        b.coilY = p.cy;
        b.coilHurt = 0;
        b.frozen = 0;
        bodyPoints(t, b, pts);
        break;
      }
    }
  }

  /**
   * Coiled round a clone: it holds them fast where they stand (they can't
   * move, nor anyone pull them free), and at the end of it bites: enough to
   * kill most outright. (Hurt hard enough meanwhile, it lets go: hurtBeast.)
   */
  private coilTick(k: number, b: Beast): void {
    const v = this.players[b.coil];
    if (!v || !v.alive || v.tank >= 0) {
      this.uncoil(b);
      return;
    }
    b.coilT++;
    // Writhing with them: the coil (and they in it) thrashed about, this way and that.
    b.coilX += Math.cos(b.coilT * 0.55) * 1.4;
    b.coilY += Math.sin(b.coilT * 0.8) * 0.8;
    v.body.x = b.coilX - ACTOR_W / 2;
    v.body.y = b.coilY - (v.cy - v.body.y);
    v.body.vx = 0;
    v.body.vy = 0;
    if (b.coilT < MILLI_COIL_TICKS) return;
    const droid = v.parts.cls === ClassId.Droid;
    this.damage(v, droid ? MILLI_COIL_DROID : MILLI_COIL_KILL, NO_OWNER, W_COIL);
    if (v.alive) {
      v.venom = Math.min(VENOM_MAX, v.venom + VENOM_DOSE);
      // And flung far: away from the rest of its body, and up.
      const pts = this.beastPts[k];
      const at = Math.min(MILLI_COIL_SEGS, (pts.length >> 1) - 1) * 2;
      this.flingClone(v, b.coilX - pts[at], b.coilY - pts[at + 1], MILLI_FLING);
    }
    this.uncoil(b);
    // Sated: it lies still a while.
    b.frozen = MILLI_FREEZE_MIN;
    b.target = -1;
    b.hurtBy = -1;
  }

  /**
   * A clone flung by a creature: off along (dx, dy) and up, at `speed`
   * (cells/s): off their feet and through the air; it's the landing (or
   * the wall) that hurts.
   */
  private flingClone(p: Player, dx: number, dy: number, speed: number): void {
    let l = Math.hypot(dx, dy);
    if (l < 0.01) {
      dx = this.rng.next() < 0.5 ? -1 : 1;
      dy = 0;
      l = 1;
    }
    p.body.vx = (dx / l) * speed;
    p.body.vy = Math.min((dy / l) * speed, 0) - speed * 0.55;
  }

  /**
   * A basilisk (or dragon) with a clone in its jaws: it thrashes, its head
   * swinging this way and that and dragging them through the rock with it,
   * mauling them; after BASILISK_HOLD ticks it flings them far, off the way
   * its head swung, and up.
   */
  private holdTick(k: number, b: Beast, sc: number): void {
    const t = this.terrain;
    const pts = this.beastPts[k];
    const v = this.players[b.hold];
    if (!v || !v.alive || v.tank >= 0 || v.pilot >= 0) {
      b.hold = -1;
      b.coilCd = BASILISK_BITE_CD;
      return;
    }
    b.holdT++;
    // The thrash: its head swung side to side, driving on through the rock with them.
    b.ang += Math.sin(b.holdT * 0.6) * 0.3;
    boreStep(t, b, b.fx + Math.cos(b.ang) * 40 * sc, b.fy + Math.sin(b.ang) * 40 * sc, BASILISK_HUNT * 0.7 * sc, DT);
    if (b.holdT % 4 === 0) {
      const bore = BASILISK_BORE * sc;
      const ax = b.fx + Math.cos(b.ang) * bore * 0.5;
      const ay = b.fy + Math.sin(b.ang) * bore * 0.5;
      if (boreable(t, Math.round(ax), Math.round(ay))) this.carve(ax, ay, bore, bore, 2 * sc);
    }
    bodyPoints(t, b, pts);
    // In its mouth: just ahead of its head.
    v.body.x = pts[0] + Math.cos(b.ang) * BASILISK_R * 0.4 * sc - ACTOR_W / 2;
    v.body.y = pts[1] + Math.sin(b.ang) * BASILISK_R * 0.4 * sc - (v.cy - v.body.y);
    v.body.vx = 0;
    v.body.vy = 0;
    const jaws = b.kind === BeastKind.Dragon ? W_DRAGON : W_BASILISK;
    if (b.holdT % 3 === 0) this.damage(v, BASILISK_MAUL * 3 * (1 + (sc - 1) * 0.25), NO_OWNER, jaws);
    if (!v.alive) {
      b.hold = -1;
      b.coilCd = BASILISK_BITE_CD;
      return;
    }
    if (b.holdT < BASILISK_HOLD) return;
    // Flung: off the way its head was swinging, and up.
    this.flingClone(v, Math.cos(b.ang), Math.sin(b.ang), BASILISK_FLING * (1 + (sc - 1) * 0.3));
    b.hold = -1;
    b.holdT = 0;
    b.coilCd = BASILISK_BITE_CD * 3;
  }

  private uncoil(b: Beast): void {
    b.coil = -1;
    b.coilT = 0;
    b.coilCd = MILLI_COIL_CD;
  }

  /**
   * One tick of a gem asp. With nobody about it wanders a while, then curls
   * up on a floor as a gem and holds it for minutes. Prey in sight: curled
   * up, it waits until they come near (ASP_TRIGGER), then uncoils; up and
   * about, it goes after them. Near enough, it rears up hissing, then
   * strikes, very fast, and bites whoever its head reaches.
   */
  private stepAsp(k: number, b: Beast): void {
    const t = this.terrain;
    const rng = this.beastRng;
    const pts = this.beastPts[k];
    const hx = pts.length ? pts[0] : b.x;
    const hy = pts.length ? pts[1] : b.y;
    if (b.coilCd > 0) b.coilCd--; // (its bite's cooldown)
    if ((this.tick + k) % 6 === 0) {
      const before = b.target;
      b.target = this.beastTarget(b, hx, hy);
      if (b.target >= 0 && before < 0) b.turnAt = this.tick; // (prey: which way to it, now)
    }
    let tgt = b.target >= 0 ? this.players[b.target] : null;
    if (tgt && (!tgt.alive || tgt.tank >= 0)) {
      tgt = null;
      b.target = -1;
    }
    const dist = tgt ? Math.hypot(tgt.cx - hx, tgt.cy - hy) : Infinity;
    // Curled up as a gem: it holds it until someone comes near (or its time is up).
    if (b.gem) {
      if (tgt && dist < ASP_TRIGGER) {
        b.gem = false;
        b.frozen = 0;
        b.rear = 1; // (up, hissing)
      } else if (--b.frozen <= 0) {
        b.gem = false;
        b.frozen = 0;
      }
      bodyPoints(t, b, pts);
      return;
    }
    // Rearing up hissing, then the strike.
    if (b.rear > 0) {
      if (++b.rear >= ASP_HISS) {
        b.rear = 0;
        b.lunge = ASP_STRIKE_TICKS;
        b.turnAt = this.tick;
      }
    } else if (tgt && b.attached && b.lunge === 0 && b.coilCd === 0 && dist < ASP_TRIGGER) b.rear = 1;
    b.lift += ((b.rear > 0 ? 1 : 0) - b.lift) * 0.4;
    if (b.lift < 0.01) b.lift = 0;
    if (b.lunge > 0) b.lunge--;
    // On the attack: a sprint now and then, and a fling through the air at them (from further off than its strike).
    const pace = sprintTick(b, !!tgt, rng.next());
    if (tgt && b.attached && b.flung === 0 && b.rear === 0 && b.coilCd === 0 && b.flingCd === 0 && dist > ASP_TRIGGER && dist < FLING_MAX && rng.next() < 0.15 && this.lineClear(hx, hy, tgt.cx, tgt.cy)) {
      b.fx = b.x + 0.5;
      b.fy = b.y + 0.5;
      fling(b, b.fx, b.fy, tgt.cx, tgt.cy);
      b.attached = false;
    }
    // Nothing about: wander a while, then curl up as a gem (on a floor: it goes on until it's on one).
    if (!tgt && b.attached && b.rear === 0 && --b.wander <= 0 && onFloor(t, b)) {
      b.gem = true;
      b.frozen = ASP_DISGUISE_MIN + rng.int(ASP_DISGUISE_MAX - ASP_DISGUISE_MIN);
      b.wander = ASP_WANDER + rng.int(ASP_WANDER);
      bodyPoints(t, b, pts);
      return;
    }
    if (b.flung > 0) {
      flingStep(t, b, DT);
      if (b.y >= WORLD_H - 14) {
        this.beasts[k] = null;
        return;
      }
    } else if (!b.attached) {
      const y0 = b.y;
      fallStep(t, b, DT, GRAVITY);
      const y1 = b.y;
      for (let y = y0 + 1; y <= y1; y++) {
        b.y = y;
        pushTrail(b);
      }
      if (b.y >= WORLD_H - 14) {
        this.beasts[k] = null;
        return;
      }
    } else if (b.rear === 0) {
      if (this.tick >= b.turnAt) {
        if (tgt) {
          const ahead = this.probeCrawl(b, false, tgt.cx, tgt.cy);
          const back = this.probeCrawl(b, true, tgt.cx, tgt.cy);
          if (back < ahead - 4) turnRound(b);
          b.turnAt = this.tick + 10;
        } else {
          if (rng.next() < 0.3) turnRound(b);
          b.turnAt = this.tick + 90 + rng.int(150);
        }
      }
      if (Math.abs(b.x - b.lastX) + Math.abs(b.y - b.lastY) > 4) {
        b.lastX = b.x;
        b.lastY = b.y;
        b.still = 0;
      } else if (++b.still > 45) {
        turnRound(b);
        b.still = 0;
      }
      b.owed += (b.lunge > 0 ? ASP_STRIKE : tgt ? ASP_HUNT * pace : ASP_CRAWL) * DT;
      while (b.owed >= 1 && b.attached) {
        b.owed--;
        crawlStep(t, b);
        pushTrail(b);
        if (tgt) resetLoop(b);
        else if (loopWatch(t, b)) {
          b.attached = false;
          b.vy = 30;
          break;
        }
        if (tgt && Math.hypot(tgt.cx - b.x, tgt.cy - b.y) < ASP_BITE_R) break;
      }
    }
    bodyPoints(t, b, pts);
    // The bite, for whoever its head is on.
    if (b.coilCd === 0) {
      for (const p of this.players) {
        if (!p || !p.alive || p.tank >= 0 || this.shielded(p)) continue;
        if (Math.hypot(p.cx - pts[0], p.cy - pts[1]) > ASP_BITE_R + 4) continue;
        this.damage(p, ASP_BITE, NO_OWNER, W_ASP);
        if (p.alive) p.venom = Math.min(VENOM_MAX, p.venom + ASP_BITE_VENOM);
        p.body.vx += Math.sign(p.cx - pts[0]) * 50;
        b.coilCd = ASP_BITE_CD;
        b.lunge = 0;
        break;
      }
    }
  }

  /**
   * One tick of a cave spider (wildlife.ts CSPIDER_*). With nothing about it
   * wanders a while, then freezes still where it is, flat to the rock, and
   * waits. Prey in sight, it's off at once, running (and sprinting) along
   * the surfaces at them; near enough, it dashes the last stretch, or from
   * further off, in sight, leaps at them through the air; and bites, a
   * quick heavy bite and a shove.
   */
  private stepSpider(k: number, b: Beast): void {
    const t = this.terrain;
    const rng = this.beastRng;
    const pts = this.beastPts[k];
    const hx = pts.length ? pts[0] : b.x;
    const hy = pts.length ? pts[1] : b.y;
    if (b.coilCd > 0) b.coilCd--; // (its bite's cooldown)
    // A clone in its jaws: nothing else, until it's done with them.
    if (b.hold >= 0) {
      this.spiderHold(k, b);
      return;
    }
    // Carrying a limb home: its jaws are full; it hunts nothing until it's worked it into the web.
    const web = this.webOf(b);
    if (b.carry > 0 && (!web || ++b.legAge > CSPIDER_CARRY_MAX)) b.carry = 0;
    const home = b.carry > 0 ? this.beastPts[b.home] : null;
    if (home && Math.hypot(home[0] - hx, home[1] - hy) < CSPIDER_HOME_R) {
      web!.limbs++;
      web!.lift = Math.min(WEB_LIMBS, web!.limbs) / 255;
      b.carry = 0;
    }
    if (b.carry > 0) b.target = -1;
    else if ((this.tick + k) % 4 === 0) {
      const before = b.target;
      b.target = this.beastTarget(b, hx, hy);
      if (b.target >= 0 && before < 0) {
        b.frozen = 0;
        b.turnAt = this.tick; // (prey: which way to it, now)
        this.callPack(b.home, hx, hy, b.target, false); // (and the pack's on them too)
      }
    }
    let tgt = b.target >= 0 ? this.players[b.target] : null;
    if (tgt && (!tgt.alive || tgt.tank >= 0)) {
      tgt = null;
      b.target = -1;
    }
    const dist = tgt ? Math.hypot(tgt.cx - hx, tgt.cy - hy) : Infinity;
    // Lying in wait: still, until something comes (or its time is up).
    if (b.frozen > 0 && !tgt && !home && b.attached) {
      b.frozen--;
      bodyPoints(t, b, pts);
      return;
    }
    if (b.lunge > 0) b.lunge--;
    const pace = sprintTick(b, !!tgt, rng.next());
    if (tgt && b.attached && b.flung === 0 && b.lunge === 0 && b.coilCd === 0) {
      const seen = this.lineClear(hx, hy, tgt.cx, tgt.cy);
      if (dist < CSPIDER_DASH_R && seen) {
        // The dash: the last stretch, all at once.
        b.lunge = CSPIDER_DASH_TICKS;
        b.turnAt = this.tick;
      } else if (b.flingCd === 0 && dist < CSPIDER_LEAP_MAX && rng.next() < 0.3 && seen) {
        // The leap: off whatever it holds, through the air at them.
        b.fx = b.x + 0.5;
        b.fy = b.y + 0.5;
        fling(b, b.fx, b.fy, tgt.cx, tgt.cy, CSPIDER_LEAP);
        b.flingCd = CSPIDER_LEAP_CD;
        b.attached = false;
      }
    }
    // Carrying a limb, its web in sight and in reach (up on the roof over it, say): it leaps up to it.
    if (home && b.attached && b.flung === 0 && b.flingCd === 0 && Math.hypot(home[0] - hx, home[1] - hy) < CSPIDER_LEAP_MAX && this.lineClear(hx, hy, home[0], home[1])) {
      b.fx = b.x + 0.5;
      b.fy = b.y + 0.5;
      fling(b, b.fx, b.fy, home[0], home[1], CSPIDER_LEAP);
      b.flingCd = CSPIDER_LEAP_CD;
      b.attached = false;
    }
    // Its fangs out (the client shows it): dashing or leaping.
    b.lift += ((b.lunge > 0 || b.flung > 0 ? 1 : 0) - b.lift) * 0.5;
    if (b.lift < 0.01) b.lift = 0;
    // Nothing about: wander a while, then freeze.
    if (!tgt && !home && b.attached && --b.wander <= 0) {
      b.frozen = CSPIDER_FREEZE_MIN + rng.int(CSPIDER_FREEZE_MAX - CSPIDER_FREEZE_MIN);
      b.wander = CSPIDER_WANDER + rng.int(CSPIDER_WANDER);
      bodyPoints(t, b, pts);
      return;
    }
    if (b.flung > 0) {
      flingStep(t, b, DT);
      if (b.y >= WORLD_H - 14) {
        this.killBeast(k);
        return;
      }
    } else if (!b.attached) {
      const y0 = b.y;
      fallStep(t, b, DT, GRAVITY);
      const y1 = b.y;
      for (let y = y0 + 1; y <= y1; y++) {
        b.y = y;
        pushTrail(b);
      }
      if (b.y >= WORLD_H - 14) {
        this.killBeast(k);
        return;
      }
    } else {
      if (this.tick >= b.turnAt) {
        const goal = tgt ? [tgt.cx, tgt.cy] : home;
        if (goal) {
          const ahead = this.probeCrawl(b, false, goal[0], goal[1]);
          const back = this.probeCrawl(b, true, goal[0], goal[1]);
          if (back < ahead - 4) turnRound(b);
          b.turnAt = this.tick + 8;
        } else {
          if (rng.next() < 0.3) turnRound(b);
          b.turnAt = this.tick + 60 + rng.int(120);
        }
      }
      if (Math.abs(b.x - b.lastX) + Math.abs(b.y - b.lastY) > 4) {
        b.lastX = b.x;
        b.lastY = b.y;
        b.still = 0;
      } else if (++b.still > 45) {
        turnRound(b);
        b.still = 0;
      }
      b.owed += (b.lunge > 0 ? CSPIDER_DASH : tgt ? CSPIDER_HUNT * pace : home ? CSPIDER_HUNT : CSPIDER_CRAWL) * DT;
      while (b.owed >= 1 && b.attached) {
        b.owed--;
        crawlStep(t, b);
        pushTrail(b);
        if (tgt || home) resetLoop(b);
        else if (loopWatch(t, b)) {
          b.attached = false;
          b.vy = 30;
          break;
        }
        if (tgt && Math.hypot(tgt.cx - b.x, tgt.cy - b.y) < CSPIDER_BITE_R) break;
      }
    }
    bodyPoints(t, b, pts);
    // The bite, for whoever its head is on.
    if (b.coilCd === 0 && b.carry === 0) {
      for (const p of this.players) {
        if (!p || !p.alive || p.tank >= 0 || this.shielded(p)) continue;
        if (Math.hypot(p.cx - pts[0], p.cy - pts[1]) > CSPIDER_BITE_R + 4) continue;
        const torn = this.spiderBite(p, pts[0], pts[1]);
        // A limb torn off: it takes it, home to the web (if it has one).
        if (torn >= 0 && this.webOf(b)) {
          b.carry = 1 + torn;
          b.legAge = 0;
          b.target = -1;
          b.turnAt = this.tick;
        }
        if (!p.alive) {
          b.coilCd = CSPIDER_BITE_CD;
          b.lunge = 0;
          break;
        }
        // ...and it doesn't let go: it has them (unless something else already does).
        if (torn >= 0 && p.tank < 0 && p.pilot < 0 && !this.beasts.some((o) => o && o !== b && (o.hold === p.id || o.coil === p.id))) {
          b.hold = p.id;
          b.holdT = 0;
          b.coilHurt = 0;
          b.lunge = 0;
          b.turnAt = this.tick;
          break;
        }
        const s = Math.sign(p.cx - pts[0]) || 1;
        p.body.vx += s * CSPIDER_SHOVE;
        p.body.vy -= CSPIDER_SHOVE * 0.4;
        b.coilCd = CSPIDER_BITE_CD;
        b.lunge = 0;
        break;
      }
    }
  }

  /**
   * A cave spider with a clone in its jaws (CSPIDER_HOLD): it drags them
   * along (home toward its web, if it has one, else on the way it was
   * going), shaking them, biting again and again (each may take another
   * limb); its time up, it hurls them off. Let go early if they die, get
   * into a vehicle, or it's hurt enough (hurtBeast).
   */
  private spiderHold(k: number, b: Beast): void {
    const t = this.terrain;
    const pts = this.beastPts[k];
    const v = this.players[b.hold];
    const done = () => {
      b.hold = -1;
      b.holdT = 0;
      b.coilCd = CSPIDER_BITE_CD * 3;
      b.lift = 0;
    };
    if (!v || !v.alive || v.tank >= 0 || v.pilot >= 0) {
      done();
      return;
    }
    b.holdT++;
    b.lift = 1; // (fangs in)
    // Dragging them: crawling on (toward its web, the way it can best get there).
    if (b.attached) {
      const web = this.webOf(b) ? this.beastPts[b.home] : null;
      if (web && this.tick >= b.turnAt) {
        if (this.probeCrawl(b, true, web[0], web[1]) < this.probeCrawl(b, false, web[0], web[1]) - 4) turnRound(b);
        b.turnAt = this.tick + 10;
      }
      b.owed += CSPIDER_HOLD_DRAG * DT;
      while (b.owed >= 1 && b.attached) {
        b.owed--;
        crawlStep(t, b);
        pushTrail(b);
      }
    } else {
      const y0 = b.y;
      fallStep(t, b, DT, GRAVITY);
      for (let y = y0 + 1; y <= b.y; y++) {
        b.y = y;
        pushTrail(b);
      }
    }
    bodyPoints(t, b, pts);
    // In its jaws: hanging off its head, shaken about.
    const shake = Math.sin(b.holdT * 1.3) * 2.5;
    v.body.x = pts[0] + shake - ACTOR_W / 2;
    v.body.y = pts[1] - (v.cy - v.body.y) + Math.cos(b.holdT * 1.9) * 1.5;
    v.body.vx = 0;
    v.body.vy = 0;
    // Biting again and again.
    if (b.holdT % CSPIDER_HOLD_BITE === 0) {
      this.spiderBite(v, pts[0], pts[1]);
      if (!v.alive) {
        done();
        return;
      }
    }
    if (b.holdT < CSPIDER_HOLD) return;
    // Done with them: hurled off, the way it was shaking them, and up.
    const s = Math.sign(v.cx - pts[0]) || (b.hx >= 0 ? 1 : -1);
    v.body.vx = s * CSPIDER_HOLD_FLING;
    v.body.vy = -CSPIDER_HOLD_FLING * 0.5;
    done();
  }

  /**
   * A cave spider's bite on `p`, its jaws at (jx, jy): it goes for a limb
   * (an arm or a leg; a droid's legs), and half the time tears it clean
   * off (flung away from its jaws); else it mauls it, so the next bite
   * likely takes it. CSPIDER_BITE harm to the clone either way. The part
   * it tore off (-1: none).
   */
  private spiderBite(p: Player, jx: number, jy: number): number {
    const res = this.strikeScratch;
    res.hp = 0;
    res.detached.length = 0;
    res.vital = false;
    const limbs = p.parts.cls === ClassId.Droid ? DROID_LEGS : CORAL_LIMBS;
    const have = limbs.filter((l) => has(p.parts.mask, l));
    let part = -1;
    if (have.length) {
      part = have[this.beastRng.int(have.length)];
      harm(p.parts, part, this.beastRng.next() < CSPIDER_RIP ? 1e4 : CSPIDER_MAUL, res);
    }
    // (The harm to the clone is the bite's, whatever the limb took.)
    res.hp = CSPIDER_BITE;
    const torn = part >= 0 && res.detached.includes(part) ? part : -1;
    this.applyStrike(p, res, NO_OWNER, W_SPIDER, jx, jy);
    return torn;
  }

  /** A basilisk, hibernating down in the caves: on a deep, roomy floor (it's huge), far from everyone. */
  private spawnBasilisk(): boolean {
    const slot = this.beasts.indexOf(null);
    if (slot < 0) return false;
    const t = this.terrain;
    const rng = this.beastRng;
    for (let n = 0; n < 400; n++) {
      const x = 200 + rng.int(WORLD_W - 400);
      const surf = t.surfaceY(x);
      let y = surf + 130 + rng.int(Math.max(1, WORLD_H - surf - 160));
      if (y >= WORLD_H - 20 || t.isSolid(x, y)) continue;
      while (y < WORLD_H - 14 && !t.isSolid(x, y + 1)) y++;
      if (y >= WORLD_H - 14 || y < surf + 120 || t.wet(x, y)) continue;
      let room = 0;
      while (room < 16 && !t.isSolid(x, y - room - 1)) room++;
      if (room < 16) continue;
      const c = this.calm;
      if (c && x > c.x0 && x < c.x1 && y > c.y0) continue;
      if (this.players.some((p) => p && p.alive && Math.hypot(p.cx - x, p.cy - y) < 700)) continue;
      // (Now and then, a dragon in its place: deeper down, and far from anyone.)
      const kind = rng.next() < DRAGON_ODDS ? BeastKind.Dragon : BeastKind.Basilisk;
      if (kind === BeastKind.Dragon && (y < surf + 260 || this.players.some((p) => p && p.alive && Math.hypot(p.cx - x, p.cy - y) < 1100))) continue;
      const b = newBeast(t, kind, x, y - 8 * wyrmScale(kind), rng.next() < 0.5 ? -1 : 1);
      b.seed = rng.int(256);
      b.frozen = BASILISK_SLEEP_MIN + rng.int(BASILISK_SLEEP_MAX - BASILISK_SLEEP_MIN);
      this.beasts[slot] = b;
      bodyPoints(t, b, this.beastPts[slot]);
      return true;
    }
    return false;
  }

  /** A lair basilisk's prey: the nearest clone (or vehicle) within LAIR_HEAR of it, seen or not (it hears them in its cave). */
  private lairPrey(hx: number, hy: number, hear = LAIR_HEAR): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = hear;
    for (const p of this.players) {
      if (!p || !p.alive || p.pilot >= 0) continue;
      const tk = p.tank >= 0 ? this.tanks[p.tank] : null;
      const x = tk ? tk.x + tankW(tk) / 2 : p.cx;
      const y = tk ? tankCoreY(tk) : p.cy;
      const d = Math.hypot(x - hx, y - hy);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
    return best;
  }

  /** basiliskRoute's last plan for each basilisk: when made, toward where, and the waypoint it gave. */
  private readonly basRoutes = new WeakMap<Beast, { at: number; tx: number; ty: number; x: number; y: number } | null>();
  private readonly navSeen = new Int32Array((WORLD_W >> 3) * (WORLD_H >> 3));
  private readonly navPrev = new Int32Array((WORLD_W >> 3) * (WORLD_H >> 3));
  private readonly navQueue = new Int32Array((WORLD_W >> 3) * (WORLD_H >> 3));
  private navStamp = 0;

  /**
   * The way for a basilisk to (tx, ty) through its cave: a search over the
   * cave on an 8-cell grid, through open cells it can crawl (rock within its
   * reach to hold to: walls, floor, roof; the open middle of a hall it would
   * only fall through), replanned every few ticks. The waypoint a few cells
   * on along it, or null with no way found (then it bores straight there).
   */
  private basiliskRoute(b: Beast, tx: number, ty: number): { x: number; y: number } | null {
    const last = this.basRoutes.get(b);
    if (last !== undefined && this.tick - (last?.at ?? -1e9) < BAS_REPLAN && (!last || Math.hypot(last.tx - tx, last.ty - ty) < 24)) {
      if (!last || Math.hypot(last.x - b.fx, last.y - b.fy) > 10) return last ? { x: last.x, y: last.y } : null;
    }
    const t = this.terrain;
    const GW = WORLD_W >> 3;
    const GH = WORLD_H >> 3;
    const free = (x: number, y: number) => !t.isSolid(x, y);
    const open = (cx: number, cy: number) => {
      const x = cx * 8 + 4;
      const y = cy * 8 + 4;
      return free(x, y) && free(x - 3, y) && free(x + 3, y) && free(x, y - 3) && free(x, y + 3);
    };
    const crawl = (cx: number, cy: number) => {
      const x = cx * 8 + 4;
      const y = cy * 8 + 4;
      return !free(x, y + 10) || !free(x, y - 10) || !free(x + 10, y) || !free(x - 10, y) || !free(x + 7, y + 7) || !free(x - 7, y + 7) || !free(x + 7, y - 7) || !free(x - 7, y - 7);
    };
    const clampC = (v: number, n: number) => Math.max(0, Math.min(n - 1, v));
    const sx = clampC(Math.floor(b.fx / 8), GW);
    const sy = clampC(Math.floor(b.fy / 8), GH);
    const gx = clampC(Math.floor(tx / 8), GW);
    const gy = clampC(Math.floor(ty / 8), GH);
    const start = sy * GW + sx;
    const goal = gy * GW + gx;
    const stamp = ++this.navStamp;
    const seen = this.navSeen;
    const prev = this.navPrev;
    const q = this.navQueue;
    // From the prey back to the basilisk: then each cell's `prev` is the step on toward the prey.
    let head = 0;
    let tail = 0;
    seen[goal] = stamp;
    prev[goal] = -1;
    q[tail++] = goal;
    let found = false;
    while (head < tail && tail < BAS_SEARCH) {
      const c = q[head++];
      if (Math.abs((c % GW) - sx) <= 1 && Math.abs(((c / GW) | 0) - sy) <= 1) {
        prev[start] = c === start ? prev[c] : c;
        found = true;
        break;
      }
      const cx = c % GW;
      const cy = (c / GW) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + NAV_DX[d];
        const ny = cy + NAV_DY[d];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const n = ny * GW + nx;
        if (seen[n] === stamp) continue;
        seen[n] = stamp;
        if (n !== start && (!open(nx, ny) || !crawl(nx, ny))) continue;
        prev[n] = c;
        q[tail++] = n;
      }
    }
    let plan: { at: number; tx: number; ty: number; x: number; y: number } | null = null;
    if (found) {
      // A few cells on along the way (smoother than the very next one).
      let c = prev[start];
      for (let k = 0; k < 3 && c >= 0 && prev[c] >= 0; k++) c = prev[c];
      if (c >= 0) plan = { at: this.tick, tx, ty, x: (c % GW) * 8 + 4, y: ((c / GW) | 0) * 8 + 4 };
    }
    this.basRoutes.set(b, plan ?? null);
    if (!plan) this.basRoutes.set(b, { at: this.tick, tx, ty, x: tx, y: ty });
    return plan ? { x: plan.x, y: plan.y } : null;
  }

  /**
   * One tick of a dragon's breath: burning blood blasted from its jaws at
   * (tx, ty), DRAGON_BREATH_PER globs fanned across the cone round the arc
   * that lands on them (a shotgun's spread, sustained: it's re-aimed every
   * tick). Its last tick: a while before the next.
   */
  private dragonBreath(b: Beast, hx: number, hy: number, tx: number, ty: number): void {
    const rng = this.beastRng;
    const g = GRAVITY * PROJ[ProjKind.FireSpit].gravity;
    const sol = ballisticAim(hx, hy, { x: tx, y: ty, vx: 0, vy: 0 }, DRAGON_SPIT_SPEED, g);
    const a0 = sol ? sol.aim : Math.atan2(ty - hy, tx - hx) - 0.35;
    for (let k = 0; k < DRAGON_BREATH_PER; k++) {
      const a = a0 + rng.range(-DRAGON_BREATH_SPREAD, DRAGON_BREATH_SPREAD);
      const sp = DRAGON_SPIT_SPEED * rng.range(0.8, 1.15);
      this.spawnProj(this.nextProjId++, ProjKind.FireSpit, NO_OWNER, hx + Math.cos(a) * 20, hy + Math.sin(a) * 20, Math.cos(a) * sp, Math.sin(a) * sp);
    }
    if (--b.breath <= 0) {
      b.breath = 0;
      b.spitCd = DRAGON_SPIT_CD + rng.int(30);
    }
  }

  /** Room for a dragon's brood by its head at (hx, hy): free slots, and not DRAGON_BROOD_CROWD crawlers about it already. */
  private broodRoom(hx: number, hy: number): boolean {
    let free = 0;
    let near = 0;
    for (let k = 0; k < this.beasts.length; k++) {
      const c = this.beasts[k];
      if (!c) free++;
      else if ((c.kind === BeastKind.Millipede || c.kind === BeastKind.Asp) && Math.hypot(c.fx - hx, c.fy - hy) < DRAGON_BROOD_RANGE) near++;
    }
    return free >= DRAGON_BROOD_MIN && near < DRAGON_BROOD_CROWD;
  }

  /**
   * A dragon's brood: DRAGON_BROOD_MIN..MAX millipedes and asps spat out of
   * its jaws at (hx, hy) (facing dx, dy), each flung at one of the clones it
   * can see in reach (its prey first, the rest shared out among them), and
   * set on whoever it was flung at.
   */
  private dragonBrood(b: Beast, hx: number, hy: number, dx: number, dy: number): void {
    const t = this.terrain;
    const rng = this.beastRng;
    const marks: Player[] = [];
    for (const p of this.players) {
      if (!p || !p.alive || p.pilot >= 0 || p.tank >= 0) continue;
      if (Math.hypot(p.cx - hx, p.cy - hy) < DRAGON_BROOD_RANGE * 1.2 && this.lineClear(hx, hy, p.cx, p.cy)) marks.push(p);
    }
    if (!marks.length) return;
    marks.sort((p, q) => Math.hypot(p.cx - hx, p.cy - hy) - Math.hypot(q.cx - hx, q.cy - hy));
    // Out of its throat: just past its lips (or, walled in, at its head).
    const l = Math.hypot(dx, dy) || 1;
    let mx = hx + (dx / l) * (DRAGON_R + 3);
    let my = hy + (dy / l) * (DRAGON_R + 3);
    if (t.isSolid(Math.floor(mx), Math.floor(my))) {
      mx = hx;
      my = hy;
      if (t.isSolid(Math.floor(mx), Math.floor(my))) return;
    }
    const n = DRAGON_BROOD_MIN + rng.int(DRAGON_BROOD_MAX - DRAGON_BROOD_MIN + 1);
    for (let i = 0; i < n; i++) {
      const slot = this.beasts.indexOf(null);
      if (slot < 0) return;
      const p = marks[i % marks.length];
      const kind = rng.next() < 0.5 ? BeastKind.Millipede : BeastKind.Asp;
      const c = newBeast(t, kind, Math.floor(mx), Math.floor(my), p.cx < mx ? -1 : 1);
      c.seed = rng.int(256);
      c.fx = mx;
      c.fy = my;
      c.attached = false;
      // (Each a little off the next: a spray of them.)
      fling(c, mx, my, p.cx + rng.range(-24, 24), p.cy - rng.range(0, 16), DRAGON_BROOD_FLING * rng.range(0.85, 1.15));
      c.flingCd = FLING_CD;
      c.target = p.id;
      c.hurtBy = p.id;
      this.beasts[slot] = c;
      bodyPoints(t, c, this.beastPts[slot]);
    }
  }

  /** Disturbed: a basilisk wakes in a killing frenzy (up top already, it hunts at once). */
  private enrage(b: Beast): void {
    if (!wyrm(b.kind)) return;
    // (A lair basilisk is on its own ground already: it hunts where it is, no rush for the surface.)
    if (b.frenzy === 0) b.surfaced = this.lairHome.has(b) || b.fy <= this.terrain.surfaceY(Math.round(b.fx)) + 4;
    b.frozen = 0;
    b.frenzy = BASILISK_CALM;
    b.still = 0;
  }

  /** Has anything come near enough a sleeping basilisk to wake it? */
  private basiliskDisturbed(b: Beast, pts: number[]): boolean {
    for (const p of this.players) {
      if (!p || !p.alive || p.pilot >= 0) continue;
      const sc = wyrmScale(b.kind);
      if (Math.hypot(p.cx - pts[0], p.cy - pts[1]) < BASILISK_WAKE * sc && this.lineClear(pts[0], pts[1], p.cx, p.cy)) return true;
      if (nearestPoint(pts, p.cx, p.cy).d < BASILISK_TOUCH * sc) return true;
    }
    return false;
  }

  /** What a frenzied basilisk goes for: the nearest it can see from its head (or feel, near enough, through the ground). A clone in a vehicle: the vehicle. */
  private basiliskPrey(hx: number, hy: number, sc = 1): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const p of this.players) {
      if (!p || !p.alive || p.pilot >= 0) continue;
      const tk = p.tank >= 0 ? this.tanks[p.tank] : null;
      const x = tk ? tk.x + tankW(tk) / 2 : p.cx;
      const y = tk ? tankCoreY(tk) : p.cy;
      const d = Math.hypot(x - hx, y - hy);
      if (d >= bestD || d > BASILISK_SENSE * (1 + (sc - 1) * 0.25)) continue;
      // (Just under the ground, it watches the surface over it, as a shark the water.)
      const sy = Math.min(hy, this.terrain.surfaceY(Math.round(hx)) - 3);
      if (d > BASILISK_FEEL * sc && !this.lineClear(hx, hy, x, y) && !this.lineClear(hx, sy, x, y)) continue;
      bestD = d;
      best = { x, y };
    }
    return best;
  }

  /**
   * One tick of a basilisk. Hibernating, it holds still (BASILISK_SLEEP_*),
   * waking at once if anything comes near (or hurts it: hurtBeast); its
   * sleep over, it stirs, shifts a little through the rock and sleeps again.
   * Frenzied, it bores for the surface first; up top it hunts whatever it
   * sees or feels, and its jaws kill what they close on. With nothing about
   * for a while (BASILISK_CALM) it dives deep (BASILISK_DEEP) and sleeps.
   */
  private stepBasilisk(k: number, b: Beast): void {
    const t = this.terrain;
    const rng = this.beastRng;
    const pts = this.beastPts[k];
    // (A dragon: the same beast, everything scaled up; a bit quicker for its size.)
    const sc = wyrmScale(b.kind);
    const pace = 1 + (sc - 1) * 0.15;
    const bore = BASILISK_BORE * sc;
    if (b.coilCd > 0) b.coilCd--;
    if (b.spitCd > 0) b.spitCd--;
    // A clone in its jaws: nothing else, until it's done with them.
    if (b.hold >= 0) {
      this.holdTick(k, b, sc);
      return;
    }
    if (b.brood > 0) b.brood--;
    // Roaring (a dragon): stock still, jaws gaping, its brood spat out at the top of it.
    if (b.rear > 0) {
      if (b.rear === DRAGON_ROAR_SPIT) this.dragonBrood(b, pts[0], pts[1], pts[0] - pts[2], pts[1] - pts[3]);
      if (++b.rear > DRAGON_ROAR) b.rear = 0;
      b.lift += ((b.rear > 0 ? 1 : 0) - b.lift) * 0.35;
      if (b.lift < 0.01) b.lift = 0;
      b.vx = 0;
      b.vy = 0;
      bodyPoints(t, b, pts);
      return;
    }
    // (Its jaws gape while it breathes, else close.)
    b.lift += ((b.breath > 0 ? 0.6 : 0) - b.lift) * 0.35;
    if (b.lift < 0.01) b.lift = 0;
    const surf = t.surfaceY(Math.round(b.fx));
    let gx = b.fx;
    let gy = b.fy;
    let speed = 0;
    if (b.frenzy === 0) {
      if ((this.tick + k) % 10 === 0 && this.basiliskDisturbed(b, pts)) this.enrage(b);
      else if (b.frozen > 0) {
        b.frozen--;
        return; // (very still)
      }
    }
    if (b.frenzy === 0) {
      // Stirring (or diving to sleep): a short way through the rock, then sleep.
      if (b.still === 0) {
        b.lastX = Math.max(80, Math.min(WORLD_W - 80, b.fx + (rng.next() - 0.5) * 2 * BASILISK_STIR * sc));
        b.lastY = Math.max(surf + BASILISK_DEEP * sc * 0.6, Math.min(WORLD_H - 40, b.fy + (rng.next() - 0.3) * BASILISK_STIR * sc));
      }
      gx = b.lastX;
      gy = b.lastY;
      // (A lair basilisk, calmed, bores its way back home to its den.)
      const home = this.lairHome.get(b);
      const homing = !!home && gx === home.x && gy === home.y;
      speed = (homing || b.fy < surf + BASILISK_DEEP * sc * 0.5 ? BASILISK_RISE : BASILISK_CREEP) * pace;
      if (Math.hypot(gx - b.fx, gy - b.fy) < 10 * sc || ++b.still > (homing ? 30 * 60 : 30 * 15)) {
        b.still = 0;
        b.frozen = BASILISK_SLEEP_MIN + rng.int(BASILISK_SLEEP_MAX - BASILISK_SLEEP_MIN);
      }
    } else if (!b.surfaced) {
      // Its first instinct: up, the straightest way it can bore, to the surface.
      gx = b.fx + Math.cos(b.ang) * 6;
      gy = surf - 12 * sc;
      speed = BASILISK_RISE * pace;
      if (b.fy <= surf + 3) b.surfaced = true;
    } else {
      // In the lair: it hunts by ear, anyone anywhere in its cave, finding its way to them along
      // the cave's walls, floor and roof (basiliskRoute). Wild, it hunts what it sees up top.
      const lair = this.lairHome.has(b);
      const dune = this.duneHunters.has(b);
      const prey = lair ? this.lairPrey(b.fx, b.fy) : dune ? this.lairPrey(b.fx, b.fy, Infinity) : this.basiliskPrey(b.fx, b.fy, sc);
      speed = BASILISK_HUNT * pace;
      if (!prey) b.breath = 0;
      if (prey) {
        b.frenzy = BASILISK_CALM;
        const via = lair ? this.basiliskRoute(b, prey.x, prey.y) : null;
        gx = via ? via.x : prey.x;
        gy = via ? via.y : prey.y;
        // A sprint now and then; and, its prey in reach and in sight, it flings itself at them, off whatever it holds.
        speed *= sprintTick(b, true, rng.next());
        const d = Math.hypot(prey.x - b.fx, prey.y - b.fy);
        if (b.flung === 0 && b.flingCd === 0 && d > FLING_MIN * 3 && d < FLING_MAX * 2.5 && rng.next() < 0.1 && this.lineClear(b.fx, b.fy, prey.x, prey.y)) fling(b, b.fx, b.fy, prey.x, prey.y, 3);
        // A dragon spits flaming blood at it: a volley of burning gore, lobbed, from its jaws.
        // Or it stops, and roars, and spits its brood at them: crawlers, out of its throat.
        if (b.kind === BeastKind.Dragon && b.brood === 0 && b.flung === 0 && d < DRAGON_BROOD_RANGE && d > DRAGON_R * 3 && this.broodRoom(pts[0], pts[1]) && this.lineClear(pts[0], pts[1], prey.x, prey.y)) {
          b.rear = 1;
          b.brood = DRAGON_BROOD_CD + rng.int(30 * 4);
          b.spitCd = Math.max(b.spitCd, DRAGON_ROAR + 20);
        } else if (b.kind === BeastKind.Dragon && (b.breath > 0 || (b.spitCd === 0 && d < DRAGON_SPIT_RANGE && d > DRAGON_R * 2)) && this.lineClear(pts[0], pts[1], prey.x, prey.y)) {
          // Its breath: a sustained blast of burning blood at them (slowing as it pours it out).
          if (b.breath === 0) b.breath = DRAGON_BREATH_TICKS;
          this.dragonBreath(b, pts[0], pts[1], prey.x, prey.y);
          speed *= 0.35;
        } else b.breath = 0;
      } else if (!dune && --b.frenzy <= 0) {
        // Nothing left: down into the deep, to sleep. (DUNE's never rest: they prowl on, below.)
        b.frenzy = 0;
        b.still = 1;
        const home = this.lairHome.get(b);
        b.lastX = home ? home.x : b.fx;
        b.lastY = home ? home.y : Math.min(WORLD_H - 40, surf + BASILISK_DEEP * (1 + (sc - 1) * 0.5));
        b.surfaced = false;
      } else if (lair) {
        // Nobody about: back toward its den, the way it knows.
        const home = this.lairHome.get(b)!;
        const via = this.basiliskRoute(b, home.x, home.y);
        gx = via ? via.x : home.x;
        gy = via ? via.y : home.y;
      } else {
        // Prowling, just under the ground, the way it was going.
        gx = b.fx + (Math.cos(b.ang) >= 0 ? 60 : -60) * sc;
        gy = surf + 18 * sc;
      }
    }
    if (speed > 0) {
      const moved = boreStep(t, b, gx, gy, speed, DT);
      b.bored += moved;
      if (b.bored >= BASILISK_BORE_EVERY * sc) {
        b.bored = 0;
        // (Only a bite where there's rock to take.)
        const ax = b.fx + Math.cos(b.ang) * bore * 0.5;
        const ay = b.fy + Math.sin(b.ang) * bore * 0.5;
        if (t.isSolid(Math.round(ax), Math.round(ay)) || t.isSolid(Math.round(b.fx), Math.round(b.fy + bore - 2)) || t.isSolid(Math.round(b.fx), Math.round(b.fy - bore + 2))) {
          // (Near anything that won't yield, a soft bite only: its jaws never so much as chip cement or bedrock.)
          let hard = false;
          for (let dy = -bore - 2; dy <= bore + 2 && !hard; dy += 2 * sc) {
            for (let dx = -bore - 2; dx <= bore + 2; dx += 2 * sc) {
              if (!boreable(t, Math.round(ax + dx), Math.round(ay + dy))) {
                hard = true;
                break;
              }
            }
          }
          this.carve(ax, ay, bore, hard ? 0 : bore, 3 * sc);
        }
      }
    }
    bodyPoints(t, b, pts);
    // Its jaws.
    if (b.frenzy > 0 && b.coilCd === 0) {
      const reach = (BASILISK_R + BASILISK_JAWS) * sc;
      const jaws = b.kind === BeastKind.Dragon ? W_DRAGON : W_BASILISK;
      for (const p of this.players) {
        if (!p || !p.alive || p.tank >= 0 || p.pilot >= 0) continue;
        if (Math.hypot(p.cx - pts[0], p.cy - pts[1]) > reach) continue;
        // Its jaws close on them: it has them.
        this.damage(p, BASILISK_BITE * (1 + (sc - 1) * 0.25), NO_OWNER, jaws);
        b.coilCd = BASILISK_BITE_CD;
        if (p.alive) {
          b.hold = p.id;
          b.holdT = 0;
          break;
        }
      }
      for (let s = 0; s < this.tanks.length; s++) {
        const tk = this.tanks[s];
        if (!tk) continue;
        const cx = Math.max(tk.x, Math.min(tk.x + tankW(tk), pts[0]));
        const cy = Math.max(tk.y, Math.min(tk.y + tankH(tk), pts[1]));
        if (Math.hypot(cx - pts[0], cy - pts[1]) > reach) continue;
        this.hurtTankPart(s, TankPart.Hull, TANK_HP * BASILISK_CRUSH * sc, NO_OWNER);
        b.coilCd = BASILISK_BITE_CD;
      }
    }
    // Its body: awake, and moving, the great plated length of it batters whoever it rolls
    // into (each clone struck at most every BAS_BODY_CD ticks), and knocks them away.
    if (b.frenzy > 0 && Math.hypot(b.vx, b.vy) > 10) {
      const r = BASILISK_R * sc + 2;
      for (const p of this.players) {
        if (!p || !p.alive || p.tank >= 0 || p.pilot >= 0 || this.tick < this.basBodyAt[p.id]) continue;
        // (Its head is its jaws' business; from the second segment back.)
        const { d, i } = nearestPoint(pts, p.cx, p.cy);
        if (i < 1 || d > r) continue;
        this.damage(p, BAS_BODY_HARM * (1 + (sc - 1) * 0.5), NO_OWNER, b.kind === BeastKind.Dragon ? W_DRAGON : W_BASILISK);
        this.basBodyAt[p.id] = this.tick + BAS_BODY_CD;
        const dx = p.cx - pts[i * 2];
        const dy = p.cy - pts[i * 2 + 1];
        const l = Math.hypot(dx, dy) || 1;
        p.body.vx += (dx / l) * 140 * (1 + (sc - 1) * 0.4);
        p.body.vy += (dy / l) * 140 * (1 + (sc - 1) * 0.4) - 60;
      }
      for (let s = 0; s < this.tanks.length; s++) {
        const tk = this.tanks[s];
        if (!tk || this.tick < this.basBodyAtTank[s]) continue;
        const { d } = nearestPoint(pts, tk.x + tankW(tk) / 2, tk.y + tankH(tk) / 2);
        if (d > r + tankW(tk) / 2) continue;
        this.hurtTankPart(s, TankPart.Hull, TANK_HP * BAS_BODY_CRUSH * sc, NO_OWNER);
        this.basBodyAtTank[s] = this.tick + BAS_BODY_CD;
      }
    }
  }

  /** Each creature's head last tick (x, y by slot), for its motion. */
  private readonly beastHead = new Float32Array(MAX_BEASTS * 2);

  /** When each clone (by id) and each vehicle (by slot) can next be battered by a basilisk's body. */
  private readonly basBodyAt = new Int32Array(MAX_PLAYERS);
  private readonly basBodyAtTank = new Int32Array(MAX_TANKS);

  /** A coral nest, grown on a cave roof (or a wall) down in the caves, with room under it, far from any clone. */
  private spawnNest(): boolean {
    const slot = this.beasts.indexOf(null);
    if (slot < 0) return false;
    const t = this.terrain;
    const rng = this.beastRng;
    for (let n = 0; n < 80; n++) {
      const x = 60 + rng.int(WORLD_W - 120);
      const surf = t.surfaceY(x);
      let y = surf + 60 + rng.int(Math.max(1, WORLD_H - surf - 100));
      if (t.isSolid(x, y)) continue;
      // Up to the roof over it.
      while (y > surf + 40 && !t.isSolid(x, y - 1)) y--;
      if (!t.isSolid(x, y - 1) || t.wet(x, y)) continue;
      let room = 0;
      while (room < 24 && !t.isSolid(x, y + room + 1)) room++;
      if (room < 24) continue;
      const c = this.calm;
      if (c && x > c.x0 && x < c.x1 && y > c.y0) continue;
      if (this.players.some((p) => p && p.alive && Math.hypot(p.cx - x, p.cy - y) < 420)) continue;
      if (this.beasts.some((o) => o?.kind === BeastKind.Nest && Math.hypot(o.x - x, o.y - y) < 300)) continue;
      const b = newBeast(t, BeastKind.Nest, x, y, 1);
      this.beasts[slot] = b;
      nestCentre(b, this.beastPts[slot]);
      return true;
    }
    return false;
  }

  /**
   * A rooted thing (a coral nest, a spiders' web) holding on to its rock:
   * that dug away, it takes hold of whatever else is next to it, or falls,
   * and lies where it lands. False if it fell out of the world.
   */
  private holdOn(k: number, b: Beast): boolean {
    const t = this.terrain;
    if (b.attached && t.isSolid(b.x + b.hx, b.y + b.hy)) return true;
    if (!anchorNest(t, b)) {
      b.vy = Math.min(400, b.vy + GRAVITY * DT);
      for (let n = Math.max(1, Math.round(b.vy * DT)); n > 0; n--) {
        if (t.isSolid(b.x, b.y + 1)) {
          b.vy = 0;
          anchorNest(t, b);
          break;
        }
        b.y++;
      }
      if (b.y >= WORLD_H - 14) {
        this.killBeast(k);
        return false;
      }
    }
    nestCentre(b, this.beastPts[k]);
    return true;
  }

  /**
   * One tick of a coral nest. Every NEST_LOOK ticks it feels about it for
   * danger (a clone in sight within NEST_SENSE, or its alarm up: it was
   * hurt), and with danger about and none of its brood still out, it sends
   * out a brood of NEST_BROOD seeders (no sooner than NEST_BROOD_CD after the
   * last). Its rock dug away, it falls, and lies where it lands.
   */
  private stepNest(k: number, b: Beast): void {
    const t = this.terrain;
    const pts = this.beastPts[k];
    if (b.alarm > 0) b.alarm--;
    if (!this.holdOn(k, b)) return;
    if ((this.tick + k) % NEST_LOOK !== 0 || this.tick < b.brood) return;
    const danger = b.alarm > 0 || this.beastTarget(b, pts[0], pts[1]) >= 0;
    if (this.beasts.some((o) => o?.kind === BeastKind.Seeder && o.home === k)) return;
    // Quiet: now and then a few out to forage, while there aren't too many about.
    const forage = !danger && this.beasts.filter((o) => o?.kind === BeastKind.Seeder).length < SEEDERS_MAX;
    if (!danger && !forage) return;
    b.brood = this.tick + (danger ? NEST_BROOD_CD : NEST_FORAGE_CD);
    const rng = this.beastRng;
    for (let n = 0; n < (danger ? NEST_BROOD : NEST_FORAGERS); n++) {
      const slot = this.beasts.indexOf(null);
      if (slot < 0) break;
      // Out of the nest's mouth (its open side), fanned out a little.
      const sx = pts[0] - b.hx * 4 + rng.range(-2, 2);
      const sy = pts[1] - b.hy * 4 + rng.range(-2, 2);
      if (t.isSolid(Math.floor(sx), Math.floor(sy))) continue;
      const s = newSeeder(t, sx, sy, k);
      s.vx = -b.hx * 60 + rng.range(-50, 50);
      s.vy = -b.hy * 60 + rng.range(-50, 50);
      s.seed = rng.int(256);
      this.beasts[slot] = s;
      flierPoints(s, this.beastPts[slot]);
    }
  }

  /**
   * One tick of a seeder. It goes for the nearest clone it can see: in at
   * them in a wasp's jinking flight, a sting, and a dart away
   * (SEEDER_DART), and in again. Nobody to chase for SEEDER_IDLE, it flies
   * home and back into its nest; its nest gone, it drifts about and in time
   * dies off (SEEDER_EXPIRE).
   */
  private stepSeeder(k: number, b: Beast): void {
    const t = this.terrain;
    const rng = this.beastRng;
    const pts = this.beastPts[k];
    if (b.coilCd > 0) b.coilCd--;
    if (b.lunge > 0) b.lunge--;
    if ((this.tick + k) % 8 === 0 || b.target < 0) b.target = this.beastTarget(b, b.fx, b.fy);
    let tgt = b.target >= 0 ? this.players[b.target] : null;
    if (tgt && (!tgt.alive || tgt.tank >= 0 || tgt.pilot >= 0)) {
      tgt = null;
      b.target = -1;
    }
    const home = b.home >= 0 ? this.beasts[b.home] : null;
    const nest = home && home.kind === BeastKind.Nest ? this.beastPts[b.home] : null;
    if (!nest) b.home = -1;
    let gx: number;
    let gy: number;
    if (tgt) {
      b.still = 0;
      if (b.lunge > 0) {
        // Darting off after a sting: away and up.
        gx = b.fx + Math.sign(b.fx - tgt.cx || 1) * 40;
        gy = tgt.cy - 30;
      } else {
        // In at them, circling a little as it comes (each its own way round).
        const d = Math.hypot(tgt.cx - b.fx, tgt.cy - b.fy);
        const orbit = d > 24 ? 14 : 0;
        const a = this.tick * 0.12 + b.seed;
        gx = tgt.cx + Math.cos(a) * orbit;
        gy = tgt.cy + Math.sin(a) * orbit * 0.6;
      }
    } else if (b.forage > 0) {
      // Out foraging: to and fro, up toward the surface and back down round its nest, on the lookout.
      b.forage--;
      b.still = 0;
      if (++b.legAge > 30 * 8 || Math.hypot(b.lastX - b.fx, b.lastY - b.fy) < 10 || b.legAge === 1) this.forageLeg(b, nest);
      gx = b.lastX;
      gy = b.lastY;
    } else {
      b.still++;
      if (nest && b.still > SEEDER_IDLE) {
        // Home, and in.
        gx = nest[0];
        gy = nest[1];
        if (Math.hypot(gx - b.fx, gy - b.fy) < 6) {
          this.beasts[k] = null;
          return;
        }
      } else {
        if (!nest && b.still > SEEDER_EXPIRE) {
          this.hurtBeast(k, b.hp, NO_OWNER);
          return;
        }
        // Hanging about: a lazy drift round its nest (or where it is).
        const cx = nest ? nest[0] : b.fx;
        const cy = nest ? nest[1] + 16 : b.fy;
        const a = this.tick * 0.03 + b.seed;
        gx = cx + Math.cos(a) * 26;
        gy = cy + Math.sin(a * 1.3) * 12;
      }
    }
    // Keep a little apart from the rest of the swarm.
    for (let o = 0; o < MAX_BEASTS; o++) {
      const s = this.beasts[o];
      if (o === k || !s || s.kind !== BeastKind.Seeder) continue;
      const dx = b.fx - s.fx;
      const dy = b.fy - s.fy;
      const d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 8) {
        gx += (dx / d) * 10;
        gy += (dy / d) * 10;
      }
    }
    flyStep(t, b, gx, gy, DT, rng.range(-1, 1), rng.range(-1, 1));
    if (b.fy >= WORLD_H - 4 || b.fy < 2) {
      this.beasts[k] = null;
      return;
    }
    flierPoints(b, pts);
    // The sting, for whoever it's on.
    if (b.coilCd > 0) return;
    for (const p of this.players) {
      if (!p || !p.alive || p.tank >= 0 || p.pilot >= 0 || this.shielded(p)) continue;
      const bx = p.body.x;
      const by = p.top;
      const h = p.body.y + ACTOR_H - p.top;
      if (b.fx < bx - SEEDER_STING_R || b.fx > bx + ACTOR_W + SEEDER_STING_R || b.fy < by - SEEDER_STING_R || b.fy > by + h + SEEDER_STING_R) continue;
      this.sting(p, b);
      b.coilCd = SEEDER_STING_CD;
      b.lunge = SEEDER_DART;
      b.vx = -b.vx * 0.6;
      b.vy = -Math.abs(b.vy) * 0.6 - 40;
      break;
    }
  }

  /**
   * A foraging seeder's next leg: somewhere it can see from where it is
   * (open air, in a straight line), SEEDER_LEG cells or so off. Ranging up,
   * the higher the better (toward the surface, and out over it); ranging
   * back, the nearer its nest (or anywhere, nest gone). It turns about each
   * leg, or when it can't find a way on.
   */
  private forageLeg(b: Beast, nest: number[] | null): void {
    const t = this.terrain;
    const rng = this.beastRng;
    b.legAge = 2;
    b.rangeUp = !b.rangeUp;
    let best = -Infinity;
    let bx = b.fx;
    let by = b.fy;
    for (let n = 0; n < 14; n++) {
      const a = rng.range(0, Math.PI * 2);
      const d = SEEDER_LEG * rng.range(0.4, 1);
      const x = b.fx + Math.cos(a) * d;
      const y = b.fy + Math.sin(a) * d;
      if (x < 8 || x > WORLD_W - 8 || y < 8 || y > WORLD_H - 20) continue;
      if (t.isSolid(Math.floor(x), Math.floor(y)) || !this.lineClear(b.fx, b.fy, x, y)) continue;
      const surf = t.surfaceY(Math.floor(x));
      // (Up: as high as it'll go, but not off into the sky: it skims the surface.)
      const score = b.rangeUp ? -y - Math.max(0, surf - 40 - y) * 3 : nest ? -Math.hypot(x - nest[0], y - nest[1]) : rng.next();
      if (score > best) {
        best = score;
        bx = x;
        by = y;
      }
    }
    b.lastX = bx;
    b.lastY = by;
  }

  /** A seeder's sting: a little harm, and coral sown in one of the clone's limbs (not a droid's: metal). */
  private sting(p: Player, b: Beast): void {
    this.damage(p, SEEDER_STING, NO_OWNER, W_SEED);
    if (!p.alive || p.parts.cls === ClassId.Droid) return;
    const limbs = CORAL_LIMBS.map((part, i) => i).filter((i) => has(p.parts.mask, CORAL_LIMBS[i]));
    if (!limbs.length) return;
    // Where it struck: the legs if it came in low, the arms if high, else any.
    const low = b.fy > p.top + (p.body.y + ACTOR_H - p.top) * 0.6;
    const near = limbs.filter((i) => (CORAL_LIMBS[i] >= Part.LegB) === low);
    const pick = near.length ? near : limbs;
    const i = pick[this.beastRng.int(pick.length)];
    // Its fate, when the nest first takes hold in it (stung again, it only grows faster).
    if (!p.coral.some((c) => c > 0)) p.coralFatal = this.beastRng.next() < CORAL_FATAL;
    p.coral[i] = Math.min(0.99, Math.max(p.coral[i], 0.02) + CORAL_SEED);
  }

  /**
   * One tick of the nest growing in a clone's limbs: slowly (faster the more
   * of it there is), a slow drain on the clone as it goes. Full grown, its
   * fate (rolled when it took hold, CORAL_FATAL): it bursts out of the limb
   * and kills (a new nest on the corpse: corpseNest), or it withers and
   * drops off. True if it did anything.
   */
  private coralTick(p: Player): boolean {
    let any = false;
    for (let i = 0; i < CORAL_LIMBS.length; i++) {
      const c = p.coral[i];
      if (c <= 0) continue;
      if (!has(p.parts.mask, CORAL_LIMBS[i])) {
        p.coral[i] = 0;
        continue;
      }
      any = true;
      const next = Math.min(1, c + CORAL_GROW * (0.5 + c * 1.5));
      p.coral[i] = next;
      if (next < 1) continue;
      if (p.coralFatal) {
        // It bursts out of the limb, and the host is done for.
        this.burstCoral(p, i);
        if (p.alive) this.damage(p, 1e4, NO_OWNER, W_SEED, false, true);
        return true;
      }
      // It withers and drops off (all of it: the host threw it off).
      p.coral.fill(0);
      return true;
    }
    if (any) this.damage(p, CORAL_HP, NO_OWNER, W_SEED, true);
    return any;
  }

  /**
   * A clone died with the nest in it: a new nest grows on its corpse (falling
   * to lie where it does), and CORPSE_BROOD to CORPSE_BROOD + CORPSE_BROOD_MORE
   * of its brood crawl straight out of the body, already hunting.
   */
  private corpseNest(p: Player): void {
    if (!this.wildlife) return;
    const t = this.terrain;
    const x = Math.round(p.cx);
    let y = Math.round(p.body.y + ACTOR_H - 4);
    while (y > 2 && t.isSolid(x, y)) y--;
    const slot = this.beasts.indexOf(null);
    if (slot < 0) return;
    const nest = newBeast(t, BeastKind.Nest, x, y, 1);
    nest.attached = false;
    nest.brood = this.tick + NEST_BROOD_CD; // (its first brood is already out)
    this.beasts[slot] = nest;
    nestCentre(nest, this.beastPts[slot]);
    const rng = this.beastRng;
    const n = CORPSE_BROOD + rng.int(CORPSE_BROOD_MORE + 1);
    for (let k = 0; k < n; k++) {
      const s = this.beasts.indexOf(null);
      if (s < 0) break;
      const sx = x + rng.range(-3, 3);
      const sy = y - 3 - rng.range(0, 4);
      if (t.isSolid(Math.floor(sx), Math.floor(sy))) continue;
      const b = newSeeder(t, sx, sy, slot);
      b.vx = rng.range(-70, 70);
      b.vy = -rng.range(40, 110);
      b.seed = rng.int(256);
      this.beasts[s] = b;
      flierPoints(b, this.beastPts[s]);
    }
  }

  /** Full grown coral bursts out of a limb, and the limb comes off. */
  private burstCoral(p: Player, i: number): void {
    const part = CORAL_LIMBS[i];
    p.coral[i] = 0;
    if (!has(p.parts.mask, part)) return;
    const res = this.strikeScratch;
    res.hp = 0;
    res.detached.length = 0;
    res.vital = false;
    harm(p.parts, part, 1e4, res);
    res.hp = 6;
    const legs = part >= Part.LegB;
    this.applyStrike(p, res, NO_OWNER, W_SEED, p.cx, p.cy + (legs ? 5 : -1));
  }

  /** Who has coral in their limbs, and how far grown (for clients to show it): when that changes much, and now and then while anyone does. */
  private sendCoral(): void {
    let key = '';
    for (const p of this.players) {
      if (!p || !p.alive || !p.coral.some((c) => c > 0)) continue;
      key += `${p.id}:`;
      for (const c of p.coral) key += `${Math.round(c * 16)},`;
    }
    if (key === this.coralSent && (key === '' || this.tick % 15 !== 0)) return;
    this.coralSent = key;
    const sick = this.players.filter((p): p is Player => !!p && p.alive && p.coral.some((c) => c > 0));
    const w = this.broadcast;
    w.u8(R_CORAL);
    w.u8(sick.length);
    for (const p of sick) {
      w.u8(p.id);
      for (const c of p.coral) w.u8(Math.round(Math.min(1, c) * 255));
    }
  }

  /** How much ground it hasn't been over lately a creature would cross going `back` (round) or on, a few dozen steps along the ground. */
  private probeNovel(b: Beast, back: boolean): number {
    const g = { ...b, trail: [] };
    if (back) turnRound(g);
    const seen = new Set(b.seen);
    let fresh = 0;
    let last = -1;
    for (let n = 0; n < 60 && g.attached; n++) {
      crawlStep(this.terrain, g);
      const k = patchOf(g.x, g.y);
      if (k !== last && !seen.has(k)) fresh++;
      last = k;
    }
    return fresh;
  }

  /** How near (x, y) a creature would get going `back` (round) or on, a few dozen steps along the ground. */
  private probeCrawl(b: Beast, back: boolean, x: number, y: number): number {
    const g = { ...b, trail: [] };
    if (back) turnRound(g);
    let best = Infinity;
    for (let n = 0; n < 36 && g.attached; n++) {
      crawlStep(this.terrain, g);
      best = Math.min(best, Math.hypot(g.x - x, g.y - y));
    }
    return best;
  }

  /** A glob of venom from its reared head at a clone, on the arc that lands (leading it a little). */
  private spit(b: Beast, hx: number, hy: number, tgt: Player): void {
    const g = GRAVITY * PROJ[ProjKind.Venom].gravity;
    const sol = ballisticAim(hx, hy, { x: tgt.cx, y: tgt.cy, vx: tgt.body.vx, vy: tgt.body.vy }, MILLI_SPIT_SPEED, g);
    const a = (sol ? sol.aim : Math.atan2(tgt.cy - hy, tgt.cx - hx) - 0.3) + this.beastRng.range(-0.04, 0.04);
    this.spawnProj(this.nextProjId++, ProjKind.Venom, NO_OWNER, hx, hy, Math.cos(a) * MILLI_SPIT_SPEED, Math.sin(a) * MILLI_SPIT_SPEED);
    void b;
  }

  /** A creature hurt: it turns on whoever did it; at no health left it dies. */
  hurtBeast(k: number, dmg: number, by: number): void {
    const b = this.beasts[k];
    if (!b || dmg <= 0) return;
    // A dragon takes no harm from what nobody did: sand and debris, the ground, its own burning
    // blood landing round it. Only a clone (or a clone's weapon) can hurt it. (It still feels it: it wakes.)
    if (!(b.kind === BeastKind.Dragon && by === NO_OWNER)) b.hp -= dmg;
    if (by < MAX_PLAYERS && this.players[by]) b.hurtBy = by;
    // Hurt, it thaws; hurt hard enough while it holds someone, it lets them go.
    b.frozen = 0;
    b.gem = false;
    if (b.kind === BeastKind.Nest) b.alarm = 30 * 8; // (hurt: it senses danger, whoever it is)
    // A cave spider or its web hurt: the whole pack turns on whoever did it.
    if ((b.kind === BeastKind.Spider || b.kind === BeastKind.Web) && by < MAX_PLAYERS && this.players[by]?.alive) {
      const pts = this.beastPts[k];
      this.callPack(b.kind === BeastKind.Web ? k : b.home, pts[0], pts[1], by, true);
    }
    if (wyrm(b.kind)) this.enrage(b);
    if (b.coil >= 0 && (b.coilHurt += dmg) >= MILLI_COIL_BREAK) this.uncoil(b);
    // A cave spider hurt enough with a clone in its jaws: it lets go.
    if (b.kind === BeastKind.Spider && b.hold >= 0 && (b.coilHurt += dmg) >= CSPIDER_HOLD_BREAK) {
      b.hold = -1;
      b.holdT = 0;
      b.coilCd = CSPIDER_BITE_CD * 2;
    }
    if (b.hp > 0) return;
    this.killBeast(k);
    if (wyrm(b.kind)) this.basiliskAt = this.tick + BASILISK_RESPAWN;
    const w = this.broadcast;
    w.u8(R_BEAST_DIE);
    w.u8(k);
    w.u8(b.kind);
    w.u32(this.rng.nextU32());
  }

  /**
   * A blast's overpressure on every creature in reach (from its nearest body
   * point). A gem asp is soft all through: the blast falls off only half as
   * fast across its reach (two or three grenades anywhere near finish one).
   */
  /**
   * The Stoneburner, thrown: its beacon leaves the hand on a grenade's arc
   * (and is gone from the inventory: single use).
   */
  private throwBurner(p: Player): void {
    const aim = dequantizeAim(p.aimQ);
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);
    const sh = shoulderAt(p.body.x, p.body.y, p.body.stance, cos < 0, this.shoulderPt);
    const m = WEAPONS[WeaponId.Stoneburner].muzzle;
    this.burners.push({
      x: sh.x + cos * m,
      y: sh.y + sin * m,
      vx: cos * BURNER_THROW + p.body.vx * 0.5,
      vy: sin * BURNER_THROW + p.body.vy * 0.5,
      phase: BurnerPhase.Flying,
      fuse: BURNER_FUSE,
      owner: p.id,
      onPlayer: 255,
      onTank: -1,
      ox: 0,
      oy: 0,
      age: 0,
    });
    this.burnersRev++;
    p.inv.splice(p.slot, 1);
    p.slot = Math.max(0, Math.min(p.slot, p.inv.length - 1));
    this.invChanged(p);
  }

  /**
   * The beacons: in flight, until they stick to the first thing they touch
   * (the ground, a clone, a vehicle: carried along with it, and dropping off
   * if it goes); stuck, counting down; then the missile, and the strike
   * (stoneBurn). And the molten cores their strikes left (stepFeet).
   */
  private stepBurners(): void {
    const t = this.terrain;
    for (let i = this.burners.length - 1; i >= 0; i--) {
      const b = this.burners[i];
      b.age++;
      if (b.phase === BurnerPhase.Flying) {
        b.vy = Math.min(600, b.vy + GRAVITY * DT);
        const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * DT) / 1));
        for (let k = 0; k < steps && b.phase === BurnerPhase.Flying; k++) {
          const nx = b.x + (b.vx * DT) / steps;
          const ny = b.y + (b.vy * DT) / steps;
          if (t.isSolid(Math.floor(nx), Math.floor(ny))) {
            b.phase = BurnerPhase.Stuck;
            b.vx = b.vy = 0;
            break;
          }
          b.x = nx;
          b.y = ny;
          if (this.stickBurner(b)) break;
        }
        // (Off the bottom of the world, or out the sides: lost.)
        if (b.y > WORLD_H || b.x < 0 || b.x >= WORLD_W) {
          this.burners.splice(i, 1);
          this.burnersRev++;
          continue;
        }
        if (b.phase !== BurnerPhase.Flying) this.burnersRev++;
      }
      // Riding on something: carried with it; it gone (dead, wrecked, climbed out of), off it drops.
      if (b.onPlayer !== 255) {
        const q = this.players[b.onPlayer];
        if (!q || !q.alive || q.tank >= 0 || q.pilot >= 0) this.unstick(b);
        else {
          b.x = q.cx + b.ox;
          b.y = q.cy + b.oy;
        }
      } else if (b.onTank >= 0) {
        const k = this.tanks[b.onTank];
        if (!k) this.unstick(b);
        else {
          b.x = k.x + tankW(k) / 2 + b.ox;
          b.y = k.y + tankH(k) / 2 + b.oy;
        }
      } else if (b.phase === BurnerPhase.Stuck && !this.solidNear(b.x, b.y)) {
        // The ground it was stuck to dug or blown away: it falls again.
        b.phase = BurnerPhase.Flying;
        this.burnersRev++;
      }
      if (b.phase === BurnerPhase.Flying && b.age > BURNER_FUSE * 3) {
        this.burners.splice(i, 1);
        this.burnersRev++;
        continue;
      }
      // The countdown runs from the moment it leaves the hand.
      if (b.phase !== BurnerPhase.Strike) {
        if (--b.fuse <= 0) {
          b.phase = BurnerPhase.Strike;
          b.fuse = BURNER_STRIKE;
          this.burnersRev++;
        }
        continue;
      }
      if (--b.fuse <= 0) {
        this.burners.splice(i, 1);
        this.burnersRev++;
        this.stoneBurn(b.x, b.y, b.owner);
      }
    }
    this.stepFeet();
  }

  /** Is there solid ground within the beacon's sticky reach? */
  private solidNear(x: number, y: number): boolean {
    for (let dy = -BURNER_STICK_R; dy <= BURNER_STICK_R; dy++) for (let dx = -BURNER_STICK_R; dx <= BURNER_STICK_R; dx++) if (this.terrain.isSolid(Math.floor(x + dx), Math.floor(y + dy))) return true;
    return false;
  }

  /** A flying beacon touching a clone (not its thrower, the first moment) or a vehicle: stuck to it. */
  private stickBurner(b: Burner): boolean {
    for (const q of this.players) {
      if (!q || !q.alive || q.tank >= 0 || q.pilot >= 0 || (q.id === b.owner && b.age < 12)) continue;
      if (b.x < q.body.x - 1 || b.x > q.body.x + ACTOR_W + 1 || b.y < q.body.y - 1 || b.y > q.body.y + ACTOR_H + 1) continue;
      b.phase = BurnerPhase.Stuck;
      b.onPlayer = q.id;
      b.ox = b.x - q.cx;
      b.oy = b.y - q.cy;
      return true;
    }
    for (let k = 0; k < this.tanks.length; k++) {
      const v = this.tanks[k];
      if (!v || b.x < v.x || b.x > v.x + tankW(v) || b.y < v.y || b.y > v.y + tankH(v)) continue;
      b.phase = BurnerPhase.Stuck;
      b.onTank = k;
      b.ox = b.x - (v.x + tankW(v) / 2);
      b.oy = b.y - (v.y + tankH(v) / 2);
      return true;
    }
    return false;
  }

  private unstick(b: Burner): void {
    b.onPlayer = 255;
    b.onTank = -1;
    if (b.phase === BurnerPhase.Stuck) b.phase = BurnerPhase.Flying;
    this.burnersRev++;
  }

  /**
   * The strike lands at (x, y): the crater (the hardest rock too, near the
   * middle), the heat and the blast (certain death close in; out to
   * STONE_HEAT_R, falling off, and much less behind solid ground), every
   * clone shoved away, creatures and vehicles torn apart, a storm of
   * burning debris, and the molten core left at the crater's bottom. Every
   * client hears of it (broadcast): the flash, the shaking, the cloud.
   */
  stoneBurn(x: number, y: number, by: number): void {
    const owner = by === 255 ? NO_OWNER : by;
    const seed = this.rng.nextU32();
    // Who's caught: worked out before the ground they're stood on goes.
    const caught: { p: Player; d: number; open: boolean }[] = [];
    for (const p of this.players) {
      if (!p || !p.alive) continue;
      const d = Math.hypot(p.cx - x, p.cy - y);
      if (d < STONE_PUSH_R) caught.push({ p, d, open: d < STONE_CRATER_R || this.lineClear(x, y - 4, p.cx, p.cy) });
    }
    this.carve(x, y, STONE_CRATER_R, STONE_CORE_R, 250, owner);
    this.grains.blast(x, y, STONE_PUSH_R * 0.8, BLAST_IMPULSE * 5);
    explosionFragments(this.grains, x, y, ProjKind.Bomb, owner, new Rng(seed));
    // Burning debris thrown out over everything.
    for (let k = 0; k < 160; k++) {
      const a = -Math.PI * (0.05 + 0.9 * this.rng.next());
      const sp = 200 + 520 * this.rng.next();
      this.grains.spawn(PK.Flame, x + this.rng.range(-20, 20), y + this.rng.range(-12, 6), Math.cos(a) * sp, Math.sin(a) * sp, 40 + this.rng.int(50), 0, 0, owner);
    }
    this.splashBeasts(x, y, STONE_HARM_R, STONE_HARM, by);
    this.splashTanks(x, y, STONE_HARM_R, STONE_HARM, owner);
    this.splashShips(x, y, STONE_HARM_R, STONE_HARM, owner);
    this.splashCrafts(x, y, STONE_HARM_R, STONE_HARM, owner);
    this.splashDoors(x, y, STONE_HARM_R * 0.6, STONE_HARM, by);
    this.kickItems(x, y, STONE_PUSH_R);
    for (const { p, d, open } of caught) {
      if (!p.alive) continue;
      // The shove: away from ground zero, and up.
      const f = Math.max(0, 1 - d / STONE_PUSH_R);
      const l = d || 1;
      p.body.vx += ((p.cx - x) / l) * STONE_PUSH * f;
      p.body.vy += ((p.cy - y) / l) * STONE_PUSH * f * 0.6 - STONE_PUSH * 0.45 * f;
      p.body.onGround = false;
      // The flash: no sides, no mercy (the thrower too). Only deep behind solid ground, out in the outer part of it, is there a chance.
      if (d < STONE_KILL_R * STONE_NO_COVER || (d < STONE_KILL_R && open)) {
        this.damage(p, 9999, by, W_STONEBURNER, false, true);
        continue;
      }
      if (d >= STONE_HEAT_R) continue;
      const heat = d < STONE_KILL_R ? 180 : 260 * (1 - (d - STONE_KILL_R) / (STONE_HEAT_R - STONE_KILL_R)) * (open ? 1 : STONE_COVER);
      this.damage(p, Math.min(9999, heat), by, W_STONEBURNER);
    }
    // The molten sludge, splashed down into the bottom of the crater (it finds its own level from there).
    for (let k = 0; k < SLUDGE_BLOBS && this.feet.length < MAX_SLUDGE; k++) {
      const a = this.rng.range(-0.8, 0.8);
      this.feet.push({
        x: x + Math.sin(a) * STONE_CRATER_R * 0.55 * this.rng.next(),
        y: y + STONE_CRATER_R * 0.4 * this.rng.next(),
        vx: this.rng.range(-90, 90),
        vy: this.rng.range(-60, 120),
        life: Math.round(FOOT_LIFE * this.rng.range(0.7, 1)),
        owner: by,
      });
    }
    this.burnersRev++;
    const w = this.broadcast;
    w.u8(R_STONEBURN);
    w.u16(clampU16(x));
    w.u16(clampU16(y + Y_BIAS));
    w.u8(by);
    w.u32(seed);
  }

  /**
   * The molten sludge: blobs of caustic slag that flow like wet sand. They
   * fall; resting on something they slide down any slope there is and
   * spread out sideways, so they pool in the low places, crowding apart
   * rather than stacking up. And they eat whatever ground they touch, below
   * first, then the sides (hard rock too), so they sink and seep through
   * it, more slowly as they cool. They sear whoever comes near, shed flame
   * and smoke, and at the end set as a little glassy slag.
   */
  private stepFeet(): void {
    const t = this.terrain;
    const R = SLUDGE_R;
    const solid = (x: number, y: number) => t.isSolid(Math.floor(x), Math.floor(y));
    const feet = this.feet;
    // Crowding: blobs too close push apart (mostly sideways: a pool spreads, it doesn't stack).
    for (let i = 0; i < feet.length; i++) {
      for (let j = i + 1; j < feet.length; j++) {
        const a = feet[i];
        const b = feet[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= (R * 2) ** 2 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = ((R * 2 - d) / d) * 12;
        a.vx -= dx * push;
        b.vx += dx * push;
        if (dy > 0) b.vy += dy * push * 0.2;
        else a.vy -= dy * push * 0.2;
      }
    }
    for (let i = feet.length - 1; i >= 0; i--) {
      const f = feet[i];
      const owner = f.owner === 255 ? NO_OWNER : f.owner;
      const heat = f.life / FOOT_LIFE;
      if (--f.life <= 0 || f.y > WORLD_H - 10) {
        // Set: a few grains of glassy slag where it was (they settle as ground).
        for (let k = 0; k < 4; k++) this.grains.spawn(PK.Grain, f.x + this.rng.range(-R, R), f.y + this.rng.range(-R, 0), 0, 20, 400, Mat.Glass, 0, NO_OWNER);
        feet.splice(i, 1);
        this.burnersRev++;
        continue;
      }
      const below = solid(f.x, f.y + R + 1);
      if (below) {
        // Resting: thick (cooler, thicker), sliding down whichever way is open, or spreading.
        f.vx *= 0.8;
        const dl = !solid(f.x - R - 1, f.y + R + 1);
        const dr = !solid(f.x + R + 1, f.y + R + 1);
        if (dl && !dr) f.vx -= 30;
        else if (dr && !dl) f.vx += 30;
        else if (dl && dr) f.vx += this.rng.next() < 0.5 ? -30 : 30;
        else f.vx += this.rng.range(-10, 10) * heat;
        if (f.vy > 0) f.vy = 0;
      } else f.vy = Math.min(320, f.vy + GRAVITY * DT);
      // Move, a cell at a time; a wall stops it that way.
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(f.vx), Math.abs(f.vy)) * DT));
      for (let k = 0; k < steps; k++) {
        const nx = f.x + (f.vx * DT) / steps;
        if (solid(nx + Math.sign(f.vx) * R, f.y)) f.vx = 0;
        else f.x = nx;
        const ny = f.y + (f.vy * DT) / steps;
        if (solid(f.x, ny + Math.sign(f.vy) * R)) f.vy = 0;
        else f.y = ny;
      }
      // Eating the ground it touches: below first, then the sides; hard rock too.
      const every = Math.max(1, Math.round(SLUDGE_BITE / Math.max(0.15, heat)));
      if ((this.tick + i) % every === 0) {
        const tries = [
          [0, R + 1],
          [-R - 1, R],
          [R + 1, R],
          [-R - 1, 0],
          [R + 1, 0],
        ];
        for (const [ox, oy] of tries) {
          if (!solid(f.x + ox, f.y + oy)) continue;
          // (Not the world's floor: the bedrock there holds it.)
          if (f.y + oy >= WORLD_H - 14) break;
          // (A big bite: it eats the ground fast.)
          this.carve(Math.round(f.x + ox * 0.6), Math.round(f.y + oy * 0.7), R + 4, R + 4, 3, owner);
          break;
        }
      }
      // Flame and smoke off it (more while it's fresh).
      if (this.rng.next() < 0.05 + 0.15 * heat) this.grains.spawn(PK.Flame, f.x + this.rng.range(-R, R), f.y - R, this.rng.range(-20, 20), -30 - 80 * heat * this.rng.next(), 8 + this.rng.int(10), 0, 0, owner);
    }
    // Up close, its heat sears (through whatever's between or not).
    if (this.tick % 6 === 0 && feet.length) {
      for (const p of this.players) {
        if (!p || !p.alive) continue;
        let worst = 0;
        for (const f of feet) {
          const d = Math.hypot(p.cx - f.x, p.cy - f.y);
          if (d < 22) worst = Math.max(worst, (4 + 14 * (f.life / FOOT_LIFE)) * (1 - d / 22));
        }
        if (worst > 0) this.damage(p, worst * 2, feet[0].owner, W_STONEBURNER, true);
      }
    }
  }

  private splashBeasts(x: number, y: number, r: number, dmg: number, by: number): void {
    for (let k = 0; k < MAX_BEASTS; k++) {
      if (!this.beasts[k]) continue;
      const { d, i } = nearestPoint(this.beastPts[k], x, y);
      const kind = this.beasts[k]!.kind;
      const falloff = kind === BeastKind.Asp ? 1 - (0.5 * d) / r : 1 - d / r;
      if (d < r) this.hurtBeast(k, dmg * (kind === BeastKind.Millipede ? 1.5 : wyrm(kind) ? 0.6 : 1) * hitScale(kind, i) * falloff, by);
    }
  }

  /** Who has venom in them (for clients to show it): when that changes, and now and then while anyone does. */
  private sendVenom(): void {
    let key = '';
    for (const p of this.players) if (p && p.alive && p.venom > 0) key += `${p.id},`;
    if (key === this.venomSent && (key === '' || this.tick % 10 !== 0)) return;
    this.venomSent = key;
    const sick = this.players.filter((p): p is Player => !!p && p.alive && p.venom > 0);
    const w = this.broadcast;
    w.u8(R_VENOM);
    w.u8(sick.length);
    for (const p of sick) {
      w.u8(p.id);
      w.u8(Math.min(255, Math.ceil(p.venom)));
    }
  }

  private burstBlister(i: number, by: number): void {
    const f = this.flora[i];
    this.floraDead[i] = 1;
    this.floraRev++;
    const cx = f.x;
    const cy = f.y - 8;
    for (const p of this.players) {
      if (!p || !p.alive || p.tank >= 0) continue;
      const d = Math.hypot(p.cx - cx, p.cy - cy);
      if (d < BLISTER_R) this.damage(p, BLISTER_DAMAGE * (1 - d / BLISTER_R), by === NO_OWNER ? 255 : by, W_BLISTER);
    }
    // Its neighbours burst with it, a moment later: a thicket goes up in a chain.
    this.floraIn(cx - BLISTER_R * 0.6, cy - BLISTER_R * 0.6, cx + BLISTER_R * 0.6, cy + BLISTER_R * 0.6, (j) => this.killFlora(j, by, BLISTER_FUSE_HIT + 2));
  }

  /** Shots and blasts near a geyser's mouth wear its vent down; out of hit points, it blows (after a moment's rumble). */
  private hitGeysers(x: number, y: number, r: number, owner: number): void {
    for (const g of this.geysers) {
      if (g.dead || g.fuse > 0 || g.cd > 0) continue;
      const dx = x - g.x;
      const dy = y - g.y;
      if (dx * dx + dy * dy > (r + 7) * (r + 7)) continue;
      g.hp -= 10 + r * 4;
      if (owner !== NO_OWNER) g.by = owner;
      if (g.hp <= 0) {
        g.fuse = GEYSER_FUSE_SHOT;
        this.geysersRev++;
      }
    }
  }

  /**
   * The geysers, each tick: a quiet one may start rumbling on its own; a
   * rumbling one blows when its fuse runs out; a blown one hangs its deadly
   * smoke over the vent for a few seconds. One whose vent has been dug away
   * is choked for good.
   */
  private stepGeysers(): void {
    for (let i = 0; i < this.geysers.length; i++) {
      const g = this.geysers[i];
      if (g.dead) continue;
      if (!this.terrain.isSolid(g.x, g.y + 1) && !this.terrain.isSolid(g.x, g.y + 2)) {
        g.dead = true;
        g.fuse = g.toxic = 0;
        this.geysersRev++;
        continue;
      }
      if (g.toxic > 0) {
        g.toxic--;
        if (g.toxic % 5 === 0) {
          // The cloud: everyone in it choking (sealed in a tank, they're safe).
          const c = geyserCloud(g.x, g.y, GEYSER_TOXIC_TICKS - g.toxic);
          for (const p of this.players) {
            if (!p || !p.alive || p.tank >= 0) continue;
            const dx = (p.cx - c.x) / GEYSER_CLOUD_R;
            const dy = (p.cy - c.y) / (GEYSER_CLOUD_R * 1.3);
            if (dx * dx + dy * dy <= 1) this.damage(p, GEYSER_TOXIC * 5, g.by, W_GEYSER);
          }
        }
        if (g.toxic === 0) this.geysersRev++;
      }
      if (g.cd > 0) g.cd--;
      if (g.calm > 0) g.calm--;
      if (g.fuse > 0) {
        if (--g.fuse === 0) this.blowGeyser(i);
      } else if (g.cd === 0 && g.calm === 0 && this.geyserRng.next() < GEYSER_CHANCE) {
        g.fuse = GEYSER_FUSE;
        g.by = 255;
        this.geysersRev++;
      }
    }
  }

  /** A geyser blows: a fountain of rock and shrapnel, a blast at the mouth, then its deadly smoke. */
  blowGeyser(i: number): void {
    const g = this.geysers[i];
    const seed = this.geyserRng.nextU32();
    const by = g.by;
    g.fuse = 0;
    g.hp = GEYSER_HP;
    g.cd = GEYSER_COOLDOWN;
    g.toxic = GEYSER_TOXIC_TICKS;
    this.geysersRev++;
    this.broadcast.u8(R_GEYSER_BLOW);
    this.broadcast.u8(i);
    this.broadcast.u32(seed);
    const owner = by === 255 ? NO_OWNER : by;
    geyserBurst(this.grains, g.x, g.y, owner, new Rng(seed));
    this.grains.blast(g.x, g.y - 4, GEYSER_BLAST_R * 1.4, BLAST_IMPULSE);
    this.splashTanks(g.x, g.y - 4, GEYSER_BLAST_R, GEYSER_BLAST * 3, owner);
    this.splashCrafts(g.x, g.y - 4, GEYSER_BLAST_R, GEYSER_BLAST, owner);
    for (const p of this.players) {
      if (!p || !p.alive || p.tank >= 0) continue;
      const d = Math.hypot(p.cx - g.x, p.cy - (g.y - 6));
      if (d < GEYSER_BLAST_R) this.damage(p, GEYSER_BLAST * (1 - d / GEYSER_BLAST_R), by, W_GEYSER);
    }
  }

  /** A fortress spawn spot with room for a clone. */
  private freeSpot(fort: Fortress): { x: number; y: number } {
    for (let n = 0; n < 12; n++) {
      const s = fort.spawns[this.rng.int(fort.spawns.length)];
      const x = Math.floor(s.x - ACTOR_W / 2);
      const y = Math.floor(s.y - ACTOR_H);
      if (!this.terrain.rectSolid(x, y, x + ACTOR_W - 1, y + ACTOR_H - 1)) return s;
    }
    return fort.spawns[0];
  }

  /**
   * Split everyone into `n` even teams (none for 0): humans dealt out first
   * (so people end up on every side), then bots evening up the numbers.
   */
  private drawTeams(n: number): void {
    const order: Player[] = [];
    for (const p of this.players) if (p) order.push(p);
    for (let i = order.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.sort((a, b) => (a.bot ? 1 : 0) - (b.bot ? 1 : 0));
    const first = this.rng.int(Math.max(1, n));
    order.forEach((p, i) => (p.team = n ? (first + i) % n : Team.None));
    // Those who've asked for a side get it, a bot from it trading places with them (the numbers stay even).
    for (const p of order) {
      if (p.bot || p.teamWish >= n || p.team === p.teamWish) continue;
      const bot = order.find((o) => o.bot && o.team === p.teamWish);
      if (!bot) continue;
      bot.team = p.team;
      p.team = p.teamWish;
    }
    this.teamsRev++;
  }

  private setPhase(phase: number, ticks: number): void {
    this.phase = phase;
    this.phaseTimer = ticks;
  }

  /** Bots take every slot no human has (while there is a human to play with). */
  private fillBots(): void {
    if (this.botFill === 0 || this.humanCount === 0) return;
    while (this.playerCount < this.botFill && this.addBot()) {
      // keep filling
    }
  }

  /** Everyone present is in; rockets come in staggered over a couple of seconds. */
  private startWave(): void {
    this.wave++;
    this.winner = 255;
    const mode = this.modeOfWave(this.wave);
    this.drawTeams(TEAMS_IN_MODE[mode]);
    this.dealSkills(TEAMS_IN_MODE[mode]);
    this.kings[0] = this.kings[1] = 255;
    for (const p of this.players) {
      if (!p) continue;
      p.inWave = true;
      p.pendingSpawn = true;
      p.respawn = 1 + this.rng.int(60);
      p.spectate = 255;
      p.waveKills = 0;
      p.waveDeaths = 0;
    }
    // One or two tanks come down by parachute for whoever gets to them first
    // (Extraction's tanks wait in the labyrinth instead).
    // (Extermination is fought on foot, mostly: just the one.)
    if (this.tankDrops && mode !== GameMode.Extraction && mode !== GameMode.Siege) this.dropTanks(mode === GameMode.Extermination ? 1 : 1 + this.rng.int(2));
    if (mode === GameMode.Regicide) this.startRegicide();
    if (mode === GameMode.Siege) this.startSiege();
    if (mode === GameMode.Extraction) this.startExtraction();
    if (mode === GameMode.Extermination) this.startExtermination();
    // The bunkers' own weapons, lying where they were left (all wave long).
    for (const l of this.mapLoot) {
      this.spawnItem(l.weapon, WEAPONS[l.weapon].clip, l.x, l.y, 0, 0);
      this.items[this.items.length - 1].age = -30 * 60 * 15;
    }
    this.setPhase(Phase.Live, mode === GameMode.Regicide ? REGICIDE_TICKS : mode === GameMode.Extraction ? EXTRACTION_TICKS : mode === GameMode.Pvp ? PVP_TICKS : mode === GameMode.Siege ? SIEGE_TICKS : mode === GameMode.Extermination ? EXTERMINATION_TICKS : WAVE_TICKS);
  }

  /**
   * A fresh battlefield for the next wave: new terrain from a new seed, and
   * nothing left over (rockets, dropped weapons, debris in flight). Clients
   * regenerate the same map from the seed; every chunk's hash rides along so
   * any chunk that comes out different (engines may round trig differently)
   * is simply re-sent.
   */
  private newMap(): void {
    this.mapSeed = this.rng.nextU32();
    // Regicide is fought over two fortresses built into the map, Extraction down a labyrinth.
    this.makeMap(this.mapKindFor(this.wave + 1));
    this.kings[0] = this.kings[1] = 255;
    this.crafts.fill(null);
    this.tanks.fill(null);
    this.ships.fill(null);
    this.spots.clear();
    this.items.length = 0;
    this.mines.length = 0;
    this.minesRev++;
    this.burners.length = 0;
    this.feet.length = 0;
    this.burnersRev++;
    this.grains.n = 0;
    this.projectiles.n = 0;
    this.pendingPixels.clear();
    for (let ci = 0; ci < CHUNK_COUNT; ci++) this.chunkVersion[ci]++;
    for (const p of this.players) {
      if (!p) continue;
      p.alive = false;
      p.inWave = false;
      p.team = Team.None;
      p.tank = -1;
      p.pilot = -1;
      p.rc = -1;
      p.surf = -1;
      p.surfShip = -1;
      p.pendingSpawn = false;
      p.delivering = -1;
      p.inv = [];
      this.invChanged(p);
      p.gold = STARTING_GOLD;
      p.spectate = 255;
      p.knownItems.clear();
      p.seenProj.clear();
      // The client regenerates this map itself (and asks again for any chunk whose hash differs).
      for (let ci = 0; ci < CHUNK_COUNT; ci++) p.known[ci] = this.chunkVersion[ci];
    }
    this.teamsRev++;
    this.sealMap();
    this.waveRecord = this.mapRecord;
  }

  /**
   * Out of the wave: watch someone still in it (its killer first). A fresh
   * click moves on to the next clone; the view, and so what this client is
   * sent, follows whoever it's watching.
   */
  private spectateFrom(p: Player, prev: number): void {
    let t = p.spectate !== 255 ? this.players[p.spectate] : null;
    const next = p.buttons & BTN_FIRE && !(prev & BTN_FIRE);
    if (!t || !t.alive || next) {
      p.spectate = 255;
      // On a team, follow your own side while any of it stands.
      for (let pass = p.team === Team.None ? 1 : 0; pass < 2 && p.spectate === 255; pass++) {
        for (let k = 1; k <= MAX_PLAYERS; k++) {
          const o = this.players[(Math.max(0, t ? t.id : p.id) + k) % MAX_PLAYERS];
          if (o && o.alive && o !== p && (pass === 1 || o.team === p.team)) {
            p.spectate = o.id;
            break;
          }
        }
      }
      t = p.spectate !== 255 ? this.players[p.spectate] : null;
    }
    if (t) {
      p.camX = t.cx;
      p.camY = t.cy;
    }
  }

  private readonly pendingRoster = new Map<number, Uint8Array>();

  removePlayer(id: number): void {
    const p = this.players[id];
    if (!p) return;
    if (p.alive) this.dropAll(p); // a deserter's kit stays behind
    this.leaveTank(p, false);
    // Its watchdog shuts down (blows itself up) when its owner goes.
    for (let k = 0; k < MAX_TANKS; k++) if (this.tanks[k]?.owner === id) this.destroyTank(k, 255);
    this.players[id] = null;
    this.pendingRoster.delete(id);
    // An empty rocket flies itself home.
    for (const c of this.crafts) {
      if (c && c.passenger === id) {
        c.passenger = 255;
        c.phase = CraftPhase.Ascend;
      }
      if (c && c.delivered === id) c.delivered = 255;
    }
    this.writeRoster(this.broadcast, p, false);
  }

  private writeRoster(w: Writer, p: Player, present: boolean): void {
    w.u8(R_ROSTER);
    w.u8(p.id);
    w.u8(present ? 1 : 0);
    w.str(present ? p.name : '');
  }

  input(id: number, cmd: InputCmd): void {
    const p = this.players[id];
    if (!p) return;
    p.inputs.push(cmd);
    if (p.inputs.length > 12) p.inputs.shift();
  }

  /** A client asked to materialize a fortification piece (validated on its next tick). */
  build(id: number, piece: number, gx: number, gy: number): void {
    const p = this.players[id];
    if (p) p.buildReq = { piece, gx, gy };
  }

  resync(id: number, ci: number): void {
    const p = this.players[id];
    if (p && ci >= 0 && ci < CHUNK_COUNT) p.known[ci] = -1;
  }

  /**
   * The vote for the next wave's mode: a player's own, while the wave's
   * result is up (Phase.Victory), in a room with more than one mode. Bots
   * don't vote. A player can change their vote until the count.
   */
  vote(id: number, mode: number): void {
    const p = this.players[id];
    if (!p || p.bot || !this.voting || !(VOTE_MODES as readonly number[]).includes(mode)) return;
    p.vote = mode;
    // Everyone's had their say: the count, in a couple of seconds.
    if (this.players.every((o) => !o || o.bot || o.vote !== 255)) this.phaseTimer = Math.min(this.phaseTimer, VOTE_SETTLE);
  }

  /**
   * A dead player asks to change team (team modes only, never a king). In
   * the respawn modes it's at once: they come back on the new side, and to
   * keep the sides even one of its bots crosses over to their old one (with
   * no bot to trade, only to a side that isn't bigger). Otherwise (Last Team
   * Standing: out for the wave) it's noted, and holds from the next wave's
   * draw on.
   */
  changeTeam(id: number, team: number): void {
    const p = this.players[id];
    // (Dead, that is: not riding in on a drop rocket, already on its way down to its side.)
    if (!p || p.bot || p.alive || p.delivering >= 0 || this.mode !== 'ffa' || this.isKing(p)) return;
    const n = TEAMS_IN_MODE[this.modeOfWave(this.wave)];
    if (n < 2 || team >= n || team === p.team) return;
    p.teamWish = team;
    if (!this.respawnLive || p.team >= n) return;
    const bot = this.players.find((o): o is Player => !!o && !!o.bot && o.team === team && !this.isKing(o));
    if (bot) bot.team = p.team;
    else {
      const count = new Array<number>(n).fill(0);
      for (const o of this.players) if (o && o.team < n) count[o.team]++;
      if (count[team] >= count[p.team]) return;
    }
    p.team = team;
    this.teamsRev++;
  }

  /** The vote is open: the wave's result is up, and the room has modes to choose from. */
  get voting(): boolean {
    return this.mode === 'ffa' && this.phase === Phase.Victory && this.rotation.length > 1;
  }

  /** Votes for each of VOTE_MODES. */
  voteCounts(): number[] {
    const n = VOTE_MODES.map(() => 0);
    for (const p of this.players) if (p && !p.bot && p.vote !== 255) n[(VOTE_MODES as readonly number[]).indexOf(p.vote)]++;
    return n;
  }

  /**
   * The count: the mode with the most votes plays the next wave (a tie
   * drawn by lot between the leaders). Nobody voted: the rotation's.
   */
  private countVotes(): void {
    const n = this.voteCounts();
    const top = Math.max(...n);
    if (top > 0) {
      const leaders = VOTE_MODES.filter((_, i) => n[i] === top);
      this.votedMode = { wave: this.wave + 1, mode: leaders[this.rng.int(leaders.length)] };
    }
    for (const p of this.players) if (p) p.vote = 255;
  }

  chat(id: number, text: string): void {
    const p = this.players[id];
    if (!p || this.tick - p.lastChat < 15) return;
    p.lastChat = this.tick;
    const clean = cleanChat(text);
    if (!clean) return;
    this.broadcast.u8(R_CHAT);
    this.broadcast.u8(id);
    this.broadcast.str(clean);
  }

  // ---------------------------------------------------------------- terrain

  /**
   * Carve terrain (plus the collapse it causes), release grains, and log the op
   * for replication. Clients reproduce all of it from the 12-byte record.
   */
  carve(x: number, y: number, r: number, core: number, debrisMax: number, owner = NO_OWNER): number {
    x = Math.max(0, Math.min(WORLD_W - 1, Math.round(x)));
    y = Math.max(0, Math.min(WORLD_H - 1, Math.round(y)));
    // A geyser's vent in (or right by) the bite takes a knock: enough of them and it blows.
    if (this.geysers.length) this.hitGeysers(x, y, r, owner);
    // Plants in (or right by) the bite are torn up.
    if (this.flora.length) this.floraIn(x - r - 2, y - r - 2, x + r + 2, y + r + 2, (i) => this.hurtFlora(i, owner, x, y, r + 2));
    // A door in the bite takes the damage instead (its steel never carves): cutters and lasers wear it down.
    if (core > 0) {
      const d = this.doorAt(x, y, core);
      if (d) this.damageDoor(d, core * core, owner);
    }
    const removed = this.removedScratch;
    const detached = this.detachedScratch;
    const n = applyCarve(this.terrain, x, y, r, core, removed, detached);
    if (n === 0) return 0;
    // And any whose ground the bite took from under them.
    if (this.flora.length) this.floraIn(x - r - 1, y - r - 1, x + r + 1, y + r + 1, (i) => !this.rooted(this.flora[i]) && this.killFlora(i, owner));
    const seed = this.rng.nextU32();
    releaseCarve(this.grains, removed, detached, x, y, debrisMax, new Rng(seed), this.overflow, owner);
    const w = this.tmp.reset();
    w.u8(R_CARVE);
    w.u16(x);
    w.u16(y);
    w.u8(r);
    w.u8(core);
    w.u32(seed);
    w.u8(debrisMax);
    this.logOp(w.finish(), carveExtent.x0, carveExtent.y0, carveExtent.x1, carveExtent.y1);
    return n;
  }

  private logOp(bytes: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
    const chunks: number[] = [];
    const pre: number[] = [];
    forChunksInRect(x0, y0, x1, y1, (ci) => {
      chunks.push(ci);
      pre.push(this.chunkVersion[ci]);
      this.chunkVersion[ci]++;
    });
    this.ops.push({ bytes, chunks, pre });
  }

  private deposit = (x: number, y: number, m: number): void => {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return;
    this.terrain.set(x, y, m);
    const ci = (y >> CHUNK_SHIFT) * CHUNKS_X + (x >> CHUNK_SHIFT);
    let list = this.pendingPixels.get(ci);
    if (!list) this.pendingPixels.set(ci, (list = []));
    list.push((x & (CHUNK - 1)) | ((y & (CHUNK - 1)) << 6), m);
  };

  private readonly hooks = { settle: this.deposit };

  /** Collapse beyond grain capacity drops straight down instead of vanishing. */
  private overflow = (x: number, y: number, m: number): void => {
    dropToSupport(this.terrain, x, y, m, this.deposit);
  };

  private flushPixels(): void {
    for (const [ci, list] of this.pendingPixels) {
      const w = this.tmp.reset();
      w.u8(R_PIXELS);
      w.u16(ci);
      w.u16(list.length / 2);
      for (let i = 0; i < list.length; i += 2) {
        w.u16(list[i]);
        w.u8(list[i + 1]);
      }
      const bytes = w.finish();
      this.chunkVersion[ci]++;
      this.ops.push({ bytes, chunks: [ci], pre: [this.chunkVersion[ci] - 1] });
    }
    this.pendingPixels.clear();
  }

  private chunkSnapshot(ci: number): Uint8Array {
    const v = this.chunkVersion[ci];
    const cached = this.chunkCache.get(ci);
    if (cached && cached.version === v) return cached.bytes;
    this.terrain.readChunk(ci, SNAPSHOT_SCRATCH);
    const w = this.tmp.reset();
    w.u8(R_CHUNK);
    w.u16(ci);
    rleEncode(w, SNAPSHOT_SCRATCH);
    const bytes = w.finish();
    this.chunkCache.set(ci, { version: v, bytes });
    return bytes;
  }

  // ---------------------------------------------------------------- combat

  private rebuildGrid(): void {
    for (const ci of this.gridUsed) this.grid[ci].length = 0;
    this.gridUsed.length = 0;
    for (const p of this.players) {
      if (!p || !p.alive || this.shielded(p)) continue; // drivers are inside their tank's armour
      const x0 = Math.floor(p.body.x);
      const y0 = Math.floor(p.body.y);
      forChunksInRect(x0, y0, x0 + ACTOR_W - 1, y0 + ACTOR_H - 1, (ci) => {
        if (this.grid[ci].length === 0) this.gridUsed.push(ci);
        this.grid[ci].push(p.id);
      });
    }
  }

  /** First actor box entered by a swept segment, via the actor spatial hash. */
  private segmentActor = (x0: number, y0: number, x1: number, y1: number, owner: number, out: { t: number }, kind = -1): number => {
    // Plants in the way are shot through (the round flies on).
    if (this.flora.length) {
      const sdx = x1 - x0;
      const sdy = y1 - y0;
      this.floraIn(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), (i) => {
        const b = floraBox(this.flora[i]);
        if (segmentBox(x0, y0, sdx, sdy, b.x0, b.y0, b.x1 + 1, b.y1 + 1) >= 0) this.killFlora(i, owner);
      });
    }
    // (A laser beam passes through clones: only vehicles stop it.)
    const players = kind !== LASER_VEHICLES_ONLY;
    const dx = x1 - x0;
    const dy = y1 - y0;
    let best = -1;
    let bestT = 2;
    forChunksInRect(Math.floor(Math.min(x0, x1)), Math.floor(Math.min(y0, y1)), Math.floor(Math.max(x0, x1)), Math.floor(Math.max(y0, y1)), (ci) => {
      const bucket = this.grid[ci];
      for (let k = 0; k < bucket.length && players; k++) {
        const id = bucket[k];
        if (id === owner) continue;
        const o = this.players[id]!;
        // (A vehicle's guns fire over its own riders.)
        if (o.surf >= 0 && owner !== 255) {
          const rt = this.tanks[o.surf];
          if (rt && (rt.pilot === owner || (isPet(rt) && rt.owner === owner))) continue;
        }
        if (o.surfShip >= 0 && owner !== 255 && this.ships[o.surfShip]?.owner === owner) continue;
        const b = o.body;
        // A driver whose shield is gone: only the head and shoulders stick out.
        const t = o.tank >= 0 ? segmentBox(x0, y0, dx, dy, b.x, b.y, b.x + ACTOR_W, b.y + EXPOSED_H) : segmentBox(x0, y0, dx, dy, b.x, o.top, b.x + ACTOR_W, b.y + ACTOR_H);
        if (t >= 0 && t < bestT) {
          bestT = t;
          best = id;
        }
      }
    });
    // Drop rockets are targets too (few, so test them directly).
    for (let k = 0; k < MAX_CRAFTS; k++) {
      const c = this.crafts[k];
      if (!c) continue;
      // In the rocket's own frame the hull is an axis-aligned box.
      const a = craftToLocal(c, x0, y0, this.segA);
      const b = craftToLocal(c, x1, y1, this.segB);
      const t = segmentBox(a.x, a.y, b.x - a.x, b.y - a.y, -CRAFT_W / 2, -CRAFT_H / 2, CRAFT_W / 2, CRAFT_H / 2);
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = CRAFT_ID_BASE + k;
      }
    }
    // Tanks: axis-aligned boxes. A tank's own guns never hit it.
    for (let k = 0; k < MAX_TANKS; k++) {
      const t = this.tanks[k];
      if (!t || (owner === (t.pilot !== 255 ? t.pilot : t.owner) && owner !== 255)) continue;
      // (Nor do its riders' shots hit it.)
      if (owner < MAX_PLAYERS && this.players[owner]?.surf === k) continue;
      // In the tank's own frame its (tilted) hull is an axis-aligned box.
      const la = tankLocal(t, x0, y0, this.segA);
      const lb = tankLocal(t, x1, y1, this.segB);
      let tt = segmentBox(la.x, la.y, lb.x - la.x, lb.y - la.y, 0, 0, designW(t), hitH(t));
      // A mole's frill stands up above its deck, out front: it's struck first (its riders behind it aren't).
      if (isMole(t) && hasTankPart(t.parts, TankPart.Armor)) {
        const [f0, f1, f2, f3] = MOLE_FRILL_BOX;
        const fx0 = t.faceLeft ? TANK_W - f2 : f0;
        const tf = segmentBox(la.x, la.y, lb.x - la.x, lb.y - la.y, fx0, f1, fx0 + (f2 - f0), f3);
        if (tf >= 0 && (tt < 0 || tf < tt)) tt = tf;
      }
      if (tt >= 0 && tt < bestT) {
        bestT = tt;
        best = TANK_ID_BASE + k;
      }
    }
    for (let k = 0; k < MAX_SHIPS; k++) {
      const sh = this.ships[k];
      if (!sh || owner === sh.owner) continue; // its own guns and bombs (and its caller's) never hit it
      if (owner < MAX_PLAYERS && this.players[owner]?.surfShip === k) continue; // (nor its riders')
      if (kind === ProjKind.Engine) continue; // a runaway engine is off and away from the hull it left
      const la = shipLocal(sh, x0, y0, this.segA);
      const lb = shipLocal(sh, x1, y1, this.segB);
      const tb = segmentBox(la.x, la.y, lb.x - la.x, lb.y - la.y, 0, 0, SHIP_W, SHIP_H);
      // The box is mostly air (the pods hang out past the hull): find where it meets metal.
      const tt = tb >= 0 && tb < bestT ? shipSegmentSolid(sh.parts, la.x, la.y, lb.x - la.x, lb.y - la.y, tb) : -1;
      if (tt >= 0 && tt < bestT) {
        bestT = tt;
        best = SHIP_ID_BASE + k;
      }
    }
    // Wildlife: a circle round each body point. (A creature's own venom never hits its kind; a laser
    // goes through them, beam() hurts every one along it.)
    if (kind !== ProjKind.Venom && kind !== ProjKind.FireSpit && kind !== LASER_VEHICLES_ONLY) {
      const len = Math.hypot(dx, dy);
      for (let k = 0; k < MAX_BEASTS; k++) {
        const pts = this.beasts[k] ? this.beastPts[k] : null;
        if (!pts || !pts.length) continue;
        // (Too far off to touch it, from its head: its body's no longer than this.)
        const build = BEAST_BUILD[this.beasts[k]!.kind];
        if (Math.hypot(pts[0] - x0, pts[1] - y0) > len + build.segs * build.gap + build.r) continue;
        for (let i = 0; i < pts.length; i += 2) {
          const t = segmentCircle(x0, y0, dx, dy, pts[i], pts[i + 1], BEAST_BUILD[this.beasts[k]!.kind].r);
          if (t >= 0 && t < bestT) {
            bestT = t;
            best = BEAST_ID_BASE + k;
          }
        }
      }
    }
    out.t = bestT;
    return best;
  };

  private readonly segA = { x: 0, y: 0 };
  private readonly shoulderPt = { x: 0, y: 0 };
  private readonly segB = { x: 0, y: 0 };
  private readonly strikeScratch: StrikeResult = newStrike();

  /**
   * The body part at (lx, ly) in a clone's hitbox. Crouched, the standing
   * layout is squeezed into the shorter box; prone, it lies along it, head
   * toward where the clone faces.
   */
  private partHit(p: Player, lx: number, ly: number): number {
    const st = p.body.stance;
    const left = this.facingLeft(p);
    if (p.tank >= 0 || st === Stance.Stand) return partAt(p.parts.mask, lx, ly, left, p.parts.cls);
    if (st === Stance.Crouch) return partAt(p.parts.mask, lx, (ly * ACTOR_H) / STANCE_H[st], left);
    const along = left ? lx : ACTOR_W - lx; // 0 at the head
    return partAt(p.parts.mask, ACTOR_W / 2, (along * ACTOR_H) / ACTOR_W, left);
  }

  private facingLeft(p: Player): boolean {
    return Math.cos(dequantizeAim(p.aimQ)) < 0;
  }

  /**
   * Apply a resolved strike: tear off parts (broadcast so every client sees the
   * limb fly), update what the body can still do, take HP, and kill outright
   * if a vital part went.
   */
  private applyStrike(p: Player, res: StrikeResult, attacker: number, weapon: number, hx: number, hy: number): void {
    if (res.detached.length) {
      const b = p.body;
      for (const part of res.detached) {
        if (part === Part.Torso && res.vital) continue; // the whole clone gibs instead
        const w = this.tmp.reset();
        w.u8(R_DETACH);
        w.u8(p.id);
        w.u8(part);
        w.u16(clampU16(hx));
        w.u16(clampU16(hy + Y_BIAS));
        // The part flies off away from the hit, plus the body's own motion.
        const dx = hx - p.cx;
        const dy = hy - p.cy;
        const d = Math.sqrt(dx * dx + dy * dy) + 1;
        w.i16(clampI16((b.vx - (dx / d) * 90 + this.rng.range(-40, 40)) * VEL_SCALE));
        w.i16(clampI16((b.vy - (dy / d) * 90 - this.rng.range(60, 140)) * VEL_SCALE));
        this.hits.push({ bytes: w.finish(), id: 0, x: hx, y: hy });
      }
      mobility(p.parts.mask, p.mob, p.parts.cls);
      b.legs = p.mob.legs;
      b.jet = p.mob.jet;
    }
    this.damage(p, res.hp, attacker, weapon, false, res.vital);
  }

  /**
   * Take `amount` HP. `quiet` skips the hit record (bleeding). `fatal` kills
   * regardless of HP (a vital part was torn off).
   */
  private damage(victim: Player, amount: number, attacker: number, weapon: number, quiet = false, fatal = false): void {
    if (!victim.alive || (amount <= 0 && !fatal)) return;
    amount /= victim.parts.tough; // (a humanoid clone: HUMANOID_TOUGH)
    const overkill = Math.max(0, amount - victim.hp) + (fatal ? 40 : 0);
    victim.hp -= amount;
    if (attacker !== victim.id || victim.lastHitBy === 255) {
      victim.lastHitBy = attacker;
      victim.lastWeapon = weapon;
    }
    if (!quiet && amount >= 0.5) {
      const w = this.tmp.reset();
      w.u8(R_HIT);
      w.u8(victim.id);
      w.u16(Math.max(0, Math.round(victim.cx)));
      w.u16(Math.max(0, Math.round(victim.cy)) & 0xffff);
      w.u8(Math.min(255, Math.round(amount)));
      this.hits.push({ bytes: w.finish(), id: 0, x: victim.cx, y: victim.cy });
    }
    if (victim.hp > 0 && !fatal) return;
    victim.alive = false;
    victim.hp = 0;
    victim.respawn = RESPAWN_TICKS;
    // Dead with the nest in it (stung, and not yet over it): the nest takes the corpse.
    if (victim.coral.some((c) => c > 0) || weapon === W_SEED) this.corpseNest(victim);
    victim.coral.fill(0);
    this.leaveTank(victim, false);
    // Regicide: soldiers come back by drop rocket after a while; the king never does.
    // PvP: everyone comes back, quickly. Siege: defenders come back; attackers
    // while their side has lives to spend (each death spends one).
    let back = (this.regicideLive && !this.isKing(victim)) || this.extractionLive || this.pvpLive || this.exterminationLive;
    if (this.siegeLive && !this.isKing(victim)) {
      if (victim.team !== ATTACKERS) back = true;
      else if (victim.inWave && this.siegeLives > 0) {
        this.siegeLives--;
        back = true;
      }
    }
    if (back && victim.inWave) {
      victim.pendingSpawn = true;
      victim.respawn = this.pvpLive ? PVP_RESPAWN_TICKS : this.siegeLive && victim.team === ATTACKERS ? SIEGE_RESPAWN_TICKS : REGICIDE_RESPAWN_TICKS;
    }
    if (victim.inWave) victim.waveDeaths++;
    // Everything it carried spills where it fell, for anyone to take.
    this.dropAll(victim);
    // Out of the wave: watch whoever did it.
    if (this.mode === 'ffa') victim.spectate = attacker !== victim.id && this.players[attacker]?.alive ? attacker : 255;
    if (victim.pilot >= 0) this.endPilot(victim);
    if (victim.rc >= 0) this.endRemote(victim);
    victim.deaths++;
    const killer = this.players[attacker];
    if (killer && killer !== victim) {
      killer.kills++;
      killer.waveKills++;
    }
    // The clone gibs. Gibs are cosmetic and simulated by each client from this
    // record; the gold it spills is real terrain, thrown from `seed` so clients
    // can mirror the shower without it being streamed.
    const gold = Math.min(255, Math.floor(victim.gold / 2));
    victim.gold -= gold;
    const seed = this.rng.nextU32();
    const b = victim.body;
    const k = this.broadcast;
    k.u8(R_KILL);
    k.u8(attacker);
    k.u8(victim.id);
    k.u8(weapon);
    k.u16(clampU16(victim.cx));
    k.u16(clampU16(victim.cy + Y_BIAS));
    k.i16(clampI16(b.vx * VEL_SCALE));
    k.i16(clampI16(b.vy * VEL_SCALE));
    k.u8(Math.max(0, Math.min(255, Math.round(overkill))));
    k.u32(seed);
    k.u8(gold);
    k.u16(victim.parts.mask); // what is left of the body to gib
    spillGold(this.grains, victim.cx, victim.cy, b.vx, b.vy, gold, new Rng(seed));
  }

  private onProjEnd = (i: number, x: number, y: number, actor: number, detonate: boolean): void => {
    const pr = this.projectiles;
    const kind = pr.kind[i];
    const owner = pr.owner[i];
    const def = PROJ[kind];
    if (actor >= BEAST_ID_BASE) {
      // Armoured like a vehicle: a round with the energy to get through does its full harm, a weaker one a fifth; a shaped charge a share of the whole.
      // (An asp has no armour: the round's full harm, always.)
      const energy = def.mass * def.sharp * Math.hypot(pr.vx[i], pr.vy[i]);
      const bk = actor - BEAST_ID_BASE;
      const kind = this.beasts[bk]?.kind ?? -1;
      const armoured = kind === BeastKind.Millipede;
      // (Where it struck: a millipede's head is its weak spot.)
      const scale = hitScale(kind, nearestPoint(this.beastPts[bk], x, y).i);
      // A basilisk's plates: half what gets through them, next to nothing what doesn't; a shaped charge a small share.
      const dmg =
        wyrm(kind)
          ? (energy > TANK_INTEGRITY ? def.damage * 0.5 : def.damage * 0.05) + (def.antiArmor ? BEAST_BUILD[kind].hp * def.antiArmor * 0.15 : 0)
          : armoured
            ? (energy > TANK_INTEGRITY ? def.damage : def.damage * 0.2) + (def.antiArmor ? MILLI_HP * def.antiArmor * 0.5 : 0)
            : def.damage;
      this.hurtBeast(bk, dmg * scale, owner);
    } else if (actor >= SHIP_ID_BASE) {
      const sh = this.ships[actor - SHIP_ID_BASE];
      if (sh) {
        const rvx = pr.vx[i] - sh.vx;
        const rvy = pr.vy[i] - sh.vy;
        const sp = Math.sqrt(pr.vx[i] * pr.vx[i] + pr.vy[i] * pr.vy[i]) + 1e-6;
        this.hitShip(actor - SHIP_ID_BASE, x, y, pr.vx[i] / sp, pr.vy[i] / sp, def.mass * def.sharp * Math.sqrt(rvx * rvx + rvy * rvy), def.damage, owner);
        if (def.antiArmor && this.ships[actor - SHIP_ID_BASE] === sh && !this.friendlyShip(owner, sh)) this.hurtShipPart(actor - SHIP_ID_BASE, ShipPart.Hull, SHIP_HP * def.antiArmor * 0.67, owner);
      }
    } else if (actor >= TANK_ID_BASE) {
      const t = this.tanks[actor - TANK_ID_BASE];
      if (t) {
        const rvx = pr.vx[i] - t.vx;
        const rvy = pr.vy[i] - t.vy;
        const sp = Math.sqrt(pr.vx[i] * pr.vx[i] + pr.vy[i] * pr.vy[i]) + 1e-6;
        this.hitTank(actor - TANK_ID_BASE, x, y, pr.vx[i] / sp, pr.vy[i] / sp, def.mass * def.sharp * Math.sqrt(rvx * rvx + rvy * rvy), def.damage, owner);
        // A shaped charge: a share of the whole hull, straight through the armour.
        if (def.antiArmor && this.tanks[actor - TANK_ID_BASE] === t && !this.friendlyTank(owner, t)) this.hurtTankPart(actor - TANK_ID_BASE, TankPart.Hull, TANK_HP * def.antiArmor, owner);
      }
    } else if (actor >= CRAFT_ID_BASE) {
      const c = this.crafts[actor - CRAFT_ID_BASE];
      if (c) {
        const rvx = pr.vx[i] - c.vx;
        const rvy = pr.vy[i] - c.vy;
        const sp = Math.sqrt(pr.vx[i] * pr.vx[i] + pr.vy[i] * pr.vy[i]) + 1e-6;
        // Off-centre hits spin it.
        this.pushCraft(c, x, y, (rvx * def.mass) / CRAFT_MASS, (rvy * def.mass) / CRAFT_MASS);
        this.hitCraft(actor - CRAFT_ID_BASE, x, y, pr.vx[i] / sp, pr.vy[i] / sp, def.mass * def.sharp * Math.sqrt(rvx * rvx + rvy * rvy), def.damage, owner);
      }
    } else if (actor >= 0) {
      // Direct hit: penetrate whichever part the projectile entered.
      const v = this.players[actor]!;
      const rvx = pr.vx[i] - v.body.vx;
      const rvy = pr.vy[i] - v.body.vy;
      const energy = def.mass * def.sharp * Math.sqrt(rvx * rvx + rvy * rvy);
      // Sample the part a little way in along the path, not on the box edge.
      const sp = Math.sqrt(pr.vx[i] * pr.vx[i] + pr.vy[i] * pr.vy[i]) + 1e-6;
      const part = this.partHit(v, x - v.body.x + (pr.vx[i] / sp) * 2, y - v.top + (pr.vy[i] / sp) * 2);
      const res = this.strikeScratch;
      res.hp = 0;
      res.detached.length = 0;
      res.vital = false;
      if (!this.friendly(owner, v)) {
        strike(v.parts, part, energy, def.damage, res);
        // A heavy solid shot: the shock wrenches every part, so limbs come off.
        if (def.shatter) for (let q = 0; q < PART_COUNT; q++) if (q !== part && shareOf(v.parts.cls)[q] > 0 && has(v.parts.mask, q)) harm(v.parts, q, def.shatter * shareOf(v.parts.cls)[q], res);
      }
      const knock = (def.mass * (def.knock ?? 1)) / 8;
      v.body.vx += rvx * knock;
      v.body.vy += rvy * knock;
      this.applyStrike(v, res, owner, kind, x, y);
      // Venom: into the blood, to burn on.
      if (kind === ProjKind.Venom && v.alive) v.venom = Math.min(VENOM_MAX, v.venom + VENOM_DOSE);
    }
    if (actor < 0) {
      // Into a door: as into a tank's hull (a round that can't punch through barely scratches it; a shaped charge takes a share of the whole).
      const d = this.doorAt(Math.floor(x + pr.vx[i] * 0.004), Math.floor(y + pr.vy[i] * 0.004), 2);
      if (d) {
        const energy = def.mass * def.sharp * Math.hypot(pr.vx[i], pr.vy[i]);
        this.damageDoor(d, (energy > TANK_INTEGRITY ? def.damage : def.damage * 0.2) + (def.antiArmor ? TANK_HP * def.antiArmor : 0), owner);
      }
    }
    // Plasma leaves a lick of flame where it landed (that burns whoever stands in it).
    if (kind === ProjKind.Plasma) for (let n = 0; n < 2; n++) this.grains.spawn(PK.Flame, x + this.rng.range(-2, 2), y + this.rng.range(-2, 2), this.rng.range(-30, 30), this.rng.range(-60, 10), 8 + this.rng.int(8), 0, 0, owner);
    const seed = this.rng.nextU32();
    // A dragon's flaming blood, bursting: the fire it throws out (it burns whoever it reaches), and the blood.
    if (kind === ProjKind.FireSpit) {
      // (One of dozens in a breath: a small burst each.)
      for (let n = 0; n < 9; n++) {
        const a = -Math.PI * this.rng.next();
        const sp = 60 + this.rng.next() * 200;
        this.grains.spawn(PK.Flame, x + this.rng.range(-4, 4), y + this.rng.range(-4, 2), Math.cos(a) * sp, Math.sin(a) * sp, 20 + this.rng.int(30), 0, 0, NO_OWNER);
      }
      for (let n = 0; n < 4; n++) this.grains.spawn(PK.Blood, x, y, this.rng.range(-120, 120), this.rng.range(-160, 20), 40, 0, 0, NO_OWNER);
    }
    if (detonate) {
      if (def.carveR > 0 && (actor < 0 || !def.ballistic)) {
        this.carve(x, y, def.carveR, def.coreR, def.debris, owner);
      }
      if (def.splashR > 0) {
        // Knockback and most of the harm come from the particle engine now:
        // the blast writes the air field (which shoves bodies and loose
        // particles), and shrapnel + embers are real particles that cut and
        // burn whoever they reach. Only the overpressure is applied directly.
        this.grains.blast(x, y, def.splashR * 1.6, BLAST_IMPULSE);
        explosionFragments(this.grains, x, y, kind, owner, new Rng(seed));
        this.splashCrafts(x, y, def.splashR, def.splashDamage, owner);
        this.splashTanks(x, y, def.splashR, def.splashDamage, owner);
        this.splashDoors(x, y, def.splashR, def.splashDamage, owner);
        this.splashShips(x, y, def.splashR, def.splashDamage, owner);
        this.splashBeasts(x, y, def.splashR, def.splashDamage, owner);
        this.kickItems(x, y, def.splashR * 1.5);
        for (const p of this.players) {
          if (!p || !p.alive || this.shielded(p) || this.friendly(owner, p)) continue;
          const dx = p.cx - x;
          const dy = p.cy - y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < def.splashR) {
            // Overpressure hits every part at once: armour soaks what it
            // covers, limbs can be blown clean off.
            const selfScale = p.id === owner ? 0.5 : 1;
            const amt = def.splashDamage * (1 - d / def.splashR) * selfScale;
            const res = this.strikeScratch;
            res.hp = 0;
            res.detached.length = 0;
            res.vital = false;
            for (let part = 0; part < PART_COUNT; part++) {
              if (shareOf(p.parts.cls)[part] > 0 && has(p.parts.mask, part)) harm(p.parts, part, amt * shareOf(p.parts.cls)[part], res);
            }
            this.applyStrike(p, res, owner, kind, x + (dx / (d + 1)) * Math.min(d, 6), y + (dy / (d + 1)) * Math.min(d, 6));
          }
        }
      }
    }
    const w = this.tmp.reset();
    w.u8(R_PROJ_END);
    w.u32(pr.id[i]);
    w.u16(Math.max(0, Math.min(65535, Math.round(x))));
    w.u16(Math.max(0, Math.min(65535, Math.round(y + Y_BIAS))));
    w.u8(kind);
    w.u8(detonate ? 1 : 0);
    w.u32(seed);
    this.projEnds.push({ bytes: w.finish(), id: pr.id[i], x, y });
  };

  /**
   * The trigger, magazine and reload for one clone this tick, all from its
   * weapon's row in WEAPONS: rate of fire (fractional cooldown), semi or
   * full auto, clip size and reload time. Switching weapons cancels a
   * reload; an empty magazine reloads itself; R reloads early.
   */
  private handleWeapon(p: Player, prev: number): void {
    const item = p.inv[p.slot];
    if (item !== p.heldItem) {
      p.heldItem = item ?? null;
      p.reloadLeft = 0;
      p.charge = 0;
      p.spin = 0;
    }
    if (!item) {
      p.cooldown = Math.max(0, p.cooldown - 1);
      return;
    }
    const def = WEAPONS[item.weapon];
    const pressed = (p.buttons & BTN_FIRE) !== 0;
    const fresh = pressed && !(prev & BTN_FIRE);
    p.climb *= 0.88; // the muzzle settles back
    if (p.reloadLeft > 0 && --p.reloadLeft === 0) item.ammo = def.clip;
    if (def.clip > 0 && p.reloadLeft === 0) {
      const asked = p.buttons & BTN_RELOAD && !(prev & BTN_RELOAD) && item.ammo < def.clip;
      if (asked || (item.ammo === 0 && pressed)) this.startReload(p);
    }
    if (def.proj === PROJ_LASER) {
      // Laser: hold to charge (up to LASER_MAX), release to fire.
      p.cooldown = Math.max(0, p.cooldown - 1);
      const ready = p.mob.canFire && p.reloadLeft === 0 && item.ammo > 0 && p.cooldown <= 0;
      if (pressed && ready) {
        p.charge = Math.min(LASER_MAX, p.charge + 1);
        p.firing = true;
      } else if (!pressed && p.charge > 0) {
        if (p.charge >= LASER_MIN && ready) {
          this.fireLaser(p, p.charge / LASER_MAX);
          p.cooldown = fireInterval(def);
          if (--item.ammo === 0) this.startReload(p);
        }
        p.charge = 0;
      }
      return;
    }
    // Gatling: the barrels have to spin up before it fires (and spin down when you let go).
    let spun = true;
    if (def.spinUp) {
      p.spin = pressed && p.reloadLeft === 0 ? Math.min(def.spinUp + 10, p.spin + 1) : Math.max(0, p.spin - 2);
      spun = p.spin >= def.spinUp;
    }
    p.cooldown -= 1;
    // The repair kit works off either hand (so it can regrow a lost gun arm), on a fresh press.
    const want = spun && def.proj !== PROJ_BUILD && def.proj !== PROJ_RADIO && def.proj !== PROJ_IDOL && (p.mob.canFire || def.proj === PROJ_REPAIR) && (def.auto ? pressed : fresh) && p.reloadLeft === 0 && (def.clip === 0 || item.ammo > 0);
    if (want && def.proj === PROJ_REPAIR) {
      this.healWave(p);
      p.firing = true;
      return;
    }
    if (want && def.proj === PROJ_BURNER && p.cooldown <= 0) {
      this.throwBurner(p);
      p.firing = true;
      return;
    }
    if (want && p.cooldown <= 0 && (def.proj !== PROJ_MINE || this.layMine(p))) {
      if (def.proj !== PROJ_MINE) this.fire(p, def);
      p.firing = true;
      // One-handed (off arm gone): slower to recover.
      p.cooldown += fireInterval(def) * (p.mob.oneHanded ? 1.6 : 1);
      if (def.clip > 0 && --item.ammo === 0) this.startReload(p);
    }
    // Only carry the fractional remainder while the trigger keeps firing.
    if (p.cooldown < 0 && !want) p.cooldown = 0;
  }

  // ------------------------------------------------------------ inventory

  /**
   * Ground items for one client: an item's full state when it comes into
   * view or changes (it lands, a blast kicks it), and a gone notice when it
   * is taken, expires or drifts far out of view. In between, the client
   * simulates it with the same stepItem, so a resting gun costs nothing.
   */
  private replicateItems(p: Player, w: Writer, vx0: number, vy0: number, vx1: number, vy1: number): void {
    const known = p.knownItems;
    const gone = this.goneScratch;
    gone.length = 0;
    for (const id of this.itemsGone) if (known.delete(id)) gone.push(id);
    let n = 0;
    let nAt = -1;
    const M = 120; // send a little before it's on screen
    for (const it of this.items) {
      const sent = known.get(it.id);
      const near = it.x >= vx0 - M && it.x <= vx1 + M && it.y >= vy0 - M && it.y <= vy1 + M;
      if (!near) {
        // Well out of view: let the client forget it (it is resent on return).
        if (sent !== undefined && (it.x < vx0 - 3 * M || it.x > vx1 + 3 * M || it.y < vy0 - 3 * M || it.y > vy1 + 3 * M)) {
          known.delete(it.id);
          gone.push(it.id);
        }
        continue;
      }
      if (sent === it.rev || n === 255) continue;
      if (n === 0) {
        w.u8(R_ITEMS);
        nAt = w.pos;
        w.u8(0);
      }
      n++;
      known.set(it.id, it.rev);
      w.u16(it.id);
      w.u8(it.weapon);
      w.u8(it.ammo);
      w.u8((it.rest ? 1 : 0) | (it.left ? 2 : 0));
      w.f64(it.x);
      w.f64(it.y);
      w.f64(it.vx);
      w.f64(it.vy);
    }
    if (n > 0) w.buf[nAt] = n;
    for (let i = 0; i < gone.length; i += 255) {
      const k = Math.min(255, gone.length - i);
      w.u8(R_ITEMS_GONE);
      w.u8(k);
      for (let j = 0; j < k; j++) w.u16(gone[i + j]);
    }
  }

  private readonly goneScratch: number[] = [];


  /** Ground items: dropped weapons, lying around (and bouncing) for anyone to take. */
  readonly items: (GroundItem & { age: number; rev: number })[] = [];
  private nextItemId = 1;
  /** Ids of items removed this tick (picked up, expired), for replication. */
  private readonly itemsGone: number[] = [];

  /** Re-derive what's in hand after the inventory or slot changed. */
  private syncHeld(p: Player): void {
    if (p.slot >= p.inv.length) p.slot = Math.max(0, p.inv.length - 1);
    p.weapon = p.inv[p.slot]?.weapon ?? NO_WEAPON;
  }

  /** The inventory changed under the client: bump the version so stale selections are ignored. */
  private invChanged(p: Player): void {
    p.invVersion = (p.invVersion + 1) & 255;
    this.syncHeld(p);
  }

  /**
   * Apply the client's inventory byte: the selected slot (if chosen from the
   * current inventory version), and the rising edges of pick-up and drop.
   */
  private handleInventory(p: Player): void {
    const b = p.invCmd;
    const prev = p.prevInv;
    p.prevInv = b;
    if (invVersionBits(b) === (p.invVersion & 3) && invSlot(b) < p.inv.length && invSlot(b) !== p.slot) {
      p.slot = invSlot(b);
      this.syncHeld(p);
    }
    // The pick-up key also climbs into an empty tank, and back out; and up
    // onto a friendly vehicle to ride on top of it (tank surfing), and off.
    if (b & INV_PICKUP && !(prev & INV_PICKUP)) {
      if (p.tank >= 0) this.leaveTank(p, true);
      else if (p.surf >= 0 || p.surfShip >= 0) this.dismount(p, true);
      else if (!this.boardTank(p) && !this.mount(p)) this.pickUp(p);
    }
    if (b & INV_DROP && !(prev & INV_DROP) && p.tank < 0) this.dropHeld(p);
  }

  /**
   * Give a clone a weapon and put it in its hand (tests, and handy for admin
   * tools). Returns the inventory byte a client would now send for it.
   */
  equip(p: Player, weapon: number): number {
    let i = p.inv.findIndex((it) => it.weapon === weapon);
    if (i < 0) {
      if (p.inv.length >= INV_MAX) {
        // Full: make room by dropping something other than what's in hand.
        const k = p.slot === 0 ? 1 : 0;
        p.inv.splice(k, 1);
        if (k < p.slot) p.slot--;
      }
      p.inv.push(newItem(weapon));
      i = p.inv.length - 1;
    }
    if (i !== p.slot || p.weapon !== weapon) {
      p.slot = i;
      this.invChanged(p);
    }
    return invByte(p.slot, p.invVersion);
  }

  /** Lay a weapon on the ground at (x, y), full (the tutorial's rifle). */
  dropItem(weapon: number, x: number, y: number): void {
    this.spawnItem(weapon, newItem(weapon).ammo, x, y, 0, 0);
  }

  private spawnItem(weapon: number, ammo: number, x: number, y: number, vx: number, vy: number): void {
    // Never inside terrain: back up to the nearest open cell above.
    for (let k = 0; k < 16 && this.terrain.isSolid(Math.floor(x), Math.floor(y)); k++) y -= 1;
    this.items.push({ id: this.nextItemId, weapon, ammo, x, y, vx, vy, rest: false, left: vx < 0, age: 0, rev: 0 });
    this.nextItemId = (this.nextItemId % 65535) + 1;
    if (this.items.length > MAX_ITEMS) this.removeItem(this.items.findIndex((o) => o.weapon !== WeaponId.Idol)); // the oldest goes (never the idol)
  }

  private removeItem(i: number): void {
    this.itemsGone.push(this.items[i].id);
    this.items.splice(i, 1);
  }

  /** Throw the weapon in hand away, along the aim. */
  private dropHeld(p: Player): void {
    const it = p.inv[p.slot];
    if (!it) return;
    p.inv.splice(p.slot, 1);
    const aim = dequantizeAim(p.aimQ);
    this.spawnItem(it.weapon, it.ammo, p.body.x + SHOULDER_X, p.body.y + SHOULDER_Y, p.body.vx * 0.5 + Math.cos(aim) * 140, p.body.vy * 0.5 + Math.sin(aim) * 140 - 60);
    this.invChanged(p);
  }

  /** Pick up the nearest weapon in reach; with full hands, swap the one held for it. */
  private pickUp(p: Player): void {
    let best = -1;
    let bestD = PICKUP_R * PICKUP_R;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const d = (it.x - p.cx) ** 2 + (it.y - p.cy) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return;
    const it = this.items[best];
    this.removeItem(best);
    if (p.inv.length >= INV_MAX) {
      const held = p.inv.splice(p.slot, 1)[0];
      this.spawnItem(held.weapon, held.ammo, it.x, it.y - 2, 0, -40);
    }
    p.inv.push({ weapon: it.weapon, ammo: it.ammo });
    p.slot = p.inv.length - 1;
    this.invChanged(p);
  }

  /** Death (or leaving): the whole kit spills where the clone was. */
  private dropAll(p: Player): void {
    for (const it of p.inv) {
      this.spawnItem(it.weapon, it.ammo, p.cx, p.cy, p.body.vx * 0.5 + this.rng.range(-110, 110), p.body.vy * 0.5 - this.rng.range(60, 200));
    }
    p.inv = [];
    this.invChanged(p);
  }

  private stepItems(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (++it.age > ITEM_LIFE && it.weapon !== WeaponId.Idol) {
        this.removeItem(i);
        continue;
      }
      const wasRest = it.rest;
      stepItem(it, this.terrain, DT);
      // Landing is where client and server could have drifted apart: resend.
      if (it.rest !== wasRest) it.rev++;
    }
  }

  /** A blast throws nearby weapons around. */
  private kickItems(x: number, y: number, r: number): void {
    for (const it of this.items) {
      const dx = it.x - x;
      const dy = it.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= r) continue;
      const s = 260 * (1 - d / r);
      it.vx += (dx / (d + 1e-6)) * s;
      it.vy += (dy / (d + 1e-6)) * s - 60;
      it.rest = false;
      it.rev++;
    }
  }

  private readonly placedScratch: number[] = [];
  private readonly blockers: BuildBlocker[] = [];

  /**
   * Materializer: turn gold into a fortification piece if the server agrees
   * it fits (the same canBuild the client previews with), then log it as an
   * R_BUILD op that every client replays on its own terrain.
   */
  private tryBuild(p: Player): number {
    const req = p.buildReq!;
    p.buildReq = null;
    const def = WEAPONS[p.weapon];
    if (!def || def.proj !== PROJ_BUILD || !p.mob.canFire || p.cooldown > 0) return -1;
    const bl = this.blockers;
    bl.length = 0;
    for (const o of this.players) if (o && o.alive) bl.push({ x: o.body.x, y: o.body.y, w: ACTOR_W, h: ACTOR_H });
    for (const t of this.tanks) if (t) bl.push({ x: t.x, y: t.y, w: tankW(t), h: tankH(t) });
    for (const c of this.crafts) {
      if (!c) continue;
      const e = craftHalfExtents(c.a, this.ext);
      bl.push({ x: c.x - e.x, y: c.y - e.y, w: 2 * e.x, h: 2 * e.y });
    }
    const res = canBuild(this.terrain, req.piece, req.gx, req.gy, p.body.x + SHOULDER_X, p.body.y + SHOULDER_Y, p.gold, bl);
    if (res !== BuildResult.Ok) return res;
    const piece = pieceOf(req.piece)!;
    if (applyBuild(this.terrain, req.piece, req.gx, req.gy, this.placedScratch) === 0) return BuildResult.Room;
    p.gold -= piece.cost;
    p.cooldown = fireInterval(def);
    p.firing = true;
    const w = this.tmp.reset();
    w.u8(R_BUILD);
    w.u8(req.piece);
    w.u8(p.id);
    w.u16(req.gx);
    w.u16(req.gy);
    this.logOp(w.finish(), req.gx, req.gy, req.gx + piece.w - 1, req.gy + piece.h - 1);
    return BuildResult.Ok;
  }

  private startReload(p: Player): void {
    // One hand: fumbling the magazine takes longer.
    p.reloadLeft = Math.ceil(WEAPONS[p.weapon].reload * (p.mob.oneHanded ? 1.5 : 1));
  }

  private readonly muzzleAt = { x: 0, y: 0 };

  private fire(p: Player, def: (typeof WEAPONS)[number]): void {
    let aim = dequantizeAim(p.aimQ);
    // Locked on: true to where the target really is (see lockedAim).
    const pd = def.proj !== PROJ_DIG ? PROJ[def.proj] : undefined;
    if (p.buttons & BTN_LOCK && pd) aim = this.lockedAim(p, aim, def.speed, GRAVITY * pd.gravity, def.muzzle);
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);
    const sh = shoulderAt(p.body.x, p.body.y, p.body.stance, cos < 0, this.shoulderPt);
    const ox = sh.x;
    const oy = sh.y;
    void ox;
    void oy;
    if (def.proj === PROJ_DIG) {
      // Digger: vacuum terrain in front of the clone, banking any gold. It
      // bites at the first solid cell along the aim (so a wall you're
      // pressed against gets dug), up to its reach.
      let d = DIGGER_REACH;
      for (let r = 2; r < DIGGER_REACH; r++) {
        const hx = Math.floor(ox + cos * r);
        const hy = Math.floor(oy + sin * r);
        if (this.terrain.isSolid(hx, hy)) {
          // Adamant (the deadland's cement): only the very centre of a bite's core takes it (a
          // quarter of its radius). So the bite is centred on the cell it reached, not past it, and
          // its core widened (DIGGER_ADAMANT), the cement within two cells of it ground away each
          // time: slower than soil, but a way through, not a pinhole.
          if (MAT_ADAMANT[this.terrain.get(hx, hy)]) {
            this.carve(hx, hy, DIGGER_ADAMANT, DIGGER_ADAMANT, 0, p.id);
            p.gold += digValue(this.terrain.removedByMat);
            return;
          }
          d = Math.min(DIGGER_REACH, r + 1); // the core (radius DIGGER_CORE) still covers that cell
          break;
        }
      }
      const droid = p.body.cls === ClassId.Droid;
      this.carve(ox + cos * d, oy + sin * d, droid ? DIGGER_R_DROID : DIGGER_R, droid ? DIGGER_CORE_DROID : DIGGER_CORE, 0, p.id);
      p.gold += digValue(this.terrain.removedByMat);
      return;
    }
    // Scoped, or locked on by the aim assist: braced, half the spread.
    const locked = (p.buttons & BTN_LOCK) !== 0;
    const scoped = p.buttons & BTN_SCOPE || locked ? 0.5 : 1;
    // Recoil: the muzzle climbs with each shot (up, whichever way it faces),
    // unless it's locked on: then the shooter holds it on the target, and
    // the shots go down the sight line...
    const up = cos < 0 ? 1 : -1;
    const climbed = locked ? 0 : up * p.climb;
    p.climb += def.climb ?? 0;
    // ...and the shot shoves the shooter back (braced less in a crouch, least lying prone).
    const brace = RECOIL_BRACE[p.body.stance] ?? 1;
    const kick = (def.kick ?? 0) * brace * (p.mob.oneHanded ? 1.4 : 1);
    p.body.vx -= cos * kick;
    p.body.vy -= sin * kick * 0.6;
    // Leave from the muzzle, unless the barrel is pushed into a wall: then
    // from the first solid cell along it (no shooting through walls).
    const m = muzzlePoint(def, ox, oy, aim, this.muzzleAt);
    let sx = m.x;
    let sy = m.y;
    for (let d = 0.5; d < def.muzzle; d += 0.5) {
      const tx = ox + cos * d;
      const ty = oy + sin * d;
      if (this.terrain.isSolid(Math.floor(tx), Math.floor(ty))) {
        sx = tx;
        sy = ty;
        break;
      }
    }
    // One projectile, or a shotgun's spread of pellets (each its own spread and a little speed scatter).
    const n = def.pellets ?? 1;
    for (let k = 0; k < n; k++) {
      const a = aim + (this.rng.next() - 0.5) * 2 * def.spread * scoped * (p.mob.oneHanded ? 3 : 1) + climbed;
      const speed = def.speed * (n > 1 ? 0.9 + this.rng.next() * 0.2 : 1);
      this.spawnProj(this.nextProjId++, def.proj, p.id, sx, sy, Math.cos(a) * speed + p.body.vx * 0.25, Math.sin(a) * speed + p.body.vy * 0.25);
    }
  }

  /**
   * The laser fires (`power` 0..1, from how long it was charged): an instant
   * beam from the muzzle along the aim. It goes straight through every
   * soldier in its way at full strength (wider and deadlier the longer the
   * charge), and stops at terrain or a vehicle, which it hits; a strong beam
   * burns a crater where it lands.
   */
  private fireLaser(p: Player, power: number): void {
    const def = WEAPONS[WeaponId.Laser];
    let aim = dequantizeAim(p.aimQ);
    // Locked on: the beam goes to where the target really is, now (see lockedAim).
    if (p.buttons & BTN_LOCK) aim = this.lockedAim(p, aim, 0, 0, def.muzzle);
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);
    const sh = shoulderAt(p.body.x, p.body.y, p.body.stance, cos < 0, this.shoulderPt);
    this.beam(p.id, sh.x + cos * def.muzzle, sh.y + sin * def.muzzle, aim, laserWidth(power), laserEnergy(power), laserWound(power), power, power, p.id);
    // Its kick, the stronger the charge.
    const brace = RECOIL_BRACE[p.body.stance] ?? 1;
    p.body.vx -= cos * (10 + 110 * power) * brace;
    p.body.vy -= sin * (10 + 110 * power) * brace * 0.6;
  }

  /**
   * A locked-on shot (BTN_LOCK: the aim assist or the scope has the target).
   * The client aimed at the target where it saw it, and what it sees is a
   * moment old (smoothed between frames, then the trip here and back), so
   * on a moving target the shot would land behind it. The server knows
   * where everyone really is now: it takes the target the aim was on (the
   * nearest by angle, within LOCK_SLACK cells of it at its range) and aims
   * at it as it is, leading it by the shot's flight (`speed` 0: a beam,
   * instant) as a bot would. Nothing near enough the aim: the aim as sent.
   */
  private lockedAim(p: Player, aim: number, speed: number, gravity: number, muzzle: number): number {
    const sh = shoulderAt(p.body.x, p.body.y, p.body.stance, Math.cos(aim) < 0, this.shoulderPt);
    // (Only as far as the weapon's scope reaches: lockReach.)
    return this.lockOnto(p, sh.x, sh.y, aim, speed, gravity, p.body.vx * 0.25, p.body.vy * 0.25, muzzle, false, lockReach(WEAPONS[p.weapon]));
  }

  /**
   * A vehicle's gun fired locked on by whoever's at its controls (`by`:
   * driving a tank or a tarantula, from inside or by remote, or flying a
   * dropship): set true on its target as a clone's shot is (lockedAim),
   * from its gun (its muzzle at (mx, my)), the vehicle's motion (vx, vy) carried into the
   * shot. A watchdog thinking for itself, or nobody locked: the aim as it is.
   */
  private vehicleAim(by: number, t: Tank, cannon: boolean, aim: number, speed: number, gravity: number, vx: number, vy: number): number {
    const p = by >= 0 && by < MAX_PLAYERS ? this.players[by] : null;
    if (!p || !this.lockedBy(by)) return aim;
    // Which target: by angle from where the gun pivots, as the driver's client aims.
    this.lockOnto(p, t.x + tankW(t) / 2, gunPivotY(t), aim, speed, gravity, vx, vy, 0);
    const tgt = this.lockPick;
    if (!tgt) return aim;
    // Then aimed from its muzzle, wherever that is on the vehicle (it moves as the gun swings: settle it).
    let a = aim;
    for (let k = 0; k < 3; k++) {
      const m = tankMuzzle(t, cannon, a, this.tankMz);
      const b = speed > 0 ? ballisticAim(m.x, m.y, tgt, speed, gravity, { vx, vy }, 0) : null;
      a = b ? b.aim : Math.atan2(tgt.y - m.y, tgt.x - m.x);
    }
    return a;
  }

  /** Is `by` at a vehicle's controls with its guns locked on? */
  private lockedBy(by: number): boolean {
    const p = by >= 0 && by < MAX_PLAYERS ? this.players[by] : null;
    return !!p && p.alive && (p.buttons & BTN_LOCK) !== 0 && (p.tank >= 0 || p.rc >= 0 || p.pilot >= 0);
  }

  /** What the last lockOnto settled on (its point and motion), or null. */
  private lockPick: { x: number; y: number; vx: number; vy: number } | null = null;

  /** The aim from (ox, oy) set true on the target near it (see lockedAim). */
  private lockOnto(p: Player, ox: number, oy: number, aim: number, speed: number, gravity: number, ovx: number, ovy: number, muzzle: number, off = false, reach = Infinity): number {
    this.lockPick = null;
    if (off) return aim;
    const own = { vx: ovx, vy: ovy };
    let best = aim;
    let bestD = Infinity;
    const consider = (x: number, y: number, vx: number, vy: number) => {
      const dist = Math.hypot(x - ox, y - oy);
      if (dist < 6 || dist > reach) return;
      const b = speed > 0 ? ballisticAim(ox, oy, { x, y, vx, vy }, speed, gravity, own, muzzle) : null;
      const a = b ? b.aim : Math.atan2(y - oy, x - ox);
      // (How near the aim was: to the shot that would hit it, or straight at it, whichever, as a client may or may not lead.)
      const off = (u: number) => Math.abs(((u - aim + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const d = Math.min(off(a), off(Math.atan2(y - oy, x - ox)));
      if (d < bestD && d < Math.atan2(LOCK_SLACK, dist) && this.lineClear(ox, oy, x, y)) {
        bestD = d;
        best = a;
        this.lockPick = { x, y, vx, vy };
      }
    };
    for (const q of this.players) {
      if (!q || q === p || !q.alive || q.tank >= 0 || q.pilot >= 0 || this.friendly(p.id, q)) continue;
      // Its head, and centre mass (whichever the aim was on is the nearer).
      consider(q.cx, q.top + 1.5, q.body.vx, q.body.vy);
      consider(q.cx, q.cy, q.body.vx, q.body.vy);
    }
    // Enemy vehicles: a tank (or watchdog, or tarantula) by its core; a dropship by its hull. Never its own.
    for (let k = 0; k < this.tanks.length; k++) {
      const t = this.tanks[k];
      if (!t || p.tank === k || p.rc === k) continue;
      const who = isPet(t) ? t.owner : t.pilot;
      const d = who !== 255 ? this.players[who] : null;
      if (!d || d === p || this.friendly(p.id, d)) continue;
      consider(t.x + tankW(t) / 2, tankCoreY(t), t.vx, t.vy);
    }
    for (let k = 0; k < this.ships.length; k++) {
      const sh = this.ships[k];
      if (!sh || p.pilot === k || sh.owner === p.id || (p.team !== Team.None && sh.team === p.team)) continue;
      consider(sh.x + SHIP_W / 2, sh.y + SHIP_H / 2, sh.vx, sh.vy);
    }
    // Wildlife: a crawler by its head and mid-body (not one lying in wait: its camouflage holds),
    // a wasp by its body, a nest by its middle; each with its motion, to lead it.
    for (let k = 0; k < MAX_BEASTS; k++) {
      const b = this.beasts[k];
      if (!b) continue;
      const pts = this.beastPts[k];
      if (!pts.length) continue;
      let vx = (pts[0] - this.beastHead[k * 2]) * TICK_RATE;
      let vy = (pts[1] - this.beastHead[k * 2 + 1]) * TICK_RATE;
      // (Just hatched into its slot, the last one's head is no motion of its own.)
      if (Math.hypot(vx, vy) > 900) vx = vy = 0;
      if (b.kind === BeastKind.Seeder || b.kind === BeastKind.Nest || b.kind === BeastKind.Web) {
        consider(pts[0], pts[1], vx, vy);
        continue;
      }
      if ((!crawler(b.kind) && !wyrm(b.kind)) || b.frozen > 0 || b.gem) continue;
      const m = (pts.length >> 2) << 1;
      consider(pts[0], pts[1], vx, vy);
      consider(pts[m], pts[m + 1], vx, vy);
    }
    return best;
  }

  /** A tarantula's laser: a thin beam out of its head, at whatever it's aimed at. */
  private spiderBeam(t: Tank, by: number): void {
    let m = tankMuzzle(t, false, t.aim, this.tankMz);
    const set = this.vehicleAim(by, t, false, m.a, 0, 0, 0, 0);
    if (set !== m.a) m = tankMuzzle(t, false, set, this.tankMz);
    this.beam(by, m.x, m.y, m.a, SPIDER_BEAM_WIDTH, SPIDER_BEAM_ENERGY, SPIDER_BEAM_WOUND, 0.12, 0, 255, true);
    t.firedSmg = true;
  }

  /**
   * A laser beam fired for `by` from (x0, y0) along `aim` (`w` wide, hitting
   * with `energy` and `wound`): it goes straight through every soldier in its
   * way, and stops at terrain or a vehicle, which it hits; with `burn`, it
   * burns a crater where it lands. `power` (0..1) is how it looks; `shooter`
   * is whose gun kicks on clients (255: nobody's). `vapor` (the tarantula's):
   * it vaporizes what it touches, a bite out of the ground where it lands
   * and a burn on everyone it goes through.
   */
  private beam(by: number, x0: number, y0: number, aim: number, w: number, energy: number, wound: number, power: number, burn: number, shooter: number, vapor = false): void {
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);
    // Out to the first solid cell (or a vehicle, which takes the hit and stops it).
    let len = sightLine(this.terrain, x0, y0, aim, 2400);
    const vehicle = this.segmentActor(x0, y0, x0 + cos * len, y0 + sin * len, by, this.laserQ, LASER_VEHICLES_ONLY);
    if (vehicle >= 0) len *= this.laserQ.t;
    const x1 = x0 + cos * len;
    const y1 = y0 + sin * len;
    // Every soldier along it, no matter how many.
    for (const v of this.players) {
      if (!v || !v.alive || v.id === by || v.tank >= 0) continue;
      const b = v.body;
      const t = segmentBox(x0, y0, x1 - x0, y1 - y0, b.x - w, v.top - w, b.x + ACTOR_W + w, b.y + ACTOR_H + w);
      if (t < 0) continue;
      const hx = x0 + (x1 - x0) * t + cos * (w + 2);
      const hy = y0 + (y1 - y0) * t + sin * (w + 2);
      const res = this.strikeScratch;
      res.hp = 0;
      res.detached.length = 0;
      res.vital = false;
      if (!this.friendly(by, v)) {
        const part = this.partHit(v, hx - b.x, hy - v.top);
        strike(v.parts, part, energy, wound, res);
        if (vapor) harm(v.parts, part, SPIDER_VAPOR_BURN, res);
        // A wide beam cuts through the body too, whatever it went in by.
        if (power > 0.45 && v.parts.mask & (1 << Part.Torso)) strike(v.parts, Part.Torso, energy, wound * 0.6, res);
      }
      b.vx += cos * 70 * power;
      b.vy += sin * 70 * power - 20 * power;
      this.applyStrike(v, res, by, W_LASER, hx, hy);
    }
    // Every creature along it too.
    for (let k = 0; k < MAX_BEASTS; k++) {
      const pts = this.beasts[k] ? this.beastPts[k] : null;
      if (!pts) continue;
      for (let i = 0; i < pts.length; i += 2) {
        if (segmentCircle(x0, y0, x1 - x0, y1 - y0, pts[i], pts[i + 1], BEAST_BUILD[this.beasts[k]!.kind].r + w) >= 0) {
          this.hurtBeast(k, wound * hitScale(this.beasts[k]!.kind, i >> 1) * (wyrm(this.beasts[k]!.kind) ? 0.3 : 1), by);
          break;
        }
      }
    }
    if (vehicle >= SHIP_ID_BASE) this.hitShip(vehicle - SHIP_ID_BASE, x1, y1, cos, sin, energy, wound * 2, by);
    else if (vehicle >= TANK_ID_BASE) this.hitTank(vehicle - TANK_ID_BASE, x1, y1, cos, sin, energy, wound * 2, by);
    else if (vehicle >= CRAFT_ID_BASE) this.hitCraft(vehicle - CRAFT_ID_BASE, x1, y1, cos, sin, energy, wound * 2, by);
    else if (vapor && len < 2400) this.carve(x1 + cos * 3, y1 + sin * 3, SPIDER_VAPOR_R, SPIDER_VAPOR_CORE, 4, by);
    else if (burn >= 0.1 && len < 2400) this.carve(x1 + cos * 2, y1 + sin * 2, Math.round(2 + 10 * burn), Math.round(1 + 6 * burn), Math.round(8 + 50 * burn), by);
    // Every client near either end sees the beam.
    const w2 = this.tmp.reset();
    w2.u8(R_BEAM);
    w2.u16(this.beamSeq = (this.beamSeq + 1) & 0xffff);
    w2.u16(clampU16(x0));
    w2.u16(clampU16(y0 + Y_BIAS));
    w2.u16(clampU16(x1));
    w2.u16(clampU16(y1 + Y_BIAS));
    w2.u8(Math.round(power * 255));
    w2.u8(shooter);
    w2.u8(vapor ? 1 : 0);
    const bytes = w2.finish();
    this.hits.push({ bytes, id: 0, x: x0, y: y0 });
    if (len > 300) this.hits.push({ bytes, id: 0, x: x1, y: y1 });
  }
  private readonly laserQ = { t: 0 };
  private beamSeq = 0;

  /**
   * The repair kit, used: it's spent (gone from the hand), and a health wave
   * spreads out from the clone that used it (stepWaves).
   */
  private healWave(p: Player): void {
    const id = (this.waveSeq = (this.waveSeq + 1) & 0xffff);
    this.waves.push({ id, x: p.cx, y: p.cy, team: p.team, owner: p.id, age: 0 });
    p.inv.splice(p.slot, 1);
    p.slot = Math.max(0, Math.min(p.slot, p.inv.length - 1));
    this.invChanged(p);
    const w = this.tmp.reset();
    w.u8(R_HEAL);
    w.u16(id);
    w.u16(clampU16(p.cx));
    w.u16(clampU16(p.cy + Y_BIAS));
    w.u8(p.team);
    w.u8(p.id);
    this.hits.push({ bytes: w.finish(), id: 0, x: p.cx, y: p.cy });
  }

  /** Health waves spreading (catching the user's side as they pass), and everyone they caught mending. */
  private stepWaves(): void {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wv = this.waves[i];
      wv.age++;
      const r = (HEAL_R * Math.min(wv.age, HEAL_SPREAD)) / HEAL_SPREAD;
      for (const o of this.players) {
        if (!o || !o.alive || o.mendWave === wv.id) continue;
        if (o.id !== wv.owner && (wv.team === Team.None || o.team !== wv.team)) continue;
        if (Math.hypot(o.cx - wv.x, o.cy - wv.y) > r) continue;
        o.mendWave = wv.id;
        o.mend = MEND_TICKS;
      }
      if (wv.age >= HEAL_SPREAD) this.waves.splice(i, 1);
    }
    for (const p of this.players) {
      if (!p || p.mend <= 0) continue;
      if (!p.alive) {
        p.mend = 0;
        continue;
      }
      p.mend--;
      this.mendTick(p);
    }
  }
  private readonly waves: { id: number; x: number; y: number; team: number; owner: number; age: number }[] = [];
  private waveSeq = 0;

  /**
   * One tick of mending: it closes wounds and restores health, and once the
   * clone is patched up enough it regrows a missing limb (arms first, then
   * legs, then the jetpack) every REGROW_TICKS.
   */
  private mendTick(t: Player): void {
    t.hp = Math.min(ACTOR_MAX_HP, t.hp + REPAIR_HP);
    t.venom = 0; // (the nanobots wash the venom out)
    t.coral.fill(0); // (and the coral)
    const parts = t.parts;
    for (let part = 0; part < PART_COUNT; part++) if (has(parts.mask, part)) parts.wounds[part] = Math.max(0, parts.wounds[part] - REPAIR_WOUND);
    const missing = (parts.cls === ClassId.Droid ? DROID_REGROWABLE : REGROWABLE).find((part) => !has(parts.mask, part));
    if (missing === undefined || t.hp < ACTOR_MAX_HP * 0.6) {
      t.regrow = 0;
      return;
    }
    if (++t.regrow < REGROW_TICKS) return;
    t.regrow = 0;
    parts.mask |= 1 << missing;
    parts.wounds[missing] = 0;
    mobility(parts.mask, t.mob, parts.cls);
    t.body.legs = t.mob.legs;
    t.body.jet = t.mob.jet;
  }
  private readonly scopeQ = { t: 0 };

  /** Launch a projectile and tell the clients that will see it. */
  private spawnProj(id: number, kind: number, owner: number, sx: number, sy: number, vx: number, vy: number): void {
    if (this.projectiles.spawn(id, kind, owner, sx, sy, vx, vy) < 0) return;
    const i = this.projectiles.n - 1;
    const w = this.tmp.reset();
    w.u8(R_PROJ_SPAWN);
    w.u32(id);
    w.u8(kind);
    w.u8(owner);
    // Send the float32-rounded state the server will simulate from.
    w.f32(this.projectiles.x[i]);
    w.f32(this.projectiles.y[i]);
    w.f32(this.projectiles.vx[i]);
    w.f32(this.projectiles.vy[i]);
    this.projSpawns.push({ bytes: w.finish(), id, x: sx, y: sy });
  }

  /** Put a fresh clone into the world at (x, y), e.g. out of a drop rocket's hatch. */
  private placeClone(p: Player, x: number, y: number, vx: number, vy: number): void {
    const b = p.body;
    b.x = x;
    b.y = y;
    b.vx = vx;
    b.vy = vy;
    b.fuel = 100;
    p.venom = 0;
    p.coral.fill(0);
    // Every clone rolls a class (scout, medium or heavy) and the mercenary
    // vendor that supplied it (Guild-Tech, Rust Nomads, Synth Legion).
    resetBody(p.parts, rollClass(this.rng.next()), rollFaction(this.rng.next()));
    b.cls = p.parts.cls;
    b.faction = p.parts.faction;
    mobility(p.parts.mask, p.mob, p.parts.cls);
    b.legs = p.mob.legs;
    b.jet = p.mob.jet;
    p.lastHitBy = 255;
    p.lastWeapon = 255;
    p.hp = ACTOR_MAX_HP;
    p.alive = true;
    p.regrow = 0;
    p.mend = 0;
    p.cooldown = 10;
    p.reloadLeft = 0;
    // A fresh, random kit (always a primary, a digger and a materializer), or a scripted one.
    p.inv = this.kitFor?.(p) ?? spawnLoadout(this.rng);
    // (mage777 never deploys without one.)
    if (!this.kitFor && p.name.trim().toLowerCase() === STONEBURNER_NAME && !p.inv.some((it) => it.weapon === WeaponId.Stoneburner)) {
      const k = p.inv.findIndex((it) => it.weapon === WeaponId.Grenade || it.weapon === WeaponId.Mine);
      if (k >= 0) p.inv[k] = newItem(WeaponId.Stoneburner);
      else p.inv.splice(1, 0, newItem(WeaponId.Stoneburner));
      if (p.inv.length > INV_MAX) p.inv.splice(INV_MAX);
    }
    p.slot = 0;
    this.invChanged(p);
    p.delivering = -1;
  }

  // ---------------------------------------------------------------- drop rockets

  /** Send a drop rocket for a player waiting to respawn (if a slot is free). */
  private launchCraft(p: Player): void {
    const slot = this.crafts.indexOf(null);
    if (slot < 0) return; // sky is full; try again next tick
    // Teams come down on opposite sides of the map: red the left, green the right.
    let lo = 48 + CRAFT_W / 2;
    let span = WORLD_W - 96 - CRAFT_W;
    const fort = (this.regicideLive && p.team !== Team.None) || (this.siegeLive && p.team === DEFENDERS) ? this.fortresses[p.team] : undefined;
    const lz = this.siegeLive && p.team === ATTACKERS ? this.siege?.lz : undefined;
    const well = this.extractionLive && this.dungeon && p.team < 4 ? this.dungeon.entrances[p.team] : undefined;
    if (lz) {
      // Siege: the attackers all come down in their landing zone, far from the fortress.
      lo = lz[0] + CRAFT_W / 2;
      span = Math.max(1, lz[1] - lz[0] - CRAFT_W);
    } else if (well) {
      // Extraction: each team comes down around its own well.
      lo = Math.max(48 + CRAFT_W / 2, well.x - 170);
      span = 340;
    } else if (fort) {
      // Reinforcements land at their own fortress.
      const spots = fort.spawns;
      const xs = spots.map((s) => s.x);
      lo = Math.max(48 + CRAFT_W / 2, Math.min(...xs) - 120);
      span = Math.max(1, Math.min(WORLD_W - 48 - CRAFT_W / 2, Math.max(...xs) + 120) - lo);
    } else if (p.team !== Team.None) {
      span = Math.floor(span * 0.4);
      if (p.team === Team.Green) lo = WORLD_W - 48 - CRAFT_W / 2 - span;
    }
    // (A scripted drop zone, the tutorial's, over all of that.)
    const zone = this.dropZone?.(p);
    if (zone) {
      lo = zone[0];
      span = Math.max(1, zone[1] - zone[0]);
    }
    const pick = () => lo + this.rng.int(span);
    // Of a handful of candidate spots with sky above and ground below, take
    // the one furthest from live clones and other incoming rockets, so a
    // full room doesn't land on top of itself.
    let x = pick();
    let bestGap = -1;
    for (let attempt = 0; attempt < 24; attempt++) {
      const cx = pick();
      const top = this.terrain.surfaceY(Math.floor(cx));
      if (top <= 60 || top >= WORLD_H - 40) continue;
      let gap = Infinity;
      for (const o of this.players) if (o && o.alive && (o.team === Team.None || o.team !== p.team)) gap = Math.min(gap, Math.abs(o.cx - cx));
      for (const c of this.crafts) if (c) gap = Math.min(gap, Math.abs(c.x - cx));
      if (gap > bestGap) {
        bestGap = gap;
        x = cx;
      }
    }
    this.crafts[slot] = newCraft(x, p.id);
    p.delivering = slot;
    p.pendingSpawn = false;
  }

  private stepCrafts(): void {
    const out = this.craftStep;
    for (let k = 0; k < MAX_CRAFTS; k++) {
      const c = this.crafts[k];
      if (!c) continue;
      // The passenger flies it; the autopilot covers whenever they let go.
      const pilot = c.passenger !== 255 ? this.players[c.passenger] : null;
      stepCraft(c, this.terrain, DT, out, pilot ? pilot.buttons : 0);
      if (c.thrust > 0.12) this.exhaust(c);
      if (out.release) this.releasePassenger(k, false);
      if (out.crashed) {
        this.destroyCraft(k, c.passenger !== 255 ? c.passenger : c.lastHitBy);
        continue;
      }
      if (out.impact > IMPACT_HARM_SPEED) {
        // A hard landing breaks whatever hit first: fins, engine bell, nose.
        this.hurtCraftPart(k, craftPartAt(c.parts, out.impactU, out.impactV), (out.impact - IMPACT_HARM_SPEED) * 1.2, NO_OWNER);
        if (!this.crafts[k]) continue;
      }
      if (out.gone) {
        this.crafts[k] = null;
        continue;
      }
      this.crush(c);
    }
  }

  /**
   * Rocket exhaust is part of the particle engine: real flames that burn
   * whoever is behind the nozzle, and a jet written into the air field along
   * the engine axis that blows clones and loose particles away.
   */
  private exhaust(c: Craft): void {
    const n = craftToWorld(c, 0, CRAFT_H / 2 + 1, this.pt);
    const dx = -Math.sin(c.a);
    const dy = Math.cos(c.a);
    const count = Math.ceil(c.thrust * 3);
    const owner = exhaustOwner(c);
    for (let i = 0; i < count; i++) {
      const s = 180 + 140 * c.thrust * this.rng.next();
      const j = this.rng.range(-40, 40);
      this.grains.spawn(PK.Flame, n.x + dy * this.rng.range(-2, 2), n.y - dx * this.rng.range(-2, 2), c.vx * 0.5 + dx * s + dy * j, c.vy * 0.5 + dy * s - dx * j, 10 + this.rng.int(8), 0, 0, owner);
    }
    this.grains.wind(n.x + dx * 16, n.y + dy * 16, 26, dx * 320 * c.thrust, dy * 320 * c.thrust);
  }

  /** Drop the passenger out of the hatch (or throw them out of a dying rocket). */
  private releasePassenger(slot: number, violent: boolean): void {
    const c = this.crafts[slot];
    if (!c || c.passenger === 255) return;
    const p = this.players[c.passenger];
    c.delivered = c.passenger;
    c.passenger = 255;
    if (!p || p.delivering !== slot) return;
    const pt = this.pt;
    if (violent) {
      // Blown out of the nose cone, away from the crater the wreck digs.
      craftToWorld(c, 0, -CRAFT_H / 2 - ACTOR_H / 2, pt);
      this.placeClone(p, pt.x - ACTOR_W / 2, pt.y - ACTOR_H / 2, c.vx + this.rng.range(-160, 160), Math.min(0, c.vy) - this.rng.range(120, 220));
      return;
    }
    // Step out of a side hatch, clear of the nozzle, keeping the rocket's motion.
    for (const side of [1, -1]) {
      craftToWorld(c, side * (CRAFT_W / 2 + ACTOR_W / 2 + 1), CRAFT_H / 2 - ACTOR_H / 2, pt);
      const x = Math.floor(pt.x - ACTOR_W / 2);
      const y = Math.floor(pt.y - ACTOR_H / 2);
      if (!this.terrain.rectSolid(x, y, x + ACTOR_W - 1, y + ACTOR_H - 1)) {
        this.placeClone(p, pt.x - ACTOR_W / 2, pt.y - ACTOR_H / 2, c.vx, c.vy);
        return;
      }
    }
    this.placeClone(p, c.x - ACTOR_W / 2, c.y - ACTOR_H / 2, c.vx, c.vy);
  }

  /** Shove a rocket at a world point: linear and angular. */
  private pushCraft(c: Craft, wx: number, wy: number, dvx: number, dvy: number): void {
    c.vx += dvx;
    c.vy += dvy;
    c.w += ((wx - c.x) * dvy - (wy - c.y) * dvx) / CRAFT_INERTIA;
  }

  /**
   * A penetrating hit at world (wx, wy) travelling along (dx, dy): it damages
   * the part it entered. Energy below the integrity only scratches.
   */
  private hitCraft(slot: number, wx: number, wy: number, dx: number, dy: number, energy: number, wound: number, by: number): void {
    const c = this.crafts[slot];
    if (!c) return;
    const l = craftToLocal(c, wx + dx * 2, wy + dy * 2, this.pt);
    const part = craftPartAt(c.parts, l.x, l.y);
    let dmg = energy > CRAFT_INTEGRITY ? wound : wound * 0.15;
    // No nose cone: the hull behind it is exposed.
    if (part === CraftPart.Hull && !hasCraftPart(c.parts, CraftPart.Nose)) dmg *= 1.3;
    this.hurtCraftPart(slot, part, dmg, by);
  }

  /** Damage one part; a part out of hit points is torn off, the hull going is the end. */
  private hurtCraftPart(slot: number, part: number, dmg: number, by: number): void {
    const c = this.crafts[slot];
    if (!c || dmg <= 0) return;
    if (by !== NO_OWNER && by !== 255) c.lastHitBy = by;
    if (part === CraftPart.Hull) c.hp -= dmg;
    else {
      c.hp -= Math.min(dmg, Math.max(0, c.partHp[part])) * 0.2; // shock through the frame
      c.partHp[part] -= dmg;
      if (c.partHp[part] <= 0 && hasCraftPart(c.parts, part)) this.detachCraftPart(slot, part);
    }
    c.partHp[CraftPart.Hull] = Math.max(0, c.hp);
    if (c.hp <= 0) this.destroyCraft(slot, c.lastHitBy);
  }

  /**
   * A part comes off: it flies away with the velocity of where it was on the
   * spinning hull, as heavy fragments in the particle engine (they maim and
   * settle as scrap), and the recoil spins the rocket.
   */
  private detachCraftPart(slot: number, part: number): void {
    const c = this.crafts[slot]!;
    c.parts &= ~(1 << part);
    c.partHp[part] = 0;
    const [u, v] = CRAFT_PART_CENTER[part];
    const pt = craftToWorld(c, u, v, this.pt);
    const rx = pt.x - c.x;
    const ry = pt.y - c.y;
    const d = Math.sqrt(rx * rx + ry * ry) + 1e-6;
    const vx = c.vx - c.w * ry + (rx / d) * 90;
    const vy = c.vy + c.w * rx + (ry / d) * 90 - 30;
    const x = pt.x;
    const y = pt.y;
    const seed = this.rng.nextU32();
    craftPartFragments(this.grains, x, y, vx, vy, c.lastHitBy === 255 ? NO_OWNER : c.lastHitBy, new Rng(seed));
    this.pushCraft(c, x, y, -(rx / d) * 25, -(ry / d) * 25);
    c.w += u > 0 ? -1.5 : u < 0 ? 1.5 : 0;
    const w = this.tmp.reset();
    w.u8(R_CRAFT_PART);
    w.u8(slot);
    w.u8(part);
    w.u16(clampU16(x));
    w.u16(clampU16(y + Y_BIAS));
    w.i16(clampI16(vx * VEL_SCALE));
    w.i16(clampI16(vy * VEL_SCALE));
    w.u32(seed);
    this.hits.push({ bytes: w.finish(), id: 0, x, y });
  }

  /** Blast overpressure: every part in reach takes damage, and the shove spins it. */
  private splashCrafts(x: number, y: number, r: number, dmg: number, owner: number): void {
    const pt = this.pt;
    for (let k = 0; k < MAX_CRAFTS; k++) {
      const c = this.crafts[k];
      if (!c) continue;
      if (Math.abs(c.x - x) > r + CRAFT_H || Math.abs(c.y - y) > r + CRAFT_H) continue;
      let nearest = Infinity;
      let nx = c.x;
      let ny = c.y;
      for (let part = 0; part < CRAFT_PARTS && this.crafts[k] === c; part++) {
        if (!hasCraftPart(c.parts, part)) continue;
        craftToWorld(c, CRAFT_PART_CENTER[part][0], CRAFT_PART_CENTER[part][1], pt);
        const d = Math.sqrt((pt.x - x) ** 2 + (pt.y - y) ** 2) - 3;
        if (d < nearest) {
          nearest = d;
          nx = pt.x;
          ny = pt.y;
        }
        if (d < r) this.hurtCraftPart(k, part, dmg * (1 - Math.max(0, d) / r) * (part === CraftPart.Hull ? 1 : 0.8), owner);
      }
      if (this.crafts[k] !== c || nearest >= r) continue;
      const dx = nx - x;
      const dy = ny - y;
      const dl = Math.sqrt(dx * dx + dy * dy) + 1e-6;
      const s = 50 * (1 - Math.max(0, nearest) / r);
      this.pushCraft(c, nx, ny, (dx / dl) * s, (dy / dl) * s);
    }
  }

  /**
   * A rocket blows apart: crater, blast wave, and heavy hull fragments thrown
   * into the particle engine (they maim, push the sand, and settle as scrap
   * metal). Anyone still aboard is thrown clear into the debris.
   */
  private destroyCraft(slot: number, by: number): void {
    const c = this.crafts[slot];
    if (!c) return;
    const owner = by === 255 ? NO_OWNER : by;
    const cx = c.x;
    const cy = c.y;
    const rider = c.passenger;
    this.releasePassenger(slot, true);
    this.crafts[slot] = null;
    const seed = this.rng.nextU32();
    const base = craftToWorld(c, 0, CRAFT_H / 3, this.pt);
    this.carve(base.x, base.y, 12, 5, 30, owner);
    this.grains.blast(cx, cy, 70, BLAST_IMPULSE * 1.3);
    craftFragments(this.grains, cx, cy, c.vx, c.vy, owner, new Rng(seed));
    this.splashTanks(cx, cy, 36, 60, owner);
    this.splashShips(cx, cy, 36, 60, owner);
    for (const p of this.players) {
      // The rider is thrown clear by the blast; its fragments can still find them.
      if (!p || !p.alive || this.shielded(p) || p.id === rider || this.friendly(owner, p)) continue;
      const dx = p.cx - cx;
      const dy = p.cy - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 36) {
        const res = this.strikeScratch;
        res.hp = 0;
        res.detached.length = 0;
        res.vital = false;
        const amt = 60 * (1 - d / 36);
        for (let part = 0; part < PART_COUNT; part++) {
          if (shareOf(p.parts.cls)[part] > 0 && has(p.parts.mask, part)) harm(p.parts, part, amt * shareOf(p.parts.cls)[part], res);
        }
        this.applyStrike(p, res, owner === NO_OWNER ? p.id : owner, W_CRAFT, cx, cy);
      }
    }
    const w = this.tmp.reset();
    w.u8(R_CRAFT_BOOM);
    w.u8(slot);
    w.u16(clampU16(cx));
    w.u16(clampU16(cy + Y_BIAS));
    w.i16(clampI16(c.vx * VEL_SCALE));
    w.i16(clampI16(c.vy * VEL_SCALE));
    w.u32(seed);
    this.hits.push({ bytes: w.finish(), id: 0, x: cx, y: cy });
  }

  /** A rocket slamming into a clone crushes it, credited to the rocket's passenger. */
  private crush(c: Craft): void {
    for (const p of this.players) {
      if (!p || !p.alive || p.tank >= 0 || p.id === c.passenger || p.id === c.delivered) continue;
      const b = p.body;
      const l = craftToLocal(c, p.cx, p.cy, this.pt);
      if (Math.abs(l.x) >= (CRAFT_W + ACTOR_W) / 2 || Math.abs(l.y) >= (CRAFT_H + ACTOR_H) / 2) continue;
      // Velocity of the hull where it meets the clone (spin included).
      const rx = p.cx - c.x;
      const ry = p.cy - c.y;
      const rvx = c.vx - c.w * ry - b.vx;
      const rvy = c.vy + c.w * rx - b.vy;
      const rs = Math.sqrt(rvx * rvx + rvy * rvy);
      // Shove out of the way either way; hurt when it hits hard.
      b.vx += (rx < 0 ? -1 : 1) * 60 + rvx * 0.5;
      b.vy += rvy * 0.5;
      if (rs < 90) continue;
      const by = c.passenger !== 255 ? c.passenger : c.lastHitBy !== 255 ? c.lastHitBy : p.id;
      if (this.friendly(by, p)) continue;
      const res = this.strikeScratch;
      res.hp = 0;
      res.detached.length = 0;
      res.vital = false;
      harm(p.parts, Part.Head, rs * 0.12, res);
      harm(p.parts, Part.Torso, rs * 0.18, res);
      this.applyStrike(p, res, by, W_CRAFT, p.cx, b.y);
    }
  }

  // ---------------------------------------------------------------- tanks

  /** Drop `n` tanks by parachute at spread-out spots across the map. */
  dropTanks(n: number): void {
    for (let i = 0; i < n; i++) {
      const slot = this.tanks.indexOf(null);
      if (slot < 0) return;
      let x = 120;
      let bestGap = -1;
      for (let a = 0; a < 16; a++) {
        const cx = 120 + this.rng.int(WORLD_W - 240 - TANK_W);
        let gap = Infinity;
        for (const t of this.tanks) if (t) gap = Math.min(gap, Math.abs(t.x - cx));
        if (gap > bestGap) {
          bestGap = gap;
          x = cx;
        }
      }
      // (One in three a mole.)
      this.tanks[slot] = this.rng.next() < 1 / 3 ? newMole(x, -TANK_H - 40 - this.rng.int(160)) : newTank(x, -TANK_H - 40 - this.rng.int(160));
    }
  }

  /**
   * Whose side a vehicle is on, for riding it: a tank its driver's, a
   * watchdog or tarantula its owner's. May `p` ride on it? A teammate's,
   * yes; without teams (free for all), only its own watchdog or tarantula.
   * An empty tank nobody's side (climb in instead).
   */
  surfable(p: Player, t: Tank): boolean {
    if (t.chute) return false;
    const who = isPet(t) ? t.owner : t.pilot;
    if (who === 255 || who === p.id) return who === p.id && isPet(t);
    const o = this.players[who];
    return !!o && p.team !== Team.None && o.team === p.team;
  }

  /** Riders on vehicle `slot` (by seat), for a free seat. */
  private ridersOf(slot: number): Player[] {
    const out: Player[] = [];
    for (const o of this.players) if (o && o.alive && o.surf === slot) out.push(o);
    return out;
  }

  /**
   * Tank surfing: up onto a friendly vehicle within reach, into the free
   * seat on it nearest the clone (a watchdog carries two, a tank three, a
   * tarantula five).
   */
  mount(p: Player): boolean {
    if (p.tank >= 0 || p.pilot >= 0 || p.rc >= 0) return false;
    const b = p.body;
    let best = -1;
    let bestSeat = 0;
    let bestD = Infinity;
    // Dropships first: their roofs, three seats each, for a clone that's got up to one.
    for (let k = 0; k < MAX_SHIPS; k++) {
      const sh = this.ships[k];
      if (!sh || !this.shipSurfable(p, sh)) continue;
      const taken = this.shipRidersOf(k).map((o) => o.seat);
      for (let i = 0; i < SHIP_RIDERS; i++) {
        if (taken.includes(i)) continue;
        const s = shipSeat(sh, i, this.pt);
        const d = Math.abs(s.x - p.cx) + Math.abs(s.y - (b.y + ACTOR_H)) * 0.5;
        if (d < SHIP_SURF_REACH && d < bestD) {
          bestD = d;
          best = k;
          bestSeat = i;
        }
      }
    }
    if (best >= 0) {
      p.surfShip = best;
      p.seat = bestSeat;
      p.body.stance = 0;
      this.seatShipRider(p, this.ships[best]!);
      return true;
    }
    for (let k = 0; k < MAX_TANKS; k++) {
      const t = this.tanks[k];
      if (!t || !this.surfable(p, t)) continue;
      const dx = Math.max(t.x - (b.x + ACTOR_W), 0, b.x - (t.x + tankW(t)));
      const dy = Math.max(t.y - (b.y + ACTOR_H), 0, b.y - (t.y + tankH(t)));
      if (dx > SURF_REACH || dy > SURF_REACH) continue;
      const taken = this.ridersOf(k).map((o) => o.seat);
      for (let i = 0; i < surfCapacity(t); i++) {
        if (taken.includes(i)) continue;
        const s = surfSeat(t, i, this.pt);
        const d = Math.abs(s.x - p.cx) + Math.abs(s.y - (b.y + ACTOR_H)) * 0.5;
        if (d < bestD) {
          bestD = d;
          best = k;
          bestSeat = i;
        }
      }
    }
    if (best < 0) return false;
    p.surf = best;
    p.seat = bestSeat;
    p.body.stance = 0;
    this.seatRider(p, this.tanks[best]!);
    return true;
  }

  /** Off the vehicle: a hop clear (`jump`), or just let go (it's gone). */
  dismount(p: Player, jump: boolean): void {
    const t = p.surf >= 0 ? this.tanks[p.surf] : p.surfShip >= 0 ? this.ships[p.surfShip] : null;
    p.surf = -1;
    p.surfShip = -1;
    const b = p.body;
    b.onGround = false;
    if (t) {
      b.vx = t.vx;
      b.vy = Math.min(0, t.vy);
    }
    if (jump) b.vy -= 190;
  }

  /** May `p` ride on dropship `sh`? Its caller, or (with teams) its side. */
  shipSurfable(p: Player, sh: Ship): boolean {
    return !sh.leaving && (sh.owner === p.id || (p.team !== Team.None && sh.team === p.team));
  }

  /** Riders on dropship `slot`. */
  private shipRidersOf(slot: number): Player[] {
    const out: Player[] = [];
    for (const o of this.players) if (o && o.alive && o.surfShip === slot) out.push(o);
    return out;
  }

  private seatShipRider(p: Player, sh: Ship): void {
    const s = shipSeat(sh, p.seat, this.pt);
    const b = p.body;
    b.x = s.x - ACTOR_W / 2;
    b.y = s.y - ACTOR_H;
    b.vx = sh.vx;
    b.vy = sh.vy;
    b.onGround = true;
    b.jetting = false;
  }

  private seatRider(p: Player, t: Tank): void {
    const s = surfSeat(t, p.seat, this.pt);
    const b = p.body;
    b.x = s.x - ACTOR_W / 2;
    b.y = s.y - ACTOR_H;
    b.vx = t.vx;
    b.vy = t.vy;
    b.onGround = true;
    b.jetting = false;
  }

  /** Does a bunker door of `team`'s open for a clone of `who`'s? (Anyone's, in a mode without teams.) */
  doorOpensFor(team: number, who: number): boolean {
    return who === Team.None || who === team;
  }

  /**
   * The bunkers' steel doors slide up (from the bottom, two rows a tick)
   * while one of their own side is near, and back down once none is and
   * nothing stands in the doorway. Door steel never carves: a door takes
   * damage instead (damageDoor) and blows out once it's had a tank's worth,
   * near enough.
   */
  private stepDoors(): void {
    const RATE = 2;
    const REACH = 22;
    for (const d of this.doors) {
      if (d.broken) continue;
      const h = d.y1 - d.y0;
      const cx = (d.x0 + d.x1) / 2;
      let wanted = false;
      let blocked = false;
      for (const p of this.players) {
        if (!p || !p.alive) continue;
        const b = p.body;
        if (b.y > d.y1 + 8 || b.y + ACTOR_H < d.y0 - 8) continue;
        if (Math.abs(b.x + ACTOR_W / 2 - cx) < REACH && this.doorOpensFor(d.team, p.team)) wanted = true;
        if (b.x + ACTOR_W > d.x0 - 1 && b.x < d.x1 + 1) blocked = true;
      }
      for (const t of this.tanks) {
        if (t && t.x + tankW(t) > d.x0 - 1 && t.x < d.x1 + 1 && t.y < d.y1 && t.y + tankH(t) > d.y0) blocked = true;
      }
      if (wanted && d.open < h) {
        for (let k = 0; k < RATE && d.open < h; k++, d.open++) {
          const y = d.y1 - d.open - 1;
          for (let x = d.x0; x < d.x1; x++) this.deposit(x, y, Mat.Air);
        }
      } else if (!wanted && !blocked && d.open > 0) {
        for (let k = 0; k < RATE && d.open > 0; k++) {
          const y = d.y1 - d.open;
          // (Not onto anything that's come to rest in the doorway.)
          let clear = true;
          for (let x = d.x0; x < d.x1; x++) if (this.terrain.mat[y * WORLD_W + x] !== Mat.Air) clear = false;
          if (!clear) break; // (jammed)
          for (let x = d.x0; x < d.x1; x++) this.deposit(x, y, Mat.Door);
          d.open--;
        }
      }
    }
  }

  /** The door whose cells (padded by `pad`) hold (x, y), or null. */
  private doorAt(x: number, y: number, pad: number): (typeof this.doors)[number] | null {
    for (const d of this.doors) if (!d.broken && x >= d.x0 - pad && x < d.x1 + pad && y >= d.y0 - pad && y < d.y1 + pad) return d;
    return null;
  }

  /** Harm a door; out of hit points, it blows out. */
  private damageDoor(d: (typeof this.doors)[number], dmg: number, by: number): void {
    if (d.broken || dmg <= 0) return;
    d.hp -= dmg;
    if (d.hp > 0) return;
    // Blown out: what's left of its steel turns to scrap and goes in two
    // blasts (logged after the pixels, so replicas see the same order),
    // taking a bite of the wall above it.
    d.broken = true;
    for (let y = d.y0; y < d.y1; y++) for (let x = d.x0; x < d.x1; x++) if (this.terrain.mat[y * WORLD_W + x] === Mat.Door) this.deposit(x, y, Mat.Metal);
    this.flushPixels();
    const cx = (d.x0 + d.x1) >> 1;
    this.carve(cx, d.y0 + 9, 13, 13, 40, by);
    this.carve(cx, d.y1 - 9, 12, 12, 30, by);
  }

  /** A blast's overpressure on the doors near it (as on a tank's hull). */
  private splashDoors(x: number, y: number, r: number, dmg: number, by: number): void {
    for (const d of this.doors) {
      if (d.broken) continue;
      const nx = Math.max(d.x0, Math.min(x, d.x1));
      const ny = Math.max(d.y0, Math.min(y, d.y1));
      const dist = Math.hypot(nx - x, ny - y);
      if (dist < r) this.damageDoor(d, dmg * 1.5 * (1 - dist / r), by);
    }
  }

  /** Every rider onto its seat, wherever its vehicle went this tick; thrown off if it's gone (or no longer friendly). */
  private seatRiders(): void {
    for (const p of this.players) {
      if (p && p.surfShip >= 0) {
        // On a dropship's roof: carried wherever it flies; thrown off if it's gone, going home, or no longer friendly.
        const sh = this.ships[p.surfShip];
        if (!p.alive || !sh || !this.shipSurfable(p, sh) || p.tank >= 0) {
          this.dismount(p, false);
          continue;
        }
        this.seatShipRider(p, sh);
        p.camX = p.cx;
        p.camY = p.cy;
        continue;
      }
      if (!p || p.surf < 0) continue;
      const t = this.tanks[p.surf];
      if (!p.alive || !t || !this.surfable(p, t) || p.tank >= 0) {
        this.dismount(p, !!t);
        continue;
      }
      this.seatRider(p, t);
      p.camX = p.cx;
      p.camY = p.cy;
    }
  }

  /** Climb into an empty, landed tank within reach. */
  private boardTank(p: Player): boolean {
    const b = p.body;
    for (let k = 0; k < MAX_TANKS; k++) {
      const t = this.tanks[k];
      if (!t || t.pilot !== 255 || t.chute || isPet(t)) continue;
      const dx = Math.max(t.x - (b.x + ACTOR_W), 0, b.x - (t.x + tankW(t)));
      const dy = Math.max(t.y - (b.y + ACTOR_H), 0, b.y - (t.y + tankH(t)));
      if (dx > BOARD_REACH || dy > BOARD_REACH) continue;
      t.pilot = p.id;
      p.tank = k;
      p.reloadLeft = 0;
      this.syncPilot(p, t);
      return true;
    }
    return false;
  }

  /** Out of the tank: through the roof hatch (or beside it) when climbing out; just gone when killed. */
  private leaveTank(p: Player, climbOut: boolean): void {
    p.surf = -1;
    const t = p.tank >= 0 ? this.tanks[p.tank] : null;
    p.tank = -1;
    if (!t) return;
    if (t.pilot === p.id) t.pilot = 255;
    if (!climbOut) return;
    const spots = [
      [t.x + tankW(t) / 2 - ACTOR_W / 2, t.y - ACTOR_H - 1],
      [t.x - ACTOR_W - 1, t.y + tankH(t) - ACTOR_H - 1],
      [t.x + tankW(t) + 1, t.y + tankH(t) - ACTOR_H - 1],
    ];
    let [x, y] = spots[0];
    for (const [sx, sy] of spots) {
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      if (!this.terrain.rectSolid(ix, iy, ix + ACTOR_W - 1, iy + ACTOR_H - 1)) {
        x = sx;
        y = sy;
        break;
      }
    }
    const b = p.body;
    b.x = x;
    b.y = y;
    b.vx = t.vx;
    b.vy = Math.min(0, t.vy) - 140;
    b.onGround = false;
  }

  /** The driver rides inside: its clone (and its view) go wherever the tank goes. */
  private syncPilot(p: Player, t: Tank): void {
    const b = p.body;
    // Under the shield, inside; with it blown off, head and shoulders out of the hatch.
    const exposed = !hasTankPart(t.parts, TankPart.Shield);
    if (exposed) {
      // Head and shoulders out of the hatch, wherever the tilted hull puts it.
      const hatch = tankPoint(t, 13.5, EXPOSED_SEAT_Y + EXPOSED_H / 2, this.pt);
      b.x = hatch.x - ACTOR_W / 2;
      b.y = hatch.y - EXPOSED_H / 2;
    } else {
      b.x = t.x + tankW(t) / 2 - ACTOR_W / 2;
      b.y = t.y + 2;
    }
    b.vx = t.vx;
    b.vy = t.vy;
    b.onGround = t.onGround;
    p.camX = t.x + tankW(t) / 2;
    p.camY = t.y + tankH(t) / 2;
  }

  /**
   * A vehicle held up by a speck of terrain grinds it away. A few stray
   * cells in its path that it can't climb, a few over its hull when it
   * jets up into them, or a few floating cells it's left perched on (air
   * under them) are crushed out of its way. Nothing that won't yield
   * (bedrock, doors, the ancient cement, iron), and only ever a speck
   * (TANK_SPECK cells): a real wall or hill still stops it.
   */
  private crushSpecks(t: Tank, buttons: number, x0: number): void {
    const terrain = this.terrain;
    const w = tankW(t);
    const h = tankH(t);
    const ix = Math.floor(t.x);
    const iy = Math.floor(t.y);
    const cells: number[] = [];
    // (Whether every solid cell in the strip can go, and gathers them; false if any can't, or there are too many.)
    const strip = (x0s: number, y0s: number, x1s: number, y1s: number, under = false): boolean => {
      cells.length = 0;
      for (let y = y0s; y <= y1s; y++) {
        for (let x = x0s; x <= x1s; x++) {
          if (!terrain.isSolid(x, y)) continue;
          const m = terrain.get(x, y);
          if (MAT_FIXED[m] || MAT_ADAMANT[m] || MAT_TOUGH[m]) return false;
          // (Perched on: only cells with air under them, not the top of a hill.)
          if (under && (terrain.isSolid(x, y + 1) || terrain.isSolid(x, y + 2))) return false;
          cells.push(x, y);
          if (cells.length > TANK_SPECK * 2) return false;
        }
      }
      return cells.length > 0;
    };
    const dir = (buttons & BTN_RIGHT ? 1 : 0) - (buttons & BTN_LEFT ? 1 : 0);
    let hit = false;
    // Driving into it and getting nowhere.
    if (dir !== 0 && Math.abs(t.x - x0) < 0.05) hit = dir > 0 ? strip(ix + w, iy, ix + w + 2, iy + h - 1) : strip(ix - 3, iy, ix - 1, iy + h - 1);
    // Jetting up into it.
    if (!hit && buttons & BTN_UP && t.vy === 0 && !t.onGround) hit = strip(ix, iy - 2, ix + w - 1, iy - 1);
    // Perched on a few floating cells.
    if (!hit && t.onGround) hit = strip(ix, iy + h, ix + w - 1, iy + h, true) && cells.length <= TANK_PERCH * 2;
    if (!hit) return;
    for (let i = 0; i < cells.length; i += 2) if (terrain.isSolid(cells[i], cells[i + 1])) this.carve(cells[i], cells[i + 1], 1, 1, 2, t.pilot);
  }

  private stepTanks(): void {
    for (let k = 0; k < MAX_TANKS; k++) {
      const t = this.tanks[k];
      if (!t) continue;
      let pilot = t.pilot !== 255 ? this.players[t.pilot] : null;
      if (pilot && (!pilot.alive || (pilot.tank !== k && pilot.rc !== k))) {
        if (pilot.rc === k) pilot.rc = -1;
        t.pilot = 255;
        pilot = null;
      }
      // A watchdog (or a tarantula) whose owner is gone shuts down.
      if (isPet(t) && !this.players[t.owner]) {
        this.destroyTank(k, 255);
        continue;
      }
      // A watchdog with nobody at the remote drives itself.
      const brain = !pilot && isPet(t) && !t.chute ? this.dogBrain(k, t) : null;
      const buttons = pilot ? pilot.buttons : brain ? brain.buttons : 0;
      // (stepTank only takes a driver's buttons: the watchdog's brain counts as one.)
      if (brain) t.pilot = t.owner;
      const x0 = t.x;
      const impact = stepTank(t, this.terrain, DT, buttons);
      if (brain) t.pilot = 255;
      if (!isSpider(t) && !t.chute) this.crushSpecks(t, buttons, x0);
      if (t.y > WORLD_H) {
        this.destroyTank(k, t.lastHitBy);
        continue;
      }
      if (pilot) {
        t.aim = dequantizeAim(pilot.aimQ);
        t.faceLeft = Math.cos(t.aim) < 0;
      } else if (brain) {
        t.aim = brain.aim;
        t.faceLeft = Math.cos(t.aim) < 0;
      }
      // Who its guns fire for: the driver, or (on its own) the watchdog's owner.
      const gunner = pilot ? pilot.id : brain ? t.owner : -1;
      // Guns: the vulcan on fire, the cannon on right mouse / Shift.
      // Cooldowns carry fractions so the rates are exact on average.
      t.firedSmg = t.firedCannon = false;
      t.smgCd -= DT;
      t.cannonCd -= DT;
      const spider = isSpider(t);
      const mole = isMole(t);
      if (gunner >= 0 && buttons & BTN_FIRE && hasTankPart(t.parts, TankPart.Smg)) {
        // (A tarantula's is its laser: a beam a fifth of a second.)
        while (t.smgCd <= 0) {
          if (spider) this.spiderBeam(t, gunner);
          else this.tankShot(t, gunner, false);
          t.smgCd += spider ? SPIDER_LASER_INTERVAL : mole ? MOLE_SMG_INTERVAL : SMG_INTERVAL;
        }
      }
      if (gunner >= 0 && buttons & BTN_SCOPE && hasTankPart(t.parts, TankPart.Cannon) && t.cannonCd <= 0) {
        // (A tarantula's rack: missiles for as long as it's held. A mole's flamethrower: plasma, likewise.)
        this.tankShot(t, gunner, true);
        t.cannonCd += spider ? SPIDER_MISSILE_INTERVAL : mole ? MOLE_PLASMA_INTERVAL : CANNON_INTERVAL * (isDog(t) ? 1.3 : 1);
      }
      t.smgCd = Math.max(0, t.smgCd);
      t.cannonCd = Math.max(0, t.cannonCd);
      if (t.jetting) this.tankJets(t);
      this.tankCrush(t, impact, pilot ? pilot.id : isPet(t) ? t.owner : t.lastHitBy);
      if (pilot && pilot.tank === k) this.syncPilot(pilot, t);
    }
  }

  /** What each watchdog remembers between ticks (by tank slot). */
  private readonly dogMem = new Map<number, DogMemory>();
  private readonly dogFoes: DogFoe[] = [];

  /** A watchdog thinking for itself (watchdog.ts): its owner, and the hostiles about. */
  private dogBrain(k: number, t: Tank): { buttons: number; aim: number } {
    let mem = this.dogMem.get(k);
    if (!mem) this.dogMem.set(k, (mem = newDogMemory()));
    const owner = this.players[t.owner];
    const foes = this.dogFoes;
    foes.length = 0;
    const team = owner?.team ?? Team.None;
    const foe = (id: number, tm: number) => id !== t.owner && !(team !== Team.None && tm === team);
    const cx = t.x + tankW(t) / 2;
    const cy = t.y + tankH(t) / 2;
    const near = (x: number, y: number) => Math.abs(x - cx) < 700 && Math.abs(y - cy) < 500;
    for (const p of this.players) {
      if (!p || !p.alive || p.tank >= 0 || p.delivering >= 0 || !foe(p.id, p.team) || this.shielded(p) || !near(p.cx, p.cy)) continue;
      foes.push({ x: p.cx, y: p.cy, vx: p.body.vx, vy: p.body.vy, vehicle: false });
    }
    for (const o of this.tanks) {
      if (!o || o === t || o.chute) continue;
      const who = o.pilot !== 255 ? o.pilot : o.owner;
      if (who === 255 || !foe(who, this.players[who]?.team ?? Team.None)) continue;
      const ox = o.x + tankW(o) / 2;
      const oy = o.y + tankH(o) / 2;
      if (near(ox, oy)) foes.push({ x: ox, y: oy, vx: o.vx, vy: o.vy, vehicle: true });
    }
    for (const sh of this.ships) {
      if (!sh || sh.leaving || !foe(sh.owner, sh.team)) continue;
      const sx = sh.x + SHIP_W / 2;
      const sy = sh.y + SHIP_H / 2;
      if (near(sx, sy)) foes.push({ x: sx, y: sy, vx: sh.vx, vy: sh.vy, vehicle: true });
    }
    return dogThink(t, mem, owner ? { cx: owner.cx, cy: owner.cy, alive: owner.alive } : null, foes, (x0, y0, x1, y1) => this.lineClear(x0, y0, x1, y1), isSpider(t) ? SPIDER_KIT : DOG_KIT, (x, y) => this.terrain.isSolid(x, y));
  }

  /** Is the straight line between two points free of terrain? */
  private lineClear(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const n = Math.ceil(Math.hypot(dx, dy) / 2);
    for (let i = 2; i < n; i++) if (this.terrain.isSolid(Math.floor(x0 + (dx * i) / n), Math.floor(y0 + (dy * i) / n))) return false;
    return true;
  }

  private tankShot(t: Tank, owner: number, cannon: boolean): void {
    let m = tankMuzzle(t, cannon, t.aim, this.tankMz);
    // Locked on by its driver: set true on the target (vehicleAim), at this gun's speed and drop.
    const shot = isSpider(t) ? ProjKind.SpiderMissile : isMole(t) ? (cannon ? ProjKind.Plasma : ProjKind.MoleRound) : cannon ? ProjKind.Shell : ProjKind.TankBullet;
    const shotSpeed = isSpider(t) ? SPIDER_MISSILE_SPEED : isMole(t) ? (cannon ? PLASMA_SPEED : SMG_SPEED) : cannon ? CANNON_SPEED : SMG_SPEED;
    const carry = isMole(t) && cannon ? 0.5 : isSpider(t) ? 0 : 0.25;
    const set = this.vehicleAim(owner, t, cannon, m.a, shotSpeed, GRAVITY * PROJ[shot].gravity, t.vx * carry, t.vy * carry);
    // (The barrel swung onto it: the shot leaves from where its muzzle is now.)
    if (set !== m.a) m = tankMuzzle(t, cannon, set, this.tankMz);
    // Locked on, the gunner holds it steady: half the spread, as a braced clone's.
    const steady = this.lockedBy(owner) ? 0.5 : 1;
    if (isSpider(t)) {
      // A missile off the rack, from one tube or the other (they take turns), a little ragged.
      const a = m.a + (this.rng.next() - 0.5) * 0.06 * steady;
      const side = (t.tube = (t.tube ?? 0) ^ 1) ? 1 : -1;
      const ox = -Math.sin(m.a) * side * 2.2;
      const oy = Math.cos(m.a) * side * 2.2;
      this.spawnProj(this.nextProjId++, ProjKind.SpiderMissile, owner, m.x + ox, m.y + oy, Math.cos(a) * SPIDER_MISSILE_SPEED, Math.sin(a) * SPIDER_MISSILE_SPEED);
      t.firedCannon = true;
      return;
    }
    if (isMole(t)) {
      if (cannon) {
        // A gout of plasma, a little ragged, carried along with the hull.
        const a = m.a + (this.rng.next() - 0.5) * 0.16 * steady;
        const sp = PLASMA_SPEED * (0.92 + this.rng.next() * 0.16);
        this.spawnProj(this.nextProjId++, ProjKind.Plasma, owner, m.x, m.y, Math.cos(a) * sp + t.vx * 0.5, Math.sin(a) * sp + t.vy * 0.5);
        t.firedCannon = true;
      } else {
        const a = m.a + (this.rng.next() - 0.5) * 2 * SMG_SPREAD * 0.8 * steady;
        this.spawnProj(this.nextProjId++, ProjKind.MoleRound, owner, m.x, m.y, Math.cos(a) * SMG_SPEED + t.vx * 0.25, Math.sin(a) * SMG_SPEED + t.vy * 0.25);
        t.firedSmg = true;
      }
      return;
    }
    const a = m.a + (this.rng.next() - 0.5) * 2 * (cannon ? 0.01 : SMG_SPREAD) * steady;
    const speed = cannon ? CANNON_SPEED : SMG_SPEED;
    this.spawnProj(this.nextProjId++, cannon ? ProjKind.Shell : ProjKind.TankBullet, owner, m.x, m.y, Math.cos(a) * speed + t.vx * 0.25, Math.sin(a) * speed + t.vy * 0.25);
    if (cannon) {
      t.vx -= Math.cos(a) * 30; // recoil
      t.w += t.faceLeft ? 1.4 : -1.4; // and the nose kicks up
      t.firedCannon = true;
    } else t.firedSmg = true;
  }

  /** Lift-jet flames under the hull (they burn whoever is beneath) and a downdraft. */
  private tankJets(t: Tank): void {
    const owner = t.pilot !== 255 ? t.pilot : t.owner !== 255 ? t.owner : NO_OWNER;
    const inset = Math.round(7 * t.s);
    for (const lx of [inset, tankW(t) - inset]) {
      const x = t.x + lx;
      const y = t.y + tankH(t) + 1;
      for (let i = 0; i < 2; i++) {
        this.grains.spawn(PK.Flame, x + this.rng.range(-2, 2), y, t.vx * 0.5 + this.rng.range(-30, 30), t.vy * 0.5 + 200 + this.rng.range(0, 120), 8 + this.rng.int(6), 0, 0, owner);
      }
    }
    this.grains.wind(t.x + tankW(t) / 2, t.y + tankH(t) + 14, 24, 0, 260);
  }

  /** Clones in the tank's way are shoved aside; one it lands on is crushed. */
  private tankCrush(t: Tank, impact: number, by: number): void {
    for (const p of this.players) {
      if (!p || !p.alive || p.tank >= 0 || p.surf >= 0 || p.surfShip >= 0) continue;
      // A watchdog slips past its own owner (and its owner's side) rather than shoving them about.
      if (isPet(t) && (p.id === t.owner || (p.team !== Team.None && p.team === this.players[t.owner]?.team))) continue;
      const b = p.body;
      if (b.x + ACTOR_W < t.x - 1 || b.x > t.x + tankW(t) + 1 || b.y + ACTOR_H < t.y - 1 || b.y > t.y + tankH(t) + 1) continue;
      const side = p.cx < t.x + tankW(t) / 2 ? -1 : 1;
      b.vx += side * 70 + t.vx * 0.5;
      if (impact > 90 && p.cy > t.y + tankH(t) / 2) {
        const who = by === 255 ? p.id : by;
        if (!this.friendly(who, p)) this.damage(p, (impact - 60) * 0.9, who, W_TANK);
      }
    }
  }

  /** A driver under an intact shield: nothing can reach him but the tank. */
  private shielded(p: Player): boolean {
    if (p.tank < 0) return false;
    const t = this.tanks[p.tank];
    return !t || hasTankPart(t.parts, TankPart.Shield);
  }

  /** Is a hit by `by` on this tank friendly fire (its driver is a teammate)? */
  private friendlyTank(by: number, t: Tank): boolean {
    // A watchdog is its owner's (whoever is at the remote).
    const id = isPet(t) ? t.owner : t.pilot;
    const d = id !== 255 ? this.players[id] : null;
    return !!d && (by === d.id ? isPet(t) : this.friendly(by, d));
  }

  /**
   * A penetrating hit at world (wx, wy) travelling along (dx, dy): it damages
   * the part it struck. Energy below the integrity only scratches the paint.
   */
  private hitTank(slot: number, wx: number, wy: number, dx: number, dy: number, energy: number, wound: number, by: number): void {
    const t = this.tanks[slot];
    if (!t || this.friendlyTank(by, t)) return;
    // Into the hull's own (tilted) frame to find the part.
    const l = tankLocal(t, wx + dx * 2, wy + dy * 2, this.pt);
    const part = tankPartAt(t, l.x, l.y);
    this.hurtTankPart(slot, part, energy > TANK_INTEGRITY ? wound : wound * 0.2, by);
  }

  /** Damage one part; a part out of hit points is blown off, the hull going is the end. */
  private hurtTankPart(slot: number, part: number, dmg: number, by: number): void {
    const t = this.tanks[slot];
    if (!t || dmg <= 0) return;
    if (by !== NO_OWNER && by !== 255) t.lastHitBy = by;
    if (part === TankPart.Hull) t.hp -= dmg;
    else {
      t.hp -= dmg * 0.1; // shock through the frame
      t.partHp[part] -= dmg;
      if (t.partHp[part] <= 0 && hasTankPart(t.parts, part)) this.detachTankPart(slot, part);
    }
    t.partHp[TankPart.Hull] = Math.max(0, t.hp);
    if (t.hp <= 0) this.destroyTank(slot, t.lastHitBy);
  }

  /** Blast overpressure: explosives are what armour fears. The plate takes half while it lasts. */
  private splashTanks(x: number, y: number, r: number, dmg: number, owner: number): void {
    const pt = this.pt;
    for (let k = 0; k < MAX_TANKS; k++) {
      const t = this.tanks[k];
      if (!t || this.friendlyTank(owner, t)) continue;
      const nx = Math.max(t.x, Math.min(x, t.x + tankW(t)));
      const ny = Math.max(t.y, Math.min(y, t.y + tankH(t)));
      const d = Math.hypot(nx - x, ny - y);
      if (d >= r) continue;
      const amt = dmg * 1.5 * (1 - d / r);
      for (const part of [TankPart.Cannon, TankPart.Smg, TankPart.Shield]) {
        if (!hasTankPart(t.parts, part)) continue;
        const c = partCenter(t, part);
        tankPoint(t, c[0], c[1], pt);
        const dp = Math.hypot(pt.x - x, pt.y - y);
        if (dp < r) this.hurtTankPart(k, part, dmg * (1 - dp / r), owner);
        if (this.tanks[k] !== t) break;
      }
      if (this.tanks[k] !== t) continue;
      if (hasTankPart(t.parts, TankPart.Armor)) {
        this.hurtTankPart(k, TankPart.Armor, amt * 0.5, owner);
        this.hurtTankPart(k, TankPart.Hull, amt * 0.5, owner);
      } else this.hurtTankPart(k, TankPart.Hull, amt, owner);
      if (this.tanks[k] !== t) continue;
      const dl = d + 1e-6;
      const s = 40 * (1 - d / r);
      t.vx += ((nx - x) / dl) * s;
      t.vy += ((ny - y) / dl) * s;
      // Off-centre blasts rock the hull (torque about the tread line).
      const rx = nx - (t.x + tankW(t) / 2);
      const ry = ny - (t.y + tankH(t));
      t.w += ((rx * (ny - y) - ry * (nx - x)) / dl) * s * 0.004;
    }
  }

  /** A part flies off as heavy scrap (real fragments in the particle engine). */
  private detachTankPart(slot: number, part: number): void {
    const t = this.tanks[slot]!;
    t.parts &= ~(1 << part);
    t.partHp[part] = 0;
    const c = partCenter(t, part);
    const pt = tankPoint(t, c[0], c[1], this.pt);
    const x = pt.x;
    const y = pt.y;
    const out = (x - (t.x + tankW(t) / 2)) >= 0 ? 1 : -1;
    const vx = t.vx + out * (60 + this.rng.range(0, 60));
    const vy = t.vy - 120 - this.rng.range(0, 60);
    const seed = this.rng.nextU32();
    craftPartFragments(this.grains, x, y, vx, vy, t.lastHitBy === 255 ? NO_OWNER : t.lastHitBy, new Rng(seed));
    const w = this.tmp.reset();
    w.u8(R_TANK_PART);
    w.u8(slot);
    w.u8(part);
    w.u16(clampU16(x));
    w.u16(clampU16(y + Y_BIAS));
    w.i16(clampI16(vx * VEL_SCALE));
    w.i16(clampI16(vy * VEL_SCALE));
    w.u32(seed);
    this.hits.push({ bytes: w.finish(), id: 0, x, y });
  }

  /** The hull gives: the tank explodes, and its driver goes with it. */
  private destroyTank(slot: number, by: number): void {
    const t = this.tanks[slot];
    if (!t) return;
    this.tanks[slot] = null;
    const owner = by === 255 ? NO_OWNER : by;
    const cx = t.x + tankW(t) / 2;
    const cy = t.y + tankH(t) / 2;
    const driver = t.pilot !== 255 ? this.players[t.pilot] : null;
    t.pilot = 255;
    this.dogMem.delete(slot);
    if (driver && driver.rc === slot) driver.rc = -1; // at the remote, far away: the clone is fine
    else if (driver) {
      driver.tank = -1;
      this.damage(driver, 999, by === 255 ? driver.id : by, W_TANK, false, true);
    }
    const seed = this.rng.nextU32();
    this.carve(cx, cy + tankH(t) / 3, 18, 8, 40, owner);
    this.grains.blast(cx, cy, 90, BLAST_IMPULSE * 1.5);
    const rng = new Rng(seed);
    craftFragments(this.grains, cx, cy, t.vx, t.vy, owner, rng);
    craftFragments(this.grains, cx, cy, t.vx, t.vy, owner, rng);
    this.splashCrafts(cx, cy, 48, 80, owner);
    this.splashTanks(cx, cy, 48, 80, owner);
    this.splashShips(cx, cy, 48, 80, owner);
    for (const p of this.players) {
      if (!p || !p.alive || p.tank >= 0 || this.friendly(owner, p)) continue;
      const d = Math.hypot(p.cx - cx, p.cy - cy);
      if (d >= 48) continue;
      const res = this.strikeScratch;
      res.hp = 0;
      res.detached.length = 0;
      res.vital = false;
      const amt = 80 * (1 - d / 48);
      for (let part = 0; part < PART_COUNT; part++) {
        if (shareOf(p.parts.cls)[part] > 0 && has(p.parts.mask, part)) harm(p.parts, part, amt * shareOf(p.parts.cls)[part], res);
      }
      this.applyStrike(p, res, owner === NO_OWNER ? p.id : owner, W_TANK, cx, cy);
    }
    const w = this.tmp.reset();
    w.u8(R_TANK_BOOM);
    w.u8(slot);
    w.u16(clampU16(cx));
    w.u16(clampU16(cy + Y_BIAS));
    w.i16(clampI16(t.vx * VEL_SCALE));
    w.i16(clampI16(t.vy * VEL_SCALE));
    w.u32(seed);
    this.hits.push({ bytes: w.finish(), id: 0, x: cx, y: cy });
  }

  // ---------------------------------------------------------------- radio and dropships

  /**
   * A radio call: a dropship for air support, or a tank parachuted onto the
   * caller, for CALL_COST gold. The caller must have the radio in hand;
   * each radio then needs a while to recharge.
   */
  call(id: number, kind: number): boolean {
    if (kind === CallKind.Pilot || kind === CallKind.PilotBack) return this.togglePilot(id, kind === CallKind.PilotBack);
    const p = this.players[id];
    const cost = callCost(kind);
    if (!p || !p.alive || p.tank >= 0 || p.weapon !== WeaponId.Radio || p.callCd > 0 || p.gold < cost) return false;
    // (Extermination: only so many vehicles about at once.)
    if (this.exterminationLive && this.tanks.filter(Boolean).length + this.ships.filter(Boolean).length >= LAIR_VEHICLES) return false;
    if (kind === CallKind.Tarantula) {
      // One tarantula each (a watchdog besides is fine).
      const slot = this.tanks.indexOf(null);
      if (slot < 0 || this.tanks.some((t) => t !== null && isSpider(t) && t.owner === p.id)) return false;
      const w = ACTOR_W * TARANTULA_SCALE;
      const x = Math.max(60, Math.min(WORLD_W - 60 - w, p.cx - w / 2 + this.rng.range(-30, 30)));
      this.tanks[slot] = newTarantula(x, -ACTOR_H * TARANTULA_SCALE - 40, p.id);
      this.dogMem.delete(slot);
      p.gold -= TARANTULA_COST;
      p.callCd = CALL_COOLDOWN;
      this.broadcast.u8(R_CHAT);
      this.broadcast.u8(p.id);
      this.broadcast.str('*radio* tarantula inbound, stand clear');
      return true;
    }
    if (kind === CallKind.Watchdog) {
      // One watchdog each.
      const slot = this.tanks.indexOf(null);
      if (slot < 0 || this.tanks.some((t) => t !== null && isDog(t) && t.owner === p.id)) return false;
      const w = Math.round(TANK_W * WATCHDOG_SCALE);
      const x = Math.max(60, Math.min(WORLD_W - 60 - w, p.cx - w / 2 + this.rng.range(-30, 30)));
      this.tanks[slot] = newTank(x, -TANK_H - 40, WATCHDOG_SCALE, p.id);
      this.dogMem.delete(slot);
      p.gold -= WATCHDOG_COST;
      p.callCd = CALL_COOLDOWN;
      this.broadcast.u8(R_CHAT);
      this.broadcast.u8(p.id);
      this.broadcast.str('*radio* watchdog inbound, it has my back');
      return true;
    }
    if (kind === CallKind.Mole) {
      // A mole, parachuted onto the caller like a tank.
      const slot = this.tanks.indexOf(null);
      if (slot < 0) return false;
      const w = Math.round(TANK_W * MOLE_SCALE);
      const x = Math.max(60, Math.min(WORLD_W - 60 - w, p.cx - w / 2 + this.rng.range(-24, 24)));
      this.tanks[slot] = newMole(x, -TANK_H - 40);
      p.gold -= MOLE_COST;
      p.callCd = CALL_COOLDOWN;
      this.broadcast.u8(R_CHAT);
      this.broadcast.u8(p.id);
      this.broadcast.str('*radio* mole inbound on my position');
      return true;
    }
    if (kind === CallKind.Tank) {
      const slot = this.tanks.indexOf(null);
      if (slot < 0) return false;
      const x = Math.max(60, Math.min(WORLD_W - 60 - TANK_W, p.cx - TANK_W / 2 + this.rng.range(-24, 24)));
      this.tanks[slot] = newTank(x, -TANK_H - 40);
    } else if (kind === CallKind.Dropship) {
      const slot = this.ships.indexOf(null);
      if (slot < 0) return false;
      // In from high up off to one side, then down onto station.
      const side = this.rng.next() < 0.5 ? -1 : 1;
      const x = Math.max(40, Math.min(WORLD_W - 40 - SHIP_W, p.cx + side * 260 - SHIP_W / 2));
      const sh = newShip(x, -SHIP_H - 80, p.id, p.team);
      sh.anchorX = p.cx;
      this.ships[slot] = sh;
    } else return false;
    p.gold -= CALL_COST;
    p.callCd = CALL_COOLDOWN;
    this.broadcast.u8(R_CHAT);
    this.broadcast.u8(p.id);
    this.broadcast.str(kind === CallKind.Tank ? '*radio* tank inbound on my position' : '*radio* dropship inbound for air support');
    return true;
  }

  /**
   * Take remote control of our own dropship (the remote in the radio kit),
   * or hand it back to the autopilot. The clone stays where it stood, alive
   * and inert (and as shootable as ever) while we fly.
   */
  /**
   * Everything of ours the remote can take over, in the order P steps
   * through it: our dropships, then our watchdogs, then our tarantulas
   * (each by slot). Ones still on their way down, or heading home, aren't.
   */
  remotesOf(id: number): { ship: boolean; slot: number }[] {
    const out: { ship: boolean; slot: number }[] = [];
    this.ships.forEach((sh, slot) => {
      if (sh && sh.owner === id && !sh.leaving && (sh.pilot === 255 || sh.pilot === id)) out.push({ ship: true, slot });
    });
    for (const which of [isDog, isSpider]) {
      this.tanks.forEach((t, slot) => {
        if (t && which(t) && t.owner === id && !t.chute && (t.pilot === 255 || t.pilot === id)) out.push({ ship: false, slot });
      });
    }
    return out;
  }

  /**
   * The remote: from the clone to our first drone, on to the next, and from
   * the last back to the clone (`back`: the other way round). Whatever we
   * leave goes back to its own head.
   */
  togglePilot(id: number, back = false): boolean {
    const p = this.players[id];
    if (!p) return false;
    const list = this.remotesOf(id);
    const cur = p.pilot >= 0 ? list.findIndex((r) => r.ship && r.slot === p.pilot) : p.rc >= 0 ? list.findIndex((r) => !r.ship && r.slot === p.rc) : -1;
    // (Driving something no longer on the list, gone or not ours: back to the clone.)
    if (cur < 0 && (p.pilot >= 0 || p.rc >= 0)) {
      if (p.pilot >= 0) this.endPilot(p);
      if (p.rc >= 0) this.endRemote(p);
      return true;
    }
    if (cur < 0 && (!p.alive || p.tank >= 0 || !list.length)) return false;
    // Positions: -1 the clone, 0.. the drones; stepping wraps through the clone.
    const n = list.length;
    const at = p.pilot >= 0 || p.rc >= 0 ? cur : -1;
    const next = back ? (at < 0 ? n - 1 : at - 1) : at + 1 >= n ? -1 : at + 1;
    if (p.pilot >= 0) this.endPilot(p);
    if (p.rc >= 0) this.endRemote(p);
    if (next < 0 || !p.alive || p.tank >= 0) return true;
    const r = list[next];
    if (r.ship) {
      const sh = this.ships[r.slot]!;
      p.pilot = r.slot;
      sh.pilot = id;
      sh.holdX = sh.x + SHIP_W / 2;
      sh.holdY = sh.y;
    } else this.startRemote(p, r.slot);
    return true;
  }

  /** Take the watchdog's remote: we drive it and fire its guns; the clone stands inert. */
  private startRemote(p: Player, slot: number): void {
    const t = this.tanks[slot]!;
    p.rc = slot;
    t.pilot = p.id;
  }

  /** Hand the watchdog back to its own head (guarding us). */
  private endRemote(p: Player): void {
    const t = p.rc >= 0 ? this.tanks[p.rc] : null;
    if (t && t.pilot === p.id) t.pilot = 255;
    p.rc = -1;
  }

  /** Back to the autopilot (and its support role): the clone is ours again. */
  private endPilot(p: Player): void {
    const sh = p.pilot >= 0 ? this.ships[p.pilot] : null;
    if (sh && sh.pilot === p.id) {
      sh.pilot = 255;
      sh.planCd = 0;
    }
    p.pilot = -1;
  }

  /** Is `p` a target for a dropship called by `owner` (an enemy of its caller)? */
  private shipFoe(sh: Ship, p: Player): boolean {
    return p.alive && p.id !== sh.owner && !(sh.team !== Team.None && p.team === sh.team);
  }

  /** Is dropship `o` an enemy of `sh` (another caller's, and not on its team)? */
  private shipEnemy(sh: Ship, o: Ship | null): o is Ship {
    return !!o && o !== sh && o.owner !== sh.owner && !(sh.team !== Team.None && o.team === sh.team);
  }

  /** Who a dropship works for: its caller, and in team modes the caller's whole team. */
  private shipAlly(sh: Ship, p: Player): boolean {
    return p.id === sh.owner || (sh.team !== Team.None && p.team === sh.team);
  }

  /** The side a sighting belongs to: a team, or (every clone for itself) just the caller. */
  private spotKey(team: number, id: number): number {
    return team !== Team.None ? 1000 + team : id;
  }

  /**
   * The dropship's brain, a few times a second. In order:
   * - **Cover:** an ally with an enemy close by (the one under most
   *   pressure: nearest the threat, and hurt) gets the ship over that enemy.
   * - **Strike:** otherwise it goes after the enemies its side knows of
   *   within reach of an ally (spotted ones and groups first).
   * - **Scout:** otherwise it flies out ahead of its lead (the caller, or
   *   the nearest teammate when the caller's down), toward the enemy if it
   *   knows where they are, sweeping back and forth to find them.
   * It never strays further than a leash from its side. In team modes it
   * works for the whole team, not only its caller.
   */
  private planShip(sh: Ship): void {
    const cx = sh.x + SHIP_W / 2;
    const allies: Player[] = [];
    const foes: Player[] = [];
    for (const o of this.players) {
      if (!o || !o.alive) continue;
      if (this.shipAlly(sh, o)) allies.push(o);
      else if (this.shipFoe(sh, o)) foes.push(o);
    }
    const owner = this.players[sh.owner];
    let lead: Player | null = owner && owner.alive ? owner : null;
    for (const a of allies) if (!lead || Math.abs(a.cx - cx) < Math.abs(lead.cx - cx)) lead = a;
    sh.focus = 255;
    if (!lead) {
      sh.mission = ShipMission.Escort;
      sh.goalX = sh.anchorX;
      return;
    }
    // Intercept: an enemy dropship near us or any of ours comes first (air superiority).
    sh.foeShip = 255;
    let near = SHIP_INTERCEPT_R;
    for (let k = 0; k < MAX_SHIPS; k++) {
      const o = this.ships[k];
      if (!this.shipEnemy(sh, o) || o.leaving) continue;
      const ox = o.x + SHIP_W / 2;
      let d = Math.abs(ox - cx);
      for (const a of allies) d = Math.min(d, Math.abs(ox - a.cx));
      if (d < near) {
        near = d;
        sh.foeShip = k;
      }
    }
    if (sh.foeShip !== 255) {
      sh.mission = ShipMission.Intercept;
      const o = this.ships[sh.foeShip]!;
      // Stand off to the side we're already on, guns on it.
      const ox = o.x + SHIP_W / 2;
      sh.goalX = ox + (cx < ox ? -1 : 1) * SHIP_STANDOFF;
      return;
    }
    const spotted = this.spots.get(this.spotKey(sh.team, sh.owner));
    // Cover: the ally under the most pressure.
    let best = 0;
    for (const a of allies) {
      for (const o of foes) {
        const d = Math.hypot(o.cx - a.cx, o.cy - a.cy);
        if (d >= SHIP_COVER_R) continue;
        const s = (SHIP_COVER_R - d) * (a.hp < ACTOR_MAX_HP / 2 ? 1.6 : 1) * (a === owner ? 1.25 : 1);
        if (s > best) {
          best = s;
          sh.focus = o.id;
        }
      }
    }
    if (sh.focus !== 255) {
      sh.mission = ShipMission.Cover;
      sh.goalX = this.players[sh.focus]!.cx;
      return;
    }
    // Strike: the best target its side could know of, groups and sightings first.
    best = -Infinity;
    for (const o of foes) {
      let reach = Infinity;
      for (const a of allies) reach = Math.min(reach, Math.abs(o.cx - a.cx));
      if (reach > SHIP_STRIKE_R) continue;
      let group = 0;
      for (const q of foes) if (Math.abs(q.cx - o.cx) < 140 && Math.abs(q.cy - o.cy) < 140) group++;
      const s = group * 200 - reach * 0.3 + ((spotted?.get(o.id) ?? 0) > this.tick ? 150 : 0);
      if (s > best) {
        best = s;
        sh.focus = o.id;
      }
    }
    if (sh.focus !== 255) {
      sh.mission = ShipMission.Strike;
      sh.goalX = this.players[sh.focus]!.cx;
    } else {
      // Scout: out ahead of the lead, toward the nearest enemy if any, else the way they face.
      let dir = Math.cos(dequantizeAim(lead.aimQ)) < 0 ? -1 : 1;
      let near = Infinity;
      for (const o of foes) {
        const d = Math.abs(o.cx - lead.cx);
        if (d < near) {
          near = d;
          dir = o.cx < lead.cx ? -1 : 1;
        }
      }
      sh.mission = ShipMission.Scout;
      sh.goalX = lead.cx + dir * (SHIP_SCOUT_AHEAD + 200 * Math.sin(sh.age / 70));
    }
    // The leash: never far from its side.
    const leash = sh.team !== Team.None ? SHIP_LEASH_TEAM : SHIP_LEASH;
    let nearAlly = lead;
    for (const a of allies) if (Math.abs(a.cx - sh.goalX) < Math.abs(nearAlly.cx - sh.goalX)) nearAlly = a;
    sh.goalX = Math.max(nearAlly.cx - leash, Math.min(nearAlly.cx + leash, sh.goalX));
  }

  /** Every few ticks, each dropship marks the enemies it can see for its side. */
  private shipSpotting(): void {
    if (this.tick % 6 !== 0) return;
    const pt = this.pt;
    for (const sh of this.ships) {
      if (!sh || sh.leaving) continue;
      const key = this.spotKey(sh.team, sh.owner);
      let m = this.spots.get(key);
      const c = shipPoint(sh, SHIP_W / 2, SHIP_H, pt);
      const ex = c.x;
      const ey = c.y;
      for (const o of this.players) {
        if (!o || !this.shipFoe(sh, o)) continue;
        if (Math.hypot(o.cx - ex, o.cy - ey) > SHIP_SIGHT || !this.clearLine(ex, ey, o.cx, o.cy)) continue;
        if (!m) this.spots.set(key, (m = new Map()));
        m.set(o.id, this.tick + SPOT_TICKS);
      }
    }
    for (const [, m] of this.spots) for (const [id, until] of m) if (until <= this.tick || !this.players[id]?.alive) m.delete(id);
  }

  /** Terrain-free line of sight (3-cell steps). */
  private clearLine(x0: number, y0: number, x1: number, y1: number): boolean {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.floor(d / 3));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.terrain.isSolid(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t))) return false;
    }
    return true;
  }

  /**
   * Fly every dropship: hold station over its caller (or over an enemy near
   * them, to bomb it), strafe with both turrets, open the bay over targets,
   * and head home once it's out of bombs and idle, its time is up, or its
   * caller has left.
   */
  private stepShips(): void {
    const pt = this.pt;
    for (let k = 0; k < MAX_SHIPS; k++) {
      const sh = this.ships[k];
      if (!sh) continue;
      sh.age++;
      sh.sinceBomb++;
      if (sh.bombCd > 0) sh.bombCd--;
      if (sh.doors > 0) sh.doors--;
      const owner = this.players[sh.owner];
      if (owner && owner.alive) sh.anchorX = owner.cx;
      // In team modes it stays on for the team after its caller leaves, while any of them are left.
      const served = !!owner || (sh.team !== Team.None && this.players.some((o) => o && o.team === sh.team));
      const guns = hasShipPart(sh.parts, ShipPart.TurretL) || hasShipPart(sh.parts, ShipPart.TurretR);
      if (!served || (sh.bombs === 0 && !guns && sh.sinceBomb > 30 * 20) || sh.age > 30 * 120) sh.leaving = true;
      // Remote control: whoever's flying it (if they still are), else the autopilot's own brain.
      if (sh.pilot !== 255 && this.players[sh.pilot]?.pilot !== k) sh.pilot = 255;
      const pilot = sh.pilot !== 255 ? this.players[sh.pilot]! : null;
      if (pilot) {
        sh.mission = ShipMission.Escort;
        sh.focus = 255;
      } else if (--sh.planCd <= 0) {
        sh.planCd = 10;
        this.planShip(sh);
      }
      // Station: on its mission's goal, tracking whoever it's after.
      const cx = sh.x + SHIP_W / 2;
      const focus = sh.focus !== 255 ? this.players[sh.focus] : null;
      let tx = focus && focus.alive ? focus.cx : sh.goalX;
      // Dogfighting: keep station beside the enemy ship (weaving a little so it's harder to hit), level with it.
      const foe = !pilot && sh.mission === ShipMission.Intercept && sh.foeShip !== 255 ? this.ships[sh.foeShip] : null;
      if (foe && this.shipEnemy(sh, foe)) {
        const ox = foe.x + SHIP_W / 2;
        const ph = k * 1.9;
        tx = ox + (cx < ox ? -1 : 1) * (SHIP_STANDOFF + Math.sin(sh.age / 23 + ph) * 60);
      }
      // Bombs: on whichever enemy is under it (bay intact), unless an ally is too close to them.
      let bombTarget: Player | null = null;
      if (!sh.leaving && sh.bombs > 0 && hasShipPart(sh.parts, ShipPart.Doors)) {
        let best = 90;
        for (const o of this.players) {
          if (!o || !this.shipFoe(sh, o) || o.cy < sh.y + SHIP_H) continue;
          const d = Math.abs(o.cx - cx);
          if (d >= best) continue;
          let safe = true;
          for (const a of this.players) if (a && a.alive && this.shipAlly(sh, a) && Math.hypot(a.cx - o.cx, a.cy - o.cy) < PROJ[ProjKind.Bomb].splashR + 16) safe = false;
          if (!safe) continue;
          best = d;
          bombTarget = o;
        }
        if (bombTarget && (sh.mission === ShipMission.Cover || sh.mission === ShipMission.Strike)) tx = bombTarget.cx;
      }
      if (pilot) {
        // Flown by hand: A/D slide the point it holds, W/S raise and lower it
        // (never into the ground); the autopilot keeps it level and on it.
        const bt = pilot.buttons;
        const dx = (bt & BTN_RIGHT ? 1 : 0) - (bt & BTN_LEFT ? 1 : 0);
        const dy = (bt & BTN_DOWN ? 1 : 0) - (bt & BTN_UP ? 1 : 0);
        sh.holdX = Math.max(cx - 150, Math.min(cx + 150, sh.holdX + dx * PILOT_SPEED * DT));
        if (dx === 0) sh.holdX += (cx - sh.holdX) * 0.02;
        let floor = WORLD_H;
        for (let gx = Math.floor(cx - SHIP_W); gx <= cx + SHIP_W; gx += 6) floor = Math.min(floor, this.terrain.surfaceY(Math.max(0, Math.min(WORLD_W - 1, gx))));
        sh.holdY = Math.max(-40, Math.min(floor - SHIP_H - 18, sh.holdY + dy * PILOT_CLIMB * DT));
        tx = sh.holdX;
        bombTarget = null;
      }
      tx = Math.max(SHIP_W, Math.min(WORLD_W - SHIP_W, tx));
      // Altitude over the highest ground (hills, towers) between here and the goal, and a little ahead.
      const lo = Math.max(0, Math.floor(Math.min(cx, tx) - SHIP_W));
      const hi = Math.min(WORLD_W - 1, Math.floor(Math.max(cx, tx) + SHIP_W));
      let ground = WORLD_H;
      for (let gx = lo; gx <= hi && gx <= lo + 600; gx += 6) ground = Math.min(ground, this.terrain.surfaceY(gx));
      if (tx < cx) for (let gx = hi; gx >= lo && gx >= hi - 600; gx -= 6) ground = Math.min(ground, this.terrain.surfaceY(gx));
      const ty = sh.leaving ? -260 : pilot ? sh.holdY : foe ? Math.max(40, Math.min(ground - SHIP_ALT, foe.y + Math.cos(sh.age / 29 + k * 2.3) * 35)) : Math.max(40, ground - SHIP_ALT);
      const impact = stepShip(sh, this.terrain, DT, sh.leaving ? cx : tx, ty);
      if (impact > 90) {
        this.destroyShip(k, sh.lastHitBy);
        continue;
      }
      if (sh.y > WORLD_H || (sh.leaving && sh.y < -SHIP_H - 200)) {
        if (sh.y > WORLD_H) this.destroyShip(k, sh.lastHitBy);
        else this.ships[k] = null;
        continue;
      }
      // Turrets: each takes the nearest enemy in sight and reach.
      for (const side of [0, 1]) {
        sh.fired[side] = false;
        if (sh.gunCd[side] > 0) sh.gunCd[side]--;
        if (!hasShipPart(sh.parts, ShipPart.TurretL + side) || sh.leaving) continue;
        const g = shipPoint(sh, TURRET_AT[side][0], TURRET_AT[side][1], pt);
        const gx = g.x;
        const gy = g.y;
        if (pilot) {
          // The pilot's guns: both turrets on the pilot's aim, firing while the trigger's held.
          sh.aim[side] = dequantizeAim(pilot.aimQ);
          if (sh.gunCd[side] > 0 || !(pilot.buttons & BTN_FIRE)) continue;
          // (Locked on: each turret set true on the target from where it sits.)
          sh.aim[side] = this.lockOnto(pilot, gx, gy, sh.aim[side], 900, GRAVITY * PROJ[ProjKind.ShipGun].gravity, sh.vx * 0.3, sh.vy * 0.3, 9, !(pilot.buttons & BTN_LOCK));
          const a = sh.aim[side] + (this.rng.next() - 0.5) * 0.06 * (pilot.buttons & BTN_LOCK ? 0.5 : 1);
          this.spawnProj(this.nextProjId++, ProjKind.ShipGun, sh.owner, gx + Math.cos(a) * 9, gy + Math.sin(a) * 9, Math.cos(a) * 900 + sh.vx * 0.3, Math.sin(a) * 900 + sh.vy * 0.3);
          sh.gunCd[side] = 5;
          sh.fired[side] = true;
          continue;
        }
        // Enemy dropships first (further off; at the engine pods hanging out
        // on their pylons, each turret its own pod, else the hull), then soldiers.
        let tx2 = 0;
        let ty2 = 0;
        let tvx = 0;
        let tvy = 0;
        let best = Infinity;
        for (const o of this.ships) {
          if (!this.shipEnemy(sh, o)) continue;
          let lx = SHIP_W / 2;
          let ly = SHIP_H / 2;
          for (let e = 0; e < 4; e++) {
            const pod = (side * 2 + e + (sh.age >> 6)) & 3;
            if (hasShipPart(o.parts, ShipPart.EngineA + pod)) {
              lx = ENGINE_X[pod];
              ly = ENGINE_NOZZLE_Y - 4;
              break;
            }
          }
          const c = shipPoint(o, lx, ly, this.pt2);
          const d = Math.hypot(c.x - gx, c.y - gy);
          if (d < SHIP_AA_RANGE && d * 0.6 < best && this.clearLine(gx, gy, c.x, c.y)) {
            best = d * 0.6;
            tx2 = c.x;
            ty2 = c.y;
            tvx = o.vx;
            tvy = o.vy;
          }
        }
        for (const o of this.players) {
          if (!o || !this.shipFoe(sh, o)) continue;
          const d = Math.hypot(o.cx - gx, o.cy - gy);
          if (d < SHIP_GUN_RANGE && d < best && this.clearLine(gx, gy, o.cx, o.cy)) {
            best = d;
            tx2 = o.cx;
            ty2 = o.cy;
            tvx = o.body.vx;
            tvy = o.body.vy;
          }
        }
        if (best === Infinity) continue;
        const lead = Math.hypot(tx2 - gx, ty2 - gy) / 900;
        sh.aim[side] = Math.atan2(ty2 + tvy * lead - gy, tx2 + tvx * lead - gx);
        if (sh.gunCd[side] > 0) continue;
        const a = sh.aim[side] + (this.rng.next() - 0.5) * 0.1;
        this.spawnProj(this.nextProjId++, ProjKind.ShipGun, sh.owner, gx + Math.cos(a) * 9, gy + Math.sin(a) * 9, Math.cos(a) * 900 + sh.vx * 0.3, Math.sin(a) * 900 + sh.vy * 0.3);
        sh.gunCd[side] = 5;
        sh.fired[side] = true;
      }
      // The pilot's bombs: right mouse (scope) opens the bay and lets one go.
      if (pilot && pilot.buttons & BTN_SCOPE && sh.bombs > 0 && sh.bombCd === 0 && hasShipPart(sh.parts, ShipPart.Doors)) {
        const bay = shipPoint(sh, BAY_AT[0], BAY_AT[1] + 2, pt);
        this.spawnProj(this.nextProjId++, ProjKind.Bomb, sh.owner, bay.x, bay.y + 3, sh.vx, Math.max(30, sh.vy + 30));
        sh.bombs--;
        sh.bombCd = 24;
        sh.doors = 24;
        sh.sinceBomb = 0;
      }
      // Bombs: the bay opens over an enemy below with nothing in the way.
      if (bombTarget && sh.bombCd === 0 && Math.abs(sh.a) < 0.3) {
        const bay = shipPoint(sh, BAY_AT[0], BAY_AT[1] + 2, pt);
        // Where a bomb dropped now lands: lead by its fall time.
        const fall = Math.sqrt((2 * Math.max(1, bombTarget.cy - bay.y)) / GRAVITY);
        const landX = bay.x + sh.vx * fall;
        if (bombTarget.cy > bay.y + 10 && Math.abs(landX - bombTarget.cx) < 16 && this.clearLine(bay.x, bay.y + 4, bombTarget.cx, bombTarget.cy)) {
          this.spawnProj(this.nextProjId++, ProjKind.Bomb, sh.owner, bay.x, bay.y + 3, sh.vx, Math.max(30, sh.vy + 30));
          sh.bombs--;
          sh.bombCd = 36;
          sh.doors = 24;
          sh.sinceBomb = 0;
        }
      }
    }
  }

  /**
   * Rival dropships ram each other: hulls that overlap are pushed apart and
   * bounce, and both take hull damage by how fast they closed (credited to
   * the other's caller), with a spin kick. A ship's own side passes through.
   */
  private shipCollisions(): void {
    for (let i = 0; i < MAX_SHIPS; i++) {
      for (let j = i + 1; j < MAX_SHIPS; j++) {
        const a = this.ships[i];
        const b = this.ships[j];
        if (!a || !b || !this.shipEnemy(a, b)) continue;
        // The hulls (the pods out on their pylons count too: the ships are SHIP_W wide).
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const ox = SHIP_W * 0.9 - Math.abs(dx);
        const oy = SHIP_H * 0.8 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        // Push apart along the shallower overlap, and bounce.
        const sideways = ox / SHIP_W < oy / SHIP_H;
        const nx = sideways ? Math.sign(dx) || 1 : 0;
        const ny = sideways ? 0 : Math.sign(dy) || 1;
        const push = (sideways ? ox : oy) / 2 + 0.5;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (closing <= 0) continue;
        const j2 = closing * (1 + SHIP_BOUNCE) / 2;
        a.vx -= nx * j2;
        a.vy -= ny * j2;
        b.vx += nx * j2;
        b.vy += ny * j2;
        const spin = (this.rng.next() - 0.5) * closing * 0.03;
        a.w += spin;
        b.w -= spin;
        if (closing < SHIP_RAM_MIN) continue;
        const dmg = (closing - SHIP_RAM_MIN) * SHIP_RAM_DAMAGE;
        this.hurtShipPart(i, ShipPart.Hull, dmg, b.owner);
        if (this.ships[j] === b) this.hurtShipPart(j, ShipPart.Hull, dmg, a.owner);
      }
    }
  }

  /**
   * A heat seeker's target: the hottest enemy vehicle it can see, i.e. a tank
   * someone drives, a dropship, a drop rocket with a clone aboard, none of
   * them its shooter's or their team's.
   */
  private heatTarget(i: number, out: { x: number; y: number }): boolean {
    const pr = this.projectiles;
    const owner = pr.owner[i];
    const team = owner < MAX_PLAYERS ? (this.players[owner]?.team ?? Team.None) : Team.None;
    const foe = (id: number, t: number) => id !== owner && !(team !== Team.None && t === team);
    const list = this.heat;
    list.length = 0;
    for (const t of this.tanks) {
      const who = t ? (t.pilot !== 255 ? t.pilot : t.owner) : 255;
      if (t && who !== 255 && foe(who, this.players[who]?.team ?? Team.None)) list.push({ x: t.x + tankW(t) / 2, y: t.y + tankH(t) / 2 });
    }
    for (const sh of this.ships) if (sh && !sh.leaving && foe(sh.owner, sh.team)) list.push({ x: sh.x + SHIP_W / 2, y: sh.y + SHIP_H / 2 });
    for (const c of this.crafts) if (c && c.passenger !== 255 && foe(c.passenger, this.players[c.passenger]?.team ?? Team.None)) list.push({ x: c.x, y: c.y });
    return pickHeat(pr.x[i], pr.y[i], pr.ang[i] || Math.atan2(pr.vy[i], pr.vx[i]), list, out);
  }

  /**
   * Clones bump into enemy clones and enemy dropships (their own side passes
   * through). Overlapping clones are pushed apart and trade momentum along
   * the push; a clone hitting a dropship's hull bounces off it (and nudges it
   * a little: it's far heavier). Hard enough (a jetpack ram, a fall onto
   * someone, a dropship sweeping into you), both take damage, credited to
   * the other.
   */
  private bodyCollisions(): void {
    const ps = this.players;
    const live = (p: Player | null): p is Player => !!p && p.alive && p.tank < 0 && p.surf < 0 && p.surfShip < 0 && p.delivering < 0;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      if (!live(a)) continue;
      // Clone on clone.
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j];
        if (!live(b) || (a.team !== Team.None && a.team === b.team)) continue;
        // Where they are now, and where they were at the tick's start (a fast
        // clone can cross another's whole width in one tick: sweep it).
        const rx = b.body.x - a.body.x;
        const ry = b.top - a.top;
        const rx0 = rx - (b.body.vx - a.body.vx) * DT;
        const ry0 = ry - (b.body.vy - a.body.vy) * DT;
        const oy = Math.min(a.body.y + ACTOR_H, b.body.y + ACTOR_H) - Math.max(a.top, b.top);
        if (oy <= 0) continue;
        const crossed = Math.abs(rx0) >= ACTOR_W && Math.sign(rx0) !== Math.sign(rx);
        if (Math.abs(rx) >= ACTOR_W && !crossed) continue;
        // Apart the way they came together: sideways, or one landing on the other.
        const side = crossed || Math.abs(rx0) >= ACTOR_W - 0.5 || ACTOR_W - Math.abs(rx) < oy;
        const nx = side ? Math.sign(rx0) || Math.sign(rx) || 1 : 0;
        const ny = side ? 0 : Math.sign(ry0) || Math.sign(ry) || 1;
        // Separate them to just touching, each taking half.
        const push = side ? (ACTOR_W - rx * nx) / 2 + 0.25 : oy / 2 + 0.25;
        this.shoveBody(a, -nx * push, -ny * push);
        this.shoveBody(b, nx * push, ny * push);
        const closing = (a.body.vx - b.body.vx) * nx + (a.body.vy - b.body.vy) * ny;
        if (closing <= 0) continue;
        const jx = closing * (1 + BODY_BOUNCE) * 0.5;
        a.body.vx -= nx * jx;
        a.body.vy -= ny * jx;
        b.body.vx += nx * jx;
        b.body.vy += ny * jx;
        if (closing > BODY_RAM_MIN) {
          const dmg = (closing - BODY_RAM_MIN) * BODY_RAM_DAMAGE;
          this.damage(a, dmg, b.id, W_RAM);
          this.damage(b, dmg, a.id, W_RAM);
        }
      }
      if (!a.alive) continue;
      // Clone on dropship hull.
      for (let k = 0; k < MAX_SHIPS; k++) {
        const sh = this.ships[k];
        if (!sh || sh.owner === a.id || (sh.team !== Team.None && sh.team === a.team)) continue;
        const cx = a.body.x + ACTOR_W / 2;
        const cy = (a.top + a.body.y + ACTOR_H) / 2;
        if (Math.abs(cx - (sh.x + SHIP_W / 2)) > SHIP_W / 2 + ACTOR_W || Math.abs(cy - (sh.y + SHIP_H / 2)) > SHIP_H / 2 + ACTOR_H) continue;
        // Any of the clone's corners or centre inside the hull (or a pod)?
        let inside = false;
        for (const [px, py] of [[a.body.x, a.top], [a.body.x + ACTOR_W, a.top], [a.body.x, a.body.y + ACTOR_H], [a.body.x + ACTOR_W, a.body.y + ACTOR_H], [cx, cy]]) {
          const l = shipLocal(sh, px, py, this.pt);
          if (shipSolidAt(sh.parts, l.x, l.y)) {
            inside = true;
            break;
          }
        }
        if (!inside) continue;
        // Which way it's thrown: along the ship's motion into it, when the
        // ship is moving into the clone; else (slow, or the clone flying into
        // the hull) out away from the hull's centre (mostly up or down).
        const rvx = sh.vx - a.body.vx;
        const rvy = sh.vy - a.body.vy;
        const rv = Math.hypot(rvx, rvy);
        const c = shipPoint(sh, SHIP_W / 2, SHIP_H / 2, this.pt);
        let nx = cx - c.x;
        let ny = (cy - c.y) * 2.5;
        if (rv > 40 && rvx * nx + rvy * ny <= 0) {
          nx = rvx;
          ny = rvy;
        }
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;
        this.shoveBody(a, nx * 3, ny * 3);
        const closing = (sh.vx - a.body.vx) * nx + (sh.vy - a.body.vy) * ny;
        if (closing <= 0) continue;
        a.body.vx += nx * closing * (1 + BODY_BOUNCE);
        a.body.vy += ny * closing * (1 + BODY_BOUNCE);
        sh.vx -= nx * closing * SHIP_BODY_SHOVE;
        sh.vy -= ny * closing * SHIP_BODY_SHOVE;
        if (closing > SHIP_RAM_BODY_MIN) {
          const hard = closing - SHIP_RAM_BODY_MIN;
          this.damage(a, hard * SHIP_RAM_BODY_DAMAGE, sh.owner, W_RAM);
          this.hurtShipPart(k, ShipPart.Hull, hard * SHIP_RAM_HULL_DAMAGE, a.id);
        }
        if (!a.alive) break;
      }
    }
  }

  /** Nudge a clone by (dx, dy) cells, but never into terrain. */
  private shoveBody(p: Player, dx: number, dy: number): void {
    const b = p.body;
    const top = ACTOR_H - STANCE_H[b.stance];
    const free = (x: number, y: number) => !this.terrain.rectSolid(Math.floor(x), Math.floor(y + top), Math.floor(x + ACTOR_W - 1), Math.floor(y + ACTOR_H - 1));
    if (dx !== 0 && free(b.x + dx, b.y)) b.x += dx;
    if (dy !== 0 && free(b.x, b.y + dy)) b.y += dy;
  }

  /** Is a hit by `by` on this dropship friendly fire (its caller or a teammate of theirs)? */
  private friendlyShip(by: number, sh: Ship): boolean {
    if (by === sh.owner) return true;
    const a = by >= 0 && by < MAX_PLAYERS ? this.players[by] : null;
    return !!a && sh.team !== Team.None && a.team === sh.team;
  }

  private hitShip(slot: number, wx: number, wy: number, dx: number, dy: number, energy: number, wound: number, by: number): void {
    const sh = this.ships[slot];
    if (!sh || this.friendlyShip(by, sh)) return;
    let l = shipLocal(sh, wx + dx * 2, wy + dy * 2, this.pt);
    if (!shipSolidAt(sh.parts, l.x, l.y)) {
      l = shipLocal(sh, wx, wy, this.pt);
      if (!shipSolidAt(sh.parts, l.x, l.y)) return; // grit through the open pylons
    }
    this.hurtShipPart(slot, shipPartAt(sh.parts, l.x, l.y), energy > SHIP_INTEGRITY ? wound : wound * 0.2, by);
  }

  /** Damage one part; a part out of hit points is blown off, the hull going is the end. */
  private hurtShipPart(slot: number, part: number, dmg: number, by: number): void {
    const sh = this.ships[slot];
    if (!sh || dmg <= 0) return;
    if (by !== NO_OWNER && by !== 255) sh.lastHitBy = by;
    if (part === ShipPart.Hull) sh.hp -= dmg;
    else {
      sh.hp -= dmg * 0.1;
      sh.partHp[part] -= dmg;
      if (sh.partHp[part] <= 0 && hasShipPart(sh.parts, part)) this.detachShipPart(slot, part);
    }
    sh.partHp[ShipPart.Hull] = Math.max(0, sh.hp);
    if (sh.hp <= 0) this.destroyShip(slot, sh.lastHitBy);
  }

  /** Blast overpressure: every part in reach takes its share, and the shove rocks the hull. */
  private splashShips(x: number, y: number, r: number, dmg: number, owner: number): void {
    const pt = this.pt;
    for (let k = 0; k < MAX_SHIPS; k++) {
      const sh = this.ships[k];
      if (!sh || this.friendlyShip(owner, sh)) continue;
      const c = shipPoint(sh, SHIP_W / 2, SHIP_H / 2, pt);
      if (Math.hypot(c.x - x, c.y - y) > r + SHIP_W / 2) continue;
      for (let part = 0; part < SHIP_PARTS && this.ships[k] === sh; part++) {
        if (!hasShipPart(sh.parts, part)) continue;
        const q = shipPoint(sh, SHIP_PART_CENTER[part][0], SHIP_PART_CENTER[part][1], pt);
        const d = Math.hypot(q.x - x, q.y - y);
        if (d < r) this.hurtShipPart(k, part, dmg * 1.3 * (1 - d / r) * (part === ShipPart.Hull ? 1 : 0.8), owner);
      }
      if (this.ships[k] !== sh) continue;
      const d = Math.hypot(c.x - x, c.y - y) + 1e-6;
      const push = 60 * Math.max(0, 1 - d / (r + SHIP_W / 2));
      sh.vx += ((c.x - x) / d) * push;
      sh.vy += ((c.y - y) / d) * push;
      sh.w += ((c.x - x) / d) * push * 0.02;
    }
  }

  /** A part flies off as scrap; losing an engine kicks the hull round toward that side. */
  private detachShipPart(slot: number, part: number): void {
    const sh = this.ships[slot]!;
    sh.parts &= ~(1 << part);
    sh.partHp[part] = 0;
    const q = shipPoint(sh, SHIP_PART_CENTER[part][0], SHIP_PART_CENTER[part][1], this.pt);
    const x = q.x;
    const y = q.y;
    const out = x >= sh.x + SHIP_W / 2 ? 1 : -1;
    const vx = sh.vx + out * (50 + this.rng.range(0, 60));
    const vy = sh.vy - 60 - this.rng.range(0, 60);
    if (part >= ShipPart.EngineA && part <= ShipPart.EngineD) {
      sh.w += out * 1.2;
      // The engine keeps burning on its own: a runaway rocket that spins
      // out and blows up wherever (or whoever) it hits, credited to whoever
      // shot it loose.
      this.spawnProj(this.nextProjId++, ProjKind.Engine, sh.lastHitBy === 255 ? NO_OWNER : sh.lastHitBy, x, y - 2, sh.vx + out * 40, sh.vy - 40);
    }
    const seed = this.rng.nextU32();
    // Its own scrap is its side's: the pieces it sheds must not chew through the hull they came off.
    craftPartFragments(this.grains, x, y, vx, vy, sh.owner, new Rng(seed));
    const w = this.tmp.reset();
    w.u8(R_SHIP_PART);
    w.u8(slot);
    w.u8(part);
    w.u16(clampU16(x));
    w.u16(clampU16(y + Y_BIAS));
    w.i16(clampI16(vx * VEL_SCALE));
    w.i16(clampI16(vy * VEL_SCALE));
    w.u32(seed);
    this.hits.push({ bytes: w.finish(), id: 0, x, y });
  }

  /** The dropship blows apart; whatever bombs it still carried go up with it. */
  private destroyShip(slot: number, by: number): void {
    const sh = this.ships[slot];
    if (!sh) return;
    this.ships[slot] = null;
    const owner = by === 255 ? NO_OWNER : by;
    const c = shipPoint(sh, SHIP_W / 2, SHIP_H / 2, this.pt);
    const cx = c.x;
    const cy = c.y;
    const r = 50 + sh.bombs * 6;
    const seed = this.rng.nextU32();
    this.carve(cx, cy, 16 + sh.bombs * 2, 7, 40, owner);
    this.grains.blast(cx, cy, r * 1.6, BLAST_IMPULSE * 1.5);
    const rng = new Rng(seed);
    craftFragments(this.grains, cx, cy, sh.vx, sh.vy, owner, rng);
    craftFragments(this.grains, cx, cy, sh.vx, sh.vy, owner, rng);
    this.splashCrafts(cx, cy, r, 90, owner);
    this.splashTanks(cx, cy, r, 90, owner);
    this.splashShips(cx, cy, r, 90, owner);
    for (const p of this.players) {
      if (!p || !p.alive || this.shielded(p) || this.friendly(owner, p)) continue;
      const d = Math.hypot(p.cx - cx, p.cy - cy);
      if (d >= r) continue;
      const res = this.strikeScratch;
      res.hp = 0;
      res.detached.length = 0;
      res.vital = false;
      const amt = (90 + sh.bombs * 15) * (1 - d / r);
      for (let part = 0; part < PART_COUNT; part++) {
        if (shareOf(p.parts.cls)[part] > 0 && has(p.parts.mask, part)) harm(p.parts, part, amt * shareOf(p.parts.cls)[part], res);
      }
      this.applyStrike(p, res, owner === NO_OWNER ? p.id : owner, W_SHIP, cx, cy);
    }
    const w = this.tmp.reset();
    w.u8(R_SHIP_BOOM);
    w.u8(slot);
    w.u16(clampU16(cx));
    w.u16(clampU16(cy + Y_BIAS));
    w.i16(clampI16(sh.vx * VEL_SCALE));
    w.i16(clampI16(sh.vy * VEL_SCALE));
    w.u32(seed);
    this.hits.push({ bytes: w.finish(), id: 0, x: cx, y: cy });
  }

  // ---------------------------------------------------------------- tick

  step(): void {
    const t0 = performance.now();
    this.tick++;
    if (this.mode === 'ffa') this.stepRound();
    const terrain = this.terrain;
    // Bots decide this tick's input the way a client would send it.
    for (const p of this.players) if (p?.bot) this.input(p.id, p.bot.think(this, p));

    for (const p of this.players) {
      if (!p) continue;
      // Keep the input queue shallow: a client whose clock runs fast must not
      // build up latency. Skipped commands still advance the ack.
      while (p.inputs.length > 3) p.ack = p.inputs.shift()!.seq;
      const cmd = p.inputs.shift();
      if (cmd) {
        p.buttons = cmd.buttons;
        p.aimQ = cmd.aim;
        p.invCmd = cmd.inv;
        p.ack = cmd.seq;
      }
      p.firing = false;
      if (p.callCd > 0) p.callCd--;
      const prev = p.prevButtons;
      p.prevButtons = p.buttons;
      if (!p.alive) {
        // Every clone arrives by drop rocket; in FFA only once per wave.
        if (p.delivering < 0 && (this.mode !== 'ffa' || p.pendingSpawn) && --p.respawn <= 0) this.launchCraft(p);
        else if (this.mode === 'ffa' && p.delivering < 0) this.spectateFrom(p, prev);
        if (p.delivering >= 0) {
          const c = this.crafts[p.delivering];
          if (c) {
            p.camX = c.x;
            p.camY = c.y;
          }
        }
        continue;
      }
      p.body.burdened = p.inv.some((it) => it.weapon === WeaponId.Idol);
      // Piloting: still flying it? (It may have gone down, or headed home.)
      if (p.pilot >= 0) {
        const sh = this.ships[p.pilot];
        if (!sh || sh.pilot !== p.id || sh.leaving) this.endPilot(p);
      }
      // Remote control: still at the controls? (The watchdog may be gone.)
      if (p.rc >= 0 && this.tanks[p.rc]?.pilot !== p.id) p.rc = -1;
      // Surfing: jump (W) to leap off; otherwise the vehicle carries it (seatRiders, after the vehicles move).
      if ((p.surf >= 0 || p.surfShip >= 0) && p.buttons & BTN_UP && !(prev & BTN_UP) && p.rc < 0 && p.pilot < 0) this.dismount(p, true);
      // (The digger running pulls toward its aim: the client predicts the same.)
      const pull = p.pilot < 0 && p.rc < 0 && p.weapon === WeaponId.Digger && p.buttons & BTN_FIRE && p.mob.canFire ? dequantizeAim(p.aimQ) : NaN;
      const impact = p.tank >= 0 || p.surf >= 0 || p.surfShip >= 0 ? 0 : stepBody(p.body, p.pilot >= 0 || p.rc >= 0 ? 0 : p.buttons, terrain, DT, pull);
      if (impact > FALL_DAMAGE_SPEED) {
        // A hard landing hurts the legs first, the torso if there are none.
        const amt = (impact - FALL_DAMAGE_SPEED) * 0.18; // two max-speed falls cost a leg
        const res = this.strikeScratch;
        res.hp = 0;
        res.detached.length = 0;
        res.vital = false;
        if (p.mob.legs > 0) {
          harm(p.parts, Part.LegB, amt, res);
          harm(p.parts, Part.LegF, amt, res);
        } else harm(p.parts, Part.Torso, amt * 1.5, res);
        this.applyStrike(p, res, p.id, 255, p.cx, p.body.y + 12);
      }
      if (!p.alive) continue;
      if (p.tank >= 0) {
        // Driving: the tank moves and shoots (stepTanks); the clone rides inside.
        this.handleInventory(p);
        continue;
      }
      if (p.body.y > WORLD_H) this.damage(p, 999, p.id, 255);
      // Open stumps bleed (machines' just spark); bleeding out credits whoever did it.
      const n = FACTIONS[p.parts.faction].bleeds ? stumps(p.parts.mask, p.parts.cls) : 0;
      if (n > 0) this.damage(p, n * BLEED_PER_STUMP * DT, p.lastHitBy, p.lastWeapon, true);
      // A droid with its turret gone bleeds out fast through the torn socket.
      if (headless(p.parts.mask, p.parts.cls)) this.damage(p, DROID_HEADLESS_BLEED * DT, p.lastHitBy, p.lastWeapon, true);
      if (!p.alive) continue;
      // Venom burns on in the blood, a little each tick.
      if (p.venom > 0) {
        const v = Math.min(p.venom, VENOM_RATE);
        p.venom -= v;
        this.damage(p, v, NO_OWNER, W_VENOM, true);
        if (!p.alive) continue;
      }
      if (this.coralTick(p) && !p.alive) continue;
      if (p.pilot >= 0) {
        // Flying the dropship: the clone stands inert; the view (and interest) is the ship's.
        const sh = this.ships[p.pilot]!;
        p.camX = sh.x + SHIP_W / 2;
        p.camY = sh.y + SHIP_H / 2 + 40;
        p.buildReq = null;
        continue;
      }
      if (p.rc >= 0) {
        // Driving the watchdog from afar: the same, the view is the watchdog's.
        const t = this.tanks[p.rc]!;
        p.camX = t.x + tankW(t) / 2;
        p.camY = t.y + tankH(t) / 2;
        p.buildReq = null;
        continue;
      }
      this.handleInventory(p);
      this.handleWeapon(p, prev);
      if (p.buildReq) this.tryBuild(p);
      // The view this client sees (and so its interest area): pushed down the
      // barrel by the weapon's scope distance while scoping, but no further
      // than the line of sight runs (a scope never sees through terrain).
      p.camX = p.cx;
      p.camY = p.cy;
      if (p.buttons & BTN_SCOPE) {
        const aim = dequantizeAim(p.aimQ);
        const sh = shoulderAt(p.body.x, p.body.y, p.body.stance, Math.cos(aim) < 0, this.shoulderPt);
        let reach = sightLine(this.terrain, sh.x, sh.y, aim, WEAPONS[p.weapon]?.scope ?? 0);
        // A clone (or anything else) in the line stops it too.
        if (this.segmentActor(sh.x, sh.y, sh.x + Math.cos(aim) * reach, sh.y + Math.sin(aim) * reach, p.id, this.scopeQ) >= 0) reach *= this.scopeQ.t;
        p.camX = sh.x + Math.cos(aim) * reach;
        p.camY = sh.y + Math.sin(aim) * reach;
      }
    }

    this.stepCrafts();
    this.stepTanks();
    this.stepDoors();
    this.stepGeysers();
    this.stepFlora();
    this.stepBeasts();
    if (this.water.length && this.tick % WATER_TICKS === 0) this.settleWater();
    this.stepWaves();
    this.stepShips();
    this.shipCollisions();
    // (Riders onto their seats once every vehicle, tanks and dropships alike, has moved.)
    this.seatRiders();
    this.bodyCollisions();
    this.shipSpotting();
    this.stepItems();
    this.stepTraps();
    this.stepMines();
    this.stepBurners();
    this.stepEvac();
    this.rebuildGrid();
    // Bring the distance field up to date with this tick's terrain edits (only
    // the chunks that changed). Removals later in the tick only increase true
    // clearance, so the field stays conservative for them.
    this.field.update();
    this.projectiles.step(this.collider, DT, this.segmentActor, this.onProjEnd);
    const actors = this.actors;
    actors.clear();
    for (const p of this.players) {
      if (!p || !p.alive || this.shielded(p)) continue;
      if (p.tank >= 0) actors.add(p.id, p.body.x, p.body.y, p.body.vx, p.body.vy, ACTOR_W, EXPOSED_H);
      else actors.add(p.id, p.body.x, p.top, p.body.vx, p.body.vy, ACTOR_W, STANCE_H[p.body.stance]);
    }
    for (let k = 0; k < MAX_TANKS; k++) {
      const t = this.tanks[k];
      // Immune to its own jet flames and shell fragments.
      // The tilted hull dips below its box by up to tankSink: cover that too.
      if (t) actors.add(TANK_ID_BASE + k, t.x, t.y, t.vx, t.vy, tankW(t), tankH(t) + tankSink(t.a, t.s), TANK_MASS * t.s, t.pilot !== 255 ? t.pilot : t.owner !== 255 ? t.owner : NO_OWNER, 0.3);
    }
    for (let k = 0; k < MAX_SHIPS; k++) {
      const sh = this.ships[k];
      // Immune to its own (and its caller's) fragments; its downwash doesn't drag it.
      if (sh) actors.add(SHIP_ID_BASE + k, sh.x, sh.y, sh.vx, sh.vy, SHIP_W, SHIP_H, SHIP_MASS, sh.owner, 0.2);
    }
    for (let k = 0; k < MAX_CRAFTS; k++) {
      const c = this.crafts[k];
      if (!c) continue;
      const e = craftHalfExtents(c.a, this.ext);
      // Immune to its own exhaust flames, and not dragged by its own air jet.
      actors.add(CRAFT_ID_BASE + k, c.x - e.x, c.y - e.y, c.vx, c.vy, 2 * e.x, 2 * e.y, CRAFT_MASS, exhaustOwner(c), 0);
    }
    this.grains.step(this.collider, DT, this.hooks, actors);
    // Apply what particles and fields did to bodies this tick.
    for (let a = 0; a < actors.n; a++) {
      const id = actors.id[a];
      if (id >= SHIP_ID_BASE) {
        const sh = this.ships[id - SHIP_ID_BASE];
        if (sh) {
          sh.vx += actors.dvx[a];
          sh.vy += actors.dvy[a];
        }
        continue;
      }
      if (id >= TANK_ID_BASE) {
        const t = this.tanks[id - TANK_ID_BASE];
        if (t) {
          t.vx += actors.dvx[a];
          t.vy += actors.dvy[a];
        }
        continue;
      }
      if (id >= CRAFT_ID_BASE) {
        const c = this.crafts[id - CRAFT_ID_BASE];
        if (c) {
          c.vx += actors.dvx[a];
          c.vy += actors.dvy[a];
        }
        continue;
      }
      const p = this.players[id];
      if (!p || !p.alive) continue;
      p.body.vx += actors.dvx[a];
      p.body.vy += actors.dvy[a];
    }
    // Resolve every particle impact against the part of the body it struck.
    for (let h = 0; h < actors.hitN; h++) {
      const hid = actors.id[actors.hitSlot[h]];
      if (hid >= SHIP_ID_BASE) {
        const sh = this.ships[hid - SHIP_ID_BASE];
        if (sh) this.hitShip(hid - SHIP_ID_BASE, sh.x + actors.hitLx[h], sh.y + actors.hitLy[h], 0, 0, actors.hitEnergy[h], actors.hitWound[h] + actors.hitBurn[h], actors.hitOwner[h]);
        continue;
      }
      if (hid >= TANK_ID_BASE) {
        const t = this.tanks[hid - TANK_ID_BASE];
        if (t) this.hitTank(hid - TANK_ID_BASE, t.x + actors.hitLx[h], t.y + actors.hitLy[h], 0, 0, actors.hitEnergy[h], actors.hitWound[h] + actors.hitBurn[h], actors.hitOwner[h]);
        continue;
      }
      if (hid >= CRAFT_ID_BASE) {
        const c = this.crafts[hid - CRAFT_ID_BASE];
        if (!c) continue;
        // Hit points are relative to the box the rocket was entered with.
        const e = craftHalfExtents(c.a, this.ext);
        this.hitCraft(hid - CRAFT_ID_BASE, c.x - e.x + actors.hitLx[h], c.y - e.y + actors.hitLy[h], 0, 0, actors.hitEnergy[h], actors.hitWound[h] + actors.hitBurn[h], actors.hitOwner[h]);
        continue;
      }
      const p = this.players[hid];
      if (!p || !p.alive) continue;
      const by = actors.hitOwner[h] === NO_OWNER ? p.id : actors.hitOwner[h];
      if (this.friendly(by, p)) continue;
      const self = by === p.id ? 0.5 : 1; // your own fragments hurt less
      const part = this.partHit(p, actors.hitLx[h], actors.hitLy[h]);
      const res = this.strikeScratch;
      res.hp = 0;
      res.detached.length = 0;
      res.vital = false;
      if (actors.hitBurn[h] > 0) harm(p.parts, part, actors.hitBurn[h] * self, res);
      if (actors.hitEnergy[h] > 0) strike(p.parts, part, actors.hitEnergy[h] * self, actors.hitWound[h], res);
      this.applyStrike(p, res, by, actors.hitWeapon[h], p.body.x + actors.hitLx[h], p.body.y + actors.hitLy[h]);
    }
    this.flushPixels();

    const t1 = performance.now();
    this.replicate();
    const t2 = performance.now();
    this.lastStepMs = t1 - t0;
    this.lastReplicateMs = t2 - t1;
  }

  // ---------------------------------------------------------------- replication

  private encodeActors(): void {
    const w = this.actorRecords.reset();
    for (const p of this.players) {
      if (!p) continue;
      const b = p.body;
      w.u8(p.id);
      w.u16(clampU16(b.x * POS_SCALE));
      w.u16(clampU16((b.y + Y_BIAS) * POS_SCALE));
      w.i16(clampI16(b.vx * VEL_SCALE));
      w.i16(clampI16(b.vy * VEL_SCALE));
      w.u16(p.aimQ);
      w.u8(this.flagsOf(p));
      w.u8(Math.max(0, Math.ceil(p.hp)));
      w.u8(p.weapon);
      w.u16(p.parts.mask | (b.stance << STANCE_SHIFT) | (b.faction << FACTION_SHIFT)); // stance and vendor ride in the spare top bits
    }
  }

  private flagsOf(p: Player): number {
    const aim = dequantizeAim(p.aimQ);
    return (
      (p.alive ? F_ALIVE : 0) |
      (p.body.onGround ? F_GROUND : 0) |
      (p.body.jetting ? F_JET : 0) |
      (p.firing ? F_FIRING : 0) |
      (p.alive && p.reloadLeft > 0 ? F_RELOAD : 0) |
      (Math.cos(aim) < 0 ? F_FACE_LEFT : 0) |
      (p.parts.cls << F_CLASS_SHIFT)
    );
  }

  /** Each creature's R_BEASTS record (after its slot) as of this tick, a revision bumped whenever it changes, and (scratch) whether it's in the view being written. */
  private readonly beastRec: (Uint8Array | null)[] = new Array(MAX_BEASTS).fill(null);
  private readonly beastRev = new Int32Array(MAX_BEASTS);
  private readonly beastOf: (Beast | null)[] = new Array(MAX_BEASTS).fill(null);
  private readonly beastInView = new Uint8Array(MAX_BEASTS);
  private beastRevs = 0;

  /**
   * Encode every creature's record once a tick (not once per client), and
   * note which have changed since the last tick: a client that has one as
   * it stands is sent only its slot.
   */
  private encodeBeasts(): void {
    for (let k = 0; k < MAX_BEASTS; k++) {
      const b = this.beasts[k];
      const pts = b ? this.beastPts[k] : null;
      if (!b || !pts || !pts.length) {
        this.beastRec[k] = null;
        this.beastOf[k] = null;
        continue;
      }
      const w = this.tmp.reset();
      w.u8(b.kind);
      w.u8(b.seed);
      w.u8(Math.max(0, Math.min(255, Math.round((b.hp / BEAST_BUILD[b.kind].hp) * 255))));
      w.u8(Math.round(b.lift * 255));
      w.u8((b.attached ? 1 : 0) | (b.frozen > 0 ? 2 : 0) | (b.coil >= 0 || b.hold >= 0 ? 4 : 0) | (b.gem ? 8 : 0) | (b.frenzy > 0 ? 16 : 0) | (b.carry > 0 ? 32 : 0));
      w.u16(clampU16(pts[0] * POS_SCALE));
      w.u16(clampU16((pts[1] + Y_BIAS) * POS_SCALE));
      for (let i = 2; i < pts.length; i += 2) {
        w.u8(Math.max(-127, Math.min(127, Math.round((pts[i] - pts[i - 2]) * BEAST_SCALE))) & 255);
        w.u8(Math.max(-127, Math.min(127, Math.round((pts[i + 1] - pts[i - 1]) * BEAST_SCALE))) & 255);
      }
      const rec = w.finish();
      const old = this.beastRec[k];
      if (this.beastOf[k] !== b || !old || old.length !== rec.length || !old.every((v, i) => v === rec[i])) {
        this.beastRev[k] = ++this.beastRevs;
        this.beastRec[k] = rec;
        this.beastOf[k] = b;
      }
    }
  }

  private replicate(): void {
    this.encodeActors();
    const actorBytes = this.actorRecords.buf;
    const ACTOR_REC = 16; // bytes per encoded actor, see encodeActors()
    const broadcast = this.broadcast.finish();
    this.encodeBeasts();
    const sendScores = this.tick % TICKS_PER_SCORE === 0;
    let scores: Uint8Array | null = null;
    if (sendScores) {
      const w = this.tmp.reset();
      w.u8(R_SCORES);
      w.u8(this.playerCount);
      for (const p of this.players) {
        if (!p) continue;
        w.u8(p.id);
        w.u16(p.kills);
        w.u16(p.deaths);
        w.u16(Math.min(65535, p.gold));
        w.u16(p.wins);
      }
      scores = w.finish();
    }

    for (const p of this.players) {
      if (!p || p.bot) continue; // bots read the world directly
      const w = this.frame.reset();
      w.u8(S_FRAME);
      w.u32(this.tick);
      w.u16(p.ack & 0xffff);
      // A new wave's map comes first: every record after it applies to the new terrain.
      if (this.waveRecord) w.bytes(this.waveRecord);
      else if (p.needsMap && this.mapRecord) {
        // A newcomer generates the map from its seed: it holds every chunk
        // nobody has touched since, and is sent only the ones that changed.
        w.bytes(this.mapRecord);
        for (let ci = 0; ci < CHUNK_COUNT; ci++) if (this.chunkVersion[ci] === this.pristine[ci]) p.known[ci] = this.chunkVersion[ci];
      }
      p.needsMap = false;
      if (p.geysersSeen !== this.geysersRev) {
        p.geysersSeen = this.geysersRev;
        w.u8(R_GEYSERS);
        w.u8(this.geysers.length);
        for (const g of this.geysers) {
          w.u16(clampU16(g.x));
          w.u16(clampU16(g.y + Y_BIAS));
          w.u8((g.cave ? GF_CAVE : 0) | (g.fuse > 0 ? GF_RUMBLE : 0) | (g.toxic > 0 ? GF_TOXIC : 0) | (g.dead ? GF_DEAD : 0));
        }
      }
      if (p.floraSeen !== this.floraRev) {
        p.floraSeen = this.floraRev;
        const n = this.flora.length;
        w.u8(R_FLORA);
        w.u16(n);
        for (let b = 0; b < n; b += 8) {
          let byte = 0;
          for (let k = 0; k < 8 && b + k < n; k++) if (this.floraDead[b + k]) byte |= 1 << k;
          w.u8(byte);
        }
        w.u16(this.floraFuse.size);
        for (const i of this.floraFuse.keys()) w.u16(i);
      }
      if (p.waterSeen !== this.waterRev) {
        p.waterSeen = this.waterRev;
        w.u8(R_WATER);
        w.u8(this.water.length);
        for (const b of this.water) {
          w.u16(clampU16(b.x));
          w.u16(clampU16(b.y + Y_BIAS));
          w.u16(clampU16(b.level + Y_BIAS));
          w.u16(clampU16(b.volume));
        }
      }
      // The Stoneburner beacons and molten cores: every frame while any are about (they move, count down), once more when they're gone.
      if (this.burners.length || this.feet.length || p.burnersSeen !== this.burnersRev) {
        p.burnersSeen = this.burnersRev;
        w.u8(R_BURNERS);
        w.u8(Math.min(255, this.burners.length));
        for (const b of this.burners.slice(0, 255)) {
          w.u16(clampU16(b.x));
          w.u16(clampU16(b.y + Y_BIAS));
          w.u16(Math.max(0, b.fuse));
          w.u8(b.phase);
        }
        w.u8(Math.min(255, this.feet.length));
        for (const f of this.feet.slice(0, 255)) {
          w.u16(clampU16(f.x));
          w.u16(clampU16(f.y + Y_BIAS));
          w.u16(f.life);
        }
      }
      if (p.minesSeen !== this.minesRev) {
        p.minesSeen = this.minesRev;
        w.u8(R_MINES);
        w.u8(this.mines.length);
        for (const m of this.mines) {
          w.u16(clampU16(m.x));
          w.u16(clampU16(m.y + Y_BIAS));
          w.u8(m.owner);
          w.u8(m.team);
          w.u8(m.arm > 0 ? 0 : 1);
        }
      }
      if (this.mode === 'ffa') {
        w.u8(R_ROUND);
        w.u8(this.phase);
        w.u16(this.wave);
        w.u16(Math.min(65535, this.phaseTimer));
        w.u8(this.winner);
        w.u8(this.remaining());
        // 0 not in this wave, 1 in it (alive, riding in, or waiting for a rocket), 2 out.
        w.u8(!p.inWave ? 0 : this.inPlay(p) ? 1 : 2);
        w.u8(this.waveMode);
        w.u8(this.remaining(Team.Red));
        w.u8(this.remaining(Team.Green));
        w.u8(this.kings[0]);
        w.u8(this.kings[1]);
        w.u8(this.remaining(Team.Blue));
        w.u8(this.remaining(Team.Gold));
        if (this.waveMode === GameMode.Siege) w.u16(this.siegeLives);
        if (this.waveMode === GameMode.Pvp) {
          // PvP: who leads (and on how many kills), and our own kills and deaths this wave.
          let lead: Player | null = null;
          for (const o of this.players) if (o && o.inWave && (!lead || o.waveKills > lead.waveKills || (o.waveKills === lead.waveKills && o.waveDeaths < lead.waveDeaths))) lead = o;
          w.u8(lead ? lead.id : 255);
          w.u8(Math.min(255, lead ? lead.waveKills : 0));
          w.u8(Math.min(255, p.waveKills));
          w.u8(Math.min(255, p.waveDeaths));
        }
        if (this.waveMode === GameMode.Extraction) {
          const at = this.idolAt();
          w.u8(at ? at.holder : 255);
          w.u16(clampU16(at ? at.x : 0));
          w.u16(clampU16((at ? at.y : 0) + Y_BIAS));
          w.u8(this.evac.state);
          w.u16(clampU16(this.evac.x));
          w.u16(clampU16(this.evac.y + Y_BIAS));
          w.u16(this.evac.state === Evac.Inbound ? this.evac.eta : 0);
        }
        // The result up: the vote on the next mode (how many modes, 0: no vote; each one's votes; ours).
        if (this.phase === Phase.Victory) {
          const counts = this.voting ? this.voteCounts() : [];
          w.u8(counts.length);
          for (const c of counts) w.u8(Math.min(255, c));
          if (counts.length) w.u8(p.vote);
        }
        if (this.waveMode === GameMode.Extermination) {
          // Extermination: how many it began with, then each basilisk (or the dragon) left (its head, and whether it's awake).
          w.u8(this.lairBeasts);
          const left = this.beasts.filter((b): b is Beast => !!b && wyrm(b.kind));
          w.u8(left.length);
          for (const b of left) {
            w.u16(clampU16(b.fx));
            w.u16(clampU16(b.fy + Y_BIAS));
            w.u8(b.frozen > 0 ? 0 : 1);
          }
        }
        if (this.dungeon && p.trapsSeen !== this.trapsRev) {
          p.trapsSeen = this.trapsRev;
          w.u8(R_TRAPS);
          w.u8(this.trapSpent.length);
          for (const b of this.trapSpent) w.u8(b);
        }
        if (p.teamsSeen !== this.teamsRev) {
          p.teamsSeen = this.teamsRev;
          w.u8(R_TEAMS);
          for (let id = 0; id < MAX_PLAYERS; id++) w.u8(this.players[id]?.team ?? Team.None);
        }
      }

      // Own state at full float64 precision: the client's predictor rebases on
      // it and replays unacked inputs, so any rounding here would show up as
      // prediction error.
      const b = p.body;
      w.u8(R_SELF);
      w.u8(this.flagsOf(p));
      w.f64(b.x);
      w.f64(b.y);
      w.f64(b.vx);
      w.f64(b.vy);
      w.f64(b.fuel);
      w.u8(Math.max(0, Math.ceil(p.hp)));
      w.u8(p.weapon);
      w.u8(Math.ceil(p.cooldown));
      w.u8(Math.min(255, p.reloadLeft));
      w.u16(Math.min(65535, p.gold));
      // The whole inventory (it's small) and which slot is in hand.
      w.u8(p.inv.length);
      for (const it of p.inv) {
        w.u8(it.weapon);
        w.u8(it.ammo);
      }
      w.u8(p.slot);
      w.u8(p.invVersion);
      w.u8(p.spectate);
      w.u16(p.alive ? 0 : p.respawn);
      w.u16(p.parts.mask);
      for (let part = 0; part < PART_COUNT; part++) w.u8(partHealth(p.parts, part));
      w.u8(b.stance | (b.downTicks << 2) | (b.faction << 6));
      w.u8(p.pilot >= 0 ? p.pilot : 255);
      w.u8(p.rc >= 0 ? p.rc : 255);
      // (Riding: the vehicle's slot | seat << 4, and the top bit for a dropship.)
      w.u8(p.surf >= 0 ? p.surf | (p.seat << 4) : p.surfShip >= 0 ? p.surfShip | (p.seat << 4) | 128 : 255);

      // Riding in: the rocket at full precision too, since the client
      // predicts it from this state the same way it predicts its clone.
      const ride = !p.alive && p.delivering >= 0 ? this.crafts[p.delivering] : null;
      if (ride && ride.passenger === p.id) {
        w.u8(R_CRAFT_SELF);
        w.u8(p.delivering);
        w.f64(ride.x);
        w.f64(ride.y);
        w.f64(ride.vx);
        w.f64(ride.vy);
        w.f64(ride.a);
        w.f64(ride.w);
        w.f64(ride.targetX);
        w.u16(Math.min(65535, ride.timer));
        w.u8(ride.phase);
        w.u8(ride.parts);
        w.u8(ride.prevButtons);
        for (let part = 0; part < CRAFT_PARTS; part++) w.u8(Math.max(0, Math.min(255, Math.ceil(ride.partHp[part]))));
      }

      // Driving: the tank at full precision, for the client's predictor.
      const drive = p.alive && p.tank >= 0 ? this.tanks[p.tank] : null;
      if (drive && drive.pilot === p.id) {
        w.u8(R_TANK_SELF);
        w.u8(p.tank);
        w.f64(drive.x);
        w.f64(drive.y);
        w.f64(drive.vx);
        w.f64(drive.vy);
        w.f64(drive.fuel);
        w.f64(drive.a);
        w.f64(drive.w);
        w.u8((drive.chute ? 1 : 0) | (drive.onGround ? 2 : 0) | (drive.jetting ? 4 : 0));
        w.u8(drive.parts);
        for (let part = 0; part < TANK_PARTS; part++) w.u16(Math.max(0, Math.ceil(drive.partHp[part])));
        w.u8(Math.min(255, Math.ceil(drive.cannonCd * TICK_RATE)));
      }

      // Entity interest: full-rate inside the view rect, radar blips outside.
      const vx0 = p.camX - VIEW_HALF_W - ENTITY_INTEREST_MARGIN;
      const vx1 = p.camX + VIEW_HALF_W + ENTITY_INTEREST_MARGIN;
      const vy0 = p.camY - VIEW_HALF_H - ENTITY_INTEREST_MARGIN;
      const vy1 = p.camY + VIEW_HALF_H + ENTITY_INTEREST_MARGIN;
      const sendFar = (this.tick + p.id) % FAR_UPDATE_INTERVAL === 0;
      const countAt = w.pos + 1;
      w.u8(R_ACTORS);
      w.u8(0);
      let near = 0;
      const far: Player[] = [];
      let rec = 0;
      for (const o of this.players) {
        if (!o) continue;
        const off = rec++ * ACTOR_REC;
        if (o === p) continue;
        if (o.cx >= vx0 && o.cx <= vx1 && o.cy >= vy0 && o.cy <= vy1) {
          w.bytes(actorBytes.subarray(off, off + ACTOR_REC));
          near++;
        } else if (sendFar && o.alive) {
          far.push(o);
        }
      }
      w.buf[countAt] = near;
      if (far.length) {
        w.u8(R_BLIPS);
        w.u8(far.length);
        for (const o of far) {
          w.u8(o.id);
          w.u8(Math.max(0, Math.min(255, Math.floor(o.cx / BLIP_X))));
          w.u8(Math.max(0, Math.min(255, Math.floor(o.cy / BLIP_Y))));
        }
      }

      // Projectile events, filtered by a generous radius (they travel).
      const px0 = vx0 - 480;
      const px1 = vx1 + 480;
      const py0 = vy0 - 360;
      const py1 = vy1 + 360;
      for (const s of this.projSpawns) {
        if (s.x >= px0 && s.x <= px1 && s.y >= py0 && s.y <= py1) {
          w.bytes(s.bytes);
          p.seenProj.add(s.id);
        }
      }
      for (const e of this.projEnds) {
        const seen = p.seenProj.delete(e.id);
        if (seen || (e.x >= vx0 && e.x <= vx1 && e.y >= vy0 && e.y <= vy1)) w.bytes(e.bytes);
      }
      for (const h of this.hits) {
        if (h.x >= vx0 && h.x <= vx1 && h.y >= vy0 && h.y <= vy1) w.bytes(h.bytes);
      }

      this.replicateTerrain(p, w);

      // Drop rockets near the view (wide margin: they fall in from the sky).
      let nCraft = 0;
      const craftAt = w.pos + 1;
      for (let k = 0; k < MAX_CRAFTS; k++) {
        const c = this.crafts[k];
        if (!c) continue;
        if (c.x < vx0 - 200 || c.x > vx1 + 200 || c.y > vy1 + 120 || c.y < vy0 - 500) continue;
        if (nCraft === 0) {
          w.u8(R_CRAFTS);
          w.u8(0);
        }
        nCraft++;
        w.u8(k);
        w.u16(clampU16(c.x * POS_SCALE));
        w.u16(clampU16((c.y + Y_BIAS) * POS_SCALE));
        w.i16(clampI16(c.vx * VEL_SCALE));
        w.i16(clampI16(c.vy * VEL_SCALE));
        w.u16(quantizeAim(c.a));
        w.u8(Math.round(c.thrust * 255));
        w.u8(Math.max(0, Math.min(255, Math.ceil((c.hp / CRAFT_HP) * 255)))); // (as a share of a whole hull)
        w.u8(c.passenger);
        w.u8(c.phase);
        w.u8(c.parts);
      }
      if (nCraft > 0) w.buf[craftAt] = nCraft;

      // Tanks: only a handful, so every one of them, every frame (they matter from afar).
      let nTank = 0;
      for (const t of this.tanks) if (t) nTank++;
      if (nTank > 0) {
        w.u8(R_TANKS);
        w.u8(nTank);
        for (let k = 0; k < MAX_TANKS; k++) {
          const t = this.tanks[k];
          if (!t) continue;
          w.u8(k);
          w.u16(clampU16(t.x * POS_SCALE));
          w.u16(clampU16((t.y + Y_BIAS) * POS_SCALE));
          w.i16(clampI16(t.vx * VEL_SCALE));
          w.i16(clampI16(t.vy * VEL_SCALE));
          w.u16(quantizeAim(t.aim));
          w.u8(Math.round(t.a * 100) & 255); // tilt, centiradians (signed)
          const remote = t.pilot !== 255 && this.players[t.pilot]?.rc === k;
          w.u8((t.chute ? 1 : 0) | (t.faceLeft ? 2 : 0) | (t.jetting ? 4 : 0) | (t.firedSmg ? 8 : 0) | (t.firedCannon ? 16 : 0) | (t.onGround ? 32 : 0) | (isDog(t) ? 64 : 0) | (remote ? 128 : 0));
          w.u8(t.parts);
          w.u16(Math.max(0, Math.ceil(t.hp)));
          w.u8(t.pilot);
          w.u8(t.owner);
          w.u8(t.kind);
          // Its riders (tank surfing), each id | seat << 8: clients draw them on their seats.
          const riders = this.ridersOf(k);
          w.u8(riders.length);
          for (const o of riders) w.u16(o.id | (o.seat << 8));
        }
      }

      // Wildlife in view, every frame (and an empty list once the last has gone, so the client drops them).
      // Each one's record was encoded once this tick (encodeBeasts); one this client already has as it
      // stands (lying in wait, say, or a nest) goes as its slot alone, flagged.
      let nBeast = 0;
      for (let k = 0; k < MAX_BEASTS; k++) {
        const pts = this.beasts[k] ? this.beastPts[k] : null;
        // (By its head, with room for its body: a basilisk's is long.)
        const bk = this.beasts[k]?.kind ?? 0;
        const m = wyrm(bk) ? 220 * wyrmScale(bk) : 60;
        const inView = !!pts && pts.length > 0 && pts[0] >= vx0 - m && pts[0] <= vx1 + m && pts[1] >= vy0 - m && pts[1] <= vy1 + m;
        this.beastInView[k] = inView ? 1 : 0;
        if (inView) nBeast++;
      }
      if (nBeast > 0 || p.beastsSent) {
        w.u8(R_BEASTS);
        w.u8(nBeast);
        for (let k = 0; k < MAX_BEASTS; k++) {
          if (!this.beastInView[k]) {
            p.beastSeen[k] = -1; // (out of its view: the client forgets it)
            continue;
          }
          if (p.beastSeen[k] === this.beastRev[k]) w.u8(k | BEAST_SAME);
          else {
            w.u8(k);
            w.bytes(this.beastRec[k]!);
            p.beastSeen[k] = this.beastRev[k];
          }
        }
        p.beastsSent = nBeast > 0;
      } else p.beastSeen.fill(-1);

      // Dropships: all of them, every frame (there are only a few).
      let nShip = 0;
      for (const sh of this.ships) if (sh) nShip++;
      if (nShip > 0) {
        w.u8(R_SHIPS);
        w.u8(nShip);
        for (let k = 0; k < MAX_SHIPS; k++) {
          const sh = this.ships[k];
          if (!sh) continue;
          w.u8(k);
          w.u16(clampU16(sh.x * POS_SCALE));
          w.u16(clampU16((sh.y + Y_BIAS) * POS_SCALE));
          w.i16(clampI16(sh.vx * VEL_SCALE));
          w.i16(clampI16(sh.vy * VEL_SCALE));
          w.u8(Math.round(sh.a * 100) & 255);
          w.u8(sh.parts);
          w.u16(Math.max(0, Math.ceil(sh.hp)));
          w.u8(sh.bombs);
          w.u8(sh.owner);
          w.u8(sh.team);
          w.u16(quantizeAim(sh.aim[0]));
          w.u16(quantizeAim(sh.aim[1]));
          w.u8((sh.doors > 0 ? 1 : 0) | (sh.fired[0] ? 2 : 0) | (sh.fired[1] ? 4 : 0) | (sh.leaving ? 8 : 0) | ((sh.mission & 3) << 4) | (sh.pilot !== 255 ? 64 : 0) | ((sh.mission >> 2) << 7));
          for (let e = 0; e < 4; e++) w.u8(Math.round(sh.thrust[e] * 255));
          // Its riders, as a tank's: each id | seat << 8.
          const riders = this.shipRidersOf(k);
          w.u8(riders.length);
          for (const o of riders) w.u16(o.id | (o.seat << 8));
        }
      }

      // What our side's dropships have spotted (a few times a second).
      const seen = (this.tick + p.id) % 3 === 0 ? this.spots.get(this.spotKey(p.team, p.id)) : undefined;
      if (seen && seen.size > 0) {
        w.u8(R_SPOTTED);
        const at = w.pos;
        w.u8(0);
        let n = 0;
        for (const [id] of seen) {
          const o = this.players[id];
          if (!o || !o.alive || n === 255) continue;
          w.u8(id);
          w.u16(clampU16(o.cx));
          w.u16(clampU16(o.cy + Y_BIAS));
          n++;
        }
        w.buf[at] = n;
      }

      this.replicateItems(p, w, vx0, vy0, vx1, vy1);

      const roster = this.pendingRoster.get(p.id);
      if (roster) {
        w.bytes(roster);
        this.pendingRoster.delete(p.id);
      }
      w.bytes(broadcast);
      if (scores) w.bytes(scores);

      const out = w.finish();
      p.bytesOut += out.length;
      p.link.send(out);
    }

    this.ops.length = 0;
    this.waveRecord = null;
    this.itemsGone.length = 0;
    this.projSpawns.length = 0;
    this.projEnds.length = 0;
    this.hits.length = 0;
    this.broadcast.reset();
  }

  /**
   * Terrain replication. Each client has a per-chunk "known version". Ops
   * touching a chunk the client holds and is looking at are forwarded and
   * advance its version; ops it does not receive invalidate its copy. Chunks
   * in view whose version is stale get a fresh RLE snapshot, nearest first,
   * under a per-tick byte budget. Distant destruction therefore costs nothing
   * until the player actually goes there.
   */
  private replicateTerrain(p: Player, w: Writer): void {
    const known = p.known;
    const cx0 = Math.max(0, Math.floor((p.camX - VIEW_HALF_W - CHUNK_INTEREST_MARGIN) / CHUNK));
    const cx1 = Math.min(CHUNKS_X - 1, Math.floor((p.camX + VIEW_HALF_W + CHUNK_INTEREST_MARGIN) / CHUNK));
    const cy0 = Math.max(0, Math.floor((p.camY - VIEW_HALF_H - CHUNK_INTEREST_MARGIN) / CHUNK));
    const cy1 = Math.min(CHUNKS_Y - 1, Math.floor((p.camY + VIEW_HALF_H + CHUNK_INTEREST_MARGIN) / CHUNK));

    for (const op of this.ops) {
      let relevant = false;
      for (const ci of op.chunks) {
        const x = ci % CHUNKS_X;
        const y = (ci / CHUNKS_X) | 0;
        if (known[ci] >= 0 && x >= cx0 && x <= cx1 && y >= cy0 && y <= cy1) {
          relevant = true;
          break;
        }
      }
      if (relevant) {
        w.bytes(op.bytes);
        // A collapse makes a cell depend on the cells below it and beside it
        // (never above), so a chunk only stays in sync if every chunk of this
        // op in its own chunk row and in the rows below it was in sync too.
        // op.chunks is row-major top-down: walk it bottom-up, row by row.
        let belowOk = true;
        let end = op.chunks.length;
        while (end > 0) {
          const rowOf = (op.chunks[end - 1] / CHUNKS_X) | 0;
          let start = end - 1;
          while (start > 0 && ((op.chunks[start - 1] / CHUNKS_X) | 0) === rowOf) start--;
          let ok: boolean = belowOk;
          for (let k = start; k < end && ok; k++) if (known[op.chunks[k]] !== op.pre[k]) ok = false;
          for (let k = start; k < end; k++) known[op.chunks[k]] = ok ? op.pre[k] + 1 : -1;
          belowOk = ok;
          end = start;
        }
      } else {
        for (const ci of op.chunks) known[ci] = -1;
      }
    }

    // Stale chunks in view: nearest first, within budget.
    const ccx = p.camX / CHUNK - 0.5;
    const ccy = p.camY / CHUNK - 0.5;
    const stale: number[] = [];
    for (let y = cy0; y <= cy1; y++) {
      for (let x = cx0; x <= cx1; x++) {
        const ci = y * CHUNKS_X + x;
        if (known[ci] !== this.chunkVersion[ci]) stale.push(ci);
      }
    }
    if (stale.length === 0) return;
    const dist = (ci: number) => {
      const dx = (ci % CHUNKS_X) - ccx;
      const dy = ((ci / CHUNKS_X) | 0) - ccy;
      return dx * dx + dy * dy;
    };
    stale.sort((a, b) => dist(a) - dist(b));
    let budget = CHUNK_BYTES_PER_TICK;
    for (const ci of stale) {
      const snap = this.chunkSnapshot(ci);
      if (snap.length > budget && budget < CHUNK_BYTES_PER_TICK) break;
      budget -= snap.length;
      w.bytes(snap);
      known[ci] = this.chunkVersion[ci];
    }
  }
}

const TICKS_PER_SCORE = 30;
const COUNTDOWN_TICKS = 30 * 4;
const VICTORY_TICKS = 30 * 7;
/** With a vote on the next mode, the result stays up longer: time to vote. */
const VOTE_TICKS = 30 * 15;
/** Everyone's voted: the count this soon. */
const VOTE_SETTLE = 30 * 2;
/** A wave's time limit. */
const WAVE_TICKS = 30 * 60 * 4;
/** Regicide waves run longer: fortresses take a while to crack. */
const REGICIDE_TICKS = 30 * 60 * 12;
/** Regicide reinforcements: dead soldiers drop back in after this long. */
const REGICIDE_RESPAWN_TICKS = 30 * 10;
/** PvP waves run five minutes, and the dead are back in five seconds. */
const PVP_TICKS = 30 * 60 * 5;
const PVP_RESPAWN_TICKS = 30 * 5;
/**
 * Which modes the waves cycle through: Regicide, PvP and team waves (Last
 * Team Standing) by turns, with a Siege, an Extraction and an Extermination now and then. Last Man Standing
 * stays out of the rotation (a room can still be given it).
 */
const DEFAULT_ROTATION = [GameMode.Regicide, GameMode.Pvp, GameMode.Lts, GameMode.Siege, GameMode.Regicide, GameMode.Pvp, GameMode.Lts, GameMode.Extraction, GameMode.Extermination];
/** Siege attackers come back faster than anyone (their lives are what's counted). */
const SIEGE_RESPAWN_TICKS = 30 * 6;
/** The most cells of a speck a vehicle grinds out of its way (crushSpecks), and of one it's perched on. */
const TANK_SPECK = 12;
const TANK_PERCH = 4;
/** Extermination waves run twenty-four minutes. */
const EXTERMINATION_TICKS = 30 * 60 * 24;
/** A lair basilisk hears anyone this near (cells), replans its way every so many ticks, and searches so many grid cells for it at most. */
const LAIR_HEAR = 1400;
/**
 * DUNE: where its two dragons start (fractions across the map), how far
 * under the sand (cells), and where its heavy weapons lie out on the sand.
 */
const DUNE_DRAGONS = [0.3, 0.7];
const DUNE_DRAGON_DEPTH = 150;
const DUNE_CACHES = [0.15, 0.4, 0.6, 0.85];
/** A basilisk's body battering whoever it rolls into, awake and moving: harm a blow (and a vehicle's share of hull), and how often the same one can be struck. */
const BAS_BODY_HARM = 22;
const BAS_BODY_CRUSH = 0.08;
const BAS_BODY_CD = 18;
const BAS_REPLAN = 12;
const BAS_SEARCH = 24000;
const NAV_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const NAV_DY = [0, 0, 1, -1, 1, -1, 1, -1];
/** The lair's basilisks: half a wild one's hit points (four to kill, not one), a long, hard fight each. */
const LAIR_HP = 0.5;
/** Extermination is fought on foot, mostly: at most this many vehicles (tanks, watchdogs, tarantulas, moles, dropships) about at once (more radio calls for one are refused). */
const LAIR_VEHICLES = 3;
/** What lies by each tunnel mouth in the lair, just clear of the hole. */
const LAIR_CACHE = [WeaponId.Bazooka, WeaponId.ATCannon, WeaponId.Autocannon];
const TUNNEL_CLEAR = 24;
/** Extraction waves run twelve minutes. */
const EXTRACTION_TICKS = 30 * 60 * 12;
/** How long the extraction rocket takes to come once the idol surfaces. */
const EVAC_ETA = 30 * 20;

/**
 * How a match's bots spread over the skill levels (1 beginner to 5 expert):
 * clustered round veteran, a few at either end.
 */
export const SKILL_SHARE = [0.08, 0.22, 0.4, 0.22, 0.08];
/** A skill level drawn from that spread (`u` uniform in [0, 1)). */
export function drawSkill(u: number): number {
  for (let lv = 1, acc = 0; lv <= 5; lv++) if (u < (acc += SKILL_SHARE[lv - 1])) return lv;
  return 3;
}

/** Gold a new player joins with (enough for one bunker), Cortex Command style starting funds. */
const STARTING_GOLD = 60;
/** Who a rocket's exhaust flames are credited to (and so who it is immune to). */
function exhaustOwner(c: Craft): number {
  return c.passenger !== 255 ? c.passenger : c.delivered !== 255 ? c.delivered : NO_OWNER;
}

/** Actor-field ids for drop rockets: CRAFT_ID_BASE + craft slot. */
const CRAFT_ID_BASE = 128;
/** Actor-field ids for tanks: TANK_ID_BASE + tank slot (above every rocket's). */
const TANK_ID_BASE = CRAFT_ID_BASE + MAX_CRAFTS;
const TANK_MASS = 200;
/** Actor-field ids for dropships, above every tank's. */
const SHIP_ID_BASE = TANK_ID_BASE + MAX_TANKS;
/** The digger's bite (radius and core) when it reaches cement: a core this wide takes cement two cells round (MAT_ADAMANT: a quarter of it). */
const DIGGER_ADAMANT = 8;
/**
 * A locked-on shot is set true on its target (World.lockedAim) if the aim
 * was within this many cells of it at its range: what a target moving at a
 * run covers in the lag between the client's view and the server. (A
 * distance, not an angle: the lag's the same however far off they are.)
 */
const LOCK_SLACK = 36;
/** Ids for wildlife (wildlife.ts), above every dropship's. */
const BEAST_ID_BASE = SHIP_ID_BASE + MAX_SHIPS;
/** How many creatures a world holds at most, the most out at once on a cave map and on any other, and how often one more comes up. */
const MAX_BEASTS = 40;
const BEASTS_CAVES = 7;
const BEASTS_PLAIN = 4;
/** Coral nests on a cave map and on any other (seeders don't count toward the creatures: they're the nests' broods). */
const NESTS_CAVES = 3;
/** The lair's lesser life: wasps' nests on its roof, millipedes (a few asps among them) about its floors and walls. */
const LAIR_NESTS = 4;
const LAIR_CRAWLERS = 12;
const LAIR_ASP_SHARE = 0.2;
const NESTS_PLAIN = 2;
/** The most cave spider packs about at once (in the lair, and anywhere else), and the creature slots a new pack leaves free (for wasps to hatch into). */
const PACKS = 2;
const LAIR_PACKS = 3;
const PACK_ROOM = 8;
/** The crawlers every map has one of before the rest come up by the luck of the roll. */
const CRAWLER_MIX = [BeastKind.Spider, BeastKind.Asp, BeastKind.Millipede];
/** Of the creatures that come up, how many are asps (the rest millipedes). */
const ASP_SHARE = 0.55;
const BEAST_RESPAWN = 30 * 25;
/** After a basilisk is killed, how long before another comes up. */
const BASILISK_RESPAWN = 30 * 60 * 6;
const SHIP_MASS = 120;
/** Station altitude over the ground, turret reach, how long a radio waits between calls. */
const SHIP_ALT = 80;
/** Remote piloting: how fast the held point slides sideways and climbs or sinks (cells/s). */
const PILOT_SPEED = 260;
const PILOT_CLIMB = 150;
/** The dropship brain: how close an enemy must be to an ally to need covering, how far out it strikes and scouts, its leash (solo / team), how far it sees, and how long a sighting lasts. */
const SHIP_COVER_R = 320;
const SHIP_STRIKE_R = 900;
const SHIP_SCOUT_AHEAD = 480;
const SHIP_LEASH = 750;
const SHIP_LEASH_TEAM = 1100;
const SHIP_SIGHT = 620;
/** Air to air: how near an enemy dropship (to it, or to any of its side) draws it in, the stand-off it fights from, and its guns' reach against ships. */
const SHIP_INTERCEPT_R = 700;
const SHIP_STANDOFF = 170;
const SHIP_AA_RANGE = 460;
/** Dropships ramming: how much of their closing speed they bounce back with, the speed below which it's only a nudge, and hull damage per unit of closing speed beyond that. */
const SHIP_BOUNCE = 0.5;
const SHIP_RAM_MIN = 25;
const SHIP_RAM_DAMAGE = 9;
/** Clones colliding: how much of their closing speed they bounce back with, the closing speed below which it's only a shove (a sprint into someone is), and wounds per unit beyond. */
const BODY_BOUNCE = 0.3;
const BODY_RAM_MIN = 260;
const BODY_RAM_DAMAGE = 0.12;
/** A clone and an enemy dropship's hull: how little the ship gives, the closing speed below which it's only a bounce, and the damage to the clone and to the hull beyond it. */
const SHIP_BODY_SHOVE = 0.03;
const SHIP_RAM_BODY_MIN = 160;
const SHIP_RAM_BODY_DAMAGE = 0.25;
const SHIP_RAM_HULL_DAMAGE = 1.5;
const SPOT_TICKS = 30 * 4;
const SHIP_GUN_RANGE = 300;
const CALL_COOLDOWN = 30 * 30;
/** How close (cells, box to box) a clone must be to climb into a tank. */
const BOARD_REACH = 10;
/** How close (cells, box to box) a clone must be to a friendly vehicle to climb up and ride it. */
const SURF_REACH = 14;
/** How near a dropship seat a clone must get (cells, across plus half of up and down) to climb onto it. */
const SHIP_SURF_REACH = 26;
/** A bunker door's hit points: most of a tank's hull. */
export const DOOR_HP = TANK_HP * 0.6;
/** A laid landmine: where it sits (on the ground cell at x, y), who laid it and their side, and ticks until it's armed. */
/** The player who always spawns with a Stoneburner. */
const STONEBURNER_NAME = 'mage777';
/** A Stoneburner beacon (stoneburner.ts): where, how it's moving, its countdown (or the missile's fall), whose; what it's stuck to (a clone, a vehicle) and where on it. */
interface Burner {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  fuse: number;
  owner: number;
  onPlayer: number;
  onTank: number;
  ox: number;
  oy: number;
  age: number;
}
/** A blob of a Stoneburner strike's molten sludge: where, how it's moving, ticks of burning left, whose. */
interface Foot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  owner: number;
}
/** At most this many blobs of sludge about at once (several strikes' worth). */
const MAX_SLUDGE = 200;
interface Mine {
  id: number;
  x: number;
  y: number;
  owner: number;
  team: number;
  arm: number;
}
/** Landmines: ticks to arm, at most this many down per clone, and on the whole map. */
const MINE_ARM = 45;
const MINES_EACH = 4;
const MAX_MINES = 64;
const CRAFT_MASS = 60; // vs 8 for a clone: shoves move it far less
/** Base parts (armour is reached through them) and their share of blast overpressure. */
/** segmentActor `kind` for a laser beam: test vehicles only. */
const LASER_VEHICLES_ONLY = -2;
/** How much recoil a clone feels, by stance: standing, crouched, prone. */
const RECOIL_BRACE = [1, 0.55, 0.3];
/** What nanobots can grow back, in order. */
const REGROWABLE = [Part.GunArm, Part.OffArm, Part.LegF, Part.LegB, Part.Jetpack];
/** ...for a droid: its legs, then its plating (its nanobots weld them back on). */
const DROID_REGROWABLE = [...DROID_LEGS, DroidPart.Plating];
/**
 * How a blast (or a heavy shot's shock) spreads over a body: each base
 * part's share (armour takes its part's, being struck first); 0 for armour
 * slots and empty ones.
 */
const SPLASH_SHARE = [0.45, 0.55, 0.6, 0.6, 0.6, 0.6, 0, 0, 0.5, 0];
/** A droid's: the turret and chassis, and each of six legs a smaller share (and the plating none: it's armour). */
const DROID_SPLASH_SHARE = [0.35, 0.6, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0, 0];
const shareOf = (cls: number) => (cls === ClassId.Droid ? DROID_SPLASH_SHARE : SPLASH_SHARE);

function clampU16(v: number): number {
  return Math.max(0, Math.min(65535, Math.round(v)));
}
function clampI16(v: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(v)));
}
