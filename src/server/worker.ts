import type { GameRoom } from './room.ts';
import type { Lobby } from './lobby.ts';

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const lobby = () => env.LOBBY.get(env.LOBBY.idFromName('global'));

    if (url.pathname === '/api/join') return Response.json({ room: MAIN_ROOM });
    if (url.pathname === '/api/rooms') {
      return Response.json(await lobby().list());
    }
    if (url.pathname === '/ws') {
      const room = url.searchParams.get('room') === SIEGE_ROOM ? SIEGE_ROOM : MAIN_ROOM;
      url.searchParams.set('room', room);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      return stub.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
