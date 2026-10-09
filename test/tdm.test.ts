import { describe, expect, it } from 'vitest';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { GameMode, Phase, Team } from '../src/shared/protocol.ts';
import { ProjKind } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game, TEAM_COLORS } from '../src/client/game.ts';

type Internals = { damage: (p: Player, n: number, by: number, w: number) => void };
const kill = (world: World, p: Player, by: Player) => (world as unknown as Internals).damage(p, 999, by.id, 0);

function until(world: World, cond: () => boolean, max = 3000): void {
  for (let t = 0; t < max && !cond(); t++) world.step();
}
const present = (world: World) => world.players.filter((p): p is Player => !!p);
const tdmRoom = (seed: number, n: number) => {
  const world = new World(seed, { mode: 'ffa', rotation: [GameMode.Lts] });
  const ps = Array.from({ length: n }, (_, i) => world.addPlayer(`p${i}`, { send() {} })!);
  until(world, () => ps.every((p) => p.alive));
  return { world, ps };
};

describe('Last Team Standing', () => {
  it('alternates with Last Man Standing, wave by wave', () => {
    const world = new World(21, { mode: 'ffa', rotation: [GameMode.Lms, GameMode.Lts, GameMode.Regicide, GameMode.Extraction] });
    const [a, b] = ['a', 'b'].map((n) => world.addPlayer(n, { send() {} })!);
    expect(world.waveMode).toBe(GameMode.Lms); // the first wave is announced as Last Man Standing
    until(world, () => a.alive && b.alive);
    expect(world.wave).toBe(1);
    expect(a.team).toBe(Team.None);
    kill(world, b, a);
    until(world, () => world.phase === Phase.Countdown);
    expect(world.waveMode).toBe(GameMode.Lts); // the next one is a team wave
    until(world, () => world.wave === 2 && a.alive && b.alive);
    expect(world.modeOfWave(2)).toBe(GameMode.Lts);
    expect(a.team).not.toBe(Team.None);
    expect(b.team).not.toBe(a.team);
    expect(world.modeOfWave(3)).toBe(GameMode.Regicide);
    expect(world.modeOfWave(4)).toBe(GameMode.Extraction);
    expect(world.modeOfWave(5)).toBe(GameMode.Lms);
  });

  it('splits the room into even teams, humans across both, and lands them on opposite sides', () => {
    const world = new World(22, { mode: 'ffa', bots: 16, rotation: [GameMode.Lts] });
    const humans = ['h0', 'h1'].map((n) => world.addPlayer(n, { send() {} })!);
    until(world, () => world.phase === Phase.Live);
    const all = present(world);
    expect(all.length).toBe(16);
    const red = all.filter((p) => p.team === Team.Red);
    const green = all.filter((p) => p.team === Team.Green);
    expect(red.length).toBe(8);
    expect(green.length).toBe(8);
    expect(humans[0].team).not.toBe(humans[1].team);
    until(world, () => all.every((p) => p.alive || !p.inWave), 600);
    const meanX = (ps: Player[]) => ps.reduce((s, p) => s + p.cx, 0) / ps.length;
    expect(meanX(red)).toBeLessThan(WORLD_W * 0.45);
    expect(meanX(green)).toBeGreaterThan(WORLD_W * 0.55);
  });

  it('no friendly fire: a teammate shrugs off your rocket, an enemy does not, and it still hurts you', () => {
    const { world, ps } = tdmRoom(23, 4);
    const shooter = ps[0];
    const mate = ps.find((p) => p !== shooter && p.team === shooter.team)!;
    const enemy = ps.find((p) => p.team !== shooter.team)!;
    const t = world.terrain;
    for (let x = 900; x < 1100; x++) {
      for (let y = 300; y < 310; y++) t.set(x, y, Mat.Bedrock);
      for (let y = 200; y < 300; y++) t.set(x, y, Mat.Air);
    }
    world.terrainReplaced();
    const blastNear = (p: Player) => {
      for (const o of ps) o.body.x = 200 + o.id * 40; // everyone else well away
      p.body.x = 1000;
      p.body.y = 300 - ACTOR_H;
      p.body.vx = p.body.vy = 0;
      const hp0 = p.hp;
      world.projectiles.spawn(9000 + p.id, ProjKind.Rocket, shooter.id, 1004, 280, 0, 380);
      for (let k = 0; k < 20; k++) world.step();
      return hp0 - p.hp;
    };
    expect(blastNear(mate)).toBe(0);
    expect(mate.alive).toBe(true);
    expect(blastNear(enemy)).toBeGreaterThan(0);
    expect(blastNear(shooter)).toBeGreaterThan(0);
  });

  it('the last team standing wins, and every member of it scores the win', () => {
    const { world, ps } = tdmRoom(24, 4);
    const red = ps.filter((p) => p.team === Team.Red);
    const green = ps.filter((p) => p.team === Team.Green);
    kill(world, red[0], green[0]);
    world.step();
    expect(world.phase).toBe(Phase.Live); // red still has one clone
    kill(world, red[1], green[0]);
    world.step();
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).toBe(Team.Green);
    for (const p of green) expect(p.wins).toBe(1);
    for (const p of red) expect(p.wins).toBe(0);
  });

  it('when time runs out, the team with more clones left wins', () => {
    const { world, ps } = tdmRoom(25, 6);
    const red = ps.filter((p) => p.team === Team.Red);
    const green = ps.filter((p) => p.team === Team.Green);
    kill(world, green[0], red[0]);
    world.phaseTimer = 1;
    world.step();
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner).toBe(Team.Red);
  });

  it('bots only hunt the other team, and a room of bots fights it out', () => {
    const world = new World(26, { mode: 'ffa', bots: 16, rotation: [GameMode.Lts] });
    const me = world.addPlayer('watcher', { send() {} })!;
    until(world, () => world.phase === Phase.Live);
    until(world, () => me.alive, 600);
    kill(world, me, me);
    let teamTargets = 0;
    until(
      world,
      () => {
        for (const p of world.players) {
          const tgt = (p?.bot as unknown as { target: number } | null)?.target;
          if (p && typeof tgt === 'number' && tgt >= 0 && world.players[tgt]?.team === p.team) teamTargets++;
        }
        return world.phase === Phase.Victory;
      },
      30 * 60 * 3,
    );
    expect(teamTargets).toBe(0);
    expect(world.phase).toBe(Phase.Victory);
    expect(world.winner === Team.Red || world.winner === Team.Green).toBe(true);
    const winners = present(world).filter((p) => p.inWave && p.team === world.winner);
    expect(winners.some((p) => p.alive)).toBe(true);
    expect(present(world).filter((p) => p.inWave && p.alive && p.team !== world.winner).length).toBe(0);
  }, 90_000);

  it('clients learn the teams and dress clones in their team colours', () => {
    const frames: Uint8Array[] = [];
    const world = new World(27, { mode: 'ffa', rotation: [GameMode.Lts] });
    const a = world.addPlayer('a', { send: (d) => frames.push(d) })!;
    const b = world.addPlayer('b', { send() {} })!;
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
    expect(game.roundState?.mode).toBe(GameMode.Lts);
    expect(game.myTeam).toBe(a.team);
    expect(game.teamOf[b.id]).toBe(b.team);
    expect(game.players.get(a.id)?.rgb).toBe(TEAM_COLORS[a.team].rgb);
    expect(game.players.get(b.id)?.rgb).toBe(TEAM_COLORS[b.team].rgb);
    expect(game.roundState?.teamLeft).toEqual([1, 1, 0, 0]); // red, green (blue and gold are Extraction's)
  });
});
