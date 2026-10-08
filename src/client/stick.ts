import { BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP } from '../shared/actor.ts';

/** Joystick throw (CSS px) that counts as full deflection. */
export const STICK_R = 56;
/** Deflection (0..1) past which the stick counts as a direction. */
const DEAD_X = 0.3;
const UP_AT = 0.5;
const DOWN_AT = 0.6;

/** Joystick buttons for a deflection (dx, dy in -1..1, screen axes). */
export function stickButtons(dx: number, dy: number): number {
  return (dx < -DEAD_X ? BTN_LEFT : 0) | (dx > DEAD_X ? BTN_RIGHT : 0) | (dy < -UP_AT ? BTN_UP : 0) | (dy > DOWN_AT ? BTN_DOWN : 0);
}
