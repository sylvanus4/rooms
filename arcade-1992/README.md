# The Arcade, 1992

A neighbourhood arcade in Korea, 1992. Twenty odd cabinets against the walls, a
hundred won a play, and a roller rink on the floor above whose music comes
through the ceiling all day.

There is one control: **how many people are in the room**, from nobody to
thirty eight. It is the same room at every setting, and almost nothing about it
survives the trip from one end to the other.

Live: https://sylvanus4.github.io/arcade-1992/

## What the control actually moves

| | empty | packed |
|---|---|---|
| cabinets in play | 0, three of them dark, the rest looping attract demos into nobody | all eight, none of them in step with each other |
| coins | about two a minute | better than one a second |
| crowd | silence | a wall of murmur, with the room going up when a match ends |
| the rink upstairs | the loudest thing in the building | you cannot tell it is there |
| the room itself | a 2.15 s tail off bare concrete | 0.46 s, because bodies absorb |

The last row is the one worth listening for. A room does not get quieter when it
fills, it gets **shorter**. Every sound stops having somewhere to go.

## How the sound is made

Every sound on this page is synthesized in the browser at runtime. There are no
audio files, no samples, no recordings and no network requests of any kind. Pull
the cable out after the page loads and nothing changes. That is a licensing
requirement, since none of this could ship with real arcade music, and it is
also the interesting part of the build.

### The cabinet music is FM

The cabinets are two operator FM synthesis in the manner of the Yamaha OPM, the
chip that ran the arcade boards of the era. A modulator `OscillatorNode` is
connected into the carrier's `frequency` `AudioParam`, and the modulator's gain
node **is** the modulation index. That index gets its own envelope which decays
faster than the amplitude envelope, which is why chip notes start bright and go
dull as they fall away.

The only three timbres needed:

- **ratio 2** puts sidebands at odd multiples only, so it reads as a square lead
- **ratio 1** fills in the whole harmonic series, so it reads as a saw
- **ratio 3.5** is deliberately not a whole number, the partials go inharmonic,
  and the note rings like struck metal

Percussion is done the way the hardware did it. The kick is a sine dropped from
132 Hz to 46 Hz in 100 ms. The snare is the noise channel through a bandpass at
about 2 kHz with a short tuned body underneath.

All four cabinet loops are written in **E minor**, two at 152 BPM and two at
168 BPM, as two bars of sixteenths. Each machine starts at a random step and
runs on its own clock, so they drift permanently out of phase against each
other. Several loops in the same key and different tempos, colliding, is the
defining sound of the room, and it is why they are all in one key: the clash has
to be rhythmic, never harmonic.

A machine in attract mode plays one bar in four and leaves the room alone for
the other three, at under half the level. Those gaps are most of what an empty
arcade sounds like, and they are why an empty one feels lonely rather than
merely quiet.

### The rest of the graph

- **Coin into a metal tray.** The slot mechanism clacks twice, then the coin
  lands on steel as four inharmonic partials at 1 / 2.76 / 5.41 / 8.93 over a
  1.1 kHz base, with a bright noise tick on each contact. It bounces two to four
  times, each quieter and slightly detuned, before it settles.
- **Joystick and buttons.** Short slices of a noise buffer at random offsets and
  playback rates through a bandpass, 8 to 26 ms long. Joysticks sit at 850 to
  1600 Hz with a low thunk under them, buttons are brighter and shorter. Both
  arrive as a Poisson process on the audio clock, and roughly a quarter of
  arrivals become a mash of four to fourteen presses at 60 to 105 ms apart.
- **Crowd.** A bed of pink noise through a wandering bandpass, plus individual
  speakers built from two formant filters over noise with a syllable rhythm
  envelope, kept under 1.5 kHz so the ear stops trying to make words out of it.
  A cheer is a noise swell whose formants rise and fall, eight to thirty claps
  scattered over 1.5 s, and two or three voices carrying over the top.
- **Machines.** Brown noise in a resonant band at 205 Hz for the cooling fans,
  with blade tones at 92 / 118 / 154 / 237 Hz that beat against each other, and
  two sines at 15734 and 15751 Hz for the flyback whine off the picture tubes.
  Plenty of people cannot hear that last one at all.
- **Upstairs.** The rink is A minor at 128 BPM, four on the floor, with an
  offbeat bassline and a riff. It is then put through a concrete slab, which is
  not a volume control but a filter: a hard lowpass at 240 Hz carries the kick
  and the bass, and a separate 1.3 kHz path at 7 percent lets the skate wheels
  and the attendant's whistle leak through. That is why you hear the bottom of a
  dance track and none of the top.

### The reverb is the mechanic

Two `ConvolverNode`s, both fed impulse responses generated at load: noise under
an exponential decay with early reflection taps placed differently in each
channel so the tail is decorrelated and reads as a space rather than a filter.

- **long**: 2.15 s, lightly damped, wide taps. An empty hall of concrete and
  steel boxes.
- **short**: 0.46 s, heavily damped, tight taps. The same hall with people in it.

The density control crossfades between them and pulls the return level down at
the same time.

This was measured rather than asserted. With every layer except the coins
switched off through the real toggle buttons, a coin dropped into a cabinet and
an `AnalyserNode` sampling RMS at `destination` every 25 ms, the tail falls 30 dB
in a **median 1.2 to 1.4 s with nobody in the room and 0.40 to 0.50 s with
thirty eight people in it**, a ratio between 2.5 and 3.4 to 1 depending on the
run, over four drops at each setting. Mean level across the same range moves by
about 1.8 to 1, which is the smaller half of the effect. A room that fills up
does not mainly get louder. It gets shorter.

One consequence worth stating: the limiter had to be moved up to -4 dB and 12:1.
At -11 dB and 14:1 it was quietly doing automatic level control, and an empty
arcade came out of it as loud as a full one, which deleted the mechanic.

Master chain: layer buses each with a dry gain and a reverb send, into a
`DynamicsCompressor` acting as a safety limiter, into a master gain, into
`destination`. Peak RMS at `destination` measured 0.13 at the default setting
and 0.11 to 0.16 across the whole range of the control.

## Running it

No build step, no dependencies, no bundler. Any static server:

```bash
cd arcade-1992
python3 -m http.server 8000
```

Then open `127.0.0.1` on port 8000. Audio only starts on the button, because
browsers require a user gesture, and the button says so.

## Accessibility

Both sliders are real `role="slider"` controls with arrow, Page, Home and End
keys and live `aria-valuetext`. Every layer can be switched off individually,
and the on screen copy describes what each one is playing, so the piece is still
readable with the sound off. `prefers-reduced-motion: reduce` stops every
decorative animation and leaves the audio alone.

## Accuracy

1992 is a specific year. The fighting game that put a crowd around one machine
came out the year before and had taken over the country by then, and roller
rinks were still open. The chip is the OPM, which is what arcade boards used.
No real game, company, band or song is named anywhere in this repository, on
purpose.

## Licence

MIT, see `LICENSE`. No copyrighted audio is used or distributed here, because
there is no audio in this repository at all. Every sound is generated by
`assets/js/audio.js` while you listen to it.
