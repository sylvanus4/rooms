# PC Bang 2004

A Korean internet cafe at 2 in the morning, 2004. Before you owned a gaming PC.

Live: https://sylvanus4.github.io/pcbang-2004/

Forty CRT monitors. A thousand won an hour, prepaid, with the remaining time
ticking in the corner of the screen. Indoor smoking was still legal, so the air
is hazy. The guy two seats over is losing a game out loud.

You sit in front of a CRT and pick a seat. Each seat is a different mix
position in the room, and switching seats crossfades the whole space around
you: the window seat lets traffic in and pushes the room back, the corner seat
buries you in keyboards with a longer tail, the seat next to the counter gets
the buzzer, the ramen kettle, and staff walking past your chair.

## Every sound is synthesized at runtime

There are no audio files in this repository. No `.mp3`, no `.wav`, no samples,
no music. The entire soundtrack is built in the browser from oscillators,
noise buffers written sample by sample into an `AudioBuffer`, biquad filters,
and scheduled envelopes. That is both a licensing decision and the point of
the piece.

### The graph

```
per-layer sources ─┬─► layer.dry ─► layer.gain ─────────────┐
                   └─► layer.wet ─► layer.send ─► convolver ─► reverbReturn
                                                             │
                                       both sum into ─► bus ─┤
                                                             ▼
                                    bus ─► limiter ─► master ─► destination
```

`layer.gain` is `toggle ? base * seatMultiplier : 0`, and `layer.send` is that
same value times the seat's reverb multiplier, so muting a layer also removes
its tail. Every seat change is a `setTargetAtTime` ramp, never an assignment,
which is why the room never clicks when you move.

### Layer by layer

**Keyboards** are the signature texture and get the most work. Each key press
is a `BufferSource` reading a random offset out of a two second white noise
buffer at a randomized `playbackRate`, through a `bandpass` whose frequency
(1.3 to 3.9 kHz) and Q are re-rolled per strike, into a `GainNode` envelope
with a 1.3 ms attack and a 14 to 32 ms exponential decay, then a
`StereoPannerNode`. Strikes are Poisson-scheduled by a 25 ms lookahead loop
that queues events onto the sample clock, so the layer never repeats. There
are three distance tiers, each with its own shared `lowpass` (7.6 kHz / 3.1 kHz
/ 1.45 kHz), level, stereo width, and reverb send, which is what gives the
room depth. Seven percent of arrivals become a burst of five to thirteen
strikes at 55 to 105 ms apart, someone typing a sentence, often ending in a
spacebar thud: the same strike with a 150 to 260 Hz bandpass and a longer decay.

**Mouse clicks** are sharper, drier and rarer: highpassed at 2.1 to 3.4 kHz
with a peaking boost up around 5 kHz, a 6 to 13 ms decay, low reverb send,
sometimes doubled into a double-click.

**Case fans** are a looping brown noise buffer through a resonant `bandpass`
at 230 Hz with a slow LFO on the cutoff, plus three faint blade-passing sines
at 116, 97.5 and 163 Hz that beat against each other, each with its own slow
amplitude LFO.

**CRT flyback whine** is a single sine at 15734 Hz at a gain of 0.006, with a
0.071 Hz LFO drifting the frequency by a few Hz. It has its own toggle and is
off by default, and the label says plainly that some people cannot hear it and
some find it painful.

**Fluorescent buzz** is 120 Hz plus harmonics at 240, 360 and 600 Hz at tiny
amplitudes. Its level is walked by `flickerValue(t)`, a sum of three sines at
0.17, 2.7 and 7.3 Hz. The screen brightness reads the exact same function on
the same audio clock, so the visual flicker is not an imitation of the tube,
it is the tube.

**Room murmur** is pink noise (Paul Kellet's economy filter, generated into a
four second buffer) highpassed at 90 Hz and lowpassed around 720 Hz with a
wandering cutoff, plus rare one-shots: a chair scrape (noise through a
bandpass swept 600 to 3000 Hz), the front door (a 96 to 46 Hz sine thump plus
a latch click), and a muffled shout built from two bandpass formants at ~500
and ~1100 Hz, lowpassed to 950 Hz so it sounds like it came through the room,
with a two syllable amplitude envelope and a heavy reverb send.

**Outside traffic**, on the window seat, is a lowpassed brown noise rumble
under 115 Hz plus passing cars: pink noise through a bandpass swept 320 up to
around 1 kHz and back down over two to three and a half seconds, with the
`StereoPannerNode` automated across the field.

**The counter** has the ramen kettle (noise through a bandpass rising 900 to
2800 Hz over six to ten seconds, with a sine whistle swelling in at the end)
and staff footsteps, four soft lowpassed thumps.

**The buzzer** is two square-wave blips through a narrow bandpass. The harsh
version fires when the prepaid clock crosses ten minutes, five minutes, one
minute and zero. A shorter, friendlier pair confirms when you pay for another
hour.

**Power-on** is a degauss: a 74 to 31 Hz sine thump, a noise burst through a
bandpass falling from 560 to 180 Hz, and two metallic rings at 1190 and
1655 Hz decaying away.

### The reverb

`ConvolverNode` fed a procedurally generated impulse response: 0.62 seconds of
noise under a `(1 - t)^2.6` decay, darkened by a one-pole lowpass so it reads
as tile and plaster instead of a plate, with five early reflection taps placed
at different times in each channel so the tail is decorrelated and sits wide.
Each seat has its own send multiplier, so the corner rings noticeably longer
than the window.

### The master chain

Everything sums into a bus, through a `DynamicsCompressorNode` acting as a
gentle limiter (-11 dB threshold, 14:1, 3 ms attack), then a master gain wired
to the volume control. Muting ramps the master rather than setting it, and
`stop()` ramps down, stops every long-running source, and closes the context,
so there are no runaway oscillators and no clicks on teardown.

## Running it locally

It is plain HTML, CSS and ES modules with no build step and no dependencies.
ES modules need a real origin, so open it through any static server:

```bash
python3 -m http.server 8000
# then open port 8000 on localhost in a browser
```

Audio only starts after you press the power button, because browsers require a
user gesture before an `AudioContext` may run.

## Notes

- Zero network requests after the first load. No fonts, no CDN, no analytics,
  no images. Every graphic is inline SVG or CSS.
- English is the default, with a Korean toggle in the corner. Both languages
  live in one record per string in `assets/js/i18n.js`.
- `prefers-reduced-motion: reduce` stops the flicker, the grain and the
  scanline drift, and skips the power-on animation. The audio and the whole
  interface keep working.
- The prepaid clock is atmosphere, not a fail state. When it hits zero nothing
  stops and nothing is blocked.

## License

MIT, see `LICENSE`.

No copyrighted audio is used anywhere in this project. There is no sampled or
recorded sound in the repository at all: every sound you hear is generated by
the Web Audio API at runtime from the code in `assets/js/audio.js`.
