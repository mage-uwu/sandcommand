import { FACTIONS } from './factions.ts';
import { ACTOR_H, ACTOR_W } from './constants.ts';

/**
 * Modular clone bodies, Cortex Command style. A clone is a set of parts, each
 * with a region of the 8x14 hitbox, a structural integrity and a wound limit.
 * Armour (helmet, vest) covers a base part and is struck first.
 *
 * Every hit, whatever caused it, carries an *energy* = mass x sharpness x
 * relative speed. Layer by layer:
 *   - energy above the layer's integrity penetrates: the layer takes a wound
 *     and the energy left over carries on to the layer beneath;
 *   - energy below it is stopped there and only bruises (a little HP).
 * A part whose wounds reach its limit is torn off. Losing the head or torso
 * kills; losing legs, arms or the jetpack cripples (see mobility()).
 *
 * Pure and shared so the server resolves hits authoritatively and tests can
 * exercise it directly.
 */
export const Part = {
  Head: 0,
  Torso: 1,
  GunArm: 2,
  OffArm: 3,
  LegB: 4, // back leg
  LegF: 5, // front leg
  Helmet: 6,
  Vest: 7,
  Jetpack: 8,
  /**
   * A king's crown, worn on the head in place of a helmet: armour that's
   * very hard to get through and slow to wear down. Blow it off and the
   * king's head is as soft as anyone's.
   */
  Crown: 9,
} as const;
export const PART_COUNT = 10;
/** A full standard body (the crown is extra, kings only). */
export const ALL_PARTS = (1 << Part.Crown) - 1;

export interface PartDef {
  name: string;
  integrity: number; // energy needed to penetrate
  limit: number; // wound points before the part is torn off
  flesh: boolean; // wounds also cost the clone HP
  vital: boolean; // losing it kills
  armorOf: number; // base part this armour covers, or -1
  /** Metal that still counts toward health: HP lost per wound point (a droid's chassis). */
  hpScale?: number;
  /** Region in hitbox-local cells for a right-facing clone (inclusive). */
  rx0: number;
  ry0: number;
  rx1: number;
  ry1: number;
}

export const PARTS: readonly PartDef[] = [
  { name: 'head', integrity: 25, limit: 30, flesh: true, vital: true, armorOf: -1, rx0: 1, ry0: 0, rx1: 6, ry1: 2 },
  { name: 'torso', integrity: 40, limit: 75, flesh: true, vital: true, armorOf: -1, rx0: 2, ry0: 3, rx1: 7, ry1: 8 },
  // Arms hold on twice as hard as they used to (limit 44): losing your gun arm should be rare.
  { name: 'gun arm', integrity: 30, limit: 44, flesh: true, vital: false, armorOf: -1, rx0: 6, ry0: 3, rx1: 7, ry1: 6 },
  { name: 'off arm', integrity: 30, limit: 44, flesh: true, vital: false, armorOf: -1, rx0: 2, ry0: 4, rx1: 3, ry1: 7 },
  { name: 'leg', integrity: 30, limit: 26, flesh: true, vital: false, armorOf: -1, rx0: 0, ry0: 9, rx1: 3, ry1: 13 },
  { name: 'leg', integrity: 30, limit: 26, flesh: true, vital: false, armorOf: -1, rx0: 4, ry0: 9, rx1: 7, ry1: 13 },
  { name: 'helmet', integrity: 140, limit: 45, flesh: false, vital: false, armorOf: Part.Head, rx0: 1, ry0: 0, rx1: 6, ry1: 2 },
  { name: 'vest', integrity: 160, limit: 60, flesh: false, vital: false, armorOf: Part.Torso, rx0: 3, ry0: 3, rx1: 7, ry1: 8 },
  { name: 'jetpack', integrity: 120, limit: 35, flesh: false, vital: false, armorOf: -1, rx0: 0, ry0: 3, rx1: 1, ry1: 7 },
  // Stops any small-arms round (even a sniper slug, on a heavy king); only blasts and big guns wear it down.
  { name: 'crown', integrity: 600, limit: 160, flesh: false, vital: false, armorOf: Part.Head, rx0: 1, ry0: 0, rx1: 6, ry1: 2 },
];

/**
 * The spider droid's parts. A droid uses the same ten part slots (and the
 * same mask bits on the wire) with its own meanings, so everything that
 * moves part masks around carries it unchanged: a turret on top (the head's
 * slot), a chassis (the torso's: vital), armour plating over the chassis
 * (the jetpack's slot), and six legs, three either side (the arms', legs',
 * helmet's and vest's slots). All metal, nothing bleeds; the chassis's
 * wounds are its health (`hpScale`). About a quarter of a tank, all told:
 * some 120 rifle rounds to the body.
 */
export const DroidPart = {
  Turret: 0,
  Chassis: 1,
  /** Back legs (outer to inner), then front legs (inner to outer): a droid facing right walks on L1 at the back, R1 at the front. */
  L1: 2,
  L2: 3,
  L3: 4,
  R3: 5,
  R2: 6,
  R1: 7,
  Plating: 8,
} as const;
export const DROID_LEGS: readonly number[] = [DroidPart.L1, DroidPart.L2, DroidPart.L3, DroidPart.R3, DroidPart.R2, DroidPart.R1];
const DROID_CHASSIS_LIMIT = 1700;
export const DROID_PARTS: readonly PartDef[] = [
  // The head: the turret up on its neck, the gun its face.
  { name: 'turret', integrity: 140, limit: 260, flesh: false, vital: false, armorOf: -1, rx0: 1, ry0: 0, rx1: 6, ry1: 5 },
  // The chassis, slung low (with the neck up to the head).
  { name: 'chassis', integrity: 120, limit: DROID_CHASSIS_LIMIT, flesh: false, vital: true, armorOf: -1, rx0: 0, ry0: 6, rx1: 7, ry1: 11, hpScale: 100 / DROID_CHASSIS_LIMIT },
  { name: 'leg', integrity: 110, limit: 170, flesh: false, vital: false, armorOf: -1, rx0: 0, ry0: 12, rx1: 0, ry1: 13 },
  { name: 'leg', integrity: 110, limit: 170, flesh: false, vital: false, armorOf: -1, rx0: 1, ry0: 12, rx1: 2, ry1: 13 },
  { name: 'leg', integrity: 110, limit: 170, flesh: false, vital: false, armorOf: -1, rx0: 3, ry0: 12, rx1: 3, ry1: 13 },
  { name: 'leg', integrity: 110, limit: 170, flesh: false, vital: false, armorOf: -1, rx0: 4, ry0: 12, rx1: 4, ry1: 13 },
  { name: 'leg', integrity: 110, limit: 170, flesh: false, vital: false, armorOf: -1, rx0: 5, ry0: 12, rx1: 6, ry1: 13 },
  { name: 'leg', integrity: 110, limit: 170, flesh: false, vital: false, armorOf: -1, rx0: 7, ry0: 12, rx1: 7, ry1: 13 },
  { name: 'plating', integrity: 240, limit: 520, flesh: false, vital: false, armorOf: DroidPart.Chassis, rx0: 0, ry0: 6, rx1: 7, ry1: 11 },
  { name: '-', integrity: 0, limit: 1, flesh: false, vital: false, armorOf: -1, rx0: -1, ry0: -1, rx1: -1, ry1: -1 },
];
/** A droid's full set of parts. */
export const DROID_MASK = (1 << 9) - 1;
const DROID_HIT_ORDER = [DroidPart.Turret, ...DROID_LEGS, DroidPart.Chassis];

/** The part table for a class (a droid's are its own). */
export function partsOf(cls: number): readonly PartDef[] {
  return cls === ClassId.Droid ? DROID_PARTS : PARTS;
}

/** A body's full set of parts, for its class (what "nothing missing" looks like). */
export function fullMask(cls: number): number {
  return cls === ClassId.Droid ? DROID_MASK : ALL_PARTS;
}

/** Base parts in hit-test priority order (small/outer regions first). */
const HIT_ORDER = [Part.Head, Part.GunArm, Part.OffArm, Part.Jetpack, Part.LegF, Part.LegB, Part.Torso];
/** Standard armour covering each base part (-1 none); the crown goes over the head on top of that. */
const ARMOR_OVER = new Int8Array(PART_COUNT).fill(-1);
for (let p = 0; p < PART_COUNT; p++) if (PARTS[p].armorOf >= 0 && p !== Part.Crown) ARMOR_OVER[PARTS[p].armorOf] = p;

/** The armour layer a hit on `part` meets first, if any is on (a crown before a helmet; a droid's plating over its chassis). */
function armorOn(mask: number, part: number, cls = -1): number {
  if (cls === ClassId.Droid) return part === DroidPart.Chassis && has(mask, DroidPart.Plating) ? DroidPart.Plating : -1;
  if (part === Part.Head && has(mask, Part.Crown)) return Part.Crown;
  const a = ARMOR_OVER[part];
  return a >= 0 && has(mask, a) ? a : -1;
}

const BLUNT = 0.03; // HP per unit of energy stopped by a layer
export const BLEED_PER_STUMP = 1.2; // HP per second per missing limb

export const has = (mask: number, part: number) => (mask & (1 << part)) !== 0;

/** Which base part is at a hitbox-local point (lx, ly) for a clone (of class `cls`) facing `left`. */
export function partAt(mask: number, lx: number, ly: number, left: boolean, cls = -1): number {
  let x = Math.max(0, Math.min(ACTOR_W - 1, Math.floor(lx)));
  const y = Math.max(0, Math.min(ACTOR_H - 1, Math.floor(ly)));
  if (left) x = ACTOR_W - 1 - x;
  const droid = cls === ClassId.Droid;
  const defs = droid ? DROID_PARTS : PARTS;
  for (const p of droid ? DROID_HIT_ORDER : HIT_ORDER) {
    if (!has(mask, p)) continue;
    const d = defs[p];
    if (x >= d.rx0 && x <= d.rx1 && y >= d.ry0 && y <= d.ry1) return p;
  }
  return Part.Torso; // (the chassis, for a droid)
}

/**
 * Clone classes. Every clone is one, rolled at spawn:
 * - Scout: a green army helmet and no vest. Lighter armour, but quicker
 *   on its feet and on its jetpack.
 * - Medium: the standard clone (helmet and vest).
 * - Heavy: a metal armour layer over everything. Armour is 3x as hard to
 *   get through and every part takes 2.5x the wounds; blasts and fire do
 *   0.4x. The price: a weak, thirsty jetpack and a slower run.
 */
export const ClassId = {
  Scout: 0,
  Medium: 1,
  Heavy: 2,
  /**
   * A spider droid: no clone at all, a gunmetal chassis on six tin legs with
   * one turret on top that takes any gun. Fast, and it climbs almost
   * anything (walls too); about a quarter of a tank's toughness, every leg
   * shot off one by one. No jetpack.
   */
  Droid: 3,
} as const;

export interface ClassDef {
  name: string;
  /** Integrity multiplier for armour layers (helmet, vest, jetpack). */
  armor: number;
  /** Wound-limit multiplier for every part. */
  limit: number;
  /** Multiplier on blast, fire and fall damage (harm). */
  harm: number;
  /** Movement: run speed, jetpack thrust, fuel use. */
  run: number;
  jet: number;
  fuel: number;
  /** Parts it spawns with. */
  mask: number;
  /** Climbs walls (anything its legs can reach): the spider droid. */
  climb?: boolean;
}

export const CLASSES: readonly ClassDef[] = [
  { name: 'Scout', armor: 0.7, limit: 1, harm: 1, run: 1.12, jet: 1.15, fuel: 0.8, mask: ALL_PARTS & ~(1 << Part.Vest) },
  { name: 'Medium', armor: 1, limit: 1, harm: 1, run: 1, jet: 1, fuel: 1, mask: ALL_PARTS },
  { name: 'Heavy', armor: 3, limit: 2.5, harm: 0.4, run: 0.85, jet: 0.6, fuel: 1.5, mask: ALL_PARTS },
  { name: 'Droid', armor: 1, limit: 1, harm: 1, run: 1.45, jet: 0, fuel: 1, mask: DROID_MASK, climb: true },
];

/** Roll a class for a fresh clone (semi-random: mediums are most common; a droid now and then). */
export function rollClass(r: number): number {
  return r < 0.33 ? ClassId.Scout : r < 0.71 ? ClassId.Medium : r < 0.93 ? ClassId.Heavy : ClassId.Droid;
}

export interface BodyState {
  mask: number; // attached parts
  readonly wounds: Float32Array; // per part
  cls: number; // ClassId
  faction: number; // factions.ts Faction
}

export function newBodyState(cls: number = ClassId.Medium): BodyState {
  return { mask: CLASSES[cls].mask, wounds: new Float32Array(PART_COUNT), cls, faction: 0 };
}

export function resetBody(s: BodyState, cls: number = ClassId.Medium, faction = s.faction): void {
  s.cls = cls;
  s.faction = faction;
  s.mask = CLASSES[cls].mask;
  s.wounds.fill(0);
}

/** A part's integrity for this body's class (armour layers scale with it). */
function integrityOf(s: BodyState, part: number): number {
  const d = partsOf(s.cls)[part];
  return d.flesh ? d.integrity : d.integrity * CLASSES[s.cls].armor * FACTIONS[s.faction].armor;
}

/** A part's wound limit for this body's class. */
export function limitOf(s: BodyState, part: number): number {
  return partsOf(s.cls)[part].limit * CLASSES[s.cls].limit * FACTIONS[s.faction].limit;
}

/** Result of one strike: HP lost, parts torn off (in order), whether a vital part went. */
export interface StrikeResult {
  hp: number;
  detached: number[];
  vital: boolean;
}

export function newStrike(): StrikeResult {
  return { hp: 0, detached: [], vital: false };
}

function woundLayer(s: BodyState, layer: number, amount: number, out: StrikeResult): void {
  const d = partsOf(s.cls)[layer];
  s.wounds[layer] += amount;
  if (d.flesh) out.hp += amount;
  else if (d.hpScale) out.hp += amount * d.hpScale;
  if (s.wounds[layer] >= limitOf(s, layer) && has(s.mask, layer)) {
    s.mask &= ~(1 << layer);
    out.detached.push(layer);
    if (d.vital) out.vital = true;
    // A torn-off limb takes its armour with it.
    for (let armor = armorOn(s.mask, layer, s.cls); armor >= 0; armor = armorOn(s.mask, layer, s.cls)) {
      s.mask &= ~(1 << armor);
      out.detached.push(armor);
    }
  }
}

/**
 * A penetrating strike (bullet, shrapnel, debris) on `part` carrying `energy`,
 * dealing `wound` points to each layer it gets through. Accumulates into out.
 */
export function strike(s: BodyState, part: number, energy: number, wound: number, out: StrikeResult): void {
  const armor = armorOn(s.mask, part, s.cls);
  const layers = armor >= 0 ? [armor, part] : [part];
  for (const layer of layers) {
    const integ = integrityOf(s, layer);
    if (energy <= integ) {
      out.hp += energy * BLUNT * CLASSES[s.cls].harm * FACTIONS[s.faction].harm; // stopped here: a bruise
      return;
    }
    woundLayer(s, layer, wound, out);
    energy -= integ;
  }
}

/**
 * Damage that does not need to penetrate (burns, blast overpressure, falls):
 * goes into the outermost layer covering `part`.
 */
export function harm(s: BodyState, part: number, amount: number, out: StrikeResult): void {
  if (!has(s.mask, part) || amount <= 0) return;
  const armor = armorOn(s.mask, part, s.cls);
  woundLayer(s, armor >= 0 ? armor : part, amount * CLASSES[s.cls].harm * FACTIONS[s.faction].harm, out);
}

/** What a body can still do. Shared by server simulation and client prediction. */
export interface Mobility {
  legs: number; // 0..2
  jet: boolean;
  canFire: boolean;
  oneHanded: boolean;
}

export function mobility(mask: number, out: Mobility, cls = -1): Mobility {
  if (cls === ClassId.Droid) {
    // Six legs: it scuttles on four or more, limps on two or three, drags itself on fewer.
    let n = 0;
    for (const l of DROID_LEGS) if (has(mask, l)) n++;
    out.legs = n >= 4 ? 2 : n >= 2 ? 1 : 0;
    out.jet = false;
    out.canFire = has(mask, DroidPart.Turret);
    out.oneHanded = false;
    return out;
  }
  out.legs = (has(mask, Part.LegB) ? 1 : 0) + (has(mask, Part.LegF) ? 1 : 0);
  out.jet = has(mask, Part.Jetpack);
  out.canFire = has(mask, Part.GunArm);
  out.oneHanded = !has(mask, Part.OffArm);
  return out;
}

/** Missing limbs (arms, legs) that bleed (a droid's don't). */
export function stumps(mask: number, cls = -1): number {
  if (cls === ClassId.Droid) return 0;
  let n = 0;
  for (const p of [Part.GunArm, Part.OffArm, Part.LegB, Part.LegF]) if (!has(mask, p)) n++;
  return n;
}

/** 0..100 health per part for the HUD (0 = gone). */
export function partHealth(s: BodyState, p: number): number {
  if (!has(s.mask, p)) return 0;
  return Math.max(1, Math.round(100 * (1 - s.wounds[p] / limitOf(s, p))));
}
