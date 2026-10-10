import type { GeyserState } from '../shared/frame.ts';
import { type Flora, FloraKind } from '../shared/frosting.ts';
import { CORAL_PALS, PALETTES, rnd } from './flora-palette.ts';
import { Mat } from '../shared/materials.ts';
import { GF_DEAD, GF_RUMBLE } from '../shared/protocol.ts';
import type { Terrain } from '../shared/terrain.ts';

/**
 * The planet's living frosting, drawn (client only, no gameplay) where
 * worldgen grew it (frosting.ts placeFlora), and only while the ground it
 * grows from still stands: dig it out, blow it up, and the plant's gone.
 *
 * - **Centipede plants**: a segmented stalk curling up out of the soil,
 *   every segment sprouting a pair of leg-like barbs, a glowing bud at its
 *   tip; it sways.
 * - **Coral**: gritty pixel sprites in seven real-coral forms (staghorn,
 *   sea fan, brain, table, pipe organ, finger, whip), glowing at the tips
 *   in the dark of the caves.
 * - **Tube worms**: a thicket of white tubes by the geysers, each with a
 *   pulsing crimson plume.
 * - **Hanging coral**: strands from cave roofs, beads of light along them.
 * - **Puffballs**: a clump of swollen, spotted caps.
 * - **Blister coral**: a stubby trunk hung with glowing sacs of caustic
 *   sap; swelling (about to burst) they grow and flash.
 *
 * Plants the server says are gone (World.flora) aren't drawn; the client
 * gibs them as they go (Game.floraState).
 *
 * And the geysers' glowing mouths (their smoke is particles: Game.geyserSmoke).
 */



/** Is the plant's ground still there (and its own spot open)? */
function standing(t: Terrain, f: Flora): boolean {
  if (t.get(f.x, f.y) === Mat.Air) return false;
  return f.kind === FloraKind.Hanging ? t.get(f.x, f.y + 1) === Mat.Air : t.get(f.x, f.y - 1) === Mat.Air;
}

/** Deep enough under the surface to be a cave: its glow shows. */
const inCave = (t: Terrain, f: Flora) => f.y > t.surfaceY(f.x) + 12;

export function drawFlora(ctx: CanvasRenderingContext2D, t: Terrain, list: readonly Flora[], dead: Uint8Array, swelling: ReadonlySet<number>, x0: number, y0: number, x1: number, y1: number, now: number): void {
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f.x < x0 - 24 || f.x > x1 + 24 || f.y < y0 - 30 || f.y > y1 + 30) continue;
    if (dead[i] || !standing(t, f)) continue;
    if (f.kind === FloraKind.Blister) {
      blister(ctx, f, now, swelling.has(i));
      continue;
    }
    const pal = PALETTES[Math.floor(rnd(f.seed, 0) * PALETTES.length)];
    if (f.kind === FloraKind.Centipede) centipede(ctx, f, pal, now);
    else if (f.kind === FloraKind.Coral) coral(ctx, f, now, inCave(t, f));
    else if (f.kind === FloraKind.Tubes) tubes(ctx, f, now);
    else if (f.kind === FloraKind.Hanging) hanging(ctx, f, pal, now);
    else puffs(ctx, f, pal, now, inCave(t, f));
  }
}

function centipede(ctx: CanvasRenderingContext2D, f: Flora, pal: string[], now: number): void {
  const segs = 6 + Math.floor(rnd(f.seed, 1) * 9);
  const lean = (rnd(f.seed, 2) - 0.5) * 0.9;
  const sway = Math.sin(now / 900 + rnd(f.seed, 3) * 6.28) * 0.25;
  let x = f.x + 0.5;
  let y = f.y;
  let a = -Math.PI / 2 + lean * 0.4;
  for (let i = 0; i < segs; i++) {
    const u = i / segs;
    // It curls over toward its tip, and sways most there.
    a += (lean * 0.35 + sway * u) * (0.4 + u);
    x += Math.cos(a) * 2;
    y += Math.sin(a) * 2;
    const px = Math.round(x);
    const py = Math.round(y);
    ctx.fillStyle = i % 2 ? pal[1] : pal[0];
    ctx.fillRect(px - 1, py - 1, 2, 2);
    // A pair of barbed legs off every segment, angled up and out.
    const leg = 2 + ((i + Math.floor(rnd(f.seed, 4) * 2)) % 2);
    ctx.fillStyle = pal[2];
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    for (const side of [-1, 1]) {
      for (let k = 1; k <= leg; k++) ctx.fillRect(Math.round(x + nx * side * k + Math.cos(a) * k * 0.6), Math.round(y + ny * side * k + Math.sin(a) * k * 0.6) - 1, 1, 1);
    }
  }
  // The bud: a bead of light.
  const pulse = 0.6 + 0.4 * Math.sin(now / 380 + f.seed);
  ctx.fillStyle = pal[3];
  ctx.globalAlpha = pulse;
  ctx.fillRect(Math.round(x + Math.cos(a) * 2) - 1, Math.round(y + Math.sin(a) * 2) - 1, 2, 2);
  ctx.globalAlpha = 1;
}

/**
 * Coral: gritty pixel-art sprites, one grown per plant from its seed and
 * cached. Seven forms, as real reefs have them:
 *
 * - **staghorn**: thick forking branches with blunt tips;
 * - **sea fan**: a wide lattice of fine branches, cross-linked into a net;
 * - **brain**: a low dome, meandering grooves worked over it;
 * - **table**: a stalk under one to three flat plates, frilled at the rim;
 * - **pipe organ**: a cluster of upright tubes, open and dark at the top;
 * - **finger**: stubby, knobbly pillars;
 * - **whip**: a few long, thin, wavy strands (the only ones that sway).
 *
 * Each is shaded per pixel: a dark outline where it meets the open, a lit
 * edge on its upper left, darker toward the root, and grit through it all
 * (pores and specks). In the caves its tips glow.
 */

interface CoralSprite {
  c: HTMLCanvasElement;
  /** The root's offset in the sprite (it's drawn with this pixel on the plant's root). */
  ox: number;
  oy: number;
  /** Tip pixels (sprite coords), for the cave glow. */
  tips: [number, number][];
  /** Whips sway; everything else is stony. */
  sways: boolean;
}

const CW = 36;
const CH = 30;
const coralSprites = new Map<number, CoralSprite>();

function coralSprite(seed: number): CoralSprite {
  let sp = coralSprites.get(seed);
  if (sp) return sp;
  const mask = new Uint8Array(CW * CH);
  const tips: [number, number][] = [];
  const ox = CW >> 1;
  const oy = CH - 1;
  const R = (k: number) => rnd(seed, 100 + k);
  let n = 0;
  const plot = (x: number, y: number, v = 1) => {
    const px = Math.round(ox + x);
    const py = Math.round(oy + y);
    if (px >= 0 && py >= 0 && px < CW && py < CH) mask[py * CW + px] = Math.max(mask[py * CW + px], v);
  };
  const disc = (x: number, y: number, r: number, v = 1) => {
    for (let dy = -Math.ceil(r); dy <= r; dy++) for (let dx = -Math.ceil(r); dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 0.3) plot(x + dx, y + dy, v);
  };
  const form = Math.floor(R(0) * 7);
  if (form === 0) {
    // Staghorn: thick forking branches.
    const grow = (x: number, y: number, a: number, len: number, w: number, d: number) => {
      for (let k = 0; k < len; k++) {
        x += Math.cos(a);
        y += Math.sin(a);
        disc(x, y, w);
        a += (R(n++) - 0.5) * 0.35;
      }
      if (d < 3 && len > 3) {
        grow(x, y, a - 0.5 - R(n++) * 0.3, Math.round(len * 0.75), Math.max(0.6, w - 0.3), d + 1);
        grow(x, y, a + 0.5 + R(n++) * 0.3, Math.round(len * 0.7), Math.max(0.6, w - 0.3), d + 1);
      } else tips.push([Math.round(ox + x), Math.round(oy + y)]);
    };
    grow(0, 0, -Math.PI / 2 + (R(1) - 0.5) * 0.4, 5 + Math.floor(R(2) * 4), 1.4, 0);
  } else if (form === 1) {
    // Sea fan: fine branches spreading in a fan, cross-linked into a net.
    const arms = 7 + Math.floor(R(1) * 5);
    const len = 12 + Math.floor(R(2) * 10);
    const ends: [number, number][] = [];
    for (let i = 0; i < arms; i++) {
      const a = -Math.PI / 2 + (i / (arms - 1) - 0.5) * (1.6 + R(3) * 0.6);
      let x = 0;
      let y = 0;
      const l = len * (0.75 + R(10 + i) * 0.25);
      for (let k = 0; k < l; k++) {
        x += Math.cos(a) + (R(n++) - 0.5) * 0.5;
        y += Math.sin(a);
        plot(x, y);
        if (k > 3 && k % 4 === 0) ends.push([x, y]);
      }
      tips.push([Math.round(ox + x), Math.round(oy + y)]);
    }
    // The net: rungs between neighbouring arms.
    for (let i = 0; i + 1 < ends.length; i++) {
      const [x0, y0] = ends[i];
      const [x1, y1] = ends[i + 1];
      if (Math.abs(x1 - x0) > 6 || Math.abs(y1 - y0) > 5) continue;
      for (let k = 0; k <= 4; k++) plot(x0 + ((x1 - x0) * k) / 4, y0 + ((y1 - y0) * k) / 4);
    }
    disc(0, -1, 1.2);
  } else if (form === 2) {
    // Brain coral: a dome, grooved.
    const rx = 6 + Math.floor(R(1) * 6);
    const ry = 4 + Math.floor(R(2) * 4);
    for (let y = -ry; y <= 0; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) plot(x, y);
    // Grooves: meandering lines over it (value 2: drawn dark).
    const f = 0.7 + R(3) * 0.6;
    for (let y = -ry + 1; y < 0; y++) for (let x = -rx + 1; x < rx; x++) if (Math.abs(Math.sin(x * f + Math.sin(y * 1.3 + R(4) * 6) * 2.2)) < 0.28) plot(x, y, 2);
    tips.push([ox, oy - ry]);
  } else if (form === 3) {
    // Table coral: a stalk and flat plates, frilled.
    const stalk = 4 + Math.floor(R(1) * 6);
    for (let y = 0; y > -stalk; y--) disc(0, y, 0.8);
    const plates = 1 + Math.floor(R(2) * 3);
    for (let p = 0; p < plates; p++) {
      const py = -stalk - p * (3 + Math.floor(R(3 + p) * 2));
      const w = 10 - p * 2 + Math.floor(R(6 + p) * 6);
      for (let x = -w; x <= w; x++) {
        plot(x, py);
        plot(x, py - 1);
        if (Math.abs(x) < w - 1) plot(x, py - 2);
        // Frills hanging off the rim.
        if (Math.abs(x) > w - 3 && R(n++) < 0.6) plot(x, py + 1);
      }
      if (p > 0) for (let y = py; y < py + 3; y++) plot(0, y);
      tips.push([Math.round(ox - w), Math.round(oy + py - 1)], [Math.round(ox + w), Math.round(oy + py - 1)]);
    }
  } else if (form === 4) {
    // Pipe organ: upright tubes, open at the top.
    const k = 3 + Math.floor(R(1) * 4);
    for (let i = 0; i < k; i++) {
      const x = Math.round((i - (k - 1) / 2) * 3 + (R(10 + i) - 0.5) * 2);
      const h = 5 + Math.floor(R(20 + i) * 14);
      for (let y = 0; y > -h; y--) {
        plot(x, y);
        plot(x + 1, y);
      }
      plot(x, -h, 2);
      plot(x + 1, -h, 2);
      plot(x - 1, -h);
      plot(x + 2, -h);
      tips.push([Math.round(ox + x), Math.round(oy - h)]);
    }
  } else if (form === 5) {
    // Finger coral: knobbly pillars.
    const k = 2 + Math.floor(R(1) * 4);
    for (let i = 0; i < k; i++) {
      const x0 = (i - (k - 1) / 2) * 4 + (R(10 + i) - 0.5) * 2;
      const h = 5 + Math.floor(R(20 + i) * 10);
      const lean = (R(30 + i) - 0.5) * 0.35;
      for (let y = 0; y > -h; y--) disc(x0 + -y * lean, y, 1.1 + (R(n++) < 0.25 ? 0.5 : 0));
      disc(x0 + h * lean, -h, 1.6);
      tips.push([Math.round(ox + x0 + h * lean), Math.round(oy - h - 1)]);
    }
  } else {
    // Whips: long, thin, wavy strands.
    const k = 2 + Math.floor(R(1) * 4);
    for (let i = 0; i < k; i++) {
      const h = 12 + Math.floor(R(10 + i) * 16);
      const ph = R(20 + i) * 6;
      const sx = (i - (k - 1) / 2) * 2;
      for (let y = 0; y > -h; y--) plot(sx + Math.sin(-y * 0.25 + ph) * (-y / h) * 3, y);
      tips.push([Math.round(ox + sx + Math.sin(h * 0.25 + ph) * 3), oy - h + 1]);
    }
  }
  // Shade it: outline, lit upper-left edges, darker at the root, and grit.
  const pal = CORAL_PALS[Math.floor(rnd(seed, 0) * CORAL_PALS.length)];
  const c = document.createElement('canvas');
  c.width = CW;
  c.height = CH;
  const ctx = c.getContext('2d')!;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= CW || y >= CH ? 0 : mask[y * CW + x]);
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const v = at(x, y);
      if (!v) continue;
      const g = rnd(seed, 1000 + y * CW + x);
      let tone: number;
      if (!at(x + 1, y) || !at(x, y + 1)) tone = 0; // outline, lower right
      else if (!at(x - 1, y) || !at(x, y - 1)) tone = g < 0.2 ? 3 : 4; // lit edge, upper left
      else tone = v === 2 ? 1 : g < 0.14 ? 1 : g > 0.9 ? 3 : 2; // body: pores and specks
      if (tone >= 2 && y > oy - 3 && g < 0.5) tone--; // darker at the root
      ctx.fillStyle = pal[tone];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  sp = { c, ox, oy, tips, sways: form === 6 };
  coralSprites.set(seed, sp);
  return sp;
}

function coral(ctx: CanvasRenderingContext2D, f: Flora, now: number, glow: boolean): void {
  const sp = coralSprite(f.seed);
  const pal = CORAL_PALS[Math.floor(rnd(f.seed, 0) * CORAL_PALS.length)];
  const x = f.x - sp.ox;
  const y = f.y - sp.oy - 1;
  if (sp.sways) {
    // Whips: the sprite sheared a pixel or two side to side, more at the top.
    const s = Math.sin(now / 1100 + f.seed) * 0.08;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.transform(1, 0, s, 1, 0, 0);
    ctx.drawImage(sp.c, -sp.ox, -sp.oy - 1);
    ctx.restore();
  } else ctx.drawImage(sp.c, x, y);
  if (glow) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 700 + f.seed);
    ctx.fillStyle = pal[5];
    for (const [tx, ty] of sp.tips) {
      ctx.globalAlpha = 0.55 + 0.45 * pulse;
      ctx.fillRect(x + tx, y + ty, 1, 1);
      ctx.globalAlpha = 0.14 * pulse;
      ctx.fillRect(x + tx - 1, y + ty - 1, 3, 3);
    }
    ctx.globalAlpha = 1;
  }
}

function tubes(ctx: CanvasRenderingContext2D, f: Flora, now: number): void {
  const n = 3 + Math.floor(rnd(f.seed, 1) * 4);
  for (let i = 0; i < n; i++) {
    const x = f.x - n + i * 2 + Math.round(rnd(f.seed, 10 + i));
    const h = 5 + Math.floor(rnd(f.seed, 20 + i) * 11);
    ctx.fillStyle = '#d8d0c4';
    ctx.fillRect(x, f.y - h, 1, h);
    ctx.fillStyle = '#9a9088';
    ctx.fillRect(x + 1, f.y - h + 1, 1, h - 1);
    // The plume: out, or (now and then) pulled in.
    const open = Math.sin(now / 600 + i * 1.7 + f.seed) > -0.6;
    ctx.fillStyle = open ? '#e02838' : '#801828';
    if (open) {
      ctx.fillRect(x - 1, f.y - h - 2, 3, 2);
      ctx.fillStyle = '#ff6070';
      ctx.fillRect(x, f.y - h - 3, 1, 1);
    } else ctx.fillRect(x, f.y - h - 1, 2, 1);
  }
}

function hanging(ctx: CanvasRenderingContext2D, f: Flora, pal: string[], now: number): void {
  const n = 2 + Math.floor(rnd(f.seed, 1) * 3);
  for (let s = 0; s < n; s++) {
    const len = 6 + Math.floor(rnd(f.seed, 10 + s) * 14);
    const ph = rnd(f.seed, 20 + s) * 6.28;
    for (let k = 1; k <= len; k++) {
      const x = Math.round(f.x + (s - n / 2) * 2 + Math.sin(now / 1100 + ph) * (k / len) * 2);
      ctx.fillStyle = k % 4 === 0 ? pal[2] : pal[0];
      ctx.fillRect(x, f.y + k, 1, 1);
      if (k === len || k % 6 === 0) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 500 + ph + k);
        ctx.globalAlpha = 0.5 + 0.5 * pulse;
        ctx.fillStyle = pal[3];
        ctx.fillRect(x, f.y + k, 1, 1);
        ctx.globalAlpha = 0.15 * pulse;
        ctx.fillRect(x - 1, f.y + k - 1, 3, 3);
        ctx.globalAlpha = 1;
      }
    }
  }
}

function puffs(ctx: CanvasRenderingContext2D, f: Flora, pal: string[], now: number, glow: boolean): void {
  const n = 2 + Math.floor(rnd(f.seed, 1) * 4);
  for (let i = 0; i < n; i++) {
    const r = 1 + Math.floor(rnd(f.seed, 10 + i) * 3);
    const stalk = 1 + Math.floor(rnd(f.seed, 20 + i) * 4);
    const x = f.x + Math.round((i - n / 2) * 3 + rnd(f.seed, 30 + i) * 2);
    const breathe = Math.sin(now / 1400 + i + f.seed) > 0.85 ? 1 : 0;
    ctx.fillStyle = pal[0];
    ctx.fillRect(x, f.y - stalk, 1, stalk);
    const cy = f.y - stalk - r;
    ctx.fillStyle = pal[2];
    ctx.fillRect(x - r, cy - r + 1, r * 2 + 1 + breathe, r * 2 - 1);
    ctx.fillRect(x - r + 1, cy - r, r * 2 - 1 + breathe, r * 2 + 1);
    ctx.fillStyle = pal[3];
    ctx.fillRect(x - Math.floor(r / 2), cy - Math.floor(r / 2), 1, 1);
    if (glow) {
      ctx.globalAlpha = 0.12;
      ctx.fillRect(x - r - 1, cy - r - 1, r * 2 + 3, r * 2 + 3);
      ctx.globalAlpha = 1;
    }
  }
}

/** A blister coral: a stubby forked trunk, sacs of glowing sap hung off it; swelling, they bloat and flash. */
function blister(ctx: CanvasRenderingContext2D, f: Flora, now: number, swell: boolean): void {
  const pal = CORAL_PALS[Math.floor(rnd(f.seed, 0) * CORAL_PALS.length)];
  const h = 6 + Math.floor(rnd(f.seed, 1) * 5);
  const jit = swell ? Math.round(Math.sin(now / 30)) : 0;
  // The trunk, two cells thick, and a branch or two off it.
  ctx.fillStyle = pal[1];
  ctx.fillRect(f.x, f.y - h, 2, h);
  ctx.fillStyle = pal[0];
  ctx.fillRect(f.x + 1, f.y - h + 1, 1, h - 1);
  const arms = 1 + Math.floor(rnd(f.seed, 2) * 2);
  const ends: [number, number][] = [[f.x + 1, f.y - h - 1]];
  for (let a = 0; a < arms; a++) {
    const side = a % 2 ? 1 : -1;
    const at = f.y - 2 - Math.floor(rnd(f.seed, 3 + a) * (h - 3));
    const len = 2 + Math.floor(rnd(f.seed, 5 + a) * 3);
    ctx.fillStyle = pal[1];
    for (let k = 1; k <= len; k++) ctx.fillRect(f.x + (side > 0 ? 1 : 0) + side * k, at - Math.floor(k / 2), 1, 1);
    ends.push([f.x + (side > 0 ? 1 : 0) + side * len, at - Math.floor(len / 2) - 1]);
  }
  // The sacs: swollen, translucent, the sap glowing in them.
  const pulse = 0.5 + 0.5 * Math.sin(now / (swell ? 60 : 900) + f.seed);
  ends.forEach(([ex, ey], k) => {
    const r = 1 + Math.floor(rnd(f.seed, 9 + k) * 2) + (swell ? 1 : 0);
    const x = ex + jit;
    const y = ey - r + 1;
    ctx.fillStyle = swell && pulse > 0.5 ? '#fff8c0' : '#d8f060';
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x - r, y - r + 1, r * 2 + 1, r * 2 - 1);
    ctx.fillRect(x - r + 1, y - r, r * 2 - 1, r * 2 + 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f8ffd0';
    ctx.fillRect(x - Math.floor(r / 2), y - Math.floor(r / 2), 1, 1);
    // Its glow.
    ctx.globalAlpha = (swell ? 0.35 : 0.12) * (0.6 + 0.4 * pulse);
    ctx.fillStyle = '#c8f040';
    ctx.fillRect(x - r - 2, y - r - 2, r * 2 + 5, r * 2 + 5);
    ctx.globalAlpha = 1;
  });
}



/**
 * The geysers in view: just the hot glow in each mouth (flickering harder as
 * it rumbles). Their steam, sparks and deadly cloud are real smoke
 * particles, the guns' kind (Game.geyserSmoke).
 */
export function drawGeysers(ctx: CanvasRenderingContext2D, list: readonly GeyserState[], x0: number, y0: number, x1: number, y1: number, now: number): void {
  list.forEach((g, i) => {
    if (g.flags & GF_DEAD) return;
    if (g.x < x0 - 10 || g.x > x1 + 10 || g.y < y0 - 10 || g.y > y1 + 10) return;
    const rumble = (g.flags & GF_RUMBLE) !== 0;
    const flick = rumble ? (Math.floor(now / 50) % 2 ? 1 : 0.55) : 0.7 + 0.3 * Math.sin(now / 500 + i);
    ctx.globalAlpha = 0.35 * flick;
    ctx.fillStyle = rumble ? '#ff5020' : '#ff9a40';
    ctx.fillRect(g.x - 2, g.y - 1, 5, 3);
    ctx.globalAlpha = flick;
    ctx.fillStyle = rumble ? '#fff0a0' : '#ffc060';
    ctx.fillRect(g.x - 1, g.y, 3, 1);
    ctx.globalAlpha = 1;
  });
}
