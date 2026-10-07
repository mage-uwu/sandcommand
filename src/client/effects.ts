import { NO_OWNER, PK, type Particles, explosionFragments } from '../shared/particles.ts';
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
export function gibBurst(p: Particles, cx: number, cy: number, vx: number, vy: number, team: number, violence: number, parts = 0x1ff): void {
  const v = Math.min(2.6, 1 + violence * 0.6);
  const on = (part: number) => has(parts, part);
  const fling = (ox: number, oy: number, piece: number, speed: number) => {
    const a = Math.atan2(oy - 2, ox) + (Math.random() - 0.5) * 1.6;
    const s = speed * (0.4 + Math.random() * 0.8) * v;
    spawnGib(p, cx + ox, cy + oy, vx * 0.5 + Math.cos(a) * s, vy * 0.5 + Math.sin(a) * s - 50 - Math.random() * 50, piece, team);
  };
  // Only what is still attached flies apart.
  if (on(Part.Head)) fling(0, -6, on(Part.Helmet) ? GIB_HELMET : GIB_HEAD, 70);
  if (on(Part.Vest)) fling(1, -2, GIB_VEST, 60);
  fling(-1, -1, GIB_TORSO[0], 50);
  fling(1, 0, GIB_TORSO[1], 50);
  if (on(Part.OffArm)) fling(-3, -1, GIB_ARM, 80);
  if (on(Part.GunArm)) fling(3, -1, GIB_ARM, 80);
  if (on(Part.LegB)) fling(-1, 5, GIB_LEG[0], 60);
  if (on(Part.LegF)) fling(1, 5, GIB_LEG[1], 60);
  if (on(Part.Jetpack)) fling(-3, 0, GIB_PACK, 45);
  const meat = Math.round(8 + 6 * v);
  for (let k = 0; k < meat; k++) fling((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10, GIB_MEAT[k % GIB_MEAT.length], 90);
  bloodSplat(p, cx, cy, Math.round(24 + 14 * v), 70 + 30 * v, vx * 0.3, vy * 0.3);
}

function spawnGib(p: Particles, x: number, y: number, vx: number, vy: number, piece: number, team: number): void {
  const i = p.n;
  if (!p.spawn(PK.Gib, x, y, vx, vy, rnd(420, 540), piece, team)) return;
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
};

/**
 * A part torn off a living clone: the piece flies off, flesh parts spray a
 * fountain of blood and a little meat; armour just clatters away with sparks.
 */
export function limbOff(p: Particles, part: number, x: number, y: number, vx: number, vy: number, team: number): void {
  const piece = PART_GIB[part];
  if (piece === undefined) return;
  spawnGib(p, x, y, vx, vy, piece, team);
  if (part === Part.Helmet || part === Part.Vest || part === Part.Jetpack) {
    burst(p, PK.Spark, x, y, 8, 160, 10);
    return;
  }
  bloodSplat(p, x, y, 28, 140, vx * 0.3, vy * 0.3);
  for (let k = 0; k < 3; k++) spawnGib(p, x, y, vx * 0.6 + rnd(-60, 60), vy * 0.6 + rnd(-90, 0), GIB_MEAT[k % 3], team);
}

/** Open stumps drip: call once per tick per maimed clone. */
export function stumpDrip(p: Particles, x: number, y: number, parts: number): void {
  for (const [part, ox, oy] of STUMPS) {
    if (!has(parts, part) && Math.random() < 0.6) p.spawn(PK.Blood, x + ox, y + oy, rnd(-25, 25), rnd(-30, 10), 40);
  }
}
const STUMPS: [number, number, number][] = [
  [Part.GunArm, 6, 4],
  [Part.OffArm, 2, 5],
  [Part.LegB, 2, 9],
  [Part.LegF, 6, 9],
];
