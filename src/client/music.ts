/**
 * The soundtrack: a dark, lo-fi theme after Crystal Castles and witch house,
 * synthesized live with Web Audio (no audio files). A minor progression at a
 * slow half-time tempo: detuned saw pads under a drifting low-pass, bitcrushed
 * square-wave arpeggios through a dotted-eighth delay, an 808 sub, a trap kit
 * with hi-hat rolls, glassy bells, tape hiss, and a big dark reverb over it
 * all. It builds and breaks down in 8-bar sections, and goes muffled (as if
 * through a wall) while you're dead or between waves.
 *
 * `composeBar` is pure (and tested): it decides what plays in each bar from
 * the bar number and a seed. `Music` turns that into sound.
 */

export const BPM = 70;
/** Seconds per beat and per bar (4/4). */
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;

export type Part = 'pad' | 'arp' | 'bass' | 'kick' | 'snare' | 'hat' | 'bell';
export interface NoteEvent {
  part: Part;
  /** Start, in beats from the bar's downbeat. */
  beat: number;
  /** Length, in beats. */
  dur: number;
  /** MIDI notes (one for most parts, a chord for pads). */
  notes: number[];
  vel: number;
}

/** D minor: i - VI - iv - v (Dm, Bb, Gm, Am), each with its seventh, voiced around the third octave. */
const ROOT = 50; // D3
const PROGRESSION: readonly (readonly number[])[] = [
  [0, 3, 7, 10], // Dm7
  [-4, 0, 3, 7], // Bbmaj7
  [-7, -4, 0, 3], // Gm7
  [-5, -2, 2, 5], // Am7(b5-ish, darker)
];
/** D minor pentatonic over two octaves, for the bells. */
const BELL_SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];

/** Arpeggio shapes: indices into the chord tones stacked over two octaves (8 steps, played twice a bar). */
const ARPS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 3, 2, 1],
  [0, 2, 1, 3, 2, 4, 3, 5],
  [0, 4, 1, 5, 2, 6, 3, 7],
  [7, 5, 6, 4, 5, 3, 4, 2],
  [0, 3, 6, 3, 1, 4, 7, 4],
];

/** Which layers play in each 8-bar section (cycling): a build, the drop, a breakdown, the drop again. */
const SECTIONS: readonly { pad: boolean; arp: boolean; bass: boolean; drums: boolean; bells: boolean; rolls: boolean }[] = [
  { pad: true, arp: false, bass: false, drums: false, bells: true, rolls: false }, // intro: pads and bells
  { pad: true, arp: true, bass: false, drums: false, bells: false, rolls: false }, // the arp comes in
  { pad: true, arp: true, bass: true, drums: true, bells: false, rolls: false }, // the drop
  { pad: true, arp: true, bass: true, drums: true, bells: true, rolls: true }, // full, hi-hat rolls
  { pad: true, arp: true, bass: false, drums: false, bells: true, rolls: false }, // breakdown
  { pad: true, arp: true, bass: true, drums: true, bells: true, rolls: true }, // back in
];

/** Deterministic [0, 1) from integers. */
function hash(a: number, b: number, c = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Everything that plays in bar `bar` (0-based) of the theme, for a given `seed`. */
export function composeBar(bar: number, seed: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  const sec = SECTIONS[Math.floor(bar / 8) % SECTIONS.length];
  const chord = PROGRESSION[bar % PROGRESSION.length].map((n) => ROOT + n);
  const section = Math.floor(bar / 8);
  const r = (k: number) => hash(bar, seed, k);

  if (sec.pad) out.push({ part: 'pad', beat: 0, dur: 4, notes: chord, vel: 0.5 });

  if (sec.arp) {
    // Chord tones stacked over two octaves, an octave above the pad.
    const tones = [...chord.map((n) => n + 12), ...chord.map((n) => n + 24)];
    const shape = ARPS[Math.floor(hash(section, seed, 99) * ARPS.length)];
    for (let i = 0; i < 16; i++) {
      // Now and then a step drops out or jumps an octave: it glitches.
      if (r(i) < 0.07) continue;
      const up = r(20 + i) < 0.06 ? 12 : 0;
      out.push({ part: 'arp', beat: i / 4, dur: 0.22, notes: [tones[shape[i % 8] % tones.length] + up], vel: i % 4 === 0 ? 0.55 : 0.4 });
    }
  }

  if (sec.bass) {
    const root = chord[0] - 12;
    out.push({ part: 'bass', beat: 0, dur: 1.75, notes: [root], vel: 0.8 });
    out.push({ part: 'bass', beat: 2.5, dur: 1.25, notes: [root], vel: 0.65 });
  }

  if (sec.drums) {
    // Half-time trap: kick on one and the "and" of three, snare on three.
    out.push({ part: 'kick', beat: 0, dur: 0.5, notes: [], vel: 1 });
    out.push({ part: 'kick', beat: 2.5, dur: 0.5, notes: [], vel: 0.8 });
    if (r(40) < 0.35) out.push({ part: 'kick', beat: 3.25, dur: 0.5, notes: [], vel: 0.6 });
    out.push({ part: 'snare', beat: 2, dur: 0.5, notes: [], vel: 0.9 });
    for (let i = 0; i < 8; i++) out.push({ part: 'hat', beat: i / 2, dur: 0.1, notes: [], vel: i % 2 ? 0.25 : 0.4 });
    if (sec.rolls && bar % 2 === 1) {
      // A trap roll into the next bar: hats in quick triplets over the last beat.
      for (let i = 0; i < 6; i++) out.push({ part: 'hat', beat: 3 + i / 6, dur: 0.06, notes: [], vel: 0.2 + i * 0.05 });
    }
  }

  if (sec.bells && r(60) < 0.7) {
    // A few glassy notes, high up, drifting.
    const n = 1 + Math.floor(r(61) * 3);
    for (let k = 0; k < n; k++) {
      const note = ROOT + 24 + BELL_SCALE[Math.floor(r(70 + k) * BELL_SCALE.length)];
      out.push({ part: 'bell', beat: Math.floor(r(80 + k) * 8) / 2, dur: 2, notes: [note], vel: 0.3 });
    }
  }
  return out;
}

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * The player: builds the audio graph on a context (a live AudioContext, or
 * an OfflineAudioContext to render a file) and schedules bars a little ahead
 * of the clock.
 */
export class Music {
  readonly ctx: BaseAudioContext;
  private master: GainNode;
  private muffle: BiquadFilterNode;
  private padBus: GainNode;
  private padFilter: BiquadFilterNode;
  private arpBus: GainNode;
  private drumBus: GainNode;
  private bellBus: GainNode;
  private noise: AudioBuffer;
  private nextBar = 0;
  private nextBarTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly seed: number;
  private on = true;
  private volume = 0.5;

  constructor(ctx: BaseAudioContext, seed = Math.floor(Math.random() * 1e9)) {
    this.ctx = ctx;
    this.seed = seed;
    const c = ctx;
    // Master: a soft compressor, then the "through a wall" low-pass, then out.
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 9000;
    this.muffle.Q.value = 0.5;
    // (and a high-pass under it all: no sub-rumble below the kick)
    const floor = c.createBiquadFilter();
    floor.type = 'highpass';
    floor.frequency.value = 32;
    floor.Q.value = 0.7;
    comp.connect(floor).connect(this.muffle).connect(this.master).connect(c.destination);

    // A long, dark reverb (generated: decaying stereo noise).
    const reverb = c.createConvolver();
    reverb.buffer = this.impulse(3.8, 2.6);
    const wet = c.createGain();
    wet.gain.value = 0.55;
    const verbTone = c.createBiquadFilter();
    verbTone.type = 'lowpass';
    verbTone.frequency.value = 3200;
    reverb.connect(verbTone).connect(wet).connect(comp);

    // Dotted-eighth delay with darkening feedback (for the arp and bells).
    const delay = c.createDelay(2);
    delay.delayTime.value = BEAT * 0.75;
    const fb = c.createGain();
    fb.gain.value = 0.38;
    const fbTone = c.createBiquadFilter();
    fbTone.type = 'lowpass';
    fbTone.frequency.value = 2200;
    delay.connect(fbTone).connect(fb).connect(delay);
    const delayOut = c.createGain();
    delayOut.gain.value = 0.45;
    fbTone.connect(delayOut).connect(comp);
    delayOut.connect(reverb);

    // Lo-fi: a bitcrusher (quantizing wave shaper) on the arp and drums.
    const crush = c.createWaveShaper();
    crush.curve = crushCurve(5);
    const crushTone = c.createBiquadFilter();
    crushTone.type = 'lowpass';
    crushTone.frequency.value = 5200;
    crush.connect(crushTone).connect(comp);
    crushTone.connect(reverb);

    // Pads: through a low-pass whose cutoff drifts slowly (an LFO), into lots of reverb.
    this.padFilter = c.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 3;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = c.createGain();
    lfoAmt.gain.value = 500;
    lfo.connect(lfoAmt).connect(this.padFilter.frequency);
    lfo.start();
    this.padBus = c.createGain();
    this.padBus.gain.value = 0.22;
    this.padBus.connect(this.padFilter);
    this.padFilter.connect(comp);
    this.padFilter.connect(reverb);

    this.arpBus = c.createGain();
    this.arpBus.gain.value = 0.16;
    this.arpBus.connect(crush);
    this.arpBus.connect(delay);

    this.drumBus = c.createGain();
    this.drumBus.gain.value = 0.5;
    this.drumBus.connect(crush);

    this.bellBus = c.createGain();
    this.bellBus.gain.value = 0.12;
    this.bellBus.connect(comp);
    this.bellBus.connect(delay);
    this.bellBus.connect(reverb);

    // Tape hiss, always there under everything, very quiet.
    this.noise = this.noiseBuffer(2);
    const hiss = c.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    const hissTone = c.createBiquadFilter();
    hissTone.type = 'bandpass';
    hissTone.frequency.value = 5000;
    hissTone.Q.value = 0.4;
    const hissGain = c.createGain();
    hissGain.gain.value = 0.012;
    hiss.connect(hissTone).connect(hissGain).connect(comp);
    hiss.start();
  }

  /** Start scheduling from now (live), keeping ~0.4 s of music scheduled ahead. */
  start(): void {
    this.nextBarTime = this.ctx.currentTime + 0.1;
    this.timer ??= setInterval(() => this.pump(this.ctx.currentTime + 0.4), 60);
    this.pump(this.ctx.currentTime + 0.4);
  }

  /** Schedule every bar that starts before `until` (seconds on the context clock). */
  pump(until: number): void {
    while (this.nextBarTime < until) {
      for (const e of composeBar(this.nextBar, this.seed)) this.play(e, this.nextBarTime + e.beat * BEAT);
      this.nextBar++;
      this.nextBarTime += BAR;
    }
  }

  /** Muffled (dead, spectating, between waves) or clear, eased over a second. */
  setMuffled(m: boolean): void {
    const t = this.ctx.currentTime;
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setTargetAtTime(m ? 650 : 9000, t, 0.35);
  }

  toggle(): boolean {
    this.on = !this.on;
    this.master.gain.setTargetAtTime(this.on ? this.volume : 0, this.ctx.currentTime, 0.1);
    return this.on;
  }

  get enabled(): boolean {
    return this.on;
  }

  private play(e: NoteEvent, t: number): void {
    const dur = e.dur * BEAT;
    switch (e.part) {
      case 'pad':
        for (const n of e.notes) this.padVoice(n, t, dur, e.vel);
        break;
      case 'arp':
        this.arpVoice(e.notes[0], t, dur, e.vel);
        break;
      case 'bass':
        this.bassVoice(e.notes[0], t, dur, e.vel);
        break;
      case 'kick':
        this.kick(t, e.vel);
        break;
      case 'snare':
        this.snare(t, e.vel);
        break;
      case 'hat':
        this.hat(t, e.vel);
        break;
      case 'bell':
        this.bell(e.notes[0], t, dur, e.vel);
        break;
    }
  }

  /** Two detuned saws and a sub triangle, slow in and slow out. */
  private padVoice(n: number, t: number, dur: number, vel: number): void {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.3, t + 0.9);
    g.gain.setValueAtTime(vel * 0.3, t + dur - 0.2);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.4);
    g.connect(this.padBus);
    for (const [type, detune, mul] of [
      ['sawtooth', -9, 1],
      ['sawtooth', 9, 1],
      ['triangle', 0, 0.5], // the sub octave (quieter: see its gain below)
    ] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq(n) * mul;
      o.detune.value = detune;
      if (type === 'triangle') {
        const sub = c.createGain();
        sub.gain.value = 0.4;
        o.connect(sub).connect(g);
      } else o.connect(g);
      o.start(t);
      o.stop(t + dur + 1.5);
    }
  }

  /** A square-wave blip: sharp attack, quick decay (the delay and crusher do the rest). */
  private arpVoice(n: number, t: number, dur: number, vel: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = freq(n);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(vel * 0.25, t + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(g).connect(this.arpBus);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  /** An 808: a sine that drops into the note, a long tail, a little drive. */
  private bassVoice(n: number, t: number, dur: number, vel: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    const f = freq(n);
    o.frequency.setValueAtTime(f * 2, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const drive = c.createWaveShaper();
    drive.curve = driveCurve(2.2);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.55, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    o.connect(drive).connect(g).connect(this.drumBus);
    o.start(t);
    o.stop(t + dur + 0.35);
  }

  private kick(t: number, vel: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(this.drumBus);
    o.start(t);
    o.stop(t + 0.5);
  }

  /** A clap/snare: a band-passed noise burst, with a long gated reverb tail from the bus. */
  private snare(t: number, vel: number): void {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(vel * 0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    s.connect(bp).connect(g).connect(this.drumBus);
    s.start(t, Math.random() * 1.5);
    s.stop(t + 0.3);
  }

  private hat(t: number, vel: number): void {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const g = c.createGain();
    g.gain.setValueAtTime(vel * 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(hp).connect(g).connect(this.drumBus);
    s.start(t, Math.random() * 1.5);
    s.stop(t + 0.06);
  }

  /** Glass: a sine with an inharmonic partial, a long ring. */
  private bell(n: number, t: number, dur: number, vel: number): void {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.5);
    g.connect(this.bellBus);
    for (const [mul, amp] of [
      [1, 1],
      [2.76, 0.35],
    ]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq(n) * mul;
      const a = c.createGain();
      a.gain.value = amp;
      o.connect(a).connect(g);
      o.start(t);
      o.stop(t + dur + 1.6);
    }
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const b = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * seconds), this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const b = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
}

/** A staircase transfer curve: quantize to 2^bits levels (the bitcrusher). */
function crushCurve(bits: number): Float32Array<ArrayBuffer> {
  const n = 4096;
  const steps = Math.pow(2, bits);
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

/** Soft saturation. */
function driveCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}
