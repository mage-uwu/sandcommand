import { ACTOR_H } from '../shared/constants.ts';
import { CH, COLS, CW, type Dungeon, OPEN_E, OPEN_S, ROOM_T, ROWS, X0, Y0, floorY } from '../shared/dungeon.ts';

/**
 * Routing through Extraction's labyrinth for bots. The maze is a grid graph
 * (dungeon.ts): side by side cells join through doorways, one above another
 * through shafts. Distances come from a breadth-first search out from the
 * goal cells, so every cell knows its next step toward them.
 */

/** Hops from every cell to the nearest of `goals` (-1 unreachable). */
export function mazeDistances(d: Dungeon, goals: number[]): Int16Array {
  const dist = new Int16Array(COLS * ROWS).fill(-1);
  const q = new Int16Array(COLS * ROWS);
  let head = 0;
  let tail = 0;
  for (const g of goals) {
    if (g < 0 || dist[g] >= 0) continue;
    dist[g] = 0;
    q[tail++] = g;
  }
  while (head < tail) {
    const i = q[head++];
    const c = i % COLS;
    const r = (i - c) / COLS;
    const n = dist[i] + 1;
    const visit = (j: number) => {
      if (dist[j] < 0) {
        dist[j] = n;
        q[tail++] = j;
      }
    };
    if (d.open[i] & OPEN_E) visit(i + 1);
    if (c > 0 && d.open[i - 1] & OPEN_E) visit(i - 1);
    if (d.open[i] & OPEN_S) visit(i + COLS);
    if (r > 0 && d.open[i - COLS] & OPEN_S) visit(i - COLS);
  }
  return dist;
}

/** The neighbouring cell one step nearer the goal (or -1 if `i` is a goal or cut off). */
export function nextHop(d: Dungeon, dist: Int16Array, i: number): number {
  const k = dist[i];
  if (k <= 0) return -1;
  const c = i % COLS;
  const r = (i - c) / COLS;
  if (d.open[i] & OPEN_E && dist[i + 1] === k - 1) return i + 1;
  if (c > 0 && d.open[i - 1] & OPEN_E && dist[i - 1] === k - 1) return i - 1;
  if (d.open[i] & OPEN_S && dist[i + COLS] === k - 1) return i + COLS;
  if (r > 0 && d.open[i - COLS] & OPEN_S && dist[i - COLS] === k - 1) return i - COLS;
  return -1;
}

/**
 * Which cell a clone is in, by where its feet are: a room's row runs from
 * its ceiling down through the slab under its floor (so a clone rising
 * through a shaft counts as in the room above only once its feet clear the
 * room below's ceiling). -1 above the labyrinth (the surface and the wells).
 */
export function cellOfFeet(x: number, y: number): number {
  const feet = y + ACTOR_H;
  if (feet <= Y0 + ROOM_T) return -1;
  const c = Math.max(0, Math.min(COLS - 1, Math.floor((x - X0) / CW)));
  const r = Math.max(0, Math.min(ROWS - 1, Math.floor((feet - Y0 - ROOM_T - 0.5) / CH)));
  return r * COLS + c;
}

/** Is a clone in that row's floor shaft (below the floor it would stand on)? */
export const inShaftUnder = (y: number, r: number) => y + ACTOR_H > floorY(r) + 0.5;

export const cellCentreX = (i: number) => X0 + (i % COLS) * CW + CW / 2;
