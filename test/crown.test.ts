import { describe, expect, it } from 'vitest';
import { ClassId, Part, PARTS, harm, has, newBodyState, newStrike, strike } from '../src/shared/body.ts';
import { ACTOR_MAX_HP } from '../src/shared/constants.ts';
import { GameMode, Phase, Team } from '../src/shared/protocol.ts';
import { PROJ, ProjKind, WEAPONS, WeaponId } from '../src/shared/weapons.ts';
import { World } from '../src/server/world.ts';

function until(world: World, cond: () => boolean, max = 3000): void {
  for (let t = 0; t < max && !cond(); t++) world.step();
}

/** A heavy king's body: crown on, no helmet. */
function kingBody() {
  const s = newBodyState(ClassId.Heavy);
  s.mask = (s.mask | (1 << Part.Crown)) & ~(1 << Part.Helmet);
  return s;
}
const energyOf = (k: number, w: number) => PROJ[k].mass * PROJ[k].sharp * WEAPONS[w].speed;

describe('the crown', () => {
  it('kings wear it on the head, in place of a helmet', () => {
    const world = new World(41, { mode: 'ffa', rotation: [GameMode.Regicide], tanks: false });
    for (let i = 0; i < 8; i++) world.addPlayer(`p${i}`, { send() {} });
    until(world, () => world.phase === Phase.Live);
    for (const team of [Team.Red, Team.Green]) {
      const king = world.players[world.kings[team]]!;
      expect(has(king.parts.mask, Part.Crown)).toBe(true);
      expect(has(king.parts.mask, Part.Helmet)).toBe(false);
    }
    for (const p of world.players) if (p && !world.isKing(p)) expect(has(p.parts.mask, Part.Crown)).toBe(false);
  });

  it('stops every small-arms round, even a sniper slug', () => {
    for (const [k, w] of [
      [ProjKind.Bullet, WeaponId.Rifle],
      [ProjKind.Slug, WeaponId.Sniper],
    ]) {
      const s = kingBody();
      const out = newStrike();
      for (let n = 0; n < 40; n++) strike(s, Part.Head, energyOf(k, w), PROJ[k].damage, out);
      expect(s.wounds[Part.Crown]).toBe(0);
      expect(s.wounds[Part.Head]).toBe(0);
      expect(has(s.mask, Part.Crown)).toBe(true);
    }
    // A helmet doesn't: a slug goes through and wounds the head.
    const h = newBodyState(ClassId.Heavy);
    strike(h, Part.Head, energyOf(ProjKind.Slug, WeaponId.Sniper), PROJ[ProjKind.Slug].damage, newStrike());
    expect(h.wounds[Part.Head]).toBeGreaterThan(0);
  });

  it('only blasts wear it down, slowly; once it is off the head is exposed', () => {
    expect(PARTS[Part.Crown].limit).toBeGreaterThan(3 * PARTS[Part.Helmet].limit);
    const s = kingBody();
    const rocket = PROJ[ProjKind.Rocket].splashDamage * 0.45; // the head's share of a close blast
    let blasts = 0;
    const out = newStrike();
    while (has(s.mask, Part.Crown) && blasts < 100) {
      harm(s, Part.Head, rocket, out);
      blasts++;
    }
    expect(blasts).toBeGreaterThan(15); // ultra tough
    expect(out.detached).toContain(Part.Crown);
    expect(s.wounds[Part.Head]).toBe(0); // it took all of it
    strike(s, Part.Head, energyOf(ProjKind.Slug, WeaponId.Sniper), PROJ[ProjKind.Slug].damage, newStrike());
    expect(s.wounds[Part.Head]).toBeGreaterThan(0);
    void ACTOR_MAX_HP;
  });
});
