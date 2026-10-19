import { GIB_INORGANIC, NO_OWNER, PK, type Particles, craftFragments, craftPartFragments, explosionFragments } from '../shared/particles.ts';
import { CRAFT_H, CraftPart } from '../shared/craft.ts';
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
/** The spider droid's scrap: a leg strut, its head, a chassis plate (sprites.ts DROID_GIB0). */
export const GIB_DROID_LEG = 17;
export const GIB_DROID_TURRET = 18;
export const GIB_DROID_PLATE = 19;
/** Flora gib pieces (tinted by the plant). */
export const GIB_STALK = 20;
export const GIB_FROND = 21;
export const GIB_CAP = 22;
export const GIB_SAC = 23;
export const GIB_BUD = 24;

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

/** Where a laser beam lands: a spray of white-hot sparks and a puff of smoke, more the stronger the beam. */
export function laserHit(p: Particles, x: number, y: number, dx: number, dy: number, power: number): void {
  const n = 6 + Math.round(power * 30);
  for (let k = 0; k < n; k++) {
    const s = rnd(60, 260 + power * 300);
    p.spawn(PK.Spark, x, y, -dx * s * 0.6 + rnd(-160, 160), -dy * s * 0.6 + rnd(-160, 160), rnd(5, 12 + power * 10));
  }
  burst(p, PK.Smoke, x, y, 2 + Math.round(power * 10), 40, 50);
  if (power > 0.3) burst(p, PK.Flame, x, y, Math.round(power * 14), 120, 8);
}

/** Mole plasma in flight: blue-white sparks shed off it and a little heat haze. */
export function plasmaTrail(p: Particles, x: number, y: number, vx: number, vy: number): void {
  if (Math.random() < 0.6) p.spawn(PK.Spark, x, y, vx * 0.2 + rnd(-40, 40), vy * 0.2 + rnd(-60, 20), rnd(3, 6));
  if (Math.random() < 0.25) p.spawn(PK.Flame, x, y, vx * 0.15 + rnd(-20, 20), vy * 0.15 + rnd(-40, 0), rnd(3, 5));
  if (Math.random() < 0.15) p.spawn(PK.Smoke, x, y, rnd(-8, 8), rnd(-20, -5), rnd(15, 25));
}

/** An autocannon shell's wake: a thin grey smoke trail, no flame. */
export function smokeTrail(p: Particles, x: number, y: number): void {
  p.spawn(PK.Smoke, x, y, rnd(-6, 6), rnd(-6, 6), rnd(18, 32));
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
/**
 * A spider droid's torn turret socket (its turret shot off), at the top of
 * its chassis: a stream of sparks spitting out of it and dark smoke boiling
 * up, now and then a gout of flame: it's bleeding out.
 */
export function droidSocket(p: Particles, x: number, y: number): void {
  const sx = x + 4;
  const sy = y + 6;
  if (Math.random() < 0.55) p.spawn(PK.Spark, sx + rnd(-1.5, 1.5), sy, rnd(-70, 70), rnd(-130, -30), 6 + Math.random() * 8);
  if (Math.random() < 0.35) p.spawn(PK.Smoke, sx + rnd(-1, 1), sy - 1, rnd(-8, 8), rnd(-30, -12), 35 + Math.random() * 30, 0, Math.random() < 0.5 ? 0x2a2a2e : 0x4a4a50);
  if (Math.random() < 0.04) p.spawn(PK.Smoke, sx, sy - 1, rnd(-6, 6), rnd(-40, -20), 12, 0, 0xff8a30);
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

/** Drop-rocket scrap: brushed gunmetal. */
const CRAFT_SCRAP = 0x8a9096;

/**
 * A part shot off a drop rocket gibs: mirror the server's hull fragments
 * from the seed (they hurt and settle as scrap), and the part itself comes
 * apart. What's left of it tumbles away, torn plate and nozzle shards burst
 * out of it, with sparks, a lick of flame and smoke.
 */
export function craftPartOff(p: Particles, part: number, x: number, y: number, vx: number, vy: number, seed: number, color = CRAFT_SCRAP): void {
  craftPartFragments(p, x, y, vx, vy, NO_OWNER, new Rng(seed));
  // The part itself, in the rocket's colours, tumbling off (the nose cone thrown up and clear, turning over slowly, so it reads as the cone it was).
  if (part === CraftPart.Nose) noseCone(p, x, y, vx, vy, color);
  else scrapGib(p, x, y, vx + rnd(-30, 30), vy - rnd(20, 60), CRAFT_PART_GIB[part] ?? GIB_PLATE, color, 0.15);
  // ...and the shards it sheds.
  const n = 6 + Math.floor(Math.random() * 3);
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    const sp = rnd(80, 230);
    scrapGib(p, x + rnd(-2, 2), y + rnd(-2, 2), vx * 0.6 + Math.cos(a) * sp, vy * 0.6 + Math.sin(a) * sp - 60, k % 3 === 0 ? GIB_NOZZLE : GIB_PLATE, CRAFT_SCRAP, 0.2);
  }
  burst(p, PK.Spark, x, y, 18, 220, 14, 0, vx * 0.4, vy * 0.4);
  burst(p, PK.Flame, x, y, 10, 130, 12, 0, vx * 0.5, vy * 0.5);
  burst(p, PK.Smoke, x, y, 12, 55, 60);
}

/** A drop rocket's nose cone, off whole: up and away, turning over slowly, lasting a while on the ground. */
function noseCone(p: Particles, x: number, y: number, vx: number, vy: number, color: number): void {
  const i = p.n;
  if (!p.spawn(PK.Gib, x, y, vx * 0.7 + rnd(-50, 50), Math.min(vy, 0) * 0.5 - rnd(110, 170), rnd(900, 1100), GIB_NOSE | GIB_INORGANIC, color)) return;
  p.spin[i] = 0;
  p.spinRate[i] = (Math.random() < 0.5 ? -1 : 1) * rnd(0.05, 0.09);
}

/** A tumbling piece of scrap (an inorganic gib in `color`), spinning up to `spin`. */
function scrapGib(p: Particles, x: number, y: number, vx: number, vy: number, piece: number, color: number, spin: number): void {
  const i = p.n;
  if (!p.spawn(PK.Gib, x, y, vx, vy, rnd(600, 750), piece | GIB_INORGANIC, color)) return;
  p.spin[i] = Math.floor(Math.random() * 4);
  p.spinRate[i] = (Math.random() - 0.5) * spin;
}

/**
 * Drop rocket destroyed: mirror the server's hull fragments, embers and
 * shrapnel from the seed (those are what actually maim and become scrap),
 * plus big cosmetic hull pieces, a fireball and a smoke column.
 */
export function craftDebris(p: Particles, x: number, y: number, vx: number, vy: number, seed: number, blastStrength: number, color = CRAFT_SCRAP, nose = true): void {
  p.blast(x, y, 70, blastStrength * 1.3);
  craftFragments(p, x, y, vx, vy, NO_OWNER, new Rng(seed));
  // The nose cone (if it's still on) goes up whole, in the rocket's colours.
  if (nose) noseCone(p, x, y - 8, vx, vy, color);
  const pieces = [GIB_PLATE, GIB_PLATE, GIB_PLATE, GIB_FIN, GIB_FIN, GIB_NOZZLE];
  for (const piece of pieces) {
    const a = Math.random() * Math.PI * 2;
    const s = rnd(80, 260);
    const i = p.n;
    if (p.spawn(PK.Gib, x + rnd(-4, 4), y + rnd(-10, 10), vx * 0.5 + Math.cos(a) * s, vy * 0.5 + Math.sin(a) * s - 80, rnd(600, 750), piece | GIB_INORGANIC, color)) {
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

/** A spider droid gliding: little blue thruster flames from under its chassis. */
export function droidJets(p: Particles, x: number, y: number, vx: number, vy: number): void {
  for (const nx of [1, 7]) {
    if (Math.random() < 0.7) p.spawn(PK.Flame, x + nx + rnd(-1, 1), y + 10, vx * 0.5 + rnd(-15, 15), vy * 0.4 + rnd(160, 240), rnd(3, 6));
    if (Math.random() < 0.25) p.spawn(PK.Spark, x + nx, y + 11, vx * 0.4 + rnd(-30, 30), rnd(150, 240), rnd(3, 5));
  }
  if (Math.random() < 0.3) p.spawn(PK.Smoke, x + 4, y + 13, vx * 0.3 + rnd(-15, 15), rnd(30, 70), rnd(20, 35));
}

/** A tarantula gliding: blue-white rocket flame out of three vents under its belly (`w` x `h` its box), and haze. */
export function spiderJets(p: Particles, x: number, y: number, w: number, h: number, vx: number, vy: number): void {
  const vy0 = y + h * 0.62;
  for (const u of [0.3, 0.5, 0.7]) {
    const nx = x + w * u;
    p.spawn(PK.Flame, nx + rnd(-2, 2), vy0, vx * 0.5 + rnd(-25, 25), vy * 0.4 + rnd(220, 340), rnd(5, 9));
    if (Math.random() < 0.4) p.spawn(PK.Spark, nx, vy0 + 2, vx * 0.4 + rnd(-40, 40), rnd(200, 320), rnd(4, 7));
    if (Math.random() < 0.35) p.spawn(PK.Smoke, nx, vy0 + 6, vx * 0.3 + rnd(-20, 20), rnd(40, 90), rnd(30, 50));
  }
}

/**
 * The tarantula's laser vaporizing what it touched: a flash of white-hot
 * sparks, a gout of flame and a rolling cloud of vapour.
 */
export function vaporPuff(p: Particles, x: number, y: number, dx: number, dy: number): void {
  for (let k = 0; k < 18; k++) {
    const s = rnd(80, 320);
    p.spawn(PK.Spark, x, y, -dx * s * 0.5 + rnd(-200, 200), -dy * s * 0.5 + rnd(-200, 200), rnd(6, 14));
  }
  burst(p, PK.Flame, x, y, 10, 110, 7);
  burst(p, PK.Smoke, x, y, 14, 70, 60);
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

/** A droid's metal scrap flying: spinning, bouncing, no blood. */
function droidScrap(p: Particles, piece: number, x: number, y: number, vx: number, vy: number): void {
  const i = p.n;
  if (!p.spawn(PK.Gib, x, y, vx, vy, rnd(600, 750), piece | GIB_INORGANIC, 0x808080)) return;
  p.spin[i] = Math.floor(Math.random() * 4);
  p.spinRate[i] = (Math.random() - 0.5) * 0.2;
}

/**
 * A spider droid's part shot off (droid part ids, body.ts DroidPart): a leg
 * goes spinning as a bent strut, the turret as its dome, the plating as a
 * plate; sparks and a puff of smoke, no blood.
 */
export function droidPartOff(p: Particles, part: number, x: number, y: number, vx: number, vy: number): void {
  const piece = part === 0 ? GIB_DROID_TURRET : part === 8 || part === 1 ? GIB_DROID_PLATE : GIB_DROID_LEG;
  droidScrap(p, piece, x, y, vx, vy);
  burst(p, PK.Spark, x, y, 12, 200, 12);
  burst(p, PK.Smoke, x, y, 5, 40, 50);
}

/**
 * A spider droid destroyed: whatever was still on it flies apart as scrap
 * (legs, turret, plates) in a burst of sparks, a little fire and smoke.
 */
export function droidWreck(p: Particles, cx: number, cy: number, vx: number, vy: number, parts: number, violence: number): void {
  const v = Math.min(2.4, 1 + violence * 0.5);
  const fling = (piece: number, speed: number) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
    const s = speed * (0.5 + Math.random() * 0.7) * v;
    droidScrap(p, piece, cx + rnd(-4, 4), cy + rnd(-3, 3), vx * 0.5 + Math.cos(a) * s, vy * 0.5 + Math.sin(a) * s - 40);
  };
  for (let leg = 2; leg <= 7; leg++) if (has(parts, leg)) fling(GIB_DROID_LEG, 120);
  if (has(parts, 0)) fling(GIB_DROID_TURRET, 90);
  fling(GIB_DROID_PLATE, 80);
  fling(GIB_DROID_PLATE, 80);
  if (has(parts, 8)) fling(GIB_DROID_PLATE, 100);
  p.blast(cx, cy, 30, 160);
  burst(p, PK.Spark, cx, cy, 26, 260, 14);
  burst(p, PK.Flame, cx, cy, 8, 90, 10, 0, vx * 0.3, vy * 0.3);
  burst(p, PK.Smoke, cx, cy, 14, 50, 70);
}

/** A droid hit: sparks off its armour (more for a harder hit), and a wisp of smoke. */
export function droidHit(p: Particles, x: number, y: number, amount: number): void {
  burst(p, PK.Spark, x, y, Math.min(18, 4 + Math.round(amount / 2)), 160 + amount * 2, 10);
  burst(p, PK.Smoke, x, y, 2, 30, 40);
}

/**
 * A plant torn up: its pieces flung (stalk, fronds, caps, buds by kind, in
 * its own colours), from its box `x`, `y0`..`y1`. `colors`: stem, body, glow.
 */
export function floraGibs(p: Particles, kind: number, x: number, y0: number, y1: number, colors: readonly number[], hanging: boolean): void {
  const n = 5 + Math.floor(Math.random() * 5);
  // By kind (frosting.ts FloraKind): centipede, coral, tubes, hanging, puffs, blister, sargasso weed.
  const pieces = [
    [GIB_STALK, GIB_STALK, GIB_FROND, GIB_BUD],
    [GIB_FROND, GIB_FROND, GIB_STALK, GIB_BUD],
    [GIB_STALK, GIB_STALK, GIB_BUD],
    [GIB_STALK, GIB_FROND, GIB_BUD],
    [GIB_CAP, GIB_CAP, GIB_STALK],
    [GIB_SAC, GIB_SAC, GIB_STALK, GIB_BUD],
    [GIB_FROND, GIB_STALK, GIB_FROND, GIB_SAC],
  ][kind] ?? [GIB_STALK];
  for (let k = 0; k < n; k++) {
    const piece = pieces[k % pieces.length];
    const color = piece === GIB_BUD || piece === GIB_SAC ? colors[2] : piece === GIB_STALK ? colors[0] : colors[1];
    const y = y0 + Math.random() * (y1 - y0);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const s = 40 + Math.random() * 90;
    const vy = hanging ? Math.random() * 40 : Math.sin(a) * s;
    p.spawn(PK.Gib, x + (Math.random() - 0.5) * 6, y, Math.cos(a) * s, vy, 300 + Math.random() * 200, piece | GIB_INORGANIC, color);
  }
}

/** A blister coral bursting: shreds of its sacs and a cloud of caustic sap, all round it. */
export function blisterBurst(p: Particles, x: number, y: number, glow: number): void {
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + Math.random() * 0.4;
    const s = 60 + Math.random() * 120;
    p.spawn(PK.Smoke, x, y, Math.cos(a) * s, Math.sin(a) * s - 30, 30 + Math.random() * 30, 0, Math.random() < 0.6 ? 0xb8e840 : 0xe8f070);
  }
  for (let k = 0; k < 8; k++) {
    const a = Math.random() * Math.PI * 2;
    const s = 80 + Math.random() * 120;
    p.spawn(PK.Gib, x, y, Math.cos(a) * s, Math.sin(a) * s - 60, 300 + Math.random() * 200, GIB_SAC | GIB_INORGANIC, glow);
  }
}

/** A glob of venom in flight: now and then a drop of it falls away. */
export function venomTrail(p: Particles, x: number, y: number, vx: number, vy: number): void {
  if (Math.random() < 0.45) p.spawn(PK.Blood, x, y, vx * 0.1 + rnd(-10, 10), vy * 0.1 + rnd(-10, 10), 40);
  // (Glinting in it: specks of crystal.)
  if (Math.random() < 0.15) p.spawn(PK.Blood, x, y, vx * 0.1 + rnd(-10, 10), vy * 0.1 + rnd(-10, 10), 40, 0, VENOM_CRYSTAL[Math.floor(Math.random() * VENOM_CRYSTAL.length)]);
}

/** The crystal in a millipede's venom: the GEMM colours (pink, turquoise, emerald) and their glints. */
const VENOM_CRYSTAL = [0xff2a8a, 0x18c8c0, 0x22b85a, 0xffc0e0, 0xb0fff4];

/** Venom spat (out of the mouth) or splashing where it lands: a burst of blood-red drops, and shards of crystal flung out of it. */
export function venomSplash(p: Particles, x: number, y: number, vx = 0, vy = 0, n = 10): void {
  bloodSplat(p, x, y, n, 70, vx, vy);
  const shards = Math.max(2, Math.round(n / 3));
  for (let k = 0; k < shards; k++) {
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 90;
    const i = p.n;
    if (p.spawn(PK.Gib, x, y, vx + Math.cos(a) * s, vy + Math.sin(a) * s - 50, rnd(300, 500), (k % 2 ? GIB_SAC : GIB_BUD) | GIB_INORGANIC, VENOM_CRYSTAL[k % 3])) p.spin[i] = Math.floor(Math.random() * 4);
  }
}

/** Venom in a clone's blood: it weeps from them, a drop now and then (more, the more there is). */
export function venomDrip(p: Particles, x: number, y: number, amount: number): void {
  if (Math.random() < Math.min(0.5, 0.08 + amount / 250)) p.spawn(PK.Blood, x + rnd(-3, 3), y + rnd(-6, 4), rnd(-8, 8), rnd(-10, 10), 40);
}

/** Coral bursting out of a limb as it comes off: shards and polyps of pink coral, a puff of spores, blood. */
export function coralBurst(p: Particles, x: number, y: number): void {
  const pinks = [0xff4f8b, 0xff7aa8, 0xffb0cc, 0xff9a60];
  for (let k = 0; k < 14; k++) {
    const a = Math.random() * Math.PI * 2;
    const s = 50 + Math.random() * 140;
    p.spawn(PK.Gib, x, y, Math.cos(a) * s, Math.sin(a) * s - 70, rnd(400, 650), (k % 2 ? GIB_STALK : GIB_SAC) | GIB_INORGANIC, pinks[k % pinks.length]);
  }
  for (let k = 0; k < 10; k++) {
    const a = Math.random() * Math.PI * 2;
    const s = 20 + Math.random() * 60;
    p.spawn(PK.Smoke, x, y, Math.cos(a) * s, Math.sin(a) * s - 20, 30 + Math.random() * 30, 0, Math.random() < 0.6 ? 0xffa0c8 : 0xffd0e0);
  }
  bloodSplat(p, x, y, 8, 120);
}

/** Coral growing out of a clone: now and then a pink spore drifts off it (more, the more grown it is). */
export function coralSpores(p: Particles, x: number, y: number, grown: number): void {
  if (Math.random() < 0.04 + grown * 0.18) p.spawn(PK.Smoke, x + rnd(-4, 4), y + rnd(-6, 6), rnd(-6, 6), rnd(-14, -2), 25 + Math.random() * 25, 0, 0xffa0c8);
}

/** A gem asp's goo, by its gem (pink, turquoise, emerald, as GEMMs): the goo, and its glossy highlight. */
export const ASP_GOO = [0xd8186e, 0x10a8a0, 0x1a9a48] as const;
const ASP_GOO_HI = [0xff8ac4, 0x80fff0, 0x90ffb0] as const;

/** An asp hurt: a spatter of its gooey, gem-coloured blood. */
export function gooSplat(p: Particles, x: number, y: number, gem: number, count: number, speed: number): void {
  const g = gem % 3;
  for (let k = 0; k < count; k++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * Math.random();
    p.spawn(PK.Blood, x, y, Math.cos(a) * s, Math.sin(a) * s - speed * 0.3, 60, 0, k % 4 === 0 ? ASP_GOO_HI[g] : ASP_GOO[g]);
  }
}

/** A cave spider's ichor: a pale, sickly green. */
const ICHOR = 0x6a8a32;
const ICHOR_HI = 0xc0d878;
/** A cave spider hurt: a spatter of its ichor. */
export function ichorSplat(p: Particles, x: number, y: number, count: number, speed: number): void {
  for (let k = 0; k < count; k++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * Math.random();
    p.spawn(PK.Blood, x, y, Math.cos(a) * s, Math.sin(a) * s - speed * 0.3, 60, 0, k % 4 === 0 ? ICHOR_HI : ICHOR);
  }
}
/** A cave spider killed: gobbets and strings of ichor off its body, and a great spatter. */
export function spiderGibs(p: Particles, pts: readonly number[]): void {
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const y = pts[i + 1];
    for (let n = 0; n < 2; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 90;
      p.spawn(PK.Gib, x, y, Math.cos(a) * s, Math.sin(a) * s - 60, rnd(400, 650), GIB_SAC | GIB_INORGANIC, n ? ICHOR : ICHOR_HI);
    }
    if (Math.random() < 0.5) p.spawn(PK.Gib, x, y, rnd(-70, 70), rnd(-110, -20), rnd(350, 550), GIB_STALK | GIB_INORGANIC, ICHOR);
    ichorSplat(p, x, y, 14, 90);
  }
}

/** A gem asp killed: gobbets of gem-coloured goo flung off its whole body, strings of it, and a great spatter. */
export function aspGibs(p: Particles, pts: readonly number[], gem: number): void {
  const g = gem % 3;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const y = pts[i + 1];
    const a = Math.random() * Math.PI * 2;
    const s = 30 + Math.random() * 90;
    p.spawn(PK.Gib, x, y, Math.cos(a) * s, Math.sin(a) * s - 60, rnd(400, 650), GIB_SAC | GIB_INORGANIC, (i >> 1) % 3 ? ASP_GOO[g] : ASP_GOO_HI[g]);
    if (Math.random() < 0.4) p.spawn(PK.Gib, x, y, rnd(-70, 70), rnd(-110, -20), rnd(350, 550), GIB_STALK | GIB_INORGANIC, ASP_GOO[g]);
    gooSplat(p, x, y, g, 12, 90);
  }
}

/** A millipede killed: its pink coral plates, legs and gems flung off along its whole body, and its blood. */
export function beastGibs(p: Particles, pts: readonly number[]): void {
  const gems = [0xff2a8a, 0x18c8c0, 0x22b85a];
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const y = pts[i + 1];
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 110;
    p.spawn(PK.Gib, x, y, Math.cos(a) * s, Math.sin(a) * s - 70, rnd(500, 700), GIB_PLATE | GIB_INORGANIC, (i >> 1) % 2 ? 0xff4f8b : 0xff6a9c);
    if (Math.random() < 0.5) p.spawn(PK.Gib, x, y, rnd(-80, 80), rnd(-120, -20), rnd(400, 600), GIB_STALK | GIB_INORGANIC, 0xffa0c0);
    if (Math.random() < 0.6) p.spawn(PK.Gib, x, y, rnd(-110, 110), rnd(-150, -40), rnd(500, 700), GIB_SAC | GIB_INORGANIC, gems[Math.floor(Math.random() * gems.length)]);
    bloodSplat(p, x, y, 4, 90);
  }
}

/**
 * A Stoneburner strike landing (on this client): the fireball (a great
 * burst of flame), sparks and burning debris thrown out over everything, a
 * wall of dust and smoke rolling out along the ground, and the blast wave
 * through every loose grain about.
 */
export function stoneburnBlast(p: Particles, x: number, y: number, impulse: number): void {
  p.blast(x, y, 520, impulse * 7);
  // The fireball's first instant: a ball of flame torn outward, and a storm of sparks.
  burst(p, PK.Flame, x, y - 14, 420, 620, 30);
  burst(p, PK.Flame, x, y - 40, 160, 260, 70, 0, 0, -260);
  burst(p, PK.Spark, x, y - 10, 340, 1100, 45);
  // Burning fragments thrown out like a shell's, flat and fast, streaking (they're only for show here: the server's hurt).
  for (let k = 0; k < 260; k++) {
    const a = -Math.PI * (0.02 + 0.96 * Math.random());
    const s = rnd(500, 1400);
    p.spawn(PK.Shrapnel, x + rnd(-10, 10), y + rnd(-14, 2), Math.cos(a) * s, Math.sin(a) * s, rnd(16, 34), 0, 0, NO_OWNER);
  }
  // Rock thrown high: tumbling chunks of the ground, scorched.
  for (let k = 0; k < 70; k++) {
    const a = -Math.PI * (0.18 + 0.64 * Math.random());
    const s = rnd(300, 900);
    const i = p.n;
    if (p.spawn(PK.Gib, x + rnd(-24, 24), y + rnd(-10, 4), Math.cos(a) * s, Math.sin(a) * s, rnd(500, 800), (k % 3 ? GIB_SAC : GIB_BUD) | GIB_INORGANIC, k % 2 ? 0x3a2a22 : 0x5a4436)) {
      p.spin[i] = Math.floor(Math.random() * 4);
      p.spinRate[i] = (Math.random() - 0.5) * 0.3;
    }
  }
  // Burning debris arcing out.
  for (let k = 0; k < 160; k++) {
    const a = -Math.PI * (0.05 + 0.9 * Math.random());
    const s = rnd(260, 900);
    p.spawn(PK.Flame, x + rnd(-20, 20), y + rnd(-10, 4), Math.cos(a) * s, Math.sin(a) * s, rnd(40, 100));
  }
  // The base surge: a wall of dust and smoke racing out along the ground both ways.
  for (let k = 0; k < 320; k++) {
    const dir = k % 2 ? 1 : -1;
    p.spawn(PK.Smoke, x + rnd(-30, 30), y + rnd(-18, 4), dir * rnd(200, 900), rnd(-90, 5), rnd(140, 260));
    if (k % 2 === 0) p.spawn(PK.Dust, x + rnd(-20, 20), y + rnd(-8, 4), dir * rnd(300, 1100), rnd(-140, -10), rnd(70, 140), 0, 0xb09070);
  }
  burst(p, PK.Smoke, x, y - 50, 180, 260, 220, 0, 0, -160);
}

/**
 * A blob of a Stoneburner's molten sludge, one tick of it (`heat` 1 fresh,
 * falling to 0 as it sets): flame licking off it all the time, and every
 * so often a grenade's worth of blast going off in it (flame, sparks,
 * smoke, the air shoved), more often while it's hot. Just the fire: no
 * fragments (they'd settle into this client's ground alone).
 */
export function moltenCore(p: Particles, x: number, y: number, heat: number): void {
  if (Math.random() < 0.15 + 0.35 * heat) p.spawn(PK.Flame, x + rnd(-4, 4), y - 2, rnd(-20, 20), -rnd(30, 60 + 100 * heat), rnd(8, 12 + 10 * heat));
  if (Math.random() < 0.05) p.spawn(PK.Smoke, x + rnd(-4, 4), y - 5, rnd(-12, 12), -rnd(25, 60), rnd(90, 160));
  if (Math.random() < 0.012 + 0.03 * heat) {
    const r = 10 + 10 * heat;
    p.blast(x, y, r * 1.6, 180);
    burst(p, PK.Flame, x, y - 2, 22, r * 6, 12);
    burst(p, PK.Spark, x, y - 2, 16, r * 12, 18);
    burst(p, PK.Smoke, x, y - 4, 18, r * 3, 80);
  }
}

/** A dragon's spit in flight: flame streaming off it, drops of burning blood falling away, a little smoke. */
export function fireSpitTrail(p: Particles, x: number, y: number, vx: number, vy: number): void {
  p.spawn(PK.Flame, x + rnd(-1.5, 1.5), y + rnd(-1.5, 1.5), vx * 0.15 + rnd(-20, 20), vy * 0.15 + rnd(-30, 10), rnd(6, 12));
  if (Math.random() < 0.4) p.spawn(PK.Blood, x, y, vx * 0.1 + rnd(-15, 15), vy * 0.1 + rnd(-10, 10), 40);
  if (Math.random() < 0.25) p.spawn(PK.Smoke, x, y, rnd(-10, 10), rnd(-20, 0), rnd(30, 60));
}

/** A dragon's spit bursting: a splash of blood and a gout of flame thrown up off it. */
export function fireSpitBurst(p: Particles, x: number, y: number): void {
  bloodSplat(p, x, y, 18, 120);
  for (let k = 0; k < 30; k++) {
    const a = -Math.PI * Math.random();
    const s = rnd(60, 260);
    p.spawn(PK.Flame, x + rnd(-3, 3), y + rnd(-3, 2), Math.cos(a) * s, Math.sin(a) * s, rnd(14, 34));
  }
  burst(p, PK.Smoke, x, y - 4, 14, 60, 90);
}
