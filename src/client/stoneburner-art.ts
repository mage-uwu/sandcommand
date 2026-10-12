import type { BurnerState, FootState } from '../shared/frame.ts';
import { BURNER_FUSE, BURNER_STRIKE, BurnerPhase, FOOT_LIFE, STRIKE_HEIGHT, blinkOn } from '../shared/stoneburner.ts';

/**
 * The Stoneburner as this client draws it (stoneburner.ts): the beacon
 * winking ever faster, with a red targeting line up into the sky as its
 * last seconds run out; the missile's white-hot streak down out of orbit;
 * the strike's molten core glowing in its pit; and the flash that whites
 * out every screen in the room. (The mushroom cloud is a shader of its own:
 * stone-cloud.ts.)
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
