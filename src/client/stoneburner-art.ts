import type { BurnerState, FootState } from '../shared/frame.ts';
import { BURNER_FUSE, BURNER_STRIKE, BurnerPhase, FOOT_LIFE, STRIKE_HEIGHT, blinkOn } from '../shared/stoneburner.ts';

/**
 * The Stoneburner as this client draws it (stoneburner.ts): the beacon
 * winking ever faster, with a red targeting line up into the sky as its
 * last seconds run out; the missile's white-hot streak down out of orbit;
 * the strike's molten core glowing in its pit; and the flash that whites
 * out every screen in the room. (The fireball is a shader of its own:
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

/**
 * The molten sludge: no shapes of its own, only light. Each blob is a hot
 * white-orange heart in a wide orange glow, added together where they
 * crowd, so a pool of them is one seething glare; the fire and the blasts
 * going off in it are particles (effects.ts moltenCore).
 */
export function drawFeet(ctx: CanvasRenderingContext2D, list: readonly FootState[], now: number): void {
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  for (const f of list) {
    const heat = f.life / FOOT_LIFE;
    const flick = 0.85 + 0.15 * Math.sin(now / 70 + f.x * 0.9 + f.y);
    const r = (16 + 26 * heat) * flick;
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    g.addColorStop(0, `rgba(255,${Math.round(150 + 90 * heat)},${Math.round(60 + 120 * heat)},${0.5 * Math.min(1, heat * 1.4 + 0.25)})`);
    g.addColorStop(0.3, `rgba(255,120,30,${0.22 * Math.min(1, heat * 1.4 + 0.2)})`);
    g.addColorStop(1, 'rgba(180,40,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = op;
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
