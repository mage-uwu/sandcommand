import { WORLD_H, WORLD_W } from '../shared/constants.ts';
import { Rng } from '../shared/rng.ts';
import type { Terrain } from '../shared/terrain.ts';

/**
 * Traces of whoever was here first. Now and then, deep in a cave, a faded
 * painting on the back wall, or a relic half sunk in a cave floor: never
 * explained, never in the way. Purely cosmetic (client side, from the seed:
 * no gameplay, no network), and rare: most maps have one or two, some none.
 *
 * Paintings, in old pigment (ochre, red, chalk, charcoal), weathered:
 * - **hands**: stencilled hands, sprayed round. They have six fingers.
 * - **ringworld**: tall, thin figures under a ringed world and two moons
 *   (the same sky as now), one with its arm raised to it.
 * - **beast**: a six-legged beast and the small figures facing it with spears.
 * - **procession**: a line of figures walking to a stepped pyramid that
 *   shines, a row of marks under them.
 * Relics, in the back wall at the foot of a cave, partly buried:
 * - **skull**: a fossil cranium, long and high-domed, with great eye sockets.
 * - **ring**: an arc of a great ring of dark metal, notched, a seam of light
 *   still faintly in it.
 * - **head**: a toppled stone head, long-faced, crowned with a ring.
 */
export const RelicKind = { Hands: 0, Ringworld: 1, Beast: 2, Procession: 3, Skull: 4, Ring: 5, Head: 6 } as const;
const PAINTINGS = [RelicKind.Hands, RelicKind.Ringworld, RelicKind.Beast, RelicKind.Procession];
const ARTIFACTS = [RelicKind.Skull, RelicKind.Ring, RelicKind.Head];
/** Size of each kind (cells). */
export const SIZE: readonly (readonly [number, number])[] = [
  [52, 22],
  [38, 26],
  [40, 20],
  [44, 24],
  [24, 14],
  [36, 16],
  [28, 16],
];

export interface Relic {
  kind: number;
  /** Top-left (world cells). */
  x: number;
  y: number;
  seed: number;
}

export const isPainting = (kind: number) => kind <= RelicKind.Procession;

/**
 * Where this map's relics are (deterministic from its seed and terrain, as
 * generated). Paintings go on the back wall of an open cave at eye height
 * over its floor; relics at the foot of a cave wall, half in the floor.
 * Never in a bunker (`backdrop` marks its rooms), never near the surface.
 * `caves`: a cave map (a couple more of each: it has the caves for them).
 */
export function placeRelics(t: Terrain, seed: number, backdrop: Uint8Array | null, caves: boolean): Relic[] {
  const rng = new Rng(seed ^ 0x9e11c5);
  const out: Relic[] = [];
  let paintings = (rng.next() < 0.6 ? 1 : 0) + (rng.next() < 0.25 ? 1 : 0);
  let artifacts = rng.next() < 0.4 ? 1 : 0;
  if (caves) {
    paintings += 1 + rng.int(2);
    artifacts += 1;
  }
  const want: number[] = [];
  for (let i = 0; i < paintings; i++) want.push(PAINTINGS[rng.int(PAINTINGS.length)]);
  for (let i = 0; i < artifacts; i++) want.push(ARTIFACTS[rng.int(ARTIFACTS.length)]);
  const open = (x: number, y: number) => x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H && !t.isSolid(x, y);
  for (const kind of want) {
    const [w, h] = SIZE[kind];
    const painting = isPainting(kind);
    for (let tries = 0; tries < 600; tries++) {
      const x = 40 + rng.int(WORLD_W - 80 - w);
      const y = 120 + rng.int(WORLD_H - 160 - h);
      // Underground: well under the surface across its width.
      let deep = true;
      for (let dx = 0; dx <= w && deep; dx += 4) if (t.surfaceY(x + dx) > y - 30) deep = false;
      if (!deep) continue;
      // Nothing too close to another.
      if (out.some((r) => Math.abs(r.x - x) < 200 && Math.abs(r.y - y) < 120)) continue;
      // Not in a bunker.
      if (backdrop) {
        let built = false;
        for (let dx = 0; dx < w && !built; dx += 4) for (let dy = 0; dy < h && !built; dy += 4) if (backdrop[(y + dy) * WORLD_W + x + dx]) built = true;
        if (built) continue;
      }
      if (painting) {
        // On an open wall: the whole of it (and a margin) in the open, a floor 6-16 cells under it.
        let air = 0;
        let n = 0;
        for (let dx = -4; dx <= w + 4; dx += 2) for (let dy = -4; dy <= h + 4; dy += 2, n++) if (open(x + dx, y + dy)) air++;
        if (air < n * 0.97) continue;
        let floor = -1;
        for (let dy = h + 6; dy <= h + 16; dy++) if (!open(x + (w >> 1), y + dy)) {
          floor = dy;
          break;
        }
        if (floor < 0) continue;
      } else {
        // At the foot of a cave: the floor through its lower half, open above.
        const mid = y + (h >> 1);
        let ground = 0;
        let above = 0;
        for (let dx = 0; dx < w; dx += 2) {
          if (!open(x + dx, mid + 2)) ground++;
          if (open(x + dx, y - 2) && open(x + dx, y + 2)) above++;
        }
        if (ground < w / 2 * 0.6 || above < w / 2 * 0.8) continue;
      }
      out.push({ kind, x, y, seed: rng.nextU32() });
      break;
    }
  }
  return out;
}
