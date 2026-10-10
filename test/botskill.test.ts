import { describe, expect, it } from 'vitest';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { ACTOR_H, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { WeaponId } from '../src/shared/weapons.ts';
import { BotBrain } from '../src/server/bots.ts';
import { World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 400;

/** A bot with a rifle against a dummy that can't die, `gap` cells off: the damage it does in `secs`. */
function duel(skill: number, seed: number, gap = 170, secs = 10): number {
  const world = new World(seed);
  world.fixedBotSkill = skill;
  const bot = world.addPlayer('bot', { send() {} })!;
  const dummy = world.addPlayer('dummy', { send() {} })!;
  deliverAll(world, [bot, dummy]);
  const t = world.terrain;
  for (let x = 0; x < WORLD_W; x++) for (let y = 0; y < FLOOR + 20; y++) t.set(x, y, y >= FLOOR ? Mat.Bedrock : Mat.Air);
  world.terrainReplaced();
  resetBody(bot.parts, ClassId.Medium, 0);
  bot.body.x = 1000;
  bot.body.y = FLOOR - ACTOR_H;
  world.equip(bot, WeaponId.Rifle);
  const brain = new BotBrain(seed);
  let dealt = 0;
  for (let k = 0; k < 30 * secs; k++) {
    resetBody(dummy.parts, ClassId.Heavy, 0);
    dummy.hp = 100;
    dummy.alive = true;
    dummy.body.x = bot.body.x + gap;
    dummy.body.y = FLOOR - ACTOR_H;
    dummy.body.vx = 0;
    world.input(bot.id, brain.think(world, bot));
    world.step();
    dealt += 100 - Math.max(0, dummy.hp);
    // (Keep the rifle loaded and the bot from wandering into point blank.)
    const it = bot.inv.find((i) => i.weapon === WeaponId.Rifle);
    if (it) it.ammo = 30;
  }
  return dealt;
}

describe('bot difficulty', () => {
  it('the room plays at the median of what its humans asked for (veteran with nobody to ask)', () => {
    const world = new World(5);
    expect(world.botSkill).toBe(3);
    const ps = [1, 5, 4].map((s, i) => {
      const p = world.addPlayer(`h${i}`, { send() {} })!;
      p.skillPref = s;
      return p;
    });
    expect(world.botSkill).toBe(4);
    world.removePlayer(ps[2].id);
    expect(world.botSkill).toBe(1); // (an even split goes the easier way)
    world.fixedBotSkill = 5;
    expect(world.botSkill).toBe(5);
  });

  it('an expert bot shoots far straighter than a beginner', () => {
    let beginner = 0;
    let expert = 0;
    for (const seed of [11, 12, 13]) {
      beginner += duel(1, seed);
      expert += duel(5, seed);
    }
    expect(expert).toBeGreaterThan(beginner * 1.8);
    expect(expert).toBeGreaterThan(0);
  });
});
