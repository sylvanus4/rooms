/* =============================================================================
   Grandma's Summer - synthesis engine.

   Everything you hear is built here out of oscillators, noise written into
   AudioBuffers, biquad filters, LFOs and scheduled envelopes. There is not a
   single recorded sample in this project, which is both a licensing decision
   and the interesting part of the build. The one thing that is a file is the
   music layer at the bottom of this file: three generated tracks, no licensed
   commercial recording anywhere near them.

   Signal flow, top level:

       cicadaNear ─┐
       cicadaFar  ─┤
       fan        ─┤            ┌── dry ────────────────┐
       chime      ─┼── bus gain ┤                       ├── sum ── highpass
       birds      ─┤            └── send ── convolver ──┘         └─ compressor
       night      ─┤                        (procedural IR)          └─ master
       tv         ─┤                                                    └─ out
       rain       ─┤
       air        ─┘

   Every bus gain is a continuous function of the time of day, so scrubbing the
   sun crossfades the whole mix instead of switching between presets.
   ========================================================================== */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

import { RoomMusic, SLOT_MEDIUM } from "./room-music.js";

/* smooth 0..1 ramp between two hours */
function ramp(h, a, b) {
  if (a === b) return h >= b ? 1 : 0;
  const x = clamp((h - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}
/* a window that rises over [a,b] and falls over [c,d] */
function windowed(h, a, b, c, d) {
  return ramp(h, a, b) * (1 - ramp(h, c, d));
}

/* -------------------------------------------------------------------------- */
/* density curves: the entire mix as a function of the hour of day            */
/* -------------------------------------------------------------------------- */

/**
 * Three tracks, and the time of day decides which one is in the air.
 *
 * Nothing in a 1996 farmhouse yard was playing music, so these do not come out
 * of a radio — inventing a device to justify a score would be a lie. They use
 * the `remembered` medium instead: nearly flat, a little soft on top the way
 * remembered sound is, and pushed deep into the yard's own reverb so they sit
 * in the air rather than in front of you.
 *
 * The windows are built the same way every other bus in this file is, with
 * plateaus and overlapping ramps, because this room's whole mechanic is that
 * everything morphs. Scrub slowly across 17:00 and you are hearing both.
 */
const MUSIC_SLOTS = ['noon', 'dusk', 'night'];
/* Kept low: it is a memory of music, not a radio someone switched on. */
const MUSIC_TOP = 0.30;

export function musicWeights(hour) {
  const h = hour;
  return {
    noon: windowed(h, 0, 5, 15.5, 18.5),
    dusk: windowed(h, 15.5, 18.5, 20.4, 22.2),
    night: windowed(h, 20.4, 22.2, 26, 27),
  };
}

export function densities(hour) {
  const h = hour;
  /* 말매미 style: the flat wall of sound, peaks in the early afternoon */
  const cicadaA = windowed(h, 8.4, 12.4, 16.4, 19.6) * (0.55 + 0.45 * windowed(h, 11, 13.6, 15.2, 18.4));
  /* 참매미 style: starts earlier, hangs on later into the amber light */
  const cicadaB = windowed(h, 7.2, 10.2, 17.4, 20.1) * (0.5 + 0.5 * windowed(h, 9.5, 12, 16, 19));
  return {
    cicadaA: clamp(cicadaA, 0, 1),
    cicadaB: clamp(cicadaB, 0, 1),
    cicada: clamp(Math.max(cicadaA, cicadaB), 0, 1),
    birds: windowed(h, 4.6, 5.4, 7.6, 9.8) * 0.95 + windowed(h, 18.2, 18.9, 19.4, 19.9) * 0.25,
    night: windowed(h, 18.6, 21.4, 26, 27),
    frogs: windowed(h, 19.3, 21.2, 26, 27),
    tv: windowed(h, 18.7, 19.9, 22.4, 23.9) * 0.9,
    chime: 0.45 + 0.55 * windowed(h, 10, 14, 18.5, 21.5),
    air: 1
  };
}

/* -------------------------------------------------------------------------- */

class SummerAudio {
  constructor() {
    this.ctx = null;
    this.running = false;
    this.hour = 14.16;
    this.fanOn = true;
    this.rainLevel = 0;
    this.rainUntil = 0;
    this.gust = 0;
    this.cicadas = [];
    this.crickets = [];
    this.oneShots = [];       /* end times of live one shot voices */
    this._timer = null;
    this.musicReady = false;
  }

  /* Reserve a slot for a one shot voice. Expired entries are pruned on every
     call, so the budget can never leak and silence the chime for good. */
  _slot(endsAt) {
    const now = this.ctx.currentTime;
    if (this.oneShots.length) this.oneShots = this.oneShots.filter((t) => t > now);
    if (this.oneShots.length > 26) return false;
    this.oneShots.push(endsAt);
    return true;
  }

  /* ---- lifecycle --------------------------------------------------------- */

  async start() {
    if (this.running) return true;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    /* reuse a context that was created but refused to start, otherwise a
       second press would leak a suspended context every time */
    if (!this.ctx) this.ctx = new Ctor({ latencyHint: "interactive" });
    try { await this.ctx.resume(); } catch (e) { /* fall through to the check */ }
    if (this.ctx.state !== "running") return false;

    this._buildBuffers();
    this._buildMaster();
    this._buildAir();
    this._buildFan();
    this._buildCicadas();
    this._buildCrickets();
    this._buildTv();
    this._buildRain();
    this._buildMusic();

    this.running = true;
    this.setTime(this.hour, true);
    this._timer = setInterval(() => this._tick(), 170);
    return true;
  }

  /* ---- noise sources ----------------------------------------------------- */

  _buildBuffers() {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;

    /* white: the raw material for cicadas, rain and the fan hiss */
    this.white = ctx.createBuffer(2, sr * 3, sr);
    for (let c = 0; c < 2; c++) {
      const d = this.white.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }

    /* brown: integrated white with a leak, for the fan body and the air bed */
    this.brown = ctx.createBuffer(2, sr * 4, sr);
    for (let c = 0; c < 2; c++) {
      const d = this.brown.getChannelData(c);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.019 * w) / 1.019;
        d[i] = last * 3.2;
      }
    }

    /* the reverb: a procedurally generated impulse response.
       Short and diffuse, the way a yard under wide eaves actually sounds.
       Early reflections first, then an exponential noise tail, mildly
       lowpassed by averaging neighbours so it does not sound like static. */
    const len = Math.floor(sr * 1.25);
    const ir = ctx.createBuffer(2, len, sr);
    const preDelay = Math.floor(sr * 0.011);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let prev = 0;
      for (let i = 0; i < len; i++) {
        if (i < preDelay) { d[i] = 0; continue; }
        const t = (i - preDelay) / (len - preDelay);
        const decay = Math.pow(1 - t, 2.6);
        let s = (Math.random() * 2 - 1) * decay;
        /* three early reflections off the wall and the floorboards */
        if (i === preDelay + ((sr * 0.017) | 0)) s += 0.5 * (c ? -1 : 1);
        if (i === preDelay + ((sr * 0.029) | 0)) s -= 0.34;
        if (i === preDelay + ((sr * 0.046) | 0)) s += 0.24 * (c ? 1 : -1);
        prev = prev * 0.42 + s * 0.58;
        d[i] = prev;
      }
    }
    this.ir = ir;
  }

  _src(buffer, rate) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = rate || 1;
    return s;
  }

  _gain(v) { const g = this.ctx.createGain(); g.gain.value = v; return g; }

  _filter(type, freq, q) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    return f;
  }

  /* ---- master chain ------------------------------------------------------ */

  _buildMaster() {
    const ctx = this.ctx;
    this.master = this._gain(0.72);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 16;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.22;
    this.hp = this._filter("highpass", 42, 0.7);
    this.sum = this._gain(1);

    /* the compressor has no makeup gain of its own, so the mix would otherwise
       sit about 8 dB below where it wants to be */
    this.makeup = this._gain(1.5);

    this.sum.connect(this.hp);
    this.hp.connect(this.comp);
    this.comp.connect(this.makeup);
    this.makeup.connect(this.master);
    this.master.connect(ctx.destination);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.ir;
    this.verbOut = this._gain(0.9);
    this.verb.connect(this.verbOut);
    this.verbOut.connect(this.sum);

    this.buses = {};
    const make = (name, level, send) => {
      const g = this._gain(level);
      const s = this._gain(send);
      g.connect(this.sum);
      g.connect(s);
      s.connect(this.verb);
      this.buses[name] = g;
      return g;
    };
    make("cicadaNear", 0, 0.16);
    make("cicadaFar", 0, 0.42);
    make("fan", 0.52, 0.07);
    make("chime", 0.6, 0.5);
    make("birds", 0, 0.44);
    make("night", 0, 0.3);
    make("tv", 0, 0.34);
    make("rain", 0, 0.22);
    make("air", 0.3, 0.2);

    /* cicadas pass through one extra gain so a shower can duck them */
    this.duck = this._gain(1);
    this.duck.connect(this.buses.cicadaNear);
    this.duckFar = this._gain(1);
    this.duckFar.connect(this.buses.cicadaFar);
  }

  /* ---- the air in the room ---------------------------------------------- */

  _buildAir() {
    const s = this._src(this.brown, 0.7);
    const lp = this._filter("lowpass", 340, 0.6);
    const g = this._gain(0.13);
    s.connect(lp); lp.connect(g); g.connect(this.buses.air);
    s.start();
  }

  /* ---- 선풍기 ------------------------------------------------------------
     Brown noise through a bandpass is the body of the airflow, a touch of
     highpassed white is the hiss at the grill, a triangle at the blade passing
     frequency (3 blades x ~20 rev/s) is the tone you actually hum along to,
     and a quiet 120 Hz sine is the motor. A 0.055 Hz LFO drives the pan, the
     bandpass and the level together, which is the head turning away and back.
  ------------------------------------------------------------------------- */

  _buildFan() {
    const ctx = this.ctx;
    const body = this._src(this.brown, 1);
    this.fanBp = this._filter("bandpass", 430, 0.85);
    const bodyG = this._gain(0.9);

    const hissSrc = this._src(this.white, 1);
    const hissHp = this._filter("highpass", 2400, 0.6);
    const hissG = this._gain(0.05);

    const blade = ctx.createOscillator();
    blade.type = "triangle";
    blade.frequency.value = 61;
    const bladeLp = this._filter("lowpass", 260, 0.9);
    const bladeG = this._gain(0.055);

    const blade2 = ctx.createOscillator();
    blade2.type = "sine";
    blade2.frequency.value = 122;
    const blade2G = this._gain(0.022);

    const motor = ctx.createOscillator();
    motor.type = "sine";
    motor.frequency.value = 120;
    const motorG = this._gain(0.014);

    this.fanSum = this._gain(0.8);
    this.fanPan = ctx.createStereoPanner();
    this.fanEnv = this._gain(1);

    body.connect(this.fanBp); this.fanBp.connect(bodyG); bodyG.connect(this.fanSum);
    hissSrc.connect(hissHp); hissHp.connect(hissG); hissG.connect(this.fanSum);
    blade.connect(bladeLp); bladeLp.connect(bladeG); bladeG.connect(this.fanSum);
    blade2.connect(blade2G); blade2G.connect(this.fanSum);
    motor.connect(motorG); motorG.connect(this.fanSum);
    this.fanSum.connect(this.fanPan);
    this.fanPan.connect(this.fanEnv);
    this.fanEnv.connect(this.buses.fan);

    /* the head sweep */
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.055;
    const panDepth = this._gain(0.78);
    const filtDepth = this._gain(150);
    const lvlDepth = this._gain(0.16);
    lfo.connect(panDepth); panDepth.connect(this.fanPan.pan);
    lfo.connect(filtDepth); filtDepth.connect(this.fanBp.frequency);
    lfo.connect(lvlDepth); lvlDepth.connect(this.fanSum.gain);

    [body, hissSrc, blade, blade2, motor, lfo].forEach((n) => n.start());
  }

  /* ---- 매미 --------------------------------------------------------------
     One cicada is white noise squeezed through two cascaded bandpasses so only
     a narrow band around 3.5 to 6 kHz survives, then amplitude modulated by a
     sine in the tens of hertz. That AM is what makes it buzz rather than hiss.
     A slow attack, a wobbling sustain and a ragged multi step release make one
     call. Sixteen of these with jittered centre frequencies, jittered AM rates,
     random stereo positions and independent call timing read as a chorus.
     Half of them sit on a darker, wetter bus so the yard has depth.
  ------------------------------------------------------------------------- */

  _makeCicada(spec, far) {
    const ctx = this.ctx;
    const f0 = rnd(spec.f[0], spec.f[1]);
    const src = this._src(this.white, rnd(0.85, 1.18));
    const bp1 = this._filter("bandpass", f0, rnd(11, 18));
    const bp2 = this._filter("bandpass", f0 * rnd(0.99, 1.01), rnd(7, 12));
    const am = this._gain(0.42);
    const env = this._gain(0.0001);
    const pan = ctx.createStereoPanner();
    pan.pan.value = rnd(-0.95, 0.95);

    const amOsc = ctx.createOscillator();
    amOsc.type = "sine";
    const rate = rnd(spec.am[0], spec.am[1]);
    amOsc.frequency.value = rate;
    const amDepth = this._gain(0.5);
    amOsc.connect(amDepth);
    amDepth.connect(am.gain);

    /* a second, slower wobble on the filter keeps it from sounding synthetic */
    const wob = ctx.createOscillator();
    wob.type = "sine";
    wob.frequency.value = rnd(0.6, 2.4);
    const wobDepth = this._gain(f0 * 0.035);
    wob.connect(wobDepth);
    wobDepth.connect(bp1.frequency);

    src.connect(bp1); bp1.connect(bp2); bp2.connect(am);
    am.connect(env); env.connect(pan);

    if (far) {
      const shelf = this._filter("highshelf", 4200, null);
      shelf.gain.value = -9;
      pan.connect(shelf);
      shelf.connect(this.duckFar);
    } else {
      pan.connect(this.duck);
    }

    src.start(); amOsc.start(); wob.start();
    return {
      env, amOsc, rate, spec, far,
      peak: (far ? 0.15 : 0.24) * rnd(0.75, 1.25),
      next: this.ctx.currentTime + rnd(0, 7)
    };
  }

  _buildCicadas() {
    /* 말매미: low centre, fast buzz, very long calls. the wall of sound. */
    const A = { key: "cicadaA", f: [3500, 4100], am: [52, 64], atk: [1.1, 2.2], sus: [4.5, 11], rel: [1.8, 3.4] };
    /* 참매미: brighter, slower pulse, shorter calls with a falling tail. */
    const B = { key: "cicadaB", f: [4900, 5900], am: [30, 40], atk: [0.7, 1.4], sus: [2.6, 5.2], rel: [1.4, 2.6] };
    for (let i = 0; i < 5; i++) this.cicadas.push(this._makeCicada(A, false));
    for (let i = 0; i < 4; i++) this.cicadas.push(this._makeCicada(A, true));
    for (let i = 0; i < 4; i++) this.cicadas.push(this._makeCicada(B, false));
    for (let i = 0; i < 3; i++) this.cicadas.push(this._makeCicada(B, true));
  }

  _cicadaCall(v, t0) {
    const g = v.env.gain;
    const s = v.spec;
    const A = rnd(s.atk[0], s.atk[1]);
    const S = rnd(s.sus[0], s.sus[1]);
    const R = rnd(s.rel[0], s.rel[1]);
    const p = v.peak;

    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(p, t0 + A);

    /* the sustain is never flat, a real cicada surges */
    let t = t0 + A;
    const steps = Math.max(2, Math.round(S / 0.85));
    for (let i = 1; i <= steps; i++) {
      t = t0 + A + (S * i) / steps;
      g.linearRampToValueAtTime(p * rnd(0.74, 1.06), t);
    }

    /* ragged release: it stumbles down rather than fading politely */
    g.linearRampToValueAtTime(p * 0.55, t + R * 0.3);
    g.linearRampToValueAtTime(p * 0.68, t + R * 0.44);
    g.linearRampToValueAtTime(p * 0.24, t + R * 0.72);
    g.linearRampToValueAtTime(p * 0.31, t + R * 0.82);
    g.exponentialRampToValueAtTime(0.0001, t + R);

    /* the buzz speeds up into the call and drops away at the end */
    const f = v.amOsc.frequency;
    f.cancelScheduledValues(t0);
    f.setValueAtTime(v.rate * 0.8, t0);
    f.linearRampToValueAtTime(v.rate, t0 + A * 0.9);
    f.setValueAtTime(v.rate, t);
    f.linearRampToValueAtTime(v.rate * 0.7, t + R);

    v.next = t + R + rnd(0.5, 5.5);
  }

  /* ---- 풀벌레: crickets are a pulsed narrowband trill --------------------- */

  _buildCrickets() {
    const ctx = this.ctx;
    for (let i = 0; i < 7; i++) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = rnd(4150, 5100);
      const bp = this._filter("bandpass", osc.frequency.value, 14);
      const am = this._gain(0.45);
      const env = this._gain(0.0001);
      const pan = ctx.createStereoPanner();
      pan.pan.value = rnd(-0.9, 0.9);

      const pulse = ctx.createOscillator();
      pulse.type = "sine";
      pulse.frequency.value = rnd(21, 32);
      const pDepth = this._gain(0.5);
      pulse.connect(pDepth); pDepth.connect(am.gain);

      osc.connect(bp); bp.connect(am); am.connect(env);
      env.connect(pan); pan.connect(this.buses.night);
      osc.start(); pulse.start();
      this.crickets.push({ env, next: ctx.currentTime + rnd(0, 3), peak: rnd(0.09, 0.15) });
    }
  }

  _cricketTrill(v, t0) {
    const g = v.env.gain;
    g.cancelScheduledValues(t0);
    let t = t0;
    const n = 2 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(v.peak, t + 0.03);
      g.setValueAtTime(v.peak, t + 0.19);
      g.linearRampToValueAtTime(0.0001, t + 0.25);
      t += 0.25 + rnd(0.14, 0.4);
    }
    v.next = t + rnd(0.6, 3.4);
  }

  /* ---- 풍경: struck metal, inharmonic partials --------------------------- */

  _chime(t0, level) {
    if (!this._slot(t0 + 3.1)) return;
    const ctx = this.ctx;
    const base = pick([784, 880, 988, 1175, 1319, 1568]) * rnd(0.995, 1.005);
    const ratios = [1, 2.76, 5.41, 8.93];
    const amps = [1, 0.55, 0.3, 0.17];
    const decays = [2.9, 1.7, 1.05, 0.66];
    const pan = ctx.createStereoPanner();
    pan.pan.value = rnd(-0.5, 0.5);
    pan.connect(this.buses.chime);

    /* the tick of the clapper before the tone blooms */
    const tick = this.ctx.createBufferSource();
    tick.buffer = this.white;
    const tickBp = this._filter("bandpass", base * 3, 2.5);
    const tickG = this._gain(0.0001);
    tick.connect(tickBp); tickBp.connect(tickG); tickG.connect(pan);
    tickG.gain.setValueAtTime(0.09 * level, t0);
    tickG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
    tick.start(t0);
    tick.stop(t0 + 0.08);

    let done = 0;
    for (let i = 0; i < ratios.length; i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = base * ratios[i] * rnd(0.998, 1.002);
      const g = this._gain(0.0001);
      o.connect(g); g.connect(pan);
      const peak = 0.13 * amps[i] * level;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + decays[i]);
      o.start(t0);
      o.stop(t0 + decays[i] + 0.05);
      o.onended = () => {
        g.disconnect();
        if (++done === ratios.length) pan.disconnect();
      };
    }
  }

  /* ---- birds: a few quick swept notes ------------------------------------ */

  _bird(t0) {
    if (!this._slot(t0 + 1.4)) return;
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner();
    pan.pan.value = rnd(-0.85, 0.85);
    const bp = this._filter("bandpass", 3000, 2.2);
    const out = this._gain(rnd(0.09, 0.16));
    bp.connect(out); out.connect(pan); pan.connect(this.buses.birds);

    const notes = 2 + ((Math.random() * 4) | 0);
    const o = ctx.createOscillator();
    o.type = Math.random() < 0.5 ? "sine" : "triangle";
    const g = this._gain(0.0001);
    o.connect(g); g.connect(bp);
    let t = t0;
    const f0 = rnd(2300, 3900);
    for (let i = 0; i < notes; i++) {
      const dur = rnd(0.045, 0.1);
      const up = Math.random() < 0.6;
      o.frequency.setValueAtTime(f0 * rnd(0.85, 1.15), t);
      o.frequency.linearRampToValueAtTime(f0 * (up ? rnd(1.15, 1.5) : rnd(0.65, 0.85)), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(1, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      t += dur + rnd(0.05, 0.14);
    }
    o.start(t0);
    o.stop(t + 0.1);
    o.onended = () => { g.disconnect(); bp.disconnect(); out.disconnect(); pan.disconnect(); };
  }

  /* ---- frogs: a low buzzing croak ---------------------------------------- */

  _frog(t0) {
    if (!this._slot(t0 + 1.4)) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const f = rnd(148, 240);
    o.frequency.setValueAtTime(f, t0);
    o.frequency.linearRampToValueAtTime(f * 0.92, t0 + 0.4);
    const form = this._filter("bandpass", rnd(420, 700), 5);
    const am = this._gain(0.5);
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = rnd(13, 22);
    const ld = this._gain(0.5);
    lfo.connect(ld); ld.connect(am.gain);
    const env = this._gain(0.0001);
    const pan = ctx.createStereoPanner();
    pan.pan.value = rnd(-0.8, 0.8);
    o.connect(form); form.connect(am); am.connect(env); env.connect(pan);
    pan.connect(this.buses.night);

    let t = t0;
    const croaks = 1 + ((Math.random() * 3) | 0);
    const peak = rnd(0.09, 0.16);
    for (let i = 0; i < croaks; i++) {
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(peak, t + 0.03);
      env.gain.setValueAtTime(peak, t + 0.16);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      t += 0.26 + rnd(0.06, 0.2);
    }
    o.start(t0); lfo.start(t0);
    o.stop(t + 0.1); lfo.stop(t + 0.1);
    o.onended = () => { form.disconnect(); am.disconnect(); env.disconnect(); pan.disconnect(); ld.disconnect(); };
  }

  /* ---- the TV in the other room -----------------------------------------
     Band limited noise with a speech shaped envelope. Syllables of 90 to
     160 ms grouped into phrases, then a pause. Nothing is intelligible, which
     is exactly right: through a wall you only ever hear the rhythm.
  ------------------------------------------------------------------------- */

  _buildTv() {
    const src = this._src(this.white, 1);
    const bp = this._filter("bandpass", 900, 0.8);
    const wall = this._filter("lowpass", 1500, 0.9);
    this.tvEnv = this._gain(0.0001);
    this.tvFormant = this._filter("bandpass", 700, 3);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = 0.6;
    src.connect(bp); bp.connect(this.tvFormant); this.tvFormant.connect(wall);
    wall.connect(this.tvEnv); this.tvEnv.connect(pan); pan.connect(this.buses.tv);
    src.start();
    this.tvNext = 0;
  }

  _tvPhrase(t0) {
    const g = this.tvEnv.gain;
    const f = this.tvFormant.frequency;
    let t = t0;
    const n = 3 + ((Math.random() * 7) | 0);
    for (let i = 0; i < n; i++) {
      const d = rnd(0.09, 0.17);
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(rnd(0.3, 1), t + 0.025);
      g.setValueAtTime(rnd(0.25, 0.9), t + d * 0.7);
      g.linearRampToValueAtTime(0.0001, t + d);
      f.setValueAtTime(rnd(430, 1500), t);
      t += d + rnd(0.035, 0.075);
    }
    this.tvNext = t + rnd(0.35, 1.9);
  }

  /* ---- the shower -------------------------------------------------------- */

  _buildRain() {
    const body = this._src(this.white, 1);
    const lp = this._filter("lowpass", 1700, 0.8);
    const bodyG = this._gain(0.5);
    const leaves = this._src(this.white, 0.93);
    const hp = this._filter("highpass", 3600, 0.7);
    const leafG = this._gain(0.2);
    this.rainEnv = this._gain(0.0001);
    body.connect(lp); lp.connect(bodyG); bodyG.connect(this.rainEnv);
    leaves.connect(hp); hp.connect(leafG); leafG.connect(this.rainEnv);
    this.rainEnv.connect(this.buses.rain);
    this.rainLp = lp;
    body.start(); leaves.start();
  }

  /** Kick off an afternoon shower. Returns its duration in seconds. */
  shower(seconds) {
    if (!this.running) return 0;
    const dur = seconds || 46;
    const now = this.ctx.currentTime;
    const g = this.rainEnv.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(g.value, 0.0001), now);
    g.linearRampToValueAtTime(0.9, now + 5.5);
    g.setValueAtTime(0.9, now + dur - 11);
    g.linearRampToValueAtTime(0.0001, now + dur);
    this.rainUntil = now + dur;
    this.buses.rain.gain.setTargetAtTime(0.5, now, 0.5);
    return dur;
  }

  stopShower() {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    const g = this.rainEnv.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(g.value, 0.0001), now);
    g.linearRampToValueAtTime(0.0001, now + 3);
    this.rainUntil = now + 3;
  }

  /** 0 while dry, 1 at the height of the shower. Drives the visuals too. */
  get rainAmount() {
    if (!this.running) return 0;
    return clamp(this.rainEnv.gain.value / 0.9, 0, 1);
  }

  /* ---- public controls --------------------------------------------------- */

  /* ---- the music in the air ---------------------------------------------
     Into `sum` and into the same convolver every other bus uses, so the yard
     is around the music rather than behind it.                              */
  _buildMusic() {
    this.music = {};
    for (const slot of MUSIC_SLOTS) {
      this.music[slot] = new RoomMusic(this.ctx, {
        profile: SLOT_MEDIUM[`grandmas-summer__${slot}`],
        destination: this.sum,
        reverbSend: this.verb,
      });
    }
    Promise.all(MUSIC_SLOTS.map((slot) => this.music[slot]
      .load(`assets/audio/${slot}.mp3`)
      .catch(() => { this.music[slot] = null; })))
      .then(() => { this.musicReady = true; this._applyMusic(2.6); });
  }

  _applyMusic(fade = 1.6) {
    if (!this.musicReady) return;
    const w = musicWeights(this.hour);
    for (const slot of MUSIC_SLOTS) {
      const m = this.music[slot];
      if (!m) continue;
      const g = w[slot] * MUSIC_TOP;
      if (g > 0.004) {
        clearTimeout(m._pauseTimer);   /* a stop in flight would pause mid fade */
        m.play({ level: g, fade });
      } else if (m.playing) {
        m.stop({ fade });
      }
    }
  }

  setTime(hour, immediate) {
    this.hour = hour;
    if (!this.running) return;
    this._applyMusic(immediate ? 0.6 : 1.6);
    const d = densities(hour);
    const now = this.ctx.currentTime;
    const tc = immediate ? 0.01 : 0.28;
    const set = (bus, v) => this.buses[bus].gain.setTargetAtTime(clamp(v, 0, 2), now, tc);

    /* the cicada bus level is deliberately non linear: density also decides
       how many voices are calling, so the gain curve only fills in the rest */
    set("cicadaNear", 1.05 * Math.pow(d.cicada, 0.7));
    set("cicadaFar", 0.95 * Math.pow(d.cicada, 0.55));
    set("birds", 1.0 * d.birds);
    set("night", 1.05 * d.night);
    set("tv", 0.6 * d.tv);
    set("chime", 0.42 + 0.3 * d.chime);
    set("air", 0.2 + 0.14 * (1 - d.cicada));
    this.densityCache = d;
  }

  setFan(on) {
    this.fanOn = on;
    if (!this.running) return;
    this.fanEnv.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.35);
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (!this.running) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.06);
  }

  setMuted(m) {
    this.muted = m;
    if (!this.running) return;
    this.master.gain.setTargetAtTime(m ? 0 : (this.volume == null ? 0.72 : this.volume), this.ctx.currentTime, 0.06);
  }

  /* ---- the scheduler ----------------------------------------------------- */

  _tick() {
    if (!this.running || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const ahead = now + 0.55;
    const d = this.densityCache || densities(this.hour);
    const rain = this.rainAmount;

    /* cicadas go quiet almost instantly when it starts to rain, then come
       back a little sheepishly once it eases off */
    const duckTarget = 1 - 0.93 * rain;
    this.duck.gain.setTargetAtTime(duckTarget, now, rain > 0.05 ? 0.5 : 2.4);
    this.duckFar.gain.setTargetAtTime(duckTarget, now, rain > 0.05 ? 0.6 : 2.8);

    /* wind, a slow sum of sines, drives the chime */
    const w = now * 0.1;
    this.gust = clamp(
      0.5 + 0.34 * Math.sin(w) + 0.22 * Math.sin(w * 2.31 + 1.7) + 0.14 * Math.sin(w * 4.7 + 0.4),
      0, 1
    );

    /* cicada calls */
    for (const v of this.cicadas) {
      const dens = v.spec.key === "cicadaA" ? d.cicadaA : d.cicadaB;
      while (v.next < ahead) {
        if (dens > 0.03 && Math.random() < 0.35 + 0.65 * dens && rain < 0.35) {
          this._cicadaCall(v, Math.max(v.next, now + 0.03));
        } else {
          v.next = Math.max(v.next, now) + rnd(0.8, 3.5);
        }
      }
    }

    /* crickets */
    for (const v of this.crickets) {
      while (v.next < ahead) {
        if (d.night > 0.04 && Math.random() < 0.4 + 0.6 * d.night) {
          this._cricketTrill(v, Math.max(v.next, now + 0.03));
        } else {
          v.next = Math.max(v.next, now) + rnd(0.6, 2.4);
        }
      }
    }

    /* wind chime, clustered inside gusts */
    const chimeChance = Math.pow(this.gust, 2.6) * (0.3 + 0.7 * d.chime) * 0.5;
    for (let i = 0; i < 2; i++) {
      if (Math.random() < chimeChance) {
        this._chime(now + rnd(0.05, 0.5), 0.4 + 0.6 * this.gust);
      }
    }

    /* birds and frogs */
    if (Math.random() < d.birds * 0.5) this._bird(now + rnd(0.05, 0.5));
    if (Math.random() < d.frogs * 0.45) this._frog(now + rnd(0.05, 0.5));

    /* the television */
    if (d.tv > 0.03) {
      if (this.tvNext < ahead) this._tvPhrase(Math.max(this.tvNext, now + 0.05));
    } else {
      this.tvNext = now + 1;
    }

    /* the rain gets gustier as it goes */
    if (rain > 0.02) {
      this.rainLp.frequency.setTargetAtTime(1300 + 900 * this.gust, now, 0.8);
    }
    if (this.rainUntil && now > this.rainUntil + 0.5) {
      this.rainUntil = 0;
      this.buses.rain.gain.setTargetAtTime(0, now, 1);
    }
  }
}

export const audio = new SummerAudio();
