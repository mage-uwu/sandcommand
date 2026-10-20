/**
 * The HUD's menu-style pieces (the death card, the standings, the
 * scoreboard, the team picker, the big centre messages), drawn on the game
 * canvas in one modern style: dark glass panels with rounded corners and a
 * hairline edge, a coloured accent, a clean sans for titles and labels,
 * key chips for the controls. These are the shared bits; render.ts lays
 * them out.
 */

/** Titles and labels: a heavy system sans. */
export const UI_SANS = '"Segoe UI", Roboto, "Helvetica Neue", Arial, system-ui, sans-serif';

/** A font string: `size` device px, `weight`, optionally italic. */
export const uiFont = (size: number, weight = 600, italic = false) => `${italic ? 'italic ' : ''}${weight} ${Math.max(6, Math.round(size))}px ${UI_SANS}`;

/** Letter-spacing (device px), where the canvas has it (it's ignored where it doesn't). */
export function track(ctx: CanvasRenderingContext2D, px: number): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`;
}

/** A rounded-rectangle path. */
export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/**
 * A glass panel: a soft shadow under it, a dark fill a shade lighter at the
 * top, a hairline edge, and (if `accent`) a bar of that colour down its left.
 */
export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: number, accent?: string, alpha = 0.86): void {
  const r = 8 * s;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 24 * s;
  ctx.shadowOffsetY = 6 * s;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgba(30,27,30,${alpha})`);
  g.addColorStop(1, `rgba(12,11,14,${alpha})`);
  ctx.fillStyle = g;
  rrect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
  ctx.save();
  rrect(ctx, x, y, w, h, r);
  ctx.clip();
  // (A faint sheen along the top.)
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(x, y, w, Math.max(1, s));
  if (accent) {
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, 3 * s, h);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = Math.max(1, s);
  rrect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.stroke();
}

/**
 * A key chip ("C", "TAB", "CLICK") at (x, y) (its left edge, middle), the
 * text `size` px: a little keycap. Returns its width.
 */
export function keyChip(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, size: number, s: number): number {
  ctx.save();
  ctx.font = uiFont(size, 700);
  track(ctx, 0.5 * s);
  const tw = ctx.measureText(label).width;
  const w = Math.max(size * 1.7, tw + size * 0.9);
  const h = size * 1.6;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  rrect(ctx, x, y - h / 2, w, h, 4 * s);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + 3 * s, y + h / 2 - Math.max(1, s), w - 6 * s, Math.max(1, s));
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = Math.max(1, s);
  rrect(ctx, x + 0.5, y - h / 2 + 0.5, w - 1, h - 1, 4 * s);
  ctx.stroke();
  ctx.fillStyle = '#f2f2f2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + size * 0.05);
  ctx.restore();
  return w;
}

/** A rank badge: a disc, gold, silver and bronze for the top three, numbered. */
export function rankBadge(ctx: CanvasRenderingContext2D, rank: number, x: number, y: number, r: number): void {
  const fill = rank === 1 ? '#f5c542' : rank === 2 ? '#c9d1d9' : rank === 3 ? '#d98a4e' : 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = rank <= 3 ? '#16130f' : '#c8ccd2';
  ctx.font = uiFont(r * 1.05, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(rank), x, y + r * 0.06);
}

/** `text`, cut down with an ellipsis to fit `maxW` in the current font. */
export function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

/** A CSS colour with its alpha replaced: rgb(...) or #rrggbb in, rgba(...) out. */
export function withAlpha(css: string, a: number): string {
  const m = /^rgba?\(([^)]+)\)$/.exec(css);
  if (m) {
    const [r, g, b] = m[1].split(',').map((v) => parseFloat(v));
    return `rgba(${r},${g},${b},${a})`;
  }
  const h = /^#([0-9a-f]{6})$/i.exec(css);
  if (h) {
    const n = parseInt(h[1], 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return css;
}
