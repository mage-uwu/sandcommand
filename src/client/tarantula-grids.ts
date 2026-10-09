/** The tarantula's sprite grids and palettes (data only, no DOM): drawn by tarantula-sprites.ts. */

export type Grid = readonly string[];

/** Iron, steel, ceramic; lens and glow; team stripe ('t', filled per owner). */
export const PAL: Record<string, number> = {
  K: 0x121417, // outline
  i: 0x34302e, // iron, dark
  I: 0x58514c, // iron
  j: 0x7c736c, // iron, lit
  m: 0x46525e, // steel, dark
  s: 0x7d8a97, // steel
  S: 0xb6c3ce, // steel, lit
  G: 0xe9f1f7, // steel glint
  c: 0xb3ad9f, // ceramic, shadowed
  C: 0xdfd9cb, // ceramic
  W: 0xf7f3e8, // ceramic, lit
  e: 0x1b0d0d, // lens housing
  r: 0xd83026, // lens
  R: 0xffa290, // lens, hot spot
  o: 0xff8a3a, // vent glow
  y: 0xd9a93a, // hazard paint
};
/** Its ceramic plates shot away: scorched iron beneath. */
export const BARE: Record<string, number> = { ...PAL, c: 0x2c231d, C: 0x45372d, W: 0x5c4a3b };
/** The laser firing: the lens white-hot. */
export const HOT: Record<string, number> = { ...PAL, r: 0xfff0f6, R: 0xffffff, e: 0xff5aa8 };

/**
 * The body, facing right: the segmented ceramic abdomen behind, the thorax
 * (ceramic back plates, a steel flank with the team stripe and rivets, a
 * glowing vent and the sensor cluster at its nose), on an iron hip frame.
 * Row 10 is the hip line; the legs join along it.
 */
export const BODY: Grid = [
  '................KKKKKKKKKKKKKKKKKKKK....',
  '....KKKKKK.....KWWWWWWKWWWWWWKWWWWWWK...',
  '..KKWWCCWWKK..KWCCCCCCKCCCCCCKCCCCCCWK..',
  '.KWWCCcCCcCWK.KCCCCCCcKCCCCCcKCCCCCCcCK.',
  'KWCCcCCcCCcCWKKcccccccKcccccccKcccccccKK',
  'KCCcCCcCCcCCcKKSSSSSSSSSSSSSSSSSSSSSSSGK',
  'KCcCCcCCcCCcCKmssttttsssssssssssssssssSK',
  'KccCCcCCcCCccKmsKssssssKssssssKsssssSoSK',
  'KiccccccccccKKmssssssssssssssssssssseerK',
  'KiiiiiiiiiiiKKmmmmmmmmmmmmmmmmmmmmmmeeRK',
  '.KiiiiiiiiiKKjIIIjIIIIjIIIIjIIIIjIIImmK.',
  '..KKiiiiiKKKIiiiIiiiiIiiiiIiiiiIiiiiIK..',
  '....KKKKK..KKKKKKKKKKKKKKKKKKKKKKKKKKK..',
];
export const BODY_HIP = [20, 10] as const;

/** The head: a chunky ceramic-and-steel camera, its red lens and the laser's emitter at the front. Pivot (8, 5). */
export const HEAD: Grid = [
  '....KKKKKKKKKKKK........',
  '...KWWWWWWWWWWWCKKKKK...',
  '..KWCCCCCCCCCCCCKeeeK...',
  '.KSCCcccccccccCCKerrK...',
  'KmSssssssssssssCKeRrKKKK',
  'KmssKsssssssKssCKerrKSGK',
  'KimmmmmmmmmmmmmsKeeeKmmK',
  '.KiiiiiiiiiiiiiKKKKKKKK.',
  '..KKKKKKKKKKKKKK........',
];
export const HEAD_PIVOT = [8, 5] as const;

/** The missile rack: an iron box of two tubes, hazard-striped. Pivot (2, 4.5): its back. */
export const RACK: Grid = [
  'KKKKKKKKKKKKKKKKK',
  'KjIIIIIIIIIIIIIjK',
  'KIKKKKKKKKKKKKKKK',
  'KISSSSSSSSSSSSKeK',
  'KIKKKKKKKKKKKKKKK',
  'KISSSSSSSSSSSSKeK',
  'KIKKKKKKKKKKKKKKK',
  'KiyyiiyyiiyyiiiiK',
  'KKKKKKKKKKKKKKKKK',
];
export const RACK_PIVOT = [2, 4.5] as const;
/** The tubes' mouths, rack-local (for the flash). */
export const RACK_MOUTHS = [
  [16, 3.5],
  [16, 5.5],
] as const;


/** Every grid (tests: rectangular). */
export const TARANTULA_GRIDS: readonly Grid[] = [BODY, HEAD, RACK];
