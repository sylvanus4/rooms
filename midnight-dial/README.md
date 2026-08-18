# Midnight Dial

**Korean late night radio, 1997. Turn the knob until something finds you.**

Live: <https://sylvanus4.github.io/midnight-dial/>

A cheap FM receiver on a desk after midnight. You are supposed to be asleep. You sweep the
dial slowly through the static, because the space between stations is part of it, and
occasionally something comes through clearly and you stop moving.

Six stations are hidden in the band between 88.0 and 108.0 MHz. None of them are recordings.

---

## The engineering claim

The room's ambience is all synthesised live in the browser — no sample files, no recordings.
Only the music layer is a file: three tracks generated on our own GPUs with MiniMax-Music3.
No licensed commercial recording is used anywhere. Two of the three stations are sung: their vocals were separated out, re-sung in a licensed speaker timbre, and given the original melody back. The opening signal is instruments only.

방 안의 앰비언스는 전부 브라우저에서 실시간으로 합성됩니다 — 샘플 파일도, 녹음물도 없습니다.
음악 레이어만 자체 GPU에서 MiniMax-Music3로 생성한 파일이며, 라이선스된 상업 녹음물은 한 곡도
쓰지 않았습니다. 세 방송 중 둘에는 노래가 있습니다 — 보컬을 분리해 라이선스를 가진 화자 음색으로 다시 부르게 한 뒤 원래 선율을 되이식했습니다. 오프닝 시그널만 악기입니다.

The receiver, the static, the heterodyne whistle and six of the nine stations are synthesised
at runtime with the Web Audio API: oscillators, noise written into `AudioBuffer`s, biquad
filters, delay lines, scheduled envelopes, and a convolution reverb whose impulse response is
generated procedurally rather than sampled from a real room.

The other three stations — 93.9, 102.9 and 106.3 — carry the generated tracks. They are
stations like any other: the needle is magnetised toward them, the mark lights as you arrive,
and between them you get the same interstation noise as everywhere else on the band. The
tracks go through `assets/js/room-music.js` on the `fm-receiver` medium, so they are band
limited near 15 kHz and compressed the way a broadcast chain compresses, and they join the
same station bus and the same short room as everything the receiver picks up.

That split is partly a licensing position and partly the point of the exercise.

### Master chain

```
stations ──┬─> stationBus ──┬─> AnalyserNode        (the signal meter tap)
           │                └─> preMaster
           ├─> revShortIn ──> ConvolverNode (1.3 s) ─> preMaster
           └─> revLongIn  ──> ConvolverNode (3.6 s) ─> preMaster
static  ─────> bandpass ──> highpass ──> staticGain ─> preMaster
heterodyne ──> two sine oscillators ──> hetGain ────> preMaster

preMaster ──> DynamicsCompressor ──> masterGain ──> destination
```

The meter taps `stationBus`, not the master output. On a real receiver, signal strength is not
volume: muting the radio should not fake a dead antenna, and a wall of static should not read
as a strong signal. Tapping the station bus makes the needle mean what it says.

### The reverb

`makeImpulse()` writes an impulse response into a stereo `AudioBuffer`:

- exponentially decaying noise, `pow(1 - t, decay)`,
- a one-pole lowpass running down the buffer so the tail darkens as it decays,
- **independent noise per channel**, so the reverb is genuinely stereo rather than a duplicated
  mono cloud,
- a slightly different pre-delay per channel plus three sparse early reflections, which is what
  gives the space walls.

Two spaces exist: a short room for close stations and a long hall for the distant ones. Each
station chooses its own send levels, so sweeping the dial feels like travelling.

### The band between stations

Static is a looping white-noise `AudioBuffer` through a bandpass whose centre frequency and `Q`
are functions of the strongest station's signal. Far from a station it is a broad hiss centred
near 2.3 kHz. As a station arrives, the band narrows (Q rises to about 6) and drops toward
900 Hz while its gain falls, so the noise appears to close in around the carrier.

The heterodyne whistle is two sine oscillators, the second at 1.48x the first so they beat.
Their gain follows `sin(signal * pi)`, which peaks *while a station is arriving* and vanishes
once it has landed. This transition band is where most of the tuning time gets spent, so most
of the work went here.

### The six stations

| MHz | Station | What it is made of |
|---|---|---|
| 89.1 | Late Night Music Room | FM bell voices (sine carrier, sine modulator at 1x, 2x or 3.5x with a decaying index) on an A natural minor pentatonic, through a delay line wobbled by a 0.24 Hz wow LFO and a 5.7 Hz flutter LFO. Vinyl crackle is one looping noise source gated open for a few milliseconds at random intervals. |
| 91.9 | Rain | No melody. Two noise layers (a lowpassed street body, a highpassed pane hiss) with a 0.055 Hz gust LFO on the lowpass. Individual drops gate a second noise loop through a bandpass that is retuned to a random 1.1 to 4.2 kHz immediately before each hit, with random pan. Thunder is a lowpassed noise swell, filter sweeping 230 Hz down to 62 Hz, sent almost entirely to the long reverb. |
| 95.9 | Dawn Ballad | Three detuned sawtooths through a breathing lowpass for the pad, a triangle arpeggio at 72 bpm over Am, F, C, G. Chorus is a dry centre plus two delay taps (19 ms and 27 ms) modulated at 0.23 and 0.31 Hz, panned hard left and right. |
| 98.7 | Night Highway | 132 bpm motorik: a sine kick pitched 118 Hz down to 46 Hz in 110 ms, offbeat noise ticks through a 4.2 kHz bandpass, a road bed of lowpassed noise plus a 115 Hz rumble band. Passing cars sweep a bandpass from about 800 Hz down to 300 Hz while a `StereoPannerNode` ramps from one side to the other: filter and pan together read as Doppler. |
| 101.3 | Shortwave | Not music. Two carriers random-walking between 420 and 2600 Hz, a morse key (620 Hz sine, 68 ms dot, soft 4 ms edges so it never clicks) sending nothing in particular, and an ionospheric fade: a station-wide gain that retargets itself to a random value every few seconds with a 1.3 s time constant. Broadcast in mono, so the stereo lamp stays dark. |
| 104.5 | Four A.M. | Almost nothing. Three drone oscillators around E2 and B2 under a 420 Hz lowpass with a 0.048 Hz breath, room tone from heavily lowpassed noise, and one inharmonic FM bell (modulator at 2.76x the carrier, the classic bell ratio) roughly every twenty seconds into the long reverb. |

### Station lifecycle

Six full synthesis graphs running at once would be wasteful, so they are built and torn down on
demand. A station is constructed when its target gain first rises above an audible floor and
disposed 1.2 seconds after it falls back to silence. In practice one graph exists at a time,
and two during a crossfade. Note scheduling runs on a 40 ms interval with a 250 ms lookahead
rather than on animation frames, so a busy main thread cannot make the music stutter.

### The needle

The pointer does not move the needle. It moves a *knob* value; the needle is a spring-damper
chasing it, integrated in fixed 1/240 s sub-steps so a late frame cannot destabilise it. Within
0.55 MHz of a station the target is pulled toward that station with a quadratic falloff, which
is what automatic frequency control feels like: the needle snaps into lock and resists leaving.

The audio is tuned by the needle's physical position, not by the input. That is why flicking
the dial across the band sounds like flicking a dial across a band.

Under `prefers-reduced-motion: reduce` the spring becomes critically damped, the grain stops
moving, and the meter loses its ballistics. Tuning still works exactly the same.

---

## Running it locally

No build step, no dependencies, no bundler. It is plain HTML, CSS, and ES modules, so it needs
to be served over HTTP for the module imports to resolve:

```bash
python3 -m http.server 8000
# then open localhost:8000 in a browser
```

Once loaded, it works with the network disconnected. There are zero external requests: no CDN,
no web fonts, no analytics, no images. Typography is built entirely from local font stacks, and
every graphic is CSS or inline SVG.

Press **Power**, then drag the dial, scroll it, or use the arrow keys. Page Up and Page Down
jump a full megahertz. Home and End go to the ends of the band. The dial is exposed as an ARIA
slider and announces the frequency and the station it has found.

## Browser support

Anything with `AudioContext`, `StereoPannerNode`, and ES modules. Audio only starts inside the
power button's click handler, as autoplay policy requires; if `resume()` is refused, the page
says so rather than sitting there silently.

## License

MIT, see [LICENSE](LICENSE).

No copyrighted audio is used, included, or referenced in this project. There are no samples
and no recordings of any kind: the receiver and six of the nine stations are generated from
first principles at runtime, and the three tracks in `assets/audio/` were generated with
MiniMax-Music3 on our own GPUs. The signal is instrumental; the letter and the sign-off are sung. The whole thing is yours to
fork.
