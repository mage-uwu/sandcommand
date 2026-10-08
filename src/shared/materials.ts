export const Mat = {
  Air: 0,
  Dirt: 1,
  Sand: 2,
  Rock: 3,
  Gold: 4,
  Bedrock: 5,
  Rubble: 6,
  Metal: 7, // scrap from destroyed drop rockets, and materialized armour plate
  Concrete: 8, // materialized fortifications
  /** Cobblestone of the deep ruins (Extraction's labyrinth): ancient, never yields. */
  Cobble: 9,
  /** Carved sandstone of the alien temple and its step pyramid, inlaid with glowing glyphs: never yields. */
  Glyph: 10,
  /** Topsoil frosting: a turf of grass over dirt, in patches. Soft, holds its shape. */
  Grass: 11,
  /** Snow on high peaks (Highlands). Soft, holds its shape. */
  Snow: 12,
} as const;

export const MAT_COUNT = 13;

/** Hard materials only yield to the inner core of an explosion. */
export const MAT_HARD: readonly boolean[] = [false, false, false, true, false, true, false, true, true, true, true, false, false];
/** Fixed materials never yield. */
export const MAT_FIXED: readonly boolean[] = [false, false, false, false, false, true, false, false, false, true, true, false, false];

/**
 * Loose materials have no cohesion: with nothing directly beneath them they
 * detach into continuous grains and fall (sand, and the rubble explosions
 * leave behind). Dirt, rock and gold veins hold their shape.
 */
export const MAT_LOOSE: readonly boolean[] = [false, false, true, false, false, false, true, false, false, false, false, false, false];

/** Base RGB colors; the renderer adds per-cell hashed variation. */
export const MAT_COLOR: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [122, 84, 52],
  [196, 166, 104],
  [104, 102, 110],
  [232, 188, 52],
  [44, 40, 48],
  [140, 104, 72],
  [150, 158, 170],
  [170, 166, 156],
  [98, 94, 90],
  [188, 152, 100],
  [86, 150, 58],
  [226, 234, 244],
];

export const MAT_NAME = ['air', 'dirt', 'sand', 'rock', 'gold', 'bedrock', 'rubble', 'metal', 'concrete', 'cobble', 'glyph', 'grass', 'snow'];
