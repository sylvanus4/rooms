/**
 * i18n.js - one record per string, both languages side by side.
 *
 * Separate files per language drift. A single table makes a missing
 * translation impossible to hide, and it keeps the Korean and the English
 * versions of the same idea within a line of each other while writing.
 *
 * English is the default. Korean is 합니다체.
 */

export const STRINGS = {
  /* --- Document ------------------------------------------------------- */
  docTitle: {
    en: 'Dabang 1979 - a Korean tearoom you can send a request to',
    ko: '다방 1979 - 쪽지를 보낼 수 있는 다방',
  },
  title: { en: 'Dabang', ko: '다방' },
  year: { en: '1979', ko: '1979' },
  heroLine: {
    en: '1979, a tearoom. Write a slip, put it in the DJ box, and this room changes.',
    ko: '1979년, 다방. 쪽지를 써서 DJ 박스에 넣으면 이 방이 바뀝니다.',
  },
  coverNote: {
    en: 'Sound is the whole piece. The room is built by the browser as it plays; only the record is a file. Headphones help.',
    ko: '소리가 본체입니다. 방은 브라우저가 그 자리에서 만들고, 파일은 판에서 나오는 음악뿐입니다. 헤드폰을 권합니다.',
  },
  begin: { en: 'Open the door', ko: '문을 열고 들어가기' },
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

  /* --- The slip ------------------------------------------------------- */
  slipHead: { en: 'REQUEST', ko: '신 청 곡' },
  slipSub: { en: 'Hand to the booth', ko: 'DJ 박스에 넣어 주세요' },
  slipHint: {
    en: 'Pick one from each line. The DJ reads it out, then plays it.',
    ko: '줄마다 하나씩 고릅니다. DJ가 읽어 준 다음 틀어 줍니다.',
  },
  qMood: { en: 'Play me', ko: '틀어 주세요' },
  qNote: { en: 'Because', ko: '사연은' },
  qWho: { en: 'For', ko: '받는 사람' },
  send: { en: 'Put it in the box', ko: '박스에 넣기' },
  again: { en: 'Write another slip', ko: '쪽지 한 장 더' },

  moodSlow: { en: 'something slow', ko: '느린 걸로' },
  moodBrass: { en: 'something with horns', ko: '관악기가 든 걸로' },
  moodDance: { en: 'something we can move to', ko: '몸이 움직이는 걸로' },
  moodQuiet: { en: 'something sad', ko: '슬픈 걸로' },

  noteGoodbye: { en: 'someone is leaving', ko: '떠나는 사람이 있어서' },
  noteBirthday: { en: 'it is a birthday', ko: '생일이라서' },
  noteWeather: { en: 'it is raining outside', ko: '밖에 비가 와서' },
  noteNothing: { en: 'there is no reason', ko: '그냥' },

  whoAcross: { en: 'the person across the table', ko: '맞은편에 앉은 사람' },
  whoEveryone: { en: 'everyone in here', ko: '여기 있는 모두' },
  whoMyself: { en: 'myself', ko: '나 자신' },
  whoAbsent: { en: 'someone who did not come', ko: '오지 않은 사람' },

  /* --- The booth, captioned so the piece works with the sound off ------ */
  stagePaper: { en: 'The DJ unfolds your slip.', ko: 'DJ가 쪽지를 펼칩니다.' },
  stageLift: { en: 'The needle comes off the record.', ko: '바늘이 판에서 들립니다.' },
  stageClick: { en: 'The microphone clicks on.', ko: '마이크가 딸깍 켜집니다.' },
  stageAnnounce: { en: 'He reads it out. You cannot make out the words from here.', ko: '사연을 읽어 줍니다. 여기서는 말이 잘 들리지 않습니다.' },
  stageStylus: { en: 'The stylus drops.', ko: '바늘이 판에 내려앉습니다.' },
  stageMusic: { en: 'The room takes the record.', ko: '방이 그 판을 받습니다.' },

  /* --- Now playing ---------------------------------------------------- */
  nowHead: { en: 'On the turntable', ko: '지금 걸린 판' },
  nowFor: { en: 'For {who}, because {note}.', ko: '{who}에게, {note} 신청합니다.' },
  nowTempo: { en: '{n} beats a minute, A minor', ko: '분당 {n}박, 가단조' },
  labelMusic: { en: 'the record itself', ko: '판에서 나오는 음악' },
  sideRequest1: { en: 'the up-tempo pressing', ko: '빠른 쪽 판' },
  sideRequest2: { en: 'the slow pressing', ko: '느린 쪽 판' },
  sideLastCall: { en: 'the last-call record', ko: '마지막 판' },
  labelReed: { en: 'reed on the offbeat', ko: '엇박에 리드' },
  labelBrass: { en: 'brass stabs', ko: '관악기 스탭' },
  labelBass: { en: 'walking bass', ko: '워킹 베이스' },
  labelKit: { en: 'brushed kit', ko: '브러시 드럼' },
  labelRoom: { en: 'room over the record', ko: '판 위로 겹치는 방' },
  labelTail: { en: 'reverb tail', ko: '잔향 길이' },
  labelBleed: { en: 'mic bleed', ko: '마이크 새어듦' },
  low: { en: 'low', ko: '낮음' },
  mid: { en: 'medium', ko: '보통' },
  high: { en: 'high', ko: '높음' },
  off: { en: 'out', ko: '없음' },

  /* --- Room legend, for the same reason -------------------------------- */
  legendHead: { en: 'What is in the air', ko: '방 안의 소리' },
  legendRoom: { en: 'Conversation with no words in it, teacups on saucers, spoons, coins on a wooden table.', ko: '알아들을 수 없는 대화, 받침에 놓이는 찻잔, 숟가락, 나무 탁자에 떨어지는 동전.' },
  legendRecord: { en: 'LP surface noise and crackle through a valve amplifier, with 60 Hz mains hum.', ko: 'LP 표면 잡음과 지직거림이 진공관 앰프를 지나며 60 Hz 전원 험이 함께 실립니다.' },
  legendBooth: { en: 'A match, the door bell, and the booth behind glass.', ko: '성냥, 문에 달린 종, 그리고 유리 너머의 DJ 박스.' },

  /* --- Footer ---------------------------------------------------------- */
  footerNote: {
    en: 'The room is synthesised in the browser. Only the record is a file, generated with MiniMax-Music3 on our own GPUs. No licensed commercial recordings, and every track is instrumental.',
    ko: '방 안의 앰비언스는 전부 브라우저에서 실시간으로 합성됩니다. 음악 레이어만 자체 GPU에서 MiniMax-Music3로 생성한 파일이며, 라이선스된 상업 녹음물은 한 곡도 쓰지 않았습니다. 모든 곡은 무보컬입니다.',
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
