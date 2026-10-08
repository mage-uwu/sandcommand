import { ACTOR_H, ACTOR_RUN_SPEED, ACTOR_W, ACTOR_MAX_FUEL, ACTOR_MAX_HP, CHUNK, CHUNK_COUNT, CHUNK_SHIFT, CHUNKS_X, CHUNKS_Y, VIEW_HALF_H, VIEW_HALF_W, WORLD_H, WORLD_W, TICK_RATE } from '../shared/constants.ts';
import { MAT_COLOR, Mat } from '../shared/materials.ts';
import { CALL_COST, CallKind, Evac, GameMode, Phase, F_ALIVE, F_CLASS_SHIFT, F_FIRING, F_GROUND, F_JET, F_RELOAD, TEAM_NAMES, Team, classOfFlags, dequantizeAim } from '../shared/protocol.ts';
import { EVAC_H, EVAC_W, SPIKE_DEPTH, TrapKind } from '../shared/dungeon.ts';
import { sightLine } from '../shared/scope.ts';
import { lineOfFire } from './scope.ts';
import { hash2 } from '../shared/rng.ts';
import { PROJ, PROJ_BUILD, REPAIR_REACH, SHOULDER_X, SHOULDER_Y, WEAPONS, WeaponId } from '../shared/weapons.ts';
import { BUILD_GRID, BUILD_REACH, BUILD_RESULT_TEXT, BuildResult, PIECES, snapPiece } from '../shared/build.ts';
import { type CraftView, type Game, type RemoteView, type ShipView, type TankView, TEAM_COLORS } from './game.ts';
import type { RoundState } from '../shared/frame.ts';
import { bannerLines } from './banner.ts';
import type { InputState } from './input.ts';
import type { Net } from './net.ts';
import { CLASSES, PARTS, Part, has } from '../shared/body.ts';
import { CRAFT_H, CRAFT_HP, CraftPart } from '../shared/craft.ts';
import { FACTIONS } from '../shared/factions.ts';
import { BTN_FIRE, HIP_X, HIP_Y, STANCE_DROP, STANCE_LEAN, Stance, shoulderAt } from '../shared/actor.ts';
import { BAY_AT, ENGINE_NOZZLE_Y, ENGINE_X, SHIP_H, SHIP_HP, SHIP_W, ShipPart, TURRET_AT, hasShipPart } from '../shared/dropship.ts';
import { CANNON_INTERVAL, CANNON_PIVOT, SMG_LEN, SMG_PIVOT, TANK_H, TANK_HP, TANK_PARTS, tankSink, TANK_MAX_FUEL, TANK_PART_HP, TANK_W, TankPart, cannonAngle, hasTankPart } from '../shared/tank.ts';
import { ParticleLayer } from './particle-layer.ts';
import { backWallColor, structColor } from './texture.ts';
import { Backdrop } from './backdrop.ts';
import { type BodyFrame, CROWN, SpriteCache, TANK_SPRITE_TOP, WALK_CYCLE } from './sprites.ts';

/** Most terrain chunks re-rasterized per frame (the rest wait for the next). */
const CHUNKS_PER_FRAME = 64;

/** World cells per minimap pixel: the minimap is 256 pixels wide whatever the world's width. */
const MINI_SCALE = WORLD_W / 256;

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
  private readonly backdrop = new Backdrop();
  /** Aiming down the scope this frame (camera pushed out, overlay drawn). */
  private scoped = false;
  /** The scope's line of sight this frame: from the shoulder along the aim to the first solid cell. */
  private sight: { x: number; y: number; aim: number; mouseAim: number; cone: number; dist: number } | null = null;
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
    // A whole new map is a lot of texturing: spread it over frames, the
    // chunks around the camera first (whatever is in view is never stale).
    const cx0 = Math.max(0, Math.floor((this.camX - VIEW_HALF_W) / CHUNK) - 1);
    const cx1 = Math.min(CHUNKS_X - 1, Math.floor((this.camX + VIEW_HALF_W) / CHUNK) + 1);
    const cy0 = Math.max(0, Math.floor((this.camY - VIEW_HALF_H) / CHUNK) - 1);
    const cy1 = Math.min(CHUNKS_Y - 1, Math.floor((this.camY + VIEW_HALF_H) / CHUNK) + 1);
    const visit = (ci: number) => {
      if (!t.dirty[ci] || !game.loaded[ci]) return;
      t.dirty[ci] = 0;
      this.rasterize(game, ci);
      this.rasterizedThisFrame++;
    };
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) visit(cy * CHUNKS_X + cx);
    for (let ci = 0; ci < CHUNK_COUNT && this.rasterizedThisFrame < CHUNKS_PER_FRAME; ci++) visit(ci);
  }

  private rasterize(game: Game, ci: number): void {
    const t = game.terrain;
    const ox = (ci % CHUNKS_X) << CHUNK_SHIFT;
    const oy = Math.floor(ci / CHUNKS_X) << CHUNK_SHIFT;
    const px = this.chunkPixels;
    const stain = game.stain;
    const backdrop = game.backdrop;
    for (let y = 0; y < CHUNK; y++) {
      const wy = oy + y;
      const row = wy * WORLD_W + ox;
      for (let x = 0; x < CHUNK; x++) {
        const m = t.mat[row + x];
        if (m === Mat.Air) {
          // Inside a bunker: its back wall instead of the open backdrop.
          const bd = backdrop[row + x];
          px[y * CHUNK + x] = bd ? backWallColor(t, bd, ox + x, wy) : 0;
          continue;
        }
        const wx = ox + x;
        let c: number;
        if (m === Mat.Concrete || m === Mat.Metal || m === Mat.Cobble || m === Mat.Glyph) c = structColor(t, m, wx, wy);
        else {
          const exposed = wy > 0 && t.mat[row + x - WORLD_W] === Mat.Air;
          c = PALETTE[m * 8 + (hash2(wx, wy) & 3) + (exposed ? 4 : 0)];
        }
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
    this.scoped = game.alive && input.scoping && !game.drive; // in a tank, right mouse is the cannon
    if (this.scoped) {
      // Scoping: push the view out along the barrel by the weapon's scope
      // distance (the server moves this client's interest area the same way).
      // It stops where the line of sight does: never through or past terrain.
      const mx = this.camX + (input.mouseX * (W / innerWidth) - W / 2) / z;
      const my = this.camY + (input.mouseY * (H / innerHeight) - H / 2) / z;
      const sh = shoulderAt(selfX, selfY, b.stance, mx < selfX + ACTOR_W / 2, this.shPt);
      // (Locked on: down the line to them.) Clones stop the line as walls do.
      const mouseAim = Math.atan2(my - sh.y, mx - sh.x);
      const aim = game.lockAim ?? mouseAim;
      const reach = lineOfFire(game, sh.x, sh.y, aim, WEAPONS[game.weapon]?.scope ?? 0).dist;
      this.sight = { x: sh.x, y: sh.y, aim, mouseAim, cone: WEAPONS[game.weapon]?.lockCone ?? 0, dist: sightLine(game.terrain, sh.x, sh.y, aim, 2000) };
      this.camX += (sh.x + Math.cos(aim) * reach - this.camX) * 0.12;
      this.camY += (sh.y + Math.sin(aim) * reach - this.camY) * 0.12;
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
      } else if (game.spectate !== 255) {
        // Out of the wave: follow whoever we're watching.
        const v = game.remoteViews().find((r) => r.id === game.spectate);
        if (v) {
          this.camX += (v.x + ACTOR_W / 2 - this.camX) * 0.15;
          this.camY += (v.y + ACTOR_H / 2 - this.camY) * 0.15;
        }
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
    // Clouds, blue ranges and mesas in parallax over the sky.
    this.backdrop.draw(ctx, W, H, (W / 2 - offX) / z, (H / 2 - offY) / z, z, now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

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

    // Extraction: the labyrinth's traps, and the extraction rocket.
    if (game.dungeon) this.drawTraps(ctx, game, camX - halfW, camY - halfH, camX + halfW, camY + halfH);
    const rsE = game.roundState;
    if (rsE?.evac && rsE.evac.state !== Evac.None) this.drawEvac(ctx, rsE.evac, now);

    // Drop rockets.
    for (const c of game.craftViews()) this.drawCraft(ctx, c, game, now);
    const ride = game.myCraft(alpha);
    if (ride && game.ride) this.drawCraft(ctx, ride, game, now);

    // Tanks (behind the clones, so a clone walking past shows in front).
    const wmx = (input.mouseX * (W / innerWidth) - offX) / z;
    const wmy = (input.mouseY * (H / innerHeight) - offY) / z;
    for (const t of game.tankViews(alpha)) {
      const mine = t.slot === game.driveSlot && !!game.drive;
      const aim = mine ? Math.atan2(wmy - (t.y + CANNON_PIVOT[1]), wmx - (t.x + TANK_W / 2)) : t.aim;
      this.drawTank(ctx, t, mine ? wmx < t.x + TANK_W / 2 : t.faceLeft, aim, game, now);
    }

    // Dropships.
    for (const sh of game.shipViews()) this.drawShip(ctx, sh, game, now);

    // Remote clones (not those riding inside a tank).
    const views = game.remoteViews().filter((v) => !game.tankPilots.has(v.id));
    for (const v of views) {
      if (!(v.flags & F_ALIVE)) continue;
      const info = game.players.get(v.id);
      const aimR = dequantizeAim(v.aim);
      const lean = this.pose(v.id, v.stance, Math.cos(aimR) < 0, v.vx, v.vy, (v.flags & F_GROUND) !== 0, (v.flags & F_JET) !== 0, now);
      this.drawActor(ctx, v.x, v.y, aimR, v.flags, info?.rgb ?? 0xcccccc, v.weapon, v.moving, now, v.parts, v.stance, lean, v.faction, game.kickOf(v.id, now));
    }
    // Scoped: the line a shot would take, to the wall it would hit or the
    // first clone in its way (bracketed): only what you can actually hit.
    if (this.scoped && this.sight) this.drawSightLine(ctx, game, now);

    // Own clone (hidden inside its tank while driving).
    if (game.alive && !game.drive) {
      const wx = (input.mouseX * (W / innerWidth) - offX) / z;
      const wy = (input.mouseY * (H / innerHeight) - offY) / z;
      const mySh = shoulderAt(selfX, selfY, b.stance, wx < selfX + ACTOR_W / 2, this.shPt);
      const myAim = game.lockAim ?? Math.atan2(wy - mySh.y, wx - mySh.x);
      const reloading = game.reloadLeft > 0;
      const dry = (WEAPONS[game.weapon]?.clip ?? 0) > 0 && game.ammo === 0;
      const flags =
        F_ALIVE |
        (b.onGround ? F_GROUND : 0) |
        (b.jetting ? F_JET : 0) |
        (input.buttons() & BTN_FIRE && !reloading && !dry ? F_FIRING : 0) |
        (reloading ? F_RELOAD : 0) |
        (b.cls << F_CLASS_SHIFT);
      const lean = this.pose(-1, b.stance, Math.cos(myAim) < 0, b.vx, b.vy, b.onGround, b.jetting, now);
      this.drawActor(ctx, selfX, selfY, myAim, flags, game.players.get(game.myId)?.rgb ?? 0xffffff, game.weapon, Math.abs(b.vx) > 5, now, game.parts, b.stance, lean, b.faction, game.kickOf(game.myId, now));
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
      if (it.weapon === WeaponId.Idol) this.drawIdolGlow(ctx, it.x, it.y - 4, now);
      const ang = it.rest || it.weapon === WeaponId.Idol ? (it.left ? Math.PI : 0) : (now / 90) % (Math.PI * 2);
      const g = this.sprites.gun(it.weapon, ang);
      ctx.drawImage(g.c, Math.round(it.x) - g.r, Math.round(it.y) - 1 - g.r);
    }
    const near = game.nearestItem();
    if (near && WEAPONS[near.weapon]) {
      const d = WEAPONS[near.weapon];
      ctx.font = `${Math.max(4, Math.round(11 / z))}px ui-monospace, monospace`;
      const label = `${input.touch ? '⬆' : '[3]'} ${d.name}${d.clip > 0 ? ` ${near.ammo}/${d.clip}` : ''}`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(near.x - tw / 2 - 1, near.y - 13, tw + 2, 6);
      ctx.fillStyle = '#ffd34a';
      ctx.textAlign = 'center';
      ctx.fillText(label, near.x, near.y - 8);
      ctx.textAlign = 'left';
    }

    // Over an empty tank in reach: how to climb in.
    const boardable = game.boardableTank();
    if (boardable) {
      ctx.font = `${Math.max(4, Math.round(11 / z))}px ui-monospace, monospace`;
      const label = `${input.touch ? '⬆' : '[3]'} climb in`;
      const tx = boardable.x + TANK_W / 2;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(tx - tw / 2 - 1, boardable.y - 19, tw + 2, 6);
      ctx.fillStyle = '#9fe870';
      ctx.textAlign = 'center';
      ctx.fillText(label, tx, boardable.y - 14);
      ctx.textAlign = 'left';
    }

    // Materializer beams (anyone's), fading out.
    for (const bm of game.beams) {
      const t = (now - bm.at) / 300;
      if (t >= 1) continue;
      ctx.strokeStyle = bm.tracer ? `rgba(255,246,200,${0.9 * (1 - t) ** 2})` : `rgba(140,232,255,${0.8 * (1 - t)})`;
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
      if (k === 8) {
        // Runaway engine: the rocket pod tumbling along its heading, its flame out the bell while it burns.
        const burning = PROJ[k].life - p.life[i] < (PROJ[k].burn ?? 0);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.ang[i] + Math.PI / 2); // the pod's nose is up in the sprite; heading points out of the nose
        if (burning) {
          const len = 4 + ((now / 31 + i) % 3);
          ctx.fillStyle = '#ff8a24';
          ctx.fillRect(-3, 5, 6, len);
          ctx.fillStyle = '#ffd860';
          ctx.fillRect(-2, 5, 4, len - 1);
          ctx.fillStyle = '#fffbe0';
          ctx.fillRect(-1, 5, 2, len - 2);
        }
        ctx.drawImage(this.sprites.shipEngine(), -5, -6);
        ctx.restore();
      } else if (k === 7) {
        // Dropship bomb: a dark finned casing, nose down, a red band.
        ctx.fillStyle = '#2a2e30';
        ctx.fillRect(x - 1.5, y - 3, 3, 5);
        ctx.fillRect(x - 2.5, y - 4, 5, 1);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(x - 1.5, y, 3, 1);
      } else if (k === 4) {
        // Tank shell: a fat dark slug with a hot base.
        ctx.fillStyle = '#3a3a30';
        ctx.fillRect(x - 2, y - 2, 4, 4);
        ctx.fillStyle = '#ffb040';
        ctx.fillRect(x - p.vx[i] * 0.006 - 1, y - p.vy[i] * 0.006 - 1, 2, 2);
      } else if (PROJ[k]?.ballistic) {
        ctx.strokeStyle = '#fff3b0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        // A short streak behind it (a sniper slug's full tracer is drawn when it lands).
        const sp = Math.hypot(p.vx[i], p.vy[i]) + 1e-6;
        const len = Math.min(sp * 0.012, 24);
        ctx.lineTo(x - (p.vx[i] / sp) * len, y - (p.vy[i] / sp) * len);
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
    // Dropships: whose they are, how much hull is left, bombs aboard.
    for (const sh of game.shipViews()) {
      const sx = offX + (sh.x + SHIP_W / 2) * z;
      const sy = offY + (sh.y - 6) * z - 10 * dpr;
      const info = game.players.get(sh.owner);
      const tag = `${info?.name ?? '?'}'s dropship  ✸${sh.bombs}`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(tag, sx + dpr, sy + dpr);
      ctx.fillStyle = info?.color ?? '#ccc';
      ctx.fillText(tag, sx, sy);
      if (sh.hp < SHIP_HP) {
        const w = 44 * dpr;
        ctx.fillStyle = '#300';
        ctx.fillRect(sx - w / 2, sy + 3 * dpr, w, 3 * dpr);
        ctx.fillStyle = sh.hp > SHIP_HP * 0.35 ? '#d8c040' : '#e33';
        ctx.fillRect(sx - w / 2, sy + 3 * dpr, (w * sh.hp) / SHIP_HP, 3 * dpr);
      }
    }
    // Tanks: who's driving, and how much hull is left.
    for (const t of game.tankViews(alpha)) {
      const sx = offX + (t.x + TANK_W / 2) * z;
      const sy = offY + (t.y - 8) * z - 10 * dpr;
      if (t.pilot !== 255 && t.pilot !== game.myId) {
        const info = game.players.get(t.pilot);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(info?.name ?? '?', sx + dpr, sy + dpr);
        ctx.fillStyle = info?.color ?? '#ccc';
        ctx.fillText(info?.name ?? '?', sx, sy);
      }
      if (t.hp < TANK_HP) {
        const w = 40 * dpr;
        ctx.fillStyle = '#300';
        ctx.fillRect(sx - w / 2, sy + 3 * dpr, w, 3 * dpr);
        ctx.fillStyle = t.hp > TANK_HP * 0.35 ? '#d8c040' : '#e33';
        ctx.fillRect(sx - w / 2, sy + 3 * dpr, (w * t.hp) / TANK_HP, 3 * dpr);
      }
    }
    for (const v of views) {
      if (!(v.flags & F_ALIVE)) continue;
      const info = game.players.get(v.id);
      const sx = offX + (v.x + ACTOR_W / 2) * z;
      const sy = offY + v.y * z - 8 * dpr;
      const tag = game.isKing(v.id) ? `♛ ${info?.name ?? '?'}` : (info?.name ?? '?');
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(tag, sx + dpr, sy + dpr);
      ctx.fillStyle = info?.color ?? '#ccc';
      ctx.fillText(tag, sx, sy);
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
    // The game's sky and scenery, panning slowly, behind the join screen.
    const z = Math.max(2, Math.round(H / 260));
    const camY = 300;
    const offY = H / 2 - camY * z;
    const g = ctx.createLinearGradient(0, offY + -300 * z, 0, offY + 500 * z);
    g.addColorStop(0, '#1d2a48');
    g.addColorStop(0.45, '#6d7fa8');
    g.addColorStop(0.8, '#d8ab7c');
    g.addColorStop(1, '#e6b98a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const now = performance.now();
    this.backdrop.draw(ctx, W, H, 2048 + now / 60, camY, z, now);
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
    stance: number = Stance.Stand,
    lean = 0,
    faction = 0,
    kick = 0,
  ): void {
    const left = Math.cos(aim) < 0;
    const face = left ? -1 : 1;
    const ix = Math.round(x);
    const iy = Math.round(y);
    // Walk cycle advances with distance travelled, so feet don't skate.
    const frame: BodyFrame = !(flags & F_GROUND) ? 'air' : moving ? WALK_CYCLE[Math.floor(ix / (stance === Stance.Stand ? 3 : 2)) & 3] : 'idle';
    const sprite = this.sprites.body(team, frame, left, parts, classOfFlags(flags), faction);
    // The torso pivots at the hip (leaning with the stance and the ragdoll
    // sway); crouched, the legs fold under it; prone, the whole clone lies down.
    const hipX = ix + HIP_X + 0.5;
    const hipY = iy + HIP_Y + STANCE_DROP[stance];
    const a = lean * face;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    // A point given relative to the hip in the standing pose, posed.
    const posed = (dx: number, dy: number) => [hipX + dx * cos - dy * sin, hipY + dx * sin + dy * cos];
    if (stance === Stance.Prone) {
      ctx.save();
      ctx.translate(hipX, hipY);
      ctx.rotate(a);
      ctx.drawImage(sprite, -5.5, -11);
      ctx.restore();
    } else {
      const legH = stance === Stance.Crouch ? 3 : 5;
      ctx.drawImage(sprite, 0, 11, 10, 5, ix - 1, iy + ACTOR_H - legH, 10, legH);
      ctx.save();
      ctx.translate(hipX, hipY);
      ctx.rotate(a);
      ctx.drawImage(sprite, 0, 0, 10, 11, -5.5, -11, 10, 11);
      ctx.restore();
    }

    // A king wears the crown on the head.
    if (has(parts, Part.Crown)) {
      ctx.save();
      ctx.translate(hipX, hipY);
      ctx.rotate(a);
      this.drawCrown(ctx, frame, left, now);
      ctx.restore();
    }

    // Jetpack exhaust under the pack (pack is on the clone's back).
    if (flags & F_JET && has(parts, Part.Jetpack)) {
      const [px, py] = posed(left ? 2.5 : -4.5, -1);
      const fx = Math.round(px);
      const fy = Math.round(py) - 9;
      const flick = Math.floor(now / 40) % 3;
      ctx.fillStyle = '#fff6c0';
      ctx.fillRect(fx + 1, fy + 8, 1, 1);
      ctx.fillStyle = '#ffc040';
      ctx.fillRect(fx, fy + 9, 3, 1);
      ctx.fillRect(fx + 1, fy + 10, 1, 2 + flick);
      ctx.fillStyle = '#ff6a20';
      ctx.fillRect(fx + (flick === 1 ? 0 : 2), fy + 10 + flick, 1, 2);
    }

    // Arm + weapon, pre-rotated onto the pixel grid, pivoting at the (posed) shoulder.
    const [psx, psy] = posed(SHOULDER_X - HIP_X - 0.5, SHOULDER_Y - HIP_Y);
    const sx = Math.round(psx);
    const sy = Math.round(psy);
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
    if (weapon === WeaponId.Idol) {
      // The idol is held up, upright, shining.
      this.drawIdolGlow(ctx, sx + face * 4, sy - 2, now);
      const gi = this.sprites.gun(weapon, left ? Math.PI : 0);
      ctx.drawImage(gi.c, sx - gi.r, sy - gi.r);
      return;
    }
    // Recoil: the gun jumps back along the barrel (and the muzzle up a touch) as it fires.
    const back = kick * 3;
    const lift = kick * 0.18 * (left ? 1 : -1);
    const g = this.sprites.gun(weapon, aim + lift);
    ctx.drawImage(g.c, Math.round(sx - g.r - Math.cos(aim) * back), Math.round(sy - g.r - Math.sin(aim) * back));
    if (flags & F_FIRING && WEAPONS[weapon]?.proj !== PROJ_BUILD) {
      // Flash at the weapon's muzzle offset (where the server spawns its shots).
      const m = (WEAPONS[weapon]?.muzzle ?? 8) + 1;
      const mx = Math.round(sx + Math.cos(aim) * m);
      const my = Math.round(sy + Math.sin(aim) * m);
      if (weapon === WeaponId.RepairKit) {
        // Nanobots: a shimmering cyan-green swarm streaming out along the aim.
        const cos = Math.cos(aim);
        const sin = Math.sin(aim);
        for (let k = 0; k < 14; k++) {
          const ph = ((now / 260 + k * 0.137) % 1) * (REPAIR_REACH - m);
          const wob = Math.sin(now / 70 + k * 2.1) * (1 + ph * 0.12);
          const px = Math.round(mx + cos * ph - sin * wob);
          const py = Math.round(my + sin * ph + cos * wob);
          ctx.fillStyle = k % 3 === 0 ? '#e8fff6' : k % 3 === 1 ? '#5af0c8' : '#58e0ff';
          ctx.fillRect(px, py, 1, 1);
        }
      } else if (weapon === WeaponId.Digger) {
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
   * Ragdoll-ish torso sway, per clone, purely cosmetic: a damped spring on
   * the lean, pulled toward the stance's lean, tipped into the run, thrown
   * around in the air (and flat into a jetpack dash), jolted on landing.
   * Everything it reads is already replicated (stance, velocity, flags), so
   * every client poses everyone the same way with no extra traffic.
   */
  private pose(id: number, stance: number, left: boolean, vx: number, vy: number, ground: boolean, jet: boolean, now: number): number {
    let p = this.poses.get(id);
    if (!p) this.poses.set(id, (p = { lean: STANCE_LEAN[stance], vel: 0, at: now, air: !ground, vy }));
    const dt = Math.min(0.05, Math.max(0, (now - p.at) / 1000));
    p.at = now;
    const face = left ? -1 : 1;
    let target = STANCE_LEAN[stance] + Math.max(-0.2, Math.min(0.2, ((vx * face) / ACTOR_RUN_SPEED) * 0.14));
    if (!ground) {
      target += Math.max(-0.35, Math.min(0.35, -vy / 900)) + Math.sin(now / 70 + id) * 0.08 * Math.min(1, Math.abs(vy) / 250);
      if (jet && stance === Stance.Crouch && Math.abs(vx) > 60) target = 1.05; // flat into the dash
    }
    if (ground && p.air && p.vy > 160) p.vel += Math.min(9, p.vy / 45); // landing jolt
    p.air = !ground;
    p.vy = vy;
    const acc = 140 * (target - p.lean) - 13 * p.vel;
    p.vel += acc * dt;
    p.lean += p.vel * dt;
    p.lean = Math.max(-0.6, Math.min(1.6, p.lean));
    return p.lean;
  }
  private readonly poses = new Map<number, { lean: number; vel: number; at: number; air: boolean; vy: number }>();
  private readonly shPt = { x: 0, y: 0 };

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
  /** Radio call menu entry (CallKind) under a CSS-pixel point, or -1. */
  callMenuHit(cssX: number, cssY: number): number {
    const dpr = this.canvas.width / innerWidth;
    const x = cssX * dpr;
    const y = cssY * dpr;
    for (const r of this.callRects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.i;
    return -1;
  }
  private readonly callRects: { x: number; y: number; w: number; h: number; i: number }[] = [];

  /** The radio's menu: call in a dropship or a tank, for gold. */
  private drawCallMenu(game: Game, input: InputState, s: number, H: number): void {
    const ctx = this.ctx;
    const rowH = 46 * s;
    const w = 236 * s;
    const x0 = 14 * s;
    const entries = [
      { kind: CallKind.Dropship, name: 'DROPSHIP', blurb: 'air support · 2 turrets · 8 bombs' },
      { kind: CallKind.Tank, name: 'TANK', blurb: 'parachuted onto your position' },
    ];
    const y0 = Math.max(250 * s, H / 2 - (entries.length * rowH) / 2);
    this.callRects.length = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x0 - 4 * s, y0 - 24 * s, w + 8 * s, entries.length * rowH + 28 * s);
    ctx.textAlign = 'left';
    ctx.font = `bold ${Math.round(12 * s)}px ui-monospace, monospace`;
    ctx.fillStyle = '#9fe870';
    ctx.fillText(`RADIO  (${input.touch ? 'tap' : 'click'} to call in)`, x0, y0 - 8 * s);
    const afford = game.gold >= CALL_COST;
    entries.forEach((e, i) => {
      const y = y0 + i * rowH;
      ctx.fillStyle = afford ? 'rgba(160,232,112,0.14)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(x0, y + 2 * s, w, rowH - 4 * s);
      ctx.strokeStyle = afford ? '#9fe870' : '#555';
      ctx.lineWidth = s;
      ctx.strokeRect(x0, y + 2 * s, w, rowH - 4 * s);
      ctx.font = `bold ${Math.round(14 * s)}px ui-monospace, monospace`;
      ctx.fillStyle = '#fff';
      ctx.fillText(e.name, x0 + 8 * s, y + 20 * s);
      ctx.fillStyle = afford ? '#ffd34a' : '#ff7060';
      ctx.textAlign = 'right';
      ctx.fillText(`${CALL_COST} gold`, x0 + w - 8 * s, y + 20 * s);
      ctx.textAlign = 'left';
      ctx.font = `${Math.round(11 * s)}px ui-monospace, monospace`;
      ctx.fillStyle = '#c8d0d8';
      ctx.fillText(e.blurb, x0 + 8 * s, y + 36 * s);
      this.callRects.push({ x: x0, y, w, h: rowH, i: e.kind });
    });
  }

  /**
   * A dropship: four engine pods on struts over a gunship hull (in its
   * caller's team colours), nozzles glowing with each engine's throttle,
   * a turret swivelling at either end and the bomb-bay doors swinging open
   * in its belly; all tilted with the hull. Lost parts are simply gone.
   */
  private drawShip(ctx: CanvasRenderingContext2D, sh: ShipView, game: Game, now: number): void {
    const sp = this.sprites;
    const team = (sh.team !== 255 ? TEAM_COLORS[sh.team]?.rgb : undefined) ?? game.players.get(sh.owner)?.rgb ?? 0x8090a0;
    const x = Math.round(sh.x);
    const y = Math.round(sh.y);
    ctx.save();
    ctx.translate(sh.x + SHIP_W / 2, sh.y + SHIP_H / 2);
    ctx.rotate(sh.a);
    ctx.translate(-(x + SHIP_W / 2), -(y + SHIP_H / 2));
    ctx.drawImage(sp.shipHull(team), x, y);
    for (let e = 0; e < 4; e++) {
      if (!hasShipPart(sh.parts, ShipPart.EngineA + e)) continue;
      const ex = x + ENGINE_X[e] - 5;
      // The rocket flame under the bell: longer with the throttle, flickering; white-hot core.
      const t = sh.thrust[e] * (0.75 + 0.25 * Math.sin(now / 29 + e * 1.7));
      const len = 1 + Math.round(t * 5);
      const ny = y + ENGINE_NOZZLE_Y;
      ctx.fillStyle = '#ff8a24';
      ctx.fillRect(ex + 2, ny, 6, Math.max(1, len - 2));
      ctx.fillRect(ex + 3, ny, 4, len);
      ctx.fillStyle = '#ffd860';
      ctx.fillRect(ex + 3, ny, 4, Math.max(1, len - 2));
      ctx.fillStyle = '#fffbe0';
      ctx.fillRect(ex + 4, ny, 2, Math.max(1, len - 3));
      ctx.drawImage(sp.shipEngine(), ex, y);
    }
    // Bomb bay: closed doors are a seam; open, two flaps hang down.
    if (hasShipPart(sh.parts, ShipPart.Doors)) {
      ctx.fillStyle = '#20262c';
      if (sh.doors) {
        ctx.fillRect(x + BAY_AT[0] - 5, y + BAY_AT[1] - 1, 10, 2);
        ctx.fillStyle = '#4a5560';
        ctx.fillRect(x + BAY_AT[0] - 6, y + BAY_AT[1], 2, 4);
        ctx.fillRect(x + BAY_AT[0] + 4, y + BAY_AT[1], 2, 4);
      } else ctx.fillRect(x + BAY_AT[0], y + BAY_AT[1] - 2, 1, 2);
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(x + BAY_AT[0] - 5, y + BAY_AT[1] - 2, 10, 3); // a torn hole
    }
    // Turrets: a ball mount and twin barrels on the aim (relative to the tilted hull).
    for (const side of [0, 1]) {
      if (!hasShipPart(sh.parts, ShipPart.TurretL + side)) continue;
      const [tx, ty] = TURRET_AT[side];
      const g = sp.tankGun(true, sh.aim[side] - sh.a);
      ctx.drawImage(g.c, Math.round(x + tx - g.r), Math.round(y + ty - g.r));
      ctx.fillStyle = '#2e363e';
      ctx.fillRect(x + tx - 3, y + ty - 3, 6, 6);
      ctx.fillStyle = '#9aa8b4';
      ctx.fillRect(x + tx - 2, y + ty - 2, 3, 2);
      if (sh.fired[side] && (now / 45) % 2 < 1) {
        const a = sh.aim[side] - sh.a;
        ctx.fillStyle = '#fff4b0';
        ctx.fillRect(Math.round(x + tx + Math.cos(a) * 11) - 1, Math.round(y + ty + Math.sin(a) * 11) - 1, 3, 3);
      }
    }
    ctx.restore();
  }

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
        const seam = m === Mat.Concrete && (x === 0 || y === 0) ? 1.15 : m === Mat.Concrete && (x === p.w - 1 || y === p.h - 1) ? 0.7 : 1;
        ctx.fillStyle = `rgb(${Math.round(r * seam)},${Math.round(g * seam)},${Math.round(b * seam)})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  /** Driving: the tank's parts (blown off ones crossed out), the cannon's load, and the controls. */
  private drawTankHud(game: Game, input: InputState, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    const st = game.myTankState!;
    const x0 = W / 2 - 230 * s;
    const y0 = H - 92 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x0, y0, 460 * s, 44 * s);
    ctx.font = `bold ${Math.round(12 * s)}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    const names = ['HULL', 'CANNON', 'SMG', 'ARMOUR', 'SHIELD'];
    for (let part = 0; part < TANK_PARTS; part++) {
      const x = x0 + 8 * s + part * 90 * s;
      const on = hasTankPart(st.parts, part);
      const f = Math.max(0, Math.min(1, st.partHp[part] / TANK_PART_HP[part]));
      ctx.fillStyle = on ? '#e8e0c8' : '#a05040';
      ctx.fillText(on ? names[part] : `${names[part]} LOST`, x, y0 + 16 * s);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, y0 + 22 * s, 80 * s, 6 * s);
      ctx.fillStyle = !on ? '#553' : f > 0.5 ? '#8fd060' : f > 0.25 ? '#e0c040' : '#e05040';
      ctx.fillRect(x, y0 + 22 * s, 80 * s * f, 6 * s);
    }
    // Cannon load.
    if (hasTankPart(st.parts, TankPart.Cannon)) {
      const load = 1 - Math.min(1, st.cannonCd / (CANNON_INTERVAL * TICK_RATE));
      ctx.fillStyle = load >= 1 ? '#ffd34a' : 'rgba(255,211,74,0.5)';
      ctx.fillRect(x0 + 8 * s + 90 * s, y0 + 32 * s, 80 * s * load, 3 * s);
    }
    ctx.font = `${Math.round(11 * s)}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.textAlign = 'center';
    const help = input.touch ? 'tap: SMG   ◎ cannon   ▲ jets   ⬆ climb out' : 'LMB/RShift: SMG   RMB/LShift: cannon   W: jets   3/F: climb out';
    ctx.fillText(help, W / 2, y0 - 6 * s);
    ctx.textAlign = 'left';
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

  /**
   * Line of fire down the scope (see `sight`): a faint laser to the wall or
   * clone that would take the shot, and brackets on that clone: red on an
   * enemy (solid, with a lock mark, once the scope has locked onto them),
   * grey on a teammate.
   */
  private drawSightLine(ctx: CanvasRenderingContext2D, game: Game, now: number): void {
    const s = this.sight!;
    if (s.cone > 0) {
      // The lock cone's edges, faint and dashed: anyone between them can be locked onto.
      ctx.strokeStyle = 'rgba(255,120,90,0.18)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      for (const side of [-1, 1]) {
        const a = s.mouseAim + side * s.cone;
        const len = sightLine(game.terrain, s.x, s.y, a, 420);
        ctx.moveTo(s.x + Math.cos(a) * 10, s.y + Math.sin(a) * 10);
        ctx.lineTo(s.x + Math.cos(a) * len, s.y + Math.sin(a) * len);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const lof = lineOfFire(game, s.x, s.y, s.aim, 2000);
    const ex = s.x + Math.cos(s.aim) * lof.dist;
    const ey = s.y + Math.sin(s.aim) * lof.dist;
    const hit = lof.hit;
    const locked = !!hit && game.scopeLock?.id === hit.id;
    ctx.strokeStyle = lof.foe ? 'rgba(255,70,50,0.5)' : 'rgba(255,90,70,0.22)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(s.x + Math.cos(s.aim) * 8, s.y + Math.sin(s.aim) * 8);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = lof.foe ? '#ff4030' : '#ffb0a0';
    ctx.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 2, 2);
    if (!hit) return;
    const p = locked ? 0 : 1 + Math.round(Math.sin(now / 90));
    const x0 = Math.round(hit.x) - 2 - p;
    const y0 = Math.round(hit.y) - 2 - p;
    const x1 = Math.round(hit.x) + ACTOR_W + 1 + p;
    const y1 = Math.round(hit.y) + ACTOR_H + 1 + p;
    ctx.fillStyle = lof.foe ? '#ff4030' : '#c0c8d0';
    const arm = locked ? 4 : 3;
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.fillRect(Math.min(cx, cx + sx * arm), cy, arm, 1);
      ctx.fillRect(cx, Math.min(cy, cy + sy * arm), 1, arm);
    }
    if (locked && game.scopeLock) {
      // The locked point, and a tag.
      const lx = Math.round(hit.x + game.scopeLock.lx);
      const ly = Math.round(hit.y + game.scopeLock.ly);
      ctx.fillRect(lx - 2, ly, 5, 1);
      ctx.fillRect(lx, ly - 2, 1, 5);
      ctx.font = '5px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOCK', hit.x + ACTOR_W / 2, y0 - 2);
      ctx.textAlign = 'left';
    }
  }

  /** A soft golden halo around the idol, pulsing, so it can be spotted in the dark of the labyrinth. */
  private drawIdolGlow(ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void {
    const p = 0.5 + 0.5 * Math.sin(now / 260);
    const g = ctx.createRadialGradient(x, y, 1, x, y, 16 + p * 4);
    g.addColorStop(0, `rgba(255,220,110,${0.45 + 0.2 * p})`);
    g.addColorStop(1, 'rgba(255,200,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 22, y - 22, 44, 44);
  }

  /**
   * The labyrinth's booby traps in view: spikes bristling in their pits,
   * stone dart throwers set into the walls (a carved face, its mouth the
   * barrel), and brass pressure plates in the floor (gone once they've fired).
   */
  private drawTraps(ctx: CanvasRenderingContext2D, game: Game, x0: number, y0: number, x1: number, y1: number): void {
    const d = game.dungeon!;
    for (const t of d.traps) {
      if (t.x < x0 - 20 || t.x > x1 + 20 || t.y < y0 - 20 || t.y > y1 + 20) continue;
      if (t.kind === TrapKind.Spikes) {
        const bottom = t.y + SPIKE_DEPTH;
        for (let x = t.x + 1; x < t.x + t.w - 1; x += 3) {
          ctx.fillStyle = '#8a9096';
          ctx.fillRect(x, bottom - 3, 2, 3);
          ctx.fillStyle = '#c8ced4';
          ctx.fillRect(x, bottom - 4, 1, 1);
          ctx.fillStyle = '#7a1c14';
          ctx.fillRect(x + 1, bottom - 4, 1, 1);
        }
      } else if (t.kind === TrapKind.Darts) {
        // Built into the wall the dart comes out of.
        const wx = t.dir > 0 ? t.x - 1 : t.x - 4;
        ctx.fillStyle = '#6e6250';
        ctx.fillRect(wx, t.y - 5, 5, 10);
        ctx.fillStyle = '#9a8a6a';
        ctx.fillRect(wx, t.y - 5, 5, 1);
        ctx.fillStyle = '#40e0d0';
        ctx.fillRect(wx + 1, t.y - 3, 1, 1);
        ctx.fillRect(wx + 3, t.y - 3, 1, 1);
        ctx.fillStyle = '#120e0a';
        ctx.fillRect(t.dir > 0 ? t.x + 1 : t.x - 2, t.y - 1, 2, 2);
      } else if (!game.trapGone(t.id)) {
        ctx.fillStyle = '#5a4a2a';
        ctx.fillRect(t.x - t.w / 2, t.y - 1, t.w, 1);
        ctx.fillStyle = '#b89a50';
        ctx.fillRect(t.x - t.w / 2 + 1, t.y - 1, t.w - 2, 1);
      }
    }
  }

  /** The extraction rocket: flames while it flies, its hatch open and a beacon over it once it's down. */
  private drawEvac(ctx: CanvasRenderingContext2D, e: { state: number; x: number; y: number }, now: number): void {
    const landed = e.state === Evac.Landed;
    const x = Math.round(e.x - EVAC_W / 2);
    const y = Math.round(e.y);
    if (!landed) {
      const len = 10 + ((now / 40) % 3) * 3;
      ctx.fillStyle = '#ff8a24';
      ctx.fillRect(x + 5, y + EVAC_H, 8, len);
      ctx.fillStyle = '#ffd860';
      ctx.fillRect(x + 6, y + EVAC_H, 6, len - 3);
      ctx.fillStyle = '#fffbe0';
      ctx.fillRect(x + 7, y + EVAC_H, 4, len - 6);
    }
    ctx.drawImage(this.sprites.evac(landed), x, y);
    if ((now / 300) % 2 < 1) {
      ctx.fillStyle = 'rgba(255,60,40,0.5)';
      ctx.fillRect(x + 6, y - 3, 6, 4);
    }
    if (landed) {
      // Light spilling from the hatch, and a bouncing marker over the nose.
      ctx.fillStyle = 'rgba(255,230,150,0.22)';
      ctx.fillRect(x - 6, y + 22, EVAC_W + 12, EVAC_H - 22);
      const bob = Math.round(Math.sin(now / 180) * 2);
      ctx.fillStyle = '#ffd34a';
      ctx.font = '6px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EXTRACTION', e.x, y - 12 + bob);
      ctx.fillRect(e.x - 2, y - 9 + bob, 5, 1);
      ctx.fillRect(e.x - 1, y - 8 + bob, 3, 1);
      ctx.fillRect(e.x, y - 7 + bob, 1, 1);
      ctx.textAlign = 'left';
    }
  }

  /**
   * A king's crown, worn on the head: drawn in the torso's posed frame (hip
   * at the origin, the sprite's top-left at (-5.5, -11)) so it leans, ducks
   * and lies down with the head. A jewel glints now and then.
   */
  private drawCrown(ctx: CanvasRenderingContext2D, frame: BodyFrame, left: boolean, now: number): void {
    const top = this.sprites.headTop(frame);
    const x0 = -5.5 + (left ? 2 : 3);
    const y0 = -11 + top - 2;
    const col: Record<string, string> = { Y: '#ffd34a', y: '#a8801e', r: '#d03020' };
    for (let r = 0; r < CROWN.length; r++) {
      for (let c = 0; c < CROWN[r].length; c++) {
        const ch = CROWN[r][left ? CROWN[r].length - 1 - c : c];
        if (ch === '.') continue;
        ctx.fillStyle = col[ch];
        ctx.fillRect(x0 + c, y0 + r, 1, 1);
      }
    }
    if ((now / 400) % 4 < 0.5) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(x0 + (left ? 0 : 4), y0, 1, 1);
    }
  }

  /**
   * A tank, after Metal Slug's SV-001, in pixel-art layers from the sprite
   * cache: the cannon (its root hidden behind the dome, kicking back after a
   * shot), the hull, the tracks (links crawl and wheels turn as it rolls),
   * the armour plate and the vulcan, while each is still attached. Its
   * driver's head pokes out of the hatch in their colour; a parachute holds
   * it while it comes down; scorch marks spread as the hull weakens.
   */
  private drawTank(ctx: CanvasRenderingContext2D, t: TankView, faceLeft: boolean, aim: number, game: Game, now: number): void {
    const sp = this.sprites;
    const x = Math.round(t.x);
    const ty = Math.round(t.y);
    const y = ty - TANK_SPRITE_TOP;
    // Tank-local x (as drawn facing right) to world, mirrored when facing left.
    const wx = (lx: number, w = 0) => (faceLeft ? x + TANK_W - lx - w : x + lx);
    if (t.chute) ctx.drawImage(sp.tankChute(), x - 8, ty - 34);
    // Everything below is drawn in the hull's own frame, tilted with the
    // treads about the middle of the tread line (sunk so both ends touch).
    ctx.save();
    ctx.translate(t.x + TANK_W / 2, t.y + TANK_H + tankSink(t.a));
    ctx.rotate(t.a);
    ctx.translate(-(x + TANK_W / 2), -(ty + TANK_H));
    const shield = hasTankPart(t.parts, TankPart.Shield);
    if (t.pilot !== 255 && !shield) {
      // Shield blown off: the driver's head and shoulders, out in the open.
      const rgb = game.players.get(t.pilot)?.rgb ?? 0x7a8a50;
      ctx.fillStyle = '#141012';
      ctx.fillRect(wx(11, 6), y - 5, 6, 5);
      ctx.fillStyle = `#${rgb.toString(16).padStart(6, '0')}`;
      ctx.fillRect(wx(12, 4), y - 4, 4, 2);
      ctx.fillStyle = '#e0b48c';
      ctx.fillRect(wx(12, 4), y - 2, 4, 2);
      ctx.fillStyle = '#141012';
      ctx.fillRect(wx(14, 1), y - 2, 1, 1);
    }
    if (hasTankPart(t.parts, TankPart.Cannon)) {
      const a = cannonAngle(faceLeft, aim, t.a) - t.a; // relative to the tilted hull
      const g = sp.tankGun(false, a);
      const kick = t.firedCannon ? 3 : 0;
      const px = (faceLeft ? x + TANK_W - CANNON_PIVOT[0] : x + CANNON_PIVOT[0]) - Math.cos(a) * kick;
      const py = ty + CANNON_PIVOT[1] - Math.sin(a) * kick;
      ctx.drawImage(g.c, Math.round(px - g.r), Math.round(py - g.r));
    }
    ctx.drawImage(sp.tankHull(faceLeft), x, y);
    // The steel cupola over the hatch (12 wide, its foot on the hatch rim).
    if (shield) ctx.drawImage(sp.tankShield(faceLeft), wx(9, 12), y - 4);
    // Tracks: one frame per two cells rolled.
    ctx.drawImage(sp.tankTread(Math.floor((faceLeft ? -t.x : t.x) / 2), faceLeft), x, y + 18);
    if (hasTankPart(t.parts, TankPart.Armor)) ctx.drawImage(sp.tankArmor(faceLeft), x, y);
    if (hasTankPart(t.parts, TankPart.Smg)) {
      aim -= t.a; // the vulcan's swivel, relative to the tilted hull
      const g = sp.tankGun(true, aim);
      const px = faceLeft ? x + TANK_W - SMG_PIVOT[0] : x + SMG_PIVOT[0];
      const py = ty + SMG_PIVOT[1];
      ctx.drawImage(g.c, Math.round(px - g.r), Math.round(py - g.r));
      if (t.firedSmg && (now / 45) % 2 < 1) {
        // Muzzle flash: a hot star at the barrel tips.
        const fx = Math.round(px + Math.cos(aim) * (SMG_LEN + 1));
        const fy = Math.round(py + Math.sin(aim) * (SMG_LEN + 1));
        ctx.fillStyle = '#fff4b0';
        ctx.fillRect(fx - 1, fy - 1, 3, 3);
        ctx.fillStyle = '#ffb030';
        ctx.fillRect(fx - 2, fy, 5, 1);
        ctx.fillRect(fx, fy - 2, 1, 5);
      }
    }
    // Battle damage: scorch blotches spread as the hull weakens, then it burns.
    const wear = 1 - t.hp / TANK_HP;
    if (wear > 0.25) {
      ctx.fillStyle = 'rgba(16,12,8,0.55)';
      ctx.fillRect(wx(5, 4), ty + 8, 4, 2);
      ctx.fillRect(wx(6, 2), ty + 10, 2, 1);
      if (wear > 0.5) {
        ctx.fillRect(wx(18, 5), ty + 9, 5, 2);
        ctx.fillRect(wx(9, 3), ty + 2, 3, 2);
      }
      if (wear > 0.75 && (now / 90) % 3 < 2) {
        ctx.fillStyle = (now / 60) % 2 < 1 ? '#ff9a30' : '#ffd060';
        ctx.fillRect(wx(19, 2), ty + 7, 2, 2);
        ctx.fillRect(wx(7, 1), ty + 6, 1, 2);
      }
    }
    ctx.restore();
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
    for (const p of [Part.Helmet, Part.Vest, Part.Crown]) {
      if (game.partHp[p] <= 0) continue;
      ctx.strokeStyle = col(game.partHp[p]);
      const d = PARTS[p];
      ctx.strokeRect(ox + d.rx0 * k + 0.5, oy + d.ry0 * k + 0.5, (d.rx1 - d.rx0 + 1) * k - 1, (d.ry1 - d.ry0 + 1) * k - 1);
    }
  }

  private drawHud(game: Game, input: InputState, net: Net, views: RemoteView[], dpr: number, W: number, H: number): void {
    const ctx = this.ctx;
    // HUD scale: device pixels per CSS pixel, shrunk on small (phone) screens.
    const s = dpr * Math.min(1, innerHeight / 560, innerWidth / 1000);
    const touch = input.touch;
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
    if (game.drive) bar(32 * s, game.drive.fuel, TANK_MAX_FUEL, '#3c8cd2', `TANK JET ${Math.round(game.drive.fuel)}`);
    else bar(32 * s, game.body.fuel, ACTOR_MAX_FUEL, '#3c8cd2', `JET ${Math.round(game.body.fuel)}`);
    if (game.drive && game.myTankState) this.drawTankHud(game, input, s, W, H);
    const me = game.players.get(game.myId);
    ctx.fillStyle = '#ffd34a';
    ctx.fillText(`GOLD ${game.gold}   K ${me?.kills ?? 0}  D ${me?.deaths ?? 0}`, 14 * s, 62 * s);
    if (game.alive) {
      ctx.fillStyle = '#c8d0d8';
      // Who supplied this body, and what kind of body it is.
      ctx.fillText(`${FACTIONS[game.body.faction]?.name.toUpperCase() ?? ''} ${CLASSES[game.body.cls]?.name.toUpperCase() ?? ''}`, 14 * s, 78 * s);
    }
    if (game.building) this.drawBuildMenu(game, input, s, H);
    else this.menuRects.length = 0;
    if (game.calling) this.drawCallMenu(game, input, s, H);
    else this.callRects.length = 0;
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
    if (game.alive && !touch && !game.drive) {
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
    // On touch screens the bottom-right belongs to the buttons: the minimap
    // moves to the top-right, the kill feed under it, and the net stats go.
    const mw = this.mini.width * s;
    const mh = this.mini.height * s;
    const mx = W - mw - 14 * s;
    const my = touch ? 10 * s : H - mh - 14 * s;
    if (!touch) lines.forEach((l, i) => ctx.fillText(l, W - 14 * s, (20 + i * 15) * s));

    // Kill feed.
    const now = performance.now();
    const feedY = touch ? my + mh + 16 * s : 100 * s;
    const feed = touch ? game.feed.slice(-3) : game.feed;
    feed.forEach((f, i) => {
      const a = Math.max(0, Math.min(1, (8000 - (now - f.at)) / 1000));
      if (a <= 0) return;
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, W - 14 * s, feedY + i * 16 * s);
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
    // Kings stand out: a gold square around their dot (radar blips included).
    const rs0 = game.roundState;
    if (rs0 && rs0.mode === GameMode.Regicide) {
      ctx.strokeStyle = '#ffd34a';
      ctx.lineWidth = Math.max(1, s);
      for (const bl of game.radar) if (game.isKing(bl.id)) ctx.strokeRect(mx + bl.x * k - 3 * s, my + bl.y * k - 3 * s, 6 * s, 6 * s);
      for (const v of views) if (v.flags & F_ALIVE && game.isKing(v.id)) ctx.strokeRect(mx + v.x * k - 3 * s, my + v.y * k - 3 * s, 6 * s, 6 * s);
    }
    // Extraction: the idol (a pulsing gold diamond) and the extraction rocket, for everyone to race to.
    if (rs0?.idol && rs0.mode === GameMode.Extraction) {
      const ix = mx + rs0.idol.x * k;
      const iy = my + rs0.idol.y * k;
      const r = (3 + Math.sin(performance.now() / 200)) * s;
      ctx.fillStyle = '#ffd34a';
      ctx.beginPath();
      ctx.moveTo(ix, iy - r);
      ctx.lineTo(ix + r, iy);
      ctx.lineTo(ix, iy + r);
      ctx.lineTo(ix - r, iy);
      ctx.closePath();
      ctx.fill();
      if (rs0.evac && rs0.evac.state !== Evac.None) {
        ctx.fillStyle = '#fff';
        const ex = mx + rs0.evac.x * k;
        const ey = my + Math.max(0, rs0.evac.y) * k;
        ctx.fillRect(ex - 1.5 * s, ey - 3 * s, 3 * s, 6 * s);
      }
    }
    if (game.alive) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(mx + game.body.x * k - 2 * s, my + game.body.y * k - 2 * s, 4 * s, 4 * s);
    }

    // Last Man Standing: the round, and what's happening to us in it.
    const rs = game.roundState;
    if (rs) this.drawRound(game, rs, s, W, H);

    // Death / respawn banner.
    if (!game.alive && game.myId >= 0 && (!rs || game.ride || game.myCraft())) {
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

  /**
   * Last Man Standing banners: waiting, the countdown, clones left, who you're
   * watching once you're out, and the winner of each wave.
   */
  private drawRound(game: Game, rs: RoundState, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    const secs = Math.ceil(rs.timer / TICK_RATE);
    const name = (id: number) => (id === game.myId ? 'YOU' : (game.players.get(id)?.name ?? '???'));
    const big = (text: string, sub: string, color = '#fff') => this.drawBanner(text, sub, color, s, W, H);
    const regicide = rs.mode === GameMode.Regicide;
    const extraction = rs.mode === GameMode.Extraction;
    const teams = rs.mode === GameMode.Lts || regicide || extraction;
    const teamCss = (t: number) => TEAM_COLORS[t]?.css ?? '#fff';
    if (rs.phase === Phase.Waiting) big(extraction ? 'EXTRACTION' : regicide ? 'REGICIDE' : teams ? 'LAST TEAM STANDING' : 'LAST MAN STANDING', 'waiting for clones...');
    else if (rs.phase === Phase.Countdown) {
      big(
        `WAVE ${rs.wave + 1} IN ${secs}`,
        extraction
          ? 'extraction · four teams · bring the golden idol up from the bottom of the labyrinth'
          : regicide
          ? 'regicide · kill their king · guard yours'
          : teams
            ? 'last team standing · red vs green · one life each'
            : 'last man standing · one life each · every clone for itself',
        '#ffd34a',
      );
    } else if (rs.phase === Phase.Victory && extraction) {
      const mine = game.myTeam !== Team.None && rs.winner === game.myTeam;
      if (rs.winner === 255) big('NOBODY GOT OUT', `the idol stays buried · wave ${rs.wave} · next wave in ${secs}`);
      else big(`${TEAM_NAMES[rs.winner]} EXTRACTED`, `${mine ? 'your team got' : 'team ' + TEAM_NAMES[rs.winner].toLowerCase() + ' got'} the golden idol out · next wave in ${secs}`, teamCss(rs.winner));
    } else if (rs.phase === Phase.Victory && regicide) {
      const loser = rs.winner === Team.Red ? Team.Green : Team.Red;
      const mine = game.myTeam !== Team.None && rs.winner === game.myTeam;
      if (rs.winner === 255) big('STALEMATE', `both kings stand · wave ${rs.wave} · next wave in ${secs}`);
      else big(`${TEAM_NAMES[rs.winner]} WINS`, `${mine ? 'you killed' : 'team ' + TEAM_NAMES[rs.winner].toLowerCase() + ' killed'} the ${TEAM_NAMES[loser].toLowerCase()} king · next wave in ${secs}`, teamCss(rs.winner));
    } else if (rs.phase === Phase.Victory && teams) {
      const mine = game.myTeam !== Team.None && rs.winner === game.myTeam;
      if (rs.winner === 255) big(rs.teamLeft[0] > 0 ? 'STALEMATE' : 'NO SURVIVORS', `wave ${rs.wave} · next wave in ${secs}`);
      else big(`${TEAM_NAMES[rs.winner]} WINS`, `${mine ? 'your team takes' : 'team ' + TEAM_NAMES[rs.winner].toLowerCase() + ' takes'} wave ${rs.wave} · next wave in ${secs}`, teamCss(rs.winner));
    } else if (rs.phase === Phase.Victory) {
      const won = rs.winner === game.myId;
      const who = (game.players.get(rs.winner)?.name ?? '').replace(/^BOT /, '');
      big(rs.winner === 255 ? 'NO SURVIVORS' : won ? 'YOU WIN!' : `${who} WINS`, `${rs.winner !== 255 && !won ? name(rs.winner) + ' takes ' : ''}wave ${rs.wave} · next wave in ${secs}`, won ? '#80ff80' : '#ffd34a');
    } else {
      // Live: a small status line, plus the spectator banner once we're out.
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.round(14 * s)}px ui-monospace, monospace`;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(W / 2 - 150 * s, 8 * s, 300 * s, 24 * s);
      ctx.fillStyle = secs <= 30 ? '#ff8070' : '#ffd34a';
      const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      if (extraction) {
        // Extraction: the clock; every team's clones; where the idol is.
        ctx.fillText(`WAVE ${rs.wave} · EXTRACTION · ${clock}`, W / 2, 25 * s);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(W / 2 - 230 * s, 32 * s, 460 * s, 42 * s);
        const cols = [-165, -55, 55, 165];
        for (let t = 0; t < 4; t++) {
          ctx.fillStyle = teamCss(t);
          ctx.fillText(`${TEAM_NAMES[t]}${game.myTeam === t ? '*' : ''} ${rs.teamLeft[t] ?? 0}`, W / 2 + cols[t] * s, 48 * s);
        }
        const idol = rs.idol;
        const evac = rs.evac;
        let line = 'IDOL: deep in the sanctum';
        let color = '#ffd34a';
        if (idol && idol.holder !== 255) {
          const team = game.teamOf[idol.holder] ?? Team.None;
          line = idol.holder === game.myId ? 'YOU HAVE THE IDOL · get it to the surface' : `IDOL: carried by ${name(idol.holder)}${team !== Team.None ? ' (' + TEAM_NAMES[team] + ')' : ''}`;
          color = team !== Team.None ? teamCss(team) : color;
        } else if (idol && game.dungeon && Math.hypot(idol.x - game.dungeon.idol.x, idol.y - game.dungeon.idol.y) > 12) line = 'IDOL: dropped!';
        if (evac?.state === Evac.Inbound) line += evac.eta > 0 ? ` · EXTRACTION IN ${Math.ceil(evac.eta / TICK_RATE)}s` : ' · EXTRACTION LANDING';
        else if (evac?.state === Evac.Landed) line += ' · EXTRACTION WAITING';
        else if (evac?.state === Evac.Moving) line += ' · EXTRACTION MOVING';
        ctx.fillStyle = color;
        ctx.fillText(line, W / 2, 67 * s);
      } else if (regicide) {
        // Regicide: the clock, then each side's king beneath it.
        ctx.fillText(`WAVE ${rs.wave} · REGICIDE · ${clock}`, W / 2, 25 * s);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(W / 2 - 190 * s, 32 * s, 380 * s, 22 * s);
        const king = (t: number) => {
          const id = rs.kings[t];
          const who = id === game.myId ? 'YOU' : (game.players.get(id)?.name ?? '?').replace(/^BOT /, '');
          return `♛ ${who}${game.myTeam === t && id !== game.myId ? ' (yours)' : ''}`;
        };
        ctx.textAlign = 'right';
        ctx.fillStyle = teamCss(Team.Red);
        ctx.fillText(king(Team.Red), W / 2 - 12 * s, 48 * s);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ccc';
        ctx.fillText('v', W / 2, 48 * s);
        ctx.textAlign = 'left';
        ctx.fillStyle = teamCss(Team.Green);
        ctx.fillText(king(Team.Green), W / 2 + 12 * s, 48 * s);
        ctx.textAlign = 'center';
        if (game.alive && game.isKing(game.myId) && secs > 6 * 60 - 5) big('YOU ARE KING', 'stay alive · if you fall, your side loses', teamCss(game.myTeam));
      } else if (teams) {
        // Last Team Standing: the clock, then red's and green's clones left beneath it.
        ctx.fillText(`WAVE ${rs.wave} · TEAMS · ${clock}`, W / 2, 25 * s);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(W / 2 - 150 * s, 32 * s, 300 * s, 22 * s);
        const you = (t: number) => (game.myTeam === t ? ' (YOU)' : '');
        ctx.textAlign = 'right';
        ctx.fillStyle = teamCss(Team.Red);
        ctx.fillText(`RED${you(Team.Red)} ${rs.teamLeft[0]}`, W / 2 - 12 * s, 48 * s);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ccc';
        ctx.fillText('v', W / 2, 48 * s);
        ctx.textAlign = 'left';
        ctx.fillStyle = teamCss(Team.Green);
        ctx.fillText(`${rs.teamLeft[1]} GREEN${you(Team.Green)}`, W / 2 + 12 * s, 48 * s);
        ctx.textAlign = 'center';
      } else ctx.fillText(`WAVE ${rs.wave} · ${rs.left} LEFT · ${clock}`, W / 2, 25 * s);
      if (!game.alive && !game.ride && !game.myCraft()) {
        const watching = game.spectate !== 255 ? `spectating ${name(game.spectate)} · click for next` : 'spectating';
        if (rs.out) big('FRAGGED', `(${watching})`, '#ff6050');
        else if ((regicide || extraction) && rs.inWave) {
          const back = Math.ceil(game.respawnTicks / TICK_RATE);
          big('FRAGGED', back > 0 ? `reinforcements in ${back}s by drop rocket · ${watching}` : 'drop rocket inbound', '#ff6050');
        }
        else if (!rs.inWave) big('STAND BY', `wave in progress · you're in the next one · ${watching}`, '#c8d0d8');
        else if (teams && game.myTeam !== Team.None) big('INBOUND', `you fight for ${TEAM_NAMES[game.myTeam].toLowerCase()} · drop rocket on its way`, teamCss(game.myTeam));
        else big('INBOUND', 'drop rocket on its way', '#ffd34a');
      }
    }
    ctx.textAlign = 'left';
  }

  /**
   * A big message as a retro console banner: block letters made of █,
   * a hard drop shadow, on a dark panel, with a prompt-style line under it.
   */
  private drawBanner(text: string, sub: string, color: string, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    const lines = bannerLines(text);
    const cols = Math.max(1, lines[0].length);
    // Monospace cells are ~0.6em wide: fit the banner in 86% of the screen.
    const px = Math.max(5, Math.min(15 * s, (W * 0.86) / (cols * 0.6)));
    const lineH = px;
    const bw = cols * px * 0.6;
    const bh = lines.length * lineH;
    const cy = H * 0.2;
    const subPx = Math.round(13 * s);
    const padX = 18 * s;
    const padY = 12 * s;
    ctx.fillStyle = 'rgba(4,8,6,0.72)';
    ctx.fillRect(W / 2 - bw / 2 - padX, cy - padY, bw + 2 * padX, bh + 2 * padY + (sub ? subPx * 1.8 : 0));
    ctx.strokeStyle = 'rgba(160,255,160,0.25)';
    ctx.lineWidth = Math.max(1, s);
    ctx.strokeRect(W / 2 - bw / 2 - padX + 3 * s, cy - padY + 3 * s, bw + 2 * padX - 6 * s, bh + 2 * padY + (sub ? subPx * 1.8 : 0) - 6 * s);
    ctx.font = `${px}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const x0 = W / 2 - bw / 2;
    const off = Math.max(1, Math.round(px * 0.18));
    for (let r = 0; r < lines.length; r++) {
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillText(lines[r], x0 + off, cy + r * lineH + off);
    }
    ctx.fillStyle = color;
    for (let r = 0; r < lines.length; r++) ctx.fillText(lines[r], x0, cy + r * lineH);
    if (sub) {
      ctx.font = `${subPx}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9fe89f';
      const cursor = Math.floor(performance.now() / 500) % 2 ? '_' : ' ';
      ctx.fillText(`> ${sub}${cursor}`, W / 2, cy + bh + padY * 0.9);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  private drawScoreboard(game: Game, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    const rows = [...game.players.values()].sort((a, b) => b.wins * 1000 + b.kills * 10 + b.gold - (a.wins * 1000 + a.kills * 10 + a.gold));
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
      ctx.fillText('CLONE              WINS KILLS DEATHS', cx, y0 + 20 * s);
      rows.slice(c * perCol, (c + 1) * perCol).forEach((p, i) => {
        ctx.fillStyle = p.id === game.myId ? '#fff' : p.color;
        const name = p.name.padEnd(18).slice(0, 18);
        ctx.fillText(`${name} ${String(p.wins).padStart(4)} ${String(p.kills).padStart(5)} ${String(p.deaths).padStart(6)}`, cx, y0 + 20 * s + (i + 1) * lineH);
      });
    }
  }
}

function countLoaded(game: Game): number {
  let n = 0;
  for (let i = 0; i < CHUNK_COUNT; i++) n += game.loaded[i];
  return n;
}
