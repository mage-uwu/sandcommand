import { type Body, copyBody, newBody, stepBody } from '../shared/actor.ts';
import type { Reader } from '../shared/codec.ts';
import { ACTOR_H, ACTOR_W, CHUNK, CHUNK_COUNT, CHUNK_SHIFT, CHUNKS_X, DT, TICK_RATE, WORLD_H, WORLD_W } from '../shared/constants.ts';
import { type FrameHandler, type KillInfo, type RemoteActor, type SelfState, applyFrameRecords } from '../shared/frame.ts';
import { Collider, DistanceField } from '../shared/field.ts';
import { Projectiles } from '../shared/kernels.ts';
import { ActorField, MAX_ACTORS, Particles, W_BURN, W_DEBRIS, releaseCarve, spillGold } from '../shared/particles.ts';
import { F_ALIVE, F_FIRING, F_GROUND, F_JET } from '../shared/protocol.ts';
import { Rng } from '../shared/rng.ts';
import { MAT_COLOR, Mat } from '../shared/materials.ts';
import { Terrain } from '../shared/terrain.ts';
import { BLAST_IMPULSE, PROJ, ProjKind, WEAPONS, WeaponId } from '../shared/weapons.ts';
import { bloodSplat, bulletImpact, digDust, explosion, gibBurst, jetExhaust, muzzle, rocketTrail } from './effects.ts';

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

function matRgb(m: number): number {
  const [r, g, b] = MAT_COLOR[m] ?? MAT_COLOR[1];
  return (r << 16) | (g << 8) | b;
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
  /**
   * One field-engine instance for everything that flies on this client:
   * mirrored terrain grains plus every spark, flame, smoke puff, blood drop
   * and gib. Same pass, same fields, same pixel buffer.
   */
  readonly particles = new Particles(40000);
  private readonly bodyField = new ActorField(ACTOR_W, ACTOR_H);
  /** Per-cell blood stain intensity (0-255). Cosmetic, never networked. */
  readonly stain = new Uint8Array(WORLD_W * WORLD_H);
  private readonly particleHooks = {
    stain: (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return;
      const c = y * WORLD_W + x;
      this.stain[c] = Math.min(255, this.stain[c] + 110);
      this.terrain.markRenderDirty(x, y);
    },
  };
  readonly field = new DistanceField(this.terrain);
  readonly collider = new Collider(this.terrain, this.field);
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
        const left = b.vx < 0;
        for (let k = 0; k < 3; k++) jetExhaust(this.particles, b.x + (left ? 7 : 0), b.y + ACTOR_H - 5, b.vx, b.vy);
      }
    }
    this.weapon = weapon;
    // Field first: chunk snapshots and ops applied since the last tick.
    this.field.update();
    this.projectiles.step(this.collider, DT, null, (i, x, y, _a, _d) => {
      if (this.projectiles.kind[i] === ProjKind.Bullet) bulletImpact(this.particles, x, y, this.dustColorAt(x, y));
    });
    const pr = this.projectiles;
    for (let i = 0; i < pr.n; i++) if (pr.kind[i] === ProjKind.Rocket) rocketTrail(this.particles, pr.x[i], pr.y[i]);
    // Remote jetpacks.
    for (const [, s] of this.snaps) {
      const last = s[s.length - 1];
      if (last && last.flags & F_JET && last.flags & F_ALIVE) {
        jetExhaust(this.particles, last.x + (last.vx < 0 ? 7 : 0), last.y + ACTOR_H - 5, last.vx, last.vy);
      }
    }
    // Bodies in the engine so shrapnel stops in them and grains bounce off
    // them on screen too; only the server's results (damage, knockback) count.
    const actors = this.bodyField;
    actors.clear();
    if (this.alive) actors.add(this.myId, this.body.x, this.body.y, this.body.vx, this.body.vy);
    for (const [id, s] of this.snaps) {
      const last = s[s.length - 1];
      if (last && last.flags & F_ALIVE && actors.n < MAX_ACTORS) actors.add(id, last.x, last.y, last.vx, last.vy);
    }
    this.particles.step(this.collider, DT, this.particleHooks, actors);
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
        digDust(this.particles, a.x + ACTOR_W / 2, a.y + 5, 0xa08060, 1);
      }
    }
    for (const id of this.snaps.keys()) if (!seen.has(id)) this.snaps.delete(id);
  }

  blips(list: { id: number; x: number; y: number }[]): void {
    this.radar = list;
  }

  carved(x: number, y: number, r: number, seed: number, debris: number, removed: number[], detached: number[]): void {
    // Same op, same chunk state, same seed as the server: identical shower and collapse.
    releaseCarve(this.particles, removed, detached, x, y, debris, new Rng(seed));
    // Blasted cells take their blood stains with them.
    for (let i = 0; i < removed.length; i += 3) this.stain[removed[i + 1] * WORLD_W + removed[i]] = 0;
    if (r <= 6 && removed.length) {
      // Digger / bullet chips: a puff of whatever was dug.
      digDust(this.particles, x, y, matRgb(removed[2]), Math.min(6, removed.length / 3));
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
    muzzle(this.particles, x + (vx / sp) * 2, y + (vy / sp) * 2, vx / sp, vy / sp, kind === ProjKind.Rocket);
  }

  projEnd(id: number, x: number, y: number, kind: number, detonate: boolean, seed: number): void {
    const i = this.projectiles.indexOf(id);
    if (i >= 0) this.projectiles.removeAt(i);
    if (!detonate) return;
    if (kind === ProjKind.Bullet) {
      bulletImpact(this.particles, x, y, this.dustColorAt(x, y));
      return;
    }
    const def = PROJ[kind];
    this.flashes.push({ x, y, r: def.splashR, at: performance.now() });
    // Fireball, sparks, smoke, and a blast wave in the air field that moves
    // everything loose already in flight (grains, gibs, smoke, blood).
    explosion(this.particles, x, y, kind, def.splashR, BLAST_IMPULSE, seed);
    const me = this.body;
    const d = Math.hypot(me.x - x, me.y - y);
    this.shake = Math.max(this.shake, Math.max(0, 1 - d / 400) * 8);
  }

  kill(k: KillInfo): void {
    const { killer, victim, weapon } = k;
    const kn = this.players.get(killer)?.name ?? '???';
    const vn = this.players.get(victim)?.name ?? '???';
    const how = weapon === W_DEBRIS ? 'Debris' : weapon === W_BURN ? 'Fire' : weapon === 255 ? 'fell' : (WEAPONS[weapon]?.name ?? '');
    let text: string;
    if (weapon === 255) text = `${vn} cratered`;
    else if (killer === victim) text = weapon === W_DEBRIS ? `${vn} was buried` : weapon === W_BURN ? `${vn} burned` : `${vn} self-destructed`;
    else text = `${kn} [${how}] ${vn}`;
    const color = victim === this.myId ? '#ff6060' : killer === this.myId ? '#80ff80' : '#e0e0e0';
    this.feed.push({ text, color, at: performance.now() });
    if (this.feed.length > 6) this.feed.shift();

    // Gib it. Skip the work for deaths far off-screen.
    const camDx = k.x - this.body.x;
    const camDy = k.y - this.body.y;
    if (victim !== this.myId && camDx * camDx + camDy * camDy > 1400 * 1400) return;
    const explosive = weapon === WeaponId.Bazooka || weapon === WeaponId.Grenade;
    const violence = k.overkill / 40 + (explosive ? 1.5 : 0) + (weapon === 255 ? 0.5 : 0);
    gibBurst(this.particles, k.x, k.y, k.vx, k.vy, this.players.get(victim)?.rgb ?? 0xcccccc, violence);
    // Same seed as the server, so the gold shower matches what will settle.
    spillGold(this.particles, k.x, k.y, k.vx, k.vy, k.gold, new Rng(k.seed));
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
    bloodSplat(this.particles, x, y, Math.min(24, 3 + amount / 3), 60 + amount * 1.5);
    if (victim === this.myId) this.hurtFlash = Math.min(1, this.hurtFlash + amount / 60);
  }

  chat(id: number, text: string): void {
    const p = this.players.get(id);
    this.chatLog.push({ text: `${p?.name ?? '?'}: ${text}`, color: p?.color ?? '#ccc', at: performance.now() });
    if (this.chatLog.length > 8) this.chatLog.shift();
  }

  /** Colour of the terrain around a point (for dust puffs). */
  private dustColorAt(x: number, y: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const m = this.terrain.get(cx + dx, cy + dy);
        if (m !== Mat.Air) return matRgb(m);
      }
    return 0x9a8060;
  }

  /** Live particles of one kind (HUD). */
  countKind(kind: number): number {
    return this.particles.count(kind);
  }

  colorOf(id: number): string {
    return this.players.get(id)?.color ?? '#ccc';
  }
}
