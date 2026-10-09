import { Reader, rleDecode } from './codec.ts';
import { PART_COUNT } from './body.ts';
import { CRAFT_PARTS } from './craft.ts';
import { TANK_PARTS, TARANTULA_SCALE, TankKind, WATCHDOG_SCALE } from './tank.ts';
import { applyCarve } from './particles.ts';
import { applyBuild } from './build.ts';
import type { GroundItem } from './items.ts';
import { BLIP_X, BLIP_Y, CHUNK, CHUNK_COUNT, CHUNK_SHIFT, CHUNKS_X, MAX_PLAYERS } from './constants.ts';
import {
  R_ACTORS,
  R_BLIPS,
  R_BUILD,
  R_CARVE,
  R_CHAT,
  R_CHUNK,
  R_CRAFTS,
  R_CRAFT_BOOM,
  R_CRAFT_PART,
  R_CRAFT_SELF,
  R_DETACH,
  R_HIT,
  R_ITEMS,
  R_ITEMS_GONE,
  R_KILL,
  R_PIXELS,
  R_PROJ_END,
  R_PROJ_SPAWN,
  R_ROUND,
  R_TEAMS,
  R_TRAPS,
  R_BEAM,
  R_SPOTTED,
  R_MINES,
  GameMode,
  R_SHIPS,
  R_SHIP_PART,
  R_SHIP_BOOM,
  R_TANKS,
  R_TANK_SELF,
  R_TANK_PART,
  R_TANK_BOOM,
  R_ROSTER,
  R_SCORES,
  R_SELF,
  R_WAVE,
  Y_BIAS,
  dequantizeAim,
  PARTS_MASK,
  STANCE_SHIFT,
  FACTION_SHIFT,
} from './protocol.ts';
import type { Terrain } from './terrain.ts';

export interface SelfState {
  flags: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuel: number;
  hp: number;
  weapon: number;
  cooldown: number;
  /** Everything carried (weapon, rounds in its magazine), the slot in hand, and the inventory's version. */
  inv: { weapon: number; ammo: number }[];
  slot: number;
  invVersion: number;
  /** FFA: who we're watching while out of the wave (255 none). */
  spectate: number;
  reload: number; // ticks left reloading, 0 = not
  gold: number; // own gold, exact (the scoreboard only updates once a second)
  respawn: number;
  parts: number; // attached-part mask (body.ts)
  partHp: number[]; // 0..100 per part, 0 = gone
  stance: number; // actor.ts Stance
  downTicks: number; // how long down has been held (prediction)
  faction: number; // factions.ts: this clone's vendor
  /** The dropship slot we're remote-piloting (255: none). */
  pilot: number;
  /** The watchdog (tank slot) we're driving by remote (255: none). */
  rc: number;
}

export interface RemoteActor {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aim: number; // quantized
  flags: number;
  hp: number;
  weapon: number;
  parts: number;
  stance: number; // actor.ts Stance
  faction: number; // factions.ts: this clone's vendor
}

export interface KillInfo {
  killer: number;
  victim: number;
  weapon: number; // 255 = fall / world
  x: number; // victim center
  y: number;
  vx: number;
  vy: number;
  overkill: number; // damage beyond lethal, drives how violently it gibs
  seed: number;
  gold: number;
  parts: number; // what was left of the body when it died
}

export interface CraftState {
  slot: number;
  x: number; // centre
  y: number;
  vx: number;
  vy: number;
  a: number; // radians, 0 = nose up
  thrust: number; // 0..1
  hp: number;
  passenger: number; // player id or 255
  phase: number;
  parts: number; // attached-part mask (craft.ts)
}

/** A landmine on the ground (the cell it sits on), whose it is, and whether it's armed yet. */
export interface MineState {
  x: number;
  y: number;
  owner: number;
  team: number;
  armed: boolean;
}

export interface TankState {
  slot: number;
  x: number; // top-left
  y: number;
  vx: number;
  vy: number;
  aim: number;
  chute: boolean;
  faceLeft: boolean;
  jetting: boolean;
  firedSmg: boolean;
  firedCannon: boolean;
  onGround: boolean;
  parts: number; // attached-part mask (tank.ts)
  hp: number;
  pilot: number; // player id or 255
  a: number; // hull tilt, radians
  /** Size (tank.ts WATCHDOG_SCALE for a watchdog), its owner (255: none), and whether its driver is at a remote. */
  s: number;
  owner: number;
  remote: boolean;
  /** tank.ts TankKind. */
  kind: number;
}

export interface ShipState {
  slot: number;
  x: number; // box top-left
  y: number;
  vx: number;
  vy: number;
  a: number; // tilt, radians
  parts: number; // attached-part mask (dropship.ts)
  hp: number;
  bombs: number;
  owner: number; // who called it in
  team: number;
  aim: [number, number]; // turret aims, port and starboard
  doors: boolean; // bomb bay open
  fired: [boolean, boolean];
  leaving: boolean;
  thrust: number[]; // per engine, 0..1
  /** What it's doing (dropship.ts ShipMission). */
  mission: number;
  /** Being flown by remote control (by its caller). */
  piloted: boolean;
}

/** The tank this client drives, at full precision: everything stepTank needs, plus its damage. */
export interface SelfTankState {
  slot: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuel: number;
  chute: boolean;
  onGround: boolean;
  jetting: boolean;
  parts: number;
  partHp: number[];
  /** Ticks until the cannon is loaded. */
  cannonCd: number;
  a: number;
  w: number;
}

/** This client's own drop rocket at full precision: everything stepCraft needs. */
export interface SelfCraftState {
  slot: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  w: number;
  targetX: number;
  timer: number;
  phase: number;
  parts: number;
  prevButtons: number;
  partHp: number[];
}

export interface RoundState {
  phase: number; // Phase.*
  wave: number;
  timer: number; // ticks left in a countdown / victory
  winner: number; // player id (FFA) or Team (TDM), 255 none
  left: number; // clones still in the wave
  inWave: boolean; // are we in it
  out: boolean; // were we in it, and got fragged
  mode: number; // GameMode of this wave (between waves: the next one)
  teamLeft: number[]; // team modes: each team's clones still in the wave (red, green, blue, gold)
  kings: [number, number]; // Regicide: red's and green's king (player id, 255 none)
  /** Extraction: where the golden idol is (and who carries it, 255 nobody), and the extraction rocket. */
  idol?: { x: number; y: number; holder: number };
  evac?: { state: number; x: number; y: number; eta: number };
  /** PvP: the leader (player id, 255 none) and their kills; our own kills and deaths this wave. */
  pvp?: { leader: number; leaderKills: number; kills: number; deaths: number };
}

/** Callbacks for everything in a server frame except terrain, which is applied directly. */
export interface FrameHandler {
  self(s: SelfState): void;
  actors(list: RemoteActor[]): void;
  blips(list: { id: number; x: number; y: number }[]): void;
  /** Enemies our side's dropships can see, and where. */
  spotted(list: { id: number; x: number; y: number }[]): void;
  /**
   * Called after a carve op was applied (including the collapse it caused);
   * `removed` and `detached` hold x, y, mat triples.
   */
  carved(x: number, y: number, r: number, seed: number, debris: number, removed: number[], detached: number[]): void;
  chunkLoaded(ci: number): void;
  /** Ground items whose state this client must take (new in view, or changed). */
  items(list: GroundItem[]): void;
  /** Ground items this client should forget (taken, expired, far away). */
  itemsGone(ids: number[]): void;
  /** Called after a materializer op was applied; `placed` holds x, y, mat triples. */
  built(piece: number, builder: number, gx: number, gy: number, placed: number[]): void;
  projSpawn(id: number, kind: number, owner: number, x: number, y: number, vx: number, vy: number): void;
  /** `seed` reproduces the explosion's shrapnel and embers (explosionFragments). */
  projEnd(id: number, x: number, y: number, kind: number, detonate: boolean, seed: number): void;
  kill(k: KillInfo): void;
  roster(id: number, present: boolean, name: string): void;
  scores(list: { id: number; kills: number; deaths: number; gold: number; wins: number }[]): void;
  /** FFA round state, every frame. */
  round(s: RoundState): void;
  /** A laser beam fired (seq: to drop the copy sent for its other end). */
  beam(seq: number, x0: number, y0: number, x1: number, y1: number, power: number, owner: number): void;
  /** Extraction: which traps have gone off (bit per trap id). */
  traps(spent: Uint8Array): void;
  /** Every landmine laid (the whole list, when it changes). */
  mines(list: MineState[]): void;
  /** Every slot's team (Team.*), whenever it changes. */
  teams(teams: Uint8Array): void;
  /** A (new) map: regenerate the terrain from `seed` now; `hashes` are the server's per-chunk hashes of it. */
  /** A new map: its seed, kind (worldgen MapKind) and every chunk's hash as generated. */
  wave(seed: number, hashes: Uint32Array, kind: number): void;
  hit(victim: number, x: number, y: number, amount: number): void;
  chat(id: number, text: string): void;
  /** Drop rockets near this client's view this tick (absent when none). */
  crafts(list: CraftState[]): void;
  /** The drop rocket carrying this client, for prediction (absent when not riding). */
  selfCraft(s: SelfCraftState): void;
  /** A part was shot off drop rocket `slot` at (x, y); `seed` reproduces its fragments. */
  craftPart(slot: number, part: number, x: number, y: number, vx: number, vy: number, seed: number): void;
  /** Drop rocket `slot` blew apart at (x, y); `seed` reproduces its fragments. */
  craftBoom(slot: number, x: number, y: number, vx: number, vy: number, seed: number): void;
  /** Every tank this frame. */
  tanks(list: TankState[]): void;
  selfTank(s: SelfTankState): void;
  tankPart(slot: number, part: number, x: number, y: number, vx: number, vy: number, seed: number): void;
  tankBoom(slot: number, x: number, y: number, vx: number, vy: number, seed: number): void;
  /** Every dropship this frame. */
  ships(list: ShipState[]): void;
  shipPart(slot: number, part: number, x: number, y: number, vx: number, vy: number, seed: number): void;
  shipBoom(slot: number, x: number, y: number, vx: number, vy: number, seed: number): void;
  /** A body part was torn off actor `id` at (x, y), flying with (vx, vy). */
  detach(id: number, part: number, x: number, y: number, vx: number, vy: number): void;
}

const chunkScratch = new Uint8Array(CHUNK * CHUNK);
const removedScratch: number[] = [];
const detachedScratch: number[] = [];

/**
 * Decode the record stream of an S_FRAME body (reader positioned after the
 * header) and apply terrain records to `terrain` in order.
 */
export function applyFrameRecords(r: Reader, terrain: Terrain, h: FrameHandler): void {
  while (r.remaining > 0) {
    const type = r.u8();
    switch (type) {
      case R_SELF: {
        const self = {
          flags: r.u8(),
          x: r.f64(),
          y: r.f64(),
          vx: r.f64(),
          vy: r.f64(),
          fuel: r.f64(),
          hp: r.u8(),
          weapon: r.u8(),
          cooldown: r.u8(),
          reload: r.u8(),
          gold: r.u16(),
          inv: Array.from({ length: r.u8() }, () => ({ weapon: r.u8(), ammo: r.u8() })),
          slot: r.u8(),
          invVersion: r.u8(),
          spectate: r.u8(),
          respawn: r.u16(),
          parts: r.u16(),
          partHp: Array.from({ length: PART_COUNT }, () => r.u8()),
          stance: 0,
          downTicks: 0,
          faction: 0,
          pilot: 255,
          rc: 255,
        };
        const st = r.u8();
        self.stance = st & 3;
        self.downTicks = (st >> 2) & 15;
        self.faction = st >> 6;
        self.pilot = r.u8();
        self.rc = r.u8();
        h.self(self);
        break;
      }
      case R_ACTORS: {
        const n = r.u8();
        const list: RemoteActor[] = [];
        for (let i = 0; i < n; i++) {
          list.push({
            id: r.u8(),
            x: r.u16() / 16,
            y: r.u16() / 16 - Y_BIAS,
            vx: r.i16() / 8,
            vy: r.i16() / 8,
            aim: r.u16(),
            flags: r.u8(),
            hp: r.u8(),
            weapon: r.u8(),
            parts: r.u16(),
            stance: 0,
            faction: 0,
          });
          const a = list[list.length - 1];
          a.stance = (a.parts >> STANCE_SHIFT) & 3;
          a.faction = (a.parts >> FACTION_SHIFT) & 3;
          a.parts &= PARTS_MASK;
        }
        h.actors(list);
        break;
      }
      case R_SPOTTED: {
        const n = r.u8();
        const list = [];
        for (let i = 0; i < n; i++) list.push({ id: r.u8(), x: r.u16(), y: r.u16() - Y_BIAS });
        h.spotted(list);
        break;
      }
      case R_BLIPS: {
        const n = r.u8();
        const list = [];
        for (let i = 0; i < n; i++) list.push({ id: r.u8(), x: r.u8() * BLIP_X, y: r.u8() * BLIP_Y });
        h.blips(list);
        break;
      }
      case R_CARVE: {
        const x = r.u16();
        const y = r.u16();
        const rad = r.u8();
        const core = r.u8();
        const seed = r.u32();
        const debris = r.u8();
        applyCarve(terrain, x, y, rad, core, removedScratch, detachedScratch);
        h.carved(x, y, rad, seed, debris, removedScratch, detachedScratch);
        break;
      }
      case R_BUILD: {
        const piece = r.u8();
        const builder = r.u8();
        const gx = r.u16();
        const gy = r.u16();
        applyBuild(terrain, piece, gx, gy, removedScratch);
        h.built(piece, builder, gx, gy, removedScratch);
        break;
      }
      case R_ITEMS: {
        const n = r.u8();
        const list: GroundItem[] = [];
        for (let i = 0; i < n; i++) {
          const id = r.u16();
          const weapon = r.u8();
          const ammo = r.u8();
          const f = r.u8();
          list.push({ id, weapon, ammo, rest: (f & 1) !== 0, left: (f & 2) !== 0, x: r.f64(), y: r.f64(), vx: r.f64(), vy: r.f64() });
        }
        h.items(list);
        break;
      }
      case R_ITEMS_GONE: {
        const n = r.u8();
        const ids: number[] = [];
        for (let i = 0; i < n; i++) ids.push(r.u16());
        h.itemsGone(ids);
        break;
      }
      case R_ROUND: {
        const phase = r.u8();
        const wave = r.u16();
        const timer = r.u16();
        const winner = r.u8();
        const left = r.u8();
        const status = r.u8();
        const mode = r.u8();
        const red = r.u8();
        const green = r.u8();
        const kings: [number, number] = [r.u8(), r.u8()];
        const blue = r.u8();
        const gold = r.u8();
        const s: RoundState = { phase, wave, timer, winner, left, inWave: status !== 0, out: status === 2, mode, teamLeft: [red, green, blue, gold], kings };
        if (mode === GameMode.Pvp) s.pvp = { leader: r.u8(), leaderKills: r.u8(), kills: r.u8(), deaths: r.u8() };
        if (mode === GameMode.Extraction) {
          const holder = r.u8();
          const ix = r.u16();
          const iy = r.u16() - Y_BIAS;
          s.idol = { x: ix, y: iy, holder };
          const state = r.u8();
          const ex = r.u16();
          const ey = r.u16() - Y_BIAS;
          s.evac = { state, x: ex, y: ey, eta: r.u16() };
        }
        h.round(s);
        break;
      }
      case R_BEAM: {
        const seq = r.u16();
        const x0 = r.u16();
        const y0 = r.u16() - Y_BIAS;
        const x1 = r.u16();
        const y1 = r.u16() - Y_BIAS;
        const power = r.u8() / 255;
        h.beam(seq, x0, y0, x1, y1, power, r.u8());
        break;
      }
      case R_MINES: {
        const n = r.u8();
        const list: MineState[] = [];
        for (let i = 0; i < n; i++) list.push({ x: r.u16(), y: r.u16() - Y_BIAS, owner: r.u8(), team: r.u8(), armed: r.u8() !== 0 });
        h.mines(list);
        break;
      }
      case R_TRAPS: {
        const n = r.u8();
        const spent = new Uint8Array(n);
        for (let i = 0; i < n; i++) spent[i] = r.u8();
        h.traps(spent);
        break;
      }
      case R_TEAMS: {
        const teams = new Uint8Array(MAX_PLAYERS);
        for (let i = 0; i < MAX_PLAYERS; i++) teams[i] = r.u8();
        h.teams(teams);
        break;
      }
      case R_WAVE: {
        const seed = r.u32();
        const kind = r.u8();
        const hashes = new Uint32Array(CHUNK_COUNT);
        for (let i = 0; i < CHUNK_COUNT; i++) hashes[i] = r.u32();
        // The handler makes the map from the seed (same generator as the
        // server) before any later record touches the terrain; headless
        // decoders that don't keep terrain can skip it.
        h.wave(seed, hashes, kind);
        break;
      }
      case R_PIXELS: {
        const ci = r.u16();
        const n = r.u16();
        const ox = (ci % CHUNKS_X) << CHUNK_SHIFT;
        const oy = Math.floor(ci / CHUNKS_X) << CHUNK_SHIFT;
        for (let i = 0; i < n; i++) {
          const p = r.u16();
          const m = r.u8();
          terrain.set(ox + (p & 63), oy + ((p >> 6) & 63), m);
        }
        break;
      }
      case R_CHUNK: {
        const ci = r.u16();
        rleDecode(r, chunkScratch);
        terrain.writeChunk(ci, chunkScratch);
        h.chunkLoaded(ci);
        break;
      }
      case R_PROJ_SPAWN:
        h.projSpawn(r.u32(), r.u8(), r.u8(), r.f32(), r.f32(), r.f32(), r.f32());
        break;
      case R_PROJ_END: {
        const id = r.u32();
        const x = r.u16();
        const y = r.u16() - Y_BIAS;
        const kind = r.u8();
        const detonate = r.u8() === 1;
        h.projEnd(id, x, y, kind, detonate, r.u32());
        break;
      }
      case R_KILL:
        h.kill({
          killer: r.u8(),
          victim: r.u8(),
          weapon: r.u8(),
          x: r.u16(),
          y: r.u16() - Y_BIAS,
          vx: r.i16() / 8,
          vy: r.i16() / 8,
          overkill: r.u8(),
          seed: r.u32(),
          gold: r.u8(),
          parts: r.u16(),
        });
        break;
      case R_ROSTER: {
        const id = r.u8();
        const present = r.u8() === 1;
        h.roster(id, present, r.str());
        break;
      }
      case R_SCORES: {
        const n = r.u8();
        const list = [];
        for (let i = 0; i < n; i++) list.push({ id: r.u8(), kills: r.u16(), deaths: r.u16(), gold: r.u16(), wins: r.u16() });
        h.scores(list);
        break;
      }
      case R_HIT: {
        const victim = r.u8();
        const x = r.u16();
        const y = r.u16();
        h.hit(victim, x, y, r.u8());
        break;
      }
      case R_CHAT: {
        const id = r.u8();
        h.chat(id, r.str());
        break;
      }
      case R_CRAFTS: {
        const n = r.u8();
        const list: CraftState[] = [];
        for (let i = 0; i < n; i++) {
          list.push({
            slot: r.u8(),
            x: r.u16() / 16,
            y: r.u16() / 16 - Y_BIAS,
            vx: r.i16() / 8,
            vy: r.i16() / 8,
            a: dequantizeAim(r.u16()),
            thrust: r.u8() / 255,
            hp: r.u8(),
            passenger: r.u8(),
            phase: r.u8(),
            parts: r.u8(),
          });
        }
        h.crafts(list);
        break;
      }
      case R_CRAFT_BOOM: {
        const slot = r.u8();
        const x = r.u16();
        const y = r.u16() - Y_BIAS;
        const vx = r.i16() / 8;
        const vy = r.i16() / 8;
        h.craftBoom(slot, x, y, vx, vy, r.u32());
        break;
      }
      case R_CRAFT_SELF:
        h.selfCraft({
          slot: r.u8(),
          x: r.f64(),
          y: r.f64(),
          vx: r.f64(),
          vy: r.f64(),
          a: r.f64(),
          w: r.f64(),
          targetX: r.f64(),
          timer: r.u16(),
          phase: r.u8(),
          parts: r.u8(),
          prevButtons: r.u8(),
          partHp: Array.from({ length: CRAFT_PARTS }, () => r.u8()),
        });
        break;
      case R_TANKS: {
        const n = r.u8();
        const list: TankState[] = [];
        for (let i = 0; i < n; i++) {
          const slot = r.u8();
          const x = r.u16() / 16;
          const y = r.u16() / 16 - Y_BIAS;
          const vx = r.i16() / 8;
          const vy = r.i16() / 8;
          const aim = dequantizeAim(r.u16());
          const tilt = ((r.u8() << 24) >> 24) / 100;
          const f = r.u8();
          list.push({
            slot,
            x,
            y,
            vx,
            vy,
            aim,
            chute: (f & 1) !== 0,
            faceLeft: (f & 2) !== 0,
            jetting: (f & 4) !== 0,
            firedSmg: (f & 8) !== 0,
            firedCannon: (f & 16) !== 0,
            onGround: (f & 32) !== 0,
            parts: r.u8(),
            hp: r.u16(),
            pilot: r.u8(),
            a: tilt,
            s: 1,
            owner: r.u8(),
            remote: (f & 128) !== 0,
            kind: r.u8(),
          });
          const v = list[list.length - 1];
          v.s = v.kind === TankKind.Tarantula ? TARANTULA_SCALE : v.kind === TankKind.Watchdog ? WATCHDOG_SCALE : 1;
        }
        h.tanks(list);
        break;
      }
      case R_TANK_SELF: {
        const slot = r.u8();
        const x = r.f64();
        const y = r.f64();
        const vx = r.f64();
        const vy = r.f64();
        const fuel = r.f64();
        const a = r.f64();
        const w = r.f64();
        const f = r.u8();
        const parts = r.u8();
        const partHp = Array.from({ length: TANK_PARTS }, () => r.u16());
        h.selfTank({ slot, x, y, vx, vy, fuel, chute: (f & 1) !== 0, onGround: (f & 2) !== 0, jetting: (f & 4) !== 0, parts, partHp, cannonCd: r.u8(), a, w });
        break;
      }
      case R_SHIPS: {
        const n = r.u8();
        const list: ShipState[] = [];
        for (let i = 0; i < n; i++) {
          const slot = r.u8();
          const x = r.u16() / 16;
          const y = r.u16() / 16 - Y_BIAS;
          const vx = r.i16() / 8;
          const vy = r.i16() / 8;
          const a = ((r.u8() << 24) >> 24) / 100;
          const parts = r.u8();
          const hp = r.u16();
          const bombs = r.u8();
          const owner = r.u8();
          const team = r.u8();
          const aim: [number, number] = [dequantizeAim(r.u16()), dequantizeAim(r.u16())];
          const f = r.u8();
          const thrust = [r.u8() / 255, r.u8() / 255, r.u8() / 255, r.u8() / 255];
          list.push({ slot, x, y, vx, vy, a, parts, hp, bombs, owner, team, aim, doors: (f & 1) !== 0, fired: [(f & 2) !== 0, (f & 4) !== 0], leaving: (f & 8) !== 0, thrust, mission: ((f >> 4) & 3) | ((f >> 7) << 2), piloted: (f & 64) !== 0 });
        }
        h.ships(list);
        break;
      }
      case R_SHIP_PART:
      case R_SHIP_BOOM: {
        const slot = r.u8();
        const part = type === R_SHIP_PART ? r.u8() : 0;
        const x = r.u16();
        const y = r.u16() - Y_BIAS;
        const vx = r.i16() / 8;
        const vy = r.i16() / 8;
        const seed = r.u32();
        if (type === R_SHIP_PART) h.shipPart(slot, part, x, y, vx, vy, seed);
        else h.shipBoom(slot, x, y, vx, vy, seed);
        break;
      }
      case R_TANK_PART:
      case R_TANK_BOOM: {
        const slot = r.u8();
        const part = type === R_TANK_PART ? r.u8() : 0;
        const x = r.u16();
        const y = r.u16() - Y_BIAS;
        const vx = r.i16() / 8;
        const vy = r.i16() / 8;
        const seed = r.u32();
        if (type === R_TANK_PART) h.tankPart(slot, part, x, y, vx, vy, seed);
        else h.tankBoom(slot, x, y, vx, vy, seed);
        break;
      }
      case R_CRAFT_PART: {
        const slot = r.u8();
        const part = r.u8();
        const x = r.u16();
        const y = r.u16() - Y_BIAS;
        const vx = r.i16() / 8;
        const vy = r.i16() / 8;
        h.craftPart(slot, part, x, y, vx, vy, r.u32());
        break;
      }
      case R_DETACH: {
        const id = r.u8();
        const part = r.u8();
        const x = r.u16();
        const y = r.u16() - Y_BIAS;
        h.detach(id, part, x, y, r.i16() / 8, r.i16() / 8);
        break;
      }
      default:
        throw new Error(`unknown record ${type}`);
    }
  }
}

/** A handler that ignores everything (tests, bots). */
export const nullHandler: FrameHandler = {
  self() {},
  actors() {},
  blips() {},
  spotted() {},
  carved() {},
  chunkLoaded() {},
  round() {},
  traps() {},
  mines() {},
  beam() {},
  teams() {},
  wave() {},
  items() {},
  itemsGone() {},
  built() {},
  projSpawn() {},
  projEnd() {},
  kill() {},
  roster() {},
  scores() {},
  hit() {},
  chat() {},
  detach() {},
  crafts() {},
  selfCraft() {},
  craftPart() {},
  craftBoom() {},
  tanks() {},
  selfTank() {},
  tankPart() {},
  tankBoom() {},
  ships() {},
  shipPart() {},
  shipBoom() {},
};
