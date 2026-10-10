import type { GameRoom } from './room.ts';
import type { Lobby } from './lobby.ts';
import { originAllowed } from './guard.ts';

export { GameRoom } from './room.ts';
export { Lobby } from './lobby.ts';

export interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>;
  LOBBY: DurableObjectNamespace<Lobby>;
  ASSETS: Fetcher;
}

/**
 * One room, one runtime: every player is gathered into the same match (one
 * Durable Object), whatever room a client asks for (bar ?room=siege, a
 * second match that plays nothing but Siege). It holds 64; bots fill
 * the slots no human has, and give theirs up as humans arrive. (Not
 * exported: the Workers runtime takes every export of this module for a handler.)
 */
const MAIN_ROOM = 'main';
/** The one other room: Siege, all day (for anyone who wants nothing else; room.ts gives it that rotation). */
const SIEGE_ROOM = 'siege';

/** The room board, as last fetched: every isolate serves it from here for a couple of seconds, so a flood of menu loads never reaches the Lobby. */
const ROOMS_TTL_MS = 2000;
let roomsCache: { at: number; body: string } | null = null;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const lobby = () => env.LOBBY.get(env.LOBBY.idFromName('global'));

    if (url.pathname.startsWith('/api/') && request.method !== 'GET') return new Response('method not allowed', { status: 405 });
    if (url.pathname === '/api/join') return Response.json({ room: MAIN_ROOM });
    if (url.pathname === '/api/rooms') {
      const now = Date.now();
      if (!roomsCache || now - roomsCache.at > ROOMS_TTL_MS) roomsCache = { at: now, body: JSON.stringify(await lobby().list()) };
      return new Response(roomsCache.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=2' } });
    }
    if (url.pathname === '/ws') {
      // Turned away here, before a Durable Object is woken: anything but a
      // browser's WebSocket upgrade from this site's own pages.
      if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      if (!originAllowed(request.headers.get('Origin'), url.host)) return new Response('forbidden', { status: 403 });
      const room = url.searchParams.get('room') === SIEGE_ROOM ? SIEGE_ROOM : MAIN_ROOM;
      url.searchParams.set('room', room);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      return stub.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
