/**
 * Network load test: N bot clients over real WebSockets against a running
 * worker (`npm run dev`, or a deployed URL). Each bot decodes every frame and
 * maintains its own terrain replica, like a browser would.
 *
 *   BOTS=64 SECONDS=30 URL=http://127.0.0.1:8787 npm run loadtest
 */
import { BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP } from '../src/shared/actor.ts';
import { WEAPONS } from '../src/shared/weapons.ts';
import { Reader, Writer } from '../src/shared/codec.ts';
import { applyFrameRecords, nullHandler } from '../src/shared/frame.ts';
import { C_INPUT, C_PING, S_FRAME, S_PONG, S_REJECT, S_WELCOME, quantizeAim } from '../src/shared/protocol.ts';
import { Terrain } from '../src/shared/terrain.ts';

const BOTS = Number(process.env.BOTS ?? 64);
const SECONDS = Number(process.env.SECONDS ?? 20);
const BASE = process.env.URL ?? 'http://127.0.0.1:8787';
const ROOM = process.env.ROOM; // optional fixed room; default uses the matchmaker

interface Bot {
  room: string;
  frames: number;
  bytes: number;
  gaps: number[];
  lastFrameAt: number;
  rtt: number[];
  rejected: boolean;
  errors: number;
}

async function runBot(i: number): Promise<Bot> {
  const room = ROOM ?? ((await (await fetch(`${BASE}/api/join`)).json()) as { room: string }).room;
  const bot: Bot = { room, frames: 0, bytes: 0, gaps: [], lastFrameAt: 0, rtt: [], rejected: false, errors: 0 };
  const terrain = new Terrain();
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?room=${room}&name=bot${i}`);
  ws.binaryType = 'arraybuffer';
  const w = new Writer(32);
  let seq = 0;
  let buttons = 0;
  let aim = 0;
  let weapon = i % WEAPONS.length;
  ws.addEventListener('message', (ev: MessageEvent) => {
    const buf = new Uint8Array(ev.data as ArrayBuffer);
    const r = new Reader(buf);
    const type = r.u8();
    if (type === S_FRAME) {
      const now = performance.now();
      if (bot.lastFrameAt) bot.gaps.push(now - bot.lastFrameAt);
      bot.lastFrameAt = now;
      bot.frames++;
      bot.bytes += buf.length;
      r.u32();
      r.u16();
      try {
        applyFrameRecords(r, terrain, nullHandler);
      } catch {
        bot.errors++;
      }
    } else if (type === S_PONG) {
      bot.rtt.push(performance.now() - r.f64());
    } else if (type === S_REJECT) {
      bot.rejected = true;
    } else if (type === S_WELCOME) {
      // ok
    }
  });
  await new Promise<void>((res, rej) => {
    ws.addEventListener('open', () => res());
    ws.addEventListener('error', () => rej(new Error('ws error')));
  });
  const inputTimer = setInterval(() => {
    if (Math.random() < 0.05) buttons = (Math.random() < 0.5 ? BTN_LEFT : BTN_RIGHT) | (Math.random() < 0.4 ? BTN_UP : 0);
    if (Math.random() < 0.1) aim = Math.random() * Math.PI * 2;
    if (Math.random() < 0.01) weapon = Math.floor(Math.random() * WEAPONS.length);
    const fire = Math.random() < 0.5 ? BTN_FIRE : 0;
    w.reset();
    w.u8(C_INPUT);
    w.u16(++seq & 0xffff);
    w.u8(buttons | fire);
    w.u16(quantizeAim(aim));
    w.u8(weapon);
    if (ws.readyState === WebSocket.OPEN) ws.send(w.finish());
  }, 1000 / 30);
  const pingTimer = setInterval(() => {
    w.reset();
    w.u8(C_PING);
    w.f64(performance.now());
    if (ws.readyState === WebSocket.OPEN) ws.send(w.finish());
  }, 1000);
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  clearInterval(inputTimer);
  clearInterval(pingTimer);
  ws.close();
  return bot;
}

const pct = (a: number[], q: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * q)] : NaN);
const bots = await Promise.all(Array.from({ length: BOTS }, (_, i) => new Promise((r) => setTimeout(r, i * 20)).then(() => runBot(i))));
const rooms = new Map<string, number>();
for (const b of bots) rooms.set(b.room, (rooms.get(b.room) ?? 0) + 1);
const gaps = bots.flatMap((b) => b.gaps);
const rtts = bots.flatMap((b) => b.rtt);
const fps = bots.map((b) => b.frames / SECONDS);
const kbps = bots.map((b) => b.bytes / SECONDS / 1024);
console.log(`bots=${BOTS} seconds=${SECONDS} rooms=${JSON.stringify(Object.fromEntries(rooms))}`);
console.log(`rejected=${bots.filter((b) => b.rejected).length} decodeErrors=${bots.reduce((s, b) => s + b.errors, 0)}`);
console.log(`frames/s per bot: min ${Math.min(...fps).toFixed(1)} avg ${(fps.reduce((s, v) => s + v, 0) / fps.length).toFixed(1)} (target 30)`);
console.log(`frame gap ms: p50 ${pct(gaps, 0.5).toFixed(1)} p95 ${pct(gaps, 0.95).toFixed(1)} p99 ${pct(gaps, 0.99).toFixed(1)}`);
console.log(`rtt ms: p50 ${pct(rtts, 0.5).toFixed(1)} p95 ${pct(rtts, 0.95).toFixed(1)}`);
console.log(`downstream KB/s per bot (incl. initial chunk sync): avg ${(kbps.reduce((s, v) => s + v, 0) / kbps.length).toFixed(1)} max ${Math.max(...kbps).toFixed(1)}`);
