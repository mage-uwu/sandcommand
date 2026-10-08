import { describe, expect, it } from 'vitest';
import { BTN_RIGHT, newBody, stepBody } from '../src/shared/actor.ts';
import { ClassId, Part, limitOf, newBodyState, resetBody } from '../src/shared/body.ts';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, DT, WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { FACTIONS, Faction, rollFaction } from '../src/shared/factions.ts';
import { Mat } from '../src/shared/materials.ts';
import { GameMode, Phase, Team } from '../src/shared/protocol.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

describe('mercenary vendors (factions)', () => {
  it('every clone rolls its vendor at spawn, so both sides field a mix', () => {
    const world = new World(81, { mode: 'ffa', bots: 32, rotation: [GameMode.Lts] });
    world.addPlayer('watcher', { send() {} });
    for (let k = 0; k < 2000 && world.phase !== Phase.Live; k++) world.step();
    for (let k = 0; k < 300; k++) world.step();
    for (const team of [Team.Red, Team.Green]) {
      const vendors = new Set(world.players.filter((p): p is Player => !!p && p.alive && p.team === team).map((p) => p.parts.faction));
      expect(vendors.size).toBeGreaterThanOrEqual(2);
    }
    // Guild-Tech is the common issue.
    const n = [0, 0, 0];
    for (let i = 0; i < 1000; i++) n[rollFaction(i / 1000)]++;
    expect(n[Faction.GuildTech]).toBeGreaterThan(n[Faction.RustNomads]);
    expect(n[Faction.RustNomads]).toBeGreaterThan(0);
    expect(n[Faction.SynthLegion]).toBeGreaterThan(0);
  });

  it('Nomads run faster than Guild-Tech, the Legion slower', () => {
    const t = new Terrain();
    for (let y = 400; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) t.set(x, y, Mat.Bedrock);
    t.rebuildAllPlanes();
    const run = (faction: number) => {
      const b = newBody(500, 400 - ACTOR_H);
      b.faction = faction;
      for (let k = 0; k < 60; k++) stepBody(b, BTN_RIGHT, t, DT);
      return b.x;
    };
    expect(run(Faction.RustNomads)).toBeGreaterThan(run(Faction.GuildTech));
    expect(run(Faction.SynthLegion)).toBeLessThan(run(Faction.GuildTech));
  });

  it('the Legion is tougher, the Nomads thinner-skinned', () => {
    const s = newBodyState(ClassId.Medium);
    const limit = (f: number) => {
      resetBody(s, ClassId.Medium, f);
      return limitOf(s, Part.Torso);
    };
    expect(limit(Faction.SynthLegion)).toBeGreaterThan(limit(Faction.GuildTech));
    expect(limit(Faction.RustNomads)).toBeLessThan(limit(Faction.GuildTech));
    expect(FACTIONS[Faction.SynthLegion].bleeds).toBe(false);
  });

  it("machines don't bleed out from a lost limb; flesh does", () => {
    const world = new World(82);
    const a = world.addPlayer('a', { send() {} })!;
    const b = world.addPlayer('b', { send() {} })!;
    deliverAll(world, [a, b]);
    for (const [p, f] of [
      [a, Faction.SynthLegion],
      [b, Faction.GuildTech],
    ] as const) {
      resetBody(p.parts, ClassId.Medium, f);
      p.body.faction = f;
      p.parts.mask &= ~(1 << Part.OffArm); // an arm shot off
    }
    const a0 = a.hp;
    const b0 = b.hp;
    for (let k = 0; k < 60; k++) world.step();
    expect(a.hp).toBe(a0);
    expect(b.hp).toBeLessThan(b0);
  });

  it('clients learn every clone vendor (their own included) at no extra cost', () => {
    const frames: Uint8Array[] = [];
    const world = new World(83);
    const a = world.addPlayer('a', { send: (d) => frames.push(d) })!;
    const b = world.addPlayer('b', { send() {} })!;
    deliverAll(world, [a, b]);
    b.body.x = a.body.x + 20;
    b.body.y = a.body.y;
    world.step();
    const game = new Game();
    game.myId = a.id;
    for (const f of frames) {
      const r = new Reader(f);
      r.u8();
      const tick = r.u32();
      const ack = r.u16();
      game.applyFrame(tick, ack, r);
    }
    expect(game.body.faction).toBe(a.parts.faction);
    const view = game.remoteViews().find((v) => v.id === b.id);
    expect(view?.faction).toBe(b.parts.faction);
    expect(game.synthetic(b.id)).toBe(FACTIONS[b.parts.faction].synthetic);
  });
});
