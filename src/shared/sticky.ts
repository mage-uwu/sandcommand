import { TICK_RATE } from './constants.ts';

/**
 * The **sticky charge**: a single-use throwable (it leaves the inventory as
 * it goes) that sticks to whatever it hits first (a clone, a vehicle, a
 * creature, or the ground) and goes off STICKY_FUSE ticks later.
 *
 * It's a hard-target weapon, not a crowd-clearer:
 *
 * - **Close in** (STICKY_CORE_R): a shaped, concentrated blast, up to four
 *   times a hand grenade's (STICKY_CORE), falling off fast.
 * - **Further out**, to a grenade's radius: a little more than a grenade
 *   (PROJ's splash: 1.2 times), and its fragments are slow and fall short.
 * - **Whatever it's stuck to** takes the full charge besides: a big share of
 *   a vehicle's hull (STICKY_ON_VEHICLE), a heavy wound to a creature
 *   (STICKY_ON_BEAST) or a clone (STICKY_ON_CLONE).
 */

/** Ticks from sticking to going off: 6 s. */
export const STICKY_FUSE = 6 * TICK_RATE;
/** Never stuck to anything (thrown into the sky, rolling about): it goes off anyway this long after the throw. */
export const STICKY_MAX_FLIGHT = 10 * TICK_RATE;
/** Thrown: how hard (cells/s). */
export const STICKY_THROW = 320;
/** The concentrated core of the blast (cells), and its damage at the centre (four hand grenades). */
export const STICKY_CORE_R = 10;
export const STICKY_CORE = 360;
/** What it's stuck to takes besides: a share of a vehicle's full hull, a creature's wound, a clone's. */
export const STICKY_ON_VEHICLE = 0.45;
export const STICKY_ON_BEAST = 2400;
export const STICKY_ON_CLONE = 400;

/** The core's damage at `d` cells from it (0 outside STICKY_CORE_R). */
export const stickyCore = (d: number) => (d < STICKY_CORE_R ? STICKY_CORE * (1 - d / STICKY_CORE_R) : 0);

/**
 * A stuck charge's light and beep: how many ticks a blink takes with `fuse`
 * ticks to go: once a second at first, faster in the last three seconds,
 * frantic in the last.
 */
export const stickyBlink = (fuse: number) => (fuse > 3 * TICK_RATE ? TICK_RATE : fuse > TICK_RATE ? 10 : 4);
/** Does a stuck charge beep (its light comes on) at `fuse` ticks to go? */
export const stickyBeepAt = (fuse: number) => fuse > 0 && fuse % stickyBlink(fuse) === 0;
