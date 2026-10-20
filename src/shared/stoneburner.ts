import { TICK_RATE } from './constants.ts';

/**
 * The **Stoneburner**: an orbital strike called down on a sticky beacon.
 *
 * Thrown like a grenade (single use: it leaves the inventory as it goes),
 * the beacon sticks to whatever it hits first (the ground, a wall, a clone,
 * a vehicle) and counts down BURNER_FUSE ticks, beeping, its light
 * blinking faster and faster (`blinkOn`). Then a missile drops out of orbit
 * onto it, far faster than anything else in the game (BURNER_STRIKE ticks
 * from the top of the sky), and the world goes white.
 *
 * - **Close in** (STONE_KILL_R): nothing lives.
 * - **Out to STONE_HEAT_R**: the flash and the blast wave, falling off with
 *   range, and much less behind solid ground (the heat comes in a straight
 *   line; the blast shoves everyone, cover or not).
 * - **The crater** (STONE_CRATER_R, the hardest rock included out to
 *   STONE_CORE_R), and a pool of caustic molten sludge at its bottom (the
 *   "foot"): it flows like wet sand and eats away the ground it touches
 *   for up to FOOT_LIFE ticks, searing whoever goes near it, then sets as
 *   slag.
 *
 * Everyone in the room sees it: the flash, the shaking, the fireball dome
 * over the site (World broadcasts it; the client draws it all from that).
 */

/** The countdown on the beacon: 15 s. */
export const BURNER_FUSE = 15 * TICK_RATE;
/** The missile's fall from orbit (ticks: a third of a second). */
export const BURNER_STRIKE = 10;
/** How far up the missile starts (cells over the beacon), and so its speed. */
export const STRIKE_HEIGHT = 2400;
/** Thrown: how hard (cells/s), and how far its sticky face reaches (cells). */
export const BURNER_THROW = 300;
export const BURNER_STICK_R = 2;
/**
 * The initial flash: certain death out to here (cells), for everyone, any
 * side, the thrower too (only deep behind solid ground in the outer part of
 * it is there a chance). Then the heat and blast falling off out to
 * STONE_HEAT_R.
 */
export const STONE_KILL_R = 340;
export const STONE_HEAT_R = 700;
/** Behind solid ground, this share of the heat gets through (and in the inner part of the kill zone, cover is no help at all). */
export const STONE_COVER = 0.3;
/** Within this share of STONE_KILL_R, nothing shields you. */
export const STONE_NO_COVER = 0.6;
/** The blast's shove on clones (cells/s at ground zero, falling off out to STONE_PUSH_R). */
export const STONE_PUSH = 1100;
export const STONE_PUSH_R = 800;
/** The crater (cells), and the core of it that takes even bedrock-hard material. */
export const STONE_CRATER_R = 105;
export const STONE_CORE_R = 72;
/** Damage dealt at ground zero to creatures and vehicles (falling off with range: still enough to wreck a tank most of the way out). */
export const STONE_HARM = 40000;
export const STONE_HARM_R = 560;
/**
 * The molten sludge left in the crater: SLUDGE_BLOBS blobs of caustic,
 * glowing slag, each SLUDGE_R cells round. They flow like wet sand
 * (falling, sliding down any slope, spreading out to pool in the low
 * places), and eat away whatever ground they touch, hard rock and all,
 * so they sink and seep through it. They burn up to FOOT_LIFE ticks
 * (40 s; each a little less or more), eating slower as they cool, then set
 * as glassy slag.
 */
export const FOOT_LIFE = 40 * TICK_RATE;
export const SLUDGE_BLOBS = 44;
export const SLUDGE_R = 3;
/** How many ticks between a hot blob's bites of the ground it touches (cooling, it bites less often). */
export const SLUDGE_BITE = 5;
/** How long a strike's aftermath shows on clients (ms): the fireball's few seconds, then the plume of smoke off the molten core, as long as it burns. */
export const CLOUD_MS = 40_000;

/**
 * The beacon's light at `left` ticks to go: on or off this tick. It blinks
 * once a second at first and faster and faster, until it's near enough
 * solid in the last second.
 */
export function blinkPeriod(left: number): number {
  const f = Math.max(0, Math.min(1, left / BURNER_FUSE));
  return Math.max(3, Math.round(3 + 27 * f * f));
}
export function blinkOn(left: number): boolean {
  const p = blinkPeriod(left);
  return left % p < Math.max(1, p >> 2);
}
/** Is this the tick its light comes on (when it beeps)? */
export function beepAt(left: number): boolean {
  return left % blinkPeriod(left) === 0;
}

/** A beacon's state: in the air, stuck fast (counting down), or the missile on its way down. */
export const BurnerPhase = {
  Flying: 0,
  Stuck: 1,
  Strike: 2,
} as const;
