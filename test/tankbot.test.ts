import { describe, expect, it } from 'vitest';
import { GameMode, Phase } from '../src/shared/protocol.ts';
import { WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { BeastKind } from '../src/shared/wildlife.ts';
import { newTank, tankH, tankW } from '../src/shared/tank.ts';
import { type Player, World } from '../src/server/world.ts';

function until(world: World, cond: () => boolean, max = 3000): void {
  for (let t = 0; t < max && !cond(); t++) world.step();
}
/** Put bot `p` at the controls of a fresh tank at (x, y). */
function seat(world: World, p: Player, x: number, y: number) {
  const k = newTank(x, y);
  k.chute = false;
  const slot = world.tanks.indexOf(null);
  world.tanks[slot] = k;
  p.tank = slot;
  k.pilot = p.id;
  return k;
}

describe('bots at the controls', () => {
  it('Extermination: a bot drives its tank down a chute into the lair, toward the nearest basilisk', () => {
    const world = new World(311, { mode: 'ffa', rotation: [GameMode.Extermination], tanks: false, bots: 3 });
    const h = world.addPlayer('h', { send() {} })!;
    world.addPlayer('h2', { send() {} });
    until(world, () => world.phase === Phase.Live);
    until(world, () => world.players.some((p) => p?.bot && p.alive), 30 * 20);
    for (let i = 0; i < world.beasts.length; i++) if (world.beasts[i] && world.beasts[i]!.kind !== BeastKind.Basilisk) world.beasts[i] = null;
    (world as unknown as { beastSpawnAt: number }).beastSpawnAt = 1e9;
    // (The humans well out of the way: off over the map's far end, up high.)
    for (const o of world.players) if (o && !o.bot) { o.body.x = 20; o.body.y = 40; }
    void h;
    const bot = world.players.find((p) => p?.bot && p.alive)!;
    const lair = world.lair!;
    // On the surface, a little way off the first chute's mouth.
    const mx = lair.mouths[0] + 90;
    const k = seat(world, bot, mx - 16, world.terrain.surfaceY(mx) - 26);
    let deepest = -Infinity;
    let woke = false;
    for (let t = 0; t < 30 * 50 && bot.tank >= 0 && !woke; t++) {
      for (const o of world.players) if (o && !o.bot) { o.body.x = 20; o.body.y = 40; o.body.vx = o.body.vy = 0; }
      world.step();
      const c = Math.round(k.x + tankW(k) / 2);
      if (c > lair.x0 && c < lair.x1 && k.y > lair.roof[c]) deepest = Math.max(deepest, k.y);
      woke = world.beasts.some((b) => b?.kind === BeastKind.Basilisk && b.frozen === 0);
    }
    // Down in the cave, and on into the den: the basilisk there woken (by the noise of it, or its shells).
    expect(deepest).toBeGreaterThan(-Infinity);
    expect(woke).toBe(true);
  });

  it('on any map: a target in a cave under the ground, the tank finds the way down and on to it', () => {
    const world = new World(7, { mode: 'ffa', tanks: false, bots: 3 });
    world.wildlife = false;
    const a = world.addPlayer('a', { send() {} })!;
    until(world, () => world.phase === Phase.Live);
    until(world, () => world.players.some((p) => p?.bot && p.alive), 30 * 20);
    const bot = world.players.find((p) => p?.bot && p.alive)!;
    const t = world.terrain;
    // Flat ground at 400; under it, a cave (a hall at 560..620, from x 500 to 1500), reached only by a shaft down at x 500..560:
    // behind the tank, away from the target (straight at it over the top, it never gets there).
    for (let y = 0; y < 900; y++) for (let x = 300; x < 1700; x++) t.set(x, y, y < 400 ? Mat.Air : Mat.Dirt);
    for (let y = 400; y < 620; y++) for (let x = 500; x < 560; x++) t.set(x, y, Mat.Air);
    for (let y = 560; y < 620; y++) for (let x = 500; x < 1500; x++) t.set(x, y, Mat.Air);
    for (let x = 300; x < 1700; x++) for (let y = 620; y < 640; y++) t.set(x, y, Mat.Bedrock);
    world.terrainReplaced();
    a.body.x = 1400;
    a.body.y = 620 - 28;
    const k = seat(world, bot, 800, 400 - tankH(newTank(0, 0)) - 2);
    let closest = Infinity;
    for (let n = 0; n < 30 * 40 && bot.tank >= 0; n++) {
      a.hp = 100;
      a.body.x = 1400;
      a.body.y = 620 - 28;
      a.body.vx = a.body.vy = 0;
      world.step();
      closest = Math.min(closest, Math.abs(k.x + tankW(k) / 2 - a.cx) + Math.max(0, a.cy - (k.y + tankH(k))));
      if (closest < 300 && k.y > 540) break;
    }
    expect(k.y).toBeGreaterThan(540); // (down in the cave)
    expect(closest).toBeLessThan(300);
  });
});
