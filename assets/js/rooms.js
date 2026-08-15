/**
 * Six rooms, one hallway.
 *
 * Each room is an independent static site that builds its own Web Audio graph.
 * Six live AudioContexts at once would fight each other for the output device
 * and for CPU, so the hallway keeps exactly one room mounted. Switching rooms
 * blanks the frame first: destroying the document is the only teardown that is
 * guaranteed to take the room's AudioContext, its timers and its rAF loop with
 * it. A `suspend()` call would leave the graph alive and the room still
 * scheduling behind your back.
 */

const ROOMS = [
  { id: 'dabang-1979',    year: '1979', name: '다방',     blurb: 'DJ 박스와 신청곡 쪽지', hue: 28,  ready: true  },
  { id: 'arcade-1992',    year: '1992', name: '오락실',   blurb: '100원과 대전대',        hue: 285, ready: true  },
  { id: 'grandmas-summer',year: '1996', name: '할머니집', blurb: '마루와 매미',           hue: 95,  ready: true  },
  { id: 'midnight-dial',  year: '1997', name: '라디오',   blurb: '주파수 사이의 잡음',    hue: 210, ready: true  },
  { id: 'walkman-1999',   year: '1999', name: '워크맨',   blurb: 'A면과 B면',             hue: 340, ready: true  },
  { id: 'pcbang-2004',    year: '2004', name: 'PC방',     blurb: '새벽 두 시의 자리',     hue: 160, ready: true  },
];

// Rooms are vendored into this repo as sibling directories, so the hub is one
// deploy with no cross-origin anything. Relative, not absolute, so the same
// build works at sylvanus4.github.io/rooms/ and at a bare domain root.
const BASE = './';
const frame = document.getElementById('room-frame');
const tablist = document.getElementById('room-tabs');
const label = document.getElementById('room-label');
const pending = document.getElementById('room-pending');

let current = null;

function tabFor(id) {
  return tablist.querySelector(`[data-room="${id}"]`);
}

function mount(id, { focus = false } = {}) {
  const room = ROOMS.find((r) => r.id === id);
  if (!room || id === current) return;

  // Blank first, then load. Without the blank step the outgoing room's audio
  // can overlap the incoming one for as long as the new document takes to
  // parse, which on a cold cache is very audible. Blanking also runs for
  // not-yet-built rooms — leaving the previous room playing behind a
  // "still building" panel would be worse than silence.
  frame.src = 'about:blank';
  frame.title = `${room.year} ${room.name}`;

  if (room.ready) {
    frame.hidden = false;
    pending.hidden = true;
    requestAnimationFrame(() => {
      frame.src = `${BASE}${room.id}/`;
    });
  } else {
    frame.hidden = true;
    pending.hidden = false;
    pending.querySelector('.pending__year').textContent = `${room.year} ${room.name}`;
  }

  for (const tab of tablist.querySelectorAll('[role="tab"]')) {
    const on = tab.dataset.room === id;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  }

  document.documentElement.style.setProperty('--room-hue', room.hue);
  label.textContent = `${room.year} · ${room.name} — ${room.blurb}`;
  document.title = `${room.year} ${room.name} — 여섯 개의 방`;

  if (history.replaceState) history.replaceState(null, '', `#${id}`);
  // On a narrow strip the chosen door can be off-screen — arrowing to a tab you
  // cannot see moves focus invisibly, which is worse than no keyboard support.
  tabFor(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (focus) tabFor(id)?.focus();
  current = id;
}

function build() {
  for (const room of ROOMS) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.role = 'tab';
    tab.dataset.room = room.id;
    tab.tabIndex = -1;
    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('aria-controls', 'room-frame');
    tab.style.setProperty('--tab-hue', room.hue);
    tab.innerHTML =
      `<span class="tab__year">${room.year}</span>` +
      `<span class="tab__name">${room.name}</span>`;
    tab.addEventListener('click', () => mount(room.id));
    tablist.append(tab);
  }

  // Roving tabindex: arrows move between rooms, Home/End jump to the ends.
  tablist.addEventListener('keydown', (e) => {
    const keys = { ArrowLeft: -1, ArrowRight: 1 };
    const i = ROOMS.findIndex((r) => r.id === current);
    let next = null;
    if (e.key in keys) next = (i + keys[e.key] + ROOMS.length) % ROOMS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ROOMS.length - 1;
    if (next === null) return;
    e.preventDefault();
    mount(ROOMS[next].id, { focus: true });
  });

  const edge = () => {
    const atEnd = tablist.scrollLeft + tablist.clientWidth >= tablist.scrollWidth - 2;
    tablist.dataset.scrollEnd = atEnd ? '1' : '0';
  };
  tablist.addEventListener('scroll', edge, { passive: true });
  addEventListener('resize', edge, { passive: true });
  edge();

  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (ROOMS.some((r) => r.id === id)) mount(id);
  });
}

build();
// Default to the first room that actually exists, not simply the first in
// chronological order — landing on a "still building" panel is a bad door.
const initial = location.hash.slice(1);
const fallback = (ROOMS.find((r) => r.ready) || ROOMS[0]).id;
mount(ROOMS.some((r) => r.id === initial) ? initial : fallback);
