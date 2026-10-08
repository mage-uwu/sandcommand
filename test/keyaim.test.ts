import { describe, expect, it } from 'vitest';
import { BTN_FIRE, BTN_LEFT, BTN_SCOPE } from '../src/shared/actor.ts';

type L = (e: Record<string, unknown>) => void;
const win: Record<string, L[]> = {};
const tgt: Record<string, L[]> = {};
(globalThis as Record<string, unknown>).addEventListener = (t: string, f: L) => (win[t] ??= []).push(f);
const target = { addEventListener: (t: string, f: L) => (tgt[t] ??= []).push(f) } as unknown as HTMLElement;
const fire = (m: Record<string, L[]>, t: string, e: Record<string, unknown>) => {
  for (const f of m[t] ?? []) f({ preventDefault() {}, repeat: false, ...e });
};
const key = (type: 'keydown' | 'keyup', code: string) => fire(win, type, { code });

const { InputState } = await import('../src/client/input.ts');

describe('keyboard-only aim', () => {
  it('arrows steer the reticle around the clone instead of moving it', () => {
    const input = new InputState(target);
    fire(tgt, 'mousemove', { clientX: 500, clientY: 300 });
    key('keydown', 'ArrowLeft');
    expect(input.buttons() & BTN_LEFT).toBe(0);
    input.stepKeyAim(1 / 30, 400, 300, 1000, 600);
    expect(input.keyAim).toBe(true);
    expect(input.mouseX).toBeLessThan(500);
    // It keeps its offset from the clone as the clone moves.
    key('keyup', 'ArrowLeft');
    const off = input.mouseX - 400;
    input.stepKeyAim(1 / 30, 450, 320, 1000, 600);
    expect(input.mouseX - 450).toBeCloseTo(off);
    expect(input.mouseY).toBe(320);
    // Held longer, it speeds up; it never leaves the screen.
    key('keydown', 'ArrowUp');
    const ys: number[] = [];
    for (let k = 0; k < 60; k++) {
      input.stepKeyAim(1 / 30, 450, 320, 1000, 600);
      ys.push(input.mouseY);
    }
    expect(ys[1] - ys[2]).toBeLessThan(ys[8] - ys[9]);
    expect(input.mouseY).toBeGreaterThanOrEqual(4);
    key('keyup', 'ArrowUp');
    // The mouse takes aim back.
    fire(tgt, 'mousemove', { clientX: 10, clientY: 10 });
    expect(input.keyAim).toBe(false);
  });

  it('left shift scopes, right shift fires (and clicks)', () => {
    const input = new InputState(target);
    key('keydown', 'ShiftLeft');
    expect(input.buttons() & BTN_SCOPE).toBe(BTN_SCOPE);
    expect(input.buttons() & BTN_FIRE).toBe(0);
    key('keyup', 'ShiftLeft');
    key('keydown', 'ShiftRight');
    expect(input.buttons() & BTN_FIRE).toBe(BTN_FIRE);
    expect(input.buttons() & BTN_SCOPE).toBe(0);
    expect(input.takeClick()).toBe(true);
    key('keyup', 'ShiftRight');
    expect(input.buttons() & BTN_FIRE).toBe(0);
  });
});
