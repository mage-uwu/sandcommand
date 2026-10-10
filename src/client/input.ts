import { BTN_DOWN, BTN_FIRE, BTN_LEFT, BTN_RELOAD, BTN_RIGHT, BTN_SCOPE, BTN_UP } from '../shared/actor.ts';
import { PIECES, mirrorOrient, rotateOrient } from '../shared/build.ts';

export class InputState {
  private keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  /** Left clicks since the last takeClick(), so a click shorter than a tick still counts. */
  private clicks = 0;
  /** Right mouse held: aiming down the scope. */
  scopeDown = false;
  /** Inventory key presses since last taken (taps shorter than a tick still count). */
  private cyclePresses = 0;
  private pickups = 0;
  private drops = 0;
  /** Set each tick by the game loop: with the materializer out, the wheel picks pieces. */
  building = false;
  /** Selected materializer piece (index into PIECES), and how it's turned and mirrored (build.ts orientation: R turns it, X mirrors it). */
  piece = 0;
  orient = 0;
  scoreboard = false;
  /**
   * Touch auto mode: with no thumb on the fire pad, the gun tracks the
   * nearest enemy in sight and fires when it can hit (main.ts). The AUTO
   * button toggles it.
   */
  autoMode = true;
  /** The info panel (top right: humans online, net stats, the kill feed): off unless toggled on (I). */
  showInfo = false;
  /** True while the chat box has focus; game keys are ignored. */
  typing = false;
  onChatKey: (() => void) | null = null;
  /** Playing on a touch screen (touch controls showing). */
  touch = false;
  /** Buttons held on the touch controls (see touch.ts), OR'ed with the keyboard's. */
  touchButtons = 0;
  /** Scope toggled on from the touch controls. */
  touchScope = false;
  /** Driving a tank (set each tick by the game loop): the scope button fires the cannon instead. */
  driving = false;
  /**
   * The touch fire pad: the direction it's pointed (screen axes), firing,
   * and whether it was just swiped (to re-target; main.ts clears it). Null
   * when no thumb is on it.
   */
  aimStick: { dx: number; dy: number; fire: boolean; swipe?: boolean } | null = null;
  /** Ticks left holding fire for a quick tap (so even a tap shorter than a tick shoots). */
  tapFire = 0;
  /** A tap or hold aimed at a screen point this tick: the game loop applies aim assist to it. */
  pointAssist = false;
  /**
   * Keyboard aim (arrow keys): the reticle is held at an offset (CSS px)
   * from the clone, so it stays put relative to it as it moves. Any mouse
   * movement hands aim back to the mouse.
   */
  keyAim = false;
  private keyAimX = 0;
  private keyAimY = 0;
  /** Set once a touch has come in: mouse events the browser synthesises from it are ignored. */
  private lastTouch = -1e9;

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
      // Inventory: 1/2 (or Q/E) rotate, 3 (or F) pick up, 4 (or G) drop.
      if (!e.repeat) {
        if (e.code === 'Digit1' || e.code === 'KeyQ') this.cyclePresses--;
        if (e.code === 'Digit2' || e.code === 'KeyE') this.cyclePresses++;
        if (e.code === 'Digit3' || e.code === 'KeyF') this.pickups++;
        if (e.code === 'Digit4' || e.code === 'KeyG') this.drops++;
        // With the materializer out: R turns the piece a quarter, X mirrors it.
        if (this.building && e.code === 'KeyR') this.orient = rotateOrient(this.orient);
        if (this.building && e.code === 'KeyX') this.orient = mirrorOrient(this.orient);
      }
      // Right shift fires (and clicks: builds, picks radio calls at the reticle).
      if (e.code === 'ShiftRight' && !e.repeat) this.clicks++;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
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
      if (this.fromTouch()) return;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.keyAim = false;
    });
    target.addEventListener('mousedown', (e) => {
      if (this.fromTouch()) return;
      if (e.button === 0) {
        this.mouseDown = true;
        this.clicks++;
      }
      if (e.button === 2) this.scopeDown = true;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    addEventListener('mouseup', (e) => {
      if (this.fromTouch()) return;
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.scopeDown = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener(
      'wheel',
      (e) => {
        const d = Math.sign(e.deltaY);
        // With the materializer out, the wheel picks what to build.
        if (this.building) this.piece = (this.piece + d + PIECES.length) % PIECES.length;
        else this.cyclePresses += d;
        e.preventDefault();
      },
      { passive: false },
    );
  }

  private fromTouch(): boolean {
    return performance.now() - this.lastTouch < 1000;
  }

  // Touch controls feed the same state the mouse and keyboard do.

  /** A finger aiming (and firing) at screen point x, y. */
  touchAim(x: number, y: number, press: boolean): void {
    this.lastTouch = performance.now();
    this.mouseX = x;
    this.mouseY = y;
    if (press) {
      this.mouseDown = true;
      this.clicks++;
    }
  }
  touchRelease(): void {
    this.lastTouch = performance.now();
    this.mouseDown = false;
    this.pointAssist = false;
  }
  /** A quick tap at a screen point: one shot (or build, or menu pick, or next spectate target) there. */
  touchTap(x: number, y: number): void {
    this.lastTouch = performance.now();
    this.mouseX = x;
    this.mouseY = y;
    this.clicks++;
    this.tapFire = 2;
    this.pointAssist = true;
  }
  cycleBy(d: number): void {
    this.cyclePresses += d;
  }
  pressPickup(): void {
    this.pickups++;
  }
  pressDrop(): void {
    this.drops++;
  }

  /**
   * Keyboard aim (once a tick), like the phone's fire pad: the arrows pick a
   * direction from the clone at (ox, oy) on screen (CSS px), any of eight,
   * and the aim assist snaps it onto the enemy nearest that way. The
   * direction holds when the arrows are let go, and the pointer sits out
   * along it (so the crosshair, the arm and the camera follow).
   */
  stepKeyAim(_dt: number, ox: number, oy: number, w: number, h: number): void {
    if (this.typing) return;
    const dx = (this.down('ArrowRight') ? 1 : 0) - (this.down('ArrowLeft') ? 1 : 0);
    const dy = (this.down('ArrowDown') ? 1 : 0) - (this.down('ArrowUp') ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      this.keyAim = true;
      const n = Math.hypot(dx, dy);
      this.keyAimX = dx / n;
      this.keyAimY = dy / n;
    }
    if (!this.keyAim) return;
    const r = Math.min(w, h) * 0.3;
    this.mouseX = Math.max(4, Math.min(w - 4, ox + this.keyAimX * r));
    this.mouseY = Math.max(4, Math.min(h - 4, oy + this.keyAimY * r));
  }

  /** The keyboard aim's direction (unit vector, screen axes), while keyboard aim is on. */
  get keyDir(): { x: number; y: number } | null {
    return this.keyAim ? { x: this.keyAimX, y: this.keyAimY } : null;
  }

  private down(...codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** Net inventory rotation pressed since last asked (-1 back, +1 forward, ...). */
  takeCycle(): number {
    const d = this.cyclePresses;
    this.cyclePresses = 0;
    return d;
  }
  takePickup(): boolean {
    const n = this.pickups;
    this.pickups = 0;
    return n > 0;
  }
  takeDrop(): boolean {
    const n = this.drops;
    this.drops = 0;
    return n > 0;
  }

  /** Consume one pending left click (materializer placement and menu picks). */
  takeClick(): boolean {
    if (this.clicks === 0) return false;
    this.clicks = 0;
    return true;
  }

  /** Aiming down the scope (right mouse or left Shift). */
  get scoping(): boolean {
    return !this.typing && (this.scopeDown || (this.touchScope && !this.driving) || this.down('ShiftLeft'));
  }

  buttons(): number {
    if (this.typing) return 0;
    return (
      (this.down('KeyA') ? BTN_LEFT : 0) |
      (this.down('KeyD') ? BTN_RIGHT : 0) |
      (this.down('KeyW', 'Space') ? BTN_UP : 0) |
      (this.down('KeyS') ? BTN_DOWN : 0) |
      (this.mouseDown || this.tapFire > 0 || this.aimStick?.fire || this.down('ShiftRight') ? BTN_FIRE : 0) |
      (this.scoping ? BTN_SCOPE : 0) |
      (this.down('KeyR') ? BTN_RELOAD : 0) |
      this.touchButtons
    );
  }
}
