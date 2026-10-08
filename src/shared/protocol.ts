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

/** Bump whenever records change; clients on another version reload. */
export const PROTOCOL_VERSION = 10;

/** Free-for-all round phases. */
export const Phase = {
  Waiting: 0, // not enough clones to fight
  Countdown: 1,
  Live: 2,
  Victory: 3,
} as const;

/** What a wave is played as (round rooms alternate them). */
export const GameMode = {
  Ffa: 0, // every clone for itself, last one standing
  Tdm: 1, // red vs green, last team standing
} as const;

export const Team = {
  Red: 0,
  Green: 1,
  None: 255,
} as const;
export const TEAM_NAMES = ['RED', 'GREEN'] as const;

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
