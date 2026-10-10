import { describe, expect, it } from 'vitest';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, ACTOR_W, WORLD_W } from '../src/shared/constants.ts';
import { FloraKind, GEYSER_TOXIC_TICKS, geyserCloud } from '../src/shared/frosting.ts';
import { Mat } from '../src/shared/materials.ts';
import { GF_DEAD, GF_RUMBLE, GF_TOXIC } from '../src/shared/protocol.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { MapKind, generateWorld, lastCraters, lastFlora, lastGemCaverns, lastGeysers } from '../src/shared/worldgen.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

describe('frosting: the ground', () => {
  const t = new Terrain();
  generateWorld(t, 1, MapKind.Plain);
  const craters = [...lastCraters];
  const caverns = [...lastGemCaverns];
  const geysers = [...lastGeysers];
  const flora = [...lastFlora];

  it('impact craters: a bowl below the ground either side, lined with sand, scorched regolith or rust dust (not turf)', () => {
    expect(craters.length).toBeGreaterThanOrEqual(3);
    for (const c of craters) {
      const mid = t.surfaceY(c.x);
      const side = Math.min(t.surfaceY(c.x - c.r * 1.3), t.surfaceY(c.x + c.r * 1.3));
      expect(mid).toBeGreaterThan(side + 2); // dished in
      const floor = t.get(c.x, mid);
      expect([Mat.Sand, Mat.RustSand, Mat.Regolith]).toContain(floor);
    }
  });

  it('gem caverns: deep hollows bristling with big rare earth crystals', () => {
    expect(caverns.length).toBeGreaterThanOrEqual(2);
    for (const c of caverns) {
      expect(t.get(c.x, c.y)).toBe(Mat.Air);
      expect(c.y - t.surfaceY(c.x)).toBeGreaterThan(140);
      let rare = 0;
      for (let y = c.y - c.ry - 6; y <= c.y + c.ry + 6; y++) for (let x = c.x - c.rx - 6; x <= c.x + c.rx + 6; x++) if (t.get(x, y) === Mat.RareEarth) rare++;
      expect(rare).toBeGreaterThan(250); // ~2500 gold's worth and up
    }
  });

  it('geysers: vent mounds on the surface and on cave floors, a mouth open over a rock chimney', () => {
    expect(geysers.filter((g) => !g.cave).length).toBeGreaterThanOrEqual(3);
    expect(geysers.filter((g) => g.cave).length).toBeGreaterThanOrEqual(1);
    for (const g of geysers) {
      expect(t.get(g.x, g.y)).toBe(Mat.Air);
      expect(t.get(g.x, g.y + 1)).toBe(Mat.Rock);
    }
  });

  it('flora: centipede plants and puffballs on the open ground, coral and hanging coral in the caves, tube worms by every vent', () => {
    const kinds = new Set(flora.map((f) => f.kind));
    for (const k of Object.values(FloraKind)) expect(kinds).toContain(k);
    for (const f of flora) {
      if (f.kind === FloraKind.Hanging) expect(t.get(f.x, f.y + 1)).toBe(Mat.Air);
      else expect(t.get(f.x, f.y - 1)).toBe(Mat.Air);
      expect(t.get(f.x, f.y)).not.toBe(Mat.Air);
    }
    for (const g of geysers) expect(flora.some((f) => f.kind === FloraKind.Tubes && Math.abs(f.x - g.x) < 30)).toBe(true);
  });

  it('never over the labyrinth: an Extraction map has no craters, caverns or geysers', () => {
    const t2 = new Terrain();
    generateWorld(t2, 5, MapKind.Dungeon);
    expect(lastCraters.length + lastGemCaverns.length + lastGeysers.length).toBe(0);
  });
});

describe('geysers', () => {
  type Internals = { stepGeysers: () => void };
  function nearVent(seed: number) {
    const world = new World(seed);
    const a = world.addPlayer('a', { send() {} })!;
    const b = world.addPlayer('b', { send() {} })!;
    deliverAll(world, [a, b]);
    const gi = world.geysers.findIndex((g) => !g.cave);
    const g = world.geysers[gi];
    const stand = (p: Player, dx: number, dy = 0) => {
      p.body.x = g.x + dx - ACTOR_W / 2;
      p.body.y = g.y - ACTOR_H - 2 + dy;
      p.body.vx = p.body.vy = 0;
      p.hp = 100;
    };
    return { world, a, b, g, gi, stand };
  }

  it('shot at, it rumbles a moment and blows: a blast round the mouth, and the shooter takes the blame', () => {
    const { world, a, b, g, stand } = nearVent(41);
    stand(b, 8);
    stand(a, 300);
    for (let k = 0; k < 6 && g.fuse === 0; k++) world.carve(g.x, g.y, 2, 0, 0, a.id);
    expect(g.fuse).toBeGreaterThan(0);
    for (let k = 0; k < 12 && g.toxic === 0; k++) world.step();
    expect(g.toxic).toBeGreaterThan(0);
    expect(b.hp < 100 || !b.alive).toBe(true);
    expect(b.lastHitBy).toBe(a.id);
    // Not again for a while.
    world.carve(g.x, g.y, 2, 0, 0, a.id);
    expect(g.fuse).toBe(0);
  });

  it('its deadly smoke chokes whoever stands in the cloud (not someone sealed in a tank)', () => {
    const { world, b, g, gi } = nearVent(42);
    world.blowGeyser(gi);
    // Stand in the cloud for its whole life.
    let lost = 0;
    for (let k = 0; k < GEYSER_TOXIC_TICKS - 2; k++) {
      const c = geyserCloud(g.x, g.y, GEYSER_TOXIC_TICKS - g.toxic);
      b.body.x = c.x - ACTOR_W / 2;
      b.body.y = c.y - ACTOR_H / 2;
      b.body.vx = b.body.vy = 0;
      const hp = b.hp;
      world.step();
      if (b.alive) lost += Math.max(0, hp - b.hp);
      else break;
    }
    expect(!b.alive || lost > 60).toBe(true);
  });

  it('left alone, now and then it blows on its own; dig its vent away and it is choked for good', () => {
    const { world, g } = nearVent(43);
    g.cd = g.calm = 0;
    const internals = world as unknown as Internals;
    let rumbled = false;
    for (let k = 0; k < 30 * 60 * 20 && !rumbled; k++) {
      internals.stepGeysers();
      if (g.fuse > 0) rumbled = true;
    }
    expect(rumbled).toBe(true);
    // Dig the chimney out from under the mouth.
    for (let k = 0; k < 4; k++) world.carve(g.x, g.y + 4 + k * 3, 5, 5, 0);
    for (let k = 0; k < 3; k++) world.step();
    expect(g.dead).toBe(true);
  });

  it('clients hear of the geysers and their state, and see it blow', () => {
    const inbox: Uint8Array[] = [];
    const world = new World(44);
    const a = world.addPlayer('a', { send: (d) => inbox.push(d) })!;
    const game = new Game();
    game.myId = a.id;
    const pump = () => {
      for (const f of inbox.splice(0)) {
        const r = new Reader(f);
        r.u8();
        const t = r.u32();
        const ack = r.u16();
        game.applyFrame(t, ack, r);
      }
    };
    world.step();
    pump();
    expect(game.geyserList.length).toBe(world.geysers.length);
    expect(game.geyserList[0].x).toBe(world.geysers[0].x);
    world.geysers[0].fuse = 2;
    world.geysersRev++;
    world.step();
    pump();
    expect(game.geyserList[0].flags & GF_RUMBLE).toBeTruthy();
    world.step();
    world.step();
    pump();
    expect(game.geyserList[0].flags & GF_TOXIC).toBeTruthy();
    expect(game.geyserBlownAt.has(0)).toBe(true);
    expect(game.geyserList[0].flags & GF_DEAD).toBe(0);
    void WORLD_W;
  });
});
