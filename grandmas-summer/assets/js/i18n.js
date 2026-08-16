/* =============================================================================
   i18n - one record per string, both languages side by side.
   Keeping them in the same object is deliberate: separate per-language files
   drift the moment somebody edits one and forgets the other.
   ========================================================================== */

export const STRINGS = {
  title:        { en: "Grandma's Summer",                   ko: "할머니 집, 여름" },
  subtitle:     { en: "1996 . the countryside . one day",   ko: "1996년 . 시골 . 하루" },
  eyebrow:      { en: "Summer, 1996",                       ko: "1996년 여름" },
  hero: {
    en: "One summer day at your grandmother's house, 1996. Drag the sun.",
    ko: "1996년 할머니 집의 여름 하루. 해를 끌어 보세요."
  },
  begin:        { en: "Begin",                              ko: "시작합니다" },
  beginNote: {
    en: "Sound is the whole point. Headphones help.",
    ko: "소리가 전부입니다. 헤드폰을 쓰면 더 좋습니다."
  },

  nowLabel:     { en: "Right now",                          ko: "지금" },
  layersLabel:  { en: "What you are hearing",               ko: "지금 들리는 것" },
  controlsLabel:{ en: "Playback controls",                  ko: "재생 조절" },

  letItRun:     { en: "Let it run",                         ko: "저절로" },
  fanOn:        { en: "Fan",                                ko: "선풍기" },
  rain:         { en: "Shower",                             ko: "소나기" },
  volume:       { en: "Volume",                             ko: "음량" },
  mute:         { en: "Mute",                               ko: "음소거" },
  unmute:       { en: "Unmute",                             ko: "음소거 해제" },
  sunLabel:     { en: "Time of day",                        ko: "하루의 시각" },

  creditText: {
    en: "The yard is generated live in the browser - no sample files, no recordings. Only the music layer is a file, generated on our own GPUs with MiniMax-Music3; no licensed commercial recording is used, and every track is instrumental.",
    ko: "방 안의 앰비언스는 전부 브라우저에서 실시간으로 합성됩니다 - 샘플 파일도, 녹음물도 없습니다. 음악 레이어만 자체 GPU에서 MiniMax-Music3로 생성한 파일이며, 라이선스된 상업 녹음물은 한 곡도 쓰지 않았습니다. 모든 곡은 무보컬입니다."
  },

  audioBlocked: {
    en: "The browser would not let the sound start. Tap Begin once more, or check that this tab is not muted.",
    ko: "브라우저가 소리 재생을 막았습니다. 시작을 한 번 더 누르거나, 이 탭이 음소거되어 있지 않은지 확인해 주세요."
  },

  /* layer names for the level meters */
  layerCicada:  { en: "cicadas",   ko: "매미" },
  layerFan:     { en: "fan",       ko: "선풍기" },
  layerChime:   { en: "chime",     ko: "풍경" },
  layerBird:    { en: "birds",     ko: "새" },
  layerNight:   { en: "crickets",  ko: "풀벌레" },
  layerTv:      { en: "tv",        ko: "티브이" },
  layerRain:    { en: "rain",      ko: "비" },
  layerMusic:   { en: "music",     ko: "음악" },

  /* captions, one per stretch of the day */
  cap0:  { en: "first light, the birds start up",             ko: "동이 트고 새들이 울기 시작합니다" },
  cap1:  { en: "morning, cool air through the open door",     ko: "아침, 열린 문으로 서늘한 바람이 듭니다" },
  cap2:  { en: "the first cicadas find their pitch",          ko: "첫 매미들이 목청을 고릅니다" },
  cap3:  { en: "late morning, the heat starts to gather",     ko: "늦은 아침, 더위가 쌓이기 시작합니다" },
  cap4:  { en: "noon, the light goes white and flat",         ko: "정오, 빛이 하얗게 바랩니다" },
  cap5:  { en: "the cicadas are at their loudest",            ko: "매미 소리가 가장 큽니다" },
  cap6:  { en: "afternoon, the chorus thins out",             ko: "오후, 매미 소리가 성글어집니다" },
  cap7:  { en: "the light turns amber across the yard",       ko: "마당에 노을빛이 깔립니다" },
  cap8:  { en: "sunset, the last cicadas give up",            ko: "해가 지고 마지막 매미가 그칩니다" },
  cap9:  { en: "evening, crickets and a TV in the other room", ko: "저녁, 풀벌레와 건넌방 티브이 소리" },
  cap10: { en: "night, frogs down in the paddy",              ko: "밤, 논에서 개구리가 웁니다" },
  cap11: { en: "late, only the fan and the wind chime",       ko: "늦은 밤, 선풍기와 풍경뿐입니다" },
  capRain: { en: "a shower, and the cicadas stop dead",       ko: "소나기가 내리고 매미가 뚝 그칩니다" }
};

export function tr(key, lang) {
  const rec = STRINGS[key];
  if (!rec) return key;
  return rec[lang] || rec.en;
}

/* Clock formatting. 12 hour with a meridiem in English, 오전/오후 in Korean. */
export function formatClock(minutes, lang) {
  const total = Math.round(minutes) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const mm = String(m).padStart(2, "0");
  if (lang === "ko") {
    const half = h24 < 12 ? "오전" : "오후";
    let h = h24 % 12;
    if (h === 0) h = 12;
    return `${half} ${h}시 ${mm}분`;
  }
  const mer = h24 < 12 ? "AM" : "PM";
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${mm} ${mer}`;
}
