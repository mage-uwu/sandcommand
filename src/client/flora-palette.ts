import { type Flora, FloraKind } from '../shared/frosting.ts';

/** The flora's colours (DOM-free: the gibs need them too, flora-art.ts draws with them). */

export const rnd = (seed: number, k: number) => {
  let h = Math.imul(seed ^ (k * 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Palettes (stem dark, stem light, accent, glow), one picked per plant. */
export const PALETTES = [
  ['#3a1f4f', '#6d3b8f', '#b06ad8', '#d8ff7a'],
  ['#163f45', '#2d7a7a', '#5fd0c0', '#f4ff9a'],
  ['#4a1a28', '#8a2e48', '#e0607e', '#ffe08a'],
  ['#2a2a50', '#4f4f9a', '#8f9cff', '#9affea'],
];

export const CORAL_PALS: readonly (readonly string[])[] = [
  // outline, dark, mid, light, highlight, glow
  ['#2a0f1e', '#6e1f45', '#a8326a', '#d85a92', '#ffa8cc', '#ffd0ea'],
  ['#2a120a', '#7a2e14', '#b8501e', '#e88a3a', '#ffc98a', '#ffe8a0'],
  ['#0a2224', '#14555a', '#1f8a88', '#46c4b4', '#a8f0e0', '#c8fff4'],
  ['#1a1030', '#3e2a6e', '#6544a8', '#9a78dc', '#d4c0ff', '#e8dcff'],
  ['#221e18', '#5e5444', '#9a8e74', '#cfc4a8', '#f4ecd8', '#fff8e0'],
  ['#14220a', '#3a5a14', '#64901e', '#9cc83c', '#dcf08a', '#f4ffb0'],
];

const hex = (c: string) => parseInt(c.slice(1), 16);

/** A plant's colours for its gibs: stem, body, glow. */
export function floraColors(f: Flora): number[] {
  if (f.kind === FloraKind.Tubes) return [0xd8d0c4, 0x9a9088, 0xe02838];
  if (f.kind === FloraKind.Coral || f.kind === FloraKind.Blister) {
    const pal = CORAL_PALS[Math.floor(rnd(f.seed, 0) * CORAL_PALS.length)];
    return [hex(pal[1]), hex(pal[3]), f.kind === FloraKind.Blister ? 0xd8f060 : hex(pal[5])];
  }
  const pal = PALETTES[Math.floor(rnd(f.seed, 0) * PALETTES.length)];
  return [hex(pal[1]), hex(pal[2]), hex(pal[3])];
}

