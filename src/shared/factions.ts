/**
 * Factions are mercenary vendors: the outfit that built and supplied a
 * clone. Every clone rolls its vendor when it spawns (like its class), so
 * every side fields a mix of them. The vendor scales the class's handling
 * and toughness and dresses the clone in its own gear; team colours
 * (red/green) still go on the torso, so you can tell sides apart.
 */
export const Faction = {
  /** The original clones: grey helmets, cyan visors, olive fatigues. The baseline. */
  GuildTech: 0,
  /** Scavenger raiders in headwraps and goggles: quick and frugal on fuel, but thin-skinned. */
  RustNomads: 1,
  /** Machine soldiers in chrome and gunmetal: slow, tough, and they don't bleed. */
  SynthLegion: 2,
} as const;
export const FACTION_COUNT = 3;

export interface FactionDef {
  name: string;
  /** Short tag for the scoreboard. */
  tag: string;
  /** Movement multipliers (on top of the class's). */
  run: number;
  jet: number;
  fuel: number;
  /** Toughness multipliers (on top of the class's): armour integrity, wound limits, blast/fire harm taken. */
  armor: number;
  limit: number;
  harm: number;
  /** Open stumps bleed (machines just spark). */
  bleeds: boolean;
  /** Made of metal: bursts into scrap and sparks, not meat and blood. */
  synthetic: boolean;
}

export const FACTIONS: readonly FactionDef[] = [
  { name: 'Guild-Tech', tag: 'GT', run: 1, jet: 1, fuel: 1, armor: 1, limit: 1, harm: 1, bleeds: true, synthetic: false },
  { name: 'Rust Nomads', tag: 'RN', run: 1.1, jet: 1.05, fuel: 0.8, armor: 0.8, limit: 0.9, harm: 1.1, bleeds: true, synthetic: false },
  { name: 'Synth Legion', tag: 'SL', run: 0.92, jet: 0.9, fuel: 1.1, armor: 1.3, limit: 1.3, harm: 1, bleeds: false, synthetic: true },
];

/**
 * Which vendor supplied a fresh clone. Bodies are bought from whoever has
 * stock, so every side fields a mix: Guild-Tech is the common issue, the
 * Nomads and the Legion fill in.
 */
export function rollFaction(r: number): number {
  return r < 0.45 ? Faction.GuildTech : r < 0.75 ? Faction.RustNomads : Faction.SynthLegion;
}
