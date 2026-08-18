/**
 * i18n.js - one record per string, both languages side by side.
 *
 * Separate files per language drift. A single table makes a missing
 * translation impossible to hide, and it keeps the Korean and the English
 * versions of the same idea within a line of each other while writing.
 *
 * English is the default. Korean is 합니다체.
 *
 * Nothing in here names a performer, a group, a tune or a room that ever
 * existed. This is a place and a year. Where a real name would be the easy
 * way to say something, the instrumentation says it instead.
 */

export const STRINGS = {
  /* --- Document ------------------------------------------------------- */
  docTitle: {
    en: 'New Orleans 1927 - a hot-jazz room you can move around in',
    ko: '뉴올리언스 1927 - 자리를 옮겨 다닐 수 있는 재즈 클럽',
  },
  title: { en: 'New Orleans', ko: '뉴올리언스' },
  year: { en: '1927', ko: '1927' },
  heroLine: {
    en: 'A narrow room, a low stage, and a band in the same air as you. Pick a seat and an hour, and the room moves.',
    ko: '좁고 긴 방, 낮은 무대, 그리고 같은 공기 속에서 연주하는 밴드. 자리와 시각을 고르면 방이 움직입니다.',
  },
  coverNote: {
    en: 'Sound is the whole piece. Every part of this room but the band is built by the browser while you listen. Headphones help.',
    ko: '소리가 본체입니다. 밴드를 뺀 나머지는 듣는 동안 브라우저가 그 자리에서 만듭니다. 헤드폰을 권합니다.',
  },
  begin: { en: 'Go down the stairs', ko: '계단을 내려가기' },
  blocked: {
    en: 'The browser refused to start audio. Tap the button once more, or check that this tab is not muted.',
    ko: '브라우저가 소리를 시작하지 못했습니다. 버튼을 한 번 더 누르거나 탭이 음소거되지 않았는지 확인해 주세요.',
  },

  /* --- Rail ----------------------------------------------------------- */
  langToggle: { en: '한국어', ko: 'English' },
  langLabel: { en: 'Switch to Korean', ko: 'Switch to English' },
  mute: { en: 'Mute', ko: '음소거' },
  unmute: { en: 'Unmute', ko: '음소거 해제' },
  volume: { en: 'Volume', ko: '음량' },
  volumeText: { en: 'Volume {n} percent', ko: '음량 {n} 퍼센트' },

  /* --- The card ------------------------------------------------------- */
  cardHead: { en: 'TABLE CARD', ko: '테 이 블 카 드' },
  cardSub: { en: 'Hand it to the man on the door', ko: '문 앞 사람에게 건네 주세요' },
  cardHint: {
    en: 'Pick one from each line. Nothing stops while you move: the band keeps playing and you walk through it.',
    ko: '줄마다 하나씩 고릅니다. 옮기는 동안 아무것도 멈추지 않습니다. 밴드는 계속 연주하고 그 사이를 지나갑니다.',
  },
  qSeat: { en: 'Put me', ko: '앉을 자리' },
  qHour: { en: 'And it is', ko: '지금 시각' },
  send: { en: 'Take that seat', ko: '그 자리로 가기' },
  again: { en: 'Move again', ko: '자리 옮기기' },

  seatFront: { en: 'at the front of the stage', ko: '무대 바로 앞' },
  seatBar: { en: 'at the bar', ko: '바 자리' },
  seatBack: { en: 'at the back of the room', ko: '방 뒷자리' },
  seatStairs: { en: 'on the stairs', ko: '계단 위' },

  hourEarly: { en: 'early evening', ko: '초저녁' },
  hourMidnight: { en: 'midnight', ko: '자정' },
  hourTwo: { en: 'two in the morning', ko: '새벽 두 시' },
  hourClose: { en: 'closing time', ko: '파장' },

  /* --- Crossing the room, captioned so the piece works with the sound off */
  stageUp: { en: 'Your chair goes back over the boards.', ko: '의자가 바닥 널을 긁으며 뒤로 밀립니다.' },
  stageWalk: { en: 'You start across the floor. The band changes shape as you go.', ko: '바닥을 가로질러 걷기 시작합니다. 걸어가는 동안 밴드 소리의 모양이 바뀝니다.' },
  stagePart: { en: 'The room makes way. Somebody laughs close to your ear.', ko: '사람들이 길을 내줍니다. 귀 가까이에서 누군가 웃습니다.' },
  stageSit: { en: 'A chair is pulled in behind you.', ko: '뒤에서 의자가 당겨집니다.' },
  stageGlass: { en: 'A glass is set down in front of you.', ko: '앞에 잔이 놓입니다.' },
  stageSettle: { en: 'This is what the band sounds like from here.', ko: '여기서 듣는 밴드는 이런 소리입니다.' },

  /* --- What you can hear from here ------------------------------------- */
  nowHead: { en: 'From this seat', ko: '이 자리에서' },
  nowWhere: { en: '{seat}, {hour}.', ko: '{seat}, {hour}.' },
  nowTempo: { en: '117.5 to the minute, measured off the take', ko: '분당 117.5박 — 발주값이 아니라 실측' },

  medFront: {
    en: 'The bells are a couple of metres away and pointed straight at you. Almost nothing you are hearing has touched a wall yet.',
    ko: '관악기 벨이 두어 미터 앞에서 이쪽을 정면으로 향하고 있습니다. 지금 들리는 소리는 아직 벽에 닿지 않은 소리입니다.',
  },
  medBar: {
    en: 'The horns point past you, so the top of the band goes first. In exchange the counter is forty centimetres from your ear.',
    ko: '관악기가 옆을 향하고 있어서 높은 대역이 먼저 사라집니다. 대신 바 상판이 귀에서 40센티 거리에 있습니다.',
  },
  medBack: {
    en: 'Twelve metres and a full room in between. You are hearing the tin ceiling more than you are hearing the front line.',
    ko: '12미터 뒤, 사이에는 사람이 가득합니다. 프론트 라인보다 양철 천장이 더 많이 들립니다.',
  },
  medStairs: {
    en: 'The band is round a corner and below you, arriving through one doorway. The street is not.',
    ko: '밴드는 모퉁이 너머 아래쪽에 있고 문 하나를 통해서만 올라옵니다. 거리 소리는 그렇지 않습니다.',
  },

  labelBand: { en: 'the band, through the air', ko: '공기를 건너온 밴드' },
  labelCrowd: { en: 'talk at your elbow', ko: '팔꿈치 옆 대화' },
  labelGlass: { en: 'glass and bottles', ko: '잔과 병' },
  labelFloor: { en: 'boots on the boards', ko: '바닥을 구르는 발' },
  labelStreet: { en: 'the street through the door', ko: '문틈으로 드는 거리' },
  labelFan: { en: 'the ceiling fan', ko: '천장 선풍기' },
  labelSlap: { en: 'slap off the tin', ko: '양철 천장 반사' },
  labelStair: { en: 'tail up the stairwell', ko: '계단 통로 잔향' },

  low: { en: 'low', ko: '낮음' },
  mid: { en: 'medium', ko: '보통' },
  high: { en: 'high', ko: '높음' },
  off: { en: 'out', ko: '없음' },

  /* --- Room legend, for the same reason --------------------------------- */
  legendHead: { en: 'What is in the air', ko: '방 안의 소리' },
  legendCrowd: {
    en: 'Eight conversations with no words in them, laughter, and a shout that lands on the bar line rather than between two of them.',
    ko: '알아들을 수 없는 대화 여덟 갈래, 웃음, 그리고 마디 사이가 아니라 마디 첫 박에 떨어지는 고함.',
  },
  legendBar: {
    en: 'Glass on glass, a bottle set down, a pour whose pitch rises as the glass fills, a cork, and change on a zinc counter.',
    ko: '잔이 잔에 부딪는 소리, 내려놓는 병, 잔이 차오르며 음이 올라가는 따르는 소리, 코르크, 아연 상판 위의 잔돈.',
  },
  legendFloor: {
    en: 'Chairs dragged over boards, and boots landing on the backbeat with the band rather than near it.',
    ko: '널바닥을 긁는 의자, 그리고 밴드 근처가 아니라 밴드의 뒷박에 정확히 내려앉는 발.',
  },
  legendStreet: {
    en: 'Only while the door is open: a cart at a walk, a motor car putting past, and a klaxon telling somebody to move.',
    ko: '문이 열려 있는 동안에만 들립니다. 걸음걸이로 지나가는 마차, 털털거리는 자동차, 비키라고 울리는 경적.',
  },

  /* --- Footer ----------------------------------------------------------- */
  footerNote: {
    en: 'Every part of this room but the band is synthesised in the browser while you listen. The band is one file, generated with MiniMax-Music3 on our own GPUs; its vocal was separated out, re-sung in a licensed speaker timbre and given its original melody back. You hear it through a modelled listening position rather than out of a speaker.',
    ko: '밴드를 뺀 방 전체는 듣는 동안 브라우저에서 합성됩니다. 밴드만 파일이며, 자체 GPU에서 MiniMax-Music3로 만든 한 테이크입니다. 보컬은 분리해 라이선스를 가진 화자 음색으로 다시 부르게 한 뒤 원래 선율을 되이식했습니다. 스피커가 아니라 모델링된 청취 위치를 통해 들립니다.',
  },
  credit: { en: 'More pieces', ko: '다른 작업' },
};

let lang = 'en';

export function getLang() {
  return lang;
}

export function setLang(next) {
  lang = next === 'ko' ? 'ko' : 'en';
  document.documentElement.lang = lang;
  return lang;
}

/** Look up a string, with optional {token} substitution. */
export function t(key, vars) {
  const rec = STRINGS[key];
  if (!rec) return key;
  let out = rec[lang] || rec.en;
  if (vars) for (const k of Object.keys(vars)) out = out.split(`{${k}}`).join(vars[k]);
  return out;
}
