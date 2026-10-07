import { type Body, copyBody, newBody, stepBody } from '../shared/actor.ts';
import type { Reader } from '../shared/codec.ts';
import { ACTOR_H, ACTOR_W, CHUNK, CHUNK_COUNT, CHUNK_SHIFT, CHUNKS_X, DT, TICK_RATE, WORLD_H, WORLD_W } from '../shared/constants.ts';
import { type FrameHandler, type KillInfo, type RemoteActor, type SelfState, applyFrameRecords } from '../shared/frame.ts';
import { DebrisField, Projectiles, spillGold, throwDebris } from '../shared/kernels.ts';
import { F_ALIVE, F_FIRING, F_GROUND, F_JET } from '../shared/protocol.ts';
import { Rng } from '../shared/rng.ts';
import { Terrain } from '../shared/terrain.ts';
import { PROJ, ProjKind, WEAPONS, WeaponId } from '../shared/weapons.ts';
import { Fx } from './fx.ts';
import { Blood, Gibs } from './gibs.ts';

const TICK_MS = 1000 / TICK_RATE;
/** Remote actors are rendered this many ticks in the past for smooth interpolation. */
const INTERP_TICKS = 3;

export interface PlayerInfo {
  id: number;
  name: string;
  kills: number;
  deaths: number;
  gold: number;
  color: string;
  rgb: number;
}

interface Snap {
  tick: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aim: number;
  flags: number;
  hp: number;
  weapon: number;
}

export interface RemoteView {
  id: number;
  x: number;
  y: number;
  aim: number;
  flags: number;
  hp: number;
  weapon: number;
  moving: boolean;
}

export interface FeedItem {
  text: string;
  color: string;
  at: number;
}

export interface Flash {
  x: number;
  y: number;
  r: number;
  at: number;
}

function seqNewer(a: number, b: number): boolean {
  const d = (a - b) & 0xffff;
  return d !== 0 && d < 0x8000;
}

function playerColor(id: number): { css: string; rgb: number } {
  const hue = (id * 137.508) % 360;
  const s = 0.65;
  const l = 0.55;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return { css: `rgb(${r},${g},${b})`, rgb: (r << 16) | (g << 8) | b };
}

export class Game implements FrameHandler {
  readonly terrain = new Terrain();
  readonly loaded = new Uint8Array(CHUNK_COUNT);
  /**
   * Highest solid cell ever seen per column: everything below it is
   * "underground" and gets the cave backdrop once dug out.
   */
  readonly skyline = new Int16Array(WORLD_W).fill(WORLD_H);
  readonly projectiles = new Projectiles(2048);
  readonly debris = new DebrisField(8192);
  readonly fx = new Fx(6000);
  readonly gibs = new Gibs(1500);
  readonly blood = new Blood(4000);
  readonly players = new Map<number, PlayerInfo>();
  readonly feed: FeedItem[] = [];
  readonly chatLog: FeedItem[] = [];
  readonly flashes: Flash[] = [];
  radar: { id: number; x: number; y: number }[] = [];

  myId = -1;
  room = '';

  // Own clone: predicted body plus the previous tick's body for render interpolation.
  readonly body: Body = newBody(0, 0);
  readonly prevBody: Body = newBody(0, 0);
  alive = false;
  hp = 0;
  respawnTicks = 0;
  weapon = 0;
  cooldown = 0;
  smoothX = 0;
  smoothY = 0;
  /** Prediction errors larger than 0.01 cells seen during reconciliation. */
  corrections = 0;
  private pending: { seq: number; buttons: number }[] = [];
  private seq = 0;
  private lastSelf: SelfState | null = null;
  private ack = 0;

  // Remote actors.
  private snaps = new Map<number, Snap[]>();
  private clockOffset = NaN; // serverTick - now/TICK_MS
  lastServerTick = 0;
  /** Tick of the frame currently being applied. */
  private frameTick = 0;
  shake = 0;
  hurtFlash = 0;

  // ------------------------------------------------------------ local tick

  /** One fixed 30 Hz client tick: predict own clone, advance local kernels. */
  localTick(buttons: number, aimQ: number, weapon: number, send: (seq: number) => void): void {
    this.seq = (this.seq + 1) & 0xffff;
    send(this.seq);
    copyBody(this.prevBody, this.body);
    // Record every command, even while dead: the server may already have
    // respawned us and will apply it.
    this.pending.push({ seq: this.seq, buttons });
    if (this.pending.length > 90) this.pending.shift();
    if (this.alive) {
      stepBody(this.body, buttons, this.terrain, DT);
      if (this.body.jetting) {
        const b = this.body;
        for (let k = 0; k < 2; k++) {
          this.fx.spawn(
            b.x + ACTOR_W / 2 + (Math.random() - 0.5) * 3,
            b.y + ACTOR_H - 2,
            (Math.random() - 0.5) * 30,
            90 + Math.random() * 60,
            0.25,
            Math.random() < 0.5 ? 0xffc040 : 0xff6020,
            0,
          );
        }
      }
    }
    this.weapon = weapon;
    this.projectiles.step(this.terrain, DT, null, (i, x, y, _a, _d) => {
      if (this.projectiles.kind[i] === ProjKind.Bullet) this.fx.burst(x, y, 3, 60, 0.2, 0xffe080, 0.5);
    });
    this.debris.step(this.terrain, DT);
    this.fx.step(this.terrain, DT);
    this.gibs.step(this.terrain, DT, this.blood);
    this.blood.step(this.terrain, DT);
    // Ambient effects for remote jetpacks.
    for (const [, s] of this.snaps) {
      const last = s[s.length - 1];
      if (last && last.flags & F_JET && last.flags & F_ALIVE) {
        this.fx.spawn(last.x + ACTOR_W / 2, last.y + ACTOR_H - 2, (Math.random() - 0.5) * 30, 100, 0.2, 0xffa030, 0);
      }
    }
    this.shake *= 0.85;
    this.hurtFlash *= 0.9;
  }

  // ------------------------------------------------------------ network

  applyFrame(tick: number, ack: number, r: Reader): void {
    this.ack = ack;
    this.frameTick = tick;
    this.lastSelf = null;
    applyFrameRecords(r, this.terrain, this);
    this.lastServerTick = tick;
    const est = tick - performance.now() / TICK_MS;
    if (Number.isNaN(this.clockOffset) || Math.abs(est - this.clockOffset) > 10) this.clockOffset = est;
    else this.clockOffset = this.clockOffset * 0.95 + est * 0.05;
    // Reconcile after the whole frame so replay sees this tick's terrain.
    if (this.lastSelf) this.reconcile(this.lastSelf);
  }

  private reconcile(s: SelfState): void {
    const wasAlive = this.alive;
    this.alive = (s.flags & F_ALIVE) !== 0;
    this.hp = s.hp;
    this.respawnTicks = s.respawn;
    this.cooldown = s.cooldown;
    const b = this.body;
    const ack = this.ack;
    this.pending = this.pending.filter((p) => seqNewer(p.seq, ack));
    const rawX = b.x;
    const rawY = b.y;
    const oldX = b.x + this.smoothX;
    const oldY = b.y + this.smoothY;
    b.x = s.x;
    b.y = s.y;
    b.vx = s.vx;
    b.vy = s.vy;
    b.fuel = s.fuel;
    b.onGround = (s.flags & F_GROUND) !== 0;
    b.jetting = (s.flags & F_JET) !== 0;
    if (!this.alive) {
      copyBody(this.prevBody, b);
      this.smoothX = this.smoothY = 0;
      return;
    }
    for (const p of this.pending) stepBody(b, p.buttons, this.terrain, DT);
    // Hide small corrections by easing the visual offset back to zero.
    const ex = oldX - b.x;
    const ey = oldY - b.y;
    if (wasAlive && Math.abs(rawX - b.x) + Math.abs(rawY - b.y) > 0.01) this.corrections++;
    if (wasAlive && ex * ex + ey * ey < 48 * 48) {
      this.smoothX = ex;
      this.smoothY = ey;
    } else {
      this.smoothX = this.smoothY = 0;
      copyBody(this.prevBody, b);
    }
  }

  /** Fractional server tick we render remote actors at. */
  renderTick(): number {
    return performance.now() / TICK_MS + this.clockOffset - INTERP_TICKS;
  }

  remoteViews(): RemoteView[] {
    const rt = this.renderTick();
    const out: RemoteView[] = [];
    for (const [id, s] of this.snaps) {
      if (s.length === 0) continue;
      let a = s[0];
      let b = s[0];
      for (let i = s.length - 1; i >= 0; i--) {
        if (s[i].tick <= rt) {
          a = s[i];
          b = s[Math.min(i + 1, s.length - 1)];
          break;
        }
      }
      let x: number;
      let y: number;
      if (a === b) {
        // Extrapolate briefly past the newest snapshot.
        const dt = Math.max(-INTERP_TICKS, Math.min(3, rt - a.tick)) / TICK_RATE;
        x = a.x + a.vx * Math.max(0, dt);
        y = a.y + a.vy * Math.max(0, dt);
      } else {
        const t = (rt - a.tick) / (b.tick - a.tick);
        x = a.x + (b.x - a.x) * t;
        y = a.y + (b.y - a.y) * t;
      }
      // Teleports (respawn) should not interpolate across the map.
      if (Math.abs(b.x - a.x) > 64 || Math.abs(b.y - a.y) > 64) {
        x = b.x;
        y = b.y;
      }
      out.push({ id, x, y, aim: b.aim, flags: b.flags, hp: b.hp, weapon: b.weapon, moving: Math.abs(b.vx) > 5 });
    }
    return out;
  }

  // ------------------------------------------------------------ FrameHandler

  self(s: SelfState): void {
    this.lastSelf = s;
  }

  actors(list: RemoteActor[]): void {
    const seen = new Set<number>();
    for (const a of list) {
      seen.add(a.id);
      let s = this.snaps.get(a.id);
      if (!s) this.snaps.set(a.id, (s = []));
      s.push({ tick: this.frameTick, x: a.x, y: a.y, vx: a.vx, vy: a.vy, aim: a.aim, flags: a.flags, hp: a.hp, weapon: a.weapon });
      if (s.length > 12) s.shift();
      if (a.flags & F_FIRING && a.weapon === WeaponId.Digger) {
        this.fx.burst(a.x + ACTOR_W / 2, a.y + 5, 1, 40, 0.3, 0xa08060, 0.3);
      }
    }
    for (const id of this.snaps.keys()) if (!seen.has(id)) this.snaps.delete(id);
  }

  blips(list: { id: number; x: number; y: number }[]): void {
    this.radar = list;
  }

  carved(x: number, y: number, r: number, seed: number, debris: number, removed: number[]): void {
    throwDebris(this.debris, removed, x, y, debris, new Rng(seed));
    // Blasted cells take their blood stains with them.
    for (let i = 0; i < removed.length; i += 3) this.blood.stain[removed[i + 1] * WORLD_W + removed[i]] = 0;
    if (r <= 6) {
      // Digger / bullet chips: a little dust.
      for (let k = 0; k < Math.min(6, removed.length / 3); k++) {
        this.fx.spawn(x, y, (Math.random() - 0.5) * 60, -Math.random() * 40, 0.4, 0x9a8060, 0.2);
      }
    }
  }

  chunkLoaded(ci: number): void {
    this.loaded[ci] = 1;
    const ox = (ci % CHUNKS_X) << CHUNK_SHIFT;
    const oy = Math.floor(ci / CHUNKS_X) << CHUNK_SHIFT;
    for (let x = ox; x < ox + CHUNK; x++) {
      if (this.skyline[x] <= oy) continue;
      const y = this.terrain.surfaceY(x, oy);
      if (y < oy + CHUNK && y < this.skyline[x]) this.skyline[x] = y;
    }
  }

  projSpawn(id: number, kind: number, owner: number, x: number, y: number, vx: number, vy: number): void {
    if (this.projectiles.indexOf(id) >= 0) return;
    this.projectiles.spawn(id, kind, owner, x, y, vx, vy);
    const sp = Math.hypot(vx, vy) || 1;
    this.fx.burst(x + (vx / sp) * 2, y + (vy / sp) * 2, kind === ProjKind.Rocket ? 6 : 3, 50, 0.12, 0xfff0a0, 0, 1);
  }

  projEnd(id: number, x: number, y: number, kind: number, detonate: boolean): void {
    const i = this.projectiles.indexOf(id);
    if (i >= 0) this.projectiles.removeAt(i);
    if (!detonate) return;
    if (kind === ProjKind.Bullet) {
      this.fx.burst(x, y, 4, 70, 0.25, 0xffd070, 0.6);
      return;
    }
    const def = PROJ[kind];
    this.flashes.push({ x, y, r: def.splashR, at: performance.now() });
    this.fx.burst(x, y, 40, 260, 0.5, 0xffb030, 0.3, 1);
    this.fx.burst(x, y, 20, 120, 0.4, 0xfff2b0, 0.1, 2);
    this.fx.burst(x, y, 30, 50, 1.4, 0x504840, -0.05, 2);
    const me = this.body;
    const d = Math.hypot(me.x - x, me.y - y);
    this.shake = Math.max(this.shake, Math.max(0, 1 - d / 400) * 8);
  }

  kill(k: KillInfo): void {
    const { killer, victim, weapon } = k;
    const kn = this.players.get(killer)?.name ?? '???';
    const vn = this.players.get(victim)?.name ?? '???';
    const how = weapon === 255 ? 'fell' : WEAPONS[weapon]?.name ?? '';
    const text = killer === victim || weapon === 255 ? `${vn} ${weapon === 255 ? 'cratered' : 'self-destructed'}` : `${kn} [${how}] ${vn}`;
    const color = victim === this.myId ? '#ff6060' : killer === this.myId ? '#80ff80' : '#e0e0e0';
    this.feed.push({ text, color, at: performance.now() });
    if (this.feed.length > 6) this.feed.shift();

    // Gib it. Skip the work for deaths far off-screen.
    const camDx = k.x - this.body.x;
    const camDy = k.y - this.body.y;
    if (victim !== this.myId && camDx * camDx + camDy * camDy > 1400 * 1400) return;
    const explosive = weapon === WeaponId.Bazooka || weapon === WeaponId.Grenade;
    const violence = k.overkill / 40 + (explosive ? 1.5 : 0) + (weapon === 255 ? 0.5 : 0);
    this.gibs.burst(k.x, k.y, k.vx, k.vy, this.players.get(victim)?.rgb ?? 0xcccccc, violence, this.blood);
    // Same seed as the server, so the gold shower matches what will settle.
    spillGold(this.debris, k.x, k.y, k.vx, k.vy, k.gold, new Rng(k.seed));
    this.snaps.delete(victim);
  }

  roster(id: number, present: boolean, name: string): void {
    if (!present) {
      this.players.delete(id);
      this.snaps.delete(id);
      return;
    }
    const c = playerColor(id);
    this.players.set(id, { id, name, kills: 0, deaths: 0, gold: 0, color: c.css, rgb: c.rgb });
  }

  scores(list: { id: number; kills: number; deaths: number; gold: number }[]): void {
    for (const s of list) {
      const p = this.players.get(s.id);
      if (p) {
        p.kills = s.kills;
        p.deaths = s.deaths;
        p.gold = s.gold;
      }
    }
  }

  hit(victim: number, x: number, y: number, amount: number): void {
    this.blood.splat(x, y, Math.min(24, 3 + amount / 3), 60 + amount * 1.5);
    if (victim === this.myId) this.hurtFlash = Math.min(1, this.hurtFlash + amount / 60);
  }

  chat(id: number, text: string): void {
    const p = this.players.get(id);
    this.chatLog.push({ text: `${p?.name ?? '?'}: ${text}`, color: p?.color ?? '#ccc', at: performance.now() });
    if (this.chatLog.length > 8) this.chatLog.shift();
  }

  colorOf(id: number): string {
    return this.players.get(id)?.color ?? '#ccc';
  }
}
