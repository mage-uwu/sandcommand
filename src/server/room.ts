import { DurableObject } from 'cloudflare:workers';
import { Reader, Writer } from '../shared/codec.ts';
import { TICK_RATE } from '../shared/constants.ts';
import {
  C_CHAT,
  C_BUILD,
  C_INPUT,
  C_PING,
  C_RESYNC,
  PROTOCOL_VERSION,
  S_PONG,
  S_REJECT,
  S_WELCOME,
} from '../shared/protocol.ts';
import { World } from './world.ts';
import type { Env } from './worker.ts';

const TICK_MS = 1000 / TICK_RATE;
const MAX_CATCHUP_TICKS = 4;

function seedFromName(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * One match = one Durable Object. Its single-threaded isolate is the
 * authoritative physics host for up to 64 players; Cloudflare places it near
 * whoever created the room and pins all sockets to it.
 */
export class GameRoom extends DurableObject<Env> {
  private world: World | null = null;
  private roomName = '';
  private sockets = new Map<WebSocket, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private lastReport = 0;
  // Telemetry window.
  private statTicks = 0;
  private statWorkMs = 0;
  private statMaxMs = 0;
  private statLate = 0;

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const url = new URL(request.url);
    this.roomName = url.searchParams.get('room') ?? this.roomName;
    const name = url.searchParams.get('name') ?? '';

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    // Newer compatibility dates default server sockets to Blob messages; the
    // input path must stay synchronous so commands keep their order.
    (server as unknown as { binaryType: string }).binaryType = 'arraybuffer';

    this.world ??= new World(seedFromName(this.roomName));
    const world = this.world;
    const player = world.addPlayer(name, {
      send(data) {
        try {
          server.send(data);
        } catch {
          // socket already closing; the close handler cleans up
        }
      },
    });

    if (!player) {
      const w = new Writer(64);
      w.u8(S_REJECT);
      w.str('room full');
      server.send(w.finish());
      server.close(1013, 'room full');
      return new Response(null, { status: 101, webSocket: client });
    }

    this.sockets.set(server, player.id);
    const welcome = new Writer(64);
    welcome.u8(S_WELCOME);
    welcome.u8(player.id);
    welcome.u32(world.tick);
    welcome.u8(TICK_RATE);
    welcome.u8(PROTOCOL_VERSION);
    welcome.str(this.roomName);
    server.send(welcome.finish());

    server.addEventListener('message', (ev) => this.onMessage(server, ev.data));
    const drop = () => this.onClose(server);
    server.addEventListener('close', drop);
    server.addEventListener('error', drop);

    this.startLoop();
    this.report();
    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(ws: WebSocket, data: unknown): void {
    const id = this.sockets.get(ws);
    const world = this.world;
    if (id === undefined || !world || !(data instanceof ArrayBuffer)) return;
    try {
      const r = new Reader(new Uint8Array(data));
      switch (r.u8()) {
        case C_INPUT:
          world.input(id, { seq: r.u16(), buttons: r.u8(), aim: r.u16(), inv: r.u8() });
          break;
        case C_RESYNC:
          while (r.remaining >= 2) world.resync(id, r.u16());
          break;
        case C_PING: {
          const t = r.f64();
          const w = new Writer(16);
          w.u8(S_PONG);
          w.f64(t);
          ws.send(w.finish());
          break;
        }
        case C_CHAT:
          world.chat(id, r.str());
          break;
        case C_BUILD:
          world.build(id, r.u8(), r.u16(), r.u16());
          break;
      }
    } catch {
      // Malformed client message: ignore it.
    }
  }

  private onClose(ws: WebSocket): void {
    const id = this.sockets.get(ws);
    if (id === undefined) return;
    this.sockets.delete(ws);
    this.world?.removePlayer(id);
    try {
      ws.close(1000, 'bye');
    } catch {
      // already closed
    }
    this.report();
    if (this.sockets.size === 0) this.stopLoop();
  }

  private startLoop(): void {
    if (this.timer) return;
    this.lastTick = Date.now();
    // Fixed-timestep accumulator on top of a fast interval; tolerant of timer jitter.
    this.timer = setInterval(() => this.pump(), Math.floor(TICK_MS / 3));
  }

  private stopLoop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private pump(): void {
    const world = this.world;
    if (!world) return;
    const now = Date.now();
    let steps = 0;
    while (now - this.lastTick >= TICK_MS && steps < MAX_CATCHUP_TICKS) {
      world.step();
      this.lastTick += TICK_MS;
      steps++;
      const ms = world.lastStepMs + world.lastReplicateMs;
      this.statTicks++;
      this.statWorkMs += ms;
      this.statMaxMs = Math.max(this.statMaxMs, ms);
    }
    if (steps > 1) this.statLate++;
    if (now - this.lastTick > TICK_MS * MAX_CATCHUP_TICKS) this.lastTick = now; // drop backlog
    if (now - this.lastReport > 10_000) {
      this.report();
      this.logStats();
    }
  }

  private logStats(): void {
    const world = this.world;
    if (!world || this.statTicks === 0) return;
    // Workers clocks only advance across I/O, so on production these timings
    // are coarse; they are exact under `wrangler dev`.
    console.log(
      JSON.stringify({
        room: this.roomName,
        players: world.playerCount,
        ticks: this.statTicks,
        avgTickMs: +(this.statWorkMs / this.statTicks).toFixed(3),
        maxTickMs: +this.statMaxMs.toFixed(3),
        catchUps: this.statLate,
        grains: world.grains.n,
        projectiles: world.projectiles.n,
      }),
    );
    this.statTicks = this.statWorkMs = this.statMaxMs = this.statLate = 0;
  }

  private report(): void {
    this.lastReport = Date.now();
    if (!this.roomName) return;
    const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName('global'));
    lobby.report(this.roomName, this.sockets.size).catch(() => {});
  }
}
