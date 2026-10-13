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

/**
 * The molten sludge: each blob a glob of glowing slag (white-yellow while
 * fresh, orange, then a dull red under a darkening crust as it cools), in a
 * glow of its own, so a pool of them reads as one seething puddle and a
 * trickle of them as a stream.
 */
export function drawFeet(ctx: CanvasRenderingContext2D, list: readonly FootState[], now: number): void {
  const op = ctx.globalCompositeOperation;
  // The glow first, all of it (added up where they crowd together).
  ctx.globalCompositeOperation = 'lighter';
  for (const f of list) {
    const heat = f.life / FOOT_LIFE;
    const r = 6 + 10 * heat;
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    g.addColorStop(0, `rgba(255,150,50,${0.3 * Math.min(1, heat * 1.5 + 0.2)})`);
    g.addColorStop(1, 'rgba(200,50,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = op;
  // Then the sludge itself, in layers across the whole puddle (crust, then the melt, then its hottest
  // heart), so neighbouring blobs run together as one, the dark crust only round its edge.
  const tone = (heat: number) =>
    heat > 0.55 ? ['#7a2a10', '#ffc050', '#fff0b0'] : heat > 0.3 ? ['#5a2010', '#e86a1c', '#ffb040'] : heat > 0.12 ? ['#2a1610', '#a83410', '#e05818'] : ['#1e120c', '#4a1a10', '#8a2a10'];
  for (let layer = 0; layer < 3; layer++) {
    for (const f of list) {
      const heat = f.life / FOOT_LIFE;
      const x = Math.round(f.x);
      const y = Math.round(f.y);
      const seed = (x * 7 + y * 13) & 3;
      ctx.fillStyle = tone(heat)[layer];
      if (layer === 0) {
        ctx.fillRect(x - 5, y - 1, 11, 4);
        ctx.fillRect(x - 4, y - 3 + (seed & 1), 9, 7);
      } else if (layer === 1) {
        ctx.fillRect(x - 4, y - 1, 9, 3);
        ctx.fillRect(x - 3, y - 2 - (seed >> 1), 7, 5);
      } else {
        const flick = Math.sin(now / 90 + x * 0.7 + y) * 0.5 + 0.5;
        ctx.fillRect(x - 2 - (seed & 1), y - 1, 4 + (seed & 1), 2 + (flick > 0.5 ? 1 : 0));
        // (Crust floating on it as it cools: dark flecks.)
        if (heat < 0.4) {
          ctx.fillStyle = tone(heat)[0];
          ctx.fillRect(x + 1 - seed, y - 2, 2, 1);
        }
      }
    }
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
