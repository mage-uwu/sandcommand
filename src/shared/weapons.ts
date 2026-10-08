import { TICK_RATE } from './constants.ts';

export const ProjKind = {
  Bullet: 0,
  Rocket: 1,
  Grenade: 2,
  Slug: 3,
  /** Tank cannon shell. */
  Shell: 4,
  /** Tank vulcan round. */
  TankBullet: 5,
  /** Dropship turret round. */
  ShipGun: 6,
  /** Dropship bomb: five times a bazooka rocket's blast. */
  Bomb: 7,
  /**
   * A dropship engine shot loose: it keeps burning, spinning out faster and
   * faster, until it smashes into the ground or someone and blows up.
   */
  Engine: 8,
  /** A booby-trap dart, out of a labyrinth wall. */
  Dart: 9,
  /** A booby-trap pressure plate going off. */
  Mine: 10,
} as const;

export interface ProjDef {
  gravity: number; // multiplier on world gravity
  life: number; // ticks
  damage: number; // wound points dealt to each body layer a direct hit penetrates
  mass: number; // direct-hit penetration: energy = mass * sharp * relative speed
  sharp: number;
  carveR: number; // terrain carve radius on detonation
  coreR: number; // radius that also breaks hard material
  splashR: number; // actor splash radius
  splashDamage: number;
  debris: number; // max debris particles thrown
  bounce: number; // >0 bounces off terrain (restitution) and detonates on fuse
  /** Small-arms round: chips terrain only (not bodies it hits), puffs dust, no trail. */
  ballistic: boolean;
  /** Self-propelled (a runaway engine): thrust (cells/s^2) along its spinning heading for `burn` ticks, against `drag` (1/s). */
  thrust?: number;
  burn?: number;
  drag?: number;
  /** Knockback on a direct hit, as a multiple of its momentum's (default 1). */
  knock?: number;
}

export const PROJ: readonly ProjDef[] = [
  { gravity: 0.15, life: 40, damage: 16, mass: 0.5, sharp: 0.8, carveR: 2, coreR: 0, splashR: 0, splashDamage: 0, debris: 2, bounce: 0, ballistic: true },
  { gravity: 0.2, life: 120, damage: 30, mass: 2, sharp: 0.6, carveR: 20, coreR: 9, splashR: 34, splashDamage: 70, debris: 48, bounce: 0, ballistic: false },
  { gravity: 1, life: 66, damage: 0, mass: 0.6, sharp: 0.1, carveR: 26, coreR: 12, splashR: 42, splashDamage: 90, debris: 64, bounce: 0.45, ballistic: false },
  // Heavy sniper slug: near-instant (it crosses the map in about five
  // ticks), dead flat, punches through armour. Light for its speed, so its
  // energy (mass x speed) and knockback stay what they were at 1500 cells/s.
  // 80 wounds a layer: through a scout's or a medium's torso, any head (helmet and all), any limb.
  { gravity: 0.04, life: 10, damage: 80, mass: (1.1 * 1500) / 24000, sharp: 0.95, carveR: 3, coreR: 1, splashR: 0, splashDamage: 0, debris: 3, bounce: 0, ballistic: true, knock: 2.4 },
  // Tank cannon shell: a heavy lobbed high-explosive round.
  { gravity: 0.35, life: 120, damage: 50, mass: 3, sharp: 0.6, carveR: 24, coreR: 11, splashR: 40, splashDamage: 90, debris: 56, bounce: 0, ballistic: false },
  // Tank vulcan: a rifle round, a touch lighter.
  { gravity: 0.15, life: 40, damage: 14, mass: 0.5, sharp: 0.8, carveR: 2, coreR: 0, splashR: 0, splashDamage: 0, debris: 2, bounce: 0, ballistic: true },
  // Dropship turret: the same light round.
  { gravity: 0.15, life: 40, damage: 13, mass: 0.5, sharp: 0.8, carveR: 2, coreR: 0, splashR: 0, splashDamage: 0, debris: 2, bounce: 0, ballistic: true },
  // Dropship bomb: 5x the bazooka's blast (splash damage), a much bigger crater and reach.
  { gravity: 1, life: 240, damage: 120, mass: 4, sharp: 0.4, carveR: 40, coreR: 18, splashR: 64, splashDamage: 350, debris: 140, bounce: 0, ballistic: false },
  // Runaway dropship engine: still burning for 2.5 s, then it falls; it goes off like a big rocket wherever it lands.
  { gravity: 1, life: 180, damage: 60, mass: 5, sharp: 0.5, carveR: 22, coreR: 10, splashR: 40, splashDamage: 120, debris: 70, bounce: 0, ballistic: false, thrust: 1.45 * 620, burn: 75, drag: 2.2 },
  // Booby-trap dart: a fast, sharp sliver that gets through a vest.
  { gravity: 0.05, life: 40, damage: 22, mass: 0.45, sharp: 0.95, carveR: 1, coreR: 0, splashR: 0, splashDamage: 0, debris: 1, bounce: 0, ballistic: true },
  // Booby-trap mine: a grenade's worth of blast under your feet (it goes off the tick it's stepped on).
  { gravity: 1, life: 2, damage: 0, mass: 0.6, sharp: 0.1, carveR: 22, coreR: 10, splashR: 40, splashDamage: 95, debris: 60, bounce: 0, ballistic: false },
];

/** WeaponDef.proj for tools that carve instead of shooting. */
export const PROJ_DIG = -1;
/** WeaponDef.proj for the materializer, which builds fortifications (see build.ts) instead of shooting. */
export const PROJ_BUILD = -2;
/** WeaponDef.proj for the radio, which calls in support (a dropship or a tank) instead of shooting. */
export const PROJ_RADIO = -3;
/** WeaponDef.proj for the repair kit, which sprays nanobots that heal (and regrow limbs) instead of shooting. */
export const PROJ_REPAIR = -4;
/** WeaponDef.proj for the golden idol (Extraction): carried, never fired. */
export const PROJ_IDOL = -5;
/** How far the repair kit's nanobot spray reaches (cells), and how much it mends per tick of spraying. */
export const REPAIR_REACH = 30;
export const REPAIR_HP = 1.5;
export const REPAIR_WOUND = 0.6;
/** Ticks of spraying a healthy-enough clone to regrow one missing limb. */
export const REGROW_TICKS = 40;

export const WeaponId = {
  Rifle: 0,
  Bazooka: 1,
  Grenade: 2,
  Sniper: 3,
  Digger: 4,
  Materializer: 5,
  /** Calls in a dropship or a tank, for gold. */
  Radio: 6,
  /** Nanobots: heals whoever it's sprayed on (a teammate, or yourself) and regrows lost limbs. */
  RepairKit: 7,
  /** Extraction's golden idol: the prize. Carried in the inventory like a weapon (and spilled on death); does nothing. */
  Idol: 8,
} as const;

/**
 * One table drives every weapon, on the server (firing, ammo, reloads, who
 * the camera's interest follows) and on the client (sprites, muzzle flash,
 * HUD, camera). Add a row and the weapon exists everywhere.
 */
export interface WeaponDef {
  name: string;
  /** ProjKind fired, PROJ_DIG for the digger, or PROJ_BUILD for the materializer. */
  proj: number;
  /** Muzzle offset: cells from the shoulder pivot along the barrel to where shots leave (and the flash shows). */
  muzzle: number;
  /** Rate of fire, rounds per minute (the materializer: pieces per minute). */
  rpm: number;
  /** Hold to keep firing (true) or one shot per press (false). */
  auto: boolean;
  /** Projectile launch speed, cells/s. */
  speed: number;
  /** Half-angle of random spread, radians (scoped aim halves it). */
  spread: number;
  /** Rounds per magazine; 0 = never needs reloading. */
  clip: number;
  /** Reload time, ticks. */
  reload: number;
  /** How far the view can be pushed down the barrel while scoping (right mouse), cells. */
  scope: number;
}

export const WEAPONS: readonly WeaponDef[] = [
  { name: 'Rifle', proj: ProjKind.Bullet, muzzle: 13, rpm: 450, auto: true, speed: 880, spread: 0.035, clip: 30, reload: 54, scope: 110 },
  { name: 'Bazooka', proj: ProjKind.Rocket, muzzle: 14, rpm: 60, auto: false, speed: 380, spread: 0.01, clip: 1, reload: 66, scope: 140 },
  { name: 'Grenade', proj: ProjKind.Grenade, muzzle: 6, rpm: 70, auto: false, speed: 330, spread: 0, clip: 3, reload: 75, scope: 90 },
  { name: 'Sniper', proj: ProjKind.Slug, muzzle: 17, rpm: 50, auto: false, speed: 24000, spread: 0.004, clip: 5, reload: 84, scope: 600 },
  { name: 'Digger', proj: PROJ_DIG, muzzle: 11, rpm: 900, auto: true, speed: 0, spread: 0, clip: 0, reload: 0, scope: 40 },
  { name: 'Materializer', proj: PROJ_BUILD, muzzle: 9, rpm: 100, auto: false, speed: 0, spread: 0, clip: 0, reload: 0, scope: 60 },
  { name: 'Radio', proj: PROJ_RADIO, muzzle: 6, rpm: 60, auto: false, speed: 0, spread: 0, clip: 0, reload: 0, scope: 60 },
  // Sprays every tick; a canister lasts 4 s of spraying and takes 5 s to brew more nanobots.
  { name: 'Repair Kit', proj: PROJ_REPAIR, muzzle: 11, rpm: 1800, auto: true, speed: 0, spread: 0, clip: 120, reload: 150, scope: 40 },
  { name: 'Golden Idol', proj: PROJ_IDOL, muzzle: 6, rpm: 60, auto: false, speed: 0, spread: 0, clip: 0, reload: 0, scope: 60 },
];

/** Ticks between shots for a weapon (fractional; firing accumulates it so the average rate is exact). */
export function fireInterval(def: WeaponDef): number {
  return (60 * TICK_RATE) / def.rpm;
}

/** The weapon that fires a projectile kind (kill feed names hits by projectile). */
export function weaponOfProj(kind: number): WeaponDef | undefined {
  return WEAPONS.find((w) => w.proj === kind);
}

/** Name of what fired a projectile kind: a hand weapon, or a tank's guns. */
export function projName(kind: number): string {
  if (kind === ProjKind.Shell) return 'Tank Cannon';
  if (kind === ProjKind.TankBullet) return 'Tank SMG';
  if (kind === ProjKind.ShipGun) return 'Dropship Gun';
  if (kind === ProjKind.Bomb) return 'Dropship Bomb';
  if (kind === ProjKind.Engine) return 'Runaway Engine';
  if (kind === ProjKind.Dart) return 'Dart Trap';
  if (kind === ProjKind.Mine) return 'Booby Trap';
  return weaponOfProj(kind)?.name ?? '';
}

/** Shoulder pivot (where the gun arm turns and aim is measured from), relative to the hitbox's top-left. */
export const SHOULDER_X = 4;
export const SHOULDER_Y = 4;

/** World position of a weapon's muzzle for a clone whose shoulder (actor.ts shoulderAt) is at (sx, sy), aiming at `aim`. */
export function muzzlePoint(def: WeaponDef, sx: number, sy: number, aim: number, out: { x: number; y: number }): { x: number; y: number } {
  out.x = sx + Math.cos(aim) * def.muzzle;
  out.y = sy + Math.sin(aim) * def.muzzle;
  return out;
}

export const DIGGER_REACH = 13;
export const DIGGER_R = 5;
export const DIGGER_CORE = 2;

/** Peak blast-wave speed (cells/s) explosions give to loose things in flight: grains, gibs, blood. */
export const BLAST_IMPULSE = 260;
