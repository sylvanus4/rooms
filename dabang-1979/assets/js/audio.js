/**
 * audio.js - the synthesis engine for a tearoom in 1979.
 *
 * Nothing here is a recording. Every sound but the record on the turntable,
 * which is a generated file played through room-music.js, is written at runtime from
 * oscillators, noise rendered into AudioBuffers, biquad filters, a waveshaper
 * standing in for an output transformer, and a convolution reverb whose impulse
 * response is generated from decaying, stereo-decorrelated noise. The page
 * makes no network request beyond its own files.
 *
 * Signal flow
 *
 *   record bus ─ surface noise ┐
 *                crackle      ├─> recordIn ─> tubeShaper ─> ampTone ─> ampOut ─┐
 *                music voices ┘                    ▲                           │
 *                                            humOsc 60/120/180/240             │
 *                                                                              │
 *   room bus   ─ hubbub, cups, spoons, coins,  ─> roomTone(lowpass) ─> roomOut ─┤
 *                match, door chime                                              │
 *                                                                              ├─> preMaster
 *   booth bus  ─ paper, mic click, announcer,  ─> boothTone ────────> boothOut ─┤
 *                stylus drop, tonearm thunk                                     │
 *                                                                              │
 *   each bus ─> sendShort ─> convolverTile (0.9 s small tiled room) ────────────┤
 *            └> sendLong  ─> convolverHall (2.4 s, the tail a slip can buy) ────┘
 *
 *   preMaster ─> DynamicsCompressor(-8 dB, 4:1) ─> masterGain ─> destination
 *
 * The room is always playing when you arrive. A request slip does not start the
 * music, it re-mixes it: tempo, which instruments answer, how loud the room
 * talks over the record, how much of the announcer's microphone bleeds into the
 * room, and how long the tail is.
 *
 * Musical key is A minor throughout, pentatonic A C D E G, at 92 BPM with a
 * 62 BPM variant, so the ambience and the record share one key.
 */

import { RoomMusic, SLOT_MEDIUM } from './room-music.js';

/* ------------------------------------------------------------------ */
/* The slip, and what each answer does to the mix                      */
/* ------------------------------------------------------------------ */

/**
 * Three questions, four answers each: 64 rooms. The numbers are the whole
 * mechanic, so they live in one table rather than being scattered through the
 * builders. `reed` is the accordion-like answering voice, which is the single
 * most recognisable signature of the genre and never drops to zero.
 */
export const SLIP = {
  mood: {
    slow:  { bpm: 62, reed: 1.05, brass: 0.22, walk: 0, kit: 0.5, wetShort: 0.30, wetLong: 0.40 },
    brass: { bpm: 92, reed: 0.72, brass: 1.00, walk: 0.5, kit: 0.85, wetShort: 0.34, wetLong: 0.16 },
    dance: { bpm: 92, reed: 0.88, brass: 0.62, walk: 1, kit: 1.00, wetShort: 0.30, wetLong: 0.10 },
    quiet: { bpm: 62, reed: 1.15, brass: 0.08, walk: 0, kit: 0.30, wetShort: 0.26, wetLong: 0.58 },
  },
  note: {
    goodbye:  { announce: 3.1, bleed: 1.00, hush: 0.72, chime: 0 },
    birthday: { announce: 2.2, bleed: 0.72, hush: 1.30, chime: 1 },
    weather:  { announce: 1.5, bleed: 0.48, hush: 0.58, chime: 0, longAdd: 0.12 },
    nothing:  { announce: 0.9, bleed: 0.26, hush: 1.00, chime: 0 },
  },
  who: {
    across:   { room: 0.80, record: 1.00, tone: 6200, events: 1.00, longAdd: 0 },
    everyone: { room: 1.58, record: 1.14, tone: 7600, events: 1.75, longAdd: 0.02 },
    myself:   { room: 0.42, record: 0.90, tone: 2600, events: 0.55, longAdd: -0.05 },
    absent:   { room: 0.24, record: 0.58, tone: 1800, events: 0.38, longAdd: 0.18 },
  },
};

export const DEFAULT_SLIP = { mood: 'brass', note: 'nothing', who: 'across' };

/**
 * Which record the DJ box actually puts on the turntable.
 *
 * The slip is this room's only mechanic, so the record has to follow the slip
 * rather than a player control: the horns and the dance floor ask for the
 * up-tempo pressing, slow and quiet ask for the ballad, and a goodbye is this
 * room's own closing-time vocabulary, so it gets the last-call record. A
 * fourth slip gets it too — by the fourth request of a sitting the tearoom is
 * winding down whatever you wrote.
 */
export const MUSIC_SLOTS = ['request-1', 'request-2', 'last-call'];

export function musicSlot(slip, slipsSoFar = 1) {
  if (slip.note === 'goodbye' || slipsSoFar >= 4) return 'last-call';
  return slip.mood === 'brass' || slip.mood === 'dance' ? 'request-1' : 'request-2';
}

/** Fold the three answers into one flat mix description. */
export function resolveMix(slip) {
  const m = SLIP.mood[slip.mood] || SLIP.mood.brass;
  const n = SLIP.note[slip.note] || SLIP.note.nothing;
  const w = SLIP.who[slip.who] || SLIP.who.across;
  return {
    bpm: m.bpm,
    reed: m.reed,
    brass: m.brass,
    walk: m.walk,
    kit: m.kit,
    record: w.record,
    room: w.room * n.hush,
    roomTone: w.tone,
    events: w.events * (n.chime ? 1.25 : 1),
    chime: n.chime,
    bleed: n.bleed,
    announce: n.announce,
    wetShort: m.wetShort,
    wetLong: clamp(m.wetLong + (n.longAdd || 0) + (w.longAdd || 0), 0.04, 0.8),
  };
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

/** A minor pentatonic. Every pitched voice in the piece draws from this. */
const PENT = {
  bass: [55.0, 65.41, 73.42, 82.41, 98.0],           // A1 C2 D2 E2 G2
  mid: [220.0, 261.63, 293.66, 329.63, 392.0],        // A3 C4 D4 E4 G4
  lead: [440.0, 523.25, 587.33, 659.25, 783.99, 880], // A4 .. A5
};

/** Four bars: Am, Dm, E, Am. Roots stay inside the pentatonic set. */
const CHORDS = [
  { root: 55.0, fifth: 82.41, colour: [220.0, 261.63, 329.63] },
  { root: 73.42, fifth: 110.0, colour: [293.66, 349.23, 440.0] },
  { root: 82.41, fifth: 123.47, colour: [329.63, 415.3, 493.88] },
  { root: 55.0, fifth: 82.41, colour: [220.0, 261.63, 329.63] },
];

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
 * Procedural impulse response. The tail is one-pole damped so it darkens as it
 * decays, and the two channels are generated independently so it reads as a
 * space rather than as a filter. The early reflections are placed at different
 * times per channel, which is what gives the small version its tiled slap.
 */
function makeImpulse(ctx, seconds, decay, damping, reflect) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    const pre = Math.floor(ctx.sampleRate * (ch === 0 ? 0.006 : 0.009));
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const white = Math.random() * 2 - 1;
      lp += (white - lp) * damping;
      d[i] = i < pre ? 0 : lp * Math.pow(1 - t, decay);
    }
    const taps = ch === 0 ? [0.009, 0.017, 0.028, 0.041] : [0.011, 0.021, 0.033, 0.046];
    taps.forEach((s, k) => {
      const idx = Math.floor(s * ctx.sampleRate);
      if (idx < len) d[idx] += (Math.random() * 2 - 1) * reflect * (1 - k * 0.2);
    });
  }
  return buf;
}

/** tanh transfer curve: the soft knee of a small valve amplifier driven warm. */
function tubeCurve(drive = 2.1, n = 2048) {
  const c = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    // asymmetry: valves clip the two halves of the wave differently, which is
    // where the even harmonics that read as "warm" actually come from.
    const a = x >= 0 ? drive : drive * 0.78;
    c[i] = Math.tanh(x * a) / norm;
  }
  return c;
}

function gain(ctx, v = 1) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function filter(ctx, type, freq, q = 1, dbGain) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  if (dbGain !== undefined) f.gain.value = dbGain;
  return f;
}

function panner(ctx, pan = 0) {
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  return p;
}

function lfo(ctx, rate, depth, target, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = rate;
  const d = gain(ctx, depth);
  o.connect(d).connect(target);
  o.start();
  return o;
}

/** Percussive envelope written directly onto a gain param. */
function ping(param, when, peak, attack, decay) {
  const p = Math.max(peak, 0.0002);
  param.cancelScheduledValues(when);
  param.setValueAtTime(0.0001, when);
  param.exponentialRampToValueAtTime(p, when + attack);
  param.exponentialRampToValueAtTime(0.0001, when + attack + decay);
}

/** One slice of the shared noise buffer, played once and self-disposing. */
function noiseGrain(ctx, buf, when, dur, rate = 1) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.playbackRate.value = rate;
  s.start(when, Math.random() * (buf.duration - 0.5));
  s.stop(when + dur + 0.05);
  return s;
}

/* ------------------------------------------------------------------ */
/* The record: surface, crackle, and the one musical layer             */
/* ------------------------------------------------------------------ */

/**
 * Everything that comes out of the loudspeaker. The music is a trot-flavoured
 * instrumental: a reed voice answering on the offbeat, brass-ish stabs, a
 * walking upright bass and a soft two-beat brushed kit, all in A minor.
 */
function buildRecord(ctx, bus) {
  const out = gain(ctx, 1);
  const music = gain(ctx, 0.85);
  music.connect(out);

  /* --- LP surface: broadband hiss riding under everything ------------- */
  const surf = ctx.createBufferSource();
  surf.buffer = bus.noise;
  surf.loop = true;
  const surfHP = filter(ctx, 'highpass', 1300, 0.6);
  const surfLP = filter(ctx, 'lowpass', 7600, 0.7);
  const surfGain = gain(ctx, 0.016);
  surf.connect(surfHP).connect(surfLP).connect(surfGain).connect(out);
  surf.start();
  // One rotation of a 33 rpm disc is 1.81 s, so a warped copy breathes at
  // 0.55 Hz. Modulating the hiss level at exactly that rate is what makes it
  // sound like a turning disc instead of a hiss generator.
  lfo(ctx, 0.552, 0.004, surfGain.gain);

  /* --- Crackle: a gated noise path plus isolated pops ----------------- */
  const crSrc = ctx.createBufferSource();
  crSrc.buffer = bus.noise;
  crSrc.loop = true;
  const crHP = filter(ctx, 'highpass', 2200, 0.7);
  const crGate = gain(ctx, 0.0001);
  crSrc.connect(crHP).connect(crGate).connect(out);
  crSrc.start();

  const popBP = filter(ctx, 'bandpass', 900, 1.1);
  const popGain = gain(ctx, 0.0001);
  popBP.connect(popGain).connect(out);

  /* --- Music voices --------------------------------------------------- */
  const bassGain = gain(ctx, 0.9);
  const reedGain = gain(ctx, 0.0001);
  const brassGain = gain(ctx, 0.0001);
  const kitGain = gain(ctx, 0.0001);
  for (const g of [bassGain, reedGain, brassGain, kitGain]) g.connect(music);

  // Brushed kit: a continuous swirl of bandpassed noise whose level is written
  // on every eighth note, plus a rim on the backbeat. A swirl that does not
  // move is a hiss; the level writing is the brush.
  const swirlSrc = ctx.createBufferSource();
  swirlSrc.buffer = bus.noise;
  swirlSrc.loop = true;
  const swirlBP = filter(ctx, 'bandpass', 4200, 0.9);
  const swirlLev = gain(ctx, 0.0001);
  swirlSrc.connect(swirlBP).connect(swirlLev).connect(kitGain);
  swirlSrc.start();

  const state = {
    bpm: 92, reed: 0.7, brass: 1, walk: 0.5, kit: 0.85,
    step: 0, next: 0, crackle: 1, nextPop: 0, nextCrackle: 0,
  };

  function bassNote(t, freq, dur) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 1.02, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
    const lp = filter(ctx, 'lowpass', 240, 1.2);
    const g = gain(ctx, 0.0001);
    o.connect(lp).connect(g).connect(bassGain);
    ping(g.gain, t, 0.5, 0.012, dur);
    o.start(t);
    o.stop(t + dur + 0.1);
    // the finger leaving the string
    const cl = noiseGrain(ctx, bus.noise, t, 0.03);
    const clF = filter(ctx, 'bandpass', 1600, 1.4);
    const clG = gain(ctx, 0.0001);
    cl.connect(clF).connect(clG).connect(bassGain);
    ping(clG.gain, t, 0.055, 0.001, 0.028);
  }

  /**
   * The reed. Two saws six cents apart through a narrow bandpass and a fixed
   * formant peak: that pair is what separates a free reed from a synth lead.
   * Attack is slow enough to hear the bellows take the note.
   */
  function reedNote(t, freq, dur, level) {
    const g = gain(ctx, 0.0001);
    const bp = filter(ctx, 'bandpass', freq * 2.4, 2.2);
    const fm = filter(ctx, 'peaking', 1180, 1.6, 9);
    const hp = filter(ctx, 'highpass', 220, 0.7);
    bp.connect(fm).connect(hp).connect(g).connect(reedGain);
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 5.4;
    const vibDepth = gain(ctx, freq * 0.004);
    vib.connect(vibDepth);
    vib.start(t);
    vib.stop(t + dur + 0.3);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      vibDepth.connect(o.frequency);
      o.connect(bp);
      o.start(t);
      o.stop(t + dur + 0.25);
    }
    const p = Math.max(level * 0.34, 0.0003);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + 0.045);
    g.gain.setValueAtTime(p, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.18);
  }

  /** Brass stab: sawtooth pair under a fast downward filter sweep. */
  function brassStab(t, freq, level) {
    const g = gain(ctx, 0.0001);
    const lp = filter(ctx, 'lowpass', 320, 4.5);
    lp.connect(g).connect(brassGain);
    lp.frequency.setValueAtTime(340, t);
    lp.frequency.exponentialRampToValueAtTime(2900, t + 0.035);
    lp.frequency.exponentialRampToValueAtTime(520, t + 0.28);
    for (const [mult, det] of [[1, -4], [1, 5], [1.5, 3]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq * mult;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + 0.42);
    }
    ping(g.gain, t, level * 0.2, 0.014, 0.24);
  }

  function rim(t, level) {
    const s = noiseGrain(ctx, bus.noise, t, 0.09);
    const bp = filter(ctx, 'bandpass', 1900, 2.4);
    const g = gain(ctx, 0.0001);
    s.connect(bp).connect(g).connect(kitGain);
    ping(g.gain, t, level * 0.22, 0.0015, 0.075);
  }

  function scheduleStep(t, i) {
    const bar = (i / 8) | 0;
    const ch = CHORDS[bar];
    const beat = i % 8;
    const spb = 60 / state.bpm;

    // Bass. Two-beat on 1 and 3, or a walk in quarters when the slip asked
    // for something to move to.
    if (beat === 0 || beat === 4) bassNote(t, beat === 0 ? ch.root : ch.fifth, spb * 0.8);
    else if (state.walk > 0.7 && (beat === 2 || beat === 6)) {
      bassNote(t, pick(PENT.bass), spb * 0.62);
    } else if (state.walk > 0.3 && beat === 6) {
      bassNote(t, ch.fifth * 0.75, spb * 0.55);
    }

    // Kit. The swirl is written every eighth so the brush actually sweeps.
    if (state.kit > 0.02) {
      const accent = beat === 2 || beat === 6 ? 1 : 0.42;
      const lv = state.kit * accent * 0.05;
      swirlLev.gain.setTargetAtTime(Math.max(lv, 0.0002), t, spb * 0.18);
      if (beat === 2 || beat === 6) rim(t, state.kit);
    }

    // The reed answers on the offbeat. This is the genre's signature, so it
    // lands on the "and" of 2 and the "and" of 4 and never on the downbeat.
    if (beat === 3 || beat === 7) {
      const alt = beat === 3 ? PENT.lead : PENT.mid;
      reedNote(t, pick(alt), spb * (state.bpm < 80 ? 1.1 : 0.7), state.reed);
    } else if (beat === 1 && state.reed > 0.95 && Math.random() < 0.4) {
      reedNote(t, pick(PENT.mid), spb * 0.5, state.reed * 0.6);
    }

    // Brass answers the reed on the beat before it.
    if (state.brass > 0.05 && (beat === 2 || (beat === 6 && state.brass > 0.5))) {
      brassStab(t, ch.colour[0] * 2, state.brass);
      if (state.brass > 0.8) brassStab(t + 0.012, ch.colour[2] * 2, state.brass * 0.7);
    }
    // A held sustain at the top of each four-bar cycle.
    if (state.brass > 0.5 && i === 24) brassStab(t, ch.colour[1] * 2, state.brass * 0.9);
  }

  return {
    out,
    setMix(mix) {
      state.bpm = mix.bpm;
      state.reed = mix.reed;
      state.brass = mix.brass;
      state.walk = mix.walk;
      state.kit = mix.kit;
      const now = ctx.currentTime;
      reedGain.gain.setTargetAtTime(0.9, now, 0.3);
      brassGain.gain.setTargetAtTime(0.8, now, 0.3);
      kitGain.gain.setTargetAtTime(0.75, now, 0.3);
    },
    /** Lift the stylus: everything the loudspeaker does drops away together. */
    lift(when) {
      music.gain.cancelScheduledValues(when);
      music.gain.setTargetAtTime(0.0001, when, 0.1);
      surfGain.gain.setTargetAtTime(0.0006, when, 0.12);
      state.crackle = 0.05;
    },
    /** Drop the stylus back: surface first, then the band. */
    drop(when) {
      surfGain.gain.setTargetAtTime(0.016, when, 0.05);
      music.gain.setTargetAtTime(0.85, when + 0.35, 0.25);
      state.crackle = 1;
      state.step = 0;
      state.next = when + 0.55;
    },
    tick(until) {
      const spb = 60 / state.bpm;
      const step = spb / 2;
      if (state.next < ctx.currentTime) state.next = ctx.currentTime + 0.05;
      while (state.next < until) {
        scheduleStep(state.next, state.step);
        state.step = (state.step + 1) % 32;
        state.next += step;
      }
      // crackle grains, Poisson-ish so they never fall on a grid
      while (state.nextCrackle < until) {
        ping(crGate.gain, state.nextCrackle, rnd(0.012, 0.05) * state.crackle, 0.0008, rnd(0.004, 0.02));
        state.nextCrackle += rnd(0.02, 0.16) / clamp(state.crackle, 0.1, 1);
      }
      // and the occasional isolated pop, the one a scratch makes
      while (state.nextPop < until) {
        ping(popGain.gain, state.nextPop, rnd(0.06, 0.16) * state.crackle, 0.001, rnd(0.03, 0.09));
        state.nextPop += rnd(2.2, 7.5);
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* The room: people, china, coins, matches, the door                   */
/* ------------------------------------------------------------------ */

function buildRoom(ctx, bus) {
  const out = gain(ctx, 1);

  /* --- Hubbub: five conversations, none of them intelligible ---------- */
  // Band-limited noise through a moving formant pair, gated on a syllable
  // rhythm. Understandable words would break the room, so the lowpass sits
  // under 1.5 kHz where consonants stop carrying meaning.
  const talkTone = filter(ctx, 'lowpass', 1450, 0.7);
  const talk = gain(ctx, 1);
  talk.connect(talkTone).connect(out);
  const voices = [];
  for (let i = 0; i < 5; i++) {
    const src = ctx.createBufferSource();
    src.buffer = bus.noise;
    src.loop = true;
    src.playbackRate.value = rnd(0.75, 1.25);
    const bp = filter(ctx, 'bandpass', rnd(380, 780), rnd(2.4, 4.2));
    const fmt = filter(ctx, 'peaking', rnd(900, 1600), 1.5, 10);
    const g = gain(ctx, 0.0001);
    const p = panner(ctx, rnd(-0.9, 0.9));
    src.connect(bp).connect(fmt).connect(g).connect(p).connect(talk);
    src.start(rnd(0, 2));
    voices.push({ g, bp, next: rnd(0, 3), phrase: 0, base: rnd(380, 780) });
  }

  /* --- China, spoons, coins, matches, door ---------------------------- */
  const events = gain(ctx, 1);
  events.connect(out);

  function cup(t, level) {
    // The bright 3-5 kHz transient of porcelain meeting a saucer, then a
    // short ring at a pentatonic partial so the china sits in the key.
    const s = noiseGrain(ctx, bus.noise, t, 0.05);
    const bp = filter(ctx, 'bandpass', rnd(3200, 5000), 3.2);
    const g = gain(ctx, 0.0001);
    const p = panner(ctx, rnd(-0.7, 0.7));
    s.connect(bp).connect(g).connect(p).connect(events);
    ping(g.gain, t, level * 0.21, 0.0012, rnd(0.03, 0.07));
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = pick(PENT.lead) * 2;
    const og = gain(ctx, 0.0001);
    o.connect(og).connect(p);
    ping(og.gain, t, level * 0.035, 0.002, rnd(0.14, 0.3));
    o.start(t);
    o.stop(t + 0.5);
  }

  function spoon(t, level) {
    const p = panner(ctx, rnd(-0.6, 0.6));
    p.connect(events);
    const n = 4 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const at = t + i * rnd(0.09, 0.17);
      const s = noiseGrain(ctx, bus.noise, at, 0.02);
      const bp = filter(ctx, 'bandpass', rnd(4200, 6400), 4);
      const g = gain(ctx, 0.0001);
      s.connect(bp).connect(g).connect(p);
      ping(g.gain, at, level * 0.055, 0.001, 0.014);
    }
  }

  function coins(t, level) {
    // Change on a wooden table: metal edges first, then the low knock of the
    // board taking the weight.
    const p = panner(ctx, rnd(-0.5, 0.5));
    p.connect(events);
    const n = 3 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const at = t + i * rnd(0.02, 0.075);
      const s = noiseGrain(ctx, bus.noise, at, 0.03);
      const bp = filter(ctx, 'bandpass', rnd(3400, 6200), 6);
      const g = gain(ctx, 0.0001);
      s.connect(bp).connect(g).connect(p);
      ping(g.gain, at, level * 0.13 * (1 - i * 0.12), 0.0008, rnd(0.02, 0.06));
      const wood = ctx.createOscillator();
      wood.type = 'sine';
      wood.frequency.setValueAtTime(rnd(150, 240), at);
      wood.frequency.exponentialRampToValueAtTime(90, at + 0.05);
      const wg = gain(ctx, 0.0001);
      wood.connect(wg).connect(p);
      ping(wg.gain, at, level * 0.07, 0.001, 0.045);
      wood.start(at);
      wood.stop(at + 0.12);
    }
  }

  function match(t, level) {
    // Scratch: noise through a bandpass climbing 2.6 -> 6.2 kHz in 70 ms.
    // Flare: a lowpassed swell that outlives the scratch by half a second.
    const p = panner(ctx, rnd(-0.45, 0.45));
    p.connect(events);
    const s = noiseGrain(ctx, bus.noise, t, 0.16, 1.4);
    const bp = filter(ctx, 'bandpass', 2600, 1.8);
    const g = gain(ctx, 0.0001);
    s.connect(bp).connect(g).connect(p);
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.exponentialRampToValueAtTime(6200, t + 0.07);
    bp.frequency.exponentialRampToValueAtTime(1800, t + 0.19);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level * 0.17, t + 0.012);
    g.gain.exponentialRampToValueAtTime(level * 0.05, t + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    const fl = noiseGrain(ctx, bus.noise, t + 0.04, 0.5);
    const flF = filter(ctx, 'lowpass', 900, 0.8);
    const flG = gain(ctx, 0.0001);
    fl.connect(flF).connect(flG).connect(p);
    ping(flG.gain, t + 0.04, level * 0.05, 0.05, 0.42);
  }

  function door(t, level) {
    // A shop bell: inharmonic partials at 1 / 2.76 / 5.41 / 8.93, struck
    // twice as the door swings. Fundamental is E5, inside the key.
    const p = panner(ctx, -0.55);
    p.connect(events);
    for (const [k, delay] of [[0, 0], [1, 0.13]]) {
      const at = t + delay;
      const amp = k === 0 ? 1 : 0.55;
      [1, 2.76, 5.41, 8.93].forEach((r, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 659.25 * r * rnd(0.998, 1.002);
        const g = gain(ctx, 0.0001);
        o.connect(g).connect(p);
        ping(g.gain, at, level * 0.09 * amp * Math.pow(0.62, i), 0.002, 2.6 - i * 0.55);
        o.start(at);
        o.stop(at + 3);
      });
      const s = noiseGrain(ctx, bus.noise, at, 0.02);
      const bp = filter(ctx, 'bandpass', 5200, 3);
      const g = gain(ctx, 0.0001);
      s.connect(bp).connect(g).connect(p);
      ping(g.gain, at, level * 0.05 * amp, 0.001, 0.015);
    }
  }

  const st = { events: 1, chime: 0, nextEvent: 0, nextDoor: 0 };

  return {
    out,
    trigger: { cup, spoon, coins, match, door },
    setMix(mix) {
      st.events = mix.events;
      st.chime = mix.chime;
    },
    tick(until) {
      // Conversation: each voice runs phrases of a few syllables with gaps.
      for (const v of voices) {
        while (v.next < until) {
          if (v.phrase <= 0) {
            v.phrase = 3 + ((Math.random() * 6) | 0);
            v.bp.frequency.setTargetAtTime(v.base * rnd(0.85, 1.2), v.next, 0.2);
          }
          const syl = rnd(0.075, 0.19);
          ping(v.g.gain, v.next, rnd(0.055, 0.14), syl * 0.35, syl * 0.65);
          v.phrase -= 1;
          v.next += syl + (v.phrase <= 0 ? rnd(0.6, 2.8) : rnd(0.01, 0.07));
        }
      }
      // China, coins, matches: Poisson arrivals whose rate the slip sets.
      while (st.nextEvent < until) {
        const r = Math.random();
        const lv = rnd(0.6, 1) * clamp(st.events, 0.2, 2);
        if (r < 0.44) cup(st.nextEvent, lv);
        else if (r < 0.7) spoon(st.nextEvent, lv);
        else if (r < 0.88) coins(st.nextEvent, lv);
        else match(st.nextEvent, lv);
        st.nextEvent += rnd(0.5, 3.4) / clamp(st.events, 0.25, 2);
      }
      while (st.nextDoor < until) {
        door(st.nextDoor, rnd(0.7, 1) * (st.chime ? 1.2 : 0.85));
        st.nextDoor += rnd(14, 34) / (st.chime ? 1.8 : 1);
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* The booth: paper, a microphone, a stylus, a tonearm                 */
/* ------------------------------------------------------------------ */

function buildBooth(ctx, bus) {
  const out = gain(ctx, 1);
  // The announcer's chain: a cheap dynamic microphone into a small valve
  // preamp. Highpassed hard, a presence peak, a ceiling at 4.6 kHz.
  const micTone = filter(ctx, 'highpass', 300, 0.7);
  const micPeak = filter(ctx, 'peaking', 2300, 1.2, 7);
  const micTop = filter(ctx, 'lowpass', 4600, 0.8);
  const micDrive = ctx.createWaveShaper();
  micDrive.curve = tubeCurve(2.6);
  micDrive.oversample = '2x';
  const micGain = gain(ctx, 0.0001);
  micTone.connect(micPeak).connect(micTop).connect(micDrive).connect(micGain).connect(out);

  const mech = gain(ctx, 1);
  mech.connect(out);

  function paper(t) {
    // Three crinkles, each a short burst of highpassed noise with a rising
    // then falling filter. A slip being opened is not one sound.
    const p = panner(ctx, 0.35);
    p.connect(mech);
    for (let i = 0; i < 3; i++) {
      const at = t + i * rnd(0.16, 0.27);
      const s = noiseGrain(ctx, bus.noise, at, 0.2, rnd(0.9, 1.3));
      const hp = filter(ctx, 'highpass', 2400, 0.8);
      const bp = filter(ctx, 'bandpass', rnd(3600, 5600), 1.4);
      const g = gain(ctx, 0.0001);
      s.connect(hp).connect(bp).connect(g).connect(p);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(rnd(0.04, 0.09), at + 0.02);
      g.gain.exponentialRampToValueAtTime(rnd(0.01, 0.03), at + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);
    }
  }

  function click(t) {
    // A switch closing into a live preamp: the contact, then the thump of
    // the stage settling.
    const s = noiseGrain(ctx, bus.noise, t, 0.02);
    const bp = filter(ctx, 'bandpass', 3100, 1.6);
    const g = gain(ctx, 0.0001);
    s.connect(bp).connect(g).connect(mech);
    ping(g.gain, t, 0.17, 0.0006, 0.012);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.09);
    const og = gain(ctx, 0.0001);
    o.connect(og).connect(mech);
    ping(og.gain, t, 0.11, 0.002, 0.1);
    o.start(t);
    o.stop(t + 0.2);
  }

  function announce(t, dur) {
    // The same no-words rule as the room, one octave of formant higher and
    // through the microphone chain, so it reads as a person on a PA.
    micGain.gain.setTargetAtTime(0.9, t, 0.04);
    let at = t + 0.12;
    const end = t + dur;
    while (at < end) {
      const s = noiseGrain(ctx, bus.noise, at, 0.26, rnd(0.8, 1.2));
      const bp = filter(ctx, 'bandpass', rnd(430, 820), 3.4);
      const fmt = filter(ctx, 'peaking', rnd(1250, 1900), 1.6, 11);
      const g = gain(ctx, 0.0001);
      s.connect(bp).connect(fmt).connect(g).connect(micTone);
      const syl = rnd(0.09, 0.22);
      ping(g.gain, at, rnd(0.18, 0.34), syl * 0.3, syl * 0.7);
      at += syl + (Math.random() < 0.18 ? rnd(0.18, 0.42) : rnd(0.01, 0.06));
    }
    micGain.gain.setTargetAtTime(0.0001, end + 0.15, 0.08);
  }

  function stylus(t) {
    // Needle meeting a moving groove: a low thump plus a rush of surface
    // noise that decays into the record's own hiss.
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.13);
    const og = gain(ctx, 0.0001);
    o.connect(og).connect(mech);
    ping(og.gain, t, 0.2, 0.003, 0.16);
    o.start(t);
    o.stop(t + 0.35);
    const s = noiseGrain(ctx, bus.noise, t, 0.4);
    const hp = filter(ctx, 'highpass', 1100, 0.8);
    const g = gain(ctx, 0.0001);
    s.connect(hp).connect(g).connect(mech);
    ping(g.gain, t, 0.12, 0.004, 0.34);
  }

  function tonearm(t) {
    // The mechanical thunk of the arm returning to its rest.
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(230, t);
    o.frequency.exponentialRampToValueAtTime(72, t + 0.07);
    const lp = filter(ctx, 'lowpass', 700, 1.4);
    const g = gain(ctx, 0.0001);
    o.connect(lp).connect(g).connect(mech);
    ping(g.gain, t, 0.19, 0.002, 0.12);
    o.start(t);
    o.stop(t + 0.3);
    const s = noiseGrain(ctx, bus.noise, t, 0.06);
    const bp = filter(ctx, 'bandpass', 1500, 1.2);
    const sg = gain(ctx, 0.0001);
    s.connect(bp).connect(sg).connect(mech);
    ping(sg.gain, t, 0.09, 0.001, 0.05);
  }

  return { out, paper, click, announce, stylus, tonearm };
}

/* ------------------------------------------------------------------ */
/* The engine                                                          */
/* ------------------------------------------------------------------ */

const LOOKAHEAD = 0.26;
const TICK_MS = 40;

/* The record is the thing you asked for, so it sits above the room rather than
 * under it, but not so far above that the room stops being audible around it.
 * Measured against the 0.20 RMS ceiling the rest of the piece is trimmed to. */
const MUSIC_TOP = 0.34;

export class Dabang {
  constructor() {
    this.ctx = null;
    this.running = false;
    this.muted = false;
    this.volume = 0.72;
    this.mix = resolveMix(DEFAULT_SLIP);
    this._timer = null;
    this.slips = 0;
    this.musicReady = false;
    this._musicSlot = musicSlot(DEFAULT_SLIP, 0);
  }

  /** Must be called inside a user gesture. Resolves false if audio is blocked. */
  async start() {
    if (this.running) return true;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    this.ctx = new Ctor();
    try {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch (_) { /* handled by the state check below */ }
    if (this.ctx.state !== 'running') return false;

    this._buildMaster();
    this.record = buildRecord(this.ctx, this.bus);
    this.room = buildRoom(this.ctx, this.bus);
    this.booth = buildBooth(this.ctx, this.bus);

    this.record.out.connect(this.recordIn);
    this.room.out.connect(this.roomTone);
    this.booth.out.connect(this.boothOut);

    this._buildMusic();

    this.running = true;
    this.applyMix(this.mix, 0.01);
    this.setVolume(this.volume);
    this._timer = setInterval(() => this._schedule(), TICK_MS);
    return true;
  }

  _buildMaster() {
    const ctx = this.ctx;
    this.noise = noiseBuffer(ctx, 4);

    this.master = gain(ctx, 0.0001);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -8;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.preMaster = gain(ctx, 1);
    this.preMaster.connect(comp).connect(this.master).connect(ctx.destination);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.25;
    this._meter = new Uint8Array(this.analyser.fftSize);
    this.preMaster.connect(this.analyser);

    // Two spaces. The tiled room is short, bright and slappy, which is what a
    // small room with hard walls actually does. The hall is the tail a slip
    // can buy when it asks for something slow.
    this.sendShort = gain(ctx, 0.3);
    const convTile = ctx.createConvolver();
    convTile.buffer = makeImpulse(ctx, 0.9, 2.2, 0.55, 0.55);
    this.sendShort.connect(convTile).connect(gain(ctx, 0.95)).connect(this.preMaster);

    this.sendLong = gain(ctx, 0.16);
    const convHall = ctx.createConvolver();
    convHall.buffer = makeImpulse(ctx, 2.4, 2.8, 0.22, 0.3);
    this.sendLong.connect(convHall).connect(gain(ctx, 0.9)).connect(this.preMaster);

    /* --- The amplifier -------------------------------------------------- */
    // Everything from the turntable goes through one small valve amplifier
    // into one loudspeaker in a tiled room. That chain, not the notes, is what
    // makes the music sound like 1979 rather than like a browser.
    this.recordIn = gain(ctx, 1);
    const shaper = ctx.createWaveShaper();
    shaper.curve = tubeCurve(2.1);
    shaper.oversample = '2x';
    const ampHP = filter(ctx, 'highpass', 95, 0.7);
    const ampTop = filter(ctx, 'lowpass', 5400, 0.8);
    const ampBody = filter(ctx, 'peaking', 1100, 0.9, 3.5);
    this.ampOut = gain(ctx, 0.8);
    this.recordIn.connect(shaper).connect(ampHP).connect(ampBody).connect(ampTop)
      .connect(this.ampOut).connect(this.preMaster);
    this.ampOut.connect(this.sendShort);
    this.ampOut.connect(this.sendLong);

    // Mains hum at 60 Hz with its harmonics, injected after the shaper the way
    // a leaky power supply does, so it never distorts with the programme.
    this.hum = gain(ctx, 0.02);
    this.hum.connect(this.ampOut);
    [[60, 1], [120, 0.42], [180, 0.2], [240, 0.09]].forEach(([f, a]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(gain(ctx, a)).connect(this.hum);
      o.start();
    });

    /* --- Room and booth buses ------------------------------------------- */
    this.roomTone = filter(ctx, 'lowpass', 6200, 0.7);
    this.roomOut = gain(ctx, 1.3);
    this.roomTone.connect(this.roomOut).connect(this.preMaster);
    this.roomOut.connect(this.sendShort);
    this.roomOut.connect(this.sendLong);

    this.boothOut = gain(ctx, 0.85);
    this.boothOut.connect(this.preMaster);
    this.boothOut.connect(this.sendShort);
    this.boothOut.connect(this.sendLong);
    // Mic bleed: how much of the booth leaks into the room's own reverb, which
    // is the difference between a voice in the room and a voice behind glass.
    this.bleed = gain(ctx, 0.3);
    this.boothOut.connect(this.bleed).connect(this.sendLong);

    this.bus = {
      noise: this.noise,
      sendShort: this.sendShort,
      sendLong: this.sendLong,
    };
  }

  /* --- the record itself ------------------------------------------------
   * Three pressings, all of them coming out of the same console player and
   * the same valve amplifier into the same tiled room, which is why they go
   * through `console-lp` and into the short room's send rather than straight
   * at the master. A record you can hear in front of the room instead of in
   * it would undo everything the rest of this file does.
   */
  _buildMusic() {
    this.music = {};
    for (const slot of MUSIC_SLOTS) {
      this.music[slot] = new RoomMusic(this.ctx, {
        profile: SLOT_MEDIUM[`dabang-1979__${slot}`],
        destination: this.preMaster,
        reverbSend: this.sendShort,
      });
    }
    // Loading is not inside the gesture, so a slip can land before the record
    // is on the platter. The pending slot is applied when the load resolves.
    Promise.all(MUSIC_SLOTS.map((slot) => this.music[slot]
      .load(`assets/audio/${slot}.mp3`)
      .catch(() => { this.music[slot] = null; })))
      .then(() => { this.musicReady = true; this._applyMusic(1.8); });
  }

  /** How loud the record is. The slip already says: `record` is its own field. */
  musicLevel() {
    return MUSIC_TOP * this.mix.record;
  }

  /** Which pressing is on the platter right now. */
  get onDeck() { return this._musicSlot; }

  /** Put a record on. One turntable, so the old one comes off first. */
  setMusic(slot, fade = 1.4) {
    this._musicSlot = slot;
    if (this.musicReady) this._applyMusic(fade);
  }

  _applyMusic(fade = 1.4) {
    const level = this.musicLevel();
    for (const slot of MUSIC_SLOTS) {
      const m = this.music && this.music[slot];
      if (!m) continue;
      if (slot === this._musicSlot) {
        // A stop() already in flight would pause the element mid-fade.
        clearTimeout(m._pauseTimer);
        m.play({ level, fade });
      } else if (m.playing) {
        m.stop({ fade: 0.7 });
      }
    }
  }

  /** Apply a resolved mix. `glide` is the ramp constant in seconds. */
  applyMix(mix, glide = 0.5) {
    this.mix = mix;
    if (!this.running) return;
    const now = this.ctx.currentTime;
    this.record.setMix(mix);
    this.room.setMix(mix);
    this.ampOut.gain.setTargetAtTime(0.8 * mix.record, now, glide);
    this.roomOut.gain.setTargetAtTime(1.3 * mix.room, now, glide);
    this.roomTone.frequency.setTargetAtTime(mix.roomTone, now, glide);
    this.sendShort.gain.setTargetAtTime(mix.wetShort, now, glide);
    this.sendLong.gain.setTargetAtTime(mix.wetLong, now, glide);
    this.bleed.gain.setTargetAtTime(0.42 * mix.bleed, now, glide);
    this.hum.gain.setTargetAtTime(0.016 + 0.014 * mix.record, now, glide);
    // The record rides the same `record` field the amplifier does, so a slip
    // that asks for a quiet corner gets a quieter record, not just less room.
    if (this.musicReady) this._applyMusic(1.2);
  }

  /**
   * The booth takes the slip. Returns the schedule in seconds from now so the
   * interface can caption each moment as it actually happens.
   */
  submit(mix, slip = DEFAULT_SLIP) {
    if (!this.running) return { total: 0, marks: {} };
    this.slips += 1;
    const slot = musicSlot(slip, this.slips);
    const t = this.ctx.currentTime;
    const announce = mix.announce;
    const marks = {
      paper: 0.15,
      lift: 0.95,
      click: 1.35,
      announce: 1.55,
      stylus: 1.75 + announce,
      tonearm: 1.95 + announce,
      music: 2.35 + announce,
    };
    this.booth.paper(t + marks.paper);
    this.record.lift(t + marks.lift);
    this.booth.click(t + marks.click);
    this.booth.announce(t + marks.announce, announce);
    // The mix lands with the needle, not with the announcement.
    this.booth.tonearm(t + marks.tonearm);
    this.booth.stylus(t + marks.stylus);
    setTimeout(() => this.applyMix(mix, 0.35), (marks.stylus - 0.05) * 1000);
    // The record changes when the needle lands, not when the slip is written.
    // The old side comes off during the tonearm move, which is what covers it.
    setTimeout(() => this.setMusic(slot, 1.1), (marks.tonearm) * 1000);
    this.record.drop(t + marks.stylus + 0.1);
    if (mix.chime) this.room.trigger.door(t + marks.music + rnd(0.6, 2.4), 1);
    return { total: marks.music + 0.4, marks };
  }

  _schedule() {
    if (!this.running) return;
    const until = this.ctx.currentTime + LOOKAHEAD;
    this.record.tick(until);
    this.room.tick(until);
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (!this.running) return;
    // A gentle curve: the top of the slider should not be four times the middle.
    // 0.62 is measured, not guessed. It is set from the LOUDEST of the 64
    // slips (dance / birthday / everyone), which peaked at 0.216 RMS at the
    // destination with 0.66 here, above the 0.20 ceiling this piece is
    // calibrated to. Calibrating on the default slip instead would have left
    // one corner of the mechanic too hot.
    const target = this.muted ? 0.0001 : Math.pow(this.volume, 1.6) * 0.62 + 0.0001;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  setMuted(m) {
    this.muted = m;
    this.setVolume(this.volume);
  }

  /** Master level, 0..1, shaped for a meter rather than for maths. */
  level() {
    if (!this.running) return 0;
    this.analyser.getByteTimeDomainData(this._meter);
    let s = 0;
    for (let i = 0; i < this._meter.length; i++) {
      const v = (this._meter[i] - 128) / 128;
      s += v * v;
    }
    const rms = Math.sqrt(s / this._meter.length);
    return clamp((20 * Math.log10(rms + 1e-6) + 48) / 42, 0, 1);
  }
}
