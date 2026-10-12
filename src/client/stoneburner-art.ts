import type { BurnerState, FootState } from '../shared/frame.ts';
import { BURNER_FUSE, BURNER_STRIKE, BurnerPhase, CLOUD_MS, FOOT_LIFE, STRIKE_HEIGHT, blinkOn } from '../shared/stoneburner.ts';

/**
 * The Stoneburner as this client draws it (stoneburner.ts): the beacon
 * winking ever faster, with a red targeting line up into the sky as its
 * last seconds run out; the missile's white-hot streak down out of orbit;
 * the strike's molten core glowing in its pit; the mushroom cloud over the
 * site; and the flash that whites out every screen in the room.
 */

/** The beacons (world space), and any missile on its way down. */
export function drawBeacons(ctx: CanvasRenderingContext2D, list: readonly BurnerState[], now: number): void {
  for (const b of list) {
    const x = Math.round(b.x);
    const y = Math.round(b.y);
    if (b.phase === BurnerPhase.Strike) {
      drawMissile(ctx, b.x, b.y, b.fuse);
      continue;
    }
    const f = 1 - b.fuse / BURNER_FUSE;
    // Its last five seconds: the targeting beam, a thin red line straight up into the sky, brightening.
    if (b.fuse < 150) {
      const a = (1 - b.fuse / 150) * (0.25 + 0.15 * Math.sin(now / 40));
      ctx.fillStyle = `rgba(255,40,30,${a})`;
      ctx.fillRect(x, y - 2400, 1, 2400);
    }
    // The puck: steel, a hazard band.
    ctx.fillStyle = '#1a1c1e';
    ctx.fillRect(x - 3, y - 2, 7, 4);
    ctx.fillStyle = '#7a8086';
    ctx.fillRect(x - 2, y - 2, 5, 1);
    ctx.fillStyle = '#e0b030';
    ctx.fillRect(x - 2, y, 5, 1);
    // Its eye, winking faster and faster.
    if (blinkOn(b.fuse)) {
      ctx.fillStyle = `rgba(255,40,30,${0.18 + 0.22 * f})`;
      ctx.beginPath();
      ctx.arc(x + 0.5, y - 1.5, 1.5 + 1.5 * f, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff3a2a';
      ctx.fillRect(x, y - 2, 1, 1);
    } else {
      ctx.fillStyle = '#501010';
      ctx.fillRect(x, y - 2, 1, 1);
    }
  }
}

/** The missile out of orbit: a white-hot point with a long streak behind it (`left` ticks of its fall to go). */
function drawMissile(ctx: CanvasRenderingContext2D, x: number, gy: number, left: number): void {
  const k = Math.max(0, left / BURNER_STRIKE);
  const y = gy - STRIKE_HEIGHT * k;
  const len = 420;
  const g = ctx.createLinearGradient(x, y - len, x, y);
  g.addColorStop(0, 'rgba(255,200,120,0)');
  g.addColorStop(0.7, 'rgba(255,230,170,0.55)');
  g.addColorStop(1, 'rgba(255,255,240,1)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 2, y - len, 4, len);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 0.5, y - len * 0.6, 1, len * 0.6);
  ctx.fillStyle = 'rgba(255,250,220,0.5)';
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
}

/** The molten cores in their pits: a white-hot heart in an orange glow, flickering, dimming as it smoulders out. */
export function drawFeet(ctx: CanvasRenderingContext2D, list: readonly FootState[], now: number): void {
  for (const f of list) {
    const heat = f.life / FOOT_LIFE;
    const flick = 0.85 + 0.15 * Math.sin(now / 55 + f.x);
    const r = (18 + 26 * heat) * flick;
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    g.addColorStop(0, `rgba(255,250,210,${0.95 * Math.min(1, heat * 2 + 0.3)})`);
    g.addColorStop(0.25, `rgba(255,170,60,${0.75 * Math.min(1, heat * 2 + 0.25)})`);
    g.addColorStop(0.6, `rgba(220,60,20,${0.35 * Math.min(1, heat + 0.2)})`);
    g.addColorStop(1, 'rgba(120,20,10,0)');
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = op;
    // The puddle of it at the bottom of the pit.
    ctx.fillStyle = heat > 0.3 ? '#fff4c0' : heat > 0.1 ? '#ffb040' : '#c04018';
    ctx.fillRect(Math.round(f.x - 6), Math.round(f.y + 3), 13, 3);
    ctx.fillStyle = heat > 0.3 ? '#ffd060' : '#902a10';
    ctx.fillRect(Math.round(f.x - 8), Math.round(f.y + 5), 17, 3);
  }
}

/** A little seeded generator, so a cloud's puffs sit the same from frame to frame. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function rgb(c: readonly number[], a: number): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}
function lerpC(a: readonly number[], b: readonly number[], t: number): number[] {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}
const FIRE = [255, 236, 190];
const EMBER = [240, 120, 40];
const SMOKE = [112, 94, 84];
const SMOKE_HI = [176, 160, 148];
const SMOKE_LO = [58, 48, 44];

/**
 * The mushroom cloud over a strike (world space; ground zero at (x, y),
 * `t` seconds since it landed): the fireball swelling up off the ground,
 * then rising on its stem and rolling over into the cap, its underside lit
 * by the fire inside at first, cooling to a dirty grey-brown; a skirt of dust
 * round the stem's foot. It drifts a little on the wind and thins out at
 * the end of CLOUD_MS.
 */
export function drawMushroom(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number): void {
  const life = CLOUD_MS / 1000;
  if (t < 0 || t > life) return;
  const r = rng(seed);
  const fade = t > life * 0.55 ? Math.max(0, 1 - (t - life * 0.55) / (life * 0.45)) : 1;
  const drift = t * 3;
  // How it's grown: the cap's height over the ground, its radius, the stem's width.
  const rise = 40 + 250 * (1 - Math.exp(-t / 7));
  const capR = 40 + 130 * (1 - Math.exp(-t / 8));
  const stemW = 7 + 15 * (1 - Math.exp(-t / 6));
  const cx = x + drift;
  const cy = y - rise;
  // How hot it still is: the fire inside, cooling.
  const hot = Math.max(0, 1 - t / 10);
  const glow = Math.max(0, 1 - t / 22);
  const body = lerpC(SMOKE, EMBER, hot * 0.8);
  const hi = lerpC(SMOKE_HI, FIRE, hot * 0.7);
  const lo = lerpC(SMOKE_LO, EMBER, glow * 0.5);
  const a = 0.95 * fade;
  /** One puff of it: its shadow side, its body, the light catching its top. */
  const puff = (px: number, py: number, pr: number, c: readonly number[], light: number) => {
    ctx.fillStyle = rgb(lerpC(lo, c, 0.35), a);
    ctx.beginPath();
    ctx.arc(px + pr * 0.12, py + pr * 0.18, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgb(c, a);
    ctx.beginPath();
    ctx.arc(px, py, pr * 0.9, 0, Math.PI * 2);
    ctx.fill();
    if (light > 0) {
      ctx.fillStyle = rgb(lerpC(c, hi, 0.75), a * light);
      ctx.beginPath();
      ctx.arc(px - pr * 0.28, py - pr * 0.32, pr * 0.48, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // The skirt of dust round the foot of it, rolling out along the ground.
  const skirt = 50 + 200 * (1 - Math.exp(-t / 5));
  for (let i = 0; i < 16; i++) {
    const u = (i / 15) * 2 - 1;
    const px = x + u * skirt * (0.85 + 0.3 * r()) + drift * 0.5;
    const pr = (10 + 16 * r()) * (1 - Math.abs(u) * 0.55) * Math.min(1, 0.4 + t / 4);
    puff(px, y - pr * 0.45, pr, lerpC(SMOKE, SMOKE_HI, 0.25 + 0.3 * r()), 0.5);
  }

  // The stem: a column of puffs from the ground up into the cap, pinched in the middle, a little wavering.
  const stemTop = cy + capR * 0.2;
  const n = 26;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const py = mix(y - 4, stemTop, f);
    const pinch = 1 - 0.35 * Math.sin(f * Math.PI) + 0.5 * Math.max(0, 1 - f * 5);
    const pr = stemW * pinch * (0.8 + 0.4 * r());
    const px = mix(x, cx, f) + (r() - 0.5) * stemW * 0.6 + Math.sin(t * 0.7 + i * 0.9) * 2;
    puff(px, py, pr, lerpC(lo, body, 0.35 + 0.65 * f), 0.35);
  }

  // The cap: puffs round a torus, rolling (up the outside, in over the top, down the middle); flat and wide.
  const puffs = 34;
  const roll = t * 0.22;
  const order: { px: number; py: number; pr: number; depth: number; lift: number }[] = [];
  for (let i = 0; i < puffs; i++) {
    const ang = (i / puffs) * Math.PI * 2 + roll + r() * 0.3;
    const across = (r() * 2 - 1) * 0.98;
    const px = cx + across * capR * 1.05;
    const ring = Math.sin(ang);
    const py = cy - ring * capR * 0.2 - (1 - across * across) * capR * 0.28;
    const pr = capR * (0.22 + 0.12 * r()) * (1 - Math.abs(across) * 0.3);
    order.push({ px, py, pr, depth: Math.cos(ang), lift: ring });
  }
  order.sort((p, q) => p.depth - q.depth);
  for (const p of order) {
    const lit = 0.5 + 0.5 * p.lift;
    puff(p.px, p.py, p.pr, lerpC(body, hi, lit * 0.45), 0.4 + 0.5 * lit);
  }
  // The underside of the cap, lit by the fire inside (while it lasts).
  if (glow > 0) {
    const g = ctx.createRadialGradient(cx, cy + capR * 0.3, 0, cx, cy + capR * 0.3, capR * 1.1);
    g.addColorStop(0, `rgba(255,170,70,${0.55 * glow * fade})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy + capR * 0.3, capR * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = op;
  }

  // The first seconds: the fireball itself, white-hot, swelling up off the ground.
  if (t < 4) {
    const k = t / 4;
    const fr = 40 + 110 * Math.sqrt(k);
    const fy = y - 30 - rise * 0.6 * k;
    const g = ctx.createRadialGradient(x, fy, 0, x, fy, fr);
    g.addColorStop(0, `rgba(255,255,240,${1 - k * 0.6})`);
    g.addColorStop(0.45, `rgba(255,210,120,${0.9 * (1 - k)})`);
    g.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, fy, fr, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The flash of a strike, over the whole screen (screen space; `ms` since it
 * went off): pure white a moment, then fading back through a warm glare.
 */
export function drawStoneFlash(ctx: CanvasRenderingContext2D, w: number, h: number, ms: number): void {
  if (ms < 0 || ms > 3200) return;
  const a = ms < 140 ? 1 : Math.pow(Math.max(0, 1 - (ms - 140) / 3000), 1.6);
  if (a <= 0.003) return;
  ctx.fillStyle = ms < 140 ? `rgba(255,255,255,${a})` : `rgba(255,246,226,${a})`;
  ctx.fillRect(0, 0, w, h);
}
