import { Reader, rleDecode } from './codec.ts';
import { applyCarve } from './particles.ts';
import { CHUNK, CHUNK_SHIFT, CHUNKS_X } from './constants.ts';
import {
  R_ACTORS,
  R_BLIPS,
  R_CARVE,
  R_CHAT,
  R_CHUNK,
  R_HIT,
  R_KILL,
  R_PIXELS,
  R_PROJ_END,
  R_PROJ_SPAWN,
  R_ROSTER,
  R_SCORES,
  R_SELF,
  Y_BIAS,
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
  respawn: number;
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
  projSpawn(id: number, kind: number, owner: number, x: number, y: number, vx: number, vy: number): void;
  /** `seed` reproduces the explosion's shrapnel and embers (explosionFragments). */
  projEnd(id: number, x: number, y: number, kind: number, detonate: boolean, seed: number): void;
  kill(k: KillInfo): void;
  roster(id: number, present: boolean, name: string): void;
  scores(list: { id: number; kills: number; deaths: number; gold: number }[]): void;
  hit(victim: number, x: number, y: number, amount: number): void;
  chat(id: number, text: string): void;
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
          respawn: r.u16(),
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
          });
        }
        h.actors(list);
        break;
      }
      case R_BLIPS: {
        const n = r.u8();
        const list = [];
        for (let i = 0; i < n; i++) list.push({ id: r.u8(), x: r.u8() * 8, y: r.u8() * 8 });
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
        for (let i = 0; i < n; i++) list.push({ id: r.u8(), kills: r.u16(), deaths: r.u16(), gold: r.u16() });
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
  projSpawn() {},
  projEnd() {},
  kill() {},
  roster() {},
  scores() {},
  hit() {},
  chat() {},
};
