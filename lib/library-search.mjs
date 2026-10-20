const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .trim();

/** Empty searches return no records, including before the first search. */
export function searchCloudScores(scores, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return scores.filter((score) => {
    const text = normalize(
      [score.title, score.composer, score.id, score.sourceLabel].join(" "),
    );
    return words.every((word) => text.includes(word));
  });
}
