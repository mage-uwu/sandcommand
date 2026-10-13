import { DRAGON_R } from '../shared/wildlife.ts';

/**
 * The dragon, in pixels (wildlife.ts DRAGON_*): the basilisk three times
 * over. Where the other creatures wear the caves' GEMMs and stone to pass
 * for part of the rock, this one has no reason to hide: it wears them to
 * show off, an apex predator in a dazzling, horrible splendour.
 *
 * - **Hide**: rough red, a dragon's colours gone feral: mottled, caked in
 *   dirt, flecked with grit; its belly banded ochre plates, scuffed.
 * - **GEMMs**: faceted crystal rosettes set into its back (pink, turquoise,
 *   emerald, shaded like the crystals in the ground), gem veins running
 *   down its flanks, a crest of crystal spines along its spine. Glints
 *   play over all of it as it moves (brighter in its frenzy).
 * - **Head**: heavy and blunt, a sail rising off its skull like a
 *   dimetrodon's: bone spines with webbing strung between them, banded in
 *   gem colours, eyespots in it, its edge sagging between the spines. Its
 *   jaw drops open in its frenzy over a throat glowing with the fire it
 *   spits; its small eye is cold.
 *
 * Its sprites are baked once, a pixel at a time, facing right with its back
 * up, then drawn turned along its body with no smoothing (every edge crisp).
 */

type RGBA = number; // 0xAABBGGRR (ImageData little-endian)
const rgb = (hex: string): RGBA => {
  const v = parseInt(hex.slice(1), 16);
  return (0xff << 24) | ((v & 0xff) << 16) | (((v >> 8) & 0xff) << 8) | ((v >> 16) & 0xff);
};
const mixRGB = (a: string, b: string, t: number): RGBA => {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return (0xff << 24) | (ch(0) << 16) | (ch(8) << 8) | ch(16);
};
const OUTLINE = rgb('#120608');
const HIDE = ['#3a0c0e', '#5e1416', '#7a1c1c', '#962826', '#b03430'];
const DIRT = ['#3a2a1e', '#4a3424', '#5e4630', '#76583a'];
const GRIT = rgb('#22160f');
const BELLY = ['#7a5026', '#8a5a2a', '#a8743a', '#bf8a4a'];
const BONE = rgb('#d8ccb0');
const BONE_LO = rgb('#968a70');
const THROAT = rgb('#ff5a10');
const THROAT_DEEP = rgb('#7a1006');
const TOOTH = rgb('#cfc4a8');
/** The GEMMs it wears (the ground's own: pink, turquoise, emerald), dark to light. */
const GEMS = [
  ['#8a0c46', '#ff2a8a', '#ff7ab8', '#ffd0e8'],
  ['#0a6a66', '#18c8c0', '#7af0e8', '#d8fffa'],
  ['#0c5a2a', '#22b85a', '#7ae89a', '#d8ffe4'],
];
const GLINT = ['#ffd0e8', '#d8fffa', '#d8ffe4'];

const hsh = (a: number, b: number, c = 0) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth-ish value noise (cells `s` wide), for mottling and dirt. */
function vn(x: number, y: number, s: number, k: number): number {
  const fx = x / s;
  const fy = y / s;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const a = hsh(ix, iy, k);
  const b = hsh(ix + 1, iy, k);
  const c = hsh(ix, iy + 1, k);
  const d = hsh(ix + 1, iy + 1, k);
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

interface Sprite {
  c: HTMLCanvasElement;
  ox: number;
  oy: number;
}
interface Gem {
  u: number;
  v: number;
  r: number;
  g: number;
}

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

/** Rough hide at (u, v): mottled reds, caked dirt, grit; scales only hinted at (a ridge here and there). */
function hide(u: number, v: number, k: number, hot: boolean): RGBA {
  const m = vn(u, v, 9, k) * 0.65 + vn(u, v, 3.5, k + 1) * 0.35;
  const dirt = vn(u + 40, v, 14, k + 2);
  const h = hsh(Math.round(u), Math.round(v), k);
  if (h > 0.955) return GRIT;
  // Scale ridges: broken arcs, not tiles.
  const row = Math.floor((v + 200) / 5);
  const su = (((u + (row & 1) * 3.5 + vn(u, v, 6, k + 3) * 3) % 7) + 7) % 7;
  const ridge = su < 1 && hsh(Math.floor(u / 7), row, k + 4) > 0.35;
  let i = Math.min(4, Math.floor(m * 4.6) + (hot ? 1 : 0));
  if (ridge) i = Math.max(0, i - 2);
  if (dirt > 0.62) return mixRGB(HIDE[i], DIRT[Math.min(3, Math.floor((dirt - 0.62) * 10) + (h > 0.7 ? 1 : 0))], Math.min(0.85, (dirt - 0.62) * 3));
  return rgb(HIDE[i]);
}

/** A faceted crystal (gem `g`, centred on c, radius r) at (u, v), shaded like the GEMM crystals in the ground: facets in bands, lit upper edges, a glint. */
function crystal(u: number, v: number, c: Gem, bright: boolean): RGBA | 0 {
  const du = u - c.u;
  const dv = v - c.v;
  // A rough rosette: a few points round it.
  const a = Math.atan2(dv, du);
  const rr = c.r * (0.75 + 0.25 * Math.abs(Math.cos(a * 3 + c.g)));
  const d = Math.hypot(du, dv);
  if (d > rr) return 0;
  const pal = GEMS[c.g];
  if (d > rr - 1) return rgb(pal[0]);
  const band = Math.floor((du - dv + 50) / 2.2) & 3;
  let i = [1, 2, 1, 3][band];
  if (dv < -rr * 0.35) i = 3; // (lit from above)
  else if (dv > rr * 0.4) i = 0;
  if (bright) i = Math.min(3, i + 1);
  return rgb(pal[i]);
}

/** Where the rosettes sit on body section `i` (u along, v across: up is negative), its girth w. */
function gemsOf(i: number, w: number, len: number): Gem[] {
  const out: Gem[] = [];
  const n = 2 + Math.floor(hsh(i, 7) * 2);
  for (let k = 0; k < n; k++) {
    out.push({
      u: (-0.6 + (1.2 * (k + 0.5)) / n + (hsh(i, k, 1) - 0.5) * 0.2) * len,
      v: -w * (0.25 + 0.4 * hsh(i, k, 2)),
      r: w * (0.16 + 0.12 * hsh(i, k, 3)),
      g: Math.floor(hsh(i, k, 4) * 3),
    });
  }
  return out;
}

const segCache = new Map<string, Sprite>();
const segGems = new Map<string, Gem[]>();
/** Body section `i` of `n` (1: its neck, n - 1: its tail's tip): girth tapering, crystals set in its back, a crest of crystal spines. */
function segSprite(i: number, n: number, bright: boolean): { s: Sprite; gems: Gem[] } {
  const key = `${i}|${n}|${bright ? 1 : 0}`;
  const f = i / Math.max(1, n - 1);
  const w = DRAGON_R * 1.12 * (1 - 0.6 * f);
  const len = DRAGON_R * 1.15;
  let s = segCache.get(key);
  if (s) return { s, gems: segGems.get(key)! };
  const gems = gemsOf(i, w, len);
  const crestH = Math.max(3, Math.round(10 * (1 - 0.7 * f)));
  const tail = i === n - 1;
  const W = Math.ceil(len * 2 + (tail ? len : 0)) + 6;
  const H = Math.ceil(w * 2 + crestH) + 6;
  const ox = Math.ceil(len) + 3 + (tail ? Math.ceil(len) : 0);
  const oy = Math.ceil(w + crestH) + 3;
  const k = i * 17 + 3;
  const c = bake(W, H, (x, y) => {
    const u = x + 0.5 - ox;
    const v = y + 0.5 - oy;
    // The tail's end: a long, rough whip.
    if (tail && u < -len * 0.6) {
      const t = (-u - len * 0.6) / (len * 1.2);
      const half = w * 0.5 * (1 - t);
      if (t > 1 || Math.abs(v) > half) return 0;
      return Math.abs(v) > half - 1.2 ? OUTLINE : hide(u, v, k, false);
    }
    // The crest: short crystal spines along its spine (a rough row, gem by gem).
    const spacing = 9;
    const su = ((u % spacing) + spacing) % spacing;
    const ci = Math.floor((u + 300) / spacing);
    if (v < -w * 0.74 && Math.abs(u) < len * 0.9) {
      const hgt = crestH * (0.6 + 0.4 * hsh(ci, i, 9));
      const top = -w * 0.74 - hgt * (1 - Math.abs(su - spacing / 2) / (spacing * 0.45));
      if (v >= top) {
        const pal = GEMS[Math.floor(hsh(ci, i, 10) * 3)];
        if (v < top + 1.2) return rgb(pal[3]);
        return rgb(su < spacing / 2 ? pal[2] : pal[1]);
      }
    }
    const e = (u / len) ** 2 + (v / w) ** 2;
    if (e > 1) return 0;
    if (e > 0.88) return OUTLINE;
    // Its belly: ochre plates, scuffed and dirty.
    if (v > w * 0.42) {
      if ((((u + 200 + vn(u, v, 5, k) * 2) % 6) + 6) % 6 < 1) return rgb(DIRT[0]);
      const d = vn(u, v, 7, k + 5);
      const bi = Math.min(3, Math.floor(d * 4.4));
      return hsh(Math.round(u), Math.round(v), k + 6) > 0.95 ? GRIT : d > 0.7 ? mixRGB(BELLY[bi], DIRT[2], 0.5) : rgb(BELLY[bi]);
    }
    // The rosettes, set into its back.
    for (const g of gems) {
      const cpx = crystal(u, v, g, bright);
      if (cpx) return cpx;
    }
    // Gem veins: thin bright seams running back down its flanks.
    const vein = Math.abs(v + w * 0.05 - w * 0.22 * Math.sin(u * 0.09 + i * 1.9));
    if (vein < 0.8 && hsh(Math.floor(u / 5), i, 11) > 0.3) return rgb(GEMS[(i + 1) % 3][bright ? 2 : 1]);
    return hide(u, v, k, false);
  });
  s = { c, ox, oy };
  segCache.set(key, s);
  segGems.set(key, gems);
  return { s, gems };
}

/** The sail's spines: where each rises off the skull (u), its height (as a share of the tallest), its lean back. */
const SPINES = [
  { u: -0.55, h: 0.55 },
  { u: -0.32, h: 0.82 },
  { u: -0.08, h: 1.0 },
  { u: 0.16, h: 0.96 },
  { u: 0.4, h: 0.78 },
  { u: 0.62, h: 0.5 },
];

const headCache = new Map<string, { s: Sprite; eyes: { u: number; v: number }[]; spots: Gem[] }>();
/** Its head: shut, or gaping (`frame` 0 or 1, the jaw working); `asleep`, its eye shut. */
function headSprite(open: boolean, frame: number, asleep: boolean, bright: boolean): { s: Sprite; spots: Gem[] } {
  const key = `${open ? 1 : 0}|${frame}|${asleep ? 1 : 0}|${bright ? 1 : 0}`;
  const hit = headCache.get(key);
  if (hit) return hit;
  const W = DRAGON_R * 1.0; // half its girth at the hinge
  const back = DRAGON_R * 0.9; // skull behind the hinge
  const L = DRAGON_R * 1.5; // snout, hinge to tip (blunt, heavy)
  const sail = DRAGON_R * 2.1; // the tallest spine
  const gape = open ? 0.34 + frame * 0.1 : 0;
  const Wd = Math.ceil(back * 1.9 + L + sail * 0.5) + 10;
  const Hd = Math.ceil(W * 2 + sail + L * Math.sin(gape)) + 10;
  const ox = Math.ceil(back * 1.9 + sail * 0.35) + 5;
  const oy = Math.ceil(W + sail) + 4;
  // Half its height along it: a heavy skull, a blunt rounded snout.
  const hw = (u: number) => (u < -back ? W * 0.82 : u < 0 ? W * (0.82 + 0.18 * (1 + u / back)) : W * (1 - 0.45 * (u / L) ** 1.6));
  // The sail: spines fanned up off the top of the skull (the back ones raked back, the front ones nearly upright).
  const tips = SPINES.map((sp, k) => {
    const base = -back * 1.9 + ((k + 0.3) / SPINES.length) * (back * 1.9 + L * 0.4);
    const lean = -0.3 + (0.45 * k) / (SPINES.length - 1);
    const bv = -hw(base) * 0.82;
    return { bu: base, bv, tu: base + Math.sin(lean) * sail * sp.h, tv: bv - Math.cos(lean) * sail * sp.h };
  });
  const spots: Gem[] = [];
  for (let k = 0; k < tips.length - 1; k++) {
    const a = tips[k];
    const b = tips[k + 1];
    spots.push({ u: a.bu * 0.2 + b.bu * 0.2 + a.tu * 0.3 + b.tu * 0.3, v: a.bv * 0.2 + b.bv * 0.2 + a.tv * 0.3 + b.tv * 0.3, r: W * 0.2, g: k % 3 });
  }
  /** Which side of the line (ax, ay) -> (bx, by) a point is on. */
  const side = (ax: number, ay: number, bx: number, by: number, x: number, y: number) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  const c = bake(Wd, Hd, (x, y) => {
    const u = x + 0.5 - ox;
    const v = y + 0.5 - oy;
    // The sail: between consecutive spines, membrane up to a sagging edge; the spines themselves bone.
    for (let k = 0; k < tips.length; k++) {
      const t = tips[k];
      // Spine k: a rod from its foot to its tip.
      const du = t.tu - t.bu;
      const dv = t.tv - t.bv;
      const l2 = du * du + dv * dv;
      const s = Math.max(0, Math.min(1, ((u - t.bu) * du + (v - t.bv) * dv) / l2));
      const d = Math.hypot(u - (t.bu + du * s), v - (t.bv + dv * s));
      if (d < 1.6 * (1 - s * 0.5) + 0.6) return d < 0.8 ? BONE : BONE_LO;
    }
    for (let k = 0; k < tips.length - 1; k++) {
      const a = tips[k];
      const b = tips[k + 1];
      // Inside the panel: the quad foot a, foot b, tip b, tip a (its top edge sagging between the tips).
      const sagged = (t: number) => ({ u: a.tu + (b.tu - a.tu) * t, v: a.tv + (b.tv - a.tv) * t + Math.sin(t * Math.PI) * W * 0.4 });
      if (side(a.bu, a.bv, b.bu, b.bv, u, v) > 0) continue; // (below its foot: the skull)
      if (side(b.bu, b.bv, b.tu, b.tv, u, v) > 0 || side(a.tu, a.tv, a.bu, a.bv, u, v) > 0) continue; // (outside the spines)
      // Across the panel (0 at spine a, 1 at spine b), and the edge there.
      const da = Math.abs(side(a.bu, a.bv, a.tu, a.tv, u, v)) / Math.hypot(a.tu - a.bu, a.tv - a.bv);
      const db = Math.abs(side(b.bu, b.bv, b.tu, b.tv, u, v)) / Math.hypot(b.tu - b.bu, b.tv - b.bv);
      const t = da / (da + db || 1);
      const edge = sagged(t);
      const foot = { u: a.bu + (b.bu - a.bu) * t, v: a.bv + (b.bv - a.bv) * t };
      const span = Math.hypot(edge.u - foot.u, edge.v - foot.v) || 1;
      const up = ((u - foot.u) * (edge.u - foot.u) + (v - foot.v) * (edge.v - foot.v)) / (span * span); // 0 at its foot, 1 at its edge
      if (up > 1) continue;
      if (up > 1 - 1.4 / span) return OUTLINE;
      // Its eyespot, one in each panel.
      const sp = spots[k];
      const ed = Math.hypot(u - sp.u, v - sp.v);
      if (ed < sp.r) return rgb(ed < sp.r * 0.4 ? '#120608' : ed < sp.r * 0.7 ? GEMS[sp.g][bright ? 3 : 2] : GEMS[sp.g][0]);
      // Banded along the skull's line: red hide at the foot, up through the panel's gem colours to a bright rim; ribbed, roughed.
      const band = Math.floor(up * 5 + (vn(u, v, 7, 31) - 0.5) * 0.7);
      if (band <= 0) return hide(u, v, 41, false);
      const pal = GEMS[(k + (band >= 3 ? 1 : 0)) % 3];
      const rib = Math.abs((t * 4) % 1 - 0.5) < 0.06;
      if (rib) return rgb(pal[0]);
      if (hsh(Math.round(u), Math.round(v), 33) > 0.96) return rgb(pal[3]);
      return rgb(pal[band >= 4 ? (bright ? 3 : 2) : band >= 2 ? 1 : 0]);
    }
    // The lower jaw, swung down by the gape about the hinge.
    if (gape > 0) {
      const ju = u * Math.cos(-gape) - v * Math.sin(-gape);
      const jv = u * Math.sin(-gape) + v * Math.cos(-gape);
      if (jv > 0 && ju > 0 && ju < L * 0.92) {
        const half = hw(ju) * 0.6;
        if (jv <= half) {
          if (jv < 2.5 && hsh(Math.floor(ju / 4), 1, 51) > 0.45 && ju > 3) return TOOTH;
          if (jv > half - 1.2) return OUTLINE;
          return jv > half * 0.5 ? rgb(BELLY[2]) : hide(ju, jv, 61, false);
        }
      }
      // The throat: glowing with its fire.
      if (u > 0 && u < L * 0.88 && v > 0 && v < Math.tan(gape) * u) return u > L * 0.5 ? THROAT_DEEP : THROAT;
    }
    // The skull and snout.
    if (u < -back || u > L) return 0;
    const half = hw(u);
    if (v < -half || v > (gape > 0 ? 0 : half * 0.6)) return 0;
    if (Math.abs(v) > half * 0.9 || u > L - 1.5 || u < -back + 1.5) return OUTLINE;
    if (gape > 0 && v > -2.5 && hsh(Math.floor(u / 4), 2, 52) > 0.5 && u > 3 && u < L * 0.85) return TOOTH;
    // Its eye: small and cold.
    const ex = L * 0.05;
    const ey = -half * 0.42;
    const ed = Math.hypot(u - ex, (v - ey) * 1.3);
    if (ed < 2.8) return asleep ? (Math.abs(v - ey) < 0.7 ? OUTLINE : rgb(HIDE[0])) : ed < 1.1 ? rgb('#fffef0') : rgb(GEMS[1][1]);
    if (v > half * 0.3) return rgb(BELLY[1]);
    // A crystal or two crusted on its brow.
    const brow: Gem = { u: -back * 0.35, v: -half * 0.55, r: W * 0.2, g: 2 };
    const bc = crystal(u, v, brow, bright);
    if (bc) return bc;
    return hide(u, v, 71, false);
  });
  const out = { s: { c, ox, oy }, eyes: [], spots };
  headCache.set(key, out);
  return out;
}

/** Draw `s` at (x, y), turned to `a` (mirrored when it faces left, so its back stays up); then `over` in its own frame. */
function put(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, a: number, over?: () => void): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(a);
  if (Math.cos(a) < 0) ctx.scale(1, -1);
  ctx.drawImage(s.c, -s.ox, -s.oy);
  over?.();
  ctx.restore();
}

/** Glints over a set of gems (in the sprite's frame), twinkling: little four-point stars, a soft bloom round each. */
function glints(ctx: CanvasRenderingContext2D, gems: readonly Gem[], i: number, now: number, bright: boolean): void {
  const op = ctx.globalCompositeOperation;
  for (let k = 0; k < gems.length; k++) {
    const g = gems[k];
    const ph = Math.sin(now / (260 + 90 * hsh(i, k, 12)) + hsh(i, k, 13) * 6.28);
    if (ph < (bright ? 0.2 : 0.55)) continue;
    const a = (ph - (bright ? 0.2 : 0.55)) / (bright ? 0.8 : 0.45);
    const gx = Math.round(g.u - g.r * 0.3);
    const gy = Math.round(g.v - g.r * 0.35);
    ctx.globalCompositeOperation = 'lighter';
    const r = g.r * (1.2 + a);
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    grad.addColorStop(0, `rgba(255,255,255,${0.35 * a})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
    ctx.globalCompositeOperation = op;
    const len = Math.round(1 + a * 3);
    ctx.fillStyle = GLINT[g.g];
    ctx.fillRect(gx - len, gy, len * 2 + 1, 1);
    ctx.fillRect(gx, gy - len, 1, len * 2 + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(gx, gy, 1, 1);
  }
}

/** A dragon along its body points (head first). */
export function drawDragon(ctx: CanvasRenderingContext2D, pts: readonly number[], _seed: number, frozen: boolean, frenzy: boolean, now: number): void {
  const n = pts.length >> 1;
  if (n < 2) return;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const P = (i: number) => Math.max(0, Math.min(n - 1, i));
  const dir = (i: number) => Math.atan2(pts[P(i - 1) * 2 + 1] - pts[P(i + 1) * 2 + 1], pts[P(i - 1) * 2] - pts[P(i + 1) * 2]);
  for (let i = n - 1; i >= 1; i--) {
    const { s, gems } = segSprite(i, n, frenzy);
    put(ctx, s, pts[i * 2], pts[i * 2 + 1], dir(i), () => glints(ctx, gems, i, now, frenzy));
  }
  const frame = frenzy ? Math.floor(now / 160) & 1 : 0;
  const h = headSprite(frenzy, frame, frozen, frenzy);
  put(ctx, h.s, pts[0], pts[1], Math.atan2(pts[1] - pts[3], pts[0] - pts[2]), () => glints(ctx, h.spots, 99, now, frenzy));
  ctx.imageSmoothingEnabled = smooth;
}

/** A section of a dead dragon, tumbling (its head, if it's the first). */
export function drawDragonGib(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, _seed: number, i: number, n = 15): void {
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  put(ctx, i === 0 ? headSprite(false, 0, true, false).s : segSprite(Math.min(i, n - 1), n, false).s, x, y, a);
  ctx.imageSmoothingEnabled = smooth;
}
