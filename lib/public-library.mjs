import { userError } from "./settings.mjs";
import { safeFetch, normalizePublicUrl } from "./safe-network.mjs";
import { randomBytes } from "node:crypto";
import MidiPackage from "@tonejs/midi/build/Midi.js";
import { importScore } from "./importers.mjs";
import {
  getScoreQueryPlan,
  workAliasFor,
  normalizeScoreText,
  stripScoreTerms,
} from "./score-query.mjs";
import {
  createInternationalScoreProviders,
  parseImslpPianoEditions,
} from "./international-scores.mjs";

const { Midi } = MidiPackage;

const repository = "https://github.com/musetrainer/library";
const entries = [
  [
    "Fur_Elise_Easy_Piano.mxl",
    "致爱丽丝 · 简易版",
    "贝多芬",
    ["fur elise", "für elise", "beethoven"],
  ],
  [
    "Fur_Elise.mxl",
    "致爱丽丝",
    "贝多芬",
    ["fur elise", "für elise", "beethoven"],
  ],
  [
    "Ode_to_Joy_Easy_variation.mxl",
    "欢乐颂 · 简易变奏",
    "贝多芬",
    ["ode to joy", "beethoven"],
  ],
  [
    "12_Variations_of_Twinkle_Twinkle_Little_Star.mxl",
    "小星星变奏曲",
    "莫扎特",
    ["twinkle", "mozart"],
  ],
  [
    "Bach_Minuet_in_G_Major_BWV_Anh._114.mxl",
    "G 大调小步舞曲",
    "佩措尔德（原归于巴赫）",
    ["bach", "minuet", "petzold", "小步舞曲"],
  ],
  [
    "Canon_in_D_easy.mxl",
    "D 大调卡农 · 简易版",
    "帕赫贝尔",
    ["canon", "pachelbel"],
  ],
  ["Canon_in_D.mxl", "D 大调卡农", "帕赫贝尔", ["canon", "pachelbel"]],
  [
    "Sonate_No._14_Moonlight_1st_Movement.mxl",
    "月光奏鸣曲 · 第一乐章",
    "贝多芬",
    ["moonlight sonata", "beethoven"],
  ],
  [
    "Mozart_-_Piano_Sonata_No._16_-_Allegro.mxl",
    "C 大调第16号钢琴奏鸣曲",
    "莫扎特",
    ["mozart", "sonata", "k545"],
  ],
  [
    "Erik_Satie_-_Gymnopedie_No.1.mxl",
    "第一号裸体舞曲",
    "萨蒂",
    ["satie", "gymnopedie"],
  ],
  [
    "Chopin_-_Nocturne_Op_9_No_2_E_Flat_Major.mxl",
    "降 E 大调夜曲 Op.9 No.2",
    "肖邦",
    ["chopin", "nocturne", "夜曲"],
  ],
  [
    "Waltz_in_A_MinorChopin.mxl",
    "A 小调圆舞曲",
    "肖邦",
    ["chopin", "waltz", "圆舞曲"],
  ],
  [
    "The_Entertainer_-_Scott_Joplin_-_1902.mxl",
    "演艺人",
    "斯科特·乔普林",
    ["entertainer", "joplin"],
  ],
  [
    "Prelude_I_in_C_major_BWV_846_-_Well_Tempered_Clavier_First_Book.mxl",
    "C 大调前奏曲 BWV 846",
    "巴赫",
    ["bach", "prelude", "前奏曲"],
  ],
  ["Swan_Lake.mxl", "天鹅湖", "柴可夫斯基", ["swan lake", "tchaikovsky"]],
].map(([filename, title, composer, aliases]) => ({
  path: `scores/${filename}`,
  title,
  composer,
  aliases,
}));
const manifest = new Map(entries.map((e) => [e.path, e]));
const clean = (text) =>
  decodeEntities(String(text || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
export function decodeEntities(value) {
  return String(value).replace(
    /&(?:amp|quot|apos|lt|gt|nbsp|#\d+|#x[\da-f]+);/gi,
    (entity) => {
      const common = {
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">",
        "&nbsp;": " ",
      };
      if (common[entity.toLowerCase()]) return common[entity.toLowerCase()];
      const n =
        entity[2].toLowerCase() === "x"
          ? parseInt(entity.slice(3, -1), 16)
          : parseInt(entity.slice(2, -1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    },
  );
}
function attribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3]) : "";
}
export function scoreFormat(value, contentType = "") {
  // A file-description URL is HTML even when the MediaWiki title ends in .pdf.
  // Explicit HTML MIME always wins over a misleading filename suffix.
  if (/(?:text\/html|application\/xhtml\+xml)/i.test(contentType)) return "web";
  let path;
  try {
    path = new URL(value).pathname.toLowerCase();
  } catch {
    path = String(value).toLowerCase();
  }
  if (
    /\/(?:wiki\/file(?::|%3a)|wiki\/special(?::|%3a)|index\.php$)/i.test(
      path,
    ) &&
    !/application\/pdf|^image\//i.test(contentType)
  )
    return "web";
  if (
    /\.(?:musicxml|xml)$/.test(path) ||
    /recordare\.musicxml\+xml/.test(contentType)
  )
    return "musicxml";
  if (/\.mxl$/.test(path) || /recordare\.musicxml(?:;|$)/.test(contentType))
    return "mxl";
  if (/\.midi?$/.test(path) || /audio\/(?:x-)?midi/.test(contentType))
    return "midi";
  if (/\.pdf$/.test(path) || /application\/pdf/.test(contentType)) return "pdf";
  if (
    /\.(?:png|jpe?g|webp)$/.test(path) ||
    /^image\/(?:png|jpeg|webp)/.test(contentType)
  )
    return "image";
  return "web";
}
function sourceOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function canonicalResultUrl(value, base) {
  try {
    let url = new URL(decodeEntities(value), base);
    if (
      /(?:^|\.)duckduckgo\.com$/.test(url.hostname) &&
      url.searchParams.has("uddg")
    )
      url = new URL(url.searchParams.get("uddg"));
    if (
      /(?:^|\.)bing\.com$/.test(url.hostname) &&
      url.pathname === "/ck/a" &&
      url.searchParams.get("u")?.startsWith("a1")
    )
      url = new URL(
        Buffer.from(url.searchParams.get("u").slice(2), "base64url").toString(),
      );
    if (
      url.hostname === "github.com" &&
      /\/blob\//.test(url.pathname) &&
      scoreFormat(url.href) !== "web"
    )
      url = new URL(
        `https://raw.githubusercontent.com${url.pathname.replace("/blob/", "/")}`,
      );
    return normalizePublicUrl(url.href).href;
  } catch {
    return null;
  }
}

export function parseDuckDuckGo(html) {
  const rows = [];
  for (const match of html.matchAll(
    /<a\b([^>]*\bclass\s*=\s*["'][^"']*\b(?:result__a|result-link)\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi,
  )) {
    const url = canonicalResultUrl(
      attribute(match[1], "href"),
      "https://html.duckduckgo.com",
    );
    if (!url) continue;
    rows.push({
      title: clean(match[2]),
      url,
      source: sourceOf(url),
      format: scoreFormat(url),
      snippet: "",
    });
  }
  return rows.slice(0, 20);
}

const browserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";
const successfulProviderCache = new Map();
const githubMidiCaches = new WeakMap();
const simplified = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[臺颱]/g, "台")
    .replace(/風/g, "风")
    .replace(/傑/g, "杰")
    .replace(/倫/g, "伦")
    .replace(/鋼/g, "钢")
    .replace(/譜/g, "谱")
    .replace(/農/g, "农")
    .replace(/愛/g, "爱")
    .replace(/麗/g, "丽")
    .replace(/歡/g, "欢")
    .replace(/頌/g, "颂")
    .replace(/樂/g, "乐");
const normalized = (value) => simplified(value).replace(/[^\p{L}\p{N}]+/gu, "");
function queryIdentity(query) {
  const cleaned = simplified(stripScoreTerms(query));
  const parts = cleaned.split(/[\s·,，/|《》"“”]+/).filter(Boolean);
  return {
    parts: parts.length ? parts : [simplified(query)],
    alias: workAliasFor(query),
  };
}
function nonPianoMaterial(description) {
  return (
    /(?:violin|viola|cello|flute|clarinet|saxophone|guitar|ukulele|orchestra|harp|organ|accordion|trumpet|trombone|bassoon|harmonica|marimba|percussion|drums|choir|小提琴|中提琴|大提琴|长笛|單簧管|单簧管|吉他|六线谱|六線譜|管弦乐|管弦樂|竖琴|管风琴|手风琴|小号|长号|单簧管|合唱|打击乐)/i.test(
      description,
    ) &&
    !/(?:piano\s+solo|solo\s+piano|for\s+piano\s+solo|钢琴独奏|鋼琴獨奏)/i.test(
      description,
    )
  );
}

export function relevanceScore(row, query) {
  const title = simplified(row.title),
    snippet = simplified(row.snippet || ""),
    combined =
      title +
      " " +
      snippet +
      " " +
      simplified(row.composer || "") +
      " " +
      String(row.url || "");
  const identity = queryIdentity(query),
    text = normalized(combined),
    titleText = normalized(title);
  const parts = identity.parts
    .map(normalized)
    .filter(
      (part) =>
        part &&
        !["the", "in", "a", "of", "and", "to", "by", "d", "c"].includes(part),
    );
  const primaryText = normalized(title + " " + (row.composer || ""));
  const aliasNames = identity.alias ? identity.alias.aliases : [];
  const aliasWords = new Set(
    aliasNames.flatMap((name) => simplified(name).split(/\s+/).map(normalized)),
  );
  // An alias translates the song name only; every extra artist/version qualifier
  // still needs support in this result's own title or author metadata.
  const qualifierMatches = (part) =>
    primaryText.includes(part) ||
    (identity.alias?.creatorAliases.some(
      (name) => normalizeScoreText(name) === normalizeScoreText(part),
    ) &&
      identity.alias.creatorAliases.some((name) =>
        normalizeScoreText(title + " " + (row.composer || "")).includes(
          normalizeScoreText(name),
        ),
      ));
  const hasName = identity.alias
    ? aliasNames.some((name) =>
        normalizeScoreText(title).includes(normalizeScoreText(name)),
      ) && parts.filter((part) => !aliasWords.has(part)).every(qualifierMatches)
    : parts.some((part) => part.length >= 2 && titleText.includes(part)) &&
      parts.every((part) => primaryText.includes(part));
  if (!hasName) return 0;
  if (
    !["midi", "mxl", "musicxml"].includes(row.format || scoreFormat(row.url)) &&
    nonPianoMaterial(title)
  )
    return 0;
  const isScore =
    /钢琴谱|五线谱|简谱|琴谱|乐谱|sheet\s*music|piano\s*(?:score|sheet)|scores\s+for|score\s+for|双手谱|独奏谱/i.test(
      combined,
    ) ||
    /musescore\.com|everyonepiano\.(?:com|cn)|gangqinpu\.com|tan8\.com|piastudy\.com|hqgq\.com|imslp\.org|mutopiaproject\.org|free-scores\.com|8notes\.com/i.test(
      row.url,
    ) ||
    row.catalogScore === true ||
    scoreFormat(row.url) !== "web";
  if (
    !isScore ||
    (/佳能|相机|打印机|camera|printer|cartridge|insurance|typing\s*(?:test|speed)|歌词|歌詞|lyrics|official\s*music\s*video/i.test(
      title,
    ) &&
      !/琴谱|乐谱|sheet|score/i.test(title))
  )
    return 0;
  let score = parts.reduce(
    (sum, part) =>
      sum + (titleText.includes(part) ? 8 : text.includes(part) ? 3 : 0),
    0,
  );
  if (identity.alias) {
    if (titleText.includes(normalized(identity.alias.title))) score += 12;
    if (combined.toLowerCase().includes(identity.alias.creator.toLowerCase()))
      score += 8;
  }
  if (/钢琴谱|五线谱|简谱|sheet\s*music/i.test(title)) score += 5;
  if (
    /musescore\.com|everyonepiano\.(?:com|cn)|gangqinpu\.com|tan8\.com|imslp\.org|mutopiaproject\.org/i.test(
      row.url,
    )
  )
    score += 4;
  if (scoreFormat(row.url) !== "web") score += 3;
  return score || 1;
}
export function parseSogou(html) {
  const rows = [];
  for (const match of html.matchAll(
    /<div\b[^>]*\bdata-url\s*=\s*(?:"[^"]*"|'[^']*')[^>]*>/gi,
  )) {
    const url = canonicalResultUrl(
      attribute(match[0], "data-url"),
      "https://www.sogou.com",
    );
    if (!url || /(?:^|\.)sogou\.com$/.test(new URL(url).hostname)) continue;
    const block = html.slice(Math.max(0, match.index - 14000), match.index);
    let title = "";
    try {
      title = clean(
        decodeURIComponent(attribute(match[0], "data-title")).replace(
          /[\uE000-\uF8FF]/g,
          "",
        ),
      );
    } catch {}
    if (!title)
      title = clean(
        [...block.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)].at(-1)?.[1],
      );
    if (!title) continue;
    rows.push({
      title,
      url,
      source: sourceOf(url),
      format: scoreFormat(url),
      snippet: "",
    });
  }
  return rows.slice(0, 20);
}
export function parseBingHtml(html) {
  return [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((match) => {
      const anchor = match[1].match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
      if (!anchor) return null;
      const url = canonicalResultUrl(
        attribute(anchor[1], "href"),
        "https://www.bing.com",
      );
      if (!url || /(?:^|\.)bing\.com$/.test(new URL(url).hostname)) return null;
      return {
        title: clean(anchor[2]),
        url,
        source: sourceOf(url),
        format: scoreFormat(url),
        snippet: "",
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}
function blockedPage(html) {
  return /<title[^>]*>\s*(?:安全验证|搜狗搜索\s*$)|captcha|anomaly|antispider|verify you are human|unusual traffic|检测到异常|请完成验证|人机验证|安全验证|enablejs|JavaScript is disabled|enable javascript/i.test(
    html,
  );
}
async function htmlProvider(url, parser, context) {
  const response = await context.fetcher(url, {
    signal: context.signal,
    maxBytes: 2 * 1024 * 1024,
    allowedHosts: [new URL(url).hostname],
    headers: { "user-agent": browserAgent },
  });
  const html = response.buffer.toString("utf8"),
    rows = parser(html);
  if (!rows.length && blockedPage(html))
    return {
      status: "blocked",
      rows: [],
      message: "渠道要求浏览器验证，未绕过验证。",
    };
  return {
    rows,
    status: rows.length ? "ok" : "empty",
    message: rows.length ? "" : "渠道没有返回可解析的结果。",
  };
}
async function archiveProvider(query, context) {
  const identity = queryIdentity(query),
    escape = (value) => value.replace(/["\\]/g, " "),
    alias = identity.alias;
  const title = alias?.title || identity.parts.join(" "),
    artist = alias?.creator;
  const terms = `title:("${escape(title)}")${artist ? ` AND creator:(${escape(artist)})` : ""} AND mediatype:texts AND (subject:("sheet music") OR subject:(scores))`;
  const url =
    "https://archive.org/advancedsearch.php?" +
    new URLSearchParams({
      q: terms,
      output: "json",
      rows: "12",
      "fl[]": "identifier,title,creator,description,subject",
    });
  const response = await context.fetcher(url, {
    signal: context.signal,
    maxBytes: 1024 * 1024,
    headers: { "user-agent": browserAgent },
  });
  const data = JSON.parse(response.buffer.toString("utf8"));
  const rows = (data.response?.docs || [])
    .filter(
      (doc) =>
        typeof doc.identifier === "string" &&
        /^[a-zA-Z0-9._-]+$/.test(doc.identifier),
    )
    .map((doc) => ({
      title: clean(doc.title),
      composer: clean(
        Array.isArray(doc.creator) ? doc.creator.join(", ") : doc.creator,
      ),
      url: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
      source: "Internet Archive 乐谱档案",
      format: "web",
      snippet: clean(
        [
          doc.description,
          ...(Array.isArray(doc.subject) ? doc.subject : [doc.subject]),
        ]
          .filter(Boolean)
          .join(" "),
      ),
      catalogScore: true,
    }));
  return {
    rows,
    status: rows.length ? "ok" : "empty",
    message: "仅查询 Internet Archive 公开乐谱档案，不代表全网。",
  };
}

// This is a live, bounded repository catalogue, not a list of invented song aliases.
// A filename can establish its title/version; it cannot establish an unlisted artist.
const githubMidiRepository = {
  owner: "callmeyyzx",
  name: "midi",
  branch: "main",
};
const githubMidiCacheMs = 30 * 60 * 1000;
function midiCatalogueRow(entry, commit) {
  if (
    entry.type !== "blob" ||
    typeof entry.path !== "string" ||
    !/\.midi?$/i.test(entry.path) ||
    !Number.isFinite(entry.size) ||
    entry.size <= 0 ||
    entry.size > 2 * 1024 * 1024
  )
    return null;
  if (
    entry.path
      .split("/")
      .some((part) => !part || part === "." || part === "..") ||
    /[\u0000-\u001f\\]/.test(entry.path)
  )
    return null;
  const { owner, name } = githubMidiRepository,
    path = entry.path.split("/").map(encodeURIComponent).join("/");
  const filename = entry.path.split("/").at(-1),
    stem = filename.replace(/\.midi?$/i, ""),
    title = stem.replace(/^\s*(?:\(SG\)|（SG）)\s*/i, "").trim();
  return {
    title,
    filename,
    url: `https://raw.githubusercontent.com/${owner}/${name}/${commit}/${path}`,
    sourceUrl: `https://github.com/${owner}/${name}/blob/${commit}/${path}`,
    source: `GitHub · ${owner}/${name} 公开 MIDI 曲库`,
    format: "midi",
    catalogScore: true,
    structured: true,
    scope: "site",
    repository: `${owner}/${name}`,
    repositoryPath: entry.path,
    repositoryRef: commit,
    sha: entry.sha,
    license: "来源未声明乐谱授权；仅提供公开文件出处，请核对使用范围。",
  };
}
export function createGithubMidiProvider(query) {
  return {
    id: "github-midi",
    name: "GitHub 公开 MIDI 曲库",
    scope: "site",
    async run(context) {
      let cache = githubMidiCaches.get(context.fetcher);
      if (!cache) {
        cache = { catalogue: null, verified: new Map() };
        githubMidiCaches.set(context.fetcher, cache);
      }
      const now = Date.now();
      if (!cache.catalogue || now - cache.catalogue.at >= githubMidiCacheMs) {
        const { owner, name, branch } = githubMidiRepository;
        const options = {
          signal: context.signal,
          maxBytes: 2 * 1024 * 1024,
          allowedHosts: ["api.github.com"],
          headers: {
            accept: "application/vnd.github+json",
            "user-agent": "Qinban-Piano-Studio",
          },
        };
        const ref = JSON.parse(
          (
            await context.fetcher(
              `https://api.github.com/repos/${owner}/${name}/git/ref/heads/${branch}`,
              options,
            )
          ).buffer.toString("utf8"),
        );
        const commit = ref.object?.sha;
        if (ref.object?.type !== "commit" || !/^[a-f0-9]{40}$/i.test(commit))
          throw new Error("GitHub commit unavailable");
        const response = await context.fetcher(
          `https://api.github.com/repos/${owner}/${name}/git/trees/${commit}?recursive=1`,
          options,
        );
        const data = JSON.parse(response.buffer.toString("utf8"));
        if (!Array.isArray(data.tree) || data.truncated)
          throw new Error("GitHub catalogue unavailable or incomplete");
        cache.catalogue = {
          at: now,
          rows: data.tree
            .map((entry) => midiCatalogueRow(entry, commit))
            .filter(Boolean),
        };
      }
      const matches = cache.catalogue.rows
        .map((row) => ({ ...row, relevance: relevanceScore(row, query) }))
        .filter((row) => row.relevance > 0)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 4);
      const rows = [];
      let rejected = 0;
      // Leave enough time to return earlier verified matches when a later file stalls.
      const reserveMs = Math.min(
        150,
        Math.max(1, (context.providerTimeoutMs || 7000) / 10),
      );
      const verificationDeadline =
        (context.deadline || Date.now() + 6000) - reserveMs;
      for (const candidate of matches) {
        context.signal.throwIfAborted();
        const remaining = verificationDeadline - Date.now();
        if (remaining <= 0) {
          rejected += matches.length - rows.length - rejected;
          break;
        }
        const key = candidate.repositoryPath + "\0" + candidate.sha,
          cached = cache.verified.get(key);
        let metadata =
          cached && now - cached.at < githubMidiCacheMs
            ? cached.metadata
            : null;
        if (!metadata) {
          try {
            const fileSignal = AbortSignal.any([
              context.signal,
              AbortSignal.timeout(
                Math.max(1, Math.min(2500, Math.floor(remaining))),
              ),
            ]);
            // Bound test/custom fetchers too, rather than relying on HTTP cancellation alone.
            const request = context.fetcher(candidate.url, {
              signal: fileSignal,
              maxBytes: 2 * 1024 * 1024,
              allowedHosts: ["raw.githubusercontent.com"],
            });
            const response = await new Promise((resolve, reject) => {
              const abort = () => reject(fileSignal.reason);
              fileSignal.addEventListener("abort", abort, { once: true });
              Promise.resolve(request)
                .then(resolve, reject)
                .finally(() => fileSignal.removeEventListener("abort", abort));
            });
            if (response.buffer.subarray(0, 4).toString() !== "MThd")
              throw new Error("Not MIDI");
            const midi = new Midi(response.buffer),
              parsed = await importScore(response.buffer, candidate.filename);
            const sounding = midi.tracks.filter((track) => track.notes.length),
              pitched = sounding.filter((track) => track.channel !== 9);
            const pianoOnly =
              sounding.length > 0 &&
              sounding.every(
                (track) =>
                  track.channel !== 9 && track.instrument.family === "piano",
              );
            const instruments = [
              ...new Set(pitched.map((track) => track.instrument.name)),
            ];
            metadata = {
              verified: true,
              verifiedAt: new Date(now).toISOString(),
              pianoOnly,
              instrumentation: pianoOnly ? "piano" : "ensemble",
              instruments,
              noteCount: parsed.score.notes.length,
              durationBeats: parsed.score.durationBeats,
              tempo: parsed.score.tempo,
              warnings: [
                pianoOnly
                  ? "已验证为钢琴音色 MIDI；谱面由演奏事件生成，并非出版社原版五线谱。"
                  : "含非钢琴乐器或打击乐，是合奏 MIDI；导入后按钢琴演奏事件呈现，不等于钢琴原谱。",
                ...parsed.warnings,
              ],
            };
            cache.verified.set(key, { at: now, metadata });
            while (cache.verified.size > 100)
              cache.verified.delete(cache.verified.keys().next().value);
          } catch (error) {
            if (context.signal.aborted) throw error;
            rejected++;
            continue;
          }
        }
        rows.push({ ...candidate, ...metadata });
      }
      return {
        rows,
        status: rows.length ? "ok" : rejected ? "error" : "empty",
        message: `仅检索 ${githubMidiRepository.owner}/${githubMidiRepository.name} 公开 MIDI 仓库，不代表全网；不为文件名未注明的歌手作推断。${rejected ? ` ${rejected} 个匹配文件无法完成实际解析，未列入可导入结果。` : ""}`,
      };
    },
  };
}
async function searchHtmlVariants(queries, makeURL, parser, context) {
  const rows = [];
  let last = { status: "empty", rows: [] };
  for (const [index, terms] of queries.entries()) {
    if (context.signal.aborted) break;
    const remaining =
      (context.deadline || Date.now() + 7000) - Date.now() - 120;
    if (remaining < 25) break;
    const budget = Math.max(
      1,
      Math.min(3000, Math.floor(remaining / (queries.length - index))),
    );
    const signal = AbortSignal.any([
      context.signal,
      AbortSignal.timeout(budget),
    ]);
    try {
      last = await htmlProvider(makeURL(terms), parser, { ...context, signal });
      rows.push(...last.rows);
    } catch (error) {
      if (context.signal.aborted && !rows.length) throw error;
      last = { status: "error", rows: [], message: "部分曲名查询超时或受限。" };
    }
  }
  return rows.length ? { rows, status: "ok" } : last;
}
function defaultProviders(query) {
  const queries = getScoreQueryPlan(query).queries;
  return [
    ...createInternationalScoreProviders(query),
    createGithubMidiProvider(query),
    {
      id: "duckduckgo",
      name: "DuckDuckGo",
      scope: "web",
      async run(context) {
        const first = await searchHtmlVariants(
          queries,
          (terms) =>
            "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(terms),
          parseDuckDuckGo,
          context,
        );
        if (first.rows.length || context.signal.aborted) return first;
        const second = await searchHtmlVariants(
          queries,
          (terms) =>
            "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(terms),
          parseDuckDuckGo,
          context,
        );
        return second.rows.length
          ? second
          : {
              ...second,
              status:
                first.status === "blocked" || second.status === "blocked"
                  ? "blocked"
                  : second.status,
            };
      },
    },
    {
      id: "sogou",
      name: "搜狗",
      scope: "web",
      run: (context) =>
        searchHtmlVariants(
          queries,
          (terms) =>
            "https://www.sogou.com/web?query=" + encodeURIComponent(terms),
          parseSogou,
          context,
        ),
    },
    {
      id: "archive",
      name: "Internet Archive 乐谱档案",
      scope: "site",
      run: (context) => archiveProvider(query, context),
    },
    {
      id: "bing",
      name: "Bing",
      scope: "web",
      run: (context) =>
        searchHtmlVariants(
          queries,
          (terms) =>
            "https://www.bing.com/search?" +
            new URLSearchParams({
              q: terms,
              setlang: /[\u3400-\u9fff]/.test(terms) ? "zh-hans" : "en",
            }),
          parseBingHtml,
          context,
        ),
    },
  ];
}

function officialProviders(query, searchConfig) {
  const terms = getScoreQueryPlan(query).queries[0],
    providers = [];
  if (searchConfig.braveApiKey)
    providers.push({
      id: "brave-api",
      name: "Brave Search API",
      scope: "api",
      async run(context) {
        const response = await context.fetcher(
          "https://api.search.brave.com/res/v1/web/search?" +
            new URLSearchParams({ q: terms, count: "15" }),
          {
            signal: context.signal,
            maxBytes: 2 * 1024 * 1024,
            maxRedirects: 0,
            headers: {
              "X-Subscription-Token": searchConfig.braveApiKey,
              accept: "application/json",
            },
          },
        );
        const data = JSON.parse(response.buffer.toString("utf8"));
        return {
          rows: (data.web?.results || []).map((row) => ({
            title: clean(row.title),
            url: row.url,
            snippet: clean(row.description),
          })),
        };
      },
    });
  if (searchConfig.tavilyApiKey)
    providers.push({
      id: "tavily-api",
      name: "Tavily Search API",
      scope: "api",
      async run(context) {
        const response = await context.fetcher(
          "https://api.tavily.com/search",
          {
            signal: context.signal,
            maxBytes: 2 * 1024 * 1024,
            maxRedirects: 0,
            method: "POST",
            headers: {
              authorization: `Bearer ${searchConfig.tavilyApiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              query: terms,
              search_depth: "basic",
              max_results: 15,
              include_answer: false,
              include_raw_content: false,
            }),
          },
        );
        const data = JSON.parse(response.buffer.toString("utf8"));
        return {
          rows: (data.results || []).map((row) => ({
            title: clean(row.title),
            url: row.url,
            snippet: clean(row.content),
          })),
        };
      },
    });
  if (searchConfig.serperApiKey)
    providers.push({
      id: "serper-api",
      name: "Serper Search API",
      scope: "api",
      async run(context) {
        const response = await context.fetcher(
          "https://google.serper.dev/search",
          {
            signal: context.signal,
            maxBytes: 2 * 1024 * 1024,
            maxRedirects: 0,
            method: "POST",
            headers: {
              "X-API-KEY": searchConfig.serperApiKey,
              "content-type": "application/json",
            },
            body: JSON.stringify({ q: terms, num: 15 }),
          },
        );
        const data = JSON.parse(response.buffer.toString("utf8"));
        return {
          rows: (data.organic || []).map((row) => ({
            title: clean(row.title),
            url: row.link,
            snippet: clean(row.snippet),
          })),
        };
      },
    });
  return providers;
}
function canonicalKey(value) {
  try {
    const url = normalizePublicUrl(value);
    for (const key of [...url.searchParams.keys()])
      if (/^utm_|^(?:fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return (
      url.hostname.replace(/^www\./, "") +
      url.pathname.replace(/\/$/, "") +
      "?" +
      url.searchParams.toString()
    );
  } catch {
    return null;
  }
}
export function mergeProviderResults(rows) {
  const merged = new Map();
  for (const row of rows) {
    const key = canonicalKey(row.url);
    if (!key) continue;
    const existing = merged.get(key);
    if (existing) {
      for (const provider of row.providers || [])
        if (!existing.providers.some((p) => p.id === provider.id))
          existing.providers.push(provider);
      existing.relevance = Math.max(
        existing.relevance || 0,
        row.relevance || 0,
      );
    } else merged.set(key, { ...row, providers: [...(row.providers || [])] });
  }
  return [...merged.values()].sort(
    (a, b) => (b.relevance || 0) - (a.relevance || 0),
  );
}
export async function searchWeb(
  query,
  {
    signal = AbortSignal.timeout(20000),
    fetcher = safeFetch,
    searchConfig = {},
    providers,
    providerTimeoutMs = 7000,
    totalTimeoutMs = 20000,
    cache = successfulProviderCache,
    now = Date.now,
  } = {},
) {
  const overall = AbortSignal.any([
      signal,
      AbortSignal.timeout(totalTimeoutMs),
    ]),
    list = providers || [
      ...officialProviders(query, searchConfig),
      ...defaultProviders(query),
    ];
  const overallDeadline = Date.now() + totalTimeoutMs;
  const outcomes = new Array(list.length);
  let next = 0;
  async function runProvider(provider) {
    const cacheKey = provider.id + "\0" + normalized(query),
      cached = cache.get(cacheKey);
    if (cached && now() - cached.at < 120000)
      return {
        ...structuredClone(cached.outcome),
        status: { ...cached.outcome.status, cached: true },
      };
    const own = AbortSignal.any([
        overall,
        AbortSignal.timeout(providerTimeoutMs),
      ]),
      base = {
        id: provider.id,
        name: provider.name,
        scope: provider.scope || "web",
      };
    try {
      own.throwIfAborted();
      const work = provider.run({
        query,
        signal: own,
        fetcher,
        searchConfig,
        providerTimeoutMs,
        deadline: Math.min(overallDeadline, Date.now() + providerTimeoutMs),
      });
      // Bound custom/provider adapters as well as HTTP, even if an adapter ignores cancellation.
      const result = await new Promise((resolve, reject) => {
        const abort = () => reject(own.reason);
        own.addEventListener("abort", abort, { once: true });
        Promise.resolve(work)
          .then(resolve, reject)
          .finally(() => own.removeEventListener("abort", abort));
      });
      const raw = result.rows || result.results || [];
      const rows = raw
        .map((row) => {
          const url = canonicalResultUrl(row.url);
          return url
            ? {
                ...row,
                url,
                title: clean(row.title),
                format: row.format || scoreFormat(url),
                source: row.source || sourceOf(url),
                scope: provider.scope || "web",
                provider: provider.id,
                providers: [{ id: provider.id, name: provider.name }],
                relevance: relevanceScore({ ...row, url }, query),
              }
            : null;
        })
        .filter((row) => row && row.relevance > 0);
      const status = rows.length
        ? "ok"
        : ["blocked", "error"].includes(result.status)
          ? result.status
          : "empty";
      const outcome = {
        rows,
        status: {
          ...base,
          status,
          count: rows.length,
          fetchedAt: new Date(now()).toISOString(),
          ...(raw.length && !rows.length
            ? {
                message: `返回 ${raw.length} 条，但没有符合曲名的谱面，已过滤。`,
              }
            : result.message
              ? { message: result.message }
              : {}),
        },
      };
      if (rows.length) {
        cache.set(cacheKey, { at: now(), outcome: structuredClone(outcome) });
        while (cache.size > 200) cache.delete(cache.keys().next().value);
      }
      return outcome;
    } catch (error) {
      return {
        rows: [],
        status: {
          ...base,
          status: [401, 403, 429].includes(error?.upstreamStatus)
            ? "blocked"
            : "error",
          count: 0,
          message: own.aborted
            ? "渠道响应超时，本轮保留其他渠道的结果。"
            : [401, 403, 429].includes(error?.upstreamStatus)
              ? "渠道限制自动查询或需要有效授权。"
              : "渠道暂时无法连接或读取。",
        },
      };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(3, list.length) }, async () => {
      while (next < list.length) {
        const index = next++;
        outcomes[index] = await runProvider(list[index]);
      }
    }),
  );
  const providerStatuses = outcomes.map((item) => item.status),
    results = mergeProviderResults(outcomes.flatMap((item) => item.rows));
  const sourcesCount = providerStatuses.filter(
      (status) => status.status === "ok",
    ).length,
    ok = sourcesCount > 0,
    allOk = providerStatuses.every((status) => status.status === "ok");
  const scopes = new Set(
    providerStatuses
      .filter((item) => item.status === "ok")
      .map((item) => (item.scope === "api" ? "web" : item.scope)),
  );
  return {
    results,
    providerStatuses,
    sourcesCount,
    ok,
    state: !ok ? "failed" : allOk ? "ok" : "partial",
    scope: scopes.size > 1 ? "mixed" : scopes.values().next().value || "web",
    engine:
      providerStatuses
        .filter((item) => item.status === "ok")
        .map((item) => item.name)
        .join(" + ") || "多渠道联网检索",
    cached: providerStatuses.some((item) => item.cached),
    fetchedAt: new Date(now()).toISOString(),
    message: ok
      ? `已合并 ${sourcesCount} 个联网渠道的真实谱源。${allOk ? "" : "部分渠道本轮未返回有效结果，不影响其余渠道。"}`
      : `本轮 ${list.length} 个渠道未返回可用谱源；可以调整曲名、补充歌手，或在来源网站继续查找。`,
  };
}

function curatedMatches(query) {
  const q = query.toLowerCase().replace(/\s/g, "");
  return entries
    .filter((entry) =>
      [entry.title, entry.composer, ...entry.aliases].some((value) =>
        value.toLowerCase().replace(/\s/g, "").includes(q),
      ),
    )
    .map((entry) => ({
      title: entry.title,
      composer: entry.composer,
      path: entry.path,
      source: "MuseTrainer 公开 MusicXML 曲库",
      url: `https://raw.githubusercontent.com/musetrainer/library/master/${entry.path}`,
      sourceUrl: `${repository}/blob/master/${entry.path}`,
      license: "曲库标注 Public domain；具体版本署名见源文件",
      format: "mxl",
      curated: true,
    }));
}
function extensionFor(format, url) {
  if (format === "image") {
    const extension = new URL(url).pathname.match(/\.(png|jpe?g|webp)$/i)?.[1];
    return extension || "jpg";
  }
  return (
    { musicxml: "musicxml", mxl: "mxl", midi: "mid", pdf: "pdf" }[format] ||
    "bin"
  );
}
function verifyBinary(buffer, format) {
  if (format === "pdf")
    return buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"));
  if (format === "mxl") return buffer[0] === 80 && buffer[1] === 75;
  if (format === "midi") return buffer.subarray(0, 4).toString() === "MThd";
  if (format === "image")
    return (
      (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) ||
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (buffer.subarray(0, 4).toString() === "RIFF" &&
        buffer.subarray(8, 12).toString() === "WEBP")
    );
  if (format === "musicxml")
    return /<(?:score-partwise|score-timewise)\b/.test(
      buffer.toString("utf8", 0, Math.min(buffer.length, 32768)),
    );
  return false;
}
function visibleScoreHtml(html) {
  const body = String(html).replace(
    /<!--[^]*?-->|<(script|style|template)\b[^>]*>[^]*?<\/\1>/gi,
    "",
  );
  const stack = [];
  let result = "",
    last = 0;
  for (const tag of body.matchAll(/<(\/?)([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const hidden = stack.some((item) => item.hidden);
    if (!hidden) result += body.slice(last, tag.index);
    const name = tag[2].toLowerCase();
    if (tag[1]) {
      const index = stack.map((item) => item.name).lastIndexOf(name);
      if (index >= 0) stack.splice(index);
      if (!hidden) result += tag[0];
    } else {
      const ownHidden =
        /(?:^|\s)hidden(?:\s|=|$)/i.test(tag[3]) ||
        attribute(tag[3], "aria-hidden") === "true" ||
        /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(
          attribute(tag[3], "style"),
        ) ||
        /(?:^|\s)hidden(?:\s|$)/i.test(attribute(tag[3], "class"));
      if (!hidden && !ownHidden) result += tag[0];
      if (
        !/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(
          name,
        ) &&
        !/\/\s*$/.test(tag[3])
      )
        stack.push({ name, hidden: hidden || ownHidden });
    }
    last = tag.index + tag[0].length;
  }
  if (!stack.some((item) => item.hidden)) result += body.slice(last);
  return result;
}
function restrictedScoreHtml(html) {
  return /captcha|(?:verify|verifying)\s+(?:that\s+)?you\s+are\s+human|access denied|bot check|cf-turnstile|人机验证|安全验证|friendlyredirect2?\.html/i.test(
    html,
  );
}
function decodeScoreHtml(response) {
  const hint =
      String(response.headers?.["content-type"] || "") +
      " " +
      response.buffer.toString(
        "ascii",
        0,
        Math.min(response.buffer.length, 2048),
      ),
    encoding = hint.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(encoding || "utf-8").decode(response.buffer);
  } catch {
    return response.buffer.toString("utf8");
  }
}
function scoreViewerUrl(value, base) {
  const url = canonicalResultUrl(value, base);
  if (!url) return null;
  const parsed = new URL(url),
    isViewer = /(?:^|\/)(?:viewer(?:\.html)?|gview)$/i.test(parsed.pathname);
  if (isViewer)
    for (const key of ["file", "url"]) {
      const target = parsed.searchParams.get(key),
        file = target && canonicalResultUrl(target, url);
      if (file && scoreFormat(file) !== "web") return file;
    }
  return url;
}
export function discoverScoreFiles(html, pageUrl) {
  const body = visibleScoreHtml(html),
    title = clean(
      body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "原网站乐谱",
    );
  const files = [],
    links = [],
    seen = new Set(),
    pageHost = new URL(pageUrl).hostname;
  const imslp = /^(?:www\.)?imslp\.org$/i.test(pageHost)
    ? parseImslpPianoEditions(body, pageUrl)
    : [];
  // Work pages contain orchestral, vocal and duet editions as well. Only the
  // explicitly identified solo-piano cards are eligible for further discovery.
  if (
    imslp.length ||
    (/^(?:www\.)?imslp\.org$/i.test(pageHost) &&
      /<div\b[^>]*id=["']IMSLP\d+/i.test(body))
  )
    return { title, files, links: imslp.slice(0, 24) };
  const anchorBodies = new Map(
    [...body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((match) => [
      match.index,
      { label: clean(match[2]), tag: match[2] },
    ]),
  );
  for (const match of body.matchAll(
    /<(a|img|iframe|embed|object)\b([^>]+)>/gi,
  )) {
    const kind = match[1].toLowerCase(),
      tag = match[2],
      nested = anchorBodies.get(match.index),
      child = nested?.tag.match(/<img\b([^>]*)>/i)?.[1] || "";
    const candidate =
      kind === "a"
        ? attribute(tag, "href")
        : kind === "object"
          ? attribute(tag, "data")
          : attribute(tag, "data-src") ||
            attribute(tag, "data-original") ||
            attribute(tag, "src");
    if (!candidate) continue;
    const embedded = ["iframe", "embed", "object"].includes(kind),
      url = embedded
        ? scoreViewerUrl(candidate, pageUrl)
        : canonicalResultUrl(candidate, pageUrl);
    if (!url || seen.has(url)) continue;
    const label =
      attribute(tag, "title") ||
      attribute(tag, "alt") ||
      attribute(child, "alt") ||
      nested?.label ||
      "";
    if (
      /\b(?:login|sign[ -]?in|subscribe|purchase|checkout|unlock|会员|付费|購買|购买|登录)\b/i.test(
        label,
      )
    )
      continue;
    const format = scoreFormat(url, attribute(tag, "type"));
    if (format === "web") {
      const filePage =
        /^(?:www\.)?imslp\.org$/i.test(new URL(url).hostname) &&
        /\/wiki\/File(?::|%3a)/i.test(new URL(url).pathname);
      const viewer =
        embedded &&
        !/advert|doubleclick|youtube|vimeo|facebook|analytics|tracking/i.test(
          url + " " + label,
        ) &&
        /piano|score|sheet|pdf|viewer|乐谱|琴谱|谱面|五线/i.test(
          label + " " + url + " " + title,
        );
      if (filePage || viewer) {
        seen.add(url);
        links.push({
          title: clean(label || title),
          url,
          source: sourceOf(url),
          sourceUrl: pageUrl,
          format: "web",
          discoveryKind: filePage ? "edition" : "viewer",
        });
      }
      continue;
    }
    if (format === "image") {
      const path = new URL(url).pathname;
      const description =
        label +
        " " +
        attribute(tag, "class") +
        " " +
        attribute(tag, "id") +
        " " +
        path;
      if (
        /logo|avatar|icon|banner|advert|qrcode|weixin|loading|spacer|beian|appdown|shouji|\/public\/|\/pianovideo\/|\/flag\/|photo|photograph|wallpaper|cover|portrait|照片|实物|實物|封面|写真|寫真/i.test(
          description,
        )
      )
        continue;
      if (nonPianoMaterial(description)) continue;
      if (/-(?:small|thumb)\./i.test(path)) continue;
      if (
        /(?:^|\.)imslp\.org$/i.test(new URL(url).hostname) &&
        /\/images\/thumb\//i.test(path)
      )
        continue;
      if (
        !/sheet|score|pianomusic|yuepu|qupu|jianpu|五线|五線|簡譜|简谱|钢琴谱|鋼琴譜|-(?:w|j)-[bs]-\d+\./i.test(
          description,
        )
      )
        continue;
    }
    const notation = /-w-[bs]-/i.test(url)
      ? "staff"
      : /-j-[bs]-/i.test(url)
        ? "numbered"
        : undefined;
    const page =
      Number(new URL(url).pathname.match(/-(?:w|j)-[bs]-(\d+)\./i)?.[1]) ||
      undefined;
    // A linked page image is never evidence that the complete song was obtained.
    const preview = format === "image";
    seen.add(url);
    files.push({
      title:
        clean(label || title) +
        (format === "image"
          ? ` · ${notation === "staff" ? "五线谱" : notation === "numbered" ? "简谱" : "谱面图"} ${page || files.filter((f) => f.format === "image").length + 1}${preview ? "（预览）" : ""}`
          : ""),
      url,
      source: sourceOf(url),
      sourceUrl: pageUrl,
      format,
      ...(notation ? { notation } : {}),
      ...(page ? { page } : {}),
      ...(preview ? { preview: true, imageVerification: "pending" } : {}),
    });
  }
  return { title, files: files.slice(0, 24), links: links.slice(0, 24) };
}

export function createScoreSearch({
  searchEngine = searchWeb,
  fetcher = safeFetch,
} = {}) {
  const registry = new Map();
  function register(row, scope) {
    let url;
    try {
      url = normalizePublicUrl(row.url).href;
    } catch {
      return null;
    }
    const now = Date.now();
    for (const [id, entry] of registry)
      if (entry.expires < now) registry.delete(id);
    while (registry.size >= 2000) registry.delete(registry.keys().next().value);
    const id = randomBytes(18).toString("base64url");
    const format =
      /^(?:www\.)?imslp\.org$/i.test(new URL(url).hostname) &&
      /\/wiki\/(?:File|Special)(?::|%3a)/i.test(new URL(url).pathname)
        ? "web"
        : row.format || scoreFormat(url);
    const sourceUrl = row.sourceUrl || url;
    const result = {
      ...row,
      id,
      url,
      sourceUrl,
      format,
      importable: format !== "web",
      downloadUrl: format !== "web" ? `/api/import-score?id=${id}` : undefined,
      resolveUrl: format === "web" ? `/api/resolve-score?id=${id}` : undefined,
    };
    registry.set(id, {
      scope,
      expires: now + 60 * 60 * 1000,
      result,
      allowedHosts: [new URL(url).hostname],
    });
    return result;
  }
  function entry(id, scope) {
    const item = registry.get(id);
    if (!item || item.scope !== scope || item.expires < Date.now())
      throw userError(
        "这条搜索结果已过期，请重新搜索后导入。",
        "SEARCH_RESULT_EXPIRED",
        403,
      );
    return item;
  }
  async function search(
    query,
    scope,
    { signal = AbortSignal.timeout(20000), searchConfig = {} } = {},
  ) {
    if (typeof query !== "string" || !query.trim() || query.trim().length > 100)
      throw userError("请输入 1–100 字的歌曲名或歌手。");
    const q = query.trim(),
      live = await searchEngine(q, { signal, fetcher, searchConfig });
    const providerStatuses = live.providerStatuses || [
      {
        id: "web-search",
        name: live.engine || "联网搜索",
        scope: "web",
        status: live.ok ? "ok" : "empty",
        count: live.results?.length || 0,
        ...(live.message ? { message: live.message } : {}),
      },
    ];
    const sourcesCount =
      live.sourcesCount ??
      providerStatuses.filter((item) => item.status === "ok").length;
    const curated = curatedMatches(q).map((row) => ({
      ...row,
      provider: "curated",
      providers: [{ id: "curated", name: "精选公开曲谱" }],
      relevance: 100,
    }));
    const results = mergeProviderResults([...curated, ...(live.results || [])])
      .map((row) => register({ ...row, searchQuery: q }, scope))
      .filter(Boolean);
    return {
      query: q,
      queryPlan: getScoreQueryPlan(q),
      results,
      total: results.length,
      providerStatuses,
      sourcesCount,
      network: {
        attempted: true,
        ok: live.ok,
        state: live.state || (live.ok ? "ok" : "failed"),
        scope: live.scope || "web",
        engine: live.engine,
        fetchedAt: live.fetchedAt || new Date().toISOString(),
        cached: Boolean(live.cached),
        message: live.message || "",
      },
      externalSearchUrl: `https://www.bing.com/search?q=${encodeURIComponent(q + " 钢琴谱 五线谱 简谱")}`,
      warning: live.ok
        ? "网络检索只提供实际返回的出处；版本、格式及是否收费以来源为准。"
        : live.message,
      description:
        "按原曲名联网找谱。结构化乐谱可直接导入；PDF/图片导入后忠实识谱，不创作或改编。",
    };
  }
  async function resolve(
    id,
    scope,
    { signal = AbortSignal.timeout(20000) } = {},
  ) {
    const item = entry(id, scope);
    if (item.result.format !== "web")
      return {
        title: item.result.title,
        url: item.result.sourceUrl,
        files: [item.result],
        warnings: [],
      };
    const files = [],
      links = [],
      warnings = [],
      seen = new Set(),
      queue = [{ url: item.result.url, row: item.result, depth: 0 }];
    let title = item.result.title,
      rootUrl = item.result.url;
    // Only visible, same-origin edition/viewer pages are followed. The bounded
    // queue is deliberately not a crawler and never executes JavaScript/forms.
    for (let visited = 0; queue.length && visited < 4; visited++) {
      const next = queue.shift();
      if (seen.has(next.url)) continue;
      seen.add(next.url);
      try {
        const host = new URL(next.url).hostname,
          allowedHosts = [
            host,
            host.startsWith("www.") ? host.slice(4) : "www." + host,
          ];
        const pageSignal = AbortSignal.any([
          signal,
          AbortSignal.timeout(next.depth === 0 ? 9000 : 2500),
        ]);
        const request = fetcher(next.url, {
          signal: pageSignal,
          maxBytes: 3 * 1024 * 1024,
          allowedHosts,
        });
        const response = await new Promise((resolve, reject) => {
            const abort = () => reject(pageSignal.reason);
            pageSignal.addEventListener("abort", abort, { once: true });
            Promise.resolve(request)
              .then(resolve, reject)
              .finally(() => pageSignal.removeEventListener("abort", abort));
          }),
          url = response.url || next.url,
          type = response.headers?.["content-type"] || "";
        if (next.depth === 0) rootUrl = url;
        const format = scoreFormat(url, type);
        if (format !== "web") {
          if (!verifyBinary(response.buffer, format))
            throw userError(
              "来源没有返回有效谱面文件，请在原网站查看。",
              "INVALID_SCORE_FILE",
              422,
            );
          files.push({
            ...next.row,
            url,
            format,
            sourceUrl: next.row.sourceUrl || rootUrl,
          });
          continue;
        }
        const html = decodeScoreHtml(response);
        if (restrictedScoreHtml(html))
          throw userError(
            "来源网站要求验证或浏览器交互，请在原网站打开。",
            "SOURCE_RESTRICTED",
            403,
          );
        const discovered = discoverScoreFiles(html, url);
        if (next.depth === 0) title = discovered.title;
        if (
          /付费|付費|购买|購買|会员|會員|sign in|log in|subscribe|purchase/i.test(
            html,
          )
        )
          warnings.push(
            "来源可能包含收费或登录要求；仅列出页面公开显示的文件，不处理受限下载。",
          );
        const inherited =
          next.row.pianoSourceVerified === true
            ? Object.fromEntries(
                [
                  "pianoSourceVerified",
                  "instrumentation",
                  "instrumentEvidence",
                  "edition",
                  "composer",
                  "license",
                  "pageCount",
                ]
                  .filter((key) => next.row[key] !== undefined)
                  .map((key) => [key, next.row[key]]),
              )
            : {};
        files.push(
          ...discovered.files.map((row) => ({ ...inherited, ...row })),
        );
        for (const row of discovered.links || []) {
          if (
            row.discoveryKind === "edition" &&
            item.result.searchQuery &&
            relevanceScore(row, item.result.searchQuery) <= 0
          )
            continue;
          const linked = { ...inherited, ...row };
          links.push(linked);
          if (
            next.depth === 0 &&
            new URL(row.url).origin === new URL(url).origin &&
            !seen.has(row.url)
          )
            queue.push({ url: row.url, row: linked, depth: 1 });
        }
      } catch (error) {
        if (signal.aborted) throw error;
        if (next.depth === 0) throw error;
        warnings.push(
          error.code === "SOURCE_RESTRICTED"
            ? "部分版本页要求验证，请通过“查看来源”手动打开。"
            : "部分公开版本页暂时无法读取，请查看原始来源。",
        );
      }
    }
    const unique = (rows) => [
      ...new Map(rows.map((row) => [row.url, row])).values(),
    ];
    if (files.some((file) => file.format === "image"))
      warnings.push(
        "仅发现来源网页公开显示的谱面/预览页，可能只有部分页，不等于整首完整乐谱。请核对页码后导入，不补写缺页。",
      );
    if (!files.length)
      warnings.push(
        links.length
          ? "已找到公开版本/阅读器入口；本站未直接提供可导入文件，可继续选择版本或查看来源。"
          : "页面未显示可直接导入的公开文件，请在原网站查看或自行下载后导入。",
      );
    return {
      title,
      url: rootUrl,
      files: unique(files)
        .slice(0, 24)
        .map((row) => register(row, scope))
        .filter(Boolean),
      links: unique(links)
        .slice(0, 24)
        .map((row) => register(row, scope))
        .filter(Boolean),
      warnings: [...new Set(warnings)],
    };
  }
  async function download(
    id,
    scope,
    { signal = AbortSignal.timeout(25000) } = {},
  ) {
    const item = entry(id, scope);
    if (item.result.format === "web")
      throw userError(
        "这是一条网页来源，请先获取页面中公开的谱面链接。",
        "NOT_SCORE_FILE",
        400,
      );
    const response = await fetcher(item.result.url, {
      signal,
      maxBytes: 12 * 1024 * 1024,
      allowedHosts: item.allowedHosts,
    });
    let format = scoreFormat(
      response.url,
      response.headers["content-type"] || "",
    );
    if (format === "web") format = item.result.format;
    if (!verifyBinary(response.buffer, format))
      throw userError(
        "来源返回的不是可导入乐谱，可能需要登录或付费。请在原网站查看。",
        "INVALID_SCORE_FILE",
        422,
      );
    let rawName = "";
    try {
      rawName = decodeURIComponent(
        new URL(response.url).pathname.split("/").at(-1) || "",
      );
    } catch {}
    const filename = /\.(?:musicxml|xml|mxl|midi?|pdf|png|jpe?g|webp)$/i.test(
      rawName,
    )
      ? rawName
      : `${item.result.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 100)}.${extensionFor(format, response.url)}`;
    const mime = {
      musicxml: "application/vnd.recordare.musicxml+xml",
      mxl: "application/vnd.recordare.musicxml",
      midi: "audio/midi",
      pdf: "application/pdf",
      image:
        response.buffer[0] === 255
          ? "image/jpeg"
          : response.buffer[0] === 137
            ? "image/png"
            : "image/webp",
    }[format];
    return {
      buffer: response.buffer,
      filename,
      format,
      mime,
      source: item.result,
    };
  }
  return { search, resolve, download };
}

// Compatibility helper for the original curated download route; still exact-path allowlisted.
export async function downloadPublicScore(
  path,
  { signal = AbortSignal.timeout(20000), fetchImpl } = {},
) {
  const item = manifest.get(path);
  if (!item)
    throw userError("此文件不在精选曲库中。", "PUBLIC_SCORE_NOT_ALLOWED", 400);
  const url = `https://raw.githubusercontent.com/musetrainer/library/master/${path}`;
  const response = fetchImpl
    ? await fetchImpl(url, { signal, redirect: "error" })
    : null;
  if (response) {
    if (!response.ok)
      throw userError("曲谱来源暂时不可用。", "SOURCE_UNAVAILABLE", 502);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      filename: path.split("/").at(-1),
      format: "mxl",
    };
  }
  const result = await safeFetch(url, { signal, maxBytes: 12 * 1024 * 1024 });
  return {
    buffer: result.buffer,
    filename: path.split("/").at(-1),
    format: "mxl",
  };
}
export function searchPublicScores(query = "") {
  return {
    results: curatedMatches(String(query)),
    total: curatedMatches(String(query)).length,
    source: repository,
  };
}
