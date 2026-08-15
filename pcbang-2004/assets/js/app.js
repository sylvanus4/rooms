/**
 * PC Bang 2004 — interface, state, and the power-on sequence.
 * The synthesis lives in audio.js. This file only decides what the room
 * should sound like and draws the machine around it.
 */

import { Room, SEATS, flickerValue } from './audio.js';
import { T, t } from './i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  lang: (navigator.language || 'en').toLowerCase().startsWith('ko') ? 'ko' : 'en',
  seat: 'corner',
  layers: { keys: true, fans: true, room: true, crt: false, fluo: true },
  muted: false,
  volume: 0.7,
  seconds: 7200,          // 02:00:00 prepaid
  booted: false,
};

const room = new Room();

/* ── seat and layer definitions, kept next to each other on purpose ────── */

const SEAT_DEFS = [
  { id: 'window',  key: 'seatWindow',  desc: 'seatWindowDesc',  cell: [3, 0] },
  { id: 'corner',  key: 'seatCorner',  desc: 'seatCornerDesc',  cell: [7, 4] },
  { id: 'counter', key: 'seatCounter', desc: 'seatCounterDesc', cell: [0, 4] },
];

const LAYER_DEFS = [
  { id: 'keys', key: 'layerKeys', note: 'layerKeysNote' },
  { id: 'fans', key: 'layerFans', note: 'layerFansNote' },
  { id: 'room', key: 'layerRoom', note: 'layerRoomNote' },
  { id: 'fluo', key: 'layerFluo', note: 'layerFluoNote' },
  { id: 'crt',  key: 'layerCrt',  note: 'layerCrtNote' },
];

/* ── i18n plumbing ────────────────────────────────────────────────────── */

function paintStrings() {
  document.documentElement.lang = state.lang;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n, state.lang);
  }
  $('lang-btn').textContent = t('langSwitch', state.lang);
  $('lang-btn').setAttribute('lang', state.lang === 'en' ? 'ko' : 'en');
  $('lang-btn').setAttribute('aria-label', state.lang === 'en' ? 'Read this in Korean' : 'Read this in English');
  $('power-btn').setAttribute('aria-label', t('powerOn', state.lang));
  paintSeats();
  paintLayers();
  paintPlanLabels();
  paintMute();
  paintClock();
  paintNowPlaying();
  $('vol').setAttribute('aria-label', t('volume', state.lang));
  updateVolumeText();
}

/* ── floor plan ───────────────────────────────────────────────────────── */

const PLAN = { cols: 8, rows: 5, ox: 96, oy: 44, dx: 25, dy: 24 };

function seatXY([col, row]) {
  return [PLAN.ox + col * PLAN.dx, PLAN.oy + row * PLAN.dy];
}

function node(name, attrs, text) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

function buildPlan() {
  const svg = node('svg', {
    viewBox: '0 0 300 186', class: 'plan', role: 'img', id: 'plan-svg',
    'aria-labelledby': 'plan-title',
  });
  svg.appendChild(node('title', { id: 'plan-title' }, t('planLabel', state.lang)));

  svg.appendChild(node('rect', { x: 6, y: 6, width: 288, height: 174, rx: 3, class: 'plan__room' }));
  svg.appendChild(node('rect', { x: 22, y: 6, width: 256, height: 5, class: 'plan__window' }));
  svg.appendChild(node('rect', { x: 12, y: 144, width: 66, height: 28, rx: 2, class: 'plan__counter' }));
  svg.appendChild(node('rect', { x: 4, y: 56, width: 4, height: 34, class: 'plan__door' }));

  const named = new Map(SEAT_DEFS.map((s) => [`${s.cell[0]},${s.cell[1]}`, s.id]));
  for (let row = 0; row < PLAN.rows; row++) {
    for (let col = 0; col < PLAN.cols; col++) {
      const [x, y] = seatXY([col, row]);
      const id = named.get(`${col},${row}`);
      const g = node('g', { class: id ? 'plan__desk plan__desk--named' : 'plan__desk', 'data-seat': id || '' });
      g.appendChild(node('rect', { x: x - 7, y: y - 5, width: 14, height: 10, rx: 1.5, class: 'plan__mon' }));
      if (id) g.appendChild(node('circle', { cx: x, cy: y, r: 12, class: 'plan__halo' }));
      svg.appendChild(g);
    }
  }

  svg.appendChild(node('text', { x: 150, y: 22, class: 'plan__t plan__t--mid', id: 'plan-lb-window' }));
  svg.appendChild(node('text', { x: 45, y: 161, class: 'plan__t plan__t--mid', id: 'plan-lb-counter' }));
  svg.appendChild(node('text', { x: 14, y: 104, class: 'plan__t', id: 'plan-lb-door' }));

  $('plan').appendChild(svg);
}

function paintPlanLabels() {
  $('plan-lb-window').textContent = t('planWindow', state.lang);
  $('plan-lb-counter').textContent = t('planCounter', state.lang);
  $('plan-lb-door').textContent = t('planDoor', state.lang);
  $('plan-title').textContent = t('planLabel', state.lang);
}

function paintPlanActive() {
  for (const g of document.querySelectorAll('.plan__desk--named')) {
    g.classList.toggle('is-here', g.dataset.seat === state.seat);
  }
}

/* ── seat picker (native radios, so keyboard support is free) ─────────── */

function buildSeats() {
  const host = $('seats');
  for (const def of SEAT_DEFS) {
    const label = document.createElement('label');
    label.className = 'seat';
    label.innerHTML = `
      <input class="seat__input" type="radio" name="seat" value="${def.id}"${def.id === state.seat ? ' checked' : ''}>
      <span class="seat__face">
        <span class="seat__led" aria-hidden="true"></span>
        <span class="seat__name" data-seat-name="${def.id}"></span>
        <span class="seat__desc" data-seat-desc="${def.id}"></span>
      </span>`;
    host.appendChild(label);
  }
  host.addEventListener('change', (e) => {
    const input = e.target.closest('.seat__input');
    if (!input) return;
    state.seat = input.value;
    room.setSeat(state.seat);
    paintPlanActive();
    paintNowPlaying();
  });
}

function paintSeats() {
  for (const def of SEAT_DEFS) {
    document.querySelector(`[data-seat-name="${def.id}"]`).textContent = t(def.key, state.lang);
    document.querySelector(`[data-seat-desc="${def.id}"]`).textContent = t(def.desc, state.lang);
  }
}

/* ── layer rack ──────────────────────────────────────────────────────── */

function buildLayers() {
  const host = $('layers');
  for (const def of LAYER_DEFS) {
    const label = document.createElement('label');
    label.className = 'sw';
    label.innerHTML = `
      <input class="sw__input" type="checkbox" role="switch" data-layer="${def.id}"${state.layers[def.id] ? ' checked' : ''}>
      <span class="sw__track" aria-hidden="true"><span class="sw__knob"></span></span>
      <span class="sw__text">
        <span class="sw__name" data-layer-name="${def.id}"></span>
        <span class="sw__note" data-layer-note="${def.id}"></span>
      </span>`;
    host.appendChild(label);
  }
  host.addEventListener('change', (e) => {
    const input = e.target.closest('.sw__input');
    if (!input) return;
    const id = input.dataset.layer;
    state.layers[id] = input.checked;
    room.setLayer(id, input.checked);
    paintNowPlaying();
  });
}

function paintLayers() {
  for (const def of LAYER_DEFS) {
    document.querySelector(`[data-layer-name="${def.id}"]`).textContent = t(def.key, state.lang);
    document.querySelector(`[data-layer-note="${def.id}"]`).textContent = t(def.note, state.lang);
  }
}

/* ── the caption: what the mix sounds like, in words ──────────────────── */

function paintNowPlaying() {
  const out = $('now-playing');
  if (state.muted) { out.textContent = t('nowMuted', state.lang); return; }

  const near = SEATS[state.seat].near;
  const parts = [];
  if (state.layers.keys) {
    parts.push(t(near > 0.5 ? 'descKeysNear' : near > 0.25 ? 'descKeysMid' : 'descKeysFar', state.lang));
  }
  if (state.layers.fans) parts.push(t('descFans', state.lang));
  if (state.layers.room) {
    parts.push(t('descRoom', state.lang));
    if (SEATS[state.seat].traffic > 0.5) parts.push(t('descTraffic', state.lang));
    if (SEATS[state.seat].counter > 0.5) parts.push(t('descCounter', state.lang));
  }
  if (state.layers.fluo) parts.push(t('descFluo', state.lang));
  if (state.layers.crt) parts.push(t('descCrt', state.lang));

  out.textContent = parts.length
    ? parts.join(t('nowJoin', state.lang)) + '.'
    : t('nowSilent', state.lang);
}

/* ── prepaid clock ───────────────────────────────────────────────────── */

const WARN_MARKS = [600, 300, 60, 0];
let lastSeconds = state.seconds;

function fmt(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function paintClock() {
  const el = $('clock');
  el.textContent = fmt(state.seconds);
  const low = state.seconds <= 600;
  $('ticket').classList.toggle('is-low', low && state.seconds > 0);
  $('ticket').classList.toggle('is-out', state.seconds === 0);
  const note = $('ticket-note');
  note.textContent = state.seconds === 0
    ? t('expired', state.lang)
    : low ? t('lowTime', state.lang) : t('prepaid', state.lang);
  el.setAttribute('aria-label', `${t('remaining', state.lang)} ${fmt(state.seconds)}`);
}

function tickClock() {
  if (state.seconds <= 0) return;
  state.seconds -= 1;
  for (const mark of WARN_MARKS) {
    if (lastSeconds > mark && state.seconds <= mark) room.buzzer(false);
  }
  lastSeconds = state.seconds;
  paintClock();
}

function addHour() {
  state.seconds = Math.min(state.seconds + 3600, 5 * 3600);
  lastSeconds = state.seconds;
  room.buzzer(true);
  paintClock();
}

/* ── volume and mute ─────────────────────────────────────────────────── */

function updateVolumeText() {
  const pct = Math.round(state.volume * 100);
  $('vol').setAttribute('aria-valuetext', `${pct}%`);
}

function paintMute() {
  const btn = $('mute-btn');
  btn.setAttribute('aria-pressed', String(state.muted));
  $('mute-label').textContent = t(state.muted ? 'unmute' : 'mute', state.lang);
  $('mute-icon').textContent = state.muted ? '✕' : '●';
}

/* ── atmosphere driven by the same flicker curve as the tube ──────────── */

let rafId = 0;
function startFlicker() {
  const root = document.documentElement;
  if (reduceMotion.matches) { root.style.setProperty('--flicker', '0'); return; }
  const loop = () => {
    const now = room.ctx ? room.ctx.currentTime : performance.now() / 1000;
    root.style.setProperty('--flicker', (1 - flickerValue(now)).toFixed(3));
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

function stopFlicker() {
  cancelAnimationFrame(rafId);
  rafId = 0;
  document.documentElement.style.setProperty('--flicker', '0');
}

/* ── power on ────────────────────────────────────────────────────────── */

let bootTimers = [];
function clearBoot() { bootTimers.forEach(clearTimeout); bootTimers = []; }
function after(ms, fn) { bootTimers.push(setTimeout(fn, ms)); }

async function powerOn() {
  const btn = $('power-btn');
  btn.disabled = true;
  try {
    await room.start();
  } catch (err) {
    btn.disabled = false;
    const fail = $('power-fail');
    fail.textContent = t('powerFail', state.lang);
    fail.hidden = false;
    return;
  }
  room.setVolume(state.volume);
  room.setSeat(state.seat);
  for (const [id, on] of Object.entries(state.layers)) room.setLayer(id, on);
  room.degauss();

  $('power').hidden = true;
  runBoot();
}

function runBoot() {
  const boot = $('boot');
  const raster = $('boot-raster');
  const lines = $('boot-lines');
  const skip = $('boot-skip');
  boot.hidden = false;
  skip.hidden = false;
  skip.focus();

  if (reduceMotion.matches) { finishBoot(); return; }

  raster.classList.add('is-dot');
  after(80, () => { raster.classList.remove('is-dot'); raster.classList.add('is-line'); });
  after(300, () => { raster.classList.remove('is-line'); raster.classList.add('is-full'); });
  after(560, () => { raster.classList.add('is-gone'); });

  const script = T.boot[state.lang] || T.boot.en;
  script.forEach((line, i) => {
    after(620 + i * 175, () => { lines.textContent += (i ? '\n' : '') + line; });
  });
  after(620 + script.length * 175 + 420, finishBoot);
}

function finishBoot() {
  if (state.booted) return;
  state.booted = true;
  clearBoot();
  $('boot').hidden = true;
  $('boot-skip').hidden = true;
  $('power').hidden = true;

  const shell = $('shell');
  shell.hidden = false;
  // one h1 in the document, moved from the cover into the hero
  const h1 = $('power-h');
  h1.className = 'hero__title';
  $('hero').prepend(h1);
  shell.classList.add('is-in');

  paintPlanActive();
  paintNowPlaying();
  setInterval(tickClock, 1000);
  // move the reading position to the top of the view that just appeared
  shell.setAttribute('tabindex', '-1');
  shell.focus({ preventScroll: true });
}

/* ── wiring ──────────────────────────────────────────────────────────── */

function wire() {
  $('power-btn').addEventListener('click', powerOn);
  $('boot-skip').addEventListener('click', finishBoot);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !state.booted && !$('boot').hidden) finishBoot();
  });

  $('lang-btn').addEventListener('click', () => {
    state.lang = state.lang === 'en' ? 'ko' : 'en';
    paintStrings();
  });

  $('add-time').addEventListener('click', addHour);

  $('vol').addEventListener('input', (e) => {
    state.volume = Number(e.target.value) / 100;
    room.setVolume(state.volume);
    updateVolumeText();
    if (state.muted) {
      state.muted = false;
      room.setMuted(false);
      paintMute();
      paintNowPlaying();
    }
  });

  $('mute-btn').addEventListener('click', () => {
    state.muted = !state.muted;
    room.setMuted(state.muted);
    paintMute();
    paintNowPlaying();
  });

  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) stopFlicker(); else startFlicker();
  });

  window.addEventListener('pagehide', () => { room.stop(); });
}

buildPlan();
buildSeats();
buildLayers();
paintStrings();
paintPlanActive();
wire();
startFlicker();
