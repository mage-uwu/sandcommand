import { describe, expect, it } from 'vitest';
import {
  ConnGuard,
  IDLE_MS,
  IpGauge,
  MAX_MESSAGE_BYTES,
  MAX_PER_IP,
  MsgClass,
  TokenBucket,
  Verdict,
  cleanChat,
  cleanName,
  originAllowed,
} from '../src/server/guard.ts';
import { World } from '../src/server/world.ts';

describe('token bucket', () => {
  it('spends a burst, then refills at its rate', () => {
    const b = new TokenBucket(3, 2, 0);
    expect([b.take(0), b.take(0), b.take(0), b.take(0)]).toEqual([true, true, true, false]);
    expect(b.take(400)).toBe(false); // 0.8 of a token
    expect(b.take(500)).toBe(true);
    expect(b.take(100_000, 3)).toBe(true); // (capped at capacity)
    expect(b.take(100_000)).toBe(false);
  });
});

describe('connection guard', () => {
  it('an honest client (30 inputs and a ping a second, a hitch now and then) is never limited', () => {
    const g = new ConnGuard(0);
    for (let t = 0; t < 60_000; t += 33) {
      // A 250 ms hitch every 5 s: its inputs arrive all at once.
      if (t % 5000 < 33) for (let k = 0; k < 8; k++) expect(g.check(t, 7, MsgClass.Input)).toBe(Verdict.Ok);
      expect(g.check(t, 7, MsgClass.Input)).toBe(Verdict.Ok);
      if (t % 1000 < 33) expect(g.check(t, 9, MsgClass.Ping)).toBe(Verdict.Ok);
    }
    // A full map resync once in a while (a corrupt frame).
    expect(g.check(60_000, 2049, MsgClass.Resync, 1024)).toBe(Verdict.Ok);
  });

  it('a flood is dropped, then the socket closed', () => {
    const g = new ConnGuard(0);
    const verdicts: Verdict[] = [];
    for (let k = 0; k < 2000; k++) verdicts.push(g.check(k / 10, 7, MsgClass.Input));
    expect(verdicts.slice(0, 120).every((v) => v === Verdict.Ok)).toBe(true);
    expect(verdicts).toContain(Verdict.Drop);
    expect(verdicts.at(-1)).toBe(Verdict.Kick);
  });

  it('chat, building and radio calls have their own, tighter limits', () => {
    const g = new ConnGuard(0);
    const chats = Array.from({ length: 10 }, (_, k) => g.check(k * 10, 20, MsgClass.Chat));
    expect(chats.filter((v) => v === Verdict.Ok).length).toBe(4);
    const builds = Array.from({ length: 30 }, (_, k) => g.check(k * 10, 6, MsgClass.Build));
    expect(builds.filter((v) => v === Verdict.Ok).length).toBeLessThanOrEqual(11);
    // Inputs still go through.
    expect(g.check(400, 7, MsgClass.Input)).toBe(Verdict.Ok);
  });

  it('oversized, unknown and malformed messages are strikes; enough of them close the socket', () => {
    const g = new ConnGuard(0);
    expect(g.check(0, MAX_MESSAGE_BYTES + 1, MsgClass.Input)).toBe(Verdict.Drop);
    expect(g.check(0, 3, null)).toBe(Verdict.Drop);
    let v = Verdict.Drop;
    for (let k = 0; k < 30 && v !== Verdict.Kick; k++) v = g.malformed(k);
    expect(v).toBe(Verdict.Kick);
  });

  it('strikes are forgiven over time', () => {
    const g = new ConnGuard(0);
    for (let k = 0; k < 15; k++) g.malformed(0);
    expect(g.malformed(60_000)).toBe(Verdict.Drop);
  });

  it('a socket silent too long is idle', () => {
    const g = new ConnGuard(0);
    expect(g.idle(IDLE_MS - 1)).toBe(false);
    g.check(IDLE_MS - 1, 9, MsgClass.Ping);
    expect(g.idle(IDLE_MS + 10)).toBe(false);
    expect(g.idle(2 * IDLE_MS + 10)).toBe(true);
  });
});

describe('per-address limits', () => {
  it('caps live sockets per address', () => {
    const ips = new IpGauge();
    for (let k = 0; k < MAX_PER_IP; k++) {
      expect(ips.admit('1.2.3.4', k)).toBe('ok');
      ips.open('1.2.3.4');
    }
    expect(ips.admit('1.2.3.4', 10)).toBe('busy');
    expect(ips.admit('5.6.7.8', 10)).toBe('ok');
    ips.close('1.2.3.4');
    expect(ips.admit('1.2.3.4', 20)).toBe('ok');
  });

  it('caps the rate of connection attempts, and recovers', () => {
    const ips = new IpGauge();
    const tries = Array.from({ length: 30 }, (_, k) => ips.admit('9.9.9.9', k));
    expect(tries.filter((r) => r === 'ok').length).toBe(10);
    expect(tries.at(-1)).toBe('rate');
    expect(ips.admit('9.9.9.9', 10_000)).toBe('ok');
  });
});

describe('scrubbing', () => {
  it('chat loses control, invisible and bidi characters and zalgo stacks', () => {
    expect(cleanChat('hi\u0007 ‮there​')).toBe('hi there');
    expect(cleanChat('ź̂̃̄̅a')).toBe('ź̂a');
    expect(cleanChat('a   \n\t b')).toBe('a b');
    expect(cleanChat('x'.repeat(500)).length).toBe(120);
    expect(cleanChat('   ')).toBe('');
  });

  it('names keep to letters, digits and a little punctuation, and never wear the BOT tag', () => {
    expect(cleanName('<script>alert(1)</script>')).toBe('scriptalert1scri');
    expect(cleanName('BOT bot Sneaky')).toBe('Sneaky');
    expect(cleanName('a‮b​c')).toBe('abc');
    expect(cleanName('Zoë_99')).toBe('Zoë_99');
    expect(cleanName('x'.repeat(1000)).length).toBe(16);
  });

  it('the world uses them', () => {
    const world = new World(5, { mode: 'ffa', bots: 0 });
    const p = world.addPlayer('‮BOT  Evil​', { send() {} })!;
    expect(p.name).toBe('Evil');
  });
});

describe('origin check', () => {
  it('takes this site and local dev servers, nothing else', () => {
    expect(originAllowed('https://comsand.example.dev', 'comsand.example.dev')).toBe(true);
    expect(originAllowed('http://localhost:8787', 'comsand.example.dev')).toBe(true);
    expect(originAllowed('https://evil.example', 'comsand.example.dev')).toBe(false);
    expect(originAllowed('https://comsand.example.dev.evil.example', 'comsand.example.dev')).toBe(false);
    expect(originAllowed(null, 'comsand.example.dev')).toBe(false);
    expect(originAllowed('null', 'comsand.example.dev')).toBe(false);
  });
});
