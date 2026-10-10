/**
 * Scrubbing for text one player shows another (chat lines, names). The
 * server applies it before anything is broadcast, and the client again on
 * receipt. The text is only ever painted on the canvas with fillText,
 * never parsed as HTML or run, so this is about readability and spoofing
 * (bidi overrides that flip a line, zero-width tricks, zalgo), not about
 * script injection, which has no way in (see test/chatsafe.test.ts).
 */

/** Invisible and direction-flipping characters (zero-width, bidi overrides and isolates, BOM). */
const INVISIBLE = /[​-‏‪-‮⁠-⁯﻿]/g;

/** Chat line as broadcast: no control or invisible characters, no stacked combining marks ("zalgo"), spaces collapsed, 120 at most. */
export function cleanChat(text: string): string {
  return inert(text, 120);
}

/** Any text from another player made inert for display: no control or invisible characters, no zalgo, spaces collapsed, `max` at most. */
export function inert(text: string, max: number): string {
  return String(text)
    .slice(0, max * 4)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(INVISIBLE, '')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Player name: letters, digits, space, _ - . only; 16 at most; never wearing the bots' BOT tag. */
export function cleanName(name: string): string {
  return name
    .slice(0, 64)
    .replace(/[^\p{L}\p{N} _\-.]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(bot\s+)+/i, '')
    .slice(0, 16)
    .trim();
}

