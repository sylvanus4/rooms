# New Orleans 1927

A narrow basement room with a pressed-tin ceiling, a low stage at the far end, and a band
on it playing hot jazz. You are in the room with them, which is the whole idea: this
is not a record playing somewhere, it is a performance happening in the same air you are
standing in. Choose where you are standing and what time it is, and the room moves.

Open `index.html` and go down the stairs. Headphones help.

## The mechanic

Two axes, four answers each, so sixteen rooms. The answers are not decoration, they are
the mix:

| Axis | Answers | What it moves |
|---|---|---|
| Where you are | at the front of the stage, at the bar, at the back of the room, on the stairs | which of the four listening positions carries the band, how much of it has touched a wall before it reaches you, how close the crowd and the glassware are, whether the boards under your feet are the boards being stamped on, and whether the street exists |
| What time it is | early evening, midnight, two in the morning, closing | how many people are talking and how hard, how often chairs move and the door goes, which part of the beat the crowd's feet take and how tightly together they land, what is out on the street, and how fast the ceiling fan is turning |

Press the button and you hear yourself cross the floor: your chair going back, footsteps
over the boards, the room making way, a chair pulled in behind you, a glass set down. The
band never stops for any of it.

The most interesting number in the table is the one that is not a level. Each hour picks a
different **stamping pattern**, and the crowd's feet are locked to the same grid the band
is on. Early in the evening a few pairs of boots land tentatively on the backbeat and
slightly behind it. At midnight eleven pairs land on it hard and together, with hands.
At two in the morning they have picked up the "and" of four and are pushing ahead of the
beat and scattering more widely. At closing there are two of them, at half the rate,
dragging by nearly thirty milliseconds. That is the room answering the band rather than
sitting in front of it.

## How the sound is made

Everything in this room except the band is synthesised live in the browser. There are no
sample files and no recordings anywhere in the ambience: it is written at the moment you
hear it from oscillators, noise rendered into `AudioBuffer`s, biquad filters, two
waveshapers used as pulse shapers, and a convolution reverb whose impulse responses are
generated at runtime. The page makes no network request beyond its own files.

밴드를 뺀 방 전체는 듣는 그 순간 브라우저에서 합성됩니다. 앰비언스에는 샘플 파일도 녹음물도
없습니다.

The band is the one file, `assets/audio/set-1.mp3`: a take generated on our own GPUs,
with a vocal chorus trading calls with the cornet. The singing voice is not the model's
own — its vocal was separated out and re-sung in a licensed speaker timbre, then the
original melody was transplanted back onto it and remixed with the band. It plays through
`assets/js/room-music.js`, which puts it through a modelled listening position rather than
through a speaker. Its tempo was measured off the file, not assumed: 117.5 quarter notes a
minute, and the crowd's feet are locked to that.

밴드만 파일입니다. 자체 GPU에서 만든 한 테이크이고, 코넷과 주고받는 보컬이 들어 있습니다.
그 목소리는 모델 자신의 것이 아니라 보컬을 분리해 라이선스를 가진 화자 음색으로 다시 부르게
한 뒤 원래 선율을 되이식해 합친 것입니다. 템포는 가정하지 않고 파일에서 쟀습니다 — 117.5 BPM.

```
crowd bus  ─ eight conversations, laughter, a shout on the bar line
             ─> lowpass (3.0 - 9.0 kHz, set by where you sit) ─> crowdOut ──┐
bar bus    ─ glass on glass, a bottle, a pour, a cork, change on zinc ──────┤
floor bus  ─ chairs, and boots on the backbeat with the band ───────────────┼─> preMaster
street bus ─ a cart at a walk, a putting motor, a klaxon                    │
             ─> doorGate ─> doorTone ── the door is the gate AND the filter ─┤
air bus    ─ room tone, ceiling fan, fan motor ─────────────────────────────┤
four seats ─ one take through four listening positions, gains crossfaded ───┘
every bus  ─> short send ─> convolver (0.7 s, narrow room, tin ceiling)
           └> long send  ─> convolver (2.2 s, the shaft up to the street)
preMaster ─> DynamicsCompressor(-9 dB, 3.5:1) ─> masterGain ─> destination
```

Some specifics worth the read:

- **Four bands, not one.** Moving seats is a crossfade between four `RoomMusic` instances
  that are all built at start and all playing continuously from the same moment. Nothing
  is ever re-patched, because re-patching a live performance puts a gap in it. The cost is
  four decoders on one file; the risk is drift, since four media elements are not
  sample-locked, so the incoming instance is seeked into line **while it is still at gain
  zero** — the only moment a seek is inaudible.
- **Distance indoors is mostly a reverb parameter.** Over twelve metres, molecular
  absorption at 4 kHz costs about a decibel, which nobody hears. What actually costs is
  the direct-to-reverberant ratio past the critical distance, the fact that a cornet
  throws its 2-4 kHz down the bell axis and very little of it sideways, and the crowd,
  whose bodies and coats eat the presence region first. The four profiles are those three
  things rather than a distance knob, and the reverb send climbs far faster than the
  low-pass falls.
- **No hiss anywhere in the music path.** Every other room in this series models a device,
  and a device has a noise floor. This one models a distance. The noise floor here is the
  crowd, and the crowd is synthesised.
- **Stick-slip.** A chair leg dragged over boards and a dry door hinge are the same
  physical event at different rates: the surfaces grip, release, and grip again a few
  dozen times a second. It is written as a series of hard steps on a gain rather than a
  ramp, because the discontinuity is the entire difference between furniture and a swell
  of noise. One function does both, at 22-74 Hz for the chair and 7-22 Hz for the hinge.
- **The door is a filter, not a fader.** A closed door does not make the street quieter,
  it makes it dull, so the door event ramps a gate and a cutoff together and the street
  opens rather than fading in.
- **The pour rises.** The bandpass climbs across the pour because the air column above the
  liquid gets shorter as the glass fills. It is the one cue everybody recognises and
  nobody can name.
- **A bottle is three sounds.** The knock of the base on the wood, the glass body's tick,
  and the air column inside it, which is a Helmholtz resonator near 120 Hz for a half
  empty quart with a narrow neck. That last one is why a bottle is hollow and a tumbler
  is not.
- **A board is a plate, not a string.** A boot landing on a plank floor excites a band
  near 90 Hz rather than a note, so every stamp is a noise burst through a resonant
  bandpass, with a separate heel two and a half octaves up and the joists carrying on
  underneath after both have gone.
- **The Lombard effect.** People in a loud room do not simply talk louder, they talk
  higher, so every voice's formant centre rides the density of the room. Midnight does not
  sound like more of early evening; it sounds like people shouting over a band.
- **Shouts land on the bar line.** The floor bus owns the tempo grid and hands the crowd
  the time of the next downbeat, so a whoop arrives at the end of somebody's chorus rather
  than in the middle of it.
- **A motor car is a gate opening seventeen times a second.** A slow-revving four idling
  near five hundred revolutions a minute fires about seventeen times a second, and that
  rate is the whole character. Scheduling every exhaust pulse would cost hundreds of nodes
  per pass, so a control-rate sawtooth is shaped into narrow pulses and used to gate a
  resonant noise instead — five nodes, and it hunts, because a hand throttle does.
- **A klaxon's harshness is not distortion.** It is a diaphragm being struck by a contact
  breaker tens of times a second, so the tone is amplitude-modulated hard at that rate.
- **A cart walks.** A walk is a four-beat gait and a trot is two, which is why one reads
  as an animal and the other as a hurry. The four hoofs are unevenly spaced, the pass is a
  stereo automation, and the low-pass opens at the nearest point, because distance is a
  cue that a level change alone cannot give.
- **Everything pitched is in B flat**, drawn from the pentatonic B flat C D F G, including
  the ring of the glassware, because cornet, clarinet and trombone are all B flat horns
  and a band of this kind lived in B flat and E flat.
- **The ceiling fan turns at the same speed in both media.** Ninety revolutions a minute
  with four blades passes a blade overhead six times a second, which is the rate the fan
  voice is modulated at in `audio.js` and the rate the fan in the SVG spins at in
  `style.css`.
- **The only meter is the drink.** A club in 1927 had no instrument that showed you a
  level, so putting one on the wall would be a lie dressed up as a period detail. What a
  loud room did have was liquid in a glass, and low frequencies really do move it, so the
  surface of the drink on the foreground table ripples with the master level.

## Accessibility

The two answer groups are `role="radiogroup"` with roving `tabindex` and arrow-key
navigation. The volume control is a hand-built `role="slider"` rather than a native range
input, with `aria-valuetext` spoken as a percentage. The caption line under the card is
`role="status" aria-live="polite"` and describes every audio event as it fires, so the
whole piece works with the sound off. The scene is `aria-hidden`. Reduced motion softens
the visual smoothing and stops the fan and the smoke; it does not gate audio.

## Running it

It is static. Any file server will do:

```
python3 -m http.server 8000
```

Then open the address it prints. No build step, no dependencies, no bundler. Plain HTML,
CSS and ES modules.

## Period

1927 is a live-band room. There is no amplifier in it, which is why there is no mains hum
in the music path and why the only electricity you can hear is the ceiling fan motor. There
is no microphone, no record player, no radio and no jukebox anywhere in the code. The sound
of the band is written entirely through its instrumentation — cornet leading the front
line, clarinet and trombone improvising alongside it, banjo chording, tuba walking the
bass, wood block and press-roll drums. **No performer, group, tune or venue is named
anywhere in this project**, in the code, the comments, the interface or this file.

## Licence

MIT, see `LICENSE`. The ambience is generated by the code in `assets/js/audio.js` at the
moment you hear it. The take in `assets/audio/` was commissioned as an instrumental,
generated on our own GPUs with a licensed speaker timbre applied.
