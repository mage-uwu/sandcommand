import type { Terrain } from '../shared/terrain.ts';
import { openWay } from '../shared/wildlife.ts';

/**
 * The wildlife, drawn. The millipede: a chain of vibrant pink coral plates
 * (pored, a pale sheen along each back, a coral polyp branching off every
 * other one), gems grown into them (faceted pink, turquoise and emerald
 * crystals, glinting), every plate with a pair of thin pink legs stepping
 * on the ground under it, its body lying along whatever surface it's on; a
 * broad head with feelers and mandibles. Reared up to spit, its hood
 * spreads either side of its neck like a cobra's, magenta coral with
 * turquoise gem eyespots and a pale rim. (Its venom stays blood-red.)
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** A fixed hash in [0, 1) per (plate, salt): where its pores and gem sit, and which gem. */
const gemHash = (i: number, k: number) => {
  let h = (i * 374761393 + k * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** The GEMMs it grows: each a body colour and a facet's brighter one (pink, turquoise, emerald). */
const GEM_LOOKS = [
  ['#ff2a8a', '#ffa0d0'],
  ['#18c8c0', '#90fff4'],
  ['#22b85a', '#9cffb8'],
] as const;

/**
 * Draw a millipede from its body points (head first, flat x, y pairs), how
 * far up it's reared (0..1), at time `now` (ms) for its legs' stepping.
 */
export function drawMillipede(ctx: CanvasRenderingContext2D, t: Terrain, pts: readonly number[], lift: number, now: number, hurt: number): void {
  const n = pts.length >> 1;
  if (n < 2) return;
  const P = (i: number) => ({ x: pts[Math.max(0, Math.min(n - 1, i)) * 2], y: pts[Math.max(0, Math.min(n - 1, i)) * 2 + 1] });
  // Per segment: along the body (toward the head) and which way is up off its ground.
  const seg: { x: number; y: number; tx: number; ty: number; nx: number; ny: number; w: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = P(i - 1);
    const b = P(i + 1);
    let tx = a.x - b.x;
    let ty = a.y - b.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const p = P(i);
    // Up off the ground: the open side, squared to the body (the side it bends away from its ground).
    const up = openWay(t, p.x, p.y);
    let nx = -ty;
    let ny = tx;
    if (nx * up.x + ny * up.y < 0) {
      nx = -nx;
      ny = -ny;
    }
    // Tapering: a broad head and fore-body, narrowing to the tail.
    const w = i === 0 ? 3.4 : lerp(3.1, 1.7, i / (n - 1));
    seg.push({ x: p.x, y: p.y, tx, ty, nx, ny, w });
  }
  const step = now / 55;
  // Legs first (under the plates): a pair a segment, stepping in a wave down the body.
  ctx.lineCap = 'round';
  for (let i = 1; i < n; i++) {
    const s = seg[i];
    const lifted = i < 5 && lift > 0.1; // (a reared neck's legs paw the air)
    for (const side of [-1, 1]) {
      const ph = step + i * 0.85 + (side > 0 ? Math.PI : 0);
      const swing = Math.sin(ph) * 1.6;
      const raise = Math.max(0, Math.cos(ph)) * 1.2;
      const bx = s.x - s.nx * (s.w * 0.4) + s.tx * side * 0.9;
      const by = s.y - s.ny * (s.w * 0.4) + s.ty * side * 0.9;
      const reach = lifted ? 2.5 : 4.2 - raise;
      const kx = bx - s.nx * reach * 0.55 + s.tx * (swing * 0.5 + side * 1.4);
      const ky = by - s.ny * reach * 0.55 + s.ty * (swing * 0.5 + side * 1.4);
      const fx = bx - s.nx * reach + s.tx * (swing + side * 0.8);
      const fy = by - s.ny * reach + s.ty * (swing + side * 0.8);
      ctx.strokeStyle = side > 0 ? '#e05a8a' : '#ffa0c0';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(kx, ky);
      ctx.lineTo(fx, fy);
      ctx.stroke();
    }
  }
  // The hood, behind the head and neck: spreading either side as it rears.
  if (lift > 0.05) {
    const h = seg[1];
    const spread = 2 + lift * 7.5;
    const a = Math.atan2(h.ty, h.tx);
    ctx.save();
    ctx.translate(h.x + h.tx * 0.5, h.y + h.ty * 0.5);
    ctx.rotate(a);
    ctx.fillStyle = '#ffd0e0';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.6 + lift, spread + 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c0105a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.2 + lift, spread, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4f9b';
    ctx.beginPath();
    ctx.ellipse(0.4, 0, 2.2 + lift * 0.6, spread * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eyespots, one each side, and the dark ribs fanning out to the rim.
    if (lift > 0.4) {
      ctx.strokeStyle = 'rgba(120,0,50,0.7)';
      ctx.lineWidth = 0.4;
      for (let r = -3; r <= 3; r++) {
        if (r === 0) continue;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(r * 0.45) * -1.5, (r / 3) * spread);
        ctx.stroke();
      }
      for (const sd of [-1, 1]) {
        // (Eyespots: turquoise gems in pale rings.)
        ctx.fillStyle = '#fff0f6';
        ctx.beginPath();
        ctx.arc(0, sd * spread * 0.55, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1fb8b0';
        ctx.beginPath();
        ctx.arc(0, sd * spread * 0.55, 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9ffff4';
        ctx.fillRect(-0.4, sd * spread * 0.55 - 0.5, 0.45, 0.45);
      }
    }
    ctx.restore();
  }
  // The plates, tail to head (each overlapping the one behind it).
  for (let i = n - 1; i >= 0; i--) {
    const s = seg[i];
    const a = Math.atan2(s.ty, s.tx);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(a);
    // (Up, in this frame: +y or -y, whichever the open side is.)
    const upY = s.nx * -Math.sin(a) + s.ny * Math.cos(a) > 0 ? 1 : -1;
    const len = i === 0 ? 3.4 : 2.7;
    // Coral flesh: a deep rose under-shadow, the hot-pink plate, a pale coral sheen on the open side.
    ctx.fillStyle = hurt > 0 ? '#7a0e3a' : '#a8104a';
    ctx.beginPath();
    ctx.ellipse(0, 0, len, s.w, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = i % 2 ? '#ff4f8b' : '#ff6a9c';
    ctx.beginPath();
    ctx.ellipse(-0.2, upY * s.w * 0.25, len * 0.86, s.w * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb0c8';
    ctx.beginPath();
    ctx.ellipse(-0.4, upY * s.w * 0.55, len * 0.55, s.w * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    // Coral pores, a few to a plate (fixed for each, so they don't crawl over it).
    ctx.fillStyle = 'rgba(140,10,60,0.55)';
    for (let k = 0; k < 3; k++) {
      const h = gemHash(i, k + 7);
      ctx.fillRect((h - 0.5) * len * 1.3, upY * (0.1 + gemHash(i, k + 11) * 0.5) * s.w - 0.25, 0.5, 0.5);
    }
    // The belly edge: pale coral pink.
    ctx.fillStyle = '#ffc8d8';
    ctx.fillRect(-len * 0.7, -upY * s.w * 0.8 - 0.3, len * 1.3, 0.6);
    // A coral polyp branching up off every other plate.
    if (i > 0 && i % 2 === 0) {
      ctx.strokeStyle = '#ff8ab4';
      ctx.lineWidth = 0.6;
      const sway = Math.sin(now / 300 + i) * 0.4;
      ctx.beginPath();
      ctx.moveTo(-0.3, upY * s.w * 0.8);
      ctx.lineTo(-0.6 + sway, upY * (s.w + 1.6));
      ctx.moveTo(-0.5 + sway * 0.6, upY * (s.w + 0.7));
      ctx.lineTo(0.6 + sway, upY * (s.w + 1.4));
      ctx.stroke();
      ctx.fillStyle = '#ffe0ec';
      ctx.fillRect(-0.9 + sway, upY * (s.w + 1.6) - 0.35, 0.7, 0.7);
      ctx.fillRect(0.3 + sway, upY * (s.w + 1.4) - 0.35, 0.7, 0.7);
    }
    // Gems grown into its back: a faceted crystal on most plates, pink, turquoise or emerald, glinting.
    if (gemHash(i, 1) < 0.8 || i === 1) {
      const g = GEM_LOOKS[Math.floor(gemHash(i, 2) * GEM_LOOKS.length)];
      const gx = (gemHash(i, 3) - 0.5) * len * 0.8;
      const gy = upY * s.w * 0.45;
      const r = 0.9 + gemHash(i, 4) * 0.7 + (i < 4 ? 0.3 : 0);
      ctx.fillStyle = g[0];
      ctx.beginPath();
      ctx.moveTo(gx, gy + upY * r * 1.3);
      ctx.lineTo(gx + r, gy);
      ctx.lineTo(gx, gy - upY * r * 0.7);
      ctx.lineTo(gx - r, gy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = g[1];
      ctx.beginPath();
      ctx.moveTo(gx, gy + upY * r * 1.3);
      ctx.lineTo(gx + r, gy);
      ctx.lineTo(gx, gy);
      ctx.closePath();
      ctx.fill();
      const tw = (Math.sin(now / 240 + i * 1.7) + 1) / 2;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.65 * tw * tw})`;
      ctx.fillRect(gx - r * 0.45, gy + upY * r * 0.45 - 0.25, 0.5, 0.5);
    }
    // The joint behind each plate.
    ctx.fillStyle = '#6a0830';
    ctx.fillRect(-len - 0.2, -s.w * 0.7, 0.6, s.w * 1.4);
    if (i === 0) {
      // The head: feelers out ahead, curling; mandibles; a pale eye.
      ctx.strokeStyle = '#ffb0c8';
      ctx.lineWidth = 0.5;
      const wave = Math.sin(now / 160) * 0.8;
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(len * 0.6, upY * 0.9);
        ctx.quadraticCurveTo(len + 2, upY * (1.4 + 0.5 * sd), len + 5, upY * (1.2 + 1.1 * sd + wave * 0.4 * sd));
        ctx.stroke();
      }
      ctx.fillStyle = '#ffe0ec';
      ctx.fillRect(len - 0.6, -upY * 1.6 - 0.5, 1.8, 0.9);
      ctx.fillRect(len - 0.6, -upY * 0.4 - 0.5, 1.8, 0.9);
      ctx.fillStyle = lift > 0.3 ? '#3fe8d8' : '#c8fff8';
      ctx.fillRect(len * 0.2, upY * 1.2 - 0.5, 1, 1);
    }
    ctx.restore();
  }
}
