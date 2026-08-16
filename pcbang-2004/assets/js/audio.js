/**
 * PC Bang 2004 — room synthesis.
 *
 * Nothing here is sampled. Every texture is built from oscillators, noise
 * buffers written by hand into an AudioBuffer, biquad filters, and scheduled
 * envelopes. The reverb is a ConvolverNode fed a procedurally generated
 * impulse response (noise * exponential decay, one-pole darkened, with a few
 * early reflection taps, decorrelated across L/R).
 *
 * Signal flow
 *
 *   per-layer sources ─┬─► layer.dry ─► layer.gain ────────────────┐
 *                      └─► layer.wet ─► layer.send ─► convolver ─► reverbReturn
 *                                                                  │
 *                                          both sum into ─► bus ───┤
 *                                                                  ▼
 *                                          bus ─► limiter ─► master ─► destination
 *
 * layer.gain is (toggle ? base * seatMultiplier : 0) and layer.send is that
 * value again times the seat's reverb multiplier, so muting a layer also
 * removes its tail. Seat changes are ramped with setTargetAtTime, never set
 * directly, so the room never clicks.
 */

const TAU = Math.PI * 2;

/* ── seat mixes ──────────────────────────────────────────────────────────
 * `near` is the probability weight for the closest keyboard tier: the corner
 * seat is buried in keyboards, the window seat hears them from behind.      */
import { RoomMusic, SLOT_MEDIUM } from './room-music.js';

/* ── which music each seat is inside of ──────────────────────────────────
 *
 * A PC bang had no single shared music: what you heard depended entirely on
 * where you were sitting. The window seat is up at the front by the door, so
 * it gets whatever is coming out of the ceiling speakers over the counter.
 * The corner seat is the one buried in keyboards where the ranked games get
 * played, and that music is in your own headset. The counter seat is where
 * the kettle and the ramen are, and what is playing there is the owner's
 * radio behind the counter, through a wall.
 *
 * Each of the three therefore arrives through a different object, which is
 * why they do not share a medium. Moving seats crossfades between them:
 * the piece has one control and this is bound to it.
 */
const SEAT_MUSIC = { window: 'lobby', corner: 'ranked', counter: 'ramen' };
const MUSIC_SLOTS = ['lobby', 'ranked', 'ramen'];
/* Trimmed against the destination RMS window the bus and limiter are set to. */
const MUSIC_TOP = 0.44;

export const SEATS = {
  window:  { keys: 0.60, mouse: 0.55, fans: 0.62, room: 0.74, traffic: 1.00, counter: 0.16, reverb: 0.80, near: 0.16 },
  corner:  { keys: 1.00, mouse: 1.00, fans: 1.00, room: 0.56, traffic: 0.00, counter: 0.07, reverb: 1.30, near: 0.62 },
  counter: { keys: 0.74, mouse: 0.72, fans: 0.80, room: 0.92, traffic: 0.12, counter: 1.00, reverb: 0.95, near: 0.34 },
};

/* Base level of each layer before the seat multiplier. */
const BASE = { keys: 0.90, mouse: 0.55, fans: 0.62, room: 0.70, crt: 1.00, fluo: 0.85, traffic: 0.80, counter: 0.75 };

/* Base reverb send per layer, before the seat multiplier. */
const SEND = { keys: 1.00, mouse: 0.35, fans: 0.30, room: 0.90, crt: 0.00, fluo: 0.10, traffic: 0.25, counter: 0.70 };

/* Keyboard distance tiers: cutoff, level, reverb send, stereo width. */
const TIERS = [
  { cutoff: 7600, level: 0.42, send: 0.10, width: 0.45 },
  { cutoff: 3100, level: 0.26, send: 0.30, width: 0.80 },
  { cutoff: 1450, level: 0.15, send: 0.55, width: 1.00 },
];

/**
 * The fluorescent tube's flicker, as one shared function. The audio gain and
 * the screen brightness both read this, so they are the same signal rather
 * than two things that merely look similar.
 * @returns {number} roughly 0..1
 */
export function flickerValue(t) {
  const v = 0.5
    + 0.28 * Math.sin(TAU * 0.17 * t)
    + 0.12 * Math.sin(TAU * 2.70 * t + 1.1)
    + 0.06 * Math.sin(TAU * 7.30 * t + 0.4);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/* ── noise ─────────────────────────────────────────────────────────────── */

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
  // pink, Paul Kellet's economy filter
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
 * Small tiled room, about 0.62 s. Noise under an exponential decay, darkened
 * by a one-pole lowpass so it reads as plaster and tile rather than a plate,
 * plus a handful of early taps placed differently per channel so the tail is
 * decorrelated and sits wide.
 */
function impulseResponse(ctx, seconds = 0.62) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const taps = [
    [[0.007, 0.42], [0.013, 0.28], [0.021, 0.20], [0.034, 0.13], [0.048, 0.09]],
    [[0.009, 0.38], [0.016, 0.26], [0.026, 0.18], [0.039, 0.12], [0.053, 0.08]],
  ];

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const decay = Math.pow(1 - t, 2.6);
      lp += ((Math.random() * 2 - 1) - lp) * 0.42;
      d[i] = lp * decay * 0.9;
    }
    for (const [sec, amp] of taps[ch]) {
      const idx = Math.floor(sec * ctx.sampleRate);
      if (idx < len) d[idx] += amp;
    }
  }
  return buf;
}

/* ── the room ────────────────────────────────────────────────────────── */

export class Room {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.seat = 'corner';
    this.on = { keys: true, fans: true, room: true, crt: false, fluo: true, music: true };
    this.musicReady = false;
    this.volume = 0.7;
    this.muted = false;
    this._timers = [];
    this._nodes = [];
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

    /* master chain */
    this.master = ctx.createGain();
    this.master.gain.value = 0;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -11;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 14;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.24;

    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(this.limiter).connect(this.master).connect(ctx.destination);

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = impulseResponse(ctx);
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.85;
    this.convolver.connect(this.reverbReturn).connect(this.bus);

    this.layers = {};
    for (const name of ['keys', 'mouse', 'fans', 'room', 'crt', 'fluo', 'traffic', 'counter', 'buzz']) {
      this.layers[name] = this._makeLayer();
    }

    this._buildFans();
    this._buildCrt();
    this._buildFluorescent();
    this._buildRoomBed();
    this._buildTraffic();
    this._buildMusic();

    this.applyMix(0.001);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, ctx.currentTime, 0.5);

    this._startSchedulers();
    this.ready = true;
    return this;
  }

  _buildMusic() {
    this.music = {};
    for (const slot of MUSIC_SLOTS) {
      this.music[slot] = new RoomMusic(this.ctx, {
        profile: SLOT_MEDIUM[`pcbang-2004__${slot}`],
        destination: this.bus,
        reverbSend: this.convolver,
      });
    }
    Promise.all(MUSIC_SLOTS.map((slot) => this.music[slot]
      .load(`assets/audio/${slot}.mp3`)
      .catch(() => { this.music[slot] = null; })))
      .then(() => { this.musicReady = true; this._applyMusic(2.0); });
  }

  /* Moving seats fades one out while the other comes up, because you walked
     across a room rather than pressing next on a player. */
  _applyMusic(fade = 1.8) {
    if (!this.musicReady) return;
    const want = this.on.music ? SEAT_MUSIC[this.seat] : null;
    for (const slot of MUSIC_SLOTS) {
      const m = this.music[slot];
      if (!m) continue;
      if (slot === want) {
        clearTimeout(m._pauseTimer);   /* a stop in flight would pause mid fade */
        m.play({ level: MUSIC_TOP, fade });
      } else if (m.playing) {
        m.stop({ fade });
      }
    }
  }

  _makeLayer() {
    const ctx = this.ctx;
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const gain = ctx.createGain();
    const send = ctx.createGain();
    gain.gain.value = 0;
    send.gain.value = 0;
    dry.connect(gain).connect(this.bus);
    wet.connect(send).connect(this.convolver);
    return { dry, wet, gain, send };
  }

  /* ── steady beds ─────────────────────────────────────────────────── */

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

  /** Brown noise through a resonant bandpass, plus two blade tones that beat. */
  _buildFans() {
    const ctx = this.ctx;
    const L = this.layers.fans;

    const src = this._loop(this.brown, 0.9);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 230;
    bp.Q.value = 1.05;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const body = ctx.createGain();
    body.gain.value = 1.5;
    src.connect(bp).connect(lp).connect(body);
    body.connect(L.dry);
    body.connect(L.wet);
    this._lfo(0.043, 260, bp.frequency);

    // blade passing: ~1000 rpm, 7 blades, two units slightly out of step
    for (const [f, g] of [[116, 0.020], [97.5, 0.014], [163, 0.008]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const amp = ctx.createGain();
      amp.gain.value = g;
      osc.connect(amp).connect(L.dry);
      this._lfo(0.07 + Math.random() * 0.06, g * 0.45, amp.gain);
      osc.start();
      this._nodes.push(osc);
    }
  }

  /** Flyback whine: one very quiet sine near 15.734 kHz with a slow drift. */
  _buildCrt() {
    const ctx = this.ctx;
    const L = this.layers.crt;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 15734;
    const amp = ctx.createGain();
    amp.gain.value = 0.0060;
    osc.connect(amp).connect(L.dry);
    this._lfo(0.071, 7, osc.frequency);
    this._lfo(0.19, 0.0016, amp.gain);
    osc.start();
    this._nodes.push(osc);
  }

  /** 120 Hz plus harmonics, amplitude walked by the shared flicker function. */
  _buildFluorescent() {
    const ctx = this.ctx;
    const L = this.layers.fluo;
    this.fluoTrim = ctx.createGain();
    this.fluoTrim.gain.value = 0.8;
    this.fluoTrim.connect(L.dry);
    this.fluoTrim.connect(L.wet);

    for (const [f, g] of [[120, 0.0165], [240, 0.0080], [360, 0.0042], [600, 0.0016]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const amp = ctx.createGain();
      amp.gain.value = g;
      osc.connect(amp).connect(this.fluoTrim);
      osc.start();
      this._nodes.push(osc);
    }
  }

  /** Pink noise, heavily lowpassed, with a wandering cutoff. */
  _buildRoomBed() {
    const ctx = this.ctx;
    const L = this.layers.room;
    const src = this._loop(this.pink, 0.8);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 720;
    lp.Q.value = 0.7;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    const amp = ctx.createGain();
    amp.gain.value = 0.62;
    src.connect(hp).connect(lp).connect(amp);
    amp.connect(L.dry);
    amp.connect(L.wet);
    this._lfo(0.047, 190, lp.frequency);
    this._lfo(0.031, 0.14, amp.gain, 0.5);
  }

  /** Street rumble under the window. Passing cars are scheduled events. */
  _buildTraffic() {
    const ctx = this.ctx;
    const L = this.layers.traffic;
    const src = this._loop(this.brown, 0.55);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 115;
    const amp = ctx.createGain();
    amp.gain.value = 1.1;
    src.connect(lp).connect(amp).connect(L.dry);
    this._lfo(0.026, 0.35, amp.gain);
  }

  /* ── one-shot events ─────────────────────────────────────────────── */

  /** Short filtered noise burst with a percussive envelope. One key press. */
  _strike(time, tierIdx, opts = {}) {
    const ctx = this.ctx;
    const tier = TIERS[tierIdx];
    const chain = this.keyTiers[tierIdx];
    const dur = opts.dur ?? rand(0.014, 0.032);

    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.playbackRate.value = rand(0.8, 1.35);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = opts.freq ?? rand(1300, 3900);
    bp.Q.value = opts.q ?? rand(0.9, 2.4);

    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? rand(-tier.width, tier.width);

    src.connect(bp).connect(env).connect(pan).connect(chain.in);

    const peak = (opts.gain ?? 1) * rand(0.5, 1.0);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(peak, time + 0.0013);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    src.start(time, Math.random() * (this.white.duration - 0.12), dur + 0.02);
    src.stop(time + dur + 0.03);
    src.onended = () => {
      src.disconnect(); bp.disconnect(); env.disconnect(); pan.disconnect();
    };
  }

  /** The spacebar. Lower, heavier, a little longer. */
  _thud(time, tierIdx, panAt) {
    this._strike(time, tierIdx, { freq: rand(150, 260), q: 0.8, dur: rand(0.05, 0.085), gain: 1.35, pan: panAt });
  }

  /** Mouse: sharper, drier, and it stays near. */
  _click(time) {
    const ctx = this.ctx;
    const L = this.layers.mouse;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.playbackRate.value = rand(1.0, 1.6);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = rand(2100, 3400);
    const bp = ctx.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.value = rand(3800, 6200);
    bp.gain.value = 9;
    bp.Q.value = 2.2;
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.4, 0.4);
    src.connect(hp).connect(bp).connect(env).connect(pan);
    pan.connect(L.dry);
    pan.connect(L.wet);
    const dur = rand(0.006, 0.013);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(rand(0.5, 0.9), time + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.start(time, Math.random() * 1.5, dur + 0.02);
    src.stop(time + dur + 0.03);
    src.onended = () => { src.disconnect(); hp.disconnect(); bp.disconnect(); env.disconnect(); pan.disconnect(); };
  }

  /** Chair legs dragged over vinyl flooring. */
  _chairScrape(time) {
    const ctx = this.ctx;
    const L = this.layers.room;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.playbackRate.value = rand(0.6, 1.0);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3.6;
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.85, 0.85);
    src.connect(bp).connect(env).connect(pan);
    pan.connect(L.dry);
    pan.connect(L.wet);
    const d = rand(0.25, 0.5);
    bp.frequency.setValueAtTime(rand(600, 900), time);
    bp.frequency.exponentialRampToValueAtTime(rand(1800, 3000), time + d);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(rand(0.10, 0.22), time + 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, time + d);
    src.start(time, Math.random() * 1.2, d + 0.05);
    src.stop(time + d + 0.06);
    src.onended = () => { src.disconnect(); bp.disconnect(); env.disconnect(); pan.disconnect(); };
  }

  /** The front door: a low thump and a latch. */
  _door(time) {
    const ctx = this.ctx;
    const L = this.layers.room;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(96, time);
    osc.frequency.exponentialRampToValueAtTime(46, time + 0.16);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(0.30, time + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    osc.connect(env);
    env.connect(L.dry);
    env.connect(L.wet);
    osc.start(time);
    osc.stop(time + 0.26);
    osc.onended = () => { osc.disconnect(); env.disconnect(); };
    this._strike(time + 0.03, 2, { freq: 2600, q: 3, dur: 0.02, gain: 0.5 });
  }

  /** Someone losing a game two seats over, heard through the room. */
  _shout(time) {
    const ctx = this.ctx;
    const L = this.layers.room;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = rand(420, 620); f1.Q.value = 7;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.frequency.value = rand(980, 1350); f2.Q.value = 6;
    const mix = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 950;
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.9, 0.9);
    src.connect(f1).connect(mix);
    src.connect(f2).connect(mix);
    mix.connect(lp).connect(env).connect(pan);
    pan.connect(L.dry);
    pan.connect(L.wet);

    // two syllables
    const g = rand(0.11, 0.2);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(g, time + 0.04);
    env.gain.exponentialRampToValueAtTime(0.02, time + 0.20);
    env.gain.linearRampToValueAtTime(g * 0.9, time + 0.27);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.55);
    src.start(time, Math.random() * 1.2, 0.7);
    src.stop(time + 0.7);
    src.onended = () => { [src, f1, f2, mix, lp, env, pan].forEach((n) => n.disconnect()); };
  }

  /** A car passing outside, swept across the stereo field. */
  _passingCar(time) {
    const ctx = this.ctx;
    const L = this.layers.traffic;
    const src = ctx.createBufferSource();
    src.buffer = this.pink;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    src.connect(bp).connect(env).connect(pan);
    pan.connect(L.dry);
    pan.connect(L.wet);

    const d = rand(2.1, 3.6);
    const dir = Math.random() < 0.5 ? 1 : -1;
    bp.frequency.setValueAtTime(320, time);
    bp.frequency.exponentialRampToValueAtTime(rand(760, 1150), time + d * 0.5);
    bp.frequency.exponentialRampToValueAtTime(300, time + d);
    pan.pan.setValueAtTime(-0.95 * dir, time);
    pan.pan.linearRampToValueAtTime(0.95 * dir, time + d);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(rand(0.28, 0.5), time + d * 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, time + d);
    src.start(time, Math.random() * 2);
    src.stop(time + d + 0.05);
    src.onended = () => { [src, bp, env, pan].forEach((n) => n.disconnect()); };
  }

  /** The ramen kettle by the counter coming up to temperature. */
  _kettle(time) {
    const ctx = this.ctx;
    const L = this.layers.counter;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    const env = ctx.createGain();
    src.connect(bp).connect(env);
    env.connect(L.dry);
    env.connect(L.wet);
    const d = rand(6, 10);
    bp.frequency.setValueAtTime(900, time);
    bp.frequency.linearRampToValueAtTime(rand(2200, 2900), time + d);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(0.055, time + d * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, time + d);
    src.start(time, Math.random());
    src.stop(time + d + 0.1);
    src.onended = () => { [src, bp, env].forEach((n) => n.disconnect()); };

    const whistle = ctx.createOscillator();
    whistle.type = 'sine';
    whistle.frequency.setValueAtTime(1850, time + d * 0.55);
    whistle.frequency.linearRampToValueAtTime(2180, time + d);
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.0001, time + d * 0.55);
    wg.gain.linearRampToValueAtTime(0.010, time + d * 0.85);
    wg.gain.exponentialRampToValueAtTime(0.0001, time + d + 0.4);
    whistle.connect(wg).connect(L.dry);
    whistle.start(time + d * 0.55);
    whistle.stop(time + d + 0.5);
    whistle.onended = () => { whistle.disconnect(); wg.disconnect(); };
  }

  /** Staff walking past. Soft, low, close to the floor. */
  _footstep(time) {
    const L = this.layers.counter;
    const ctx = this.ctx;
    for (let i = 0; i < 4; i++) {
      const t = time + i * rand(0.42, 0.52);
      const src = ctx.createBufferSource();
      src.buffer = this.white;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = rand(300, 520);
      const env = ctx.createGain();
      const pan = ctx.createStereoPanner();
      pan.pan.value = rand(-0.7, 0.7);
      src.connect(lp).connect(env).connect(pan);
      pan.connect(L.dry);
      pan.connect(L.wet);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(rand(0.09, 0.16), t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      src.start(t, Math.random(), 0.12);
      src.stop(t + 0.13);
      src.onended = () => { [src, lp, env, pan].forEach((n) => n.disconnect()); };
    }
  }

  /**
   * The counter buzzer. Two square blips through a narrow bandpass.
   * `soft` is the shorter, friendlier confirm when you pay for another hour.
   * It has its own bus rather than riding the counter layer, because the
   * whole point of that buzzer is that you hear it from every seat.
   */
  buzzer(soft = false) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const L = this.layers.buzz;
    const t0 = ctx.currentTime + 0.02;
    const blips = soft ? [[0, 1320, 0.055], [0.085, 1760, 0.055]] : [[0, 1180, 0.10], [0.17, 1120, 0.13]];
    const level = soft ? 0.10 : 0.20;

    for (const [off, freq, dur] of blips) {
      const t = t0 + off;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq * 1.05;
      bp.Q.value = 2.2;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(level, t + 0.004);
      env.gain.setValueAtTime(level, t + dur - 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(bp).connect(env);
      env.connect(L.dry);
      env.connect(L.wet);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      osc.onended = () => { [osc, bp, env].forEach((n) => n.disconnect()); };
    }
  }

  /**
   * Degauss. A coil thump that drops in pitch, a burst of noise through the
   * shadow mask, and two metallic rings that decay away. This is the sound the
   * power button makes.
   */
  degauss() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    out.gain.value = 0.85;
    out.connect(this.bus);
    out.connect(this.convolver);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(74, t);
    osc.frequency.exponentialRampToValueAtTime(31, t + 0.42);
    const oe = ctx.createGain();
    oe.gain.setValueAtTime(0.0001, t);
    oe.gain.linearRampToValueAtTime(0.55, t + 0.008);
    oe.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(oe).connect(out);
    osc.start(t); osc.stop(t + 0.55);

    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(560, t);
    bp.frequency.exponentialRampToValueAtTime(180, t + 0.3);
    bp.Q.value = 1.6;
    const ne = ctx.createGain();
    ne.gain.setValueAtTime(0.0001, t);
    ne.gain.linearRampToValueAtTime(0.30, t + 0.006);
    ne.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    src.connect(bp).connect(ne).connect(out);
    src.start(t, Math.random(), 0.4); src.stop(t + 0.4);

    for (const [f, g, d] of [[1190, 0.055, 0.30], [1655, 0.038, 0.24]]) {
      const r = ctx.createOscillator();
      r.type = 'sine';
      r.frequency.value = f;
      const re = ctx.createGain();
      re.gain.setValueAtTime(0.0001, t);
      re.gain.linearRampToValueAtTime(g, t + 0.004);
      re.gain.exponentialRampToValueAtTime(0.0001, t + d);
      r.connect(re).connect(out);
      r.start(t); r.stop(t + d + 0.05);
      r.onended = () => { r.disconnect(); re.disconnect(); };
    }
    src.onended = () => { [src, bp, ne].forEach((n) => n.disconnect()); };
    osc.onended = () => { osc.disconnect(); oe.disconnect(); setTimeout(() => out.disconnect(), 900); };
  }

  /* ── schedulers ───────────────────────────────────────────────────── */

  _startSchedulers() {
    const ctx = this.ctx;

    // shared lowpass + dry/wet split per keyboard distance tier
    this.keyTiers = TIERS.map((tier) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = tier.cutoff;
      lp.Q.value = 0.6;
      const dry = ctx.createGain();
      dry.gain.value = tier.level;
      const wet = ctx.createGain();
      wet.gain.value = tier.level * tier.send;
      lp.connect(dry).connect(this.layers.keys.dry);
      lp.connect(wet).connect(this.layers.keys.wet);
      return { in: lp };
    });

    this._next = {
      key: ctx.currentTime + 0.2,
      mouse: ctx.currentTime + 1.4,
      roomEvt: ctx.currentTime + rand(6, 14),
      counterEvt: ctx.currentTime + rand(8, 20),
      car: ctx.currentTime + rand(3, 9),
    };

    // 25 ms lookahead scheduler. Nothing is generated in the audio thread's
    // path, everything is queued ahead of time on the sample clock.
    this._timers.push(setInterval(() => this._tick(), 25));
    // fluorescent amplitude follows the shared flicker curve
    this._timers.push(setInterval(() => {
      if (!this.ctx) return;
      const f = flickerValue(this.ctx.currentTime);
      this.fluoTrim.gain.setTargetAtTime(0.55 + 0.62 * f, this.ctx.currentTime, 0.035);
    }, 60));
  }

  _tick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const horizon = ctx.currentTime + 0.16;
    const seat = SEATS[this.seat];
    const n = this._next;

    // keyboards, Poisson arrivals across the whole room
    const rate = 12.5;
    while (n.key < horizon) {
      const r = Math.random();
      const tierIdx = r < seat.near ? 0 : (r < seat.near + (1 - seat.near) * 0.48 ? 1 : 2);
      const panAt = rand(-TIERS[tierIdx].width, TIERS[tierIdx].width);

      if (Math.random() < 0.07) {
        // somebody typing a sentence
        const count = 5 + ((Math.random() * 9) | 0);
        const gap = rand(0.055, 0.105);
        for (let i = 0; i < count; i++) {
          const t = n.key + i * gap * rand(0.82, 1.2);
          if (i === count - 1 && Math.random() < 0.55) this._thud(t, tierIdx, panAt);
          else this._strike(t, tierIdx, { pan: panAt + rand(-0.06, 0.06) });
        }
        n.key += count * gap + rand(0.25, 0.9);
      } else {
        if (Math.random() < 0.06) this._thud(n.key, tierIdx, panAt);
        else this._strike(n.key, tierIdx, { pan: panAt });
        n.key += -Math.log(1 - Math.random()) / rate;
      }
    }

    while (n.mouse < horizon) {
      this._click(n.mouse);
      if (Math.random() < 0.22) this._click(n.mouse + rand(0.08, 0.14));
      n.mouse += -Math.log(1 - Math.random()) / 1.15;
    }

    if (n.roomEvt < horizon) {
      pick([
        () => this._chairScrape(n.roomEvt),
        () => this._chairScrape(n.roomEvt),
        () => this._door(n.roomEvt),
        () => this._shout(n.roomEvt),
      ])();
      n.roomEvt += rand(7, 21);
    }

    if (n.counterEvt < horizon) {
      (Math.random() < 0.45 ? () => this._kettle(n.counterEvt) : () => this._footstep(n.counterEvt))();
      n.counterEvt += rand(14, 34);
    }

    if (n.car < horizon) {
      this._passingCar(n.car);
      n.car += rand(4, 13);
    }
  }

  /* ── mix control ─────────────────────────────────────────────────── */

  /** Recomputes every layer gain from the seat and the toggles. */
  applyMix(tau = 0.45) {
    if (!this.ctx) return;
    const s = SEATS[this.seat];
    const now = this.ctx.currentTime;
    const set = (name, level, sendMul) => {
      const L = this.layers[name];
      L.gain.gain.setTargetAtTime(level, now, tau);
      L.send.gain.setTargetAtTime(level * sendMul, now, tau);
    };
    const rv = s.reverb;
    set('keys', this.on.keys ? BASE.keys * s.keys : 0, SEND.keys * rv);
    set('mouse', this.on.keys ? BASE.mouse * s.mouse : 0, SEND.mouse * rv);
    set('fans', this.on.fans ? BASE.fans * s.fans : 0, SEND.fans * rv);
    set('room', this.on.room ? BASE.room * s.room : 0, SEND.room * rv);
    set('counter', this.on.room ? BASE.counter * s.counter : 0, SEND.counter * rv);
    set('traffic', this.on.room ? BASE.traffic * s.traffic : 0, SEND.traffic * rv);
    set('crt', this.on.crt ? BASE.crt : 0, 0);
    set('fluo', this.on.fluo ? BASE.fluo : 0, SEND.fluo * rv);
    // audible from anywhere, just closer when you are sitting by the counter
    set('buzz', 0.42 + 0.58 * s.counter, 0.55 * rv);

    // the music the seat is inside of, on the same control as everything else
    this._applyMusic(Math.max(tau * 3.2, 1.2));
  }

  setSeat(id) {
    if (!SEATS[id]) return;
    this.seat = id;
    this.applyMix(0.55);          // 1.5 s or so of crossfade, never a cut
  }

  setLayer(id, on) {
    this.on[id] = on;
    this.applyMix(0.10);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
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

  /** Ramp down, then tear the graph down. No clicks, no orphaned oscillators. */
  async stop() {
    if (!this.ctx) return;
    this._timers.forEach(clearInterval);
    this._timers = [];
    const ctx = this.ctx;
    this.ready = false;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    await new Promise((r) => setTimeout(r, 260));
    for (const n of this._nodes) { try { n.stop(); } catch { /* already stopped */ } }
    this._nodes = [];
    await ctx.close();
    this.ctx = null;
  }
}
