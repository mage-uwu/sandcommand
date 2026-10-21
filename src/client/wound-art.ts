import type { Wound } from './wounds.ts';

/**
 * Wounds painted into a clone's own sprite: each hit it's taken (wounds.ts)
 * a hole in it where it struck, fitted to its pixels (nothing drawn off the
 * body), riding every pose, crouch and lean the sprite does:
 *
 * - **A graze or a bullet** (small): a dark hole, a ragged red rim.
 * - **A tear** (bigger): the hole longer, raw meat round it, a bright fleck.
 * - **A gaping wound** (the biggest): wide open, meat, and bone showing.
 *
 * Blood runs down the body from each one, further the longer it's been
 * open, till it runs off the clone. Fresh ones glisten. A synthetic's are
 * torn plating and coolant; the possessed's never close (they keep every
 * one they've taken) and ooze the crab's blue.
 *
 * DOM-free (the sprite's own cells come in as `on`: possessed-art.ts spriteMask).
 */

/** A wound's colours: hole, rim, meat, fleck, bone, the blood that runs (and its dark end). */
export interface WoundTone {
  core: string;
  rim: string;
  meat: string;
  fleck: string;
  bone: string;
  run: string;
  runEnd: string;
}
export const FLESH: WoundTone = { core: '#240305', rim: '#7a0e10', meat: '#b8282a', fleck: '#f08a86', bone: '#e8dcc4', run: '#7e0c0e', runEnd: '#4a0606' };
export const SYNTH: WoundTone = { core: '#0a0c0e', rim: '#2a3a44', meat: '#46545e', fleck: '#8ad8ff', bone: '#a8b2ba', run: '#3a6a88', runEnd: '#1a2a34' };
export const HIVE: WoundTone = { core: '#08040c', rim: '#3a0e2a', meat: '#5e1a3a', fleck: '#18c8ff', bone: '#cfc6ae', run: '#0e6a9a', runEnd: '#083a58' };

/** One pixel of a wound: in the sprite's own cells (10 x 16, as baked: hip at (5.5, 11)). */
export interface WoundPx {
  x: number;
  y: number;
  c: string;
}

const hsh = (a: number, b: number, c = 0) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** How long (ms) a wound's blood takes to run each cell further, and how far it runs at most. */
const RUN_MS = 500;
const RUN_MAX = 5;

/**
 * The pixels of `wounds` on a sprite facing `face` (1 right, -1 left), in
 * `tone`, at `now` (ms): only on cells `on` (the sprite's own), each later
 * pixel over the earlier.
 */
export function woundPixels(wounds: readonly Wound[], face: number, tone: WoundTone, now: number, on: (x: number, y: number) => boolean): WoundPx[] {
  const out: WoundPx[] = [];
  const put = (x: number, y: number, c: string) => {
    if (on(x, y)) out.push({ x, y, c });
  };
  for (const w of wounds) {
    const x = Math.floor(5.5 + w.u * face);
    const y = Math.floor(11 + w.v);
    // (Its own look, from where it is: the same on every client.)
    const seed = Math.round(w.u * 8) * 31 + Math.round(w.v * 8);
    const age = now - w.at;
    const big = w.r >= 2;
    const torn = w.r >= 1.2;
    // The blood running down from it: one stream (two from a gaping one), longer the longer it's open.
    const len = Math.min(RUN_MAX - (torn ? 0 : 2), 1 + Math.floor(age / RUN_MS));
    for (const dx of big ? [0, hsh(seed, 1) < 0.5 ? -1 : 1] : [0]) {
      for (let k = 1; k <= len; k++) {
        const yy = y + (big ? 1 : 0) + k;
        if (!on(x + dx, yy)) break;
        // (A dribble, not a stripe: the second stream thinner, gaps in it.)
        if (dx !== 0 && hsh(seed, k, 21) < 0.45) continue;
        out.push({ x: x + dx, y: yy, c: k === len ? tone.runEnd : tone.run });
      }
    }
    // Its rim: ragged, not every side.
    const rimR = big ? 2 : 1;
    for (let dy = -rimR; dy <= rimR; dy++) {
      for (let dx = -rimR; dx <= rimR; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d === 0 || d > rimR + (big ? 1 : 0)) continue;
        if (hsh(seed, dx + 5, dy + 5) < (torn ? 0.75 : 0.45)) put(x + dx, y + dy, tone.rim);
      }
    }
    if (torn) {
      // Raw meat round the hole.
      for (const [dx, dy] of big ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[-1, 0], [1, 0], [0, 1]]) {
        if (hsh(seed, dx + 9, dy + 9) < 0.8) put(x + dx, y + dy, tone.meat);
      }
      put(x + (hsh(seed, 3) < 0.5 ? -1 : 1), y - (big ? 1 : 0), tone.fleck);
    }
    // The hole itself (and bone in a gaping one).
    put(x, y, big ? tone.bone : tone.core);
    if (big) {
      put(x + (hsh(seed, 4) < 0.5 ? -1 : 1), y, tone.core);
      put(x, y + 1, tone.core);
    } else if (torn) put(x, y + 1, tone.core);
    // Fresh: it glistens.
    if (age < 450) put(x + (w.u > 0 ? 1 : -1) * face, y - 1, tone.fleck);
  }
  return out;
}
