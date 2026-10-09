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
  it('arrows pick an aim direction (eight ways) instead of moving the clone, and it holds', () => {
    const input = new InputState(target);
    fire(tgt, 'mousemove', { clientX: 500, clientY: 300 });
    key('keydown', 'ArrowLeft');
    expect(input.buttons() & BTN_LEFT).toBe(0);
    input.stepKeyAim(1 / 30, 400, 300, 1000, 600);
    expect(input.keyAim).toBe(true);
    expect(input.keyDir).toEqual({ x: -1, y: 0 });
    expect(input.mouseX).toBeLessThan(400); // out along the direction
    expect(input.mouseY).toBe(300);
    // Diagonal.
    key('keydown', 'ArrowUp');
    input.stepKeyAim(1 / 30, 400, 300, 1000, 600);
    expect(input.keyDir!.x).toBeCloseTo(-Math.SQRT1_2);
    expect(input.keyDir!.y).toBeCloseTo(-Math.SQRT1_2);
    // Let go: the direction holds, following the clone.
    key('keyup', 'ArrowLeft');
    key('keyup', 'ArrowUp');
    input.stepKeyAim(1 / 30, 450, 320, 1000, 600);
    expect(input.keyDir!.x).toBeCloseTo(-Math.SQRT1_2);
    expect(input.mouseX).toBeLessThan(450);
    expect(input.mouseY).toBeLessThan(320);
    // The mouse takes aim back.
    fire(tgt, 'mousemove', { clientX: 10, clientY: 10 });
    expect(input.keyAim).toBe(false);
    expect(input.keyDir).toBeNull();
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
