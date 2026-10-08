import { describe, expect, it } from 'vitest';
import { BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP } from '../src/shared/actor.ts';
import { stickButtons } from '../src/client/stick.ts';
import { assistAim } from '../src/client/aim.ts';

describe('touch joystick', () => {
  it('maps deflection to run, jet and crouch, with a dead zone', () => {
    expect(stickButtons(0, 0)).toBe(0);
    expect(stickButtons(0.2, -0.3)).toBe(0); // resting thumb drift
    expect(stickButtons(1, 0)).toBe(BTN_RIGHT);
    expect(stickButtons(-1, 0)).toBe(BTN_LEFT);
    expect(stickButtons(0, -1)).toBe(BTN_UP);
    expect(stickButtons(0.7, -0.7)).toBe(BTN_RIGHT | BTN_UP); // jet diagonally
    expect(stickButtons(0, 1)).toBe(BTN_DOWN);
  });
});

describe('touch aim assist', () => {
  const open = () => true;
  it('settles the aim on an enemy near the line, in range and in sight', () => {
    const a = assistAim(0, 0, 0.1, [{ x: 200, y: 0 }], open);
    expect(a).toBeCloseTo(0, 5);
  });
  it('leaves the aim alone when nothing is near the line, too far, or behind a wall', () => {
    expect(assistAim(0, 0, 0, [{ x: 0, y: 200 }], open)).toBe(0); // 90 degrees off
    expect(assistAim(0, 0, 0, [{ x: 900, y: 0 }], open)).toBe(0); // out of range
    expect(assistAim(0, 0, 0.1, [{ x: 200, y: 0 }], () => false)).toBe(0.1); // no line of sight
  });
  it('reaches further when asked (mouse aim reaches as far as the pointer)', () => {
    expect(assistAim(0, 0, 0.05, [{ x: 800, y: 0 }], open)).toBe(0.05);
    expect(assistAim(0, 0, 0.05, [{ x: 800, y: 0 }], open, 900)).toBeCloseTo(0, 5);
  });
  it('prefers the target closest to the aim line', () => {
    const a = assistAim(0, 0, 0, [
      { x: 200, y: 30 },
      { x: 200, y: -8 },
    ], open);
    expect(a).toBeCloseTo(Math.atan2(-8, 200), 5);
  });
});
