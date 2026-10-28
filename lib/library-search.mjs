import { scoreWorks, stripScoreTerms } from "./score-query.mjs";

const traditional = {
  愛: "爱",
  麗: "丽",
  絲: "丝",
  風: "风",
  飛: "飞",
  歡: "欢",
  樂: "乐",
  頌: "颂",
  農: "农",
  鳴: "鸣",
  鋼: "钢",
  譜: "谱",
  貝: "贝",
  傑: "杰",
  倫: "伦",
  聽: "听",
  訣: "诀",
  書: "书",
  龍: "龙",
  調: "调",
  練: "练",
  習: "习",
  級: "级",
  進: "进",
  階: "阶",
};
export const normalizeLibraryQuery = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(
      /[愛麗絲風飛歡樂頌農鳴鋼譜貝傑倫聽訣書龍調練習級進階]/g,
      (c) => traditional[c],
    )
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const compact = (value) => normalizeLibraryQuery(value).replace(/\s/g, "");
const composerGroups = [
  ["巴赫", "Bach"],
  ["贝多芬", "Beethoven"],
  ["肖邦", "Chopin"],
  ["舒曼", "Schumann"],
  ["布格缪勒", "Burgmuller"],
  ["莫扎特", "Mozart"],
  ...scoreWorks.map((work) => work.creatorAliases),
];
function searchable(score) {
  const title = normalizeLibraryQuery(score.title),
    composer = normalizeLibraryQuery(score.composer);
  const works = scoreWorks.filter((work) =>
    work.aliases.some((alias) => compact(title).includes(compact(alias))),
  );
  const aliases = works.flatMap((work) => work.aliases);
  const creators = composerGroups
    .filter((group) =>
      group.some((name) => compact(composer).includes(compact(name))),
    )
    .flat();
  return {
    title,
    names: compact([title, ...aliases].join(" ")),
    text: compact(
      [
        title,
        composer,
        score.id,
        score.sourceLabel,
        ...(Array.isArray(score.tags) ? score.tags : []),
        ...aliases,
        ...creators,
      ].join(" "),
    ),
  };
}
/** Rank actual catalogue records; aliases expand identity, never create results. */
export function searchCloudScores(scores, query) {
  const cleaned = stripScoreTerms(query),
    words = normalizeLibraryQuery(cleaned || query)
      .split(/\s+/)
      .filter(Boolean);
  if (!words.length) return [];
  const whole = compact(cleaned || query);
  return scores
    .map((score, index) => {
      const fields = searchable(score);
      if (!words.every((word) => fields.text.includes(word))) return null;
      const title = compact(fields.title);
      const rank =
        (title === whole
          ? 100
          : title.startsWith(whole)
            ? 70
            : title.includes(whole)
              ? 50
              : 0) +
        words.filter((word) => fields.names.includes(word)).length * 10 +
        (/完整|全谱/.test(score.title) ? 6 : 0) -
        (/开头|前两小节|第\s*\d+\s*页\s*·\s*第/.test(score.title) ? 8 : 0);
      return { score, rank, index };
    })
    .filter(Boolean)
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map((row) => row.score);
}
export function scoreLevel(score) {
  const label = normalizeLibraryQuery(score.sourceLabel);
  if (/中级|进阶/.test(label)) return "intermediate";
  if (
    /初级|入门/.test(label) ||
    /^(twinkle|mary-lamb|ode-to-joy|fur-elise)$/.test(score.id)
  )
    return "beginner";
  return "unknown";
}
export const scoreLevelLabel = (score) =>
  ({ beginner: "入门", intermediate: "进阶", unknown: "难度未标注" })[
    scoreLevel(score)
  ];
const featuredIds = [
  "intermediate-beethoven-woo59",
  "score-mv9096ep",
  "intermediate-beethoven-op27-2-m1",
  "full-score-croatian-reviewed-20261019",
  "golden-hour-netease-664959",
  "beginner-schumann-op68-01",
  "twinkle",
  "guitar-beginner-twinkle",
  "guitar-beginner-ode-to-joy",
  "guitar-beginner-c-am-arpeggio",
];
export function rankedCloudScores(scores, kind = "featured") {
  const rows = scores.filter(
    (score) => kind === "featured" || scoreLevel(score) === kind,
  );
  return [...rows].sort((a, b) => {
    const ai = featuredIds.indexOf(a.id),
      bi = featuredIds.indexOf(b.id);
    return (
      (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) ||
      Number(Boolean(a.reviewRequired)) - Number(Boolean(b.reviewRequired))
    );
  });
}
export function discoverCloudScores(
  scores,
  { query = "", level = "all", original = false, sort = "relevance" } = {},
) {
  let rows = query.trim()
    ? searchCloudScores(scores, query)
    : rankedCloudScores(scores);
  rows = rows.filter(
    (score) =>
      (level === "all" || scoreLevel(score) === level) &&
      (!original || score.hasOriginal),
  );
  if (sort === "title")
    rows.sort((a, b) =>
      a.title.localeCompare(b.title, "zh-Hans-CN", { numeric: true }),
    );
  if (sort === "tempo")
    rows.sort(
      (a, b) =>
        (Number(a.tempo) > 0 ? Number(a.tempo) : Infinity) -
        (Number(b.tempo) > 0 ? Number(b.tempo) : Infinity),
    );
  return rows;
}
export function suggestCloudQueries(scores, query, limit = 6) {
  const seen = new Set();
  return searchCloudScores(scores, query)
    .filter((score) => {
      const key = compact(score.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
const historyKey = (section) =>
  `qinban-search-history-v1-${section === "guitar" ? "guitar" : "piano"}`;
export function readSearchHistory(storage, section) {
  try {
    const rows = JSON.parse(storage?.getItem(historyKey(section)) || "[]");
    return Array.isArray(rows)
      ? rows
          .filter(
            (row) =>
              typeof row?.query === "string" &&
              row.query.trim() &&
              row.query.length <= 100 &&
              Number.isSafeInteger(row.count) &&
              row.count > 0 &&
              Number.isFinite(row.at),
          )
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
export function rememberSearch(storage, section, query, now = Date.now()) {
  const clean = String(query || "")
    .trim()
    .slice(0, 100);
  if (!clean) return readSearchHistory(storage, section);
  const rows = readSearchHistory(storage, section),
    key = compact(clean),
    prior = rows.find((row) => compact(row.query) === key);
  const next = [
    {
      query: clean,
      count: Math.min((prior?.count || 0) + 1, 1000000),
      at: now,
    },
    ...rows.filter((row) => compact(row.query) !== key),
  ].slice(0, 20);
  try {
    storage?.setItem(historyKey(section), JSON.stringify(next));
  } catch {
    /* Search stays usable with storage disabled. */
  }
  return next;
}
export function clearSearchHistory(storage, section) {
  try {
    storage?.removeItem(historyKey(section));
  } catch {
    /* Storage may be disabled. */
  }
}
