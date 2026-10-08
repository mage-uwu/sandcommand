import { DT, GRAVITY, WORLD_H } from './constants.ts';
import { segmentBox } from './kernels.ts';
import { type Collider, FH, FIELD_CELL, FIELD_SHIFT, FW, contact, newHit } from './field.ts';
import { MAT_LOOSE, Mat } from './materials.ts';
import type { Rng } from './rng.ts';
import type { Terrain } from './terrain.ts';

/**
 * The particle engine. Everything that flies is one structure-of-arrays
 * particle with a kind: terrain grains (debris, collapsing sand, spilled
 * gold), sparks, flames, smoke, dust, blood and gibs. A tick is O(N) in live
 * particles plus O(field cells touched), with no per-cell automaton, no
 * pairwise interaction and no per-explosion scans:
 *
 *   0. air field     explosions write a radial velocity into a coarse air
 *                    field that decays over a few ticks
 *   1. integrate     gravity, buoyancy and drag from per-kind tables over
 *                    contiguous Float32Arrays
 *   2. fields        massive particles (grains) splat count and momentum into
 *                    the coarse grid: crowded grains blend toward the local
 *                    mean velocity (PIC) and are pushed down the gradient of
 *                    excess density; light particles (smoke, dust, flame) are
 *                    advected by that flow; every kind relaxes toward the air
 *                    field, so one blast moves everything nearby in O(area)
 *   3. sweep         swept collision through the terrain distance field, then
 *                    restitution + Coulomb friction from per-kind tables
 *   4. contact       per kind: grains settle back into terrain, blood stains
 *                    the surface it hits, gibs tumble and come to rest,
 *                    sparks die once spent
 *
 * The server runs the same engine with grains only (they are authoritative
 * terrain changes); clients run every kind in one instance.
 */
export const PK = {
  Grain: 0,
  Spark: 1,
  Flame: 2,
  Smoke: 3,
  Dust: 4,
  Blood: 5,
  Gib: 6,
  Shrapnel: 7,
  Hull: 8, // drop-rocket fragments: heavy, settle as scrap metal
} as const;
export const KIND_COUNT = 9;

// Contact behaviours.
const C_SETTLE = 0; // become terrain (grains)
const C_BOUNCE = 1; // bounce and slide until life ends
const C_STAIN = 2; // stain the surface and disappear (blood)
const C_SPENT = 3; // bounce, disappear once slow (sparks)
const C_RIGID = 4; // tumble, bounce, rest, fade (gibs)

// What a particle does after striking an actor.
const A_PASS = 0; // keeps going (flames lick past)
const A_EMBED = 1; // stops in the body (shrapnel)
const A_BOUNCE = 2; // rebounds off the body (grains, gibs)

interface KindDef {
  gravity: number; // multiplier on world gravity; negative = buoyant
  drag: number; // velocity retained per tick
  e: number; // restitution
  mu: number; // Coulomb friction
  mass: boolean; // contributes to the density/momentum field
  advect: number; // per-tick blend toward the local mass-flow velocity
  air: number; // per-tick blend toward the air (blast) field
  contact: number;
  // How the kind acts on actors (players). Momentum and damage come from the
  // particle's velocity relative to the actor, like Cortex Command.
  pmass: number; // mass: impulse = pmass * relative velocity
  sharp: number; // sharpness: penetration energy = pmass * sharp * relative speed
  wound: number; // wound points dealt to each body layer it penetrates (see body.ts)
  burn: number; // damage per second while touching (flames)
  onActor: number; // A_PASS | A_EMBED | A_BOUNCE
}

/** Per-kind behaviour. Index with PK.*. */
export const KINDS: readonly KindDef[] = [
  /* Grain    */ { gravity: 1, drag: 0.998, e: 0.12, mu: 0.65, mass: true, advect: 0, air: 0.07, contact: C_SETTLE, pmass: 0.25, sharp: 0.15, wound: 3, burn: 0, onActor: A_BOUNCE },
  /* Spark    */ { gravity: 0.6, drag: 0.985, e: 0.55, mu: 0.25, mass: false, advect: 0, air: 0.1, contact: C_SPENT, pmass: 0, sharp: 0, wound: 0, burn: 0, onActor: A_PASS },
  /* Flame    */ { gravity: -0.3, drag: 0.9, e: 0.1, mu: 0.3, mass: false, advect: 0.3, air: 0.5, contact: C_BOUNCE, pmass: 0.02, sharp: 0, wound: 0, burn: 4, onActor: A_PASS },
  /* Smoke    */ { gravity: -0.1, drag: 0.93, e: 0.05, mu: 0.2, mass: false, advect: 0.5, air: 0.6, contact: C_BOUNCE, pmass: 0, sharp: 0, wound: 0, burn: 0, onActor: A_PASS },
  /* Dust     */ { gravity: 0.25, drag: 0.95, e: 0.1, mu: 0.6, mass: false, advect: 0.5, air: 0.5, contact: C_BOUNCE, pmass: 0, sharp: 0, wound: 0, burn: 0, onActor: A_PASS },
  /* Blood    */ { gravity: 1, drag: 0.995, e: 0, mu: 0, mass: false, advect: 0.05, air: 0.2, contact: C_STAIN, pmass: 0, sharp: 0, wound: 0, burn: 0, onActor: A_PASS },
  /* Gib      */ { gravity: 1, drag: 0.997, e: 0.35, mu: 0.55, mass: false, advect: 0, air: 0.15, contact: C_RIGID, pmass: 0.3, sharp: 0.1, wound: 0, burn: 0, onActor: A_BOUNCE },
  // Shrapnel flies like a bullet and hits like one: flat, fast, armour-piercing at full speed.
  /* Shrapnel */ { gravity: 0.15, drag: 0.996, e: 0.3, mu: 0.5, mass: false, advect: 0, air: 0.02, contact: C_SPENT, pmass: 0.5, sharp: 0.85, wound: 12, burn: 0, onActor: A_EMBED },
  /* Hull     */ { gravity: 1, drag: 0.997, e: 0.25, mu: 0.6, mass: true, advect: 0, air: 0.04, contact: C_SETTLE, pmass: 1.2, sharp: 0.35, wound: 12, burn: 0, onActor: A_BOUNCE },
];
const K_GRAV = new Float32Array(KINDS.map((k) => k.gravity));
const K_DRAG = new Float32Array(KINDS.map((k) => k.drag));
const K_E = new Float32Array(KINDS.map((k) => k.e));
const K_MU = new Float32Array(KINDS.map((k) => k.mu));
const K_MASS = new Uint8Array(KINDS.map((k) => (k.mass ? 1 : 0)));
const K_ADVECT = new Float32Array(KINDS.map((k) => k.advect));
const K_AIR = new Float32Array(KINDS.map((k) => k.air));
const K_CONTACT = new Uint8Array(KINDS.map((k) => k.contact));
const K_PMASS = new Float32Array(KINDS.map((k) => k.pmass));
const K_SHARP = new Float32Array(KINDS.map((k) => k.sharp));
const K_WOUND = new Float32Array(KINDS.map((k) => k.wound));
const K_BURN = new Float32Array(KINDS.map((k) => k.burn));
const K_ON_ACTOR = new Uint8Array(KINDS.map((k) => k.onActor));
/** Kinds that can touch actors at all. */
const K_TOUCHES = new Uint8Array(KINDS.map((k) => (k.pmass > 0 || k.burn > 0 ? 1 : 0)));

const SETTLE_SPEED = 2.2 * GRAVITY * DT; // cells/s, ~2 ticks of gravity
const SETTLE_TICKS = 2;
const CROWD_SETTLE = 3;
const STACK_SCAN = 8; // cells to look up for a free spot when the resting cell was just filled
const PROJECT_STEPS = 32; // max lattice steps per settle walk per tick
const CROWD = 6; // grains per field cell before pressure kicks in
const PRESSURE = 14; // velocity per tick per unit density difference
const MAX_SPEED = 700;
const PUSH_MAX = GRAVITY * DT * 1.2; // per-tick cap on pressure push
const PIC_MIN = 3; // grains in a field cell before they share momentum
const PIC_BLEND = 0.5; // fraction of the way to the cell's mean velocity per tick
const AIR_DECAY = 0.72; // air field retained per tick
const AIR_MIN = 20; // cells/s below which an air cell goes quiet (~8 ticks after a blast)
const AIR_WAKE = 60; // cells/s of wind needed to disturb a resting particle
const SPARK_DIE = 40; // cells/s: a spark slower than this after a bounce is spent

const density = new Uint16Array(FW * FH);
const momX = new Float32Array(FW * FH);
const momY = new Float32Array(FW * FH);
const touched: number[] = [];
const hit = newHit();
const vel = { x: 0.5, y: 0.5 }; // doubles from the start: no boxing
const free = { x: 0, y: 0 };
const aq = { t: 0.5 };

/** Gib `aux` flag: armour, jetpack and hull pieces clatter instead of bleeding. Low 7 bits = sprite piece. */
export const GIB_INORGANIC = 0x80;

/** Owner byte for particles nobody in particular caused. */
export const NO_OWNER = 255;
/** Kill-feed weapon codes for particle damage (projectile kinds use 0..2). */
export const W_TRAP = 249; // spike pits
export const W_SHIP = 250; // dropship crashes and explosions
export const W_TANK = 251; // tank crushes and explosions
export const W_CRAFT = 252; // drop-rocket crashes, crushes and explosions
export const W_DEBRIS = 253;
export const W_BURN = 254;
const KIND_WEAPON = new Uint8Array(KIND_COUNT).fill(W_DEBRIS);
KIND_WEAPON[PK.Flame] = W_BURN;

export interface ParticleHooks {
  /** A grain came to rest: deposit it as terrain (server). */
  settle?: (x: number, y: number, mat: number) => void;
  /** Blood hit solid terrain at cell (x, y) (client stain layer). */
  stain?: (x: number, y: number) => void;
}

/**
 * Project a grain that has come to rest at (cx, cy) onto a terrain cell where
 * it can stay: the first free cell at or just above it (dense flows overlap,
 * so a neighbour may have just taken this one), then, for loose material,
 * down open diagonals until the 45-degree stability rule holds. A bounded
 * walk run once per grain when it settles, never a per-tick grid update.
 */
const STUCK = 0;
const SETTLED = 1;
const PARTIAL = 2;

function projectRest(t: Terrain, cx: number, cy: number, loose: boolean, out: { x: number; y: number }): number {
  let y = cy;
  while (t.isSolid(cx, y)) if (--y < cy - STACK_SCAN) return STUCK;
  let x = cx;
  for (let step = 0; step < PROJECT_STEPS; step++) {
    if (!t.isSolid(x, y + 1)) {
      y++; // drop onto support
      continue;
    }
    if (!loose || t.looseStableAt(x, y)) break;
    // Unstable: move to the lower diagonal on an open side (left first).
    if (!t.isSolid(x - 1, y) && !t.isSolid(x - 1, y + 1)) x--;
    else if (!t.isSolid(x + 1, y) && !t.isSolid(x + 1, y + 1)) x++;
    else break; // both diagonals blocked: stable in every way that matters
  }
  out.x = x;
  out.y = y;
  if (!t.isSolid(x, y + 1)) return PARTIAL;
  if (loose && !t.looseStableAt(x, y) && !(t.isSolid(x - 1, y + 1) && t.isSolid(x + 1, y + 1))) {
    // Ran out of steps mid-descent.
    const blockedL = t.isSolid(x - 1, y) || t.isSolid(x - 1, y + 1);
    const blockedR = t.isSolid(x + 1, y) || t.isSolid(x + 1, y + 1);
    if (!(blockedL && blockedR)) return PARTIAL;
  }
  return SETTLED;
}

/**
 * Nearest free cell for a buried grain. Deterministic order: a small ring
 * first (sideways settling), then straight up through the pile via the
 * bitplane (the common case after a dense landing), then wider rings for
 * grains trapped under an overhang.
 */
function nearestAir(t: Terrain, cx: number, cy: number, out: { x: number; y: number }): boolean {
  if (ring(t, cx, cy, 1, 2, out)) return true;
  for (let k = 3; cy - k >= -1; k++) {
    if (!t.isSolid(cx, cy - k)) {
      out.x = cx;
      out.y = cy - k;
      return true;
    }
  }
  return ring(t, cx, cy, 3, 32, out);
}

function ring(t: Terrain, cx: number, cy: number, r0: number, r1: number, out: { x: number; y: number }): boolean {
  for (let r = r0; r <= r1; r++) {
    for (let dy = -r; dy <= r; dy++) {
      const span = r - Math.abs(dy);
      for (let s = -1; s <= 1; s += 2) {
        const dx = span * s;
        if (!t.isSolid(cx + dx, cy + dy)) {
          out.x = cx + dx;
          out.y = cy + dy;
          return true;
        }
        if (span === 0) break;
      }
    }
  }
  return false;
}

export class Particles {
  n = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly px: Float32Array; // position at the start of the last tick (render interpolation)
  readonly py: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly kind: Uint8Array;
  /** Grain: terrain material. Gib: sprite piece. */
  readonly aux: Uint8Array;
  /** 0xRRGGBB tint (gib team colour, dust material colour, ...). */
  readonly color: Uint32Array;
  readonly life: Uint16Array; // ticks left
  readonly maxLife: Uint16Array;
  readonly rest: Uint8Array;
  readonly spin: Float32Array; // gibs: accumulated quarter turns
  readonly spinRate: Float32Array;
  /** Player who caused this particle (kill credit), or NO_OWNER. */
  readonly owner: Uint8Array;
  /** Scratch: grain sat in a crowded field cell this tick. */
  private readonly crowd: Uint8Array;

  // Air (blast) velocity field, sparse: only cells listed in airCells are live.
  private readonly airX = new Float32Array(FW * FH);
  private readonly airY = new Float32Array(FW * FH);
  private readonly airLive = new Uint8Array(FW * FH);
  private airCells: number[] = [];
  private airNext: number[] = [];

  constructor(readonly cap: number) {
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.px = new Float32Array(cap);
    this.py = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.kind = new Uint8Array(cap);
    this.aux = new Uint8Array(cap);
    this.color = new Uint32Array(cap);
    this.life = new Uint16Array(cap);
    this.maxLife = new Uint16Array(cap);
    this.rest = new Uint8Array(cap);
    this.spin = new Float32Array(cap);
    this.spinRate = new Float32Array(cap);
    this.owner = new Uint8Array(cap);
    this.crowd = new Uint8Array(cap);
  }

  /** Returns false (and spawns nothing) when at capacity. `life` is in ticks. */
  spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, aux = 0, color = 0, owner = NO_OWNER): boolean {
    if (this.n >= this.cap) return false;
    const i = this.n++;
    this.x[i] = this.px[i] = x;
    this.y[i] = this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.kind[i] = kind;
    this.aux[i] = aux;
    this.color[i] = color;
    this.life[i] = this.maxLife[i] = Math.max(1, Math.min(65535, Math.round(life)));
    this.rest[i] = 0;
    this.spin[i] = 0;
    this.spinRate[i] = 0;
    this.owner[i] = owner;
    return true;
  }

  spawnGrain(x: number, y: number, vx: number, vy: number, mat: number, life: number, owner = NO_OWNER): boolean {
    return this.spawn(PK.Grain, x, y, vx, vy, life, mat, 0, owner);
  }

  /** Live particles of one kind (tests, HUD). */
  count(kind: number): number {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.kind[i] === kind) c++;
    return c;
  }

  private removeAt(i: number): void {
    const l = --this.n;
    this.x[i] = this.x[l];
    this.y[i] = this.y[l];
    this.px[i] = this.px[l];
    this.py[i] = this.py[l];
    this.vx[i] = this.vx[l];
    this.vy[i] = this.vy[l];
    this.kind[i] = this.kind[l];
    this.aux[i] = this.aux[l];
    this.color[i] = this.color[l];
    this.life[i] = this.life[l];
    this.maxLife[i] = this.maxLife[l];
    this.rest[i] = this.rest[l];
    this.spin[i] = this.spin[l];
    this.spinRate[i] = this.spinRate[l];
    this.owner[i] = this.owner[l];
    this.crowd[i] = this.crowd[l];
  }

  /**
   * Explosion: write a radial wind of peak `strength` (cells/s) into the air
   * field around (cx, cy). Particles pick it up by sampling their own cell, so
   * the cost is the blast's area, not the particle count, however many
   * explosions land in one tick.
   */
  blast(cx: number, cy: number, radius: number, strength: number): void {
    const f0x = Math.max(0, Math.floor((cx - radius) / FIELD_CELL));
    const f1x = Math.min(FW - 1, Math.floor((cx + radius) / FIELD_CELL));
    const f0y = Math.max(0, Math.floor((cy - radius) / FIELD_CELL));
    const f1y = Math.min(FH - 1, Math.floor((cy + radius) / FIELD_CELL));
    for (let fy = f0y; fy <= f1y; fy++) {
      for (let fx = f0x; fx <= f1x; fx++) {
        const dx = (fx + 0.5) * FIELD_CELL - cx;
        const dy = (fy + 0.5) * FIELD_CELL - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= radius) continue;
        const c = fy * FW + fx;
        const k = (strength * (1 - d / radius)) / (d + 1);
        this.airX[c] += dx * k;
        this.airY[c] += dy * k - strength * 0.25 * (1 - d / radius); // blasts lift
        if (!this.airLive[c]) {
          this.airLive[c] = 1;
          this.airCells.push(c);
        }
      }
    }
  }

  /**
   * A steady directional jet (rocket exhaust): blend the air cells in a disc
   * toward wind (wx, wy) scaled by falloff. Blending rather than adding keeps a
   * jet that fires every tick at its own strength instead of piling up.
   */
  wind(cx: number, cy: number, radius: number, wx: number, wy: number): void {
    const f0x = Math.max(0, Math.floor((cx - radius) / FIELD_CELL));
    const f1x = Math.min(FW - 1, Math.floor((cx + radius) / FIELD_CELL));
    const f0y = Math.max(0, Math.floor((cy - radius) / FIELD_CELL));
    const f1y = Math.min(FH - 1, Math.floor((cy + radius) / FIELD_CELL));
    for (let fy = f0y; fy <= f1y; fy++) {
      for (let fx = f0x; fx <= f1x; fx++) {
        const dx = (fx + 0.5) * FIELD_CELL - cx;
        const dy = (fy + 0.5) * FIELD_CELL - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= radius) continue;
        const c = fy * FW + fx;
        const k = 1 - d / radius;
        // Spread outward a little, like an exhaust plume hitting the ground.
        this.airX[c] += (wx * k + dx * k * 3 - this.airX[c]) * 0.5;
        this.airY[c] += (wy * k - this.airY[c]) * 0.5;
        if (!this.airLive[c]) {
          this.airLive[c] = 1;
          this.airCells.push(c);
        }
      }
    }
  }

  /** Decay the air field; cells that fall quiet leave the live list. */
  private decayAir(): void {
    const next = this.airNext;
    next.length = 0;
    for (const c of this.airCells) {
      const ax = (this.airX[c] *= AIR_DECAY);
      const ay = (this.airY[c] *= AIR_DECAY);
      if (ax * ax + ay * ay < AIR_MIN * AIR_MIN) {
        this.airX[c] = this.airY[c] = 0;
        this.airLive[c] = 0;
      } else next.push(c);
    }
    this.airNext = this.airCells;
    this.airCells = next;
  }

  /**
   * `actors`, when given, makes particles physical to players: hits transfer
   * momentum and deal damage into the ActorField's per-actor accumulators,
   * and the mass and air fields push the actors (see ActorField).
   */
  step(col: Collider, dt: number, hooks: ParticleHooks = {}, actors?: ActorField): void {
    const n = this.n;
    const { x, y, vx, vy, kind } = this;
    const t = col.terrain;

    // 1. Integrate (per-kind tables gathered by index).
    const g = GRAVITY * dt;
    for (let i = 0; i < n; i++) {
      const k = kind[i];
      const d = K_DRAG[k];
      const ny = (vy[i] + g * K_GRAV[k]) * d;
      const nx = vx[i] * d;
      vy[i] = ny > MAX_SPEED ? MAX_SPEED : ny < -MAX_SPEED ? -MAX_SPEED : ny;
      vx[i] = nx > MAX_SPEED ? MAX_SPEED : nx < -MAX_SPEED ? -MAX_SPEED : nx;
    }

    // 2. Fields. Massive kinds build count + momentum; everyone samples.
    for (let i = 0; i < n; i++) {
      if (!K_MASS[kind[i]]) continue;
      const c = fieldIndex(x[i], y[i]);
      if (c < 0) continue;
      if (density[c]++ === 0) touched.push(c);
      momX[c] += vx[i];
      momY[c] += vy[i];
    }
    const airAny = this.airCells.length > 0;
    for (let i = 0; i < n; i++) {
      const c = fieldIndex(x[i], y[i]);
      if (c < 0) continue;
      const kd = kind[i];
      const k = density[c];
      if (K_MASS[kd]) {
        this.crowd[i] = k > CROWD ? 1 : 0;
        if (k >= PIC_MIN) {
          vx[i] += (momX[c] / k - vx[i]) * PIC_BLEND;
          vy[i] += (momY[c] / k - vy[i]) * PIC_BLEND;
        }
        if (k > CROWD) {
          // Pressure from the gradient of *excess* density, clamped to about
          // one tick of gravity: it can separate overlapping grains and hold
          // a pile up, but can never inject more energy than gravity removes.
          const fx = c % FW;
          const ex = (j: number) => (density[j] > CROWD ? density[j] - CROWD : 0);
          const e = k - CROWD;
          const l = fx > 0 ? ex(c - 1) : e;
          const r = fx < FW - 1 ? ex(c + 1) : e;
          const u = c >= FW ? ex(c - FW) : e;
          const d = c + FW < density.length ? ex(c + FW) : e;
          const px = (l - r) * PRESSURE * dt;
          const py = (u - d) * PRESSURE * dt;
          vx[i] += px > PUSH_MAX ? PUSH_MAX : px < -PUSH_MAX ? -PUSH_MAX : px;
          vy[i] += py > PUSH_MAX ? PUSH_MAX : py < -PUSH_MAX ? -PUSH_MAX : py;
        }
      } else if (k > 0) {
        // Light particles ride the local flow of the mass field.
        const a = K_ADVECT[kd];
        if (a > 0) {
          vx[i] += (momX[c] / k - vx[i]) * a;
          vy[i] += (momY[c] / k - vy[i]) * a;
        }
      }
      if (airAny && this.airLive[c]) {
        const ax = this.airX[c];
        const ay = this.airY[c];
        const a = K_AIR[kd];
        vx[i] += (ax - vx[i]) * a;
        vy[i] += (ay - vy[i]) * a;
        if (ax * ax + ay * ay > AIR_WAKE * AIR_WAKE) this.rest[i] = 0;
      }
    }
    // Fields act on actors too: a dense sand flow drags a body along with it,
    // a blast's air field shoves it. Sampled over the cells the body covers.
    if (actors && actors.n > 0) actors.sampleFields(density, momX, momY, this.airX, this.airY, this.airLive, dt);
    for (const c of touched) {
      density[c] = 0;
      momX[c] = 0;
      momY[c] = 0;
    }
    touched.length = 0;
    this.decayAir();

    // 3 + 4. Sweep, respond, per-kind contact behaviour.
    let i = 0;
    while (i < this.n) {
      const kd = kind[i];
      const mode = K_CONTACT[kd];
      let px = x[i];
      let py = y[i];
      this.px[i] = px;
      this.py[i] = py;
      if (mode === C_RIGID && this.rest[i]) {
        // A resting gib costs one support test until something disturbs it.
        if (t.isSolid(Math.floor(px), Math.floor(py) + 1)) {
          if (--this.life[i] === 0) this.removeAt(i);
          else i++;
          continue;
        }
        this.rest[i] = 0;
      }
      if (t.isSolid(Math.floor(px), Math.floor(py))) {
        if (mode !== C_SETTLE && mode !== C_RIGID) {
          this.removeAt(i); // cosmetic and buried: gone
          continue;
        }
        // Buried by a deposit (grains landing in a dense block overlap the
        // cells their neighbours just settled into): move to the nearest free
        // cell. Rare and bounded, so a small ring search is fine.
        if (!nearestAir(t, Math.floor(px), Math.floor(py), free)) {
          i++; // nowhere to go yet: keep it (never destroy material) and retry next tick
          continue;
        }
        px = free.x + 0.5;
        py = free.y + 0.5;
      }
      col.sweep(px, py, vx[i] * dt, vy[i] * dt, hit);
      if (actors && actors.n > 0 && K_TOUCHES[kd]) {
        // Did the free part of this tick's path cross a body? A handful of
        // field-cell lookups along the segment find the candidates.
        const a = actors.segment(px, py, hit.x, hit.y, aq, this.owner[i]);
        if (a >= 0) {
          const ex = px + (hit.x - px) * aq.t;
          const ey = py + (hit.y - py) * aq.t;
          const rvx = vx[i] - actors.vx[a];
          const rvy = vy[i] - actors.vy[a];
          const rs = Math.sqrt(rvx * rvx + rvy * rvy);
          const pm = K_PMASS[kd];
          // Where on the body: a little way in along the relative path.
          const inX = rs > 0 ? (rvx / rs) * 2 : 0;
          const inY = rs > 0 ? (rvy / rs) * 2 : 0;
          actors.hit(a, ex + inX, ey + inY, pm * rvx, pm * rvy, pm * K_SHARP[kd] * rs, K_WOUND[kd], K_BURN[kd] * dt, this.owner[i], kd === PK.Shrapnel ? this.aux[i] : KIND_WEAPON[kd]);
          const on = K_ON_ACTOR[kd];
          if (on === A_EMBED) {
            this.removeAt(i);
            continue;
          }
          if (on === A_BOUNCE) {
            // Rebound off the body, losing most of the relative velocity.
            x[i] = ex;
            y[i] = ey;
            vx[i] = actors.vx[a] - rvx * 0.25;
            vy[i] = actors.vy[a] - rvy * 0.25;
            if (--this.life[i] === 0) this.removeAt(i);
            else i++;
            continue;
          }
        }
      }
      px = hit.x;
      py = hit.y;
      x[i] = px;
      y[i] = py;
      if (hit.hit) {
        if (mode === C_STAIN) {
          hooks.stain?.(hit.cx, hit.cy);
          this.removeAt(i);
          continue;
        }
        vel.x = vx[i];
        vel.y = vy[i];
        const jn = contact(vel, hit.nx, hit.ny, K_E[kd], K_MU[kd]);
        vx[i] = vel.x;
        vy[i] = vel.y;
        if (mode === C_SPENT && vel.x * vel.x + vel.y * vel.y < SPARK_DIE * SPARK_DIE) {
          this.removeAt(i);
          continue;
        }
        if (mode === C_RIGID) {
          // Tumble in proportion to how hard it struck; hard hits splash blood.
          this.spinRate[i] = (hash01(i, this.life[i]) - 0.5) * Math.min(0.5, jn / 400);
          if (jn > 90 && (this.aux[i] & GIB_INORGANIC) === 0) {
            for (let b = 0; b < 2; b++) this.spawn(PK.Blood, px, py, (hash01(i, b) - 0.5) * jn * 0.4, -jn * 0.15, 48);
          }
          if (hit.ny < -0.5 && vel.x * vel.x + vel.y * vel.y < 20 * 20) {
            this.rest[i] = 1;
            vx[i] = vy[i] = 0;
            this.spin[i] = Math.round(this.spin[i]); // settle flat on a quarter turn
          }
        }
      }
      if (mode === C_RIGID) {
        const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
        this.spin[i] += this.spinRate[i] * sp * dt;
        // Fast meat leaves a blood trail.
        if (sp > 120 && (this.aux[i] & GIB_INORGANIC) === 0 && (this.life[i] & 1) === 0) this.spawn(PK.Blood, px, py, vx[i] * 0.1, vy[i] * 0.1, 48);
      }
      if (mode === C_SETTLE) {
        // Resting = supported from below and slower than a couple of ticks of
        // gravity (a resting body re-gains g*dt every tick, so a stricter
        // threshold would make resting contact jitter forever). Inside a
        // packed crowd, residual pressure jitter is not motion: such a grain
        // is part of a static pile and may settle at a looser threshold.
        const cx = Math.floor(px);
        const cy = Math.floor(py);
        const supported = t.isSolid(cx, cy + 1);
        const settleV = this.crowd[i] ? SETTLE_SPEED * CROWD_SETTLE : SETTLE_SPEED;
        const slow = vx[i] * vx[i] + vy[i] * vy[i] < settleV * settleV;
        this.rest[i] = supported && slow ? this.rest[i] + 1 : 0;
        if (this.rest[i] >= SETTLE_TICKS) {
          // Come to rest: project onto the lattice (one bounded walk, at
          // settle time only) and become terrain.
          const p = projectRest(t, cx, cy, MAT_LOOSE[this.aux[i]], free);
          if (p === SETTLED) {
            hooks.settle?.(free.x, free.y, this.aux[i]);
            this.removeAt(i);
            continue;
          }
          if (p === PARTIAL) {
            // Long way down to a stable spot: carry on from where the walk
            // got to next tick, so each tick's work stays bounded.
            x[i] = free.x + 0.5;
            y[i] = free.y + 0.5;
            this.rest[i] = SETTLE_TICKS - 1;
          }
        }
      }
      if (py >= WORLD_H) {
        this.removeAt(i);
        continue;
      }
      if (--this.life[i] === 0) {
        if (mode === C_SETTLE && hooks.settle) {
          // Out of time: always conserve material. Move to a free cell if
          // buried, then drop onto the support below and deposit there.
          let fx = Math.floor(px);
          let fy = Math.floor(py);
          if (t.isSolid(fx, fy) && nearestAir(t, fx, fy, free)) {
            fx = free.x;
            fy = free.y;
          }
          dropToSupport(t, fx, fy, this.aux[i], hooks.settle);
        }
        this.removeAt(i);
        continue;
      }
      i++;
    }
  }
}

/** Cheap deterministic hash to [0, 1) for cosmetic variation inside the step. */
function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

function fieldIndex(x: number, y: number): number {
  const fx = Math.floor(x) >> FIELD_SHIFT;
  const fy = Math.floor(y) >> FIELD_SHIFT;
  if (fx < 0 || fy < 0 || fx >= FW || fy >= FH) return -1;
  return fy * FW + fx;
}

/** Bounds of the last applyCarve's effect (inclusive terrain rect). */
export const carveExtent = { x0: 0, y0: 0, x1: 0, y1: 0 };

/**
 * The complete, deterministic effect of a carve op, run identically by the
 * server and every client holding the chunk: remove cells, then detach loose
 * material the carve left unstable (Terrain.collapseFrom). Returns removed
 * cells; `removed` and `detached` receive x, y, mat triples; `carveExtent`
 * receives every cell read or written, for chunk version bookkeeping.
 */
export function applyCarve(
  t: Terrain,
  x: number,
  y: number,
  r: number,
  core: number,
  removed: number[],
  detached: number[],
): number {
  removed.length = 0;
  detached.length = 0;
  carveExtent.x0 = x - r;
  carveExtent.x1 = x + r;
  carveExtent.y0 = y - r;
  carveExtent.y1 = y + r;
  const n = t.carve(x, y, r, core, (cx, cy, m) => {
    removed.push(cx, cy, m);
  });
  if (n === 0) return 0;
  t.collapseFrom(x, y, r, (cx, cy, m) => detached.push(cx, cy, m), carveExtent);
  return n;
}

/**
 * Drop a cell straight down onto the first support below it (used when the
 * grain system is at capacity, so collapsing material is never lost).
 */
export function dropToSupport(t: Terrain, x: number, y: number, mat: number, deposit: (x: number, y: number, mat: number) => void): void {
  for (let yy = Math.max(0, y); yy < WORLD_H - 1; yy++) {
    if (t.isSolid(x, yy)) return; // nothing free below (cannot happen right after a detach)
    if (t.isSolid(x, yy + 1)) {
      deposit(x, yy, mat);
      return;
    }
  }
}

/** Material a destroyed cell turns into when it lands again. */
export function rubbleOf(mat: number): number {
  if (mat === Mat.Sand || mat === Mat.Gold || mat === Mat.Metal) return mat;
  return Mat.Rubble;
}

/**
 * Throw debris from a carve and release the collapse it caused. The server and
 * every client in range call this with identical inputs (same op, same chunk
 * state, same seed), so the shower and the collapse cost zero bandwidth.
 */
export function releaseCarve(
  grains: Particles,
  removed: number[],
  detached: number[],
  cx: number,
  cy: number,
  max: number,
  rng: Rng,
  overflow?: (x: number, y: number, mat: number) => void,
  owner = NO_OWNER,
): void {
  const cells = removed.length / 3;
  if (cells > 0 && max > 0) {
    const count = Math.min(max, Math.ceil(cells / 3));
    for (let k = 0; k < count; k++) {
      const j = rng.int(cells) * 3;
      const x = removed[j] + 0.5;
      const y = removed[j + 1] + 0.5;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) + 1;
      const sp = rng.range(70, 260);
      grains.spawnGrain(x, y, (dx / d) * sp + rng.range(-40, 40), (dy / d) * sp - rng.range(60, 170), rubbleOf(removed[j + 2]), 240, owner);
    }
  }
  // Collapsing material starts nearly at rest and just falls.
  // Draw both random numbers before spawning so the RNG stream (and so every
  // mirrored grain) is identical whether or not this side has capacity.
  for (let j = 0; j < detached.length; j += 3) {
    const vx = rng.range(-6, 6);
    const vy = rng.range(0, 12);
    if (!grains.spawnGrain(detached[j] + 0.5, detached[j + 1] + 0.5, vx, vy, detached[j + 2], 600, owner)) {
      overflow?.(detached[j], detached[j + 1], detached[j + 2]);
    }
  }
}

/** Gold spilled by a dying clone. Mirrored by clients from the kill record's seed. */
export function spillGold(grains: Particles, x: number, y: number, vx: number, vy: number, count: number, rng: Rng): void {
  for (let i = 0; i < count; i++) {
    grains.spawnGrain(x, y, vx * 0.5 + rng.range(-110, 110), vy * 0.5 + rng.range(-230, -50), Mat.Gold, 240);
  }
}

const ACTOR_MASS = 8; // impulse units per cell/s of actor velocity change
const tested = new Int32Array(4); // 128-slot bitmask scratch
const SAND_MIN = 6; // grains overlapping a body before a flow can drag it
const SAND_DRAG = 0.012; // per grain, capped by SAND_DRAG_MAX
const SAND_DRAG_MAX = 0.35;
const AIR_ACTOR = 0.35; // per-tick blend toward the blast wind
export const MAX_ACTORS = 140; // 64 clones + 64 drop rockets + tanks + dropships

/**
 * Actors (players) as seen by the particle engine. Each tick the world loads
 * every live body; the field splats body ids into the coarse grid so a moving
 * particle finds the bodies near its path with a few cell lookups instead of
 * testing every player (cost O(N + bodies), never O(N x bodies)).
 *
 * Results for the world to resolve after the step:
 *   dvx/dvy  per body: velocity change from impacts and field forces
 *   hits     per impact: where on the body it struck (body-local cell), the
 *            penetration energy (mass x sharpness x relative speed), wound
 *            points, burn damage, owner and weapon code. The world turns
 *            these into wounds on individual parts (body.ts).
 */
export class ActorField {
  n = 0;
  /** Caller's id per slot (the world uses player ids, and CRAFT_ID_BASE + slot for rockets). */
  readonly id = new Uint8Array(MAX_ACTORS);
  readonly x = new Float32Array(MAX_ACTORS); // body top-left
  readonly y = new Float32Array(MAX_ACTORS);
  readonly vx = new Float32Array(MAX_ACTORS);
  readonly vy = new Float32Array(MAX_ACTORS);
  readonly w = new Float32Array(MAX_ACTORS); // body size per slot
  readonly h = new Float32Array(MAX_ACTORS);
  /** Mass per slot (impacts and field forces divide by it). */
  readonly mass = new Float32Array(MAX_ACTORS);
  /** Particle owner this body ignores (a rocket and its own exhaust), 255 = none. */
  readonly immune = new Uint8Array(MAX_ACTORS);
  /** How strongly the blast/air field drags this body (rockets: their own jet would). */
  readonly airScale = new Float32Array(MAX_ACTORS);
  readonly dvx = new Float32Array(MAX_ACTORS);
  readonly dvy = new Float32Array(MAX_ACTORS);
  // Hit records (struct of arrays, grown as needed).
  hitN = 0;
  hitSlot = new Uint8Array(256);
  hitLx = new Float32Array(256);
  hitLy = new Float32Array(256);
  hitEnergy = new Float32Array(256);
  hitWound = new Float32Array(256);
  hitBurn = new Float32Array(256);
  hitOwner = new Uint8Array(256);
  hitWeapon = new Uint8Array(256);
  // Up to two bodies per field cell (bodies rarely overlap more than that).
  private readonly cellA = new Int8Array(FW * FH).fill(-1);
  private readonly cellB = new Int8Array(FW * FH).fill(-1);
  private readonly used: number[] = [];

  constructor(
    readonly bodyW: number,
    readonly bodyH: number,
  ) {}

  /** Drop last tick's bodies and results. */
  clear(): void {
    for (const c of this.used) {
      this.cellA[c] = -1;
      this.cellB[c] = -1;
    }
    this.used.length = 0;
    for (let a = 0; a < this.n; a++) this.dvx[a] = this.dvy[a] = 0;
    this.n = 0;
    this.hitN = 0;
  }

  /** Add a body; returns its slot. Size and mass default to a clone's. */
  add(id: number, x: number, y: number, vx: number, vy: number, w = this.bodyW, h = this.bodyH, mass = ACTOR_MASS, immune = 255, airScale = 1): number {
    if (this.n >= MAX_ACTORS) return -1;
    const a = this.n++;
    this.immune[a] = immune;
    this.airScale[a] = airScale;
    this.w[a] = w;
    this.h[a] = h;
    this.mass[a] = mass;
    this.id[a] = id;
    this.x[a] = x;
    this.y[a] = y;
    this.vx[a] = vx;
    this.vy[a] = vy;
    this.dvx[a] = this.dvy[a] = 0;
    const f0x = Math.max(0, Math.floor(x) >> FIELD_SHIFT);
    const f1x = Math.min(FW - 1, Math.floor(x + w - 1) >> FIELD_SHIFT);
    const f0y = Math.max(0, Math.floor(y) >> FIELD_SHIFT);
    const f1y = Math.min(FH - 1, Math.floor(y + h - 1) >> FIELD_SHIFT);
    for (let fy = f0y; fy <= f1y; fy++) {
      for (let fx = f0x; fx <= f1x; fx++) {
        const c = fy * FW + fx;
        if (this.cellA[c] < 0) {
          this.cellA[c] = a;
          this.used.push(c);
        } else if (this.cellB[c] < 0) this.cellB[c] = a;
      }
    }
    return a;
  }

  /**
   * First body whose box the segment (x0,y0)->(x1,y1) enters: walk the path in
   * half-field-cell steps, test the (at most two) bodies registered in each
   * cell with an exact slab test, keep the earliest entry. Writes the entry
   * fraction to `out.t`.
   */
  segment(x0: number, y0: number, x1: number, y1: number, out: { t: number }, owner = 255): number {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(len / (FIELD_CELL / 2)));
    let best = -1;
    let bestT = 2;
    tested.fill(0); // bitmask of slots already slab-tested
    for (let s = 0; s <= steps; s++) {
      const c = fieldIndex(x0 + (dx * s) / steps, y0 + (dy * s) / steps);
      if (c < 0) continue;
      for (let k = 0; k < 2; k++) {
        const a = k === 0 ? this.cellA[c] : this.cellB[c];
        if (a < 0) break;
        if (tested[a >> 5] & (1 << (a & 31))) continue;
        tested[a >> 5] |= 1 << (a & 31);
        if (owner !== 255 && this.immune[a] === owner) continue;
        const t = segmentBox(x0, y0, dx, dy, this.x[a], this.y[a], this.x[a] + this.w[a], this.y[a] + this.h[a]);
        if (t >= 0 && t < bestT) {
          bestT = t;
          best = a;
        }
      }
      if (best >= 0) break; // later cells can only be further along the path
    }
    out.t = bestT;
    return best;
  }

  /** Record a particle impact on body slot `a` at world point (ex, ey). */
  hit(a: number, ex: number, ey: number, jx: number, jy: number, energy: number, wound: number, burn: number, owner: number, weapon: number): void {
    this.dvx[a] += jx / this.mass[a];
    this.dvy[a] += jy / this.mass[a];
    if (wound <= 0 && burn <= 0 && energy <= 0) return;
    if (this.hitN === this.hitSlot.length) this.growHits();
    const h = this.hitN++;
    this.hitSlot[h] = a;
    this.hitLx[h] = ex - this.x[a];
    this.hitLy[h] = ey - this.y[a];
    this.hitEnergy[h] = energy;
    this.hitWound[h] = wound;
    this.hitBurn[h] = burn;
    this.hitOwner[h] = owner;
    this.hitWeapon[h] = weapon;
  }

  private growHits(): void {
    const n = this.hitSlot.length * 2;
    const g = <T extends Uint8Array | Float32Array>(a: T, make: (n: number) => T): T => {
      const b = make(n);
      b.set(a);
      return b;
    };
    this.hitSlot = g(this.hitSlot, (k) => new Uint8Array(k));
    this.hitLx = g(this.hitLx, (k) => new Float32Array(k));
    this.hitLy = g(this.hitLy, (k) => new Float32Array(k));
    this.hitEnergy = g(this.hitEnergy, (k) => new Float32Array(k));
    this.hitWound = g(this.hitWound, (k) => new Float32Array(k));
    this.hitBurn = g(this.hitBurn, (k) => new Float32Array(k));
    this.hitOwner = g(this.hitOwner, (k) => new Uint8Array(k));
    this.hitWeapon = g(this.hitWeapon, (k) => new Uint8Array(k));
  }

  /**
   * Field forces on bodies: over the field cells a body covers, a dense sand
   * flow drags it toward the flow's mean velocity (landslides carry you), and
   * a live blast wind blends its velocity toward the wind.
   */
  sampleFields(
    density: Uint16Array,
    momX: Float32Array,
    momY: Float32Array,
    airX: Float32Array,
    airY: Float32Array,
    airLive: Uint8Array,
    _dt: number,
  ): void {
    for (let a = 0; a < this.n; a++) {
      const f0x = Math.max(0, Math.floor(this.x[a]) >> FIELD_SHIFT);
      const f1x = Math.min(FW - 1, Math.floor(this.x[a] + this.w[a] - 1) >> FIELD_SHIFT);
      const f0y = Math.max(0, Math.floor(this.y[a]) >> FIELD_SHIFT);
      const f1y = Math.min(FH - 1, Math.floor(this.y[a] + this.h[a] - 1) >> FIELD_SHIFT);
      const heavy = ACTOR_MASS / this.mass[a]; // a rocket is pushed less than a clone
      let d = 0;
      let mx = 0;
      let my = 0;
      let ax = 0;
      let ay = 0;
      let an = 0;
      for (let fy = f0y; fy <= f1y; fy++) {
        for (let fx = f0x; fx <= f1x; fx++) {
          const c = fy * FW + fx;
          d += density[c];
          mx += momX[c];
          my += momY[c];
          if (airLive[c]) {
            ax += airX[c];
            ay += airY[c];
            an++;
          }
        }
      }
      if (d >= SAND_MIN) {
        const k = Math.min(SAND_DRAG_MAX, d * SAND_DRAG) * heavy;
        this.dvx[a] += (mx / d - this.vx[a]) * k;
        this.dvy[a] += (my / d - this.vy[a]) * k;
      }
      if (an > 0) {
        this.dvx[a] += (ax / an - this.vx[a]) * AIR_ACTOR * heavy * this.airScale[a];
        this.dvy[a] += (ay / an - this.vy[a]) * AIR_ACTOR * heavy * this.airScale[a];
      }
    }
  }
}

interface FragmentDef {
  shrapnel: number;
  speed: number;
  embers: number;
}
/** Explosion fragments by projectile kind (bullet, rocket, grenade). */
const FRAGMENTS: readonly FragmentDef[] = [
  { shrapnel: 0, speed: 0, embers: 0 },
  { shrapnel: 36, speed: 820, embers: 18 }, // rocket
  { shrapnel: 56, speed: 760, embers: 24 }, // grenade
  { shrapnel: 0, speed: 0, embers: 0 },
  { shrapnel: 44, speed: 820, embers: 20 }, // tank shell
  { shrapnel: 0, speed: 0, embers: 0 },
  { shrapnel: 0, speed: 0, embers: 0 },
  { shrapnel: 110, speed: 920, embers: 50 }, // dropship bomb
  { shrapnel: 50, speed: 800, embers: 34 }, // runaway engine
  { shrapnel: 0, speed: 0, embers: 0 }, // dart
  { shrapnel: 48, speed: 760, embers: 22 }, // mine
];

/**
 * Shrapnel and burning embers thrown by an explosion. The server spawns them
 * as real, damaging particles; every client in range calls this with the same
 * seed (sent in the projectile-end record) to mirror the same shower.
 */
export function explosionFragments(p: Particles, x: number, y: number, projKind: number, owner: number, rng: Rng): void {
  const def = FRAGMENTS[projKind];
  if (!def) return;
  for (let k = 0; k < def.shrapnel; k++) {
    // Direction from two uniforms, normalised: arithmetic only, no trig.
    let dx = rng.range(-1, 1);
    let dy = rng.range(-1, 1);
    const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
    dx /= d;
    dy /= d;
    const s = def.speed * rng.range(0.6, 1);
    p.spawn(PK.Shrapnel, x, y, dx * s, dy * s, rng.range(14, 24), projKind, 0, owner);
  }
  for (let k = 0; k < def.embers; k++) {
    let dx = rng.range(-1, 1);
    let dy = rng.range(-1, 1);
    const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
    dx /= d;
    dy /= d;
    const s = def.speed * 0.35 * rng.range(0.3, 1);
    p.spawn(PK.Flame, x, y, dx * s, dy * s - 30, rng.range(10, 18), 0, 0, owner);
  }
}

/**
 * A destroyed drop rocket: heavy hull fragments (real particles that hurt,
 * push the sand flow, get blown around and settle as scrap-metal terrain),
 * burning embers and a little shrapnel. Server spawns them authoritatively;
 * clients mirror the same shower from the seed in the destruction record.
 */
export function craftFragments(p: Particles, x: number, y: number, vx: number, vy: number, owner: number, rng: Rng): void {
  for (let k = 0; k < 48; k++) {
    let dx = rng.range(-1, 1);
    let dy = rng.range(-1, 1);
    const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
    dx /= d;
    dy /= d;
    const s = rng.range(90, 330);
    p.spawn(PK.Hull, x + dx * 4, y + dy * 8, vx * 0.6 + dx * s, vy * 0.6 + dy * s - 60, rng.range(300, 420), Mat.Metal, 0, owner);
  }
  for (let k = 0; k < 30; k++) {
    let dx = rng.range(-1, 1);
    let dy = rng.range(-1, 1);
    const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
    dx /= d;
    dy /= d;
    p.spawn(PK.Flame, x, y, vx * 0.3 + dx * rng.range(40, 160), vy * 0.3 + dy * rng.range(40, 160) - 40, rng.range(12, 22), 0, 0, owner);
  }
  explosionFragments(p, x, y, 1, owner, rng); // rocket-grade shrapnel
}

/**
 * A drop-rocket part shot off at (x, y): a few heavy hull fragments (they
 * hurt, and settle as scrap metal) plus sparks. Seeded so clients mirror it.
 */
export function craftPartFragments(p: Particles, x: number, y: number, vx: number, vy: number, owner: number, rng: Rng): void {
  for (let k = 0; k < 8; k++) {
    const a = rng.range(0, Math.PI * 2);
    const s = rng.range(50, 170);
    p.spawn(PK.Hull, x, y, vx + Math.cos(a) * s, vy + Math.sin(a) * s - 40, rng.range(300, 420), Mat.Metal, 0, owner);
  }
  for (let k = 0; k < 10; k++) {
    const a = rng.range(0, Math.PI * 2);
    const s = rng.range(80, 260);
    p.spawn(PK.Spark, x, y, vx + Math.cos(a) * s, vy + Math.sin(a) * s, rng.range(6, 14), 0, 0, owner);
  }
}
