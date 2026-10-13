import { DRAGON_R } from '../shared/wildlife.ts';

/**
 * The dragon, in pixels (wildlife.ts DRAGON_*): the basilisk three times
 * over. Where the other creatures wear the caves' GEMMs and stone to pass
 * for part of the rock, this one has no reason to hide: it wears them to
 * show off, an apex predator in a dazzling, horrible splendour.
 *
 * - **Body**: the basilisk's lumpy rock plates and terrain camouflage at
 *   three times the scale, rimmed in raw flesh, fringed with cilia, each
 *   stretch of it dressed in its own stone: dark rock blazing with GEMM
 *   seams and crystal rosettes, a hoard crusted solid with crystal, red and
 *   ochre strata hung with dripstone, coral glowing with polyps. Crystal
 *   spines crowd its back in clusters; glints play over it all as it moves
 *   (brighter in its frenzy).
 * - **Head**: the basilisk's flytrap jaw, gem-seamed and toothed, gaping
 *   over a maw glowing with the fire it spits; cold eyes (burning red in
 *   its frenzy); crested like a basilisk lizard, a tall casque of GEMM blades
 *   raked back off its snout, a beard of shards under its jaw, crystal horns
 *   curling back off the hinge; and a sail rising off its skull like a dimetrodon's: bone
 *   spines with webbing strung between them, banded in gem colours,
 *   eyespots in it, its edge sagging between the spines.
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

/**
 * The body, as the basilisk's is made (beast-art.ts drawBasilisk), three
 * times over: lumpy plates, each section dressed as something the ground is
 * made of, living flesh showing round their rims (blotched, pored), cilia
 * fringing its underside. Where the basilisk's dress is camouflage, the
 * dragon's is display, opulent and terrible: its rock is dark and red, run
 * through with broad, blazing GEMM seams and clusters; some sections are
 * a hoard, crusted solid with faceted crystal; its strata are banded red and
 * ochre, hung with dripstone; its coral glows.
 */
const Dress = { Vein: 0, Strata: 1, Coral: 2, Hoard: 3 } as const;
const dressOf = (i: number) => {
  let at = 1;
  for (let sec = 0; sec < 12; sec++) {
    const len = 2 + Math.floor(hsh(sec, 5, 7) * 2);
    if (i < at + len) return [Dress.Vein, Dress.Hoard, Dress.Strata, Dress.Vein, Dress.Coral, Dress.Hoard][Math.floor(hsh(sec, 6, 8) * 6)];
    at += len;
  }
  return Dress.Vein;
};
const D_ROCK = ['#1e0e10', '#2c1418', '#3a1a1e', '#4a2226', '#5a2a2c'];
const D_STRATA = ['#5a2418', '#7a3420', '#9a5228', '#b8763a', '#d0965a'];
const D_CORAL = ['#4e1020', '#7a1a30', '#a82a44', '#d85a74', '#ffa8bc'];
const D_FLESH = ['#3a0c14', '#5a1620', '#7a222c', '#9a3440'];
const D_CILIA = ['#c8a098', '#ead0c4'];
/** Basilisk-sized cells this many cells across (its texture at three times the scale). */
const S3 = 3;

const segCache = new Map<string, Sprite>();
const segGems = new Map<string, Gem[]>();
/** Body section `i` of `n` (1: its neck, n - 1: the tip of its tail), awake or (`frozen`) as still as stone; `bright`: its frenzy, its gems ablaze. */
function segSprite(i: number, n: number, bright: boolean, frozen = false): { s: Sprite; gems: Gem[] } {
  const key = `${i}|${n}|${bright ? 1 : 0}|${frozen ? 1 : 0}`;
  const hit = segCache.get(key);
  if (hit) return { s: hit, gems: segGems.get(key)! };
  const f = i / Math.max(1, n - 1);
  const w = 11 * S3 * (1 - 0.42 * f);
  const len = 10 * S3;
  const dress = dressOf(i);
  const cilia = dress === Dress.Coral || i % 3 === 1;
  const reach = Math.ceil(Math.max(w, len)) + 4 * S3;
  const Wd = reach * 2 + 2;
  const Hd = reach * 2 + 2;
  const ox = reach + 1;
  const oy = reach + 1;
  const gems: Gem[] = [];
  const k = i * 131 + 7;
  // Its crystal clusters (and so its glints): a few, set into its back, more on a hoard.
  const nGem = dress === Dress.Hoard ? 4 : dress === Dress.Vein ? 2 : 0;
  for (let g = 0; g < nGem; g++) gems.push({ u: ((g + 0.5) / nGem - 0.5) * len * 1.3 + (hsh(i, g, 21) - 0.5) * len * 0.2, v: -w * (0.2 + 0.45 * hsh(i, g, 22)), r: w * (0.13 + 0.09 * hsh(i, g, 23)), g: Math.floor(hsh(i, g, 24) * 3) });
  /** Light across it: lit along its back, shadowed under its belly (a round body, not a flat one). */
  const lightAt = (v: number) => (v < -w * 0.45 ? 1 : v > w * 0.35 ? -1 : 0);
  const pick = (pal: readonly string[], t: number, v: number) => rgb(pal[Math.max(0, Math.min(pal.length - 1, Math.floor(t * pal.length) + lightAt(v)))]);
  /** A cell of its dress at (u, v). */
  const dressPixel = (u: number, v: number): RGBA => {
    const h = hsh(Math.floor(u), Math.floor(v), k);
    if (dress === Dress.Vein || dress === Dress.Hoard) {
      for (const g of gems) {
        const c = crystal(u, v, g, bright);
        if (c) return c;
      }
      // Seams of GEMM wandering through the rock: veins, catching the light.
      const wob = (vn(u, v, 10, k + 4) - 0.5) * w * 0.35;
      const seam = Math.abs(v - w * 0.3 * Math.sin(u * 0.07 + i * 1.7) - wob);
      const seam2 = Math.abs(v + w * 0.35 - w * 0.18 * Math.sin(u * 0.13 + i * 2.3) - wob * 0.5);
      const width = dress === Dress.Hoard ? 2.6 : 1.8;
      if (seam < width * S3 * 0.5 || seam2 < width * S3 * 0.3) {
        const pal = GEMS[(i + (u > 0 ? 1 : 0)) % 3];
        const edge = seam < width * S3 * 0.5 ? seam / (width * S3 * 0.5) : seam2 / (width * S3 * 0.3);
        return rgb(pal[Math.min(3, (edge < 0.35 ? 3 : edge < 0.7 ? 2 : 1) + (bright && edge > 0.35 ? 1 : 0) - (v > w * 0.3 ? 1 : 0))]);
      }
      // Specks of crystal in the rock round them (a hoard's thick with them).
      if (h > (dress === Dress.Hoard ? 0.9 : 0.965) && vn(u, v, 8, k + 6) > 0.45) return rgb(GEMS[Math.floor(hsh(Math.floor(u), Math.floor(v), k + 7) * 3)][2]);
      const t = vn(u, v, 7, k) * 0.7 + vn(u, v, 2.5, k + 1) * 0.3;
      return pick(D_ROCK, t, v);
    }
    if (dress === Dress.Strata) {
      const layer = (v + Math.sin(u * 0.08 + i) * 2 * S3 + vn(u, v, 9, k) * 4) / (2.2 * S3);
      const t = ((Math.floor(layer) % D_STRATA.length) + D_STRATA.length) % D_STRATA.length;
      return rgb(D_STRATA[Math.max(0, Math.min(4, t + (h > 0.9 ? 1 : 0) + lightAt(v)))]);
    }
    // Coral grown over it: soft lobes, and its polyps glowing here and there.
    const lobe = vn(u, v, 5, k + 5) * 0.55 + vn(u, v, 2, k + 12) * 0.3 + vn(u, v, 1.1, k + 13) * 0.15;
    // Its polyps: bright points, scattered over the lobes.
    if (h > 0.975 && lobe > 0.55) return rgb(bright ? '#fff4b0' : D_CORAL[4]);
    // (The rock it grew on, showing between the lobes.)
    if (lobe < 0.44) return pick(D_ROCK, vn(u, v, 7, k) * 0.8, v);
    return pick(D_CORAL, (lobe - 0.44) * 2.2, v);
  };
  const c = bake(Wd, Hd, (x, y) => {
    const u = x + 0.5 - ox;
    const v = y + 0.5 - oy;
    // A lumpy plate, not a clean oval.
    const th = Math.atan2(v, u);
    const lump = 1 + 0.09 * Math.sin(th * 5 + i * 1.3) + 0.05 * Math.sin(th * 9 + i);
    const e = ((u / len) ** 2 + (v / w) ** 2) / (lump * lump);
    if (e > 1) {
      // Cilia: fine fleshy hairs off its underside (and over the coral's back), in fringes.
      if (cilia && Math.abs(u) < len * 0.75) {
        const strand = (((u + 300) % (3.2 * S3)) + 3.2 * S3) % (3.2 * S3) < 1.2;
        const out = v > 0 ? v - w : dress === Dress.Coral ? -v - w : -1;
        if (strand && out > 0 && out < (2 + ((Math.floor(u / (3.2 * S3)) + i) & 1)) * S3) return out > 1.6 * S3 ? rgb(D_CILIA[1]) : rgb(D_CILIA[0]);
      }
      // A crest of crystal spines along its spine, gem by gem.
      const sp = 3 * S3;
      const su = (((u + 300) % sp) + sp) % sp;
      const ci = Math.floor((u + 300) / sp);
      // (In clusters, not a fence: some bare stretches, some crowded with tall ones.)
      const crowd = vn(ci * 3.1 + i * 17, 0, 1.7, 77);
      if (v < 0 && Math.abs(u) < len * 0.8 && crowd > 0.4) {
        const top = -w - (1.5 + 6 * hsh(ci, i, 9) * (crowd - 0.3)) * (1 - 0.5 * f) * S3 * (1 - Math.abs(su - sp / 2) / (sp * 0.5));
        if (v >= top && v < -w * 0.9) {
          const pal = GEMS[Math.floor(hsh(ci, i, 10) * 3)];
          return rgb(v < top + 1.5 ? pal[3] : su < sp / 2 ? pal[2] : pal[1]);
        }
      }
      return 0;
    }
    const h = hsh(Math.floor(u), Math.floor(v), k + 3);
    if (e > 0.86 && !frozen) return OUTLINE;
    // Round the rim, where plate gives way: living flesh, blotched, pored.
    if (e > 0.62 && vn(u, v, 5, k + 3) > 0.45) return h < 0.06 ? rgb('#1a0408') : rgb(D_FLESH[Math.min(3, Math.floor(vn(u, v, 3.5, k + 9) * 4.4))]);
    let px = dressPixel(u, v);
    // (Grit over all of it.)
    if (h > 0.97) px = GRIT;
    return px;
  });
  // Dripstone off the strata's underside: stalactites, hanging.
  if (dress === Dress.Strata) {
    const g = c.getContext('2d')!;
    for (let sIdx = 0; sIdx < 3; sIdx++) {
      const sx = ox + (sIdx - 1) * len * 0.6;
      const sl = (3 + Math.floor(hsh(i, sIdx, 31) * 6)) * S3;
      const by = oy + w * 0.7;
      for (let t = 0; t < sl; t++) {
        const half = Math.max(0, Math.round((1 - t / sl) * S3 * 1.2));
        g.fillStyle = t < 2 ? D_STRATA[4] : D_STRATA[2 + (t % 2)];
        g.fillRect(Math.round(sx - half), Math.round(by + t), half * 2 + 1, 1);
      }
    }
  }
  const sp: Sprite = { c, ox, oy };
  segCache.set(key, sp);
  segGems.set(key, gems);
  return { s: sp, gems };
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
  const gape = open ? 0.22 + frame * 0.18 : 0;
  const Wd = Math.ceil(back * 1.9 + L * 1.25 + sail * 0.5) + 10;
  const Hd = Math.ceil(W * 2.6 + sail + L * 1.25 * Math.sin(gape) * 2) + 10;
  const ox = Math.ceil(back * 1.9 + sail * 0.35) + 5;
  const oy = Math.ceil(W + sail) + 4;
  // Half its height along it: a heavy skull, a blunt rounded snout.
  // (The flytrap's outline: its skull, then the upper flap tapering to its tip.)
  const hw = (u: number) => (u < -back ? W * 0.82 : u <= 0 ? W * (1 - Math.max(0, -u - back * 0.45) / back) : W * (1 - u / (L * 1.25)));
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
    // The flytrap (the basilisk's, three times over): two flaps of plate hinged at the back, rimmed with
    // long teeth that interlock along the seam, shut; in its frenzy they gape, working, over a maw lit by
    // the fire it spits. Each flap rasterised through its own frame.
    const FL = L * 1.25;
    for (const sd of [-1, 1]) {
      const a = sd * gape;
      const fu = u * Math.cos(a) + v * Math.sin(a);
      const fv = (-u * Math.sin(a) + v * Math.cos(a)) * sd; // (0 at its inner rim, out to its outer edge)
      if (fu < 0 || fu > FL) continue;
      const half = W * (1 - fu / FL);
      const tu = (fu - 2 * S3 + (sd > 0 ? 1.25 * S3 : 0)) % (2.5 * S3);
      if (!asleep && fv < 0 && fv > -3.6 * S3 && fu > 2 * S3 && fu < FL - 2 * S3 && Math.abs(tu - 1.25 * S3) < (0.55 - (-fv / (3.6 * S3)) * 0.3) * S3) return fv < -2.6 * S3 ? rgb('#f4ecd8') : TOOTH;
      // Its crests, like a basilisk lizard's: off the top of its snout a tall casque of crystal blades,
      // raked back, banded up from dark to blazing; under its jaw a beard of shorter shards.
      const out = fv - half;
      if (out > 0) {
        const top = sd < 0;
        const c0 = FL * (top ? 0.08 : 0.2);
        const c1 = FL * (top ? 0.82 : 0.7);
        if (fu > c0 && fu < c1) {
          const ph = (fu - c0) / (c1 - c0);
          // (The casque's profile: rising steep from its back, its peak well back, tapering to the nose.)
          const H = top ? W * 1.6 * Math.sin(Math.PI * Math.pow(ph, 0.7)) ** 0.8 : W * 0.45 * Math.sin(Math.PI * ph);
          const P = (top ? 4.2 : 2.8) * S3;
          const bu = fu + out * (top ? 0.75 : 0.5); // (each blade raked back)
          const bi = Math.floor(bu / P);
          const bt = (((bu % P) + P) % P) / P; // across the blade, 0..1
          const hb = H * (0.7 + 0.3 * hsh(bi, sd, 61));
          // The casque's lobe: a solid sheet of crystal (the beard's only shards), its blades breaking out of its edge.
          const sheet = top ? H * 0.55 : 0;
          const wide = 0.5 * (1 - Math.max(0, out - sheet) / Math.max(1, hb - sheet));
          const inBlade = out < hb && Math.abs(bt - 0.5) < wide;
          if (inBlade || out < sheet) {
            const edgeOut = inBlade ? hb : sheet;
            if (out > edgeOut - 1.3 || (inBlade && out > sheet && Math.abs(bt - 0.5) > wide - 0.1)) return OUTLINE;
            const q = out / hb;
            // (Ribs up each blade, the facets either side of them lit and shadowed.)
            if (inBlade && Math.abs(bt - 0.5) < 0.05 && q > 0.15) return rgb(GEMS[(bi + (top ? 0 : 1)) % 3][3]);
            const pal = GEMS[(bi + (top ? 0 : 1)) % 3];
            const lvl = q < 0.18 ? 0 : q < 0.45 ? 1 : q < 0.75 ? 2 : 3;
            if (hsh(Math.floor(u), Math.floor(v), 62) > 0.96) return rgb(pal[3]);
            return rgb(pal[Math.max(0, Math.min(3, lvl + (bt < 0.5 ? 1 : 0) + (bright ? 1 : 0)))]);
          }
        }
        continue;
      }
      if (fv < 0) continue;
      if (fv > half - 1.4) return OUTLINE;
      // Veined plate: dark red rock, a GEMM seam down its length, pale at its inner rim.
      if (fv < 1.4 * S3) return rgb('#b8a090');
      const seam = Math.abs(fv - half * 0.5 - Math.sin(fu * 0.12 + sd) * half * 0.15);
      if (seam < 1.1 * S3) return rgb(GEMS[sd > 0 ? 1 : 0][seam < 0.45 * S3 ? 3 : bright ? 2 : 1]);
      if (Math.abs((((fu * 0.7 + fv * 1.3) % (4 * S3)) + 4 * S3) % (4 * S3) - 2 * S3) < 0.5) return rgb(D_ROCK[0]);
      return rgb(D_ROCK[Math.min(4, 1 + Math.floor(vn(fu, fv, 6, 81) * 3.6) + (sd < 0 ? 1 : 0))]);
    }
    // The maw between the flaps: dark, deep, lit from inside by its fire.
    if (gape > 0 && u > 0 && u < FL && Math.abs(v) < Math.tan(gape) * u) return u > FL * 0.6 ? THROAT_DEEP : Math.abs(v) > Math.tan(gape) * u - 2 * S3 ? rgb('#ffb040') : THROAT;
    // Its horns: crystal, swept back off the hinge below the sail, one either side (the far one shorter, darker).
    for (const [hu, hv, tu2, tv2, g, dim] of [
      [-back * 0.15, W * 0.55, -back * 1.05, W * 1.05, 1, 0],
      [-back * 0.3, -W * 0.1, -back * 0.95, W * 0.5, 0, 1],
    ] as const) {
      const du = tu2 - hu;
      const dv = tv2 - hv;
      const s2 = Math.max(0, Math.min(1, ((u - hu) * du + (v - hv) * dv) / (du * du + dv * dv)));
      // (Curling up at the tip.)
      const d = Math.hypot(u - (hu + du * s2), v - (hv + dv * s2) + s2 * s2 * W * 0.35);
      const r = (1 - s2) * 1.8 * S3 + 0.8;
      if (d < r) {
        if (d > r - 1.3) return OUTLINE;
        const lit = (u - (hu + du * s2)) * dv - (v - (hv + dv * s2)) * du < 0;
        return rgb(GEMS[g][Math.max(0, Math.min(3, (s2 > 0.7 ? 3 : s2 > 0.3 ? 2 : 1) - (lit ? 0 : 1) - dim + (bright ? 1 : 0)))]);
      }
    }
    // Its skull: the back of the wedge, plate dressed as its body is, a crest down its middle.
    if (u > 0.5 || u < -back) return 0;
    const sh = W * (1 - Math.max(0, -u - back * 0.45) / back);
    if (Math.abs(v) > sh) return 0;
    if (Math.abs(v) > sh - 1.4) return OUTLINE;
    // Its eyes, either side: small, cold, burning in its frenzy.
    for (const sd of [-1, 1]) {
      const ed = Math.hypot(u + 2 * S3, v - sd * W * 0.5);
      if (ed < 2.2 * S3) return asleep ? (ed < 1.2 * S3 ? OUTLINE : rgb(D_ROCK[2])) : ed < 0.8 * S3 ? rgb('#fffef0') : ed < 1.5 * S3 ? rgb(bright ? '#ff3a2a' : GEMS[1][1]) : rgb(bright ? '#7a0c08' : GEMS[1][0]);
    }
    if (Math.abs(v) < 2 * S3) return rgb(D_ROCK[4]);
    const brow: Gem = { u: -back * 0.45, v: -sh * 0.45, r: W * 0.22, g: 2 };
    const bc = crystal(u, v, brow, bright);
    if (bc) return bc;
    if (hsh(Math.floor(u), Math.floor(v), 91) > 0.97) return GRIT;
    return rgb(D_ROCK[Math.min(4, 1 + Math.floor(vn(u, v, 6, 91) * 3.6) + (v < 0 ? 1 : 0))]);
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
    const { s, gems } = segSprite(i, n, frenzy, frozen);
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
