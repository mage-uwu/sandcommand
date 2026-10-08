import { BTN_DOWN, BTN_FIRE, BTN_LEFT, BTN_RELOAD, BTN_RIGHT, BTN_SCOPE, BTN_UP } from '../shared/actor.ts';
import { WEAPONS } from '../shared/weapons.ts';

export class InputState {
  private keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  /** Right mouse held: aiming down the scope. */
  scopeDown = false;
  weapon = 0;
  scoreboard = false;
  /** True while the chat box has focus; game keys are ignored. */
  typing = false;
  onChatKey: (() => void) | null = null;

  constructor(target: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (this.typing) return;
      if (e.code === 'Tab') {
        this.scoreboard = true;
        e.preventDefault();
        return;
      }
      if (e.code === 'Enter' || e.code === 'KeyT') {
        this.onChatKey?.();
        e.preventDefault();
        return;
      }
      if (/^Digit[1-9]$/.test(e.code)) {
        const n = Number(e.code.slice(5)) - 1;
        if (n < WEAPONS.length) this.weapon = n;
      }
      if (e.code === 'KeyQ') this.weapon = (this.weapon + WEAPONS.length - 1) % WEAPONS.length;
      if (e.code === 'KeyE') this.weapon = (this.weapon + 1) % WEAPONS.length;
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'Tab') this.scoreboard = false;
      this.keys.delete(e.code);
    });
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.scopeDown = false;
    });
    target.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    target.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.scopeDown = true;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.scopeDown = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener(
      'wheel',
      (e) => {
        const d = Math.sign(e.deltaY);
        this.weapon = (this.weapon + d + WEAPONS.length) % WEAPONS.length;
        e.preventDefault();
      },
      { passive: false },
    );
  }

  private down(...codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** Aiming down the scope (right mouse or Shift). */
  get scoping(): boolean {
    return !this.typing && (this.scopeDown || this.down('ShiftLeft', 'ShiftRight'));
  }

  buttons(): number {
    if (this.typing) return 0;
    return (
      (this.down('KeyA', 'ArrowLeft') ? BTN_LEFT : 0) |
      (this.down('KeyD', 'ArrowRight') ? BTN_RIGHT : 0) |
      (this.down('KeyW', 'ArrowUp', 'Space') ? BTN_UP : 0) |
      (this.down('KeyS', 'ArrowDown') ? BTN_DOWN : 0) |
      (this.mouseDown ? BTN_FIRE : 0) |
      (this.scoping ? BTN_SCOPE : 0) |
      (this.down('KeyR') ? BTN_RELOAD : 0)
    );
  }
}
