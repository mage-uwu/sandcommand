/**
 * Abuse limits for the game server: plain token buckets, a per-socket guard
 * over the client messages, a per-address gauge over connections, and the
 * chat and name scrubbers. No Workers or DOM APIs here (tests drive it with
 * a fake clock).
 *
 * The budgets sit well clear of what an honest client does: it sends one
 * input a tick (30/s, a burst of ~8 after a hitch), a ping a second, and a
 * build, a radio call or a chat line only on a click or Enter.
 */

export class TokenBucket {
  private tokens: number;
  private at: number;

  /** When it was last drawn on. */
  get touched(): number {
    return this.at;
  }

  constructor(
    readonly capacity: number,
    readonly perSec: number,
    now: number,
  ) {
    this.tokens = capacity;
    this.at = now;
  }

  /** Spend `n` tokens if there are that many (refilling first); false means over the limit. */
  take(now: number, n = 1): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.at) / 1000) * this.perSec);
    this.at = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

/** Largest client message accepted (the biggest honest one, a full resync, is ~2 KB). */
export const MAX_MESSAGE_BYTES = 4096;
/** A socket that has sent nothing for this long is dropped (clients ping every second; a background tab, throttled, still pings once a minute). */
export const IDLE_MS = 90_000;
/** Strikes (messages over a limit, malformed or oversized) before the socket is closed. */
export const MAX_STRIKES = 200;
/** Strikes are forgiven at this rate, so a hitch now and then never adds up. */
const STRIKE_DECAY_PER_SEC = 4;

export const enum Verdict {
  Ok,
  /** Over a limit: drop this message. */
  Drop,
  /** Flooding: close the socket. */
  Kick,
}

/** Which bucket a message draws on besides the overall one. */
export const enum MsgClass {
  Input,
  Chat,
  Build,
  Call,
  Resync,
  Ping,
}

/** One socket's limits. */
export class ConnGuard {
  /** Every message. */
  private all: TokenBucket;
  private chat: TokenBucket;
  private build: TokenBucket;
  private call: TokenBucket;
  /** Resync is counted in chunks asked for: each one costs the server a chunk snapshot. */
  private resync: TokenBucket;
  private ping: TokenBucket;
  private strikes = 0;
  private strikeAt: number;
  lastSeen: number;

  constructor(now: number) {
    this.all = new TokenBucket(120, 60, now);
    this.chat = new TokenBucket(4, 0.5, now);
    this.build = new TokenBucket(10, 5, now);
    this.call = new TokenBucket(6, 2, now);
    this.resync = new TokenBucket(2048, 128, now);
    this.ping = new TokenBucket(5, 2, now);
    this.strikeAt = now;
    this.lastSeen = now;
  }

  /** A message has arrived: its size, kind, and (for a resync) how many chunks it asks for. */
  check(now: number, bytes: number, kind: MsgClass | null, cost = 1): Verdict {
    this.lastSeen = now;
    if (bytes > MAX_MESSAGE_BYTES || kind === null) return this.strike(now, 10);
    if (!this.all.take(now)) return this.strike(now, 1);
    const b =
      kind === MsgClass.Chat
        ? this.chat
        : kind === MsgClass.Build
          ? this.build
          : kind === MsgClass.Call
            ? this.call
            : kind === MsgClass.Resync
              ? this.resync
              : kind === MsgClass.Ping
                ? this.ping
                : null;
    if (b && !b.take(now, cost)) return this.strike(now, 1);
    return Verdict.Ok;
  }

  /** A message that failed to decode. */
  malformed(now: number): Verdict {
    return this.strike(now, 10);
  }

  idle(now: number): boolean {
    return now - this.lastSeen > IDLE_MS;
  }

  private strike(now: number, n: number): Verdict {
    this.strikes = Math.max(0, this.strikes - ((now - this.strikeAt) / 1000) * STRIKE_DECAY_PER_SEC) + n;
    this.strikeAt = now;
    return this.strikes >= MAX_STRIKES ? Verdict.Kick : Verdict.Drop;
  }
}

/** Live sockets one address may hold in a room (generous: a household, a LAN party, carrier NAT). */
export const MAX_PER_IP = 6;
/** Connection attempts one address may make: a burst, then this many a minute. */
const CONNECT_BURST = 10;
const CONNECTS_PER_MIN = 12;

/** Per-address connection limits for one room. */
export class IpGauge {
  private live = new Map<string, number>();
  private rate = new Map<string, TokenBucket>();
  private swept = 0;

  /** May `ip` open another socket? Counts the attempt either way; call `open` if it goes ahead. */
  admit(ip: string, now: number): 'ok' | 'busy' | 'rate' {
    this.sweep(now);
    let b = this.rate.get(ip);
    if (!b) this.rate.set(ip, (b = new TokenBucket(CONNECT_BURST, CONNECTS_PER_MIN / 60, now)));
    if (!b.take(now)) return 'rate';
    if ((this.live.get(ip) ?? 0) >= MAX_PER_IP) return 'busy';
    return 'ok';
  }

  open(ip: string): void {
    this.live.set(ip, (this.live.get(ip) ?? 0) + 1);
  }

  close(ip: string): void {
    const n = (this.live.get(ip) ?? 0) - 1;
    if (n > 0) this.live.set(ip, n);
    else this.live.delete(ip);
  }

  count(ip: string): number {
    return this.live.get(ip) ?? 0;
  }

  /** Forget the rate state of addresses that have gone quiet for a while (their buckets would be full again anyway). */
  private sweep(now: number): void {
    if (now - this.swept < 60_000) return;
    this.swept = now;
    const quiet = (CONNECT_BURST / CONNECTS_PER_MIN) * 60_000;
    for (const [ip, b] of this.rate) if (!this.live.has(ip) && now - b.touched > quiet) this.rate.delete(ip);
  }
}

export { cleanChat, cleanName } from '../shared/text.ts';

/** Is a WebSocket upgrade's Origin this site (or a local dev server)? Browsers always send one; a missing one is refused too. */
export function originAllowed(origin: string | null, host: string): boolean {
  if (!origin) return false;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  if (o.host === host) return true;
  return o.hostname === 'localhost' || o.hostname === '127.0.0.1' || o.hostname === '[::1]';
}
