import { WORLD_H, WORLD_W } from '../shared/constants.ts';
import { MAT_ADAMANT, MAT_FIXED, MAT_TOUGH, Mat } from '../shared/materials.ts';
import type { Terrain } from '../shared/terrain.ts';

/**
 * Bots' map sense: a coarse grid over the terrain (NAV_CELL cells a node)
 * and an A* across it. Open air is cheap to cross (dearer going up: that's
 * jetpack), soft ground costs a dig, and what a digger can't get through
 * in any reasonable time (the caltrops' cement and the ruins' masonry,
 * pig iron, the labyrinth's stone) is a wall: the path goes round or over.
 */

export const NAV_CELL = 8;
const GW = WORLD_W / NAV_CELL;
const GH = WORLD_H / NAV_CELL;

/** Material a bot shouldn't try to dig through (it would barely scratch it). */
export const undiggable = (m: number) => MAT_FIXED[m] || MAT_ADAMANT[m] || MAT_TOUGH[m];

/** Node classes: open air, soft (solid, diggable), rock (undiggable), not yet looked at. */
const OPEN = 0;
const SOFT = 1;
const ROCK = 2;
const UNSEEN = 3;

/** What it costs to go into a node of soft ground (digging through it), against 1 for open air. */
const DIG_COST = 7;
/** Extra for each node climbed (jetting). */
const CLIMB_COST = 1.2;
/**
 * And for every node of open air under it (up to HANG_MAX): a jetpack's fuel
 * runs out, so the way over a wall is up something that bears its weight
 * (a slope, an arm's back), not a long hover.
 */
const HANG_COST = 0.55;
const HANG_MAX = 14;
/** The cost of a node near where a bot got stuck on its last plan (findPath's `avoid`). */
const AVOID_COST = 40;

// Scratch, reused search to search (a stamp marks what's this search's).
const cls = new Uint8Array(GW * GH);
const clsStamp = new Uint16Array(GW * GH);
const hangOf = new Uint8Array(GW * GH);
const hangStamp = new Uint16Array(GW * GH);
const g = new Float32Array(GW * GH);
const came = new Int32Array(GW * GH);
const seen = new Uint16Array(GW * GH);
const closed = new Uint16Array(GW * GH);
/** What entering a node costs this search (memoized: a node is weighed from each of its neighbours). */
const enterMemo = new Float32Array(GW * GH);
const enterStamp = new Uint16Array(GW * GH);
/** And of that, what's for hanging in the air (not charged a vehicle dropping). */
const hangMemo = new Float32Array(GW * GH);
let stamp = 0;
// The open set: a binary heap of node ids by f.
const heap = new Int32Array(GW * GH);
const heapF = new Float32Array(GW * GH);
let heapN = 0;

function push(id: number, f: number): void {
  let i = heapN++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heapF[p] <= f) break;
    heap[i] = heap[p];
    heapF[i] = heapF[p];
    i = p;
  }
  heap[i] = id;
  heapF[i] = f;
}

function pop(): number {
  const top = heap[0];
  const id = heap[--heapN];
  const f = heapF[heapN];
  let i = 0;
  for (;;) {
    let c = i * 2 + 1;
    if (c >= heapN) break;
    if (c + 1 < heapN && heapF[c + 1] < heapF[c]) c++;
    if (heapF[c] >= f) break;
    heap[i] = heap[c];
    heapF[i] = heapF[c];
    i = c;
  }
  heap[i] = id;
  heapF[i] = f;
  return top;
}

/** A node's class: rock if any cell in it is undiggable, soft if any is solid, else open. */
function classify(t: Terrain, gx: number, gy: number): number {
  if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return ROCK;
  const id = gy * GW + gx;
  if (clsStamp[id] === stamp) return cls[id];
  let c = OPEN;
  const m = t.mat;
  for (let y = gy * NAV_CELL; y < (gy + 1) * NAV_CELL && c !== ROCK; y++) {
    const row = y * WORLD_W;
    for (let x = gx * NAV_CELL; x < (gx + 1) * NAV_CELL; x++) {
      const v = m[row + x];
      if (v === Mat.Air) continue;
      if (undiggable(v)) {
        c = ROCK;
        break;
      }
      c = SOFT;
    }
  }
  cls[id] = c;
  clsStamp[id] = stamp;
  return c;
}

/** Searches allowed per tick across a world's bots (findPath costs up to a few ms). */
export const NAV_PER_TICK = 2;
/** May a bot of this world plan a path this tick? (Counts it if so.) */
export function navBudget(w: { tick: number; navTick: number; navUsed: number }): boolean {
  if (w.tick !== w.navTick) {
    w.navTick = w.tick;
    w.navUsed = 0;
  }
  if (w.navUsed >= NAV_PER_TICK) return false;
  w.navUsed++;
  return true;
}

export interface NavPath {
  /** Waypoints (node centres, world cells), from the start to as near the goal as it got. */
  pts: { x: number; y: number; dig: boolean }[];
  /** Did it reach the goal (else it ends at the explored node nearest it)? */
  reached: boolean;
}

/**
 * A path for a clone whose feet are at (sx, sy) to (tx, ty), its body two
 * nodes tall: open where it can, dug through soft ground where that's
 * shorter than the way round, never through rock. `maxExpand` bounds the
 * search (a partial path heads the right way). `avoid`: somewhere to steer
 * clear of (where the last plan got stuck).
 */
export interface NavBody {
  /** Nodes wide (centred on the path's node) and tall (up from it). */
  w: number;
  h: number;
  /** What a node of soft ground in its way costs (shelling a way through, for a vehicle). */
  dig: number;
  /** Each node climbed (jets), and each node of open air under it. */
  climb: number;
  hang: number;
  /** Dropping costs nothing (no hanging in the air charged going down: a vehicle, which falls where a clone would rather climb down). */
  fall?: boolean;
  /** How greedily it heads for the goal (the heuristic's weight: over 1 searches far less, for a path a little longer than the best). */
  greed?: number;
}
/** A clone: one node wide, two tall. */
export const CLONE_BODY: NavBody = { w: 1, h: 2, dig: DIG_COST, climb: CLIMB_COST, hang: HANG_COST };

export function findPath(t: Terrain, sx: number, sy: number, tx: number, ty: number, maxExpand = 2500, avoid?: { x: number; y: number; r: number }, body: NavBody = CLONE_BODY): NavPath {
  stamp = (stamp + 1) & 0xffff;
  if (stamp === 0) {
    clsStamp.fill(0);
    hangStamp.fill(0);
    seen.fill(0);
    closed.fill(0);
    enterStamp.fill(0);
    stamp = 1;
  }
  const clampX = (v: number) => Math.max(0, Math.min(GW - 1, Math.floor(v / NAV_CELL)));
  const clampY = (v: number) => Math.max(1, Math.min(GH - 2, Math.floor(v / NAV_CELL)));
  const s = clampY(sy - 1) * GW + clampX(sx);
  const goal = clampY(ty - 1) * GW + clampX(tx);
  const gxG = goal % GW;
  const gyG = (goal / GW) | 0;
  const greed = body.greed ?? 1;
  const h = (id: number) => {
    const dx = Math.abs((id % GW) - gxG);
    const dy = Math.abs(((id / GW) | 0) - gyG);
    return (Math.max(dx, dy) + 0.41 * Math.min(dx, dy)) * greed;
  };
  /** What it costs to stand in node (x, y): its body there and the nodes over it; Infinity through rock. */
  const left = (body.w - 1) >> 1;
  const soft = (x: number, y: number) => {
    let n = 0;
    for (let yy = y - body.h + 1; yy <= y; yy++) {
      for (let xx = x - left; xx < x - left + body.w; xx++) {
        const c = classify(t, xx, yy);
        if (c === ROCK) return -1;
        if (c === SOFT) n++;
      }
    }
    return n;
  };
  const enter = (x: number, y: number) => {
    const id = y * GW + x;
    if (enterStamp[id] !== stamp) {
      enterStamp[id] = stamp;
      enterMemo[id] = weigh(x, y, id);
    }
    return enterMemo[id];
  };
  /** The same, going down into it. */
  const drop = (x: number, y: number) => {
    const e = enter(x, y);
    return body.fall ? e - hangMemo[y * GW + x] : e;
  };
  const weigh = (x: number, y: number, at: number) => {
    const n = soft(x, y);
    if (n < 0) return Infinity;
    let hang = HANG_MAX;
    // (Held up by whatever's under any part of it.)
    for (let xx = x - left; xx < x - left + body.w && hang > 0; xx++) {
      if (classify(t, xx, y) !== OPEN) {
        hang = 0;
        break;
      }
      const id = y * GW + xx;
      let hh = 0;
      if (xx >= 0 && xx < GW && hangStamp[id] === stamp) hh = hangOf[id];
      else {
        while (hh < HANG_MAX && classify(t, xx, y + 1 + hh) === OPEN) hh++;
        if (xx >= 0 && xx < GW) {
          hangOf[id] = hh;
          hangStamp[id] = stamp;
        }
      }
      hang = Math.min(hang, hh);
    }
    // (Somewhere it got stuck last time: dear, so the plan goes another way.)
    const shun = avoid && Math.abs(x * NAV_CELL + 4 - avoid.x) < avoid.r && Math.abs(y * NAV_CELL + 4 - avoid.y) < avoid.r ? AVOID_COST : 0;
    hangMemo[at] = hang * body.hang;
    return n * body.dig + hang * body.hang + shun;
  };
  const tol = body.w >> 1;
  heapN = 0;
  g[s] = 0;
  came[s] = -1;
  seen[s] = stamp;
  push(s, h(s));
  let best = s;
  let bestH = h(s);
  let reached = false;
  for (let n = 0; n < maxExpand && heapN > 0; n++) {
    const id = pop();
    if (closed[id] === stamp) continue;
    closed[id] = stamp;
    // (A vehicle is there once its body's within a couple of nodes: the goal's own node may hold the ground it's stood on.)
    if (id === goal || (tol > 0 && Math.max(Math.abs((id % GW) - gxG), Math.abs(((id / GW) | 0) - gyG)) <= tol)) {
      reached = true;
      best = id;
      break;
    }
    const hi = h(id);
    if (hi < bestH) {
      bestH = hi;
      best = id;
    }
    const x = id % GW;
    const y = (id / GW) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 1 || nx >= GW || ny >= GH - 1) continue;
        const e = dy > 0 ? drop(nx, ny) : enter(nx, ny);
        if (e === Infinity) continue;
        // A diagonal can't cut a corner of rock.
        if (dx && dy && (enter(x + dx, y) === Infinity || enter(x, y + dy) === Infinity)) continue;
        const nid = ny * GW + nx;
        const cost = g[id] + (dx && dy ? 1.41 : 1) + (dy < 0 ? body.climb : 0) + e;
        if (seen[nid] === stamp && cost >= g[nid]) continue;
        seen[nid] = stamp;
        g[nid] = cost;
        came[nid] = id;
        push(nid, cost + h(nid));
      }
    }
  }
  const pts: NavPath['pts'] = [];
  for (let id = best; id !== -1; id = came[id]) {
    const x = id % GW;
    const y = (id / GW) | 0;
    pts.push({ x: x * NAV_CELL + NAV_CELL / 2 + (body.w % 2 === 0 ? NAV_CELL / 2 : 0), y: (y + 1) * NAV_CELL - 1, dig: soft(x, y) > 0 });
    if (id === s) break;
  }
  pts.reverse();
  return { pts, reached };
}
