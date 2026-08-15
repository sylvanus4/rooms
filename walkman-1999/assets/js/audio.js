/* =============================================================================
   walkman-1999 - synthesis engine

   There is no audio file in this project. Every sound is built here from
   oscillators, noise written into AudioBuffers, biquad filters, delay lines,
   LFOs and scheduled envelopes. That is a licensing decision first and the
   interesting part of the build second.

   Signal flow, top level:

       piano  ─┐
       pad    ─┤                       ┌─ hiss ─────────┐
       guitar ─┼─ musicSum ─ flutter ─ dull ─ dolby ─┐  │
       bass   ─┤              (delay)                ├──┴─ dropout ─ crease ─┐
       drums  ─┤                                     │                       │
       voice  ─┘                                     │                       │
                                                                             │
       transport (motor, keys, door) ────────────────────────────────┐       │
       street (steps, traffic, zipper, buzzer) ──────────────────────┤       │
                                                                     │       │
                                    ┌── dry ──────────────────────┐  │       │
                          bus gain ─┤                             ├──┴───────┴─ sum
                                    └── send ── convolver ────────┘              │
                                               (procedural IR)                   │
                                                        highpass ─ compressor ─ makeup ─ master ─ out

   The tape section between musicSum and the sum bus is the whole piece. Its
   four parameters (flutter depth, hiss level, top-end cutoff, dropout rate)
   are functions of how much the visitor has worn the tape at the position the
   head is currently reading. Wear is cumulative and never recovers.
   ========================================================================== */

export const SEGMENTS = 16;      /* the tape is modelled as 16 worn regions */
const BARS = 64;                 /* per side */
const BARS_PER_SEG = BARS / SEGMENTS;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
/* midi 61 is C#4. Everything pitched in this file is derived from this. */
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* ---- the song ------------------------------------------------------------
   Side A is a 68 BPM ballad in C# minor, side B a 124 BPM dance-pop track in
   the same key, so the two sides and the room agree. Chords are written as
   [root midi, quality]; the bar table is expanded from section patterns.
------------------------------------------------------------------------- */

const TRIAD = { m: [0, 3, 7], M: [0, 4, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11] };
const chordNotes = (c, oct) => TRIAD[c[1]].map((i) => c[0] + i + 12 * (oct || 0));

const Cs = 49, A = 45, E = 52, B = 47, Fs = 42, Gs = 44;   /* octave 3 roots */

const VERSE_A = [[Cs, "m"], [A, "M"], [E, "M"], [B, "M"]];
const PRE_A = [[A, "M"], [B, "M"], [Gs, "M"], [Cs, "m"]];
const CHORUS_A = [[Cs, "m"], [A, "M"], [Fs, "m"], [Gs, "M"]];

/* section per segment index, side A */
const PLAN_A = ["intro", "intro", "verse", "verse", "verse", "verse", "pre", "pre",
  "chorus", "chorus", "chorus", "chorus", "verse", "verse", "outro", "outro"];
const PLAN_B = ["intro", "verse", "verse", "verse", "pre", "pre", "chorus", "chorus",
  "chorus", "chorus", "verse", "verse", "pre", "chorus", "chorus", "outro"];

export const PLANS = { A: PLAN_A, B: PLAN_B };

const PROG = {
  A: { intro: VERSE_A, verse: VERSE_A, pre: PRE_A, chorus: CHORUS_A, outro: VERSE_A },
  B: { intro: VERSE_A, verse: VERSE_A, pre: [[A, "M"], [B, "M"], [Cs, "m"], [Cs, "m"]],
       chorus: [[Cs, "m"], [B, "M"], [A, "M"], [Gs, "M"]], outro: VERSE_A },
};

/* the wordless line the chorus is built around, 4 bars, [beat, midi, beats] */
const HOOK = [
  [[0, 68, 1.5], [1.5, 66, 0.5], [2, 64, 2]],
  [[0, 64, 1], [1, 66, 1], [2, 68, 2]],
  [[0, 69, 1.5], [1.5, 68, 0.5], [2, 66, 2]],
  [[0, 64, 1], [1, 63, 1], [2, 61, 2]],
];

/* -------------------------------------------------------------------------- */

class WalkmanAudio {
  constructor() {
    this.ctx = null;
    this.running = false;
    this.mode = "stop";            /* stop | play | rew | ff */
    this.side = "A";
    this.barPos = 0;               /* playhead, in bars, 0..BARS */
    this.wear = { A: new Float32Array(SEGMENTS), B: new Float32Array(SEGMENTS) };
    this.volume = 0.8;
    this.muted = false;
    this.walked = 0;               /* seconds of the route covered */
    this.arrived = false;
    this.onEvent = null;
    this.dropouts = 0;
    this.oneShots = [];
    this._checkUntil = 0;
    this._lastTick = 0;
    this._nextStep = 0;
    this._stepFoot = 0;
    this._nextBus = 0;
    this._nextDrop = 0;
    this._nextCrease = 0;
    this._sagUntil = 0;
    this._sagged = new Set();
  }

  get barDur() { return this.side === "A" ? 60 / 68 * 4 : 60 / 124 * 4; }
  get routeSeconds() { return 168; }

  /* ---- lifecycle --------------------------------------------------------- */

  async start() {
    if (this.running) return true;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    if (!this.ctx) this.ctx = new Ctor({ latencyHint: "interactive" });
    try { await this.ctx.resume(); } catch (e) { /* checked below */ }
    if (this.ctx.state !== "running") return false;

    this._buffers();
    this._master();
    this._tape();
    this._street();
    this.running = true;
    this._lastTick = this.ctx.currentTime;
    this._nextStep = this.ctx.currentTime + 0.4;
    this._nextBus = this.ctx.currentTime + rnd(9, 18);
    this.setVolume(this.volume);
    this._timer = setInterval(() => this._tick(), 60);
    return true;
  }

  _slot(endsAt) {
    const now = this.ctx.currentTime;
    if (this.oneShots.length) this.oneShots = this.oneShots.filter((t) => t > now);
    if (this.oneShots.length > 46) return false;
    this.oneShots.push(endsAt);
    return true;
  }

  _emit(kind, detail) { if (this.onEvent) this.onEvent(kind, detail); }

  /* ---- primitives -------------------------------------------------------- */

  _gain(v) { const g = this.ctx.createGain(); g.gain.value = v; return g; }

  _filter(type, freq, q, gain) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    if (gain != null) f.gain.value = gain;
    return f;
  }

  _src(buf, rate, loop) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop !== false;
    s.playbackRate.value = rate || 1;
    return s;
  }

  _pan(v) { const p = this.ctx.createStereoPanner(); p.pan.value = v; return p; }

  _osc(type, f) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    return o;
  }

  /* a noise grain read from a random offset of the white buffer */
  _grain(t, dur, rate) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.white;
    s.loop = false;
    s.playbackRate.value = rate || 1;
    const off = Math.random() * (this.white.duration - dur - 0.05);
    s.start(t, off, dur + 0.02);
    return s;
  }

  _buffers() {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;

    this.white = ctx.createBuffer(2, sr * 3, sr);
    for (let c = 0; c < 2; c++) {
      const d = this.white.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }

    /* brown noise: integrated white with a leak. Road, motor, bus. */
    this.brown = ctx.createBuffer(2, sr * 4, sr);
    for (let c = 0; c < 2; c++) {
      const d = this.brown.getChannelData(c);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.019 * (Math.random() * 2 - 1)) / 1.019;
        d[i] = last * 3.2;
      }
    }

    /* Procedural impulse response. A street between low buildings: short,
       one clear slap off the wall opposite, almost no tail. Decorrelated
       between channels so it reads as a place rather than a filter. */
    const len = Math.floor(sr * 0.62);
    const ir = ctx.createBuffer(2, len, sr);
    const pre = Math.floor(sr * 0.009);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let prev = 0;
      for (let i = 0; i < len; i++) {
        if (i < pre) { d[i] = 0; continue; }
        const t = (i - pre) / (len - pre);
        let s = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.1);
        if (i === pre + ((sr * 0.021) | 0)) s += 0.52 * (c ? -1 : 1);
        if (i === pre + ((sr * 0.037) | 0)) s -= 0.3;
        if (i === pre + ((sr * 0.058) | 0)) s += 0.19 * (c ? 1 : -1);
        prev = prev * 0.4 + s * 0.6;
        d[i] = prev;
      }
    }
    this.ir = ir;
  }

  /* ---- master ------------------------------------------------------------ */

  _master() {
    const ctx = this.ctx;
    this.sum = this._gain(1);
    this.hp = this._filter("highpass", 34, 0.7);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -13;
    this.comp.knee.value = 14;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.2;
    this.makeup = this._gain(1.55);
    this.master = this._gain(0.8);

    this.sum.connect(this.hp);
    this.hp.connect(this.comp);
    this.comp.connect(this.makeup);
    this.makeup.connect(this.master);
    this.master.connect(ctx.destination);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.ir;
    this.verbOut = this._gain(0.85);
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
    /* earbuds are dry, the street is not. That contrast is what puts the
       music inside your head and the pavement outside it. */
    make("tape", 1, 0.05);
    make("transport", 0.9, 0.08);
    make("street", 0.62, 0.26);
  }

  /* ---- the tape path ----------------------------------------------------- */

  _tape() {
    const ctx = this.ctx;

    this.musicSum = this._gain(0.62);

    /* wow and flutter: a short delay line whose delay time is pushed around by
       three LFOs. 0.42 Hz is the reel eccentricity you hear as wow, 6.3 Hz is
       capstan flutter, 3.1 Hz is the pinch roller. Depth rises with wear. */
    this.flutter = ctx.createDelay(0.4);
    this.flutter.delayTime.value = 0.06;
    this.wowDepth = this._gain(0.00028);
    this.flDepth = this._gain(0.00006);
    this.prDepth = this._gain(0.00004);
    const wow = this._osc("sine", 0.42);
    const fl = this._osc("sine", 6.3);
    const pr = this._osc("sine", 3.1);
    wow.connect(this.wowDepth); this.wowDepth.connect(this.flutter.delayTime);
    fl.connect(this.flDepth); this.flDepth.connect(this.flutter.delayTime);
    pr.connect(this.prDepth); this.prDepth.connect(this.flutter.delayTime);
    [wow, fl, pr].forEach((o) => o.start());

    /* oxide loss: the top end goes first and never comes back */
    this.dull = this._filter("lowpass", 12500, 0.6);
    /* a Dolby B decoder expects an encoded tape. As the highs sag the decoder
       over-corrects downward, which is why worn tapes sound muffled rather
       than merely quiet. Modelled as a high shelf that dips with wear. */
    this.dolby = this._filter("highshelf", 4200, null, -1.5);

    this.dropGain = this._gain(1);
    this.creaseGain = this._gain(1);

    /* hiss lives on the tape, so it passes the dropout and crease stages too */
    this.hissGain = this._gain(0.0001);
    const hs = this._src(this.white, 1);
    const hhp = this._filter("highpass", 1900, 0.6);
    const htilt = this._filter("highshelf", 7000, null, 5);
    hs.connect(hhp); hhp.connect(htilt); htilt.connect(this.hissGain);
    hs.start();

    this.musicSum.connect(this.flutter);
    this.flutter.connect(this.dull);
    this.dull.connect(this.dolby);
    this.dolby.connect(this.dropGain);
    this.hissGain.connect(this.dropGain);
    this.dropGain.connect(this.creaseGain);
    this.creaseGain.connect(this.buses.tape);

    /* instrument sub buses, so the mix has a shape before the tape eats it */
    this.inst = {};
    for (const [n, v] of [["piano", 0.5], ["pad", 0.34], ["gtr", 0.3], ["bass", 0.62],
      ["drum", 0.5], ["voice", 0.28]]) {
      const g = this._gain(v);
      g.connect(this.musicSum);
      this.inst[n] = g;
    }

    /* one shared chorus on the pad and guitar, the way a cheap rack unit sat
       across a whole late-90s mix */
    this.chorusIn = this._gain(1);
    this.chorusOut = this._gain(0.34);
    for (const [ms, rate, depth, pan] of [[0.018, 0.23, 0.0022, -0.5], [0.027, 0.31, 0.0018, 0.5]]) {
      const d = ctx.createDelay(0.1);
      d.delayTime.value = ms;
      const lfo = this._osc("sine", rate);
      const dep = this._gain(depth);
      lfo.connect(dep); dep.connect(d.delayTime); lfo.start();
      const p = this._pan(pan);
      this.chorusIn.connect(d); d.connect(p); p.connect(this.chorusOut);
    }
    this.chorusOut.connect(this.musicSum);
  }

  /* ---- the street -------------------------------------------------------- */

  _street() {
    const ctx = this.ctx;
    this.walkGain = this._gain(1);
    this.walkGain.connect(this.buses.street);

    /* road: brown noise through a low shelf, plus a resonance where a road
       actually sits, plus a slow level drift so it never sits still */
    this.trafficGain = this._gain(0.42);
    const road = this._src(this.brown, 0.85);
    const rlp = this._filter("lowpass", 420, 0.8);
    const rres = this._filter("peaking", 96, 1.2, 7);
    road.connect(rlp); rlp.connect(rres); rres.connect(this.trafficGain);
    this.trafficGain.connect(this.walkGain);
    const drift = this._osc("sine", 0.037);
    const dd = this._gain(0.12);
    drift.connect(dd); dd.connect(this.trafficGain.gain);
    road.start(); drift.start();

    this.stepGain = this._gain(1);
    this.stepGain.connect(this.walkGain);
  }

  /* ---- instruments ------------------------------------------------------- */

  /* Piano: four slightly stretched partials plus a hammer tick. Real strings
     are inharmonic, and that stretch is most of what stops this reading as an
     electric piano. */
  _piano(t, m, vel, dur) {
    if (!this._slot(t + dur + 0.2)) return;
    const f = hz(m);
    const pan = this._pan(clamp((m - 61) / 34, -0.5, 0.5) * 0.6);
    pan.connect(this.inst.piano);
    const ratios = [1, 2.003, 3.011, 4.026, 5.05];
    const amps = [1, 0.42, 0.19, 0.085, 0.04];
    let done = 0;
    for (let i = 0; i < ratios.length; i++) {
      const o = this._osc("sine", f * ratios[i]);
      const g = this._gain(0.0001);
      o.connect(g); g.connect(pan);
      const p = 0.2 * amps[i] * vel;
      const d = dur * (1 - i * 0.13);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(p, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.12, d));
      o.start(t); o.stop(t + Math.max(0.14, d) + 0.03);
      o.onended = () => { g.disconnect(); if (++done === ratios.length) pan.disconnect(); };
    }
    const tick = this._grain(t, 0.02, 1);
    const tb = this._filter("bandpass", 2400, 1.1);
    const tg = this._gain(0.05 * vel);
    tick.connect(tb); tb.connect(tg); tg.connect(pan);
    tg.gain.setValueAtTime(0.05 * vel, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  }

  /* Clean electric guitar. A feedback delay line would be the textbook pluck,
     but Web Audio quantises any cycle to a 128 sample block, which puts the
     pitch of a short loop wrong. Two detuned saws through a falling lowpass
     with a pick transient gets the same job done and stays in tune. */
  _pluck(t, m, vel, dur) {
    if (!this._slot(t + dur + 0.2)) return;
    const f = hz(m);
    const pan = this._pan(rnd(-0.42, 0.42));
    const lp = this._filter("lowpass", 3400, 3.2);
    const amp = this._gain(0.0001);
    lp.connect(amp); amp.connect(pan);
    pan.connect(this.inst.gtr);
    pan.connect(this.chorusIn);

    const oscs = [];
    for (const det of [-5, 5]) {
      const o = this._osc("sawtooth", f * Math.pow(2, det / 1200));
      const g = this._gain(0.5);
      o.connect(g); g.connect(lp);
      oscs.push([o, g]);
    }
    lp.frequency.setValueAtTime(3600, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + Math.min(1.4, dur));
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.16 * vel, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const pk = this._grain(t, 0.016, 1);
    const pb = this._filter("bandpass", 2800, 2);
    const pg = this._gain(0.06 * vel);
    pk.connect(pb); pb.connect(pg); pg.connect(pan);
    pg.gain.setValueAtTime(0.06 * vel, t);
    pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);

    let done = 0;
    for (const [o] of oscs) {
      o.start(t); o.stop(t + dur + 0.05);
      o.onended = () => { if (++done === 2) { lp.disconnect(); amp.disconnect(); pan.disconnect(); } };
    }
  }

  /* Synth string pad: two saws per note, seven cents apart, opening slowly */
  _pad(t, notes, dur) {
    if (!this._slot(t + dur + 0.6)) return;
    const lp = this._filter("lowpass", 1300, 0.9);
    const amp = this._gain(0.0001);
    const pan = this._pan(0);
    lp.connect(amp); amp.connect(pan);
    pan.connect(this.inst.pad);
    pan.connect(this.chorusIn);
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(2500, t + dur * 0.55);
    lp.frequency.linearRampToValueAtTime(1400, t + dur);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.11, t + Math.min(0.9, dur * 0.35));
    amp.gain.setValueAtTime(0.11, t + dur * 0.8);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);

    const oscs = [];
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = this._osc("sawtooth", hz(n) * Math.pow(2, det / 1200));
        const g = this._gain(0.5 / notes.length);
        o.connect(g); g.connect(lp);
        oscs.push(o);
      }
    }
    let done = 0;
    for (const o of oscs) {
      o.start(t); o.stop(t + dur + 0.5);
      o.onended = () => { if (++done === oscs.length) { lp.disconnect(); amp.disconnect(); pan.disconnect(); } };
    }
  }

  /* A wordless voice: a saw through three formant bandpasses tuned to an open
     vowel, doubled an octave up and delayed a few milliseconds so it reads as
     two takes rather than one oscillator. No words, deliberately. */
  _voice(t, m, dur) {
    if (!this._slot(t + dur + 0.5)) return;
    const out = this._gain(0.0001);
    const pan = this._pan(rnd(-0.14, 0.14));
    out.connect(pan);
    pan.connect(this.inst.voice);
    pan.connect(this.chorusIn);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.2, t + 0.22);
    out.gain.setValueAtTime(0.2, t + dur * 0.75);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);

    const layers = [[0, 1, 0], [12, 0.42, 0.014]];
    const nodes = [];
    for (const [semi, lvl, off] of layers) {
      const o = this._osc("sawtooth", hz(m + semi));
      const pre = this._gain(lvl * 0.5);
      o.connect(pre);
      /* delayed vibrato: singers do not wobble on the attack */
      const vib = this._osc("sine", rnd(4.8, 5.4));
      const vd = this._gain(0);
      vd.gain.setValueAtTime(0, t + off);
      vd.gain.linearRampToValueAtTime(hz(m + semi) * 0.011, t + off + 0.45);
      vib.connect(vd); vd.connect(o.frequency);
      for (const [ff, q, g] of [[720, 7, 1], [1180, 9, 0.55], [2750, 10, 0.2]]) {
        const bp = this._filter("bandpass", ff, q);
        const bg = this._gain(g);
        pre.connect(bp); bp.connect(bg); bg.connect(out);
      }
      o.start(t + off); vib.start(t + off);
      o.stop(t + dur + 0.4); vib.stop(t + dur + 0.4);
      nodes.push(o);
      o.onended = () => { pre.disconnect(); vd.disconnect(); };
    }
    nodes[0].addEventListener("ended", () => { out.disconnect(); pan.disconnect(); });
  }

  _bassNote(t, m, vel, dur) {
    if (!this._slot(t + dur + 0.2)) return;
    const o = this._osc("sawtooth", hz(m));
    const sub = this._osc("sine", hz(m));
    const lp = this._filter("lowpass", 220, 5);
    const amp = this._gain(0.0001);
    const sg = this._gain(0.45);
    o.connect(lp); lp.connect(amp);
    sub.connect(sg); sg.connect(amp);
    amp.connect(this.inst.bass);
    lp.frequency.setValueAtTime(hz(m) * 6, t);
    lp.frequency.exponentialRampToValueAtTime(hz(m) * 2.2, t + Math.min(0.3, dur));
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.3 * vel, t + 0.014);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); sub.start(t);
    o.stop(t + dur + 0.03); sub.stop(t + dur + 0.03);
    o.onended = () => { lp.disconnect(); amp.disconnect(); sg.disconnect(); };
  }

  _kick(t, vel) {
    if (!this._slot(t + 0.5)) return;
    const o = this._osc("sine", 120);
    const g = this._gain(0.0001);
    o.connect(g); g.connect(this.inst.drum);
    o.frequency.setValueAtTime(128, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.085);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.start(t); o.stop(t + 0.38);
    o.onended = () => g.disconnect();
    const c = this._grain(t, 0.01, 1);
    const cb = this._filter("bandpass", 2100, 1);
    const cg = this._gain(0.05 * vel);
    c.connect(cb); cb.connect(cg); cg.connect(this.inst.drum);
    cg.gain.setValueAtTime(0.05 * vel, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
  }

  _snare(t, vel) {
    if (!this._slot(t + 0.4)) return;
    const n = this._grain(t, 0.3, 1);
    const bp = this._filter("bandpass", 1750, 1.1);
    const hp = this._filter("highpass", 420, 0.7);
    const g = this._gain(0.0001);
    n.connect(bp); bp.connect(hp); hp.connect(g); g.connect(this.inst.drum);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.13, 0.19));
    for (const f of [188, 331]) {
      const o = this._osc("triangle", f * rnd(0.99, 1.01));
      const og = this._gain(0.0001);
      o.connect(og); og.connect(this.inst.drum);
      og.gain.setValueAtTime(0.09 * vel, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.start(t); o.stop(t + 0.12);
      o.onended = () => og.disconnect();
    }
    n.onended = () => { bp.disconnect(); hp.disconnect(); g.disconnect(); };
  }

  _hat(t, vel, open) {
    if (!this._slot(t + 0.4)) return;
    const d = open ? rnd(0.22, 0.32) : rnd(0.035, 0.055);
    const n = this._grain(t, d + 0.05, 1);
    const hp = this._filter("highpass", 7200, 0.7);
    const bp = this._filter("bandpass", 9800, 0.9);
    const g = this._gain(0.0001);
    const p = this._pan(rnd(-0.3, 0.3));
    n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(p); p.connect(this.inst.drum);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime((open ? 0.11 : 0.14) * vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.onended = () => { hp.disconnect(); bp.disconnect(); g.disconnect(); p.disconnect(); };
  }

  _rim(t, vel) {
    if (!this._slot(t + 0.2)) return;
    const n = this._grain(t, 0.05, 1);
    const bp = this._filter("bandpass", 2350, 6);
    const g = this._gain(0.0001);
    const p = this._pan(-0.22);
    n.connect(bp); bp.connect(g); g.connect(p); p.connect(this.inst.drum);
    g.gain.setValueAtTime(0.16 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    n.onended = () => { bp.disconnect(); g.disconnect(); p.disconnect(); };
  }

  _clap(t, vel) {
    if (!this._slot(t + 0.45)) return;
    const bp = this._filter("bandpass", 1350, 1.5);
    const g = this._gain(1);
    const p = this._pan(0.16);
    bp.connect(g); g.connect(p); p.connect(this.inst.drum);
    for (let i = 0; i < 4; i++) {
      const tt = t + i * rnd(0.008, 0.013);
      const n = this._grain(tt, 0.08, 1);
      const ng = this._gain(0.0001);
      n.connect(ng); ng.connect(bp);
      ng.gain.setValueAtTime(0.22 * vel * (i === 3 ? 1 : 0.7), tt);
      ng.gain.exponentialRampToValueAtTime(0.0001, tt + (i === 3 ? 0.16 : 0.03));
      if (i === 3) n.onended = () => { bp.disconnect(); g.disconnect(); p.disconnect(); };
    }
  }

  _stab(t, notes, dur) {
    if (!this._slot(t + dur + 0.2)) return;
    const lp = this._filter("lowpass", 2600, 4);
    const amp = this._gain(0.0001);
    const p = this._pan(rnd(-0.3, 0.3));
    lp.connect(amp); amp.connect(p); p.connect(this.inst.pad);
    lp.frequency.setValueAtTime(3400, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.14, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let done = 0;
    for (const n of notes) {
      const o = this._osc("sawtooth", hz(n) * rnd(0.997, 1.003));
      const g = this._gain(0.4 / notes.length);
      o.connect(g); g.connect(lp);
      o.start(t); o.stop(t + dur + 0.03);
      o.onended = () => { g.disconnect(); if (++done === notes.length) { lp.disconnect(); amp.disconnect(); p.disconnect(); } };
    }
  }

  _arp(t, m) {
    if (!this._slot(t + 0.3)) return;
    const o = this._osc("square", hz(m));
    const lp = this._filter("lowpass", rnd(1600, 3600), 9);
    const g = this._gain(0.0001);
    const p = this._pan(rnd(-0.45, 0.45));
    o.connect(lp); lp.connect(g); g.connect(p); p.connect(this.inst.gtr);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.start(t); o.stop(t + 0.16);
    o.onended = () => { lp.disconnect(); g.disconnect(); p.disconnect(); };
  }

  /* ---- the arrangement --------------------------------------------------- */

  _section(bar) {
    const seg = clamp(Math.floor(bar / BARS_PER_SEG), 0, SEGMENTS - 1);
    return (this.side === "A" ? PLAN_A : PLAN_B)[seg];
  }

  _chord(bar) {
    const sec = this._section(bar);
    const prog = PROG[this.side][sec];
    return prog[bar % prog.length];
  }

  /** Schedule one bar of music starting at audio time t. */
  _scheduleBar(bar, t) {
    const side = this.side;
    const beat = this.barDur / 4;
    const sec = this._section(bar);
    const c = this._chord(bar);
    const tri = chordNotes(c, 0);
    const swing = () => rnd(-0.012, 0.012);          /* players are not grids */
    const vel = () => rnd(0.82, 1);

    if (side === "A") {
      this._pad(t, [...tri, tri[0] + 12], this.barDur * 0.98);

      /* piano: root and fifth low, an arpeggio above */
      this._piano(t + swing(), c[0] - 12, 0.7 * vel(), this.barDur * 0.9);
      const arp = [tri[0] + 12, tri[1] + 12, tri[2] + 12, tri[0] + 24];
      for (let i = 0; i < 8; i++) {
        if (sec === "intro" && i % 2) continue;
        this._piano(t + i * beat / 2 + swing(), arp[i % 4], (i % 2 ? 0.34 : 0.5) * vel(), beat * 1.5);
      }

      if (sec !== "intro") this._bassNote(t + swing(), c[0] - 24, 0.9, beat * 3.4);
      if (sec !== "intro") this._bassNote(t + beat * 2.5 + swing(), c[0] - 24 + 7, 0.6, beat * 1.2);

      /* guitar: quiet arpeggio in the second half of the bar */
      if (sec === "verse" || sec === "chorus" || sec === "pre") {
        for (const [b, n] of [[0.5, tri[2] + 12], [1.5, tri[1] + 12], [2.5, tri[0] + 24], [3.5, tri[2] + 12]]) {
          this._pluck(t + b * beat + swing(), n, rnd(0.5, 0.8), beat * 1.6);
        }
      }

      /* drums: brushed rim in the verse, a real backbeat in the chorus */
      if (sec === "verse" || sec === "pre") {
        this._kick(t, 0.85);
        this._rim(t + beat * 2, 0.8);
        for (let i = 0; i < 8; i++) this._hat(t + i * beat / 2 + swing(), i % 2 ? 0.3 : 0.5, false);
        if (sec === "pre") this._kick(t + beat * 2.5, 0.6);
      } else if (sec === "chorus") {
        this._kick(t, 1); this._kick(t + beat * 2.5, 0.75);
        this._snare(t + beat + swing(), 0.9); this._snare(t + beat * 3 + swing(), 0.95);
        for (let i = 0; i < 8; i++) this._hat(t + i * beat / 2 + swing(), i % 2 ? 0.4 : 0.7, i === 7);
        if (bar % 8 === 7) { this._snare(t + beat * 3.5, 0.6); this._snare(t + beat * 3.75, 0.8); }
      } else if (sec === "outro") {
        this._rim(t + beat * 2, 0.5);
      }

      /* the hook. This is the part the visitor will rewind to, and therefore
         the part they will destroy first. */
      if (sec === "chorus") {
        const line = HOOK[bar % HOOK.length];
        for (const [b, n, len] of line) {
          this._voice(t + b * beat, n, len * beat);
          this._piano(t + b * beat + swing(), n + 12, 0.4, len * beat);
        }
      }
    } else {
      /* side B: 124 BPM, four on the floor */
      const roots = [c[0] - 24, c[0] - 24, c[0] - 12, c[0] - 24];
      for (let i = 0; i < 4; i++) this._kick(t + i * beat, i === 0 ? 1 : 0.9);
      if (sec !== "intro") { this._clap(t + beat, 0.9); this._clap(t + beat * 3, 0.9); }
      for (let i = 0; i < 8; i++) {
        if (i % 2) this._hat(t + i * beat / 2, 0.5, true);
        else this._hat(t + i * beat / 2 + 0.001, 0.3, false);
      }
      if (sec !== "intro") {
        for (let i = 0; i < 8; i++) {
          this._bassNote(t + i * beat / 2 + swing() * 0.4, roots[i % 4] + (i === 6 ? 3 : 0), 0.9, beat * 0.42);
        }
      }
      if (sec === "verse" || sec === "chorus") {
        this._stab(t + beat * 1.5, tri.map((n) => n + 12), beat * 0.5);
        this._stab(t + beat * 3.5, tri.map((n) => n + 12), beat * 0.5);
      }
      if (sec === "chorus") {
        const up = [tri[0] + 12, tri[1] + 12, tri[2] + 12, tri[1] + 24];
        for (let i = 0; i < 16; i++) this._arp(t + i * beat / 4, up[i % 4] + (i >= 8 ? 12 : 0));
        const line = HOOK[bar % HOOK.length];
        for (const [b, n, len] of line) this._voice(t + b * beat, n + 12, len * beat * 0.8);
      }
      if (sec === "pre") {
        this._pad(t, [...tri, tri[0] + 12], this.barDur);
        for (let i = 0; i < 4; i++) this._snare(t + beat * 3 + i * beat / 8, 0.4 + i * 0.15);
      }
    }
  }

  /* ---- transport mechanics ----------------------------------------------- */

  /** the play key going down: spring, plastic, and the head assembly landing */
  _thunk(t, hard) {
    if (!this._slot(t + 0.6)) return;
    const n = this._grain(t, 0.09, 1);
    const lp = this._filter("lowpass", 900, 1.1);
    const g = this._gain(0.0001);
    n.connect(lp); lp.connect(g); g.connect(this.buses.transport);
    g.gain.setValueAtTime((hard ? 0.4 : 0.26), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    const o = this._osc("sine", 96);
    const og = this._gain(0.0001);
    o.connect(og); og.connect(this.buses.transport);
    o.frequency.setValueAtTime(112, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.06);
    og.gain.setValueAtTime(0.24, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.start(t); o.stop(t + 0.14);
    o.onended = () => { og.disconnect(); lp.disconnect(); g.disconnect(); };
    this._click(t + 0.028, 0.5);
  }

  _click(t, vel) {
    if (!this._slot(t + 0.1)) return;
    const n = this._grain(t, 0.02, 1);
    const bp = this._filter("bandpass", rnd(3800, 5200), 3);
    const g = this._gain(0.0001);
    n.connect(bp); bp.connect(g); g.connect(this.buses.transport);
    g.gain.setValueAtTime(0.2 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);
    n.onended = () => { bp.disconnect(); g.disconnect(); };
  }

  /** the cassette door: hinge, then the shell seating in the well */
  _doorSnap(t) {
    this._click(t, 0.7);
    if (!this._slot(t + 0.3)) return;
    const o = this._osc("triangle", 780);
    const g = this._gain(0.0001);
    const bp = this._filter("bandpass", 900, 3);
    o.connect(bp); bp.connect(g); g.connect(this.buses.transport);
    g.gain.setValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.start(t + 0.05); o.stop(t + 0.16);
    o.onended = () => { bp.disconnect(); g.disconnect(); };
    this._click(t + 0.09, 1);
  }

  /** the spool motor. Starts, holds, and spins down, with the tape squeal
      that only shows up when a cassette is being dragged past a fixed guide. */
  _startMotor(dir) {
    if (this.motor) return;
    const t = this.ctx.currentTime;
    const out = this._gain(0.0001);
    out.connect(this.buses.transport);
    const body = this._src(this.brown, 1);
    const bbp = this._filter("bandpass", dir < 0 ? 380 : 460, 1.4);
    const bg = this._gain(0.85);
    body.connect(bbp); bbp.connect(bg); bg.connect(out);
    const whine = this._osc("sawtooth", 60);
    const wlp = this._filter("lowpass", 1400, 4);
    const wg = this._gain(0.045);
    whine.connect(wlp); wlp.connect(wg); wg.connect(out);
    const squeal = this._src(this.white, 1);
    const sbp = this._filter("bandpass", 3300, 12);
    const sg = this._gain(0.02);
    squeal.connect(sbp); sbp.connect(sg); sg.connect(out);
    whine.frequency.setValueAtTime(38, t);
    whine.frequency.exponentialRampToValueAtTime(dir < 0 ? 172 : 158, t + 0.42);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.5, t + 0.14);
    body.start(); whine.start(); squeal.start();
    this.motor = { out, whine, nodes: [body, whine, squeal], filters: [bbp, bg, wlp, wg, sbp, sg] };
    this._thunk(t, false);
  }

  _stopMotor() {
    if (!this.motor) return;
    const m = this.motor;
    this.motor = null;
    const t = this.ctx.currentTime;
    m.whine.frequency.cancelScheduledValues(t);
    m.whine.frequency.setValueAtTime(m.whine.frequency.value, t);
    m.whine.frequency.exponentialRampToValueAtTime(30, t + 0.34);
    m.out.gain.cancelScheduledValues(t);
    m.out.gain.setValueAtTime(m.out.gain.value, t);
    m.out.gain.linearRampToValueAtTime(0.0001, t + 0.36);
    for (const n of m.nodes) { try { n.stop(t + 0.4); } catch (e) { /* already stopped */ } }
    m.nodes[0].onended = () => {
      m.out.disconnect();
      for (const f of m.filters) f.disconnect();
    };
    this._click(t + 0.36, 0.6);
  }

  /* ---- the walk ---------------------------------------------------------- */

  /** one footstep on cold pavement: heel, then the scuff of the sole */
  _step(t, foot) {
    if (!this._slot(t + 0.4)) return;
    const p = this._pan(foot ? 0.22 : -0.22);
    p.connect(this.stepGain);
    const heel = this._grain(t, 0.12, 1);
    const hb = this._filter("bandpass", rnd(380, 520), 1.5);
    const hg = this._gain(0.0001);
    heel.connect(hb); hb.connect(hg); hg.connect(p);
    hg.gain.setValueAtTime(rnd(0.16, 0.24), t);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.045, 0.075));
    const scuff = this._grain(t + 0.055, 0.1, 1);
    const sb = this._filter("highpass", 3200, 0.7);
    const sg = this._gain(0.0001);
    scuff.connect(sb); sb.connect(sg); sg.connect(p);
    sg.gain.setValueAtTime(rnd(0.03, 0.06), t + 0.055);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.055 + rnd(0.04, 0.08));
    scuff.onended = () => { hb.disconnect(); hg.disconnect(); sb.disconnect(); sg.disconnect(); p.disconnect(); };
  }

  /** the school bag: a zip is a run of teeth, accelerating then stopping */
  zipper() {
    if (!this.running) return;
    const t0 = this.ctx.currentTime + 0.02;
    const p = this._pan(-0.35);
    const bp = this._filter("bandpass", 3200, 3);
    const g = this._gain(0.5);
    bp.connect(g); g.connect(p); p.connect(this.buses.street);
    let t = t0;
    for (let i = 0; i < 26; i++) {
      const n = this._grain(t, 0.01, rnd(0.9, 1.3));
      const ng = this._gain(0.0001);
      n.connect(ng); ng.connect(bp);
      ng.gain.setValueAtTime(rnd(0.16, 0.3), t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.011);
      t += 0.019 - i * 0.00035 + rnd(-0.002, 0.002);
    }
    setTimeout(() => { bp.disconnect(); g.disconnect(); p.disconnect(); }, 1600);
    this._emit("zipper");
  }

  /** a bus goes past: the band rises and falls, the road ducks behind it,
      and the air brake lets go once it is level with you */
  _busPass(t) {
    if (!this._slot(t + 9)) return;
    const src = this._src(this.brown, 1);
    const bp = this._filter("bandpass", 110, 1.1);
    const g = this._gain(0.0001);
    const p = this._pan(-0.85);
    src.connect(bp); bp.connect(g); g.connect(p); p.connect(this.buses.street);
    bp.frequency.setValueAtTime(95, t);
    bp.frequency.linearRampToValueAtTime(240, t + 3.4);
    bp.frequency.linearRampToValueAtTime(88, t + 6.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.62, t + 3.2);
    g.gain.linearRampToValueAtTime(0.0001, t + 6.8);
    p.pan.setValueAtTime(-0.85, t);
    p.pan.linearRampToValueAtTime(0.85, t + 6.4);
    src.start(t); src.stop(t + 7);
    src.onended = () => { bp.disconnect(); g.disconnect(); p.disconnect(); };

    /* the road behind it gets covered up for a moment */
    this.trafficGain.gain.setTargetAtTime(0.2, t + 1.6, 0.9);
    this.trafficGain.gain.setTargetAtTime(0.42, t + 5.2, 1.6);

    const air = this._grain(t + 3.6, 0.9, 1);
    const ahp = this._filter("highpass", 2400, 0.7);
    const ag = this._gain(0.0001);
    air.connect(ahp); ahp.connect(ag); ag.connect(this.buses.street);
    ag.gain.setValueAtTime(0.0001, t + 3.6);
    ag.gain.linearRampToValueAtTime(0.11, t + 3.68);
    ag.gain.exponentialRampToValueAtTime(0.0001, t + 4.4);
    air.onended = () => { ahp.disconnect(); ag.disconnect(); };
    this._emit("bus");
  }

  /** the door buzzer at the bottom of the stairs. Cheap, loud, unmistakable. */
  _buzzer(t) {
    for (let k = 0; k < 2; k++) {
      const t0 = t + k * 1.5;
      if (!this._slot(t0 + 1.4)) return;
      const out = this._gain(0.0001);
      const bp = this._filter("bandpass", 1300, 2.4);
      out.connect(bp); bp.connect(this.buses.street);
      const am = this._gain(0.5);
      const lfo = this._osc("square", 33);
      const ld = this._gain(0.5);
      lfo.connect(ld); ld.connect(am.gain);
      am.connect(out);
      for (const f of [618, 927]) {
        const o = this._osc("square", f);
        const g = this._gain(f > 800 ? 0.18 : 0.4);
        o.connect(g); g.connect(am);
        o.start(t0); o.stop(t0 + 1.05);
        o.onended = () => g.disconnect();
      }
      lfo.start(t0); lfo.stop(t0 + 1.05);
      out.gain.setValueAtTime(0.0001, t0);
      out.gain.linearRampToValueAtTime(0.22, t0 + 0.02);
      out.gain.setValueAtTime(0.22, t0 + 0.9);
      out.gain.exponentialRampToValueAtTime(0.0001, t0 + 1);
      lfo.onended = () => { out.disconnect(); bp.disconnect(); am.disconnect(); ld.disconnect(); };
    }
    this._emit("buzzer");
  }

  /* ---- wear -------------------------------------------------------------- */

  /** wear at the exact position of the head, interpolated between segments */
  get localWear() {
    const w = this.wear[this.side];
    const x = clamp(this.barPos / BARS_PER_SEG - 0.5, 0, SEGMENTS - 1);
    const i = Math.floor(x);
    const f = x - i;
    return w[i] * (1 - f) + w[Math.min(SEGMENTS - 1, i + 1)] * f;
  }

  get meanWear() {
    const w = this.wear[this.side];
    let s = 0;
    for (let i = 0; i < SEGMENTS; i++) s += w[i];
    return s / SEGMENTS;
  }

  /** Spread `per` units of wear over every segment the tape moved across.
      Playing is gentle. Rewinding stretches the tape and is not. */
  _wearRange(fromBar, toBar, per) {
    const w = this.wear[this.side];
    const a = Math.min(fromBar, toBar);
    const b = Math.max(fromBar, toBar);
    for (let s = 0; s < SEGMENTS; s++) {
      const lo = s * BARS_PER_SEG;
      const ov = Math.max(0, Math.min(b, lo + BARS_PER_SEG) - Math.max(a, lo));
      if (ov > 0) w[s] = Math.min(1, w[s] + per * (ov / BARS_PER_SEG));
    }
  }

  _wearSpike(bar, amount) {
    const s = clamp(Math.floor(bar / BARS_PER_SEG), 0, SEGMENTS - 1);
    const w = this.wear[this.side];
    w[s] = Math.min(1, w[s] + amount);
    if (s > 0) w[s - 1] = Math.min(1, w[s - 1] + amount * 0.4);
    if (s < SEGMENTS - 1) w[s + 1] = Math.min(1, w[s + 1] + amount * 0.4);
  }

  /** Push the four tape parameters to match the wear under the head. */
  _updateTape(now) {
    const active = this.mode === "play" || now < this._checkUntil;
    const lw = this.localWear;
    const mw = this.meanWear;
    const mix = 0.68 * lw + 0.32 * mw;
    const tc = 0.12;

    /* pitch instability. Depth is in seconds of delay modulation, so peak
       deviation is roughly depth * 2 * pi * lfoRate. */
    this.wowDepth.gain.setTargetAtTime(0.00026 + 0.0034 * Math.pow(lw, 1.25), now, tc);
    this.flDepth.gain.setTargetAtTime(0.00005 + 0.00082 * Math.pow(lw, 1.35), now, tc);
    this.prDepth.gain.setTargetAtTime(0.00004 + 0.00048 * Math.pow(lw, 1.4), now, tc);

    /* hiss and the loss of top end */
    this.hissGain.gain.setTargetAtTime(active ? 0.0075 + 0.088 * Math.pow(mix, 0.85) : 0.00005, now, 0.2);
    this.dull.frequency.setTargetAtTime(13000 * Math.exp(-1.55 * mix), now, tc);
    this.dolby.gain.setTargetAtTime(-1.2 - 10.5 * mix, now, tc);
  }

  /* ---- transport --------------------------------------------------------- */

  play() {
    if (!this.running || this.arrived) return;
    if (this.mode === "rew" || this.mode === "ff") this._stopMotor();
    if (this.mode === "play") return;
    const t = this.ctx.currentTime;
    this._thunk(t, true);
    this.mode = "play";
    this.schedBar = Math.floor(this.barPos);
    this.schedTime = t + 0.22;
    this.anchorBar = this.schedBar;
    this.anchorTime = this.schedTime;
    this._emit("mode", "play");
  }

  stop() {
    if (!this.running || this.mode === "stop") return;
    const t = this.ctx.currentTime;
    if (this.mode === "rew" || this.mode === "ff") {
      this._wearSpike(this.barPos, 0.028);
      this._stopMotor();
    }
    this.mode = "stop";
    this._thunk(t, false);
    this._emit("mode", "stop");
  }

  rewind() { this._spool("rew"); }
  ff() { this._spool("ff"); }

  _spool(mode) {
    if (!this.running || this.arrived) return;
    if (this.mode === mode) { this.stop(); return; }
    if (this.mode === "rew" || this.mode === "ff") this._stopMotor();
    this.mode = mode;
    /* the tape is grabbed hard where the spool starts. That is why the part
       you keep going back to is the part that dies first. */
    this._wearSpike(this.barPos, 0.034);
    this._startMotor(mode === "rew" ? -1 : 1);
    this._emit("mode", mode);
  }

  flip() {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    if (this.mode !== "stop") this.stop();
    this._doorSnap(t + 0.05);
    this.side = this.side === "A" ? "B" : "A";
    this.barPos = 0;
    this._sagged.clear();
    this._emit("side", this.side);
  }

  /** end of side: a real auto-reverse deck clicks over and keeps going */
  _autoReverse() {
    const t = this.ctx.currentTime;
    this._click(t, 1);
    this._click(t + 0.09, 0.8);
    this.side = this.side === "A" ? "B" : "A";
    this.barPos = 0;
    this.schedBar = 0;
    this.schedTime = t + 0.55;
    this.anchorBar = 0;
    this.anchorTime = this.schedTime;
    this._sagged.clear();
    this._emit("autoreverse", this.side);
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (!this.running) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  setMuted(m) {
    this.muted = !!m;
    if (!this.running) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  /** A 1 kHz alignment tone through the tape path, the way a deck is lined up.
      Nothing else plays, so what comes out is the tape and only the tape. The
      wear probe measures its pitch scatter and the hiss underneath it. */
  tapeCheck(seconds) {
    if (!this.running) return 0;
    const sec = seconds || 4;
    const t = this.ctx.currentTime + 0.05;
    if (this.mode !== "stop") this.stop();
    this._checkUntil = t + sec;
    this.walkGain.gain.setTargetAtTime(0.0001, t, 0.05);
    this.walkGain.gain.setTargetAtTime(1, t + sec, 0.2);
    const o = this._osc("sine", 1000);
    const g = this._gain(0.0001);
    o.connect(g); g.connect(this.musicSum);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.34, t + 0.05);
    g.gain.setValueAtTime(0.34, t + sec - 0.06);
    g.gain.linearRampToValueAtTime(0.0001, t + sec);
    o.start(t); o.stop(t + sec + 0.05);
    o.onended = () => g.disconnect();
    return sec;
  }

  /** Read-only view of the tape section, for the wear meter and the probe. */
  telemetry() {
    const wow = this.wowDepth ? this.wowDepth.gain.value : 0;
    const fl = this.flDepth ? this.flDepth.gain.value : 0;
    const pr = this.prDepth ? this.prDepth.gain.value : 0;
    /* peak pitch deviation of a delay modulated by depth d at rate f is
       d * 2 * pi * f, expressed here in cents */
    const dev = wow * 2 * Math.PI * 0.42 + fl * 2 * Math.PI * 6.3 + pr * 2 * Math.PI * 3.1;
    return {
      side: this.side,
      mode: this.mode,
      barPos: this.barPos,
      localWear: this.localWear,
      meanWear: this.meanWear,
      flutterCents: 1200 * Math.log2(1 + dev),
      hissGain: this.hissGain ? this.hissGain.gain.value : 0,
      toneHz: this.dull ? this.dull.frequency.value : 0,
      dropouts: this.dropouts,
      walked: this.walked,
      arrived: this.arrived,
    };
  }

  /* ---- scheduler --------------------------------------------------------- */

  _tick() {
    if (!this.running || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const dt = Math.min(0.5, now - this._lastTick);
    this._lastTick = now;
    const ahead = now + 0.45;
    const bd = this.barDur;

    /* -- move the tape, and wear it -- */
    const before = this.barPos;
    if (this.mode === "play") {
      this.barPos = this.anchorBar + (now - this.anchorTime) / bd;
      if (this.barPos < 0) this.barPos = 0;
      this._wearRange(before, this.barPos, 0.018);
    } else if (this.mode === "rew" || this.mode === "ff") {
      const rate = 8.5 / bd;                    /* eight and a half times speed */
      this.barPos += (this.mode === "rew" ? -rate : rate) * dt;
      this._wearRange(before, this.barPos, this.mode === "rew" ? 0.082 : 0.041);
      if (this.barPos <= 0) { this.barPos = 0; this._wearSpike(0, 0.02); this.stop(); }
      if (this.barPos >= BARS) { this.barPos = BARS - 0.01; this.stop(); }
    }

    this._updateTape(now);

    /* -- the walk keeps happening whether or not the tape is running -- */
    if (!this.arrived) {
      this.walked += dt;
      const pace = 0.535 + 0.02 * Math.sin(now * 0.11);
      while (this._nextStep < ahead) {
        this._step(Math.max(this._nextStep, now + 0.02), this._stepFoot);
        this._stepFoot ^= 1;
        this._nextStep += pace * rnd(0.94, 1.06);
      }
      if (now > this._nextBus) {
        this._busPass(now + 0.2);
        this._nextBus = now + rnd(26, 52);
      }
      if (this.walked >= this.routeSeconds) {
        this.arrived = true;
        this._buzzer(now + 0.7);
        this.stepGain.gain.setTargetAtTime(0.0001, now, 1.1);
        this.trafficGain.gain.setTargetAtTime(0.12, now + 1, 2.5);
        this._emit("arrived");
      }
    }

    /* -- dropouts, creases and the sag: everything the wear buys you -- */
    const lw = this.localWear;
    const playing = this.mode === "play" || now < this._checkUntil;
    if (playing && now > this._nextDrop) {
      const rate = Math.pow(lw, 2.1) * 1.05;
      if (rate > 0.004 && Math.random() < rate * 0.45) {
        const len = (0.028 + 0.44 * Math.pow(lw, 1.8)) * rnd(0.6, 1.35);
        this._dropout(now + rnd(0.02, 0.2), len);
      }
      this._nextDrop = now + 0.45;
    }
    if (playing && lw > 0.52 && now > this._nextCrease) {
      this._crease(now + 0.05, lw);
      this._nextCrease = now + rnd(1.6, 4.2) / lw;
    }
    /* a badly stretched stretch of tape sags flat and then comes back */
    if (this.mode === "play" && now > this._sagUntil) {
      const seg = clamp(Math.floor(this.barPos / BARS_PER_SEG), 0, SEGMENTS - 1);
      if (this.wear[this.side][seg] > 0.76 && !this._sagged.has(seg)) {
        this._sagged.add(seg);
        this._sag(now + 0.1);
      }
    }

    /* -- music -- */
    if (this.mode === "play") {
      while (this.schedTime < ahead) {
        if (this.schedBar >= BARS) { this._autoReverse(); break; }
        this._scheduleBar(this.schedBar, Math.max(this.schedTime, now + 0.02));
        this.schedTime += this.barDur;
        this.schedBar += 1;
      }
    }
  }

  _dropout(t, len) {
    const g = this.dropGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(0.045, t + 0.007);
    g.setValueAtTime(0.045, t + len);
    g.linearRampToValueAtTime(1, t + len + 0.02);
    this.dropouts += 1;
    this._emit("dropout", len);
  }

  /** a crease in the tape: the head loses contact for a few milliseconds and
      the shell makes a small noise about it */
  _crease(t, w) {
    const g = this.creaseGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(0.22, t + 0.004);
    g.linearRampToValueAtTime(1, t + 0.028 + 0.02 * w);
    if (!this._slot(t + 0.1)) return;
    const n = this._grain(t, 0.02, 1);
    const bp = this._filter("bandpass", rnd(1400, 2600), 4);
    const ng = this._gain(0.0001);
    n.connect(bp); bp.connect(ng); ng.connect(this.buses.tape);
    ng.gain.setValueAtTime(0.05 * w, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    n.onended = () => { bp.disconnect(); ng.disconnect(); };
    this._emit("crease");
  }

  _sag(t) {
    const d = this.flutter.delayTime;
    d.cancelScheduledValues(t);
    d.setValueAtTime(0.06, t);
    d.linearRampToValueAtTime(0.0765, t + 1.5);     /* runs slow, pitch drops */
    d.setValueAtTime(0.0765, t + 2.1);
    d.linearRampToValueAtTime(0.06, t + 3.6);       /* and hauls itself back */
    this._sagUntil = t + 4.4;
    this._emit("sag");
  }
}

export const audio = new WalkmanAudio();
