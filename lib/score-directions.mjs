/** Text printed on the score, independent of notes and playback tempo. */
export function validateScoreDirections(raw, durationBeats) {
  if (!Array.isArray(raw) || raw.length > 2000)
    throw new Error("谱面文字标记列表无效。");
  return raw
    .map((item) => {
      if (
        !item ||
        !["words", "rehearsal"].includes(item.type) ||
        typeof item.text !== "string" ||
        !item.text.trim() ||
        item.text.length > 300 ||
        /[\u0000-\u001f]/.test(item.text) ||
        !Number.isFinite(item.beat) ||
        item.beat < 0 ||
        item.beat >= durationBeats ||
        (item.staff !== undefined && ![1, 2].includes(item.staff))
      )
        throw new Error("谱面文字标记的内容、位置或谱表无效。");
      return {
        type: item.type,
        text: item.text.trim(),
        beat: item.beat,
        staff: item.staff ?? 1,
      };
    })
    .sort((a, b) => a.beat - b.beat || a.staff - b.staff);
}
