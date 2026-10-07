import { DurableObject } from 'cloudflare:workers';
import { MAX_PLAYERS } from '../shared/constants.ts';
import type { Env } from './worker.ts';

interface RoomInfo {
  count: number; // last population the room reported
  reservations: number[]; // timestamps of seats handed out but not yet seen in a report
  updated: number;
}

const STALE_MS = 30_000;
const RESERVATION_MS = 8_000;

/**
 * Matchmaker. Packs players into the fullest room that still has space so
 * matches feel alive, and opens a new room when all are full. Rooms report
 * their real population on join/leave and every ~10 s; seats handed out in
 * between are held as short-lived reservations so a burst of joins cannot
 * overfill a room.
 */
export class Lobby extends DurableObject<Env> {
  private rooms = new Map<string, RoomInfo>();
  private nextRoom = 1;

  async report(room: string, count: number): Promise<void> {
    const info = this.rooms.get(room);
    if (count === 0) {
      this.rooms.delete(room);
      return;
    }
    if (!info) {
      this.rooms.set(room, { count, reservations: [], updated: Date.now() });
      const m = /^room-(\d+)$/.exec(room);
      if (m) this.nextRoom = Math.max(this.nextRoom, Number(m[1]) + 1);
      return;
    }
    // Arrivals since the last report consume the oldest reservations.
    const arrived = count - info.count;
    if (arrived > 0) info.reservations.splice(0, arrived);
    info.count = count;
    info.updated = Date.now();
  }

  async pick(): Promise<string> {
    this.prune();
    let best: string | null = null;
    let bestCount = -1;
    for (const [name, info] of this.rooms) {
      const n = info.count + info.reservations.length;
      if (n < MAX_PLAYERS && n > bestCount) {
        best = name;
        bestCount = n;
      }
    }
    if (!best) {
      best = `room-${this.nextRoom++}`;
      this.rooms.set(best, { count: 0, reservations: [], updated: Date.now() });
    }
    this.rooms.get(best)!.reservations.push(Date.now());
    return best;
  }

  async list(): Promise<{ room: string; players: number }[]> {
    this.prune();
    return [...this.rooms]
      .filter(([, i]) => i.count > 0)
      .map(([room, i]) => ({ room, players: i.count }));
  }

  private prune(): void {
    const now = Date.now();
    for (const [name, info] of this.rooms) {
      while (info.reservations.length && now - info.reservations[0] > RESERVATION_MS) info.reservations.shift();
      if (now - info.updated > STALE_MS && info.reservations.length === 0) this.rooms.delete(name);
    }
  }
}
