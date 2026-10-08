import { type Body, copyBody, newBody, stepBody } from '../shared/actor.ts';
import type { Reader } from '../shared/codec.ts';
import { ACTOR_H, ACTOR_W, CHUNK, CHUNK_COUNT, CHUNK_SHIFT, CHUNKS_X, DT, TICK_RATE, WORLD_H, WORLD_W } from '../shared/constants.ts';
import { type CraftState, type FrameHandler, type KillInfo, type RemoteActor, type SelfCraftState, type SelfState, applyFrameRecords } from '../shared/frame.ts';
import { Collider, DistanceField } from '../shared/field.ts';
import { Projectiles } from '../shared/kernels.ts';
import { ActorField, MAX_ACTORS, Particles, W_BURN, W_CRAFT, W_DEBRIS, releaseCarve, spillGold } from '../shared/particles.ts';
import { type Craft, craftHalfExtents, newCraft, newCraftStep, stepCraft } from '../shared/craft.ts';
import { F_ALIVE, F_FIRING, F_GROUND, F_JET, classOfFlags } from '../shared/protocol.ts';
import { Rng } from '../shared/rng.ts';
import { MAT_COLOR, Mat } from '../shared/materials.ts';
import { Terrain } from '../shared/terrain.ts';
import { BLAST_IMPULSE, PROJ, PROJ_BUILD, ProjKind, SHOULDER_X, SHOULDER_Y, WEAPONS, WeaponId, weaponOfProj } from '../shared/weapons.ts';
import { type BuildBlocker, PIECES, canBuild } from '../shared/build.ts';
import { type GroundItem, NO_WEAPON, PICKUP_R, invByte, stepItem } from '../shared/items.ts';
import { bloodSplat, bulletImpact, craftDebris, craftExhaust, craftPartOff, materialize, digDust, explosion, gibBurst, jetExhaust, limbOff, muzzle, rocketTrail, stumpDrip } from './effects.ts';
import { ALL_PARTS, type Mobility, PART_COUNT, Part, has, mobility } from '../shared/body.ts';

const TICK_MS = 1000 / TICK_RATE;
/** Remote actors are rendered this many ticks in the past for smooth interpolation. */
const INTERP_TICKS = 3;

export interface PlayerInfo {
  id: number;
  name: string;
  kills: number;
  deaths: number;
  gold: number;
  color: string;
  rgb: number;
}

interface Snap {
  tick: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aim: number;
  flags: number;
  hp: number;
  weapon: number;
  parts: number;
}

export interface RemoteView {
  id: number;
  x: number;
  y: number;
  aim: number;
  flags: number;
  hp: number;
  weapon: number;
  moving: boolean;
  parts: number; // attached-part mask (body.ts)
}

export interface CraftView extends CraftState {}

const wrapAngle = (a: number) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

export interface FeedItem {
  text: string;
  color: string;
  at: number;
}

export interface Flash {
  x: number;
  y: number;
  r: number;
  at: number;
}

function matRgb(m: number): number {
  const [r, g, b] = MAT_COLOR[m] ?? MAT_COLOR[1];
  return (r << 16) | (g << 8) | b;
}

function seqNewer(a: number, b: number): boolean {
  const d = (a - b) & 0xffff;
  return d !== 0 && d < 0x8000;
}

function playerColor(id: number): { css: string; rgb: number } {
  const hue = (id * 137.508) % 360;
  const s = 0.65;
  const l = 0.55;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return { css: `rgb(${r},${g},${b})`, rgb: (r << 16) | (g << 8) | b };
}

export class Game implements FrameHandler {
  readonly terrain = new Terrain();
  readonly loaded = new Uint8Array(CHUNK_COUNT);
  /**
   * Highest solid cell ever seen per column: everything below it is
   * "underground" and gets the cave backdrop once dug out.
   */
  readonly skyline = new Int16Array(WORLD_W).fill(WORLD_H);
  readonly projectiles = new Projectiles(2048);
  /**
   * One field-engine instance for everything that flies on this client:
   * mirrored terrain grains plus every spark, flame, smoke puff, blood drop
   * and gib. Same pass, same fields, same pixel buffer.
   */
  readonly particles = new Particles(40000);
  private readonly bodyField = new ActorField(ACTOR_W, ACTOR_H);
  /** Per-cell blood stain intensity (0-255). Cosmetic, never networked. */
  readonly stain = new Uint8Array(WORLD_W * WORLD_H);
  private readonly particleHooks = {
    stain: (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return;
      const c = y * WORLD_W + x;
      this.stain[c] = Math.min(255, this.stain[c] + 110);
      this.terrain.markRenderDirty(x, y);
    },
  };
  readonly field = new DistanceField(this.terrain);
  readonly collider = new Collider(this.terrain, this.field);
  readonly players = new Map<number, PlayerInfo>();
  readonly feed: FeedItem[] = [];
  readonly chatLog: FeedItem[] = [];
  readonly flashes: Flash[] = [];
  radar: { id: number; x: number; y: number }[] = [];

  myId = -1;
  room = '';

  // Own clone: predicted body plus the previous tick's body for render interpolation.
  readonly body: Body = newBody(0, 0);
  readonly prevBody: Body = newBody(0, 0);
  alive = false;
  hp = 0;
  /** Own body: attached-part mask and 0..100 health per part (HUD paper doll). */
  parts = ALL_PARTS;
  partHp: number[] = new Array(PART_COUNT).fill(100);
  private readonly mob: Mobility = { legs: 2, jet: true, canFire: true, oneHanded: false };
  respawnTicks = 0;
  /**
   * What we carry (server truth: weapon and rounds in its magazine) and the
   * slot in hand. The selection is ours, applied at once and sent each tick;
   * when the server changes the inventory (pick-up, drop, death) its version
   * moves on and we take its slot.
   */
  inv: { weapon: number; ammo: number }[] = [];
  slot = 0;
  invVersion = -1;
  private pickupHold = 0;
  private dropHold = 0;
  /** Weapons lying on the ground near us, simulated like the server does. */
  readonly groundItems = new Map<number, GroundItem>();
  cooldown = 0;
  /** Ticks left reloading the weapon in hand (server truth). */
  reloadLeft = 0;
  /** Own gold, exact (from our own record, not the once-a-second scoreboard). */
  gold = 0;
  /** Materializer beams to fade out: builder muzzle to piece centre. */
  readonly beams: { x0: number; y0: number; x1: number; y1: number; at: number }[] = [];
  smoothX = 0;
  smoothY = 0;
  /** Prediction errors larger than 0.01 cells seen during reconciliation. */
  corrections = 0;
  private pending: { seq: number; buttons: number }[] = [];
  private seq = 0;
  private lastSelf: SelfState | null = null;
  private ack = 0;

  // Remote actors.
  private snaps = new Map<number, Snap[]>();
  // Drop rockets, interpolated like actors.
  private craftSnaps = new Map<number, (CraftState & { tick: number })[]>();
  /**
   * The rocket we are riding in, predicted like our clone: rebased on the
   * server's full-precision state each frame, then stepped over unacked inputs.
   */
  ride: Craft | null = null;
  rideSlot = -1;
  private readonly ridePrev = { x: 0, y: 0, a: 0 };
  rideSmoothX = 0;
  rideSmoothY = 0;
  rideSmoothA = 0;
  /** Rocket prediction errors larger than 0.01 cells seen during reconciliation. */
  craftCorrections = 0;
  private lastSelfCraft: SelfCraftState | null = null;
  private readonly rideStep = newCraftStep();
  private readonly ext = { x: 0, y: 0 };
  private clockOffset = NaN; // serverTick - now/TICK_MS
  lastServerTick = 0;
  /** Tick of the frame currently being applied. */
  private frameTick = 0;
  shake = 0;
  hurtFlash = 0;

  // ------------------------------------------------------------ local tick

  /** One fixed 30 Hz client tick: predict own clone, advance local kernels. */
  localTick(buttons: number, aimQ: number, send: (seq: number) => void): void {
    this.seq = (this.seq + 1) & 0xffff;
    send(this.seq);
    copyBody(this.prevBody, this.body);
    // Record every command, even while dead: the server may already have
    // respawned us and will apply it.
    this.pending.push({ seq: this.seq, buttons });
    if (this.pending.length > 90) this.pending.shift();
    if (this.alive) {
      stepBody(this.body, buttons, this.terrain, DT);
      if (this.body.jetting) {
        const b = this.body;
        const left = b.vx < 0;
        for (let k = 0; k < 3; k++) jetExhaust(this.particles, b.x + (left ? 7 : 0), b.y + ACTOR_H - 5, b.vx, b.vy);
      }
    }
    if (this.ride && !this.alive) {
      const r = this.ride;
      this.ridePrev.x = r.x;
      this.ridePrev.y = r.y;
      this.ridePrev.a = r.a;
      stepCraft(r, this.terrain, DT, this.rideStep, buttons);
      // Bailed out or dropped off: the server takes it from here.
      if (this.rideStep.release) r.passenger = 255;
    }
    for (const [, it] of this.groundItems) stepItem(it, this.terrain, DT);
    // Field first: chunk snapshots and ops applied since the last tick.
    this.field.update();
    this.projectiles.step(this.collider, DT, null, (i, x, y, _a, _d) => {
      if (PROJ[this.projectiles.kind[i]].ballistic) bulletImpact(this.particles, x, y, this.dustColorAt(x, y));
    });
    const pr = this.projectiles;
    for (let i = 0; i < pr.n; i++) if (pr.kind[i] === ProjKind.Rocket) rocketTrail(this.particles, pr.x[i], pr.y[i]);
    // Drop-rocket exhaust (latest known state; cosmetic plume + local air jet).
    for (const [slot, cs] of this.craftSnaps) {
      const c = slot === this.rideSlot && this.ride ? this.ride : cs[cs.length - 1];
      if (c && c.thrust > 0.12) craftExhaust(this.particles, c.x, c.y, c.a, c.vx, c.vy, c.thrust);
    }
    // Remote jetpacks, and stumps dripping on maimed clones.
    for (const [, s] of this.snaps) {
      const last = s[s.length - 1];
      if (!last || !(last.flags & F_ALIVE)) continue;
      if (last.flags & F_JET) jetExhaust(this.particles, last.x + (last.vx < 0 ? 7 : 0), last.y + ACTOR_H - 5, last.vx, last.vy);
      if (last.parts !== ALL_PARTS) stumpDrip(this.particles, last.x, last.y, last.parts);
    }
    if (this.alive && this.parts !== ALL_PARTS) stumpDrip(this.particles, this.body.x, this.body.y, this.parts);
    // Bodies in the engine so shrapnel stops in them and grains bounce off
    // them on screen too; only the server's results (damage, knockback) count.
    const actors = this.bodyField;
    actors.clear();
    if (this.alive) actors.add(this.myId, this.body.x, this.body.y, this.body.vx, this.body.vy);
    for (const [id, s] of this.snaps) {
      const last = s[s.length - 1];
      if (last && last.flags & F_ALIVE && actors.n < MAX_ACTORS) actors.add(id, last.x, last.y, last.vx, last.vy);
    }
    for (const [slot, cs] of this.craftSnaps) {
      const c = slot === this.rideSlot && this.ride ? this.ride : cs[cs.length - 1];
      if (!c || actors.n >= MAX_ACTORS) continue;
      const e = craftHalfExtents(c.a, this.ext);
      actors.add(128 + slot, c.x - e.x, c.y - e.y, c.vx, c.vy, 2 * e.x, 2 * e.y, 60, 255, 0);
    }
    this.particles.step(this.collider, DT, this.particleHooks, actors);
    this.shake *= 0.85;
    this.hurtFlash *= 0.9;
  }

  // ------------------------------------------------------------ network

  applyFrame(tick: number, ack: number, r: Reader): void {
    this.ack = ack;
    this.frameTick = tick;
    this.lastSelf = null;
    this.lastSelfCraft = null;
    applyFrameRecords(r, this.terrain, this);
    // No rocket record in this frame means no drop rockets near us.
    if (this.craftsSeenTick !== tick) this.craftSnaps.clear();
    this.lastServerTick = tick;
    const est = tick - performance.now() / TICK_MS;
    if (Number.isNaN(this.clockOffset) || Math.abs(est - this.clockOffset) > 10) this.clockOffset = est;
    else this.clockOffset = this.clockOffset * 0.95 + est * 0.05;
    // Reconcile after the whole frame so replay sees this tick's terrain.
    if (this.lastSelf) this.reconcile(this.lastSelf);
    if (this.lastSelfCraft && !this.alive) this.reconcileCraft(this.lastSelfCraft);
    else {
      this.ride = null;
      this.rideSlot = -1;
    }
  }

  /** Rebase the predicted rocket on the server's state and replay unacked inputs. */
  private reconcileCraft(s: SelfCraftState): void {
    const fresh = !this.ride || this.rideSlot !== s.slot;
    if (!this.ride || fresh) this.ride = newCraft(s.x, this.myId);
    const r = this.ride;
    this.rideSlot = s.slot;
    const rawX = r.x;
    const rawY = r.y;
    const oldX = r.x + this.rideSmoothX;
    const oldY = r.y + this.rideSmoothY;
    const oldA = r.a + this.rideSmoothA;
    r.x = s.x;
    r.y = s.y;
    r.vx = s.vx;
    r.vy = s.vy;
    r.a = s.a;
    r.w = s.w;
    r.targetX = s.targetX;
    r.timer = s.timer;
    r.phase = s.phase;
    r.parts = s.parts;
    r.prevButtons = s.prevButtons;
    for (let i = 0; i < s.partHp.length; i++) r.partHp[i] = s.partHp[i];
    r.hp = s.partHp[0];
    r.passenger = this.myId;
    r.delivered = 255;
    // pending was already trimmed to unacked commands by reconcile().
    for (const p of this.pending) {
      stepCraft(r, this.terrain, DT, this.rideStep, p.buttons);
      if (this.rideStep.release) {
        r.passenger = 255;
        break;
      }
    }
    const ex = oldX - r.x;
    const ey = oldY - r.y;
    if (!fresh && Math.abs(rawX - r.x) + Math.abs(rawY - r.y) > 0.01) this.craftCorrections++;
    if (!fresh && ex * ex + ey * ey < 48 * 48) {
      this.rideSmoothX = ex;
      this.rideSmoothY = ey;
      this.rideSmoothA = wrapAngle(oldA - r.a);
    } else {
      this.rideSmoothX = this.rideSmoothY = this.rideSmoothA = 0;
      this.ridePrev.x = r.x;
      this.ridePrev.y = r.y;
      this.ridePrev.a = r.a;
    }
  }

  private reconcile(s: SelfState): void {
    const wasAlive = this.alive;
    this.alive = (s.flags & F_ALIVE) !== 0;
    this.hp = s.hp;
    this.respawnTicks = s.respawn;
    this.parts = s.parts;
    this.partHp = s.partHp;
    this.cooldown = s.cooldown;
    this.inv = s.inv;
    if (s.invVersion !== this.invVersion) {
      this.invVersion = s.invVersion;
      this.slot = s.slot;
    }
    if (this.slot >= this.inv.length) this.slot = Math.max(0, this.inv.length - 1);
    this.reloadLeft = s.reload;
    this.gold = s.gold;
    const b = this.body;
    const ack = this.ack;
    this.pending = this.pending.filter((p) => seqNewer(p.seq, ack));
    const rawX = b.x;
    const rawY = b.y;
    const oldX = b.x + this.smoothX;
    const oldY = b.y + this.smoothY;
    b.x = s.x;
    b.y = s.y;
    b.vx = s.vx;
    b.vy = s.vy;
    b.fuel = s.fuel;
    b.onGround = (s.flags & F_GROUND) !== 0;
    b.jetting = (s.flags & F_JET) !== 0;
    // Predict with the body we actually have left (legs, jetpack).
    mobility(s.parts, this.mob);
    b.legs = this.mob.legs;
    b.jet = this.mob.jet;
    b.cls = classOfFlags(s.flags);
    if (!this.alive) {
      copyBody(this.prevBody, b);
      this.smoothX = this.smoothY = 0;
      return;
    }
    for (const p of this.pending) stepBody(b, p.buttons, this.terrain, DT);
    // Hide small corrections by easing the visual offset back to zero.
    const ex = oldX - b.x;
    const ey = oldY - b.y;
    if (wasAlive && Math.abs(rawX - b.x) + Math.abs(rawY - b.y) > 0.01) this.corrections++;
    if (wasAlive && ex * ex + ey * ey < 48 * 48) {
      this.smoothX = ex;
      this.smoothY = ey;
    } else {
      this.smoothX = this.smoothY = 0;
      copyBody(this.prevBody, b);
    }
  }

  /** Fractional server tick we render remote actors at. */
  renderTick(): number {
    return performance.now() / TICK_MS + this.clockOffset - INTERP_TICKS;
  }

  remoteViews(): RemoteView[] {
    const rt = this.renderTick();
    const out: RemoteView[] = [];
    for (const [id, s] of this.snaps) {
      if (s.length === 0) continue;
      let a = s[0];
      let b = s[0];
      for (let i = s.length - 1; i >= 0; i--) {
        if (s[i].tick <= rt) {
          a = s[i];
          b = s[Math.min(i + 1, s.length - 1)];
          break;
        }
      }
      let x: number;
      let y: number;
      if (a === b) {
        // Extrapolate briefly past the newest snapshot.
        const dt = Math.max(-INTERP_TICKS, Math.min(3, rt - a.tick)) / TICK_RATE;
        x = a.x + a.vx * Math.max(0, dt);
        y = a.y + a.vy * Math.max(0, dt);
      } else {
        const t = (rt - a.tick) / (b.tick - a.tick);
        x = a.x + (b.x - a.x) * t;
        y = a.y + (b.y - a.y) * t;
      }
      // Teleports (respawn) should not interpolate across the map.
      if (Math.abs(b.x - a.x) > 64 || Math.abs(b.y - a.y) > 64) {
        x = b.x;
        y = b.y;
      }
      out.push({ id, x, y, aim: b.aim, flags: b.flags, hp: b.hp, weapon: b.weapon, moving: Math.abs(b.vx) > 5, parts: b.parts });
    }
    return out;
  }

  // ------------------------------------------------------------ FrameHandler

  self(s: SelfState): void {
    this.lastSelf = s;
  }

  actors(list: RemoteActor[]): void {
    const seen = new Set<number>();
    for (const a of list) {
      seen.add(a.id);
      let s = this.snaps.get(a.id);
      if (!s) this.snaps.set(a.id, (s = []));
      s.push({ tick: this.frameTick, x: a.x, y: a.y, vx: a.vx, vy: a.vy, aim: a.aim, flags: a.flags, hp: a.hp, weapon: a.weapon, parts: a.parts });
      if (s.length > 12) s.shift();
      if (a.flags & F_FIRING && a.weapon === WeaponId.Digger) {
        digDust(this.particles, a.x + ACTOR_W / 2, a.y + 5, 0xa08060, 1);
      }
    }
    for (const id of this.snaps.keys()) if (!seen.has(id)) this.snaps.delete(id);
  }

  blips(list: { id: number; x: number; y: number }[]): void {
    this.radar = list;
  }

  carved(x: number, y: number, r: number, seed: number, debris: number, removed: number[], detached: number[]): void {
    // Same op, same chunk state, same seed as the server: identical shower and collapse.
    releaseCarve(this.particles, removed, detached, x, y, debris, new Rng(seed));
    // Blasted cells take their blood stains with them.
    for (let i = 0; i < removed.length; i += 3) this.stain[removed[i + 1] * WORLD_W + removed[i]] = 0;
    if (r <= 6 && removed.length) {
      // Digger / bullet chips: a puff of whatever was dug.
      digDust(this.particles, x, y, matRgb(removed[2]), Math.min(6, removed.length / 3));
    }
  }

  built(piece: number, builder: number, gx: number, gy: number, placed: number[]): void {
    materialize(this.particles, placed);
    const p = PIECES[piece];
    if (!p) return;
    // Beam from whoever built it (if we can see them).
    let bx = NaN;
    let by = NaN;
    if (builder === this.myId && this.alive) {
      bx = this.body.x + SHOULDER_X;
      by = this.body.y + SHOULDER_Y;
    } else {
      const s = this.snaps.get(builder);
      const last = s?.[s.length - 1];
      if (last) {
        bx = last.x + SHOULDER_X;
        by = last.y + SHOULDER_Y;
      }
    }
    if (!Number.isNaN(bx)) this.beams.push({ x0: bx, y0: by, x1: gx + p.w / 2, y1: gy + p.h / 2, at: performance.now() });
    if (this.beams.length > 16) this.beams.shift();
  }

  private readonly blockers: BuildBlocker[] = [];

  /**
   * Would the server accept this piece here? The same canBuild the server
   * runs, against our copy of the terrain and the bodies we can see, so the
   * ghost preview is honest.
   */
  canBuildHere(piece: number, gx: number, gy: number): number {
    const bl = this.blockers;
    bl.length = 0;
    if (this.alive) bl.push({ x: this.body.x, y: this.body.y, w: ACTOR_W, h: ACTOR_H });
    for (const [, s] of this.snaps) {
      const last = s[s.length - 1];
      if (last && last.flags & F_ALIVE) bl.push({ x: last.x, y: last.y, w: ACTOR_W, h: ACTOR_H });
    }
    for (const [, cs] of this.craftSnaps) {
      const c = cs[cs.length - 1];
      if (!c) continue;
      const e = craftHalfExtents(c.a, this.ext);
      bl.push({ x: c.x - e.x, y: c.y - e.y, w: 2 * e.x, h: 2 * e.y });
    }
    return canBuild(this.terrain, piece, gx, gy, this.body.x + SHOULDER_X, this.body.y + SHOULDER_Y, this.gold, bl);
  }

  /** Weapon in hand (WeaponId), NO_WEAPON with empty hands. */
  get weapon(): number {
    return this.inv[this.slot]?.weapon ?? NO_WEAPON;
  }

  /** Rounds in the magazine of the weapon in hand. */
  get ammo(): number {
    return this.inv[this.slot]?.ammo ?? 0;
  }

  /** Rotate through what we carry (1/2, Q/E, wheel). */
  cycle(d: number): void {
    const n = this.inv.length;
    if (n > 0 && d !== 0) this.slot = (((this.slot + d) % n) + n) % n;
  }

  /** Pick up / drop: held in the inventory byte for a few ticks; the server acts on the edge. */
  pickUp(): void {
    this.pickupHold = 3;
  }
  drop(): void {
    this.dropHold = 3;
  }

  /** This tick's inventory byte for the input command. */
  invByte(): number {
    const b = invByte(this.slot, this.invVersion, this.pickupHold > 0, this.dropHold > 0);
    if (this.pickupHold > 0) this.pickupHold--;
    if (this.dropHold > 0) this.dropHold--;
    return b;
  }

  /** The ground item we'd pick up right now, if any. */
  nearestItem(): GroundItem | null {
    if (!this.alive) return null;
    const cx = this.body.x + ACTOR_W / 2;
    const cy = this.body.y + ACTOR_H / 2;
    let best: GroundItem | null = null;
    let bestD = PICKUP_R * PICKUP_R;
    for (const [, it] of this.groundItems) {
      const d = (it.x - cx) ** 2 + (it.y - cy) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  items(list: GroundItem[]): void {
    for (const it of list) this.groundItems.set(it.id, it);
  }

  /** Holding the materializer? */
  get building(): boolean {
    return this.alive && WEAPONS[this.weapon]?.proj === PROJ_BUILD;
  }

  itemsGone(ids: number[]): void {
    for (const id of ids) this.groundItems.delete(id);
  }

  chunkLoaded(ci: number): void {
    this.loaded[ci] = 1;
    const ox = (ci % CHUNKS_X) << CHUNK_SHIFT;
    const oy = Math.floor(ci / CHUNKS_X) << CHUNK_SHIFT;
    for (let x = ox; x < ox + CHUNK; x++) {
      if (this.skyline[x] <= oy) continue;
      const y = this.terrain.surfaceY(x, oy);
      if (y < oy + CHUNK && y < this.skyline[x]) this.skyline[x] = y;
    }
  }

  projSpawn(id: number, kind: number, owner: number, x: number, y: number, vx: number, vy: number): void {
    if (this.projectiles.indexOf(id) >= 0) return;
    this.projectiles.spawn(id, kind, owner, x, y, vx, vy);
    const sp = Math.hypot(vx, vy) || 1;
    muzzle(this.particles, x + (vx / sp) * 2, y + (vy / sp) * 2, vx / sp, vy / sp, kind === ProjKind.Rocket);
  }

  projEnd(id: number, x: number, y: number, kind: number, detonate: boolean, seed: number): void {
    const i = this.projectiles.indexOf(id);
    if (i >= 0) this.projectiles.removeAt(i);
    if (!detonate) return;
    if (PROJ[kind].ballistic) {
      bulletImpact(this.particles, x, y, this.dustColorAt(x, y));
      return;
    }
    const def = PROJ[kind];
    this.flashes.push({ x, y, r: def.splashR, at: performance.now() });
    // Fireball, sparks, smoke, and a blast wave in the air field that moves
    // everything loose already in flight (grains, gibs, smoke, blood).
    explosion(this.particles, x, y, kind, def.splashR, BLAST_IMPULSE, seed);
    const me = this.body;
    const d = Math.hypot(me.x - x, me.y - y);
    this.shake = Math.max(this.shake, Math.max(0, 1 - d / 400) * 8);
  }

  kill(k: KillInfo): void {
    const { killer, victim, weapon } = k;
    const kn = this.players.get(killer)?.name ?? '???';
    const vn = this.players.get(victim)?.name ?? '???';
    // Kills are credited by what did the damage: a projectile kind, or one of the W_* causes.
    const how = weapon === W_CRAFT ? 'Drop Rocket' : weapon === W_DEBRIS ? 'Debris' : weapon === W_BURN ? 'Fire' : weapon === 255 ? 'fell' : (weaponOfProj(weapon)?.name ?? '');
    let text: string;
    if (weapon === 255) text = `${vn} cratered`;
    else if (killer === victim) text = weapon === W_DEBRIS ? `${vn} was buried` : weapon === W_BURN ? `${vn} burned` : `${vn} self-destructed`;
    else text = `${kn} [${how}] ${vn}`;
    if (!has(k.parts, Part.Head)) text += ' (headshot)';
    else if (!has(k.parts, Part.Torso)) text += ' (torn apart)';
    const color = victim === this.myId ? '#ff6060' : killer === this.myId ? '#80ff80' : '#e0e0e0';
    this.feed.push({ text, color, at: performance.now() });
    if (this.feed.length > 6) this.feed.shift();

    // Gib it. Skip the work for deaths far off-screen.
    const camDx = k.x - this.body.x;
    const camDy = k.y - this.body.y;
    if (victim !== this.myId && camDx * camDx + camDy * camDy > 1400 * 1400) return;
    const explosive = weapon === ProjKind.Rocket || weapon === ProjKind.Grenade;
    const violence = k.overkill / 40 + (explosive ? 1.5 : 0) + (weapon === 255 ? 0.5 : 0);
    gibBurst(this.particles, k.x, k.y, k.vx, k.vy, this.players.get(victim)?.rgb ?? 0xcccccc, violence, k.parts);
    // Same seed as the server, so the gold shower matches what will settle.
    spillGold(this.particles, k.x, k.y, k.vx, k.vy, k.gold, new Rng(k.seed));
    this.snaps.delete(victim);
  }

  roster(id: number, present: boolean, name: string): void {
    if (!present) {
      this.players.delete(id);
      this.snaps.delete(id);
      return;
    }
    const c = playerColor(id);
    this.players.set(id, { id, name, kills: 0, deaths: 0, gold: 0, color: c.css, rgb: c.rgb });
  }

  scores(list: { id: number; kills: number; deaths: number; gold: number }[]): void {
    for (const s of list) {
      const p = this.players.get(s.id);
      if (p) {
        p.kills = s.kills;
        p.deaths = s.deaths;
        p.gold = s.gold;
      }
    }
  }

  hit(victim: number, x: number, y: number, amount: number): void {
    bloodSplat(this.particles, x, y, Math.min(24, 3 + amount / 3), 60 + amount * 1.5);
    if (victim === this.myId) this.hurtFlash = Math.min(1, this.hurtFlash + amount / 60);
  }

  chat(id: number, text: string): void {
    const p = this.players.get(id);
    this.chatLog.push({ text: `${p?.name ?? '?'}: ${text}`, color: p?.color ?? '#ccc', at: performance.now() });
    if (this.chatLog.length > 8) this.chatLog.shift();
  }

  crafts(list: CraftState[]): void {
    const seen = new Set<number>();
    for (const c of list) {
      seen.add(c.slot);
      let s = this.craftSnaps.get(c.slot);
      if (!s) this.craftSnaps.set(c.slot, (s = []));
      s.push({ ...c, tick: this.frameTick });
      if (s.length > 12) s.shift();
    }
    this.craftsSeenTick = this.frameTick;
    for (const slot of this.craftSnaps.keys()) if (!seen.has(slot)) this.craftSnaps.delete(slot);
  }
  private craftsSeenTick = 0;

  selfCraft(s: SelfCraftState): void {
    this.lastSelfCraft = s;
  }

  craftPart(_slot: number, part: number, x: number, y: number, vx: number, vy: number, seed: number): void {
    craftPartOff(this.particles, part, x, y, vx, vy, seed);
    const d = Math.hypot(this.body.x - x, this.body.y - y);
    this.shake = Math.max(this.shake, Math.max(0, 1 - d / 300) * 4);
  }

  craftBoom(slot: number, x: number, y: number, vx: number, vy: number, seed: number): void {
    this.craftSnaps.delete(slot);
    if (slot === this.rideSlot) {
      this.ride = null;
      this.rideSlot = -1;
    }
    craftDebris(this.particles, x, y, vx, vy, seed, BLAST_IMPULSE);
    this.flashes.push({ x, y, r: 40, at: performance.now() });
    const d = Math.hypot(this.body.x - x, this.body.y - y);
    this.shake = Math.max(this.shake, Math.max(0, 1 - d / 500) * 12);
  }

  /** Drop rockets at the render time, interpolated between snapshots. */
  craftViews(): CraftView[] {
    const rt = this.renderTick();
    const out: CraftView[] = [];
    for (const [, s] of this.craftSnaps) {
      let a = s[0];
      let b = s[0];
      for (let i = s.length - 1; i >= 0; i--) {
        if (s[i].tick <= rt) {
          a = s[i];
          b = s[Math.min(i + 1, s.length - 1)];
          break;
        }
      }
      if (b.slot === this.rideSlot && this.ride) continue; // drawn from prediction
      const t = a === b ? 0 : Math.max(0, Math.min(1, (rt - a.tick) / (b.tick - a.tick)));
      out.push({ ...b, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: wrapAngle(a.a + wrapAngle(b.a - a.a) * t) });
    }
    return out;
  }

  /** The drop rocket carrying this player in, if any: predicted, interpolated by `alpha`. */
  myCraft(alpha = 1): CraftView | null {
    if (this.alive) return null;
    const r = this.ride;
    if (r) {
      const p = this.ridePrev;
      return {
        slot: this.rideSlot,
        x: p.x + (r.x - p.x) * alpha + this.rideSmoothX,
        y: p.y + (r.y - p.y) * alpha + this.rideSmoothY,
        vx: r.vx,
        vy: r.vy,
        a: p.a + wrapAngle(r.a - p.a) * alpha + this.rideSmoothA,
        thrust: r.thrust,
        hp: r.hp,
        passenger: this.myId,
        phase: r.phase,
        parts: r.parts,
      };
    }
    for (const c of this.craftViews()) if (c.passenger === this.myId) return c;
    return null;
  }

  detach(id: number, part: number, x: number, y: number, vx: number, vy: number): void {
    limbOff(this.particles, part, x, y, vx, vy, this.players.get(id)?.rgb ?? 0xcccccc);
    if (id === this.myId) this.hurtFlash = 1;
  }

  /** Colour of the terrain around a point (for dust puffs). */
  private dustColorAt(x: number, y: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const m = this.terrain.get(cx + dx, cy + dy);
        if (m !== Mat.Air) return matRgb(m);
      }
    return 0x9a8060;
  }

  /** Live particles of one kind (HUD). */
  countKind(kind: number): number {
    return this.particles.count(kind);
  }

  colorOf(id: number): string {
    return this.players.get(id)?.color ?? '#ccc';
  }
}
