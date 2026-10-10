import { ACTOR_H, WORLD_W } from '../shared/constants.ts';
import { newItem } from '../shared/items.ts';
import { Mat, isSoil } from '../shared/materials.ts';
import { CALL_COST } from '../shared/protocol.ts';
import { growCrystal } from '../shared/rare-earth.ts';
import { Rng } from '../shared/rng.ts';
import { WeaponId } from '../shared/weapons.ts';
import { type ClientLink, type Player, World } from '../server/world.ts';

/**
 * The tutorial: a single-player match that runs entirely in the browser (a
 * real World, the server's own, stepped locally; local.ts links it to the
 * client as the network would). It walks a new player through the basics,
 * one step at a time, each done when the player has actually done it:
 *
 * 1. run, 2. jetpack, 3. pick up the rifle lying ahead, 4. shoot it,
 * 5. dig the gold pocket, 6. dig the rare earth crystals beside it,
 * 7. call in a tank by radio, 8. climb in, 9. wipe out the mob that comes.
 *
 * The prompts are written for the controls in use: keyboard and mouse, or
 * the touch sticks and buttons (`coach(touch)`). No DOM here: tests drive it.
 */

export const TUTORIAL_SEED = 0x7e57;

export const enum TStep {
  Move,
  Jet,
  Gun,
  Shoot,
  Gold,
  Rare,
  Tank,
  Board,
  Mob,
  Done,
}
export const STEP_COUNT = TStep.Done;

export interface Coach {
  /** 1-based step number, and how many. */
  n: number;
  of: number;
  title: string;
  body: string;
  /** Where to look (world): an arrow bobs over it. */
  target: { x: number; y: number } | null;
  /** A line about something that just happened (a top-up, a kill count). */
  note: string;
  done: boolean;
}

/** How many come at you at the end. */
export const MOB_SIZE = 4;

/** The arena: a flat-ish stretch of the map with no bunker on it, the things to find laid out left to right across it. */
interface Arena {
  x: number;
  spawn: number;
  gun: number;
  gold: { x: number; y: number; rx: number; ry: number };
  rare: { x0: number; y0: number; x1: number; y1: number };
  mobZone: [number, number];
}

/** The arena: where it starts, how wide, and the height of its ground. */
const ARENA_X0 = 4;
const ARENA_W = 1800;
const ARENA_FLOOR = 300;

export class Tutorial {
  readonly world: World;
  readonly me: Player;
  readonly arena: Arena;
  step: TStep = TStep.Move;
  note = '';
  private noteAt = 0;
  private startX = -1;
  private jetTicks = 0;
  private shots = 0;
  private goldCells: number;
  private rareCells: number;
  private mob = new Set<number>();
  /** Mob members that have come down (and so, dead again, are killed, not still on the way). */
  private mobLanded = new Set<number>();
  private mobKilled = 0;

  constructor(name: string, link: ClientLink) {
    const world = (this.world = new World(TUTORIAL_SEED, { mode: 'sandbox', bots: 0 }));
    this.arena = this.stage();
    const a = this.arena;
    // Everyone comes down where the script says: the player at the start, the mob far ahead.
    world.dropZone = (p) => (this.mob.has(p.id) ? a.mobZone : p === this.me ? [a.spawn - 10, a.spawn + 10] : undefined);
    // The player starts with only a digger and a radio (the rifle is to be found); the mob with rifles.
    world.kitFor = (p) => {
      if (this.mob.has(p.id)) return [newItem(WeaponId.LightRifle)];
      if (p !== this.me) return undefined;
      const kit = [newItem(WeaponId.Digger), newItem(WeaponId.Radio)];
      if (this.step > TStep.Gun) kit.unshift(newItem(WeaponId.Rifle));
      return kit;
    };
    this.me = world.addPlayer(name, link)!;
    this.me.gold = 0;
    this.goldCells = this.count(Mat.Gold, a.gold.x - a.gold.rx, a.gold.y - a.gold.ry, a.gold.x + a.gold.rx, a.gold.y + a.gold.ry);
    this.rareCells = this.count(Mat.RareEarth, a.rare.x0, a.rare.y0, a.rare.x1, a.rare.y1);
  }

  /**
   * Lay out the arena: a stretch of the generated map flattened into gently
   * rolling open ground (nothing built on it, no caves under it), with the
   * gun, the gold and the crystals planted along it, left to right.
   */
  private stage(): Arena {
    const t = this.world.terrain;
    const X0 = ARENA_X0;
    const X1 = ARENA_X0 + ARENA_W;
    const floorAt = (x: number) => ARENA_FLOOR + Math.round(5 * Math.sin(x / 70) + 3 * Math.sin(x / 23));
    for (let x = X0; x < X1; x++) {
      const f = floorAt(x);
      for (let y = 0; y < f; y++) t.set(x, y, Mat.Air);
      // A solid crust of soil under it (natural soil and rock kept; anything built, any cave, filled).
      for (let y = f; y < f + 170; y++) {
        const m = t.get(x, y);
        if (!(isSoil(m) || m === Mat.Rock) || y < f + 3) t.set(x, y, Mat.Dirt);
      }
    }
    // Ramps down from the ground beyond its ends, so nothing leaves a cliff at either.
    // (The far one, that is: the near end is the map's own wall.)
    for (const [from, dir] of [[X1, 1]] as const) {
      for (let k = 0; k < 120; k++) {
        const x = from + dir * k;
        const f = floorAt(from - dir) - Math.floor(k / 2);
        for (let y = 0; y < Math.min(f, t.surfaceY(x)); y++) t.set(x, y, Mat.Air);
      }
    }
    const x = X0;
    const gx = x + 600;
    const gy = t.surfaceY(gx) + 22;
    const gold = { x: gx, y: gy, rx: 22, ry: 10 };
    // The gold: a fat pocket a little under the surface (soil around it, so it's an easy dig).
    for (let y = gy - gold.ry - 6; y <= gy + gold.ry + 6; y++) {
      for (let xx = gx - gold.rx - 6; xx <= gx + gold.rx + 6; xx++) {
        if (y <= t.surfaceY(xx) + 2) continue;
        const u = (xx - gx) / gold.rx;
        const v = (y - gy) / gold.ry;
        const m = t.get(xx, y);
        if (u * u + v * v <= 1) t.set(xx, y, Mat.Gold);
        else if (m === Mat.Rock || m === Mat.Air || !isSoil(m)) t.set(xx, y, Mat.Dirt);
      }
    }
    // The rare earth: a little cluster of crystals just past it.
    const rx = gx + 70;
    const ry = t.surfaceY(rx) + 18;
    const rare = { x0: rx - 16, y0: ry - 12, x1: rx + 16, y1: ry + 12 };
    // (In soil, a rounded patch of it, so the digger can get at them.)
    for (let y = rare.y0 - 8; y <= rare.y1 + 8; y++) {
      for (let xx = rare.x0 - 8; xx <= rare.x1 + 8; xx++) {
        const u = (xx - rx) / 26;
        const v = (y - ry) / 20;
        if (u * u + v * v <= 1 && y > t.surfaceY(xx) + 2 && !isSoil(t.get(xx, y))) t.set(xx, y, Mat.Dirt);
      }
    }
    const rng = new Rng(TUTORIAL_SEED);
    for (const [dx, dy] of [
      [0, 0],
      [-9, 5],
      [8, -4],
      [3, 8],
    ]) {
      growCrystal(t.mat, rx + dx, ry + dy, rng);
    }
    // (Written straight into the cells: rebuild the planes from them.)
    t.rebuildAllPlanes();
    this.world.terrainReplaced();
    return { x, spawn: x + 330, gun: x + 460, gold, rare, mobZone: [x + 1150, x + 1350] };
  }

  private count(mat: number, x0: number, y0: number, x1: number, y1: number): number {
    const t = this.world.terrain;
    let n = 0;
    for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) if (t.get(x, y) === mat) n++;
    return n;
  }

  /** Run after every world step: check the current step, move on when it's done, and set up the next. */
  update(): void {
    const w = this.world;
    const me = this.me;
    const a = this.arena;
    // The mob never comes back: each one that falls is gone for good.
    for (const id of this.mob) {
      const p = w.players[id];
      if (p?.alive) this.mobLanded.add(id);
      if (!p || (!p.alive && this.mobLanded.has(id))) {
        if (p) w.removePlayer(id);
        this.mob.delete(id);
        this.mobKilled++;
        this.say(`Mob: ${this.mobKilled} of ${MOB_SIZE} down`);
      }
    }
    if (!me.alive) return;
    if (this.startX < 0) this.startX = me.cx;
    switch (this.step) {
      case TStep.Move:
        if (Math.abs(me.cx - this.startX) > 70) this.next();
        break;
      case TStep.Jet:
        if (me.body.jetting) this.jetTicks++;
        if (this.jetTicks > 18) {
          this.next();
          w.dropItem(WeaponId.Rifle, a.gun, w.terrain.surfaceY(a.gun) - 6);
        }
        break;
      case TStep.Gun:
        if (me.inv.some((it) => it.weapon === WeaponId.Rifle)) {
          this.next();
          // Straight into your hands, ready for the next step.
          w.equip(me, WeaponId.Rifle);
        }
        break;
      case TStep.Shoot:
        if (me.firing && me.weapon === WeaponId.Rifle) this.shots++;
        if (this.shots >= 3) this.next();
        break;
      case TStep.Gold: {
        const g = a.gold;
        const left = this.count(Mat.Gold, g.x - g.rx, g.y - g.ry, g.x + g.rx, g.y + g.ry);
        if (this.goldCells - left >= 60) this.next();
        break;
      }
      case TStep.Rare: {
        const r = a.rare;
        const left = this.count(Mat.RareEarth, r.x0, r.y0, r.x1, r.y1);
        if (this.rareCells - left >= 4) {
          this.next();
          // Whatever you dug, enough for a tank: command makes up the rest.
          if (me.gold < CALL_COST) {
            this.say(`Command tops you up: +${CALL_COST - me.gold} gold`);
            me.gold = CALL_COST;
          }
        }
        break;
      }
      case TStep.Tank:
        if (w.tanks.some((t) => t !== null)) this.next();
        break;
      case TStep.Board:
        if (me.tank >= 0) {
          this.next();
          for (let k = 0; k < MOB_SIZE; k++) {
            const b = w.addBot();
            if (!b) break;
            b.skill = 1;
            this.mob.add(b.id);
          }
        }
        break;
      case TStep.Mob:
        if (this.mobKilled >= MOB_SIZE) this.next();
        break;
    }
    if (this.note && w.tick - this.noteAt > 30 * 5) this.note = '';
  }

  private next(): void {
    this.step++;
  }

  private say(text: string): void {
    this.note = text;
    this.noteAt = this.world.tick;
  }

  /** What to tell the player now, in the words of the controls they're using. */
  coach(touch: boolean): Coach {
    const a = this.arena;
    const t = this.world.terrain;
    const surf = (x: number) => ({ x, y: t.surfaceY(x) - ACTOR_H - 10 });
    const out = (title: string, body: string, target: { x: number; y: number } | null = null): Coach => ({
      n: Math.min(this.step + 1, STEP_COUNT),
      of: STEP_COUNT,
      title,
      body,
      target,
      note: this.note,
      done: this.step === TStep.Done,
    });
    if (!this.me.alive && this.step === TStep.Move) return out('Loading out', 'Your clone is on its way down in a drop rocket.');
    switch (this.step) {
      case TStep.Move:
        return out('Move', touch ? 'Drag the left stick left or right to run.' : 'Press A and D (or the arrow keys) to run.');
      case TStep.Jet:
        return out('Jetpack', touch ? 'Push the left stick up to jump, and keep it up to fire your jetpack.' : 'Press W or Space to jump. Hold it to fire your jetpack.');
      case TStep.Gun:
        return out('Pick up a gun', touch ? 'A rifle is lying ahead. Run to it and tap ▲ PICK.' : 'A rifle is lying ahead. Run to it and press F (or 3) to pick it up.', surf(a.gun));
      case TStep.Shoot:
        return out('Shoot', touch ? 'Drag the right stick to aim. Push it past halfway to fire.' : 'Aim with the mouse and click to fire.');
      case TStep.Gold:
        return out(
          'Dig gold',
          (touch ? 'Tap ◀ / ▶ ITEM to take out the Digger, then aim it into the ground and fire.' : 'Press Q / E (or 1 / 2, or the mouse wheel) to take out the Digger, then aim it into the ground and click.') +
            ' The yellow pocket below is gold: everything you dig out of it is banked.',
          { x: a.gold.x, y: a.gold.y - a.gold.ry - 6 },
        );
      case TStep.Rare:
        return out('Dig rare earth', 'Those violet crystals are rare earth: worth ten times their weight in gold. Dig them out.', { x: (a.rare.x0 + a.rare.x1) / 2, y: a.rare.y0 - 4 });
      case TStep.Tank:
        return out(
          'Buy a tank',
          touch
            ? `Take out the Radio (◀ / ▶ ITEM) and tap TANK on its menu. A tank costs ${CALL_COST} gold.`
            : `Take out the Radio (Q / E) and click TANK on its menu. A tank costs ${CALL_COST} gold.`,
        );
      case TStep.Board: {
        const tk = this.world.tanks.find((x) => x !== null);
        return out(
          'Climb in',
          touch ? 'It comes down by parachute. Walk up to it and tap ▲ PICK to climb in.' : 'It comes down by parachute. Walk up to it and press F (or 3) to climb in.',
          tk ? { x: tk.x + 16, y: tk.y - 10 } : null,
        );
      }
      case TStep.Mob: {
        const foe = [...this.mob].map((id) => this.world.players[id]).find((p) => p?.alive);
        return out(
          'Wipe out the mob',
          touch
            ? 'A mob is coming from the right. Drive with the left stick, aim and fire the machine gun with the right stick, and tap ◎ for the cannon.'
            : 'A mob is coming from the right. Drive with A / D, aim with the mouse: left click fires the machine gun, right click the cannon.',
          foe ? { x: foe.cx, y: foe.body.y - 8 } : null,
        );
      }
      default:
        return out('Tutorial complete', 'You know the basics. Head back to the menu and deploy into the real thing.');
    }
  }
}
