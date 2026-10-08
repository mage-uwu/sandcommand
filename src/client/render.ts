import { ACTOR_H, ACTOR_W, ACTOR_MAX_FUEL, ACTOR_MAX_HP, CHUNK, CHUNK_COUNT, CHUNK_SHIFT, CHUNKS_X, CHUNKS_Y, VIEW_HALF_H, VIEW_HALF_W, WORLD_H, WORLD_W, TICK_RATE } from '../shared/constants.ts';
import { MAT_COLOR, Mat } from '../shared/materials.ts';
import { F_ALIVE, F_CLASS_SHIFT, F_FIRING, F_GROUND, F_JET, F_RELOAD, classOfFlags, dequantizeAim } from '../shared/protocol.ts';
import { hash2 } from '../shared/rng.ts';
import { PROJ_BUILD, SHOULDER_X, SHOULDER_Y, WEAPONS, WeaponId } from '../shared/weapons.ts';
import { BUILD_GRID, BUILD_REACH, BUILD_RESULT_TEXT, BuildResult, PIECES, snapPiece } from '../shared/build.ts';
import type { CraftView, Game, RemoteView } from './game.ts';
import type { InputState } from './input.ts';
import type { Net } from './net.ts';
import { CLASSES, PARTS, Part, has } from '../shared/body.ts';
import { CRAFT_H, CRAFT_HP, CraftPart } from '../shared/craft.ts';
import { ParticleLayer } from './particle-layer.ts';
import { type BodyFrame, SpriteCache, WALK_CYCLE } from './sprites.ts';

const MINI_SCALE = 8;

/** Precomputed RGBA (little-endian u32) palette: 4 shade variants per material, plus a lit variant. */
const PALETTE = new Uint32Array(MAT_COLOR.length * 8);
for (let m = 0; m < MAT_COLOR.length; m++) {
  const [r, g, b] = MAT_COLOR[m];
  for (let v = 0; v < 8; v++) {
    const lit = v >= 4;
    const k = (0.84 + (v & 3) * 0.07) * (lit ? 1.25 : 1);
    const cr = Math.min(255, Math.round(r * k));
    const cg = Math.min(255, Math.round(g * k));
    const cb = Math.min(255, Math.round(b * k));
    PALETTE[m * 8 + v] = (255 << 24) | (cb << 16) | (cg << 8) | cr;
  }
}

/** Blend an ABGR terrain pixel toward dried-blood red by stain intensity. */
function bloodied(c: number, stain: number): number {
  const k = Math.min(0.8, stain / 300);
  const r = c & 255;
  const g = (c >> 8) & 255;
  const b = (c >> 16) & 255;
  const nr = Math.round(r + (110 - r) * k);
  const ng = Math.round(g + (12 - g) * k);
  const nb = Math.round(b + (14 - b) * k);
  return (255 << 24) | (nb << 16) | (ng << 8) | nr;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  private chunkCanvas: (HTMLCanvasElement | null)[] = new Array(CHUNK_COUNT).fill(null);
  private chunkImage = new ImageData(CHUNK, CHUNK);
  private chunkPixels = new Uint32Array(this.chunkImage.data.buffer);
  private mini: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  private miniImage: ImageData;
  private miniPixels: Uint32Array;
  readonly sprites = new SpriteCache();
  /** Aiming down the scope this frame (camera pushed out, overlay drawn). */
  private scoped = false;
  private readonly particleLayer = new ParticleLayer();
  zoom = 3;
  camX = WORLD_W / 2;
  camY = WORLD_H / 3;
  private fps = 60;
  private lastFrame = performance.now();
  rasterizedThisFrame = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.mini = document.createElement('canvas');
    this.mini.width = WORLD_W / MINI_SCALE;
    this.mini.height = WORLD_H / MINI_SCALE;
    this.miniCtx = this.mini.getContext('2d')!;
    this.miniImage = this.miniCtx.createImageData(this.mini.width, this.mini.height);
    this.miniPixels = new Uint32Array(this.miniImage.data.buffer);
    this.miniPixels.fill(0xff1a1412);
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(innerWidth * dpr);
    const h = Math.floor(innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    // Integer zoom that never shows more than the server's interest rectangle.
    // Prefer ~480 world cells across, never less zoom than the interest limit.
    const minZoom = Math.ceil(Math.max(w / (2 * VIEW_HALF_W), h / (2 * VIEW_HALF_H)));
    this.zoom = Math.max(1, minZoom, Math.round(w / 480));
  }

  /** Re-rasterize chunks whose terrain changed since last frame. */
  private updateChunks(game: Game): void {
    const t = game.terrain;
    this.rasterizedThisFrame = 0;
    for (let ci = 0; ci < CHUNK_COUNT; ci++) {
      if (!t.dirty[ci] || !game.loaded[ci]) continue;
      t.dirty[ci] = 0;
      this.rasterize(game, ci);
      this.rasterizedThisFrame++;
    }
  }

  private rasterize(game: Game, ci: number): void {
    const t = game.terrain;
    const ox = (ci % CHUNKS_X) << CHUNK_SHIFT;
    const oy = Math.floor(ci / CHUNKS_X) << CHUNK_SHIFT;
    const px = this.chunkPixels;
    const stain = game.stain;
    for (let y = 0; y < CHUNK; y++) {
      const wy = oy + y;
      const row = wy * WORLD_W + ox;
      for (let x = 0; x < CHUNK; x++) {
        const m = t.mat[row + x];
        if (m === Mat.Air) {
          px[y * CHUNK + x] = 0;
          continue;
        }
        const wx = ox + x;
        const exposed = wy > 0 && t.mat[row + x - WORLD_W] === Mat.Air;
        let v = (hash2(wx, wy) & 3) + (exposed ? 4 : 0);
        // Materialized concrete shows its blocks: dark mortar seams on the build grid.
        if (m === Mat.Concrete && ((wx & 7) === 0 || (wy & 3) === 0)) v = 0;
        else if (m === Mat.Concrete) v = 2 + (v & 1) + (exposed ? 4 : 0);
        let c = PALETTE[m * 8 + v];
        const st = stain[row + x];
        if (st) c = bloodied(c, st);
        px[y * CHUNK + x] = c;
      }
    }
    let c = this.chunkCanvas[ci];
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = CHUNK;
      this.chunkCanvas[ci] = c;
    }
    c.getContext('2d')!.putImageData(this.chunkImage, 0, 0);

    // Minimap: one pixel per 8x8 block, colored by the block's dominant material.
    const mx0 = ox / MINI_SCALE;
    const my0 = oy / MINI_SCALE;
    const mw = WORLD_W / MINI_SCALE;
    for (let by = 0; by < CHUNK / MINI_SCALE; by++) {
      for (let bx = 0; bx < CHUNK / MINI_SCALE; bx++) {
        const x0 = ox + bx * MINI_SCALE;
        const y0 = oy + by * MINI_SCALE;
        const n = t.countSolid(x0, y0, x0 + MINI_SCALE - 1, y0 + MINI_SCALE - 1);
        const m = t.mat[(y0 + 4) * WORLD_W + x0 + 4];
        const color = n > 32 ? PALETTE[(m === Mat.Air ? Mat.Dirt : m) * 8 + 1] : 0xff2a201a;
        this.miniPixels[(my0 + by) * mw + mx0 + bx] = color;
      }
    }
    this.miniDirty = true;
  }
  private miniDirty = false;

  draw(game: Game, input: InputState, net: Net, alpha: number): void {
    const now = performance.now();
    this.fps = this.fps * 0.95 + (1000 / Math.max(1, now - this.lastFrame)) * 0.05;
    this.lastFrame = now;
    this.updateChunks(game);
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const z = this.zoom;

    // Camera follows the interpolated, smoothed own body.
    const b = game.body;
    const pb = game.prevBody;
    game.smoothX *= 0.85;
    game.smoothY *= 0.85;
    const selfX = pb.x + (b.x - pb.x) * alpha + game.smoothX;
    const selfY = pb.y + (b.y - pb.y) * alpha + game.smoothY;
    this.scoped = game.alive && input.scoping;
    if (this.scoped) {
      // Scoping: push the view out along the barrel by the weapon's scope
      // distance (the server moves this client's interest area the same way).
      const mx = this.camX + (input.mouseX * (W / innerWidth) - W / 2) / z;
      const my = this.camY + (input.mouseY * (H / innerHeight) - H / 2) / z;
      const aim = Math.atan2(my - (selfY + SHOULDER_Y), mx - (selfX + SHOULDER_X));
      const reach = WEAPONS[game.weapon]?.scope ?? 0;
      this.camX += (selfX + SHOULDER_X + Math.cos(aim) * reach - this.camX) * 0.12;
      this.camY += (selfY + SHOULDER_Y + Math.sin(aim) * reach - this.camY) * 0.12;
    } else if (game.alive) {
      // Look ahead toward the mouse a little, like CC's aim-follow camera.
      const lookX = (input.mouseX * (W / innerWidth) - W / 2) / z;
      const lookY = (input.mouseY * (H / innerHeight) - H / 2) / z;
      // Building holds the view on the clone so the ghost stays under the cursor.
      const look = game.building ? 0 : 0.25;
      const tx = selfX + ACTOR_W / 2 + lookX * look;
      const ty = selfY + ACTOR_H / 2 + lookY * look;
      this.camX += (tx - this.camX) * 0.25;
      this.camY += (ty - this.camY) * 0.25;
    } else {
      // Riding in: follow our own drop rocket down, leading toward the ground.
      game.rideSmoothX *= 0.85;
      game.rideSmoothY *= 0.85;
      game.rideSmoothA *= 0.85;
      const mine = game.myCraft(alpha);
      if (mine) {
        // Lead along the flight path so you can see where you'll land.
        this.camX += (mine.x + mine.vx * 0.3 - this.camX) * 0.2;
        this.camY += (mine.y + 30 + mine.vy * 0.3 - this.camY) * 0.2;
      }
    }
    const halfW = W / z / 2;
    const halfH = H / z / 2;
    this.camX = Math.max(halfW, Math.min(WORLD_W - halfW, this.camX));
    this.camY = Math.max(halfH - 200, Math.min(WORLD_H - halfH, this.camY));
    const shake = game.shake;
    const camX = this.camX + (Math.random() - 0.5) * shake;
    const camY = this.camY + (Math.random() - 0.5) * shake;
    // World -> device pixel transform, snapped so chunk seams never shimmer.
    const offX = Math.round(W / 2 - camX * z);
    const offY = Math.round(H / 2 - camY * z);

    // Background: sky fading into deep cave dark by world depth.
    const g = ctx.createLinearGradient(0, offY + -300 * z, 0, offY + 500 * z);
    g.addColorStop(0, '#1d2a48');
    g.addColorStop(0.45, '#6d7fa8');
    g.addColorStop(0.8, '#d8ab7c');
    g.addColorStop(1, '#e6b98a');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    this.drawParallax(ctx, W, H, offX, offY, z);

    ctx.setTransform(z, 0, 0, z, offX, offY);
    ctx.imageSmoothingEnabled = false;

    // Cave backdrop: below each column's skyline, dug-out space shows dark rock.
    const bx0 = Math.max(0, Math.floor(camX - halfW));
    const bx1 = Math.min(WORLD_W - 1, Math.ceil(camX + halfW));
    const bottom = Math.min(WORLD_H, camY + halfH + 1);
    ctx.fillStyle = '#2a201b';
    let runStart = bx0;
    for (let x = bx0 + 1; x <= bx1 + 1; x++) {
      if (x > bx1 || game.skyline[x] !== game.skyline[runStart]) {
        const top = game.skyline[runStart] + 3;
        if (top < bottom) ctx.fillRect(runStart, top, x - runStart, bottom - top);
        runStart = x;
      }
    }

    // Terrain chunks in view.
    const vx0 = Math.max(0, Math.floor((camX - halfW) / CHUNK));
    const vx1 = Math.min(CHUNKS_X - 1, Math.floor((camX + halfW) / CHUNK));
    const vy0 = Math.max(0, Math.floor((camY - halfH) / CHUNK));
    const vy1 = Math.min(CHUNKS_Y - 1, Math.floor((camY + halfH) / CHUNK));
    for (let cy = vy0; cy <= vy1; cy++) {
      for (let cx = vx0; cx <= vx1; cx++) {
        const ci = cy * CHUNKS_X + cx;
        const c = this.chunkCanvas[ci];
        if (c && game.loaded[ci]) ctx.drawImage(c, cx * CHUNK, cy * CHUNK);
        else {
          ctx.fillStyle = 'rgba(10,8,8,0.85)';
          ctx.fillRect(cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
        }
      }
    }

    // Drop rockets.
    for (const c of game.craftViews()) this.drawCraft(ctx, c, game, now);
    const ride = game.myCraft(alpha);
    if (ride && game.ride) this.drawCraft(ctx, ride, game, now);

    // Remote clones.
    const views = game.remoteViews();
    for (const v of views) {
      if (!(v.flags & F_ALIVE)) continue;
      const info = game.players.get(v.id);
      this.drawActor(ctx, v.x, v.y, dequantizeAim(v.aim), v.flags, info?.rgb ?? 0xcccccc, v.weapon, v.moving, now, v.parts);
    }
    // Own clone.
    if (game.alive) {
      const wx = (input.mouseX * (W / innerWidth) - offX) / z;
      const wy = (input.mouseY * (H / innerHeight) - offY) / z;
      const myAim = Math.atan2(wy - (selfY + SHOULDER_Y), wx - (selfX + SHOULDER_X));
      const reloading = game.reloadLeft > 0;
      const dry = (WEAPONS[game.weapon]?.clip ?? 0) > 0 && game.ammo === 0;
      const flags =
        F_ALIVE |
        (b.onGround ? F_GROUND : 0) |
        (b.jetting ? F_JET : 0) |
        (input.mouseDown && !reloading && !dry ? F_FIRING : 0) |
        (reloading ? F_RELOAD : 0) |
        (b.cls << F_CLASS_SHIFT);
      this.drawActor(ctx, selfX, selfY, myAim, flags, game.players.get(game.myId)?.rgb ?? 0xffffff, game.weapon, Math.abs(b.vx) > 5, now, game.parts);
    }

    // Every particle the field engine owns (grains, sparks, flames, smoke,
    // dust, blood, gibs): one pixel buffer covering the view, one upload.
    const lx = Math.floor(camX - halfW) - 1;
    const ly = Math.floor(camY - halfH) - 1;
    this.particleLayer.render(game.particles, this.sprites, alpha, lx, ly, Math.ceil(halfW * 2) + 3, Math.ceil(halfH * 2) + 3);
    ctx.drawImage(this.particleLayer.canvas, lx, ly);

    // Weapons lying on the ground (spinning while they fly), and a prompt
    // over the one we'd pick up.
    for (const [, it] of game.groundItems) {
      const ang = it.rest ? (it.left ? Math.PI : 0) : (now / 90) % (Math.PI * 2);
      const g = this.sprites.gun(it.weapon, ang);
      ctx.drawImage(g.c, Math.round(it.x) - g.r, Math.round(it.y) - 1 - g.r);
    }
    const near = game.nearestItem();
    if (near && WEAPONS[near.weapon]) {
      const d = WEAPONS[near.weapon];
      ctx.font = `${Math.max(4, Math.round(11 / z))}px ui-monospace, monospace`;
      const label = `[3] ${d.name}${d.clip > 0 ? ` ${near.ammo}/${d.clip}` : ''}`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(near.x - tw / 2 - 1, near.y - 13, tw + 2, 6);
      ctx.fillStyle = '#ffd34a';
      ctx.textAlign = 'center';
      ctx.fillText(label, near.x, near.y - 8);
      ctx.textAlign = 'left';
    }

    // Materializer beams (anyone's), fading out.
    for (const bm of game.beams) {
      const t = (now - bm.at) / 300;
      if (t >= 1) continue;
      ctx.strokeStyle = `rgba(140,232,255,${0.8 * (1 - t)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bm.x0, bm.y0);
      ctx.lineTo(bm.x1, bm.y1);
      ctx.stroke();
    }
    if (game.building) {
      const wx = (input.mouseX * (W / innerWidth) - offX) / z;
      const wy = (input.mouseY * (H / innerHeight) - offY) / z;
      this.drawBuildGhost(ctx, game, input, wx, wy, selfX, selfY, z);
    }

    // Projectiles.
    const p = game.projectiles;
    for (let i = 0; i < p.n; i++) {
      const k = p.kind[i];
      const x = p.x[i];
      const y = p.y[i];
      if (k === 0) {
        ctx.strokeStyle = '#fff3b0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - p.vx[i] * 0.012, y - p.vy[i] * 0.012);
        ctx.stroke();
      } else if (k === 1) {
        ctx.fillStyle = '#d8d8d8';
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      } else {
        ctx.fillStyle = '#4a5a32';
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        ctx.fillStyle = (now / 120) % 2 < 1 ? '#ff4040' : '#401010';
        ctx.fillRect(x - 0.5, y - 2.5, 1, 1);
      }
    }

    // Explosion flashes.
    for (let i = game.flashes.length - 1; i >= 0; i--) {
      const fl = game.flashes[i];
      const t = (now - fl.at) / 250;
      if (t >= 1) {
        game.flashes.splice(i, 1);
        continue;
      }
      ctx.fillStyle = `rgba(255,220,140,${0.6 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, fl.r * (0.5 + t * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }

    // Name tags (screen space for crisp text).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = W / innerWidth;
    ctx.font = `${Math.round(11 * dpr)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    for (const v of views) {
      if (!(v.flags & F_ALIVE)) continue;
      const info = game.players.get(v.id);
      const sx = offX + (v.x + ACTOR_W / 2) * z;
      const sy = offY + v.y * z - 8 * dpr;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(info?.name ?? '?', sx + dpr, sy + dpr);
      ctx.fillStyle = info?.color ?? '#ccc';
      ctx.fillText(info?.name ?? '?', sx, sy);
      if (v.hp < ACTOR_MAX_HP) {
        const w = 24 * dpr;
        ctx.fillStyle = '#300';
        ctx.fillRect(sx - w / 2, sy + 3 * dpr, w, 3 * dpr);
        ctx.fillStyle = '#e33';
        ctx.fillRect(sx - w / 2, sy + 3 * dpr, (w * v.hp) / ACTOR_MAX_HP, 3 * dpr);
      }
    }

    // Crosshair.
    if (game.alive) {
      const mx = input.mouseX * dpr;
      const my = input.mouseY * dpr;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      ctx.moveTo(mx - 8 * dpr, my);
      ctx.lineTo(mx - 3 * dpr, my);
      ctx.moveTo(mx + 3 * dpr, my);
      ctx.lineTo(mx + 8 * dpr, my);
      ctx.moveTo(mx, my - 8 * dpr);
      ctx.lineTo(mx, my - 3 * dpr);
      ctx.moveTo(mx, my + 3 * dpr);
      ctx.lineTo(mx, my + 8 * dpr);
      ctx.stroke();
    }

    if (this.scoped) {
      // Scope: dark vignette around the mouse, a fine reticle on it.
      const mx = input.mouseX * dpr;
      const my = input.mouseY * dpr;
      const r = Math.min(W, H) * 0.42;
      const v = ctx.createRadialGradient(mx, my, r * 0.75, mx, my, r * 1.6);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.78)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(160,255,160,0.55)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      ctx.moveTo(mx - r * 0.3, my);
      ctx.lineTo(mx - 6 * dpr, my);
      ctx.moveTo(mx + 6 * dpr, my);
      ctx.lineTo(mx + r * 0.3, my);
      ctx.moveTo(mx, my - r * 0.3);
      ctx.lineTo(mx, my - 6 * dpr);
      ctx.moveTo(mx, my + 6 * dpr);
      ctx.lineTo(mx, my + r * 0.3);
      ctx.stroke();
    }

    if (game.hurtFlash > 0.02) {
      ctx.fillStyle = `rgba(160,0,0,${game.hurtFlash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }

    this.drawHud(game, input, net, views, dpr, W, H);
  }

  /** Backdrop behind the join screen. */
  drawIdle(): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2b3a5c');
    g.addColorStop(0.6, '#c9a27a');
    g.addColorStop(0.61, '#5a3f2a');
    g.addColorStop(1, '#120d0b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  private drawParallax(ctx: CanvasRenderingContext2D, W: number, H: number, offX: number, offY: number, z: number): void {
    // Two distant ridge lines; parallax factor < 1 so they drift slowly.
    const layers = [
      { f: 0.25, base: 330, amp: 60, color: 'rgba(60,70,100,0.55)' },
      { f: 0.5, base: 360, amp: 45, color: 'rgba(70,60,70,0.6)' },
    ];
    for (const L of layers) {
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      const camX = (W / 2 - offX) / z;
      for (let sx = 0; sx <= W; sx += 8) {
        const wx = camX * L.f + (sx - W / 2) / z;
        const wy = L.base + Math.sin(wx * 0.013) * L.amp * 0.6 + Math.sin(wx * 0.031 + 1.7) * L.amp * 0.4;
        const camY = (H / 2 - offY) / z;
        const sy = H / 2 + (wy - camY * L.f - 300 * (1 - L.f)) * z;
        ctx.lineTo(sx, sy);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawActor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    aim: number,
    flags: number,
    team: number,
    weapon: number,
    moving: boolean,
    now: number,
    parts: number,
  ): void {
    const left = Math.cos(aim) < 0;
    const ix = Math.round(x);
    const iy = Math.round(y);
    // Walk cycle advances with distance travelled, so feet don't skate.
    const frame: BodyFrame = !(flags & F_GROUND) ? 'air' : moving ? WALK_CYCLE[Math.floor(ix / 3) & 3] : 'idle';
    ctx.drawImage(this.sprites.body(team, frame, left, parts, classOfFlags(flags)), ix - 1, iy - 2);

    // Jetpack exhaust under the pack (pack is on the clone's back).
    if (flags & F_JET && has(parts, Part.Jetpack)) {
      const fx = left ? ix + 6 : ix - 1;
      const flick = Math.floor(now / 40) % 3;
      ctx.fillStyle = '#fff6c0';
      ctx.fillRect(fx + 1, iy + 8, 1, 1);
      ctx.fillStyle = '#ffc040';
      ctx.fillRect(fx, iy + 9, 3, 1);
      ctx.fillRect(fx + 1, iy + 10, 1, 2 + flick);
      ctx.fillStyle = '#ff6a20';
      ctx.fillRect(fx + (flick === 1 ? 0 : 2), iy + 10 + flick, 1, 2);
    }

    // Arm + weapon, pre-rotated onto the pixel grid, pivoting at the shoulder.
    const sx = ix + SHOULDER_X;
    const sy = iy + SHOULDER_Y;
    if (!has(parts, Part.GunArm)) {
      // Arm (and the gun with it) gone: a bloody stump at the shoulder.
      ctx.fillStyle = '#a01818';
      ctx.fillRect(left ? sx - 1 : sx, sy, 2, 2);
      return;
    }
    if (!WEAPONS[weapon]) return; // empty-handed
    if (flags & F_RELOAD) {
      // Reloading: gun tipped down in front, bobbing as the magazine goes in.
      const down = 1.05 + Math.sin(now / 90) * 0.12;
      const g = this.sprites.gun(weapon, left ? Math.PI - down : down);
      ctx.drawImage(g.c, sx - g.r, sy - g.r);
      return;
    }
    const g = this.sprites.gun(weapon, aim);
    ctx.drawImage(g.c, sx - g.r, sy - g.r);
    if (flags & F_FIRING && WEAPONS[weapon]?.proj !== PROJ_BUILD) {
      // Flash at the weapon's muzzle offset (where the server spawns its shots).
      const m = (WEAPONS[weapon]?.muzzle ?? 8) + 1;
      const mx = Math.round(sx + Math.cos(aim) * m);
      const my = Math.round(sy + Math.sin(aim) * m);
      if (weapon === WeaponId.Digger) {
        ctx.fillStyle = 'rgba(255,230,120,0.45)';
        ctx.fillRect(mx - 2, my - 2, 5, 5);
        ctx.fillStyle = 'rgba(255,250,210,0.8)';
        ctx.fillRect(mx - 1, my - 1, 3, 3);
      } else if (Math.floor(now / 33) % 2 === 0) {
        ctx.fillStyle = '#ffd040';
        ctx.fillRect(mx - 1, my, 3, 1);
        ctx.fillRect(mx, my - 1, 1, 3);
        ctx.fillStyle = '#fffbe0';
        ctx.fillRect(mx, my, 1, 1);
      }
    }
  }

  /**
   * Materializer preview: the build grid around the cursor, the reach ring,
   * and the selected piece as a ghost, green where the server will accept it
   * (same canBuild) and red with the reason where it won't.
   */
  private drawBuildGhost(ctx: CanvasRenderingContext2D, game: Game, input: InputState, wx: number, wy: number, selfX: number, selfY: number, z: number): void {
    const piece = PIECES[input.piece];
    if (!piece || this.overMenu(input.mouseX, input.mouseY)) return;
    const g = snapPiece(piece, wx, wy, this.snap);
    const res = game.canBuildHere(input.piece, g.x, g.y);
    const ok = res === BuildResult.Ok;
    // Grid, fading out from the cursor.
    const R = 40;
    const gx0 = Math.floor((wx - R) / BUILD_GRID) * BUILD_GRID;
    const gy0 = Math.floor((wy - R) / BUILD_GRID) * BUILD_GRID;
    const lw = 1 / z;
    ctx.fillStyle = 'rgba(140,232,255,0.16)';
    for (let x = gx0; x <= wx + R; x += BUILD_GRID) ctx.fillRect(x, wy - R, lw, 2 * R);
    for (let y = gy0; y <= wy + R; y += BUILD_GRID) ctx.fillRect(wx - R, y, 2 * R, lw);
    // Reach ring.
    ctx.strokeStyle = 'rgba(140,232,255,0.25)';
    ctx.lineWidth = lw;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(selfX + SHOULDER_X, selfY + SHOULDER_Y, BUILD_REACH, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // The piece itself.
    ctx.fillStyle = ok ? 'rgba(120,255,160,0.45)' : 'rgba(255,90,80,0.4)';
    for (let y = 0; y < piece.h; y++) {
      for (let x = 0; x < piece.w; x++) if (piece.cells[y * piece.w + x]) ctx.fillRect(g.x + x, g.y + y, 1, 1);
    }
    ctx.strokeStyle = ok ? 'rgba(160,255,190,0.9)' : 'rgba(255,120,110,0.9)';
    ctx.strokeRect(g.x, g.y, piece.w, piece.h);
    if (!ok) {
      ctx.fillStyle = '#ffb0a8';
      ctx.font = `${Math.max(4, Math.round(12 / z))}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(BUILD_RESULT_TEXT[res], g.x + piece.w / 2, g.y - 2);
      ctx.textAlign = 'left';
    }
  }

  private readonly snap = { x: 0, y: 0 };
  /** Screen rects (device px) of the build menu entries, for clicks. */
  private readonly menuRects: { x: number; y: number; w: number; h: number; i: number }[] = [];
  private readonly pieceIcons: HTMLCanvasElement[] = [];

  /** Build menu entry under a CSS-pixel point, or -1. */
  menuHit(cssX: number, cssY: number): number {
    const dpr = this.canvas.width / innerWidth;
    const x = cssX * dpr;
    const y = cssY * dpr;
    for (const r of this.menuRects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.i;
    return -1;
  }

  private overMenu(cssX: number, cssY: number): boolean {
    if (this.menuRects.length === 0) return false;
    const dpr = this.canvas.width / innerWidth;
    const first = this.menuRects[0];
    const last = this.menuRects[this.menuRects.length - 1];
    return cssX * dpr >= first.x && cssX * dpr < first.x + first.w && cssY * dpr >= first.y && cssY * dpr < last.y + last.h;
  }

  /** A piece drawn in its materials, one pixel per cell (scaled up in the menu). */
  private pieceIcon(i: number): HTMLCanvasElement {
    let c = this.pieceIcons[i];
    if (c) return c;
    const p = PIECES[i];
    c = this.pieceIcons[i] = document.createElement('canvas');
    c.width = p.w;
    c.height = p.h;
    const ctx = c.getContext('2d')!;
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const m = p.cells[y * p.w + x];
        if (!m) continue;
        const [r, g, b] = MAT_COLOR[m];
        const seam = m === Mat.Concrete && ((x & 7) === 0 || (y & 3) === 0) ? 0.8 : 1;
        ctx.fillStyle = `rgb(${Math.round(r * seam)},${Math.round(g * seam)},${Math.round(b * seam)})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  /** The materializer's menu: every piece with its icon and gold cost; click or wheel to pick. */
  private drawBuildMenu(game: Game, input: InputState, s: number, H: number): void {
    const ctx = this.ctx;
    const rowH = 40 * s;
    const w = 170 * s;
    const x0 = 14 * s;
    const y0 = Math.max(250 * s, H / 2 - (PIECES.length * rowH) / 2);
    this.menuRects.length = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x0 - 4 * s, y0 - 24 * s, w + 8 * s, PIECES.length * rowH + 28 * s);
    ctx.fillStyle = '#8ae8ff';
    ctx.textAlign = 'left';
    ctx.font = `bold ${Math.round(12 * s)}px ui-monospace, monospace`;
    ctx.fillText('MATERIALIZER  (wheel)', x0, y0 - 8 * s);
    ctx.font = `${Math.round(13 * s)}px ui-monospace, monospace`;
    for (let i = 0; i < PIECES.length; i++) {
      const p = PIECES[i];
      const y = y0 + i * rowH;
      const sel = i === input.piece;
      ctx.fillStyle = sel ? 'rgba(140,232,255,0.3)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(x0, y + 2 * s, w, rowH - 4 * s);
      if (sel) {
        ctx.strokeStyle = '#8ae8ff';
        ctx.lineWidth = s;
        ctx.strokeRect(x0, y + 2 * s, w, rowH - 4 * s);
      }
      const icon = this.pieceIcon(i);
      const k = Math.min((32 * s) / icon.width, (32 * s) / icon.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(icon, x0 + 4 * s + (32 * s - icon.width * k) / 2, y + 4 * s + (32 * s - icon.height * k) / 2, icon.width * k, icon.height * k);
      ctx.fillStyle = '#fff';
      ctx.fillText(p.name, x0 + 44 * s, y + 18 * s);
      ctx.fillStyle = game.gold >= p.cost ? '#ffd34a' : '#ff7060';
      ctx.fillText(`${p.cost} gold`, x0 + 44 * s, y + 33 * s);
      this.menuRects.push({ x: x0, y, w, h: rowH, i });
    }
  }

  /** A drop rocket: hull in the passenger's colour, exhaust plume along its axis, damage sparks. */
  private drawCraft(ctx: CanvasRenderingContext2D, c: CraftView, game: Game, now: number): void {
    const team = c.passenger !== 255 ? (game.players.get(c.passenger)?.rgb ?? 0x8a9096) : 0x8a9096;
    const cx = Math.round(c.x);
    const cy = Math.round(c.y);
    if (c.thrust > 0.05 && c.parts & (1 << CraftPart.Engine)) {
      // Plume behind the nozzle, length by thrust.
      const len = Math.round(4 + c.thrust * 14 + ((now / 40) % 3));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(c.a);
      const ny = CRAFT_H / 2 + 1;
      ctx.fillStyle = 'rgba(255,170,60,0.85)';
      ctx.fillRect(-2, ny, 4, Math.round(len * 0.7));
      ctx.fillStyle = 'rgba(255,245,200,0.95)';
      ctx.fillRect(-1, ny, 2, Math.round(len * 0.45));
      ctx.fillStyle = 'rgba(255,90,30,0.6)';
      ctx.fillRect(-1, ny + Math.round(len * 0.7), 2, Math.round(len * 0.3));
      ctx.restore();
    }
    const spr = this.sprites.craft(team, c.parts, c.a);
    ctx.drawImage(spr.c, cx - spr.r, cy - spr.r);
    if (c.hp < 70 && (now / 90) % 2 < 1) {
      // Damaged: sparks off the hull.
      ctx.fillStyle = '#ffd040';
      ctx.fillRect(cx - 4 + ((now / 50) % 8), cy - 5 + ((now / 70) % 10), 1, 1);
    }
  }

  /**
   * Body status: each part of the clone tinted by its health (green to red),
   * dark where it has been torn off, outlined where armour is still worn.
   */
  private drawPaperDoll(game: Game, s: number): void {
    const ctx = this.ctx;
    const ox = 200 * s;
    const oy = 12 * s;
    const k = 3 * s; // one hitbox cell
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(ox - 3 * s, oy - 3 * s, 8 * k + 6 * s, 14 * k + 6 * s);
    const col = (hp: number) => (hp <= 0 ? 'rgba(60,20,20,0.9)' : `hsl(${Math.round((hp / 100) * 120)},70%,45%)`);
    const rect = (p: number) => {
      const d = PARTS[p];
      ctx.fillRect(ox + d.rx0 * k, oy + d.ry0 * k, (d.rx1 - d.rx0 + 1) * k, (d.ry1 - d.ry0 + 1) * k);
    };
    for (const p of [Part.Torso, Part.Jetpack, Part.OffArm, Part.LegB, Part.LegF, Part.Head, Part.GunArm]) {
      ctx.fillStyle = col(game.partHp[p]);
      rect(p);
    }
    ctx.lineWidth = Math.max(1, s);
    for (const p of [Part.Helmet, Part.Vest]) {
      if (game.partHp[p] <= 0) continue;
      ctx.strokeStyle = col(game.partHp[p]);
      const d = PARTS[p];
      ctx.strokeRect(ox + d.rx0 * k + 0.5, oy + d.ry0 * k + 0.5, (d.rx1 - d.rx0 + 1) * k - 1, (d.ry1 - d.ry0 + 1) * k - 1);
    }
  }

  private drawHud(game: Game, input: InputState, net: Net, views: RemoteView[], dpr: number, W: number, H: number): void {
    const ctx = this.ctx;
    const s = dpr;
    ctx.textAlign = 'left';
    ctx.font = `${Math.round(12 * s)}px ui-monospace, monospace`;

    // Health / fuel bars.
    const bar = (yy: number, v: number, max: number, color: string, label: string) => {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(14 * s, yy, 180 * s, 14 * s);
      ctx.fillStyle = color;
      ctx.fillRect(16 * s, yy + 2 * s, (176 * s * Math.max(0, v)) / max, 10 * s);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, 20 * s, yy + 11 * s);
    };
    bar(14 * s, game.hp, ACTOR_MAX_HP, '#d23c3c', `HP ${game.hp}`);
    bar(32 * s, game.body.fuel, ACTOR_MAX_FUEL, '#3c8cd2', `JET ${Math.round(game.body.fuel)}`);
    const me = game.players.get(game.myId);
    ctx.fillStyle = '#ffd34a';
    ctx.fillText(`GOLD ${game.gold}   K ${me?.kills ?? 0}  D ${me?.deaths ?? 0}`, 14 * s, 62 * s);
    if (game.alive) {
      ctx.fillStyle = '#c8d0d8';
      ctx.fillText(CLASSES[game.body.cls]?.name.toUpperCase() ?? '', 14 * s, 78 * s);
    }
    if (game.building) this.drawBuildMenu(game, input, s, H);
    else this.menuRects.length = 0;
    if (game.alive) this.drawPaperDoll(game, s);

    // Inventory: what we carry, the one in hand highlighted.
    const slotW = 104 * s;
    const total = Math.max(1, game.inv.length) * slotW;
    const sx0 = W / 2 - total / 2;
    for (let i = 0; i < game.inv.length; i++) {
      const it = game.inv[i];
      const d = WEAPONS[it.weapon];
      const x = sx0 + i * slotW;
      const sel = i === game.slot;
      ctx.fillStyle = sel ? 'rgba(255,210,80,0.85)' : 'rgba(0,0,0,0.5)';
      ctx.fillRect(x + 2 * s, H - 34 * s, slotW - 4 * s, 24 * s);
      ctx.fillStyle = sel ? '#000' : '#ddd';
      ctx.fillText(d ? (d.clip > 0 ? `${d.name} ${it.ammo}` : d.name) : '?', x + 10 * s, H - 18 * s);
    }
    if (game.alive) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'center';
      ctx.fillText(game.inv.length ? '1/2 switch   3 pick up   4 drop' : 'empty-handed: 3 picks up a weapon', W / 2, H - 42 * s);
      ctx.textAlign = 'left';
    }
    // Magazine and reload for the weapon in hand.
    const def = WEAPONS[game.weapon];
    if (game.alive && def && def.clip > 0) {
      const ax = sx0 + total + 8 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(ax, H - 34 * s, 120 * s, 24 * s);
      if (game.reloadLeft > 0) {
        const t = 1 - game.reloadLeft / def.reload;
        ctx.fillStyle = 'rgba(255,210,80,0.8)';
        ctx.fillRect(ax, H - 34 * s, 120 * s * Math.max(0, Math.min(1, t)), 24 * s);
        ctx.fillStyle = '#000';
        ctx.fillText('RELOADING', ax + 10 * s, H - 18 * s);
      } else {
        ctx.fillStyle = game.ammo === 0 ? '#ff7060' : game.ammo <= def.clip / 4 ? '#ffc060' : '#fff';
        ctx.fillText(`${game.ammo} / ${def.clip}`, ax + 10 * s, H - 18 * s);
      }
    }

    // Net stats.
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const lines = [
      `${game.room}  ${game.players.size}/64 players`,
      `ping ${Math.round(net.rttMs)} ms   in ${net.kbIn.toFixed(1)} KB/s`,
      `tick ${game.lastServerTick}  fps ${Math.round(this.fps)}`,
      `chunks ${countLoaded(game)}/${CHUNK_COUNT} known  particles ${game.particles.n} (drawn ${this.particleLayer.drawn})`,
    ];
    lines.forEach((l, i) => ctx.fillText(l, W - 14 * s, (20 + i * 15) * s));

    // Kill feed.
    const now = performance.now();
    game.feed.forEach((f, i) => {
      const a = Math.max(0, Math.min(1, (8000 - (now - f.at)) / 1000));
      if (a <= 0) return;
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, W - 14 * s, (100 + i * 16) * s);
    });
    ctx.globalAlpha = 1;

    // Chat log.
    ctx.textAlign = 'left';
    game.chatLog.forEach((c, i) => {
      const a = input.typing ? 1 : Math.max(0, Math.min(1, (12000 - (now - c.at)) / 1000));
      if (a <= 0) return;
      ctx.globalAlpha = a;
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, 14 * s, H - 60 * s - (game.chatLog.length - i) * 15 * s);
    });
    ctx.globalAlpha = 1;

    // Minimap.
    if (this.miniDirty) {
      this.miniCtx.putImageData(this.miniImage, 0, 0);
      this.miniDirty = false;
    }
    const mw = this.mini.width * s * 0.75;
    const mh = this.mini.height * s * 0.75;
    const mx = W - mw - 14 * s;
    const my = H - mh - 14 * s;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.mini, mx, my, mw, mh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, mw, mh);
    const k = mw / WORLD_W;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.strokeRect(mx + (this.camX - VIEW_HALF_W) * k, my + (this.camY - VIEW_HALF_H) * k, VIEW_HALF_W * 2 * k, VIEW_HALF_H * 2 * k);
    for (const bl of game.radar) {
      ctx.fillStyle = game.colorOf(bl.id);
      ctx.fillRect(mx + bl.x * k - 1.5 * s, my + bl.y * k - 1.5 * s, 3 * s, 3 * s);
    }
    for (const v of views) {
      if (!(v.flags & F_ALIVE)) continue;
      ctx.fillStyle = game.colorOf(v.id);
      ctx.fillRect(mx + v.x * k - 1.5 * s, my + v.y * k - 1.5 * s, 3 * s, 3 * s);
    }
    if (game.alive) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(mx + game.body.x * k - 2 * s, my + game.body.y * k - 2 * s, 4 * s, 4 * s);
    }

    // Death / respawn banner.
    if (!game.alive && game.myId >= 0) {
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.round(22 * s)}px ui-monospace, monospace`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const secs = Math.ceil(game.respawnTicks / TICK_RATE);
      const ride = game.ride;
      if (ride && ride.passenger === game.myId) {
        // Piloting: controls and what is left of the rocket, out of the way at the top.
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(W / 2 - 260 * s, 40 * s, 520 * s, 56 * s);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(15 * s)}px ui-monospace, monospace`;
        ctx.fillText('A/D steer   W burn   S cut engine   click: bail out', W / 2, 62 * s);
        const status = [`hull ${Math.max(0, Math.round((ride.hp / CRAFT_HP) * 100))}%`];
        if (!(ride.parts & (1 << CraftPart.Engine))) status.push('ENGINE GONE');
        if (!(ride.parts & (1 << CraftPart.FinL)) || !(ride.parts & (1 << CraftPart.FinR))) status.push('FIN LOST');
        if (!(ride.parts & (1 << CraftPart.Nose))) status.push('NOSE LOST');
        ctx.fillStyle = status.length > 1 || ride.hp < 70 ? '#ff9060' : '#a0ffa0';
        ctx.fillText(status.join('   '), W / 2, 84 * s);
      } else {
        ctx.fillRect(W / 2 - 220 * s, H / 2 - 40 * s, 440 * s, 60 * s);
        ctx.fillStyle = '#fff';
        ctx.fillText(game.myCraft() ? 'Drop rocket inbound…' : secs > 0 ? `New clone in ${secs}…` : 'Launching drop rocket…', W / 2, H / 2 - 2 * s);
      }
    }

    if (input.scoreboard) this.drawScoreboard(game, s, W, H);
  }

  private drawScoreboard(game: Game, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    const rows = [...game.players.values()].sort((a, b) => b.kills * 10 + b.gold - (a.kills * 10 + a.gold));
    const lineH = 16 * s;
    const cols = rows.length > 32 ? 2 : 1;
    const perCol = Math.ceil(rows.length / cols);
    const colW = 360 * s;
    const w = colW * cols + 20 * s;
    const h = (perCol + 2) * lineH + 20 * s;
    const x0 = W / 2 - w / 2;
    const y0 = Math.max(10 * s, H / 2 - h / 2);
    ctx.fillStyle = 'rgba(8,8,12,0.85)';
    ctx.fillRect(x0, y0, w, h);
    ctx.font = `${Math.round(12 * s)}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    for (let c = 0; c < cols; c++) {
      const cx = x0 + 10 * s + c * colW;
      ctx.fillStyle = '#999';
      ctx.fillText('CLONE              KILLS DEATHS  GOLD', cx, y0 + 20 * s);
      rows.slice(c * perCol, (c + 1) * perCol).forEach((p, i) => {
        ctx.fillStyle = p.id === game.myId ? '#fff' : p.color;
        const name = p.name.padEnd(18).slice(0, 18);
        ctx.fillText(`${name} ${String(p.kills).padStart(5)} ${String(p.deaths).padStart(6)} ${String(p.gold).padStart(5)}`, cx, y0 + 20 * s + (i + 1) * lineH);
      });
    }
  }
}

function countLoaded(game: Game): number {
  let n = 0;
  for (let i = 0; i < CHUNK_COUNT; i++) n += game.loaded[i];
  return n;
}
