import { BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP } from './actor.ts';
import { ACTOR_H, ACTOR_MAX_HP, ACTOR_W, GRAVITY } from './constants.ts';
import type { Terrain } from './terrain.ts';

/**
 * Tanks, Metal Slug style: a squat armoured box on treads with a turret
 * cannon, a vulcan SMG on the front and a pair of lift jets underneath.
 *
 * A tank arrives by air, swinging under a parachute; it lands empty and
 * whoever reaches it first climbs in (the pick-up key) and drives it
 * (A/D treads, W jets, fire the SMG, right mouse / Shift the cannon); the same key
 * climbs back out.
 *
 * It is built from parts that can be shot off: the cannon, the SMG, and an
 * external armour plate over the front and roof that soaks hits until it is
 * blown away. The hull holds fifteen clones' worth of punishment; when it
 * goes, the tank explodes and takes its driver with it.
 *
 * Unlike a drop rocket a tank never tips: it is an axis-aligned box whose
 * treads climb steps up to TANK_STEP_UP cells. `stepTank` is pure and shared:
 * the server runs it authoritatively and the driver's client replays it over
 * unacknowledged inputs to predict its own tank, as it does its clone.
 */
export const TANK_W = 32;
export const TANK_H = 22;
/**
 * The watchdog: a small unmanned tank (a radio purchase) that drives itself,
 * two-thirds the size of a tank and two-thirds as tough. Everything here is
 * written for a full-size tank in its own "design" cells; a tank's `s` scales
 * it (its box, its parts, its guns' pivots and barrels).
 */
export const WATCHDOG_SCALE = 2 / 3;
/**
 * What a tank slot holds: a tank (anyone can climb in), a watchdog, or a
 * tarantula. The last two are unmanned (radio purchases that guard whoever
 * called them in, and that their owner can drive by remote).
 */
export const TankKind = { Tank: 0, Watchdog: 1, Tarantula: 2, Mole: 3 } as const;
/**
 * The mole: a smaller tank (four-fifths the size) with 70% of a tank's hull
 * and no cannon. In its place, a plasma flamethrower on the back that
 * swivels all the way round, burns whoever it reaches and burns through the
 * ground (it digs as it goes); a heavier, faster SMG on the nose; and out
 * front a great steel frill, triceratops-style, horns and all, that stands
 * above the deck and takes the fire meant for the three soldiers riding
 * behind it, until it's shot away. Its design cells are a tank's (scaled by
 * `s`); the cannon slot holds the flamethrower, the armour slot the frill.
 */
export const MOLE_SCALE = 0.8;
export const MOLE_HP = 0.7;
/** The frill's hit points (strong: most of a tank's armour plate and more), and the box it stands in (design cells, facing right). */
export const MOLE_FRILL_HP = 3600;
export const MOLE_FRILL_BOX = [18, -21, 32, 10] as const;
/**
 * The tarantula: an ultraheavy spider droid, three times a spider droid's
 * size. Its "design" cells are a spider droid's own (ACTOR_W x ACTOR_H,
 * drawn and laid out as the droid is), scaled by its `s`. It walks on six
 * legs (and straight up walls), with a missile rack on its back and an
 * automatic laser in its head.
 */
export const TARANTULA_SCALE = 3;
/** Its hull, in tanks. */
export const TARANTULA_HP = 2;
type Kinded = { s?: number; kind?: number };
/** Is this tank a watchdog? A tarantula? Either (an owner's unmanned machine)? */
export const isDog = (t: Kinded) => (t.kind ?? (t.s && t.s < 1 ? TankKind.Watchdog : TankKind.Tank)) === TankKind.Watchdog;
export const isSpider = (t: Kinded) => t.kind === TankKind.Tarantula;
export const isPet = (t: Kinded) => isDog(t) || isSpider(t);
export const isMole = (t: Kinded) => t.kind === TankKind.Mole;
/** Its design box (unscaled cells): a tank's, or (a tarantula) a spider droid's. */
export const designW = (t: Kinded) => (isSpider(t) ? ACTOR_W : TANK_W);
export const designH = (t: Kinded) => (isSpider(t) ? ACTOR_H : TANK_H);
/** A tank's box (cells), for its scale. */
export const tankW = (t: Kinded) => (t.s && t.s !== 1 ? Math.round(designW(t) * t.s) : designW(t));
export const tankH = (t: Kinded) => (t.s && t.s !== 1 ? Math.round(designH(t) * t.s) : designH(t));
/** How much of a tank's hull (and parts) it has. */
export const hullScale = (t: Kinded) => (isSpider(t) ? TARANTULA_HP : isMole(t) ? MOLE_HP : (t.s ?? 1));
/** A tank's full hull, for its scale. */
export const tankMaxHp = (t: Kinded) => TANK_HP * hullScale(t);
/**
 * How far down its box is solid to shots: a tank's all hull; a tarantula's
 * stops at its belly (below are only its spindly legs, which shots pass between).
 */
export const hitH = (t: Kinded) => (isSpider(t) ? SPIDER_BELLY : designH(t));
/** Seventy-five times a clone's health: a fortress on tracks. */
export const TANK_HP = 75 * ACTOR_MAX_HP;
/** Hits below this penetration energy only scratch the armour. */
export const TANK_INTEGRITY = 120;
export const MAX_TANKS = 16; // (a rider's seat byte holds the slot in four bits)
export const TANK_MAX_FUEL = 100;
const RUN = 80;
const GROUND_ACCEL = 640;
/** Steering in the air (coasting or on the jets). */
const AIR_ACCEL = 300;
/** The treads climb a step this tall for each cell they advance: steep hills and jagged ground, not sheer walls. */
export const TANK_STEP_UP = 14;
/** Rolling over a dip this deep (or less), the treads stay on the ground rather than hopping off it. */
const SNAP_DOWN = 10;
const JET_ACCEL = 1050; // vs GRAVITY 620: a slow, heavy climb
const FUEL_BURN = 32; // per second
const FUEL_REGEN = 22; // per second, on the ground
const MAX_FALL = 520;
const MAX_RISE = 150;
const CHUTE_FALL = 50; // descent speed under the parachute

export const TankPart = {
  Hull: 0,
  Cannon: 1,
  Smg: 2,
  Armor: 3,
  /** The steel cupola over the hatch: while it holds, the driver can't be touched. */
  Shield: 4,
} as const;
export const TANK_PARTS = 5;
export const ALL_TANK_PARTS = (1 << TANK_PARTS) - 1;
export const TANK_PART_HP = [TANK_HP, 1600, 1100, 2600, 1800];
export const TANK_PART_NAMES = ['hull', 'cannon', 'SMG', 'armour', 'shield'];
/** Part centres, tank-local (facing right, from the top-left corner). */
export const TANK_PART_CENTER: readonly (readonly [number, number])[] = [
  [16, 12],
  [21, 3],
  [27, 11],
  [14, 6],
  [13, -1],
];

export const hasTankPart = (mask: number, part: number) => (mask & (1 << part)) !== 0;

/**
 * Tank surfing: friendly soldiers riding on top of a vehicle. Its seats, in
 * design cells (facing right, x along it, the y of the deck they stand on):
 * a tank's rear deck behind the dome and its glacis, a watchdog's the same
 * two, a tarantula's back either side of its head's mast.
 */
const TANK_SEATS = [4, 22, 27];
const DOG_SEATS = [4, 24];
const SPIDER_SEATS = [-1.2, 0.6, 2.2, 5.9, 7.6];
const SPIDER_DECK = 6.6;
/**
 * A mole's: its back, behind the frill, each on the top of what's under it
 * (x, then the deck's y: the driver's hatch cover, then the flamethrower's
 * cupola). Its hull is low and humped, not a flat roof, so each seat has its own.
 */
const MOLE_SEATS = [5, 10.5, 15];
const MOLE_DECKS = [1, 2, 2];
/** How many soldiers can ride on it. */
export const surfCapacity = (t: Kinded) => (isSpider(t) ? SPIDER_SEATS.length : isDog(t) ? DOG_SEATS.length : isMole(t) ? MOLE_SEATS.length : TANK_SEATS.length);
const seatPt = { x: 0, y: 0 };
/** Where rider `i` stands on it (world): its centre x, and its feet. */
export function surfSeat(t: Posed, i: number, out: { x: number; y: number }): { x: number; y: number } {
  const seats = isSpider(t) ? SPIDER_SEATS : isDog(t) ? DOG_SEATS : isMole(t) ? MOLE_SEATS : TANK_SEATS;
  const k = Math.min(i, seats.length - 1);
  const p = tankPoint(t, seats[k], isSpider(t) ? SPIDER_DECK : isMole(t) ? MOLE_DECKS[k] : 0, seatPt);
  out.x = p.x;
  out.y = p.y;
  return out;
}

/** Where to shoot a tank (its middle; a tarantula's chassis, not the air between its legs), and where its guns turn (world y). */
export const tankCoreY = (t: Kinded & { y: number }) => t.y + tankH(t) * (isSpider(t) ? 0.7 : 0.5);
export const gunPivotY = (t: Kinded & { y: number }) => t.y + (isSpider(t) ? SPIDER_LASER_PIVOT[1] : isMole(t) ? MOLE_PLASMA_PIVOT[1] : CANNON_PIVOT[1]) * (t.s ?? 1);

/** The tarantula's parts' centres (its design cells: the spider droid's). */
const SPIDER_PART_CENTER: readonly (readonly [number, number])[] = [
  [4, 10.5],
  [0.8, 6],
  [4, 3.6],
  [4, 9],
  [4, 4],
];
/** The mole's: hull, flamethrower, SMG, frill, hatch cover. */
const MOLE_PART_CENTER: readonly (readonly [number, number])[] = [
  [14, 12],
  [13, 4],
  [26, 12],
  [27, -5],
  [5, 4],
];
/** Where a part is (design cells, facing right), for a tank, a tarantula or a mole. */
export const partCenter = (t: Kinded, part: number) => (isSpider(t) ? SPIDER_PART_CENTER : isMole(t) ? MOLE_PART_CENTER : TANK_PART_CENTER)[part];

/** How high a driver's head sits out of the hatch (clone top, from the tank's top) once the shield is gone. */
export const EXPOSED_SEAT_Y = -8;
/** Rows of an exposed driver's body that stick out and can be hit (head and shoulders). */
export const EXPOSED_H = 6;

/** Turret pivot, cannon barrel length, and the cannon's elevation limits (radians above horizontal). */
export const CANNON_PIVOT = [15, 3] as const;
export const CANNON_LEN = 23;
export const CANNON_UP = 1.25;
export const CANNON_DOWN = 0.45;
/** The vulcan: pivot and barrel length. It swivels all the way round. */
export const SMG_PIVOT = [25, 11] as const;
export const SMG_LEN = 12;
/** The mole's flamethrower nozzle (it turns all the way round) and its SMG on the nose, under the frill. */
export const MOLE_PLASMA_PIVOT = [13, 4] as const;
export const MOLE_PLASMA_LEN = 8;
export const MOLE_SMG_PIVOT = [25, 12] as const;

/**
 * The tarantula's guns (in its design cells, the spider droid's): the laser
 * in its head (pivoting where a droid's gun does), the missile rack on its
 * back. Both swivel all the way round.
 */
export const SPIDER_LASER_PIVOT = [4, 4] as const;
export const SPIDER_LASER_LEN = 4.4;
export const SPIDER_RACK_PIVOT = [0.6, 5.4] as const;
export const SPIDER_RACK_LEN = 2.6;
/** The underside of its chassis (design cells): below it, only legs. */
export const SPIDER_BELLY = 12.6;
/** Seconds between laser beams, and between missiles. */
export const SPIDER_LASER_INTERVAL = 60 / 300;
export const SPIDER_MISSILE_INTERVAL = 60 / 140;
export const SPIDER_MISSILE_SPEED = 380;
/** Its laser's beam: narrower and weaker than a charged laser rifle's, but it never stops. */
export const SPIDER_BEAM_WIDTH = 0.9;
export const SPIDER_BEAM_WOUND = 66;
export const SPIDER_BEAM_ENERGY = 1680;
/**
 * And it vaporizes what it touches: a bite of SPIDER_VAPOR_R (hard material
 * within SPIDER_VAPOR_CORE) out of the ground where it lands, five a second,
 * about what a digger takes; and a burn on every soldier it passes through.
 */
export const SPIDER_VAPOR_R = 11;
export const SPIDER_VAPOR_CORE = 6;
export const SPIDER_VAPOR_BURN = 18;
/** Walking pace, and climbing a wall. */
const SPIDER_RUN = 72;
const SPIDER_CLIMB = 64;
/** Its legs step up this much per cell advanced. */
const SPIDER_STEP_UP = 18;
/**
 * The tarantula's leap and glide: a jump off its legs (up, with a shove the
 * way it's walking) about three bodies high; then, falling, its belly
 * rockets ease it down (thrust under its weight: it can't climb on them,
 * only glide), steering wider than it walks, on a charge that refills on
 * the ground.
 */
export const SPIDER_JUMP = 400;
const SPIDER_LEAP_VX = 110;
const SPIDER_GLIDE_RUN = 130;
const SPIDER_GLIDE_THRUST = GRAVITY * 0.72;
const SPIDER_GLIDE_FALL = 70;
const SPIDER_GLIDE_BURN = 22; // charge a second, gliding (of 100)
const SPIDER_GLIDE_REFILL = 45; // a second, on the ground

/** Seconds between shots. */
export const SMG_INTERVAL = 60 / 720;
/** The mole's: a faster, heavier SMG (900 a minute), and plasma at twenty puffs a second. */
export const MOLE_SMG_INTERVAL = 60 / 900;
export const MOLE_PLASMA_INTERVAL = 1 / 20;
export const PLASMA_SPEED = 360;
export const CANNON_INTERVAL = 60 / 40;
export const SMG_SPEED = 900;
export const SMG_SPREAD = 0.06;
export const CANNON_SPEED = 560;

export interface Tank {
  x: number; // top-left, world cells
  y: number;
  vx: number;
  vy: number;
  fuel: number;
  onGround: boolean;
  jetting: boolean;
  /** Still coming down under its parachute (nobody can board yet). */
  chute: boolean;
  hp: number; // hull
  parts: number; // attached-part mask
  partHp: Float32Array;
  /** Player id driving, or 255. */
  pilot: number;
  faceLeft: boolean;
  /** Turret aim, radians (screen axes). */
  aim: number;
  /** Seconds until each gun may fire again. */
  smgCd: number;
  cannonCd: number;
  /** Who damaged it last (credit for its destruction). */
  lastHitBy: number;
  /** Fired this tick (muzzle flashes on clients). */
  firedSmg: boolean;
  firedCannon: boolean;
  /** Hull tilt (radians, clockwise on screen: positive = right end lower) and its angular velocity. */
  a: number;
  w: number;
  /** Size: 1 for a tank, WATCHDOG_SCALE for a watchdog. */
  s: number;
  /** A watchdog's owner (whom it guards, and who can drive it from afar), or 255. */
  owner: number;
  /** TankKind. */
  kind: number;
  /** Which of a tarantula's two missile tubes fired last. */
  tube?: number;
}

export function newTank(x: number, y: number, s = 1, owner = 255, kind: number = s < 1 ? TankKind.Watchdog : TankKind.Tank): Tank {
  const partHp = new Float32Array(TANK_PARTS);
  const hs = hullScale({ s, kind });
  for (let i = 0; i < TANK_PARTS; i++) partHp[i] = TANK_PART_HP[i] * hs;
  if (kind === TankKind.Mole) partHp[TankPart.Armor] = MOLE_FRILL_HP;
  return {
    x,
    y,
    vx: 0,
    vy: CHUTE_FALL,
    fuel: TANK_MAX_FUEL,
    onGround: false,
    jetting: false,
    chute: true,
    hp: TANK_HP * hs,
    // (Nobody rides a tarantula: no hatch, no shield over it.)
    parts: kind === TankKind.Tarantula ? ALL_TANK_PARTS & ~(1 << TankPart.Shield) : ALL_TANK_PARTS,
    partHp,
    pilot: 255,
    faceLeft: false,
    aim: 0,
    smgCd: 0,
    cannonCd: 0,
    lastHitBy: 255,
    firedSmg: false,
    firedCannon: false,
    a: 0,
    w: 0,
    s,
    owner,
    kind,
  };
}

/** A mole, coming down over `x` (anyone's to climb into). */
export function newMole(x: number, y: number): Tank {
  return newTank(x, y, MOLE_SCALE, 255, TankKind.Mole);
}

/** A tarantula, called in over `x`, for its owner. */
export function newTarantula(x: number, y: number, owner: number): Tank {
  return newTank(x, y, TARANTULA_SCALE, owner, TankKind.Tarantula);
}

/** Which part is at tank-local (lx, ly) (from the top-left); missing parts expose the hull. */
export function tankPartAt(t: { faceLeft: boolean; parts: number; kind?: number }, lx: number, ly: number): number {
  if (isSpider(t)) {
    // The tarantula (spider-droid cells): the laser head up on its T, the
    // missile rack on its back, the plating round the chassis.
    const fx = t.faceLeft ? ACTOR_W - lx : lx;
    if (fx >= 2 && ly < 7 && hasTankPart(t.parts, TankPart.Smg)) return TankPart.Smg;
    if (fx < 2.4 && ly < 8.4 && hasTankPart(t.parts, TankPart.Cannon)) return TankPart.Cannon;
    if ((ly < 9.4 || fx < 1.2 || fx > 6.8) && hasTankPart(t.parts, TankPart.Armor)) return TankPart.Armor;
    return TankPart.Hull;
  }
  const fx = t.faceLeft ? TANK_W - lx : lx;
  let p: number = TankPart.Hull;
  if (isMole(t)) {
    // The mole (tank cells): the frill out front and above, the flamethrower on its back, the SMG on its nose, the hatch cover at the rear.
    const [f0, f1, , f3] = MOLE_FRILL_BOX;
    if (fx >= f0 && ly >= f1 && ly <= f3 && hasTankPart(t.parts, TankPart.Armor)) return TankPart.Armor;
    if (fx >= 9 && fx <= 17 && ly < 7 && hasTankPart(t.parts, TankPart.Cannon)) return TankPart.Cannon;
    if (fx >= 22 && ly >= 10 && ly <= 14 && hasTankPart(t.parts, TankPart.Smg)) return TankPart.Smg;
    if (fx >= 2 && fx <= 8 && ly < 6 && hasTankPart(t.parts, TankPart.Shield)) return TankPart.Shield;
    return TankPart.Hull;
  }
  // Matches the sprite (client/sprites.ts): cannon out of the dome front,
  // vulcan housing on the nose, the plate over the roof and the glacis.
  if (fx >= 9 && fx <= 18 && ly < 2 && hasTankPart(t.parts, TankPart.Shield)) p = TankPart.Shield;
  else if (fx >= 17 && ly < 6 && hasTankPart(t.parts, TankPart.Cannon)) p = TankPart.Cannon;
  else if (fx >= 24 && ly >= 9 && ly <= 13 && hasTankPart(t.parts, TankPart.Smg)) p = TankPart.Smg;
  else if ((fx >= 25 || ly < 8) && hasTankPart(t.parts, TankPart.Armor)) p = TankPart.Armor;
  return p;
}

type Posed = { x: number; y: number; faceLeft: boolean; a: number; s?: number; kind?: number };

/** Inset of the tread contact points from the hull's ends (cells). */
const CONTACT = 3;

/**
 * How far the tilt pivot (the middle of the tread line) sits below the box:
 * the box rests on the higher end, the hull rotates down onto the lower one.
 */
export function tankSink(a: number, s = 1): number {
  return (TANK_W / 2 - CONTACT) * s * Math.abs(Math.sin(a));
}

/**
 * A tank-local point (as drawn facing right, from the box's top-left) in
 * world cells: mirrored when facing left, then tilted with the hull about
 * the middle of its tread line.
 */
export function tankPoint(t: Posed, lx: number, ly: number, out: { x: number; y: number }): { x: number; y: number } {
  const k = t.s ?? 1;
  const dw = designW(t);
  const dx = ((t.faceLeft ? dw - lx : lx) - dw / 2) * k;
  const dy = (ly - designH(t)) * k;
  const c = Math.cos(t.a);
  const s = Math.sin(t.a);
  out.x = t.x + tankW(t) / 2 + dx * c - dy * s;
  out.y = t.y + tankH(t) + tankSink(t.a, k) + dx * s + dy * c;
  return out;
}

/** World -> the tank's own (untilted, unmirrored) box coordinates, in design cells: x along the box from its left end. */
export function tankLocal(t: Posed, wx: number, wy: number, out: { x: number; y: number }): { x: number; y: number } {
  const k = t.s ?? 1;
  const dx = wx - (t.x + tankW(t) / 2);
  const dy = wy - (t.y + tankH(t) + tankSink(t.a, k));
  const c = Math.cos(t.a);
  const s = Math.sin(t.a);
  out.x = designW(t) / 2 + (dx * c + dy * s) / k;
  out.y = designH(t) + (-dx * s + dy * c) / k;
  return out;
}

/**
 * The cannon's actual firing angle (world) for an aim: elevation clamped
 * relative to the hull (so it tips with it), always out of the front.
 */
export function cannonAngle(faceLeft: boolean, aim: number, tilt = 0): number {
  const local = aim - tilt;
  let e = -Math.atan2(Math.sin(local), Math.abs(Math.cos(local))); // elevation above the hull's horizontal
  e = Math.max(-CANNON_DOWN, Math.min(CANNON_UP, e));
  return (faceLeft ? Math.PI + e : -e) + tilt;
}

const mzPt = { x: 0, y: 0 };
/** Muzzle of the cannon or the SMG (world), and the angle it fires at. */
export function tankMuzzle(t: Posed, cannon: boolean, aim: number, out: { x: number; y: number; a: number }): { x: number; y: number; a: number } {
  const spider = isSpider(t);
  const mole = isMole(t);
  const [px, py] = spider ? (cannon ? SPIDER_RACK_PIVOT : SPIDER_LASER_PIVOT) : mole ? (cannon ? MOLE_PLASMA_PIVOT : MOLE_SMG_PIVOT) : cannon ? CANNON_PIVOT : SMG_PIVOT;
  // (A tarantula's rack and head, and a mole's flamethrower, all turn all the way round.)
  const a = cannon && !spider && !mole ? cannonAngle(t.faceLeft, aim, t.a) : aim;
  const len = (spider ? (cannon ? SPIDER_RACK_LEN : SPIDER_LASER_LEN) : mole && cannon ? MOLE_PLASMA_LEN : cannon ? CANNON_LEN : SMG_LEN) * (t.s ?? 1);
  const p = tankPoint(t, px, py, mzPt);
  out.x = p.x + Math.cos(a) * len;
  out.y = p.y + Math.sin(a) * len;
  out.a = a;
  return out;
}

let boxW = TANK_W;
let boxH = TANK_H;
/** Does the tank's box (the one being stepped: boxW x boxH) at (x, y) overlap terrain? */
function collides(t: Terrain, x: number, y: number): boolean {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  return t.rectSolid(ix, iy, ix + boxW - 1, iy + boxH - 1);
}

/**
 * One tick of motion. `buttons` are the driver's (ignored when empty).
 * Returns the downward speed it hit the ground with this tick (crushes, and
 * the parachute coming off), else 0.
 */
/** First solid row in column x from y0 down, within `depth` (else y0 + depth). */
function groundAt(t: Terrain, x: number, y0: number, depth: number): number {
  const ix = Math.floor(x);
  for (let y = Math.floor(y0); y < y0 + depth; y++) if (t.isSolid(ix, y)) return y;
  return y0 + depth;
}

/** Steepest tilt the treads settle to. */
const MAX_TILT = 1.15;
/** Tread suspension: stiffness and damping of the hull's settling onto the ground; in the air it levels out (leaning a touch into its motion). */
const TILT_K = 80;
const TILT_D = 11;
const AIR_K = 14;
const AIR_D = 5;

export function stepTank(k: Tank, t: Terrain, dt: number, buttons: number): number {
  boxW = tankW(k);
  boxH = tankH(k);
  if (isSpider(k)) return stepSpider(k, t, dt, buttons);
  // A watchdog is lighter on its treads.
  const run = isDog(k) ? RUN * 1.25 : RUN;
  // Unstick: sand poured onto it, or it landed in a bunker's rubble.
  if (collides(t, k.x, k.y)) {
    for (let s = 1; s <= 16; s++) {
      if (!collides(t, k.x, k.y - s)) {
        k.y -= s;
        break;
      }
    }
  }
  const driven = k.pilot !== 255 && !k.chute ? buttons : 0;
  const dir = (driven & BTN_RIGHT ? 1 : 0) - (driven & BTN_LEFT ? 1 : 0);

  // Tread suspension: the hull settles onto the ground under its rear and
  // front treads (a damped spring, so it rocks a little); in the air it
  // drifts back level. Landings, recoil and blasts kick it (w).
  const sin0 = Math.sin(k.a);
  if (k.onGround) {
    const bottom = k.y + boxH;
    const gl = groundAt(t, k.x + CONTACT, bottom, 30);
    const gr = groundAt(t, k.x + boxW - CONTACT, bottom, 30);
    const target = Math.max(-MAX_TILT, Math.min(MAX_TILT, Math.atan2(gr - gl, boxW - 2 * CONTACT)));
    k.w += ((target - k.a) * TILT_K - k.w * TILT_D) * dt;
  } else {
    const lean = Math.max(-1, Math.min(1, k.vx / run)) * 0.12;
    k.w += ((lean - k.a) * AIR_K - k.w * AIR_D) * dt;
  }
  k.a += k.w * dt;
  if (k.a > 1.2) k.a = 1.2;
  else if (k.a < -1.2) k.a = -1.2;

  if (k.onGround) {
    const accel = GROUND_ACCEL * dt;
    // Uphill costs some speed, downhill gains a little (sin0 > 0: the right end is lower).
    const slope = Math.max(0.6, Math.min(1.25, 1 + 0.5 * sin0 * dir));
    const dv = dir * run * slope - k.vx;
    k.vx += dv > accel ? accel : dv < -accel ? -accel : dv;
  } else if (dir !== 0) {
    // In the air: steer with A/D (the jets' vectoring), up to a brisk drift.
    const accel = AIR_ACCEL * dt;
    const dv = dir * run * 1.1 - k.vx;
    k.vx += dv > accel ? accel : dv < -accel ? -accel : dv;
  } else k.vx *= 1 - Math.min(1, 0.8 * dt); // (coasting: air drag)
  // Left on a steep slope without throttle, it slides off.
  if (k.onGround && dir === 0 && Math.abs(k.a) > 0.7) k.vx += sin0 * GRAVITY * 0.5 * dt;
  k.jetting = false;
  if (driven & BTN_UP && k.fuel > 0) {
    // Lift jets push straight up, whatever the hull's tilt: steering is A/D's job.
    k.vy -= JET_ACCEL * dt;
    k.fuel = Math.max(0, k.fuel - FUEL_BURN * dt);
    k.jetting = true;
  } else if (k.onGround) k.fuel = Math.min(TANK_MAX_FUEL, k.fuel + FUEL_REGEN * dt);
  // Down: stand on the brakes in the air too (drop like the brick it is).
  if (driven & BTN_DOWN && !k.onGround) k.vy += GRAVITY * 0.6 * dt;
  k.vy += GRAVITY * dt;
  if (k.chute) {
    // Under the canopy: drag pulls the fall back to a gentle drift.
    k.vy = Math.min(k.vy, CHUTE_FALL);
    k.vx *= 1 - Math.min(1, 2 * dt);
  }
  if (k.vy > MAX_FALL) k.vy = MAX_FALL;
  if (k.vy < -MAX_RISE) k.vy = -MAX_RISE;

  // Horizontal sweep in <=1 cell steps. The treads climb whatever they can
  // get a grip on: any step up to TANK_STEP_UP per cell advanced (steep
  // hills, jagged rock, rubble), on the ground or just off it (a bump mid-climb).
  const gripping = k.onGround || collides(t, k.x, k.y + 3);
  const wasGround = k.onGround;
  let rem = k.vx * dt;
  while (rem !== 0) {
    const step = rem > 1 ? 1 : rem < -1 ? -1 : rem;
    const nx = k.x + step;
    if (!collides(t, nx, k.y)) k.x = nx;
    else {
      let climbed = false;
      if (gripping) {
        for (let s = 1; s <= TANK_STEP_UP; s++) {
          if (!collides(t, nx, k.y - s)) {
            k.x = nx;
            k.y -= s;
            climbed = true;
            // A big step is hard work: it costs some speed.
            if (s > 6) k.vx *= 0.94;
            break;
          }
        }
      }
      if (!climbed) {
        k.vx = 0;
        break;
      }
    }
    rem -= step;
  }
  // Rolling over a dip: the treads follow the ground down instead of hopping off it.
  if (wasGround && !k.jetting && k.vy >= 0 && !collides(t, k.x, k.y + 1)) {
    for (let s = 2; s <= SNAP_DOWN; s++) {
      if (collides(t, k.x, k.y + s)) {
        k.y += s - 1;
        break;
      }
    }
  }
  let impact = 0;
  rem = k.vy * dt;
  while (rem !== 0) {
    const step = rem > 1 ? 1 : rem < -1 ? -1 : rem;
    if (!collides(t, k.x, k.y + step)) {
      k.y += step;
      rem -= step;
    } else {
      if (step > 0) impact = k.vy;
      k.vy = 0;
      break;
    }
  }
  if (k.y < -400) {
    k.y = -400;
    if (k.vy < 0) k.vy = 0;
  }
  k.onGround = collides(t, k.x, k.y + 1);
  if (k.onGround && k.chute) k.chute = false; // touchdown: the canopy is cut away
  return impact;
}

/**
 * The tarantula's tick: it walks (no treads, no tilt: its legs keep the body
 * level), leaps and glides (SPIDER_JUMP), steps up over anything up to SPIDER_STEP_UP a cell, and
 * where a wall stops it, walks straight up it: pushing into a wall, or
 * holding up (W) with one alongside, it climbs (and holding down, climbs
 * down), gravity off while it clings; at the top its legs carry it over.
 */
function stepSpider(k: Tank, t: Terrain, dt: number, buttons: number): number {
  if (collides(t, k.x, k.y)) {
    for (let s = 1; s <= 24; s++) {
      if (!collides(t, k.x, k.y - s)) {
        k.y -= s;
        break;
      }
    }
  }
  k.a = 0;
  k.w = 0;
  k.jetting = false;
  const driven = k.pilot !== 255 && !k.chute ? buttons : 0;
  const dir = (driven & BTN_RIGHT ? 1 : 0) - (driven & BTN_LEFT ? 1 : 0);
  // A wall alongside (either side), and the one it's walking into.
  const wallR = collides(t, k.x + 1, k.y);
  const wallL = collides(t, k.x - 1, k.y);
  const into = (dir > 0 && wallR) || (dir < 0 && wallL);
  const cling = !k.chute && !k.onGround ? into || ((wallL || wallR) && (driven & (BTN_UP | BTN_DOWN)) !== 0) : into || ((wallL || wallR) && (driven & BTN_UP) !== 0);
  // The glide charge refills on the ground (and on a wall).
  if (k.onGround || cling) k.fuel = Math.min(100, k.fuel + SPIDER_GLIDE_REFILL * dt);
  // Leap: up (W) on the ground with no wall to climb.
  if (!cling && k.onGround && (driven & BTN_UP) !== 0) {
    k.vy = -SPIDER_JUMP;
    if (dir !== 0) k.vx = dir * Math.max(Math.abs(k.vx), SPIDER_LEAP_VX);
    k.onGround = false;
  }
  // Gliding: up held in the air, falling, with charge left.
  const glide = !cling && !k.onGround && !k.chute && (driven & BTN_UP) !== 0 && k.vy > 0 && k.fuel > 0;
  const accel = (k.onGround || cling ? GROUND_ACCEL : AIR_ACCEL) * dt;
  // (In the air it keeps the way it was going; gliding, it steers out wider than it walks.)
  const run = glide ? SPIDER_GLIDE_RUN : SPIDER_RUN;
  const dv = dir * run - k.vx;
  if (k.onGround || cling || dir !== 0) k.vx += dv > accel ? accel : dv < -accel ? -accel : dv;
  if (cling) {
    // Up the wall (down it, holding down), at a steady crawl.
    const up = into || (driven & BTN_UP) !== 0;
    k.vy = up ? -SPIDER_CLIMB : driven & BTN_DOWN ? SPIDER_CLIMB : 0;
  } else {
    k.vy += GRAVITY * dt;
    if (glide) {
      k.vy -= SPIDER_GLIDE_THRUST * dt;
      if (k.vy > SPIDER_GLIDE_FALL) k.vy = Math.max(SPIDER_GLIDE_FALL, k.vy - GRAVITY * 2 * dt);
      k.fuel = Math.max(0, k.fuel - SPIDER_GLIDE_BURN * dt);
      k.jetting = true;
    }
    if (k.chute) {
      k.vy = Math.min(k.vy, CHUTE_FALL);
      k.vx *= 1 - Math.min(1, 2 * dt);
    }
  }
  if (k.vy > MAX_FALL) k.vy = MAX_FALL;
  // Across, a cell at a time, stepping up what its legs can reach (all of
  // it, on a wall: that's how it gets over the top).
  const gripping = k.onGround || cling || collides(t, k.x, k.y + 3);
  const wasGround = k.onGround;
  let rem = k.vx * dt;
  while (rem !== 0) {
    const step = rem > 1 ? 1 : rem < -1 ? -1 : rem;
    const nx = k.x + step;
    if (!collides(t, nx, k.y)) k.x = nx;
    else {
      let climbed = false;
      if (gripping) {
        for (let s = 1; s <= SPIDER_STEP_UP; s++) {
          if (!collides(t, nx, k.y - s)) {
            k.x = nx;
            k.y -= s;
            climbed = true;
            break;
          }
        }
      }
      if (!climbed) {
        // (Held against the wall: it climbs it next tick.)
        k.vx = 0;
        break;
      }
    }
    rem -= step;
  }
  if (wasGround && !cling && k.vy >= 0 && !collides(t, k.x, k.y + 1)) {
    for (let s = 2; s <= SNAP_DOWN; s++) {
      if (collides(t, k.x, k.y + s)) {
        k.y += s - 1;
        break;
      }
    }
  }
  let impact = 0;
  rem = k.vy * dt;
  while (rem !== 0) {
    const step = rem > 1 ? 1 : rem < -1 ? -1 : rem;
    if (!collides(t, k.x, k.y + step)) {
      k.y += step;
      rem -= step;
    } else {
      if (step > 0) impact = k.vy;
      k.vy = 0;
      break;
    }
  }
  if (k.y < -400) {
    k.y = -400;
    if (k.vy < 0) k.vy = 0;
  }
  k.onGround = collides(t, k.x, k.y + 1);
  if (k.onGround && k.chute) k.chute = false;
  return impact;
}

/** Copy every field stepTank reads or writes (prediction rebasing). */
export function copyTankMotion(dst: Tank, src: Tank): void {
  dst.x = src.x;
  dst.y = src.y;
  dst.vx = src.vx;
  dst.vy = src.vy;
  dst.fuel = src.fuel;
  dst.onGround = src.onGround;
  dst.jetting = src.jetting;
  dst.chute = src.chute;
  dst.pilot = src.pilot;
  dst.parts = src.parts;
  dst.a = src.a;
  dst.w = src.w;
  dst.s = src.s;
  dst.owner = src.owner;
  dst.kind = src.kind;
}
