/**
 * app.js - interface, state, and the feel of the dial.
 *
 * The needle is not driven directly by the pointer. The pointer moves a "knob"
 * value; the needle is a spring-damper chasing that value, with a magnetic pull
 * toward nearby stations that behaves like the automatic frequency control on a
 * real receiver. The audio is tuned by the needle's physical position, not by
 * the input, which is why sweeping past a station sounds like sweeping past a
 * station.
 */

import { t, stationName, stationDesc, tunerValueText } from './i18n.js';
import { Receiver, STATIONS, BAND_MIN, BAND_MAX, bestStation } from './audio.js';

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

const $ = (sel) => document.querySelector(sel);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const el = {
  html: document.documentElement,
  chassis: $('#chassis'),
  scale: $('#scale'),
  ticks: $('#ticks'),
  marks: $('#marks'),
  needle: $('#needle'),
  digits: $('#freq-digits'),
  stationName: $('#station-name'),
  stationDesc: $('#station-desc'),
  meterBars: $('#meter-bars'),
  lampLock: $('#lamp-lock'),
  lampStereo: $('#lamp-stereo'),
  power: $('#power'),
  mute: $('#mute'),
  volume: $('#volume'),
  lang: $('#lang-toggle'),
  hint: $('#hint'),
  error: $('#error'),
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  lang: 'en',
  knob: 92.6,      // where the listener has pushed the dial
  freq: 92.6,      // where the needle physically is
  vel: 0,
  power: false,
  muted: false,
  locked: null,    // station id, or null
  sig: 0,          // carrier proximity, 0 between stations and 1 on lock
  meter: 0,
  peak: 0,
};

const radio = new Receiver();

/* ------------------------------------------------------------------ */
/* Faceplate printing                                                  */
/* ------------------------------------------------------------------ */

const posOf = (freq) => (freq - BAND_MIN) / (BAND_MAX - BAND_MIN);

function printScale() {
  const ticks = document.createDocumentFragment();
  for (let i = 0; i <= 100; i++) {
    const f = BAND_MIN + i * 0.2;
    const major = Math.abs(f - Math.round(f)) < 0.001;
    const numeral = major && Math.round(f) % 2 === 0;
    const tick = document.createElement('span');
    tick.className = 'tick' + (numeral ? ' tick--numeral' : major ? ' tick--major' : '');
    tick.style.setProperty('--p', posOf(f));
    ticks.appendChild(tick);
    if (numeral) {
      const label = document.createElement('span');
      label.className = 'numeral';
      label.style.setProperty('--p', posOf(f));
      label.textContent = String(Math.round(f));
      ticks.appendChild(label);
    }
  }
  el.ticks.appendChild(ticks);

  const marks = document.createDocumentFragment();
  for (const s of STATIONS) {
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.dataset.station = s.id;
    mark.style.setProperty('--p', posOf(s.freq));
    mark.innerHTML = '<i></i><b>' + s.freq.toFixed(1) + '</b>';
    marks.appendChild(mark);
  }
  el.marks.appendChild(marks);
}

function printMeter() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 18; i++) {
    const bar = document.createElement('span');
    bar.className = 'meter__bar';
    bar.style.setProperty('--i', i);
    frag.appendChild(bar);
  }
  el.meterBars.appendChild(frag);
}

function measure() {
  el.scale.style.setProperty('--track-w', el.scale.clientWidth + 'px');
}

/* ------------------------------------------------------------------ */
/* Tuning input                                                        */
/* ------------------------------------------------------------------ */

function setKnob(v) {
  state.knob = clamp(v, BAND_MIN, BAND_MAX);
}

function freqFromClientX(clientX) {
  const rect = el.scale.getBoundingClientRect();
  const u = clamp((clientX - rect.left) / rect.width, 0, 1);
  return BAND_MIN + u * (BAND_MAX - BAND_MIN);
}

let dragging = false;

el.scale.addEventListener('pointerdown', (e) => {
  dragging = true;
  el.scale.setPointerCapture(e.pointerId);
  el.scale.classList.add('is-turning');
  setKnob(freqFromClientX(e.clientX));
  e.preventDefault();
});

el.scale.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  setKnob(freqFromClientX(e.clientX));
});

function endDrag(e) {
  if (!dragging) return;
  dragging = false;
  el.scale.classList.remove('is-turning');
  try { el.scale.releasePointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
}
el.scale.addEventListener('pointerup', endDrag);
el.scale.addEventListener('pointercancel', endDrag);

el.scale.addEventListener('wheel', (e) => {
  e.preventDefault();
  const dir = Math.sign(e.deltaY || e.deltaX);
  setKnob(state.knob + dir * 0.07);
}, { passive: false });

el.scale.addEventListener('keydown', (e) => {
  const fine = e.shiftKey ? 0.02 : 0.1;
  let handled = true;
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowUp': setKnob(state.knob + fine); break;
    case 'ArrowLeft':
    case 'ArrowDown': setKnob(state.knob - fine); break;
    case 'PageUp': setKnob(state.knob + 1); break;
    case 'PageDown': setKnob(state.knob - 1); break;
    case 'Home': setKnob(BAND_MIN); break;
    case 'End': setKnob(BAND_MAX); break;
    default: handled = false;
  }
  if (handled) e.preventDefault();
});

/* ------------------------------------------------------------------ */
/* Needle physics                                                      */
/* ------------------------------------------------------------------ */

const PULL_RANGE = 0.55;    // MHz within which the tuner starts to grab
const PULL_STRENGTH = 1.35; // over 1 so the last stretch snaps fully into lock

/** Where the needle actually wants to sit, once magnetism is applied. */
function magnetisedTarget(knob) {
  let nearest = null;
  let bestDist = Infinity;
  for (const s of STATIONS) {
    const d = Math.abs(knob - s.freq);
    if (d < bestDist) { bestDist = d; nearest = s; }
  }
  if (!nearest || bestDist > PULL_RANGE) return knob;
  const pull = Math.min(1, Math.pow(1 - bestDist / PULL_RANGE, 2) * PULL_STRENGTH);
  return knob + (nearest.freq - knob) * pull;
}

function springParams() {
  // Underdamped by default so the needle overshoots and settles; critically
  // damped when the visitor has asked for reduced motion.
  return reduceMotion.matches ? { k: 620, c: 52 } : { k: 170, c: 14.5 };
}

function stepPhysics(dt) {
  const { k, c } = springParams();
  const target = magnetisedTarget(state.knob);
  // Fixed sub-steps keep the spring stable if a frame is late.
  let remaining = dt;
  while (remaining > 0) {
    const h = Math.min(remaining, 1 / 240);
    const a = k * (target - state.freq) - c * state.vel;
    state.vel += a * h;
    state.freq += state.vel * h;
    remaining -= h;
  }
  if (state.freq < BAND_MIN) { state.freq = BAND_MIN; state.vel = Math.max(state.vel, 0); }
  if (state.freq > BAND_MAX) { state.freq = BAND_MAX; state.vel = Math.min(state.vel, 0); }
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

let lastDigits = '';
let lastLocked = 'init';
let lastLit = -1;
let lastAria = '';

function render() {
  const u = posOf(state.freq);
  el.needle.style.setProperty('--u', u.toFixed(5));

  const found = bestStation(state.freq);
  const locked = found && found.signal > 0.82 ? found : null;
  state.locked = locked ? locked.id : null;
  state.sig = found ? found.signal : 0;

  // Station marks glow as the needle nears them.
  for (const mark of el.marks.children) {
    const s = STATIONS.find((x) => x.id === mark.dataset.station);
    const near = found && found.id === s.id ? found.signal : 0;
    mark.style.setProperty('--sig', near.toFixed(3));
    mark.classList.toggle('is-locked', locked ? locked.id === s.id : false);
  }

  const digits = state.freq.toFixed(1);
  if (digits !== lastDigits) {
    el.digits.textContent = digits;
    lastDigits = digits;
    const text = tunerValueText(state.freq, state.locked, state.lang);
    if (text !== lastAria) {
      el.scale.setAttribute('aria-valuenow', digits);
      el.scale.setAttribute('aria-valuetext', text);
      lastAria = text;
    }
  }

  const key = state.power ? (state.locked || 'static') : 'off';
  if (key !== lastLocked) {
    lastLocked = key;
    if (key === 'off') {
      el.stationName.textContent = t('state.off', state.lang);
      el.stationDesc.textContent = t('state.offDesc', state.lang);
      el.stationName.dataset.i18n = 'state.off';
      el.stationDesc.dataset.i18n = 'state.offDesc';
    } else if (key === 'static') {
      el.stationName.textContent = t('state.static', state.lang);
      el.stationDesc.textContent = t('state.staticDesc', state.lang);
      el.stationName.dataset.i18n = 'state.static';
      el.stationDesc.dataset.i18n = 'state.staticDesc';
    } else {
      el.stationName.textContent = stationName(key, state.lang);
      el.stationDesc.textContent = stationDesc(key, state.lang);
      delete el.stationName.dataset.i18n;
      delete el.stationDesc.dataset.i18n;
      el.stationName.dataset.station = key;
      el.stationDesc.dataset.station = key;
    }
    el.chassis.dataset.tuned = key === 'off' || key === 'static' ? 'no' : 'yes';
  }

  el.lampLock.classList.toggle('is-on', !!locked && state.power);
  const stereoOn = !!locked && state.power && locked.stereo && state.meter > 0.18;
  el.lampStereo.classList.toggle('is-on', stereoOn);

  renderMeter();
}

function renderMeter() {
  // A receiver's meter reads carrier strength, not programme loudness, so a
  // locked station must sit high even during a quiet passage. Proximity sets
  // the floor and the live audio level rides on top of it, which keeps the
  // needle genuinely reactive without ever contradicting the LOCK lamp.
  const level = state.power ? radio.readMeter() : 0;
  const floor = state.power ? Math.pow(state.sig, 1.7) * 0.72 : 0;
  const raw = Math.min(1, Math.max(floor, floor * 0.6 + level * 0.9));
  // Ballistics: fast attack, slow release, the way a moving coil behaves.
  const ease = reduceMotion.matches ? 1 : (raw > state.meter ? 0.45 : 0.09);
  state.meter += (raw - state.meter) * ease;
  state.peak = Math.max(state.peak * 0.985, state.meter);

  const bars = el.meterBars.children;
  const lit = Math.round(state.meter * bars.length);
  const peakIdx = Math.min(bars.length - 1, Math.round(state.peak * bars.length) - 1);
  if (lit === lastLit && !state.power) return;
  lastLit = lit;
  for (let i = 0; i < bars.length; i++) {
    bars[i].classList.toggle('is-lit', i < lit);
    bars[i].classList.toggle('is-peak', state.power && i === peakIdx && peakIdx >= lit - 1);
  }
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

function showError(on) {
  el.error.hidden = !on;
  if (on) el.error.textContent = t('state.blocked', state.lang);
}

async function setPower(on) {
  if (on) {
    const ok = await radio.start();
    if (!ok) { showError(true); return; }
    showError(false);
    state.power = true;
  } else {
    radio.stop();
    state.power = false;
  }
  el.chassis.dataset.power = state.power ? 'on' : 'off';
  document.body.dataset.power = state.power ? 'on' : 'off';
  el.power.setAttribute('aria-pressed', String(state.power));
  el.power.setAttribute('aria-label', t(state.power ? 'ctrl.powerOffAria' : 'ctrl.powerOnAria', state.lang));
  el.power.dataset.i18nAria = state.power ? 'ctrl.powerOffAria' : 'ctrl.powerOnAria';
  el.hint.dataset.i18n = state.power ? 'hero.hintOn' : 'hero.hint';
  el.hint.textContent = t(el.hint.dataset.i18n, state.lang);
  lastLocked = 'reset';
}

el.power.addEventListener('click', () => { setPower(!state.power); });

el.mute.addEventListener('click', () => {
  state.muted = !state.muted;
  radio.setMuted(state.muted);
  el.mute.setAttribute('aria-pressed', String(state.muted));
  el.mute.classList.toggle('is-muted', state.muted);
  el.mute.setAttribute('aria-label', t(state.muted ? 'ctrl.unmuteAria' : 'ctrl.muteAria', state.lang));
  el.mute.dataset.i18nAria = state.muted ? 'ctrl.unmuteAria' : 'ctrl.muteAria';
});

el.volume.addEventListener('input', () => {
  radio.setVolume(Number(el.volume.value) / 100);
});

/* ------------------------------------------------------------------ */
/* Language                                                            */
/* ------------------------------------------------------------------ */

function applyLang() {
  const lang = state.lang;
  el.html.setAttribute('lang', lang);
  el.html.dataset.lang = lang;
  document.title = t('meta.title', lang);
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', t('meta.desc', lang));

  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n, lang);
  }
  for (const node of document.querySelectorAll('[data-i18n-aria]')) {
    node.setAttribute('aria-label', t(node.dataset.i18nAria, lang));
  }
  // Station copy is not keyed by data-i18n, so refresh it by hand.
  if (el.stationName.dataset.station && !el.stationName.dataset.i18n) {
    el.stationName.textContent = stationName(el.stationName.dataset.station, lang);
    el.stationDesc.textContent = stationDesc(el.stationDesc.dataset.station, lang);
  }
  lastAria = '';
  lastDigits = '';
}

el.lang.addEventListener('click', () => {
  state.lang = state.lang === 'en' ? 'ko' : 'en';
  applyLang();
});

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  stepPhysics(dt);
  radio.tune(state.freq);
  render();
  requestAnimationFrame(frame);
}

printScale();
printMeter();
measure();
applyLang();
render();
requestAnimationFrame(frame);

window.addEventListener('resize', measure);
reduceMotion.addEventListener('change', () => { state.vel = 0; });
document.addEventListener('visibilitychange', () => { last = performance.now(); });
