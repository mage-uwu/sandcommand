/**
 * The ground of an alien world, a Mars of sorts: rust-red soil (iron oxide)
 * over darker basalt, in drifts of rust dust, with seams of oxblood clay,
 * yellow ochre and dark regolith through it, and pale sand in buried lenses
 * and dry riverbeds.
 */
export const Mat = {
  Air: 0,
  /** The planet's soil: rust red. */
  Dirt: 1,
  /** Pale sand: buried lenses and dry riverbeds. */
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
  /** Topsoil frosting: a mat of alien lichen (teal, tipped violet) over the soil, in patches. Soft, holds its shape. */
  Grass: 11,
  /** Frost on high peaks (Highlands). Soft, holds its shape. */
  Snow: 12,
  /** Rust dust: the fine red sand of the dunes, loose like sand. */
  RustSand: 13,
  /** Regolith: dark, gritty basaltic soil, deep down and in patches. */
  Regolith: 14,
  /** Oxblood clay: deep red seams and bands. */
  Clay: 15,
  /** Ochre: yellow-orange iron soil, in pockets near the surface. */
  Ochre: 16,
} as const;

export const MAT_COUNT = 17;

/** Hard materials only yield to the inner core of an explosion. */
export const MAT_HARD: readonly boolean[] = [false, false, false, true, false, true, false, true, true, true, true, false, false, false, false, false, false];
/** Fixed materials never yield. */
export const MAT_FIXED: readonly boolean[] = [false, false, false, false, false, true, false, false, false, true, true, false, false, false, false, false, false];

/**
 * Loose materials have no cohesion: with nothing directly beneath them they
 * detach into continuous grains and fall (sand, and the rubble explosions
 * leave behind). Dirt, rock and gold veins hold their shape.
 */
export const MAT_LOOSE: readonly boolean[] = [false, false, true, false, false, false, true, false, false, false, false, false, false, true, false, false, false];

/** Natural ground (soil, sand, rock): what frosting settles on and bots dig through. */
export const isSoil = (m: number) => m === Mat.Dirt || m === Mat.Sand || m === Mat.RustSand || m === Mat.Regolith || m === Mat.Clay || m === Mat.Ochre;

/** Base RGB colors; the renderer adds per-cell hashed variation. */
export const MAT_COLOR: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [138, 66, 40], // rust soil
  [204, 156, 104], // pale sand
  [94, 84, 92], // basalt
  [232, 188, 52],
  [40, 32, 40],
  [132, 80, 58], // rubble
  [150, 158, 170],
  [170, 166, 156],
  [98, 94, 90],
  [188, 152, 100],
  [58, 158, 148], // lichen
  [232, 226, 240], // frost
  [186, 94, 58], // rust dust
  [84, 62, 58], // regolith
  [108, 40, 34], // oxblood clay
  [178, 118, 50], // ochre
];

export const MAT_NAME = ['air', 'dirt', 'sand', 'rock', 'gold', 'bedrock', 'rubble', 'metal', 'concrete', 'cobble', 'glyph', 'lichen', 'frost', 'rust sand', 'regolith', 'clay', 'ochre'];
