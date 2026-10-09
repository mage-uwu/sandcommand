import { BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_SCOPE, BTN_UP } from '../shared/actor.ts';
import { GRAVITY } from '../shared/constants.ts';
import { ballisticAim } from '../shared/ballistics.ts';
import { CANNON_SPEED, SMG_SPEED, SPIDER_MISSILE_SPEED, type Tank, cannonAngle, tankH, tankW } from '../shared/tank.ts';
import { PROJ, ProjKind } from '../shared/weapons.ts';

/**
 * The watchdog's own head: a small unmanned tank that guards whoever called
 * it in. With nobody at the remote it drives and shoots by itself:
 *
 * - **Screening.** It keeps close to its owner and, with an enemy about,
 *   gets out in front of them: onto the ground between its owner and the
 *   nearest hostile, a little way toward the threat, so whatever comes has to
 *   come through it first. With nothing about it heels at its owner's side.
 * - **Fighting.** It fires its vulcan at the nearest hostile it can see in
 *   range (leading it), and lobs a cannon shell (on the arc that lands) at
 *   vehicles and at clones well clear of its owner. It never fires with its
 *   owner in the line.
 * - **Getting about.** It jets over what its treads can't climb, and up after
 *   an owner who has gone up a level.
 *
 * The tarantula thinks the same way with its own kit (`SPIDER_KIT`): it
 * looks further, its laser (instant: no leading) reaches further than a
 * vulcan, its missiles fly straight from a rack that turns all the way
 * round, so it fires both at once; and it has no jets (its legs take it up
 * walls instead, pushing into them).
 *
 * Pure: the world hands it what it can see and applies the buttons and aim.
 */
export interface DogFoe {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** A tank, a watchdog or a dropship (worth a shell at any range). */
  vehicle: boolean;
}

export interface DogOwner {
  cx: number;
  cy: number;
  alive: boolean;
}

/** What a watchdog remembers between ticks. */
export interface DogMemory {
  lastX: number;
  stuck: number;
  /** Ticks left of a jet burst. */
  jet: number;
  /** Which side of its owner it heels on (-1 left, 1 right). */
  side: number;
}

export const newDogMemory = (): DogMemory => ({ lastX: 0, stuck: 0, jet: 0, side: 1 });

/** How far it looks for trouble around its owner, how far out it goes to meet it, and its guns' reach. */
export const DOG_ALERT = 420;
export const DOG_SCREEN = 70;
export const DOG_SMG_RANGE = 280;
export const DOG_CANNON_RANGE = 420;

/** A machine's fighting kit, for its head to work with. */
export interface PetKit {
  alert: number;
  screen: number;
  /** Reach of the primary (fire), its rounds' speed (0: a beam, no leading). */
  smgRange: number;
  smgSpeed: number;
  /** Reach of the heavy weapon (right mouse), its speed and its rounds' gravity (multiplier). */
  cannonRange: number;
  cannonSpeed: number;
  cannonGravity: number;
  /** Does the heavy weapon swivel all the way round (and fire alongside the primary)? Otherwise a cannon out of the front, in turn with it. */
  turret: boolean;
  /** Clones closer than this get the primary only. */
  cannonMin: number;
  jets: boolean;
}

export const DOG_KIT: PetKit = {
  alert: DOG_ALERT,
  screen: DOG_SCREEN,
  smgRange: DOG_SMG_RANGE,
  smgSpeed: SMG_SPEED,
  cannonRange: DOG_CANNON_RANGE,
  cannonSpeed: CANNON_SPEED,
  cannonGravity: PROJ[ProjKind.Shell].gravity,
  turret: false,
  cannonMin: 90,
  jets: true,
};

export const SPIDER_KIT: PetKit = {
  alert: 560,
  screen: 90,
  smgRange: 420,
  smgSpeed: 0,
  cannonRange: 520,
  cannonSpeed: SPIDER_MISSILE_SPEED,
  cannonGravity: PROJ[ProjKind.SpiderMissile].gravity,
  turret: true,
  cannonMin: 70,
  jets: false,
};
/** It holds fire when its owner is within this of the line (or of where a shell lands). */
const OWNER_CLEAR = 14;
const SHELL_CLEAR = 60;

export function dogThink(
  t: Tank,
  mem: DogMemory,
  owner: DogOwner | null,
  foes: readonly DogFoe[],
  see: (x0: number, y0: number, x1: number, y1: number) => boolean,
  kit: PetKit = DOG_KIT,
): { buttons: number; aim: number } {
  const w = tankW(t);
  const h = tankH(t);
  const cx = t.x + w / 2;
  const cy = t.y + h / 2;
  const home = owner && owner.alive ? owner : null;
  let buttons = 0;

  // Who's the threat: nearest its owner (else nearest itself).
  const ref = home ?? { cx, cy };
  let threat: DogFoe | null = null;
  let bestD = kit.alert;
  for (const f of foes) {
    const d = Math.hypot(f.x - ref.cx, f.y - ref.cy);
    if (d < bestD) {
      bestD = d;
      threat = f;
    }
  }

  // Where to be: between the owner and the threat, out toward it; or at heel.
  let goal = cx;
  if (home) {
    if (threat) {
      const dx = threat.x - home.cx;
      goal = home.cx + Math.sign(dx || 1) * Math.min(Math.abs(dx) * 0.5, kit.screen);
    } else {
      // Heel on whichever side it's already on (no driving through its owner).
      if (Math.abs(cx - home.cx) > 30) mem.side = Math.sign(cx - home.cx) || 1;
      goal = home.cx + mem.side * (w / 2 + 16);
    }
  }
  const dx = goal - cx;
  const dir = Math.abs(dx) > 8 ? Math.sign(dx) : 0;
  if (dir > 0) buttons |= BTN_RIGHT;
  if (dir < 0) buttons |= BTN_LEFT;

  // Stuck against something its treads can't take: jet over it. And up after an owner on a higher level.
  const moved = Math.abs(t.x - mem.lastX);
  mem.lastX = t.x;
  mem.stuck = dir !== 0 && moved < 0.25 ? mem.stuck + 1 : Math.max(0, mem.stuck - 2);
  if (kit.jets) {
    if (mem.stuck > 10 && t.fuel > 25) mem.jet = 18;
    if (home && home.cy < t.y - 30 && Math.abs(home.cx - cx) < 90 && t.fuel > 40) mem.jet = Math.max(mem.jet, 6);
    if (mem.jet > 0) {
      mem.jet--;
      if (t.fuel > 0) buttons |= BTN_UP;
    }
  } else if (mem.stuck > 10 || (home && home.cy < t.y - 30 && Math.abs(home.cx - cx) < 90)) {
    // (Legs, not jets: up the wall it's against, or up after its owner.)
    buttons |= BTN_UP;
  }

  // Guns: the nearest hostile it can see from the turret.
  const gx = cx;
  const gy = t.y + (kit.turret ? tankH(t) * 0.28 : 3); // (a tarantula: its head)
  let tgt: DogFoe | null = null;
  let tgtD = Math.max(kit.cannonRange, kit.smgRange);
  for (const f of foes) {
    const d = Math.hypot(f.x - gx, f.y - gy);
    if (d < tgtD && see(gx, gy, f.x, f.y)) {
      tgtD = d;
      tgt = f;
    }
  }
  let aim = t.aim;
  if (!tgt) {
    // Nothing to shoot: the turret looks the way it's going (or toward the threat).
    if (threat) aim = Math.atan2(threat.y - gy, threat.x - gx);
    else if (dir !== 0) aim = dir > 0 ? 0 : Math.PI;
    return { buttons, aim };
  }
  // The vulcan, led by its flight time (a beam needs no leading).
  const lead = kit.smgSpeed > 0 ? tgtD / kit.smgSpeed : 0;
  const ax = tgt.x + tgt.vx * lead;
  const ay = tgt.y + tgt.vy * lead;
  aim = Math.atan2(ay - gy, ax - gx);
  const clearOfOwner = (a: number, len: number) => !home || segDist(home.cx, home.cy, gx, gy, gx + Math.cos(a) * len, gy + Math.sin(a) * len) > OWNER_CLEAR;
  // The cannon: at vehicles, or at clones well clear of its owner, on the arc that lands.
  const shellClear = !home || Math.hypot(tgt.x - home.cx, tgt.y - home.cy) > SHELL_CLEAR;
  if (kit.turret) {
    // Laser and missiles together, down the one line (the missiles fly straight).
    if (tgtD < kit.smgRange && clearOfOwner(aim, tgtD)) buttons |= BTN_FIRE;
    if (tgtD < kit.cannonRange && shellClear && (tgt.vehicle || tgtD > kit.cannonMin) && clearOfOwner(aim, tgtD)) buttons |= BTN_SCOPE;
    return { buttons, aim };
  }
  if (t.cannonCd <= 0 && shellClear && (tgt.vehicle || tgtD > kit.cannonMin) && tgtD < kit.cannonRange) {
    const b = ballisticAim(gx, gy, tgt, kit.cannonSpeed, GRAVITY * kit.cannonGravity, { vx: t.vx * 0.25, vy: t.vy * 0.25 });
    // (Only if the barrel can actually point that way: it only elevates so far, out of the front.)
    if (b && b.reach && angleGap(cannonAngle(Math.cos(b.aim) < 0, b.aim, t.a), b.aim) < 0.05 && clearOfOwner(b.aim, Math.min(tgtD, 120))) {
      return { buttons: buttons | BTN_SCOPE, aim: b.aim };
    }
  }
  if (tgtD < kit.smgRange && clearOfOwner(aim, tgtD)) buttons |= BTN_FIRE;
  return { buttons, aim };
}

/** Distance from point (px, py) to the segment (x0, y0)-(x1, y1). */
function segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy || 1;
  const k = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
  return Math.hypot(px - (x0 + dx * k), py - (y0 + dy * k));
}

const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
