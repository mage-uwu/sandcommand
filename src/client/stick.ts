import { BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP } from '../shared/actor.ts';
import { PROJ_LASER } from '../shared/weapons.ts';

/** Joystick throw (CSS px) that counts as full deflection. */
export const STICK_R = 56;
/** Deflection (0..1) past which the stick counts as a direction. */
const DEAD_X = 0.3;
const UP_AT = 0.5;
const DOWN_AT = 0.6;
/** Aim stick deflection at which it starts firing. */
export const AIM_FIRE_AT = 0.5;
/** A finger on the aim side that moves less than this (CSS px)... */
export const TAP_MOVE = 14;
/** ...and lifts within twice this long is a tap; held still this long, it fires at its spot (ms). */
export const TAP_MS = 220;

/** Joystick buttons for a deflection (dx, dy in -1..1, screen axes). */
export function stickButtons(dx: number, dy: number): number {
  return (dx < -DEAD_X ? BTN_LEFT : 0) | (dx > DEAD_X ? BTN_RIGHT : 0) | (dy < -UP_AT ? BTN_UP : 0) | (dy > DOWN_AT ? BTN_DOWN : 0);
}

/**
 * Does a held touch trigger pulse (fire on alternate ticks) with this
 * weapon? A thumb can't click a semi-automatic as fast as it cycles, so for
 * those a held finger pulses and the gun keeps going. Not for automatics
 * (they fire held anyway), and never for weapons you charge by holding (the
 * laser): there a held finger is the charge, and a pulse would cut it off.
 */
export function touchPulses(def: { auto: boolean; proj: number } | undefined): boolean {
  return !!def && !def.auto && def.proj !== PROJ_LASER;
}
