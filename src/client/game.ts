import { BTN_FIRE, type Body, copyBody, newBody, stepBody } from '../shared/actor.ts';
import type { Reader } from '../shared/codec.ts';
import { ACTOR_H, ACTOR_W, CHUNK, CHUNK_COUNT, CHUNK_SHIFT, CHUNKS_X, DT, TICK_RATE, WORLD_H, WORLD_W } from '../shared/constants.ts';
import { type CraftState, type FrameHandler, type KillInfo, type RemoteActor, type RoundState, type SelfCraftState, type SelfState, type SelfTankState, type ShipState, type TankState, applyFrameRecords } from '../shared/frame.ts';
import { ENGINE_NOZZLE_Y, ENGINE_X, SHIP_H, SHIP_W, shipPoint } from '../shared/dropship.ts';
import { TANK_H, TANK_W, type Tank, newTank, stepTank } from '../shared/tank.ts';
import { FACTIONS } from '../shared/factions.ts';
import { Collider, DistanceField } from '../shared/field.ts';
import { Projectiles } from '../shared/kernels.ts';
import { ActorField, MAX_ACTORS, Particles, W_BURN, W_CRAFT, W_DEBRIS, W_SHIP, W_TANK, W_TRAP, W_LASER, releaseCarve, spillGold } from '../shared/particles.ts';
import { type Craft, craftHalfExtents, newCraft, newCraftStep, stepCraft } from '../shared/craft.ts';
import { F_ALIVE, F_FIRING, F_GROUND, F_JET, GameMode, Phase, Team, classOfFlags } from '../shared/protocol.ts';
import { Rng } from '../shared/rng.ts';
import { MAT_COLOR, Mat } from '../shared/materials.ts';
import { Terrain } from '../shared/terrain.ts';
import { generateWorld, lastBiome, lastDungeon } from '../shared/worldgen.ts';
import type { Dungeon } from '../shared/dungeon.ts';
import { LASER_MAX, BLAST_IMPULSE, PROJ, PROJ_BUILD, ProjKind, SHOULDER_X, SHOULDER_Y, WEAPONS, WeaponId, projName, weaponOfProj } from '../shared/weapons.ts';
import { type BuildBlocker, PIECES, canBuild } from '../shared/build.ts';
import { type GroundItem, NO_WEAPON, PICKUP_R, invByte, stepItem } from '../shared/items.ts';
import { bloodSplat, bulletImpact, craftDebris, craftExhaust, craftPartOff, engineExhaust, heavyMuzzle, materialize, digDust, explosion, gibBurst, jetExhaust, limbOff, muzzle, laserHit, rocketTrail, shipDownwash, slugImpact, slugTrail, stumpDrip, tankDebris, tankJets, tankPartOff } from './effects.ts';
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
  wins: number;
  bot: boolean;
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
  stance: number;
  faction: number;
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
  stance: number; // actor.ts Stance
  faction: number; // factions.ts: this clone's vendor
  vx: number;
  vy: number;
}

export interface CraftView extends CraftState {}
export interface TankView extends TankState {}
export interface ShipView extends ShipState {}

/** Dropship scrap: grey-blue gunmetal. */
const SHIP_SCRAP = 0x6e7a86;

/** Where a driver's clone sits inside its tank (top-left of the clone, from the tank's). */
const SEAT_X = TANK_W / 2 - ACTOR_W / 2;
const SEAT_Y = 2;

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

/** Team colours: red and green fatigues, and Extraction's blue and gold (Team.Red .. Team.Gold). */
export const TEAM_COLORS = [
  { css: 'rgb(222,64,56)', rgb: 0xde4038 },
  { css: 'rgb(76,190,72)', rgb: 0x4cbe48 },
  { css: 'rgb(70,130,236)', rgb: 0x4682ec },
  { css: 'rgb(236,190,52)', rgb: 0xecbe34 },
] as const;

/** What the game tells the sound effects (sfx.ts; structural, so the game needs no DOM audio types). */
export interface Sfx {
  listen(x: number, y: number): void;
  shot(kind: number, x: number, y: number, owner: number): void;
  explode(x: number, y: number, radius: number): void;
  impact(x: number, y: number): void;
  hit(x: number, y: number, amount: number, synthetic: boolean): void;
  limb(x: number, y: number, synthetic: boolean): void;
  gib(x: number, y: number, violence: number, synthetic: boolean): void;
  laser(x0: number, y0: number, x1: number, y1: number, power: number): void;
  engines(level: number, pan: number): void;
  jets(level: number, pan: number): void;
  charge(level: number): void;
}

const CAREER_KEY = 'sc.career';
/** The browser's storage, if any (typed by hand: the game also builds without the DOM types). */
const store = () => (globalThis as { localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } }).localStorage;

/** Lifetime kills and deaths from this browser's storage (zeros where there is none). */
function loadCareer(): { kills: number; deaths: number } {
  try {
    const v = JSON.parse(store()?.getItem(CAREER_KEY) ?? 'null');
    if (v && Number.isFinite(v.kills) && Number.isFinite(v.deaths)) return { kills: v.kills, deaths: v.deaths };
  } catch {
    // (no storage here, or junk in it)
  }
  return { kills: 0, deaths: 0 };
}

function saveCareer(c: { kills: number; deaths: number }): void {
  try {
    store()?.setItem(CAREER_KEY, JSON.stringify(c));
  } catch {
    // (storage blocked: the record lasts the session)
  }
}

/** Kills per death (kills alone while deathless). */
export const kdRatio = (kills: number, deaths: number) => kills / Math.max(1, deaths);

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
  /** Last Man Standing round state (null in sandbox rooms), and who we watch while out. */
  roundState: RoundState | null = null;
  spectate = 255;
  /** Chunks whose regenerated contents didn't match the server's hash: ask for them. */
  readonly resyncWanted: number[] = [];
  /** Weapons lying on the ground near us, simulated like the server does. */
  readonly groundItems = new Map<number, GroundItem>();
  cooldown = 0;
  /** Ticks left reloading the weapon in hand (server truth). */
  reloadLeft = 0;
  /** Own gold, exact (from our own record, not the once-a-second scoreboard). */
  gold = 0;
  /** The current map's biome (worldgen Biome). */
  biome = 0;

  /** Scope lock-on (scope.ts): the clone locked onto and the point on it (hitbox-local), and the aim it gives. */
  scopeLock: { id: number; lx: number; ly: number } | null = null;
  /** What the aim assist (or the scope's lock) has snapped onto: the little target marker's world point. */
  aimMark: { x: number; y: number } | null = null;
  lockAim: number | null = null;

  /** Extraction: this map's labyrinth (built from the seed, like the server's), and which traps have gone off. */
  dungeon: Dungeon | null = null;
  trapSpent: Uint8Array = new Uint8Array(32);
  traps(spent: Uint8Array): void {
    this.trapSpent = spent;
  }
  trapGone(id: number): boolean {
    return (this.trapSpent[id >> 3] & (1 << (id & 7))) !== 0;
  }

  /** Sound effects (main.ts plugs them in once audio is allowed; none in tests). */
  sfx: Sfx | null = null;

  /** Where we hear (and gib) from: the clone being watched while spectating, else our own. */
  private ear(): { x: number; y: number } {
    const watched = !this.alive && this.spectate !== 255 ? this.snaps.get(this.spectate)?.at(-1) : undefined;
    return watched ?? this.lastSelf ?? this.body;
  }

  /** Beams to fade out: materializer (builder muzzle to piece centre) and sniper tracers (muzzle to impact). */
  readonly beams: { x0: number; y0: number; x1: number; y1: number; at: number; tracer?: boolean }[] = [];
  /** Laser beams to draw, fading (power 0..1), and the last few beam ids seen. */
  readonly laserBeams: { x0: number; y0: number; x1: number; y1: number; power: number; at: number }[] = [];
  private beamSeen: number[] = [];
  /** Our own laser's charge (ticks held), tracked locally for the charge meter and muzzle glow. */
  laserCharge = 0;

  beam(seq: number, x0: number, y0: number, x1: number, y1: number, power: number, owner: number): void {
    if (this.beamSeen.includes(seq)) return;
    this.beamSeen.push(seq);
    if (this.beamSeen.length > 16) this.beamSeen.shift();
    this.laserBeams.push({ x0, y0, x1, y1, power, at: performance.now() });
    if (this.laserBeams.length > 12) this.laserBeams.shift();
    laserHit(this.particles, x1, y1, (x1 - x0) / (Math.hypot(x1 - x0, y1 - y0) || 1), (y1 - y0) / (Math.hypot(x1 - x0, y1 - y0) || 1), power);
    this.sfx?.laser(x0, y0, x1, y1, power);
    if (owner < 64) this.kicks.set(owner, { at: performance.now(), k: 0.3 + power * 0.7 });
    const me = this.body;
    const d = Math.min(Math.hypot(me.x - x0, me.y - y0), Math.hypot(me.x - x1, me.y - y1));
    this.shake = Math.max(this.shake, (owner === this.myId ? 1 + power * 9 : 0) + Math.max(0, 1 - d / 300) * power * 6);
  }

  /** Recent shots by clone id (when, how hard), for the gun kicking back in their hands. */
  readonly kicks = new Map<number, { at: number; k: number }>();
  /** How far a clone's gun is kicked back right now (0..1). */
  kickOf(id: number, now: number): number {
    const r = this.kicks.get(id);
    if (!r) return 0;
    const t = (now - r.at) / 140;
    return t >= 1 ? 0 : r.k * (1 - t);
  }
  /** Where each sniper slug in flight was fired from, for its trail. */
  private slugFrom = new Map<number, { x: number; y: number }>();
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
  // Tanks, interpolated like actors.
  private tankSnaps = new Map<number, (TankState & { tick: number })[]>();
  /** Clones driving a tank right now (they ride hidden inside it). */
  readonly tankPilots = new Set<number>();
  /**
   * The tank we drive, predicted like our clone: rebased on the server's
   * full-precision state each frame, then stepped over unacked inputs. Our
   * clone's body rides in its seat, so the camera and smoothing just work.
   */
  drive: Tank | null = null;
  driveSlot = -1;
  /** Our tank's damage and cannon (HUD), from the latest frame. */
  myTankState: SelfTankState | null = null;
  private lastSelfTank: SelfTankState | null = null;
  /** Tank prediction errors larger than 0.01 cells seen during reconciliation. */
  tankCorrections = 0;
  // Dropships, interpolated like tanks (nobody predicts them: they fly themselves).
  private shipSnaps = new Map<number, (ShipState & { tick: number })[]>();
  private shipsSeenTick = 0;
  private readonly shipPt = { x: 0, y: 0 };
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
    // (Flying our dropship: the controls are the ship's; the clone stands still.)
    if (this.pilot >= 0) buttons = 0;
    this.pending.push({ seq: this.seq, buttons });
    if (this.pending.length > 90) this.pending.shift();
    // The laser's charge, as the server counts it (for the meter and the glow).
    const charging = this.alive && !this.drive && this.weapon === WeaponId.Laser && (buttons & BTN_FIRE) !== 0 && this.reloadLeft === 0 && this.ammo > 0;
    this.laserCharge = charging ? Math.min(LASER_MAX, this.laserCharge + 1) : 0;
    if (this.alive && this.drive) {
      stepTank(this.drive, this.terrain, DT, buttons);
      this.seat(this.drive);
      if (this.drive.jetting) tankJets(this.particles, this.drive.x, this.drive.y, this.drive.vx, this.drive.vy);
    } else if (this.alive) {
      this.body.burdened = this.inv.some((it) => it.weapon === WeaponId.Idol);
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
    for (let i = 0; i < pr.n; i++) {
      const k = pr.kind[i];
      if (k === ProjKind.Rocket || k === ProjKind.Shell) rocketTrail(this.particles, pr.x[i], pr.y[i]);
      else if (k === ProjKind.Engine) {
        // Still burning: exhaust out of the nozzle (opposite its heading) while it has fuel, smoke after.
        const burning = PROJ[k].life - pr.life[i] < (PROJ[k].burn ?? 0);
        engineExhaust(this.particles, pr.x[i], pr.y[i], pr.vx[i], pr.vy[i], pr.ang[i], burning);
      }
    }
    for (const [slot, ts] of this.tankSnaps) {
      const t = ts[ts.length - 1];
      if (t && t.jetting && slot !== this.driveSlot) tankJets(this.particles, t.x, t.y, t.vx, t.vy);
    }
    // Dropship engines: glow and downwash under each pod still attached.
    for (const [, ss] of this.shipSnaps) {
      const s = ss[ss.length - 1];
      if (!s) continue;
      for (let e = 0; e < 4; e++) {
        if (!(s.parts & (1 << (1 + e)))) continue;
        const q = shipPoint(s, ENGINE_X[e], ENGINE_NOZZLE_Y + 1, this.shipPt);
        shipDownwash(this.particles, q.x, q.y, s.vx, s.vy, s.thrust[e]);
      }
    }
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
      if (last.parts !== ALL_PARTS) stumpDrip(this.particles, last.x, last.y, last.parts, FACTIONS[last.faction]?.synthetic);
    }
    if (this.alive && this.parts !== ALL_PARTS) stumpDrip(this.particles, this.body.x, this.body.y, this.parts, FACTIONS[this.body.faction]?.synthetic);
    if (this.sfx) this.soundBeds(this.sfx);
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
    for (const [slot, ts] of this.tankSnaps) {
      const t = slot === this.driveSlot && this.drive ? this.drive : ts[ts.length - 1];
      if (t && actors.n < MAX_ACTORS) actors.add(192 + slot, t.x, t.y, t.vx, t.vy, TANK_W, TANK_H, 200, 255, 0.3);
    }
    for (const [slot, ss] of this.shipSnaps) {
      const s = ss[ss.length - 1];
      if (s && actors.n < MAX_ACTORS) actors.add(196 + slot, s.x, s.y, s.vx, s.vy, SHIP_W, SHIP_H, 120, 255, 0.2);
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
    this.lastSelfTank = null;
    applyFrameRecords(r, this.terrain, this);
    if (this.tanksSeenTick !== tick) {
      this.tankSnaps.clear();
      this.tankPilots.clear();
    }
    if (this.shipsSeenTick !== tick) this.shipSnaps.clear();
    // No rocket record in this frame means no drop rockets near us.
    if (this.craftsSeenTick !== tick) this.craftSnaps.clear();
    this.lastServerTick = tick;
    const est = tick - performance.now() / TICK_MS;
    if (Number.isNaN(this.clockOffset) || Math.abs(est - this.clockOffset) > 10) this.clockOffset = est;
    else this.clockOffset = this.clockOffset * 0.95 + est * 0.05;
    // Reconcile after the whole frame so replay sees this tick's terrain.
    if (this.lastSelf) this.reconcile(this.lastSelf);
    this.myTankState = this.alive ? this.lastSelfTank : null;
    if (this.lastSelfTank && this.alive) this.reconcileTank(this.lastSelfTank);
    else {
      this.drive = null;
      this.driveSlot = -1;
    }
    if (this.lastSelfCraft && !this.alive) this.reconcileCraft(this.lastSelfCraft);
    else {
      this.ride = null;
      this.rideSlot = -1;
    }
  }

  /** Put our clone in the driver's seat. */
  private seat(t: Tank): void {
    const b = this.body;
    b.x = t.x + SEAT_X;
    b.y = t.y + SEAT_Y;
    b.vx = t.vx;
    b.vy = t.vy;
    b.onGround = t.onGround;
    b.jetting = false;
  }

  /** Rebase the predicted tank on the server's state and replay unacked inputs. */
  private reconcileTank(s: SelfTankState): void {
    const fresh = !this.drive || this.driveSlot !== s.slot;
    if (!this.drive || fresh) this.drive = newTank(s.x, s.y);
    const d = this.drive;
    this.driveSlot = s.slot;
    const b = this.body;
    const rawX = d.x;
    const rawY = d.y;
    const oldX = b.x + this.smoothX;
    const oldY = b.y + this.smoothY;
    d.x = s.x;
    d.y = s.y;
    d.vx = s.vx;
    d.vy = s.vy;
    d.fuel = s.fuel;
    d.chute = s.chute;
    d.onGround = s.onGround;
    d.jetting = s.jetting;
    d.parts = s.parts;
    d.a = s.a;
    d.w = s.w;
    d.pilot = this.myId;
    // pending was already trimmed to unacked commands by reconcile().
    for (const p of this.pending) stepTank(d, this.terrain, DT, p.buttons);
    this.seat(d);
    if (!fresh && Math.abs(rawX - d.x) + Math.abs(rawY - d.y) > 0.01) this.tankCorrections++;
    const ex = oldX - b.x;
    const ey = oldY - b.y;
    if (!fresh && ex * ex + ey * ey < 48 * 48) {
      this.smoothX = ex;
      this.smoothY = ey;
    } else {
      this.smoothX = this.smoothY = 0;
      copyBody(this.prevBody, b);
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
    this.spectate = s.spectate;
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
    b.stance = s.stance;
    b.downTicks = s.downTicks;
    b.faction = s.faction;
    if (!this.alive) {
      copyBody(this.prevBody, b);
      this.smoothX = this.smoothY = 0;
      return;
    }
    if (this.lastSelfTank) {
      // Driving: the clone rides in the seat; reconcileTank rebases the tank.
      b.x = rawX;
      b.y = rawY;
      return;
    }
    b.burdened = this.inv.some((it) => it.weapon === WeaponId.Idol);
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
      out.push({ id, x, y, aim: b.aim, flags: b.flags, hp: b.hp, weapon: b.weapon, moving: Math.abs(b.vx) > 5, parts: b.parts, stance: b.stance, faction: b.faction, vx: b.vx, vy: b.vy });
    }
    return out;
  }

  // ------------------------------------------------------------ FrameHandler

  /** The dropship slot we're remote-piloting, or -1 (our clone stands inert meanwhile). */
  pilot = -1;

  self(s: SelfState): void {
    this.lastSelf = s;
    this.pilot = s.pilot === 255 ? -1 : s.pilot;
  }

  /** The dropship we're flying, if we are. */
  pilotedShip(): ShipView | null {
    if (this.pilot < 0) return null;
    return this.shipViews().find((v) => v.slot === this.pilot) ?? null;
  }

  actors(list: RemoteActor[]): void {
    const seen = new Set<number>();
    for (const a of list) {
      seen.add(a.id);
      let s = this.snaps.get(a.id);
      if (!s) this.snaps.set(a.id, (s = []));
      s.push({ tick: this.frameTick, x: a.x, y: a.y, vx: a.vx, vy: a.vy, aim: a.aim, flags: a.flags, hp: a.hp, weapon: a.weapon, parts: a.parts, stance: a.stance, faction: a.faction });
      if (s.length > 12) s.shift();
      if (a.flags & F_FIRING && a.weapon === WeaponId.Digger) {
        digDust(this.particles, a.x + ACTOR_W / 2, a.y + 5, 0xa08060, 1);
      }
    }
    for (const id of this.snaps.keys()) if (!seen.has(id)) this.snaps.delete(id);
  }

  /** Enemies our side's dropships have eyes on: where, and when last reported. */
  readonly spottedFoes = new Map<number, { x: number; y: number; at: number }>();
  /** When our dropships last reported contact (for the radio callout). */
  private lastContact = -Infinity;

  spotted(list: { id: number; x: number; y: number }[]): void {
    const now = performance.now();
    let fresh = 0;
    for (const e of list) {
      if (!this.spottedFoes.has(e.id)) fresh++;
      this.spottedFoes.set(e.id, { x: e.x, y: e.y, at: now });
    }
    // A fresh contact after a quiet spell: the dropship calls it in.
    if (fresh > 0 && now - this.lastContact > 8000) {
      const me = this.ear();
      const e = list[0];
      const dir = e.x < me.x ? 'west' : 'east';
      const dist = Math.round(Math.abs(e.x - me.x) / 10) * 10;
      this.feed.push({ text: `▲ dropship: ${list.length === 1 ? 'contact' : `${list.length} contacts`}, ${dist}m ${dir}`, color: '#ff9a5a', at: now });
      if (this.feed.length > 6) this.feed.shift();
    }
    this.lastContact = now;
  }

  /** Sightings still fresh (they lapse a second after the last report). */
  spottedNow(): { id: number; x: number; y: number }[] {
    const now = performance.now();
    const out = [];
    for (const [id, e] of this.spottedFoes) {
      if (now - e.at > 1000) this.spottedFoes.delete(id);
      else out.push({ id, x: e.x, y: e.y });
    }
    return out;
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
    return this.alive && !this.drive && this.pilot < 0 && WEAPONS[this.weapon]?.proj === PROJ_BUILD;
  }

  itemsGone(ids: number[]): void {
    for (const id of ids) this.groundItems.delete(id);
  }

  round(s: RoundState): void {
    this.roundState = s;
  }

  /** Every slot's team this wave (Team.None outside Last Team Standing). */
  teamOf: Uint8Array = new Uint8Array(64).fill(Team.None);

  teams(teams: Uint8Array): void {
    this.teamOf = teams;
    // Clones wear their team's colour; without a team, their own.
    for (const p of this.players.values()) {
      const c = TEAM_COLORS[teams[p.id]] ?? playerColor(p.id);
      p.color = c.css;
      p.rgb = c.rgb;
    }
  }

  /** Bunker back walls (structures.ts Backdrop per cell): cosmetic, made with the map. */
  readonly backdrop = new Uint8Array(WORLD_W * WORLD_H);

  /** Is this clone a machine (a Synth Legion body)? Its debris is scrap, not meat. */
  synthetic(id: number): boolean {
    const f = id === this.myId ? this.body.faction : this.snaps.get(id)?.at(-1)?.faction;
    return f !== undefined && !!FACTIONS[f]?.synthetic;
  }

  /** Is this player a king right now (Regicide)? */
  isKing(id: number): boolean {
    const rs = this.roundState;
    return !!rs && rs.mode === GameMode.Regicide && (rs.phase === Phase.Live || rs.phase === Phase.Victory) && (rs.kings[0] === id || rs.kings[1] === id) && id !== 255;
  }

  /** Our team this wave, Team.None if we have none. */
  get myTeam(): number {
    return this.myId >= 0 ? this.teamOf[this.myId] : Team.None;
  }

  /**
   * A new wave: the decoder has just regenerated the terrain from the seed.
   * Clear everything left from the last one, rebuild what derives from the
   * terrain, and flag any chunk that didn't come out identical to the server's.
   */
  wave(seed: number, hashes: Uint32Array, kind: number): void {
    generateWorld(this.terrain, seed, kind, this.backdrop);
    this.biome = lastBiome;
    this.dungeon = lastDungeon;
    this.trapSpent = new Uint8Array(32);
    this.particles.n = 0;
    this.projectiles.n = 0;
    this.stain.fill(0);
    this.groundItems.clear();
    this.craftSnaps.clear();
    this.ride = null;
    this.rideSlot = -1;
    this.beams.length = 0;
    this.slugFrom.clear();
    this.flashes.length = 0;
    this.skyline.fill(WORLD_H);
    for (let ci = 0; ci < CHUNK_COUNT; ci++) {
      this.chunkLoaded(ci);
      if (this.terrain.chunkHash(ci) !== hashes[ci]) this.resyncWanted.push(ci);
    }
  }

  /** Feed the looping sounds: thrusters and jets near the ear, summed and panned toward where they are. */
  private soundBeds(sfx: Sfx): void {
    const ear = this.ear();
    sfx.listen(ear.x, ear.y);
    sfx.charge(this.laserCharge / LASER_MAX);
    const eng = { l: 0, p: 0 };
    const jet = { l: 0, p: 0 };
    const add = (acc: { l: number; p: number }, x: number, y: number, amount: number) => {
      const d = Math.hypot(x - ear.x, y - ear.y);
      if (d > 1400 || amount <= 0) return;
      const w = amount * (1 - d / 1400) ** 2;
      acc.l += w;
      acc.p += w * Math.max(-1, Math.min(1, (x - ear.x) / 600));
    };
    for (const [, ss] of this.shipSnaps) {
      const s = ss[ss.length - 1];
      if (!s) continue;
      for (let e = 0; e < 4; e++) if (s.parts & (1 << (1 + e))) add(eng, s.x, s.y, s.thrust[e] * 0.45);
    }
    for (const [slot, cs] of this.craftSnaps) {
      const c = slot === this.rideSlot && this.ride ? this.ride : cs[cs.length - 1];
      if (c) add(eng, c.x, c.y, c.thrust);
    }
    const pr = this.projectiles;
    for (let i = 0; i < pr.n; i++) {
      const k = pr.kind[i];
      if (k === ProjKind.Engine && PROJ[k].life - pr.life[i] < (PROJ[k].burn ?? 0)) add(eng, pr.x[i], pr.y[i], 0.8);
      else if (k === ProjKind.Rocket) add(jet, pr.x[i], pr.y[i], 0.4);
    }
    if (this.alive && this.drive?.jetting) add(jet, this.drive.x, this.drive.y, 0.8);
    else if (this.alive && this.body.jetting) add(jet, this.body.x, this.body.y, 0.6);
    for (const [slot, ts] of this.tankSnaps) {
      const t = ts[ts.length - 1];
      if (t && t.jetting && slot !== this.driveSlot) add(jet, t.x, t.y, 0.8);
    }
    for (const [id, s] of this.snaps) {
      const last = s[s.length - 1];
      if (id !== this.myId && last && last.flags & F_ALIVE && last.flags & F_JET) add(jet, last.x, last.y, 0.45);
    }
    sfx.engines(eng.l, eng.l > 0 ? eng.p / eng.l : 0);
    sfx.jets(jet.l, jet.l > 0 ? jet.p / jet.l : 0);
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
    if (kind === ProjKind.Slug) {
      this.slugFrom.set(id, { x, y });
      if (this.slugFrom.size > 64) this.slugFrom.delete(this.slugFrom.keys().next().value!);
      heavyMuzzle(this.particles, x + (vx / sp) * 2, y + (vy / sp) * 2, vx / sp, vy / sp);
    } else muzzle(this.particles, x + (vx / sp) * 2, y + (vy / sp) * 2, vx / sp, vy / sp, kind === ProjKind.Rocket || kind === ProjKind.Shell);
    this.sfx?.shot(kind, x, y, owner);
    // Recoil: the shooter's gun kicks back (drawn), and our own shots jolt the view.
    const w = weaponOfProj(kind);
    if (w && owner < 64) {
      this.kicks.set(owner, { at: performance.now(), k: Math.min(1, 0.25 + (w.kick ?? 0) / 130) });
      if (owner === this.myId) this.shake = Math.max(this.shake, (w.kick ?? 0) / 22);
    }
  }

  projEnd(id: number, x: number, y: number, kind: number, detonate: boolean, seed: number): void {
    const i = this.projectiles.indexOf(id);
    if (i >= 0) this.projectiles.removeAt(i);
    const from = this.slugFrom.get(id);
    if (from) {
      // The slug was only on screen a frame or two: what lingers is its
      // wake, a vapour trail along the whole path, and a heavy strike.
      this.slugFrom.delete(id);
      const me = this.body;
      slugTrail(this.particles, from.x, from.y, x, y, me.x, me.y, 700);
      const len = Math.hypot(x - from.x, y - from.y) || 1;
      if (detonate) {
        slugImpact(this.particles, x, y, (x - from.x) / len, (y - from.y) / len, this.dustColorAt(x, y));
        this.sfx?.impact(x, y);
      }
      return;
    }
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
    this.sfx?.explode(x, y, def.splashR);
    const me = this.body;
    const d = Math.hypot(me.x - x, me.y - y);
    this.shake = Math.max(this.shake, Math.max(0, 1 - d / 400) * 8);
  }

  /** Our career record, across sessions (kept in this browser). */
  readonly career = loadCareer();

  kill(k: KillInfo): void {
    const { killer, victim, weapon } = k;
    if (victim === this.myId || (killer === this.myId && victim !== this.myId)) {
      if (victim === this.myId) this.career.deaths++;
      else this.career.kills++;
      saveCareer(this.career);
    }
    const kn = this.players.get(killer)?.name ?? '???';
    const vn = this.players.get(victim)?.name ?? '???';
    // Kills are credited by what did the damage: a projectile kind, or one of the W_* causes.
    const how = weapon === W_CRAFT ? 'Drop Rocket' : weapon === W_TANK ? 'Tank' : weapon === W_SHIP ? 'Dropship' : weapon === W_DEBRIS ? 'Debris' : weapon === W_BURN ? 'Fire' : weapon === 255 ? 'fell' : projName(weapon);
    let text: string;
    if (weapon === 255) text = `${vn} cratered`;
    else if (weapon === W_LASER && killer !== victim) text = `${kn} [Laser] ${vn}`;
    else if (killer === 255 && weapon === W_TRAP) text = `${vn} was impaled on the spikes`;
    else if (killer === 255 && weapon === ProjKind.Dart) text = `${vn} took a poisoned dart`;
    else if (killer === 255 && weapon === ProjKind.Mine) text = `${vn} stepped on a booby trap`;
    else if (killer === victim) text = weapon === W_DEBRIS ? `${vn} was buried` : weapon === W_BURN ? `${vn} burned` : `${vn} self-destructed`;
    else text = `${kn} [${how}] ${vn}`;
    if (!has(k.parts, Part.Head)) text += ' (headshot)';
    else if (!has(k.parts, Part.Torso)) text += ' (torn apart)';
    const color = victim === this.myId ? '#ff6060' : killer === this.myId ? '#80ff80' : '#e0e0e0';
    this.feed.push({ text, color, at: performance.now() });
    if (this.feed.length > 6) this.feed.shift();

    // Gib it. Skip the work for deaths far off-screen.
    // Measured from where we are this frame (our own record comes first; the
    // body itself is only rebased after the whole frame).
    // While spectating, from whoever we're watching.
    const me = this.ear();
    const camDx = k.x - me.x;
    const camDy = k.y - me.y;
    if (victim !== this.myId && camDx * camDx + camDy * camDy > 1400 * 1400) return;
    const explosive = weapon === ProjKind.Rocket || weapon === ProjKind.Grenade || weapon === ProjKind.Shell || weapon === ProjKind.Bomb || weapon === ProjKind.Engine || weapon === W_TANK || weapon === W_SHIP;
    const violence = k.overkill / 40 + (explosive ? 1.5 : 0) + (weapon === 255 ? 0.5 : 0);
    gibBurst(this.particles, k.x, k.y, k.vx, k.vy, this.players.get(victim)?.rgb ?? 0xcccccc, violence, k.parts, this.synthetic(victim));
    this.sfx?.gib(k.x, k.y, violence, this.synthetic(victim));
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
    const c = TEAM_COLORS[this.teamOf[id]] ?? playerColor(id);
    this.players.set(id, { id, name, kills: 0, deaths: 0, gold: 0, wins: 0, bot: name.startsWith('BOT '), color: c.css, rgb: c.rgb });
  }

  scores(list: { id: number; kills: number; deaths: number; gold: number; wins: number }[]): void {
    for (const s of list) {
      const p = this.players.get(s.id);
      if (p) {
        p.kills = s.kills;
        p.deaths = s.deaths;
        p.gold = s.gold;
        p.wins = s.wins;
      }
    }
  }

  hit(victim: number, x: number, y: number, amount: number): void {
    bloodSplat(this.particles, x, y, Math.min(24, 3 + amount / 3), 60 + amount * 1.5);
    this.sfx?.hit(x, y, amount, this.synthetic(victim));
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

  tanks(list: TankState[]): void {
    const seen = new Set<number>();
    this.tankPilots.clear();
    for (const t of list) {
      seen.add(t.slot);
      if (t.pilot !== 255) this.tankPilots.add(t.pilot);
      let s = this.tankSnaps.get(t.slot);
      if (!s) this.tankSnaps.set(t.slot, (s = []));
      s.push({ ...t, tick: this.frameTick });
      if (s.length > 12) s.shift();
    }
    this.tanksSeenTick = this.frameTick;
    for (const slot of this.tankSnaps.keys()) if (!seen.has(slot)) this.tankSnaps.delete(slot);
  }
  private tanksSeenTick = 0;

  selfTank(s: SelfTankState): void {
    this.lastSelfTank = s;
  }

  tankPart(_slot: number, part: number, x: number, y: number, vx: number, vy: number, seed: number): void {
    tankPartOff(this.particles, part, x, y, vx, vy, seed);
    const d = Math.hypot(this.body.x - x, this.body.y - y);
    this.shake = Math.max(this.shake, Math.max(0, 1 - d / 300) * 5);
  }

  tankBoom(slot: number, x: number, y: number, vx: number, vy: number, seed: number): void {
    this.tankSnaps.delete(slot);
    tankDebris(this.particles, x, y, vx, vy, seed, BLAST_IMPULSE);
    this.flashes.push({ x, y, r: 56, at: performance.now() });
    const d = Math.hypot(this.body.x - x, this.body.y - y);
    this.shake = Math.max(this.shake, Math.max(0, 1 - d / 600) * 16);
  }

  ships(list: ShipState[]): void {
    const seen = new Set<number>();
    for (const s of list) {
      seen.add(s.slot);
      let q = this.shipSnaps.get(s.slot);
      if (!q) this.shipSnaps.set(s.slot, (q = []));
      q.push({ ...s, tick: this.frameTick });
      if (q.length > 12) q.shift();
    }
    this.shipsSeenTick = this.frameTick;
    for (const slot of this.shipSnaps.keys()) if (!seen.has(slot)) this.shipSnaps.delete(slot);
  }

  shipPart(_slot: number, part: number, x: number, y: number, vx: number, vy: number, seed: number): void {
    tankPartOff(this.particles, part === 5 ? 0 : 1, x, y, vx, vy, seed, SHIP_SCRAP);
    const d = Math.hypot(this.body.x - x, this.body.y - y);
    this.shake = Math.max(this.shake, Math.max(0, 1 - d / 300) * 5);
  }

  shipBoom(slot: number, x: number, y: number, vx: number, vy: number, seed: number): void {
    this.shipSnaps.delete(slot);
    tankDebris(this.particles, x, y, vx, vy, seed, BLAST_IMPULSE, SHIP_SCRAP);
    this.flashes.push({ x, y, r: 70, at: performance.now() });
    const d = Math.hypot(this.body.x - x, this.body.y - y);
    this.shake = Math.max(this.shake, Math.max(0, 1 - d / 700) * 18);
  }

  /** Dropships at the render time, interpolated between snapshots. */
  shipViews(): ShipView[] {
    const rt = this.renderTick();
    const out: ShipView[] = [];
    for (const [, s] of this.shipSnaps) {
      const last = s[s.length - 1];
      let a = s[0];
      let c = s[0];
      for (let i = s.length - 1; i >= 0; i--) {
        if (s[i].tick <= rt) {
          a = s[i];
          c = s[Math.min(i + 1, s.length - 1)];
          break;
        }
      }
      const t = a === c ? 0 : Math.max(0, Math.min(1, (rt - a.tick) / (c.tick - a.tick)));
      out.push({ ...c, fired: last.fired, doors: last.doors, x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t, a: a.a + (c.a - a.a) * t });
    }
    return out;
  }

  /** The radio is in hand: the call-in menu is up. */
  get calling(): boolean {
    return this.alive && !this.drive && this.pilot < 0 && this.weapon === WeaponId.Radio;
  }

  /** Tanks at the render time, interpolated between snapshots (ours from prediction). */
  tankViews(alpha = 1): TankView[] {
    const rt = this.renderTick();
    const out: TankView[] = [];
    for (const [slot, s] of this.tankSnaps) {
      const b = s[s.length - 1];
      if (slot === this.driveSlot && this.drive && this.alive) {
        // Ours: wherever our seat is this frame.
        const pb = this.prevBody;
        const me = this.body;
        out.push({ ...b, x: pb.x + (me.x - pb.x) * alpha + this.smoothX - SEAT_X, y: pb.y + (me.y - pb.y) * alpha + this.smoothY - SEAT_Y, parts: this.drive.parts, chute: false, jetting: this.drive.jetting, a: this.drive.a });
        continue;
      }
      let a = s[0];
      let c = s[0];
      for (let i = s.length - 1; i >= 0; i--) {
        if (s[i].tick <= rt) {
          a = s[i];
          c = s[Math.min(i + 1, s.length - 1)];
          break;
        }
      }
      const t = a === c ? 0 : Math.max(0, Math.min(1, (rt - a.tick) / (c.tick - a.tick)));
      out.push({ ...c, firedSmg: b.firedSmg, firedCannon: b.firedCannon, x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t, a: a.a + (c.a - a.a) * t });
    }
    return out;
  }

  /** The empty, landed tank we could climb into right now, if any. */
  boardableTank(): TankView | null {
    if (!this.alive || this.drive) return null;
    const b = this.body;
    for (const [, s] of this.tankSnaps) {
      const t = s[s.length - 1];
      if (t.pilot !== 255 || t.chute) continue;
      const dx = Math.max(t.x - (b.x + ACTOR_W), 0, b.x - (t.x + TANK_W));
      const dy = Math.max(t.y - (b.y + ACTOR_H), 0, b.y - (t.y + TANK_H));
      if (dx <= 10 && dy <= 10) return t;
    }
    return null;
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
    limbOff(this.particles, part, x, y, vx, vy, this.players.get(id)?.rgb ?? 0xcccccc, this.synthetic(id));
    this.sfx?.limb(x, y, this.synthetic(id));
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
