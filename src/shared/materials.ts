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
  /**
   * Dripstone: the calcite of stalactites and stalagmites. Brittle: a
   * formation that's hit anywhere (a bullet's chip will do) breaks off whole
   * and comes down in heavy chunks (particles.ts applyCarve).
   */
  Dripstone: 17,
  /**
   * Pig iron: the bunkers' great cast blocks and strongroom linings. Hard,
   * and tough besides: a blast or a digger bites only a quarter as much of it
   * as of concrete (Terrain.carve).
   */
  Iron: 18,
  /** Sandbags: piled cover outside the bunkers and along trench parapets. Soft; holds its shape. */
  Sandbag: 19,
  /**
   * A bunker's sliding steel door (World.doors opens and shuts it). Never
   * carved: it has hit points instead, near a tank's, and blows out whole
   * when they're gone.
   */
  Door: 20,
  /**
   * Rare earth: small violet crystals deep in the rock, ten times gold's
   * worth (RARE_EARTH_VALUE) to whoever digs them out. Soft enough to dig;
   * holds its shape.
   */
  RareEarth: 21,
  /**
   * Deadland (a biome of TABAR): trinitite, green glass the old fires
   * fused out of the sand, glazing craters and littering the crust in shards.
   */
  Glass: 22,
  /** Deadland: grey gravel, loose like sand. */
  Gravel: 23,
  /** Deadland: drifts of fine grey ash, loose. */
  Ash: 24,
  /** Deadland: char, black burnt seams through the crust. Soft. */
  Char: 25,
  /**
   * Deadland: the Progenitors' ancient cement, weathered and cracked: their
   * colossal caltrops and slabs, and the strata of their ruin. Hard and
   * adamant, tougher than pig iron: bullets don't chip it, a blast bites only
   * a sixteenth as much of it as of concrete, and a digger shaves it a cell
   * at a time (Terrain.carve).
   */
  Cement: 26,
  /**
   * Deadland: the concrete of a city that stood before the fires, buried in
   * the crust for eons: stained, cracked and crumbling. Hard like concrete,
   * but it falls to gravel.
   */
  OldConcrete: 27,
  /** Deadland: that city's steel, rusted through: beams, rebar and plate in the crust. Hard. */
  Rust: 28,
  /**
   * Deadland: rough poured concrete, softer than the monuments' cement:
   * their footings, sunk deep and heaped round where they meet the ground,
   * and the aprons and caps of it poured over the dust, sealing it in.
   */
  Pour: 29,
  /**
   * GEMM crystals: bright faceted crystals grown through the ground, pink,
   * turquoise or emerald like the deposits round them, worth
   * GEM_CRYSTAL_VALUE GEMMs a cell. (Mat.Gold is the GEMM deposit itself:
   * the veins, drawn in the same three gem colours; the planet is mined for
   * exotic gems, the code just kept the old name.)
   */
  GemCrystal: 30,
  /**
   * Deadland: the Progenitors' ruin masonry, cobbles and glyph-carved
   * blocks (drawn like the labyrinth's Cobble and Glyph). Unlike the
   * labyrinth's stone it does yield, as grudgingly as the caltrops' cement:
   * hard and adamant.
   */
  RuinStone: 31,
  RuinGlyph: 32,
} as const;

export const MAT_COUNT = 33;

/** What a cell of rare earth banks, in GEMMs, when dug (a cell of GEMM deposit banks one). */
export const RARE_EARTH_VALUE = 10;
/** What a cell of GEMM crystal banks. */
export const GEM_CRYSTAL_VALUE = 3;
/** GEMMs banked for the cells of each material a dig took (World: the digger). */
export const digValue = (removed: Int32Array) => removed[Mat.Gold] + removed[Mat.GemCrystal] * GEM_CRYSTAL_VALUE + removed[Mat.RareEarth] * RARE_EARTH_VALUE;

/** Hard materials only yield to the inner core of an explosion. */
export const MAT_HARD: readonly boolean[] = [false, false, false, true, false, true, false, true, true, true, true, false, false, false, false, false, false, false, true, false, true, false, false, false, false, false, true, true, true, false, false, true, true];
/** Fixed materials never yield. */
export const MAT_FIXED: readonly boolean[] = [false, false, false, false, false, true, false, false, false, true, true, false, false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false, false, false, false, false, false];

/**
 * Loose materials have no cohesion: with nothing directly beneath them they
 * detach into continuous grains and fall (sand, and the rubble explosions
 * leave behind). Dirt, rock and gold veins hold their shape.
 */
export const MAT_LOOSE: readonly boolean[] = [false, false, true, false, false, false, true, false, false, false, false, false, false, true, false, false, false, false, false, false, false, false, false, true, true, false, false, false, false, false, false, false, false];

/** Natural ground (soil, sand, rock): what frosting settles on and bots dig through. */
/** Tough materials: a carve's core takes only the inner half of its radius of them (a quarter of the area). */
export const MAT_TOUGH: readonly boolean[] = Array.from({ length: MAT_COUNT }, (_, m) => m === Mat.Iron);
/** Adamant materials: a carve's core takes only the inner quarter of its radius of them (a sixteenth of the area; a digger shaves a cell at a time). The caltrops' cement and the deadland ruins' masonry. */
export const MAT_ADAMANT: readonly boolean[] = Array.from({ length: MAT_COUNT }, (_, m) => m === Mat.Cement || m === Mat.RuinStone || m === Mat.RuinGlyph);

/** The deadland's crust (not soil: nothing grows in it). */
export const isDeadGround = (m: number) => m === Mat.Glass || m === Mat.Gravel || m === Mat.Ash || m === Mat.Char || m === Mat.Cement || m === Mat.OldConcrete || m === Mat.Rust || m === Mat.Pour;

export const isSoil = (m: number) => m === Mat.Dirt || m === Mat.Sand || m === Mat.RustSand || m === Mat.Regolith || m === Mat.Clay || m === Mat.Ochre;

/** Base RGB colors; the renderer adds per-cell hashed variation. */
export const MAT_COLOR: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [138, 66, 40], // rust soil
  [204, 156, 104], // pale sand
  [94, 84, 92], // basalt
  [236, 112, 178], // GEMM deposit (drawn pink, turquoise or emerald)
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
  [206, 184, 152], // dripstone
  [92, 88, 96], // pig iron
  [150, 132, 92], // sandbags
  [118, 128, 134], // door steel
  [196, 84, 255], // rare earth: violet crystal
  [92, 176, 96], // trinitite: green glass
  [128, 122, 116], // gravel
  [104, 100, 98], // ash (soot black and bone white; see soilColor)
  [66, 58, 54], // char
  [148, 144, 134], // ancient cement
  [168, 156, 134], // old concrete, stained
  [112, 62, 38], // rusted steel
  [126, 124, 116], // pour
  [96, 236, 214], // GEMM crystal
  [98, 94, 90], // ruin stone
  [188, 152, 100], // ruin glyph
];

export const MAT_NAME = ['air', 'dirt', 'sand', 'rock', 'gemm', 'bedrock', 'rubble', 'metal', 'concrete', 'cobble', 'glyph', 'lichen', 'frost', 'rust sand', 'regolith', 'clay', 'ochre', 'dripstone', 'iron', 'sandbag', 'door', 'rare earth', 'trinitite', 'gravel', 'ash', 'char', 'cement', 'old concrete', 'rusted steel', 'pour', 'gemm crystal', 'ruin stone', 'ruin glyph'];
