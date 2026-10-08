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
    if (this.stuck > 40 && digSlot >= 0 && !this.seeTarget) want = digSlot;
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
    if (dir !== 0 && this.stuck > 6 && weapon !== WeaponId.Digger) buttons |= BTN_UP;
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
    if (weapon === WeaponId.Digger) {
      ax = p.cx + Math.sign(dx || 1) * 20;
      ay = tgt && tgt.cy < p.cy - 20 ? p.cy - 14 : tgt && tgt.cy > p.cy + 20 ? p.cy + 14 : p.cy;
    }
    const aim = Math.atan2(ay - sy, ax - sx) + (rng.next() - 0.5) * 2 * this.noise;
    cmd.aim = quantizeAim(aim);

    // Fire: with a clear line (or digging), in range; semi-auto weapons get a fresh press each shot.
    const minRange = weapon === WeaponId.Bazooka ? 70 : weapon === WeaponId.Grenade ? 50 : 0; // no point-blank blasts
    const shoot =
      weapon === WeaponId.Digger
        ? this.stuck > 20
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
