import { WORLD_H, WORLD_W } from './constants.ts';
import type { Terrain } from './terrain.ts';
import { MAT_ADAMANT, MAT_FIXED, MAT_TOUGH } from './materials.ts';

/**
 * Wildlife: the planet's own creatures. Nobody drives them, ever; the server
 * thinks for them (server/world.ts), and they fight everyone alike.
 *
 * The first is the **millipede**: a long, many-legged, plated crawler that
 * lives in the caves. It goes along any surface (floors, walls, ceilings
 * alike), its body bending to the ground under it; dug out from under, it
 * falls until it lands on something and takes hold again. When it has
 * someone in sight it rears its front up off the ground, spreads a cobra's
 * hood and spits a glob of blood-red venom; and it bites whoever it reaches.
 * Venom burns on in the blood: a dose does its harm a little at a time, for
 * seconds after the hit (World: Player.venom), and doses stack; only the
 * repair kit's health wave washes it out.
 *
 * Its crawl is a contour-follower on the terrain grid: the head is an open
 * cell with solid ground on one side (`side` says which: ground to the
 * right of the way it's heading, or to the left), and each step goes on
 * along the surface: into a wall ahead it turns up it; over an edge it
 * turns down round it. The body follows the head's trail.
 */

export const BeastKind = { Millipede: 0, Asp: 1, Seeder: 2, Nest: 3, Basilisk: 4 } as const;

/** Body segments, cells of trail between them (so the body's length), hit radius. */
export const MILLI_SEGS = 15;
export const MILLI_GAP = 4;
export const MILLI_R = 3.6;
/**
 * Armoured like a vehicle (a spider mech's kind of toughness): a round with
 * the energy to get through its plates (World: TANK_INTEGRITY) does its full
 * harm, anything weaker a fifth of it; blasts hurt it by distance.
 */
export const MILLI_HP = 2400;
/**
 * Its head is its weak spot: half as tough as the plated segments behind
 * it, so whatever hits it there (a round, a beam, the nearest point of a
 * blast) does this many times the harm.
 */
export const MILLI_HEAD_WEAK = 2;
/** How much of a hit on body point `i` of a creature of `kind` counts (a millipede's head takes double). */
export const hitScale = (kind: number, i: number) => (kind === BeastKind.Millipede && i === 0 ? MILLI_HEAD_WEAK : 1);
/** Crawl speeds (cells/s): wandering, hunting, and the lunge when it spots prey (very fast). */
export const MILLI_CRAWL = 26;
export const MILLI_HUNT = 70;
export const MILLI_LUNGE = 160;
/** How long a lunge lasts (ticks). */
export const MILLI_LUNGE_TICKS = 75;
/**
 * Freezing (its camouflage: still, it's hard to see): how long it holds
 * still, the least and the most (ticks: up to two minutes), and how long it
 * wanders between. It rests wherever it is, walls and ceilings too; often it
 * picks its way up onto a ceiling first (MILLI_ROOST of the time), to drop
 * on whoever passes under.
 */
export const MILLI_FREEZE_MIN = 30 * 20;
export const MILLI_FREEZE_MAX = 30 * 120;
export const MILLI_WANDER = 30 * 25;
/**
 * Scavenging (its third state, neither lying in wait nor hunting): it roams,
 * after ground it hasn't been over (it remembers the last MILLI_SEEN patches
 * of MILLI_PATCH cells it crossed), and it bites its way through a thin wall
 * with its mouth where there's an opening already beyond it (within
 * MILLI_MOUTH cells along its way), so it flows on between passages that
 * barely connect. Never into blind rock, nor through what won't yield.
 */
export const MILLI_SEEN = 64;
export const MILLI_PATCH = 16;
export const MILLI_MOUTH = 8;
/** Its bite: radius of the hole (body-sized), ticks between bites. */
export const MILLI_MOUTH_R = 3;
export const MILLI_MOUTH_CD = 4;
/** How tall a wall (and how roomy the opening past it) must be for it to bite through. */
export const MILLI_BITE_H = 6;
export const MILLI_ROOST = 0.6;
/**
 * Caught going round and round a little island of rock (a lump in the air,
 * a pillar's knob): it notices. Every LOOP_STEPS crawl steps it looks at
 * the box its head kept to; if that's no bigger than LOOP_BOX either way,
 * it's lapping a trap, and at the next place with open air under it, it
 * lets go and drops, to find real ground again. (It gives up waiting for
 * such a place after LOOP_STEPS more.)
 */
export const LOOP_STEPS = 220;
export const LOOP_BOX = 40;
/** Dropping off a ceiling onto prey: how far to the side of it (cells) it'll let go, and how fast it steers as it falls (cells a tick). */
export const MILLI_DROP_REACH = 60;
export const MILLI_DROP_STEER = 1.5;
/** How far it senses prey (with a line on it; lying in wait it sees further), and how far it spits. */
export const MILLI_SENSE = 280;
export const MILLI_SENSE_FROZEN = 420;
export const MILLI_SPIT_RANGE = 210;
/** Rearing to spit: ticks up, the tick it spits, the spit's speed; ticks between spits. */
export const MILLI_REAR = 20;
export const MILLI_SPIT_AT = 13;
export const MILLI_SPIT_SPEED = 330;
export const MILLI_SPIT_CD = 80;
/** How far its reared head lifts off the ground (cells), and how many segments lift. */
export const MILLI_LIFT = 13;
export const MILLI_NECK = 5;
/**
 * Its coil: a clone its head reaches (within MILLI_COIL_R) it wraps round
 * like a rope, holding them fast, and after MILLI_COIL_TICKS bites: harm
 * enough to kill most outright (a droid's frame takes less). Hurt hard
 * enough while it holds them (MILLI_COIL_BREAK), it lets go.
 */
export const MILLI_COIL_R = 9;
export const MILLI_COIL_TICKS = 18;
export const MILLI_COIL_KILL = 150;
export const MILLI_COIL_DROID = 70;
export const MILLI_COIL_BREAK = MILLI_HP * 0.06;
export const MILLI_COIL_SEGS = 8;
/** After a coil (bitten or broken off): ticks before it can coil again. */
export const MILLI_COIL_CD = 90;

/**
 * The **gem asp**, the millipede's small cousin: about a clone's size, slim
 * and snakelike, a fringe of tiny legs. It crawls the same surfaces. With
 * nobody about it curls up on a floor into a gem: a cluster of faceted
 * crystals just like a GEMM formation's, and holds it for minutes. Whoever
 * comes near it (in sight, within ASP_TRIGGER) it uncoils on, rears up
 * hissing, and strikes: very fast, a bite and a dose of venom. Not armoured:
 * a few rounds kill it.
 */
export const ASP_SEGS = 8;
export const ASP_GAP = 2;
export const ASP_R = 2.2;
export const ASP_HP = 110;
export const ASP_CRAWL = 30;
export const ASP_HUNT = 60;
/** Its strike: speed (cells/s) and how long it lasts (ticks). */
export const ASP_STRIKE = 230;
export const ASP_STRIKE_TICKS = 14;
/** How far it sees prey, and how near they have to come before a disguised one gives itself away. */
export const ASP_SENSE = 220;
export const ASP_TRIGGER = 80;
/** Rearing up hissing before it strikes (ticks). */
export const ASP_HISS = 14;
/** Its bite: reach (cells), harm, venom, ticks between bites. */
export const ASP_BITE_R = 7;
export const ASP_BITE = 30;
export const ASP_BITE_VENOM = 24;
export const ASP_BITE_CD = 24;
/** Its disguise: how long it holds it, the least and the most (ticks: one to four minutes), and how long it wanders between. */
export const ASP_DISGUISE_MIN = 30 * 60;
export const ASP_DISGUISE_MAX = 30 * 240;
export const ASP_WANDER = 30 * 5;

/**
 * **Seeders**: small fliers, about a clone's head in size: a wasp's striped
 * sting-tail, a raven's black head and beak, a butterfly's painted wings.
 * They come out of a **coral nest** (a hive of coral grown on a cave roof or
 * wall), three at a time, and only when the nest senses danger: someone in
 * sight of it, or something hurting it. A nest goes on sending out broods
 * for as long as the danger's there; it has to be destroyed. With nobody
 * left to chase, seeders fly home and back into it (out of the world: no
 * cost while nobody's about); a brood whose nest is gone dies off.
 *
 * They only sting. A sting does little harm (SEEDER_STING) but *seeds* the
 * limb it lands on with coral (World: Player.coral). The coral grows out of
 * the limb, harming it and the clone as it goes, and full grown it may burst
 * the limb right off (CORAL_BURST of the time); otherwise it crusts over and
 * stops. A health wave clears it. Droids' metal limbs don't take it.
 */
export const SEEDER_R = 2.8;
export const SEEDER_HP = 14;
/** Flight: top speed and how hard it turns (cells/s, cells/s²), and how far it sees prey. */
export const SEEDER_SPEED = 125;
export const SEEDER_ACCEL = 700;
export const SEEDER_SENSE = 260;
/** Its sting: reach (cells past a clone's box), harm, ticks between stings, ticks it darts off after one. */
export const SEEDER_STING_R = 3;
export const SEEDER_STING = 2;
export const SEEDER_STING_CD = 40;
export const SEEDER_DART = 14;
/** Ticks with nobody to chase before it flies home (and, nest gone, before it dies off). */
export const SEEDER_IDLE = 30 * 6;
export const SEEDER_EXPIRE = 30 * 40;
export const NEST_R = 7;
export const NEST_HP = 420;
/** The nest: how far it senses danger (with a line on it), how often it looks, how many to a brood, ticks between broods. */
export const NEST_SENSE = 230;
export const NEST_LOOK = 15;
export const NEST_BROOD = 3;
export const NEST_BROOD_CD = 30 * 10;
/** Coral seeded in a limb: how much a sting sows (of full grown), how fast it grows (a tick), the harm it does a tick to the clone and the limb, how often full grown it bursts the limb off. */
export const CORAL_SEED = 0.2;
export const CORAL_GROW = 1 / (30 * 14);
export const CORAL_HP = 0.06;
export const CORAL_WOUND = 0.05;
export const CORAL_BURST = 0.45;
/** The limbs coral takes hold in (body.ts Part: the gun arm, the off arm, the legs), in R_CORAL order. */
export const CORAL_LIMBS = [2, 3, 4, 5] as const;

/**
 * The **basilisk**: the millipede's monstrous kin, three times its scale,
 * plated in what the caves are made of (great GEMM veins, dripstone
 * spikes, coral grown over it), and very hard to kill. It doesn't crawl:
 * it bores through the rock wherever it means to go (never what won't
 * yield: bedrock, cement, iron).
 *
 * It holds very still. It hibernates for minutes at a time (up to four),
 * stirs, shifts a little through the rock, and sleeps again: a seam in the
 * cave wall nobody looks at twice. Disturb it (come close, shoot it, blast
 * near it) and it wakes in a killing frenzy. Its first instinct is to bore
 * straight for the surface; up there it hunts anything it can see,
 * leaping through the ground like a sandworm, and whatever its jaws close
 * on dies. With nothing left in sight for a while, it dives back down
 * into the deep and sleeps.
 */
export const BASILISK_SEGS = 15;
export const BASILISK_GAP = 12;
export const BASILISK_R = MILLI_R * 3;
export const BASILISK_HP = 15000;
/** Hibernation: how long it holds still, the least and the most (ticks: up to four minutes); how far it shifts when it stirs between (cells). */
export const BASILISK_SLEEP_MIN = 30 * 90;
export const BASILISK_SLEEP_MAX = 30 * 240;
export const BASILISK_STIR = 90;
/** What wakes it: a clone this near its head (with a line on it), or this near any of its body. */
export const BASILISK_WAKE = 110;
export const BASILISK_TOUCH = 40;
/** Boring speeds (cells/s): stirring in its sleep, surfacing, hunting; how fast it turns (radians/s). */
export const BASILISK_CREEP = 22;
export const BASILISK_RISE = 70;
export const BASILISK_HUNT = 115;
export const BASILISK_TURN = 3.2;
/** The tunnel it bores (radius), how often (cells travelled), and the rubble it throws (grains a bite). */
export const BASILISK_BORE = 9;
export const BASILISK_BORE_EVERY = 4;
/** The frenzy: how far it sees prey up top (with a line on it, from its head or the surface right over it) and feels it (through the ground, anywhere near); how long it hunts on with nothing in sight before it dives. */
export const BASILISK_SENSE = 520;
export const BASILISK_FEEL = 220;
export const BASILISK_CALM = 30 * 25;
/** How deep it dives to sleep again (cells under the surface). */
export const BASILISK_DEEP = 160;
/** Its jaws: reach past its girth, harm to a clone (death), to a vehicle's hull (a share of a tank's), ticks between bites. */
export const BASILISK_JAWS = 6;
export const BASILISK_BITE = 400;
export const BASILISK_CRUSH = 0.3;
export const BASILISK_BITE_CD = 12;

/** Each kind's build: body points, trail cells between them, hit radius, full health. */
export const BEAST_BUILD = [
  { segs: MILLI_SEGS, gap: MILLI_GAP, r: MILLI_R, hp: MILLI_HP },
  { segs: ASP_SEGS, gap: ASP_GAP, r: ASP_R, hp: ASP_HP },
  { segs: 2, gap: 1, r: SEEDER_R, hp: SEEDER_HP },
  { segs: 1, gap: 1, r: NEST_R, hp: NEST_HP },
  { segs: BASILISK_SEGS, gap: BASILISK_GAP, r: BASILISK_R, hp: BASILISK_HP },
] as const;

/** Does this kind bore through the rock (no crawl: its head goes where it steers)? */
export const burrows = (kind: number) => kind === BeastKind.Basilisk;

/** Does this kind fly (no crawl, no trail: it's where it is)? */
export const flies = (kind: number) => kind === BeastKind.Seeder;
/** Does this kind stay put (a nest)? */
export const rooted = (kind: number) => kind === BeastKind.Nest;

/** Venom: a dose (harm it does in all), the most the blood holds, the harm a tick. */
export const VENOM_DOSE = 36;
export const VENOM_MAX = 110;
export const VENOM_RATE = 0.2;

export interface Beast {
  kind: number;
  /** The head's cell (open, ground beside it) and heading (one of the four ways). */
  x: number;
  y: number;
  hx: number;
  hy: number;
  /** Which hand the ground is on: 1 to the right of the heading (screen), -1 to the left. */
  side: number;
  /** Holding on to a surface (otherwise falling, at `vy` cells/s). */
  attached: boolean;
  vy: number;
  /** The head's trail, newest first: x, y pairs, one a step (its kind's segs * gap of them). */
  trail: number[];
  hp: number;
  /** Rearing: ticks into it (0: down); and how far up the head is (0..1). */
  rear: number;
  lift: number;
  /** Ticks to its next spit and coil. */
  spitCd: number;
  coilCd: number;
  /** Frozen still (ticks left), wandering before it next freezes (ticks left), lunging (ticks left). */
  frozen: number;
  /** Dropping off a ceiling onto a clone (falling at them, steering). */
  pounce: boolean;
  /** This time round, it wants to rest on a ceiling (it wanders on until it's on one, for a while). */
  roost: boolean;
  /** An asp curled up as a gem (its disguise; `frozen` is how long it holds it). */
  gem: boolean;
  /** The patches of ground it's crossed lately (newest last), and when it can next bite through a wall. */
  seen: number[];
  biteAt: number;
  wander: number;
  lunge: number;
  /** Coiled round a clone (its id, or -1): ticks into it, where it holds them, the harm it's taken meanwhile. */
  coil: number;
  coilT: number;
  coilX: number;
  coilY: number;
  coilHurt: number;
  /** Its camouflage: which sections of it look like what (the client draws from it). */
  seed: number;
  /** Fractional steps owed by its speed. */
  owed: number;
  /** Who it's after (a player id, or -1), and who hurt it last. */
  target: number;
  hurtBy: number;
  /** When it next thinks about turning round (tick), and its progress (to tell it's stuck). */
  turnAt: number;
  lastX: number;
  lastY: number;
  still: number;
  /** A flier's place (cells, fractional) and speed; its nest (a beast slot, or -1). A nest's next brood (tick) and its alarm (ticks left). */
  fx: number;
  fy: number;
  vx: number;
  home: number;
  brood: number;
  alarm: number;
  /** Watching for a trap (see LOOP_STEPS): crawl steps this window, the box its head kept to; set when it means to drop off (steps left to find a place). */
  loopN: number;
  loopX0: number;
  loopX1: number;
  loopY0: number;
  loopY1: number;
  escape: number;
  /** A burrower's heading (radians); its frenzy (ticks of hunting left; 0 calm) and whether it's reached the surface yet; cells bored since its last bite of rock. */
  ang: number;
  frenzy: number;
  surfaced: boolean;
  bored: number;
}

/** A millipede taking hold at (x, y) (an open cell), going `dir` (-1, 1) along the floor. */
export const newMillipede = (t: Terrain, x: number, y: number, dir: number) => newBeast(t, BeastKind.Millipede, x, y, dir);

/** A creature of a kind taking hold at (x, y) (an open cell), going `dir` (-1, 1) along the floor. */
export function newBeast(t: Terrain, kind: number, x: number, y: number, dir: number): Beast {
  const build = BEAST_BUILD[kind];
  const b: Beast = {
    kind,
    x,
    y,
    hx: dir,
    hy: 0,
    side: dir,
    attached: true,
    vy: 0,
    trail: [],
    hp: build.hp,
    rear: 0,
    lift: 0,
    spitCd: 30,
    coilCd: 0,
    frozen: 0,
    pounce: false,
    roost: false,
    gem: false,
    seen: [],
    biteAt: 0,
    wander: MILLI_WANDER,
    lunge: 0,
    coil: -1,
    coilT: 0,
    coilX: 0,
    coilY: 0,
    coilHurt: 0,
    seed: (x * 7919 + y * 104729) & 255,
    owed: 0,
    target: -1,
    hurtBy: -1,
    turnAt: 0,
    lastX: x,
    lastY: y,
    still: 0,
    fx: x + 0.5,
    fy: y + 0.5,
    vx: 0,
    home: -1,
    brood: 0,
    alarm: 0,
    loopN: 0,
    loopX0: x,
    loopX1: x,
    loopY0: y,
    loopY1: y,
    escape: 0,
    ang: dir < 0 ? Math.PI : 0,
    frenzy: 0,
    surfaced: false,
    bored: 0,
  };
  if (burrows(kind)) {
    // Lying along the cave floor, its body trailing out behind its head (half sunk in the rock, like a seam of it).
    b.trail = [];
    for (let k = 0; k <= build.segs * build.gap; k++) b.trail.push(x - dir * k, y - 2);
    b.fy = y - 2;
    return b;
  }
  if (flies(kind) || rooted(kind)) {
    b.trail = [x, y];
    if (rooted(kind)) anchorNest(t, b);
    return b;
  }
  reorient(t, b);
  // Its body laid out along the ground behind its head: crawl a copy of it backwards from there.
  const ghost = { ...b, trail: [] };
  turnRound(ghost);
  b.trail = [b.x, b.y];
  for (let k = 0; k < build.segs * build.gap; k++) {
    crawlStep(t, ghost);
    b.trail.push(ghost.x, ghost.y);
  }
  return b;
}

/** A seeder at (x, y), out of nest `home`. */
export function newSeeder(t: Terrain, x: number, y: number, home: number): Beast {
  const b = newBeast(t, BeastKind.Seeder, Math.floor(x), Math.floor(y), 1);
  b.fx = x;
  b.fy = y;
  b.home = home;
  return b;
}

/**
 * Which way a nest's anchor is (hx, hy: the rock it's grown on, up for a
 * roof by preference, then the walls, then a floor): none, and it falls.
 */
export function anchorNest(t: Terrain, b: Beast): boolean {
  for (const [ax, ay] of [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
  ]) {
    if (solidAt(t, b.x + ax, b.y + ay)) {
      b.hx = ax;
      b.hy = ay;
      b.attached = true;
      return true;
    }
  }
  b.attached = false;
  return false;
}

/** A nest's centre: hung off its anchor by its own size. */
export function nestCentre(b: Beast, out: number[]): number[] {
  out.length = 0;
  out.push(b.x + 0.5 - b.hx * (NEST_R - 2), b.y + 0.5 - b.hy * (NEST_R - 2));
  return out;
}

/** A flier's body: its head, and its tail a little behind (the way it's going; level if it's hovering). */
export function flierPoints(b: Beast, out: number[]): number[] {
  out.length = 0;
  const sp = Math.hypot(b.vx, b.vy);
  const dx = sp > 8 ? b.vx / sp : b.side;
  const dy = sp > 8 ? b.vy / sp : 0;
  out.push(b.fx, b.fy, b.fx - dx * 3.2, b.fy - dy * 3.2 + 0.6);
  return out;
}

/**
 * One tick of flight toward (gx, gy): it turns toward it (SEEDER_ACCEL),
 * never faster than SEEDER_SPEED, a little jink in it (a wasp's flight:
 * `jink` is the fraction of a turn's worth thrown in at random, from
 * `rnd` -1..1 pairs); into rock it bounces off.
 */
export function flyStep(t: Terrain, b: Beast, gx: number, gy: number, dt: number, jx: number, jy: number, speed = SEEDER_SPEED): void {
  let dx = gx - b.fx;
  let dy = gy - b.fy;
  const d = Math.hypot(dx, dy) || 1;
  // Wanted velocity: at it, slowing as it arrives.
  const want = Math.min(speed, d * 6);
  dx = (dx / d) * want - b.vx;
  dy = (dy / d) * want - b.vy;
  const dl = Math.hypot(dx, dy) || 1;
  const a = Math.min(dl, SEEDER_ACCEL * dt);
  b.vx += (dx / dl) * a + jx * SEEDER_ACCEL * dt * 0.6;
  b.vy += (dy / dl) * a + jy * SEEDER_ACCEL * dt * 0.6;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > speed) {
    b.vx *= speed / sp;
    b.vy *= speed / sp;
  }
  // Move, an axis at a time, bouncing off rock.
  const nx = b.fx + b.vx * dt;
  if (solidAt(t, Math.floor(nx), Math.floor(b.fy))) b.vx *= -0.5;
  else b.fx = nx;
  const ny = b.fy + b.vy * dt;
  if (solidAt(t, Math.floor(b.fx), Math.floor(ny))) b.vy *= -0.5;
  else b.fy = ny;
  b.x = Math.floor(b.fx);
  b.y = Math.floor(b.fy);
  if (Math.abs(b.vx) > 8) b.side = Math.sign(b.vx);
}

const solidAt = (t: Terrain, x: number, y: number) => x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H || t.isSolid(x, y);

/** The ground side of a heading, for a beast with the ground on hand `side`. */
const groundX = (b: Beast) => (b.side > 0 ? -b.hy : b.hy);
const groundY = (b: Beast) => (b.side > 0 ? b.hx : -b.hx);

/** Go the other way along the same surface. */
export function turnRound(b: Beast): void {
  b.hx = -b.hx;
  b.hy = -b.hy;
  b.side = -b.side;
}

/** Find a heading that has ground on its hand here; false if there's no ground at all beside it. */
function reorient(t: Terrain, b: Beast): boolean {
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  // Keep the heading if it still works; else the first that does (preferring to keep going the same way round).
  if (solidAt(t, b.x + groundX(b), b.y + groundY(b))) return true;
  for (const [hx, hy] of dirs) {
    b.hx = hx;
    b.hy = hy;
    if (solidAt(t, b.x + groundX(b), b.y + groundY(b)) && !solidAt(t, b.x + hx, b.y + hy)) return true;
  }
  for (const [hx, hy] of dirs) {
    b.hx = hx;
    b.hy = hy;
    if (solidAt(t, b.x + groundX(b), b.y + groundY(b))) return true;
  }
  return false;
}

/**
 * One step along the surface (a cell). Into a wall ahead: turn up it (and
 * step, if that's open). Over an edge: step, then turn down round it and
 * step again so the ground's under it once more. With nothing to hold on to
 * (dug out, or it never had ground): let go (falling).
 */
export function crawlStep(t: Terrain, b: Beast): void {
  if (solidAt(t, b.x, b.y)) {
    // Buried (something filled its cell): up out of it.
    for (let k = 1; k < 8; k++) {
      if (!solidAt(t, b.x, b.y - k)) {
        b.y -= k;
        break;
      }
    }
  }
  if (!reorient(t, b)) {
    b.attached = false;
    return;
  }
  for (let turn = 0; turn < 4; turn++) {
    if (!solidAt(t, b.x + b.hx, b.y + b.hy)) break;
    // Concave corner: turn away from the ground (up the wall).
    const nx = b.side > 0 ? b.hy : -b.hy;
    const ny = b.side > 0 ? -b.hx : b.hx;
    b.hx = nx;
    b.hy = ny;
    if (turn === 3) return; // (boxed in: stay put)
  }
  b.x += b.hx;
  b.y += b.hy;
  if (!solidAt(t, b.x + groundX(b), b.y + groundY(b))) {
    // Convex corner: turn toward the ground (down round the edge), and step round it.
    const gx = groundX(b);
    const gy = groundY(b);
    b.hx = gx;
    b.hy = gy;
    if (!solidAt(t, b.x + gx, b.y + gy)) {
      b.x += gx;
      b.y += gy;
    }
    if (!solidAt(t, b.x + groundX(b), b.y + groundY(b)) && !reorient(t, b)) b.attached = false;
  }
}

/** The patch of ground a cell is in (for remembering where it's been). */
export const patchOf = (x: number, y: number) => (Math.floor(x / MILLI_PATCH) << 12) | Math.floor(y / MILLI_PATCH);

/** Remember the patch its head is in now. */
export function noteSeen(b: Beast): void {
  const k = patchOf(b.x, b.y);
  if (b.seen[b.seen.length - 1] === k) return;
  const i = b.seen.indexOf(k);
  if (i >= 0) b.seen.splice(i, 1);
  b.seen.push(k);
  if (b.seen.length > MILLI_SEEN) b.seen.shift();
}

/**
 * A wall it could bite through: solid right ahead of its head along its way,
 * and open air again (two cells of it, a real opening) within MILLI_MOUTH,
 * with nothing between that won't yield to a mouth (fixed, adamant, tough).
 * Returns how far the opening is (cells), or 0.
 */
export function mouthOpening(t: Terrain, b: Beast): number {
  if (!b.attached || !solidAt(t, b.x + b.hx, b.y + b.hy)) return 0;
  const ax = -groundX(b);
  const ay = -groundY(b);
  // A wall, not a step it would just climb: rock ahead stands its body's height.
  for (let h = 2; h <= MILLI_BITE_H; h += 2) if (!solidAt(t, b.x + b.hx + ax * h, b.y + b.hy + ay * h)) return 0;
  for (let k = 1; k <= MILLI_MOUTH; k++) {
    const x = b.x + b.hx * k;
    const y = b.y + b.hy * k;
    if (x < 4 || y < 4 || x >= WORLD_W - 4 || y >= WORLD_H - 14) return 0;
    if (!t.isSolid(x, y)) {
      if (k === 1) return 0;
      // A real opening beyond, room for its body, not a pore in the rock.
      for (let j = 1; j <= 2; j++) for (let h = 0; h <= MILLI_BITE_H; h += 2) if (solidAt(t, x + b.hx * j + ax * h, y + b.hy * j + ay * h)) return 0;
      return k;
    }
    const m = t.get(x, y);
    if (MAT_FIXED[m] || MAT_ADAMANT[m] || MAT_TOUGH[m]) return 0;
  }
  return 0;
}

/** Away from its ground (the open side of its heading). */
export const awayX = (b: Beast) => -groundX(b);
export const awayY = (b: Beast) => -groundY(b);

/**
 * After a crawl step: watch for being caught lapping a little island, and
 * say whether to let go now (it means to drop off, and there's open air
 * under its head to drop into).
 */
export function loopWatch(t: Terrain, b: Beast): boolean {
  if (b.escape > 0) {
    b.escape--;
    if (!solidAt(t, b.x, b.y + 1) && !solidAt(t, b.x, b.y + 2)) {
      b.escape = 0;
      resetLoop(b);
      return true;
    }
    return false;
  }
  b.loopX0 = Math.min(b.loopX0, b.x);
  b.loopX1 = Math.max(b.loopX1, b.x);
  b.loopY0 = Math.min(b.loopY0, b.y);
  b.loopY1 = Math.max(b.loopY1, b.y);
  if (++b.loopN >= LOOP_STEPS) {
    if (b.loopX1 - b.loopX0 <= LOOP_BOX && b.loopY1 - b.loopY0 <= LOOP_BOX) b.escape = LOOP_STEPS;
    resetLoop(b);
  }
  return false;
}

/** Start watching afresh from where it is. */
export function resetLoop(b: Beast): void {
  b.loopN = 0;
  b.loopX0 = b.loopX1 = b.x;
  b.loopY0 = b.loopY1 = b.y;
}

/** Can a basilisk bore through this cell (nothing it won't yield: fixed, adamant, tough)? */
export const boreable = (t: Terrain, x: number, y: number) => {
  if (x < 2 || y < 2 || x >= WORLD_W - 2 || y >= WORLD_H - 10) return false;
  const m = t.get(x, y);
  return !(MAT_FIXED[m] || MAT_ADAMANT[m] || MAT_TOUGH[m]);
};

/**
 * One tick of a burrower boring toward (gx, gy) at `speed` (cells/s): it
 * turns toward it (BASILISK_TURN), and where the way ahead won't yield it
 * swings aside to find a way round. Out in the open air with nothing to
 * hold, it arcs back down into the ground (a leap). Returns the cells it
 * moved (for the bores behind it).
 */
export function boreStep(t: Terrain, b: Beast, gx: number, gy: number, speed: number, dt: number): number {
  let want = Math.atan2(gy - b.fy, gx - b.fx);
  // In the open, far from any rock: it falls back toward the ground.
  const hx = Math.round(b.fx);
  const hy = Math.round(b.fy);
  let held = false;
  for (let k = 2; k <= 10 && !held; k += 2) if (solidAt(t, hx, hy + k) || solidAt(t, hx + k, hy) || solidAt(t, hx - k, hy) || solidAt(t, hx, hy - k)) held = true;
  if (!held && gy < b.fy + 40) want = Math.PI / 2;
  // Turn toward it (the short way round), at its rate.
  let d = ((want - b.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const max = BASILISK_TURN * dt;
  b.ang += Math.max(-max, Math.min(max, d));
  // Whatever won't yield, dead ahead: swing aside (the way that's open), and hold there.
  const look = BASILISK_BORE + 2;
  for (let tries = 0; tries < 6; tries++) {
    const ax = Math.round(b.fx + Math.cos(b.ang) * look);
    const ay = Math.round(b.fy + Math.sin(b.ang) * look);
    if (boreable(t, ax, ay)) break;
    d = tries % 2 === 0 ? 0.6 * (tries + 1) : -0.6 * (tries + 1);
    b.ang += d;
  }
  const step = speed * dt;
  const nx = b.fx + Math.cos(b.ang) * step;
  const ny = b.fy + Math.sin(b.ang) * step;
  if (!boreable(t, Math.round(nx), Math.round(ny))) return 0;
  b.fx = nx;
  b.fy = ny;
  b.x = Math.round(nx);
  b.y = Math.round(ny);
  // Its trail, a point a cell (however far it went this tick).
  const lx = b.trail[0];
  const ly = b.trail[1];
  const dist = Math.hypot(b.fx - lx, b.fy - ly);
  const n = Math.floor(dist);
  for (let k = 1; k <= n; k++) pushTrailF(b, lx + ((b.fx - lx) * k) / dist, ly + ((b.fy - ly) * k) / dist);
  return step;
}

/** A point onto a burrower's trail (not snapped to the grid). */
function pushTrailF(b: Beast, x: number, y: number): void {
  b.trail.unshift(x, y);
  const n = BEAST_BUILD[b.kind].segs * BEAST_BUILD[b.kind].gap * 2 + 2;
  if (b.trail.length > n) b.trail.length = n;
}

/** Is it on a floor (rock under its head, open over it)? */
export function onFloor(t: Terrain, b: Beast): boolean {
  return b.attached && solidAt(t, b.x, b.y + 1) && !solidAt(t, b.x, b.y - 1);
}

/** Is it hanging from a ceiling (rock over its head, open under it)? */
export function onCeiling(t: Terrain, b: Beast): boolean {
  return b.attached && solidAt(t, b.x, b.y - 1) && !solidAt(t, b.x, b.y + 1);
}

/** Falling: down at its speed until it lands on something, then take hold. */
export function fallStep(t: Terrain, b: Beast, dt: number, gravity: number): void {
  b.vy = Math.min(600, b.vy + gravity * dt);
  let n = Math.max(1, Math.round(b.vy * dt));
  while (n-- > 0) {
    if (solidAt(t, b.x, b.y + 1)) {
      b.attached = true;
      b.vy = 0;
      b.hx = b.side;
      b.hy = 0;
      reorient(t, b);
      return;
    }
    b.y++;
    if (b.y >= WORLD_H - 2) return;
  }
}

/** Push the head's new cell onto the trail (the oldest falls off the end). */
export function pushTrail(b: Beast): void {
  b.trail.unshift(b.x, b.y);
  const n = BEAST_BUILD[b.kind].segs * BEAST_BUILD[b.kind].gap * 2 + 2;
  if (b.trail.length > n) b.trail.length = n;
}

/**
 * Which way is open air from (x, y): the surface normal, from how the solid
 * cells lie in a 7x7 box round it (unit vector; straight up if it can't tell).
 */
export function openWay(t: Terrain, x: number, y: number): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (solidAt(t, Math.round(x) + dx, Math.round(y) + dy)) {
        const w = 1 / (dx * dx + dy * dy);
        sx -= dx * w;
        sy -= dy * w;
      }
    }
  }
  const l = Math.hypot(sx, sy);
  return l < 1e-6 ? { x: 0, y: -1 } : { x: sx / l, y: sy / l };
}

/**
 * Its body: its kind's points (head first), along its trail every few
 * steps, smoothed (the grid's stairsteps rounded off), up off the ground
 * by its girth; the neck lifted off the ground along its normal as it
 * rears. Flat: x, y pairs into `out`.
 */
export function bodyPoints(t: Terrain, b: Beast, out: number[]): number[] {
  out.length = 0;
  const tr = b.trail;
  const n = tr.length >> 1;
  const { segs, gap } = BEAST_BUILD[b.kind];
  if (burrows(b.kind)) {
    // Bored through the rock: its body is its tunnel, the trail as it is (smoothed), centred, no lift.
    for (let s = 0; s < segs; s++) {
      const k = Math.min(n - 1, s * gap);
      let x = 0;
      let y = 0;
      let w = 0;
      for (let j = Math.max(0, k - 3); j <= Math.min(n - 1, k + 3); j++) {
        x += tr[j * 2];
        y += tr[j * 2 + 1];
        w++;
      }
      out.push(x / w + 0.5, y / w + 0.5);
    }
    return out;
  }
  if (b.gem) {
    // Curled up as a gem: wound tight in a spiral, sitting on the floor over its head's cell.
    const up = openWay(t, b.x, b.y);
    const cx = b.x + 0.5 + up.x * 3;
    const cy = b.y + 0.5 + up.y * 3;
    for (let s = 0; s < segs; s++) {
      const a = s * 1.25;
      const r = 3.2 - s * 0.35;
      out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8);
    }
    return out;
  }
  for (let s = 0; s < segs; s++) {
    const k = Math.min(n - 1, s * gap);
    let x = 0;
    let y = 0;
    let w = 0;
    for (let j = Math.max(0, k - 2); j <= Math.min(n - 1, k + 2); j++) {
      x += tr[j * 2];
      y += tr[j * 2 + 1];
      w++;
    }
    // Centred in its body: up off the ground by its girth (as it's drawn, and so where it's hit).
    const px = x / w + 0.5;
    const py = y / w + 0.5;
    const up = openWay(t, px, py);
    const r = BEAST_BUILD[b.kind].r;
    out.push(px + up.x * r, py + up.y * r);
  }
  if (b.coil >= 0) {
    // Coiled round a clone (centred at coilX, coilY): the fore-body wound round them in a
    // spiral from their feet up, the rest of it following its trail back from its head.
    const K = MILLI_COIL_SEGS;
    for (let s = segs - 1; s >= K; s--) {
      out[s * 2] = out[(s - K) * 2];
      out[s * 2 + 1] = out[(s - K) * 2 + 1];
    }
    const spin = b.coilT * 0.35;
    for (let s = 0; s < K; s++) {
      const f = s / (K - 1);
      const a = spin + f * Math.PI * 2.6;
      out[s * 2] = b.coilX + Math.cos(a) * (4.8 + f * 1.2);
      out[s * 2 + 1] = b.coilY - 7 + (1 - f) * 14 + Math.sin(a) * 1.6;
    }
    return out;
  }
  if (b.lift > 0) {
    const up = openWay(t, b.x, b.y);
    // (An asp rears up less far, by fewer segments: it's a quarter the size.)
    const neck = b.kind === BeastKind.Asp ? 4 : MILLI_NECK;
    const high = b.kind === BeastKind.Asp ? 6 : MILLI_LIFT;
    for (let s = 0; s < neck; s++) {
      const f = b.lift * high * (1 - s / neck) ** 1.6;
      out[s * 2] += up.x * f;
      out[s * 2 + 1] += up.y * f;
    }
  }
  return out;
}

/** Distance from (px, py) to the nearest of its body points (flat pairs), and that point's index. */
export function nearestPoint(pts: readonly number[], px: number, py: number): { d: number; i: number } {
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const d = (pts[i] - px) ** 2 + (pts[i + 1] - py) ** 2;
    if (d < best) {
      best = d;
      bi = i >> 1;
    }
  }
  return { d: Math.sqrt(best), i: bi };
}

/** Where a segment from (x0, y0) by (dx, dy) first meets a circle (0..1 along it), or -1. */
export function segmentCircle(x0: number, y0: number, dx: number, dy: number, cx: number, cy: number, r: number): number {
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  if (a < 1e-9) return -1;
  const bb = fx * dx + fy * dy;
  const disc = bb * bb - a * c;
  if (disc < 0) return -1;
  const t = (-bb - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : -1;
}
