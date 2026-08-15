/* =============================================================================
   Grandma's Summer - state, interaction and the colour grade.

   There is exactly one variable in this piece: the time of day, in minutes,
   from 05:00 (300) to 24:00 (1440). Light, shadow, caption and the whole audio
   mix are pure functions of it. Nothing here is a discrete "night mode".
   ========================================================================== */

import { tr, formatClock } from "./i18n.js";
import { audio, densities } from "./audio.js";

const MIN_T = 300;      /* 05:00 */
const MAX_T = 1440;     /* 24:00 */
const SVG_NS = "http://www.w3.org/2000/svg";

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, x) => a + (b - a) * x;

const el = {
  body: document.body,
  scene: $("scene"),
  rail: $("rail"),
  railSvg: $("railSvg"),
  railPath: $("railPath"),
  railHit: $("railHit"),
  sun: $("sun"),
  clock: $("clock"),
  caption: $("caption"),
  layerList: $("layerList"),
  intro: $("intro"),
  begin: $("begin"),
  autoBtn: $("autoBtn"),
  fanBtn: $("fanBtn"),
  rainBtn: $("rainBtn"),
  muteBtn: $("muteBtn"),
  vol: $("vol"),
  langEn: $("langEn"),
  langKo: $("langKo"),
  toast: $("toast"),
  stars: $("stars"),
  planks: $("planks"),
  lattice: $("lattice"),
  fanGrill: $("fanGrill"),
  rain: $("rain"),
  glow: $("glowDisc"),
  patch: $("lightPatch"),
  heatGroup: $("heatGroup"),
  heatDisp: $("heatDisp"),
  heatTurb: $("heatTurb")
};

/* resolved once: rewriting these transforms is the per frame hot path */
const SHADOWS = Array.from(document.querySelectorAll("[data-shadow]")).map((n) => ({
  node: n,
  ox: Number(n.dataset.ox),
  oy: Number(n.dataset.oy)
}));

const state = {
  minutes: 850,          /* 14:10, the hottest part of the day */
  lang: "en",
  started: false,
  auto: false,
  fan: true,
  raining: false,
  muted: false,
  reduce: false
};

/* =============================================================================
   1. The colour grade, keyed on twelve moments of the day
   ========================================================================== */

const KEY_HOURS = [5, 6.33, 7.5, 9.5, 12, 14, 16.5, 18.17, 19.17, 20.17, 21.5, 24];

const TRACKS = {
  "--c-sky-top":   ["#33406b","#5c6e9e","#8aa9ce","#9cc2e0","#a6cde6","#afd3e8","#9fc4dd","#7e8fb6","#4c5885","#26305a","#161f42","#0e1630"],
  "--c-sky-mid":   ["#5d5f86","#a68a94","#c2c0c8","#c4d8e2","#cfe2e8","#d6e5e6","#cbd9d3","#c39a90","#8a6a78","#39406a","#212a4c","#141c39"],
  "--c-sky-low":   ["#8a7fa0","#e2a681","#ead3b4","#e8eee9","#f2f4ec","#f5f2e4","#f1e3c4","#f0a76b","#c86f56","#4e4a6e","#2a3255","#1a2340"],
  "--c-sun":       ["#e9b08a","#ffce95","#ffe9be","#fff6dc","#ffffff","#ffffff","#fff3cf","#ffa95c","#f0714a","#dce3f4","#d5def2","#cbd6ee"],
  "--c-glow":      ["#c79a86","#f2b47f","#fbe0ae","#fff4d8","#ffffff","#ffffff","#ffe9b4","#ffb068","#e07a54","#7c88ae","#4a5480","#39436c"],
  "--c-hill-far":  ["#3e4a6b","#6b7c9a","#8fa3b4","#a7bac2","#b3c5ca","#b8c9cc","#a9bcc0","#8b93a8","#5a6284","#2e3757","#1d2645","#141c36"],
  "--c-hill-near": ["#33405c","#55684f","#6e8557","#7e9a5e","#8aa765","#8fac68","#7e9a5c","#6b7f4b","#46523c","#242d34","#18202a","#121822"],
  "--c-hedge":     ["#2a3a34","#3f5a3c","#517044","#5c7f4a","#66894e","#6a8d50","#5d8047","#4e6a3c","#354830","#1c2622","#141c1a","#0f1614"],
  "--c-grass":     ["#4a5747","#7e8a55","#9ca25e","#afb268","#bcbb6f","#c1be72","#afae66","#96884e","#63593c","#333a32","#22282a","#191e22"],
  "--c-dirt":      ["#5b5145","#8a7458","#a88c69","#bc9e78","#c8aa82","#cbae86","#bb9c76","#a17b54","#6e533c","#3a3229","#282320","#1d1a18"],
  "--c-wall":      ["#5c5a57","#8e877d","#a9a196","#bab2a6","#c6beb1","#c9c1b4","#b8afa2","#a08d78","#6d5f50","#3a3835","#282726","#1e1d1c"],
  "--c-wood-dark": ["#241c18","#33271f","#3f3027","#48372b","#4d3b2e","#4f3d30","#463629","#3c2a20","#2c2019","#1b1613","#151210","#100e0d"],
  "--c-wood-mid":  ["#4a3a2c","#6a5137","#836446","#93714f","#9c7855","#9f7b57","#8f6e4d","#7b5a3e","#57402e","#2f261e","#231d18","#1b1613"],
  "--c-floor":     ["#3c3026","#5c4732","#77593e","#886647","#916d4c","#94704e","#856547","#725439","#4e3a28","#2b221b","#201a15","#191410"],
  "--c-paper-door":["#c9c3c6","#ebd9c4","#f4e7ce","#f8f0da","#fbf5e4","#fcf7e7","#f7edd5","#f0cfa2","#d89a7e","#7a7590","#565272","#413f5c"],
  "--c-cloth":     ["#b9b7c4","#e8dcce","#f3eadb","#f8f2e6","#fcf8ee","#fdf9f0","#f7eedd","#f2d6ae","#d89c82","#7e7c95","#5a5877","#454460"],
  "--c-cloth-b":   ["#8f93a8","#c9b394","#dcc9a6","#e4d6b6","#eadfbe","#ece2c2","#e3d3ac","#dcb184","#ac7861","#5e6076","#43455e","#33344a"],
  "--c-jar":       ["#241d21","#3a2c26","#48372c","#523f31","#584434","#5a4635","#503e2f","#453227","#31241d","#1d1a1c","#161418","#111014"],
  "--c-melon":     ["#8c3a33","#b84437","#cc4a38","#d64f3b","#dc533d","#de553f","#d14c39","#b94232","#8a3328","#4a2822","#37201c","#2a1917"],
  "--c-melon-rind":["#3c4a30","#5e7440","#728a4c","#7f9853","#889f58","#8ba25a","#7d9350","#6a7c43","#495434","#2a3026","#1f241d","#181c17"],
  "--c-light-patch":["#f0c9a4","#ffdca8","#fff0cc","#fff8e2","#fffbee","#fffcf0","#fff2cf","#ffc98a","#f09a68","#9fb0da","#8fa0cc","#8496c6"],
  "--c-warm":      ["#7f6bd0","#ff9a4d","#ffc27a","#ffe6c0","#ffffff","#fffdf4","#ffd79a","#ff8a3d","#ff6a3a","#3d4a8c","#26305e","#1a2246"]
};

/* scalar tracks on the same key hours */
const SCALARS = {
  stars: [0.15, 0, 0, 0, 0, 0, 0, 0, 0.06, 0.62, 0.95, 1],
  bloom: [0.05, 0.14, 0.24, 0.34, 0.46, 0.44, 0.3, 0.2, 0.12, 0.05, 0.03, 0.02],
  warm:  [0.2, 0.3, 0.14, 0.05, 0.03, 0.05, 0.12, 0.28, 0.26, 0.22, 0.26, 0.3],
  patch: [0.1, 0.24, 0.35, 0.44, 0.5, 0.5, 0.42, 0.3, 0.15, 0.1, 0.09, 0.08],
  heat:  [0, 0, 0.06, 0.24, 0.7, 1, 0.72, 0.24, 0.05, 0, 0, 0]
};

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const RGB_CACHE = {};
for (const k in TRACKS) RGB_CACHE[k] = TRACKS[k].map(hexToRgb);

function trackIndex(hour) {
  let i = 0;
  while (i < KEY_HOURS.length - 2 && hour > KEY_HOURS[i + 1]) i++;
  const a = KEY_HOURS[i];
  const b = KEY_HOURS[i + 1];
  return { i, x: clamp((hour - a) / (b - a), 0, 1) };
}

function gradeAt(hour) {
  const { i, x } = trackIndex(hour);
  const root = document.documentElement.style;
  for (const key in RGB_CACHE) {
    const t = RGB_CACHE[key];
    const a = t[i];
    const b = t[i + 1];
    const r = Math.round(lerp(a[0], b[0], x));
    const g = Math.round(lerp(a[1], b[1], x));
    const bl = Math.round(lerp(a[2], b[2], x));
    root.setProperty(key, `rgb(${r} ${g} ${bl})`);
  }
  const s = {};
  for (const key in SCALARS) {
    const t = SCALARS[key];
    s[key] = lerp(t[i], t[i + 1], x);
  }
  return s;
}

/* =============================================================================
   2. Sun geometry: elevation and azimuth drive the shadows
   ========================================================================== */

const SUNRISE = 5.55;
const SUNSET = 19.5;

function sunGeometry(hour) {
  const u = clamp((hour - SUNRISE) / (SUNSET - SUNRISE), 0, 1);
  const up = hour > SUNRISE - 0.4 && hour < SUNSET + 0.4;
  const elevation = up ? Math.sin(Math.PI * u) : 0;
  const azimuth = clamp(u * 2 - 1, -1, 1);
  return { elevation, azimuth, up };
}

/* =============================================================================
   3. Building the repetitive scene pieces
   ========================================================================== */

function svg(tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function buildScenery() {
  /* stars, only visible after dusk */
  const frag = document.createDocumentFragment();
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 52; i++) {
    frag.appendChild(svg("circle", {
      cx: (310 + rnd() * 1150).toFixed(1),
      cy: (104 + rnd() * 310).toFixed(1),
      r: (0.9 + rnd() * 1.7).toFixed(2)
    }));
  }
  el.stars.appendChild(frag);

  /* the fan grill */
  const gf = document.createDocumentFragment();
  [34, 58, 82, 106].forEach((r) => gf.appendChild(svg("circle", { cx: 300, cy: 690, r })));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    gf.appendChild(svg("path", {
      d: `M${(300 + Math.cos(a) * 14).toFixed(1)} ${(690 + Math.sin(a) * 14).toFixed(1)} L${(300 + Math.cos(a) * 120).toFixed(1)} ${(690 + Math.sin(a) * 120).toFixed(1)}`
    }));
  }
  el.fanGrill.appendChild(gf);

  /* rain streaks */
  const rf = document.createDocumentFragment();
  for (let i = 0; i < 46; i++) {
    const x = 300 + rnd() * 1170;
    const yTop = 60 + rnd() * 420;
    const line = svg("line", { x1: x.toFixed(0), y1: yTop.toFixed(0), x2: (x - 7).toFixed(0), y2: (yTop + 38).toFixed(0) });
    line.style.animationDuration = (0.5 + rnd() * 0.4).toFixed(2) + "s";
    line.style.animationDelay = (-rnd() * 1.2).toFixed(2) + "s";
    rf.appendChild(line);
  }
  el.rain.appendChild(rf);
}

/* The floorboards and the paper lattice are the only pieces whose spacing has
   to be re-derived when the frame changes, so they are rebuilt per layout. */
function buildPlanks(tall) {
  el.planks.textContent = "";
  const f = document.createDocumentFragment();
  const sill = tall ? 1010 : 706;
  const far = tall ? 1560 : 1000;
  const vanish = tall ? 450 : 800;
  let y = sill + 6;
  let step = tall ? 20 : 22;
  while (y < far) {
    f.appendChild(svg("path", { d: `M0 ${y.toFixed(0)} H1600` }));
    y += step;
    step *= tall ? 1.2 : 1.24;
  }
  const from = tall ? 60 : 60;
  const to = tall ? 840 : 1600;
  const gap = tall ? 120 : 190;
  for (let x = from; x < to; x += gap) {
    f.appendChild(svg("path", { d: `M${x} ${sill} L${((x - vanish) * 1.7 + vanish).toFixed(0)} ${far}` }));
  }
  el.planks.appendChild(f);
}

function buildLattice(tall) {
  el.lattice.textContent = "";
  const f = document.createDocumentFragment();
  const x0 = tall ? 126 : 140;
  const w = tall ? 86 : 152;
  const y0 = tall ? 110 : 104;
  const h = tall ? 890 : 566;
  const cols = tall ? 2 : 3;
  const rows = tall ? 10 : 8;
  for (let i = 1; i < cols; i++) {
    const x = x0 + (w * i) / cols;
    f.appendChild(svg("path", { d: `M${x.toFixed(0)} ${y0} V${(y0 + h).toFixed(0)}` }));
  }
  for (let i = 1; i < rows; i++) {
    const yy = y0 + (h * i) / rows;
    f.appendChild(svg("path", { d: `M${x0} ${yy.toFixed(0)} H${x0 + w}` }));
  }
  el.lattice.appendChild(f);
}

/* =============================================================================
   4. The sun rail: an arc on wide screens, a vertical rail on narrow ones
   ========================================================================== */

const rail = { w: 0, h: 0, vertical: false };
const V_TOP = 0.16;
const V_BOT = 0.58;
const H_LEFT = 0.07;
const H_RIGHT = 0.93;

function railPoint(u) {
  if (rail.vertical) {
    const x = rail.w - 46;
    const y = lerp(rail.h * V_TOP, rail.h * V_BOT, u);
    return [x, y];
  }
  const x = lerp(rail.w * H_LEFT, rail.w * H_RIGHT, u);
  const top = Math.max(64, rail.h * 0.12);
  const drop = rail.h * 0.28;
  const y = top + (1 - Math.sin(Math.PI * u)) * drop;
  return [x, y];
}

/* =============================================================================
   4b. Two compositions, not one crop

   A phone held upright cannot hold a 16:10 panorama. Cropping it keeps the door
   frame and throws away the yard, which is the whole memory. So the portrait
   frame is a second composition on a 780x1560 canvas: a tall doorway, the yard
   receding from the wall to the near ground, and the props re-staged in depth -
   laundry at the back, the jars mid-ground, the 평상 with the watermelon down in
   front. Every override below is an attribute; the landscape values are captured
   at boot and written straight back, so the wide frame is byte-identical.
   ========================================================================== */

const WIDE_BOX = "0 0 1600 1000";
const TALL_BOX = "60 0 780 1560";

const PORTRAIT = {
  /* the aperture: a tall door instead of a letterbox */
  openClipRect: { x: 220, y: 110, width: 540, height: 890 },
  outdoor:      { transform: "translate(-80 0)" },

  /* backdrop: horizon pushed down so the yard has depth to recede into */
  skyRect:   { x: 300, y: 100, width: 560, height: 520 },
  stars:     { transform: "translate(169.9 0) scale(0.452 1)" },
  hills:     { transform: "translate(0 66)" },
  tree:      { transform: "translate(-350.4 166) scale(0.8)" },
  wallRect:  { y: 512 },
  hedgeLine: { transform: "translate(0,62)" },
  wallShade: { transform: "translate(0 60)" },
  yardRect:  { y: 566, height: 434 },
  grass:     { transform: "translate(0 96)" },

  /* props re-staged in depth rather than spread across the width */
  laundry:    { transform: "translate(101.6 296.3) scale(0.66)" },
  jars:       { transform: "translate(96 242) scale(0.92)" },
  pyeongsang: { transform: "translate(-480 363.2) scale(0.95)" },
  rain:       { transform: "translate(162 4) scale(0.46 1.6)" },

  /* the 마루 the viewer is sitting on */
  sillDark:  { x: 60, y: 994, width: 780, height: 16 },
  floorBase: { x: 60, y: 1000, width: 780, height: 560 },
  sillMid:   { x: 140, y: 1000, width: 620, height: 34 },

  /* frame and the slid-open paper panel, narrowed to hand width to the yard */
  frameTop:   { x: 60, y: 0, width: 780, height: 110 },
  frameLeft:  { x: 60, y: 110, width: 52, height: 890 },
  frameRight: { x: 760, y: 110, width: 80, height: 890 },
  paperRect:  { x: 126, y: 110, width: 86, height: 890 },
  panelEdgeL: { x: 112, y: 110, width: 14, height: 896 },
  panelEdgeR: { x: 212, y: 110, width: 14, height: 896 },

  /* the fan lifted into the doorway, clear of the paper HUD at the bottom */
  fanGroup: { transform: "translate(-8 226.6) scale(0.86)" },

  warmVeil: { x: 60, y: 0, width: 780, height: 1560 }
};

const LANDSCAPE = {};
let layoutTall = null;

function applyLayout(tall) {
  if (tall === layoutTall) return;
  layoutTall = tall;

  for (const id in PORTRAIT) {
    const node = $(id);
    if (!node) continue;
    if (!LANDSCAPE[id]) {
      const keep = {};
      for (const a in PORTRAIT[id]) keep[a] = node.getAttribute(a);
      LANDSCAPE[id] = keep;
    }
    const from = tall ? PORTRAIT[id] : LANDSCAPE[id];
    for (const a in PORTRAIT[id]) {
      const v = from[a];
      if (v === null || v === undefined) node.removeAttribute(a);
      else node.setAttribute(a, v);
    }
  }

  el.body.classList.toggle("is-portrait", tall);
  el.scene.setAttribute("viewBox", tall ? TALL_BOX : WIDE_BOX);
  buildPlanks(tall);
  buildLattice(tall);
}

function measureRail() {
  const r = el.rail.getBoundingClientRect();
  rail.w = r.width;
  rail.h = r.height;
  rail.vertical = r.width < 660;

  applyLayout(r.width / r.height < 0.72);

  let d = "";
  for (let i = 0; i <= 48; i++) {
    const p = railPoint(i / 48);
    d += (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1);
  }
  el.railPath.setAttribute("d", d);
  el.railHit.setAttribute("d", d);
  applyTime(false);
}

function placeSun() {
  const u = (state.minutes - MIN_T) / (MAX_T - MIN_T);
  const p = railPoint(u);
  el.sun.style.transform = `translate3d(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px, 0) translate(-50%, -50%)`;
}

function pointerToMinutes(ev) {
  const r = el.rail.getBoundingClientRect();
  const x = ev.clientX - r.left;
  const y = ev.clientY - r.top;
  let u;
  if (rail.vertical) {
    u = (y - rail.h * V_TOP) / (rail.h * (V_BOT - V_TOP));
  } else {
    u = (x - rail.w * H_LEFT) / (rail.w * (H_RIGHT - H_LEFT));
  }
  return MIN_T + clamp(u, 0, 1) * (MAX_T - MIN_T);
}

/* =============================================================================
   5. Applying the time
   ========================================================================== */

const CAPTION_BOUNDS = [5.9, 7.4, 9.6, 11.7, 13, 15.4, 17, 18.4, 19.5, 21, 22.6];

function captionKey(hour) {
  for (let i = 0; i < CAPTION_BOUNDS.length; i++) {
    if (hour < CAPTION_BOUNDS[i]) return "cap" + i;
  }
  return "cap11";
}

const LAYERS = [
  { id: "cicada", key: "layerCicada" },
  { id: "fan", key: "layerFan" },
  { id: "chime", key: "layerChime" },
  { id: "bird", key: "layerBird" },
  { id: "night", key: "layerNight" },
  { id: "tv", key: "layerTv" },
  { id: "rain", key: "layerRain" }
];

function buildLayers() {
  el.layerList.textContent = "";
  for (const layer of LAYERS) {
    const li = document.createElement("li");
    li.id = "layer-" + layer.id;
    const name = document.createElement("span");
    name.className = "lbl";
    name.dataset.i18n = layer.key;
    name.textContent = tr(layer.key, state.lang);
    const bar = document.createElement("span");
    bar.className = "bar";
    const val = document.createElement("span");
    val.className = "sr-only";
    li.append(name, bar, val);
    layer.node = li;
    layer.bar = bar;
    layer.val = val;
    el.layerList.appendChild(li);
  }
}

let lastAudioPush = 0;

function applyTime(pushAudio) {
  const hour = state.minutes / 60;
  const s = gradeAt(hour);
  const geo = sunGeometry(hour);
  const root = document.documentElement.style;

  const rain = audio.running ? audio.rainAmount : 0;

  root.setProperty("--o-stars", s.stars.toFixed(3));
  root.setProperty("--o-bloom", (s.bloom * (1 - 0.6 * rain)).toFixed(3));
  root.setProperty("--o-warm", s.warm.toFixed(3));
  root.setProperty("--o-patch", (s.patch * (1 - 0.7 * rain)).toFixed(3));

  /* shadows rotate with the azimuth and stretch as the sun drops */
  const skew = (geo.azimuth * 46).toFixed(2);
  const scale = clamp(0.3 + 2.2 * (1 - geo.elevation), 0.3, 2.6);
  const alpha = clamp(0.06 + 0.34 * geo.elevation, 0.05, 0.42) * (1 - 0.55 * rain);
  root.setProperty("--sh-skew", skew + "deg");
  root.setProperty("--sh-scale", scale.toFixed(3));
  root.setProperty("--a-shadow", alpha.toFixed(3));

  const sc = scale.toFixed(3);
  for (const s2 of SHADOWS) {
    s2.node.setAttribute("transform",
      `translate(${s2.ox} ${s2.oy}) skewX(${skew}) scale(1 ${sc}) translate(${-s2.ox} ${-s2.oy})`);
  }

  /* the light thrown through the doorway slides across the floorboards, and the
     glow follows the sun. Both are written in whichever frame is mounted. */
  const off = -geo.azimuth * 210;
  const u = (state.minutes - MIN_T) / (MAX_T - MIN_T);
  const rise = 1 - Math.sin(Math.PI * u);

  if (layoutTall) {
    el.patch.setAttribute("points",
      `${(240 + off * 0.5).toFixed(0)},1006 ${(740 + off * 0.5).toFixed(0)},1006 ` +
      `${(830 + off * 1.2).toFixed(0)},1560 ${(150 + off * 1.2).toFixed(0)},1560`);
    el.glow.setAttribute("cx", (320 + u * 440).toFixed(0));
    el.glow.setAttribute("cy", (150 + rise * 250).toFixed(0));
    el.glow.setAttribute("r", (150 + 130 * geo.elevation).toFixed(0));
  } else {
    const spread = 1.6;
    el.patch.setAttribute("points",
      `${300 + off},706 ${900 + off},706 ${1010 + off * spread},1000 ${190 + off * spread},1000`);
    el.glow.setAttribute("cx", (330 + u * 1120).toFixed(0));
    el.glow.setAttribute("cy", (168 + rise * 220).toFixed(0));
    el.glow.setAttribute("r", (200 + 160 * geo.elevation).toFixed(0));
  }

  /* heat haze over the yard, strongest in the early afternoon */
  const heat = state.reduce ? 0 : s.heat * (1 - rain);
  if (heat < 0.02) {
    el.heatGroup.style.filter = "none";
  } else {
    el.heatGroup.style.filter = "";
    el.heatDisp.setAttribute("scale", (heat * 9).toFixed(2));
  }

  el.body.classList.toggle("is-night", hour > 19.6 || hour < 5.7);

  /* readout */
  el.clock.textContent = formatClock(state.minutes, state.lang);
  const capKey = rain > 0.25 ? "capRain" : captionKey(hour);
  if (el.caption.dataset.key !== capKey) {
    el.caption.dataset.key = capKey;
    el.caption.textContent = tr(capKey, state.lang);
  }
  el.sun.setAttribute("aria-valuenow", Math.round(state.minutes));
  el.sun.setAttribute("aria-valuetext", formatClock(state.minutes, state.lang));

  updateLayers(hour, rain);
  placeSun();

  if (pushAudio && audio.running) {
    const now = performance.now();
    if (now - lastAudioPush > 60) {
      lastAudioPush = now;
      audio.setTime(hour);
    }
  }
}

function updateLayers(hour, rain) {
  const d = densities(hour);
  const vals = {
    cicada: d.cicada * (1 - 0.9 * rain),
    fan: state.fan ? 0.9 : 0,
    chime: d.chime * 0.8,
    bird: d.birds,
    night: d.night,
    tv: d.tv,
    rain: rain
  };
  for (const layer of LAYERS) {
    const v = clamp(vals[layer.id], 0, 1);
    layer.bar.style.setProperty("--lv", v.toFixed(3));
    layer.node.classList.toggle("is-quiet", v < 0.06);
    const pct = Math.round(v * 100) + "%";
    if (layer.val.textContent !== pct) layer.val.textContent = pct;
  }
}

/* =============================================================================
   6. Interaction
   ========================================================================== */

function setMinutes(v, pushAudio) {
  state.minutes = clamp(v, MIN_T, MAX_T);
  applyTime(pushAudio !== false);
}

function wireSun() {
  let dragging = false;

  const down = (ev) => {
    dragging = true;
    el.sun.classList.add("is-dragging");
    el.sun.setPointerCapture?.(ev.pointerId);
    setMinutes(pointerToMinutes(ev));
    ev.preventDefault();
  };
  const move = (ev) => {
    if (!dragging) return;
    setMinutes(pointerToMinutes(ev));
    ev.preventDefault();
  };
  const up = (ev) => {
    if (!dragging) return;
    dragging = false;
    el.sun.classList.remove("is-dragging");
    try { el.sun.releasePointerCapture?.(ev.pointerId); } catch (e) { /* already gone */ }
  };

  el.sun.addEventListener("pointerdown", down);
  el.railHit.addEventListener("pointerdown", (ev) => {
    el.sun.focus();
    down(ev);
  });
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);

  el.sun.addEventListener("keydown", (ev) => {
    const big = ev.shiftKey ? 60 : 15;
    let handled = true;
    switch (ev.key) {
      case "ArrowRight": case "ArrowUp": setMinutes(state.minutes + big); break;
      case "ArrowLeft": case "ArrowDown": setMinutes(state.minutes - big); break;
      case "PageUp": setMinutes(state.minutes + 60); break;
      case "PageDown": setMinutes(state.minutes - 60); break;
      case "Home": setMinutes(MIN_T); break;
      case "End": setMinutes(MAX_T); break;
      default: handled = false;
    }
    if (handled) {
      ev.preventDefault();
      setAuto(false);
    }
  });

  window.addEventListener("wheel", (ev) => {
    if (!state.started) return;
    if (ev.target.closest && ev.target.closest(".hud, .topbar, .intro")) return;
    setAuto(false);
    setMinutes(state.minutes + Math.sign(ev.deltaY) * 8);
    ev.preventDefault();
  }, { passive: false });
}

/* --- the day running on its own: a full day in four minutes ---------------- */
const DAY_SECONDS = 240;
let lastFrame = 0;
let lastApply = 0;

function setAuto(on) {
  state.auto = on;
  el.autoBtn.setAttribute("aria-pressed", String(on));
}

function frame(ts) {
  const dt = lastFrame ? Math.min((ts - lastFrame) / 1000, 0.1) : 0;
  lastFrame = ts;

  const wet = audio.running && (state.raining || audio.rainAmount > 0.01);
  if (state.auto) {
    let next = state.minutes + dt * ((MAX_T - MIN_T) / DAY_SECONDS);
    if (next >= MAX_T) next = MIN_T;
    state.minutes = next;
  }
  /* the grade only needs about twenty updates a second, and each one writes
     twenty two custom properties, so it is worth not doing it every frame */
  if ((state.auto || wet) && ts - lastApply > 46) {
    lastApply = ts;
    applyTime(state.auto);
  }

  /* the haze needs its own slow churn, otherwise it is a frozen distortion */
  if (!state.reduce) {
    const b = 0.028 + 0.006 * Math.sin(ts / 2100);
    el.heatTurb.setAttribute("baseFrequency", "0.006 " + b.toFixed(4));
  }

  if (state.raining && audio.running && audio.rainAmount < 0.01) {
    state.raining = false;
    el.rainBtn.setAttribute("aria-pressed", "false");
    el.body.classList.remove("is-raining");
  }

  requestAnimationFrame(frame);
}

/* --- language -------------------------------------------------------------- */

function setLang(lang) {
  state.lang = lang;
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((n) => {
    n.textContent = tr(n.dataset.i18n, lang);
  });
  el.langEn.classList.toggle("is-on", lang === "en");
  el.langKo.classList.toggle("is-on", lang === "ko");
  el.langEn.setAttribute("aria-pressed", String(lang === "en"));
  el.langKo.setAttribute("aria-pressed", String(lang === "ko"));
  el.sun.setAttribute("aria-label", tr("sunLabel", lang));
  el.muteBtn.setAttribute("aria-label", tr(state.muted ? "unmute" : "mute", lang));
  el.caption.dataset.key = "";
  document.title = lang === "ko" ? "할머니 집, 여름 . Grandma's Summer" : "Grandma's Summer";
  applyTime(false);
}

/* --- toast ----------------------------------------------------------------- */

let toastTimer = 0;
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 7000);
}

/* --- controls -------------------------------------------------------------- */

function wireControls() {
  el.begin.addEventListener("click", async () => {
    const ok = await audio.start();
    if (!ok) {
      showToast(tr("audioBlocked", state.lang));
      return;
    }
    audio.setVolume(Number(el.vol.value) / 100);
    audio.setFan(state.fan);
    audio.setTime(state.minutes / 60, true);
    state.started = true;
    el.body.classList.add("is-started");
    el.sun.focus();
  });

  el.autoBtn.addEventListener("click", () => setAuto(!state.auto));

  el.fanBtn.addEventListener("click", () => {
    state.fan = !state.fan;
    el.fanBtn.setAttribute("aria-pressed", String(state.fan));
    el.body.classList.toggle("fan-off", !state.fan);
    audio.setFan(state.fan);
    applyTime(false);
  });

  el.rainBtn.addEventListener("click", () => {
    if (!audio.running) { showToast(tr("audioBlocked", state.lang)); return; }
    if (state.raining) {
      audio.stopShower();
      state.raining = false;
      el.rainBtn.setAttribute("aria-pressed", "false");
      el.body.classList.remove("is-raining");
    } else {
      audio.shower(46);
      state.raining = true;
      el.rainBtn.setAttribute("aria-pressed", "true");
      el.body.classList.add("is-raining");
    }
  });

  el.muteBtn.addEventListener("click", () => {
    state.muted = !state.muted;
    el.muteBtn.setAttribute("aria-pressed", String(state.muted));
    el.muteBtn.setAttribute("aria-label", tr(state.muted ? "unmute" : "mute", state.lang));
    audio.setMuted(state.muted);
  });

  const applyVol = () => {
    const v = Number(el.vol.value) / 100;
    el.vol.style.setProperty("--fill", el.vol.value + "%");
    audio.setVolume(v);
    if (state.muted && v > 0) {
      state.muted = false;
      el.muteBtn.setAttribute("aria-pressed", "false");
      el.muteBtn.setAttribute("aria-label", tr("mute", state.lang));
      audio.setMuted(false);
    }
  };
  el.vol.addEventListener("input", applyVol);
  applyVol();

  el.langEn.addEventListener("click", () => setLang("en"));
  el.langKo.addEventListener("click", () => setLang("ko"));
}

/* =============================================================================
   7. Boot
   ========================================================================== */

function boot() {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const applyMq = () => {
    state.reduce = mq.matches;
    el.body.classList.toggle("reduce-motion", state.reduce);
    if (state.reduce) el.heatDisp.setAttribute("scale", "0");
  };
  applyMq();
  mq.addEventListener?.("change", applyMq);

  buildScenery();
  buildLayers();
  wireSun();
  wireControls();
  measureRail();
  setLang("en");
  setMinutes(state.minutes, false);

  window.addEventListener("resize", measureRail);
  requestAnimationFrame(frame);
}

boot();
