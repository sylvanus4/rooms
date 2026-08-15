/**
 * app.js - the interface. State, the slip, and the captions.
 *
 * The room is already playing when you walk in. A slip does not start it, it
 * re-mixes it, so every control here is a request rather than a switch.
 */

import { Dabang, resolveMix, DEFAULT_SLIP } from './audio.js';
import { t, setLang, getLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const dabang = new Dabang();
const slip = { ...DEFAULT_SLIP };
let entered = false;
let sending = false;
let volume = 72;

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ── labels ───────────────────────────────────────────────────────── */

const LABEL = {
  mood: { slow: 'moodSlow', brass: 'moodBrass', dance: 'moodDance', quiet: 'moodQuiet' },
  note: { goodbye: 'noteGoodbye', birthday: 'noteBirthday', weather: 'noteWeather', nothing: 'noteNothing' },
  who: { across: 'whoAcross', everyone: 'whoEveryone', myself: 'whoMyself', absent: 'whoAbsent' },
};

/* ── i18n render ──────────────────────────────────────────────────── */

function render() {
  document.title = t('docTitle');
  $('cYear').textContent = t('year');
  $('cTitle').textContent = t('title');
  $('cHero').textContent = t('heroLine');
  $('cBegin').textContent = t('begin');
  $('cNote').textContent = t('coverNote');
  $('cWarn').textContent = t('blocked');

  $('lang').textContent = t('langToggle');
  $('lang').setAttribute('aria-label', t('langLabel'));
  syncMuteLabel();
  $('vol').setAttribute('aria-label', t('volume'));
  $('vol').setAttribute('aria-valuetext', t('volumeText', { n: volume }));

  $('sHead').textContent = t('slipHead');
  $('sSub').textContent = t('slipSub');
  $('sHint').textContent = t('slipHint');
  $('qMood').textContent = t('qMood');
  $('qNote').textContent = t('qNote');
  $('qWho').textContent = t('qWho');
  $('send').textContent = t('send');
  $('again').textContent = t('again');

  for (const box of document.querySelectorAll('.chips')) {
    const group = box.dataset.group;
    for (const chip of box.querySelectorAll('.chip')) {
      chip.textContent = t(LABEL[group][chip.dataset.value]);
    }
  }

  $('nHead').textContent = t('nowHead');
  $('lHead').textContent = t('legendHead');
  $('lRoom').textContent = t('legendRoom');
  $('lRecord').textContent = t('legendRecord');
  $('lBooth').textContent = t('legendBooth');
  $('fNote').textContent = t('footerNote');
  $('fCredit').textContent = t('credit');

  if (entered) renderNow(resolveMix(slip));
}

/* ── the now-playing readout, which is also the caption track ─────── */

const band = (v) => (v <= 0.02 ? 'off' : v < 0.4 ? 'low' : v < 0.8 ? 'mid' : 'high');

function renderNow(mix) {
  $('nFor').textContent = t('nowFor', {
    who: t(LABEL.who[slip.who]),
    note: t(LABEL.note[slip.note]),
  });
  $('nTempo').textContent = t('nowTempo', { n: mix.bpm });

  const rows = [
    ['labelReed', mix.reed / 1.2],
    ['labelBrass', mix.brass],
    ['labelBass', 0.35 + mix.walk * 0.65],
    ['labelKit', mix.kit],
    ['labelRoom', clamp(mix.room / 1.5, 0, 1)],
    ['labelTail', clamp(mix.wetLong / 0.8, 0, 1)],
    ['labelBleed', mix.bleed],
  ];
  const ul = $('nMeters');
  ul.textContent = '';
  for (const [key, raw] of rows) {
    const v = clamp(raw, 0, 1);
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = `${t(key)}, ${t(band(v))}`;
    const bar = document.createElement('span');
    bar.className = 'bar';
    const fill = document.createElement('span');
    fill.style.transform = `scaleX(${Math.max(v, 0.02).toFixed(3)})`;
    bar.appendChild(fill);
    li.append(name, bar);
    ul.appendChild(li);
  }
}

function say(key) {
  $('boothLine').textContent = key ? t(key) : '';
}

/* ── the slip ─────────────────────────────────────────────────────── */

function selectChip(group, value) {
  const box = document.querySelector(`.chips[data-group="${group}"]`);
  for (const chip of box.querySelectorAll('.chip')) {
    const on = chip.dataset.value === value;
    chip.setAttribute('aria-checked', String(on));
    chip.tabIndex = on ? 0 : -1;
  }
  slip[group] = value;
}

function wireChips() {
  for (const box of document.querySelectorAll('.chips')) {
    const group = box.dataset.group;
    const chips = [...box.querySelectorAll('.chip')];

    box.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      selectChip(group, chip.dataset.value);
      chip.focus();
    });

    box.addEventListener('keydown', (e) => {
      const i = chips.indexOf(document.activeElement);
      if (i < 0) return;
      let n = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % chips.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + chips.length) % chips.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = chips.length - 1;
      if (n === null) return;
      e.preventDefault();
      selectChip(group, chips[n].dataset.value);
      chips[n].focus();
    });
  }
}

function submitSlip() {
  if (sending || !entered) return;
  sending = true;
  $('send').disabled = true;

  const mix = resolveMix(slip);
  const { marks, total } = dabang.submit(mix);

  $('slipForm').classList.add('sending');
  const at = (s, key) => setTimeout(() => say(key), Math.round(s * 1000));
  at(marks.paper, 'stagePaper');
  at(marks.lift, 'stageLift');
  at(marks.click, 'stageClick');
  at(marks.announce, 'stageAnnounce');
  at(marks.stylus, 'stageStylus');
  at(marks.music, 'stageMusic');

  setTimeout(() => {
    $('slipForm').hidden = true;
    renderNow(mix);
    $('now').hidden = false;
    $('again').hidden = false;
    $('again').focus();
  }, Math.round(marks.stylus * 1000));

  setTimeout(() => {
    sending = false;
    $('send').disabled = false;
  }, Math.round(total * 1000));
}

function newSlip() {
  $('slipForm').hidden = false;
  $('slipForm').classList.remove('sending');
  $('again').hidden = true;
  say('');
  document.querySelector('.chip[tabindex="0"]').focus();
}

/* ── volume and mute ──────────────────────────────────────────────── */

function applyVolume(v) {
  volume = clamp(Math.round(v), 0, 100);
  const el = $('vol');
  el.setAttribute('aria-valuenow', String(volume));
  el.setAttribute('aria-valuetext', t('volumeText', { n: volume }));
  $('volFill').style.transform = `scaleX(${(volume / 100).toFixed(3)})`;
  dabang.setVolume(volume / 100);
}

function syncMuteLabel() {
  const on = dabang.muted;
  $('mute').setAttribute('aria-pressed', String(on));
  $('mute').setAttribute('aria-label', on ? t('unmute') : t('mute'));
}

function wireVolume() {
  const el = $('vol');
  const fromPointer = (e) => {
    const r = el.getBoundingClientRect();
    applyVolume(((e.clientX - r.left) / r.width) * 100);
  };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    fromPointer(e);
  });
  el.addEventListener('pointermove', (e) => {
    if (el.hasPointerCapture(e.pointerId)) fromPointer(e);
  });
  el.addEventListener('keydown', (e) => {
    const step = e.key === 'PageUp' || e.key === 'PageDown' ? 10 : 4;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp') next = volume + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown') next = volume - step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;
    if (next === null) return;
    e.preventDefault();
    applyVolume(next);
  });
}

/* ── the magic eye, which reads the master level ──────────────────── */

function startEye() {
  const shadow = $('eyeShadow');
  const wrap = $('eyeWrap');
  if (!shadow) return;
  let smooth = 0;
  const frame = () => {
    const lag = reduced.matches ? 0.06 : 0.22;
    smooth += (dabang.level() - smooth) * lag;
    // A strong signal closes the wedge. That is what the tube actually did.
    shadow.style.transform = `scaleX(${clamp(1 - smooth * 0.92, 0.06, 1).toFixed(3)})`;
    wrap.style.opacity = (0.72 + smooth * 0.28).toFixed(3);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ── the scene has to be re-staged for tall viewports, not cropped ── */

function restage() {
  // A tall viewport cannot be served by cropping a wide panorama: slice keeps
  // the full height and throws away the width, so the props end up outside the
  // frame. Portrait gets its own taller canvas centred on the booth instead.
  // The threshold matches the max-aspect-ratio: 3/4 query that moves the slip
  // down the page, so the booth always lands in the strip the slip leaves.
  const portrait = window.innerWidth / window.innerHeight < 0.75;
  $('scene').setAttribute('viewBox', portrait ? '318 60 640 1280' : '0 0 1200 750');
}

/* ── entry ────────────────────────────────────────────────────────── */

async function enter() {
  if (entered) return;
  const btn = $('begin');
  btn.disabled = true;
  const ok = await dabang.start();
  if (!ok) {
    btn.disabled = false;
    $('cWarn').hidden = false;
    return;
  }
  entered = true;
  applyVolume(volume);
  $('cover').hidden = true;
  $('room').hidden = false;
  restage();
  renderNow(resolveMix(slip));
  $('now').hidden = false;
  $('again').hidden = true;
  say('');
  startEye();
}

/* ── wiring ───────────────────────────────────────────────────────── */

setLang('en');
render();
applyVolume(volume);
wireChips();
wireVolume();
restage();

$('begin').addEventListener('click', enter);
$('slipForm').addEventListener('submit', (e) => { e.preventDefault(); submitSlip(); });
$('again').addEventListener('click', newSlip);
$('lang').addEventListener('click', () => {
  setLang(getLang() === 'en' ? 'ko' : 'en');
  render();
});
$('mute').addEventListener('click', () => {
  dabang.setMuted(!dabang.muted);
  syncMuteLabel();
});
window.addEventListener('resize', restage);
