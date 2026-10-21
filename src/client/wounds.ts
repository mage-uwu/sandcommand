/**
 * Wounds: damage you can see, on clones and creatures alike. Nothing new
 * goes over the wire; every client works its wounds out from what it's
 * already told, so everyone sees the same thing:
 *
 * - **Clones.** Every hit on a clone is already broadcast (R_HIT: where it
 *   struck, how hard). Each client pins a wound there, in the body's own
 *   frame (from its hip, as it faces), so it moves and turns with them.
 *   Close hits merge into one bigger wound. As the clone heals (a repair
 *   kit's wave) the oldest close up first (only as many show as its missing
 *   health allows); they're gone when it dies.
 * - **Creatures.** Their health is sent as a fraction; their scars follow
 *   from how far it has fallen from the most this client has seen of it
 *   (so a lair beast that starts at half strength starts unmarked) and from
 *   the creature's seed: which segments are cut, where, how deep. The same
 *   seed and damage give the same scars on every client.
 *
 * DOM-free: the renderer draws them (render.ts, dragon-art.ts).
 */

/** A wound on a clone: in its body's frame (cells from its hip, + forward as it faces, + down), how big, when (ms). */
export interface Wound {
  u: number;
  v: number;
  r: number;
  at: number;
}

/** At most this many wounds a clone, and how near (cells) a new hit must land to deepen an old one. */
export const WOUNDS_MAX = 12;
const MERGE_R = 1.6;

/** A hit's damage to a wound's size (cells across, about): a graze 0.6, a slug 2.4. */
export const woundSize = (amount: number) => Math.max(0.6, Math.min(2.4, 0.5 + amount / 30));

export class WoundBook {
  private readonly by = new Map<number, Wound[]>();

  /** A hit on clone `id` at (u, v) in its body's frame, `amount` hard, at `now`. */
  hit(id: number, u: number, v: number, amount: number, now: number): void {
    let list = this.by.get(id);
    if (!list) this.by.set(id, (list = []));
    const r = woundSize(amount);
    for (const w of list) {
      if (Math.hypot(w.u - u, w.v - v) < MERGE_R) {
        // (Into an old one: it opens wider.)
        w.r = Math.min(2.8, Math.hypot(w.r, r * 0.7));
        w.at = now;
        return;
      }
    }
    list.push({ u, v, r, at: now });
    if (list.length > WOUNDS_MAX) list.shift();
  }

  /** The wounds clone `id` shows at `hp` (0..100): the newest, as many as its missing health allows. */
  shown(id: number, hp: number): readonly Wound[] {
    const list = this.by.get(id);
    if (!list || !list.length) return NONE;
    const n = Math.min(list.length, Math.ceil(Math.max(0, 100 - hp) / 9));
    return n >= list.length ? list : list.slice(list.length - n);
  }

  /** Clone `id` died (or left): its wounds go with it. */
  clear(id: number): void {
    this.by.delete(id);
  }
}
const NONE: readonly Wound[] = [];

/** A scar on a creature: its segment, which side (-1, 1), how far along it (0..1), how bad (0..1). */
export interface Scar {
  seg: number;
  side: number;
  at: number;
  sev: number;
}

const hsh = (a: number, b: number, c: number) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * A creature's scars, from its seed, how many segments it has and how hurt
 * it is (`dmg`, 0 unhurt .. 1 dead): which segments are cut, and how badly.
 * Each segment has its own threshold (from the seed); past it, the segment
 * is cut, worse the further past. More damage only ever adds and deepens.
 */
export function beastScars(seed: number, segs: number, dmg: number): Scar[] {
  const out: Scar[] = [];
  if (dmg <= 0.04) return out;
  const reach = Math.min(1.2, dmg * 1.35);
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < 2; k++) {
      // (A second cut on the same segment only once it's badly hurt.)
      const t = hsh(seed, i, k) * (k ? 1.6 : 1);
      if (t >= reach) continue;
      out.push({ seg: i, side: hsh(seed, i, k + 7) < 0.5 ? -1 : 1, at: hsh(seed, i, k + 13), sev: Math.min(1, (reach - t) * 2.2) });
    }
  }
  return out;
}

/** How hurt a creature looks (0..1): its health against the most this client has seen of it. */
export const beastDamage = (hp: number, top: number) => (top > 0 ? Math.max(0, Math.min(1, 1 - hp / top)) : 0);
