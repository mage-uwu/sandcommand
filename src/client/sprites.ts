import { ENGINE_NOZZLE_Y, HULL_H, HULL_TOP, HULL_W, HULL_X, SHIP_H, SHIP_W } from '../shared/dropship.ts';
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
  {
    // Radio: a field handset, its whip antenna up
    grid: [
      '......K..',
      '......K..',
      '......K..',
      '...KKKKK.',
      'KAAKGgVGK',
      'KAAKGGGGK',
      '.KKKGgGGK',
      '...KKKKK.',
    ],
    px: 1,
    py: 4,
  },
  {
    // Repair kit: a one-shot med case carried by its handle, a red cross on
    // white, the nanobot charge glowing cyan through its vents
    grid: [
      '...KKKK...',
      '..KAKKAK..',
      'KKKKKKKKKK',
      'KLLLrrLLLK',
      'KLLrrrrLVK',
      'KLLLrrLLVK',
      'KAAAAAAAAK',
      'KKKKKKKKKK',
    ],
    px: 4,
    py: 1,
  },
  {
    // Golden idol: a squat alien figure in gold with a ruby in its chest, held up on its plinth
    grid: [
      '.....YYYY...',
      '....YyYYyY..',
      '....YYYYYY..',
      '.....yYYy...',
      '...YYYYYYYY.',
      '...Y.YYYY.Y.',
      '.....YrrY...',
      '.....YYYY...',
      'KAAK.Y..Y...',
      'KAAKyYy.yYy.',
      '.KKKKKKKKKK.',
    ],
    px: 1,
    py: 8,
  },
  {
    // Shotgun: a heavy military pump gun, tube magazine under the barrel
    grid: [
      '....KKKKKKKKKKKK.',
      'KAAKMMMMMMMMMMMMK',
      'KAAKmmKKgggKKKK..',
      '.KKKmK..KKK......',
    ],
    px: 1,
    py: 1,
  },
  {
    // GL: a stubby launcher with a fat revolving drum
    grid: [
      '.....KKKKKKKKKK.',
      'KAAKKOOOOOOOOOOK',
      'KAAKMNNNNMOOOOOK',
      '.KKKMNnnNMKKKKK.',
      '....KKKKKK......',
    ],
    px: 1,
    py: 1,
  },
  {
    // Gatling: a cluster of barrels off a heavy receiver, a belt feeding it
    grid: [
      '...KKKKKK...........',
      '..KMMMMMMKKKKKKKKKKK',
      'KAAKMGGMMDDDDDDDDDDK',
      'KAAKMMMMMKKKKKKKKKKK',
      '..KMMMMMMDDDDDDDDDDK',
      '...KKyyKKKKKKKKKKKK.',
    ],
    px: 1,
    py: 2,
  },
  {
    // Laser: a sleek white emitter, its coil glowing cyan
    grid: [
      '.....KKKKKKKK....',
      'KAAKKLLLLLLLLKKK.',
      'KAAKHVVVVVHLLLLLK',
      '.KKKHHKKKKKHKKKK.',
      '....KK...........',
    ],
    px: 1,
    py: 1,
  },
  {
    // AT cannon: a fat launch tube on the shoulder, a sight block on top, the missile's red nose in the muzzle
    grid: [
      '....KKKK...........',
      '...KMVVMK..........',
      '.KKKKKKKKKKKKKKKKK.',
      'KAAKOOOOOOOOOOOOOrK',
      'KAAKOooOOOOOOOOOOrK',
      '.KKKKKKoKKKKKKKKKK.',
      '......KK...........',
    ],
    px: 1,
    py: 3,
  },
  {
    // Light rifle: an M1-style battle rifle, long walnut stock and handguard, steel barrel
    grid: [
      '....KKKKK........',
      'KAAKmWWWWMMMMMMMK',
      'KAAKmmWWWWWWKKKK.',
      '.KK.KmmK.........',
    ],
    px: 1,
    py: 1,
  },
  {
    // SMG: a stubby bullpup with a fat suppressor
    grid: [
      '...KKKKK.....',
      'KAAKMMMMMMMMK',
      'KAAKGMMKDDDDK',
      '.KKKGKKMK....',
      '....KK.KK....',
    ],
    px: 1,
    py: 1,
  },
  {
    // Autocannon: a heavy olive receiver, a long steel barrel, a yellow-banded drum underneath
    grid: [
      '...KKKKKKK..........',
      '..KOOOOOOOKKKKKKKKK.',
      'KAAKOooOOOMMMMMMMMMK',
      'KAAKOooOOOKKKKKKKKK.',
      '..KKKKKKKKK.........',
      '...KYYK.............',
    ],
    px: 1,
    py: 2,
  },
  {
    // Landmine in hand: an olive disc, its red trigger cap
    grid: [
      '..KKKKK.',
      'KAAKNNNK',
      'KAAKNrNK',
      '.KKKKKKK',
    ],
    px: 1,
    py: 1,
  },
  {
    // Blaster: a compact white emitter, its cyan coil glowing down the barrel
    grid: [
      '....KKKKKK......',
      'KAAKKLLLLLKKKKK.',
      'KAAKHVVVVVHHHHVK',
      '.KKKHKKKKKKKKKK.',
      '....KK..........',
    ],
    px: 1,
    py: 2,
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
  ['Y.Y.Y', 'YYYYY', 'yYrYy'], // a king's crown, knocked off
  ['KLH.', '.KLH', '..KH', '..KL'], // a droid's leg: a bent tin strut
  ['.KMMK.', 'KGMMGK', 'KMMMMK'], // a droid's turret dome
  ['KGGGK', 'GMMMG', 'KGGGK'], // a droid's chassis plate
];

/**
 * The extraction rocket, 18x40: a white heavy lifter with a gold band, a
 * row of ports, fins and a bell; its hatch open (lit inside) once it's down.
 */
function evacGrid(open: boolean): Grid {
  const W = 18;
  const H = 40;
  const g: string[][] = Array.from({ length: H }, () => new Array<string>(W).fill('.'));
  for (let y = 0; y < H - 4; y++) {
    // Nose: an ogive over the first 10 rows; then a straight body 14 wide.
    const half = y < 10 ? Math.max(1, Math.round(7 * Math.sin(((y + 1) / 10) * (Math.PI / 2)))) : 7;
    for (let x = 9 - half; x < 9 + half; x++) {
      const edge = x === 9 - half || x === 9 + half - 1;
      g[y][x] = edge ? 'K' : x < 7 ? 'W' : x < 12 ? 'w' : 'v';
    }
  }
  for (let x = 2; x < 16; x++) {
    if (g[12][x] !== 'K') g[12][x] = 'Y';
    if (g[13][x] !== 'K') g[13][x] = 'y';
    if (g[31][x] !== 'K') g[31][x] = 'Y';
  }
  for (const wx of [5, 9, 13]) {
    g[16][wx - 1] = g[16][wx] = 'B';
    g[17][wx - 1] = 'b';
    g[17][wx] = 'B';
  }
  // The hatch.
  for (let y = 21; y < 31; y++) for (let x = 6; x < 12; x++) g[y][x] = open ? (y > 22 ? 'L' : 'l') : x === 6 || x === 11 || y === 21 ? 'K' : 'w';
  // Fins and the bell.
  for (let y = 26; y < H - 2; y++) {
    const out = Math.min(2, Math.floor((y - 26) / 3));
    for (let k = 0; k <= out; k++) {
      g[y][1 - k + 1] = g[y][1 - k + 1] === '.' ? 'r' : g[y][1 - k + 1];
      g[y][16 + k - 1] = g[y][16 + k - 1] === '.' ? 'r' : g[y][16 + k - 1];
    }
  }
  for (let y = H - 4; y < H; y++) for (let x = 6 - (y - H + 4); x < 12 + (y - H + 4); x++) g[y][x] = 'D';
  g[0][8] = g[0][9] = 'R'; // beacon
  return g.map((r) => r.join(''));
}
const EVAC_PAL: Record<string, number> = {
  K: 0x16181c,
  W: 0xf4f6f8,
  w: 0xd2d8de,
  v: 0xa4acb6,
  Y: 0xf0c040,
  y: 0xa07c20,
  B: 0x23405e,
  b: 0x8ad0ff,
  L: 0xffe9a0,
  l: 0xffc860,
  r: 0xc8402c,
  D: 0x3a3f46,
  R: 0xff3020,
};

/** A king's crown as worn (5x3, sits on the head's top row): gold spikes, a band, a red jewel. */
export const CROWN: Grid = ['Y.Y.Y', 'YYYYY', 'yYrYy'];

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

/**
 * Class looks over a team palette: scouts wear a green army helmet; heavies
 * are plated in grey metal (helmet, vest, greaves, sleeves) with an amber
 * visor. Mediums are the base palette.
 */
function classPalette(base: Record<string, number>, cls: number): Record<string, number> {
  if (cls === 0) return { ...base, L: 0x8c9a58, H: 0x56652e, V: 0x3a3226, v: 0x241e16 };
  if (cls === 2) return { ...base, L: 0xa4acb4, H: 0x5c636c, V: 0xffb040, v: 0xa86a20, P: 0x646a72, B: 0x30343a, O: 0x8a9198, o: 0x5c636a, g: 0x6e747a, G: 0x3c4146, A: 0x737a82 };
  return base;
}

/**
 * Each mercenary vendor's gear over the class palette (factions.ts):
 * Guild-Tech is the original look; the Rust Nomads wear tan headwraps,
 * amber goggles, leather and rusty kit (a red bandana for scouts, scrap
 * plate for heavies); the Synth Legion is chrome and gunmetal with a red
 * optic, metal where skin would show and dark oil for blood (white plastic
 * scouts, black-armoured heavies).
 */
function factionPalette(base: Record<string, number>, faction: number, cls: number): Record<string, number> {
  if (faction === 1) {
    const p = { ...base, L: 0xd2b07a, H: 0x9a7448, V: 0xffb030, v: 0x8a5410, P: 0x6a5236, B: 0x2c1e14, g: 0xb07448, G: 0x6e4026, A: 0x8a6a46, b: 0x3a2a1c };
    if (cls === 0) return { ...p, L: 0xd0503c, H: 0x8e2c22 };
    if (cls === 2) return { ...p, L: 0xb08a6a, H: 0x7a5a44, P: 0x5c5048, A: 0x7a6a5c, g: 0x9a6a4a, G: 0x5c3c26 };
    return p;
  }
  if (faction === 2) {
    const p = { ...base, L: 0xdfe4ea, H: 0x5a6270, V: 0xff3a2a, v: 0x8a1410, P: 0x30343a, B: 0x16181c, g: 0xa8b2bc, G: 0x40464e, A: 0x7a828c, S: 0x9aa2ac, e: 0xff3a2a, b: 0x22252a, R: 0x2a2a2e };
    if (cls === 0) return { ...p, L: 0xf2f4f6, H: 0xa8b0ba };
    if (cls === 2) return { ...p, L: 0x8a929c, H: 0x3a4048, V: 0xffa020, v: 0x8a5410, A: 0x50565e };
    return p;
  }
  return base;
}

/** A vendor's silhouette touches on a body frame: a headwrap tail for Nomads, an antenna for Synths. */
function factionGrid(grid: Grid, faction: number): Grid {
  if (faction === 0) return grid;
  const g = grid.map((r) => r.split(''));
  // Rows of the head shift down a row in some frames: find the helmet's top row.
  const top = g.findIndex((r) => r.includes('K'));
  if (faction === 1) {
    // The wrap's loose end trails off the back of the head.
    if (g[top + 2]?.[1] === '.') g[top + 2][1] = 'H';
    if (g[top + 2]?.[0] === '.') g[top + 2][0] = 'K';
    if (g[top + 3]?.[1] === '.') g[top + 3][1] = 'K';
  } else if (faction === 2 && top >= 0) {
    // An antenna stub on the crown, lit at the tip.
    if (top > 0 && g[top - 1][6] === '.') g[top - 1][6] = 'L';
    else if (g[top][7] === '.') g[top][7] = 'L';
  }
  return g.map((r) => r.join(''));
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
    W: 0x9a6a38, // walnut (light rifle)
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

  body(team: number, frame: BodyFrame, left: boolean, parts = 0x1ff, cls = 1, faction = 0): HTMLCanvasElement {
    const mask = parts & BODY_RENDER_PARTS;
    const key = `${team}|${frame}|${left ? 1 : 0}|${mask}|${cls}|${faction}`;
    let c = this.bodies.get(key);
    if (!c) this.bodies.set(key, (c = bakeBody(factionGrid(BODY[frame], faction), factionPalette(classPalette(this.pal(team), cls), faction, cls), left, mask)));
    return c;
  }

  /** The extraction rocket, hatch shut or open. */
  evac(open: boolean): HTMLCanvasElement {
    return this.tankSprite(`evac${open ? 1 : 0}`, () => bake(evacGrid(open), EVAC_PAL));
  }

  /** The top row of a body frame's head (it bobs down a row in some frames). */
  headTop(frame: BodyFrame): number {
    return Math.max(0, BODY[frame].findIndex((r) => r.includes('K')));
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

  private tankSprites = new Map<string, HTMLCanvasElement>();
  private tankGuns = new Map<number, { c: HTMLCanvasElement; r: number }>();

  /** Tank hull (with its dome), facing right or left. */
  tankHull(left: boolean, steel = false): HTMLCanvasElement {
    return this.tankSprite(`hull${left ? 1 : 0}${steel ? 's' : ''}`, () => bake(TANK_HULL, steel ? STEEL_PAL : TANK_PAL, left));
  }
  /** The armour plate over the roof and nose. */
  tankArmor(left: boolean, steel = false): HTMLCanvasElement {
    return this.tankSprite(`armor${left ? 1 : 0}${steel ? 's' : ''}`, () => bake(TANK_ARMOR, steel ? STEEL_PAL : TANK_PAL, left));
  }
  /** Dropship hull in the caller's team colour. */
  shipHull(team: number): HTMLCanvasElement {
    return this.tankSprite(`ship${team}`, () => bake(shipHullGrid(), shipPalette(team)));
  }
  shipEngine(): HTMLCanvasElement {
    return this.tankSprite('shipEngine', () => bake(SHIP_ENGINE, shipPalette(0x808080)));
  }
  /** The steel cupola over the hatch. */
  tankShield(left: boolean, steel = false): HTMLCanvasElement {
    return this.tankSprite(`shield${left ? 1 : 0}${steel ? 's' : ''}`, () => bake(TANK_SHIELD, steel ? STEEL_PAL : TANK_PAL, left));
  }
  /** The tracks, animation frame chosen by how far the tank has rolled. */
  tankTread(frame: number, left: boolean, steel = false): HTMLCanvasElement {
    const f = ((frame % TREAD_FRAMES) + TREAD_FRAMES) % TREAD_FRAMES;
    return this.tankSprite(`tread${f}${left ? 1 : 0}${steel ? 's' : ''}`, () => bake(tankTread(f), steel ? STEEL_PAL : TANK_PAL, left));
  }
  tankChute(): HTMLCanvasElement {
    return this.tankSprite('chute', bakeChute);
  }
  /** Cannon (or vulcan) rotated to world angle `a` about its pivot. Draw at pivot - r. */
  tankGun(vulcan: boolean, a: number, steel = false): { c: HTMLCanvasElement; r: number } {
    const step = ((Math.round((a / (Math.PI * 2)) * ANGLE_STEPS) % ANGLE_STEPS) + ANGLE_STEPS) % ANGLE_STEPS;
    const key = step * 4 + (vulcan ? 1 : 0) + (steel ? 2 : 0);
    let g = this.tankGuns.get(key);
    if (!g) {
      const ang = (step / ANGLE_STEPS) * Math.PI * 2;
      const pal = steel ? STEEL_PAL : TANK_PAL;
      g = vulcan ? bakeRotatedGrid(TANK_VULCAN, pal, ang, 1, 3) : bakeRotatedGrid(TANK_CANNON, pal, ang, 1, 2);
      this.tankGuns.set(key, g);
    }
    return g;
  }

  /** The mole: its hull, its frill, its hatch cover, its flamethrower nozzle turned to `a`. */
  moleHull(left: boolean): HTMLCanvasElement {
    return this.tankSprite(`mhull${left ? 1 : 0}`, () => bake(MOLE_HULL, MOLE_PAL, left));
  }
  moleFrill(left: boolean): HTMLCanvasElement {
    return this.tankSprite(`mfrill${left ? 1 : 0}`, () => bake(moleFrill(), MOLE_PAL, left));
  }
  moleHatch(left: boolean): HTMLCanvasElement {
    return this.tankSprite(`mhatch${left ? 1 : 0}`, () => bake(MOLE_HATCH, MOLE_PAL, left));
  }
  moleTread(frame: number, left: boolean): HTMLCanvasElement {
    const f = ((frame % TREAD_FRAMES) + TREAD_FRAMES) % TREAD_FRAMES;
    return this.tankSprite(`mtread${f}${left ? 1 : 0}`, () => bake(tankTread(f), MOLE_PAL, left));
  }
  moleNozzle(a: number): { c: HTMLCanvasElement; r: number } {
    const step = ((Math.round((a / (Math.PI * 2)) * ANGLE_STEPS) % ANGLE_STEPS) + ANGLE_STEPS) % ANGLE_STEPS;
    const key = 10000 + step;
    let g = this.tankGuns.get(key);
    if (!g) {
      g = bakeRotatedGrid(MOLE_NOZZLE, MOLE_PAL, (step / ANGLE_STEPS) * Math.PI * 2, 1, 2);
      this.tankGuns.set(key, g);
    }
    return g;
  }
  /** The mole's SMG: the tank's vulcan in its livery. */
  moleGun(a: number): { c: HTMLCanvasElement; r: number } {
    const step = ((Math.round((a / (Math.PI * 2)) * ANGLE_STEPS) % ANGLE_STEPS) + ANGLE_STEPS) % ANGLE_STEPS;
    const key = 20000 + step;
    let g = this.tankGuns.get(key);
    if (!g) {
      g = bakeRotatedGrid(TANK_VULCAN, MOLE_PAL, (step / ANGLE_STEPS) * Math.PI * 2, 1, 3);
      this.tankGuns.set(key, g);
    }
    return g;
  }
  private tankSprite(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
    let c = this.tankSprites.get(key);
    if (!c) this.tankSprites.set(key, (c = make()));
    return c;
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
// ---------------------------------------------------------------- tanks

/**
 * The tank, after Metal Slug's SV-001: a squat olive hull with a bulbous
 * dome turret (vision slit, roof hatch), hazard stripe and rivets, chunky
 * dark outlines and banded light from the top left. Facing right; the hull
 * sprite is TANK_W wide and its top row sits TANK_SPRITE_TOP above the
 * tank's box (the dome rises over it). The treads (with turning road
 * wheels), the armour plate, the cannon and the vulcan are separate layers
 * so parts can come off and the guns can swivel.
 */
const TANK_PAL: Record<string, number> = {
  K: 0x1a1c10, // outline
  H: 0xd6e08a, // highlight
  L: 0xa0b054, // light olive
  O: 0x78883a, // olive
  D: 0x566328, // dark olive
  d: 0x3a441e, // deepest shadow
  g: 0x282c2e, // gunmetal
  m: 0x586064, // steel
  s: 0x96a0a6, // light steel
  S: 0xcdd4d7, // steel glint
  e: 0x0e100c, // vision slit
  Y: 0xe2b63a, // hazard yellow
  r: 0xb8342a, // hazard red
  w: 0xece8d6, // headlight
  t: 0x222222, // track
  T: 0x50504c, // track links
  W: 0xaaaca0, // wheel face
  R: 0x696c64, // wheel rim
};
/**
 * The watchdog's livery: bare machined steel in place of the tank's olive
 * camouflage (a cool blue-grey, bright on its edges, dark in the recesses),
 * with darker gunmetal running gear.
 */
const STEEL_PAL: Record<string, number> = {
  ...TANK_PAL,
  K: 0x101418,
  H: 0xe4ecf2, // polished edge
  L: 0xa8b4be, // light steel
  O: 0x7a8794, // steel
  D: 0x56616c, // dark steel
  d: 0x343c44, // deepest shadow
  g: 0x1c2024,
  m: 0x4a535c,
  W: 0x8e969e,
  R: 0x50575e,
};

/**
 * The mole's livery: a mining machine's ochre and rust over dark iron, a
 * hazard-striped skirt, the frill's plate in blued steel with bone-white
 * horns, and the flamethrower's nozzle glowing plasma blue.
 */
const MOLE_PAL: Record<string, number> = {
  ...TANK_PAL,
  K: 0x1a1008,
  H: 0xf2c868, // sunlit ochre
  L: 0xd09a3c, // ochre
  O: 0xa86c26, // rust
  D: 0x784818, // dark rust
  d: 0x4a2a10, // deepest
  g: 0x24262a, // iron
  m: 0x4c545c, // blued steel
  s: 0x8a98a6, // light steel
  S: 0xd4dee6, // steel glint
  b: 0xeae0c4, // horn
  B: 0xb8aa88, // horn shadow
  c: 0x6ee8ff, // plasma
  C: 0xe0ffff, // plasma core
};
/** Mole hull (32 x 18, from TANK_SPRITE_TOP above its box): low and rounded, a hump for the flamethrower, a dark iron jaw. */
const MOLE_HULL: Grid = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '..........KKKKKKK...............',
  '.........KgmmmmmgK..............',
  '......KKKKKKKKKKKKKKKK..........',
  '....KKLHHHHHHHHHHHHHLLKK........',
  '...KLHHLLLLLLLLLLLLLLLOOKKKK....',
  '..KLHLLKLLLLKLLLLKLLLLOOOKgmK...',
  '.KLHLLLLLLLLLLLLLLLLLLOOODKgmK..',
  'KgLLLLLLLLLLLLLLLLLLLLOOODDKgmKK',
  'KgOOOOOOOOOOOOOOOOOOOOODDDDKgwwK',
  '.KDDDDDDDDDDDDDDDDDDDDDDDddKggK.',
  '.KOYYrrYYrrOOOOOOOOOOOODDddKgK..',
  '..KYYrrYYrrDDDDDDDDDDDDDddKKK...',
  '..KKKKKKKKKKKKKKKKKKKKKKKKK.....',
];
/** The flamethrower's nozzle (pivot at (1, 2)): an iron body, a steel throat, a plasma-blue mouth. */
const MOLE_NOZZLE: Grid = [
  '.KKK.....',
  'KgmgKKKKK',
  'KmsSsscCK',
  'KgmgKKKKK',
  '.KKK.....',
];
/** The hatch cover at the rear of the mole's back. */
const MOLE_HATCH: Grid = [
  '.KKKKK.',
  'KmsssmK',
  'KgmmmgK',
];
/** Where the frill grid sits (design cells: its top-left, facing right) and its size. */
export const MOLE_FRILL_AT = [16, -22] as const;
const FRILL_W = 21;
const FRILL_H = 34;
/**
 * The frill: a great curved plate rising from the mole's nose and sweeping
 * up and back over its deck, spikes along its rim, two horns jutting
 * forward at its foot and a boss of rivets down its face.
 */
function moleFrill(): Grid {
  const g: string[][] = Array.from({ length: FRILL_H }, () => new Array<string>(FRILL_W).fill('.'));
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && y >= 0 && x < FRILL_W && y < FRILL_H) g[y][x] = c;
  };
  // The plate: a band whose middle runs from its foot (front) up and back.
  const band: [number, number][] = [];
  for (let y = 2; y < FRILL_H; y++) {
    const u = (FRILL_H - 1 - y) / (FRILL_H - 3); // 0 at the foot, 1 at the crest
    // (Its foot on the nose, the plate leaning back and flaring wide as it rises: a fan.)
    const cx = 13 - 6 * Math.pow(u, 1.3);
    const half = 2.2 + 3.6 * Math.pow(u, 0.8);
    band[y] = [Math.round(cx - half), Math.round(cx + half)];
  }
  for (let y = 2; y < FRILL_H; y++) {
    const [a, b] = band[y];
    for (let x = a; x <= b; x++) put(x, y, x === b ? 'S' : x >= b - 1 ? 's' : x <= a + 1 ? 'g' : (x + y) % 7 === 0 ? 's' : 'm');
  }
  // Outline.
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < FRILL_W && y < FRILL_H && g[y][x] !== '.' && g[y][x] !== 'K';
  for (let y = 0; y < FRILL_H; y++) for (let x = 0; x < FRILL_W; x++) if (g[y][x] === '.' && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) g[y][x] = 'K';
  // Spikes round its rim: up over the crest and down its back edge, bone-tipped.
  for (let y = 3; y < 24; y += 3) {
    const a = band[y][0];
    put(a - 1, y, 'b');
    put(a - 2, y - 1, 'b');
    put(a - 2, y, 'K');
    put(a - 3, y - 1, 'K');
  }
  for (let x = band[2][0] + 1; x < band[2][1]; x += 3) {
    put(x, 1, 'b');
    put(x, 0, 'K');
  }
  // Two horns jutting forward at its foot.
  for (const [hy, len] of [
    [FRILL_H - 10, 5],
    [FRILL_H - 4, 3],
  ] as const) {
    const b = band[hy][1];
    for (let k = 1; k <= len; k++) {
      put(b + k, hy, k === len ? 'b' : 'B');
      put(b + k, hy - 1, k === len ? 'K' : 'b');
    }
    put(b + len + 1, hy, 'K');
  }
  // Rivets down its face.
  for (let y = 6; y < FRILL_H - 2; y += 5) {
    const [a, b] = band[y];
    put(Math.round((a + b) / 2), y, 'g');
  }
  return g.map((r) => r.join(''));
}

/** Rows of hull sprite above the tank's box. */
export const TANK_SPRITE_TOP = 3;
const TANK_HULL: Grid = [
  '...........KKKKKK...............',
  '..........KmsssmgK..............',
  '.......KKKKgmmmmgKKKK...........',
  '.....KKLHHHHHHHHLLLLOKK.........',
  '....KLHHHHHLLLLLLLLOOODK........',
  '...KLHHLLLLLLLLLLLLOOeeDK.......',
  '...KHHLLLLLLLLLLLLOOOeeDK.......',
  '...KLLLLOOOOOOOOOOOOODDDDK......',
  '..KKOOOODDDDDDDDDDDDDDDddKKK....',
  '.KLHHHHHHHHHHHHHHHHHHHHHLLOOKK..',
  'KgLHLLLLLLLLLLLLLLLLLLLLLLOODDK.',
  'KgLLKLLLLKLLLLKLLLLKLLLLLOOODSSK',
  'KgOLLLLLLLLLLLLLLLLLLLLLOOODDSwK',
  'KgOOOOOOOOOOOOOOOOOOOOOOOODDDDKK',
  '.KDDDDDDDDDDDDDDDDDDDDDDDDDDDdK.',
  '.KOYYrrOOOOOOOOOOOOOOOOOOODDddK.',
  '..KYYrrDDDDDDDDDDDDDDDDDDDdddK..',
  '..KKKKKKKKKKKKKKKKKKKKKKKKKKKK..',
];
const TANK_ARMOR: Grid = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '..KKKKKKKKKKKKKKKKKKKKKKKK......',
  '.KSssssssssssssssssssssssKKK....',
  '.KmKmmmmKmmmmKmmmmKmmmmmsSSKK...',
  '........................KKsssSK.',
  '........................KmssssK.',
  '........................KmKmssK.',
  '........................KmmmssK.',
  '........................KmKmsmK.',
  '........................KmmmmK..',
  '........................KKKKK...',
];
/** Cannon, pointing right; pivot (1, 2) sits inside the dome. */
const TANK_CANNON: Grid = [
  '..KKKKKKKKKKKKKKKKKKKKKKK',
  '.KmssssssssssssssssKKKsSK',
  'KgmmmmmmmmmmmmmmmmmKgKmmK',
  '.KggggggggggggggggggKgKgK',
  '..KKKKKKKKKKKKKKKKKKKKKKK',
];
/** Twin vulcan barrels, pointing right; pivot (1, 3) in the housing. */
const TANK_VULCAN: Grid = [
  'KKKK.........',
  'KmmKKKKKKKKKK',
  'KgmKsssssssSK',
  'KggKKKKKKKKKK',
  'KgmKsssssssSK',
  'KmmKKKKKKKKKK',
  'KKKK.........',
];
/**
 * The hatch shield: a hard steel cupola over the driver's head, a vision
 * slit across it. Drawn with its left edge at hull column 9, bottom on the
 * hatch rim (hull row 2).
 */
const TANK_SHIELD: Grid = [
  '...KKKKKK...',
  '..KSSsssmK..',
  '.KSsssmmmgK.',
  '.KseeeeeegK.',
  'KsmmmmmmmmgK',
  'KmKmmmmmmKgK',
  'KKKKKKKKKKKK',
];
const TREAD_FRAMES = 4;

/** Dropship colours: grey-blue gunmetal, a canopy, hazard markings (T = the caller's team colour). */
function shipPalette(team: number): Record<string, number> {
  return {
    K: 0x14181c,
    H: 0xc8d2dc,
    L: 0x9aa8b4,
    M: 0x6e7c88,
    D: 0x4a5560,
    d: 0x2e363e,
    C: 0x6ad6ff,
    c: 0x1e6a8a,
    T: team,
    Y: 0xe2b63a,
    k: 0x111111,
    g: 0x3a4248,
  };
}

/**
 * The dropship's hull, procedurally laid out in the middle of its box, with
 * the open-truss pylons out to its engine pods: a rounded gunship body lit from above, a
 * canopy at the nose, panel lines and rivets, the caller's team stripe and
 * hazard chevrons around the bomb bay in its belly.
 */
function shipHullGrid(): Grid {
  const H = SHIP_H;
  const g: string[][] = Array.from({ length: H }, () => new Array<string>(SHIP_W).fill('.'));
  // Outrigger pylons: an open truss from each end of the hull out under the
  // pods (drawn first, so the hull and pods sit over it).
  const py = ENGINE_NOZZLE_Y - 4;
  for (const side of [0, 1]) {
    const x0 = side === 0 ? 1 : HULL_X + HULL_W - 6;
    const x1 = side === 0 ? HULL_X + 6 : SHIP_W - 1;
    for (let x = x0; x < x1; x++) {
      g[py][x] = 'g';
      g[py + 3][x] = 'g';
      if ((x + side) % 4 === 0) g[py + 1][x] = g[py + 2][x] = 'g';
      else if ((x + side) % 4 === 1) g[py + 1][x] = 'g';
      else if ((x + side) % 4 === 3) g[py + 2][x] = 'g';
    }
    // A brace down into the hull's flank.
    const bx = side === 0 ? HULL_X + 4 : HULL_X + HULL_W - 5;
    for (let y = py; y < HULL_TOP + 4; y++) g[y][bx] = g[y][bx + 1] = 'g';
  }
  const W = HULL_W;
  const ox = HULL_X;
  const top = HULL_TOP;
  const bottom = HULL_TOP + HULL_H;
  const inset = (y: number) => {
    const r = y - top;
    const fromBottom = bottom - 1 - y;
    return Math.max([5, 3, 2, 1, 1][r] ?? 0, [4, 2, 1][fromBottom] ?? 0);
  };
  const set = (x: number, y: number, c: string) => (g[y][ox + x] = c);
  const at = (x: number, y: number) => g[y][ox + x];
  for (let y = top; y < bottom; y++) {
    const i = inset(y);
    for (let x = 1 + i; x < W - 1 - i; x++) {
      const edge = x === 1 + i || x === W - 2 - i || y === top || y === bottom - 1;
      const r = y - top;
      let c = r <= 2 ? 'H' : r <= 5 ? 'L' : r <= 9 ? 'M' : 'D';
      if (r === 1 && x > W - 14) c = 'L';
      if (edge) c = 'K';
      set(x, y, c);
    }
  }
  // Panel lines and rivets.
  for (const px of [11, 22, 32]) for (let y = top + 2; y < bottom - 1; y++) if (at(px, y) !== 'K') set(px, y, 'D');
  for (const px of [6, 16, 27, 37]) if (at(px, top + 4) !== 'K') set(px, top + 4, 'K');
  // Canopy at the nose.
  for (let y = top + 2; y < top + 6; y++) for (let x = W - 12; x < W - 4 - (y - top - 2); x++) set(x, y, y < top + 4 ? 'C' : 'c');
  // The caller's team stripe along the flank.
  for (let x = 4; x < W - 14; x++) if (at(x, top + 7) !== 'K' && at(x, top + 7) !== 'D') set(x, top + 7, 'T');
  // Hazard chevrons framing the bay.
  for (let x = 14; x < 31; x++) if (x < 17 || x > 27) set(x, bottom - 3, (x & 1) === 0 ? 'Y' : 'k');
  return g.map((r) => r.join(''));
}

/**
 * A rocket pod: a fat riveted motor casing lit from the left, a hazard band,
 * the throat, and a flared bell nozzle pointing down (its flame is drawn live).
 */
const SHIP_ENGINE: Grid = [
  '...KKKK...',
  '..KHHLMK..',
  '.KHHLLMDK.',
  '.KHLLMMDK.',
  '.KYYYYYkK.',
  '.KHLLMMDK.',
  '.KLLMMMdK.',
  '.KDDDDddK.',
  '..KKggKK..',
  '..KgkkgK..',
  '.KgkkkkgK.',
];

/** The track under the hull: links that crawl and road wheels whose spoke turns, by frame. */
function tankTread(frame: number): Grid {
  const w = 32;
  const h = 7;
  const g: string[][] = [];
  for (let y = 0; y < h; y++) {
    const inset = [2, 1, 0, 0, 0, 1, 2][y];
    const row: string[] = [];
    for (let x = 0; x < w; x++) {
      if (x < inset || x >= w - inset) row.push('.');
      else row.push(x === inset || x === w - inset - 1 || y === 0 || y === h - 1 ? 'K' : 't');
    }
    g.push(row);
  }
  for (let x = 2; x < w - 2; x++) {
    if ((x + frame) % 3 === 0) {
      g[1][x] = 'T';
      g[h - 2][x] = 'T';
    }
  }
  const wheel = ['.RRR.', 'RWWWR', 'RWKWR', 'RWWWR', '.RRR.'];
  const spoke = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ][frame % 4];
  for (const cx of [5, 11, 16, 21, 27]) {
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (wheel[y][x] !== '.') g[1 + y][cx - 2 + x] = wheel[y][x];
    g[3 + spoke[1]][cx + spoke[0]] = 'K';
  }
  return g.map((r) => r.join(''));
}

/** The parachute: a striped canopy and its rigging down to the hull's corners (bakes a 48x40 canvas; tank box at (8, 34)). */
function bakeChute(): HTMLCanvasElement {
  const w = 48;
  const h = 40;
  const g: string[][] = Array.from({ length: h }, () => new Array<string>(w).fill('.'));
  const cx = 24;
  const cy = 12;
  for (let y = 0; y <= cy; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx + 0.5) / 23;
      const dy = (cy - y) / 12;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const edge = d > 0.82 || y === cy;
      const gore = Math.floor(((Math.atan2(cy - y, x - cx + 0.5) / Math.PI) * 7)) & 1;
      g[y][x] = edge ? 'K' : gore ? 'w' : 'r';
    }
  }
  // Rigging lines from the canopy rim down to the hull's top corners.
  for (const [x0, x1] of [
    [2, 11],
    [12, 14],
    [36, 34],
    [46, 37],
  ]) {
    for (let y = cy + 1; y < h; y++) {
      const x = Math.round(x0 + ((x1 - x0) * (y - cy)) / (h - cy));
      if (g[y][x] === '.') g[y][x] = 'g';
    }
  }
  return bake(g.map((r) => r.join('')), { ...TANK_PAL, r: 0xc8402c, w: 0xf2efe6 });
}

export function spriteGridsAreRectangular(): boolean {
  const all: Grid[] = [...Object.values(BODY), ...GUNS.map((g) => g.grid), ...GIBS, CRAFT, TANK_HULL, TANK_ARMOR, TANK_CANNON, TANK_VULCAN, TANK_SHIELD, tankTread(0), MOLE_HULL, MOLE_NOZZLE, MOLE_HATCH, moleFrill()];
  return all.every((g) => g.every((row) => row.length === g[0].length)) &&
    Object.values(BODY).every((g) => g.length === BODY_H && g[0].length === BODY_W);
}
