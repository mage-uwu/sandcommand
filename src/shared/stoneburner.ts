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
 *   STONE_CORE_R), and a core of molten rock at its bottom (the "foot"),
 *   which keeps burning its way down for up to FOOT_LIFE ticks, slower and
 *   slower as it smoulders out, searing whoever goes near it.
 *
 * Everyone in the room sees it: the flash, the shaking, the mushroom cloud
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
/** Certain death out to here (cells); heat and blast falling off out to STONE_HEAT_R. */
export const STONE_KILL_R = 150;
export const STONE_HEAT_R = 420;
/** Behind solid ground, this share of the heat gets through (and inside the crater's own reach, cover is no help). */
export const STONE_COVER = 0.3;
/** The blast's shove on clones (cells/s at ground zero, falling off out to STONE_PUSH_R). */
export const STONE_PUSH = 1100;
export const STONE_PUSH_R = 520;
/** The crater (cells), and the core of it that takes even bedrock-hard material. */
export const STONE_CRATER_R = 105;
export const STONE_CORE_R = 72;
/** Damage dealt at ground zero to creatures and vehicles (falling off with range). */
export const STONE_HARM = 6000;
export const STONE_HARM_R = 360;
/** The molten core: how long it burns (40 s), its bite (cells), and how fast it sinks at first (cells per tick). */
export const FOOT_LIFE = 40 * TICK_RATE;
export const FOOT_R = 9;
export const FOOT_SINK = 0.16;
/** How long the mushroom cloud hangs over the site (ms, on the client). */
export const CLOUD_MS = 70_000;

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

/** How fast the core sinks with `life` ticks left (it slows as it smoulders out). */
export function footSink(life: number): number {
  return FOOT_SINK * Math.max(0.15, life / FOOT_LIFE);
}

/** A beacon's state: in the air, stuck fast (counting down), or the missile on its way down. */
export const BurnerPhase = {
  Flying: 0,
  Stuck: 1,
  Strike: 2,
} as const;
