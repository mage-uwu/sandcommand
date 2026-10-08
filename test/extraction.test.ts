import { describe, expect, it } from 'vitest';
import { ACTOR_H, ACTOR_W } from '../src/shared/constants.ts';
import { Part } from '../src/shared/body.ts';
import { COLS, EVAC_H, ROWS, SPIKE_DEPTH, TrapKind, cellAt, OPEN_E, OPEN_S } from '../src/shared/dungeon.ts';
import { Mat, MAT_FIXED } from '../src/shared/materials.ts';
import { Evac, GameMode, Phase, Team } from '../src/shared/protocol.ts';
import { ProjKind, WeaponId } from '../src/shared/weapons.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { MapKind, generateWorld, lastDungeon } from '../src/shared/worldgen.ts';
import { type Player, World } from '../src/server/world.ts';
import { Reader } from '../src/shared/codec.ts';
import { Game } from '../src/client/game.ts';

type Internals = { pickUp: (p: Player) => void; placeClone: (p: Player, x: number, y: number, vx: number, vy: number) => void };
const int = (w: World) => w as unknown as Internals;
function until(world: World, cond: () => boolean, max = 3000): void {
  for (let t = 0; t < max && !cond(); t++) world.step();
}
function extraction(seed: number, n = 8) {
  const world = new World(seed, { mode: 'ffa', rotation: [GameMode.Extraction], tanks: false });
  const ps = Array.from({ length: n }, (_, i) => world.addPlayer(`p${i}`, { send() {} })!);
  until(world, () => world.phase === Phase.Live);
  until(world, () => ps.every((p) => p.alive), 1500);
  return { world, ps };
}
/** Put a clone standing at (x, feet y). */
const stand = (_world: World, p: Player, x: number, feet: number) => {
  p.body.x = x - ACTOR_W / 2;
  p.body.y = feet - ACTOR_H;
  p.body.vx = p.body.vy = 0;
};

describe('Extraction map', () => {
  it('is deep: a high desert over one labyrinth of stone that never yields', () => {
    const t = new Terrain();
    generateWorld(t, 9, MapKind.Dungeon);
    const d = lastDungeon!;
    expect(d).not.toBeNull();
    expect(t.surfaceY(600)).toBeLessThan(200);
    expect(MAT_FIXED[Mat.Cobble] && MAT_FIXED[Mat.Glyph]).toBe(true);
    // Every room can be reached from every team's well (the maze is connected).
    const seen = new Uint8Array(COLS * ROWS);
    const q = [cellAt(d.entrances[0].x, 220)];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop()!;
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      const nb: number[] = [];
      if (d.open[i] & OPEN_E) nb.push(i + 1);
      if (c > 0 && d.open[i - 1] & OPEN_E) nb.push(i - 1);
      if (d.open[i] & OPEN_S) nb.push(i + COLS);
      if (r > 0 && d.open[i - COLS] & OPEN_S) nb.push(i - COLS);
      for (const j of nb) if (!seen[j]) (seen[j] = 1), q.push(j);
    }
    expect(seen.every((v) => v === 1)).toBe(true);
    // The idol sits at the bottom, in the sanctum; four wells and the pyramid lead down.
    expect(d.idol.y).toBeGreaterThan(900);
    expect(d.entrances.length).toBe(5);
    expect(d.regions.length).toBeGreaterThan(3);
    for (const k of [TrapKind.Spikes, TrapKind.Darts, TrapKind.Mine]) expect(d.traps.some((tr) => tr.kind === k)).toBe(true);
    // Deterministic: clients build the same labyrinth from the seed.
    const t2 = new Terrain();
    generateWorld(t2, 9, MapKind.Dungeon);
    let same = true;
    for (let i = 0; i < t.mat.length && same; i++) same = t.mat[i] === t2.mat[i];
    expect(same).toBe(true);
  });
});

describe('Extraction', () => {
  it('four teams; the idol on its altar, vacant tanks below, everyone drops in at their own well', () => {
    const { world, ps } = extraction(51);
    expect(world.mapKind).toBe(MapKind.Dungeon);
    const per = [0, 0, 0, 0];
    for (const p of ps) per[p.team]++;
    expect(per).toEqual([2, 2, 2, 2]);
    const d = world.dungeon!;
    const idol = world.items.find((it) => it.weapon === WeaponId.Idol)!;
    expect(Math.hypot(idol.x - d.idol.x, idol.y - d.idol.y)).toBeLessThan(10);
    expect(world.tanks.filter((t) => t && t.pilot === 255).length).toBe(d.tanks.length);
    for (const p of ps) expect(Math.abs(p.cx - d.entrances[p.team].x)).toBeLessThan(260);
  });

  it('carry the idol to the surface: the rocket comes, take it aboard and your team wins', () => {
    const { world, ps } = extraction(52);
    const a = ps[0];
    const d = world.dungeon!;
    stand(world, a, d.idol.x, d.idol.y + 12);
    int(world).pickUp(a);
    expect(a.inv.some((it) => it.weapon === WeaponId.Idol)).toBe(true);
    expect(world.idolHolder()).toBe(a);
    world.step();
    expect(world.evac.state).toBe(Evac.None); // still underground
    const x = d.entrances[a.team].x + 120;
    stand(world, a, x, world.terrain.surfaceY(x));
    world.step();
    expect(world.surfaced(a)).toBe(true);
    expect(world.evac.state).toBe(Evac.Inbound);
    expect(world.evac.eta).toBeGreaterThan(30 * 15); // it takes a while to come
    until(world, () => world.evac.state === Evac.Landed, 1200);
    expect(world.evac.state).toBe(Evac.Landed);
    expect(Math.abs(world.evac.x - a.cx)).toBeLessThan(260);
    // Dying spills it; the rocket waits; whoever brings it aboard wins for their team.
    const b = ps.find((p) => p.team !== a.team)!;
    stand(world, b, world.evac.x, world.evac.y + EVAC_H);
    int(world).pickUp(b); // nothing here yet
    a.inv = a.inv.filter((it) => it.weapon !== WeaponId.Idol);
    world.items.push({ id: 60000, weapon: WeaponId.Idol, ammo: 0, x: b.cx, y: b.cy, vx: 0, vy: 0, rest: false, left: false, age: 0, rev: 0 } as never);
    int(world).pickUp(b);
    expect(world.idolHolder()).toBe(b);
    world.step();
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).toBe(b.team);
    expect(world.evac.state).toBe(Evac.Leaving);
  });

  it('time up: whoever holds the idol takes it', () => {
    const { world, ps } = extraction(53);
    stand(world, ps[3], world.dungeon!.idol.x, world.dungeon!.idol.y + 12);
    int(world).pickUp(ps[3]);
    world.phaseTimer = 1;
    world.step();
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).toBe(ps[3].team);
  });

  it('booby traps: spikes bite, darts fly, plates blow (once)', () => {
    const { world, ps } = extraction(54);
    const d = world.dungeon!;
    const [a, b, c] = ps;
    const spikes = d.traps.find((t) => t.kind === TrapKind.Spikes)!;
    stand(world, a, spikes.x + spikes.w / 2, spikes.y + SPIKE_DEPTH);
    for (let k = 0; k < 15; k++) world.step();
    expect(a.parts.wounds[Part.LegF] + a.parts.wounds[Part.LegB]).toBeGreaterThan(0);

    const darts = d.traps.find((t) => t.kind === TrapKind.Darts)!;
    const fired: number[] = [];
    const spawn = world.projectiles.spawn.bind(world.projectiles);
    world.projectiles.spawn = (id, kind, owner, x, y, vx, vy) => {
      fired.push(kind);
      return spawn(id, kind, owner, x, y, vx, vy);
    };
    stand(world, b, darts.x + darts.dir * 30, darts.y + 9);
    for (let k = 0; k < 4; k++) world.step();
    expect(fired).toContain(ProjKind.Dart);

    const mine = d.traps.find((t) => t.kind === TrapKind.Mine)!;
    const rev = world.trapsRev;
    stand(world, c, mine.x, mine.y);
    world.step();
    world.step();
    expect(fired).toContain(ProjKind.Mine);
    expect(world.trapsRev).toBe(rev + 1);
    expect(world.trapSpent[mine.id >> 3] & (1 << (mine.id & 7))).toBeTruthy();
    void Team;
  });

  it('clients build the same labyrinth, and follow the idol, the rocket and the traps', () => {
    const frames: Uint8Array[] = [];
    const world = new World(55, { mode: 'ffa', rotation: [GameMode.Extraction], tanks: false });
    const a = world.addPlayer('a', { send: (d) => frames.push(d) })!;
    world.addPlayer('b', { send() {} });
    const game = new Game();
    game.myId = a.id;
    const pump = () => {
      for (const f of frames) {
        const r = new Reader(f);
        r.u8();
        const tick = r.u32();
        const ack = r.u16();
        game.applyFrame(tick, ack, r);
      }
      frames.length = 0;
    };
    until(world, () => world.phase === Phase.Live);
    world.step();
    pump();
    expect(game.dungeon).not.toBeNull();
    expect(game.dungeon!.idol).toEqual(world.dungeon!.idol);
    expect(game.roundState?.mode).toBe(GameMode.Extraction);
    expect(game.roundState?.idol?.holder).toBe(255);
    expect(Math.abs(game.roundState!.idol!.x - world.dungeon!.idol.x)).toBeLessThan(3);
    const mine = world.dungeon!.traps.find((t) => t.kind === TrapKind.Mine)!;
    expect(game.trapGone(mine.id)).toBe(false);
    until(world, () => a.alive, 600);
    stand(world, a, mine.x, mine.y);
    world.step();
    world.step();
    pump();
    expect(game.trapGone(mine.id)).toBe(true);
  });

  it('an all-bot wave ends with a team getting the idol out', () => {
    const world = new World(56, { mode: 'ffa', bots: 24, rotation: [GameMode.Extraction] });
    world.addPlayer('human', { send() {} });
    until(world, () => world.phase === Phase.Live);
    until(world, () => world.phase !== Phase.Live, 30 * 60 * 8);
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).not.toBe(255);
    expect(world.evac.state).toBe(Evac.Leaving);
  }, 120_000);
});
