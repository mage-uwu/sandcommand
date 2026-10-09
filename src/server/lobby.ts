import { DurableObject } from 'cloudflare:workers';
import type { Env } from './worker.ts';

const STALE_MS = 30_000;

/**
 * The room board: the one match reports its population on join/leave and
 * every ~10 s, and the menu shows it. (There is only ever one room: see
 * MAIN_ROOM in worker.ts.)
 */
export class Lobby extends DurableObject<Env> {
  private rooms = new Map<string, { count: number; updated: number }>();

  async report(room: string, count: number): Promise<void> {
    if (count === 0) this.rooms.delete(room);
    else this.rooms.set(room, { count, updated: Date.now() });
  }

  async list(): Promise<{ room: string; players: number }[]> {
    const now = Date.now();
    for (const [name, info] of this.rooms) if (now - info.updated > STALE_MS) this.rooms.delete(name);
    return [...this.rooms].map(([room, i]) => ({ room, players: i.count }));
  }
}
