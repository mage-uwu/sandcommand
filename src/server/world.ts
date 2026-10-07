import { type Body, BTN_FIRE, newBody, stepBody } from '../shared/actor.ts';
import { Writer, rleEncode } from '../shared/codec.ts';
import {
  ACTOR_H,
  ACTOR_MAX_HP,
  ACTOR_W,
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
import { Grains, applyCarve, carveExtent, dropToSupport, releaseCarve, spillGold } from '../shared/particles.ts';
import { Mat } from '../shared/materials.ts';
import {
  F_ALIVE,
  F_FACE_LEFT,
  F_FIRING,
  F_GROUND,
  F_JET,
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
  S_FRAME,
  Y_BIAS,
  dequantizeAim,
} from '../shared/protocol.ts';
import { Rng } from '../shared/rng.ts';
import { Terrain, forChunksInRect } from '../shared/terrain.ts';
import { BLAST_IMPULSE, DIGGER_CORE, DIGGER_R, DIGGER_REACH, PROJ, ProjKind, WEAPONS, WeaponId } from '../shared/weapons.ts';
import { generateWorld } from '../shared/worldgen.ts';

export interface ClientLink {
  send(data: Uint8Array): void;
}

export interface InputCmd {
  seq: number;
  buttons: number;
  aim: number; // quantized u16
  weapon: number;
}

export class Player {
  readonly body: Body;
  alive = false;
  hp = ACTOR_MAX_HP;
  aimQ = 0;
  weapon = 0;
  cooldown = 0;
  respawn = 1;
  firing = false;
  kills = 0;
  deaths = 0;
  gold = 0;
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
  readonly grains = new Grains(32768);
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

  constructor(seed = 1337) {
    this.rng = new Rng(seed ^ 0x9e3779b9);
    generateWorld(this.terrain, seed);
  }

  get playerCount(): number {
    let n = 0;
    for (const p of this.players) if (p) n++;
    return n;
  }

  addPlayer(name: string, link: ClientLink): Player | null {
    const id = this.players.indexOf(null);
    if (id < 0) return null;
    const clean = name.replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16) || `Clone${id}`;
    const p = new Player(id, clean, link);
    this.players[id] = p;
    this.writeRoster(this.broadcast, p, true);
    // The newcomer needs the whole roster; it gets it in its first frame.
    const w = this.tmp.reset();
    for (const o of this.players) if (o && o !== p) this.writeRoster(w, o, true);
    this.pendingRoster.set(id, w.finish());
    return p;
  }

  private readonly pendingRoster = new Map<number, Uint8Array>();

  removePlayer(id: number): void {
    const p = this.players[id];
    if (!p) return;
    this.players[id] = null;
    this.pendingRoster.delete(id);
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
  carve(x: number, y: number, r: number, core: number, debrisMax: number): number {
    x = Math.max(0, Math.min(WORLD_W - 1, Math.round(x)));
    y = Math.max(0, Math.min(WORLD_H - 1, Math.round(y)));
    const removed = this.removedScratch;
    const detached = this.detachedScratch;
    const n = applyCarve(this.terrain, x, y, r, core, removed, detached);
    if (n === 0) return 0;
    const seed = this.rng.nextU32();
    releaseCarve(this.grains, removed, detached, x, y, debrisMax, new Rng(seed), this.overflow);
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
    out.t = bestT;
    return best;
  };

  private damage(victim: Player, amount: number, attacker: number, weapon: number): void {
    if (!victim.alive || amount <= 0) return;
    const overkill = amount - victim.hp;
    victim.hp -= amount;
    const w = this.tmp.reset();
    w.u8(R_HIT);
    w.u8(victim.id);
    w.u16(Math.max(0, Math.round(victim.cx)));
    w.u16(Math.max(0, Math.round(victim.cy)) & 0xffff);
    w.u8(Math.min(255, Math.round(amount)));
    this.hits.push({ bytes: w.finish(), id: 0, x: victim.cx, y: victim.cy });
    if (victim.hp > 0) return;
    victim.alive = false;
    victim.hp = 0;
    victim.respawn = RESPAWN_TICKS;
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
    spillGold(this.grains, victim.cx, victim.cy, b.vx, b.vy, gold, new Rng(seed));
  }

  private onProjEnd = (i: number, x: number, y: number, actor: number, detonate: boolean): void => {
    const pr = this.projectiles;
    const kind = pr.kind[i];
    const owner = pr.owner[i];
    const def = PROJ[kind];
    if (actor >= 0) this.damage(this.players[actor]!, def.damage, owner, kind);
    if (detonate) {
      if (def.carveR > 0 && (actor < 0 || kind !== ProjKind.Bullet)) {
        this.carve(x, y, def.carveR, def.coreR, def.debris);
      }
      if (def.splashR > 0) {
        // Blast wave through every grain already in flight nearby.
        this.grains.impulse(x, y, def.splashR * 1.6, BLAST_IMPULSE);
        for (const p of this.players) {
          if (!p || !p.alive) continue;
          const dx = p.cx - x;
          const dy = p.cy - y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < def.splashR) {
            const selfScale = p.id === owner ? 0.5 : 1;
            // Push first so a killing blast flings the gibs.
            const push = (1 - d / def.splashR) * 320;
            p.body.vx += (dx / (d + 1)) * push;
            p.body.vy += (dy / (d + 1)) * push - 60;
            this.damage(p, def.splashDamage * (1 - d / def.splashR) * selfScale, owner, kind);
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
    this.projEnds.push({ bytes: w.finish(), id: pr.id[i], x, y });
  };

  private fire(p: Player): void {
    const def = WEAPONS[p.weapon];
    const aim = dequantizeAim(p.aimQ);
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);
    const ox = p.cx;
    const oy = p.body.y + 5;
    if (def.proj < 0) {
      // Digger: vacuum terrain in front of the clone, banking any gold.
      this.carve(ox + cos * DIGGER_REACH, oy + sin * DIGGER_REACH, DIGGER_R, DIGGER_CORE, 0);
      p.gold += this.terrain.removedByMat[Mat.Gold];
      return;
    }
    const a = aim + (this.rng.next() - 0.5) * 2 * def.spread;
    const vx = Math.cos(a) * def.speed + p.body.vx * 0.25;
    const vy = Math.sin(a) * def.speed + p.body.vy * 0.25;
    const id = this.nextProjId++;
    const sx = ox + cos * 6;
    const sy = oy + sin * 6;
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

  private spawnPlayer(p: Player): void {
    for (let attempt = 0; attempt < 32; attempt++) {
      const x = 48 + this.rng.int(WORLD_W - 96);
      const top = this.terrain.surfaceY(x + ACTOR_W / 2);
      const y = top - ACTOR_H - 1;
      if (y < 8 || top >= WORLD_H - 16) continue;
      if (this.terrain.rectSolid(x, y, x + ACTOR_W - 1, y + ACTOR_H - 1)) continue;
      const b = p.body;
      b.x = x;
      b.y = y;
      b.vx = 0;
      b.vy = 0;
      b.fuel = 100;
      p.hp = ACTOR_MAX_HP;
      p.alive = true;
      p.cooldown = 10;
      return;
    }
  }

  // ---------------------------------------------------------------- tick

  step(): void {
    const t0 = performance.now();
    this.tick++;
    const terrain = this.terrain;

    for (const p of this.players) {
      if (!p) continue;
      // Keep the input queue shallow: a client whose clock runs fast must not
      // build up latency. Skipped commands still advance the ack.
      while (p.inputs.length > 3) p.ack = p.inputs.shift()!.seq;
      const cmd = p.inputs.shift();
      if (cmd) {
        p.buttons = cmd.buttons;
        p.aimQ = cmd.aim;
        if (cmd.weapon < WEAPONS.length) p.weapon = cmd.weapon;
        p.ack = cmd.seq;
      }
      p.firing = false;
      if (!p.alive) {
        if (--p.respawn <= 0) this.spawnPlayer(p);
        continue;
      }
      const impact = stepBody(p.body, p.buttons, terrain, DT);
      if (impact > FALL_DAMAGE_SPEED) this.damage(p, (impact - FALL_DAMAGE_SPEED) * 0.4, p.id, 255);
      if (!p.alive) continue;
      if (p.body.y > WORLD_H) this.damage(p, 999, p.id, 255);
      if (p.cooldown > 0) p.cooldown--;
      if (p.alive && p.buttons & BTN_FIRE && p.cooldown === 0) {
        this.fire(p);
        p.firing = true;
        p.cooldown = WEAPONS[p.weapon].cooldown;
      }
      p.camX = p.cx;
      p.camY = p.cy;
    }

    this.rebuildGrid();
    // Bring the distance field up to date with this tick's terrain edits (only
    // the chunks that changed). Removals later in the tick only increase true
    // clearance, so the field stays conservative for them.
    this.field.update();
    this.projectiles.step(this.collider, DT, this.segmentActor, this.onProjEnd);
    this.grains.step(this.collider, DT, this.deposit);
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
    }
  }

  private flagsOf(p: Player): number {
    const aim = dequantizeAim(p.aimQ);
    return (
      (p.alive ? F_ALIVE : 0) |
      (p.body.onGround ? F_GROUND : 0) |
      (p.body.jetting ? F_JET : 0) |
      (p.firing ? F_FIRING : 0) |
      (Math.cos(aim) < 0 ? F_FACE_LEFT : 0)
    );
  }

  private replicate(): void {
    this.encodeActors();
    const actorBytes = this.actorRecords.buf;
    const ACTOR_REC = 14; // bytes per encoded actor, see encodeActors()
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
      }
      scores = w.finish();
    }

    for (const p of this.players) {
      if (!p) continue;
      const w = this.frame.reset();
      w.u8(S_FRAME);
      w.u32(this.tick);
      w.u16(p.ack & 0xffff);

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
      w.u8(p.cooldown);
      w.u16(p.alive ? 0 : p.respawn);

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
          w.u8(Math.max(0, Math.min(255, o.cx >> 3)));
          w.u8(Math.max(0, Math.min(255, o.cy >> 3)));
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

function clampU16(v: number): number {
  return Math.max(0, Math.min(65535, Math.round(v)));
}
function clampI16(v: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(v)));
}
