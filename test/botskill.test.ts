import { describe, expect, it } from 'vitest';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { ACTOR_H, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { WeaponId } from '../src/shared/weapons.ts';
import { BotBrain } from '../src/server/bots.ts';
import { type Player, World, drawSkill } from '../src/server/world.ts';
import { GameMode, Phase } from '../src/shared/protocol.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 400;

/** A bot with a rifle against a dummy that can't die, `gap` cells off: the damage it does in `secs`. */
function duel(skill: number, seed: number, gap = 170, secs = 10): number {
  const world = new World(seed);
  const bot = world.addPlayer('bot', { send() {} })!;
  bot.skill = skill;
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

describe('bot skill', () => {
  /** A round room (one human, the rest bots) into its first wave of `mode`. */
  function room(mode: number, seed: number) {
    const world = new World(seed, { mode: 'ffa', bots: 33, rotation: [mode] });
    world.addPlayer('human', { send() {} });
    for (let k = 0; k < 3000 && world.phase !== Phase.Live; k++) world.step();
    expect(world.phase).toBe(Phase.Live);
    return world;
  }
  const bots = (world: World) => world.players.filter((p): p is Player => !!p && !!p.bot);

  it('every bot has its own: a spread clustered round veteran, a few beginners and experts', () => {
    const world = room(GameMode.Lms, 41);
    const skills = bots(world).map((p) => p.skill);
    expect(skills.length).toBe(32);
    const n = (lv: number) => skills.filter((s) => s === lv).length;
    expect(n(3)).toBeGreaterThan(n(2));
    expect(n(3)).toBeGreaterThan(n(4));
    expect(n(2)).toBeGreaterThan(n(1));
    expect(n(4)).toBeGreaterThan(n(5));
    expect(n(1)).toBeGreaterThan(0);
    expect(n(5)).toBeGreaterThan(0);
    const sorted = [...skills].sort((a, b) => a - b);
    expect(sorted[sorted.length >> 1]).toBe(3);
    // A bot that turns up later draws from the same spread.
    expect([1, 2, 3, 4, 5]).toContain(drawSkill(0.5));
    expect(drawSkill(0.5)).toBe(3);
  });

  it('balanced between the teams (humans counting as veterans)', () => {
    for (const [mode, teams] of [
      [GameMode.Lts, 2],
      [GameMode.Siege, 2],
    ] as const) {
      const world = room(mode, 42);
      const sum = new Array<number>(teams).fill(0);
      for (const p of world.players) if (p && p.team < teams) sum[p.team] += p.bot ? p.skill : 3;
      expect(Math.max(...sum) - Math.min(...sum)).toBeLessThanOrEqual(2);
      // Both sides get some of the best and some of the worst.
      for (let t = 0; t < teams; t++) {
        const mine = bots(world).filter((p) => p.team === t).map((p) => p.skill);
        expect(Math.max(...mine)).toBeGreaterThanOrEqual(4);
        expect(Math.min(...mine)).toBeLessThanOrEqual(2);
      }
    }
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
