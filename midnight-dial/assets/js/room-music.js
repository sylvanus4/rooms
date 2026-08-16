/**
 * room-music.js — play a generated track *inside* a synthesized room.
 *
 * Canonical source: ai-platform-strategy/experiments/music3-wow/job/room-music.js
 * Copied verbatim into each of the six room repos. They are independent static
 * sites with no build step, so a copy is cheaper than a package.
 *
 * The point: the music must not sit on top of the ambience like a soundtrack.
 * It has to come out of an object that exists in the room — a ceiling speaker,
 * a receiver, a record player, a pair of foam earbuds — and therefore has to be
 * filtered by that object and by the air between it and you. Every profile
 * below is a measured or documented property of the real medium, not taste.
 *
 *   <audio> -> MediaElementSource -> [medium chain] -> dry ---------> destination
 *                                                  \-> send -> (host reverb)
 *
 * Usage:
 *   const music = new RoomMusic(ctx, { profile: 'ceiling-pa', destination: preMaster,
 *                                      reverbSend: revShortIn });
 *   await music.load('assets/audio/lobby.mp3');
 *   music.play();  music.setGain(0.5);  music.stop();
 */

const PROFILES = {
  // A 1997 FM stereo broadcast caps program audio near 15 kHz to protect the
  // 19 kHz stereo pilot, and is heavily compressed for transmission.
  // Three cascaded stages, not one: a broadcast chain cuts hard here because the
  // 19 kHz pilot has to survive intact, and a single 12 dB/oct slope measured
  // only -2 dB at 17 kHz — audibly still a full-range signal, not a radio.
  'fm-receiver': {
    hp: 60, lp: 15000, lpQ: 0.9, lpStages: 3,
    peaks: [{ f: 2500, gain: 2.5, q: 0.8 }],
    comp: { threshold: -26, ratio: 6, attack: 0.004, release: 0.18 },
    send: 0.16, hiss: 0.0016,
  },

  // Korean AM carries roughly 100 Hz - 5 kHz, mono. Heard through a wall from
  // the next room, so everything above a few kHz is gone twice over.
  'next-room-am': {
    hp: 180, lp: 2600, lpQ: 1.1, lpStages: 2, mono: true,
    peaks: [{ f: 900, gain: 4, q: 1.2 }],
    comp: { threshold: -22, ratio: 8, attack: 0.01, release: 0.25 },
    send: 0.34, hiss: 0.0022,
  },

  // Cheap 2.0 desktop speakers on a ceiling bracket: no low end to speak of,
  // a hard mid honk, and the room's own reverb doing the rest.
  'ceiling-pa': {
    hp: 190, lp: 11000, lpQ: 0.7,
    peaks: [{ f: 1800, gain: 3.5, q: 1.4 }, { f: 420, gain: -4, q: 1.0 }],
    comp: { threshold: -20, ratio: 4, attack: 0.006, release: 0.2 },
    send: 0.3, hiss: 0.0009,
  },

  // A console record player through a tube amp in a small tiled room:
  // midrange forward, soft top, gentle saturation, surface noise.
  'console-lp': {
    hp: 45, lp: 12500, lpQ: 0.7,
    peaks: [{ f: 700, gain: 2.5, q: 0.9 }, { f: 5200, gain: -2.5, q: 0.8 }],
    comp: { threshold: -24, ratio: 3, attack: 0.012, release: 0.3 },
    drive: 0.35, send: 0.26, hiss: 0.0026,
  },

  // Heard through a floor from the storey above: the ceiling is a low-pass
  // filter with a very steep slope. Almost nothing but kick and bass survives.
  'through-ceiling': {
    hp: 35, lp: 700, lpQ: 1.6, lpStages: 2,
    peaks: [{ f: 90, gain: 5, q: 1.1 }],
    comp: { threshold: -18, ratio: 5, attack: 0.01, release: 0.22 },
    send: 0.42, hiss: 0.0006,
  },

  // Foam earbuds off a cassette Walkman: thin bass, forward mids, sibilant top,
  // and Dolby B dulling the high end when playback tracking is imperfect.
  'foam-earbuds': {
    hp: 130, lp: 13000, lpQ: 0.8,
    peaks: [{ f: 3200, gain: 3, q: 1.1 }, { f: 250, gain: -3, q: 0.9 }],
    comp: { threshold: -28, ratio: 3, attack: 0.005, release: 0.15 },
    send: 0.05, hiss: 0.0034,   // in your ears, so almost no room in it
  },

  // The heavy vinyl-pad over-ear headset chained to a PC bang desk. Unlike
  // earbuds these have low end, but it is a loose one-note thump rather than
  // extension, and the top is dull from years of being on other people's heads.
  'cheap-headset': {
    hp: 45, lp: 12000, lpQ: 0.7,
    peaks: [{ f: 110, gain: 4, q: 1.5 }, { f: 900, gain: -3, q: 1.0 }, { f: 4200, gain: 2, q: 1.2 }],
    comp: { threshold: -26, ratio: 3, attack: 0.006, release: 0.18 },
    send: 0.04, hiss: 0.0012,
  },

  // A 1990s upright arcade cabinet: one small mono driver in a plywood box,
  // no low end below the box tuning, and a hard cabinet resonance in the mids.
  'cabinet-mono': {
    hp: 210, lp: 9000, lpQ: 0.8, mono: true,
    peaks: [{ f: 1500, gain: 4.5, q: 1.6 }, { f: 600, gain: -3.5, q: 1.2 }, { f: 330, gain: 3, q: 2.2 }],
    comp: { threshold: -19, ratio: 5, attack: 0.005, release: 0.16 },
    drive: 0.22, send: 0.28, hiss: 0.0011,
  },

  // Not a medium at all — the honest profile for rooms where no music actually
  // played. Nothing in a 1996 farmhouse yard was producing this, so inventing a
  // radio to justify it would be a lie. Instead it is scored memory: nearly
  // flat, a little soft on top the way remembered sound is, no device noise,
  // and pushed deep into the room's own reverb so it sits in the air rather
  // than in front of you.
  'remembered': {
    hp: 40, lp: 14000, lpQ: 0.6,
    peaks: [{ f: 6000, gain: -2, q: 0.7 }, { f: 400, gain: 1.5, q: 0.8 }],
    comp: { threshold: -30, ratio: 2, attack: 0.02, release: 0.4 },
    send: 0.55, hiss: 0,
  },
};

/**
 * Which object each track comes out of.
 *
 * This is the whole argument of the music layer: a track is not a soundtrack
 * laid over the room, it is something audible *in* the room, so it has to be
 * filtered by the thing playing it and the air in between. Two rooms get
 * `remembered` because nothing in them was actually playing music, and faking
 * a device to justify a score would be dishonest.
 */
export const SLOT_MEDIUM = {
  // A PC bang had no shared music — every seat had its own headset — so the
  // music is what is in *your* headset, plus what leaks from the counter.
  'pcbang-2004__lobby':       'ceiling-pa',
  'pcbang-2004__ranked':      'cheap-headset',
  'pcbang-2004__ramen':       'next-room-am',

  'midnight-dial__signal':    'fm-receiver',
  'midnight-dial__letter':    'fm-receiver',
  'midnight-dial__closing':   'fm-receiver',

  // 1996, a farmhouse yard. Nothing was playing. See 'remembered' above.
  'grandmas-summer__noon':    'remembered',
  'grandmas-summer__dusk':    'remembered',
  'grandmas-summer__night':   'remembered',

  // The DJ box plays a record through a tube console into a tiled room.
  'dabang-1979__request-1':   'console-lp',
  'dabang-1979__request-2':   'console-lp',
  'dabang-1979__last-call':   'console-lp',

  'arcade-1992__coin':        'cabinet-mono',
  'arcade-1992__versus':      'cabinet-mono',
  'arcade-1992__rink':        'through-ceiling',   // the roller rink upstairs

  'walkman-1999__side-a':     'foam-earbuds',
  'walkman-1999__side-b':     'foam-earbuds',
  'walkman-1999__rewind':     'foam-earbuds',
};

function noiseBuffer(ctx, seconds = 2) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    // brown-ish: white noise integrated, which matches tape/broadcast hiss
    // better than flat white does
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

function driveCurve(amount) {
  const n = 1024, curve = new Float32Array(n), k = amount * 40;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

export class RoomMusic {
  /**
   * @param {AudioContext} ctx            the host page's context — never make a second one
   * @param {object}  opts
   * @param {string}  opts.profile        key of PROFILES
   * @param {AudioNode} opts.destination  where the dry signal joins the host graph
   * @param {AudioNode} [opts.reverbSend] the host's reverb input, if it has one
   */
  constructor(ctx, { profile, destination, reverbSend = null }) {
    const p = PROFILES[profile];
    if (!p) throw new Error(`room-music: unknown profile ${profile}`);
    this.ctx = ctx;
    this.profile = p;
    this.el = null;
    this.src = null;

    const n = [];
    this.input = ctx.createGain();
    this.input.gain.value = 1;
    let node = this.input;

    if (p.mono) {
      const merger = ctx.createChannelMerger(1);
      node.connect(merger);
      node = merger;
    }

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = p.hp; hp.Q.value = 0.7;
    node.connect(hp); node = hp; n.push(hp);

    for (let i = 0; i < (p.lpStages || 1); i++) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = p.lp; lp.Q.value = p.lpQ;
      node.connect(lp); node = lp; n.push(lp);
    }

    for (const pk of p.peaks || []) {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking'; f.frequency.value = pk.f; f.gain.value = pk.gain; f.Q.value = pk.q;
      node.connect(f); node = f; n.push(f);
    }

    if (p.drive) {
      const ws = ctx.createWaveShaper();
      ws.curve = driveCurve(p.drive); ws.oversample = '2x';
      node.connect(ws); node = ws; n.push(ws);
    }

    if (p.comp) {
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = p.comp.threshold; c.ratio.value = p.comp.ratio;
      c.attack.value = p.comp.attack; c.release.value = p.comp.release; c.knee.value = 6;
      node.connect(c); node = c; n.push(c);
    }

    this.gain = ctx.createGain();
    this.gain.gain.value = 0;         // always fade in; a hard start is a jump-scare
    node.connect(this.gain);
    this.gain.connect(destination);

    if (reverbSend && p.send) {
      this.send = ctx.createGain();
      this.send.gain.value = p.send;
      this.gain.connect(this.send);
      this.send.connect(reverbSend);
    }

    // The medium's own noise floor rides with the music, not under the room —
    // it belongs to the speaker, so it stops when the music stops.
    if (p.hiss) {
      this.hiss = ctx.createBufferSource();
      this.hiss.buffer = noiseBuffer(ctx);
      this.hiss.loop = true;
      const hg = ctx.createGain(); hg.gain.value = 0;
      const hlp = ctx.createBiquadFilter();
      hlp.type = 'lowpass'; hlp.frequency.value = p.lp;
      this.hiss.connect(hlp); hlp.connect(hg); hg.connect(destination);
      this.hissGain = hg;
      this.hissLevel = p.hiss;
      this.hiss.start();
    }
    this.nodes = n;
  }

  /** Load a track. Kept separate from play() so the fetch is not inside a gesture. */
  async load(url, { loop = true } = {}) {
    if (!this.el) {
      this.el = new Audio();
      this.el.crossOrigin = 'anonymous';
      this.el.preload = 'auto';
      this.src = this.ctx.createMediaElementSource(this.el);
      this.src.connect(this.input);
    }
    this.el.loop = loop;
    this.el.src = url;
    await new Promise((res, rej) => {
      const ok = () => { cleanup(); res(); };
      const no = () => { cleanup(); rej(new Error('room-music: cannot load ' + url)); };
      const cleanup = () => {
        this.el.removeEventListener('canplaythrough', ok);
        this.el.removeEventListener('error', no);
      };
      this.el.addEventListener('canplaythrough', ok, { once: true });
      this.el.addEventListener('error', no, { once: true });
      this.el.load();
    });
  }

  play({ fade = 1.2, level = 0.5 } = {}) {
    if (!this.el) return;
    const t = this.ctx.currentTime;
    this.el.play().catch(() => {});
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(level, t, fade / 3);
    if (this.hissGain) this.hissGain.gain.setTargetAtTime(this.hissLevel, t, fade / 3);
  }

  stop({ fade = 0.9 } = {}) {
    if (!this.el) return;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(0, t, fade / 3);
    if (this.hissGain) this.hissGain.gain.setTargetAtTime(0, t, fade / 3);
    // pause only after the fade has actually run out
    clearTimeout(this._pauseTimer);
    this._pauseTimer = setTimeout(() => this.el && this.el.pause(), fade * 1000 + 120);
  }

  /** Ride the music with whatever the room's own control is doing. */
  setGain(level, ramp = 0.4) {
    const t = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(level, t, ramp / 3);
  }

  get playing() { return !!this.el && !this.el.paused; }
}

export const ROOM_MUSIC_PROFILES = Object.keys(PROFILES);
