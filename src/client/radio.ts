/**
 * The radio's selector: which line of its menu is highlighted. Three ways
 * to move it, and the latest wins:
 *
 * - **Hover** (the mouse over a line, or a finger tapping one): that line.
 * - **The wheel**: a line per notch.
 * - **The aim** (the mouse, the arrow keys or the right stick): its
 *   elevation picks the line, straight up the top one and straight down the
 *   bottom, top to bottom in between. Only a real swing of the aim moves it,
 *   so a line picked with the wheel stays put until the aim does.
 *
 * Firing (a click, the trigger, a tap) calls whatever's highlighted. No
 * DOM here: main.ts feeds it, tests drive it.
 */

/** How far (radians) the aim must swing before it takes the selection back from the wheel. */
const AIM_SWING = 0.12;

/** The line the aim's elevation points at, of `n`: straight up 0, straight down n - 1. */
export function lineFromAim(aim: number, n: number): number {
  if (n <= 1) return 0;
  const up = -Math.sin(aim); // 1 straight up (screen y grows down), -1 straight down
  return Math.max(0, Math.min(n - 1, Math.round(((1 - up) / 2) * (n - 1))));
}

export class RadioSelector {
  private aimAt = NaN;
  private wasFiring = false;

  /** The menu's gone (the radio put away): start afresh next time it's out. */
  reset(): void {
    this.aimAt = NaN;
    this.wasFiring = false;
  }

  /**
   * One tick with the radio out, over a menu of `n` lines: the new
   * selection from the old one, the aim, the line under the pointer (-1:
   * none) and the wheel's notches; and whether to call it now (the trigger
   * just went down).
   */
  update(sel: number, n: number, aim: number, hover: number, wheel: number, firing: boolean): { sel: number; call: boolean } {
    if (n <= 0) return { sel: 0, call: false };
    if (Number.isNaN(this.aimAt)) this.aimAt = aim; // (just out: the aim moves it only once it swings)
    let d = Math.abs(aim - this.aimAt);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d > AIM_SWING) {
      sel = lineFromAim(aim, n);
      this.aimAt = aim;
    }
    if (wheel) sel = (((sel + wheel) % n) + n) % n;
    if (hover >= 0) sel = hover;
    sel = Math.max(0, Math.min(n - 1, sel));
    const call = firing && !this.wasFiring;
    this.wasFiring = firing;
    return { sel, call };
  }
}
