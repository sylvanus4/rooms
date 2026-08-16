/**
 * One record per string, both languages together.
 * Splitting these into per-language files is what causes drift, so they stay
 * side by side and a missing translation is visible at a glance.
 */

export const LANGS = ['en', 'ko'];

export const STRINGS = {
  docTitle: {
    en: 'The Arcade, 1992',
    ko: '1992년 오락실',
  },
  docDesc: {
    en: 'A neighbourhood arcade in Korea, 1992, rebuilt entirely from synthesized sound. Move one control and the room fills with people, and everything about it changes.',
    ko: '1992년 동네 오락실을 소리로 다시 지었습니다. 앰비언스는 전부 실시간 합성이고 음악만 생성한 파일이며, 사람 수 하나만 움직이면 방 전체가 달라집니다.',
  },

  eyebrow: {
    en: 'Twenty odd cabinets, one hundred won a play',
    ko: '스무 대 남짓한 기계, 한 판에 백 원',
  },
  h1: {
    en: 'A neighbourhood arcade. Korea, 1992.',
    ko: '동네 오락실. 대한민국, 1992년.',
  },
  heroLine: {
    en: 'The arcade, 1992. How many people are standing in it decides what room it is.',
    ko: '1992년 오락실. 사람이 몇 명이냐에 따라 완전히 다른 방이 됩니다.',
  },
  beginLabel: { en: 'Open the door', ko: '문 열고 들어가기' },
  beginNote: {
    en: 'Sound is the whole piece. Headphones, and a little volume.',
    ko: '소리가 본체입니다. 헤드폰과 적당한 음량을 권합니다.',
  },

  slug: {
    en: 'Arcade / 1992 / afternoon',
    ko: '오락실 / 1992년 / 오후',
  },

  densityLabel: { en: 'People in the room', ko: '방 안의 사람' },
  densityUnit: { en: 'people', ko: '명' },
  densityHelp: {
    en: 'Drag, or use the arrow keys. Home empties the room, End fills it.',
    ko: '끌거나 화살표 키를 씁니다. Home 은 텅 빈 방, End 는 꽉 찬 방입니다.',
  },

  /* Five bands. Written so the piece still reads with the sound off. */
  band0: {
    en: 'Empty. Three cabinets are dark and the rest run their attract loops into nobody, with long gaps of nothing between them. The tail on every sound is long, and the rink upstairs is the loudest thing in the building.',
    ko: '텅 비었습니다. 세 대는 아예 꺼져 있고 나머지는 아무도 없는 쪽으로 데모 화면을 돌립니다. 사이사이 긴 정적이 있고, 소리마다 잔향이 길게 남습니다. 지금 이 건물에서 제일 큰 소리는 위층 롤러장입니다.',
  },
  band1: {
    en: 'A few people. Two or three machines are actually being played. A hundred won hits an empty coin tray and you hear the whole room answer.',
    ko: '몇 명 있습니다. 두세 대만 실제로 돌아갑니다. 백 원짜리가 빈 동전통에 떨어지면 방 전체가 대답합니다.',
  },
  band2: {
    en: 'Busy. Most cabinets are in play and none of them are in step with each other. A knot of people has formed around one machine near the middle.',
    ko: '북적입니다. 대부분의 기계가 돌아가고 박자는 서로 맞지 않습니다. 가운데 한 대 앞에 사람이 뭉쳐 있습니다.',
  },
  band3: {
    en: 'Filling up. Bodies are eating the reverb, so the room is getting shorter and closer. The ceiling has gone quiet. Cheers start landing.',
    ko: '차오릅니다. 사람 몸이 잔향을 먹어서 방이 짧고 가까워집니다. 천장은 조용해졌습니다. 함성이 터지기 시작합니다.',
  },
  band4: {
    en: 'Packed. Every machine is running, coins never stop, and the crowd around that one cabinet turns the whole room over each time somebody wins. You cannot tell there is a rink upstairs.',
    ko: '꽉 찼습니다. 모든 기계가 돌아가고 동전은 끊이지 않습니다. 그 한 대 앞의 사람들이 이길 때마다 방 전체가 뒤집힙니다. 위층에 롤러장이 있다는 것도 이제 모릅니다.',
  },

  layersTitle: { en: 'What is making sound', ko: '지금 소리를 내는 것' },
  layCabinets: { en: 'Cabinets', ko: '오락기' },
  layCabinetsNote: {
    en: 'FM chip music in E minor at 152 and 168 BPM, four voices a machine, several loops running out of phase',
    ko: 'E 단조 152·168 BPM FM 칩 음악, 기계당 4 보이스, 여러 루프가 서로 어긋난 채로',
  },
  layCrowd: { en: 'Crowd', ko: '사람' },
  layCrowdNote: {
    en: 'murmur, and the collective noise when a match ends',
    ko: '웅성거림, 그리고 한 판이 끝날 때의 함성',
  },
  layCoins: { en: 'Coins', ko: '동전' },
  layCoinsNote: {
    en: 'coins into a metal tray, joystick clatter, buttons being mashed',
    ko: '철제 동전통에 떨어지는 동전, 조이스틱 소리, 버튼 연타',
  },
  layMachines: { en: 'Machines', ko: '기계 소음' },
  layMachinesNote: {
    en: 'cooling fan hum, and the 15.7 kHz whine off the picture tubes',
    ko: '냉각팬 소음, 그리고 브라운관에서 나는 15.7 kHz 고주파',
  },
  layUpstairs: { en: 'Upstairs', ko: '위층' },
  layUpstairsNote: {
    en: 'the roller rink through the ceiling, A minor at 128 BPM, wheels on wood, a whistle',
    ko: '천장 너머 롤러장, A 단조 128 BPM, 나무 바닥 위 바퀴, 호루라기',
  },
  layMusic: { en: 'Music', ko: '음악' },
  layMusicNote: {
    en: 'an empty room hears the rink upstairs, a full one hears the cabinet everyone is round',
    ko: '텅 빈 방에서는 위층 롤러장이, 꽉 찬 방에서는 사람들이 둘러싼 기계가 들립니다',
  },
  layOn: { en: 'on', ko: '켜짐' },
  layOff: { en: 'off', ko: '꺼짐' },

  coinHint: {
    en: 'Click any cabinet to put a coin in.',
    ko: '아무 기계나 누르면 동전을 넣습니다.',
  },

  volumeLabel: { en: 'Volume', ko: '음량' },
  muteLabel: { en: 'Mute', ko: '음소거' },
  unmuteLabel: { en: 'Unmute', ko: '음소거 해제' },
  langLabel: { en: '한국어로 보기', ko: 'View in English' },

  blocked: {
    en: 'The browser would not start audio. Tap the button once more, or check that this tab is not muted.',
    ko: '브라우저가 소리를 시작하지 못했습니다. 버튼을 한 번 더 누르거나 이 탭이 음소거인지 확인해 주세요.',
  },
  noAudio: {
    en: 'This browser has no Web Audio support, so the room cannot be built. Everything on screen still works.',
    ko: '이 브라우저는 Web Audio 를 지원하지 않아 방을 만들 수 없습니다. 화면은 그대로 동작합니다.',
  },

  credit: {
    en: 'The room is synthesized live in the browser - no sample files, no recordings. Only the music layer is a file, generated on our own GPUs with MiniMax-Music3; no licensed commercial recording is used, and every track is instrumental.',
    ko: '방 안의 앰비언스는 전부 브라우저에서 실시간으로 합성됩니다 - 샘플 파일도, 녹음물도 없습니다. 음악 레이어만 자체 GPU에서 MiniMax-Music3로 생성한 파일이며, 라이선스된 상업 녹음물은 한 곡도 쓰지 않았습니다. 모든 곡은 무보컬입니다.',
  },
  by: { en: 'Built by Hyojung Han', ko: '만든 사람 한효정' },
};

/** @returns {string} the string for `key` in `lang`, falling back to English. */
export function t(key, lang) {
  const rec = STRINGS[key];
  if (!rec) return key;
  return rec[lang] || rec.en;
}

export const BANDS = ['band0', 'band1', 'band2', 'band3', 'band4'];
