import { type Brief, type Conversation } from './mother.ts';
import { MOTHER_ID } from './mother-script.ts';

/**
 * The Mother's dialog: a retro terminal box over the game, her portrait on
 * the left (drawn here, in pixels: the vast ceramic hull in orbit, its long
 * truss mast hung with solar wings, TABAR's rim below), the conversation on
 * the right in a terminal font, typed out as she speaks. Under it, the
 * replies on offer ([1], [2]: never more than two), a line to ask her
 * anything, and CONTINUE.
 *
 * Reusable: `open` takes any Conversation and brief (or none, just to talk).
 * Keys while it's open: Enter / Space continue (or finish her line), 1–2
 * reply, Esc close; typing in the ask line, Enter asks.
 */
export class MotherDialog {
  readonly el: HTMLDivElement;
  private readonly face: HTMLCanvasElement;
  private readonly faceCtx: CanvasRenderingContext2D;
  private readonly logEl: HTMLDivElement;
  private readonly choicesEl: HTMLDivElement;
  private readonly askEl: HTMLInputElement;
  private readonly goEl: HTMLButtonElement;
  private readonly headEl: HTMLDivElement;
  private conv: Conversation | null = null;
  private onClose: (() => void) | null = null;
  private raf = 0;
  private last = 0;
  private drawn = '';
  private choiceKey = '';

  constructor(parent: HTMLElement) {
    // (Built node by node: the page's Trusted Types policy allows no innerHTML.)
    const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, up: HTMLElement, text = ''): HTMLElementTagNameMap[K] => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text) e.textContent = text;
      up.appendChild(e);
      return e;
    };
    const el = (this.el = document.createElement('div'));
    el.className = 'mother hidden';
    const box = mk('div', 'mother-box', el);
    const side = mk('div', 'mother-side', box);
    this.face = mk('canvas', 'mother-face', side);
    this.face.width = 72;
    this.face.height = 96;
    const name = mk('div', 'mother-name', side, 'MOTHER');
    name.appendChild(document.createElement('br'));
    name.appendChild(document.createTextNode(MOTHER_ID));
    const main = mk('div', 'mother-main', box);
    this.headEl = mk('div', 'mother-head', main, '\u25c9 INCOMING BRIEF');
    this.logEl = mk('div', 'mother-log', main);
    this.choicesEl = mk('div', 'mother-choices', main);
    const foot = mk('div', 'mother-foot', main);
    const ask = mk('label', 'mother-ask', foot);
    mk('span', '', ask, '>');
    this.askEl = mk('input', '', ask);
    this.askEl.maxLength = 120;
    this.askEl.placeholder = 'Ask Mother anything\u2026';
    this.askEl.autocomplete = 'off';
    this.goEl = mk('button', 'mother-go', foot, 'CONTINUE \u25b8');
    parent.appendChild(el);
    this.faceCtx = this.face.getContext('2d')!;
    this.goEl.addEventListener('click', () => this.advance());
    this.askEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const q = this.askEl.value.trim();
        this.askEl.value = '';
        if (q) this.conv?.ask(q);
        else this.advance();
      } else if (e.key === 'Escape') this.askEl.blur();
    });
    addEventListener('keydown', (e) => {
      if (!this.isOpen || document.activeElement === this.askEl) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.advance();
      } else if (e.key === 'Escape') {
        this.conv?.skip();
        this.close();
      } else if (/^[1-2]$/.test(e.key)) {
        if (this.conv && !this.conv.typing) this.conv.choose(Number(e.key) - 1);
      }
    });
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  /** Open on a conversation: a new brief to give (or null, just to talk), and what to do once it's closed. */
  open(conv: Conversation, brief: Brief | null, onClose?: () => void): void {
    this.conv = conv;
    this.onClose = onClose ?? null;
    if (brief) conv.begin(brief);
    this.headEl.textContent = brief ? '\u25c9 INCOMING BRIEF' : '\u25c9 LINK OPEN';
    this.el.classList.remove('hidden');
    this.drawn = '';
    this.choiceKey = '';
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    const loop = (now: number) => {
      if (!this.isOpen) return;
      this.conv?.tick(Math.min(100, now - this.last));
      this.last = now;
      this.render(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.classList.add('hidden');
    this.askEl.blur();
    cancelAnimationFrame(this.raf);
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }

  /** CONTINUE: finish what she's typing, or (all said) close. */
  private advance(): void {
    if (!this.conv) return;
    if (this.conv.typing) this.conv.skip();
    else this.close();
  }

  private render(now: number): void {
    const c = this.conv!;
    // The log (only when it changed): her lines, yours, the objective; a block cursor while she types.
    const key = `${c.log.length}:${c.shown}:${c.typing}`;
    if (key !== this.drawn) {
      this.drawn = key;
      const from = Math.max(0, c.log.length - 40);
      this.logEl.replaceChildren();
      for (let i = from; i < c.log.length; i++) {
        const l = c.log[i];
        const p = document.createElement('p');
        const text = c.visible(i);
        if (l.who === 'you') {
          p.className = 'y';
          p.textContent = `> ${text}`;
        } else if (l.who === 'objective') {
          p.className = 'o';
          const b = document.createElement('b');
          b.textContent = 'OBJECTIVE \u25b8 ';
          p.append(b, text);
        } else {
          p.className = 'm';
          p.textContent = text;
        }
        this.logEl.appendChild(p);
      }
      if (c.typing && this.logEl.lastElementChild) {
        const cur = document.createElement('i');
        cur.className = 'mother-cursor';
        cur.textContent = '\u2588';
        this.logEl.lastElementChild.appendChild(cur);
      }
      this.logEl.scrollTop = this.logEl.scrollHeight;
      this.goEl.textContent = c.typing ? 'SKIP \u25b8\u25b8' : 'CONTINUE \u25b8';
    }
    // The questions on offer, once she's done talking.
    const choices = c.typing ? [] : c.choices();
    const ck = choices.map((t) => `${t.to}:${t.ask}`).join();
    if (ck !== this.choiceKey) {
      this.choiceKey = ck;
      this.choicesEl.replaceChildren();
      choices.forEach((t, i) => {
        const b = document.createElement('button');
        b.className = 'mother-choice';
        b.textContent = `[${i + 1}] ${t.ask}`;
        b.addEventListener('click', () => this.conv?.choose(i));
        this.choicesEl.appendChild(b);
      });
      // (The choices take room from the log: keep it scrolled to her latest words.)
      this.logEl.scrollTop = this.logEl.scrollHeight;
    }
    drawMother(this.faceCtx, this.face.width, this.face.height, now, c.typing);
  }
}

/** A fixed hash in [0, 1). */
const hsh = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * The Mother's portrait, in pixels (w x h, drawn 1:1, scaled up crisp by
 * CSS): deep space and its stars; TABAR's rim, rust and coral, curving
 * across the bottom; her hull, a massive ceramic box seen three-quarter on,
 * its faces tiled, an amber lens in its face that glows as she speaks; and
 * up from it a long truss mast hung with two pairs of solar wings, a beacon
 * blinking at its tip.
 */
export function drawMother(ctx: CanvasRenderingContext2D, w: number, h: number, now: number, speaking: boolean): void {
  const px = (x: number, y: number, c: string, ww = 1, hh = 1) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, ww, hh);
  };
  px(0, 0, '#04050b', w, h);
  // Stars, twinkling.
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(hsh(i, 1) * w);
    const y = Math.floor(hsh(i, 2) * h * 0.8);
    const tw = Math.sin(now / (400 + hsh(i, 3) * 900) + i) > 0.6;
    px(x, y, hsh(i, 4) > 0.8 ? '#ffe6c0' : tw ? '#ffffff' : '#6a7090');
  }
  // TABAR's rim below: a great arc of rust and coral, its thin air glowing at the edge.
  const cx = w * 0.25;
  const cy = h + 160;
  const R = 174;
  for (let y = h - 16; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > R + 1.5) continue;
      if (d > R) {
        px(x, y, '#ff9a6a');
        continue;
      }
      const band = Math.floor((y + Math.sin(x / 7) * 2) / 3) % 4;
      const c = band === 0 ? '#7a3424' : band === 1 ? '#9a4630' : band === 2 ? '#c06040' : '#8a3c48';
      px(x, y, hsh(x, y) > 0.93 ? '#e07a8a' : c);
    }
  }
  // The mast: a long truss straight up out of the hull, braced crosswise.
  const mx = 34;
  const top = 5;
  const base = 46;
  for (let y = top; y < base; y++) {
    px(mx - 1, y, '#c8c2b4');
    px(mx + 1, y, '#8a8478');
    if (y % 3 === 0) px(mx, y, '#a8a296');
    else px(mx, y, (y % 6 < 3) === (y % 2 === 0) ? '#6a6458' : '#04050b');
  }
  // Solar wings: two pairs, out either side of the mast, cells in a gold frame; a glint sweeping across them.
  const glint = (now / 30) % (w * 3);
  for (const [wy, len] of [
    [12, 30],
    [28, 27],
  ] as const) {
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? mx - 3 - len : mx + 3;
      px(side < 0 ? mx - 3 : mx + 2, wy + 2, '#a8a296', 1, 2); // (the joint)
      px(x0, wy, '#b89038', len, 6);
      for (let y = wy + 1; y < wy + 5; y++) {
        for (let x = x0 + 1; x < x0 + len - 1; x++) {
          const cell = (x - x0) % 4 === 0 || y === wy + 3 ? '#0e1640' : (x + y) % 2 ? '#24408a' : '#2c4ca0';
          px(x, y, Math.abs(x + y * 0.5 - glint) < 1.5 ? '#9ab8ff' : cell);
        }
      }
    }
  }
  // Her hull: a vast ceramic box, three-quarter on (front, side and top faces), tiled.
  const fx = 16;
  const fy = 52;
  const fw = 30;
  const fh = 26;
  const sk = 7; // (the side face's depth, up and right)
  for (let k = 0; k < sk; k++) {
    // The top face, a row at a time; the side face, a column at a time.
    px(fx + k + 1, fy - k - 1, '#f4efe2', fw, 1);
    px(fx + fw + k, fy - k, '#aea696', 1, fh);
  }
  px(fx, fy, '#e6e0d0', fw, fh);
  // Tile seams and the odd darker tile.
  for (let y = fy; y < fy + fh; y++) {
    for (let x = fx; x < fx + fw; x++) {
      if ((x - fx) % 6 === 5 || (y - fy) % 6 === 5) px(x, y, '#c4bcac');
      else if (hsh(Math.floor((x - fx) / 6), Math.floor((y - fy) / 6)) > 0.85) px(x, y, '#d4cdbd');
    }
  }
  for (let k = 0; k < sk; k++) for (let y = fy - k; y < fy - k + fh; y += 6) px(fx + fw + k, y + 5, '#8e8676');
  px(fx, fy + fh - 1, '#9a9282', fw, 1);
  // Radiator fins off its side.
  for (let i = 0; i < 3; i++) px(fx + fw + sk, fy + 4 + i * 6, '#dcd6c8', 6, 2);
  // Her lens: amber, glowing brighter (and pulsing) as she speaks.
  const pulse = speaking ? 0.6 + 0.4 * Math.sin(now / 90) : 0.25 + 0.1 * Math.sin(now / 700);
  const lx = fx + 14;
  const ly = fy + 11;
  px(lx - 2, ly - 1, '#3a2c1c', 5, 3);
  px(lx - 1, ly - 2, '#3a2c1c', 3, 5);
  px(lx - 1, ly - 1, pulse > 0.5 ? '#ff8a20' : '#a04a10', 3, 3);
  px(lx, ly, pulse > 0.7 ? '#fff0b0' : pulse > 0.4 ? '#ffc040' : '#c06a18');
  if (speaking) {
    ctx.fillStyle = `rgba(255,160,60,${0.18 * pulse})`;
    ctx.fillRect(lx - 4, ly - 4, 9, 9);
  }
  // A beacon blinking at the mast's tip.
  if (Math.floor(now / 600) % 2 === 0) px(mx, top - 2, '#ff3a3a');
  px(mx, top - 1, '#c8c2b4');
}
