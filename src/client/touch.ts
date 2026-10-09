import { BTN_SCOPE } from '../shared/actor.ts';
import { STICK_R, TAP_MS, stickButtons } from './stick.ts';
import type { InputState } from './input.ts';

export interface TouchHooks {
  chat(): void;
  /** Is there on-canvas UI (the build or radio menu) under this CSS point? Taps there go to it. */
  overUi(x: number, y: number): boolean;
  /** Should taps on the right act on the spot touched (building, the radio menu up, spectating) rather than fire? */
  pointMode(): boolean;
}

/** Below this distance (CSS px) from the fire pad's centre, a touch keeps the last direction. */
const FIRE_DEAD = 18;

/**
 * Phone and tablet controls, drawn over the canvas and feeding the same
 * InputState the keyboard and mouse do. The screen splits down the middle:
 *
 * - **Left half: movement.** One big floating stick: put a thumb down
 *   anywhere on the left and drag. Left and right run, up jumps and
 *   jetpacks, down crouches (and, piloting a rocket, steers, burns and cuts
 *   the engine).
 * - **Right half: fire.** A fire pad centred on the middle of the right
 *   half (not on the clone): touch in the direction you want to shoot, and
 *   it fires that way for as long as the finger stays down, following it
 *   round; a quick tap gets a shot off that way. The aim assist snaps the
 *   direction onto any enemy within 90 degrees of it, so you only need to
 *   point roughly their way.
 * - **Three item buttons** (◀ previous, ▶ next, and pick up, held to drop),
 *   a **zoom** toggle (in a tank: the cannon), and scores and chat up top.
 *
 * With the materializer out, the radio menu up, or out of the wave
 * (spectating), a tap on the right acts on the spot touched instead: build
 * there, pick from the menu, watch the next clone.
 *
 * They switch on by themselves the first time a finger touches the screen
 * (or straight away on a touch-first device).
 */
export class TouchControls {
  readonly root: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly pad: HTMLDivElement;
  private readonly padKnob: HTMLDivElement;
  private stickId = -1;
  private stickX = 0;
  private stickY = 0;
  private fireId = -1;
  private fireT0 = 0;
  /** The finger on the right is pointing at a spot (point mode) rather than firing. */
  private pointing = false;
  private dirX = 1;
  private dirY = 0;
  private stick = 0;
  private held = 0;
  private dropTimer = 0;
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
      <div class="stick-base"><div class="stick-knob"></div></div>
      <div class="fire-pad"><i class="tick n"></i><i class="tick e"></i><i class="tick s"></i><i class="tick w"></i><div class="fire-knob"></div></div>
      <div class="tbtns">
        <button data-act="prev">◀<small>ITEM</small></button>
        <button data-act="next">▶<small>ITEM</small></button>
        <button data-act="scope">◎<small>ZOOM</small></button>
        <button data-act="pick">▲<small>PICK</small></button>
      </div>
      <div class="ttop">
        <button data-act="scores">SCORE</button>
        <button data-act="chat">CHAT</button>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.base = root.querySelector('.stick-base') as HTMLDivElement;
    this.knob = root.querySelector('.stick-knob') as HTMLDivElement;
    this.pad = root.querySelector('.fire-pad') as HTMLDivElement;
    this.padKnob = root.querySelector('.fire-knob') as HTMLDivElement;

    for (const b of root.querySelectorAll<HTMLButtonElement>('button')) this.wireButton(b);
    // Lay out from the visible viewport (not CSS vh, which on phones counts
    // the hidden browser bars), and again whenever it changes.
    const relayout = () => this.layout();
    addEventListener('resize', relayout);
    addEventListener('orientationchange', relayout);
    visualViewport?.addEventListener('resize', relayout);
    this.layout();

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      this.enable();
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      const x = e.clientX;
      const y = e.clientY;
      if (hooks.overUi(x, y)) {
        // A menu under the finger: it's a pick, wherever it is.
        input.touchTap(x, y);
        return;
      }
      if (x < innerWidth / 2) {
        if (this.stickId >= 0) return;
        this.stickId = e.pointerId;
        this.stickX = x;
        this.stickY = y;
        this.base.style.left = `${x}px`;
        this.base.style.top = `${y}px`;
        this.base.classList.add('active');
        this.moveStick(x, y);
      } else {
        if (this.fireId >= 0) return;
        this.fireId = e.pointerId;
        this.fireT0 = performance.now();
        this.pointing = hooks.pointMode();
        if (this.pointing) input.touchTap(x, y);
        else this.moveFire(x, y);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.moveStick(e.clientX, e.clientY);
      else if (e.pointerId === this.fireId && !this.pointing) this.moveFire(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) {
        this.stickId = -1;
        this.stick = 0;
        this.base.classList.remove('active');
        this.base.style.left = this.restX;
        this.base.style.top = this.restY;
        this.knob.style.transform = '';
        this.sync();
      } else if (e.pointerId === this.fireId) {
        this.fireId = -1;
        // A quick tap still gets its shot off (the trigger may not have been seen down yet).
        if (!this.pointing && performance.now() - this.fireT0 < TAP_MS) input.tapFire = 2;
        this.endFire();
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    addEventListener('blur', () => {
      this.endFire();
      input.touchRelease();
      this.stickId = this.fireId = -1;
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

  /** Where the fire pad sits and how big it is (CSS px), from the visible viewport. */
  private padAt = { x: 0, y: 0, r: 56 };

  /**
   * Place the controls for the visible viewport: the move stick resting in
   * the bottom-left; the item block (2 by 2) in the bottom-right corner; the
   * fire pad centred in the right half, sized and nudged clear of the block.
   */
  layout(): void {
    const w = innerWidth;
    const h = innerHeight;
    const btn = h < 430 ? 44 : 52;
    const gap = 8;
    const margin = 12;
    const block = btn * 2 + gap;
    const r = Math.max(42, Math.min(64, h * 0.16));
    // The right half's centre, a little low (under the thumb), kept clear of the corner block.
    let px = w * 0.75;
    let py = h * 0.58;
    const blockX = w - margin - block;
    const blockY = h - margin - block;
    if (px + r + 10 > blockX && py + r + 10 > blockY) px = Math.min(px, blockX - r - 14);
    py = Math.min(py, h - r - margin);
    this.padAt = { x: px, y: py, r };
    this.pad.style.left = `${px}px`;
    this.pad.style.top = `${py}px`;
    this.pad.style.width = this.pad.style.height = `${r * 2}px`;
    this.pad.style.margin = `${-r}px 0 0 ${-r}px`;
    const rest = this.root.querySelector('.stick-base') as HTMLDivElement;
    if (this.stickId < 0) {
      rest.style.left = `${Math.max(80, w * 0.16)}px`;
      rest.style.top = `${h - Math.max(76, h * 0.22)}px`;
    }
    this.restX = rest.style.left;
    this.restY = rest.style.top;
    const tb = this.root.querySelector('.tbtns') as HTMLDivElement;
    tb.style.setProperty('--btn', `${btn}px`);
    // Scores and chat: just under the HUD's match card (and Extraction's idol
    // line beneath it), at the HUD's own scale (render.ts drawHud).
    const hud = Math.min(1, h / 560, w / 1000);
    (this.root.querySelector('.ttop') as HTMLDivElement).style.top = `${Math.round(126 * hud)}px`;
  }
  private restX = '';
  private restY = '';

  /** The fire pad's centre (CSS px). */
  private padCentre(): { x: number; y: number } {
    return this.padAt;
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

  /** Fire toward the finger, as seen from the fire pad's centre (the aim assist does the rest). */
  private moveFire(x: number, y: number): void {
    const c = this.padCentre();
    const dx = x - c.x;
    const dy = y - c.y;
    const m = Math.hypot(dx, dy);
    if (m > FIRE_DEAD) {
      this.dirX = dx / m;
      this.dirY = dy / m;
    }
    const reach = this.padAt.r * 0.7;
    this.padKnob.style.transform = `translate(${this.dirX * reach}px, ${this.dirY * reach}px)`;
    this.pad.classList.add('firing');
    this.input.aimStick = { dx: this.dirX, dy: this.dirY, fire: true };
  }

  private endFire(): void {
    this.input.aimStick = null;
    this.pointing = false;
    this.pad.classList.remove('firing');
    this.padKnob.style.transform = '';
  }

  private sync(): void {
    this.input.touchButtons = this.stick | this.held;
  }

  private wireButton(b: HTMLButtonElement): void {
    const act = b.dataset.act;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.setPointerCapture?.(e.pointerId);
      b.classList.add('down');
      switch (act) {
        case 'prev':
          this.input.cycleBy(-1);
          break;
        case 'next':
          this.input.cycleBy(1);
          break;
        case 'pick':
          // A tap picks up; held, it drops what's in hand instead.
          clearTimeout(this.dropTimer);
          this.dropTimer = setTimeout(() => {
            this.dropTimer = 0;
            this.input.pressDrop();
            b.classList.add('on');
          }, 450) as unknown as number;
          break;
        case 'scope':
          // In a tank it's the cannon trigger (held); on foot it toggles the zoom.
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
    });
    const up = () => {
      b.classList.remove('down');
      if (act === 'pick') {
        if (this.dropTimer) {
          clearTimeout(this.dropTimer);
          this.dropTimer = 0;
          this.input.pressPickup();
        }
        b.classList.remove('on');
      }
      if (act === 'scope' && this.held & BTN_SCOPE) {
        this.held &= ~BTN_SCOPE;
        this.sync();
      }
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
