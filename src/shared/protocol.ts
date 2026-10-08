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

// Actor flag bits (R_SELF / R_ACTORS)
export const F_ALIVE = 1;
export const F_GROUND = 2;
export const F_JET = 4;
export const F_FIRING = 8;
export const F_FACE_LEFT = 16;
export const F_RELOAD = 32;

/** Bump whenever records change; clients on another version reload. */
export const PROTOCOL_VERSION = 4;

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
