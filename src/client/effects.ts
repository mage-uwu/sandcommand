import { GIB_INORGANIC, NO_OWNER, PK, type Particles, craftFragments, craftPartFragments, explosionFragments } from '../shared/particles.ts';
import { CRAFT_H } from '../shared/craft.ts';
import { Rng } from '../shared/rng.ts';
import { Part, has } from '../shared/body.ts';

/**
 * Client-side effect emitters. There is no separate effects system: every
 * spark, flame, puff of smoke, blood drop and body part is a particle of the
 * shared field engine (src/shared/particles.ts), stepped in the same pass as
 * the mirrored terrain grains, pushed by the same blast field and drawn into
 * the same pixel buffer. These helpers only decide what to spawn.
 *
 * Lifetimes are in ticks (30 per second). Cosmetic, so Math.random is fine.
 */

// Gib sprite pieces (art in sprites.ts).
export const GIB_HELMET = 0;
export const GIB_TORSO = [1, 2];
export const GIB_ARM = 3;
export const GIB_LEG = [4, 5];
export const GIB_PACK = 6;
export const GIB_MEAT = [7, 8, 9];
export const GIB_HEAD = 10;
export const GIB_VEST = 11;
export const GIB_CROWN = 16;

const rnd = (a: number, b: number) => a + (b - a) * Math.random();

function burst(p: Particles, kind: number, x: number, y: number, count: number, speed: number, life: number, color = 0, vx = 0, vy = 0): void {
  for (let k = 0; k < count; k++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    p.spawn(kind, x, y, vx + Math.cos(a) * s, vy + Math.sin(a) * s, life * (0.5 + Math.random() * 0.5), 0, color);
  }
}

/** Jetpack exhaust: flame jetting down, trailing smoke. */
export function jetExhaust(p: Particles, x: number, y: number, vx: number, vy: number): void {
  p.spawn(PK.Flame, x + rnd(-1.5, 1.5), y, vx * 0.3 + rnd(-15, 15), vy * 0.3 + rnd(110, 170), rnd(5, 9));
  if (Math.random() < 0.35) p.spawn(PK.Smoke, x, y + 2, rnd(-10, 10), rnd(30, 60), rnd(20, 40));
}

/** Bullet strike: sparks plus a puff of the struck material. */
export function bulletImpact(p: Particles, x: number, y: number, dustColor: number): void {
  burst(p, PK.Spark, x, y, 4, 150, 12);
  burst(p, PK.Dust, x, y, 3, 50, 18, dustColor);
}

/** Muzzle blast along the firing direction. */
export function muzzle(p: Particles, x: number, y: number, dx: number, dy: number, heavy: boolean): void {
  const n = heavy ? 8 : 3;
  for (let k = 0; k < n; k++) {
    const s = rnd(60, 200);
    p.spawn(PK.Spark, x, y, dx * s + rnd(-30, 30), dy * s + rnd(-30, 30), rnd(3, 6));
  }
  if (heavy) burst(p, PK.Smoke, x, y, 6, 40, 30);
}

/**
 * A heavy rifle's muzzle blast, .50-cal style: a hard flash, and the brake
 * throwing smoke out sideways and back in two jets, a dust kick under it.
 */
export function heavyMuzzle(p: Particles, x: number, y: number, dx: number, dy: number): void {
  for (let k = 0; k < 10; k++) {
    const s = rnd(120, 340);
    p.spawn(PK.Flame, x, y, dx * s + rnd(-40, 40), dy * s + rnd(-40, 40), rnd(2, 4));
  }
  // The brake: smoke out to either side of the barrel, a little back.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const s = rnd(40, 130);
      p.spawn(PK.Smoke, x, y, (-dy * side - dx * 0.35) * s + rnd(-10, 10), (dx * side - dy * 0.35) * s + rnd(-10, 10), rnd(30, 55));
    }
  }
  for (let k = 0; k < 8; k++) p.spawn(PK.Smoke, x + dx * rnd(2, 10), y + dy * rnd(2, 10), dx * rnd(20, 70) + rnd(-12, 12), dy * rnd(20, 70) + rnd(-12, 12), rnd(40, 70));
}

/**
 * A heavy slug's wake: a supersonic vapour trail hanging along its whole
 * path, thick at the muzzle and thinning out, drifting and spreading as it
 * fades. (Only the stretch within `near` of (cx, cy) is spawned.)
 */
export function slugTrail(p: Particles, x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, near: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const step = Math.max(1.4, len / 420);
  for (let d = 4; d < len; d += step) {
    const x = x0 + ux * d;
    const y = y0 + uy * d;
    if (Math.abs(x - cx) > near || Math.abs(y - cy) > near) continue;
    // Thick and billowing near the muzzle, a tight vapour line further out.
    const near0 = Math.max(0, 1 - d / 120);
    const n = 2 + Math.round(near0 * 3);
    for (let k = 0; k < n; k++) {
      const off = rnd(-1.5, 1.5) * (1 + near0 * 2);
      const spread = 6 + near0 * 30;
      p.spawn(PK.Smoke, x - uy * off, y + ux * off, ux * rnd(4, 24) - uy * rnd(-spread, spread), uy * rnd(4, 24) + ux * rnd(-spread, spread) - rnd(0, 6), rnd(40, 90));
    }
  }
}

/** A heavy slug striking: a burst of grit and sparks thrown back out of the hole, and a puff of dust. */
export function slugImpact(p: Particles, x: number, y: number, dx: number, dy: number, dustColor: number): void {
  for (let k = 0; k < 14; k++) {
    const s = rnd(80, 320);
    p.spawn(PK.Spark, x, y, -dx * s + rnd(-120, 120), -dy * s + rnd(-120, 120), rnd(6, 14));
  }
  burst(p, PK.Dust, x, y, 12, 110, 26, dustColor);
  burst(p, PK.Smoke, x, y, 6, 40, 40);
  p.blast(x, y, 14, 180);
}

/** Rocket exhaust trail. */
export function rocketTrail(p: Particles, x: number, y: number): void {
  p.spawn(PK.Flame, x, y, rnd(-20, 20), rnd(-20, 20), rnd(3, 5));
  p.spawn(PK.Smoke, x, y, rnd(-8, 8), rnd(-8, 8), rnd(25, 45));
}

/**
 * Explosion: the server's shrapnel and embers, mirrored from the record's
 * seed (those are the particles that actually wound and push players), plus
 * a cosmetic fireball core, sparks and smoke, and the blast wave written into
 * the air field that every nearby particle feels.
 */
export function explosion(p: Particles, x: number, y: number, projKind: number, radius: number, blastStrength: number, seed: number): void {
  p.blast(x, y, radius * 1.6, blastStrength);
  explosionFragments(p, x, y, projKind, NO_OWNER, new Rng(seed));
  burst(p, PK.Flame, x, y, 24, radius * 6, 10);
  burst(p, PK.Spark, x, y, 20, radius * 13, 20);
  burst(p, PK.Smoke, x, y, 40, radius * 3, 75);
}

/** Digger suction dust. */
export function digDust(p: Particles, x: number, y: number, color: number, count = 2): void {
  burst(p, PK.Dust, x, y, count, 50, 14, color);
}

export function bloodSplat(p: Particles, x: number, y: number, count: number, speed: number, vx = 0, vy = 0): void {
  for (let k = 0; k < count; k++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * Math.random();
    p.spawn(PK.Blood, x, y, vx + Math.cos(a) * s, vy + Math.sin(a) * s - speed * 0.25, 48);
  }
}

/**
 * Burst a clone into parts. `violence` grows with overkill; explosive deaths
 * scatter harder. Part offsets follow the body layout so the helmet starts at
 * the top and boots at the bottom.
 */
export function gibBurst(p: Particles, cx: number, cy: number, vx: number, vy: number, team: number, violence: number, parts = 0x1ff, synthetic = false): void {
  const v = Math.min(2.6, 1 + violence * 0.6);
  const on = (part: number) => has(parts, part);
  const fling = (ox: number, oy: number, piece: number, speed: number) => {
    const a = Math.atan2(oy - 2, ox) + (Math.random() - 0.5) * 1.6;
    const s = speed * (0.4 + Math.random() * 0.8) * v;
    spawnGib(p, cx + ox, cy + oy, vx * 0.5 + Math.cos(a) * s, vy * 0.5 + Math.sin(a) * s - 50 - Math.random() * 50, piece, team);
  };
  // Only what is still attached flies apart.
  if (on(Part.Head)) fling(0, -6, on(Part.Helmet) ? GIB_HELMET : GIB_HEAD, 70);
  if (on(Part.Crown)) fling(0, -8, GIB_CROWN, 80);
  if (on(Part.Vest)) fling(1, -2, GIB_VEST, 60);
  fling(-1, -1, GIB_TORSO[0], 50);
  fling(1, 0, GIB_TORSO[1], 50);
  if (on(Part.OffArm)) fling(-3, -1, GIB_ARM, 80);
  if (on(Part.GunArm)) fling(3, -1, GIB_ARM, 80);
  if (on(Part.LegB)) fling(-1, 5, GIB_LEG[0], 60);
  if (on(Part.LegF)) fling(1, 5, GIB_LEG[1], 60);
  if (on(Part.Jetpack)) fling(-3, 0, GIB_PACK, 45);
  const meat = Math.round(8 + 6 * v);
  if (synthetic) {
    // A machine comes apart in plates and wiring: scrap, sparks, a puff of black smoke.
    for (let k = 0; k < meat; k++) fling((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10, k % 3 === 0 ? GIB_NOZZLE : GIB_PLATE, 90);
    burst(p, PK.Spark, cx, cy, Math.round(30 + 16 * v), 200 + 60 * v, 14, 0, vx * 0.3, vy * 0.3);
    burst(p, PK.Smoke, cx, cy, 14, 40, 60);
    return;
  }
  for (let k = 0; k < meat; k++) fling((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10, GIB_MEAT[k % GIB_MEAT.length], 90);
  bloodSplat(p, cx, cy, Math.round(24 + 14 * v), 70 + 30 * v, vx * 0.3, vy * 0.3);
}

const INORGANIC = new Set([GIB_HELMET, GIB_PACK, GIB_VEST, 12, 13, 14, 15, GIB_CROWN]);

function spawnGib(p: Particles, x: number, y: number, vx: number, vy: number, piece: number, team: number): void {
  const i = p.n;
  if (!p.spawn(PK.Gib, x, y, vx, vy, rnd(420, 540), piece | (INORGANIC.has(piece) ? GIB_INORGANIC : 0), team)) return;
  p.spin[i] = Math.floor(Math.random() * 4);
  p.spinRate[i] = (Math.random() - 0.5) * 0.08;
}

/** Gib sprite for a body part torn off a living clone. */
const PART_GIB: Record<number, number> = {
  [Part.Head]: GIB_HEAD,
  [Part.GunArm]: GIB_ARM,
  [Part.OffArm]: GIB_ARM,
  [Part.LegB]: GIB_LEG[0],
  [Part.LegF]: GIB_LEG[1],
  [Part.Helmet]: GIB_HELMET,
  [Part.Vest]: GIB_VEST,
  [Part.Jetpack]: GIB_PACK,
  [Part.Crown]: GIB_CROWN,
};

/**
 * A part torn off a living clone: the piece flies off, flesh parts spray a
 * fountain of blood and a little meat; armour just clatters away with sparks.
 */
export function limbOff(p: Particles, part: number, x: number, y: number, vx: number, vy: number, team: number, synthetic = false): void {
  const piece = PART_GIB[part];
  if (piece === undefined) return;
  spawnGib(p, x, y, vx, vy, piece, team);
  if (part === Part.Helmet || part === Part.Vest || part === Part.Jetpack || part === Part.Crown || synthetic) {
    burst(p, PK.Spark, x, y, 8, 160, 10);
    return;
  }
  bloodSplat(p, x, y, 28, 140, vx * 0.3, vy * 0.3);
  for (let k = 0; k < 3; k++) spawnGib(p, x, y, vx * 0.6 + rnd(-60, 60), vy * 0.6 + rnd(-90, 0), GIB_MEAT[k % 3], team);
}

/** Open stumps drip: call once per tick per maimed clone. */
export function stumpDrip(p: Particles, x: number, y: number, parts: number, synthetic = false): void {
  for (const [part, ox, oy] of STUMPS) {
    if (has(parts, part)) continue;
    // Machines' stumps spark now and then instead of bleeding.
    if (synthetic) {
      if (Math.random() < 0.12) p.spawn(PK.Spark, x + ox, y + oy, rnd(-60, 60), rnd(-80, 0), 8);
    } else if (Math.random() < 0.6) p.spawn(PK.Blood, x + ox, y + oy, rnd(-25, 25), rnd(-30, 10), 40);
  }
}
const STUMPS: [number, number, number][] = [
  [Part.GunArm, 6, 4],
  [Part.OffArm, 2, 5],
  [Part.LegB, 2, 9],
  [Part.LegF, 6, 9],
];

export const GIB_NOSE = 12;
export const GIB_PLATE = 13;
export const GIB_FIN = 14;
export const GIB_NOZZLE = 15;

/**
 * Drop-rocket exhaust on this client: the plume (flames and billowing smoke)
 * along the engine axis, plus the same jet into the local air field the
 * server writes, so smoke and loose particles behind the nozzle blow away
 * on screen too. (cx, cy) is the rocket's centre, `a` its angle.
 */
export function craftExhaust(p: Particles, cx: number, cy: number, a: number, vx: number, vy: number, thrust: number): void {
  const dx = -Math.sin(a);
  const dy = Math.cos(a);
  const nx = cx + dx * (CRAFT_H / 2 + 1);
  const ny = cy + dy * (CRAFT_H / 2 + 1);
  const n = Math.ceil(thrust * 4);
  for (let k = 0; k < n; k++) {
    const s = 180 + 160 * thrust * Math.random();
    const j = rnd(-40, 40);
    p.spawn(PK.Flame, nx + dy * rnd(-2, 2), ny - dx * rnd(-2, 2), vx * 0.5 + dx * s + dy * j, vy * 0.5 + dy * s - dx * j, rnd(8, 16));
  }
  if (Math.random() < thrust) p.spawn(PK.Smoke, nx + dx * 4 + rnd(-3, 3), ny + dy * 4, dx * 50 + rnd(-60, 60), dy * 50 + rnd(-20, 20), rnd(40, 80));
  p.wind(nx + dx * 16, ny + dy * 16, 26, dx * 320 * thrust, dy * 320 * thrust);
}

const CRAFT_PART_GIB = [GIB_PLATE, GIB_NOSE, GIB_FIN, GIB_FIN, GIB_NOZZLE];

/**
 * A part shot off a drop rocket: mirror the server's hull fragments from the
 * seed (they hurt and settle as scrap), plus the part itself tumbling away.
 */
export function craftPartOff(p: Particles, part: number, x: number, y: number, vx: number, vy: number, seed: number): void {
  craftPartFragments(p, x, y, vx, vy, NO_OWNER, new Rng(seed));
  const i = p.n;
  if (p.spawn(PK.Gib, x, y, vx, vy, rnd(600, 750), (CRAFT_PART_GIB[part] ?? GIB_PLATE) | GIB_INORGANIC, 0x8a9096)) {
    p.spin[i] = Math.floor(Math.random() * 4);
    p.spinRate[i] = (Math.random() - 0.5) * 0.15;
  }
  burst(p, PK.Flame, x, y, 8, 120, 12, 0, vx * 0.5, vy * 0.5);
  burst(p, PK.Smoke, x, y, 10, 50, 60);
}

/**
 * Drop rocket destroyed: mirror the server's hull fragments, embers and
 * shrapnel from the seed (those are what actually maim and become scrap),
 * plus big cosmetic hull pieces, a fireball and a smoke column.
 */
export function craftDebris(p: Particles, x: number, y: number, vx: number, vy: number, seed: number, blastStrength: number): void {
  p.blast(x, y, 70, blastStrength * 1.3);
  craftFragments(p, x, y, vx, vy, NO_OWNER, new Rng(seed));
  const pieces = [GIB_NOSE, GIB_PLATE, GIB_PLATE, GIB_PLATE, GIB_FIN, GIB_FIN, GIB_NOZZLE];
  for (const piece of pieces) {
    const a = Math.random() * Math.PI * 2;
    const s = rnd(80, 260);
    const i = p.n;
    if (p.spawn(PK.Gib, x + rnd(-4, 4), y + rnd(-10, 10), vx * 0.5 + Math.cos(a) * s, vy * 0.5 + Math.sin(a) * s - 80, rnd(600, 750), piece | GIB_INORGANIC, 0x8a9096)) {
      p.spin[i] = Math.floor(Math.random() * 4);
      p.spinRate[i] = (Math.random() - 0.5) * 0.12;
    }
  }
  burst(p, PK.Flame, x, y, 60, 240, 16);
  burst(p, PK.Spark, x, y, 40, 300, 22);
  burst(p, PK.Smoke, x, y, 60, 90, 90);
}

/**
 * Materializer: the new cells shimmer in, a haze of cyan dust and sparks over
 * the piece. `placed` holds x, y, mat triples.
 */
export function materialize(p: Particles, placed: number[]): void {
  const n = placed.length / 3;
  const step = Math.max(1, Math.floor(n / 70));
  for (let i = 0; i < n; i += step) {
    const x = placed[i * 3] + 0.5;
    const y = placed[i * 3 + 1] + 0.5;
    p.spawn(PK.Dust, x, y, rnd(-12, 12), rnd(-30, -5), rnd(16, 30), 0, 0x8ae8ff);
    if (Math.random() < 0.3) p.spawn(PK.Spark, x, y, rnd(-60, 60), rnd(-90, 10), rnd(6, 12));
  }
}

/** Olive drab: the tank's paint, on its scrap. */
const TANK_SCRAP = 0x6f7a3c;
const TANK_PART_GIB = [GIB_PLATE, GIB_NOZZLE, GIB_NOZZLE, GIB_PLATE];

/** A part blown off a tank: the server's fragments from the seed, and the piece itself flying. */
export function tankPartOff(p: Particles, part: number, x: number, y: number, vx: number, vy: number, seed: number, color = -1): void {
  craftPartFragments(p, x, y, vx, vy, NO_OWNER, new Rng(seed));
  for (let k = 0; k < (part === 3 ? 3 : 1); k++) {
    const i = p.n;
    if (p.spawn(PK.Gib, x + rnd(-3, 3), y + rnd(-3, 3), vx + rnd(-40, 40), vy + rnd(-40, 20), rnd(600, 750), (TANK_PART_GIB[part] ?? GIB_PLATE) | GIB_INORGANIC, color >= 0 ? color : part === 3 ? 0x9aa0a6 : TANK_SCRAP)) {
      p.spin[i] = Math.floor(Math.random() * 4);
      p.spinRate[i] = (Math.random() - 0.5) * 0.15;
    }
  }
  burst(p, PK.Flame, x, y, 10, 140, 12, 0, vx * 0.5, vy * 0.5);
  burst(p, PK.Spark, x, y, 16, 220, 14);
  burst(p, PK.Smoke, x, y, 14, 50, 70);
}

/** A tank exploding: the server's two hull-fragment showers from the seed, big scrap, fire and smoke. */
export function tankDebris(p: Particles, x: number, y: number, vx: number, vy: number, seed: number, blastStrength: number, color = TANK_SCRAP): void {
  p.blast(x, y, 90, blastStrength * 1.5);
  const rng = new Rng(seed);
  craftFragments(p, x, y, vx, vy, NO_OWNER, rng);
  craftFragments(p, x, y, vx, vy, NO_OWNER, rng);
  for (let k = 0; k < 10; k++) {
    const a = Math.random() * Math.PI * 2;
    const s = rnd(80, 280);
    const i = p.n;
    if (p.spawn(PK.Gib, x + rnd(-10, 10), y + rnd(-6, 6), vx * 0.5 + Math.cos(a) * s, vy * 0.5 + Math.sin(a) * s - 90, rnd(600, 750), (k % 3 === 0 ? GIB_NOZZLE : GIB_PLATE) | GIB_INORGANIC, color)) {
      p.spin[i] = Math.floor(Math.random() * 4);
      p.spinRate[i] = (Math.random() - 0.5) * 0.12;
    }
  }
  burst(p, PK.Flame, x, y, 90, 260, 18);
  burst(p, PK.Spark, x, y, 60, 320, 22);
  burst(p, PK.Smoke, x, y, 90, 100, 100);
}

/** A tank's lift jets: flame and smoke out of the two nozzles under its hull. */
export function tankJets(p: Particles, x: number, y: number, vx: number, vy: number): void {
  for (const nx of [7, 25]) {
    for (let k = 0; k < 2; k++) p.spawn(PK.Flame, x + nx + rnd(-2, 2), y + 23, vx * 0.5 + rnd(-30, 30), vy * 0.5 + rnd(180, 300), rnd(6, 11));
    if (Math.random() < 0.5) p.spawn(PK.Smoke, x + nx, y + 26, vx * 0.3 + rnd(-20, 20), rnd(40, 90), rnd(30, 50));
  }
}

/** A dropship engine's downwash: a hot glow and a push of dust and haze below the pod. */
/** A runaway engine's jet: flame and smoke out of the nozzle (behind its heading `a`), or just smoke once it's burnt out. */
export function engineExhaust(p: Particles, x: number, y: number, vx: number, vy: number, a: number, burning: boolean): void {
  const bx = x - Math.cos(a) * 5;
  const by = y - Math.sin(a) * 5;
  if (burning) {
    for (let k = 0; k < 2; k++) {
      const s = rnd(140, 260);
      p.spawn(PK.Flame, bx + rnd(-1, 1), by + rnd(-1, 1), vx * 0.3 - Math.cos(a) * s + rnd(-20, 20), vy * 0.3 - Math.sin(a) * s + rnd(-20, 20), rnd(3, 6));
    }
  }
  p.spawn(PK.Smoke, bx, by, vx * 0.2 + rnd(-15, 15), vy * 0.2 + rnd(-15, 15), rnd(burning ? 30 : 18, burning ? 55 : 35));
}

export function shipDownwash(p: Particles, x: number, y: number, vx: number, vy: number, thrust: number): void {
  if (Math.random() < thrust) p.spawn(PK.Flame, x + rnd(-1.5, 1.5), y, vx * 0.5 + rnd(-15, 15), vy * 0.5 + rnd(120, 220) * thrust, rnd(3, 6));
  if (Math.random() < thrust * 0.4) p.spawn(PK.Smoke, x + rnd(-3, 3), y + 4, vx * 0.3 + rnd(-30, 30), rnd(60, 140), rnd(20, 40));
}
