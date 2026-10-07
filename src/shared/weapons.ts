export const ProjKind = {
  Bullet: 0,
  Rocket: 1,
  Grenade: 2,
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
}

export const PROJ: readonly ProjDef[] = [
  { gravity: 0.15, life: 40, damage: 16, mass: 0.5, sharp: 0.8, carveR: 2, coreR: 0, splashR: 0, splashDamage: 0, debris: 2, bounce: 0 },
  { gravity: 0.2, life: 120, damage: 30, mass: 2, sharp: 0.6, carveR: 20, coreR: 9, splashR: 34, splashDamage: 70, debris: 48, bounce: 0 },
  { gravity: 1, life: 66, damage: 0, mass: 0.6, sharp: 0.1, carveR: 26, coreR: 12, splashR: 42, splashDamage: 90, debris: 64, bounce: 0.45 },
];

export const WeaponId = {
  Rifle: 0,
  Bazooka: 1,
  Grenade: 2,
  Digger: 3,
} as const;

export interface WeaponDef {
  name: string;
  cooldown: number; // ticks between shots
  proj: number; // ProjKind, or -1 for the digger
  speed: number;
  spread: number; // radians
}

export const WEAPONS: readonly WeaponDef[] = [
  { name: 'Rifle', cooldown: 4, proj: ProjKind.Bullet, speed: 880, spread: 0.035 },
  { name: 'Bazooka', cooldown: 34, proj: ProjKind.Rocket, speed: 380, spread: 0.01 },
  { name: 'Grenade', cooldown: 26, proj: ProjKind.Grenade, speed: 330, spread: 0 },
  { name: 'Digger', cooldown: 2, proj: -1, speed: 0, spread: 0 },
];

export const DIGGER_REACH = 13;
export const DIGGER_R = 5;
export const DIGGER_CORE = 2;

/** Peak blast-wave speed (cells/s) explosions give to loose things in flight: grains, gibs, blood. */
export const BLAST_IMPULSE = 260;
