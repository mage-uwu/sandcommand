import { GRAVITY } from './constants.ts';
import type { Rng } from './rng.ts';
import type { Terrain } from './terrain.ts';
import { WEAPONS, WeaponId } from './weapons.ts';

/**
 * Inventories and weapons lying on the ground, Cortex Command style.
 *
 * A clone carries a handful of items (each a weapon with its own magazine)
 * and holds one. Anything can be dropped, everything spills on death, and
 * whatever lies on the ground can be picked up by anyone: a dead sniper's
 * rifle is there for the taking.
 *
 * Ground items are small physical bodies. `stepItem` is shared, so clients
 * simulate an item's flight exactly as the server does from the state it was
 * last sent; the server only resends an item when something changes it (it
 * lands, a blast kicks it, it is picked up).
 */
export const INV_MAX = 6;
/** How close (cells, centre to centre) a clone must be to pick something up. */
export const PICKUP_R = 14;
/** Ticks a dropped weapon lies around before it's cleared away. */
export const ITEM_LIFE = 30 * 90;
export const MAX_ITEMS = 160;
/** No weapon in hand (empty inventory). */
export const NO_WEAPON = 255;

/** Weapons a clone may spawn with as its primary. */
export const PRIMARIES: readonly number[] = [WeaponId.Rifle, WeaponId.Sniper, WeaponId.Bazooka];

export interface InvItem {
  weapon: number; // WeaponId
  ammo: number; // rounds in its magazine
}

export function newItem(weapon: number): InvItem {
  return { weapon, ammo: WEAPONS[weapon].clip };
}

/**
 * A fresh clone's kit: always a primary, a digger, a materializer and a
 * radio; often grenades, sometimes a second gun.
 */
export function spawnLoadout(rng: Rng): InvItem[] {
  const primary = PRIMARIES[rng.int(PRIMARIES.length)];
  const inv = [newItem(primary)];
  if (rng.next() < 0.6) inv.push(newItem(WeaponId.Grenade));
  if (rng.next() < 0.25) {
    const others = PRIMARIES.filter((w) => w !== primary);
    inv.push(newItem(others[rng.int(others.length)]));
  }
  inv.push(newItem(WeaponId.Digger), newItem(WeaponId.Materializer), newItem(WeaponId.Radio));
  return inv;
}

export interface GroundItem {
  id: number;
  weapon: number;
  ammo: number;
  x: number; // centre
  y: number;
  vx: number;
  vy: number;
  rest: boolean;
  /** Lying pointing left (how it was dropped). */
  left: boolean;
}

const ITEM_MAX_FALL = 420;

/**
 * One tick of a dropped weapon: gravity, an axis-separated sweep through the
 * terrain in <= 1 cell steps, a dull bounce, and coming to rest on the
 * ground. A resting item wakes up when the ground under it goes.
 */
export function stepItem(it: GroundItem, t: Terrain, dt: number): void {
  if (it.rest) {
    if (t.isSolid(Math.floor(it.x), Math.floor(it.y) + 1)) return;
    it.rest = false;
  }
  it.vy = Math.min(ITEM_MAX_FALL, it.vy + GRAVITY * dt);
  let rem = it.vx * dt;
  while (rem !== 0) {
    const s = rem > 1 ? 1 : rem < -1 ? -1 : rem;
    if (t.isSolid(Math.floor(it.x + s), Math.floor(it.y))) {
      it.vx *= -0.3;
      break;
    }
    it.x += s;
    rem -= s;
  }
  rem = it.vy * dt;
  let landed = false;
  while (rem !== 0) {
    const s = rem > 1 ? 1 : rem < -1 ? -1 : rem;
    if (t.isSolid(Math.floor(it.x), Math.floor(it.y + s))) {
      landed = s > 0;
      it.vy *= -0.3;
      it.vx *= 0.6;
      break;
    }
    it.y += s;
    rem -= s;
  }
  if (landed && Math.abs(it.vy) < 25 && Math.abs(it.vx) < 12) {
    it.rest = true;
    it.vx = it.vy = 0;
    it.y = Math.floor(it.y) + 0.5;
  }
}

/**
 * The inventory byte of every input command: the slot the client has
 * selected (bits 0-2), tagged with the low bits of the inventory version it
 * was chosen from (bits 3-4; the server ignores a selection made against an
 * inventory that has since changed), plus held pick-up and drop keys (the
 * server acts on their rising edge).
 */
export const INV_PICKUP = 32;
export const INV_DROP = 64;

export function invByte(slot: number, version: number, pickup = false, drop = false): number {
  return (slot & 7) | ((version & 3) << 3) | (pickup ? INV_PICKUP : 0) | (drop ? INV_DROP : 0);
}
export const invSlot = (b: number) => b & 7;
export const invVersionBits = (b: number) => (b >> 3) & 3;
