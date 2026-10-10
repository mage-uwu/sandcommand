import { Reader } from '../shared/codec.ts';
import { TICK_RATE } from '../shared/constants.ts';
import { PROTOCOL_VERSION, S_FRAME } from '../shared/protocol.ts';
import type { Link, NetHandlers } from './net.ts';
import { Tutorial } from './tutorial.ts';

const TICK_MS = 1000 / TICK_RATE;
/** At most this many ticks caught up in one go (a background tab comes back to a moment ago, not a fast-forward). */
const MAX_CATCHUP = 4;

/**
 * A match run in this page instead of on the server: the tutorial's World,
 * stepped at 30 Hz on a timer, its frames handed straight to the client as
 * the socket would hand them, and the client's commands straight back to it.
 * Nothing goes over the network.
 */
export class LocalLink implements Link {
  readonly tutorial: Tutorial;
  rttMs = 0;
  kbIn = 0;
  private timer: ReturnType<typeof setInterval>;
  private last = performance.now();
  private closed = false;

  constructor(name: string, h: NetHandlers) {
    this.tutorial = new Tutorial(name, {
      send: (data) => {
        if (this.closed) return;
        const r = new Reader(data);
        if (r.u8() !== S_FRAME) return;
        const tick = r.u32();
        const ack = r.u16();
        h.frame(tick, ack, r);
      },
    });
    const world = this.tutorial.world;
    // (Welcomed on the next turn, as a socket would be: after the caller has its link.)
    queueMicrotask(() => h.welcome({ id: this.tutorial.me.id, tick: world.tick, tickRate: TICK_RATE, version: PROTOCOL_VERSION, room: 'tutorial' }));
    this.timer = setInterval(() => this.pump(), Math.floor(TICK_MS / 3));
  }

  private pump(): void {
    const now = performance.now();
    let n = 0;
    while (now - this.last >= TICK_MS && n < MAX_CATCHUP) {
      this.tutorial.world.step();
      this.tutorial.update();
      this.last += TICK_MS;
      n++;
    }
    if (now - this.last > TICK_MS * MAX_CATCHUP) this.last = now;
  }

  get open(): boolean {
    return !this.closed;
  }

  input(seq: number, buttons: number, aim: number, inv: number): void {
    this.tutorial.world.input(this.tutorial.me.id, { seq, buttons, aim, inv });
  }

  resync(chunks: number[]): void {
    for (const c of chunks) this.tutorial.world.resync(this.tutorial.me.id, c);
  }

  build(piece: number, gx: number, gy: number): void {
    this.tutorial.world.build(this.tutorial.me.id, piece, gx, gy);
  }

  call(kind: number): void {
    this.tutorial.world.call(this.tutorial.me.id, kind);
  }

  chat(text: string): void {
    this.tutorial.world.chat(this.tutorial.me.id, text);
  }

  close(): void {
    this.closed = true;
    clearInterval(this.timer);
  }
}
