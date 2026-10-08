import { type Body, BTN_FIRE, BTN_RELOAD, BTN_SCOPE, newBody, stepBody } from '../shared/actor.ts';
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
import { BuildResult, type BuildBlocker, PIECES, applyBuild, canBuild } from '../shared/build.ts';
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
  FAR_UPDATE_INTERVAL,
  MAX_PLAYERS,
  POS_SCALE,
  RESPAWN_TICKS,
  VEL_SCALE,
  VIEW_HALF_H,
  VIEW_HALF_W,
  WORLD_H,
  WORLD_W,
} from '../shared/constants.ts';
import { Collider, DistanceField } from '../shared/field.ts';
import { Projectiles, segmentBox } from '../shared/kernels.ts';
import { ActorField, NO_OWNER, PK, Particles, W_CRAFT, applyCarve, carveExtent, craftFragments, craftPartFragments, dropToSupport, explosionFragments, releaseCarve, spillGold } from '../shared/particles.ts';
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
  R_WAVE,
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
import { BLAST_IMPULSE, DIGGER_CORE, DIGGER_R, DIGGER_REACH, PROJ, PROJ_BUILD, PROJ_DIG, SHOULDER_X, SHOULDER_Y, WEAPONS, fireInterval, muzzlePoint } from '../shared/weapons.ts';
import { generateWorld } from '../shared/worldgen.ts';

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
  inWave = false;
  pendingSpawn = false;
  spectate = 255;
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
    return this.body.y + ACTOR_H / 2;
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
  private readonly craftStep = newCraftStep();
  private readonly pt = { x: 0, y: 0 };
  private readonly ext = { x: 0, y: 0 };
  readonly field = new DistanceField(this.terrain);
  readonly collider = new Collider(this.terrain, this.field);
  readonly projectiles = new Projectiles(4096);
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

  constructor(seed = 1337, opts: { mode?: 'sandbox' | 'ffa'; bots?: number } = {}) {
    this.rng = new Rng(seed ^ 0x9e3779b9);
    this.mode = opts.mode ?? 'sandbox';
    this.botFill = Math.min(MAX_PLAYERS, opts.bots ?? 0);
    this.mapSeed = seed >>> 0;
    generateWorld(this.terrain, this.mapSeed);
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

  /** Remember the freshly generated map, so newcomers can make it themselves instead of downloading it. */
  private sealMap(): void {
    this.pristine.set(this.chunkVersion);
    const w = new Writer(8 + CHUNK_COUNT * 4);
    w.u8(R_WAVE);
    w.u32(this.mapSeed);
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
    const clean = name.replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16) || `Clone${id}`;
    return this.join(id, clean, link, null);
  }

  /** A server-side bot takes a free slot (FFA fills empty slots with them). */
  addBot(): Player | null {
    const id = this.players.indexOf(null);
    if (id < 0) return null;
    return this.join(id, botName(this.rng), { send() {} }, new BotBrain(this.rng.nextU32()));
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
    this.writeRoster(this.broadcast, p, true);
    if (bot) return p;
    // The newcomer needs the whole roster; it gets it in its first frame.
    const w = this.tmp.reset();
    for (const o of this.players) if (o && o !== p) this.writeRoster(w, o, true);
    this.pendingRoster.set(id, w.finish());
    return p;
  }

  // ---------------------------------------------------------------- free for all

  /** Clones still in the wave: alive, riding in, or waiting for their rocket. */
  remaining(): number {
    let n = 0;
    for (const p of this.players) if (p && p.inWave && (p.alive || p.delivering >= 0 || p.pendingSpawn)) n++;
    return n;
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
        if (this.remaining() <= 1) {
          const last = this.players.find((p) => p && p.inWave && (p.alive || p.delivering >= 0 || p.pendingSpawn));
          this.winner = last ? last.id : 255;
          if (last) last.wins++;
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
    for (const p of this.players) {
      if (!p) continue;
      p.inWave = true;
      p.pendingSpawn = true;
      p.respawn = 1 + this.rng.int(60);
      p.spectate = 255;
    }
    this.setPhase(Phase.Live, 0);
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
    generateWorld(this.terrain, this.mapSeed);
    this.crafts.fill(null);
    this.items.length = 0;
    this.grains.n = 0;
    this.projectiles.n = 0;
    this.pendingPixels.clear();
    for (let ci = 0; ci < CHUNK_COUNT; ci++) this.chunkVersion[ci]++;
    for (const p of this.players) {
      if (!p) continue;
      p.alive = false;
      p.inWave = false;
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
      for (let k = 1; k <= MAX_PLAYERS; k++) {
        const o = this.players[(Math.max(0, t ? t.id : p.id) + k) % MAX_PLAYERS];
        if (o && o.alive && o !== p) {
          p.spectate = o.id;
          break;
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
    const clean = text.replace(/[\u0000-\u001f]/g, '').slice(0, 120);
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
      if (!p || !p.alive) continue;
      const x0 = Math.floor(p.body.x);
      const y0 = Math.floor(p.body.y);
      forChunksInRect(x0, y0, x0 + ACTOR_W - 1, y0 + ACTOR_H - 1, (ci) => {
        if (this.grid[ci].length === 0) this.gridUsed.push(ci);
        this.grid[ci].push(p.id);
      });
    }
  }

  /** First actor box entered by a swept segment, via the actor spatial hash. */
  private segmentActor = (x0: number, y0: number, x1: number, y1: number, owner: number, out: { t: number }): number => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    let best = -1;
    let bestT = 2;
    forChunksInRect(Math.floor(Math.min(x0, x1)), Math.floor(Math.min(y0, y1)), Math.floor(Math.max(x0, x1)), Math.floor(Math.max(y0, y1)), (ci) => {
      const bucket = this.grid[ci];
      for (let k = 0; k < bucket.length; k++) {
        const id = bucket[k];
        if (id === owner) continue;
        const b = this.players[id]!.body;
        const t = segmentBox(x0, y0, dx, dy, b.x, b.y, b.x + ACTOR_W, b.y + ACTOR_H);
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
    out.t = bestT;
    return best;
  };

  private readonly segA = { x: 0, y: 0 };
  private readonly segB = { x: 0, y: 0 };
  private readonly strikeScratch: StrikeResult = newStrike();

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
      mobility(p.parts.mask, p.mob);
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
    // Everything it carried spills where it fell, for anyone to take.
    this.dropAll(victim);
    // Out of the wave: watch whoever did it.
    if (this.mode === 'ffa') victim.spectate = attacker !== victim.id && this.players[attacker]?.alive ? attacker : 255;
    victim.deaths++;
    const killer = this.players[attacker];
    if (killer && killer !== victim) killer.kills++;
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
    if (actor >= CRAFT_ID_BASE) {
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
      const part = partAt(v.parts.mask, x - v.body.x + (pr.vx[i] / sp) * 2, y - v.body.y + (pr.vy[i] / sp) * 2, this.facingLeft(v));
      const res = this.strikeScratch;
      res.hp = 0;
      res.detached.length = 0;
      res.vital = false;
      strike(v.parts, part, energy, def.damage, res);
      v.body.vx += (rvx * def.mass) / 8;
      v.body.vy += (rvy * def.mass) / 8;
      this.applyStrike(v, res, owner, kind, x, y);
    }
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
        this.kickItems(x, y, def.splashR * 1.5);
        for (const p of this.players) {
          if (!p || !p.alive) continue;
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
              if (PARTS_BASE[part] && has(p.parts.mask, part)) harm(p.parts, part, amt * SPLASH_SHARE[part], res);
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
    }
    if (!item) {
      p.cooldown = Math.max(0, p.cooldown - 1);
      return;
    }
    const def = WEAPONS[item.weapon];
    const pressed = (p.buttons & BTN_FIRE) !== 0;
    const fresh = pressed && !(prev & BTN_FIRE);
    if (p.reloadLeft > 0 && --p.reloadLeft === 0) item.ammo = def.clip;
    if (def.clip > 0 && p.reloadLeft === 0) {
      const asked = p.buttons & BTN_RELOAD && !(prev & BTN_RELOAD) && item.ammo < def.clip;
      if (asked || (item.ammo === 0 && pressed)) this.startReload(p);
    }
    p.cooldown -= 1;
    const want = def.proj !== PROJ_BUILD && p.mob.canFire && (def.auto ? pressed : fresh) && p.reloadLeft === 0 && (def.clip === 0 || item.ammo > 0);
    if (want && p.cooldown <= 0) {
      this.fire(p, def);
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
    if (b & INV_PICKUP && !(prev & INV_PICKUP)) this.pickUp(p);
    if (b & INV_DROP && !(prev & INV_DROP)) this.dropHeld(p);
  }

  /**
   * Give a clone a weapon and put it in its hand (tests, and handy for admin
   * tools). Returns the inventory byte a client would now send for it.
   */
  equip(p: Player, weapon: number): number {
    let i = p.inv.findIndex((it) => it.weapon === weapon);
    if (i < 0) {
      if (p.inv.length >= INV_MAX) p.inv.pop();
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
    if (this.items.length > MAX_ITEMS) this.removeItem(0); // the oldest goes
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
      if (++it.age > ITEM_LIFE) {
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
    for (const c of this.crafts) {
      if (!c) continue;
      const e = craftHalfExtents(c.a, this.ext);
      bl.push({ x: c.x - e.x, y: c.y - e.y, w: 2 * e.x, h: 2 * e.y });
    }
    const res = canBuild(this.terrain, req.piece, req.gx, req.gy, p.body.x + SHOULDER_X, p.body.y + SHOULDER_Y, p.gold, bl);
    if (res !== BuildResult.Ok) return res;
    const piece = PIECES[req.piece];
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
    const ox = p.body.x + SHOULDER_X;
    const oy = p.body.y + SHOULDER_Y;
    if (def.proj === PROJ_DIG) {
      // Digger: vacuum terrain in front of the clone, banking any gold.
      this.carve(ox + cos * DIGGER_REACH, oy + sin * DIGGER_REACH, DIGGER_R, DIGGER_CORE, 0, p.id);
      p.gold += this.terrain.removedByMat[Mat.Gold];
      return;
    }
    const scoped = p.buttons & BTN_SCOPE ? 0.5 : 1;
    const a = aim + (this.rng.next() - 0.5) * 2 * def.spread * scoped * (p.mob.oneHanded ? 3 : 1);
    const vx = Math.cos(a) * def.speed + p.body.vx * 0.25;
    const vy = Math.sin(a) * def.speed + p.body.vy * 0.25;
    const id = this.nextProjId++;
    // Leave from the muzzle, unless the barrel is pushed into a wall: then
    // from the first solid cell along it (no shooting through walls).
    const m = muzzlePoint(def, p.body.x, p.body.y, aim, this.muzzleAt);
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
    if (this.projectiles.spawn(id, def.proj, p.id, sx, sy, vx, vy) < 0) return;
    const i = this.projectiles.n - 1;
    const w = this.tmp.reset();
    w.u8(R_PROJ_SPAWN);
    w.u32(id);
    w.u8(def.proj);
    w.u8(p.id);
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
    // Every clone rolls a class: scout, medium or heavy.
    resetBody(p.parts, rollClass(this.rng.next()));
    b.cls = p.parts.cls;
    mobility(p.parts.mask, p.mob);
    b.legs = p.mob.legs;
    b.jet = p.mob.jet;
    p.lastHitBy = 255;
    p.lastWeapon = 255;
    p.hp = ACTOR_MAX_HP;
    p.alive = true;
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
    const pick = () => 48 + CRAFT_W / 2 + this.rng.int(WORLD_W - 96 - CRAFT_W);
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
      for (const o of this.players) if (o && o.alive) gap = Math.min(gap, Math.abs(o.cx - cx));
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
    for (const p of this.players) {
      // The rider is thrown clear by the blast; its fragments can still find them.
      if (!p || !p.alive || p.id === rider) continue;
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
          if (PARTS_BASE[part] && has(p.parts.mask, part)) harm(p.parts, part, amt * SPLASH_SHARE[part], res);
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
      if (!p || !p.alive || p.id === c.passenger || p.id === c.delivered) continue;
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
      const res = this.strikeScratch;
      res.hp = 0;
      res.detached.length = 0;
      res.vital = false;
      harm(p.parts, Part.Head, rs * 0.12, res);
      harm(p.parts, Part.Torso, rs * 0.18, res);
      const by = c.passenger !== 255 ? c.passenger : c.lastHitBy !== 255 ? c.lastHitBy : p.id;
      this.applyStrike(p, res, by, W_CRAFT, p.cx, b.y);
    }
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
      const impact = stepBody(p.body, p.buttons, terrain, DT);
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
      if (p.body.y > WORLD_H) this.damage(p, 999, p.id, 255);
      // Open stumps bleed; bleeding out credits whoever did it.
      const n = stumps(p.parts.mask);
      if (n > 0) this.damage(p, n * BLEED_PER_STUMP * DT, p.lastHitBy, p.lastWeapon, true);
      if (!p.alive) continue;
      this.handleInventory(p);
      this.handleWeapon(p, prev);
      if (p.buildReq) this.tryBuild(p);
      // The view this client sees (and so its interest area): pushed down the
      // barrel by the weapon's scope distance while scoping.
      p.camX = p.cx;
      p.camY = p.cy;
      if (p.buttons & BTN_SCOPE) {
        const aim = dequantizeAim(p.aimQ);
        const reach = WEAPONS[p.weapon]?.scope ?? 0;
        p.camX += Math.cos(aim) * reach;
        p.camY += Math.sin(aim) * reach;
      }
    }

    this.stepCrafts();
    this.stepItems();
    this.rebuildGrid();
    // Bring the distance field up to date with this tick's terrain edits (only
    // the chunks that changed). Removals later in the tick only increase true
    // clearance, so the field stays conservative for them.
    this.field.update();
    this.projectiles.step(this.collider, DT, this.segmentActor, this.onProjEnd);
    const actors = this.actors;
    actors.clear();
    for (const p of this.players) if (p && p.alive) actors.add(p.id, p.body.x, p.body.y, p.body.vx, p.body.vy);
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
      const self = by === p.id ? 0.5 : 1; // your own fragments hurt less
      const part = partAt(p.parts.mask, actors.hitLx[h], actors.hitLy[h], this.facingLeft(p));
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
      w.u16(p.parts.mask);
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
      if (this.mode === 'ffa') {
        w.u8(R_ROUND);
        w.u8(this.phase);
        w.u16(this.wave);
        w.u16(Math.min(65535, this.phaseTimer));
        w.u8(this.winner);
        w.u8(this.remaining());
        w.u8(p.inWave ? 1 : 0);
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
/** Gold a new player joins with (enough for one bunker), Cortex Command style starting funds. */
const STARTING_GOLD = 60;
/** Who a rocket's exhaust flames are credited to (and so who it is immune to). */
function exhaustOwner(c: Craft): number {
  return c.passenger !== 255 ? c.passenger : c.delivered !== 255 ? c.delivered : NO_OWNER;
}

/** Actor-field ids for drop rockets: CRAFT_ID_BASE + craft slot. */
const CRAFT_ID_BASE = 128;
const CRAFT_MASS = 60; // vs 8 for a clone: shoves move it far less
/** Base parts (armour is reached through them) and their share of blast overpressure. */
const PARTS_BASE = [true, true, true, true, true, true, false, false, true];
const SPLASH_SHARE = [0.45, 0.55, 0.6, 0.6, 0.6, 0.6, 0, 0, 0.5];

function clampU16(v: number): number {
  return Math.max(0, Math.min(65535, Math.round(v)));
}
function clampI16(v: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(v)));
}
