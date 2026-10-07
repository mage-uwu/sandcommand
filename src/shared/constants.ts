// World geometry. Every terrain cell is one "pixel" of sand.
export const WORLD_W = 2048;
export const WORLD_H = 1024;

// Bitplane layout: one bit per cell, 32 cells per Uint32 word.
export const WORD_BITS = 32;
export const WORDS_PER_ROW = WORLD_W / WORD_BITS; // 64

// Chunking. Chunks are the unit of terrain replication and interest management.
export const CHUNK_SHIFT = 6;
export const CHUNK = 1 << CHUNK_SHIFT; // 64 cells
export const CHUNKS_X = WORLD_W >> CHUNK_SHIFT; // 32
export const CHUNKS_Y = WORLD_H >> CHUNK_SHIFT; // 16
export const CHUNK_COUNT = CHUNKS_X * CHUNKS_Y; // 512

// Simulation clock.
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

// Room limits.
export const MAX_PLAYERS = 64;

// Interest management (in world pixels). The view rectangle is centered on the
// player's camera; chunks touching the expanded rectangle are streamed.
export const VIEW_HALF_W = 640;
export const VIEW_HALF_H = 384;
export const CHUNK_INTEREST_MARGIN = 128;
export const ENTITY_INTEREST_MARGIN = 96;
// Players outside the AOI are sent as low-rate "radar blips" every N ticks.
export const FAR_UPDATE_INTERVAL = 15;
// Budget for terrain chunk snapshots per client per tick (bytes).
export const CHUNK_BYTES_PER_TICK = 24 * 1024;

// Physics.
export const GRAVITY = 620;
export const ACTOR_W = 8;
export const ACTOR_H = 14;
export const ACTOR_RUN_SPEED = 95;
export const ACTOR_GROUND_ACCEL = 1100;
export const ACTOR_AIR_ACCEL = 380;
export const ACTOR_JUMP_SPEED = 215;
export const ACTOR_JET_ACCEL = 1250;
export const ACTOR_MAX_FUEL = 100;
export const ACTOR_FUEL_BURN = 55; // per second
export const ACTOR_FUEL_REGEN = 40; // per second, on ground
export const ACTOR_MAX_FALL = 520;
export const ACTOR_MAX_RISE = 260;
export const ACTOR_STEP_UP = 4; // cells an actor can walk up without jumping
export const ACTOR_MAX_HP = 100;
export const FALL_DAMAGE_SPEED = 430;
export const RESPAWN_TICKS = TICK_RATE * 3;

// Network quantization.
export const POS_SCALE = 16; // 1/16 cell precision for remote actors
export const VEL_SCALE = 8;
