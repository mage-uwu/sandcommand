import { DRAGON_R } from '../shared/wildlife.ts';

/**
 * The dragon, in pixels (wildlife.ts DRAGON_*): the basilisk three times
 * over, and sharper for it. Its sprites are baked once, a pixel at a time
 * (each body section, its head shut and gaping), facing right with its
 * back up, then drawn turned along its body with no smoothing, so every
 * edge stays crisp:
 *
 * - **Scales**: overlapping, lit from above (a bright crimson rim on each,
 *   deep red, then shadow), over blood-black.
 * - **Belly plates**: ochre bands, dark seams between.
 * - **Spikes**: a row of bone spikes along its spine, longest at the
 *   shoulders, shrinking down its tail.
 * - **Embers**: frenzied, the cracks between its scales glow like coals.
 * - **Head**: a long horned wedge, a brow of spikes, a row of fangs; its
 *   jaw drops open in its frenzy (two frames, working), over a throat
 *   glowing with the fire it spits; its eyes burn. Asleep, its eyes are
 *   shut and its embers dark.
 */

type RGBA = number; // 0xAABBGGRR (ImageData little-endian)
const rgb = (hex: string): RGBA => {
  const v = parseInt(hex.slice(1), 16);
  return (0xff << 24) | ((v & 0xff) << 16) | (((v >> 8) & 0xff) << 8) | ((v >> 16) & 0xff);
};
const OUTLINE = rgb('#0a0406');
const SCALE_HI = rgb('#d0303a');
const SCALE = rgb('#8a141e');
const SCALE_LO = rgb('#4a0810');
const SCALE_EDGE = rgb('#1c0408');
const BELLY = [rgb('#a8743a'), rgb('#8a5a2a')];
const BELLY_SEAM = rgb('#3a1e10');
const BONE = rgb('#e8dcc0');
const BONE_LO = rgb('#a89a80');
const BONE_TIP = rgb('#fff6e0');
const EMBER = rgb('#ff7a20');
const EMBER_HI = rgb('#ffd060');
const THROAT = rgb('#ff5a10');
const THROAT_DEEP = rgb('#7a1006');
const FANG = rgb('#f4ecd8');
const EYE = rgb('#ffcc40');
const EYE_HOT = rgb('#fff4b0');
const EYE_CALM = rgb('#c06818');

const hsh = (a: number, b: number) => {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

interface Sprite {
  c: HTMLCanvasElement;
  /** Where its centre (the body point it's drawn at) is in it. */
  ox: number;
  oy: number;
}

/** A canvas `w` by `h`, painted by `px(x, y)` (0: leave it clear). */
function bake(w: number, h: number, px: (x: number, y: number) => RGBA): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const d = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = px(x, y) >>> 0;
  g.putImageData(img, 0, 0);
  return c;
}

/** A scale cell at (u, v) of a body (lit from above): its colour, or the seam between scales. */
function scaleAt(u: number, v: number, embers: boolean): RGBA {
  const cw = 7;
  const ch = 6;
  const row = Math.floor((v + 100) / ch);
  const su = (((u + (row & 1) * (cw / 2)) % cw) + cw) % cw;
  const sv = (((v + 100) % ch) + ch) % ch;
  // Each scale: a rounded shield, its point toward the tail (overlapping the next).
  const r = Math.hypot((su - cw / 2) / (cw / 2), (sv - ch * 0.45) / (ch / 2));
  if (r > 1.02) return embers && hsh(Math.floor(u / 3), Math.floor(v / 3)) > 0.55 ? (hsh(Math.round(u), Math.round(v)) > 0.7 ? EMBER_HI : EMBER) : SCALE_EDGE;
  if (sv < ch * 0.25) return SCALE_HI;
  return r < 0.55 ? SCALE : SCALE_LO;
}

const segCache = new Map<string, Sprite>();
/**
 * Body section `i` of `n` (1: its neck, n - 1: the tip of its tail), its
 * girth tapering down it, and the spine's spikes shrinking with it.
 */
function segSprite(i: number, n: number, embers: boolean): Sprite {
  const key = `${i}|${n}|${embers ? 1 : 0}`;
  let s = segCache.get(key);
  if (s) return s;
  const f = i / Math.max(1, n - 1);
  const w = DRAGON_R * 1.15 * (1 - 0.62 * f);
  const len = DRAGON_R * 1.15;
  const spikeH = Math.max(3, Math.round(16 * (1 - 0.75 * f)));
  const tail = i === n - 1;
  const W = Math.ceil(len * 2 + (tail ? len : 0)) + 6;
  const H = Math.ceil(w * 2 + spikeH) + 6;
  const ox = Math.ceil(len) + 3 + (tail ? Math.ceil(len) : 0);
  const oy = Math.ceil(w + spikeH) + 3;
  const c = bake(W, H, (x, y) => {
    const u = x + 0.5 - ox;
    const v = y + 0.5 - oy;
    // The tip of the tail: a long barb back from the last section.
    if (tail && u < -len * 0.6) {
      const k = (-u - len * 0.6) / (len * 1.2);
      const half = w * 0.55 * (1 - k);
      if (k > 1 || Math.abs(v) > half) return 0;
      return Math.abs(v) > half - 1.2 ? OUTLINE : v < 0 ? BONE : BONE_LO;
    }
    // A spike on its spine, every so often along it.
    const spacing = 11;
    const su = ((u % spacing) + spacing) % spacing;
    if (v < -w * 0.72 && Math.abs(u) < len * 0.95) {
      const top = -w * 0.72 - spikeH * (1 - Math.abs(su - spacing * 0.35) / (spacing * 0.5));
      if (v >= top) {
        if (v < top + 1.5) return BONE_TIP;
        return su < spacing * 0.35 ? BONE : BONE_LO;
      }
    }
    const e = (u / len) ** 2 + (v / w) ** 2;
    if (e > 1) return 0;
    if (e > 0.86) return OUTLINE;
    // Its belly: banded plates.
    if (v > w * 0.42) {
      const band = Math.floor((u + 200) / 6);
      if ((((u + 200) % 6) + 6) % 6 < 1) return BELLY_SEAM;
      return BELLY[band & 1];
    }
    return scaleAt(u, v, embers);
  });
  s = { c, ox, oy };
  segCache.set(key, s);
  return s;
}

const headCache = new Map<string, Sprite>();
/** Its head: shut (asleep or calm), or gaping (`frame` 0 or 1, the jaw working). */
function headSprite(open: boolean, frame: number, asleep: boolean): Sprite {
  const key = `${open ? 1 : 0}|${frame}|${asleep ? 1 : 0}`;
  let s = headCache.get(key);
  if (s) return s;
  const W = DRAGON_R * 1.1; // half its width at the jaw hinge
  const back = DRAGON_R * 0.8; // skull behind the hinge
  const L = DRAGON_R * 1.9; // snout, hinge to tip
  const horn = DRAGON_R * 1.2;
  const gape = open ? 0.38 + frame * 0.12 : 0;
  const Wd = Math.ceil(back + horn + L) + 8;
  const Hd = Math.ceil(W * 2 + horn * 0.9 + L * Math.sin(gape)) + 10;
  const ox = Math.ceil(back + horn) + 4;
  const oy = Math.ceil(W + horn * 0.6) + 4;
  const hw = (u: number) => (u < 0 ? W * (0.75 + 0.25 * (1 + u / back)) : W * (1 - 0.72 * (u / L)));
  const c = bake(Wd, Hd, (x, y) => {
    const u = x + 0.5 - ox;
    const v = y + 0.5 - oy;
    // Horns: two, swept back off the top of the skull.
    for (const [ou, ov, len, th] of [
      [-back * 0.2, -W * 0.7, horn, 5],
      [-back * 0.45, -W * 0.45, horn * 0.75, 4],
    ] as const) {
      const ax = -Math.cos(0.5);
      const ay = -Math.sin(0.5);
      const du = u - ou;
      const dv = v - ov;
      const along = du * ax + dv * ay;
      const across = -du * ay + dv * ax;
      if (along >= 0 && along <= len) {
        const half = th * (1 - along / len);
        if (Math.abs(across) <= half) {
          if (along > len - 2) return BONE_TIP;
          return across < 0 ? BONE : (Math.floor(along / 3) & 1) === 0 ? BONE_LO : BONE;
        }
      }
    }
    // The lower jaw: swung down by the gape, about the hinge.
    if (v > 0 || gape > 0) {
      const ju = u * Math.cos(-gape) - v * Math.sin(-gape);
      const jv = u * Math.sin(-gape) + v * Math.cos(-gape);
      if (gape > 0 && jv > 0 && ju > 0 && ju < L * 0.95) {
        const half = hw(ju) * 0.62;
        if (jv <= half) {
          // Fangs up off its rim.
          if (jv < 3.5 && (Math.floor(ju / 5) & 1) === 0 && ju > 4 && ju < L * 0.85) return FANG;
          if (jv > half - 1.2) return OUTLINE;
          return jv > half * 0.55 ? BELLY[0] : scaleAt(ju, jv, false);
        }
      }
    }
    // The throat, between the jaws: glowing with its fire.
    if (gape > 0 && u > 0 && u < L * 0.9 && v > 0 && v < Math.tan(gape) * u) return u > L * 0.45 ? THROAT_DEEP : THROAT;
    // The upper head: skull and snout.
    if (u < -back || u > L) return 0;
    const half = hw(u);
    // (Shut, the head is the whole wedge; open, its upper half.)
    if (v < -half || v > (gape > 0 ? 0 : half * 0.62)) return 0;
    const e = Math.abs(v) / half;
    if (e > 0.9 || u > L - 1.5 || u < -back + 1.5) return OUTLINE;
    // Fangs down from the upper jaw.
    if (v > -3.5 && v <= 0 && (Math.floor(u / 5) & 1) === 1 && u > 4 && u < L * 0.85) return FANG;
    // The brow: a ridge of short spikes over its eye.
    if (v < -half * 0.78 && u > -back * 0.4 && u < L * 0.35) return (Math.floor(u / 4) & 1) === 0 ? BONE : OUTLINE;
    // Its eye.
    const ex = L * 0.12;
    const ey = -half * 0.45;
    const ed = Math.hypot(u - ex, (v - ey) * 1.4);
    if (ed < 3.2) return asleep ? (Math.abs(v - ey) < 0.8 ? OUTLINE : SCALE_LO) : ed < 1.4 ? EYE_HOT : open ? EYE : EYE_CALM;
    if (v > half * 0.3) return BELLY[1];
    return scaleAt(u, v, false);
  });
  s = { c, ox, oy };
  headCache.set(key, s);
  return s;
}

/** Draw a sprite at (x, y), turned to `a`, mirrored when it faces left so its back stays up. */
function put(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, a: number): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(a);
  if (Math.cos(a) < 0) ctx.scale(1, -1);
  ctx.drawImage(s.c, -s.ox, -s.oy);
  ctx.restore();
}

/** A dragon along its body points (head first). */
export function drawDragon(ctx: CanvasRenderingContext2D, pts: readonly number[], _seed: number, frozen: boolean, frenzy: boolean, now: number): void {
  const n = pts.length >> 1;
  if (n < 2) return;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const P = (i: number) => Math.max(0, Math.min(n - 1, i));
  const dir = (i: number) => Math.atan2(pts[P(i - 1) * 2 + 1] - pts[P(i + 1) * 2 + 1], pts[P(i - 1) * 2] - pts[P(i + 1) * 2]);
  // Its embers: in its frenzy, flickering section by section.
  for (let i = n - 1; i >= 1; i--) {
    const hot = frenzy && Math.floor(now / 140 + i * 1.7) % 4 !== 0;
    put(ctx, segSprite(i, n, hot), pts[i * 2], pts[i * 2 + 1], dir(i));
  }
  const frame = frenzy ? Math.floor(now / 160) & 1 : 0;
  put(ctx, headSprite(frenzy, frame, frozen), pts[0], pts[1], Math.atan2(pts[1] - pts[3], pts[0] - pts[2]));
  ctx.imageSmoothingEnabled = smooth;
}

/** A section of a dead dragon, tumbling (its head, if it's the first). */
export function drawDragonGib(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, _seed: number, i: number, n = 15): void {
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  put(ctx, i === 0 ? headSprite(false, 0, true) : segSprite(Math.min(i, n - 1), n, false), x, y, a);
  ctx.imageSmoothingEnabled = smooth;
}
