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
} as const;
export const PART_COUNT = 9;
export const ALL_PARTS = (1 << PART_COUNT) - 1;

export interface PartDef {
  name: string;
  integrity: number; // energy needed to penetrate
  limit: number; // wound points before the part is torn off
  flesh: boolean; // wounds also cost the clone HP
  vital: boolean; // losing it kills
  armorOf: number; // base part this armour covers, or -1
  /** Region in hitbox-local cells for a right-facing clone (inclusive). */
  rx0: number;
  ry0: number;
  rx1: number;
  ry1: number;
}

export const PARTS: readonly PartDef[] = [
  { name: 'head', integrity: 25, limit: 30, flesh: true, vital: true, armorOf: -1, rx0: 1, ry0: 0, rx1: 6, ry1: 2 },
  { name: 'torso', integrity: 40, limit: 75, flesh: true, vital: true, armorOf: -1, rx0: 2, ry0: 3, rx1: 7, ry1: 8 },
  { name: 'gun arm', integrity: 30, limit: 22, flesh: true, vital: false, armorOf: -1, rx0: 6, ry0: 3, rx1: 7, ry1: 6 },
  { name: 'off arm', integrity: 30, limit: 22, flesh: true, vital: false, armorOf: -1, rx0: 2, ry0: 4, rx1: 3, ry1: 7 },
  { name: 'leg', integrity: 30, limit: 26, flesh: true, vital: false, armorOf: -1, rx0: 0, ry0: 9, rx1: 3, ry1: 13 },
  { name: 'leg', integrity: 30, limit: 26, flesh: true, vital: false, armorOf: -1, rx0: 4, ry0: 9, rx1: 7, ry1: 13 },
  { name: 'helmet', integrity: 140, limit: 45, flesh: false, vital: false, armorOf: Part.Head, rx0: 1, ry0: 0, rx1: 6, ry1: 2 },
  { name: 'vest', integrity: 160, limit: 60, flesh: false, vital: false, armorOf: Part.Torso, rx0: 3, ry0: 3, rx1: 7, ry1: 8 },
  { name: 'jetpack', integrity: 120, limit: 35, flesh: false, vital: false, armorOf: -1, rx0: 0, ry0: 3, rx1: 1, ry1: 7 },
];

/** Base parts in hit-test priority order (small/outer regions first). */
const HIT_ORDER = [Part.Head, Part.GunArm, Part.OffArm, Part.Jetpack, Part.LegF, Part.LegB, Part.Torso];
/** Armour covering each base part (-1 none). */
const ARMOR_OVER = new Int8Array(PART_COUNT).fill(-1);
for (let p = 0; p < PART_COUNT; p++) if (PARTS[p].armorOf >= 0) ARMOR_OVER[PARTS[p].armorOf] = p;

const BLUNT = 0.03; // HP per unit of energy stopped by a layer
export const BLEED_PER_STUMP = 1.2; // HP per second per missing limb

export const has = (mask: number, part: number) => (mask & (1 << part)) !== 0;

/** Which base part is at a hitbox-local point (lx, ly) for a clone facing `left`. */
export function partAt(mask: number, lx: number, ly: number, left: boolean): number {
  let x = Math.max(0, Math.min(ACTOR_W - 1, Math.floor(lx)));
  const y = Math.max(0, Math.min(ACTOR_H - 1, Math.floor(ly)));
  if (left) x = ACTOR_W - 1 - x;
  for (const p of HIT_ORDER) {
    if (!has(mask, p)) continue;
    const d = PARTS[p];
    if (x >= d.rx0 && x <= d.rx1 && y >= d.ry0 && y <= d.ry1) return p;
  }
  return Part.Torso;
}

export interface BodyState {
  mask: number; // attached parts
  readonly wounds: Float32Array; // per part
}

export function newBodyState(): BodyState {
  return { mask: ALL_PARTS, wounds: new Float32Array(PART_COUNT) };
}

export function resetBody(s: BodyState): void {
  s.mask = ALL_PARTS;
  s.wounds.fill(0);
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
  s.wounds[layer] += amount;
  if (PARTS[layer].flesh) out.hp += amount;
  if (s.wounds[layer] >= PARTS[layer].limit && has(s.mask, layer)) {
    s.mask &= ~(1 << layer);
    out.detached.push(layer);
    if (PARTS[layer].vital) out.vital = true;
    // A torn-off limb takes its armour with it.
    const armor = ARMOR_OVER[layer];
    if (armor >= 0 && has(s.mask, armor)) {
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
  const armor = ARMOR_OVER[part];
  const layers = armor >= 0 && has(s.mask, armor) ? [armor, part] : [part];
  for (const layer of layers) {
    const integ = PARTS[layer].integrity;
    if (energy <= integ) {
      out.hp += energy * BLUNT; // stopped here: a bruise
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
  const armor = ARMOR_OVER[part];
  woundLayer(s, armor >= 0 && has(s.mask, armor) ? armor : part, amount, out);
}

/** What a body can still do. Shared by server simulation and client prediction. */
export interface Mobility {
  legs: number; // 0..2
  jet: boolean;
  canFire: boolean;
  oneHanded: boolean;
}

export function mobility(mask: number, out: Mobility): Mobility {
  out.legs = (has(mask, Part.LegB) ? 1 : 0) + (has(mask, Part.LegF) ? 1 : 0);
  out.jet = has(mask, Part.Jetpack);
  out.canFire = has(mask, Part.GunArm);
  out.oneHanded = !has(mask, Part.OffArm);
  return out;
}

/** Missing limbs (arms, legs) that bleed. */
export function stumps(mask: number): number {
  let n = 0;
  for (const p of [Part.GunArm, Part.OffArm, Part.LegB, Part.LegF]) if (!has(mask, p)) n++;
  return n;
}

/** 0..100 health per part for the HUD (0 = gone). */
export function partHealth(s: BodyState, p: number): number {
  if (!has(s.mask, p)) return 0;
  return Math.max(1, Math.round(100 * (1 - s.wounds[p] / PARTS[p].limit)));
}
