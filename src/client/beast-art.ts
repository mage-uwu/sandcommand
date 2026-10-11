import type { Terrain } from '../shared/terrain.ts';
import { openWay } from '../shared/wildlife.ts';

/**
 * The wildlife, drawn. The millipede: a chain of dark, glossy chitin plates
 * (a ridge of rust-red along each back, a pale belly edge), every one with
 * a pair of thin legs stepping on the ground under it, its body lying along
 * whatever surface it's on; a broad head with feelers and mandibles. Reared
 * up to spit, its hood spreads either side of its neck like a cobra's,
 * blood-red with dark eyespots and a pale rim.
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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
      ctx.strokeStyle = side > 0 ? '#9a6a50' : '#c89878';
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
    ctx.fillStyle = '#e8c4a0';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.6 + lift, spread + 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a1210';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.2 + lift, spread, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8261a';
    ctx.beginPath();
    ctx.ellipse(0.4, 0, 2.2 + lift * 0.6, spread * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eyespots, one each side, and the dark ribs fanning out to the rim.
    if (lift > 0.4) {
      ctx.strokeStyle = 'rgba(40,6,6,0.7)';
      ctx.lineWidth = 0.4;
      for (let r = -3; r <= 3; r++) {
        if (r === 0) continue;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(r * 0.45) * -1.5, (r / 3) * spread);
        ctx.stroke();
      }
      for (const sd of [-1, 1]) {
        ctx.fillStyle = '#f0d070';
        ctx.beginPath();
        ctx.arc(0, sd * spread * 0.55, 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a0606';
        ctx.beginPath();
        ctx.arc(0, sd * spread * 0.55, 0.6, 0, Math.PI * 2);
        ctx.fill();
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
    ctx.fillStyle = hurt > 0 ? '#5a1a14' : '#2a100c';
    ctx.beginPath();
    ctx.ellipse(0, 0, len, s.w, 0, 0, Math.PI * 2);
    ctx.fill();
    // The glossy back: a rust ridge and a highlight on the open side; a pale belly edge under.
    ctx.fillStyle = i % 2 ? '#6e2a1a' : '#7e3220';
    ctx.beginPath();
    ctx.ellipse(-0.2, upY * s.w * 0.35, len * 0.82, s.w * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,200,170,0.35)';
    ctx.fillRect(-len * 0.5, upY * s.w * 0.62 - 0.3, len * 0.9, 0.6);
    ctx.fillStyle = '#b07a5a';
    ctx.fillRect(-len * 0.7, -upY * s.w * 0.8 - 0.3, len * 1.3, 0.6);
    // The joint behind each plate.
    ctx.fillStyle = '#140604';
    ctx.fillRect(-len - 0.2, -s.w * 0.7, 0.6, s.w * 1.4);
    if (i === 0) {
      // The head: feelers out ahead, curling; mandibles; a pale eye.
      ctx.strokeStyle = '#c89878';
      ctx.lineWidth = 0.5;
      const wave = Math.sin(now / 160) * 0.8;
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(len * 0.6, upY * 0.9);
        ctx.quadraticCurveTo(len + 2, upY * (1.4 + 0.5 * sd), len + 5, upY * (1.2 + 1.1 * sd + wave * 0.4 * sd));
        ctx.stroke();
      }
      ctx.fillStyle = '#d8a070';
      ctx.fillRect(len - 0.6, -upY * 1.6 - 0.5, 1.8, 0.9);
      ctx.fillRect(len - 0.6, -upY * 0.4 - 0.5, 1.8, 0.9);
      ctx.fillStyle = lift > 0.3 ? '#ff4a30' : '#e8d8a0';
      ctx.fillRect(len * 0.2, upY * 1.2 - 0.5, 1, 1);
    }
    ctx.restore();
  }
}
