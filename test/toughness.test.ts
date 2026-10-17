import { describe, expect, it } from 'vitest';
import { ClassId, HUMANOID_TOUGH, Part, limitOf, newBodyState, newStrike, resetBody, strike } from '../src/shared/body.ts';
import { Phase } from '../src/shared/protocol.ts';
import { World } from '../src/server/world.ts';

type Internals = { damage(p: unknown, n: number, by: number, w: number): void };

/** A live room: one human among bots, everyone spawned. */
function room() {
  const world = new World(5, { mode: 'ffa', tanks: false, bots: 3 });
  const me = world.addPlayer('me', { send() {} })!;
  for (let t = 0; t < 3000 && !(world.phase === Phase.Live && me.alive && world.players.some((p) => p?.bot && p.alive)); t++) world.step();
  const bot = world.players.find((p) => p?.bot && p.alive)!;
  return { world, me, bot };
}

describe('humanoid clones are about 40% tougher', () => {
  it('every humanoid class (bots and humans alike) is; the spider droid is not', () => {
    expect(HUMANOID_TOUGH).toBeCloseTo(1.4);
    for (const cls of [ClassId.Scout, ClassId.Medium, ClassId.Heavy]) expect(newBodyState(cls).tough).toBeCloseTo(1.4);
    expect(newBodyState(ClassId.Droid).tough).toBe(1);
    const s = newBodyState(ClassId.Droid);
    resetBody(s, ClassId.Medium);
    expect(s.tough).toBeCloseTo(1.4);
    const { me, bot } = room();
    expect(me.parts.tough).toBe(bot.parts.tough);
  });

  it('a hit costs a clone 1/1.4 of its health, bot or human', () => {
    const { world, me, bot } = room();
    for (const p of [me, bot]) {
      resetBody(p.parts, ClassId.Medium, 0);
      p.hp = 100;
      (world as unknown as Internals).damage(p, 49, 255, 0);
      expect(100 - p.hp).toBeCloseTo(35);
    }
  });

  it("a wound that would take a base head off leaves a clone's on", () => {
    const base = newBodyState(ClassId.Medium);
    base.tough = 1;
    const clone = newBodyState(ClassId.Medium);
    // Just over the base head's limit (helmet off).
    for (const s of [base, clone]) s.mask &= ~(1 << Part.Helmet);
    const a = newStrike();
    const b = newStrike();
    const wound = limitOf(base, Part.Head) * 1.1;
    expect(limitOf(clone, Part.Head) / limitOf(base, Part.Head)).toBeCloseTo(1.4);
    strike(base, Part.Head, 1e6, wound, b);
    strike(clone, Part.Head, 1e6, wound, a);
    expect(b.detached).toContain(Part.Head);
    expect(a.detached).not.toContain(Part.Head);
  });
});
