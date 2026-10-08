import { Reader, Writer } from '../shared/codec.ts';
import { C_BUILD, C_CALL, C_CHAT, C_INPUT, C_PING, C_RESYNC, S_FRAME, S_PONG, S_REJECT, S_WELCOME } from '../shared/protocol.ts';

export interface Welcome {
  id: number;
  tick: number;
  tickRate: number;
  version: number;
  room: string;
}

export interface NetHandlers {
  welcome(w: Welcome): void;
  frame(tick: number, ack: number, body: Reader): void;
  reject(reason: string): void;
  closed(reason: string): void;
}

/** WebSocket transport + bandwidth/latency accounting. */
export class Net {
  private ws: WebSocket;
  private w = new Writer(64);
  rttMs = 0;
  bytesIn = 0;
  bytesOut = 0;
  kbIn = 0; // smoothed KB/s
  private lastRate = performance.now();
  private bytesAtLastRate = 0;
  private pingTimer: ReturnType<typeof setInterval>;

  constructor(url: string, private h: NetHandlers) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onmessage = (ev) => this.onMessage(ev.data as ArrayBuffer);
    this.ws.onclose = (ev) => {
      clearInterval(this.pingTimer);
      h.closed(ev.reason || `connection closed (${ev.code})`);
    };
    this.pingTimer = setInterval(() => this.ping(), 1000);
  }

  get open(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  private onMessage(data: ArrayBuffer): void {
    const buf = new Uint8Array(data);
    this.bytesIn += buf.length;
    const r = new Reader(buf);
    switch (r.u8()) {
      case S_WELCOME:
        this.h.welcome({ id: r.u8(), tick: r.u32(), tickRate: r.u8(), version: r.u8(), room: r.str() });
        break;
      case S_FRAME: {
        const tick = r.u32();
        const ack = r.u16();
        this.h.frame(tick, ack, r);
        break;
      }
      case S_PONG: {
        const sample = performance.now() - r.f64();
        this.rttMs = this.rttMs === 0 ? sample : this.rttMs * 0.8 + sample * 0.2;
        break;
      }
      case S_REJECT:
        this.h.reject(r.str());
        break;
    }
    const now = performance.now();
    if (now - this.lastRate > 500) {
      const kb = (this.bytesIn - this.bytesAtLastRate) / 1024 / ((now - this.lastRate) / 1000);
      this.kbIn = this.kbIn * 0.5 + kb * 0.5;
      this.lastRate = now;
      this.bytesAtLastRate = this.bytesIn;
    }
  }

  private send(): void {
    if (!this.open) return;
    const out = this.w.finish();
    this.bytesOut += out.length;
    this.ws.send(out);
  }

  input(seq: number, buttons: number, aim: number, inv: number): void {
    const w = this.w.reset();
    w.u8(C_INPUT);
    w.u16(seq & 0xffff);
    w.u8(buttons);
    w.u16(aim);
    w.u8(inv);
    this.send();
  }

  resync(chunks: number[]): void {
    const w = this.w.reset();
    w.u8(C_RESYNC);
    for (const c of chunks) w.u16(c);
    this.send();
  }

  /** Ask the server to materialize a fortification piece with its grid top-left at (gx, gy). */
  build(piece: number, gx: number, gy: number): void {
    const w = this.w.reset();
    w.u8(C_BUILD);
    w.u8(piece);
    w.u16(gx);
    w.u16(gy);
    this.send();
  }

  /** Radio: call in support (CallKind). */
  call(kind: number): void {
    const w = this.w.reset();
    w.u8(C_CALL);
    w.u8(kind);
    this.send();
  }

  chat(text: string): void {
    const w = this.w.reset();
    w.u8(C_CHAT);
    w.str(text);
    this.send();
  }

  private ping(): void {
    const w = this.w.reset();
    w.u8(C_PING);
    w.f64(performance.now());
    this.send();
  }

  close(): void {
    clearInterval(this.pingTimer);
    this.ws.close();
  }
}
