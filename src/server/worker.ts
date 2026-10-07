import type { GameRoom } from './room.ts';
import type { Lobby } from './lobby.ts';

export { GameRoom } from './room.ts';
export { Lobby } from './lobby.ts';

export interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>;
  LOBBY: DurableObjectNamespace<Lobby>;
  ASSETS: Fetcher;
}

const ROOM_RE = /^[a-z0-9-]{1,32}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const lobby = () => env.LOBBY.get(env.LOBBY.idFromName('global'));

    if (url.pathname === '/api/join') {
      const room = await lobby().pick();
      return Response.json({ room });
    }
    if (url.pathname === '/api/rooms') {
      return Response.json(await lobby().list());
    }
    if (url.pathname === '/ws') {
      const room = (url.searchParams.get('room') ?? '').toLowerCase();
      if (!ROOM_RE.test(room)) return new Response('bad room', { status: 400 });
      url.searchParams.set('room', room);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      return stub.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
