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
  /** A shotgun pellet (nine to a shell). */
  Pellet: 11,
  /** A grenade-launcher bomblet: bounces, goes off on its fuse; a third of a hand grenade. */
  Bomblet: 12,
  /** A Gatling round: a heavy machine-gun bullet. */
  Heavy: 13,
  /** An AT cannon's heat-seeking missile: homes on enemy vehicles; a direct hit guts a tank. */
  Missile: 14,
  /** A light rifle's full-power round: harder-hitting and faster than the rifle's. */
  LightRound: 15,
  /** An SMG's pistol-calibre round: light, short-ranged. */
  SmgRound: 16,
  /** An autocannon shell: slow, heavy, solid (it doesn't explode); it tears clones apart. */
  AutoShell: 17,
  /** A blaster bolt: a pulse of light, dead straight. */
  Bolt: 18,
  /** A landmine going off under someone. */
  Landmine: 19,
  /** A tarantula's missile: a small, fast, straight-flying rocket, fired in a stream off the rack on its back. */
  SpiderMissile: 20,
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
  /** Heat seeking: how fast it turns toward a hot target (rad/s), and the speed it accelerates to (cells/s). */
  seek?: number;
  cruise?: number;
  /** Shaped charge: on a direct hit, this fraction of a tank's full hull (and less of a dropship's) goes straight through its armour. */
  antiArmor?: number;
  /** A direct hit on a clone also shakes every part it has: this much harm (by splash share) to each, so limbs come off. */
  shatter?: number;
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
  // Shotgun pellet: short-lived (it's a close-quarters gun); nine to a shell. Each shoves only a little
  // (a whole shell shoves hard), so the first pellets don't knock the target clear of the rest.
  { gravity: 0.25, life: 11, damage: 15, mass: 1, sharp: 0.9, carveR: 2, coreR: 0, splashR: 0, splashDamage: 0, debris: 2, bounce: 0, ballistic: true, knock: 0.3 },
  // Grenade-launcher bomblet: bounces about, pops on a short fuse; a third of a hand grenade.
  { gravity: 1, life: 50, damage: 0, mass: 0.4, sharp: 0.1, carveR: 13, coreR: 5, splashR: 26, splashDamage: 30, debris: 22, bounce: 0.5, ballistic: false },
  // Gatling round: heavier than a rifle round, hits harder.
  { gravity: 0.12, life: 40, damage: 24, mass: 0.7, sharp: 0.85, carveR: 2, coreR: 0, splashR: 0, splashDamage: 0, debris: 2, bounce: 0, ballistic: true, knock: 1.3 },
  // AT missile: slow off the tube, then it burns up to cruise and homes on the nearest hot enemy vehicle.
  { gravity: 0, life: 150, damage: 120, mass: 6, sharp: 0.6, carveR: 20, coreR: 9, splashR: 36, splashDamage: 110, debris: 56, bounce: 0, ballistic: false, seek: 2.4, cruise: 430, antiArmor: 0.46 },
  // Light rifle round: a full-power cartridge. Through a vest and well into the torso: 26 a layer (the rifle's 16).
  { gravity: 0.12, life: 40, damage: 26, mass: 0.55, sharp: 0.85, carveR: 2, coreR: 0, splashR: 0, splashDamage: 0, debris: 2, bounce: 0, ballistic: true, knock: 1.2 },
  // SMG round: light and short-lived (a close-quarters gun), still through a vest at close range.
  { gravity: 0.2, life: 22, damage: 10, mass: 0.36, sharp: 0.8, carveR: 1, coreR: 0, splashR: 0, splashDamage: 0, debris: 1, bounce: 0, ballistic: true, knock: 0.7 },
  // Autocannon shell: slow and heavy, solid shot. Through any armour, 70 a layer (a limb or a head
  // off outright), and the shock of it wrenches every other part too; it punches a hole where it lands.
  { gravity: 0.3, life: 90, damage: 70, mass: 4, sharp: 0.7, carveR: 5, coreR: 2, splashR: 0, splashDamage: 0, debris: 10, bounce: 0, ballistic: false, knock: 1.6, shatter: 34 },
  // Blaster bolt: weightless and straight; a rifle round's punch, a bit less wound.
  { gravity: 0, life: 30, damage: 12, mass: 0.3, sharp: 0.95, carveR: 1, coreR: 0, splashR: 0, splashDamage: 0, debris: 1, bounce: 0, ballistic: true, knock: 0.4 },
  // Landmine: a modest blast straight up out of the ground (less than a grenade).
  { gravity: 1, life: 2, damage: 0, mass: 0.6, sharp: 0.1, carveR: 14, coreR: 6, splashR: 30, splashDamage: 70, debris: 40, bounce: 0, ballistic: false },
  // Tarantula missile: dead straight (it burns all the way), a hand grenade's blast.
  { gravity: 0, life: 75, damage: 30, mass: 1.6, sharp: 0.6, carveR: 24, coreR: 11, splashR: 40, splashDamage: 90, debris: 56, bounce: 0, ballistic: false },
];

/** WeaponDef.proj for tools that carve instead of shooting. */
export const PROJ_DIG = -1;
/** WeaponDef.proj for the materializer, which builds fortifications (see build.ts) instead of shooting. */
export const PROJ_BUILD = -2;
/** WeaponDef.proj for the radio, which calls in support (a dropship or a tank) instead of shooting. */
export const PROJ_RADIO = -3;
/** WeaponDef.proj for the repair kit: one use, it sends out a health wave (World.healWave) instead of shooting. */
export const PROJ_REPAIR = -4;
/** WeaponDef.proj for the golden idol (Extraction): carried, never fired. */
export const PROJ_IDOL = -5;
/** WeaponDef.proj for the laser: no projectile; hold to charge, release to fire an instant beam (see laser*). */
export const PROJ_LASER = -6;
/** WeaponDef.proj for the landmine: placed on the ground in front of you, not fired. */
export const PROJ_MINE = -7;
/** Laser: ticks to a full charge (8 s); the least charge that fires; and the beam at a given charge (0..1). */
export const LASER_MAX = 30 * 8;
export const LASER_MIN = 3;
export const laserWidth = (power: number) => 0.6 + 3.4 * power;
export const laserWound = (power: number) => 24 + 156 * power;
export const laserEnergy = (power: number) => 420 + 2600 * power;
/**
 * The repair kit's health wave: a ring of nanobots that spreads out to
 * HEAL_R cells over HEAL_SPREAD ticks, and every clone of the user's side it
 * passes (the user alone, without teams) mends for MEND_TICKS: REPAIR_HP hit
 * points and REPAIR_WOUND off every wound a tick, and lost limbs regrow.
 */
export const HEAL_R = 72;
export const HEAL_SPREAD = 16;
export const MEND_TICKS = 120;
export const REPAIR_HP = 1.25;
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
  /** Heavy combat shotgun: a spread of pellets, a big shove, six shells. */
  Shotgun: 9,
  /** Grenade launcher: six small bouncing bomblets lobbed on an arc. */
  GrenadeLauncher: 10,
  /** Gatling: spins up, then a hundred heavy rounds, hard-hitting but wild. */
  Gatling: 11,
  /** Laser: hold to charge (up to 8 s), release to fire a beam through every soldier in its way. */
  Laser: 12,
  /** Anti-tank cannon: one heat-seeking missile a load, an age to reload, and half a tank gone if it hits. */
  ATCannon: 13,
  /** Light rifle (M1 Garand style): semi-automatic, seven hard-hitting, precise rounds a clip. */
  LightRifle: 14,
  /** SMG (Type 05 style): a hose of light rounds, for close quarters. */
  Smg: 15,
  /** Autocannon: slow, heavy solid shells that take clones apart; smoke trails. */
  Autocannon: 16,
  /** Landmine: placed on the ground; goes off under the next enemy over it. */
  Mine: 17,
  /** Blaster: rapid bolts of light, the laser's SMG cousin. */
  Blaster: 18,
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
  /** Recoil: the shove each shot gives the shooter (cells/s, back along the barrel; less crouched, least prone)... */
  kick?: number;
  /** ...and how far each shot climbs the muzzle (radians, wearing off over a few ticks). */
  climb?: number;
  /** Scope lock-on: half-angle (radians) of the cone around the aim within which a scoped enemy is locked onto (0/absent: no lock). */
  lockCone?: number;
  /** Projectiles per shot, each with its own spread (a shotgun's pellets). */
  pellets?: number;
  /** Ticks the trigger must be held for the barrels to spin up before it fires (Gatling). */
  spinUp?: number;
}

export const WEAPONS: readonly WeaponDef[] = [
  { name: 'Rifle', proj: ProjKind.Bullet, muzzle: 13, rpm: 450, auto: true, speed: 880, spread: 0.035, clip: 30, reload: 54, scope: 110, kick: 9, climb: 0.03, lockCone: 0.05 },
  { name: 'Bazooka', proj: ProjKind.Rocket, muzzle: 14, rpm: 60, auto: false, speed: 380, spread: 0.01, clip: 1, reload: 66, scope: 140, kick: 55, climb: 0.05, lockCone: 0.06 },
  { name: 'Grenade', proj: ProjKind.Grenade, muzzle: 6, rpm: 70, auto: false, speed: 330, spread: 0, clip: 3, reload: 75, scope: 90, kick: 8, climb: 0 },
  { name: 'Sniper', proj: ProjKind.Slug, muzzle: 17, rpm: 50, auto: false, speed: 24000, spread: 0.004, clip: 5, reload: 84, scope: 600, kick: 130, climb: 0.14, lockCone: 0.16 },
  { name: 'Digger', proj: PROJ_DIG, muzzle: 11, rpm: 900, auto: true, speed: 0, spread: 0, clip: 0, reload: 0, scope: 40 },
  { name: 'Materializer', proj: PROJ_BUILD, muzzle: 9, rpm: 100, auto: false, speed: 0, spread: 0, clip: 0, reload: 0, scope: 60 },
  { name: 'Radio', proj: PROJ_RADIO, muzzle: 6, rpm: 60, auto: false, speed: 0, spread: 0, clip: 0, reload: 0, scope: 60 },
  // Sprays every tick; a canister lasts 4 s of spraying and takes 5 s to brew more nanobots.
  { name: 'Repair Kit', proj: PROJ_REPAIR, muzzle: 4, rpm: 60, auto: false, speed: 0, spread: 0, clip: 1, reload: 0, scope: 40 },
  { name: 'Golden Idol', proj: PROJ_IDOL, muzzle: 6, rpm: 60, auto: false, speed: 0, spread: 0, clip: 0, reload: 0, scope: 60 },
  { name: 'Shotgun', proj: ProjKind.Pellet, muzzle: 14, rpm: 75, auto: false, speed: 900, spread: 0.13, clip: 6, reload: 100, scope: 80, kick: 50, climb: 0.09, lockCone: 0.08, pellets: 9 },
  { name: 'GL', proj: ProjKind.Bomblet, muzzle: 13, rpm: 150, auto: false, speed: 340, spread: 0.03, clip: 6, reload: 105, scope: 110, kick: 16, climb: 0.04 },
  { name: 'Gatling', proj: ProjKind.Heavy, muzzle: 17, rpm: 1100, auto: true, speed: 960, spread: 0.08, clip: 100, reload: 150, scope: 120, kick: 3.5, climb: 0.012, lockCone: 0.06, spinUp: 14 },
  { name: 'Laser', proj: PROJ_LASER, muzzle: 15, rpm: 120, auto: false, speed: 0, spread: 0, clip: 8, reload: 120, scope: 400, kick: 10, climb: 0, lockCone: 0.12 },
  // One missile, nine seconds to load the next.
  { name: 'AT Cannon', proj: ProjKind.Missile, muzzle: 16, rpm: 20, auto: false, speed: 200, spread: 0.01, clip: 1, reload: 270, scope: 160, kick: 70, climb: 0.06, lockCone: 0.08 },
  // Seven rounds an en-bloc clip, as fast as you can pull the trigger, and precise: a marksman's rifle.
  { name: 'Light Rifle', proj: ProjKind.LightRound, muzzle: 15, rpm: 480, auto: false, speed: 1100, spread: 0.012, clip: 7, reload: 60, scope: 220, kick: 22, climb: 0.05, lockCone: 0.09 },
  { name: 'SMG', proj: ProjKind.SmgRound, muzzle: 11, rpm: 900, auto: true, speed: 760, spread: 0.06, clip: 40, reload: 60, scope: 70, kick: 3, climb: 0.016, lockCone: 0.06 },
  { name: 'Autocannon', proj: ProjKind.AutoShell, muzzle: 18, rpm: 150, auto: true, speed: 420, spread: 0.03, clip: 12, reload: 120, scope: 140, kick: 38, climb: 0.07, lockCone: 0.07 },
  // Two to carry; each placed one is armed after a moment. Another pair is ready 5 s after the last goes down.
  { name: 'Mine', proj: PROJ_MINE, muzzle: 6, rpm: 60, auto: false, speed: 0, spread: 0, clip: 2, reload: 150, scope: 60 },
  { name: 'Blaster', proj: ProjKind.Bolt, muzzle: 14, rpm: 600, auto: true, speed: 1300, spread: 0.035, clip: 30, reload: 75, scope: 160, kick: 2, climb: 0.01, lockCone: 0.07 },
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
  if (kind === ProjKind.Bomblet) return 'GL';
  if (kind === ProjKind.Landmine) return 'Mine';
  if (kind === ProjKind.SpiderMissile) return 'Tarantula';
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
