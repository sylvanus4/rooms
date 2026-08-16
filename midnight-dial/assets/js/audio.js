/**
 * audio.js - the synthesis engine.
 *
 * Everything you hear is generated at runtime: oscillators, noise written into
 * AudioBuffers, biquad filters, delay lines, and a convolution reverb whose
 * impulse response is synthesised from decaying stereo-decorrelated noise.
 * There is not a single recorded sample in this project. Three of the nine
 * stations carry a generated track instead of a synthesised programme; they
 * are played through room-music.js on the receiver's own front end.
 *
 * Signal flow
 *   stations ─┬─> stationBus ─┬─> analyser        (signal meter tap)
 *             │               └─> preMaster
 *             ├─> revShortIn -> convolverShort -> preMaster
 *             └─> revLongIn  -> convolverLong  -> preMaster
 *   static  ────> staticBand -> staticGain ─────> preMaster
 *   beat    ────> hetGain ──────────────────────> preMaster
 *   preMaster -> compressor -> masterGain -> destination
 *
 * Station lifecycle: only the station(s) the needle can currently hear are
 * built. A station graph is constructed on demand when its target gain rises
 * above the audible floor and disposed 1.2 s after it falls back to silence,
 * so at most two graphs exist at once (during a crossfade) and usually one.
 */

import { RoomMusic, SLOT_MEDIUM } from './room-music.js';

/* ------------------------------------------------------------------ */
/* Band plan                                                           */
/* ------------------------------------------------------------------ */

export const BAND_MIN = 88.0;
export const BAND_MAX = 108.0;

/** Distance in MHz at which a station is at full strength / first audible. */
const LOCK_WIDTH = 0.20;
const FADE_WIDTH = 0.86;

/**
 * `trim` levels the stations against each other. They are not guesses: each
 * station was measured through the analyser tap and matched on its 90th
 * percentile level, which is the figure that decides whether landing on a
 * station feels like a jump scare. Matching on mean would have made the sparse
 * stations far too loud in the moments they actually play.
 *
 * Three of these carry a track instead of a synthesised programme. They are
 * stations like any other: they sit at their own frequency, the needle is
 * magnetised toward them, the mark lights up as you arrive, and between them
 * you get the same interstation noise as everywhere else on the band. Tuning
 * has to *find* them — nothing here plays a track because a button was pressed.
 *
 * The frequencies are the three widest gaps left in the band. Each is at least
 * 1.6 MHz from its neighbours, which is past FADE_WIDTH on both sides, so there
 * is real static between every pair rather than two programmes bleeding into
 * one another.
 */
export const STATIONS = [
  { id: 'music', freq: 89.1, stereo: true, trim: 3.0, build: buildMusicRoom },
  { id: 'rain', freq: 91.9, stereo: true, trim: 1.4, build: buildRain },
  { id: 'signal', freq: 93.9, stereo: true, trim: 1, track: 'signal' },
  { id: 'ballad', freq: 95.9, stereo: true, trim: 1.25, build: buildBallad },
  { id: 'highway', freq: 98.7, stereo: true, trim: 0.9, build: buildHighway },
  { id: 'shortwave', freq: 101.3, stereo: false, trim: 1.6, build: buildShortwave },
  { id: 'letter', freq: 102.9, stereo: true, trim: 1, track: 'letter' },
  { id: 'fouram', freq: 104.5, stereo: true, trim: 0.26, build: buildFourAM },
  { id: 'closing', freq: 106.3, stereo: true, trim: 1, track: 'closing' },
];

/** The three that are files. Same medium: it is one receiver. */
export const MUSIC_STATIONS = STATIONS.filter((s) => s.track);
/* Set against the trims above, which were measured through the analyser tap. */
const MUSIC_TOP = 0.42;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const smoothstep = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Signal strength of one station at a given dial position, 0..1. */
export function stationSignal(freq, stationFreq) {
  const d = Math.abs(freq - stationFreq);
  if (d <= LOCK_WIDTH) return 1;
  if (d >= FADE_WIDTH) return 0;
  return smoothstep(1 - (d - LOCK_WIDTH) / (FADE_WIDTH - LOCK_WIDTH));
}

/** Best station for a dial position: { id, signal } or null. */
export function bestStation(freq) {
  let best = null;
  for (const s of STATIONS) {
    const sig = stationSignal(freq, s.freq);
    if (sig > 0 && (!best || sig > best.signal)) best = { id: s.id, freq: s.freq, signal: sig, stereo: s.stereo };
  }
  return best;
}

/** Stereo white noise, generated once and looped. */
function noiseBuffer(ctx, seconds = 4) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return buf;
}

/**
 * Procedural impulse response: exponentially decaying noise, one-pole damped
 * so the tail darkens over time, with independent noise per channel so the
 * reverb is genuinely stereo rather than a duplicated mono cloud.
 */
function makeImpulse(ctx, seconds, decay, damping) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    const preDelay = Math.floor(ctx.sampleRate * (ch === 0 ? 0.008 : 0.011));
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, decay);
      const white = Math.random() * 2 - 1;
      lp += (white - lp) * damping;
      d[i] = i < preDelay ? 0 : lp * env;
    }
    // a couple of early reflections so the space has walls
    const refl = ch === 0 ? [0.013, 0.029, 0.047] : [0.017, 0.033, 0.051];
    for (const r of refl) {
      const idx = Math.floor(r * ctx.sampleRate);
      if (idx < len) d[idx] += (Math.random() * 2 - 1) * 0.35;
    }
  }
  return buf;
}

function gain(ctx, v = 1) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function filter(ctx, type, freq, q = 1) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function panner(ctx, pan = 0) {
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  return p;
}

/** Free-running LFO: osc -> depth gain -> target AudioParam. */
function lfo(ctx, rate, depth, target, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = rate;
  const d = gain(ctx, depth);
  o.connect(d).connect(target);
  o.start();
  return { osc: o, depth: d, stop: () => { try { o.stop(); } catch (_) { /* already stopped */ } } };
}

/** Percussive envelope written straight onto a gain param. */
function ping(param, when, peak, attack, decay) {
  param.cancelScheduledValues(when);
  param.setValueAtTime(0.0001, when);
  param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack);
  param.exponentialRampToValueAtTime(0.0001, when + attack + decay);
}

/* ------------------------------------------------------------------ */
/* Stations                                                            */
/*                                                                     */
/* Every builder receives (ctx, bus) and returns                       */
/*   { out, tick(until), dispose() }                                   */
/* where `out` is the station's own gain node, already connected.      */
/* ------------------------------------------------------------------ */

/** 89.1 - slow generative lo-fi with tape wow, flutter and vinyl crackle. */
function buildMusicRoom(ctx, bus) {
  const out = gain(ctx, 0);
  const voices = gain(ctx, 0.9);

  // Tape transport: a short delay line whose time is wobbled by two LFOs.
  // Slow wow (0.24 Hz) plus fast flutter (5.7 Hz) reads as a tired cassette.
  const tape = ctx.createDelay(0.4);
  tape.delayTime.value = 0.06;
  const wow = lfo(ctx, 0.24, 0.0022, tape.delayTime);
  const flutter = lfo(ctx, 5.7, 0.00042, tape.delayTime);
  const tone = filter(ctx, 'lowpass', 3200, 0.7);
  voices.connect(tape).connect(tone).connect(out);

  // Vinyl crackle: one looping noise source, gated open for a few milliseconds
  // at random intervals. Cheaper and more convincing than per-pop buffers.
  const crackleSrc = ctx.createBufferSource();
  crackleSrc.buffer = bus.noise;
  crackleSrc.loop = true;
  const crackleGate = gain(ctx, 0);
  const crackleHP = filter(ctx, 'highpass', 1900, 0.6);
  crackleSrc.connect(crackleHP).connect(crackleGate).connect(out);
  crackleSrc.start();

  const send = gain(ctx, 0.34);
  out.connect(send).connect(bus.revLong);
  out.connect(bus.stationBus);

  // A natural minor pentatonic on A. Sparse, no melody, just weather.
  const notes = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];
  const live = [];
  let nextNote = ctx.currentTime + 0.4;
  let nextCrackle = ctx.currentTime + 0.2;

  function strike(when, freq, level) {
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    const ratio = pick([1, 2, 3.5]);
    mod.frequency.value = freq * ratio;
    const modDepth = gain(ctx, freq * 2.6);
    mod.connect(modDepth).connect(car.frequency);

    const env = gain(ctx, 0);
    const pan = panner(ctx, rnd(-0.55, 0.55));
    car.connect(env).connect(pan).connect(voices);

    const decay = rnd(2.2, 4.4);
    ping(env.gain, when, level, 0.006, decay);
    modDepth.gain.setValueAtTime(freq * 2.6, when);
    modDepth.gain.exponentialRampToValueAtTime(freq * 0.02, when + 0.7);

    car.start(when);
    mod.start(when);
    const end = when + decay + 0.2;
    car.stop(end);
    mod.stop(end);
    live.push(car, mod);
    car.onended = () => {
      env.disconnect();
      pan.disconnect();
      modDepth.disconnect();
    };
  }

  return {
    out,
    tick(until) {
      while (nextNote < until) {
        strike(nextNote, pick(notes), rnd(0.05, 0.13));
        // occasional second voice a fifth or fourth away
        if (Math.random() < 0.35) strike(nextNote + rnd(0.09, 0.3), pick(notes), rnd(0.03, 0.07));
        nextNote += rnd(1.7, 4.3);
      }
      while (nextCrackle < until) {
        const g = crackleGate.gain;
        const amp = Math.random() < 0.06 ? rnd(0.05, 0.11) : rnd(0.008, 0.03);
        g.setValueAtTime(0, nextCrackle);
        g.linearRampToValueAtTime(amp, nextCrackle + 0.0015);
        g.linearRampToValueAtTime(0, nextCrackle + rnd(0.004, 0.02));
        nextCrackle += rnd(0.02, 0.16);
      }
    },
    dispose() {
      wow.stop();
      flutter.stop();
      try { crackleSrc.stop(); } catch (_) { /* already stopped */ }
      for (const o of live) { try { o.stop(); } catch (_) { /* already stopped */ } }
    },
  };
}

/** 91.9 - rain on a window pane. No melody, only weather. */
function buildRain(ctx, bus) {
  const out = gain(ctx, 0);

  const bedSrc = ctx.createBufferSource();
  bedSrc.buffer = bus.noise;
  bedSrc.loop = true;

  // Two noise layers: a low body (the street) and a high hiss (the pane).
  const body = filter(ctx, 'lowpass', 780, 0.8);
  const bodyG = gain(ctx, 0.20);
  const hiss = filter(ctx, 'highpass', 1700, 0.6);
  const hissG = gain(ctx, 0.11);
  bedSrc.connect(body).connect(bodyG).connect(out);
  bedSrc.connect(hiss).connect(hissG).connect(out);
  const gust = lfo(ctx, 0.055, 260, body.frequency);
  bedSrc.start();

  // Individual drops: a second noise loop gated through a bandpass that is
  // retuned immediately before each hit, so every drop lands somewhere else.
  const dropSrc = ctx.createBufferSource();
  dropSrc.buffer = bus.noise;
  dropSrc.loop = true;
  const dropBP = filter(ctx, 'bandpass', 2200, 9);
  const dropGate = gain(ctx, 0);
  const dropPan = panner(ctx, 0);
  dropSrc.connect(dropBP).connect(dropGate).connect(dropPan).connect(out);
  dropSrc.start();

  // Thunder lives far away and goes almost entirely to the long reverb.
  const thunderSrc = ctx.createBufferSource();
  thunderSrc.buffer = bus.noise;
  thunderSrc.loop = true;
  const thunderLP = filter(ctx, 'lowpass', 180, 1.1);
  const thunderG = gain(ctx, 0);
  thunderSrc.connect(thunderLP).connect(thunderG);
  thunderG.connect(out);
  const thunderSend = gain(ctx, 1.6);
  thunderG.connect(thunderSend).connect(bus.revLong);
  thunderSrc.start();

  const send = gain(ctx, 0.18);
  out.connect(send).connect(bus.revShort);
  out.connect(bus.stationBus);

  let nextDrop = ctx.currentTime + 0.1;
  let nextThunder = ctx.currentTime + rnd(14, 40);

  return {
    out,
    tick(until) {
      while (nextDrop < until) {
        dropBP.frequency.setValueAtTime(rnd(1100, 4200), nextDrop);
        dropPan.pan.setValueAtTime(rnd(-0.85, 0.85), nextDrop);
        ping(dropGate.gain, nextDrop, rnd(0.05, 0.19), 0.003, rnd(0.02, 0.06));
        nextDrop += rnd(0.035, 0.16);
      }
      while (nextThunder < until) {
        const g = thunderG.gain;
        g.setValueAtTime(0.0001, nextThunder);
        g.exponentialRampToValueAtTime(rnd(0.1, 0.26), nextThunder + rnd(1.1, 2.0));
        g.exponentialRampToValueAtTime(0.0001, nextThunder + rnd(4.5, 7));
        thunderLP.frequency.setValueAtTime(230, nextThunder);
        thunderLP.frequency.exponentialRampToValueAtTime(62, nextThunder + 5.5);
        nextThunder += rnd(26, 72);
      }
    },
    dispose() {
      gust.stop();
      for (const s of [bedSrc, dropSrc, thunderSrc]) { try { s.stop(); } catch (_) { /* already stopped */ } }
    },
  };
}

/** 95.9 - warm minor arpeggio over a slow pad, chorused and drowned in reverb. */
function buildBallad(ctx, bus) {
  const out = gain(ctx, 0);

  // Chorus: dry centre plus two modulated delay taps panned wide.
  const chorusIn = gain(ctx, 1);
  const dry = gain(ctx, 0.55);
  chorusIn.connect(dry).connect(out);
  const taps = [];
  for (const [time, rate, depth, pan] of [
    [0.019, 0.23, 0.0042, -0.75],
    [0.027, 0.31, 0.0033, 0.75],
  ]) {
    const d = ctx.createDelay(0.1);
    d.delayTime.value = time;
    const l = lfo(ctx, rate, depth, d.delayTime);
    const p = panner(ctx, pan);
    chorusIn.connect(d).connect(p).connect(out);
    taps.push({ d, l, p });
  }

  const send = gain(ctx, 0.62);
  out.connect(send).connect(bus.revLong);
  out.connect(bus.stationBus);

  // Pad: three detuned saws through a slowly breathing lowpass.
  const padFilter = filter(ctx, 'lowpass', 620, 3.2);
  const padGain = gain(ctx, 0.055);
  padFilter.connect(padGain).connect(chorusIn);
  const padBreath = lfo(ctx, 0.06, 210, padFilter.frequency);
  const padOscs = [];
  for (const cents of [-8, 0, 9]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.detune.value = cents;
    o.frequency.value = 110;
    o.connect(padFilter);
    o.start();
    padOscs.push(o);
  }

  // i - VI - III - VII in A minor, eight seconds each.
  const progression = [
    { root: 110.0, tones: [220, 261.63, 329.63, 440, 523.25] },     // Am
    { root: 87.31, tones: [174.61, 220, 261.63, 349.23, 440] },     // F
    { root: 130.81, tones: [196, 261.63, 329.63, 392, 523.25] },    // C
    { root: 98.0, tones: [196, 246.94, 293.66, 392, 493.88] },      // G
  ];
  let chordIdx = 0;
  let nextChord = ctx.currentTime;
  let current = progression[0];
  let nextArp = ctx.currentTime + 0.25;
  const arpStep = 60 / 72 / 2; // eighth notes at 72 bpm
  let arpPos = 0;
  const live = [];

  function pluck(when, freq) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const f = filter(ctx, 'lowpass', 2600, 1.1);
    const env = gain(ctx, 0);
    o.connect(f).connect(env).connect(chorusIn);
    ping(env.gain, when, rnd(0.045, 0.075), 0.012, 1.5);
    o.start(when);
    o.stop(when + 1.7);
    live.push(o);
    o.onended = () => { f.disconnect(); env.disconnect(); };
  }

  return {
    out,
    tick(until) {
      while (nextChord < until) {
        current = progression[chordIdx % progression.length];
        for (const o of padOscs) {
          o.frequency.setTargetAtTime(current.root, nextChord, 0.45);
        }
        chordIdx++;
        nextChord += 8;
      }
      while (nextArp < until) {
        const seq = current.tones;
        const idx = arpPos % (seq.length * 2 - 2);
        const n = idx < seq.length ? seq[idx] : seq[seq.length * 2 - 2 - idx];
        if (Math.random() > 0.12) pluck(nextArp, n);
        arpPos++;
        nextArp += arpStep;
      }
    },
    dispose() {
      padBreath.stop();
      for (const t of taps) t.l.stop();
      for (const o of padOscs) { try { o.stop(); } catch (_) { /* already stopped */ } }
      for (const o of live) { try { o.stop(); } catch (_) { /* already stopped */ } }
    },
  };
}

/** 98.7 - motorik pulse, road noise, and cars going the other way. */
function buildHighway(ctx, bus) {
  const out = gain(ctx, 0);

  // Road bed: lowpassed noise plus a narrow rumble band.
  const roadSrc = ctx.createBufferSource();
  roadSrc.buffer = bus.noise;
  roadSrc.loop = true;
  const roadLP = filter(ctx, 'lowpass', 380, 0.9);
  const roadG = gain(ctx, 0.24);
  const rumble = filter(ctx, 'bandpass', 115, 1.2);
  const rumbleG = gain(ctx, 0.16);
  roadSrc.connect(roadLP).connect(roadG).connect(out);
  roadSrc.connect(rumble).connect(rumbleG).connect(out);
  const surface = lfo(ctx, 0.07, 110, roadLP.frequency);
  roadSrc.start();

  // Ticks share one gated noise path through a bright bandpass.
  const tickSrc = ctx.createBufferSource();
  tickSrc.buffer = bus.noise;
  tickSrc.loop = true;
  const tickBP = filter(ctx, 'bandpass', 4200, 2.4);
  const tickGate = gain(ctx, 0);
  const tickPan = panner(ctx, 0.25);
  tickSrc.connect(tickBP).connect(tickGate).connect(tickPan).connect(out);
  tickSrc.start();

  // Passing cars get their own noise voice so a sweep can overlap the bed.
  const carSrc = ctx.createBufferSource();
  carSrc.buffer = bus.noise;
  carSrc.loop = true;
  const carBP = filter(ctx, 'bandpass', 600, 1.6);
  const carG = gain(ctx, 0);
  const carPan = panner(ctx, -1);
  carSrc.connect(carBP).connect(carG).connect(carPan).connect(out);
  carSrc.start();

  const send = gain(ctx, 0.16);
  out.connect(send).connect(bus.revShort);
  out.connect(bus.stationBus);

  const beat = 60 / 132;
  let nextBeat = ctx.currentTime + 0.15;
  let beatIdx = 0;
  let nextCar = ctx.currentTime + rnd(4, 12);
  const live = [];

  function kick(when) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(118, when);
    o.frequency.exponentialRampToValueAtTime(46, when + 0.11);
    const env = gain(ctx, 0);
    o.connect(env).connect(out);
    ping(env.gain, when, 0.34, 0.004, 0.24);
    o.start(when);
    o.stop(when + 0.32);
    live.push(o);
    o.onended = () => env.disconnect();
    ping(tickGate.gain, when, 0.06, 0.002, 0.012);
  }

  return {
    out,
    tick(until) {
      while (nextBeat < until) {
        kick(nextBeat);
        ping(tickGate.gain, nextBeat + beat * 0.5, 0.035, 0.002, 0.03);
        if (beatIdx % 4 === 3) ping(tickGate.gain, nextBeat + beat * 0.75, 0.028, 0.002, 0.02);
        beatIdx++;
        nextBeat += beat;
      }
      while (nextCar < until) {
        const dur = rnd(1.8, 3.2);
        const leftToRight = Math.random() < 0.5;
        const t0 = nextCar;
        carPan.pan.setValueAtTime(leftToRight ? -1 : 1, t0);
        carPan.pan.linearRampToValueAtTime(leftToRight ? 1 : -1, t0 + dur);
        // Doppler: the band centre falls as the car goes past.
        carBP.frequency.setValueAtTime(rnd(700, 950), t0);
        carBP.frequency.exponentialRampToValueAtTime(rnd(260, 380), t0 + dur);
        const g = carG.gain;
        g.setValueAtTime(0.0001, t0);
        g.exponentialRampToValueAtTime(rnd(0.1, 0.22), t0 + dur * 0.45);
        g.exponentialRampToValueAtTime(0.0001, t0 + dur);
        nextCar += rnd(6.5, 21);
      }
    },
    dispose() {
      surface.stop();
      for (const s of [roadSrc, tickSrc, carSrc]) { try { s.stop(); } catch (_) { /* already stopped */ } }
      for (const o of live) { try { o.stop(); } catch (_) { /* already stopped */ } }
    },
  };
}

/** 101.3 - shortwave. Not music. Heterodynes, morse, and an ionosphere. */
function buildShortwave(ctx, bus) {
  const out = gain(ctx, 0);
  // The whole station sits behind a fade gain that drifts on its own, which is
  // what makes it feel like a signal bouncing off a moving ionosphere.
  const fade = gain(ctx, 0.6);
  fade.connect(out);

  const bedSrc = ctx.createBufferSource();
  bedSrc.buffer = bus.noise;
  bedSrc.loop = true;
  const bedBP = filter(ctx, 'bandpass', 1400, 3.2);
  const bedG = gain(ctx, 0.1);
  bedSrc.connect(bedBP).connect(bedG).connect(fade);
  bedSrc.start();

  // Two drifting carriers beating against each other.
  const carriers = [];
  for (let i = 0; i < 2; i++) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = rnd(500, 1800);
    const g = gain(ctx, 0);
    o.connect(g).connect(fade);
    o.start();
    carriers.push({ osc: o, gain: g, next: ctx.currentTime + rnd(0.2, 2) });
  }

  // Morse key: one gated sine with soft edges so it never clicks.
  const key = ctx.createOscillator();
  key.type = 'sine';
  key.frequency.value = 620;
  const keyGate = gain(ctx, 0);
  const keyLP = filter(ctx, 'lowpass', 2400, 0.7);
  key.connect(keyGate).connect(keyLP).connect(fade);
  key.start();

  const send = gain(ctx, 0.22);
  out.connect(send).connect(bus.revShort);
  out.connect(bus.stationBus);

  let nextMorse = ctx.currentTime + rnd(1, 5);
  let nextFade = ctx.currentTime + 1;

  function sendMorse(when) {
    const DOT = 0.068;
    let t = when;
    const letters = 2 + ((Math.random() * 5) | 0);
    for (let l = 0; l < letters; l++) {
      const symbols = 1 + ((Math.random() * 4) | 0);
      for (let s = 0; s < symbols; s++) {
        const len = Math.random() < 0.45 ? DOT * 3 : DOT;
        keyGate.gain.setValueAtTime(0, t);
        keyGate.gain.linearRampToValueAtTime(0.09, t + 0.004);
        keyGate.gain.setValueAtTime(0.09, t + len);
        keyGate.gain.linearRampToValueAtTime(0, t + len + 0.005);
        t += len + DOT;
      }
      t += DOT * 2;
    }
    return t;
  }

  return {
    out,
    tick(until) {
      for (const c of carriers) {
        while (c.next < until) {
          c.osc.frequency.setTargetAtTime(rnd(420, 2600), c.next, rnd(0.4, 1.6));
          c.gain.gain.setTargetAtTime(Math.random() < 0.35 ? 0.0 : rnd(0.012, 0.055), c.next, rnd(0.5, 2.2));
          c.next += rnd(0.9, 3.4);
        }
      }
      while (nextMorse < until) {
        const end = sendMorse(nextMorse);
        nextMorse = end + rnd(3.5, 13);
      }
      while (nextFade < until) {
        fade.gain.setTargetAtTime(rnd(0.22, 1.0), nextFade, 1.3);
        bedBP.frequency.setTargetAtTime(rnd(800, 2300), nextFade, 1.8);
        nextFade += rnd(2.6, 7.5);
      }
    },
    dispose() {
      try { bedSrc.stop(); } catch (_) { /* already stopped */ }
      try { key.stop(); } catch (_) { /* already stopped */ }
      for (const c of carriers) { try { c.osc.stop(); } catch (_) { /* already stopped */ } }
    },
  };
}

/** 104.5 - almost nothing. A drone, the room, and one bell. */
function buildFourAM(ctx, bus) {
  const out = gain(ctx, 0);

  const droneFilter = filter(ctx, 'lowpass', 420, 1.4);
  const droneGain = gain(ctx, 0.15);
  droneFilter.connect(droneGain).connect(out);
  const breath = lfo(ctx, 0.048, 0.045, droneGain.gain);
  const droneOscs = [];
  for (const [freq, cents, type] of [
    [82.41, -4, 'triangle'],
    [82.41, 5, 'sine'],
    [123.47, 2, 'sine'],
  ]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = cents;
    o.connect(droneFilter);
    o.start();
    droneOscs.push(o);
  }

  // Room tone: the air in an empty apartment.
  const roomSrc = ctx.createBufferSource();
  roomSrc.buffer = bus.noise;
  roomSrc.loop = true;
  const roomLP = filter(ctx, 'lowpass', 240, 0.7);
  const roomHP = filter(ctx, 'highpass', 45, 0.7);
  const roomG = gain(ctx, 0.06);
  roomSrc.connect(roomLP).connect(roomHP).connect(roomG).connect(out);
  roomSrc.start();

  const send = gain(ctx, 0.75);
  out.connect(send).connect(bus.revLong);
  out.connect(bus.stationBus);

  let nextBell = ctx.currentTime + rnd(3, 9);
  const live = [];

  function bell(when) {
    const base = pick([392, 440, 523.25]);
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = base;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = base * 2.76; // inharmonic ratio, the classic FM bell
    const depth = gain(ctx, base * 1.8);
    mod.connect(depth).connect(car.frequency);
    const env = gain(ctx, 0);
    const pan = panner(ctx, rnd(-0.3, 0.3));
    car.connect(env).connect(pan).connect(out);
    ping(env.gain, when, 0.11, 0.004, 6.5);
    depth.gain.setValueAtTime(base * 1.8, when);
    depth.gain.exponentialRampToValueAtTime(base * 0.01, when + 1.4);
    car.start(when);
    mod.start(when);
    car.stop(when + 7.2);
    mod.stop(when + 7.2);
    live.push(car, mod);
    car.onended = () => { env.disconnect(); pan.disconnect(); depth.disconnect(); };
  }

  return {
    out,
    tick(until) {
      while (nextBell < until) {
        bell(nextBell);
        nextBell += rnd(17, 26);
      }
    },
    dispose() {
      breath.stop();
      try { roomSrc.stop(); } catch (_) { /* already stopped */ }
      for (const o of droneOscs) { try { o.stop(); } catch (_) { /* already stopped */ } }
      for (const o of live) { try { o.stop(); } catch (_) { /* already stopped */ } }
    },
  };
}

/* ------------------------------------------------------------------ */
/* The receiver                                                        */
/* ------------------------------------------------------------------ */

const IDLE_DISPOSE_MS = 1200;
const AUDIBLE_FLOOR = 0.0015;

export class Receiver {
  constructor() {
    this.ctx = null;
    this.running = false;
    this.volume = 0.75;
    this.muted = false;
    this._alive = new Map();   // stationId -> { inst, meta, idleSince }
    this._pump = null;
    this._meterBuf = null;
    this._freq = 92.6;
    this._epoch = 0;   // bumped on every stop, so a late teardown cannot
                       // dismantle a receiver that has been switched back on
  }

  /** Must be called from inside a user gesture handler. */
  async start() {
    if (this.running) return true;
    this._epoch++;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    if (!this.ctx) this.ctx = new Ctor({ latencyHint: 'interactive' });
    try {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch (_) {
      return false;
    }
    if (this.ctx.state !== 'running') return false;

    if (!this.bus) this._buildMaster();
    if (!this.music) this._buildMusic();
    this.running = true;

    // Fade the master up rather than switching it on, so nothing clicks.
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.linearRampToValueAtTime(this._targetVolume(), now + 0.5);

    this._stopStatic();   // in case a previous fade-out has not landed yet
    this._startStatic();
    this._pump = setInterval(() => this._schedule(), 40);
    return true;
  }

  stop() {
    if (!this.running || !this.ctx) return;
    this.running = false;
    this._epoch++;
    const epoch = this._epoch;
    clearInterval(this._pump);
    this._pump = null;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.0001, now + 0.28);
    // Power off has to stop the elements too, not just fade the master, or a
    // track would keep running silently behind a receiver that is switched off.
    for (const k in (this.music || {})) {
      if (this.music[k]) this.music[k].stop({ fade: 0.25 });
    }
    // Tear everything down after the fade completes, never during it, and
    // never if the listener has already switched the receiver back on.
    setTimeout(() => {
      if (this._epoch !== epoch) return;
      for (const [id, entry] of this._alive) {
        entry.inst.dispose();
        entry.inst.out.disconnect();
        this._alive.delete(id);
      }
      this._stopStatic();
    }, 340);
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    this._applyVolume();
  }

  setMuted(m) {
    this.muted = !!m;
    this._applyVolume();
  }

  _targetVolume() {
    // Perceptual curve: a linear slider on a gain node sounds top heavy.
    return this.muted ? 0.0001 : Math.max(0.0001, Math.pow(this.volume, 1.8) * 1.5);
  }

  _applyVolume() {
    if (!this.ctx || !this.running) return;
    this.master.gain.setTargetAtTime(this._targetVolume(), this.ctx.currentTime, 0.04);
  }

  _buildMaster() {
    const ctx = this.ctx;

    this.master = gain(ctx, 0.0001);
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 22;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.22;

    this.preMaster = gain(ctx, 1);
    this.preMaster.connect(this.compressor).connect(this.master).connect(ctx.destination);

    // The signal meter taps the station bus, not the master: it reports how
    // strong the received programme is, so muting the radio does not fake a
    // dead antenna, and pure static does not read as a strong signal.
    this.stationBus = gain(ctx, 1);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    this._meterBuf = new Uint8Array(this.analyser.fftSize);
    this.stationBus.connect(this.analyser);
    this.stationBus.connect(this.preMaster);

    // Two procedural spaces: a small room and a long hall.
    this.revShort = gain(ctx, 1);
    const convShort = ctx.createConvolver();
    convShort.buffer = makeImpulse(ctx, 1.3, 3.4, 0.42);
    this.revShort.connect(convShort).connect(gain(ctx, 0.9)).connect(this.preMaster);

    this.revLong = gain(ctx, 1);
    const convLong = ctx.createConvolver();
    convLong.buffer = makeImpulse(ctx, 3.6, 2.6, 0.24);
    this.revLong.connect(convLong).connect(gain(ctx, 0.85)).connect(this.preMaster);

    this.noise = noiseBuffer(ctx, 4);
    this.bus = {
      noise: this.noise,
      stationBus: this.stationBus,
      revShort: this.revShort,
      revLong: this.revLong,
    };
  }

  /* Into the station bus, so the signal meter reads a track exactly as it
   * reads a synthesised programme, and into the short room the same way.
   * These are receiver-side, not station-side: one receiver, one front end.
   */
  _buildMusic() {
    this.music = {};
    for (const meta of MUSIC_STATIONS) {
      this.music[meta.track] = new RoomMusic(this.ctx, {
        profile: SLOT_MEDIUM[`midnight-dial__${meta.track}`],
        destination: this.stationBus,
        reverbSend: this.revShort,
      });
    }
    Promise.all(MUSIC_STATIONS.map((meta) => this.music[meta.track]
      .load(`assets/audio/${meta.track}.mp3`)
      .catch(() => { this.music[meta.track] = null; })))
      .then(() => { this.musicReady = true; this.tune(this._freq); });
  }

  /** Interstation noise plus the heterodyne whistle at the edge of lock. */
  _startStatic() {
    const ctx = this.ctx;
    this.staticSrc = ctx.createBufferSource();
    this.staticSrc.buffer = this.noise;
    this.staticSrc.loop = true;
    this.staticBP = filter(ctx, 'bandpass', 2200, 0.6);
    this.staticHP = filter(ctx, 'highpass', 260, 0.7);
    this.staticGain = gain(ctx, 0.0001);
    this.staticSrc
      .connect(this.staticBP)
      .connect(this.staticHP)
      .connect(this.staticGain)
      .connect(this.preMaster);
    this.staticSrc.start();

    // Two beat oscillators a little apart so the whistle warbles.
    this.hetGain = gain(ctx, 0.0001);
    this.hetGain.connect(this.preMaster);
    this.hets = [];
    for (const mult of [1, 1.48]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 900 * mult;
      const g = gain(ctx, mult === 1 ? 1 : 0.4);
      o.connect(g).connect(this.hetGain);
      o.start();
      this.hets.push({ osc: o, mult });
    }
  }

  _stopStatic() {
    try { this.staticSrc.stop(); this.staticSrc.disconnect(); } catch (_) { /* nothing running */ }
    try { this.staticGain.disconnect(); this.hetGain.disconnect(); } catch (_) { /* nothing running */ }
    for (const h of this.hets || []) { try { h.osc.stop(); } catch (_) { /* nothing running */ } }
    this.hets = [];
    this.staticSrc = null;
  }

  /**
   * Tune to a dial position. Called every animation frame with the needle's
   * physical position, not the raw input, so the audio follows the needle.
   */
  tune(freq) {
    this._freq = freq;
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    let strongest = 0;
    let edge = 0;

    for (const meta of STATIONS) {
      const sig = stationSignal(freq, meta.freq);
      if (sig > strongest) strongest = sig;
      // The whistle peaks while a station is arriving, not once it has landed.
      const e = Math.sin(clamp(sig, 0, 1) * Math.PI) * (sig < 0.92 ? 1 : 0);
      if (e > edge) {
        edge = e;
        this._edgeStation = meta;
      }

      // A station carrying a track is tuned the same way, it just does not
      // have a graph to build and tear down: the element stays, the fader
      // moves with the signal, and it pauses once it is out of range.
      if (meta.track) {
        const m = this.music && this.music[meta.track];
        if (m) {
          const g = sig * MUSIC_TOP;
          if (g > 0.004) {
            clearTimeout(m._pauseTimer);
            m.play({ level: g, fade: 0.45 });
          } else if (m.playing) {
            m.stop({ fade: 0.5 });
          }
        }
        continue;
      }

      const entry = this._alive.get(meta.id);
      if (sig > AUDIBLE_FLOOR) {
        if (!entry) {
          const inst = meta.build(ctx, this.bus);
          this._alive.set(meta.id, { inst, meta, idleSince: 0 });
          inst.out.gain.setValueAtTime(0.0001, now);
          inst.tick(now + 0.4);
          inst.out.gain.setTargetAtTime(sig * meta.trim, now, 0.08);
        } else {
          entry.idleSince = 0;
          entry.inst.out.gain.setTargetAtTime(sig * meta.trim, now, 0.06);
        }
      } else if (entry) {
        entry.inst.out.gain.setTargetAtTime(0.0001, now, 0.12);
        if (!entry.idleSince) entry.idleSince = performance.now();
      }
    }

    // Static: loud between stations, narrowing and receding as one arrives.
    const noiseLevel = (1 - strongest * 0.97) * 0.12 + 0.002;
    this.staticGain.gain.setTargetAtTime(noiseLevel, now, 0.05);
    this.staticBP.frequency.setTargetAtTime(2300 - strongest * 1250, now, 0.08);
    this.staticBP.Q.setTargetAtTime(0.6 + strongest * 5.5, now, 0.08);

    const hetFreq = 320 + (1 - edge) * 3400 + Math.sin(now * 0.7) * 40;
    for (const h of this.hets) {
      h.osc.frequency.setTargetAtTime(hetFreq * h.mult, now, 0.06);
    }
    this.hetGain.gain.setTargetAtTime(Math.pow(edge, 2.2) * 0.035 + 0.0001, now, 0.07);
  }

  /** Runs on a timer, not on frames, so scheduling survives a busy main thread. */
  _schedule() {
    if (!this.running || !this.ctx) return;
    const until = this.ctx.currentTime + 0.25;
    const nowMs = performance.now();
    for (const [id, entry] of this._alive) {
      if (entry.idleSince && nowMs - entry.idleSince > IDLE_DISPOSE_MS) {
        entry.inst.dispose();
        entry.inst.out.disconnect();
        this._alive.delete(id);
        continue;
      }
      entry.inst.tick(until);
    }
  }

  /** How many station graphs currently exist. Exposed for the readout. */
  get liveCount() {
    return this._alive.size;
  }

  /** RMS of the received programme, 0..1, already shaped like a VU scale. */
  readMeter() {
    if (!this.running || !this.analyser) return 0;
    this.analyser.getByteTimeDomainData(this._meterBuf);
    let sum = 0;
    for (let i = 0; i < this._meterBuf.length; i++) {
      const v = (this._meterBuf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this._meterBuf.length);
    const db = 20 * Math.log10(rms + 1e-6);
    return clamp((db + 52) / 44, 0, 1);
  }
}
