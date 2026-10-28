import {
  PIANO_INSTRUMENTS,
  DEFAULT_PIANO_INSTRUMENT,
} from "./piano-voices.mjs";

export const GUITAR_INSTRUMENTS = Object.freeze([
  Object.freeze({
    id: "nylon-guitar",
    label: "尼龙弦吉他",
    engine: "pluck",
    description: "本机合成的尼龙弦拨弦音色，无需下载采样。",
  }),
]);
export const scoreSection = (score) =>
  score?.instrument === "guitar" ? "guitar" : "piano";
export const sectionInstruments = (section) =>
  section === "guitar" ? GUITAR_INSTRUMENTS : PIANO_INSTRUMENTS;
export const defaultInstrument = (section) =>
  section === "guitar" ? "nylon-guitar" : DEFAULT_PIANO_INSTRUMENT;
export const sectionKey = (key, section) =>
  section === "guitar" ? `${key}-guitar` : key;
export function playbackInstrument(id) {
  const preset = [...PIANO_INSTRUMENTS, ...GUITAR_INSTRUMENTS].find(
    (item) => item.id === id,
  );
  if (!preset) throw new Error("请选择有效的乐器音色。");
  return preset;
}
