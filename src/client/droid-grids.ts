/** The spider droid's sprite grids and palettes (data only, no DOM): drawn by droid-art.ts. */

export type Grid = readonly string[];

/**
 * Gritty, worn war-surplus: drab olive gunmetal gone dull, rust bleeding
 * from the seams and rivets, grime caked low, a hazard-striped nose, an
 * exhaust stack; a red eye. Team light ('t', filled per owner).
 */
export const DPAL: Record<string, number> = {
  K: 0x0e0f0c, // outline
  d: 0x2e3128, // drab, shadow
  m: 0x4a4e3e, // drab
  l: 0x6c7058, // drab, lit
  h: 0x9a9c80, // drab, worn edge
  g: 0x221e18, // grime
  r: 0x5a2e1a, // rust, dark
  R: 0x8e4a26, // rust
  y: 0xc49a28, // hazard paint
  w: 0xb0a890, // rivet head
  e: 0x1c1a17, // exhaust pipe
  E: 0x3a342c, // exhaust lip
  o: 0xff7a2a, // vent glow
  O: 0xffc060, // vent glow, hot
  v: 0x2a0c08, // eye housing
  x: 0xd8261a, // eye
  X: 0xffb090, // eye hot spot
};
/** Its plating shot away: a scorched frame, wiring showing. */
export const DBARE: Record<string, number> = { ...DPAL, m: 0x2c241c, l: 0x3e3226, h: 0x5a4632, y: 0x6a5420, w: 0x6a5a48, d: 0x1c1712 };
/** Its eye flickering low. */
export const DDIM: Record<string, number> = { ...DPAL, x: 0x6a1008, X: 0x9a2a1a };

/**
 * The chassis, facing right: a squat armoured pod, the exhaust stack at its
 * back, the hazard-striped nose at its front, a vent glowing in its belly,
 * the team light under the nose. Local x -3..12, y 6.4..14.4 (the clone
 * box's frame); its hip line (where the legs join, and it pitches) at CHASSIS_PIVOT.
 */
export const CHASSIS: Grid = [
  '.KKK...........',
  'KEEEK.KKKKKKK..',
  'KeKeKKhhlhwhhK.',
  'KeKKlllmlllRyyK',
  'KmmwmmRmmmwmKyK',
  'KdmmrRRmmdmmyKK',
  'KgdgddoOoddgtK.',
  '.KKKKKKKKKKKKK.',
];
/** The chassis's pivot (grid cells): local (4, 9.6); the grid's top-left at local (-3, 6.4). */
export const CHASSIS_PIVOT = [7, 3.2] as const;

/**
 * The head, in the aim's frame (+x along the gun, up is -y): a welded box,
 * a bent antenna, a cheek plate bolted on, one red eye in a heavy bezel
 * looking out along the barrel. Its pivot (the gun's mount) at HEAD_PIVOT.
 */
export const DHEAD: Grid = [
  '..K......',
  '.KhK.....',
  'KKKKKKKK.',
  'KhhlhKvvK',
  'KmwmRKxXK',
  'KgdrdKvvK',
  '.KKKKKKKK',
];
/** The head's pivot (grid cells): the gun's mount, under its chin. */
export const DHEAD_PIVOT = [3, 6.6] as const;

/** Every grid (tests: rectangular, every character in the palette). */
export const DROID_GRIDS: readonly Grid[] = [CHASSIS, DHEAD];
