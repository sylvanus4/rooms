/* One record per string, both languages side by side. Separate per-language
   files drift the moment somebody edits one and forgets the other. */

export const STRINGS = {
  title:        { en: "Walkman, 1999", ko: "워크맨, 1999" },
  heroLine:     { en: "1999. The walk to cram school. The more you play it, the more the tape wears.",
                  ko: "1999년, 학원 가는 길. 들을수록 테이프가 닳습니다." },
  begin:        { en: "Press play", ko: "재생을 누릅니다" },
  beginNote:    { en: "Headphones help. Sound starts on the press, nothing is downloaded.",
                  ko: "이어폰을 쓰면 좋습니다. 누르는 순간 소리가 시작되고, 내려받는 파일은 없습니다." },
  blocked:      { en: "The browser would not start audio. Press play again.",
                  ko: "브라우저가 소리를 시작하지 못했습니다. 재생을 다시 눌러 주십시오." },

  play:         { en: "Play", ko: "재생" },
  stop:         { en: "Stop", ko: "정지" },
  rew:          { en: "Rewind", ko: "되감기" },
  ff:           { en: "Fast forward", ko: "빨리감기" },
  flip:         { en: "Flip the tape", ko: "테이프 뒤집기" },
  zip:          { en: "Bag zip", ko: "가방 지퍼" },

  sideLabel:    { en: "Side", ko: "면" },
  counter:      { en: "Counter", ko: "카운터" },
  volume:       { en: "Volume", ko: "음량" },
  mute:         { en: "Mute", ko: "음소거" },
  unmute:       { en: "Unmute", ko: "음소거 해제" },
  langToggle:   { en: "한국어", ko: "English" },

  wearTitle:    { en: "Tape wear, side ", ko: "테이프 마모, " },
  wearNote:     { en: "Playing wears the tape a little. Rewinding wears it a lot, and only where you keep going back to.",
                  ko: "재생은 조금 닳게 합니다. 되감기는 많이 닳게 하고, 그것도 자꾸 돌아가는 그 자리만 닳습니다." },
  wearSeg:      { en: "Section", ko: "구간" },
  wearHead:     { en: "under the head", ko: "헤드 위치" },
  wearMean:     { en: "whole side", ko: "이 면 전체" },
  chorusMark:   { en: "the part you keep rewinding to", ko: "자꾸 되감는 부분" },

  stPlaying:    { en: "Playing side ", ko: "재생 중, " },
  stStopped:    { en: "Stopped.", ko: "정지했습니다." },
  stRew:        { en: "Rewinding. This is the part that stretches the tape.",
                  ko: "되감는 중입니다. 테이프가 늘어나는 건 이 동작입니다." },
  stFf:         { en: "Fast forward.", ko: "빨리감는 중입니다." },
  stFlip:       { en: "Tape flipped. The other side is still new.",
                  ko: "테이프를 뒤집었습니다. 반대 면은 아직 새것입니다." },
  stAuto:       { en: "End of side. Auto reverse.", ko: "면이 끝났습니다. 자동 리버스." },
  stDropout:    { en: "Dropout.", ko: "음이 끊겼습니다." },
  stCrease:     { en: "A crease in the tape.", ko: "테이프에 접힌 자국이 있습니다." },
  stSag:        { en: "The tape is sagging here. It will come back.",
                  ko: "이 구간은 늘어났습니다. 곧 돌아옵니다." },
  stBus:        { en: "A bus goes past.", ko: "버스가 지나갑니다." },
  stArrived:    { en: "You are there. The buzzer, the stairs, and a tape that is not what it was.",
                  ko: "도착했습니다. 초인종, 계단, 그리고 예전 같지 않은 테이프." },

  hearTitle:    { en: "What you are listening to", ko: "지금 들리는 것" },
  hearTape:     { en: "A ballad in C sharp minor at 68 BPM on side A, dance pop at 124 BPM on side B. Piano, string pad, clean guitar, drums, an overdriven guitar taking the melody.",
                  ko: "A면은 68 BPM 올림다단조 발라드, B면은 124 BPM 댄스 팝입니다. 피아노, 스트링 패드, 클린 기타, 드럼, 그리고 멜로디를 맡은 오버드라이브 기타." },
  hearTape2:    { en: "Under it: hiss, wow and flutter, dropouts, and the top end going away.",
                  ko: "그 아래로 히스 잡음, 회전 흔들림, 음 끊김, 그리고 사라지는 고음." },
  hearStreet:   { en: "Around it: footsteps on cold pavement, traffic, a bus, and a door buzzer at the end of the walk.",
                  ko: "그 주변으로 차가운 보도의 발소리, 차 소리, 버스, 그리고 길 끝의 문 초인종." },

  labelSide:    { en: "SIDE", ko: "SIDE" },
  labelHand1:   { en: "for the walk", ko: "가는 길에" },
  labelHand2:   { en: "97 winter", ko: "97 겨울" },
  credit:       { en: "The tape deck and the street are synthesized live in the browser - no sample files, no recordings. Only the music layer is a file, generated on our own GPUs with MiniMax-Music3; no licensed commercial recording is used. Side B is sung -- its vocal was separated out and re-sung in a licensed speaker timbre, with the original melody transplanted back. Side A and the rewind are instruments only.",
                  ko: "방 안의 앰비언스는 전부 브라우저에서 실시간으로 합성됩니다 - 샘플 파일도, 녹음물도 없습니다. 음악 레이어만 자체 GPU에서 MiniMax-Music3로 생성한 파일이며, 라이선스된 상업 녹음물은 한 곡도 쓰지 않았습니다. B면에는 노래가 있습니다 - 보컬을 분리해 라이선스를 가진 화자 음색으로 다시 부르게 한 뒤 원래 선율을 되이식했습니다. A면과 되감기는 악기뿐입니다." },
  creditLink:   { en: "More pieces", ko: "다른 작업" },
};

export function t(key, lang) {
  const rec = STRINGS[key];
  if (!rec) return key;
  return rec[lang] || rec.en;
}
