import { describe, expect, it } from 'vitest';
import { deliverAll } from './helpers.ts';
import { Reader } from '../src/shared/codec.ts';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { Faction } from '../src/shared/factions.ts';
import { Mat } from '../src/shared/materials.ts';
import { PK, type Particles } from '../src/shared/particles.ts';

function goldGrains(p: Particles): number {
  let n = 0;
  for (let i = 0; i < p.n; i++) if (p.kind[i] === PK.Grain && p.aux[i] === Mat.Gold) n++;
  return n;
}
import { World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';

describe('gibbing', () => {
  it('a server-side kill gibs the clone on every client and mirrors the gold spill', () => {
    const world = new World(31);
    const inbox: Uint8Array[] = [];
    const watcher = new Game();
    const a = world.addPlayer('watcher', { send: (d) => inbox.push(d) })!;
    const b = world.addPlayer('victim', { send() {} })!;
    watcher.myId = a.id;
    deliverAll(world, [a, b]); // both spawn
    expect(b.alive).toBe(true);
    // (A clone of flesh and blood: a spider droid scraps into metal, not gibs. droid.test.ts has those.)
    resetBody(b.parts, ClassId.Medium, Faction.GuildTech);
    b.body.cls = ClassId.Medium;
    b.body.faction = Faction.GuildTech;
    world.step();
    b.gold = 40;
    // Park the watcher next to the victim so the death is on screen.
    a.body.x = b.body.x + 20;
    a.body.y = b.body.y;
    (world as unknown as { damage: (v: unknown, n: number, by: number, w: number) => void }).damage(b, 500, a.id, 1);
    expect(b.alive).toBe(false);
    expect(b.gold).toBe(20);
    const serverGold = goldGrains(world.grains);
    expect(serverGold).toBe(20);

    world.step();
    for (const msg of inbox) {
      const r = new Reader(msg);
      r.u8();
      const tick = r.u32();
      const ack = r.u16();
      watcher.applyFrame(tick, ack, r);
    }
    // Body parts and blood are particles of the same field engine as the grains.
    expect(watcher.particles.count(PK.Gib)).toBeGreaterThanOrEqual(8 + 8); // body parts + meat
    expect(watcher.particles.count(PK.Blood)).toBeGreaterThan(0);
    const clientGold = goldGrains(watcher.particles);
    expect(clientGold).toBe(20);
    expect(watcher.feed.at(-1)?.text).toContain('victim');
  });
});
