/* =============================================================================
   walkman-1999 - interface and state.

   The engine in audio.js owns the tape. This file owns the plastic around it:
   the keys, the reels, the counter, the wear meter, and the language.
   ========================================================================== */

import { audio, SEGMENTS, PLANS } from "./audio.js";
import { STRINGS, t } from "./i18n.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let lang = "en";
let started = false;
let statusHold = 0;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

const el = {
  cover: $("#cover"),
  deck: $("#deck"),
  begin: $("#begin"),
  lang: $("#lang-btn"),
  meter: $("#meter"),
  status: $("#status"),
  counter: $("#counter"),
  led: $("#led"),
  reelL: $("#reel-l"),
  reelR: $("#reel-r"),
  packL: $("#pack-l"),
  packR: $("#pack-r"),
  wearTitle: $("#wear-title"),
  wearLocal: $("#wear-local"),
  wearMean: $("#wear-mean"),
  lbl1: $("#lbl-1"),
  lbl2: $("#lbl-2"),
  lblSide: $("#lbl-side"),
  vol: $("#vol"),
  mute: $("#btn-mute"),
  keys: {
    play: $("#btn-play"), stop: $("#btn-stop"),
    rew: $("#btn-rew"), ff: $("#btn-ff"), flip: $("#btn-flip"),
  },
};

/* ---- language ------------------------------------------------------------ */

function applyLang() {
  document.documentElement.lang = lang;
  for (const node of $$("[data-i18n]")) {
    const key = node.dataset.i18n;
    if (STRINGS[key]) node.textContent = t(key, lang);
  }
  el.lang.setAttribute("aria-label", lang === "en" ? "한국어로 보기" : "View in English");
  el.mute.setAttribute("aria-label", t(audio.muted ? "unmute" : "mute", lang));
  el.vol.setAttribute("aria-label", t("volume", lang));
  el.lbl1.textContent = t("labelHand1", lang);
  el.lbl2.textContent = t("labelHand2", lang);
  document.title = t("title", lang);
  paintSide();
  say(baseStatus(), false);
}

function paintSide() {
  el.lblSide.textContent = `${t("labelSide", lang)} ${audio.side}`;
  el.wearTitle.textContent = lang === "ko"
    ? `${t("wearTitle", lang)}${audio.side}면`
    : `${t("wearTitle", lang)}${audio.side}`;
  for (let i = 0; i < SEGMENTS; i++) {
    segs[i].classList.toggle("chorus", PLANS[audio.side][i] === "chorus");
  }
}

/* ---- status line --------------------------------------------------------- */

function baseStatus() {
  if (audio.arrived) return t("stArrived", lang);
  switch (audio.mode) {
    case "play": return lang === "ko"
      ? `${t("stPlaying", lang)}${audio.side}면`
      : `${t("stPlaying", lang)}${audio.side}`;
    case "rew": return t("stRew", lang);
    case "ff": return t("stFf", lang);
    default: return t("stStopped", lang);
  }
}

/** transient lines win for a moment, then the mode line comes back */
function say(text, transient) {
  const now = performance.now();
  if (!transient && now < statusHold) return;
  if (transient) statusHold = now + 2400;
  el.status.textContent = text;
  el.status.classList.toggle("warn", !!transient);
}

/* ---- the wear meter ------------------------------------------------------ */

const segs = [];
const fills = [];

function buildMeter() {
  for (let i = 0; i < SEGMENTS; i++) {
    const s = document.createElement("div");
    s.className = "seg";
    const f = document.createElement("div");
    f.className = "seg-fill";
    s.appendChild(f);
    el.meter.appendChild(s);
    segs.push(s);
    fills.push(f);
  }
}

/* cold when new, sodium when tired, burnt when it is gone */
function wearColor(w) {
  if (w < 0.25) return "var(--wear-0)";
  if (w < 0.55) return "var(--wear-1)";
  if (w < 0.8) return "var(--wear-2)";
  return "var(--wear-3)";
}

let lastCounter = "";
let lastHead = -1;
const lastFill = new Float32Array(SEGMENTS).fill(-1);
let angleL = 0;
let angleR = 0;
let lastFrame = 0;

function frame(ts) {
  requestAnimationFrame(frame);
  const dt = lastFrame ? Math.min(0.1, (ts - lastFrame) / 1000) : 0;
  lastFrame = ts;
  if (!started) return;

  const pos = audio.barPos / 64;
  /* a reel's radius grows with the square root of the tape wound on it */
  const rl = Math.sqrt(0.1875 + (1 - pos) * 0.8125);
  const rr = Math.sqrt(0.1875 + pos * 0.8125);
  el.packL.style.transform = `scale(${rl.toFixed(3)})`;
  el.packR.style.transform = `scale(${rr.toFixed(3)})`;

  if (!reduce.matches) {
    const speed = audio.mode === "play" ? 1 : audio.mode === "rew" ? -8.5 : audio.mode === "ff" ? 8.5 : 0;
    if (speed) {
      angleL += (speed * 96 * dt) / rl;
      angleR += (speed * 96 * dt) / rr;
      el.reelL.style.transform = `rotate(${(angleL % 360).toFixed(1)}deg)`;
      el.reelR.style.transform = `rotate(${(angleR % 360).toFixed(1)}deg)`;
    }
  }

  const c = String(Math.round(pos * 999)).padStart(3, "0");
  if (c !== lastCounter) { el.counter.textContent = c; lastCounter = c; }

  const w = audio.wear[audio.side];
  for (let i = 0; i < SEGMENTS; i++) {
    if (Math.abs(w[i] - lastFill[i]) > 0.004) {
      lastFill[i] = w[i];
      fills[i].style.transform = `scaleY(${Math.max(0.02, w[i]).toFixed(3)})`;
      fills[i].style.backgroundColor = wearColor(w[i]);
    }
  }
  const head = Math.min(SEGMENTS - 1, Math.floor(pos * SEGMENTS));
  if (head !== lastHead) {
    if (lastHead >= 0) segs[lastHead].classList.remove("head");
    segs[head].classList.add("head");
    lastHead = head;
  }
  el.wearLocal.textContent = `${Math.round(audio.localWear * 100)}%`;
  el.wearMean.textContent = `${Math.round(audio.meanWear * 100)}%`;
}

/* ---- keys ---------------------------------------------------------------- */

function latch() {
  const m = audio.mode;
  for (const [name, node] of Object.entries(el.keys)) {
    if (name === "flip") continue;
    node.classList.toggle("latched",
      (name === "play" && m === "play") || (name === "rew" && m === "rew") ||
      (name === "ff" && m === "ff") || (name === "stop" && m === "stop"));
  }
  el.led.classList.toggle("on", m === "play");
}

function wire() {
  el.keys.play.addEventListener("click", () => { audio.play(); latch(); });
  el.keys.stop.addEventListener("click", () => { audio.stop(); latch(); });
  el.keys.rew.addEventListener("click", () => { audio.rewind(); latch(); });
  el.keys.ff.addEventListener("click", () => { audio.ff(); latch(); });
  el.keys.flip.addEventListener("click", () => { audio.flip(); latch(); });
  $("#btn-zip").addEventListener("click", () => audio.zipper());

  el.vol.addEventListener("input", () => audio.setVolume(el.vol.value / 100));
  el.mute.addEventListener("click", () => {
    audio.setMuted(!audio.muted);
    el.mute.setAttribute("aria-pressed", String(audio.muted));
    el.mute.setAttribute("aria-label", t(audio.muted ? "unmute" : "mute", lang));
  });

  el.lang.addEventListener("click", () => {
    lang = lang === "en" ? "ko" : "en";
    applyLang();
    el.mute.setAttribute("aria-pressed", String(audio.muted));
  });

  /* the keys a real deck had, on the keyboard */
  window.addEventListener("keydown", (e) => {
    if (!started || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT") return;
    const map = { KeyP: "play", KeyS: "stop", KeyR: "rew", KeyF: "ff", KeyB: "flip" };
    const which = e.code === "Space" ? (audio.mode === "play" ? "stop" : "play") : map[e.code];
    if (!which) return;
    e.preventDefault();
    el.keys[which].click();
    el.keys[which].classList.add("down");
    setTimeout(() => el.keys[which].classList.remove("down"), 130);
  });
}

/* ---- events from the tape ------------------------------------------------ */

audio.onEvent = (kind) => {
  switch (kind) {
    case "dropout": say(t("stDropout", lang), true); break;
    case "crease": say(t("stCrease", lang), true); break;
    case "sag": say(t("stSag", lang), true); break;
    case "bus": say(t("stBus", lang), true); break;
    case "autoreverse": say(t("stAuto", lang), true); paintSide(); break;
    case "side": say(t("stFlip", lang), true); paintSide(); break;
    case "arrived": say(t("stArrived", lang), true); latch(); break;
    case "mode": say(baseStatus(), false); latch(); break;
    default: break;
  }
};

/* ---- entry --------------------------------------------------------------- */

async function begin() {
  if (started) return;
  const ok = await audio.start();
  if (!ok) {
    $("#begin-note").textContent = t("blocked", lang);
    return;
  }
  started = true;
  audio.setVolume(el.vol.value / 100);
  el.cover.classList.add("gone");
  el.deck.inert = false;
  el.deck.classList.remove("idle");
  setTimeout(() => { el.cover.hidden = true; }, 640);
  audio.play();
  latch();
  paintSide();
  say(baseStatus(), false);
  el.keys.play.focus({ preventScroll: true });
}

buildMeter();
wire();
applyLang();
requestAnimationFrame(frame);
el.begin.addEventListener("click", begin);

/* Read-only handle. The wear meter above uses the same numbers; the targeted
   wear probe uses tapeCheck() and telemetry() through this. */
window.__walkman = audio;
