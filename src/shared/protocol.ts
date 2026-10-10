/**
 * Binary wire protocol. Every WebSocket message is a single binary frame whose
 * first byte is the message type. Server FRAME messages are a tick header
 * followed by a stream of typed records the client applies strictly in order —
 * terrain ops before chunk snapshots, so a snapshot always wins.
 */

// Client -> server
export const C_HELLO = 0x01;
export const C_INPUT = 0x02;
export const C_RESYNC = 0x03;
export const C_PING = 0x04;
export const C_CHAT = 0x05;
/** Materializer: build piece u8 at grid top-left gx u16, gy u16. */
export const C_BUILD = 0x06;
/** Radio: call in support, kind u8 (CallKind). */
export const C_CALL = 0x07;

/** What a radio can call in. */
/** What a radio can call in; `Pilot` takes (or hands back) remote control of our own dropship. */
/** Watchdog: a small unmanned tank that guards its caller (who can also drive it from afar). Pilot: the remote (our dropship, then our watchdog, then back). */
/** Pilot: the remote, on to the next of our drones (or back to the clone); PilotBack the other way. */
export const CallKind = { Dropship: 0, Tank: 1, Pilot: 2, Watchdog: 3, Tarantula: 4, Mole: 5, PilotBack: 6 } as const;
/** Gold a radio call costs. */
export const CALL_COST = 1500;
/** A watchdog's price (two-thirds of a tank's). */
export const WATCHDOG_COST = 1000;
/** A tarantula's price: twice a tank's hull, missiles and a laser, and it fights for you. */
export const TARANTULA_COST = 3000;
/** A mole's: a smaller tank with a flamethrower that digs. */
export const MOLE_COST = 1100;
/** What a radio call of each kind costs (a dropship or a tank CALL_COST). */
export const callCost = (kind: number) => (kind === CallKind.Watchdog ? WATCHDOG_COST : kind === CallKind.Tarantula ? TARANTULA_COST : kind === CallKind.Mole ? MOLE_COST : CALL_COST);

// Server -> client
export const S_WELCOME = 0x81;
export const S_FRAME = 0x82;
export const S_PONG = 0x83;
export const S_REJECT = 0x84;

// Records inside S_FRAME
export const R_SELF = 1;
export const R_ACTORS = 2;
export const R_BLIPS = 3;
export const R_CARVE = 4;
export const R_PIXELS = 5;
export const R_CHUNK = 6;
export const R_PROJ_SPAWN = 7;
export const R_PROJ_END = 8;
export const R_KILL = 9;
export const R_ROSTER = 10;
export const R_SCORES = 11;
export const R_HIT = 12;
export const R_CHAT = 13;
export const R_DETACH = 14;
export const R_CRAFTS = 15;
export const R_CRAFT_BOOM = 16;
export const R_CRAFT_SELF = 17;
export const R_CRAFT_PART = 18;
export const R_BUILD = 19;
export const R_ITEMS = 20;
export const R_ITEMS_GONE = 21;
/** FFA round state (every frame): phase, wave, timer, winner, clones left, whether you're in it. */
export const R_ROUND = 22;
/** A new wave's map: seed plus every chunk's hash (clients regenerate it locally and check). */
export const R_WAVE = 23;
/** Team of every slot (MAX_PLAYERS bytes, Team.None for none): sent when teams are drawn, and to newcomers. */
export const R_TEAMS = 24;
/** Every tank (few, so all of them, every frame): position, aim, parts, driver. */
export const R_TANKS = 25;
/** The tank this client drives, at full precision (prediction rebases on it). */
export const R_TANK_SELF = 26;
/** A part blown off a tank: slot, part, where, how fast, fragment seed. */
export const R_TANK_PART = 27;
/** A tank exploding. */
export const R_TANK_BOOM = 28;
/** Every dropship, every frame (few of them): position, tilt, parts, guns, bombs. */
export const R_SHIPS = 29;
/** A part blown off a dropship / a dropship exploding (same layout as the tank records). */
export const R_SHIP_PART = 30;
export const R_SHIP_BOOM = 31;
/** Extraction: which booby traps (mines) have gone off, as a bitset by trap id (sent when it changes). */
export const R_TRAPS = 32;
/** A laser beam fired: from, to, power (0..255), who fired it, and whether it vaporizes (the tarantula's). */
export const R_BEAM = 33;
/** Enemies this client's side has spotted from the air (its dropships): ids and where they are. */
export const R_SPOTTED = 34;
/** Every landmine on the map (sent when one is laid, arms, moves or goes off): where, whose, armed. */
export const R_MINES = 35;
/** A repair kit's health wave set off: where, whose side, and who. */
export const R_HEAL = 36;
/** The map's geysers and their state: u8 count, then per geyser u16 x, u16 y (+Y_BIAS), u8 flags (GF_*). Sent on join and whenever one changes. */
export const R_GEYSERS = 37;
/** A geyser blows: u8 index, u32 seed (clients mirror its burst from it). */
export const R_GEYSER_BLOW = 38;
/** Geyser flags: on a cave floor; rumbling (about to blow); venting its deadly smoke; choked (its vent dug away). */
export const GF_CAVE = 1;
export const GF_RUMBLE = 2;
export const GF_TOXIC = 4;
export const GF_DEAD = 8;

// Actor flag bits (R_SELF / R_ACTORS)
export const F_ALIVE = 1;
export const F_GROUND = 2;
export const F_JET = 4;
export const F_FIRING = 8;
export const F_FACE_LEFT = 16;
export const F_RELOAD = 32;
/** Bits 6-7 of the actor flags: the clone's class (body.ts ClassId). */
export const F_CLASS_SHIFT = 6;
export const classOfFlags = (f: number) => (f >> F_CLASS_SHIFT) & 3;
/** R_ACTORS parts word: the body-part mask in the low bits, the stance (actor.ts Stance) in bits 12-13, the vendor (factions.ts) in bits 14-15. */
export const STANCE_SHIFT = 12;
export const FACTION_SHIFT = 14;
export const PARTS_MASK = (1 << STANCE_SHIFT) - 1;

/** Bump whenever records change; clients on another version reload. */
export const PROTOCOL_VERSION = 47;

/** Last Man Standing round phases. */
export const Phase = {
  Waiting: 0, // not enough clones to fight
  Countdown: 1,
  Live: 2,
  Victory: 3,
} as const;

/** What a wave is played as (round rooms alternate them). */
export const GameMode = {
  Lms: 0, // Last Man Standing: every clone for itself, last one alive wins
  Lts: 1, // Last Team Standing: red vs green, last team with a clone alive wins
  Regicide: 2, // two fortresses, a king in each: kill theirs, keep yours (everyone else respawns)
  Extraction: 3, // four teams race down a labyrinth for the golden idol and out on the extraction rocket (everyone respawns)
  Pvp: 4, // all against all for five minutes with respawns: most kills wins
  Siege: 5, // red holds a massive fortress for ten minutes, its king inside; green has 300 lives to kill him
} as const;

export const Team = {
  Red: 0,
  Green: 1,
  Blue: 2,
  Gold: 3,
  None: 255,
} as const;
export const TEAM_NAMES = ['RED', 'GREEN', 'BLUE', 'GOLD'] as const;
/** How many teams a wave of each mode splits into (0: every clone for itself). */
export const TEAMS_IN_MODE = [0, 2, 2, 4, 0, 2] as const;

/** Extraction rocket states (R_ROUND). */
export const Evac = {
  None: 0,
  /** Coming down to where the idol came out. */
  Inbound: 1,
  /** On the ground, hatch open: bring the idol aboard. */
  Landed: 2,
  /** Lifting off with the idol (the wave is won). */
  Leaving: 3,
  /** Flying off to land nearer the idol. */
  Moving: 4,
} as const;

/** Aim angle (radians) <-> u16. */
export function quantizeAim(a: number): number {
  const t = a / (Math.PI * 2);
  return Math.round((t - Math.floor(t)) * 65536) & 0xffff;
}
export function dequantizeAim(q: number): number {
  return (q / 65536) * Math.PI * 2;
}

/** Remote actor y may be above the sky line; bias it into u16 range. */
export const Y_BIAS = 512;
