/**
 * The Arcade, 1992 - room synthesis.
 *
 * Nothing is sampled. Every sound is built from oscillators, noise written by
 * hand into an AudioBuffer, biquad filters and scheduled envelopes. The cabinet
 * music is real two operator FM in the manner of the Yamaha OPM arcade chip:
 * a modulator oscillator drives the carrier's frequency AudioParam, and the
 * modulation index has its own envelope that decays faster than the amplitude,
 * which is what gives the chip its bright attack and dull tail.
 *
 * Signal flow
 *
 *   cabinet 0..7 ─► lowpass(distance) ─► panner ─► cabinet level ─┐
 *   crowd / coins / machines / upstairs ──────────────────────────┤
 *                                                                 ▼
 *                                        layer.dry ─► layer.gain ─┬─► bus
 *                                        layer.wet ─► layer.send ─┤
 *                                                                 ▼
 *                                                          reverbIn
 *                                                        ┌────────┴────────┐
 *                                              convolver(long 2.15 s)  convolver(short 0.46 s)
 *                                                     longMix          shortMix
 *                                                        └────────┬────────┘
 *                                                            reverbReturn ─► bus
 *
 *                                        bus ─► limiter ─► master ─► destination
 *
 * The density control is the whole instrument. It sets how many cabinets are in
 * play rather than in attract mode, the crowd level, the coin and joystick
 * arrival rates, how much of the rink upstairs survives, and, the part that
 * matters most, the crossfade between the two impulse responses. An empty hall
 * is hard surfaces and a 2.15 s tail. Thirty eight bodies absorb that, and the
 * same room answers in 0.46 s.
 */

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* E2 = 82.4069 Hz. Every cabinet melody below is written as semitones above
 * this, so the whole arcade is locked to E minor and the machines clash in
 * rhythm without ever clashing in key.                                       */
const E2 = 82.4069;
const hz = (semi) => E2 * Math.pow(2, semi / 12);

/* A2 = 110 Hz, the rink upstairs. */
const A2 = 110;
const ahz = (semi) => A2 * Math.pow(2, semi / 12);

/** "36 . 34 ." -> [36, null, 34, null] */
const P = (s) => s.trim().split(/\s+/).map((x) => (x === '.' ? null : +x));
/** "x...x..." -> [true, false, false, false, true, ...] */
const H = (s) => s.replace(/\s+/g, '').split('').map((c) => c !== '.');

/* ── the four cabinet loops ───────────────────────────────────────────────
 * Two bars of sixteenths each. `roots` are the chord roots per half bar in
 * semitones above E2, so [0, 8, 3, 10] is Em, C, G, D. `voice` picks the FM
 * ratio: 2 gives odd harmonics only and reads as a square wave lead, 1 gives
 * the full harmonic series and reads as a saw, 3.5 is inharmonic and rings
 * like a bell. That is the entire palette of the era.                       */
const LOOPS = [
  {
    name: 'chase', bpm: 168, voice: 'square', index: 2.1,
    roots: [0, 8, 3, 10],
    lead: P(`36 .  34 .  31 .  34 .   32 .  31 .  27 .  .  .
             31 .  29 .  27 .  29 .   34 .  32 .  31 .  .  .`),
    kick: H('x.....x.x.......x.....x.x.......'),
    snare: H('....x.......x.......x.......x...'),
  },
  {
    name: 'bell', bpm: 152, voice: 'bell', index: 3.4,
    roots: [0, 5, 10, 7],
    lead: P(`31 .  .  .  36 .  34 .   33 .  .  .  29 .  .  .
             34 .  .  .  31 .  29 .   30 .  .  27 .  .  .  .`),
    kick: H('x.......x...x...x.......x...x...'),
    snare: H('....x.......x.......x.......x...'),
  },
  {
    name: 'runner', bpm: 168, voice: 'saw', index: 1.5,
    roots: [0, 0, 8, 7],
    lead: P(`24 27 31 27  24 27 31 34   32 29 27 29  32 27 24 27
             20 24 27 24  20 24 27 31   31 29 27 26  27 .  .  .`),
    kick: H('x...x...x...x...x...x...x...x...'),
    snare: H('....x.......x.......x.......x.x.'),
  },
  {
    name: 'heavy', bpm: 152, voice: 'square', index: 2.8,
    roots: [0, 0, 10, 8],
    lead: P(`12 .  .  15 .  .  12 .   19 .  .  .  17 .  15 .
             12 .  .  15 .  .  12 .   22 .  20 .  19 .  .  .`),
    kick: H('x.....x.x.....x.x.....x.x...x.x.'),
    snare: H('........x...............x.......'),
  },
];

/* Eight cabinets against the wall. `cut` and `send` are the distance: a machine
 * across the room loses its top end and gains reverb, which is what actually
 * reads as far away. Volume alone never does.                                */
export const CABINETS = [
  { loop: 0, pan: -0.88, cut: 8600, send: 0.14, tune: 0,  level: 0.95 },
  { loop: 2, pan: -0.68, cut: 6200, send: 0.22, tune: 0,  level: 0.86 },
  { loop: 1, pan: -0.46, cut: 4300, send: 0.34, tune: 12, level: 0.74 },
  { loop: 3, pan: -0.24, cut: 3400, send: 0.44, tune: 0,  level: 0.70 },
  { loop: 0, pan: -0.02, cut: 3800, send: 0.40, tune: 12, level: 0.82 }, // the crowded one
  { loop: 2, pan: 0.22,  cut: 3400, send: 0.44, tune: 0,  level: 0.70 },
  { loop: 1, pan: 0.46,  cut: 4300, send: 0.34, tune: 0,  level: 0.74 },
  { loop: 3, pan: 0.70,  cut: 6400, send: 0.22, tune: 12, level: 0.86 },
];

/** The machine everybody is standing around. */
export const MAGNET = 4;

/* How many cabinets are dark, in attract, or being played, at a given density.
 * The owner does not leave every machine lit for nobody.                     */
export function cabinetModes(d) {
  const dark = d < 0.34 ? Math.round(((0.34 - d) / 0.34) * 3) : 0;
  const play = clamp(Math.round(d * 8), d > 0.05 ? 1 : 0, 8 - dark);
  const modes = new Array(8).fill('attract');
  /* play spreads out from the crowded machine, dark collects at the far right */
  const order = [4, 3, 5, 2, 6, 1, 7, 0];
  for (let i = 0; i < play; i++) modes[order[i]] = 'play';
  for (let i = 0, k = 7; i < dark; i++, k--) {
    while (k >= 0 && modes[k] === 'play') k--;
    if (k >= 0) modes[k] = 'dark';
  }
  return modes;
}

/* ── noise and rooms ─────────────────────────────────────────────────────── */

function noiseBuffer(ctx, seconds, kind) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  if (kind === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.019 * (Math.random() * 2 - 1)) / 1.019;
      d[i] = last * 5.2;
    }
    return buf;
  }
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

/**
 * A hall, built as noise under an exponential decay with early reflection taps
 * placed differently in each channel so the tail is decorrelated and reads as a
 * space rather than a filter.
 *
 * @param damp  one pole coefficient. The empty room is bare concrete and steel
 *              cabinets, so it stays bright. The full room is coats and hair,
 *              so it is darkened hard as well as shortened.
 */
function impulseResponse(ctx, seconds, decay, damp, taps) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += ((Math.random() * 2 - 1) - lp) * damp;
      d[i] = lp * Math.pow(1 - t, decay) * 0.92;
    }
    for (const [sec, amp] of taps) {
      const idx = Math.floor((sec + ch * 0.0017) * ctx.sampleRate);
      if (idx < len) d[idx] += amp * (ch ? 0.86 : 1);
    }
  }
  return buf;
}

/* ── the arcade ──────────────────────────────────────────────────────────── */

export class Arcade {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.density = 0.45;
    this.volume = 0.7;
    this.muted = false;
    this.on = { cabinets: true, crowd: true, coins: true, machines: true, upstairs: true };
    this.poweredFrac = 0.6;
    this._timers = [];
    this._nodes = [];
    this.cabs = [];
  }

  /* Must be called from inside a user gesture. */
  async start() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) throw new Error('no-webaudio');
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    if (ctx.state !== 'running') throw new Error('blocked');

    this.white = noiseBuffer(ctx, 2.0, 'white');
    this.pink = noiseBuffer(ctx, 4.0, 'pink');
    this.brown = noiseBuffer(ctx, 4.0, 'brown');

    this.master = ctx.createGain();
    this.master.gain.value = 0;

    /* A safety limiter, not a level control. It sits high enough that a packed
     * room passes under it almost all the time, because a compressor set low
     * enough to catch everything would pull an empty arcade up to the same
     * loudness as a full one and quietly delete the entire mechanic. */
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -4;
    this.limiter.knee.value = 5;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.bus = ctx.createGain();
    /* Trimmed by ear and then by measurement: a packed room has a lot of
     * simultaneous sources and this keeps peak RMS at destination inside the
     * 0.09 to 0.20 window across the whole range of the density control. */
    this.bus.gain.value = 0.70;
    this.bus.connect(this.limiter).connect(this.master).connect(ctx.destination);

    /* Two rooms, crossfaded. This is the density mechanic made audible. */
    this.reverbIn = ctx.createGain();
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.9;
    this.reverbReturn.connect(this.bus);

    this.longRoom = ctx.createConvolver();
    this.longRoom.buffer = impulseResponse(ctx, 2.15, 1.9, 0.62,
      [[0.019, 0.34], [0.037, 0.27], [0.061, 0.21], [0.094, 0.15], [0.131, 0.10]]);
    this.longMix = ctx.createGain();
    this.longMix.gain.value = 0.6;
    this.reverbIn.connect(this.longRoom).connect(this.longMix).connect(this.reverbReturn);

    this.shortRoom = ctx.createConvolver();
    this.shortRoom.buffer = impulseResponse(ctx, 0.46, 3.6, 0.30,
      [[0.008, 0.30], [0.015, 0.20], [0.024, 0.13], [0.036, 0.08]]);
    this.shortMix = ctx.createGain();
    this.shortMix.gain.value = 0.6;
    this.reverbIn.connect(this.shortRoom).connect(this.shortMix).connect(this.reverbReturn);

    this.layers = {};
    for (const n of ['cabinets', 'crowd', 'coins', 'machines', 'upstairs']) {
      this.layers[n] = this._layer();
    }

    this._buildCabinets();
    this._buildFans();
    this._buildFlyback();
    this._buildAir();
    this._buildCrowdBed();
    this._buildUpstairs();

    this.applyMix(0.001);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, ctx.currentTime, 0.6);
    this._startSchedulers();
    this.ready = true;
    return this;
  }

  _layer() {
    const ctx = this.ctx;
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const gain = ctx.createGain();
    const send = ctx.createGain();
    gain.gain.value = 0;
    send.gain.value = 0;
    dry.connect(gain).connect(this.bus);
    wet.connect(send).connect(this.reverbIn);
    return { dry, wet, gain, send };
  }

  _loop(buffer, rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = rate;
    src.start();
    this._nodes.push(src);
    return src;
  }

  _lfo(freq, depth, target, phase = 0) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const amt = ctx.createGain();
    amt.gain.value = depth;
    osc.connect(amt).connect(target);
    osc.start(ctx.currentTime + phase);
    this._nodes.push(osc);
    return osc;
  }

  /* ── FM, the way the chip did it ─────────────────────────────────────────
   * One modulator on one carrier. The modulator's own gain envelope is the
   * modulation index, and it collapses faster than the amplitude envelope, so
   * the note starts bright and dulls as it decays. Ratio 2 leaves odd
   * harmonics and sounds square, ratio 1 fills them all in and sounds saw,
   * and 3.5 is deliberately not a whole number so the partials go inharmonic
   * and the note rings like struck metal.                                    */
  _fm(dest, time, freq, o = {}) {
    const ctx = this.ctx;
    const ratio = o.ratio ?? 2;
    const dur = o.dur ?? 0.16;
    const idx = (o.index ?? 2) * freq;
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = freq;
    if (o.detune) car.detune.value = o.detune;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * ratio;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(idx, time);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.06), time + dur * 0.55);
    mod.connect(mg).connect(car.frequency);

    if (o.sweep) {
      car.frequency.setValueAtTime(freq, time);
      car.frequency.exponentialRampToValueAtTime(freq * o.sweep, time + dur);
      mod.frequency.setValueAtTime(freq * ratio, time);
      mod.frequency.exponentialRampToValueAtTime(freq * ratio * o.sweep, time + dur);
    }

    const env = ctx.createGain();
    const g = o.gain ?? 0.16;
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(g, time + (o.attack ?? 0.004));
    if (o.hold) env.gain.setValueAtTime(g * 0.7, time + o.hold);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    car.connect(env).connect(dest);
    car.start(time);
    car.stop(time + dur + 0.02);
    mod.start(time);
    mod.stop(time + dur + 0.02);
    car.onended = () => { car.disconnect(); mod.disconnect(); mg.disconnect(); env.disconnect(); };
  }

  /** Chip kick: a sine dropped hard in pitch, with a noise tick on the front. */
  _kick(dest, time, f0 = 128, f1 = 44, g = 0.5, dur = 0.17) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, time);
    osc.frequency.exponentialRampToValueAtTime(f1, time + dur * 0.7);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(g, time + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(env).connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.02);
    osc.onended = () => { osc.disconnect(); env.disconnect(); };
  }

  /** Chip snare: the noise channel through a bandpass, plus a tuned body. */
  _snare(dest, time, g = 0.20) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.playbackRate.value = rand(0.9, 1.2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rand(1700, 2300);
    bp.Q.value = 0.9;
    const env = ctx.createGain();
    const dur = rand(0.07, 0.11);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(g, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(bp).connect(env).connect(dest);
    src.start(time, Math.random() * 1.5, dur + 0.02);
    src.stop(time + dur + 0.03);
    src.onended = () => { src.disconnect(); bp.disconnect(); env.disconnect(); };
    this._fm(dest, time, 196, { ratio: 1.41, index: 3, dur: 0.05, gain: g * 0.5 });
  }

  /* ── cabinets ────────────────────────────────────────────────────────── */

  _buildCabinets() {
    const ctx = this.ctx;
    this.cabs = CABINETS.map((spec, i) => {
      const input = ctx.createGain();
      input.gain.value = 1;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = spec.cut;
      lp.Q.value = 0.5;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 90;             // small cabinet speakers have no bottom
      const pan = ctx.createStereoPanner();
      pan.pan.value = spec.pan;
      const level = ctx.createGain();
      level.gain.value = 0;
      const wet = ctx.createGain();
      wet.gain.value = spec.send;
      input.connect(hp).connect(lp).connect(pan).connect(level);
      level.connect(this.layers.cabinets.dry);
      level.connect(wet).connect(this.layers.cabinets.wet);

      const loop = LOOPS[spec.loop];
      return {
        i, spec, loop, input, level, lp,
        mode: 'attract',
        step: (Math.random() * 32) | 0,        // every machine starts elsewhere
        bar: (Math.random() * 4) | 0,
        next: 0,
        nextSfx: 0,
        nextJingle: 0,
      };
    });
  }

  /** One sixteenth of one machine. */
  _cabStep(c, time) {
    const L = c.loop;
    const s = c.step;
    const dest = c.input;
    const tune = c.spec.tune;
    const attract = c.mode === 'attract';
    /* In attract mode the demo loop plays one bar in four and leaves the room
     * alone for the other three. That silence is most of what an empty arcade
     * sounds like, and it is why an empty one feels lonely rather than quiet. */
    if (attract && c.bar !== 0) return;
    const trim = attract ? 0.46 : 1;

    const root = L.roots[(s >> 3) & 3];
    /* bass: a sixteenth arpeggio on the chord root, the standard chip bassline */
    const shape = [0, null, 7, null, 12, null, 7, null][s & 7];
    if (shape !== null) {
      this._fm(dest, time, hz(root + shape), {
        ratio: 1, index: 0.9, dur: 0.12, gain: 0.085 * trim,
      });
    }

    const note = L.lead[s];
    if (note !== null) {
      const ratio = L.voice === 'square' ? 2 : L.voice === 'saw' ? 1 : 3.5;
      const dur = L.voice === 'bell' ? 0.55 : L.name === 'runner' ? 0.1 : 0.2;
      this._fm(dest, time, hz(note + tune), {
        ratio, index: L.index, dur, gain: (L.voice === 'bell' ? 0.075 : 0.1) * trim,
        detune: rand(-6, 6),
      });
    }

    if (L.kick[s]) this._kick(dest, time, 132, 46, 0.34 * trim, 0.15);
    if (L.snare[s]) this._snare(dest, time, 0.13 * trim);
  }

  /** Game noise from a machine that somebody is actually playing. */
  _cabSfx(c, time) {
    const dest = c.input;
    if (c.i === MAGNET) {
      /* the crowded machine: heavier hits, and they land in twos and threes */
      const n = 1 + ((Math.random() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const t = time + k * rand(0.09, 0.16);
        this._fm(dest, t, rand(70, 120), {
          ratio: 1.7, index: 5, dur: 0.2, gain: 0.16, sweep: 0.45,
        });
        this._snare(dest, t, 0.1);
      }
      return;
    }
    pick([
      () => this._fm(dest, time, rand(500, 900), { ratio: 2, index: 3, dur: 0.13, gain: 0.09, sweep: 2.4 }),
      () => this._fm(dest, time, rand(900, 1600), { ratio: 3.5, index: 4, dur: 0.18, gain: 0.07, sweep: 0.4 }),
      () => this._fm(dest, time, rand(180, 300), { ratio: 1, index: 6, dur: 0.22, gain: 0.11, sweep: 0.5 }),
    ])();
  }

  /** The three note figure an idle machine plays to ask for a coin. */
  _jingle(c, time) {
    const dest = c.input;
    [0, 7, 12].forEach((n, k) => {
      this._fm(dest, time + k * 0.13, hz(24 + n), {
        ratio: 3.5, index: 3.2, dur: 0.34, gain: 0.075,
      });
    });
  }

  /* ── machines ────────────────────────────────────────────────────────── */

  /** Cooling fans: brown noise in a resonant band, plus blade tones that beat. */
  _buildFans() {
    const ctx = this.ctx;
    const L = this.layers.machines;
    const src = this._loop(this.brown, 0.85);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 205;
    bp.Q.value = 1.1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1250;
    this.fanBody = ctx.createGain();
    this.fanBody.gain.value = 1.5;
    src.connect(bp).connect(lp).connect(this.fanBody);
    this.fanBody.connect(L.dry);
    this.fanBody.connect(L.wet);
    this._lfo(0.037, 240, bp.frequency);
    for (const [f, g] of [[92, 0.019], [118, 0.013], [154, 0.008], [237, 0.004]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const amp = ctx.createGain();
      amp.gain.value = g;
      osc.connect(amp).connect(this.fanBody);
      this._lfo(0.06 + Math.random() * 0.07, g * 0.5, amp.gain);
      osc.start();
      this._nodes.push(osc);
    }
  }

  /** Flyback whine off the picture tubes. Two tubes, slightly out of tune. */
  _buildFlyback() {
    const ctx = this.ctx;
    const L = this.layers.machines;
    for (const [f, g] of [[15734, 0.0042], [15751, 0.0026]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const amp = ctx.createGain();
      amp.gain.value = g;
      osc.connect(amp).connect(L.dry);
      this._lfo(0.063 + Math.random() * 0.04, 6, osc.frequency);
      this._lfo(0.17, g * 0.3, amp.gain);
      osc.start();
      this._nodes.push(osc);
    }
  }

  /** The hall itself: a low bed of moving air that never quite goes away. */
  _buildAir() {
    const ctx = this.ctx;
    const L = this.layers.machines;
    const src = this._loop(this.pink, 0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 70;
    const amp = ctx.createGain();
    amp.gain.value = 0.24;
    src.connect(hp).connect(lp).connect(amp);
    amp.connect(L.dry);
    amp.connect(L.wet);
    this._lfo(0.041, 140, lp.frequency);
  }

  /* ── the crowd ───────────────────────────────────────────────────────── */

  /** The wash under everything. Its level is the density, almost directly. */
  _buildCrowdBed() {
    const ctx = this.ctx;
    const L = this.layers.crowd;
    const src = this._loop(this.pink, 0.55);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 480;
    bp.Q.value = 0.75;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    this.murmurBed = ctx.createGain();
    this.murmurBed.gain.value = 0.5;
    src.connect(bp).connect(lp).connect(this.murmurBed);
    this.murmurBed.connect(L.dry);
    this.murmurBed.connect(L.wet);
    this._lfo(0.053, 190, bp.frequency);
    this._lfo(0.029, 0.16, this.murmurBed.gain, 0.4);
  }

  /**
   * A few syllables of somebody talking. Two formants over band limited noise
   * with a syllable rhythm envelope. It has to stay under about 1.5 kHz, or the
   * ear starts trying to make words out of it and fails, which sounds wrong.
   */
  _talk(time, panAt) {
    const ctx = this.ctx;
    const L = this.layers.crowd;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.loop = true;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = rand(380, 620); f1.Q.value = 7;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.frequency.value = rand(950, 1450); f2.Q.value = 6;
    const mix = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1500;
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = panAt;
    src.connect(f1).connect(mix);
    src.connect(f2).connect(mix);
    mix.connect(lp).connect(env).connect(pan);
    pan.connect(L.dry);
    pan.connect(L.wet);

    const syl = 2 + ((Math.random() * 4) | 0);
    let t = time;
    env.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < syl; i++) {
      const d = rand(0.09, 0.19);
      env.gain.linearRampToValueAtTime(rand(0.04, 0.1), t + 0.03);
      env.gain.exponentialRampToValueAtTime(0.004, t + d);
      t += d + rand(0.01, 0.07);
    }
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    src.start(time, Math.random() * 1.4);
    src.stop(t + 0.15);
    src.onended = () => { [src, f1, f2, mix, lp, env, pan].forEach((n) => n.disconnect()); };
  }

  /**
   * The room going up when a match ends. A noise swell whose formants rise,
   * a scatter of claps, and two or three voices carrying over the top.
   */
  cheer(strength = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const L = this.layers.crowd;
    const time = ctx.currentTime + 0.03;
    const panAt = CABINETS[MAGNET].pan;

    const src = ctx.createBufferSource();
    src.buffer = this.pink;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = panAt;
    src.connect(bp).connect(env).connect(pan);
    pan.connect(L.dry);
    pan.connect(L.wet);
    const d = rand(1.5, 2.4);
    bp.frequency.setValueAtTime(430, time);
    bp.frequency.exponentialRampToValueAtTime(rand(1100, 1600), time + d * 0.3);
    bp.frequency.exponentialRampToValueAtTime(500, time + d);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(0.30 * strength, time + 0.14);
    env.gain.exponentialRampToValueAtTime(0.05 * strength, time + d * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, time + d);
    src.start(time, Math.random() * 2);
    src.stop(time + d + 0.05);
    src.onended = () => { [src, bp, env, pan].forEach((n) => n.disconnect()); };

    const claps = 8 + ((Math.random() * 20 * strength) | 0);
    for (let i = 0; i < claps; i++) {
      this._clap(time + rand(0.05, 1.5), rand(-0.9, 0.9), 0.09 * strength);
    }
    for (let i = 0; i < 2 + ((Math.random() * 2) | 0); i++) {
      this._talk(time + rand(0.1, 0.9), panAt + rand(-0.3, 0.3));
    }
  }

  _clap(time, panAt, g) {
    const ctx = this.ctx;
    const L = this.layers.crowd;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rand(1100, 2400);
    bp.Q.value = rand(0.7, 1.6);
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = panAt;
    src.connect(bp).connect(env).connect(pan);
    pan.connect(L.dry);
    pan.connect(L.wet);
    const d = rand(0.02, 0.05);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(g * rand(0.6, 1.2), time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, time + d);
    src.start(time, Math.random() * 1.6, d + 0.02);
    src.stop(time + d + 0.03);
    src.onended = () => { [src, bp, env, pan].forEach((n) => n.disconnect()); };
  }

  /* ── coins and controls ──────────────────────────────────────────────── */

  /**
   * A hundred won into the slot and down into the tray. The mechanism clacks
   * first, then the coin lands on steel: four inharmonic partials at
   * 1 / 2.76 / 5.41 / 8.93, which is what stops it sounding like a bell, and
   * it bounces two or three times before it settles.
   */
  coin(panAt = rand(-0.7, 0.7), when = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const L = this.layers.coins;
    const t0 = ctx.currentTime + 0.02 + when;
    const pan = ctx.createStereoPanner();
    pan.pan.value = panAt;
    pan.connect(L.dry);
    pan.connect(L.wet);

    /* the slot mechanism */
    this._tick(pan, t0, rand(700, 1100), 3.2, 0.035, 0.16);
    this._tick(pan, t0 + rand(0.05, 0.09), rand(1400, 1900), 2.6, 0.02, 0.1);

    const base = rand(1080, 1320);
    let t = t0 + rand(0.13, 0.2);
    let g = 0.5;
    const bounces = 2 + ((Math.random() * 3) | 0);
    for (let b = 0; b < bounces; b++) {
      const detune = 1 + rand(-0.03, 0.03);
      [[1, 0.52], [2.76, 0.34], [5.41, 0.2], [8.93, 0.12]].forEach(([r, dec], k) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = base * r * detune;
        const env = ctx.createGain();
        const amp = g * [0.5, 0.34, 0.2, 0.12][k];
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(amp, t + 0.0016);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        osc.connect(env).connect(pan);
        osc.start(t);
        osc.stop(t + dec + 0.03);
        osc.onended = () => { osc.disconnect(); env.disconnect(); };
      });
      this._tick(pan, t, rand(4200, 7000), 1.4, 0.012, g * 0.3);
      t += rand(0.055, 0.12);
      g *= rand(0.42, 0.6);
    }
    setTimeout(() => pan.disconnect(), 3200);
  }

  /** A short filtered noise transient. Every plastic and metal click here. */
  _tick(dest, time, freq, q, dur, g) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.playbackRate.value = rand(0.85, 1.3);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(g, time + 0.0013);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(bp).connect(env).connect(dest);
    src.start(time, Math.random() * 1.6, dur + 0.02);
    src.stop(time + dur + 0.03);
    src.onended = () => { src.disconnect(); bp.disconnect(); env.disconnect(); };
  }

  /** Joystick against the gate: hard plastic, with a little wood in it. */
  _joystick(time, panAt) {
    const ctx = this.ctx;
    const L = this.layers.coins;
    const pan = ctx.createStereoPanner();
    pan.pan.value = panAt;
    pan.connect(L.dry);
    pan.connect(L.wet);
    this._tick(pan, time, rand(850, 1600), 4.2, rand(0.014, 0.026), rand(0.16, 0.3));
    this._fm(pan, time, rand(150, 230), { ratio: 1, index: 1, dur: 0.045, gain: 0.05 });
    setTimeout(() => pan.disconnect(), 700);
  }

  /** Somebody laying into the buttons. Fast, uneven, and it always overshoots. */
  _mash(time, panAt, count) {
    const ctx = this.ctx;
    const L = this.layers.coins;
    const pan = ctx.createStereoPanner();
    pan.pan.value = panAt;
    pan.connect(L.dry);
    pan.connect(L.wet);
    let t = time;
    for (let i = 0; i < count; i++) {
      this._tick(pan, t, rand(1900, 3400), 2.4, rand(0.008, 0.017), rand(0.1, 0.22));
      t += rand(0.062, 0.105);
    }
    setTimeout(() => pan.disconnect(), (t - time) * 1000 + 800);
  }

  /** Public: the visitor put a coin in a machine on screen. */
  play(cabIndex) {
    if (!this.ready) return;
    const panAt = CABINETS[clamp(cabIndex, 0, 7)].pan;
    this.coin(panAt);
    this._mash(this.ctx.currentTime + rand(0.7, 1.1), panAt, 5 + ((Math.random() * 7) | 0));
  }

  /* ── upstairs ────────────────────────────────────────────────────────── */

  /**
   * The roller rink on the floor above, arriving through a concrete slab.
   * Everything goes through the same two paths: a hard lowpass at 240 Hz that
   * carries the kick and the bassline, and a much quieter leak at 1.3 kHz that
   * lets the wheels and the whistle through. Structure borne sound is not a
   * volume reduction, it is a filter, and this is the filter.
   */
  _buildUpstairs() {
    const ctx = this.ctx;
    const L = this.layers.upstairs;

    this.slab = ctx.createGain();          // everything upstairs feeds this
    const thru = ctx.createBiquadFilter();
    thru.type = 'lowpass';
    thru.frequency.value = 240;
    thru.Q.value = 0.9;
    const rumble = ctx.createBiquadFilter();
    rumble.type = 'highpass';
    rumble.frequency.value = 32;
    const body = ctx.createGain();
    body.gain.value = 1.0;
    this.slab.connect(thru).connect(rumble).connect(body);
    body.connect(L.dry);
    body.connect(L.wet);

    const leak = ctx.createBiquadFilter();
    leak.type = 'lowpass';
    leak.frequency.value = 1300;
    const leakG = ctx.createGain();
    leakG.gain.value = 0.075;
    this.slab.connect(leak).connect(leakG);
    leakG.connect(L.dry);
    leakG.connect(L.wet);

    /* wheels on a wood floor: a broad low roll that swells as a group passes */
    const src = this._loop(this.brown, 1.15);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 430;
    bp.Q.value = 0.7;
    const wheels = ctx.createGain();
    wheels.gain.value = 0.44;
    src.connect(bp).connect(wheels).connect(this.slab);
    this._lfo(0.083, 0.22, wheels.gain);
    this._lfo(0.031, 0.16, wheels.gain, 1.7);
    this._lfo(0.047, 120, bp.frequency);
  }

  /** One sixteenth of the rink. A minor, 128 BPM, four on the floor. */
  _rinkStep(s, time) {
    const dest = this.slab;
    if (s % 4 === 0) this._kick(dest, time, 96, 46, 0.36, 0.24);
    /* offbeat bass, the thing you actually hear through a ceiling */
    if (s % 4 === 2) {
      const root = [0, 0, 5, 7][(s >> 3) & 3];      // Am Am Dm Em
      this._fm(dest, time, ahz(root - 12), { ratio: 1, index: 1.2, dur: 0.16, gain: 0.20 });
    }
    /* a riff that is mostly lost in the slab but changes what does get through */
    const riff = [12, null, 15, null, 19, null, 15, null, 17, null, 15, null, 12, null, null, null];
    const n = riff[s & 15];
    if (n !== null) this._fm(dest, time, ahz(n), { ratio: 2, index: 1.6, dur: 0.13, gain: 0.07 });
    /* hats: gone by the time they reach the floor below, but they are up there */
    if (s % 2 === 1) this._tick(dest, time, 8000, 1.2, 0.03, 0.05);
  }

  /** The attendant, two floors of nothing between you and the whistle. */
  _whistle(time) {
    const ctx = this.ctx;
    for (let i = 0; i < 2; i++) {
      const t = time + i * 0.34;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2150, t);
      osc.frequency.linearRampToValueAtTime(2420, t + 0.05);
      const trill = ctx.createOscillator();     // the pea in the whistle
      trill.type = 'sine';
      trill.frequency.value = 34;
      const trillAmt = ctx.createGain();
      trillAmt.gain.value = 180;
      trill.connect(trillAmt).connect(osc.frequency);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.85, t + 0.02);
      env.gain.setValueAtTime(0.85, t + 0.18);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      osc.connect(env).connect(this.slab);
      osc.start(t); osc.stop(t + 0.3);
      trill.start(t); trill.stop(t + 0.3);
      osc.onended = () => { osc.disconnect(); trill.disconnect(); trillAmt.disconnect(); env.disconnect(); };
    }
  }

  /* ── schedulers ──────────────────────────────────────────────────────── */

  _startSchedulers() {
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.15;
    for (const c of this.cabs) c.next = now + Math.random() * 0.4;
    this._rink = { step: 0, next: now };
    this._next = {
      coin: now + rand(1, 4),
      stick: now + 0.4,
      talk: now + rand(0.5, 2),
      cheer: now + rand(8, 20),
      whistle: now + rand(25, 60),
    };
    this._timers.push(setInterval(() => this._tickScheduler(), 25));
  }

  _tickScheduler() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const horizon = ctx.currentTime + 0.18;
    const d = this.density;
    const n = this._next;

    for (const c of this.cabs) {
      const stepDur = 60 / c.loop.bpm / 4;
      if (c.mode === 'dark') { c.next = Math.max(c.next, horizon); continue; }
      while (c.next < horizon) {
        this._cabStep(c, c.next);
        c.step = (c.step + 1) & 31;
        if (c.step === 0) c.bar = (c.bar + 1) & 3;
        c.next += stepDur;
      }
      if (c.mode === 'play') {
        if (c.nextSfx < horizon) {
          this._cabSfx(c, Math.max(c.nextSfx, ctx.currentTime + 0.02));
          c.nextSfx = c.next + rand(0.5, 2.2);
        }
      } else if (c.nextJingle < horizon) {
        this._jingle(c, Math.max(c.nextJingle, ctx.currentTime + 0.02));
        c.nextJingle = c.next + rand(11, 24);
      }
    }

    while (this._rink.next < horizon) {
      this._rinkStep(this._rink.step, this._rink.next);
      this._rink.step = (this._rink.step + 1) & 31;
      this._rink.next += 60 / 128 / 4;
    }

    /* coins: two a minute in an empty room, better than one a second when full */
    const coinRate = 0.035 + 1.15 * Math.pow(d, 1.35);
    while (n.coin < horizon) {
      this.coin(rand(-0.85, 0.85), n.coin - ctx.currentTime);
      n.coin += -Math.log(1 - Math.random()) / coinRate;
    }

    /* joysticks and buttons, only from machines somebody is standing at */
    const playing = this.cabs.filter((c) => c.mode === 'play');
    const stickRate = 0.3 + 1.6 * playing.length;
    while (n.stick < horizon) {
      const c = pick(playing) || this.cabs[MAGNET];
      const panAt = c.spec.pan + rand(-0.08, 0.08);
      if (Math.random() < 0.24) {
        this._mash(n.stick, panAt, 4 + ((Math.random() * 10) | 0));
        n.stick += rand(0.5, 1.4);
      } else {
        this._joystick(n.stick, panAt);
        n.stick += -Math.log(1 - Math.random()) / stickRate;
      }
    }

    const talkRate = 0.03 + 3.4 * Math.pow(d, 1.25);
    while (n.talk < horizon) {
      this._talk(n.talk, rand(-0.95, 0.95));
      n.talk += -Math.log(1 - Math.random()) / talkRate;
    }

    if (n.cheer < horizon) {
      if (d > 0.14) this.cheer(clamp(0.35 + d, 0.35, 1.35));
      n.cheer += rand(9, 26) / (0.25 + d);
    }

    if (n.whistle < horizon) {
      this._whistle(Math.max(n.whistle, ctx.currentTime + 0.02));
      n.whistle += rand(38, 95);
    }
  }

  /* ── mix ─────────────────────────────────────────────────────────────── */

  /**
   * Everything the density control touches, in one place. Note that the two
   * reverb sends move in opposite directions: the long room fades out and the
   * short one fades in, and the return level drops as well, because a full
   * room is not just shorter, it is quieter in the tail.
   */
  applyMix(tau = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const d = this.density;
    const on = this.on;

    const modes = cabinetModes(d);
    let powered = 0;
    for (const c of this.cabs) {
      c.mode = modes[c.i];
      if (c.mode !== 'dark') powered++;
      const lvl = c.mode === 'dark' ? 0
        : c.spec.level * (c.mode === 'play' ? 1 : 0.72) * (c.i === MAGNET ? 1.12 : 1);
      c.level.gain.setTargetAtTime(lvl, now, tau);
    }
    this.poweredFrac = powered / 8;

    const set = (name, level, send) => {
      const L = this.layers[name];
      L.gain.gain.setTargetAtTime(level, now, tau);
      L.send.gain.setTargetAtTime(level * send, now, tau);
    };
    set('cabinets', on.cabinets ? 0.22 + 0.82 * d : 0, 0.55);
    set('crowd', on.crowd ? 0.02 + 0.98 * Math.pow(d, 0.8) : 0, 0.8);
    set('coins', on.coins ? 0.55 : 0, 0.85);
    set('machines', on.machines ? 0.12 + 0.62 * this.poweredFrac : 0, 0.22);
    /* the rink does not get louder or quieter by much. It gets buried. */
    set('upstairs', on.upstairs ? 0.72 - 0.34 * d : 0, 0.4);

    this.fanBody.gain.setTargetAtTime(0.55 + 0.8 * this.poweredFrac, now, tau);
    this.murmurBed.gain.setTargetAtTime(0.2 + 0.6 * d, now, tau);

    this.longMix.gain.setTargetAtTime(Math.pow(1 - d, 1.25) * 1.15, now, tau);
    this.shortMix.gain.setTargetAtTime(0.22 + 0.78 * Math.pow(d, 0.7), now, tau);
    this.reverbReturn.gain.setTargetAtTime(1.15 - 0.66 * d, now, tau);
  }

  setDensity(d) {
    this.density = clamp(d, 0, 1);
    this.applyMix(0.6);
  }

  setLayer(id, on) {
    this.on[id] = on;
    this.applyMix(0.12);
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.ctx && !this.muted) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.06);
    }
  }

  async stop() {
    if (!this.ctx) return;
    this._timers.forEach(clearInterval);
    this._timers = [];
    const ctx = this.ctx;
    this.ready = false;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    await new Promise((r) => setTimeout(r, 260));
    for (const nd of this._nodes) { try { nd.stop(); } catch { /* already stopped */ } }
    this._nodes = [];
    await ctx.close();
    this.ctx = null;
  }
}
