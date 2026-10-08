import { Reader, rleDecode } from './codec.ts';
import { PART_COUNT } from './body.ts';
import { CRAFT_PARTS } from './craft.ts';
import { applyCarve } from './particles.ts';
import { applyBuild } from './build.ts';
import type { GroundItem } from './items.ts';
import { BLIP_X, BLIP_Y, CHUNK, CHUNK_COUNT, CHUNK_SHIFT, CHUNKS_X } from './constants.ts';
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
  R_ROSTER,
  R_SCORES,
  R_SELF,
  R_WAVE,
  Y_BIAS,
  dequantizeAim,
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
  winner: number; // player id, 255 none
  left: number; // clones still in the wave
  inWave: boolean; // are we in it
  out: boolean; // were we in it, and got fragged
}

/** Callbacks for everything in a server frame except terrain, which is applied directly. */
export interface FrameHandler {
  self(s: SelfState): void;
  actors(list: RemoteActor[]): void;
  blips(list: { id: number; x: number; y: number }[]): void;
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
  /** A (new) map: regenerate the terrain from `seed` now; `hashes` are the server's per-chunk hashes of it. */
  wave(seed: number, hashes: Uint32Array): void;
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
        h.self({
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
        });
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
          });
        }
        h.actors(list);
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
        h.round({ phase, wave, timer, winner, left, inWave: status !== 0, out: status === 2 });
        break;
      }
      case R_WAVE: {
        const seed = r.u32();
        const hashes = new Uint32Array(CHUNK_COUNT);
        for (let i = 0; i < CHUNK_COUNT; i++) hashes[i] = r.u32();
        // The handler makes the map from the seed (same generator as the
        // server) before any later record touches the terrain; headless
        // decoders that don't keep terrain can skip it.
        h.wave(seed, hashes);
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
  carved() {},
  chunkLoaded() {},
  round() {},
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
};
