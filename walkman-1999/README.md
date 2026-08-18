# walkman-1999

A cassette Walkman on the walk to 학원 in Korea, winter 1999. Foam earbuds, a school
bag, traffic somewhere off to the side, and a mixtape somebody made you with one song
on it you keep going back to.

**The tape wears out while you listen, permanently, and rewinding is what kills it.**
Playing costs a little. Rewinding costs a lot, and it costs it exactly where you keep
going back to. The part you love most is the part you destroy first. Side A and side B
wear independently, so the other side stays new until you flip it.

Live: https://sylvanus4.github.io/walkman-1999/

## The mechanic

The tape is modelled as 16 wear regions per side, each a number from 0 to 1 that only
ever goes up:

| action | wear per region crossed |
|---|---|
| play | 0.018 |
| fast forward | 0.041 |
| rewind | 0.082 |
| starting or stopping a spool | a 0.034 spike, right where the head is |

That spike is the point of the whole piece. A spool motor grabs the tape hard when it
starts and when it stops, so the damage concentrates at the exact bar you keep
returning to rather than spreading out over the side.

Wear under the playhead drives four things continuously:

- **wow and flutter** rising from about 1 cent of peak deviation to about 30, by
  scaling three LFO depths on the delay line the music passes through
- **hiss** rising roughly twelvefold
- **top end** falling from 13 kHz to about 2.8 kHz, with a high shelf that dips a
  further 10 dB, which is what a Dolby-B-style decoder does to a tape whose highs have
  already sagged
- **dropouts**, whose rate goes with wear squared and whose length grows from 28 ms to
  about half a second

Past 0.52 the tape starts creasing: the head loses contact for a few milliseconds and
the shell makes a small noise about it. Past 0.76 a region sags, the transport runs
slow for a second and a half, the pitch falls, and then it hauls itself back.

## The sound

The room's ambience is all synthesised live in the browser — no sample files, no recordings.
Only the music layer is a file: three tracks generated on our own GPUs with MiniMax-Music3.
No licensed commercial recording is used anywhere, and every track was commissioned with no vocal — instruments only.

방 안의 앰비언스는 전부 브라우저에서 실시간으로 합성됩니다 — 샘플 파일도, 녹음물도 없습니다.
음악 레이어만 자체 GPU에서 MiniMax-Music3로 생성한 파일이며, 라이선스된 상업 녹음물은 한 곡도
쓰지 않았습니다. 모든 곡은 보컬 없이 악기만으로 발주했습니다.

That split is a licensing requirement first — a piece about a mixtape cannot ship the
mixtape — and the interesting part of the build second. The three tracks go into
`musicSum`, which is the input of the tape path, so the wow, the flutter, the oxide loss,
the dropouts, the creases and the sag land on them exactly as they land on the synthesized
band. Music that stayed pristine while the tape wore out would break the whole piece.

Everything pitched is in **C sharp minor**: side A is a 68 BPM ballad, side B a 124 BPM
dance-pop track.

```
piano   ─┐                                      ┌─ hiss ──────────┐
pad     ─┤                                      │                 │
guitar  ─┼─ musicSum ─ flutter delay ─ lowpass ─ high shelf ─┐     │
bass    ─┤             (3 LFOs)      (oxide)    (NR decode)  ├─ dropout ─ crease ─┐
drums   ─┤                                                  │                    │
voice   ─┘                                                                       │
transport keys, spool motor, door ───────────────────────────────────┐           │
footsteps, traffic, bus, buzzer ─────────────────────────────────────┤           │
                             ┌── dry ─────────────────────────────┐  │           │
                   bus gain ─┤                                    ├──┴───────────┴─ sum
                             └── send ── convolver (procedural IR)┘                │
                                     highpass 34 Hz ─ compressor ─ makeup ─ master ─ out
```

Instrument by instrument:

- **piano**: five sine partials at stretched ratios (1, 2.003, 3.011, 4.026, 5.05),
  each with its own decay, plus a bandpassed noise tick for the hammer. The stretch is
  most of what stops it reading as an electric piano.
- **string pad**: two sawtooths seven cents apart per note into a lowpass that opens
  over the bar and closes again, through a two-tap modulated chorus.
- **clean electric guitar**: two detuned sawtooths through a lowpass falling from
  3.6 kHz to 700 Hz, with a bandpassed pick transient. A feedback delay line would be
  the textbook plucked string, but Web Audio quantises any cycle to a 128 sample block,
  which puts the pitch of a short loop wrong, so this is subtractive instead. Honest
  limit: it is a good clean tone, not a physical model.
- **drums**: kick is a sine dropping 128 to 44 Hz in 85 ms with a click on top; snare
  is bandpassed noise plus two detuned triangles; hats are noise through a highpass and
  a bandpass; the clap is four noise bursts 8 to 13 ms apart. Every hit carries a
  timing jitter of up to 12 ms and a velocity jitter, which is the live-feel part.
- **wordless voice**: a sawtooth through three formant bandpasses at 720, 1180 and
  2750 Hz, doubled an octave up and offset 14 ms, with vibrato that only arrives 450 ms
  after the attack, the way a singer does it. There are deliberately no words.
- **transport**: the play key is a lowpassed noise burst plus a 112 to 58 Hz thump plus
  a spring click 28 ms later. The spool motor is bandpassed brown noise, a sawtooth
  whine sweeping 38 to 170 Hz on start and back down on stop, and a narrow 3.3 kHz band
  of noise for the squeal of tape dragged past a fixed guide.
- **the walk**: each footstep is a bandpassed heel at 380 to 520 Hz followed 55 ms
  later by a highpassed scuff, alternating channels, at a pace that drifts. The road is
  brown noise through a lowpass with a peak at 96 Hz. A bus is a band sweeping 95 to
  240 Hz and back while its pan crosses the stereo field and the road ducks behind it,
  with an air brake at the closest point. The buzzer at the end of the route is two
  square waves amplitude-modulated at 33 Hz.
- **reverb**: a procedurally generated impulse response, 0.62 s, with three early
  reflections placed differently in each channel. The music goes to it almost dry,
  because earbuds are dry, and the street goes to it wet. That contrast is what puts
  the music inside your head and the pavement outside it.

## Running it

No build step, no dependencies. Any static server:

```bash
cd walkman-1999
python3 -m http.server 8080
```

Then open `localhost:8080` in a browser. It works with the network cable pulled after
the first load.

## Controls

Play, stop, rewind, fast forward, flip. `P` `S` `R` `F` `B` on the keyboard, space
toggles play and stop. The tape auto-reverses at the end of a side, because a 1999 deck
of this class did.

## Diagnostics

`window.__walkman.tapeCheck(seconds)` plays a 1 kHz alignment tone through the tape
path with everything else muted, the way a deck is lined up. `window.__walkman.telemetry()`
returns the live tape parameters. The wear meter in the interface reads the same
numbers. Both exist so that the claim this page makes about wear can be measured rather
than asserted: an external probe plays, rewinds repeatedly, and checks that the pitch
scatter of that tone and the hiss under it both go up and never come back down.

## Period accuracy

Cassette only. No MP3 player: Korea shipped the first one in 1998 but it was not in a
student's hands in 1999. No CD player. No 미니홈피, which is 2001 and later. Pagers had
already collapsed from about 15 million subscribers in 1997 to around 3 million by
1999, so there is not one here. No real singer, band or song is named anywhere, because
none is: the music is generated.

## Licence

MIT, see `LICENSE`. No copyrighted audio is used or included. The deck, the street and the
band on the tape are synthesized at runtime from oscillators and noise buffers, and the three
tracks in `assets/audio/` were generated with MiniMax-Music3 on our own GPUs. Side B is sung: its
vocal was separated out, re-sung in a licensed speaker timbre, and given the original melody
back. Side A and the rewind are instruments only.
