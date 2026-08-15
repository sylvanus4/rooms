# Dabang 1979

A Korean tearoom, late afternoon, 1979. A DJ sits in a glass booth at the back and plays
records people request on paper slips. You write a slip, put it in the box, and the room
re-mixes around what you asked for.

Open `index.html` and press the door. Headphones help.

## The mechanic

The slip has three lines: what to play, why, and who it is for. Four answers each, so
sixty-four rooms. The answers are not decoration, they are the mix:

| Line | What it moves |
|---|---|
| Play me | tempo (92 or 62 BPM), whether brass answers, whether the bass walks, brush weight, reverb tail |
| Because | how long the announcement runs, how much of the microphone bleeds into the room, whether the room hushes or gets louder, whether the door goes |
| For | how loud the room talks over the record, how bright the room is, how often china and coins arrive, how far away the loudspeaker sounds |

Send the slip and you hear the booth take it: the paper unfolding, the needle coming off,
the microphone clicking on, an announcement you cannot quite make out from your table, the
stylus dropping, the tonearm. Then the new room.

## How the sound is made

There is no audio file in this repository and the page makes no network request. Everything
is synthesised in the browser with the Web Audio API, from oscillators, noise written into
`AudioBuffer`s, biquad filters, a waveshaper, and a convolution reverb whose impulse response
is generated at runtime.

```
record bus ─ LP surface noise, crackle, isolated pops, and the band
             ─> waveshaper (asymmetric tanh) ─> highpass 95 ─> peak 1.1k ─> lowpass 5.4k ─┐
                                    + 60/120/180/240 Hz mains hum injected after the shaper │
room bus   ─ five conversations, teacups, spoons, coins, matches, door bell                 │
             ─> lowpass (1.9 - 7.4 kHz, set by the slip) ────────────────────────────────── ┼─> preMaster
booth bus  ─ paper, mic click, announcer, stylus drop, tonearm                               │
             ─> highpass 300 ─> presence peak 2.3k ─> lowpass 4.6k ─> waveshaper ─────────── ┘
each bus   ─> short send ─> convolver (0.9 s tiled room)
           └> long send  ─> convolver (2.4 s hall, the tail a slip can buy)
preMaster ─> DynamicsCompressor(-8 dB, 4:1) ─> masterGain ─> destination
```

Some specifics worth the read:

- **The reed.** The accordion-like voice that answers on the offbeat is the genre's single
  most recognisable signature, so it never drops out. Two sawtooths six cents apart through
  a narrow bandpass at 2.4x the fundamental plus a fixed formant peak at 1180 Hz, with a
  45 ms attack. The slow attack is the bellows taking the note; a fast one sounds like a
  synth lead. It lands on the "and" of 2 and the "and" of 4, never on a downbeat.
- **Tube saturation.** The transfer curve is `tanh`, but the two halves of the wave are
  driven differently (2.1 against 1.64). That asymmetry is where the even harmonics that
  read as warmth come from. A symmetric curve just sounds compressed.
- **Mains hum** is injected after the shaper, not before, because a leaky power supply adds
  its hum downstream of the gain stage and therefore never distorts with the programme.
- **LP surface noise** is amplitude-modulated at 0.552 Hz, which is one rotation of a
  33 rpm disc. That single number is what makes it a turning record rather than a hiss.
- **Crackle** is a gated loop of highpassed noise with Poisson arrivals, plus a separate
  low, isolated pop every few seconds.
- **Speech you must not understand.** Both the room and the announcer are band-limited
  noise through a moving formant pair, gated on a syllable rhythm and lowpassed under
  1.5 kHz. Above that the consonants start carrying meaning and the room breaks.
- **The door bell** uses inharmonic partials at 1 / 2.76 / 5.41 / 8.93 with per-partial
  decays. Harmonic ratios would sound like a pad. Its fundamental is E5, inside the key.
- **Everything pitched is in A minor**, drawn from the pentatonic A C D E G, including the
  ring of the teacups and the door bell, so the room and the record share one key.
- **The impulse responses** are decaying noise, one-pole damped so the tail darkens, with
  the two channels generated independently and early reflections placed at different times
  per channel. That decorrelation is what makes it read as a room rather than a filter.

## Running it

It is static. Any file server will do:

```
python3 -m http.server 8000
```

Then open the address it prints. No build step, no dependencies, no bundler. Plain HTML,
CSS and ES modules.

## Period

1979 is the DJ-box era. There is no live guitarist in this room, playback is an LP through
a valve amplifier, and there are no pagers, cassette players or compact discs anywhere in
the code. No real performer, group or song title is named anywhere in this project.

## Licence

MIT, see `LICENSE`. No copyrighted audio is used, because no audio exists here to be
copyrighted: every sound is generated by the code in `assets/js/audio.js` at the moment
you hear it.
