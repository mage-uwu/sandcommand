/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { Reader } from '../src/shared/codec.ts';
import { applyFrameRecords, nullHandler } from '../src/shared/frame.ts';
import { S_FRAME } from '../src/shared/protocol.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { cleanChat, inert } from '../src/shared/text.ts';
import { World } from '../src/server/world.ts';
import HEADERS from '../public/_headers?raw';
import INDEX from '../public/index.html?raw';

/** Every client module's source. */
const CLIENT = import.meta.glob('../src/client/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/**
 * Chat (and names) can never run as code. Text from players is data end to
 * end: a length-prefixed string on the wire, scrubbed on both sides, and
 * painted with canvas fillText. No path turns it into HTML, a URL or
 * script, and the page's CSP (Trusted Types, no inline or eval) would refuse
 * one if it existed.
 */

const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  'javascript:alert(document.cookie)',
  '"><svg/onload=alert(1)>',
  '${alert(1)}',
  '{{constructor.constructor("alert(1)")()}}',
  "'); DROP TABLE players;--",
  '‮)1(trela',
];

describe('chat is inert', () => {
  it('a hostile line arrives as exactly the characters sent (scrubbed of invisibles), never anything more', () => {
    const world = new World(3, { mode: 'ffa', bots: 0 });
    const inbox: Uint8Array[] = [];
    const a = world.addPlayer('mallory', { send: () => {} })!;
    world.addPlayer('alice', { send: (m) => inbox.push(new Uint8Array(m)) });
    const heard: string[] = [];
    for (let t = 0; t < 16; t++) world.step(); // (past the chat cooldown)
    for (const text of PAYLOADS) {
      world.chat(a.id, text);
      for (let t = 0; t < 16; t++) world.step();
    }
    const h = { ...nullHandler, chat: (_id: number, s: string) => heard.push(s) };
    for (const m of inbox) {
      const r = new Reader(m);
      if (r.u8() !== S_FRAME) continue;
      r.u32();
      r.u16();
      applyFrameRecords(r, new Terrain(), h);
    }
    expect(heard).toEqual(PAYLOADS.map(cleanChat));
    // (The markup passes through as literal text: there is no HTML anywhere for it to become.)
    expect(heard[0]).toBe('<script>alert(1)</script>');
    expect(heard.at(-1)).toBe(')1(trela');
  });

  it('scrubbing is idempotent and bounded, whatever comes in', () => {
    for (const s of [...PAYLOADS, 'x'.repeat(10_000), '́'.repeat(500), '\u0000\u0007\u001b[31m']) {
      const once = cleanChat(s);
      expect(cleanChat(once)).toBe(once);
      expect(once.length).toBeLessThanOrEqual(120);
      expect(once).not.toMatch(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/);
    }
    expect(inert('BOT Spoof‮', 20)).toBe('BOT Spoof');
  });
});

describe('no code-execution sinks in the client', () => {
  // Anything that turns a string into markup, script or a navigation.
  const SINKS: [RegExp, string][] = [
    [/\.innerHTML\s*=/, 'innerHTML'],
    [/\.outerHTML\s*=/, 'outerHTML'],
    [/insertAdjacentHTML/, 'insertAdjacentHTML'],
    [/document\.write/, 'document.write'],
    [/createContextualFragment/, 'createContextualFragment'],
    [/DOMParser/, 'DOMParser'],
    [/\beval\s*\(/, 'eval'],
    [/new\s+Function\s*\(/, 'new Function'],
    [/set(Timeout|Interval)\s*\(\s*['"`]/, 'string timer'],
    [/\.srcdoc\s*=/, 'srcdoc'],
    [/location(\.href)?\s*=(?!=)/, 'navigation'],
    [/window\.open\s*\(/, 'window.open'],
  ];

  it('none in any client module', () => {
    const found: string[] = [];
    expect(Object.keys(CLIENT).length).toBeGreaterThan(20);
    for (const [f, src] of Object.entries(CLIENT)) {
      for (const [re, what] of SINKS) if (re.test(src)) found.push(`${f}: ${what}`);
    }
    expect(found).toEqual([]);
  });

  it('the CSP forbids inline script, eval and HTML sinks (Trusted Types), and framing', () => {
    const csp = HEADERS.match(/Content-Security-Policy: (.*)/)![1];
    expect(csp).toMatch(/script-src 'self'(;|$)/);
    expect(csp).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/);
    expect(csp).toMatch(/require-trusted-types-for 'script'/);
    expect(csp).toMatch(/trusted-types sw(;|$)/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    // And the page has no inline script for it to have to allow.
    const html = INDEX;
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });
});
