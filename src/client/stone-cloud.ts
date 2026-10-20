
/**
 * The Stoneburner's fireball, as a fragment shader (WebGL2), run only for
 * the few seconds it lasts (DOME_MS).
 *
 * Each frame it renders into its own small canvas, one texel per world cell
 * (so it sits in the game's pixels, not over them), and the renderer draws
 * that over the scene. It is a ball of fire swelling out from ground zero in
 * a fraction of a second, every way at once (into the ground as much as the
 * sky: it engulfs the crater): boiling, glowing white-hot at its heart,
 * orange and red out to its rim, the rim already turning to soot and dust. It lifts a little as it burns, cools from the outside in to smoke,
 * and is gone in a few seconds. What's left is the molten core boring down
 * into the crater, and the plume of smoke rising off it (game.ts: the
 * particles). Grain and a coarse colour ramp keep it gritty.
 *
 * No WebGL2: no dome (the flash, the shaking, the smoke and the debris
 * still play out).
 */

/** The canvas it renders into: cells wide and tall (ground zero in the middle, a little below centre: it rises as it burns). */
export const CLOUD_W = 800;
export const CLOUD_H = 760;
/** How long the dome lasts (ms): it doesn't linger. */
export const DOME_MS = 5000;
/** Ground zero is this far up from the canvas's bottom edge. */
const BASE = 340;

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uSize;     // canvas, cells
uniform float uBase;    // ground zero, cells up from the bottom
uniform float uT;       // seconds since it landed
uniform float uLife;    // seconds it lasts
uniform float uSeed;

// --- noise ---------------------------------------------------------------
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1, 0, 0));
  float n010 = hash13(i + vec3(0, 1, 0));
  float n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1));
  float n101 = hash13(i + vec3(1, 0, 1));
  float n011 = hash13(i + vec3(0, 1, 1));
  float n111 = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float fbm(vec3 p, int oct) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    p = p * 2.03 + vec3(17.1, 9.7, 3.3);
    a *= 0.5;
  }
  return s;
}

// --- the dome ---------------------------------------------------------------
/** Its radius: out to full size in a fraction of a second, then a slow swell. */
float domeR(float t) { return 30.0 + 200.0 * (1.0 - exp(-t * 3.4)) + 10.0 * t; }
/** How hot the whole of it still is: blinding, then dying fast (it's mostly smoke by three seconds). */
float life(float t) { return exp(-t / 1.15); }

vec3 blackbody(float k) {
  // deep red -> orange -> yellow -> white
  vec3 c = mix(vec3(0.30, 0.03, 0.0), vec3(0.95, 0.28, 0.04), smoothstep(0.0, 0.3, k));
  c = mix(c, vec3(1.0, 0.66, 0.22), smoothstep(0.3, 0.65, k));
  return mix(c, vec3(1.0, 0.97, 0.88), smoothstep(0.65, 1.0, k));
}

void main() {
  vec2 cell = floor(vUv * uSize);
  // Cells from ground zero, y up.
  vec2 p = vec2(cell.x - uSize.x * 0.5, cell.y - uBase);
  float t = uT;
  float R = domeR(t);
  // The ball: a little wider than tall, centred on ground zero, lifting as it burns (hot air rises).
  float lift = 14.0 * t * t / (1.0 + t);
  vec2 q = vec2(p.x / (R * 1.12), (p.y - lift) / R);
  // Boiling: the noise moves up and out with it, rolling over its surface.
  vec3 np = vec3(p * 0.024 + vec2(0.0, -t * 26.0) * 0.024, t * 0.9 + uSeed);
  vec3 warp = vec3(fbm(np + vec3(3.1, 0.0, 0.0), 3), fbm(np + vec3(0.0, 7.7, 0.0), 3), 0.0) - 0.5;
  float n = fbm(np + warp * 1.4, 5);
  float r = length(q);
  // (A ragged, billowing edge.)
  float edge = 1.0 - r + (n - 0.5) * 0.42;
  if (edge <= 0.0) {
    outColor = vec4(0.0);
    return;
  }
  float L = life(t);
  // The heat: white at the heart, out to red at the rim, all the way round.
  float heart = exp(-dot(q, q) * 3.2);
  float body = smoothstep(0.0, 0.45, edge);
  float T = clamp((heart * 1.0 + body * 0.45) * (0.55 + 0.9 * n) * L * 1.5, 0.0, 1.0);
  // The smoke: the rim first, then all of it as it cools (from the outside in).
  float rim = smoothstep(0.32, 0.0, edge);
  float soot = clamp(rim * 1.2 + (1.0 - L) * 1.1, 0.0, 1.0) * (0.55 + 0.7 * n);
  vec3 fire = blackbody(clamp(T * 1.3 + 0.08, 0.0, 1.0));
  // Soot and dust: dark below, a dusty tan up top where the daylight catches it; lit by the fire inside.
  vec3 smoke = mix(vec3(0.09, 0.07, 0.06), vec3(0.46, 0.40, 0.34), clamp(q.y * 0.5 + 0.4, 0.0, 1.0));
  smoke += fire * T * 0.7;
  float sm = clamp(soot - T * 0.9, 0.0, 1.0);
  vec3 col = mix(fire * (1.1 + 0.9 * T), smoke, sm);
  // Grit: per-cell grain and a coarse colour ramp (it's all pixels, after all).
  float g = hash12(cell + uSeed * 13.0 + floor(t * 12.0));
  col *= 0.93 + 0.14 * g;
  col = floor(col * 16.0 + g * 0.8) / 16.0;
  // How solid: blazing where it's hot, thick where it's smoke; gone by the end.
  float fade = 1.0 - smoothstep(uLife * 0.45, uLife, t);
  float a = clamp(smoothstep(0.0, 0.22, edge) * (0.5 + 0.5 * max(T * 1.2, sm)), 0.0, 1.0) * fade;
  // (A ragged edge, not a soft one: the alpha stepped and dithered too.)
  a = floor(a * 6.0 + g) / 6.0;
  outColor = vec4(col * a, a);
}`;

// The dome's growth (as the shader has it), for the glow drawn round it.
const domeR = (t: number) => 30 + 200 * (1 - Math.exp(-t * 3.4)) + 10 * t;
const lifeOf = (t: number) => Math.exp(-t / 1.15);

/** A soft disc of light added onto whatever's under it (world space). */
function glowDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number): void {
  if (a <= 0.004) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(0.4, `rgba(${rgb},${a * 0.45})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * The light the fireball gives off (drawn before it): a great glow round
 * it, every way from its heart, over sky and ground alike, flickering, dying
 * as fast as the fire does.
 */
export function drawCloudHalo(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  if (t < 0 || t * 1000 > DOME_MS) return;
  const h = lifeOf(t);
  const R = domeR(t);
  const cy = y - (14 * t * t) / (1 + t);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  const flick = 0.9 + 0.1 * Math.sin(t * 13.1) * Math.sin(t * 5.3);
  glowDisc(ctx, x, cy, R * 2.2, '255,130,50', 0.5 * h * flick);
  glowDisc(ctx, x, cy, R * 1.2, '255,220,160', 0.4 * h * h * flick);
  ctx.globalCompositeOperation = op;
}

/**
 * The shock wave, its first three seconds (world space, behind the ground,
 * so only the half in the sky shows): a bright ring tearing outward faster
 * than anything, a fainter echo behind it, the air inside it shimmering
 * pale, and a white condensation dome flashing round the fireball.
 */
export function drawShock(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  if (t < 0 || t > 3.2) return;
  const k = 1 - t / 3.2;
  const R = 30 + 1000 * (1 - Math.exp(-t * 1.5));
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  // The air inside the front, shimmering.
  ctx.fillStyle = `rgba(255,236,210,${0.09 * k * k})`;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  // The front, and its echo.
  for (const [rr, aa, ww] of [
    [R, 0.75, 10],
    [R * 0.82, 0.35, 6],
  ] as const) {
    ctx.strokeStyle = `rgba(255,248,232,${aa * Math.pow(k, 1.4)})`;
    ctx.lineWidth = ww * (0.4 + 0.6 * k) + 1;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = op;
  // The condensation dome: a white veil flashing out round the fireball and gone.
  const c = Math.sin(Math.min(1, t / 2.2) * Math.PI);
  if (c > 0.01) {
    const r2 = 90 + 260 * (1 - Math.exp(-t * 1.8));
    const g = ctx.createRadialGradient(x, y - 30, r2 * 0.55, x, y - 30, r2);
    g.addColorStop(0, 'rgba(240,236,230,0)');
    g.addColorStop(0.75, `rgba(240,236,230,${0.32 * c})`);
    g.addColorStop(1, 'rgba(240,236,230,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - 30, r2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The strike's light over everything in view (drawn over the world): a warm
 * wash, strongest toward the cloud, that fades as it cools; for the first
 * moments, a white glare.
 */
export function drawCloudWash(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, view: { x0: number; y0: number; x1: number; y1: number }): void {
  if (t < 0 || t * 1000 > DOME_MS) return;
  const h = lifeOf(t);
  if (h < 0.02) return;
  const cy = y - (14 * t * t) / (1 + t);
  const r = Math.max(view.x1 - view.x0, view.y1 - view.y0) * 1.4 + Math.hypot(x - (view.x0 + view.x1) / 2, cy - (view.y0 + view.y1) / 2);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, cy, 0, x, cy, r);
  const a = 0.22 * h;
  g.addColorStop(0, `rgba(255,${Math.round(120 + 110 * Math.exp(-t / 0.8))},${Math.round(50 + 150 * Math.exp(-t / 0.6))},${a})`);
  g.addColorStop(0.5, `rgba(255,110,40,${a * 0.45})`);
  g.addColorStop(1, 'rgba(255,90,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  ctx.globalCompositeOperation = op;
}

/** One shared WebGL2 canvas for every dome (made the first time one is drawn). */
export class StoneCloud {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private failed = false;

  private init(): boolean {
    if (this.gl) return true;
    if (this.failed || typeof document === 'undefined') return false;
    const c = document.createElement('canvas');
    c.width = CLOUD_W;
    c.height = CLOUD_H;
    const gl = c.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) {
      this.failed = true;
      return false;
    }
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    try {
      const p = gl.createProgram()!;
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
      gl.useProgram(p);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const at = gl.getAttribLocation(p, 'aPos');
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
      for (const u of ['uSize', 'uBase', 'uT', 'uLife', 'uSeed']) this.loc[u] = gl.getUniformLocation(p, u);
      this.prog = p;
    } catch (e) {
      console.warn('stoneburner cloud shader:', e);
      this.failed = true;
      return false;
    }
    this.canvas = c;
    this.gl = gl;
    return true;
  }

  /**
   * Draw the fireball over a strike at (x, y) (world cells; `t` seconds since it
   * landed) into `ctx`, which is in world space (one unit a cell). Only the
   * part inside `view` (world cells) is worked out: the shader is the costly
   * part, and a player close by sees only a piece of the cloud.
   */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number, view: { x0: number; y0: number; x1: number; y1: number }): void {
    if (t < 0 || t * 1000 > DOME_MS) return;
    // The canvas's place in the world, and the piece of it in view (canvas cells, y down).
    const left = Math.round(x - CLOUD_W / 2);
    const top = Math.round(y + BASE - CLOUD_H);
    const cx0 = Math.max(0, Math.floor(view.x0 - left));
    const cy0 = Math.max(0, Math.floor(view.y0 - top));
    const cx1 = Math.min(CLOUD_W, Math.ceil(view.x1 - left));
    const cy1 = Math.min(CLOUD_H, Math.ceil(view.y1 - top));
    if (cx1 <= cx0 || cy1 <= cy0 || !this.init()) return;
    const gl = this.gl!;
    gl.viewport(0, 0, CLOUD_W, CLOUD_H);
    // (GL's rows run up from the bottom.)
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(cx0, CLOUD_H - cy1, cx1 - cx0, cy1 - cy0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(this.loc.uSize, CLOUD_W, CLOUD_H);
    gl.uniform1f(this.loc.uBase, BASE);
    gl.uniform1f(this.loc.uT, t);
    gl.uniform1f(this.loc.uLife, DOME_MS / 1000);
    gl.uniform1f(this.loc.uSeed, (seed % 997) / 97);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
    drawCloudHalo(ctx, x, y, t);
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const w = cx1 - cx0;
    const h = cy1 - cy0;
    ctx.drawImage(this.canvas!, cx0, cy0, w, h, left + cx0, top + cy0, w, h);
    ctx.imageSmoothingEnabled = smooth;
  }
}
