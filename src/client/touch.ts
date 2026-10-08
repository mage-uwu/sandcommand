import { BTN_RELOAD, BTN_UP } from '../shared/actor.ts';
import { STICK_R, stickButtons } from './stick.ts';
import type { InputState } from './input.ts';

export interface TouchHooks {
  chat(): void;
  /** Is there on-canvas UI (the build menu) under this CSS point? Taps there go to it, not the stick. */
  overUi(x: number, y: number): boolean;
}

/**
 * Phone and tablet controls, drawn over the canvas and feeding the same
 * InputState the keyboard and mouse do:
 *
 * - a floating joystick in the bottom-left corner: run left/right, push up
 *   to jump and jetpack, down to crouch (and, piloting a rocket, steer, burn
 *   and cut the engine);
 * - tap anywhere else to aim at that spot and shoot; hold to keep firing
 *   and drag to walk the aim (with the materializer out, a tap builds, and
 *   taps on its menu pick the piece; out of the wave, a tap watches the next
 *   clone);
 * - buttons down the right edge: swap weapon, pick up, drop, reload, scope,
 *   jet, scores and chat.
 *
 * They switch on by themselves the first time a finger touches the screen
 * (or straight away on a touch-first device).
 */
export class TouchControls {
  readonly root: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private stickId = -1;
  private stickX = 0;
  private stickY = 0;
  private aimId = -1;
  private stick = 0;
  private held = 0;
  enabled = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly input: InputState,
    private readonly hooks: TouchHooks,
  ) {
    const root = document.createElement('div');
    root.id = 'touch';
    root.className = 'hidden';
    root.innerHTML = `
      <div class="stick-zone"><div class="stick-base"><div class="stick-knob"></div></div></div>
      <div class="tbtns">
        <button data-act="swap" class="big">⇄<small>SWAP</small></button>
        <button data-act="jet" class="big">▲<small>JET</small></button>
        <button data-act="reload">↻<small>RELOAD</small></button>
        <button data-act="scope">◎<small>SCOPE</small></button>
        <button data-act="pick">⬆<small>PICK UP</small></button>
        <button data-act="drop">⬇<small>DROP</small></button>
      </div>
      <div class="ttop">
        <button data-act="scores">☰</button>
        <button data-act="chat">💬</button>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.base = root.querySelector('.stick-base') as HTMLDivElement;
    this.knob = root.querySelector('.stick-knob') as HTMLDivElement;

    for (const b of root.querySelectorAll<HTMLButtonElement>('button')) this.wireButton(b);

    // Fingers on the canvas: the stick (bottom-left) or aim-and-fire (anywhere else).
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      this.enable();
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      if (this.stickId < 0 && this.inStickZone(e.clientX, e.clientY) && !hooks.overUi(e.clientX, e.clientY)) {
        this.stickId = e.pointerId;
        this.stickX = e.clientX;
        this.stickY = e.clientY;
        this.base.style.left = `${e.clientX}px`;
        this.base.style.top = `${e.clientY}px`;
        this.base.classList.add('active');
        this.moveStick(e.clientX, e.clientY);
      } else if (this.aimId < 0) {
        this.aimId = e.pointerId;
        input.touchAim(e.clientX, e.clientY, true);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.moveStick(e.clientX, e.clientY);
      else if (e.pointerId === this.aimId) input.touchAim(e.clientX, e.clientY, false);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) {
        this.stickId = -1;
        this.stick = 0;
        this.base.classList.remove('active');
        this.base.style.left = '';
        this.base.style.top = '';
        this.knob.style.transform = '';
        this.sync();
      } else if (e.pointerId === this.aimId) {
        this.aimId = -1;
        input.touchRelease();
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    addEventListener('blur', () => {
      this.stickId = this.aimId = -1;
      this.stick = this.held = 0;
      this.sync();
    });

    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) this.enable();
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.input.touch = true;
    this.root.classList.remove('hidden');
    document.body.classList.add('touch');
  }

  /** Hide or show the controls (e.g. behind the join screen). */
  setVisible(on: boolean): void {
    this.root.classList.toggle('hidden', !on || !this.enabled);
  }

  private inStickZone(x: number, y: number): boolean {
    return x < Math.max(200, innerWidth * 0.3) && y > innerHeight - Math.max(220, innerHeight * 0.55);
  }

  private moveStick(x: number, y: number): void {
    let dx = (x - this.stickX) / STICK_R;
    let dy = (y - this.stickY) / STICK_R;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    this.knob.style.transform = `translate(${dx * STICK_R}px, ${dy * STICK_R}px)`;
    this.stick = stickButtons(dx, dy);
    this.sync();
  }

  private sync(): void {
    this.input.touchButtons = this.stick | this.held;
  }

  private wireButton(b: HTMLButtonElement): void {
    const act = b.dataset.act;
    const hold = act === 'jet' ? BTN_UP : act === 'reload' ? BTN_RELOAD : 0;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.setPointerCapture?.(e.pointerId);
      b.classList.add('down');
      switch (act) {
        case 'swap':
          this.input.cycleBy(1);
          break;
        case 'pick':
          this.input.pressPickup();
          break;
        case 'drop':
          this.input.pressDrop();
          break;
        case 'scope':
          this.input.touchScope = !this.input.touchScope;
          b.classList.toggle('on', this.input.touchScope);
          break;
        case 'scores':
          this.input.scoreboard = !this.input.scoreboard;
          b.classList.toggle('on', this.input.scoreboard);
          break;
        case 'chat':
          this.hooks.chat();
          break;
      }
      if (hold) {
        this.held |= hold;
        this.sync();
      }
    });
    const up = () => {
      b.classList.remove('down');
      if (hold) {
        this.held &= ~hold;
        this.sync();
      }
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
