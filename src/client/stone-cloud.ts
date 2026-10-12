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
float rise(float t) { return 50.0 + 290.0 * (1.0 - exp(-t / 6.5)); }
float capR(float t) { return 44.0 + 170.0 * (1.0 - exp(-t / 6.0)); }
float stemW(float t) { return 12.0 + 28.0 * (1.0 - exp(-t / 6.0)); }

/**
 * The shape (before the noise eats into it): > 0 inside, about 1 at its
 * heart. p: cells from ground zero, y up. Also hands back how far into the
 * hot core a point is (heat), for the glow.
 */
float shape(vec2 p, float t, out float heat) {
  float r = rise(t);
  float cr = capR(t);
  float sw = stemW(t);
  float drift = t * 2.5;
  // The cap: a wide flattened ball, its underside tucked up (a toroid seen side on).
  vec2 c = vec2(drift, r);
  vec2 q = (p - c) / vec2(cr * 1.2, cr * 0.72);
  float under = smoothstep(-0.2, -1.0, q.y) * smoothstep(0.65, 0.0, abs(q.x)) * 0.35;
  float cap = 1.0 - length(q) - under;
  // The stem: from the ground up into the cap, pinched at the waist, flared at the foot.
  float f = clamp(p.y / max(r, 1.0), 0.0, 1.0);
  float w = sw * (1.0 - 0.3 * sin(f * 3.14159)) + sw * 1.4 * max(0.0, 1.0 - f * 6.0);
  float stem = mix(-1.0, 1.0 - abs(p.x - drift * f) / w, step(-4.0, p.y) * step(p.y, r));
  // The skirt: dust rolling out along the ground.
  float sk = 70.0 + 230.0 * (1.0 - exp(-t / 5.0));
  float skirt = (1.0 - length(vec2(p.x / sk, (p.y + 4.0) / (16.0 + 22.0 * (1.0 - exp(-t / 6.0)))))) * 0.9;
  // The first seconds: the fireball, swelling up off the ground into the cap.
  float k = clamp(t / 4.0, 0.0, 1.0);
  vec2 fc = vec2(0.0, 20.0 + r * 0.75 * k);
  float fr = 30.0 + 110.0 * sqrt(k);
  float ball = (1.0 - length(p - fc) / fr) * (1.0 - smoothstep(3.0, 6.0, t));
  heat = max(ball * 1.5, max(cap, stem * 0.6));
  float d = max(max(cap, stem), max(skirt, ball));
  return d;
}

/** Density at p: the shape, boiled and torn by the noise. */
float density(vec2 p, float t, int oct, out float heat) {
  float s = shape(p, t, heat);
  if (s < -0.2) return 0.0;
  float r = rise(t);
  float cr = capR(t);
  // The noise moves with the smoke: up the stem, rolling round the cap (up the outside, in over the top).
  vec2 c = vec2(t * 2.5, r);
  vec2 rel = p - c;
  float inCap = smoothstep(r * 0.55, r * 0.85, p.y);
  float ang = atan(rel.y, abs(rel.x) + 1.0);
  vec2 flow = mix(vec2(0.0, -t * 9.0), vec2(sign(rel.x) * sin(ang) * t * 3.0, -cos(ang) * t * 6.0), inCap);
  vec3 np = vec3((p + flow) * 0.022, t * 0.06 + uSeed);
  // Domain warp: the billows fold into each other.
  vec3 warp = vec3(fbm(np + vec3(3.1, 0.0, 0.0), 3), fbm(np + vec3(0.0, 7.7, 0.0), 3), 0.0) - 0.5;
  float n = fbm(np + warp * 1.6, oct);
  // Billows: ridged, so the folds between them read as creases, cauliflower-like.
  n = mix(n, 1.0 - abs(2.0 * n - 1.0), 0.35);
  // Fine grit on top: soot and dust.
  float grit = vnoise(vec3(p * 0.21, t * 0.3 + uSeed)) - 0.5;
  // (The noise only eats into the shape and frays its edge: it never makes smoke out of clear sky.)
  float edge = smoothstep(-0.2, 0.25, s);
  float d = s * 1.3 + ((n - 0.5) * 1.1 + grit * 0.08) * edge;
  return clamp(d * 1.7, 0.0, 1.0) * edge;
}

vec3 blackbody(float k) {
  // dull red -> orange -> yellow -> white
  vec3 c = mix(vec3(0.35, 0.04, 0.0), vec3(1.0, 0.35, 0.05), smoothstep(0.0, 0.35, k));
  c = mix(c, vec3(1.0, 0.75, 0.3), smoothstep(0.35, 0.7, k));
  return mix(c, vec3(1.0, 0.97, 0.9), smoothstep(0.7, 1.0, k));
}

void main() {
  vec2 cell = floor(vUv * uSize);
  // Cells from ground zero, y up.
  vec2 p = vec2(cell.x - uSize.x * 0.5, cell.y - uBase);
  float t = uT;
  float heat;
  float d = density(p, t, 5, heat);
  if (d <= 0.002) {
    outColor = vec4(0.0);
    return;
  }
  // Self-shadowing: a few steps toward the light (high, a little to the left).
  vec2 L = normalize(vec2(-0.45, 1.0));
  float occ = 0.0;
  float hs;
  for (int i = 1; i <= 4; i++) occ += density(p + L * float(i) * 16.0, t, 3, hs);
  float deep = exp(-occ * 0.7);
  // ...and each billow's own face: brighter where the smoke thins toward the light (the folds catch it, the creases don't).
  float near = density(p + L * 4.0, t, 5, hs);
  float face = clamp(0.5 + (d - near) * 3.0, 0.0, 1.0);
  float lit = clamp(deep * 0.45 + face * 0.75 - 0.15, 0.0, 1.0);
  // Soot: dark, brownish; lit up a dusty grey-tan where the light gets in.
  vec3 soot = vec3(0.13, 0.11, 0.10);
  vec3 dust = vec3(0.58, 0.52, 0.46);
  vec3 col = mix(soot, dust, lit * 0.9) * (0.75 + 0.25 * d);
  // The sky's light in the shadows (a warm haze, this world's sky).
  col += vec3(0.09, 0.06, 0.05) * (1.0 - lit);
  // The fire inside: fierce at first, cooling; strongest deep in, and on the cap's underside.
  float cool = exp(-t / 5.5);
  float ember = exp(-t / 16.0);
  float under = smoothstep(0.0, -0.6, (p.y - rise(t)) / capR(t)) * smoothstep(0.3, 1.0, heat);
  float k = clamp(heat * d * (cool * 1.35) + under * ember * 0.45 * (1.0 - lit), 0.0, 1.0);
  col = mix(col, blackbody(k), smoothstep(0.05, 0.6, k));
  col += blackbody(k) * k * 0.35;
  // Grit: per-cell grain, and a coarse colour ramp (it's all pixels, after all).
  float g = hash12(cell + uSeed * 13.0 + floor(t * 12.0));
  col *= 0.94 + 0.12 * g;
  col = floor(col * 18.0 + g * 0.8) / 18.0;
  // Thinning out at the end of its life.
  float fade = 1.0 - smoothstep(uLife * 0.55, uLife, t);
  float a = smoothstep(0.02, 0.45, d) * fade;
  // (A ragged edge, not a soft one: the alpha stepped and dithered too.)
  a = floor(a * 6.0 + g) / 6.0;
  outColor = vec4(col * a, a);
}`;

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
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const w = cx1 - cx0;
    const h = cy1 - cy0;
    ctx.drawImage(this.canvas!, cx0, cy0, w, h, left + cx0, top + cy0, w, h);
    ctx.imageSmoothingEnabled = smooth;
  }
}
