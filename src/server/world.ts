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
import { ActorField, NO_OWNER, PK, Particles, W_CRAFT, W_SHIP, W_TANK, W_TRAP, W_LASER, W_RAM, applyCarve, carveExtent, craftFragments, craftPartFragments, dropToSupport, explosionFragments, releaseCarve, spillGold } from '../shared/particles.ts';
import { Mat } from '../shared/materials.ts';
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
  R_WAVE,
  R_TEAMS,
  R_TANKS,
  R_TANK_SELF,
  R_SHIPS,
  R_SHIP_PART,
  R_SHIP_BOOM,
  CALL_COST,
  WATCHDOG_COST,
  TARANTULA_COST,
  MOLE_COST,
  CallKind,
  R_TANK_PART,
  R_TANK_BOOM,
  Evac,
  GameMode,
  TEAMS_IN_MODE,
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
import { Rng } from '../shared/rng.ts';
import { Terrain, forChunksInRect } from '../shared/terrain.ts';
import { LASER_MAX, LASER_MIN, PROJ_LASER, laserEnergy, laserWidth, laserWound, PROJ_IDOL, BLAST_IMPULSE, DIGGER_CORE, DIGGER_R, DIGGER_REACH, PROJ, PROJ_BUILD, PROJ_DIG, PROJ_RADIO, PROJ_REPAIR, PROJ_MINE, ProjKind, REGROW_TICKS, HEAL_R, HEAL_SPREAD, MEND_TICKS, REPAIR_HP, REPAIR_WOUND, WeaponId, SHOULDER_X, SHOULDER_Y, WEAPONS, fireInterval, muzzlePoint } from '../shared/weapons.ts';
import { type Dungeon, EVAC_H, EVAC_W, ROOM_B, ROOM_L, ROOM_R, ROOM_T, SPIKE_DEPTH, TrapKind, Y0, cellX, cellY } from '../shared/dungeon.ts';
import { sightLine } from '../shared/scope.ts';
import { MapKind, generateWorld, lastCaves, lastComplexes, lastDungeon, lastSiege } from '../shared/worldgen.ts';
import { ATTACKERS, DEFENDERS, SIEGE_LIVES, SIEGE_TICKS, type SiegeMap } from '../shared/siege.ts';
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
  /** Nanobot work done toward regrowing this clone's next missing limb (repair kit). */
  regrow = 0;
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
  /** Wave modes the round room cycles through (wave 1 plays the first). */
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
  minesRev = 0;
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

  constructor(seed = 1337, opts: { mode?: 'sandbox' | 'ffa'; bots?: number; rotation?: number[]; tanks?: boolean } = {}) {
    this.rng = new Rng(seed ^ 0x9e3779b9);
    this.mode = opts.mode ?? 'sandbox';
    this.tankDrops = opts.tanks ?? this.mode === 'ffa';
    this.rotation = opts.rotation?.length ? opts.rotation : DEFAULT_ROTATION;
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
  }

  /** The kind of map wave `n` is fought on. */
  private mapKindFor(n: number): number {
    if (this.mode !== 'ffa') return MapKind.Plain;
    const mode = this.modeOfWave(n);
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
    this.mapLoot = lastComplexes.flatMap((c) => c.loot ?? []);
    this.doors = lastComplexes.flatMap((c) => (c.doors ?? []).map((d) => ({ ...d, open: 0, hp: DOOR_HP, broken: false })));
    this.trapSpent.fill(0);
    this.trapCd.fill(0);
    this.trapsRev++;
    this.evac.state = Evac.None;
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

  /** Mode of wave `n` (1-based). */
  modeOfWave(n: number): number {
    return this.rotation[(Math.max(1, n) - 1) % this.rotation.length];
  }

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
        if (this.remaining() <= 1 || timeUp) {
          let best: Player | null = null;
          for (const p of this.players) {
            if (!p || !p.inWave || !(p.alive || p.delivering >= 0 || p.pendingSpawn)) continue;
            if (!best || p.waveKills > best.waveKills || (p.waveKills === best.waveKills && p.hp > best.hp)) best = p;
          }
          this.winner = best ? best.id : 255;
          if (best) best.wins++;
          this.setPhase(Phase.Victory, VICTORY_TICKS);
        }
        break;
      }
      case Phase.Victory:
        if (--this.phaseTimer <= 0) {
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
    this.setPhase(Phase.Victory, VICTORY_TICKS);
  }

  /**
   * Regicide: a king falls, the other side wins (every member scores). A
   * king who leaves the game hands the crown to a living teammate. When time
   * runs out, the side with more kills this wave takes it.
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
    if (!fallen || (!this.kingAlive(Team.Red) && !this.kingAlive(Team.Green))) {
      const kills = [0, 0];
      for (const p of this.players) if (p && p.inWave && p.team !== Team.None) kills[p.team] += p.waveKills;
      winner = kills[0] === kills[1] ? 255 : kills[0] > kills[1] ? Team.Red : Team.Green;
    }
    this.winner = winner;
    if (winner !== 255) for (const p of this.players) if (p && p.inWave && p.team === winner) p.wins++;
    this.setPhase(Phase.Victory, VICTORY_TICKS);
  }

  /**
   * Siege: the defenders' king falls, the attackers win; the attackers run
   * out of lives (and of clones still fighting) or the ten minutes run out
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
    this.setPhase(Phase.Victory, VICTORY_TICKS);
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
    this.setPhase(Phase.Victory, VICTORY_TICKS);
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
    this.setPhase(Phase.Victory, VICTORY_TICKS);
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
    return this.regicideLive || this.extractionLive || this.pvpLive || this.siegeLive;
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
    if (this.tankDrops && mode !== GameMode.Extraction && mode !== GameMode.Siege) this.dropTanks(1 + this.rng.int(2));
    if (mode === GameMode.Regicide) this.startRegicide();
    if (mode === GameMode.Siege) this.startSiege();
    if (mode === GameMode.Extraction) this.startExtraction();
    // The bunkers' own weapons, lying where they were left (all wave long).
    for (const l of this.mapLoot) {
      this.spawnItem(l.weapon, WEAPONS[l.weapon].clip, l.x, l.y, 0, 0);
      this.items[this.items.length - 1].age = -30 * 60 * 15;
    }
    this.setPhase(Phase.Live, mode === GameMode.Regicide ? REGICIDE_TICKS : mode === GameMode.Extraction ? EXTRACTION_TICKS : mode === GameMode.Pvp ? PVP_TICKS : mode === GameMode.Siege ? SIEGE_TICKS : WAVE_TICKS);
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
    // A door in the bite takes the damage instead (its steel never carves): cutters and lasers wear it down.
    if (core > 0) {
      const d = this.doorAt(x, y, core);
      if (d) this.damageDoor(d, core * core, owner);
    }
    const removed = this.removedScratch;
    const detached = this.detachedScratch;
    const n = applyCarve(this.terrain, x, y, r, core, removed, detached);
    if (n === 0) return 0;
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
    this.leaveTank(victim, false);
    // Regicide: soldiers come back by drop rocket after a while; the king never does.
    // PvP: everyone comes back, quickly. Siege: defenders come back; attackers
    // while their side has lives to spend (each death spends one).
    let back = (this.regicideLive && !this.isKing(victim)) || this.extractionLive || this.pvpLive;
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
    if (actor >= SHIP_ID_BASE) {
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
      else if (p.surf >= 0) this.dismount(p, true);
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
    const aim = dequantizeAim(p.aimQ);
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
        if (this.terrain.isSolid(Math.floor(ox + cos * r), Math.floor(oy + sin * r))) {
          d = Math.min(DIGGER_REACH, r + 1); // the core (radius DIGGER_CORE) still covers that cell
          break;
        }
      }
      this.carve(ox + cos * d, oy + sin * d, DIGGER_R, DIGGER_CORE, 0, p.id);
      p.gold += this.terrain.removedByMat[Mat.Gold];
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
    const aim = dequantizeAim(p.aimQ);
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);
    const sh = shoulderAt(p.body.x, p.body.y, p.body.stance, cos < 0, this.shoulderPt);
    this.beam(p.id, sh.x + cos * def.muzzle, sh.y + sin * def.muzzle, aim, laserWidth(power), laserEnergy(power), laserWound(power), power, power, p.id);
    // Its kick, the stronger the charge.
    const brace = RECOIL_BRACE[p.body.stance] ?? 1;
    p.body.vx -= cos * (10 + 110 * power) * brace;
    p.body.vy -= sin * (10 + 110 * power) * brace * 0.6;
  }

  /** A tarantula's laser: a thin beam out of its head, at whatever it's aimed at. */
  private spiderBeam(t: Tank, by: number): void {
    const m = tankMuzzle(t, false, t.aim, this.tankMz);
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
    // A fresh, random kit (always a primary, a digger and a materializer).
    p.inv = spawnLoadout(this.rng);
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
    const t = p.surf >= 0 ? this.tanks[p.surf] : null;
    p.surf = -1;
    const b = p.body;
    b.onGround = false;
    if (t) {
      b.vx = t.vx;
      b.vy = Math.min(0, t.vy);
    }
    if (jump) b.vy -= 190;
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
      const impact = stepTank(t, this.terrain, DT, buttons);
      if (brain) t.pilot = 255;
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
    return dogThink(t, mem, owner ? { cx: owner.cx, cy: owner.cy, alive: owner.alive } : null, foes, (x0, y0, x1, y1) => this.lineClear(x0, y0, x1, y1), isSpider(t) ? SPIDER_KIT : DOG_KIT);
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
    const m = tankMuzzle(t, cannon, t.aim, this.tankMz);
    if (isSpider(t)) {
      // A missile off the rack, from one tube or the other (they take turns), a little ragged.
      const a = m.a + (this.rng.next() - 0.5) * 0.06;
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
        const a = m.a + (this.rng.next() - 0.5) * 0.16;
        const sp = PLASMA_SPEED * (0.92 + this.rng.next() * 0.16);
        this.spawnProj(this.nextProjId++, ProjKind.Plasma, owner, m.x, m.y, Math.cos(a) * sp + t.vx * 0.5, Math.sin(a) * sp + t.vy * 0.5);
        t.firedCannon = true;
      } else {
        const a = m.a + (this.rng.next() - 0.5) * 2 * SMG_SPREAD * 0.8;
        this.spawnProj(this.nextProjId++, ProjKind.MoleRound, owner, m.x, m.y, Math.cos(a) * SMG_SPEED + t.vx * 0.25, Math.sin(a) * SMG_SPEED + t.vy * 0.25);
        t.firedSmg = true;
      }
      return;
    }
    const a = m.a + (this.rng.next() - 0.5) * 2 * (cannon ? 0.01 : SMG_SPREAD);
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
      if (!p || !p.alive || p.tank >= 0 || p.surf >= 0) continue;
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
    if (kind === CallKind.Pilot) return this.togglePilot(id);
    const p = this.players[id];
    const cost = kind === CallKind.Watchdog ? WATCHDOG_COST : kind === CallKind.Tarantula ? TARANTULA_COST : kind === CallKind.Mole ? MOLE_COST : CALL_COST;
    if (!p || !p.alive || p.tank >= 0 || p.weapon !== WeaponId.Radio || p.callCd > 0 || p.gold < cost) return false;
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
  togglePilot(id: number): boolean {
    const p = this.players[id];
    if (!p) return false;
    // The remote cycles: our dropship, then our watchdog, then our tarantula, then back to the clone.
    const pets: number[] = [];
    for (const which of [isDog, isSpider]) {
      const k = this.tanks.findIndex((t) => t !== null && which(t) && t.owner === id && !t.chute && (t.pilot === 255 || t.pilot === id));
      if (k >= 0) pets.push(k);
    }
    const dog = pets.find((k) => this.tanks[k]!.pilot === 255) ?? -1;
    if (p.rc >= 0) {
      const next = pets[pets.indexOf(p.rc) + 1];
      this.endRemote(p);
      if (next !== undefined && p.alive) this.startRemote(p, next);
      return true;
    }
    if (p.pilot >= 0) {
      this.endPilot(p);
      if (dog >= 0 && p.alive) this.startRemote(p, dog);
      return true;
    }
    if (!p.alive || p.tank >= 0) return false;
    const slot = this.ships.findIndex((sh) => sh !== null && sh.owner === id && !sh.leaving && sh.pilot === 255);
    if (slot < 0) {
      if (dog < 0) return false;
      this.startRemote(p, dog);
      return true;
    }
    const sh = this.ships[slot]!;
    p.pilot = slot;
    sh.pilot = id;
    sh.holdX = sh.x + SHIP_W / 2;
    sh.holdY = sh.y;
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
          const a = sh.aim[side] + (this.rng.next() - 0.5) * 0.06;
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
    const live = (p: Player | null): p is Player => !!p && p.alive && p.tank < 0 && p.surf < 0 && p.delivering < 0;
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
      if (p.surf >= 0 && p.buttons & BTN_UP && !(prev & BTN_UP) && p.rc < 0 && p.pilot < 0) this.dismount(p, true);
      const impact = p.tank >= 0 || p.surf >= 0 ? 0 : stepBody(p.body, p.pilot >= 0 || p.rc >= 0 ? 0 : p.buttons, terrain, DT);
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
      if (!p.alive) continue;
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
    this.seatRiders();
    this.stepDoors();
    this.stepWaves();
    this.stepShips();
    this.shipCollisions();
    this.bodyCollisions();
    this.shipSpotting();
    this.stepItems();
    this.stepTraps();
    this.stepMines();
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

  private replicate(): void {
    this.encodeActors();
    const actorBytes = this.actorRecords.buf;
    const ACTOR_REC = 16; // bytes per encoded actor, see encodeActors()
    const broadcast = this.broadcast.finish();
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
      w.u8(p.surf >= 0 ? p.surf | (p.seat << 4) : 255);

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
        w.u8(Math.max(0, Math.min(255, Math.ceil(c.hp))));
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
        }
      }

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
/** A wave's time limit. */
const WAVE_TICKS = 30 * 60 * 4;
/** Regicide waves run longer: fortresses take a while to crack. */
const REGICIDE_TICKS = 30 * 60 * 6;
/** Regicide reinforcements: dead soldiers drop back in after this long. */
const REGICIDE_RESPAWN_TICKS = 30 * 10;
/** PvP waves run five minutes, and the dead are back in five seconds. */
const PVP_TICKS = 30 * 60 * 5;
const PVP_RESPAWN_TICKS = 30 * 5;
/**
 * Which modes the waves cycle through: Regicide, PvP and team waves (Last
 * Team Standing) by turns, with a Siege and an Extraction now and then. Last Man Standing
 * stays out of the rotation (a room can still be given it).
 */
const DEFAULT_ROTATION = [GameMode.Regicide, GameMode.Pvp, GameMode.Lts, GameMode.Siege, GameMode.Regicide, GameMode.Pvp, GameMode.Lts, GameMode.Extraction];
/** Siege attackers come back faster than anyone (their lives are what's counted). */
const SIEGE_RESPAWN_TICKS = 30 * 6;
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
/** A bunker door's hit points: most of a tank's hull. */
export const DOOR_HP = TANK_HP * 0.6;
/** A laid landmine: where it sits (on the ground cell at x, y), who laid it and their side, and ticks until it's armed. */
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
