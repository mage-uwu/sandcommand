import { CLOUD_MS } from '../shared/stoneburner.ts';

/**
 * The Stoneburner's mushroom cloud, as a fragment shader (WebGL2), run only
 * while a cloud hangs over a strike.
 *
 * Each frame it renders the cloud into its own small canvas, one texel per
 * world cell (so it sits in the game's pixels, not over them), and the
 * renderer draws that into the scene like any other sprite, behind the
 * ground. The shader works out a density field: the shape of the thing
 * (the fireball, then the stem, the cap rolling over on itself, the skirt
 * of dust at its foot) eaten into by domain-warped fractal noise that boils
 * up the stem and rolls round the cap. A few steps toward the light give it
 * self-shadowing; the fire inside lights it from within, white then orange
 * then a dull red underside as it cools; and grain and a coarse colour
 * ramp keep it gritty, a thing of soot and dust rather than of bubbles.
 *
 * No WebGL2: no cloud (the flash, the shaking, the smoke and the debris
 * still play out).
 */

/** The canvas it renders into: cells wide and tall (ground zero at the middle of its bottom edge, a little up). */
export const CLOUD_W = 720;
export const CLOUD_H = 600;
/** Ground zero is this far up from the canvas's bottom edge (room for the skirt to roll out under the horizon). */
const BASE = 40;

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

// --- the cloud's growth -----------------------------------------------------
float rise(float t) { return 60.0 + 350.0 * (1.0 - exp(-t / 7.0)); }
float capR(float t) { return 50.0 + 165.0 * (1.0 - exp(-t / 6.5)); }
float stemW(float t) { return 16.0 + 30.0 * (1.0 - exp(-t / 6.0)); }
/** How hot the whole thing still is: blinding at first, then a long, slow cooling (it still glows half a minute on). */
float hotness(float t) { return 0.45 * exp(-t / 5.0) + 0.55 * exp(-t / 34.0); }
/** Where the pillar's axis is at height y (it leans a little with the wind as the cap drifts). */
float axisX(float y, float t) { return t * 2.5 * clamp(y / max(rise(t), 1.0), 0.0, 1.0); }

/** The shape (before the noise eats into it): > 0 inside, about 1 at its heart. p: cells from ground zero, y up. */
float shape(vec2 p, float t) {
  float r = rise(t);
  float cr = capR(t);
  float sw = stemW(t);
  // The cap: a wide flattened ball, its underside tucked up (a toroid seen side on).
  vec2 q = (p - vec2(t * 2.5, r)) / vec2(cr * 1.2, cr * 0.7);
  float under = smoothstep(-0.2, -1.0, q.y) * smoothstep(0.6, 0.0, abs(q.x)) * 0.4;
  float cap = 1.0 - length(q) - under;
  // The pillar: from the ground up into the cap, pinched at the waist, flared at the foot.
  float f = clamp(p.y / max(r, 1.0), 0.0, 1.0);
  float w = sw * (1.0 - 0.25 * sin(f * 3.14159)) + sw * 1.6 * max(0.0, 1.0 - f * 6.0);
  float stem = mix(-1.0, 1.0 - abs(p.x - axisX(p.y, t)) / w, step(-4.0, p.y) * step(p.y, r));
  // The skirt: dust rolling out along the ground.
  float sk = 70.0 + 240.0 * (1.0 - exp(-t / 5.0));
  float skirt = (1.0 - length(vec2(p.x / sk, (p.y + 4.0) / (16.0 + 24.0 * (1.0 - exp(-t / 6.0)))))) * 0.9;
  // The first seconds: the fireball, swelling up off the ground into the cap.
  float k = clamp(t / 4.0, 0.0, 1.0);
  vec2 fc = vec2(0.0, 24.0 + r * 0.7 * k);
  float fr = 34.0 + 115.0 * sqrt(k);
  float ball = (1.0 - length(p - fc) / fr) * (1.0 - smoothstep(3.0, 6.5, t));
  return max(max(cap, stem), max(skirt, ball));
}

/** The noise the smoke is made of, moving with it: boiling up the pillar, rolling round the cap (up the outside, in over the top). */
float smokeNoise(vec2 p, float t, int oct) {
  float r = rise(t);
  vec2 rel = p - vec2(t * 2.5, r);
  float inCap = smoothstep(r * 0.55, r * 0.85, p.y);
  float ang = atan(rel.y, abs(rel.x) + 1.0);
  vec2 flow = mix(vec2(0.0, -t * 12.0), vec2(sign(rel.x) * sin(ang) * t * 3.0, -cos(ang) * t * 6.0), inCap);
  vec3 np = vec3((p + flow) * 0.021, t * 0.06 + uSeed);
  vec3 warp = vec3(fbm(np + vec3(3.1, 0.0, 0.0), 3), fbm(np + vec3(0.0, 7.7, 0.0), 3), 0.0) - 0.5;
  float n = fbm(np + warp * 1.6, oct);
  return mix(n, 1.0 - abs(2.0 * n - 1.0), 0.35);
}

/** Density at p: the shape, boiled and torn by the noise. */
float density(vec2 p, float t, int oct) {
  float s = shape(p, t);
  if (s < -0.2) return 0.0;
  float n = smokeNoise(p, t, oct);
  float grit = vnoise(vec3(p * 0.21, t * 0.3 + uSeed)) - 0.5;
  // (The noise only eats into the shape and frays its edge: it never makes smoke out of clear sky.)
  float edge = smoothstep(-0.2, 0.25, s);
  float d = s * 1.3 + ((n - 0.5) * 1.1 + grit * 0.08) * edge;
  return clamp(d * 1.7, 0.0, 1.0) * edge;
}

/**
 * How hot it burns at p (0..1): the fireball at first; then the vortex ring
 * rolling inside the cap (hottest), the cap's belly, the incandescent core
 * of the pillar, and the burning crater at its foot, all flickering with
 * the turbulence and slowly cooling.
 */
float temperature(vec2 p, float t) {
  float r = rise(t);
  float cr = capR(t);
  float sw = stemW(t);
  vec2 q = (p - vec2(t * 2.5, r)) / vec2(cr * 1.2, cr * 0.7);
  // The ring: a hot torus inside the cap, seen side on as two hot lobes and the band joining them.
  float ringD = length(vec2((abs(q.x) - 0.48) / 0.34, (q.y + 0.08) / 0.42));
  float ring = exp(-ringD * ringD * 1.6);
  float belly = exp(-dot(q * vec2(1.3, 2.0), q * vec2(1.3, 2.0)) * 1.4) * 0.85;
  // The pillar's core: a narrow white-hot channel up its middle, the updraft feeding the cap.
  // (Feathered off where it pours into the cap, not cut square.)
  float inStem = step(-4.0, p.y) * (1.0 - smoothstep(r - cr * 0.45, r + cr * 0.1, p.y));
  float dx = (p.x - axisX(p.y, t)) / (sw * 0.6);
  float f = clamp(p.y / max(r, 1.0), 0.0, 1.0);
  float core = exp(-dx * dx) * inStem * (0.85 + 0.15 * f);
  // The crater at its foot, still burning.
  float base = exp(-dot(p / vec2(55.0, 22.0), p / vec2(55.0, 22.0)));
  float k = clamp(t / 4.0, 0.0, 1.0);
  vec2 fc = vec2(0.0, 24.0 + r * 0.7 * k);
  float fr = 34.0 + 115.0 * sqrt(k);
  float ball = clamp(1.2 - length(p - fc) / fr, 0.0, 1.0) * (1.0 - smoothstep(2.5, 6.0, t));
  float h = max(max(ring, belly * 0.9), max(core, base * 0.9));
  // Turbulent: hot tongues and cooler pockets, flickering.
  float fl = fbm(vec3(p * 0.035 + vec2(0.0, -t * 14.0) * 0.035, t * 0.9 + uSeed * 3.0), 3);
  h *= 0.55 + 0.9 * fl;
  return clamp(max(h * hotness(t), ball * 1.2), 0.0, 1.0);
}

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
  float d = density(p, t, 5);
  if (d <= 0.002) {
    outColor = vec4(0.0);
    return;
  }
  // Self-shadowing: a few steps toward the light (high, a little to the left)...
  vec2 L = normalize(vec2(-0.45, 1.0));
  float occ = 0.0;
  for (int i = 1; i <= 4; i++) occ += density(p + L * float(i) * 16.0, t, 3);
  float deep = exp(-occ * 0.7);
  // ...and each billow's own face: brighter where the smoke thins toward the light.
  float near = density(p + L * 4.0, t, 5);
  float face = clamp(0.5 + (d - near) * 3.0, 0.0, 1.0);
  float lit = clamp(deep * 0.45 + face * 0.75 - 0.15, 0.0, 1.0);
  // Soot: near black and brown; a dusty grey-tan where the daylight gets in.
  vec3 soot = vec3(0.10, 0.08, 0.07);
  vec3 dust = vec3(0.52, 0.46, 0.40);
  vec3 smoke = mix(soot, dust, lit * 0.85) * (0.75 + 0.25 * d);
  smoke += vec3(0.08, 0.05, 0.04) * (1.0 - lit);
  // The fire inside, and how much of it shows: through the thin smoke and the gaps between billows, barely through the thick of it.
  float T = temperature(p, t);
  float thin = 1.0 - smoothstep(0.55, 1.0, d) * 0.45;
  float show = smoothstep(0.06, 0.42, T) * thin;
  // (It burns brighter than it is hot: a cooling ring still glows a fierce orange.)
  vec3 fire = blackbody(clamp(T * 1.35 + 0.1, 0.0, 1.0));
  // The smoke round the fire lit by it (orange on the soot, the cap's belly lit from below).
  float bounce = clamp(T * 1.6, 0.0, 1.0) * (1.0 - show);
  smoke += fire * bounce * 0.8;
  vec3 col = mix(smoke, fire * (1.15 + 0.8 * T), show);
  // Grit: per-cell grain, and a coarse colour ramp (it's all pixels, after all).
  float g = hash12(cell + uSeed * 13.0 + floor(t * 12.0));
  col *= 0.93 + 0.14 * g;
  col = floor(col * 16.0 + g * 0.8) / 16.0;
  // Thinning out at the end of its life.
  float fade = 1.0 - smoothstep(uLife * 0.6, uLife, t);
  float a = smoothstep(0.02, 0.45, d) * fade;
  // (A ragged edge, not a soft one: the alpha stepped and dithered too.)
  a = floor(a * 6.0 + g) / 6.0;
  outColor = vec4(col * a, a);
}`;

// The cloud's growth (as the shader has it), for the glow drawn round it.
const rise = (t: number) => 60 + 350 * (1 - Math.exp(-t / 7));
const capR = (t: number) => 50 + 165 * (1 - Math.exp(-t / 6.5));
const hotness = (t: number) => 0.45 * Math.exp(-t / 5) + 0.55 * Math.exp(-t / 34);
const fadeOf = (t: number) => {
  const life = CLOUD_MS / 1000;
  return t < life * 0.6 ? 1 : Math.max(0, 1 - (t - life * 0.6) / (life * 0.4));
};

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
 * The light the cloud gives off, behind it in the sky (drawn before the
 * cloud): a halo round the cap's glowing belly, a column of it up the
 * pillar, and a glare off the burning crater.
 */
export function drawCloudHalo(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  if (t < 0 || t * 1000 > CLOUD_MS) return;
  const h = hotness(t) * fadeOf(t);
  const cx = x + t * 2.5;
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  const flick = 0.92 + 0.08 * Math.sin(t * 9.1) * Math.sin(t * 3.7);
  glowDisc(ctx, cx, y - rise(t) + capR(t) * 0.15, capR(t) * 2.6, '255,120,40', 0.42 * h * flick);
  // Up the pillar: a few discs stacked, for a soft column.
  for (let k = 0; k < 5; k++) {
    const f = (k + 0.5) / 5;
    glowDisc(ctx, x + (cx - x) * f, y - rise(t) * f, 90 + 40 * f, '255,140,60', 0.22 * h * flick);
  }
  glowDisc(ctx, x, y - 10, 170, '255,150,70', 0.4 * h * flick);
  ctx.globalCompositeOperation = op;
}

/**
 * The strike's light over everything in view (drawn over the world): a warm
 * wash, strongest toward the cloud, that fades as it cools; for the first
 * moments, a white glare.
 */
export function drawCloudWash(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, view: { x0: number; y0: number; x1: number; y1: number }): void {
  if (t < 0 || t * 1000 > CLOUD_MS) return;
  const h = hotness(t) * fadeOf(t);
  if (h < 0.02) return;
  const cy = y - rise(t) * 0.6;
  const r = Math.max(view.x1 - view.x0, view.y1 - view.y0) * 1.4 + Math.hypot(x - (view.x0 + view.x1) / 2, cy - (view.y0 + view.y1) / 2);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, cy, 0, x, cy, r);
  const a = 0.2 * h;
  g.addColorStop(0, `rgba(255,${Math.round(120 + 110 * Math.exp(-t / 2))},${Math.round(50 + 150 * Math.exp(-t / 1.5))},${a})`);
  g.addColorStop(0.5, `rgba(255,110,40,${a * 0.45})`);
  g.addColorStop(1, 'rgba(255,90,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  ctx.globalCompositeOperation = op;
}

/** One shared WebGL2 canvas for every cloud (made the first time a cloud is drawn). */
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
   * Draw the cloud over a strike at (x, y) (world cells; `t` seconds since it
   * landed) into `ctx`, which is in world space (one unit a cell). Only the
   * part inside `view` (world cells) is worked out: the shader is the costly
   * part, and a player close by sees only a piece of the cloud.
   */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number, view: { x0: number; y0: number; x1: number; y1: number }): void {
    if (t < 0 || t * 1000 > CLOUD_MS) return;
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
    gl.uniform1f(this.loc.uLife, CLOUD_MS / 1000);
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
