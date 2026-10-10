import { ACTOR_H, ACTOR_RUN_SPEED, ACTOR_W, ACTOR_MAX_FUEL, ACTOR_MAX_HP, CHUNK, CHUNK_COUNT, CHUNK_SHIFT, CHUNKS_X, CHUNKS_Y, VIEW_HALF_H, VIEW_HALF_W, WORLD_H, WORLD_W, TICK_RATE, GRAVITY } from '../shared/constants.ts';
import { MAT_COLOR, Mat } from '../shared/materials.ts';
import { CALL_COST, TARANTULA_COST, WATCHDOG_COST, CallKind, Evac, GameMode, Phase, F_ALIVE, F_CLASS_SHIFT, F_FIRING, F_GROUND, F_JET, F_RELOAD, TEAM_NAMES, Team, classOfFlags, dequantizeAim } from '../shared/protocol.ts';
import { EVAC_H, EVAC_W, SPIKE_DEPTH, TrapKind } from '../shared/dungeon.ts';
import { sightLine } from '../shared/scope.ts';
import { BIOME_NAMES } from '../shared/worldgen.ts';
import { lineOfFire } from './scope.ts';
import { hash2 } from '../shared/rng.ts';
import { LASER_MAX, PROJ, ProjKind, PROJ_BUILD, HEAL_R, HEAL_SPREAD, MEND_TICKS, laserWidth, SHOULDER_X, SHOULDER_Y, WEAPONS, WeaponId } from '../shared/weapons.ts';
import { BUILD_GRID, BUILD_REACH, BUILD_RESULT_TEXT, BuildResult, PIECES, snapPiece } from '../shared/build.ts';
import { type CraftView, type Game, type RemoteView, type ShipView, type TankView, TEAM_COLORS, kdRatio } from './game.ts';
import type { RoundState } from '../shared/frame.ts';
import { bannerLines, layoutSub } from './banner.ts';
import type { InputState } from './input.ts';
import type { Net } from './net.ts';
import { ClassId, DROID_LEGS, DROID_PARTS, DroidPart, PARTS, Part, has } from '../shared/body.ts';
import { CRAFT_H, CRAFT_HP, CraftPart } from '../shared/craft.ts';
import { BTN_FIRE, HIP_X, HIP_Y, STANCE_DROP, STANCE_LEAN, Stance, shoulderAt } from '../shared/actor.ts';
import { BAY_AT, ENGINE_NOZZLE_Y, ENGINE_X, SHIP_H, SHIP_HP, SHIP_MISSION_NAMES, SHIP_W, ShipPart, TURRET_AT, hasShipPart } from '../shared/dropship.ts';
import { CANNON_INTERVAL, CANNON_PIVOT, SMG_LEN, SMG_PIVOT, TANK_H, TANK_HP, TANK_PARTS, tankSink, tankW, tankH, tankMaxHp, isDog, TANK_MAX_FUEL, TANK_PART_HP, TANK_W, TankPart, cannonAngle, hasTankPart, gunPivotY, isPet, isSpider, SPIDER_LASER_PIVOT, SPIDER_RACK_PIVOT, TARANTULA_SCALE } from '../shared/tank.ts';
import { ParticleLayer } from './particle-layer.ts';
import { backWallColor, dripColor, structColor, frostColor, grassBlade, soilColor } from './texture.ts';
import { drawRelics } from './relic-art.ts';
import { drawBackwall } from './backwall.ts';
import { drawDecor } from './decor-art.ts';
import type { Terrain } from '../shared/terrain.ts';
import { RACK_MOUTHS, RACK_PIVOT, TarantulaArt } from './tarantula-sprites.ts';
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

/**
 * The sky of an alien world, Mars-like: a dark violet zenith, dusty rose,
 * then butterscotch haze down to the horizon (world y 500 at the bottom).
 */
function skyGradient(ctx: CanvasRenderingContext2D, offY: number, z: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, offY + -300 * z, 0, offY + 500 * z);
  g.addColorStop(0, '#1e1030');
  g.addColorStop(0.4, '#6a3f5c');
  g.addColorStop(0.72, '#c27a5a');
  g.addColorStop(0.9, '#e0a070');
  g.addColorStop(1, '#ebb784');
  return g;
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

/**
 * Over the rock face in a dug-out space: soft shadow where it meets the
 * ground, deepest under an overhang (as if the cave were lit from its
 * mouth). Black at that much alpha, else transparent.
 */
function caveShade(t: Terrain, x: number, y: number): number {
  const R = 7;
  let a = 0;
  for (const [dx, dy, w] of SHADE_DIRS) {
    let d = 1;
    while (d <= R && t.get(x + dx * d, y + dy * d) === Mat.Air) d++;
    if (d <= R) a = Math.max(a, (1 - (d - 1) / R) * w);
  }
  if (a <= 0.02) return 0;
  return ((Math.round(a * 255) & 255) << 24) | 0x060408;
}
const SHADE_DIRS: readonly [number, number, number][] = [
  [0, -1, 0.62],
  [-1, 0, 0.42],
  [1, 0, 0.42],
  [0, 1, 0.3],
];

export class Renderer {
  /** Scratch: the underground rects behind the terrain this frame (x, y, w, h). */
  private readonly backRects: number[] = [];
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
  /** Not scoped, but the aim assist has snapped onto something: the scope's laser and lock show anyway. */
  private assistSight = false;
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
    const skyline = game.skyline;
    for (let y = 0; y < CHUNK; y++) {
      const wy = oy + y;
      const row = wy * WORLD_W + ox;
      for (let x = 0; x < CHUNK; x++) {
        const m = t.mat[row + x];
        if (m === Mat.Air) {
          // Inside a bunker: its back wall instead of the open backdrop.
          const bd = backdrop[row + x];
          if (bd) px[y * CHUNK + x] = backWallColor(t, bd, ox + x, wy);
          else if (wy > skyline[ox + x] + 3) px[y * CHUNK + x] = caveShade(t, ox + x, wy);
          else px[y * CHUNK + x] = grassBlade(t, ox + x, wy);
          continue;
        }
        const wx = ox + x;
        let c: number;
        if (m === Mat.Concrete || m === Mat.Metal || m === Mat.Cobble || m === Mat.Glyph || m === Mat.Iron || m === Mat.Sandbag || m === Mat.Door) c = structColor(t, m, wx, wy);
        else if (m === Mat.Grass || m === Mat.Snow) c = frostColor(t, m, wx, wy);
        else if (m === Mat.Dripstone) c = dripColor(t, wx, wy);
        else {
          const exposed = wy > 0 && t.mat[row + x - WORLD_W] === Mat.Air;
          c = soilColor(m, wx, wy, PALETTE[m * 8 + (hash2(wx, wy) & 3) + (exposed ? 4 : 0)]);
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
    this.game = game;
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
    const flying = game.alive ? game.pilotedShip() : null;
    const dogged = game.alive ? game.remoteDog() : null;
    this.scoped = game.alive && input.scoping && !game.drive && !flying && !dogged; // in a tank, right mouse is the cannon; flying, it's the bombs
    if (dogged) {
      // Driving the watchdog by remote: the view rides with it, looking toward the mouse.
      const lookX = (input.mouseX * (W / innerWidth) - W / 2) / z;
      const lookY = (input.mouseY * (H / innerHeight) - H / 2) / z;
      this.camX += (dogged.x + tankW(dogged) / 2 + lookX * 0.3 - this.camX) * 0.25;
      this.camY += (dogged.y + tankH(dogged) / 2 + lookY * 0.3 - this.camY) * 0.25;
    } else if (flying) {
      // Remote-piloting our dropship: the view rides with it, looking ahead
      // toward the mouse and down at the ground it's working over.
      const lookX = (input.mouseX * (W / innerWidth) - W / 2) / z;
      const lookY = (input.mouseY * (H / innerHeight) - H / 2) / z;
      this.camX += (flying.x + SHIP_W / 2 + lookX * 0.3 - this.camX) * 0.2;
      this.camY += (flying.y + SHIP_H / 2 + 50 + lookY * 0.3 - this.camY) * 0.2;
    } else if (this.scoped) {
      // Scoping: push the view out along the barrel by the weapon's scope
      // distance (the server moves this client's interest area the same way).
      // It stops where the line of sight does: never through or past terrain.
      const mx = this.camX + (input.mouseX * (W / innerWidth) - W / 2) / z;
      const my = this.camY + (input.mouseY * (H / innerHeight) - H / 2) / z;
      const sh = shoulderAt(selfX, selfY, b.stance, game.aimMark ? game.aimMark.x < selfX + ACTOR_W / 2 : mx < selfX + ACTOR_W / 2, this.shPt);
      // (Locked on: down the line to them.) Clones stop the line as walls do.
      const mouseAim = Math.atan2(my - sh.y, mx - sh.x);
      const aim = game.lockAim ?? mouseAim;
      const reach = lineOfFire(game, sh.x, sh.y, aim, WEAPONS[game.weapon]?.scope ?? 0).dist;
      this.sight = { x: sh.x, y: sh.y, aim, mouseAim, cone: WEAPONS[game.weapon]?.lockCone ?? 0, dist: sightLine(game.terrain, sh.x, sh.y, aim, 2000) };
      // Snapped onto someone (auto-aim or the scope's lock): the scope goes to them, however far.
      const am = game.aimMark;
      const tx = am ? am.x : sh.x + Math.cos(aim) * reach;
      const ty = am ? am.y : sh.y + Math.sin(aim) * reach;
      this.camX += (tx - this.camX) * 0.12;
      this.camY += (ty - this.camY) * 0.12;
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
    // Snapped by the aim assist (unscoped): the same laser and lock the scope shows.
    this.assistSight = false;
    if (!this.scoped && !flying && !dogged && game.alive && !game.drive && game.lockAim !== null && game.aimMark) {
      const sh = shoulderAt(selfX, selfY, b.stance, game.aimMark.x < selfX + ACTOR_W / 2, this.shPt);
      this.sight = { x: sh.x, y: sh.y, aim: game.lockAim, mouseAim: game.lockAim, cone: 0, dist: 0 };
      this.assistSight = true;
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

    // Background: an alien sky, fading into deep cave dark by world depth.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = skyGradient(ctx, offY, z);
    ctx.fillRect(0, 0, W, H);
    // Clouds, blue ranges and mesas in parallax over the sky.
    this.backdrop.draw(ctx, W, H, (W / 2 - offX) / z, (H / 2 - offY) / z, z, now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.setTransform(z, 0, 0, z, offX, offY);
    ctx.imageSmoothingEnabled = false;

    // Cave backdrop: below each column's skyline, dug-out space shows the rock face behind the ground.
    const bx0 = Math.max(0, Math.floor(camX - halfW));
    const bx1 = Math.min(WORLD_W - 1, Math.ceil(camX + halfW));
    const bottom = Math.min(WORLD_H, camY + halfH + 1);
    const rects = this.backRects;
    rects.length = 0;
    let runStart = bx0;
    for (let x = bx0 + 1; x <= bx1 + 1; x++) {
      if (x > bx1 || game.skyline[x] !== game.skyline[runStart]) {
        const top = game.skyline[runStart] + 3;
        if (top < bottom) rects.push(runStart, top, x - runStart, bottom - top);
        runStart = x;
      }
    }
    drawBackwall(ctx, rects, WORLD_H);

    // Now and then, on a cave's back wall: a trace of whoever was here first.
    if (game.relics.length) drawRelics(ctx, game.relics, camX - halfW, camY - halfH, camX + halfW, camY + halfH);

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

    // The bunkers' fittings: lamps, pipes, signs and the like, on their back walls.
    if (game.decor.length) drawDecor(ctx, game.terrain, game.decor, camX - halfW, camY - halfH, camX + halfW, camY + halfH, now);

    // Bunker doors: a lamp over each, green if it opens for us, red if not
    // (amber, blinking, while it moves); gone once the door's blown out.
    for (const d of game.doors) {
      if (d.x1 < camX - halfW - 8 || d.x0 > camX + halfW + 8 || d.y1 < camY - halfH || d.y0 > camY + halfH + 8) continue;
      const t = game.terrain;
      const cx = (d.x0 + d.x1) >> 1;
      let shut = 0;
      for (let y = d.y0; y < d.y1; y++) if (t.get(cx, y) === Mat.Door) shut++;
      if (t.get(cx, d.y0 - 1) === Mat.Air) continue; // (blown out: the blast takes the housing over it)
      const ours = game.myTeam === Team.None || game.myTeam === d.team;
      const moving = shut > 0 && shut < d.y1 - d.y0;
      const ly = d.y0 - 4;
      ctx.fillStyle = '#1a1a1e';
      ctx.fillRect(cx - 2, ly - 1, 4, 3);
      ctx.fillStyle = moving ? ((now / 140) % 2 < 1 ? '#ffb020' : '#5a3a08') : ours ? '#50ff70' : '#ff3a30';
      ctx.fillRect(cx - 1, ly, 2, 1);
      ctx.fillStyle = moving ? 'rgba(255,176,32,0.18)' : ours ? 'rgba(80,255,112,0.16)' : 'rgba(255,58,48,0.16)';
      ctx.fillRect(cx - 3, ly - 2, 6, 5);
    }

    // Extraction: the labyrinth's traps, and the extraction rocket.
    if (game.dungeon) this.drawTraps(ctx, game, camX - halfW, camY - halfH, camX + halfW, camY + halfH);
    const rsE = game.roundState;
    if (rsE?.evac && rsE.evac.state !== Evac.None) this.drawEvac(ctx, rsE.evac, now);

    // Drop rockets.
    for (const c of game.craftViews()) this.drawCraft(ctx, c, game, now);
    const ride = game.myCraft(alpha);
    if (ride && game.ride) this.drawCraft(ctx, ride, game, now);

    // Landmines: ours and our side's plain to see (a light winks green once armed, amber
    // while arming); the enemy's only a dull, half-buried disc for those who look.
    for (const m of game.mineList) {
      const ours = m.owner === game.myId || (m.team !== Team.None && m.team === game.myTeam);
      const x = m.x;
      const y = m.y;
      ctx.fillStyle = ours ? '#141a10' : 'rgba(20,24,16,0.75)';
      ctx.fillRect(x - 3, y - 2, 7, 2);
      ctx.fillStyle = ours ? '#5a6a34' : 'rgba(70,78,52,0.7)';
      ctx.fillRect(x - 2, y - 2, 5, 1);
      if (ours) {
        ctx.fillStyle = !m.armed ? ((now / 120) % 2 < 1 ? '#ffb020' : '#503008') : (now / 600) % 1 < 0.15 ? '#60ff60' : '#1a4a1a';
        ctx.fillRect(x, y - 3, 1, 1);
      }
    }

    // Tanks (behind the clones, so a clone walking past shows in front).
    const wmx = (input.mouseX * (W / innerWidth) - offX) / z;
    const wmy = (input.mouseY * (H / innerHeight) - offY) / z;
    for (const t of game.tankViews(alpha)) {
      const mine = (t.slot === game.driveSlot && !!game.drive) || (t.slot === game.rc && game.alive);
      // (Driving it ourselves: the guns follow our mouse now, not the last word from the server.)
      const aim = mine ? (game.rc === t.slot && game.lockAim !== null ? game.lockAim : Math.atan2(wmy - gunPivotY(t), wmx - (t.x + tankW(t) / 2))) : t.aim;
      if (isSpider(t)) this.drawTarantula(ctx, t, mine ? Math.cos(aim) < 0 : t.faceLeft, aim, game, now);
      else this.drawTank(ctx, t, mine ? Math.cos(aim) < 0 : t.faceLeft, aim, game, now);
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
      this.drawActor(ctx, v.x, v.y, aimR, v.flags, info?.rgb ?? 0xcccccc, v.weapon, v.moving, now, v.parts, v.stance, lean, v.faction, game.kickOf(v.id, now), v.id);
      // Someone charging a laser: their muzzle glows (we can't see how full, so it pulses).
      if (v.weapon === WeaponId.Laser && v.flags & F_FIRING) {
        const sh = shoulderAt(v.x, v.y, v.stance, Math.cos(aimR) < 0, this.shPt);
        this.drawLaserCharge(ctx, sh.x + Math.cos(aimR) * WEAPONS[WeaponId.Laser].muzzle, sh.y + Math.sin(aimR) * WEAPONS[WeaponId.Laser].muzzle, 0.35 + 0.25 * Math.sin(now / 120), now);
      }
    }
    // Scoped: the line a shot would take, to the wall it would hit or the
    // first clone in its way (bracketed): only what you can actually hit.
    if ((this.scoped || this.assistSight) && this.sight) this.drawSightLine(ctx, game, now);

    // Own clone (hidden inside its tank while driving).
    if (game.alive && !game.drive) {
      const wx = (input.mouseX * (W / innerWidth) - offX) / z;
      const wy = (input.mouseY * (H / innerHeight) - offY) / z;
      // (Snapped onto someone: facing them, the gun on that shoulder, as the shot will leave it.)
      const mySh = shoulderAt(selfX, selfY, b.stance, game.aimMark ? game.aimMark.x < selfX + ACTOR_W / 2 : wx < selfX + ACTOR_W / 2, this.shPt);
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
      this.drawActor(ctx, selfX, selfY, myAim, flags, game.players.get(game.myId)?.rgb ?? 0xffffff, game.weapon, Math.abs(b.vx) > 5, now, game.parts, b.stance, lean, b.faction, game.kickOf(game.myId, now), game.myId);
      if (game.laserCharge > 0) {
        const m = WEAPONS[WeaponId.Laser].muzzle;
        this.drawLaserCharge(ctx, mySh.x + Math.cos(myAim) * m, mySh.y + Math.sin(myAim) * m, game.laserCharge / LASER_MAX, now);
      }
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
    const surfable = game.boardableTank() ? null : game.surfableTank();
    const boardable = game.boardableTank() ?? surfable;
    if (boardable) {
      ctx.font = `${Math.max(4, Math.round(11 / z))}px ui-monospace, monospace`;
      const label = surfable ? `${input.touch ? '⬆' : '[3]'} ride on top` : `${input.touch ? '⬆' : '[3]'} climb in`;
      const tx = boardable.x + tankW(boardable) / 2;
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
      } else if (k === 14) {
        // AT missile: an olive body with a red seeker head and fins, a flame out the back.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.ang[i] || Math.atan2(p.vy[i], p.vx[i]));
        const len = 3 + ((now / 29 + i) % 3);
        ctx.fillStyle = '#ff8a24';
        ctx.fillRect(-5 - len, -1, len, 2);
        ctx.fillStyle = '#fffbe0';
        ctx.fillRect(-5 - len + 1, -0.5, len - 1, 1);
        ctx.fillStyle = '#3c4628';
        ctx.fillRect(-5, -1.5, 8, 3);
        ctx.fillRect(-5, -2.5, 2, 5);
        ctx.fillStyle = (now / 90) % 2 < 1 ? '#ff3030' : '#a01010';
        ctx.fillRect(3, -1, 2, 2);
        ctx.restore();
      } else if (k === ProjKind.SpiderMissile) {
        // Tarantula missile: a slim grey dart, a yellow nose band, a flame out the back.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(p.vy[i], p.vx[i]));
        const len = 2 + ((now / 27 + i) % 3);
        ctx.fillStyle = '#ff8a24';
        ctx.fillRect(-4 - len, -0.75, len, 1.5);
        ctx.fillStyle = '#fffbe0';
        ctx.fillRect(-4 - len + 1, -0.35, len - 1, 0.7);
        ctx.fillStyle = '#8a9096';
        ctx.fillRect(-4, -1, 6, 2);
        ctx.fillStyle = '#4d5359';
        ctx.fillRect(-4, -1.8, 1.5, 3.6);
        ctx.fillStyle = '#d8b030';
        ctx.fillRect(1, -1, 1, 2);
        ctx.fillStyle = '#30353a';
        ctx.fillRect(2, -0.6, 1, 1.2);
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
      } else if (k === ProjKind.Bolt) {
        // Blaster bolt: a short hot-cyan dart of light with a white core.
        const sp = Math.hypot(p.vx[i], p.vy[i]) + 1e-6;
        const dx = p.vx[i] / sp;
        const dy = p.vy[i] / sp;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(80,220,255,0.45)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - dx * 9, y - dy * 9);
        ctx.stroke();
        ctx.strokeStyle = '#eaffff';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - dx * 7, y - dy * 7);
        ctx.stroke();
        ctx.lineCap = 'butt';
      } else if (k === ProjKind.AutoShell) {
        // Autocannon shell: a squat steel slug, a glowing tracer base.
        ctx.fillStyle = '#2c2e2a';
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        ctx.fillStyle = '#ffc060';
        ctx.fillRect(x - p.vx[i] * 0.005 - 0.75, y - p.vy[i] * 0.005 - 0.75, 1.5, 1.5);
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

    // Health waves: a ring of nanobots racing out from whoever used the kit,
    // then every clone it caught (its side's) mending in a drift of green crosses.
    for (let i = game.healWaves.length - 1; i >= 0; i--) {
      const hw = game.healWaves[i];
      const age = (now - hw.at) / 1000;
      const spread = HEAL_SPREAD / 30;
      if (age > MEND_TICKS / 30) {
        game.healWaves.splice(i, 1);
        continue;
      }
      if (age < spread * 1.6) {
        const u = Math.min(1, age / spread);
        const r = 4 + (HEAL_R - 4) * (1 - (1 - u) * (1 - u));
        const a = age < spread ? 1 : 1 - (age - spread) / (spread * 0.6);
        ctx.lineWidth = 6;
        ctx.strokeStyle = `rgba(90,240,190,${0.18 * a})`;
        ctx.beginPath();
        ctx.arc(hw.x, hw.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(210,255,236,${0.85 * a})`;
        ctx.beginPath();
        ctx.arc(hw.x, hw.y, r, 0, Math.PI * 2);
        ctx.stroke();
        // Crosses riding the front.
        for (let k = 0; k < 14; k++) {
          const th = (k / 14) * Math.PI * 2 + age * 1.5;
          const px = Math.round(hw.x + Math.cos(th) * r);
          const py = Math.round(hw.y + Math.sin(th) * r);
          ctx.fillStyle = k % 2 ? `rgba(120,255,170,${a})` : `rgba(240,255,250,${a})`;
          ctx.fillRect(px - 1, py, 3, 1);
          ctx.fillRect(px, py - 1, 1, 3);
        }
        if (age < 0.12) {
          ctx.fillStyle = `rgba(200,255,230,${0.5 * (1 - age / 0.12)})`;
          ctx.beginPath();
          ctx.arc(hw.x, hw.y, 14, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // The mending: everyone caught, by this client's reckoning (its side, inside the ring).
      const left = 1 - age / (MEND_TICKS / 30);
      const mending: { x: number; y: number; id: number }[] = views.map((v) => ({ x: v.x + 4, y: v.y + 7, id: v.id }));
      if (game.alive) mending.push({ x: game.body.x + 4, y: game.body.y + 7, id: game.myId });
      for (const m of mending) {
        const t = game.teamOf[m.id] ?? 255;
        if (m.id !== hw.owner && (hw.team === 255 || t !== hw.team)) continue;
        if (Math.hypot(m.x - hw.x, m.y - hw.y) > HEAL_R + 40) continue;
        for (let k = 0; k < 3; k++) {
          const ph = (now / 900 + k / 3 + m.id * 0.17) % 1;
          const px = Math.round(m.x + Math.sin(ph * 9 + k * 2 + m.id) * 5);
          const py = Math.round(m.y + 4 - ph * 16);
          ctx.fillStyle = `rgba(110,255,160,${(1 - ph) * left})`;
          ctx.fillRect(px - 1, py, 3, 1);
          ctx.fillRect(px, py - 1, 1, 3);
        }
      }
    }

    // Laser beams: a hot magenta glow around a white core, wider the stronger
    // the charge, fading out (a strong beam lingers longer).
    for (let i = game.laserBeams.length - 1; i >= 0; i--) {
      const bm = game.laserBeams[i];
      const life = 220 + 520 * bm.power;
      const t = (now - bm.at) / life;
      if (t >= 1) {
        game.laserBeams.splice(i, 1);
        continue;
      }
      const w = laserWidth(bm.power) * 2 * (1 - t * 0.6);
      const a = 1 - t;
      ctx.lineCap = 'round';
      for (const [k, col] of [
        [2.2, `rgba(255,40,140,${0.25 * a})`],
        [1.2, `rgba(255,90,190,${0.6 * a})`],
        [0.45, `rgba(255,240,255,${a})`],
      ] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(0.5, w * k);
        ctx.beginPath();
        ctx.moveTo(bm.x0, bm.y0);
        ctx.lineTo(bm.x1, bm.y1);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
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
      // Our side's dropships say what they're up to.
      const ours = sh.owner === game.myId || (sh.team !== Team.None && sh.team === game.myTeam);
      const doing = sh.piloted ? 'REMOTE PILOT' : SHIP_MISSION_NAMES[sh.mission];
      const tag = `${info?.name ?? '?'}'s dropship  ✸${sh.bombs}${ours && !sh.leaving ? `  · ${doing}` : ''}`;
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
    // Enemies our dropships have eyes on: red brackets on them, or an arrow
    // at the screen's edge pointing their way.
    const spotted = game.spottedNow();
    if (spotted.length) {
      const pulse = 0.65 + 0.35 * Math.sin(now / 160);
      ctx.strokeStyle = `rgba(255,90,60,${pulse})`;
      ctx.fillStyle = `rgba(255,90,60,${pulse})`;
      ctx.lineWidth = Math.max(1, 1.5 * dpr);
      const live = new Map(views.map((v) => [v.id, v]));
      for (const e of spotted) {
        const v = live.get(e.id);
        const wx = v ? v.x + ACTOR_W / 2 : e.x;
        const wy = v ? v.y + ACTOR_H / 2 : e.y;
        const sx = offX + wx * z;
        const sy = offY + wy * z;
        const m = 18 * dpr;
        if (sx > m && sx < W - m && sy > m && sy < H - m) {
          const r = (ACTOR_H / 2 + 3) * z;
          const c = r * 0.45;
          for (const [kx, ky] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            ctx.beginPath();
            ctx.moveTo(sx + kx * r, sy + ky * (r - c));
            ctx.lineTo(sx + kx * r, sy + ky * r);
            ctx.lineTo(sx + kx * (r - c), sy + ky * r);
            ctx.stroke();
          }
        } else {
          const cx0 = W / 2;
          const cy0 = H / 2;
          const a = Math.atan2(sy - cy0, sx - cx0);
          const t = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
          const ax = cx0 + Math.cos(a) * t;
          const ay = cy0 + Math.sin(a) * t;
          ctx.beginPath();
          ctx.moveTo(ax + Math.cos(a) * 9 * dpr, ay + Math.sin(a) * 9 * dpr);
          ctx.lineTo(ax + Math.cos(a + 2.5) * 7 * dpr, ay + Math.sin(a + 2.5) * 7 * dpr);
          ctx.lineTo(ax + Math.cos(a - 2.5) * 7 * dpr, ay + Math.sin(a - 2.5) * 7 * dpr);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    // Tanks: who's driving, and how much hull is left.
    for (const t of game.tankViews(alpha)) {
      const sx = offX + (t.x + tankW(t) / 2) * z;
      const sy = offY + (t.y - (isDog(t) ? 14 : isSpider(t) ? 4 : 8)) * z - 10 * dpr;
      // A watchdog (or a tarantula) wears its owner's name; a tank its driver's.
      const who = isPet(t) ? t.owner : t.pilot;
      if (who !== 255 && (who !== game.myId || isPet(t))) {
        const info = game.players.get(who);
        const tag = isPet(t) ? `${who === game.myId ? 'your' : `${info?.name ?? '?'}'s`} ${isSpider(t) ? 'tarantula' : 'watchdog'}` : (info?.name ?? '?');
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(tag, sx + dpr, sy + dpr);
        ctx.fillStyle = info?.color ?? '#ccc';
        ctx.fillText(tag, sx, sy);
      }
      const max = tankMaxHp(t);
      if (t.hp < max) {
        const w = (isDog(t) ? 28 : isSpider(t) ? 48 : 40) * dpr;
        ctx.fillStyle = '#300';
        ctx.fillRect(sx - w / 2, sy + 3 * dpr, w, 3 * dpr);
        ctx.fillStyle = t.hp > max * 0.35 ? '#d8c040' : '#e33';
        ctx.fillRect(sx - w / 2, sy + 3 * dpr, (w * t.hp) / max, 3 * dpr);
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

    // The aim assist's target: a small red reticle on whatever the aim has snapped to.
    const am = game.alive ? game.aimMark : null;
    if (am) {
      const tx = offX + am.x * z;
      const ty = offY + am.y * z;
      const r = (5 + Math.sin(now / 120)) * dpr;
      ctx.strokeStyle = 'rgba(255,70,50,0.95)';
      ctx.lineWidth = Math.max(1, 1.5 * dpr);
      ctx.beginPath();
      ctx.arc(tx, ty, r, 0, Math.PI * 2);
      for (const [kx, ky] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(tx + kx * (r + 1 * dpr), ty + ky * (r + 1 * dpr));
        ctx.lineTo(tx + kx * (r + 4 * dpr), ty + ky * (r + 4 * dpr));
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,70,50,0.95)';
      ctx.fillRect(tx - dpr, ty - dpr, 2 * dpr, 2 * dpr);
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

    if (game.laserCharge > 0) {
      // The laser's charge: a ring filling round the crosshair, and how full.
      const f = game.laserCharge / LASER_MAX;
      const mx = input.mouseX * dpr;
      const my = input.mouseY * dpr;
      const r = 16 * dpr;
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = f >= 1 ? '#ffffff' : '#ff5ab4';
      ctx.beginPath();
      ctx.arc(mx, my, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      ctx.stroke();
      ctx.font = `bold ${Math.round(10 * dpr)}px ui-monospace, monospace`;
      ctx.fillStyle = '#ffd0ec';
      ctx.textAlign = 'center';
      ctx.fillText(f >= 1 ? 'MAX' : `${Math.round(f * 100)}%`, mx, my + r + 12 * dpr);
      ctx.textAlign = 'left';
    }
    if (this.scoped) {
      // Scope: a dark vignette, a spotlight with a fine reticle in it. Locked
      // onto someone, it's centred on them (wherever the pointer or thumb
      // is), gliding over when the target changes; otherwise on the pointer.
      const am = game.aimMark;
      const tx = am ? am.x * z + offX : input.mouseX * dpr;
      const ty = am ? am.y * z + offY : input.mouseY * dpr;
      if (!this.spot || !this.spotWasScoped) this.spot = { x: tx, y: ty };
      const k = am ? 0.35 : 1;
      this.spot.x += (tx - this.spot.x) * k;
      this.spot.y += (ty - this.spot.y) * k;
      const mx = this.spot.x;
      const my = this.spot.y;
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

    this.spotWasScoped = this.scoped;

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
    ctx.fillStyle = skyGradient(ctx, offY, z);
    ctx.fillRect(0, 0, W, H);
    const now = performance.now();
    this.backdrop.draw(ctx, W, H, 2048 + now / 60, camY, z, now);
  }

  /**
   * A spider droid: a squat gunmetal chassis slung between six tin legs,
   * three fanned out behind and three in front, a domed turret on top (the
   * gun goes on it, drawn with the clones' guns). It walks on a tripod gait
   * (alternate legs lift and swing) keyed to the distance it has covered, so
   * its feet don't skate; in the air the legs hang. Legs shot off leave
   * sparking sockets; with its plating gone the chassis shows scorched.
   */
  /** The game being drawn (for the droids' feet to find the ground). */
  private game: Game | null = null;
  /** Each droid's feet, planted in the world, by player id (see droidFeet). */
  private readonly droidGaits = new Map<number, DroidGait>();
  private readonly tArt = new TarantulaArt();

  /**
   * Where a droid's six feet are this frame (world cells), spider style.
   * Each foot stays planted where it landed until the body has moved on far
   * enough from it; then it steps: a quick lifted arc onto a new hold ahead,
   * on the ground or, clinging, the wall. The legs step in two alternating
   * tripods (as a real spider's do), never all at once. In the air the feet
   * curl in under it. Also how much the body dips as its weight shifts.
   */
  private droidFeet(id: number, x: number, y: number, left: boolean, grounded: boolean, now: number, k = 1): { x: Float32Array; y: Float32Array; bob: number; tilt: number } {
    // (`k`: its scale. A tarantula is a droid three times over: longer strides, slower steps.)
    let gait = this.droidGaits.get(id);
    if (!gait) {
      gait = { x: new Float32Array(6), y: new Float32Array(6), fx: new Float32Array(6), fy: new Float32Array(6), t: new Float32Array(6).fill(1), at: now, init: false, lx: x, ly: y, bob: 0, tilt: 0 };
      this.droidGaits.set(id, gait);
      if (this.droidGaits.size > 80) this.droidGaits.delete(this.droidGaits.keys().next().value!);
    }
    const dt = Math.min(0.1, Math.max(0, (now - gait.at) / 1000));
    gait.at = now;
    const vx = dt > 0 ? (x - gait.lx) / dt : 0;
    gait.lx = x;
    gait.ly = y;
    const terrain = this.game?.terrain;
    const solid = (cx: number, cy: number) => !!terrain && terrain.isSolid(Math.floor(cx), Math.floor(cy));
    const cx = x + (ACTOR_W * k) / 2;
    // On a wall (in the air, a wall at its side): its feet grip the wall.
    let wall = 0;
    if (!grounded) {
      for (const side of [1, -1]) {
        const wx = side > 0 ? x + ACTOR_W * k : x - 1;
        if (solid(wx, y + 4 * k) || solid(wx, y + 10 * k)) {
          wall = side;
          break;
        }
      }
    }
    // The ground's surface in column `fx` near height `fy`: down to it, or (inside it) up out of it.
    const surface = (fx: number, fy: number, depth: number): number => {
      let yy = Math.floor(fy);
      if (solid(fx, yy)) {
        for (let u = 0; u < depth && solid(fx, yy - 1); u++) yy--;
        return yy;
      }
      for (let d = 0; d < depth; d++, yy++) if (solid(fx, yy + 1)) return yy + 1;
      return fy; // (nothing there: stand as on the flat)
    };
    // The lie of the land under it: the slope between the ground ahead and
    // behind (where its outer feet stand). Its body pitches to match (nose
    // up a rise, down a fall); on a wall it rears up the face.
    const foot = y + ACTOR_H * k;
    let slope = 0;
    if (grounded) {
      const span = 9 * k;
      const gl = surface(cx - span, foot, 14 * k);
      const gr = surface(cx + span, foot, 14 * k);
      slope = Math.max(-DROID_MAX_TILT, Math.min(DROID_MAX_TILT, Math.atan2(gr - gl, 2 * span)));
    }
    const want = wall !== 0 ? -wall * DROID_WALL_TILT : slope;
    gait.tilt += (want - gait.tilt) * (gait.init ? Math.min(1, dt * 10) : 1);
    const tilt = gait.tilt;
    // Shorter strides climbing, longer going down (by how steep it is, the way it's heading).
    const uphill = Math.abs(vx) > 2 ? Math.max(-1, Math.min(1, (-Math.sin(slope) * Math.sign(vx)) / Math.sin(DROID_MAX_TILT))) : 0;
    const stride = DROID_STRIDE * k * (1 - 0.4 * uphill);
    // Its legs lift perpendicular to its body (off the slope, off the wall).
    const upX = Math.sin(tilt);
    const upY = -Math.cos(tilt);
    const tx = (leg: number): [number, number] => {
      const rest = DROID_REST[leg] * (left ? -1 : 1) * k;
      if (wall !== 0) {
        // Up and down the wall, the front legs reaching up it.
        const wx = wall > 0 ? x + ACTOR_W * k + 0.5 : x - 0.5;
        const along = DROID_REST[leg] * 0.85 * k;
        return [wx, y + 9 * k - along];
      }
      if (!grounded) return [cx + rest * 0.45, y + (ACTOR_H + 1.5) * k]; // tucked in, dangling
      // Spread along the slope, ahead of where it's going (more the faster), on the ground there.
      const fx = cx + rest * Math.cos(slope) + vx * 0.07;
      return [fx, surface(fx, foot + rest * Math.sin(slope), 16 * k)];
    };
    let stepping = 0;
    for (let leg = 0; leg < 6; leg++) if (gait.t[leg] < 1) stepping++;
    const busy = [0, 0];
    for (let leg = 0; leg < 6; leg++) if (gait.t[leg] < 1) busy[DROID_TRIPOD[leg]]++;
    for (let leg = 0; leg < 6; leg++) {
      const [gx, gy] = tx(leg);
      if (!gait.init || (!grounded && wall === 0)) {
        // First sight of it, or in the air: the feet go straight where they belong.
        const k = gait.init ? Math.min(1, dt * 14) : 1;
        gait.x[leg] += (gx - gait.x[leg]) * k;
        gait.y[leg] += (gy - gait.y[leg]) * k;
        if (!gait.init) {
          gait.x[leg] = gx;
          gait.y[leg] = gy;
        }
        gait.t[leg] = 1;
        continue;
      }
      if (gait.t[leg] < 1) {
        // Mid-step: an arc from where it lifted to the hold ahead.
        gait.t[leg] = Math.min(1, gait.t[leg] + dt / (DROID_STEP_TIME * Math.sqrt(k)));
        const t = gait.t[leg];
        const e = t * t * (3 - 2 * t);
        const lift = Math.sin(Math.PI * t) * 2.2 * k;
        gait.x[leg] = gait.fx[leg] + (gx - gait.fx[leg]) * e + upX * lift;
        gait.y[leg] = gait.fy[leg] + (gy - gait.fy[leg]) * e + upY * lift;
        continue;
      }
      const off = Math.hypot(gait.x[leg] - gx, gait.y[leg] - gy);
      // Way off (it teleported, or fell): just put it there.
      if (off > 14 * k) {
        gait.x[leg] = gx;
        gait.y[leg] = gy;
        continue;
      }
      // Strayed too far from where it belongs: step, if the other tripod's planted.
      const other = 1 - DROID_TRIPOD[leg];
      // (Left far behind, at a sprint, it steps whatever the others are doing.)
      if ((off > stride && busy[other] === 0) || off > stride * 2.2) {
        gait.fx[leg] = gait.x[leg];
        gait.fy[leg] = gait.y[leg];
        gait.t[leg] = 0;
        busy[DROID_TRIPOD[leg]]++;
      }
    }
    gait.init = true;
    // The body dips a touch as it shifts its weight onto the planted legs.
    const target = stepping > 0 ? 0.35 : 0;
    gait.bob += (target - gait.bob) * Math.min(1, dt * 18);
    return { x: gait.x, y: gait.y, bob: gait.bob, tilt };
  }

  private drawDroid(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    left: boolean,
    grounded: boolean,
    parts: number,
    team: number,
    moving: boolean,
    now: number,
    aim = left ? Math.PI : 0,
    id = -1,
    /** Its scale. */
    k = 1,
  ): void {
    // Its feet are planted in the world (see droidFeet).
    const feet = this.droidFeet(id, x, y, left, grounded, now, k);
    const ox = x;
    const oy = y;
    if (k !== 1) {
      // Bigger: the whole droid drawn in its own scaled frame (from its box's top-left).
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, k);
      x = 0;
      y = 0;
    }
    // Droid-local (as facing right, from the hitbox's top-left) to world.
    const X = (dx: number) => (left ? x + ACTOR_W - dx : x + dx);
    const Y = (dy: number) => y + dy;
    const GUN = '#4d5359';
    const GUN_DK = '#30353a';
    const TIN = '#b9bfc4';
    const TIN_DK = '#7d858c';
    const K = '#121518';
    // Legs first (behind the chassis), each a two-bone limb with its foot
    // planted in the world (see droidFeet): a short thigh rising steeply from
    // the hip to a high, sharp knee, and a long shin down to the foot, set
    // wide of the body.
    const bob = feet.bob;
    const HIP_Y = 9.6 + bob;
    // The body pitches with the ground (feet.tilt) about the middle of its
    // hip line: the chassis, the hips and the rack on it; the head stays on
    // the gun's pivot (where shots leave), its neck bending to reach it.
    const tilt = feet.tilt;
    const tc = Math.cos(tilt);
    const ts = Math.sin(tilt);
    const pivX = X(4);
    const pivY = Y(HIP_Y);
    const rot = (px: number, py: number): [number, number] => [pivX + (px - pivX) * tc - (py - pivY) * ts, pivY + (px - pivX) * ts + (py - pivY) * tc];
    // The body's up (its knees bend that way).
    const upX = ts;
    const upY = -tc;
    const strut = (x1: number, y1: number, x2: number, y2: number, wa: number, wb: number) => {
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = -(y2 - y1) / len;
      const ny = (x2 - x1) / len;
      ctx.beginPath();
      ctx.moveTo(x1 + nx * wa, y1 + ny * wa);
      ctx.lineTo(x2 + nx * wb, y2 + ny * wb);
      ctx.lineTo(x2 - nx * wb, y2 - ny * wb);
      ctx.lineTo(x1 - nx * wa, y1 - ny * wa);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 8;
    ctx.lineWidth = 0.35;
    ctx.strokeStyle = K;
    for (let leg = 0; leg < 6; leg++) {
      const part = DROID_LEGS[leg];
      const [hx, hy] = rot(X(DROID_HIP_X[leg]), Y(HIP_Y));
      if (!has(parts, part)) {
        // A sparking socket where the leg was.
        ctx.fillStyle = K;
        ctx.fillRect(hx - 0.6, hy - 0.4, 1.2, 1.2);
        if ((now / 90 + part) % 4 < 1) {
          ctx.fillStyle = '#ffd060';
          ctx.fillRect(hx - 0.4, hy + 0.8, 0.8, 0.8);
        }
        continue;
      }
      const fx = x + (feet.x[leg] - ox) / k;
      const fy = y + (feet.y[leg] - oy) / k;
      // Two-bone IK, the knee bent up (away from the ground, or the wall).
      const dx = fx - hx;
      const dy = fy - hy;
      const d = Math.min(Math.hypot(dx, dy), DROID_THIGH + DROID_SHIN - 0.05);
      const a = Math.atan2(dy, dx);
      const cosA = (DROID_THIGH * DROID_THIGH + d * d - DROID_SHIN * DROID_SHIN) / (2 * DROID_THIGH * d || 1);
      const bend = Math.acos(Math.max(-1, Math.min(1, cosA)));
      // (Of the two ways the knee can bend, the higher, off its back: a spider's ^.)
      const k1x = hx + Math.cos(a - bend) * DROID_THIGH;
      const k1y = hy + Math.sin(a - bend) * DROID_THIGH;
      const k2x = hx + Math.cos(a + bend) * DROID_THIGH;
      const k2y = hy + Math.sin(a + bend) * DROID_THIGH;
      const [kx, ky] = (k1x - hx) * upX + (k1y - hy) * upY > (k2x - hx) * upX + (k2y - hy) * upY ? [k1x, k1y] : [k2x, k2y];
      // The far legs (every other one) a shade darker.
      const far = leg === 1 || leg === 4;
      ctx.fillStyle = far ? TIN_DK : TIN;
      strut(hx, hy, kx, ky, 0.85, 0.55); // thigh, narrowing to the knee
      ctx.fillStyle = far ? '#5d656c' : TIN_DK;
      strut(kx, ky, fx, fy, 0.6, 0.05); // shin, to a needle point
      // The knee: a hard angular joint at the peak.
      ctx.fillStyle = K;
      ctx.beginPath();
      ctx.moveTo(kx, ky - 0.8);
      ctx.lineTo(kx + 0.6, ky);
      ctx.lineTo(kx, ky + 0.6);
      ctx.lineTo(kx - 0.6, ky);
      ctx.closePath();
      ctx.fill();
    }
    ctx.miterLimit = 10; // (back to the canvas defaults)
    // The chassis: a squat armoured pod slung low between the legs, wider
    // than it is tall; the head (the turret, with the gun) stands up above it
    // on a neck, so the gun is its face. (The gun pivots at the shoulder
    // point, where the shots leave: the head is built round it.)
    const plated = has(parts, DroidPart.Plating);
    ctx.save();
    ctx.translate(pivX, pivY);
    ctx.rotate(tilt);
    ctx.translate(-pivX, -pivY);
    const x0 = Math.min(X(-1.5), X(9.5));
    const cy0 = Y(8.2 + bob);
    ctx.fillStyle = K;
    ctx.fillRect(x0, cy0, 11, 4);
    ctx.fillRect(x0 + 1, cy0 - 0.8, 9, 5.6);
    ctx.fillStyle = plated ? GUN : '#3a3530';
    ctx.fillRect(x0 + 1, cy0 + 0.4, 9, 3);
    ctx.fillStyle = plated ? GUN_DK : '#251f1a';
    ctx.fillRect(x0 + 1, cy0 + 2.4, 9, 1);
    // Tin trim along the top, rivets; the plating gone, scorched seams instead.
    ctx.fillStyle = plated ? TIN : '#5a4a3a';
    ctx.fillRect(x0 + 1.5, cy0 + 0.4, 8, 0.7);
    ctx.fillStyle = K;
    for (const rx of [2.5, 7.5]) ctx.fillRect(x0 + rx, cy0 + 1.8, 0.6, 0.6);
    if (!plated && (now / 110) % 5 < 1) {
      ctx.fillStyle = '#ffb040';
      ctx.fillRect(x0 + 2 + ((now / 50) % 7), cy0 + 1.6, 0.8, 0.8);
    }
    // Its owner's colour on a running light at the front of the chassis.
    ctx.fillStyle = `#${team.toString(16).padStart(6, '0')}`;
    ctx.fillRect(X(8.2) - 0.7, Y(9.6), 1.4, 0.9);
    const head = has(parts, DroidPart.Turret);
    ctx.restore();
    // A filled, outlined polygon in droid-local cells (mirrored with the facing).
    const poly = (pts: readonly (readonly [number, number])[], fill: string) => {
      ctx.beginPath();
      ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
      for (let k = 1; k < pts.length; k++) ctx.lineTo(X(pts[k][0]), Y(pts[k][1]));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
    };
    ctx.lineJoin = 'miter';
    ctx.lineWidth = 0.4;
    ctx.strokeStyle = K;
    // The head on a narrow steel T: a thin stem up from the chassis to a
    // crossbar (the header), and on it the camera, the gun mounted along it.
    // (Just a stub of the stem, the head shot off.)
    // (Its foot on the tilted chassis, its top under the head.)
    const neck: [number, number][] = [[X(3.55), Y(head ? 6.6 : 7.3)], [X(4.45), Y(head ? 6.6 : 7.3)], rot(X(4.6), Y(8.4 + bob)), rot(X(3.4), Y(8.4 + bob))];
    ctx.beginPath();
    ctx.moveTo(neck[0][0], neck[0][1]);
    for (const [nx, ny] of neck.slice(1)) ctx.lineTo(nx, ny);
    ctx.closePath();
    ctx.fillStyle = TIN_DK;
    ctx.fill();
    ctx.stroke();
    if (head) {
      // (The header leans with the body, about the gun's mount.)
      ctx.save();
      ctx.translate(X(4), Y(4));
      ctx.rotate(tilt * 0.6);
      ctx.translate(-X(4), -Y(4));
      // The header: a flat steel crossbar across the top of the stem.
      // (Below the gun's mount, so the T shows: stem, bar, then camera and gun.)
      poly(
        [
          [1, 5.8],
          [7, 5.8],
          [6.5, 6.7],
          [1.5, 6.7],
        ],
        GUN,
      );
      ctx.fillStyle = TIN;
      ctx.fillRect(Math.min(X(1.6), X(6.4)), Y(5.95), 4.8, 0.3);
      ctx.restore();
      // The camera: its flat face to the front, looking where the gun points
      // (it pivots with the aim, on the gun's mount), the body tapering away
      // behind it, ]< . Drawn in the aim's own frame: +x along the barrel,
      // -y up (mirrored aiming left, so it stays the right way up).
      const px = X(4);
      const py = Y(4);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(aim);
      if (left) ctx.scale(1, -1);
      ctx.lineWidth = 0.4;
      ctx.strokeStyle = K;
      const cam = (pts: readonly (readonly [number, number])[], fill: string) => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
      };
      // Body: the flat face at the front, a box behind it, tapering to the back.
      cam(
        [
          [3.4, -3.5],
          [3.4, -0.2],
          [0.2, -0.2],
          [-3.2, -1.3],
          [-3.2, -2.5],
          [0.2, -3.5],
        ],
        GUN,
      );
      // A darker underside, a tin highlight along the top edge.
      cam(
        [
          [3.4, -1.1],
          [3.4, -0.2],
          [0.2, -0.2],
          [-3.2, -1.3],
          [-3.2, -1.6],
          [0.2, -1.1],
        ],
        GUN_DK,
      );
      ctx.fillStyle = TIN;
      ctx.fillRect(0.4, -3.3, 2.8, 0.35);
      // The flat face: a steel bezel round the red lens, looking out along the gun.
      ctx.fillStyle = K;
      ctx.fillRect(3, -3.3, 0.9, 2.9);
      ctx.fillStyle = (now / 150) % 6 < 5 ? '#ff3a28' : '#801408';
      ctx.fillRect(3.2, -2.6, 0.8, 1.4);
      ctx.restore();
    }
    ctx.miterLimit = 10;
    if (k !== 1) ctx.restore();
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
    /** Who it is (a droid's feet are remembered per droid). */
    id = -1,
  ): void {
    const left = Math.cos(aim) < 0;
    const face = left ? -1 : 1;
    const ix = Math.round(x);
    const iy = Math.round(y);
    // A spider droid: no clone at all (its chassis, legs and turret are drawn whole; the gun goes on the turret below).
    const droid = classOfFlags(flags) === ClassId.Droid;
    if (droid) {
      this.drawDroid(ctx, x, y, left, (flags & F_GROUND) !== 0, parts, team, moving, now, aim, id);
      lean = 0;
      stance = Stance.Stand;
    }
    // Walk cycle advances with distance travelled, so feet don't skate.
    const frame: BodyFrame = !(flags & F_GROUND) ? 'air' : moving ? WALK_CYCLE[Math.floor(ix / (stance === Stance.Stand ? 3 : 2)) & 3] : 'idle';
    const sprite = droid ? null : this.sprites.body(team, frame, left, parts, classOfFlags(flags), faction);
    // The torso pivots at the hip (leaning with the stance and the ragdoll
    // sway); crouched, the legs fold under it; prone, the whole clone lies down.
    const hipX = ix + HIP_X + 0.5;
    const hipY = iy + HIP_Y + STANCE_DROP[stance];
    const a = lean * face;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    // A point given relative to the hip in the standing pose, posed.
    const posed = (dx: number, dy: number) => [hipX + dx * cos - dy * sin, hipY + dx * sin + dy * cos];
    if (droid) {
      // (Drawn above.)
    } else if (stance === Stance.Prone) {
      ctx.save();
      ctx.translate(hipX, hipY);
      ctx.rotate(a);
      ctx.drawImage(sprite!, -5.5, -11);
      ctx.restore();
    } else {
      const legH = stance === Stance.Crouch ? 3 : 5;
      ctx.drawImage(sprite!, 0, 11, 10, 5, ix - 1, iy + ACTOR_H - legH, 10, legH);
      ctx.save();
      ctx.translate(hipX, hipY);
      ctx.rotate(a);
      ctx.drawImage(sprite!, 0, 0, 10, 11, -5.5, -11, 10, 11);
      ctx.restore();
    }

    // A king wears the crown on the head.
    if (!droid && has(parts, Part.Crown)) {
      ctx.save();
      ctx.translate(hipX, hipY);
      ctx.rotate(a);
      this.drawCrown(ctx, frame, left, now);
      ctx.restore();
    }

    // Jetpack exhaust under the pack (pack is on the clone's back).
    if (!droid && flags & F_JET && has(parts, Part.Jetpack)) {
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
    if (droid ? !has(parts, DroidPart.Turret) : !has(parts, Part.GunArm)) {
      // Arm (and the gun with it) gone: a bloody stump at the shoulder. A
      // droid's turret shot off: a sparking socket.
      if (droid) {
        // (On top of the neck stub, below where the head was.)
        if ((now / 70) % 3 < 1) {
          ctx.fillStyle = '#ffe080';
          ctx.fillRect(sx + Math.round(Math.sin(now / 37) * 1.5), sy + 1, 1, 1);
        }
        return;
      }
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
    if (weapon === WeaponId.RepairKit) {
      // The med case: carried by its handle at the side (it's no gun), its charge pulsing through the vents.
      const gk = this.sprites.gun(weapon, left ? Math.PI : 0);
      const kx = sx + face * 2;
      const ky = sy + 4;
      const pulse = 0.5 + 0.5 * Math.sin(now / 160);
      ctx.fillStyle = `rgba(90,240,200,${0.12 + 0.18 * pulse})`;
      ctx.fillRect(kx - 6, ky - 2, 12, 11);
      ctx.drawImage(gk.c, kx - gk.r, ky - gk.r);
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
    const entries: { kind: number; name: string; blurb: string; free?: boolean; cost?: number }[] = [
      { kind: CallKind.Dropship, name: 'DROPSHIP', blurb: 'air support · 2 turrets · 8 bombs' },
      { kind: CallKind.Tank, name: 'TANK', blurb: 'parachuted onto your position' },
    ];
    // A watchdog, if we haven't one out already.
    const dog = game.myDog();
    if (!dog) entries.push({ kind: CallKind.Watchdog, name: 'WATCHDOG', blurb: 'small robot tank · guards you · drive it (P)', cost: WATCHDOG_COST });
    // A tarantula, likewise.
    const spider = game.mySpider();
    if (!spider) entries.push({ kind: CallKind.Tarantula, name: 'TARANTULA', blurb: 'ultraheavy spider · missiles + laser · guards you', cost: TARANTULA_COST });
    // Our dropship's (or watchdog's, or tarantula's) up: the remote to drive it ourselves.
    const pet = dog && !dog.chute ? dog : spider && !spider.chute ? spider : null;
    if (game.shipViews().some((v) => v.owner === game.myId && !v.leaving)) entries.push({ kind: CallKind.Pilot, name: 'PILOT DROPSHIP', blurb: 'fly it yourself (P) · your clone stands by', free: true });
    else if (pet) entries.push({ kind: CallKind.Pilot, name: pet === dog ? 'DRIVE WATCHDOG' : 'DRIVE TARANTULA', blurb: 'drive it yourself (P) · your clone stands by', free: true });
    const y0 = Math.max(250 * s, H / 2 - (entries.length * rowH) / 2);
    this.callRects.length = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x0 - 4 * s, y0 - 24 * s, w + 8 * s, entries.length * rowH + 28 * s);
    ctx.textAlign = 'left';
    ctx.font = `bold ${Math.round(12 * s)}px ui-monospace, monospace`;
    ctx.fillStyle = '#9fe870';
    ctx.fillText(`RADIO  (${input.touch ? 'tap' : 'click'} to call in)`, x0, y0 - 8 * s);
    entries.forEach((e, i) => {
      const cost = e.cost ?? CALL_COST;
      const afford = e.free || game.gold >= cost;
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
      ctx.fillText(e.free ? 'remote' : `${cost} gold`, x0 + w - 8 * s, y + 20 * s);
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
    const def = WEAPONS[game.weapon];
    const fall = def && def.proj >= 0 && def.proj < PROJ.length ? PROJ[def.proj].gravity : 0;
    if (def && fall >= 0.3 && def.speed > 0) {
      this.drawArc(ctx, game, s.x, s.y, s.aim, def.speed, GRAVITY * fall, def.muzzle);
      return;
    }
    const lof = lineOfFire(game, s.x, s.y, s.aim, 2000);
    const ex = s.x + Math.cos(s.aim) * lof.dist;
    const ey = s.y + Math.sin(s.aim) * lof.dist;
    const hit = lof.hit;
    // Snapped by the assist onto something: a lock too (the assist's mark is the locked point).
    const mark = this.assistSight ? game.aimMark : null;
    const locked = !!hit && (game.scopeLock?.id === hit.id || (!!mark && lof.foe));
    // (A dropship part, which the line test doesn't know: the laser runs to the mark on it.)
    const toMark = !!mark && !hit && Math.hypot(mark.x - s.x, mark.y - s.y) <= lof.dist + 4;
    const lx1 = toMark ? mark!.x : ex;
    const ly1 = toMark ? mark!.y : ey;
    const hot = lof.foe || toMark;
    ctx.strokeStyle = hot ? 'rgba(255,70,50,0.55)' : 'rgba(255,90,70,0.22)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(s.x + Math.cos(s.aim) * 8, s.y + Math.sin(s.aim) * 8);
    ctx.lineTo(lx1, ly1);
    ctx.stroke();
    ctx.fillStyle = hot ? '#ff4030' : '#ffb0a0';
    ctx.fillRect(Math.round(lx1) - 1, Math.round(ly1) - 1, 2, 2);
    if (toMark) {
      ctx.font = '5px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOCK', mark!.x, mark!.y - 8);
      ctx.textAlign = 'left';
    }
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
    if (locked && (game.scopeLock || mark)) {
      // The locked point, and a tag.
      const lx = Math.round(mark ? mark.x : hit.x + game.scopeLock!.lx);
      const ly = Math.round(mark ? mark.y : hit.y + game.scopeLock!.ly);
      ctx.fillRect(lx - 2, ly, 5, 1);
      ctx.fillRect(lx, ly - 2, 1, 5);
      ctx.font = '5px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOCK', hit.x + ACTOR_W / 2, y0 - 2);
      ctx.textAlign = 'left';
    }
  }

  /**
   * A lobbed weapon's sight: the arc its shot will fly (stepped as the game
   * steps it), dotted, out to where it lands, and the mark it's aimed at.
   */
  private drawArc(ctx: CanvasRenderingContext2D, game: Game, ox: number, oy: number, aim: number, speed: number, g: number, muzzle: number): void {
    const mark = this.assistSight || game.scopeLock ? game.aimMark : null;
    const dt = 1 / 30;
    let x = ox + Math.cos(aim) * muzzle;
    let y = oy + Math.sin(aim) * muzzle;
    let vx = Math.cos(aim) * speed;
    let vy = Math.sin(aim) * speed;
    const hot = !!mark;
    ctx.fillStyle = hot ? 'rgba(255,70,50,0.75)' : 'rgba(255,140,110,0.4)';
    let near = Infinity;
    let end = false;
    for (let i = 0; i < 90 && !end; i++) {
      vy += g * dt;
      // Dots every couple of cells along the step, stopping at the ground.
      const n = Math.max(1, Math.ceil((Math.hypot(vx, vy) * dt) / 3));
      for (let j = 0; j < n; j++) {
        x += (vx * dt) / n;
        y += (vy * dt) / n;
        if (game.terrain.isSolid(Math.floor(x), Math.floor(y))) {
          end = true;
          break;
        }
        if ((i * n + j) % 2 === 0) ctx.fillRect(x - 0.4, y - 0.4, 0.8, 0.8);
        if (mark) {
          const d = Math.hypot(x - mark.x, y - mark.y);
          if (d > near + 6) end = true; // past the target: that's the arc that matters
          near = Math.min(near, d);
        }
      }
    }
    ctx.fillStyle = hot ? '#ff4030' : '#ffb0a0';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    if (mark) {
      const lx = Math.round(mark.x);
      const ly = Math.round(mark.y);
      ctx.fillRect(lx - 2, ly, 5, 1);
      ctx.fillRect(lx, ly - 2, 1, 5);
      ctx.font = '5px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(game.aimReach ? 'LOCK' : 'OUT OF RANGE', mark.x, mark.y - 8);
      ctx.textAlign = 'left';
    }
  }

  /** A laser gathering its charge at the muzzle: a flickering magenta-white ball, bigger the fuller it is. */
  private drawLaserCharge(ctx: CanvasRenderingContext2D, x: number, y: number, f: number, now: number): void {
    const r = 1 + f * 3.5 + Math.sin(now / 45) * 0.4;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, `rgba(255,110,200,${0.45 + f * 0.4})`);
    g.addColorStop(1, 'rgba(255,40,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
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
    const k = t.s ?? 1;
    const dog = isDog(t);
    // A watchdog is a tank drawn at its scale, in its own frame (from its top-left).
    const x = dog ? 0 : Math.round(t.x);
    const ty = dog ? 0 : Math.round(t.y);
    const y = ty - TANK_SPRITE_TOP;
    // Tank-local x (as drawn facing right) to world, mirrored when facing left.
    const wx = (lx: number, w = 0) => (faceLeft ? x + TANK_W - lx - w : x + lx);
    // Everything below is drawn in the hull's own frame, tilted with the
    // treads about the middle of the tread line (sunk so both ends touch).
    ctx.save();
    ctx.translate(t.x + tankW(t) / 2, t.y + tankH(t) + tankSink(t.a, k));
    ctx.rotate(t.a);
    if (dog) ctx.scale(k, k);
    ctx.translate(-(x + TANK_W / 2), -(ty + TANK_H));
    if (t.chute) ctx.drawImage(sp.tankChute(), x - 8, ty - 34);
    const shield = hasTankPart(t.parts, TankPart.Shield);
    if (t.pilot !== 255 && !shield && !dog) {
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
      const g = sp.tankGun(false, a, dog);
      const kick = t.firedCannon ? 3 : 0;
      const px = (faceLeft ? x + TANK_W - CANNON_PIVOT[0] : x + CANNON_PIVOT[0]) - Math.cos(a) * kick;
      const py = ty + CANNON_PIVOT[1] - Math.sin(a) * kick;
      ctx.drawImage(g.c, Math.round(px - g.r), Math.round(py - g.r));
    }
    ctx.drawImage(sp.tankHull(faceLeft, dog), x, y);
    // The steel cupola over the hatch (12 wide, its foot on the hatch rim).
    if (shield) ctx.drawImage(sp.tankShield(faceLeft, dog), wx(9, 12), y - 4);
    if (dog) {
      // A watchdog: no hatch, no crew. A sensor mast with a winking light in its owner's colour.
      const rgb = game.players.get(t.owner)?.rgb ?? 0xff4040;
      ctx.fillStyle = '#141012';
      ctx.fillRect(wx(6, 1), y - 11, 1, 10);
      ctx.fillRect(wx(4, 5), y - 1, 5, 2);
      ctx.fillStyle = (now / 260) % 2 < 1 ? `#${rgb.toString(16).padStart(6, '0')}` : '#3a2a2a';
      ctx.fillRect(wx(5, 3), y - 13, 3, 3);
      // Its eye: a red slit in the glacis, brighter while it's at its owner's remote.
      ctx.fillStyle = t.remote ? '#7ff0ff' : (now / 140) % 4 < 3 ? '#ff3020' : '#901008';
      ctx.fillRect(wx(26, 4), ty + 6, 4, 2);
    }
    // Tracks: one frame per two cells rolled.
    ctx.drawImage(sp.tankTread(Math.floor((faceLeft ? -t.x : t.x) / 2), faceLeft, dog), x, y + 18);
    if (hasTankPart(t.parts, TankPart.Armor)) ctx.drawImage(sp.tankArmor(faceLeft, dog), x, y);
    if (hasTankPart(t.parts, TankPart.Smg)) {
      aim -= t.a; // the vulcan's swivel, relative to the tilted hull
      const g = sp.tankGun(true, aim, dog);
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
    const wear = 1 - t.hp / tankMaxHp(t);
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

  /**
   * A tarantula, in its own hand-made pixel art (tarantula-sprites.ts):
   * the chunky iron, steel and ceramic body tilted with the ground, the
   * camera head with the laser on an iron neck, the missile rack on its
   * back, both turning to the aim. Its six legs are pixel-drawn too, each a
   * steel thigh up to a ceramic-capped knee and an iron shin tapering to a
   * steel point, the feet planted in the world on the spider droid's gait
   * (droidFeet, at its scale). A parachute holds it while it comes down; as
   * the hull weakens it smokes, then burns.
   */
  private drawTarantula(ctx: CanvasRenderingContext2D, t: TankView, faceLeft: boolean, aim: number, game: Game, now: number): void {
    const k = t.s ?? TARANTULA_SCALE;
    const cx = t.x + tankW(t) / 2;
    if (t.chute) {
      ctx.save();
      ctx.translate(cx, t.y);
      ctx.scale(1.3, 1.3);
      ctx.drawImage(this.sprites.tankChute(), -TANK_W / 2 - 8, -34);
      ctx.restore();
    }
    const rgb = game.players.get(t.owner)?.rgb ?? 0xff4040;
    const side = faceLeft ? -1 : 1;
    const feet = this.droidFeet(1000 + t.slot, t.x, t.y, faceLeft, t.onGround, now, k);
    const tilt = feet.tilt;
    const tc = Math.cos(tilt);
    const ts = Math.sin(tilt);
    const hipX = Math.round(cx);
    const hipY = Math.round(t.y + 9.6 * k + feet.bob * k);
    const rot = (px: number, py: number): [number, number] => [hipX + (px - hipX) * tc - (py - hipY) * ts, hipY + (px - hipX) * ts + (py - hipY) * tc];
    // A pixel strut from (x0, y0) to (x1, y1), `wa` thick tapering to `wb`, in colour `c`.
    const strut = (x0: number, y0: number, x1: number, y1: number, wa: number, wb: number, c: string, grow = 0) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      ctx.fillStyle = c;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const w = Math.max(1, Math.round(wa + (wb - wa) * f) + grow);
        ctx.fillRect(Math.round(x0 + (x1 - x0) * f - w / 2), Math.round(y0 + (y1 - y0) * f - w / 2), w, w);
      }
    };
    const THIGH = DROID_THIGH * k;
    const SHIN = DROID_SHIN * k;
    // Far legs first (they're behind), a shade darker.
    for (const leg of [1, 4, 0, 2, 3, 5]) {
      const far = leg === 1 || leg === 4;
      const [hx, hy] = rot(hipX + side * TARANTULA_HIPS[leg], hipY);
      const fx = feet.x[leg];
      const fy = feet.y[leg];
      const dx = fx - hx;
      const dy = fy - hy;
      const d = Math.min(Math.hypot(dx, dy), THIGH + SHIN - 0.5);
      const a = Math.atan2(dy, dx);
      const bend = Math.acos(Math.max(-1, Math.min(1, (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d || 1))));
      const k1 = [hx + Math.cos(a - bend) * THIGH, hy + Math.sin(a - bend) * THIGH];
      const k2 = [hx + Math.cos(a + bend) * THIGH, hy + Math.sin(a + bend) * THIGH];
      // (The knee bends up off its back, at any tilt.)
      const [kx, ky] = (k1[0] - hx) * ts - (k1[1] - hy) * tc > (k2[0] - hx) * ts - (k2[1] - hy) * tc ? k1 : k2;
      // Outline, then the metal, then a lit edge along the top of the thigh.
      strut(hx, hy, kx, ky, 5, 4, '#121417', 2);
      strut(kx, ky, fx, fy, 4, 1, '#121417', 2);
      strut(hx, hy, kx, ky, 5, 4, far ? '#4a5560' : '#7d8a97');
      strut(kx, ky, fx, fy, 4, 1, far ? '#2a2725' : '#4a4440');
      strut(hx, hy - 1, kx, ky - 1, 1, 1, far ? '#6c7884' : '#b6c3ce');
      strut(kx, ky, fx, fy, 1, 1, far ? '#3e3a37' : '#6a625c');
      // The steel point it stands on.
      ctx.fillStyle = far ? '#6c7884' : '#b6c3ce';
      ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 2, 2, 2);
      // The knee: a ceramic cap over the joint.
      const qx = Math.round(kx) - 3;
      const qy = Math.round(ky) - 3;
      ctx.fillStyle = '#121417';
      ctx.fillRect(qx - 1, qy - 1, 8, 8);
      ctx.fillStyle = far ? '#9a958a' : '#dfd9cb';
      ctx.fillRect(qx, qy, 6, 6);
      ctx.fillStyle = far ? '#b3ad9f' : '#f7f3e8';
      ctx.fillRect(qx, qy, 4, 2);
      ctx.fillStyle = far ? '#7a756b' : '#b3ad9f';
      ctx.fillRect(qx + 1, qy + 4, 5, 2);
    }
    // The neck: an iron mast from its back up to the head's mount.
    const headX = cx;
    const headY = t.y + SPIDER_LASER_PIVOT[1] * k;
    const [nx, ny] = rot(hipX + side * 3, hipY - 9);
    const head = hasTankPart(t.parts, TankPart.Smg);
    strut(nx, ny, headX, head ? headY : ny - 4, 6, 5, '#121417', 2);
    strut(nx, ny, headX, head ? headY : ny - 4, 6, 5, '#58514c');
    strut(nx - 2, ny, headX - 2, head ? headY : ny - 4, 1, 1, '#7c736c');
    // The body.
    const b = this.tArt.body(rgb, faceLeft, hasTankPart(t.parts, TankPart.Armor), tilt);
    ctx.drawImage(b.c, hipX - b.r, hipY - b.r);
    // The missile rack on its back, turning to the aim.
    if (hasTankPart(t.parts, TankPart.Cannon)) {
      const [rx, ry] = rot(faceLeft ? t.x + tankW(t) - SPIDER_RACK_PIVOT[0] * k : t.x + SPIDER_RACK_PIVOT[0] * k, t.y + SPIDER_RACK_PIVOT[1] * k);
      const r = this.tArt.rack(aim, faceLeft);
      ctx.drawImage(r.c, Math.round(rx) - r.r, Math.round(ry) - r.r);
      if (t.firedCannon) {
        // A flash out of the tubes.
        const ca = Math.cos(aim);
        const sa = Math.sin(aim);
        for (const [mx, my] of RACK_MOUTHS) {
          const lx = mx - RACK_PIVOT[0];
          const ly = (my - RACK_PIVOT[1]) * (faceLeft ? -1 : 1);
          const fxp = rx + lx * ca - ly * sa;
          const fyp = ry + lx * sa + ly * ca;
          ctx.fillStyle = '#ffd860';
          ctx.fillRect(Math.round(fxp) - 1, Math.round(fyp) - 1, 3, 3);
          ctx.fillStyle = '#fffbe0';
          ctx.fillRect(Math.round(fxp), Math.round(fyp), 1, 1);
        }
      }
    } else if ((now / 90) % 4 < 1) {
      ctx.fillStyle = '#ffd060';
      ctx.fillRect(Math.round(hipX - side * 12), hipY - 12, 2, 2);
    }
    // The head on its mast: the laser's camera, turning to the aim.
    if (head) {
      const h = this.tArt.head(aim, faceLeft, t.firedSmg);
      ctx.drawImage(h.c, Math.round(headX) - h.r, Math.round(headY) - h.r);
    } else if ((now / 80) % 3 < 1) {
      ctx.fillStyle = '#ffd060';
      ctx.fillRect(Math.round(nx), Math.round(ny) - 6, 2, 2);
    }
    // Battle damage: smoke off the back as the hull weakens, then fire.
    const wear = 1 - t.hp / tankMaxHp(t);
    if (wear > 0.4) {
      const by = hipY - 8;
      const ph = (now / 70) % 6;
      ctx.fillStyle = 'rgba(30,26,22,0.5)';
      ctx.fillRect(Math.round(cx - 6 + ph), Math.round(by - 4 - ph * 1.5), 3, 3);
      if (wear > 0.7 && (now / 90) % 3 < 2) {
        ctx.fillStyle = (now / 60) % 2 < 1 ? '#ff9a30' : '#ffd060';
        ctx.fillRect(Math.round(cx - 4), by + 1, 2, 2);
        ctx.fillRect(Math.round(cx + 5), by + 2, 2, 2);
      }
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
    const droid = game.body.cls === ClassId.Droid;
    const defs = droid ? DROID_PARTS : PARTS;
    const rect = (p: number) => {
      const d = defs[p];
      ctx.fillRect(ox + d.rx0 * k, oy + d.ry0 * k, (d.rx1 - d.rx0 + 1) * k, (d.ry1 - d.ry0 + 1) * k);
    };
    if (droid) {
      // A droid's own doll: chassis (its plating outlined), turret on top, six legs beneath.
      for (const p of [DroidPart.Chassis, DroidPart.Turret, ...DROID_LEGS]) {
        ctx.fillStyle = col(game.partHp[p]);
        rect(p);
      }
      if (game.partHp[DroidPart.Plating] > 0) {
        ctx.lineWidth = Math.max(1, s);
        ctx.strokeStyle = col(game.partHp[DroidPart.Plating]);
        const d = DROID_PARTS[DroidPart.Plating];
        ctx.strokeRect(ox + d.rx0 * k + 0.5, oy + d.ry0 * k + 0.5, (d.rx1 - d.rx0 + 1) * k - 1, (d.ry1 - d.ry0 + 1) * k - 1);
      }
      return;
    }
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
    // (Under it, where the clone's vendor and class used to be: the match card, drawn with the round.)
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
      ctx.fillText(d ? (d.clip > 1 ? `${d.name} ${it.ammo}` : d.name) : '?', x + 10 * s, H - 18 * s);
    }
    if (game.alive && !touch && !game.drive) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'center';
      ctx.fillText(game.inv.length ? '1/2 switch   3 pick up   4 drop' : 'empty-handed: 3 picks up a weapon', W / 2, H - 42 * s);
      ctx.textAlign = 'left';
    }
    // Magazine and reload for the weapon in hand.
    const def = WEAPONS[game.weapon];
    if (game.alive && def && def.clip > 0 && game.weapon === WeaponId.RepairKit) {
      // One use: a prompt instead of a magazine count.
      const ax = sx0 + total + 8 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(ax, H - 34 * s, 120 * s, 24 * s);
      ctx.fillStyle = '#7dffc0';
      ctx.fillText(input.touch ? 'FIRE: HEAL WAVE' : 'CLICK: HEAL WAVE', ax + 10 * s, H - 18 * s);
    } else if (game.alive && def && def.clip > 0) {
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
    // How many real people are in the game (everyone else is a bot).
    let humans = 0;
    for (const [, pl] of game.players) if (!pl.bot) humans++;
    const online = `${humans} ${humans === 1 ? 'human' : 'humans'} online`;
    // The info panel (this, the net stats and the kill feed) only on request
    // (I), or while the scoreboard is up.
    const info = input.showInfo || input.scoreboard;
    if (info) {
      ctx.font = `bold ${Math.round(14 * s)}px ui-monospace, monospace`;
      const ox = touch ? mx - 10 * s : W - 14 * s;
      const oy = touch ? my + 14 * s : 22 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(online, ox + s, oy + s);
      ctx.fillStyle = '#9fe870';
      ctx.fillText(online, ox, oy);
    }
    ctx.font = `${Math.round(12 * s)}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    if (!touch && info) lines.forEach((l, i) => ctx.fillText(l, W - 14 * s, (40 + i * 15) * s));

    // Kill feed.
    const now = performance.now();
    // (Without the info panel, only notices for us show: not the kill feed.)
    const feedY = touch ? my + mh + 16 * s : info ? 100 * s : 22 * s;
    const shown = info ? game.feed : game.feed.filter((f) => !f.kill);
    const feed = touch ? shown.slice(-3) : shown;
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
    // Spotted enemies: a red ring around their dot.
    ctx.strokeStyle = '#ff5a3c';
    ctx.lineWidth = Math.max(1, s);
    for (const e of game.spottedNow()) {
      ctx.beginPath();
      ctx.arc(mx + e.x * k, my + e.y * k, 4 * s, 0, Math.PI * 2);
      ctx.stroke();
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

    // Driving the watchdog by remote: the controls, and what's left of it.
    const dog = game.alive ? game.remoteDog() : null;
    if (dog) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const py = H - 150 * s;
      ctx.fillRect(W / 2 - 320 * s, py, 640 * s, 56 * s);
      ctx.font = `bold ${Math.round(14 * s)}px ui-monospace, monospace`;
      ctx.fillStyle = '#fff';
      const spider = isSpider(dog);
      ctx.fillText(
        spider ? 'TARANTULA REMOTE   A/D walk (into a wall: up it)   W/S climb   click laser   right-click missiles   P next' : 'WATCHDOG REMOTE   A/D drive   W jets   click vulcan   right-click cannon   P next',
        W / 2,
        py + 22 * s,
      );
      const max = tankMaxHp(dog);
      const names = spider ? (['MISSILES', 'LASER', 'PLATING'] as const) : (['CANNON', 'VULCAN', 'ARMOUR'] as const);
      const lost = names.filter((_, i) => !hasTankPart(dog.parts, [TankPart.Cannon, TankPart.Smg, TankPart.Armor][i]));
      ctx.fillStyle = lost.length || dog.hp < max * 0.35 ? '#ff9060' : '#a0ffa0';
      ctx.fillText([`hull ${Math.max(0, Math.round((dog.hp / max) * 100))}%`, ...lost.map((l) => `${l} LOST`), 'your clone stands guard where you left it'].join('   '), W / 2, py + 44 * s);
      ctx.textAlign = 'left';
    }

    // Remote-piloting the dropship: the controls, and what's left of it.
    const flown = game.alive ? game.pilotedShip() : null;
    if (flown) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      // (Low on the screen, over the inventory bar: the ship flies up top.)
      const py = H - 150 * s;
      ctx.fillRect(W / 2 - 320 * s, py, 640 * s, 56 * s);
      ctx.font = `bold ${Math.round(14 * s)}px ui-monospace, monospace`;
      ctx.fillStyle = '#fff';
      ctx.fillText('REMOTE PILOT   A/D fly   W/S climb/sink   click guns   right-click bomb   P exit', W / 2, py + 22 * s);
      const lost = (['ENGINE A', 'ENGINE B', 'ENGINE C', 'ENGINE D', 'GUN L', 'GUN R', 'BAY'] as const).filter((_, i) => !hasShipPart(flown.parts, [ShipPart.EngineA, ShipPart.EngineB, ShipPart.EngineC, ShipPart.EngineD, ShipPart.TurretL, ShipPart.TurretR, ShipPart.Doors][i]));
      ctx.fillStyle = lost.length || flown.hp < SHIP_HP * 0.35 ? '#ff9060' : '#a0ffa0';
      ctx.fillText([`hull ${Math.max(0, Math.round((flown.hp / SHIP_HP) * 100))}%`, `bombs ${flown.bombs}`, ...lost.map((l) => `${l} LOST`)].join('   '), W / 2, py + 44 * s);
      ctx.textAlign = 'left';
    }

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
        const cause = !game.myCraft() && game.deathCause ? game.deathCause : '';
        ctx.fillRect(W / 2 - 220 * s, H / 2 - 40 * s, 440 * s, (cause ? 76 : 60) * s);
        ctx.fillStyle = '#fff';
        ctx.fillText(game.myCraft() ? 'Drop rocket inbound…' : secs > 0 ? `New clone in ${secs}…` : 'Launching drop rocket…', W / 2, H / 2 - 2 * s);
        if (cause) {
          // How we died, under it.
          ctx.fillStyle = '#ff8070';
          ctx.fillText(cause, W / 2, H / 2 + 22 * s);
        }
      }
    }

    // Dead, or between rounds: our K/D and the leaderboard.
    const between = !!rs && (rs.phase === Phase.Countdown || rs.phase === Phase.Victory);
    const piloting = game.ride?.passenger === game.myId;
    if (!input.scoreboard && game.myId >= 0 && (between || (!game.alive && !piloting))) this.drawKd(game, s, W, H);

    if (input.scoreboard) this.drawScoreboard(game, s, W, H);
  }

  /**
   * The K/D card: this session's kills, deaths and K/D for us, our career
   * record, and the top clones by K/D (with our rank if we're not among them).
   */
  private drawKd(game: Game, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    const me = game.players.get(game.myId);
    if (!me) return;
    const kd = (p: { kills: number; deaths: number }) => kdRatio(p.kills, p.deaths);
    const rows = [...game.players.values()].sort((a, b) => kd(b) - kd(a) || b.kills - a.kills || a.deaths - b.deaths);
    const rank = rows.findIndex((p) => p.id === game.myId);
    const top = rows.slice(0, 8);
    const lineH = 15 * s;
    const w = 340 * s;
    const h = (top.length + (rank >= top.length ? 2 : 0) + 4) * lineH + 16 * s;
    const x0 = W / 2 - w / 2;
    const y0 = Math.min(H - h - 70 * s, H * 0.5 + 34 * s);
    ctx.fillStyle = 'rgba(4,8,6,0.8)';
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = 'rgba(160,255,160,0.22)';
    ctx.lineWidth = Math.max(1, s);
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    ctx.fillStyle = 'rgba(160,255,160,0.6)';
    ctx.fillRect(x0, y0, w, Math.max(1, Math.round(2 * s)));
    ctx.textAlign = 'left';
    ctx.font = `bold ${Math.round(13 * s)}px ui-monospace, monospace`;
    const lx = x0 + 14 * s;
    let y = y0 + 8 * s + lineH;
    ctx.fillStyle = '#fff';
    ctx.fillText(`YOU   K ${me.kills}   D ${me.deaths}   K/D ${kd(me).toFixed(2)}   #${rank + 1}/${rows.length}`, lx, y);
    y += lineH;
    ctx.font = `${Math.round(11 * s)}px ui-monospace, monospace`;
    ctx.fillStyle = '#9fe89f';
    const c = game.career;
    ctx.fillText(`career  ${c.kills} kills · ${c.deaths} deaths · K/D ${kdRatio(c.kills, c.deaths).toFixed(2)}`, lx, y);
    y += lineH * 1.4;
    ctx.font = `${Math.round(12 * s)}px ui-monospace, monospace`;
    ctx.fillStyle = '#999';
    ctx.fillText('LEADERBOARD          K    D    K/D', lx, y);
    const row = (p: (typeof rows)[number], i: number) => {
      y += lineH;
      ctx.fillStyle = p.id === game.myId ? '#fff' : p.color;
      const name = `${String(i + 1).padStart(2)}. ${p.name}`.padEnd(19).slice(0, 19);
      ctx.fillText(`${name} ${String(p.kills).padStart(3)}  ${String(p.deaths).padStart(3)}  ${kd(p).toFixed(2).padStart(5)}`, lx, y);
    };
    top.forEach(row);
    if (rank >= top.length) {
      y += lineH * 0.8;
      ctx.fillStyle = '#666';
      ctx.fillText('  ...', lx, y);
      y -= lineH * 0.2;
      row(me, rank);
    }
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
    const pvp = rs.mode === GameMode.Pvp;
    const teams = rs.mode === GameMode.Lts || regicide || extraction;
    const teamCss = (t: number) => TEAM_COLORS[t]?.css ?? '#fff';
    if (rs.phase === Phase.Waiting) big(extraction ? 'EXTRACTION' : regicide ? 'REGICIDE' : pvp ? 'PVP' : teams ? 'LAST TEAM STANDING' : 'LAST MAN STANDING', 'waiting for players');
    else if (rs.phase === Phase.Countdown) {
      big(
        `WAVE ${rs.wave + 1} IN ${secs}`,
        // (The mode is the headline; the map's biome goes with the hints.)
        (extraction
          ? 'extraction · four teams · bring the golden idol up from the bottom of the labyrinth'
          : regicide
          ? 'regicide · kill their king · guard yours'
          : pvp
          ? 'pvp · all against all · respawns · most kills in 5 minutes wins'
          : teams
            ? 'last team standing · red vs green · one life each'
            : 'last man standing · one life each · every clone for itself') +
          (extraction ? '' : ` · ${BIOME_NAMES[game.biome]?.toLowerCase() ?? ''} map${game.caves ? ' · caves: a tunnel highway links the bunkers below' : ''}`),
        '#ffd34a',
      );
    } else if (rs.phase === Phase.Victory && extraction) {
      const mine = game.myTeam !== Team.None && rs.winner === game.myTeam;
      if (rs.winner === 255) big('NOBODY GOT OUT', `the idol stays buried · wave ${rs.wave} · next wave in ${secs}`);
      else big(`${TEAM_NAMES[rs.winner]} EXTRACTED`, `${mine ? 'your team got' : 'team ' + TEAM_NAMES[rs.winner].toLowerCase() + ' got'} the golden idol out · next wave in ${secs}`, teamCss(rs.winner));
    } else if (rs.phase === Phase.Victory && pvp) {
      const won = rs.winner === game.myId;
      const who = (game.players.get(rs.winner)?.name ?? '').replace(/^BOT /, '');
      const mine = rs.pvp ? ` · you: ${rs.pvp.kills} kills, ${rs.pvp.deaths} deaths` : '';
      if (rs.winner === 255) big('DRAW', `nobody out-killed the rest${mine} · next wave in ${secs}`);
      else big(won ? 'YOU WIN!' : `${who} WINS`, `most kills: ${rs.pvp?.leaderKills ?? '?'}${mine} · next wave in ${secs}`, won ? '#80ff80' : '#ffd34a');
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
      // Live: the match card (wave, mode and clock, and how the sides stand)
      // on the same rows as HP and JET, plus the spectator banner once we're out.
      const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      const parts: { t: string; c: string }[] = [];
      const gap = { t: '  ', c: '#888' };
      let modeName = 'LAST MAN STANDING';
      let extra: { t: string; c: string } | null = null;
      if (extraction) {
        modeName = 'EXTRACTION';
        for (let t = 0; t < 4; t++) {
          if (t > 0) parts.push(gap);
          parts.push({ t: `${TEAM_NAMES[t]}${game.myTeam === t ? '*' : ''} ${rs.teamLeft[t] ?? 0}`, c: teamCss(t) });
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
        extra = { t: line, c: color };
      } else if (pvp) {
        modeName = 'PVP';
        const st = rs.pvp;
        if (st) {
          const leading = st.leader === game.myId;
          const lead = st.leader === 255 ? 'nobody yet' : `${leading ? 'YOU' : name(st.leader).replace(/^BOT /, '')} ${st.leaderKills}`;
          parts.push({ t: `LEAD ${lead}`, c: leading ? '#80ff80' : '#ffd34a' }, gap, { t: `YOU ${st.kills}K ${st.deaths}D`, c: '#e8ecef' });
        }
      } else if (regicide) {
        modeName = 'REGICIDE';
        const king = (t: number) => {
          const id = rs.kings[t];
          const who = id === game.myId ? 'YOU' : (game.players.get(id)?.name ?? '?').replace(/^BOT /, '');
          return `♛ ${who}${game.myTeam === t && id !== game.myId ? ' (yours)' : ''}`;
        };
        parts.push({ t: king(Team.Red), c: teamCss(Team.Red) }, { t: '  v  ', c: '#999' }, { t: king(Team.Green), c: teamCss(Team.Green) });
        if (game.alive && game.isKing(game.myId) && secs > 6 * 60 - 5) big('YOU ARE KING', 'stay alive · if you fall, your side loses', teamCss(game.myTeam));
      } else if (teams) {
        modeName = 'TEAMS';
        const you = (t: number) => (game.myTeam === t ? '*' : '');
        parts.push({ t: `RED${you(Team.Red)} ${rs.teamLeft[0]}`, c: teamCss(Team.Red) }, { t: '  v  ', c: '#999' }, { t: `${rs.teamLeft[1]} GREEN${you(Team.Green)}`, c: teamCss(Team.Green) });
      } else parts.push({ t: `${rs.left} LEFT`, c: '#e8ecef' });
      this.drawMatchCard(`WAVE ${rs.wave} · ${modeName}`, clock, secs <= 30 ? '#ff8070' : '#ffd34a', parts, extra, s);
      if (!game.alive && !game.ride && !game.myCraft()) {
        const watching = game.spectate !== 255 ? `spectating ${name(game.spectate)} · click for next` : 'spectating';
        // (How we died leads: who, with what; or what happened.)
        const cause = game.deathCause ? `${game.deathCause} · ` : '';
        if (rs.out) big('FRAGGED', `${cause}out for this wave · ${watching}`, '#ff4d3d');
        else if ((regicide || extraction || pvp) && rs.inWave) {
          const back = Math.ceil(game.respawnTicks / TICK_RATE);
          big('FRAGGED', back > 0 ? `${cause}redeploying in ${Math.floor(back / 60)}:${String(back % 60).padStart(2, '0')} · ${watching}` : `${cause}drop rocket inbound · ${watching}`, '#ff4d3d');
        }
        else if (!rs.inWave) big('STAND BY', `wave in progress · you're in the next one · ${watching}`, '#c8d0d8');
        else if (teams && game.myTeam !== Team.None) big('INBOUND', `you fight for ${TEAM_NAMES[game.myTeam].toLowerCase()} · drop rocket on its way`, teamCss(game.myTeam));
        else big('INBOUND', 'drop rocket on its way', '#ffd34a');
      }
    }
    ctx.textAlign = 'left';
  }

  /**
   * The match card: top left, under the HP and JET bars and the gold line,
   * as wide as the bars (wider if it must). Wave and mode, the clock (red in the last 30 s), and beneath them
   * how the sides stand; Extraction adds where the idol is under the card.
   */
  private drawMatchCard(title: string, clock: string, clockColor: string, parts: { t: string; c: string }[], extra: { t: string; c: string } | null, s: number): void {
    const ctx = this.ctx;
    const x = 14 * s;
    const y = 70 * s;
    const h = 32 * s;
    const pad = 8 * s;
    const small = `${Math.round(11 * s)}px ui-monospace, monospace`;
    const bold = `bold ${Math.round(12 * s)}px ui-monospace, monospace`;
    const big = `bold ${Math.round(14 * s)}px ui-monospace, monospace`;
    ctx.font = bold;
    const tw = ctx.measureText(title).width;
    ctx.font = big;
    const cw = ctx.measureText(clock).width;
    ctx.font = small;
    const pw = parts.reduce((w, p) => w + ctx.measureText(p.t).width, 0);
    const w = Math.max(tw + cw + pad * 3, pw + pad * 2, 180 * s);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = clockColor;
    ctx.fillRect(x, y, 2 * s, h);
    ctx.textAlign = 'left';
    ctx.font = bold;
    ctx.fillStyle = '#c8d0d8';
    ctx.fillText(title, x + pad, y + 13 * s);
    ctx.textAlign = 'right';
    ctx.font = big;
    ctx.fillStyle = clockColor;
    ctx.fillText(clock, x + w - pad, y + 14 * s);
    ctx.textAlign = 'left';
    ctx.font = small;
    let px = x + pad;
    for (const p of parts) {
      ctx.fillStyle = p.c;
      ctx.fillText(p.t, px, y + 27 * s);
      px += ctx.measureText(p.t).width;
    }
    if (extra) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const ew = ctx.measureText(extra.t).width + pad * 2;
      ctx.fillRect(x, y + h + 2 * s, ew, 16 * s);
      ctx.fillStyle = extra.c;
      ctx.fillText(extra.t, x + pad, y + h + 14 * s);
    }
  }

  /** The scope's spotlight centre (canvas px), gliding toward the target; and whether we were scoped last frame. */
  private spot: { x: number; y: number } | null = null;
  private spotWasScoped = false;

  /** When the current big message first showed (it slides in each time it changes). */
  private bannerKey = '';
  private bannerAt = 0;

  /**
   * A big centre-screen message, retro console style but tidy: the title
   * in block letters made of █ (banner.ts), glowing in the message's colour
   * over a hard drop shadow, on a dark band with faint scanlines that fades
   * out at its edges, edged with thin rules in that colour. Under it, a
   * terminal prompt: the status line (the subtitle's first segment) with a
   * blinking cursor, and the hints in dim phosphor green, wrapped to fit
   * the screen. Everything is sized to fit; each new message slides in.
   */
  private drawBanner(text: string, sub: string, color: string, s: number, W: number, H: number): void {
    const ctx = this.ctx;
    const now = performance.now();
    if (text !== this.bannerKey) {
      this.bannerKey = text;
      this.bannerAt = now;
    }
    const t = Math.min(1, (now - this.bannerAt) / 260);
    const ease = 1 - (1 - t) * (1 - t) * (1 - t);
    const maxW = W * 0.84;
    const MONO = 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
    // The title in block letters, sized so the whole banner fits (monospace cells are ~0.6em wide).
    const lines = bannerLines(text);
    const cols = Math.max(1, lines[0].length);
    const px = Math.max(4, Math.min(13 * s, maxW / (cols * 0.6)));
    const bw = cols * px * 0.6;
    const titleH = lines.length * px;
    // The prompt: status line and hints, wrapped to fit.
    const hp = Math.max(10, Math.round(14 * s));
    const sp = Math.max(9, Math.round(12 * s));
    ctx.font = `${sp}px ${MONO}`;
    const lay = layoutSub(sub, maxW, (x) => ctx.measureText(x).width);
    const head = lay.head ? `> ${lay.head.toUpperCase()}` : '';
    const headH = head ? hp * 1.8 : 0;
    const hintH = sp * 1.45;
    const padY = 14 * s;
    const bandH = padY * 2 + titleH + (head || lay.hints.length ? 8 * s : 0) + headH + lay.hints.length * hintH;
    const top = H * 0.17;
    ctx.save();
    ctx.globalAlpha = ease;
    // The band, fading out toward the sides, with faint scanlines.
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(4,8,6,0)');
    g.addColorStop(0.2, 'rgba(4,8,6,0.78)');
    g.addColorStop(0.8, 'rgba(4,8,6,0.78)');
    g.addColorStop(1, 'rgba(4,8,6,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, W, bandH);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    const step = Math.max(2, Math.round(3 * s));
    for (let y = top + 1; y < top + bandH; y += step) ctx.fillRect(W * 0.12, y, W * 0.76, 1);
    // Rules top and bottom, in the message's colour, drawing out from the centre.
    const rw = W * 0.6 * ease;
    const rule = ctx.createLinearGradient(W / 2 - rw / 2, 0, W / 2 + rw / 2, 0);
    rule.addColorStop(0, 'rgba(0,0,0,0)');
    rule.addColorStop(0.5, color);
    rule.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rule;
    const rh = Math.max(1, Math.round(2 * s));
    ctx.fillRect(W / 2 - rw / 2, top, rw, rh);
    ctx.fillRect(W / 2 - rw / 2, top + bandH - rh, rw, rh);
    // The title: a soft glow in its colour, a hard drop shadow, then the letters.
    ctx.font = `${px}px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const x0 = W / 2 - bw / 2 + (1 - ease) * -40 * s;
    const y0 = top + padY;
    const off = Math.max(1, Math.round(px * 0.18));
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    for (let r = 0; r < lines.length; r++) ctx.fillText(lines[r], x0 + off, y0 + r * px + off);
    ctx.shadowColor = color;
    ctx.shadowBlur = 16 * s;
    ctx.fillStyle = color;
    for (let r = 0; r < lines.length; r++) ctx.fillText(lines[r], x0, y0 + r * px);
    ctx.shadowBlur = 0;
    // The prompt.
    let y = y0 + titleH + 8 * s;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (head) {
      let hw = hp;
      ctx.font = `bold ${hw}px ${MONO}`;
      const cursor = Math.floor(now / 500) % 2 ? '_' : ' ';
      while (hw > 8 && ctx.measureText(head + '_').width > maxW) {
        hw--;
        ctx.font = `bold ${hw}px ${MONO}`;
      }
      y += headH / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(head + cursor, W / 2 + s, y + s);
      ctx.fillStyle = '#e8ffe8';
      ctx.fillText(head + cursor, W / 2, y);
      y += headH / 2;
    }
    ctx.font = `${sp}px ${MONO}`;
    ctx.fillStyle = 'rgba(150,232,150,0.85)';
    for (const line of lay.hints) {
      y += hintH / 2;
      ctx.fillText(line, W / 2, y);
      y += hintH / 2;
    }
    ctx.restore();
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

/** A spider droid's remembered feet (world cells), each foot's step (from, and progress 0..1; 1 = planted). */
interface DroidGait {
  x: Float32Array;
  y: Float32Array;
  fx: Float32Array;
  fy: Float32Array;
  t: Float32Array;
  at: number;
  init: boolean;
  lx: number;
  ly: number;
  bob: number;
  /** Body pitch (radians, clockwise on screen), easing toward the ground's slope. */
  tilt: number;
}
/** Droid legs (in DROID_LEGS order: back outer to front outer): hips along the chassis (droid-local x, facing right). */
const DROID_HIP_X = [0.6, 1.9, 3.2, 4.8, 6.1, 7.4];
/** Where each foot rests, out from the body's centre (cells, + ahead): wide, a spider's stance. */
const DROID_REST = [-11.5, -7.8, -4.2, 4.2, 7.8, 11.5];
/** Which of the two alternating tripods each leg steps with (outer and inner one side, middle the other). */
const DROID_TRIPOD = [0, 1, 0, 1, 0, 1];
/** Thigh and shin lengths (cells): a short rise to the knee, a long reach down. */
const DROID_THIGH = 5.2;
const DROID_SHIN = 9;
/** How far a foot may lag where it belongs before it steps, and how long a step takes (s). */
const DROID_STRIDE = 3.6;
const DROID_STEP_TIME = 0.085;
/** The tarantula's hips along its body (world cells either side of its centre, facing right; DROID_LEGS order). */
const TARANTULA_HIPS = [-15, -10, -5, 5, 10, 15];
/** The steepest its body pitches to the ground's slope, and how far it rears up a wall it's climbing (radians). */
const DROID_MAX_TILT = 0.6;
const DROID_WALL_TILT = 0.9;
