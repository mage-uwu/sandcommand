import { BTN_RELOAD, BTN_SCOPE, BTN_UP } from '../shared/actor.ts';
import { AIM_FIRE_AT, STICK_R, TAP_MOVE, TAP_MS, stickButtons } from './stick.ts';
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
 * - a floating move stick in the bottom-left corner: run left/right, push
 *   up to jump and jetpack, down to crouch (and, piloting a rocket, steer,
 *   burn and cut the engine);
 * - a floating aim stick anywhere else: put a thumb down and drag; the
 *   clone aims along the drag, and pushed past halfway it fires (semi-auto
 *   weapons keep firing as fast as they cycle). Aim assist settles the aim
 *   on an enemy in sight near the line;
 * - a quick tap there instead shoots once at that spot (with the
 *   materializer out it builds there, taps on its menu pick the piece, and
 *   out of the wave a tap watches the next clone); a finger held still
 *   fires at that spot until lifted;
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
  /** What the finger on the aim side turned out to be: still deciding, a drag (stick), or a hold on a spot. */
  private aimMode: 'pending' | 'stick' | 'hold' = 'pending';
  private aimX0 = 0;
  private aimY0 = 0;
  private aimT0 = 0;
  private holdTimer = 0;
  private readonly aimBase: HTMLDivElement;
  private readonly aimKnob: HTMLDivElement;
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
      <div class="aim-base"><div class="aim-knob"></div><span>AIM</span></div>
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
    this.aimBase = root.querySelector('.aim-base') as HTMLDivElement;
    this.aimKnob = root.querySelector('.aim-knob') as HTMLDivElement;

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
        // Tap, drag or hold? Decide as the finger moves (or doesn't).
        this.aimId = e.pointerId;
        this.aimMode = 'pending';
        this.aimX0 = e.clientX;
        this.aimY0 = e.clientY;
        this.aimT0 = performance.now();
        clearTimeout(this.holdTimer);
        const id = e.pointerId;
        this.holdTimer = setTimeout(() => {
          if (this.aimId !== id || this.aimMode !== 'pending') return;
          this.aimMode = 'hold';
          input.touchAim(this.aimX0, this.aimY0, true);
          input.pointAssist = true;
        }, TAP_MS) as unknown as number;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.moveStick(e.clientX, e.clientY);
      else if (e.pointerId === this.aimId) {
        if (this.aimMode === 'pending' && Math.hypot(e.clientX - this.aimX0, e.clientY - this.aimY0) > TAP_MOVE) {
          this.aimMode = 'stick';
          this.aimBase.style.left = `${this.aimX0}px`;
          this.aimBase.style.top = `${this.aimY0}px`;
          this.aimBase.classList.add('active');
        }
        if (this.aimMode === 'stick') this.moveAim(e.clientX, e.clientY);
        else if (this.aimMode === 'hold') input.touchAim(e.clientX, e.clientY, false);
      }
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
        clearTimeout(this.holdTimer);
        if (this.aimMode === 'pending' && performance.now() - this.aimT0 < TAP_MS * 2) input.touchTap(this.aimX0, this.aimY0);
        else if (this.aimMode === 'hold') input.touchRelease();
        this.endAim();
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    addEventListener('blur', () => {
      this.endAim();
      input.touchRelease();
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

  private moveAim(x: number, y: number): void {
    let dx = (x - this.aimX0) / STICK_R;
    let dy = (y - this.aimY0) / STICK_R;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    const fire = m >= AIM_FIRE_AT;
    this.aimKnob.style.transform = `translate(${dx * STICK_R}px, ${dy * STICK_R}px)`;
    this.aimBase.classList.toggle('firing', fire);
    this.input.aimStick = { dx, dy, fire };
  }

  private endAim(): void {
    this.input.aimStick = null;
    this.aimMode = 'pending';
    this.aimBase.classList.remove('active', 'firing');
    this.aimBase.style.left = '';
    this.aimBase.style.top = '';
    this.aimKnob.style.transform = '';
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
          // In a tank it's the cannon trigger (held); on foot it toggles the scope.
          if (this.input.driving) {
            this.held |= BTN_SCOPE;
            this.sync();
          } else {
            this.input.touchScope = !this.input.touchScope;
            b.classList.toggle('on', this.input.touchScope);
          }
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
      if (act === 'scope' && this.held & BTN_SCOPE) {
        this.held &= ~BTN_SCOPE;
        this.sync();
      }
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
