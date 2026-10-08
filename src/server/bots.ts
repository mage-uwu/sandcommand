import { BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP } from '../shared/actor.ts';
import { GRAVITY } from '../shared/constants.ts';
import { PICKUP_R, PRIMARIES, invByte } from '../shared/items.ts';
import { quantizeAim } from '../shared/protocol.ts';
import { Rng } from '../shared/rng.ts';
import { PROJ, SHOULDER_X, SHOULDER_Y, WEAPONS, WeaponId } from '../shared/weapons.ts';
import type { InputCmd, Player, World } from './world.ts';

/** Names for bots (shown with a BOT tag). */
const NAMES = [
  'Vasquez', 'Hicks', 'Drake', 'Apone', 'Ferro', 'Dietrich', 'Frost', 'Wierzbowski', 'Crowe', 'Spunkmeyer',
  'Gorman', 'Hudson', 'Ripley', 'Bishop', 'Dutch', 'Blain', 'Mac', 'Billy', 'Poncho', 'Hawkins',
  'Rico', 'Dizzy', 'Ace', 'Zim', 'Sugar', 'Flores', 'Kitten', 'Shujumi', 'Brutus', 'Carmen',
];

export function botName(rng: Rng): string {
  return `BOT ${NAMES[rng.int(NAMES.length)]}`;
}

/** Fighting distance by weapon: close enough to hit, far enough to live. */
const RANGE: Record<number, number> = {
  [WeaponId.Rifle]: 130,
  [WeaponId.Bazooka]: 170,
  [WeaponId.Grenade]: 110,
  [WeaponId.Sniper]: 280,
  [WeaponId.Digger]: 0,
};
const MAX_SHOT = 340; // won't shoot at anything further than this

/**
 * A server-side bot: it reads the world directly (no network) and emits the
 * same input command a client would, so it plays by exactly the same rules:
 * same rate of fire, magazines, inventory, rockets. Thinking is cheap and
 * staggered: target choice every half second, line of sight every few
 * ticks, steering and aim every tick.
 */
export class BotBrain {
  private readonly rng: Rng;
  /** Aim error (radians) and how often it hesitates: per-bot skill. */
  private readonly noise: number;
  private target = -1;
  private seeTarget = false;
  private strafe = 1;
  private strafeUntil = 0;
  private stuck = 0;
  /** Ticks a nearby target has been out of sight (a floor or wall between us). */
  private blind = 0;
  private lastX = 0;
  private trigger = false;
  private seq = 0;
  private nadeUntil = 0;
  /** Not before this tick: a beat to get bearings after landing, and to react to a new target. */
  private holdFire = 0;
  private wasAlive = false;
  private readonly react: number;
  private readonly phase: number;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    this.noise = 0.06 + this.rng.next() * 0.12;
    this.phase = this.rng.int(15);
    this.react = 15 + this.rng.int(25);
  }

  think(world: World, p: Player): InputCmd {
    const t = world.tick;
    this.seq = (this.seq + 1) & 0xffff;
    const cmd: InputCmd = { seq: this.seq, buttons: 0, aim: p.aimQ, inv: invByte(p.slot, p.invVersion) };
    // Dead, or riding in: hands off (the rocket's autopilot lands it).
    if (!p.alive) {
      this.wasAlive = false;
      return cmd;
    }
    const rng = this.rng;
    if (!this.wasAlive) {
      this.wasAlive = true;
      this.holdFire = t + 45 + rng.int(45); // just landed: look around first
    }

    // Pick a target: the nearest living clone, re-chosen twice a second.
    let tgt = this.target >= 0 ? world.players[this.target] : null;
    const prevTarget = this.target;
    if (!tgt || !tgt.alive || (t + this.phase) % 15 === 0) {
      this.target = -1;
      let best = Infinity;
      for (const o of world.players) {
        if (!o || o === p || !o.alive) continue;
        const d = (o.cx - p.cx) ** 2 + (o.cy - p.cy) ** 2;
        if (d < best) {
          best = d;
          this.target = o.id;
        }
      }
      tgt = this.target >= 0 ? world.players[this.target] : null;
      if (tgt && tgt.id !== prevTarget) this.holdFire = Math.max(this.holdFire, t + this.react);
    }

    const sx = p.body.x + SHOULDER_X;
    const sy = p.body.y + SHOULDER_Y;
    // Unarmed (lost its gun)? Go and get one.
    const gunSlot = p.inv.findIndex((it) => PRIMARIES.includes(it.weapon));
    let pickup = false;
    let goalX = tgt ? tgt.cx : p.cx + this.strafe * 60;
    if (gunSlot < 0) {
      let best = 260 * 260;
      for (const it of world.items) {
        if (!PRIMARIES.includes(it.weapon)) continue;
        const d = (it.x - p.cx) ** 2 + (it.y - p.cy) ** 2;
        if (d < best) {
          best = d;
          goalX = it.x;
          pickup = d < PICKUP_R * PICKUP_R;
        }
      }
    }

    // Moving and getting nowhere: stuck against a wall.
    const moved = Math.abs(p.body.x - this.lastX);
    this.lastX = p.body.x;
    this.stuck = moved < 0.3 ? this.stuck + 1 : Math.max(0, this.stuck - 2);

    // Which weapon: the gun, a grenade now and then up close, the digger when walled in.
    let want = gunSlot;
    const dist = tgt ? Math.hypot(tgt.cx - p.cx, tgt.cy - p.cy) : Infinity;
    const nadeSlot = p.inv.findIndex((it) => it.weapon === WeaponId.Grenade && it.ammo > 0);
    const digSlot = p.inv.findIndex((it) => it.weapon === WeaponId.Digger);
    if (nadeSlot >= 0 && dist < 150 && t > this.nadeUntil + 90 && rng.next() < 0.01) this.nadeUntil = t + 30;
    if (t < this.nadeUntil && nadeSlot >= 0) want = nadeSlot;
    // Up close with a launcher: a gun that won't blow us up too, if we carry one.
    if (dist < 70 && p.inv[want]?.weapon === WeaponId.Bazooka) {
      const gun = p.inv.findIndex((it) => it.weapon === WeaponId.Rifle || it.weapon === WeaponId.Sniper);
      if (gun >= 0) want = gun;
    }
    this.blind = tgt && !this.seeTarget && dist < 160 ? this.blind + 1 : 0;
    // Walled in, or a target close by on the other side of a floor or wall: dig to it.
    // Headroom: open sky (or room) above means a wall can be jumped or jetted over.
    const bx0 = Math.floor(p.body.x);
    const by0 = Math.floor(p.body.y);
    const headClear = !world.terrain.rectSolid(bx0, by0 - 22, bx0 + 7, by0 - 1);
    const digging = digSlot >= 0 && !this.seeTarget && (this.stuck > 75 || this.blind > 60);
    if (digging) want = digSlot;
    if (want < 0) want = digSlot >= 0 ? digSlot : p.slot;
    const weapon = p.inv[want]?.weapon ?? WeaponId.Digger;

    // Line of sight to the target, every few ticks.
    if (tgt && (t + this.phase) % 4 === 0) this.seeTarget = clearLine(world, sx, sy, tgt.cx, tgt.cy);

    // Movement: close to fighting range, back off if too close, strafe in between.
    let buttons = 0;
    const range = RANGE[weapon] ?? 120;
    const dx = goalX - p.cx;
    let dir = 0;
    if (gunSlot < 0 || !tgt) dir = Math.sign(dx);
    else if (weapon === WeaponId.Digger) dir = Math.sign(dx);
    else if (dist > range + 30 || !this.seeTarget) dir = Math.sign(dx);
    else if (dist < range - 50) dir = -Math.sign(dx);
    else {
      if (t > this.strafeUntil) {
        this.strafe = rng.next() < 0.5 ? -1 : 1;
        this.strafeUntil = t + 20 + rng.int(40);
      }
      dir = this.strafe;
    }
    if (dir > 0) buttons |= BTN_RIGHT;
    if (dir < 0) buttons |= BTN_LEFT;
    // Jump or jet: over walls, up to a target above, and to break a long fall.
    const b = p.body;
    if (dir !== 0 && this.stuck > 6 && headClear) buttons |= BTN_UP;
    if (tgt && tgt.cy < p.cy - 50 && b.fuel > 35) buttons |= BTN_UP;
    if (b.vy > 260 && b.fuel > 5) buttons |= BTN_UP;

    // Aim: lead the target by the shot's flight time, lift lobbed shots, add skill noise.
    let ax = goalX;
    let ay = p.cy;
    const def = WEAPONS[weapon];
    if (tgt && def) {
      const speed = def.speed || 400;
      const lead = dist / speed;
      ax = tgt.cx + tgt.body.vx * lead;
      ay = tgt.cy + tgt.body.vy * lead * 0.5;
      if (def.proj >= 0) ay -= 0.5 * GRAVITY * PROJ[def.proj].gravity * lead * lead;
    }
    let sweep = 0;
    if (weapon === WeaponId.Digger) {
      // Dig at the target when it's just the other side of a floor or wall;
      // otherwise through the obstacle in the way.
      let tx = (tgt ? tgt.cx : goalX) - p.cx;
      let ty = (tgt ? tgt.cy : p.cy) - p.cy;
      if (this.blind <= 60) {
        // Blocked on the way somewhere: straight through whatever is ahead.
        tx = Math.sign(tx) || 1;
        ty = 0;
      }
      const tl = Math.hypot(tx, ty) || 1;
      ax = sx + (tx / tl) * 20;
      ay = sy + 3 + (ty / tl) * 20; // from mid-body
      // Boxed in for a while (leftover pixels of concrete or rock pinning
      // it): clear the nearest solid cell around the body, leaning toward
      // where it's going, never the floor under its feet.
      if (this.stuck > 150) {
        const near = nearestBlock(world, p, Math.sign(dx) || 1);
        if (near) {
          ax = near.x;
          ay = near.y;
          sweep = 0;
        }
      }
      // Sweep the beam up and down so the hole is tall enough to walk through
      // (in concrete only the beam's core bites).
      if (this.stuck <= 150) sweep = Math.sin(t * 0.35) * 0.65;
    }
    const aim = Math.atan2(ay - sy, ax - sx) + sweep + (rng.next() - 0.5) * 2 * this.noise;
    cmd.aim = quantizeAim(aim);

    // Fire: with a clear line (or digging), in range; semi-auto weapons get a fresh press each shot.
    // No point-blank blasts, unless cornered with nothing else.
    const minRange = this.stuck > 30 ? 0 : weapon === WeaponId.Bazooka ? 70 : weapon === WeaponId.Grenade ? 50 : 0;
    const shoot =
      weapon === WeaponId.Digger
        ? digging
        : tgt !== null && t >= this.holdFire && this.seeTarget && dist < MAX_SHOT && dist > minRange && (weapon !== WeaponId.Grenade || dist < 220);
    if (shoot) {
      this.trigger = def?.auto ? true : !this.trigger;
      if (this.trigger) buttons |= BTN_FIRE;
    } else this.trigger = false;

    cmd.buttons = buttons;
    cmd.inv = invByte(want >= 0 ? want : p.slot, p.invVersion, pickup);
    return cmd;
  }
}

/** Is the straight line between two points free of terrain? (2-cell steps) */
function clearLine(world: World, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > MAX_SHOT) return false;
  const n = Math.ceil(len / 2);
  const t = world.terrain;
  for (let i = 2; i < n; i++) {
    if (t.isSolid(Math.floor(x0 + (dx * i) / n), Math.floor(y0 + (dy * i) / n))) return false;
  }
  return true;
}

/** The solid cell nearest a clone's body (biased toward `dir`), excluding the floor under it. */
function nearestBlock(world: World, p: Player, dir: number): { x: number; y: number } | null {
  const t = world.terrain;
  const bx = Math.floor(p.body.x);
  const by = Math.floor(p.body.y);
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = by - 6; y <= by + 13; y++) {
    for (let x = bx - 7; x <= bx + 14; x++) {
      if (!t.isSolid(x, y)) continue;
      const dx = x - (bx + 4);
      const dy = y - (by + 7);
      const d = dx * dx + dy * dy - dir * dx * 4;
      if (d < bestD) {
        bestD = d;
        best = { x: x + 0.5, y: y + 0.5 };
      }
    }
  }
  return best;
}
