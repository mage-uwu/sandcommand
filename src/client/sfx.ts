import { ProjKind } from '../shared/weapons.ts';

/**
 * Sound effects, all synthesized with Web Audio (no samples): every gun's
 * report, explosions, gore, and the thrusters' roar. Sounds are placed in
 * the world: they fade and lose their highs with distance from the ear (the
 * clone we're playing or watching) and pan left or right of it.
 */

/** How far (in cells) a gunshot carries. */
const RANGE = 1700;
/** At most this many one-shot voices at once; past it, quiet sounds are dropped. */
const MAX_VOICES = 28;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface Voice {
  t: number;
  dest: AudioNode;
}

/** A looping bed (thrusters, jetpacks, the laser's charge whine) whose level follows the game. */
interface Bed {
  gain: GainNode;
  pan: StereoPannerNode;
  tone: BiquadFilterNode;
  osc?: OscillatorNode;
}

export class Sfx {
  readonly ctx: BaseAudioContext;
  private out: GainNode;
  private room: GainNode;
  private noise: AudioBuffer;
  private earX = 0;
  private earY = 0;
  /** When each sounding voice finishes (audio clock), for the voice budget. */
  private ends: number[] = [];
  /** When each shooter last made a sound (for the shotgun's nine pellets, and Gatling rate). */
  private last = new Map<number, number>();
  private on = true;
  /** Everything muted (the context is paused): play nothing, or it would all go off at once on unmute. */
  private muted = false;
  private volume = 0.34;
  private engine: Bed | null = null;
  private jet: Bed | null = null;
  private whine: Bed | null = null;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    const c = ctx;
    // A hard limiter so a firefight saturates rather than clips.
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 6;
    comp.ratio.value = 8;
    comp.attack.value = 0.002;
    comp.release.value = 0.18;
    this.out = c.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(comp).connect(c.destination);
    // A short room: gunshots slap back off the terrain.
    const verb = c.createConvolver();
    verb.buffer = this.impulse(0.9, 3.2);
    this.room = c.createGain();
    this.room.gain.value = 0.22;
    this.room.connect(verb).connect(this.out);
    // Two seconds of white noise: the raw stuff of gunshots and blasts.
    const n = c.sampleRate * 2;
    this.noise = c.createBuffer(1, n, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Sound effects on or off; returns the new state. */
  setMuted(m: boolean): void {
    this.muted = m;
  }

  toggle(): boolean {
    this.on = !this.on;
    this.out.gain.setTargetAtTime(this.on ? this.volume : 0, this.ctx.currentTime, 0.03);
    return this.on;
  }

  /** Where we hear from: the clone being played or watched. */
  listen(x: number, y: number): void {
    this.earX = x;
    this.earY = y;
  }

  // ------------------------------------------------------------ one-shots

  /** A projectile leaving the barrel (or the hand, or the bomb bay). */
  shot(kind: number, x: number, y: number, owner: number): void {
    const now = this.ctx.currentTime;
    const key = owner * 32 + kind;
    const prev = this.last.get(key) ?? -1;
    // One report per shotgun shell (nine pellets), and the Gatling's stream thinned a little.
    const gap = kind === ProjKind.Pellet ? 0.05 : kind === ProjKind.Heavy || kind === ProjKind.TankBullet || kind === ProjKind.ShipGun || kind === ProjKind.SmgRound || kind === ProjKind.Bolt ? 0.045 : 0;
    if (now - prev < gap) return;
    this.last.set(key, now);
    if (this.last.size > 512) this.last.clear();
    switch (kind) {
      case ProjKind.Bullet: {
        // Rifle: a sharp crack over a short punchy body.
        const v = this.voice(x, y, 0.5, 0.4);
        if (!v) return;
        this.burst(v, 0, 0.04, 'highpass', 2600, 0.7, 0.9);
        this.burst(v, 0, 0.17, 'lowpass', 2600, 0.8, 0.9, 500);
        this.tone(v, 0, 0.09, 'sine', 170, 55, 0.7);
        return;
      }
      case ProjKind.LightRound: {
        // Light rifle: a big full-power crack, a rolling report.
        const v = this.voice(x, y, 0.6, 0.6, 1.1);
        if (!v) return;
        this.burst(v, 0, 0.04, 'highpass', 2800, 0.7, 1);
        this.burst(v, 0, 0.3, 'lowpass', 2200, 0.8, 1, 380);
        this.tone(v, 0, 0.14, 'sine', 140, 45, 0.9);
        return;
      }
      case ProjKind.SmgRound: {
        // Suppressed SMG: a dull, quick "thup".
        const v = this.voice(x, y, 0.32, 0.2);
        if (!v) return;
        this.burst(v, 0, 0.06, 'bandpass', 900, 1.2, 0.8, 500);
        this.tone(v, 0, 0.05, 'sine', 210, 80, 0.5);
        return;
      }
      case ProjKind.AutoShell: {
        // Autocannon: a hard, deep "dunk" with a mechanical clank.
        const v = this.voice(x, y, 0.7, 0.6, 1.1);
        if (!v) return;
        this.tone(v, 0, 0.18, 'sine', 95, 38, 1.2);
        this.burst(v, 0, 0.3, 'lowpass', 1400, 0.8, 1, 240);
        this.tone(v, 0.03, 0.05, 'square', 520, 300, 0.12);
        return;
      }
      case ProjKind.Bolt: {
        // Blaster: a bright falling "pew".
        const v = this.voice(x, y, 0.35, 0.25);
        if (!v) return;
        this.tone(v, 0, 0.11, 'sawtooth', 1900, 320, 0.35);
        this.tone(v, 0, 0.08, 'sine', 1200, 260, 0.4);
        this.burst(v, 0, 0.03, 'highpass', 4000, 0.7, 0.2);
        return;
      }
      case ProjKind.Heavy:
      case ProjKind.TankBullet:
      case ProjKind.ShipGun: {
        // Heavy machine gun: lower, chunkier, shorter (they come fast).
        const big = kind !== ProjKind.Heavy;
        const v = this.voice(x, y, big ? 0.55 : 0.45, 0.3);
        if (!v) return;
        this.burst(v, 0, 0.03, 'highpass', 2000, 0.7, 0.7);
        this.burst(v, 0, 0.12, 'lowpass', 1700, 0.9, 1, 350);
        this.tone(v, 0, 0.08, 'sine', big ? 110 : 130, 40, 0.8);
        return;
      }
      case ProjKind.Pellet: {
        // Shotgun: a big wide boom.
        const v = this.voice(x, y, 0.7, 0.7);
        if (!v) return;
        this.burst(v, 0, 0.05, 'highpass', 2200, 0.7, 1);
        this.burst(v, 0, 0.45, 'lowpass', 1600, 0.7, 1.1, 260);
        this.tone(v, 0, 0.22, 'sine', 95, 32, 1.1);
        return;
      }
      case ProjKind.Slug: {
        // .50 cal: a supersonic crack, a deep boom, and its echo rolling back.
        const v = this.voice(x, y, 0.85, 1.4, 1.5, true);
        if (!v) return;
        this.burst(v, 0, 0.035, 'highpass', 3200, 0.7, 1.3);
        this.burst(v, 0, 0.7, 'lowpass', 2200, 0.7, 1.2, 220);
        this.tone(v, 0, 0.35, 'sine', 75, 26, 1.3);
        this.burst(v, 0.19, 0.6, 'lowpass', 900, 0.7, 0.28, 180);
        this.burst(v, 0.42, 0.5, 'lowpass', 600, 0.7, 0.12, 150);
        return;
      }
      case ProjKind.Rocket:
      case ProjKind.Missile:
      case ProjKind.SpiderMissile:
      case ProjKind.Shell: {
        // Bazooka: a thump and a roaring whoosh. Tank cannon: a heavy boom.
        const v = this.voice(x, y, 0.65, 0.9, 1.2);
        if (!v) return;
        this.tone(v, 0, 0.2, 'sine', 120, 40, 1);
        if (kind === ProjKind.Shell) this.burst(v, 0, 0.5, 'lowpass', 1800, 0.7, 1.1, 200);
        this.burst(v, 0.02, 0.75, 'bandpass', 500, 1.1, 0.8, 2600);
        return;
      }
      case ProjKind.Bomblet: {
        // Grenade launcher: the hollow "thoomp".
        const v = this.voice(x, y, 0.55, 0.3);
        if (!v) return;
        this.tone(v, 0, 0.14, 'sine', 240, 70, 1);
        this.tone(v, 0, 0.06, 'triangle', 480, 200, 0.25);
        this.burst(v, 0, 0.1, 'lowpass', 900, 0.8, 0.45, 300);
        return;
      }
      case ProjKind.Grenade: {
        // A throw: a quick swish.
        const v = this.voice(x, y, 0.25, 0.2);
        if (!v) return;
        this.burst(v, 0, 0.14, 'bandpass', 1400, 1.5, 0.8, 500);
        return;
      }
      case ProjKind.Bomb: {
        // Bomb bay: a clunk as it lets go.
        const v = this.voice(x, y, 0.3, 0.2);
        if (!v) return;
        this.tone(v, 0, 0.08, 'square', 320, 150, 0.25);
        this.burst(v, 0, 0.05, 'bandpass', 1800, 2, 0.4);
        return;
      }
      case ProjKind.Dart: {
        // A blowpipe "fft" out of the wall.
        const v = this.voice(x, y, 0.35, 0.15);
        if (!v) return;
        this.burst(v, 0, 0.09, 'bandpass', 3200, 2, 0.9, 1800);
        return;
      }
    }
  }

  /** A blast; `radius` sizes it (a bomblet pops, a dropship bomb shakes the ground). */
  explode(x: number, y: number, radius: number): void {
    const s = clamp(radius / 40, 0.4, 2.5);
    const v = this.voice(x, y, 0.75 * Math.sqrt(s), 1 + s * 0.8, 1 + s * 0.4, true);
    if (!v) return;
    this.burst(v, 0, 0.07, 'lowpass', 7000, 0.6, 1);
    this.burst(v, 0, 0.6 + s * 0.5, 'lowpass', 2600, 0.8, 1.2, 110);
    this.tone(v, 0, 0.4 + s * 0.35, 'sine', 70, 22, 1.4);
    // Debris pattering down after.
    for (let k = 0; k < 3 + s * 3; k++) this.burst(v, 0.08 + Math.random() * (0.3 + s * 0.4), 0.02, 'highpass', 2500 + Math.random() * 3000, 0.8, 0.25);
  }

  /** A slug or bullet striking hard (the sniper's strike, ricochets). */
  impact(x: number, y: number): void {
    const v = this.voice(x, y, 0.35, 0.3);
    if (!v) return;
    this.burst(v, 0, 0.05, 'bandpass', 2400, 1.2, 0.8);
    this.tone(v, 0, 0.06, 'sine', 300, 90, 0.4);
  }

  /** Someone hit: a meaty thwack (a clank on a synthetic). */
  hit(x: number, y: number, amount: number, synthetic: boolean): void {
    const g = clamp(0.12 + amount / 90, 0.12, 0.55);
    const v = this.voice(x, y, g, 0.2);
    if (!v) return;
    if (synthetic) {
      this.tone(v, 0, 0.12, 'triangle', 1100, 900, 0.4);
      this.burst(v, 0, 0.04, 'highpass', 3000, 0.8, 0.6);
      return;
    }
    this.burst(v, 0, 0.08, 'bandpass', 800, 2, 1, 350);
    this.tone(v, 0, 0.06, 'sine', 160, 60, 0.6);
  }

  /** A limb torn off: a crack of bone and a wet tear. */
  limb(x: number, y: number, synthetic: boolean): void {
    const v = this.voice(x, y, 0.5, 0.35);
    if (!v) return;
    this.burst(v, 0, 0.025, 'highpass', 3200, 0.8, 1);
    if (synthetic) {
      this.tone(v, 0, 0.25, 'square', 700, 260, 0.2);
      this.burst(v, 0.02, 0.18, 'bandpass', 2400, 3, 0.5);
      return;
    }
    this.burst(v, 0.02, 0.22, 'bandpass', 600, 3, 1, 220);
  }

  /** A clone blown apart: squelches, cracking bone and a thud (sparks and clanging scrap on a synthetic). */
  gib(x: number, y: number, violence: number, synthetic: boolean): void {
    const s = clamp(violence, 0.5, 3);
    const v = this.voice(x, y, 0.35 + 0.1 * s, 0.6, 1, true);
    if (!v) return;
    this.tone(v, 0, 0.14, 'sine', 120, 40, 0.9);
    if (synthetic) {
      for (let k = 0; k < 4; k++) this.tone(v, Math.random() * 0.25, 0.25, 'triangle', 700 + Math.random() * 900, 400, 0.22);
      this.burst(v, 0, 0.3, 'highpass', 2600, 0.8, 0.5, 6000);
      return;
    }
    this.burst(v, 0, 0.28, 'bandpass', 750, 3, 1.1, 220);
    this.burst(v, 0.06, 0.24, 'bandpass', 420, 3.5, 0.9, 180);
    for (let k = 0; k < 2 + s * 2; k++) this.burst(v, Math.random() * 0.18, 0.018, 'highpass', 2800, 0.9, 0.7);
    // ... and it all lands.
    for (let k = 0; k < 2 + s; k++) this.burst(v, 0.25 + Math.random() * 0.35, 0.06, 'bandpass', 500, 2.5, 0.35);
  }

  /** The laser's beam: a zap that sweeps down, fuller the longer it charged. */
  laser(x0: number, y0: number, x1: number, y1: number, power: number): void {
    // Heard from the nearest point along the beam.
    const ex = x1 - x0;
    const ey = y1 - y0;
    const t = clamp(((this.earX - x0) * ex + (this.earY - y0) * ey) / (ex * ex + ey * ey || 1), 0, 1);
    const v = this.voice(x0 + ex * t, y0 + ey * t, 0.45 + 0.35 * power, 0.9, 1.2, true);
    if (!v) return;
    const dur = 0.25 + 0.45 * power;
    this.tone(v, 0, dur, 'sawtooth', 2600, 110, 0.35);
    this.tone(v, 0, dur, 'square', 90 + 40 * power, 45, 0.25 + 0.3 * power);
    this.burst(v, 0, dur * 0.8, 'highpass', 4000, 0.7, 0.4);
  }

  // ------------------------------------------------------------ beds

  /** Thruster roar (dropship pods, drop rockets, runaway engines): `level` summed and distance-weighted, `pan` -1..1. */
  engines(level: number, pan: number): void {
    if (!this.engine && level <= 0.01) return;
    const b = (this.engine ??= this.bed('lowpass', 300, 0.8, 34));
    const t = this.ctx.currentTime;
    const l = clamp(level, 0, 1.6);
    b.gain.gain.setTargetAtTime(0.22 * l, t, 0.08);
    b.tone.frequency.setTargetAtTime(220 + 520 * Math.min(1, l), t, 0.1);
    b.pan.pan.setTargetAtTime(clamp(pan, -1, 1) * 0.8, t, 0.1);
    if (b.osc) b.osc.frequency.setTargetAtTime(30 + 18 * Math.min(1, l), t, 0.15);
  }

  /** Jetpacks and tank jets: a hissing rush. */
  jets(level: number, pan: number): void {
    if (!this.jet && level <= 0.01) return;
    const b = (this.jet ??= this.bed('bandpass', 1800, 0.6));
    const t = this.ctx.currentTime;
    b.gain.gain.setTargetAtTime(0.13 * clamp(level, 0, 1.4), t, 0.05);
    b.pan.pan.setTargetAtTime(clamp(pan, -1, 1) * 0.8, t, 0.08);
  }

  /** Our own laser charging (0..1): a rising whine. */
  charge(level: number): void {
    if (!this.whine && level <= 0) return;
    const b = (this.whine ??= this.bed('lowpass', 5000, 0.7, 200, 'sawtooth', 0));
    const t = this.ctx.currentTime;
    b.gain.gain.setTargetAtTime(level > 0 ? 0.05 + 0.1 * level : 0, t, 0.04);
    b.osc?.frequency.setTargetAtTime(180 + 1500 * level, t, 0.05);
  }

  // ------------------------------------------------------------ plumbing

  /**
   * A voice for a sound at (x, y): fades and darkens with distance, panned
   * to the side it's on. `dur` (s) is how long it rings; `reach` stretches
   * its range (big guns and blasts carry); `must` sounds play even with the
   * voice budget spent. Null when it's out of earshot or crowded out.
   */
  private voice(x: number, y: number, gain: number, dur: number, reach = 1, must = false): Voice | null {
    if (!this.on || this.muted) return null;
    const dx = x - this.earX;
    const dy = y - this.earY;
    const d = Math.hypot(dx, dy) / reach;
    if (d > RANGE) return null;
    const now = this.ctx.currentTime;
    if (this.ends.length >= MAX_VOICES) this.ends = this.ends.filter((e) => e > now);
    if (this.ends.length >= MAX_VOICES && !must) return null;
    const near = 1 - d / RANGE;
    const g = gain * (0.25 + 0.75 * near) * Math.sqrt(near);
    if (g < 0.004) return null;
    const c = this.ctx;
    const vg = c.createGain();
    vg.gain.value = g;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 16000 * Math.pow(0.07, d / RANGE);
    const pan = c.createStereoPanner();
    pan.pan.value = clamp(dx / 700, -1, 1) * 0.85;
    vg.connect(lp).connect(pan).connect(this.out);
    pan.connect(this.room);
    // (The nodes go once their sources have ended and nothing holds them.)
    this.ends.push(now + dur);
    return { t: now + 0.005, dest: vg };
  }

  /** A burst of filtered noise: decays over `dur`, the filter sweeping to `f1` if given. */
  private burst(v: Voice, at: number, dur: number, type: BiquadFilterType, f0: number, q: number, gain: number, f1?: number): void {
    const c = this.ctx;
    const t = v.t + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(v.dest);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  /** A pitched blip: an oscillator swept from `f0` to `f1`, decaying over `dur`. */
  private tone(v: Voice, at: number, dur: number, wave: OscillatorType, f0: number, f1: number, gain: number): void {
    const c = this.ctx;
    const t = v.t + at;
    const o = c.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(v.dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** A looping bed: noise through a filter, plus (optionally) an oscillator for body, starting silent. */
  private bed(type: BiquadFilterType, freq: number, q: number, oscHz = 0, wave: OscillatorType = 'sawtooth', noise = 1): Bed {
    const c = this.ctx;
    const gain = c.createGain();
    gain.gain.value = 0;
    const tone = c.createBiquadFilter();
    tone.type = type;
    tone.frequency.value = freq;
    tone.Q.value = q;
    const pan = c.createStereoPanner();
    tone.connect(gain).connect(pan).connect(this.out);
    if (noise > 0) {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.connect(tone);
      src.start();
    }
    let osc: OscillatorNode | undefined;
    if (oscHz > 0) {
      osc = c.createOscillator();
      osc.type = wave;
      osc.frequency.value = oscHz;
      const og = c.createGain();
      og.gain.value = noise > 0 ? 0.5 : 1;
      osc.connect(og).connect(tone);
      osc.start();
    }
    return { gain, pan, tone, osc };
  }

  /** A decaying stereo noise impulse for the room. */
  private impulse(seconds: number, decay: number): AudioBuffer {
    const c = this.ctx;
    const n = Math.floor(c.sampleRate * seconds);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }
}
