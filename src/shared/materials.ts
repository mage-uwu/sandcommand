export const Mat = {
  Air: 0,
  Dirt: 1,
  Sand: 2,
  Rock: 3,
  Gold: 4,
  Bedrock: 5,
  Rubble: 6,
} as const;

export const MAT_COUNT = 7;

/** Hard materials only yield to the inner core of an explosion. */
export const MAT_HARD: readonly boolean[] = [false, false, false, true, false, true, false];
/** Fixed materials never yield. */
export const MAT_FIXED: readonly boolean[] = [false, false, false, false, false, true, false];

/**
 * Loose materials have no cohesion: with nothing directly beneath them they
 * detach into continuous grains and fall (sand, and the rubble explosions
 * leave behind). Dirt, rock and gold veins hold their shape.
 */
export const MAT_LOOSE: readonly boolean[] = [false, false, true, false, false, false, true];

/** Base RGB colors; the renderer adds per-cell hashed variation. */
export const MAT_COLOR: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [122, 84, 52],
  [196, 166, 104],
  [104, 102, 110],
  [232, 188, 52],
  [44, 40, 48],
  [140, 104, 72],
];

export const MAT_NAME = ['air', 'dirt', 'sand', 'rock', 'gold', 'bedrock', 'rubble'];
