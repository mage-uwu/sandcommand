import { describe, expect, it } from 'vitest';
import { Part, limitOf, newStrike, strike } from '../src/shared/body.ts';
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

describe('human players are tougher than bots', () => {
  it('about 40%: a hit costs a human 1/1.4 of what it costs a bot, and their parts take 1.4x the wounds to tear off', () => {
    const { world, me, bot } = room();
    expect(me.alive && bot.alive).toBe(true);
    expect(me.parts.tough).toBeCloseTo(1.4);
    expect(bot.parts.tough).toBe(1);
    me.hp = 100;
    bot.hp = 100;
    (world as unknown as Internals).damage(me, 49, 255, 0);
    (world as unknown as Internals).damage(bot, 49, 255, 0);
    expect(100 - me.hp).toBeCloseTo(35);
    expect(100 - bot.hp).toBeCloseTo(49);
    // (Their head too: the same class and vendor, 1.4 times its limit.)
    bot.parts.cls = me.parts.cls;
    bot.parts.faction = me.parts.faction;
    expect(limitOf(me.parts, Part.Head) / limitOf(bot.parts, Part.Head)).toBeCloseTo(1.4);
  });

  it("a wound that takes a bot's head off leaves a human's on", () => {
    const { me, bot } = room();
    bot.parts.cls = me.parts.cls;
    bot.parts.faction = me.parts.faction;
    me.parts.mask = bot.parts.mask;
    me.parts.wounds.fill(0);
    bot.parts.wounds.fill(0);
    // Just enough to take the bot's head (through whatever covers it).
    const wound = limitOf(bot.parts, Part.Head) * 1.1;
    const a = newStrike();
    const b = newStrike();
    strike(bot.parts, Part.Head, 1e6, wound, b);
    strike(me.parts, Part.Head, 1e6, wound, a);
    expect(b.detached).toContain(Part.Head);
    expect(a.detached).not.toContain(Part.Head);
  });
});
