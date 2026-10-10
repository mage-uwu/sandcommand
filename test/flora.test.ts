import { describe, expect, it } from 'vitest';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, ACTOR_W } from '../src/shared/constants.ts';
import { BLISTER_R, FloraKind, floraBox } from '../src/shared/frosting.ts';
import { Mat } from '../src/shared/materials.ts';
import { PK, W_BLISTER } from '../src/shared/particles.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { ProjKind } from '../src/shared/weapons.ts';
import { Biome, MapKind, biomeOf, generateWorld, lastFlora } from '../src/shared/worldgen.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

const seedFor = (biome: number) => {
  for (let s = 1; ; s++) if (biomeOf(s, MapKind.Plain) === biome) return s;
};

describe('flora lives underground', () => {
  it('the surface is barren (bar the odd tuft of lichen); the caves are full of life', () => {
    const t = new Terrain();
    for (const b of [Biome.Dunes, Biome.Canyons, Biome.Highlands, Biome.Meadows, Biome.Deadland]) {
      generateWorld(t, seedFor(b), MapKind.Plain);
      expect(lastFlora.filter((f) => f.kind !== FloraKind.Hanging && Math.abs(f.y - t.surfaceY(f.x)) <= 1).length).toBe(0);
      if (b === Biome.Deadland) continue;
      expect(lastFlora.length).toBeGreaterThan(150);
      const kinds = new Set(lastFlora.map((f) => f.kind));
      for (const k of [FloraKind.Coral, FloraKind.Puffs, FloraKind.Blister, FloraKind.Hanging]) expect(kinds).toContain(k);
      // Lichen in tufts only.
      let grass = 0;
      let cols = 0;
      for (let x = 8; x < 4088; x += 2, cols++) if (t.get(x, t.surfaceY(x)) === Mat.Grass) grass++;
      expect(grass / cols).toBeLessThan(0.08);
    }
  });
});

describe('flora in a fight', () => {
  function field(seed: number) {
    const world = new World(seed);
    const a = world.addPlayer('a', { send() {} })!;
    const b = world.addPlayer('b', { send() {} })!;
    deliverAll(world, [a, b]);
    const t = world.terrain;
    // (The first plant of these kinds standing on a cave floor with room round it.)
    const surface = (...kinds: number[]) =>
      world.flora.findIndex(
        (f, i) => kinds.includes(f.kind) && !world.floraDead[i] && f.x > 500 && f.x < 3600 && !t.rectSolid(f.x - 12, f.y - 24, f.x + 12, f.y - 1),
      );
    const park = (p: Player, x: number) => {
      p.body.x = x;
      p.body.y = t.surfaceY(Math.round(x)) - ACTOR_H - 1; // (up top, out of the way)
      p.body.vx = p.body.vy = 0;
      p.hp = 100;
    };
    return { world, a, b, surface, park };
  }
  /** The first world (from `seed`) with one of these kinds of plant out on the open ground (not a deadland map). */
  function fieldWith(seed: number, ...kinds: number[]) {
    for (let s = seed; ; s++) {
      const fl = field(s);
      const i = fl.surface(...kinds);
      if (i >= 0) return { ...fl, i };
    }
  }

  it('a round through a plant cuts it down, and flies on', () => {
    const { world, a, b, park, i } = fieldWith(61, FloraKind.Centipede, FloraKind.Coral, FloraKind.Puffs);
    const f = world.flora[i];
    park(a, f.x - 400);
    park(b, f.x + 400);
    const bx = floraBox(f);
    world.projectiles.spawn(88001, ProjKind.Bullet, a.id, f.x - 11, (bx.y0 + bx.y1) / 2, 900, 0);
    for (let k = 0; k < 4; k++) world.step();
    expect(world.floraDead[i]).toBe(1);
  });

  it('a blast tears plants up, and so does digging their ground out from under them', () => {
    const { world, a, b, park, i } = fieldWith(62, FloraKind.Puffs, FloraKind.Centipede, FloraKind.Coral);
    park(a, 100);
    park(b, 3990);
    const f = world.flora[i];
    world.carve(f.x + 4, f.y - 3, 6, 3, 0, a.id);
    expect(world.floraDead[i]).toBe(1);
    const j = world.flora.findIndex((g, k) => k !== i && !world.floraDead[k] && g.kind === FloraKind.Hanging);
    const h = world.flora[j];
    // (Dig its roof out from above it, never touching the plant itself.)
    world.carve(h.x, h.y - 6, 6, 6, 0, a.id);
    expect(world.floraDead[j]).toBe(1);
  });

  it('brush a blister coral and it swells and bursts, scalding whoever is close', () => {
    const { world, a, b, park, i } = fieldWith(63, FloraKind.Blister);
    const f = world.flora[i];
    park(b, f.x + 600);
    a.body.x = f.x - ACTOR_W / 2;
    a.body.y = f.y - ACTOR_H;
    a.hp = 100;
    let swelled = false;
    for (let k = 0; k < 30 && !world.floraDead[i]; k++) {
      a.body.x = f.x - ACTOR_W / 2; // (it stays put, right in it)
      a.body.y = f.y - ACTOR_H;
      a.body.vx = a.body.vy = 0;
      world.step();
      if (world.floraFuse.has(i)) swelled = true;
    }
    expect(swelled).toBe(true);
    expect(world.floraDead[i]).toBe(1);
    expect(a.hp < 100 || !a.alive).toBe(true);
    // Someone further off than its reach is untouched.
    expect(b.hp).toBe(100);
    void BLISTER_R;
    void W_BLISTER;
  });

  it('clients hear which plants are gone and see them torn to pieces', () => {
    const inbox: Uint8Array[] = [];
    const world = new World(64);
    const a = world.addPlayer('a', { send: (d) => inbox.push(d) })!;
    const game = new Game();
    game.myId = a.id;
    const pump = () => {
      for (const m of inbox.splice(0)) {
        const r = new Reader(m);
        r.u8();
        const t = r.u32();
        const ack = r.u16();
        game.applyFrame(t, ack, r);
      }
    };
    world.step();
    pump();
    expect(game.flora.length).toBe(world.flora.length);
    expect(game.floraDead.length).toBe(world.flora.length);
    const i = world.flora.findIndex((f) => f.kind === FloraKind.Coral);
    const f = world.flora[i];
    game.body.x = f.x;
    game.body.y = f.y - 20;
    const gibs = game.particles.count(PK.Gib);
    world.killFlora(i, a.id);
    world.step();
    pump();
    expect(game.floraDead[i]).toBe(1);
    expect(game.particles.count(PK.Gib)).toBeGreaterThan(gibs);
  });
});
