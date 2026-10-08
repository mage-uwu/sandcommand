/**
 * Pixel-art sprites, authored as character grids and baked to canvases on
 * demand. Body frames and gib pieces are tinted per player color; weapons are
 * color-neutral and pre-rotated with nearest-neighbour inverse mapping, so a
 * gun at any angle still lands on the world's pixel grid.
 */

import { ALL_CRAFT_PARTS, craftPartAt } from '../shared/craft.ts';

type Grid = readonly string[];

// Body: 10x16, facing right. The 8x14 hitbox maps to columns 1..8, rows 2..15.
// Columns 0-2 are the jetpack on the clone's back.
const BODY: Record<string, Grid> = {
  idle: [
    '...KKKK...',
    '..KLLHHK..',
    '..KLHHVVK.',
    '..KHHHVvK.',
    '...KHHHK..',
    '.KKKTTTK..',
    'KggKhTTTK.',
    'KgGKhTTtK.',
    'KgGKhTTtK.',
    'KGGKTTttK.',
    '.KKKbbbbK.',
    '...KPPPPK.',
    '...KPKKPK.',
    '...KPK.KPK',
    '..KBBK.KBK',
    '..KKKK.KKK',
  ],
  strideA: [
    '...KKKK...',
    '..KLLHHK..',
    '..KLHHVVK.',
    '..KHHHVvK.',
    '...KHHHK..',
    '.KKKTTTK..',
    'KggKhTTTK.',
    'KgGKhTTtK.',
    'KgGKhTTtK.',
    'KGGKTTttK.',
    '.KKKbbbbK.',
    '..KPPPPPK.',
    '.KPPKKPPK.',
    'KPPK..KPK.',
    'KBK...KBBK',
    'KKK...KKKK',
  ],
  pass: [
    '..........',
    '...KKKK...',
    '..KLLHHK..',
    '..KLHHVVK.',
    '..KHHHVvK.',
    '...KHHHK..',
    '.KKKTTTK..',
    'KggKhTTTK.',
    'KgGKhTTtK.',
    'KGGKTTttK.',
    '.KKKbbbbK.',
    '...KPPPK..',
    '...KPPPK..',
    '...KPKPK..',
    '...KBKBBK.',
    '...KKKKKK.',
  ],
  strideB: [
    '...KKKK...',
    '..KLLHHK..',
    '..KLHHVVK.',
    '..KHHHVvK.',
    '...KHHHK..',
    '.KKKTTTK..',
    'KggKhTTTK.',
    'KgGKhTTtK.',
    'KgGKhTTtK.',
    'KGGKTTttK.',
    '.KKKbbbbK.',
    '...KPPPPK.',
    '..KPPKKPPK',
    '..KPK..KPK',
    '.KBBK...KB',
    '.KKKK...KK',
  ],
  air: [
    '...KKKK...',
    '..KLLHHK..',
    '..KLHHVVK.',
    '..KHHHVvK.',
    '...KHHHK..',
    '.KKKTTTK..',
    'KggKhTTTK.',
    'KgGKhTTtK.',
    'KgGKhTTtK.',
    'KGGKTTttK.',
    '.KKKbbbbK.',
    '...KPPPK..',
    '...KPKPPK.',
    '..KPK.KPK.',
    '..KBK..KBK',
    '..KK...KK.',
  ],
};

export const BODY_W = 10;
export const BODY_H = 16;
export type BodyFrame = keyof typeof BODY;
export const WALK_CYCLE: BodyFrame[] = ['strideA', 'pass', 'strideB', 'pass'];

// Weapons, indexed like WEAPONS: pointing right, pivot (shoulder) at the given
// cell, arm + glove included. Barrel length matches each WeaponDef's muzzle offset.
interface GunDef {
  grid: Grid;
  px: number;
  py: number;
}
const GUNS: GunDef[] = [
  {
    // Rifle
    grid: [
      '....KKK.......',
      'KAAKKMMMMMMMMK',
      'KAAKmKKKKK.KK.',
      '.KK.KK........',
    ],
    px: 1,
    py: 1,
  },
  {
    // Bazooka
    grid: [
      '...KKKKKKKKKKK.',
      'KAAKOOOOOOOOOOK',
      'KAAKOooOOOOOOrK',
      '.KKKKKKoKKKKKK.',
      '......KK.......',
    ],
    px: 1,
    py: 1,
  },
  {
    // Grenade in hand
    grid: [
      '....KK.',
      'KAAKNNK',
      'KAAKNnK',
      '.KK.KK.',
    ],
    px: 1,
    py: 1,
  },
  {
    // Sniper rifle: long barrel, scope on top
    grid: [
      '......KKKKK........',
      '.....KMVVvMK.......',
      'KAAKKMMMMMMMMMMMMMK',
      'KAAKmmmKKKKKKKKKKK.',
      '.KK.KmK............',
    ],
    px: 1,
    py: 2,
  },
  {
    // Digger
    grid: [
      '...KKKKK....',
      'KAAKYYYYKKKK',
      'KAAKYyyYDDDK',
      '.KKKYYYYKKKK',
      '...KKKKK....',
    ],
    px: 1,
    py: 2,
  },
  {
    // Materializer: a boxy projector with a cyan emitter
    grid: [
      '...KKKKKK.',
      'KAAKGGgGVK',
      'KAAKGGGGvK',
      '.KKKKKKKK.',
    ],
    px: 1,
    py: 1,
  },
];

// Gib pieces (center-anchored), indexed by the GIB_* ids in effects.ts.
const GIBS: Grid[] = [
  ['.KKK.', 'KLLHK', 'KHVVK', '.KKK.'], // helmet with visor
  ['KTT', 'TTt', 'Ttt'], // torso chunk
  ['KTh', 'TTt', 'tTK'], // torso chunk
  ['KA', 'AA', 'KK'], // arm
  ['KP', 'PP', 'PP', 'BB'], // leg
  ['KP', 'PP', 'BB'], // leg stump
  ['Kgg', 'gGK', 'GGK', 'KKK'], // jetpack
  ['.RR', 'RRr', 'Rr.'], // meat
  ['RR', 'Rr'], // meat
  ['Rr'], // meat
  ['.KK.', 'KSSK', 'KSeK', '.KR.'], // bare head (helmet already gone)
  ['KOOK', 'OooO', 'OooO', 'KOOK'], // vest plate
  ['.KK.', 'KLHK', 'KHHK'], // rocket nose cone
  ['KLHK', 'LHHK', 'KTTK', 'KHHK'], // rocket hull plate
  ['KGK', 'GGK', 'GK.'], // rocket fin
  ['KDDK', 'DMMD', 'KDDK'], // rocket nozzle
];

// Drop rocket, 14x28 (the 12x26 hull box plus a one-cell margin), centred on
// the rocket's centre of mass.
const CRAFT_SPRITE_W = 14;
const CRAFT_SPRITE_H = 28;
const CRAFT: Grid = [
  '......KK......',
  '.....KLLK.....',
  '.....KLHK.....',
  '....KLHHHK....',
  '....KLHHHK....',
  '...KLHHHHHK...',
  '...KLHVVHHK...',
  '...KLHVvHHK...',
  '...KLHHHHHK...',
  '...KTTTTTTK...',
  '...KttttttK...',
  '...KLHHHHHK...',
  '...KLHHHHHK...',
  '...KLHGGHHK...',
  '...KLHGGHHK...',
  '...KLHGGHHK...',
  '...KLHHHHHK...',
  '...KLHHHHHK...',
  '...KTTTTTTK...',
  '..KKLHHHHHKK..',
  '.KGKLHHHHHKGK.',
  '.KGKLHHHHHKGK.',
  'KGGKLHHHHHKGGK',
  'KGGKKHHHHKKGGK',
  'KGK.KDDDDK.KGK',
  'KK..KDMMDK..KK',
  '....KDDDDK....',
  '.....KKKK.....',
];

function shade(rgb: number, k: number): number {
  const r = Math.min(255, Math.round(((rgb >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((rgb >> 8) & 255) * k));
  const b = Math.min(255, Math.round((rgb & 255) * k));
  return (r << 16) | (g << 8) | b;
}
function lighten(rgb: number, t: number): number {
  const f = (c: number) => Math.round(c + (255 - c) * t);
  return (f((rgb >> 16) & 255) << 16) | (f((rgb >> 8) & 255) << 8) | f(rgb & 255);
}

/** Palette char -> 0xRRGGBB, or -1 for transparent. */
function paletteFor(team: number): Record<string, number> {
  return {
    K: 0x141012, // outline
    L: 0xa9b0b8, // helmet highlight
    H: 0x6b7280, // helmet
    V: 0x58e0ff, // visor
    v: 0x1a7a9a, // visor shade
    T: team,
    t: shade(team, 0.68),
    h: lighten(team, 0.35),
    b: 0x2a2420, // belt
    P: 0x3b4234, // fatigues
    B: 0x1f1a16, // boots
    g: 0x8a9096, // jetpack light
    G: 0x50565c, // jetpack
    A: 0x5e646a, // sleeve
    M: 0x2e3236, // rifle metal
    m: 0x6a5032, // rifle stock
    O: 0x5a6b34, // bazooka tube
    o: 0x3c4822, // bazooka shade
    r: 0xd03020, // warhead tip
    N: 0x4e5e2a, // grenade
    n: 0x2c3618,
    Y: 0xe0b030, // digger body
    y: 0x8a6a1a,
    D: 0x9a9a9a, // digger nozzle
    R: 0xa01818, // meat / stump
    S: 0xd2a684, // skin
    e: 0x1c1c22, // eye
    // r (lowercase) doubles as warhead red / meat shade
  };
}

// Body-sprite pixel -> part, in unflipped sprite coordinates (10x16 grid,
// hitbox at columns 1..8, rows 2..15).
const P_HEAD = 0;
const P_TORSO = 1;
const P_LEG_B = 4;
const P_LEG_F = 5;
const P_HELMET = 6;
const P_VEST = 7;
const P_PACK = 8;
/** Parts that change how the body sprite looks. */
export const BODY_RENDER_PARTS = (1 << P_HEAD) | (1 << P_HELMET) | (1 << P_VEST) | (1 << P_PACK) | (1 << P_LEG_B) | (1 << P_LEG_F);

function bodyPartAt(x: number, y: number): number {
  if (y <= 4) return P_HEAD;
  if (y <= 9 && x <= 2) return P_PACK;
  if (y <= 10) return P_TORSO;
  return x <= 5 ? P_LEG_B : P_LEG_F;
}

/**
 * Bake a body frame showing only the attached parts: no helmet shows the bare
 * head, a worn vest plates the chest, missing legs and jetpack leave bloody
 * stumps.
 */
function bakeBody(grid: Grid, pal: Record<string, number>, flipX: boolean, mask: number): HTMLCanvasElement {
  const on = (p: number) => (mask & (1 << p)) !== 0;
  const out: string[] = [];
  for (let y = 0; y < grid.length; y++) {
    let row = '';
    for (let x = 0; x < grid[y].length; x++) {
      let ch = grid[y][x];
      const part = bodyPartAt(x, y);
      if (ch !== '.') {
        if (part === P_HEAD) {
          if (!on(P_HEAD)) ch = '.';
          // Helmet gone: skin where the dome was, an eye where the visor sat.
          else if (!on(P_HELMET)) ch = ch === 'V' && y === 3 ? 'e' : ch === 'L' || ch === 'H' || ch === 'V' || ch === 'v' ? 'S' : ch;
        } else if (part === P_PACK && !on(P_PACK)) {
          ch = y === 9 && x === 2 ? 'R' : '.';
        } else if ((part === P_LEG_B || part === P_LEG_F) && !on(part)) {
          ch = y === 11 && ch === 'P' ? 'R' : '.';
        } else if (part === P_TORSO && on(P_VEST) && y >= 6 && y <= 8 && x >= 5 && x <= 7 && (ch === 'T' || ch === 't' || ch === 'h')) {
          ch = ch === 't' ? 'o' : 'O';
        }
      }
      row += ch;
    }
    out.push(row);
  }
  return bake(out, pal, flipX);
}

function bake(grid: Grid, pal: Record<string, number>, flipX = false): HTMLCanvasElement {
  const h = grid.length;
  const w = grid[0].length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = grid[y][flipX ? w - 1 - x : x];
      const rgb = pal[ch];
      if (rgb === undefined) continue;
      const o = (y * w + x) * 4;
      img.data[o] = (rgb >> 16) & 255;
      img.data[o + 1] = (rgb >> 8) & 255;
      img.data[o + 2] = rgb & 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Rotate a grid about a pivot onto a square canvas using inverse mapping and
 * nearest-neighbour sampling, so the result is still crisp pixel art.
 * `flipY` mirrors across the barrel axis (for aiming left).
 */
function bakeRotated(def: GunDef, pal: Record<string, number>, angle: number, flipY: boolean): { c: HTMLCanvasElement; r: number } {
  const g = def.grid;
  const h = g.length;
  const w = g[0].length;
  let r = 0;
  for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) r = Math.max(r, Math.hypot(cx - def.px, cy - def.py));
  r = Math.ceil(r);
  const size = r * 2 + 1;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const dx = tx - r;
      const dy = ty - r;
      // Inverse rotation back into sprite space.
      const sx = Math.floor(cos * dx + sin * dy + def.px + 0.5);
      let sy = Math.floor(-sin * dx + cos * dy + 0.5);
      if (flipY) sy = -sy;
      sy += def.py;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const rgb = pal[g[sy][sx]];
      if (rgb === undefined) continue;
      const o = (ty * size + tx) * 4;
      img.data[o] = (rgb >> 16) & 255;
      img.data[o + 1] = (rgb >> 8) & 255;
      img.data[o + 2] = rgb & 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { c, r };
}

/** Rotate any grid about a (fractional) pivot onto a square canvas, nearest-neighbour. */
function bakeRotatedGrid(g: Grid, pal: Record<string, number>, angle: number, px: number, py: number): { c: HTMLCanvasElement; r: number } {
  const h = g.length;
  const w = g[0].length;
  let r = 0;
  for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) r = Math.max(r, Math.hypot(cx - px, cy - py));
  r = Math.ceil(r);
  const size = r * 2;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const dx = tx + 0.5 - r;
      const dy = ty + 0.5 - r;
      const sx = Math.floor(cos * dx + sin * dy + px);
      const sy = Math.floor(-sin * dx + cos * dy + py);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const rgb = pal[g[sy][sx]];
      if (rgb === undefined) continue;
      const o = (ty * size + tx) * 4;
      img.data[o] = (rgb >> 16) & 255;
      img.data[o + 1] = (rgb >> 8) & 255;
      img.data[o + 2] = rgb & 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { c, r };
}

export const ANGLE_STEPS = 64;
const NEUTRAL = paletteFor(0x808080);

export class SpriteCache {
  private bodies = new Map<string, HTMLCanvasElement>();
  private guns = new Map<number, { c: HTMLCanvasElement; r: number }>();
  private gibs = new Map<string, HTMLCanvasElement>();
  private pals = new Map<number, Record<string, number>>();

  private pal(team: number): Record<string, number> {
    let p = this.pals.get(team);
    if (!p) this.pals.set(team, (p = paletteFor(team)));
    return p;
  }

  body(team: number, frame: BodyFrame, left: boolean, parts = 0x1ff): HTMLCanvasElement {
    const mask = parts & BODY_RENDER_PARTS;
    const key = `${team}|${frame}|${left ? 1 : 0}|${mask}`;
    let c = this.bodies.get(key);
    if (!c) this.bodies.set(key, (c = bakeBody(BODY[frame], this.pal(team), left, mask)));
    return c;
  }

  /** Weapon + arm rotated to `aim` (radians). Draw at pivot - r. */
  gun(weapon: number, aim: number): { c: HTMLCanvasElement; r: number } {
    const left = Math.cos(aim) < 0;
    const step = ((Math.round((aim / (Math.PI * 2)) * ANGLE_STEPS) % ANGLE_STEPS) + ANGLE_STEPS) % ANGLE_STEPS;
    const key = (weapon * ANGLE_STEPS + step) * 2 + (left ? 1 : 0);
    let g = this.guns.get(key);
    if (!g) {
      g = bakeRotated(GUNS[weapon] ?? GUNS[0], NEUTRAL, (step / ANGLE_STEPS) * Math.PI * 2, left);
      this.guns.set(key, g);
    }
    return g;
  }

  private gibData = new Map<string, { w: number; h: number; data: Uint32Array }>();

  private crafts = new Map<string, { c: HTMLCanvasElement; r: number }>();

  /**
   * Drop rocket in its passenger's team colour (grey when empty), with only
   * its attached parts, rotated to `angle` about its centre (64 steps,
   * nearest-neighbour). Draw at centre - r.
   */
  craft(team: number, parts: number, angle: number): { c: HTMLCanvasElement; r: number } {
    const step = ((Math.round((angle / (Math.PI * 2)) * ANGLE_STEPS) % ANGLE_STEPS) + ANGLE_STEPS) % ANGLE_STEPS;
    const key = `${team}|${parts}|${step}`;
    let g = this.crafts.get(key);
    if (!g) {
      const grid = CRAFT.map((row, sy) =>
        [...row].map((ch, sx) => (craftPartAt(parts, sx + 0.5 - CRAFT_SPRITE_W / 2, sy + 0.5 - CRAFT_SPRITE_H / 2) === craftPartAt(ALL_CRAFT_PARTS, sx + 0.5 - CRAFT_SPRITE_W / 2, sy + 0.5 - CRAFT_SPRITE_H / 2) ? ch : '.')).join(''),
      );
      g = bakeRotatedGrid(grid, this.pal(team), (step / ANGLE_STEPS) * Math.PI * 2, CRAFT_SPRITE_W / 2, CRAFT_SPRITE_H / 2);
      this.crafts.set(key, g);
    }
    return g;
  }

  /** Raw ABGR pixels of a gib piece, for blitting into the particle buffer. */
  gibPixels(team: number, piece: number, rot: number): { w: number; h: number; data: Uint32Array } {
    const key = `${team}|${piece}|${rot}`;
    let d = this.gibData.get(key);
    if (!d) {
      const c = this.gib(team, piece, rot);
      const img = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
      d = { w: c.width, h: c.height, data: new Uint32Array(img.data.buffer.slice(0)) };
      this.gibData.set(key, d);
    }
    return d;
  }

  /** Gib piece in one of four 90° orientations. */
  gib(team: number, piece: number, rot: number): HTMLCanvasElement {
    const key = `${team}|${piece}|${rot}`;
    let c = this.gibs.get(key);
    if (!c) {
      let grid = GIBS[piece];
      for (let i = 0; i < rot; i++) grid = rotate90(grid);
      this.gibs.set(key, (c = bake(grid, this.pal(team))));
    }
    return c;
  }
}

function rotate90(g: Grid): Grid {
  const h = g.length;
  const w = g[0].length;
  const out: string[] = [];
  for (let x = 0; x < w; x++) {
    let row = '';
    for (let y = h - 1; y >= 0; y--) row += g[y][x];
    out.push(row);
  }
  return out;
}

/** Validate grids are rectangular (used by tests). */
export function spriteGridsAreRectangular(): boolean {
  const all: Grid[] = [...Object.values(BODY), ...GUNS.map((g) => g.grid), ...GIBS, CRAFT];
  return all.every((g) => g.every((row) => row.length === g[0].length)) &&
    Object.values(BODY).every((g) => g.length === BODY_H && g[0].length === BODY_W);
}
