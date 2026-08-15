/**
 * The Arcade, 1992 - scene, state and interaction.
 *
 * The whole piece has one control. `setPeople` is the only place that changes
 * anything: it moves the audio mix, relights the cabinets, and adds or removes
 * bodies on the floor. Everything else here is drawing and wiring.
 */

import { Arcade, CABINETS, MAGNET, cabinetModes } from './audio.js';
import { STRINGS, t, BANDS } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const MAX_PEOPLE = 38;
const CROWD_FIGURES = 26;

const $ = (sel) => document.querySelector(sel);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* A fixed seed, so the room is laid out the same way on every visit and a
 * screenshot taken today matches one taken next week.                       */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(19920417);
const rr = (a, b) => a + rng() * (b - a);

function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

/* ── the state ───────────────────────────────────────────────────────── */

const state = {
  lang: 'en',
  people: 17,
  volume: 0.7,
  muted: false,
  live: false,
  layers: { cabinets: true, crowd: true, coins: true, machines: true, upstairs: true },
};

const room = new Arcade();

/* ── drawing the hall ────────────────────────────────────────────────── */

/* baseline positions on the floor. The two on the ends step forward, which is
 * what stops the row reading as a flat strip of icons.                      */
const PLACES = [
  { x: 200,  y: 832, s: 1.14, tint: 'm' },
  { x: 402,  y: 754, s: 0.98, tint: 'c' },
  { x: 554,  y: 718, s: 0.88, tint: 'm' },
  { x: 690,  y: 702, s: 0.82, tint: 'c' },
  { x: 826,  y: 714, s: 0.90, tint: 'c' },   // the crowded one
  { x: 962,  y: 702, s: 0.82, tint: 'm' },
  { x: 1098, y: 718, s: 0.88, tint: 'c' },
  { x: 1214, y: 760, s: 0.95, tint: 'm' },
];

/* Two framings of the same hall. Landscape stands in the doorway. Portrait
 * walks up to the machine everybody is watching, because a 375 pixel viewport
 * that tries to hold the whole row holds nothing at all.                     */
const FRAME = {
  wide: '0 150 1600 900',
  tall: '500 40 660 1160',
};

function frameScene() {
  const svg = $('#scene');
  const portrait = window.innerWidth / window.innerHeight < 0.92;
  svg.setAttribute('viewBox', portrait ? FRAME.tall : FRAME.wide);
}

const TINT = { c: '#4be3ff', m: '#ff62cc' };
const cabNodes = [];

function drawCabinets() {
  const gPools = $('#pools');
  const gCabs = $('#cabinets');

  PLACES.forEach((p, i) => {
    const colour = TINT[p.tint];

    /* the light this machine throws onto the floor in front of it */
    const pool = el('g', { class: 'cab-pool', transform: `translate(${p.x} ${p.y})` }, gPools);
    el('ellipse', {
      cx: 0, cy: 26, rx: 150 * p.s, ry: 40 * p.s,
      fill: p.tint === 'c' ? 'url(#gPoolC)' : 'url(#gPoolM)',
    }, pool);

    const g = el('g', {
      class: 'cab is-attract', 'data-cab': i,
      transform: `translate(${p.x} ${p.y}) scale(${p.s})`,
    }, gCabs);

    const body = el('g', { class: 'cab-body' }, g);
    el('polygon', {
      points: '-75,0 -75,-115 -58,-140 -58,-268 -75,-300 75,-300 58,-268 58,-140 75,-115 75,0',
      fill: '#0e141c', stroke: '#1d2833', 'stroke-width': 2,
    }, body);
    /* the cheap plastic side moulding every one of these had */
    el('rect', { x: -75, y: -115, width: 150, height: 6, fill: colour, opacity: 0.12 }, body);
    el('rect', { x: -75, y: -22, width: 150, height: 22, fill: '#000', opacity: 0.5 }, body);

    /* marquee */
    el('rect', {
      class: 'cab-marquee', x: -70, y: -300, width: 140, height: 30, rx: 2,
      fill: colour, opacity: 0.34,
    }, body);
    el('rect', { x: -70, y: -300, width: 140, height: 30, rx: 2, fill: 'none', stroke: '#000', 'stroke-width': 2 }, body);

    /* bezel and tube */
    el('rect', { x: -56, y: -264, width: 112, height: 104, rx: 3, fill: '#05080c' }, body);
    el('rect', {
      class: 'cab-screen', x: -46, y: -254, width: 92, height: 76, rx: 5,
      fill: colour, opacity: 0.8,
    }, body);
    /* scanlines, cut straight into the tube rather than laid over the page */
    for (let k = 0; k < 9; k++) {
      el('rect', { x: -46, y: -254 + k * 8.4, width: 92, height: 3, fill: '#000', opacity: 0.2 }, body);
    }
    el('ellipse', {
      class: 'cab-glow', cx: 0, cy: -216, rx: 165, ry: 130,
      fill: p.tint === 'c' ? 'url(#gPoolC)' : 'url(#gPoolM)',
      filter: 'url(#bloomBig)', opacity: 0.62,
    }, g);

    /* control panel: one stick and three buttons, which is what these had */
    el('polygon', { points: '-58,-140 58,-140 68,-116 -68,-116', fill: '#131b24', stroke: '#202b36', 'stroke-width': 1.5 }, body);
    el('circle', { cx: -30, cy: -128, r: 7, fill: '#0a0e13' }, body);
    el('circle', { cx: -30, cy: -131, r: 5.5, fill: '#b32b3a' }, body);
    [8, 26, 44].forEach((bx, k) => {
      el('circle', { cx: bx, cy: -128 + (k === 1 ? -3 : 0), r: 5.5, fill: k === 1 ? '#d8a01f' : '#2f4a5c' }, body);
    });

    /* coin door and the tray the hundred won lands in */
    el('rect', { x: -26, y: -96, width: 52, height: 34, rx: 2, fill: '#1a222b', stroke: '#2b3743' }, body);
    el('rect', { x: -7, y: -90, width: 3, height: 13, fill: '#000' }, body);
    el('rect', { x: -20, y: -44, width: 40, height: 12, rx: 2, fill: '#000', opacity: 0.75 }, body);

    el('rect', { class: 'cab-hit', x: -80, y: -305, width: 160, height: 310 }, g);

    g.addEventListener('pointerdown', () => insertCoin(i));
    cabNodes.push({ g, pool, marquee: body.querySelector('.cab-marquee') });
  });
}

/* Six stools, red vinyl, none of them level. */
function drawStools() {
  const g = $('#stools');
  const spots = [[300, 850, 1.2], [520, 792, 0.95], [742, 772, 0.85],
                 [1010, 778, 0.9], [1186, 832, 1.05], [884, 842, 1.15]];
  for (const [x, y, s] of spots) {
    const st = el('g', { transform: `translate(${x} ${y}) scale(${s}) rotate(${rr(-4, 4)})` }, g);
    el('ellipse', { cx: 0, cy: 40, rx: 30, ry: 8, fill: '#000', opacity: 0.55 }, st);
    ['-20,0 -14,40', '20,0 14,40', '0,0 0,42'].forEach((pts) => {
      el('polyline', { points: pts, stroke: '#44515e', 'stroke-width': 4, fill: 'none' }, st);
    });
    el('polyline', { points: '-17,22 17,22', stroke: '#44515e', 'stroke-width': 3, fill: 'none' }, st);
    el('ellipse', { cx: 0, cy: 0, rx: 27, ry: 10, fill: 'url(#gVinyl)' }, st);
    el('ellipse', { cx: -6, cy: -3, rx: 12, ry: 4, fill: '#c94a53', opacity: 0.35 }, st);
    el('path', { d: 'M -27 1 q 27 12 54 0', stroke: '#2b0b0e', 'stroke-width': 2.5, fill: 'none' }, st);
  }
}

/**
 * Where the bodies stand, in the order they arrive. The first arrivals spread
 * out along the machines. From about the halfway mark they start collecting
 * around one cabinet near the middle, and by the end that knot is nine deep
 * and you cannot see the screen any more.
 */
function crowdPlan() {
  const plan = [];
  const singles = [
    [1150, 792], [430, 812], [980, 750], [286, 830], [1246, 806], [606, 764],
    [1066, 800], [352, 758], [706, 826], [1182, 726], [500, 736], [880, 840],
  ];
  for (const [x, y] of singles) plan.push({ x, y, cluster: false });
  /* the knot, built outward from directly in front of the machine */
  const knot = [
    [826, 772], [772, 782], [880, 784], [816, 812], [740, 818],
    [898, 816], [856, 836], [774, 840], [914, 838], [710, 788],
    [944, 792], [858, 740], [790, 740], [890, 828],
  ];
  for (const [x, y] of knot) plan.push({ x, y, cluster: true });
  return plan.slice(0, CROWD_FIGURES).map((f) => ({
    ...f,
    x: f.x + rr(-9, 9),
    y: f.y + rr(-5, 5),
    s: (0.66 + ((f.y - 720) / 130) * 0.62) * rr(0.93, 1.09),
    tint: rng() < 0.5 ? TINT.c : TINT.m,
    flip: rng() < 0.5,
  }));
}

const figNodes = [];

function drawCrowd() {
  const g = $('#crowd');
  const plan = crowdPlan();
  /* nearer bodies are drawn last so they occlude the ones behind */
  const order = plan.map((f, i) => ({ f, i })).sort((a, b) => a.f.y - b.f.y);
  for (const { f, i } of order) {
    /* Three nested groups on purpose. A CSS `transform` on an SVG element wins
     * over the `transform` attribute rather than composing with it, so the
     * placement, the arrival animation and the sway each need their own. */
    const at = el('g', {
      transform: `translate(${f.x} ${f.y}) scale(${(f.flip ? -1 : 1) * f.s} ${f.s})`,
    }, g);
    const fig = el('g', { class: 'fig', 'data-i': i }, at);
    const b = el('g', { class: 'fig-body' }, fig);
    el('path', {
      d: 'M -15 0 L -13 -30 Q -16 -46 -8 -50 Q -9 -66 0 -66 Q 9 -66 8 -50 Q 16 -46 14 -30 L 16 0 Z',
      fill: '#04060a',
    }, b);
    el('circle', { cx: 0, cy: -72, r: 9.5, fill: '#04060a' }, b);
    /* rim light off the screens, on the side facing the machines */
    el('path', {
      d: 'M 8 -50 Q 16 -46 14 -30 L 16 0 L 11 0 L 9 -30 Q 11 -44 5 -48 Z',
      fill: f.tint, opacity: 0.5,
    }, b);
    el('path', { d: 'M 4 -78 a 9.5 9.5 0 0 1 5 8', stroke: f.tint, 'stroke-width': 2.4, fill: 'none', opacity: 0.55 }, b);
    b.style.animationDelay = `${(i % 7) * 0.6}s`;
    figNodes[i] = fig;
  }
}

/* ── the one control ─────────────────────────────────────────────────── */

function bandFor(n) {
  if (n === 0) return 0;
  if (n <= 6) return 1;
  if (n <= 18) return 2;
  if (n <= 30) return 3;
  return 4;
}

function setPeople(n, fromInput) {
  state.people = clamp(Math.round(n), 0, MAX_PEOPLE);
  const d = state.people / MAX_PEOPLE;

  if (room.ready) room.setDensity(d);

  /* cabinets relight in step with the mix, from the same function */
  const modes = cabinetModes(d);
  cabNodes.forEach((c, i) => {
    c.g.classList.remove('is-play', 'is-attract', 'is-dark');
    c.g.classList.add(`is-${modes[i]}`);
    c.pool.style.opacity = modes[i] === 'dark' ? 0 : modes[i] === 'play' ? 1 : 0.5;
  });

  const shown = Math.round(d * CROWD_FIGURES);
  figNodes.forEach((f, i) => f.classList.toggle('is-in', i < shown));

  const track = $('#density');
  track.setAttribute('aria-valuenow', String(state.people));
  track.setAttribute('aria-valuetext', peopleText(state.people));
  $('#dens-count').value = String(state.people);
  $('#dens-fill').style.width = `${d * 100}%`;
  $('#dens-knob').style.left = `${d * 100}%`;
  $('#dens-state').textContent = t(BANDS[bandFor(state.people)], state.lang);
  ticks.forEach((tk, i) => {
    tk.classList.toggle('is-on', i < state.people);
    tk.classList.toggle('is-hot', i >= 26);
  });
  if (!fromInput) track.blur?.();
}

function peopleText(n) {
  return state.lang === 'ko' ? `${n}명` : `${n} ${t('densityUnit', 'en')}`;
}

function setVolume(v) {
  state.volume = clamp(v, 0, 1);
  room.setVolume(state.volume);
  const pct = Math.round(state.volume * 100);
  const track = $('#volume');
  track.setAttribute('aria-valuenow', String(pct));
  track.setAttribute('aria-valuetext', state.lang === 'ko' ? `${pct} 퍼센트` : `${pct} percent`);
  $('#vol-fill').style.width = `${pct}%`;
  $('#vol-knob').style.left = `${pct}%`;
}

function insertCoin(i) {
  if (!room.ready) return;
  room.play(i);
  const m = cabNodes[i].marquee;
  m.style.opacity = '1';
  setTimeout(() => { m.style.opacity = ''; }, 420);
}

/* ── slider behaviour, shared by both tracks ─────────────────────────── */

function wireTrack(node, { min, max, step, page, get, set }) {
  const fromX = (clientX) => {
    const r = node.getBoundingClientRect();
    const f = clamp((clientX - r.left) / r.width, 0, 1);
    set(min + f * (max - min), true);
  };
  let dragging = false;

  node.addEventListener('pointerdown', (e) => {
    dragging = true;
    node.setPointerCapture(e.pointerId);
    fromX(e.clientX);
    e.preventDefault();
  });
  node.addEventListener('pointermove', (e) => { if (dragging) fromX(e.clientX); });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    try { node.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);

  node.addEventListener('keydown', (e) => {
    const cur = get();
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = cur + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = cur - step;
    else if (e.key === 'PageUp') next = cur + page;
    else if (e.key === 'PageDown') next = cur - page;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next === null) return;
    e.preventDefault();
    set(clamp(next, min, max), true);
  });

  node.addEventListener('wheel', (e) => {
    e.preventDefault();
    set(clamp(get() + (e.deltaY < 0 ? step : -step), min, max), true);
  }, { passive: false });
}

/* ── layers ──────────────────────────────────────────────────────────── */

const LAYER_ROWS = [
  { id: 'cabinets', name: 'layCabinets', note: 'layCabinetsNote' },
  { id: 'crowd', name: 'layCrowd', note: 'layCrowdNote' },
  { id: 'coins', name: 'layCoins', note: 'layCoinsNote' },
  { id: 'machines', name: 'layMachines', note: 'layMachinesNote' },
  { id: 'upstairs', name: 'layUpstairs', note: 'layUpstairsNote' },
];

function buildLayers() {
  const ul = $('#layers');
  for (const row of LAYER_ROWS) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lay';
    b.dataset.id = row.id;
    b.setAttribute('aria-pressed', 'true');
    b.innerHTML = '<span class="lay-dot"></span><span class="lay-name"></span><span class="lay-note"></span>';
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      state.layers[row.id] = on;
      room.setLayer(row.id, on);
    });
    li.appendChild(b);
    ul.appendChild(li);
  }
}

/* ── language ────────────────────────────────────────────────────────── */

function applyLang() {
  const L = state.lang;
  document.documentElement.lang = L;
  document.title = t('docTitle', L);
  const desc = document.querySelector('meta[name=description]');
  if (desc) desc.setAttribute('content', t('docDesc', L));

  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n, L);
  }
  for (const b of document.querySelectorAll('.lay')) {
    const row = LAYER_ROWS.find((r) => r.id === b.dataset.id);
    b.querySelector('.lay-name').textContent = t(row.name, L);
    b.querySelector('.lay-note').textContent = t(row.note, L);
    b.setAttribute('aria-label', `${t(row.name, L)}: ${t(row.note, L)}`);
  }
  $('#scene').setAttribute('aria-label', t('docDesc', L));
  $('#mute').textContent = t(state.muted ? 'unmuteLabel' : 'muteLabel', L);
  $('#lang').textContent = STRINGS.langLabel[L];
  document.body.dataset.lang = L;
  setPeople(state.people);
  setVolume(state.volume);
}

/* ── going live ──────────────────────────────────────────────────────── */

async function begin() {
  const btn = $('#begin');
  btn.disabled = true;
  try {
    await room.start();
    room.setDensity(state.people / MAX_PEOPLE);
    room.setVolume(state.volume);
    for (const k in state.layers) room.setLayer(k, state.layers[k]);
    state.live = true;
    document.body.classList.remove('is-cover');
    document.body.classList.add('is-live');
    /* a coin in the machine everybody is watching, as the door closes */
    setTimeout(() => insertCoin(MAGNET), 700);
    $('#density').focus({ preventScroll: true });
  } catch (err) {
    btn.disabled = false;
    $('#fault').textContent = t(String(err.message) === 'no-webaudio' ? 'noAudio' : 'blocked', state.lang);
  }
}

/* ── boot ────────────────────────────────────────────────────────────── */

frameScene();
window.addEventListener('resize', frameScene, { passive: true });
drawCabinets();
drawStools();
drawCrowd();

const ticks = [];
{
  const figs = $('#dens-figs');
  for (let i = 0; i < MAX_PEOPLE; i++) {
    const d = document.createElement('span');
    d.className = 'tick';
    figs.appendChild(d);
    ticks.push(d);
  }
}

buildLayers();

wireTrack($('#density'), {
  min: 0, max: MAX_PEOPLE, step: 1, page: 6,
  get: () => state.people,
  set: (v, live) => setPeople(v, live),
});
wireTrack($('#volume'), {
  min: 0, max: 100, step: 5, page: 20,
  get: () => Math.round(state.volume * 100),
  set: (v) => setVolume(v / 100),
});

$('#begin').addEventListener('click', begin);

$('#mute').addEventListener('click', () => {
  state.muted = !state.muted;
  room.setMuted(state.muted);
  $('#mute').setAttribute('aria-pressed', String(state.muted));
  $('#mute').textContent = t(state.muted ? 'unmuteLabel' : 'muteLabel', state.lang);
});

$('#insert').addEventListener('click', () => {
  const modes = cabinetModes(state.people / MAX_PEOPLE);
  const playing = modes.map((m, i) => (m === 'play' ? i : -1)).filter((i) => i >= 0);
  insertCoin(playing.length ? playing[(Math.random() * playing.length) | 0] : MAGNET);
});

$('#lang').addEventListener('click', () => {
  state.lang = state.lang === 'en' ? 'ko' : 'en';
  applyLang();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') $('#mute').click();
});

applyLang();
setPeople(state.people);
setVolume(state.volume);

/* used by the density probe, and by anyone curious in a console */
window.arcade = { room, state, setPeople, CABINETS, MAGNET };
