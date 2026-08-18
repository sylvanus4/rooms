/**
 * app.js - the interface. State, the table card, and the captions.
 *
 * The band is already playing when you come down the stairs. The card does not
 * start anything and it does not stop anything: it walks you across a room
 * that keeps going while you cross it. Every control here is a move rather
 * than a switch.
 *
 * This file owns no AudioNode. It calls the engine and reads it back.
 */

import { Club, resolveMix, DEFAULT_WHERE } from './audio.js';
import { t, setLang, getLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const club = new Club();
const where = { ...DEFAULT_WHERE };
let entered = false;
let moving = false;
let volume = 72;

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ── labels ───────────────────────────────────────────────────────── */

const LABEL = {
  seat: { front: 'seatFront', bar: 'seatBar', back: 'seatBack', stairs: 'seatStairs' },
  hour: { early: 'hourEarly', midnight: 'hourMidnight', two: 'hourTwo', close: 'hourClose' },
};

/* What the distance is doing to the band, named per seat. This is the medium
   layer surfaced as text, so the piece still explains itself with no sound. */
const MEDIUM_LINE = {
  front: 'medFront',
  bar: 'medBar',
  back: 'medBack',
  stairs: 'medStairs',
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

  $('sHead').textContent = t('cardHead');
  $('sSub').textContent = t('cardSub');
  $('sHint').textContent = t('cardHint');
  $('qSeat').textContent = t('qSeat');
  $('qHour').textContent = t('qHour');
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
  $('lCrowd').textContent = t('legendCrowd');
  $('lBar').textContent = t('legendBar');
  $('lFloor').textContent = t('legendFloor');
  $('lStreet').textContent = t('legendStreet');
  $('fNote').textContent = t('footerNote');
  $('fCredit').textContent = t('credit');

  if (entered) renderNow(resolveMix(where));
}

/* ── the readout, which is also the caption track ─────────────────── */

const band = (v) => (v <= 0.02 ? 'off' : v < 0.4 ? 'low' : v < 0.8 ? 'mid' : 'high');

function renderNow(mix) {
  $('nWhere').textContent = t('nowWhere', {
    seat: t(LABEL.seat[where.seat]),
    hour: t(LABEL.hour[where.hour]),
  });
  // The seat the engine is actually on, not the one the card is showing:
  // during a move those differ for about a second and a half, and the
  // readout should not lie about which of the four is audible.
  $('nMedium').textContent = t(MEDIUM_LINE[club.onSeat] || MEDIUM_LINE.bar);
  $('nTempo').textContent = t('nowTempo');

  const rows = [
    ['labelBand', mix.music],
    ['labelCrowd', clamp(mix.crowd / 1.12, 0, 1)],
    ['labelGlass', clamp(mix.glass / 1.3, 0, 1)],
    ['labelFloor', mix.floor],
    ['labelStreet', mix.street],
    ['labelFan', mix.fan],
    ['labelSlap', clamp(mix.wetSlap / 0.55, 0, 1)],
    ['labelStair', clamp(mix.wetStair / 0.62, 0, 1)],
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
  $('floorLine').textContent = key ? t(key) : '';
}

/* ── the card ─────────────────────────────────────────────────────── */

function selectChip(group, value) {
  const box = document.querySelector(`.chips[data-group="${group}"]`);
  for (const chip of box.querySelectorAll('.chip')) {
    const on = chip.dataset.value === value;
    chip.setAttribute('aria-checked', String(on));
    chip.tabIndex = on ? 0 : -1;
  }
  where[group] = value;
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

function takeSeat() {
  if (moving || !entered) return;
  moving = true;
  $('send').disabled = true;

  const mix = resolveMix(where);
  const { marks, total } = club.move(mix, where);

  $('cardForm').classList.add('sending');
  const at = (s, key) => setTimeout(() => say(key), Math.round(s * 1000));
  at(marks.up, 'stageUp');
  at(marks.walk, 'stageWalk');
  at(marks.part, 'stagePart');
  at(marks.sit, 'stageSit');
  at(marks.glass, 'stageGlass');
  at(marks.settle, 'stageSettle');

  setTimeout(() => {
    $('cardForm').hidden = true;
    renderNow(mix);
    $('now').hidden = false;
    $('again').hidden = false;
    $('again').focus();
  }, Math.round(marks.sit * 1000));

  // The medium line is about which instance is audible, and the crossfade
  // finishes after the card is already off the screen, so it is re-stamped
  // once the move has actually landed.
  setTimeout(() => renderNow(mix), Math.round(marks.settle * 1000));

  setTimeout(() => {
    moving = false;
    $('send').disabled = false;
  }, Math.round(total * 1000));
}

function newCard() {
  $('cardForm').hidden = false;
  $('cardForm').classList.remove('sending');
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
  club.setVolume(volume / 100);
}

function syncMuteLabel() {
  const on = club.muted;
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

/* ── the glass, which is the only meter this room is allowed ──────── */

/**
 * A club in 1927 had no instrument that showed you a level, so putting one on
 * the wall would be a lie dressed up as a period detail. What a loud room in
 * 1927 did have was liquid in a glass on a table, and low frequencies really
 * do move it. So the meter is the drink: the surface ripples with the master
 * level, and the lamp haze above the stage swells with it.
 */
function startGlass() {
  const surface = $('glassSurface');
  const haze = $('hazeGlow');
  if (!surface) return;
  let smooth = 0;
  let phase = 0;
  const frame = () => {
    const lag = reduced.matches ? 0.06 : 0.22;
    smooth += (club.level() - smooth) * lag;
    phase += 0.19 + smooth * 0.5;
    const wob = Math.sin(phase) * smooth;
    surface.style.transform =
      `translateY(${(wob * 1.6).toFixed(2)}px) scaleY(${(1 + wob * 0.22).toFixed(3)})`;
    if (haze) haze.style.opacity = (0.1 + smooth * 0.26).toFixed(3);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ── the scene has to be re-staged for tall viewports, not cropped ── */

function restage() {
  // A tall viewport cannot be served by cropping a wide panorama: slice keeps
  // the full height and throws away the width, so the stage ends up outside
  // the frame. Portrait gets its own taller canvas centred on the bandstand
  // instead. The threshold matches the max-aspect-ratio: 3/4 query that moves
  // the card down the page, so the stage always lands in the strip the card
  // leaves above it.
  const portrait = window.innerWidth / window.innerHeight < 0.75;
  $('scene').setAttribute('viewBox', portrait ? '250 40 660 1320' : '0 0 1200 750');
}

/* ── entry ────────────────────────────────────────────────────────── */

async function enter() {
  if (entered) return;
  const btn = $('begin');
  btn.disabled = true;
  const ok = await club.start();
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
  renderNow(resolveMix(where));
  $('now').hidden = false;
  $('again').hidden = true;
  say('');
  startGlass();
}

/* ── wiring ───────────────────────────────────────────────────────── */

setLang('en');
render();
applyVolume(volume);
wireChips();
wireVolume();
restage();

$('begin').addEventListener('click', enter);
$('cardForm').addEventListener('submit', (e) => { e.preventDefault(); takeSeat(); });
$('again').addEventListener('click', newCard);
$('lang').addEventListener('click', () => {
  setLang(getLang() === 'en' ? 'ko' : 'en');
  render();
});
$('mute').addEventListener('click', () => {
  club.setMuted(!club.muted);
  syncMuteLabel();
});
window.addEventListener('resize', restage);
