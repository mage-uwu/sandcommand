import { describe, expect, it } from 'vitest';
import { BAR, BPM, D_LOCRIAN, NIGHT_BPM, SONGS, composeBar, composeNight } from '../src/client/music.ts';

/** D natural minor, by pitch class. */
const D_MINOR = new Set([2, 4, 5, 7, 9, 10, 0]);

describe('soundtrack', () => {
  it('is slow and half-time, witch house style', () => {
    expect(BPM).toBeLessThanOrEqual(80);
    expect(BAR).toBeGreaterThan(3);
  });

  it('is the same for the same seed, and different for another', () => {
    const a = Array.from({ length: 48 }, (_, i) => composeBar(i, 7));
    expect(Array.from({ length: 48 }, (_, i) => composeBar(i, 7))).toEqual(a);
    expect(Array.from({ length: 48 }, (_, i) => composeBar(i, 8))).not.toEqual(a);
  });

  it('stays in key, inside the bar, at sane volumes', () => {
    for (let bar = 0; bar < 96; bar++) {
      for (const e of composeBar(bar, 3)) {
        expect(e.beat).toBeGreaterThanOrEqual(0);
        expect(e.beat).toBeLessThan(4);
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(1);
        for (const n of e.notes) expect(D_MINOR.has(((n % 12) + 12) % 12)).toBe(true);
      }
    }
  });

  it('builds in sections: pads and bells first, then the arp, then the drop with drums and an 808', () => {
    const parts = (from: number) => new Set(Array.from({ length: 8 }, (_, i) => composeBar(from + i, 5)).flat().map((e) => e.part));
    const intro = parts(0);
    expect(intro.has('pad')).toBe(true);
    expect(intro.has('arp') || intro.has('kick') || intro.has('bass')).toBe(false);
    const arp = parts(8);
    expect(arp.has('arp') && !arp.has('kick')).toBe(true);
    const drop = parts(16);
    for (const p of ['pad', 'arp', 'bass', 'kick', 'snare', 'hat'] as const) expect(drop.has(p)).toBe(true);
    const breakdown = parts(32);
    expect(breakdown.has('kick')).toBe(false);
    // Sixteenth-note arps, snare on three (half time).
    const bar = composeBar(17, 5);
    expect(bar.filter((e) => e.part === 'arp').every((e) => (e.beat * 4) % 1 === 0)).toBe(true);
    expect(bar.find((e) => e.part === 'snare')?.beat).toBe(2);
  });
});

describe('nightttt', () => {
  it('is a house tempo, and takes turns with the theme', () => {
    expect(NIGHT_BPM).toBeGreaterThanOrEqual(118);
    expect(NIGHT_BPM).toBeLessThanOrEqual(130);
    expect(SONGS.map((s) => s.name)).toEqual(['theme', 'nightttt']);
    expect(SONGS[1].compose).toBe(composeNight);
  });

  it('is in D Locrian, and the same for the same seed', () => {
    for (let bar = 0; bar < 64; bar++) {
      for (const e of composeNight(bar, 4)) {
        expect(e.beat).toBeGreaterThanOrEqual(0);
        expect(e.beat).toBeLessThan(4);
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(1);
        for (const n of e.notes) expect(D_LOCRIAN.has(((n % 12) + 12) % 12)).toBe(true);
      }
    }
    expect(composeNight(20, 4)).toEqual(composeNight(20, 4));
  });

  it('has an octave bass, bloops, and a four-on-the-floor house beat once it drops', () => {
    const bar = composeNight(16, 9); // the drop
    const kicks = bar.filter((e) => e.part === 'kick').map((e) => e.beat);
    expect(kicks).toEqual([0, 1, 2, 3]);
    expect(bar.filter((e) => e.part === 'clap').map((e) => e.beat)).toEqual([1, 3]);
    expect(bar.filter((e) => e.part === 'ohat').map((e) => e.beat)).toEqual([0.5, 1.5, 2.5, 3.5]);
    // The bass jumps octaves: roots and their octave above.
    const bass = bar.filter((e) => e.part === 'obass').map((e) => e.notes[0]);
    const lo = Math.min(...bass);
    expect(bass.some((n) => n === lo + 12)).toBe(true);
    const bloops = Array.from({ length: 8 }, (_, i) => composeNight(16 + i, 9)).flat().filter((e) => e.part === 'bloop');
    expect(bloops.length).toBeGreaterThan(8);
    // The intro has no beat yet; the breakdown drops the kick.
    expect(composeNight(0, 9).some((e) => e.part === 'kick')).toBe(false);
    expect(composeNight(32, 9).some((e) => e.part === 'kick')).toBe(false);
  });
});
