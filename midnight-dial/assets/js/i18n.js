/**
 * i18n.js - one record per string, both languages in the same place.
 * Never split into per-language files: that is how translations drift.
 */

export const LANGS = ['en', 'ko'];

export const STRINGS = {
  'meta.title': {
    en: 'Midnight Dial',
    ko: '심야 다이얼',
  },
  'meta.desc': {
    en: 'Korean late night radio, 1997. Turn the knob until something finds you.',
    ko: '1997년의 심야 라디오. 무언가 잡힐 때까지 다이얼을 돌립니다.',
  },
  'brand.mark': { en: 'MIDNIGHT DIAL', ko: '심야 다이얼' },
  'brand.model': { en: 'MODEL 97-FM', ko: '97-FM 모델' },
  'hero.title': { en: 'Midnight Dial', ko: '심야 다이얼' },
  'hero.line': {
    en: 'Korean late night radio, 1997. Turn the knob until something finds you.',
    ko: '1997년의 심야 라디오. 무언가 잡힐 때까지 다이얼을 돌립니다.',
  },
  'hero.hint': {
    en: 'Press power, then drag the dial. Nine stations are hiding in the static. Headphones help.',
    ko: '전원을 켜고 다이얼을 끕니다. 잡음 사이에 아홉 개의 방송이 숨어 있습니다. 헤드폰을 쓰면 더 좋습니다.',
  },
  'hero.hintOn': {
    en: 'Drag the dial, scroll it, or use the arrow keys. The space between stations is part of it.',
    ko: '다이얼을 끌거나 스크롤하거나 화살표 키를 씁니다. 방송 사이의 잡음도 이 라디오의 일부입니다.',
  },
  'lang.toggle': { en: '한국어', ko: 'English' },
  'lang.toggleAria': { en: 'Switch to Korean', ko: '영어로 전환' },

  'ctrl.power': { en: 'Power', ko: '전원' },
  'ctrl.powerOnAria': { en: 'Turn the receiver on', ko: '수신기를 켭니다' },
  'ctrl.powerOffAria': { en: 'Turn the receiver off', ko: '수신기를 끕니다' },
  'ctrl.mute': { en: 'Mute', ko: '음소거' },
  'ctrl.muteAria': { en: 'Mute the receiver', ko: '소리를 끕니다' },
  'ctrl.unmuteAria': { en: 'Unmute the receiver', ko: '소리를 켭니다' },
  'ctrl.volume': { en: 'Volume', ko: '음량' },

  'tuner.label': { en: 'Tuning dial', ko: '주파수 다이얼' },
  'tuner.help': {
    en: 'Drag, scroll, or use the arrow keys. Page Up and Page Down jump a full megahertz.',
    ko: '끌거나 스크롤하거나 화살표 키를 씁니다. Page Up과 Page Down은 1메가헤르츠씩 이동합니다.',
  },

  'unit.mhz': { en: 'MHz', ko: 'MHz' },
  'ind.lock': { en: 'LOCK', ko: '수신' },
  'ind.stereo': { en: 'STEREO', ko: '스테레오' },
  'ind.signal': { en: 'SIGNAL', ko: '신호' },
  'ind.band': { en: 'FM BAND', ko: 'FM 대역' },

  'state.static': { en: 'Between stations', ko: '방송 사이' },
  'state.staticDesc': {
    en: 'Static. Keep turning, something is close.',
    ko: '잡음입니다. 계속 돌리면 무언가 잡힙니다.',
  },
  'state.off': { en: 'Receiver off', ko: '수신기 꺼짐' },
  'state.offDesc': {
    en: 'Nothing is playing. Press power to start the tubes warming.',
    ko: '아무 소리도 나지 않습니다. 전원을 켜면 수신이 시작됩니다.',
  },
  'state.now': { en: 'Now playing', ko: '재생 중' },
  'state.blocked': {
    en: 'The browser blocked audio. Press power once more, or check the tab is not muted.',
    ko: '브라우저가 소리를 막았습니다. 전원을 한 번 더 누르거나 탭 음소거를 확인합니다.',
  },

  'foot.credit': { en: 'Built by Hyojung Han', ko: '한효정이 만들었습니다' },
  'foot.synth': {
    en: 'The receiver and its room are generated live in the browser - no sample files, no recordings. Only the three music stations are files, generated on our own GPUs with MiniMax-Music3; no licensed commercial recording is used. The letter and the sign-off are sung -- their vocals were separated out and re-sung in a licensed speaker timbre, with the original melody transplanted back. The opening signal is instruments only.',
    ko: '방 안의 앰비언스는 전부 브라우저에서 실시간으로 합성됩니다 - 샘플 파일도, 녹음물도 없습니다. 음악 레이어만 자체 GPU에서 MiniMax-Music3로 생성한 파일이며, 라이선스된 상업 녹음물은 한 곡도 쓰지 않았습니다. 사연 BGM과 새벽 클로징에는 노래가 있습니다 — 보컬을 분리해 라이선스를 가진 화자 음색으로 다시 부르게 한 뒤 원래 선율을 되이식했습니다. 오프닝 시그널만 악기입니다.',
  },
};

/** Station display copy, keyed by station id. */
export const STATION_TEXT = {
  music: {
    name: { en: 'Late Night Music Room', ko: '심야 음악실' },
    desc: {
      en: 'Bell tones and tape wow, with vinyl crackle underneath.',
      ko: '종처럼 울리는 음과 테이프의 흔들림, 그 아래 바늘 잡음이 깔립니다.',
    },
  },
  rain: {
    name: { en: 'Rain', ko: '빗소리' },
    desc: {
      en: 'Rain on a window. No music, just the room.',
      ko: '창에 부딪히는 비. 음악은 없고 방의 소리만 있습니다.',
    },
  },
  ballad: {
    name: { en: 'Dawn Ballad', ko: '새벽 발라드' },
    desc: {
      en: 'A minor arpeggio over a slow pad, deep in reverb.',
      ko: '느린 패드 위의 단조 아르페지오, 잔향이 깊습니다.',
    },
  },
  highway: {
    name: { en: 'Night Highway', ko: '야간 고속도로' },
    desc: {
      en: 'A steady pulse, road noise, cars passing.',
      ko: '일정한 박동과 노면 소음, 스쳐 지나가는 차들입니다.',
    },
  },
  shortwave: {
    name: { en: 'Shortwave', ko: '무전' },
    desc: {
      en: 'Whistles, morse, and a signal that keeps fading out.',
      ko: '휘파람 같은 소리와 모스 신호, 계속 사라지는 전파입니다.',
    },
  },
  signal: {
    name: { en: 'Signal', ko: '신호' },
    desc: {
      en: 'A carrier that turned out to have music on it, band-limited the way the receiver limits everything.',
      ko: '음악이 실려 있던 반송파. 수신기가 그렇듯 대역이 잘려 있습니다.',
    },
  },
  letter: {
    name: { en: 'The Letter', ko: '엽서' },
    desc: {
      en: 'The hour where listeners send things in and someone reads them out. Tonight, only what was underneath.',
      ko: '청취자가 보낸 사연을 읽어 주던 시간. 오늘은 그 밑에 깔리던 것만 남았습니다.',
    },
  },
  closing: {
    name: { en: 'Closing', ko: '방송 종료' },
    desc: {
      en: 'What the station plays out on, right before the carrier drops for the night.',
      ko: '전파가 끊기기 직전, 방송을 닫으며 내보내던 곡입니다.',
    },
  },
  fouram: {
    name: { en: 'Four A.M.', ko: '새벽 4시' },
    desc: {
      en: 'One drone, room tone, a bell every twenty seconds.',
      ko: '하나의 드론과 방의 공기, 이십 초마다 울리는 종입니다.',
    },
  },
};

export function t(key, lang) {
  const rec = STRINGS[key];
  if (!rec) return key;
  return rec[lang] ?? rec.en;
}

export function stationName(id, lang) {
  const rec = STATION_TEXT[id];
  return rec ? (rec.name[lang] ?? rec.name.en) : id;
}

export function stationDesc(id, lang) {
  const rec = STATION_TEXT[id];
  return rec ? (rec.desc[lang] ?? rec.desc.en) : '';
}

/** Spoken value for the tuner slider, e.g. "98.7 megahertz, Night Highway". */
export function tunerValueText(freq, stationId, lang) {
  const f = freq.toFixed(1);
  const where = stationId
    ? stationName(stationId, lang)
    : t('state.static', lang);
  return lang === 'ko'
    ? `${f} 메가헤르츠, ${where}`
    : `${f} megahertz, ${where}`;
}
