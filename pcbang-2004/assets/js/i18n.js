/**
 * One record per string. English first, Korean second, always in the same
 * object. Splitting these into per-language files is what causes drift, so
 * they stay welded together here.
 */

export const LANGS = ['en', 'ko'];

export const T = {
  brand:      { en: 'PC BANG / 24H',              ko: '피시방 / 24시' },
  title:      { en: 'PC Bang 2004',               ko: '피시방 2004' },
  hero: {
    en: 'A Korean internet cafe at 2 in the morning, 2004. Before you owned a gaming PC.',
    ko: '2004년 새벽 두 시의 피시방. 내 컴퓨터가 생기기 전.',
  },

  standby:    { en: 'Standby',                    ko: '대기 중' },
  powerOn:    { en: 'Power on',                   ko: '전원 켜기' },
  powerHint: {
    en: 'Sound begins when you press it. Headphones are worth it.',
    ko: '누르면 소리가 시작됩니다. 헤드폰을 쓰면 더 좋습니다.',
  },
  powerFail: {
    en: 'The browser refused to open an audio device. Press again, or check that this tab is not muted.',
    ko: '브라우저가 오디오 장치를 열지 못했습니다. 다시 누르거나, 탭이 음소거되어 있지 않은지 확인해 주세요.',
  },
  skip:       { en: 'Skip',                       ko: '건너뛰기' },

  // Period BIOS chatter. Deliberately vendor-neutral.
  boot: {
    en: [
      'MODULAR BIOS v6.00PG',
      'MAIN PROCESSOR  : 2.40 GHZ',
      'MEMORY TEST     : 524288K OK',
      'DETECTING IDE PRIMARY MASTER ... OK',
      'SEAT 17  /  PREPAID 02:00:00',
    ],
    ko: [
      'MODULAR BIOS v6.00PG',
      'MAIN PROCESSOR  : 2.40 GHZ',
      'MEMORY TEST     : 524288K OK',
      'DETECTING IDE PRIMARY MASTER ... OK',
      '17번 자리  /  충전 02:00:00',
    ],
  },

  seatHead:   { en: 'Seat',                       ko: '자리' },
  seatWindow: { en: 'Window seat',                ko: '창가 자리' },
  seatWindowDesc: {
    en: 'Traffic and rain leak through the glass. The room sits further back.',
    ko: '유리 너머로 차 소리와 빗소리가 새어 듭니다. 매장 소음은 뒤로 물러납니다.',
  },
  seatCorner: { en: 'Corner seat',                ko: '구석 자리' },
  seatCornerDesc: {
    en: 'Buried in the keyboards. Close, dense, and the room rings longer.',
    ko: '키보드 소리 한가운데입니다. 가깝고 빽빽하고 울림이 깁니다.',
  },
  seatCounter:{ en: 'Next to the counter',        ko: '카운터 옆' },
  seatCounterDesc: {
    en: 'The buzzer, the ramen kettle, staff moving past your chair.',
    ko: '호출 버저, 라면 주전자, 의자 뒤로 지나가는 직원.',
  },

  layerHead:  { en: 'Layers',                     ko: '레이어' },
  layerKeys:  { en: 'Keyboards',                  ko: '키보드' },
  layerKeysNote: {
    en: 'Three distance tiers, scattered so it never loops.',
    ko: '거리별 세 단계로 흩어져 있어 반복되지 않습니다.',
  },
  layerFans:  { en: 'Case fans',                  ko: '케이스 팬' },
  layerFansNote: {
    en: 'Forty machines, none of them quiet.',
    ko: '마흔 대 중 조용한 건 한 대도 없습니다.',
  },
  layerRoom:  { en: 'Room',                       ko: '매장 소음' },
  layerRoomNote: {
    en: 'Murmur, a chair scrape, someone losing out loud.',
    ko: '웅성거림, 의자 끄는 소리, 큰 소리로 지는 사람.',
  },
  layerCrt:   { en: 'CRT whine',                  ko: 'CRT 고음' },
  layerCrtNote: {
    en: 'About 15.7 kHz. Plenty of people cannot hear it, and some find it painful. Off by default.',
    ko: '약 15.7kHz입니다. 들리지 않는 사람도 많고, 거슬리는 사람도 있습니다. 기본은 꺼짐입니다.',
  },
  layerMusic: { en: 'Music',                      ko: '음악' },
  layerMusicNote: {
    en: 'Whatever is playing where you are sitting: the ceiling by the door, your own headset, or the radio behind the counter.',
    ko: '앉은 자리에서 들리는 음악입니다. 문 쪽 천장 스피커, 내 헤드셋, 아니면 카운터 뒤의 라디오.',
  },
  layerFluo:  { en: 'Fluorescent',                ko: '형광등' },
  layerFluoNote: {
    en: '120 Hz and its harmonics. The picture dims with it.',
    ko: '120Hz와 배음입니다. 화면 밝기가 같이 흔들립니다.',
  },

  remaining:  { en: 'Time remaining',             ko: '남은 시간' },
  prepaid:    { en: 'Prepaid at the counter',     ko: '카운터 선불' },
  addTime:    { en: 'Add one hour',               ko: '한 시간 충전' },
  price:      { en: '1,000 won',                  ko: '1,000원' },
  expired:    { en: 'Time is up. The counter is waiting.', ko: '시간이 끝났습니다. 카운터에서 기다립니다.' },
  lowTime:    { en: 'Ten minutes left.',          ko: '십 분 남았습니다.' },

  nowHead:    { en: 'Playing',                    ko: '지금 들리는 소리' },
  nowSilent:  { en: 'Everything is off.',         ko: '모든 소리가 꺼져 있습니다.' },
  nowMuted:   { en: 'Muted.',                     ko: '음소거 상태입니다.' },
  nowJoin:    { en: ', ',                         ko: ', ' },

  descKeysNear: { en: 'keyboards right beside you', ko: '바로 옆 키보드' },
  descKeysMid:  { en: 'keyboards a few rows away',  ko: '몇 줄 건너 키보드' },
  descKeysFar:  { en: 'keyboards across the room',  ko: '매장 건너편 키보드' },
  descFans:     { en: 'case fans',                  ko: '케이스 팬' },
  descRoom:     { en: 'room murmur',                ko: '매장 웅성거림' },
  descCrt:      { en: 'the monitor whine',          ko: '모니터 고음' },
  descFluo:     { en: 'fluorescent buzz',           ko: '형광등 소리' },
  descTraffic:  { en: 'traffic through the window', ko: '창밖 차 소리' },
  descCounter:  { en: 'the counter',                ko: '카운터 쪽 소리' },

  volume:     { en: 'Volume',                     ko: '소리 크기' },
  mute:       { en: 'Mute',                       ko: '음소거' },
  unmute:     { en: 'Unmute',                     ko: '음소거 해제' },

  planLabel:  { en: 'Floor plan. Forty machines, five rows of eight. Your seat is marked.',
                ko: '평면도입니다. 여덟 대씩 다섯 줄, 마흔 대. 지금 자리가 표시되어 있습니다.' },
  planWindow: { en: 'WINDOW',                     ko: '창' },
  planCounter:{ en: 'COUNTER',                    ko: '카운터' },
  planDoor:   { en: 'DOOR',                       ko: '출입구' },

  synthNote: {
    en: 'The room is synthesized live in the browser - no sample files, no recordings. Only the music layer is a file, generated on our own GPUs with MiniMax-Music3; no licensed commercial recording is used, and every track is instrumental. Built by',
    ko: '방 안의 앰비언스는 전부 브라우저에서 실시간으로 합성됩니다 - 샘플 파일도, 녹음물도 없습니다. 음악 레이어만 자체 GPU에서 MiniMax-Music3로 생성한 파일이며, 라이선스된 상업 녹음물은 한 곡도 쓰지 않았습니다. 모든 곡은 무보컬입니다. 만든 사람은',
  },

  langSwitch: { en: '한국어',                      ko: 'English' },
};

/** Returns the string for `key` in `lang`. Falls back to English. */
export function t(key, lang) {
  const rec = T[key];
  if (!rec) return key;
  return rec[lang] ?? rec.en;
}
