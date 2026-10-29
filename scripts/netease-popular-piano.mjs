import {
  readFile,
  writeFile,
  mkdir,
  rename,
  rm,
  readdir,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { normalizeCropRect } from "../lib/score-image-layout.mjs";
import {
  callNeteaseSdk,
  createNeteaseSessionStore,
  createNeteaseScoreProvider,
} from "../lib/netease-scores.mjs";

export function canonicalTitle(title) {
  return String(title)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\([^)]*\)|（[^）]*）/g, "")
    .replace(/[\s·・\-–—_'’"“”.,，。:：!！?？]/g, "");
}

export function compositionKey(song) {
  const title = canonicalTitle(song.name);
  if (["風の住む街", "风居住的街道", "風居住的街道"].includes(title))
    return "composition:street-where-wind-lives";
  if (["canonind", "canon", "卡农", "卡農"].includes(title))
    return "composition:canon-in-d";
  if (
    [
      "merrychristmasmrlawrence",
      "圣诞快乐劳伦斯先生",
      "聖誕快樂勞倫斯先生",
    ].includes(title)
  )
    return "composition:merry-christmas-mr-lawrence";
  if (["mariagedamour", "梦中的婚礼"].includes(title))
    return "composition:mariage-d-amour";
  if (["illusionarydaytime", "幻昼"].includes(title))
    return "composition:illusionary-daytime";
  if (["croatianrhapsody", "克罗地亚狂想曲"].includes(title))
    return "composition:croatian-rhapsody";
  if (["alwayswithme", "いつも何度でも", "永远同在"].includes(title))
    return "composition:itsumo-nando-demo";
  if (
    title === "菊次郎的夏天" ||
    (title === "summer" && song.artists?.some((a) => /久石[譲让]/.test(a)))
  )
    return "composition:kikujiro-summer";
  return title;
}

// Batch-source recovery uses all available space between neighboring systems.
// Keep this task's crop policy separate from the App's published detector.
export function expandSystemCrops(layout) {
  const groups = layout.systems;
  return {
    ...layout,
    systems: groups.map((system, i) => {
      const first = system.staffs[0],
        last = system.staffs.at(-1);
      const spacing =
        system.staffs.reduce((n, s) => n + s.spacing, 0) / system.staffs.length;
      const top = i
        ? (groups[i - 1].staffs.at(-1).lines[4] + first.lines[0]) / 2
        : first.lines[0] - spacing * 5.5;
      const bottom =
        i < groups.length - 1
          ? (last.lines[4] + groups[i + 1].staffs[0].lines[0]) / 2
          : last.lines[4] + spacing * 5.5;
      return {
        ...system,
        rect: normalizeCropRect(
          { ...system.rect, y: top, height: bottom - top },
          layout.width,
          layout.height,
        ),
      };
    }),
  };
}

export function rankCandidates(songs) {
  const seen = new Set();
  return songs
    .filter((s) => s?.id && s.name && Number.isFinite(s.pop))
    .sort(
      (a, b) =>
        b.pop - a.pop ||
        b.playlistOccurrences - a.playlistOccurrences ||
        b.playlistWeight - a.playlistWeight ||
        String(a.id).localeCompare(String(b.id)),
    )
    .filter((s) => {
      const key = canonicalTitle(s.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((s, i) => ({ ...s, candidateRank: i + 1 }));
}

const writeQueues = new Map();
export async function atomicJson(path, data) {
  const bytes = JSON.stringify(data, null, 2) + "\n";
  const task = (writeQueues.get(path) || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
      const tmp = path + "." + randomUUID() + ".tmp";
      await writeFile(tmp, bytes, { mode: 0o600 });
      await rename(tmp, path);
    });
  writeQueues.set(path, task);
  try {
    await task;
  } finally {
    if (writeQueues.get(path) === task) writeQueues.delete(path);
  }
}

const read = (path) => readFile(path, "utf8").then(JSON.parse);
const processAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (e.code === "ESRCH") return false;
    return true;
  }
};
export async function withRunLease(root, work, name = "run") {
  const path = join(root, name + "-owner.json"),
    owner = {
      pid: process.pid,
      nonce: randomUUID(),
      startedAt: new Date().toISOString(),
    };
  await mkdir(root, { recursive: true, mode: 0o700 });
  // Serialize stale-owner reclamation too. Otherwise two resumptions could
  // both unlink the dead owner, with one accidentally unlinking the new owner.
  const claim = join(root, name + "-owner-claim.json");
  try {
    await writeFile(claim, JSON.stringify(owner), { flag: "wx", mode: 0o600 });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    throw Object.assign(Error("另一个进程正在取得运行锁；保留现场后重试"), {
      code: "BATCH_ALREADY_RUNNING",
      public: true,
    });
  }
  try {
    const prior = await read(path).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    if (prior) {
      if (
        !Number.isSafeInteger(prior.pid) ||
        prior.pid < 1 ||
        processAlive(prior.pid)
      )
        throw Object.assign(Error("本批次已有识谱进程，不能重复启动"), {
          code: "BATCH_ALREADY_RUNNING",
          public: true,
        });
      await rm(path);
    }
    await writeFile(path, JSON.stringify(owner), { flag: "wx", mode: 0o600 });
  } finally {
    await rm(claim);
  }
  try {
    return await work();
  } finally {
    const current = await read(path).catch(() => null);
    if (current?.nonce === owner.nonce) await rm(path);
  }
}
const safeError = (e) => ({
  code: e.code || "FAILED",
  message: e.public || e.expose ? e.message : "请求未完成；原始成果保留",
});
async function mapLimit(items, limit, fn) {
  let cursor = 0;
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) await fn(items[cursor++]);
    }),
  );
  const failure = results.find((r) => r.status === "rejected");
  if (failure) throw failure.reason;
}

export async function discover(root, target = 100) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const session = await createNeteaseSessionStore().read();
  const sdk = (method, input = {}) =>
    callNeteaseSdk(method, { ...input, cookie: session.cookie });
  const login = (await sdk("login_status")).body;
  if (!(login.data?.profile?.userId || login.profile?.userId))
    throw Object.assign(Error("网易云登录失效"), {
      code: "NETEASE_LOGIN_REQUIRED",
      public: true,
    });
  let candidates = await read(join(root, "candidates.json")).catch(() => null);
  if (!candidates) {
    const lists = new Map();
    for (const keywords of ["纯音乐", "纯音乐排行榜", "经典纯音乐"]) {
      const body = (await sdk("search", { keywords, type: 1000, limit: 100 }))
        .body;
      await atomicJson(join(root, `search-${keywords}.json`), body);
      for (const p of body.result?.playlists || [])
        if (
          /纯音乐/.test(p.name) &&
          !/[&＆]|英文|由歌曲改编|vlog|BGM|萨克斯|古筝|二胡|吉他|胎教|催眠/.test(
            p.name,
          )
        )
          lists.set(String(p.id), p);
    }
    const selected = [...lists.values()]
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 12);
    const songs = new Map();
    for (const p of selected) {
      const cache = join(root, `playlist-${p.id}.json`);
      let body = await read(cache).catch(() => null);
      if (!body) {
        body = (await sdk("playlist_detail", { id: p.id })).body;
        await atomicJson(cache, body);
      }
      const playlist = body.playlist;
      if (!playlist?.trackIds) throw Error("歌单返回缺少歌曲ID清单");
      for (const t of playlist.trackIds) {
        const s = songs.get(t.id) || {
          id: t.id,
          playlists: [],
          playlistOccurrences: 0,
          playlistWeight: 0,
        };
        s.playlists.push(p.id);
        s.playlistOccurrences++;
        s.playlistWeight += p.playCount;
        songs.set(t.id, s);
      }
    }
    const ids = [...songs.keys()];
    for (let i = 0; i < ids.length; i += 300) {
      const body = (
        await sdk("song_detail", { ids: ids.slice(i, i + 300).join(",") })
      ).body;
      await atomicJson(join(root, `song-details-${i}.json`), body);
      for (const s of body.songs || [])
        Object.assign(songs.get(s.id), {
          name: s.name,
          artists: s.ar?.map((a) => a.name) || [],
          album: s.al?.name,
          pop: s.pop,
          alia: s.alia || [],
          songUrl: `https://music.163.com/#/song?id=${s.id}`,
        });
    }
    candidates = {
      at: new Date().toISOString(),
      method:
        "高播放量纯音乐歌单候选池，歌曲pop降序、歌单出现次数和累计歌单播放量作为同分排序；按曲名去重。不是网易云官方纯音乐百强榜。",
      playlists: selected.map((p) => ({
        id: p.id,
        name: p.name,
        playCount: p.playCount,
        url: `https://music.163.com/#/playlist?id=${p.id}`,
      })),
      songs: rankCandidates([...songs.values()]),
    };
    await atomicJson(join(root, "candidates.json"), candidates);
    console.log(
      JSON.stringify({
        stage: "candidates",
        songs: candidates.songs.length,
        playlists: selected.length,
        top: candidates.songs
          .slice(0, 12)
          .map((s) => ({ name: s.name, pop: s.pop })),
      }),
    );
  }
  const provider = createNeteaseScoreProvider(),
    scope = "popular-piano-20261029";
  const discovery = await read(join(root, "discovery.json")).catch(() => ({
    at: new Date().toISOString(),
    method: candidates.method,
    target,
    selected: [],
    excluded: [],
  }));
  const compositions = new Set();
  discovery.selected = discovery.selected
    .filter((s) => {
      const key = compositionKey(s);
      if (compositions.has(key)) {
        discovery.excluded.push({
          ...s,
          reason: "TRANSLATED_COMPOSITION_DUPLICATE",
        });
        return false;
      }
      compositions.add(key);
      return true;
    })
    .map((s, i) => ({ ...s, rank: i + 1 }));
  const visited = new Set(
    [...discovery.selected, ...discovery.excluded].map((s) => String(s.id)),
  );
  const sheets = new Set(discovery.selected.map((s) => s.sheetId));
  try {
    for (const song of candidates.songs) {
      if (discovery.selected.length >= target) break;
      if (visited.has(String(song.id))) continue;
      if (compositions.has(compositionKey(song))) {
        discovery.excluded.push({
          ...song,
          reason: "TRANSLATED_COMPOSITION_DUPLICATE",
        });
        await atomicJson(join(root, "discovery.json"), discovery);
        continue;
      }
      try {
        const list = await provider.resolveShare(song.songUrl, scope);
        await atomicJson(
          join(root, "songs", String(song.id), "sheets.json"),
          list,
        );
        // Prefer an explicit piano arrangement and a matching title. Sheet IDs
        // are also deduplicated so aliases cannot import the same score twice.
        const choices = (list.sheets || []).filter(
          (s) =>
            s.pianoEvidence &&
            !sheets.has(s.id) &&
            !/四手|双钢琴|总谱|合奏|伴奏|简谱|吉他|声乐/.test(s.title),
        );
        const match =
          choices.find((s) =>
            canonicalTitle(s.title).includes(canonicalTitle(song.name)),
          ) || choices[0];
        if (!match)
          discovery.excluded.push({ ...song, reason: "NO_PIANO_SHEET" });
        else {
          sheets.add(match.id);
          compositions.add(compositionKey(song));
          discovery.selected.push({
            ...song,
            rank: discovery.selected.length + 1,
            sheetId: match.id,
            sheetTitle: match.title,
            listedPages: match.pages,
            sheetUrl: `https://music.163.com/st/h5-music-score-v2/detail/index.html?musicSheetId=${match.id}`,
          });
          console.log(
            JSON.stringify({
              stage: "selected",
              n: discovery.selected.length,
              name: song.name,
              sheet: match.id,
              pages: match.pages,
            }),
          );
        }
      } catch (e) {
        if (["NETEASE_LOGIN_REQUIRED", "MODEL_RATE_LIMIT"].includes(e.code))
          throw e;
        discovery.excluded.push({
          ...song,
          reason: "SOURCE_ERROR",
          error: safeError(e),
        });
      }
      await atomicJson(join(root, "discovery.json"), discovery);
    }
  } finally {
    provider.close();
  }
  return discovery;
}

export async function prepare(root) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const { detectScoreSystems } = await import("../lib/score-image-layout.mjs");
  const { mergeScorePages } = await import("../lib/netease-scores.mjs");
  const { createHash } = await import("node:crypto");
  const discovery = await read(join(root, "discovery.json"));
  const sourceChoices = await read(join(root, "source-choices.json")).catch(
    () => ({}),
  );
  const existingJobs = await read(join(root, "private-run.json")).catch(() => ({
    jobs: [],
  }));
  const inUse = new Set(existingJobs.jobs.map((j) => j.sheetId));
  const prepareOne = async (song) => {
    const dir = join(root, "scores", song.sheetId);
    const existing = await read(join(dir, "prepared.json")).catch(() => null);
    if (
      existing &&
      (!existing.geometryReady ||
        existing.cropVersion === "midpoint-v2" ||
        inUse.has(song.sheetId))
    )
      return existing;
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const provider = createNeteaseScoreProvider(),
      scope = "prepare-" + song.sheetId;
    try {
      await provider.resolveShare(song.songUrl, scope);
      const preview = await provider.preview(
        song.sheetId,
        song.sheetUrl,
        scope,
      );
      await atomicJson(join(dir, "preview.json"), preview);
      if (
        preview.integrity.status !== "complete" ||
        song.listedPages !== preview.pages.length
      )
        throw Object.assign(Error("来源缺少可信完整页数或页数不符"), {
          code: "SOURCE_PAGE_COUNT",
          public: true,
        });
      const images = [],
        regions = [],
        pages = [],
        problems = [];
      for (const page of preview.pages) {
        const path = join(dir, `page-${page.number}.source`);
        let image;
        try {
          const bytes = await readFile(path);
          image = {
            buffer: bytes,
            mimeType:
              bytes[0] === 137
                ? "image/png"
                : bytes[0] === 255
                  ? "image/jpeg"
                  : "image/webp",
          };
        } catch {
          for (let attempt = 0; attempt < 3; attempt++)
            try {
              image = await provider.image(preview.id, page.number, scope);
              break;
            } catch (e) {
              if (attempt === 2) throw e;
            }
          await writeFile(path, image.buffer, { mode: 0o600 });
        }
        images.push(image);
        const im = await loadImage(image.buffer),
          canvas = createCanvas(im.width, im.height),
          ctx = canvas.getContext("2d");
        ctx.drawImage(im, 0, 0);
        const png = await canvas.encode("png"),
          file = `page-${String(page.number).padStart(3, "0")}.png`;
        await writeFile(join(dir, file), png, { mode: 0o600 });
        const layout = expandSystemCrops(
          detectScoreSystems(ctx.getImageData(0, 0, im.width, im.height), {
            pianoSourceVerified: true,
            sourceLabel: song.sheetTitle,
          }),
        );
        await atomicJson(join(dir, `layout-${page.number}.json`), layout);
        if (
          !layout.assessment.canAutoRecognize ||
          layout.systems.some((s) => s.staffs.length !== 2)
        )
          problems.push({
            page: page.number,
            code: layout.assessment.reasonCode,
            systems: layout.systems.map((s) => s.staffs.length),
          });
        // A bad first page is sufficient to try another arrangement. Keep the
        // downloaded evidence; do not spend time fetching the rest of a jianpu.
        if (page.number === 1 && problems.length)
          throw Object.assign(
            Error("首谱页不是可自动处理的完整钢琴双谱表，尝试其他编配版本"),
            { code: "ALTERNATE_ARRANGEMENT_REQUIRED", public: true },
          );
        pages.push({
          page: page.number,
          file,
          sha256: createHash("sha256").update(png).digest("hex"),
          width: im.width,
          height: im.height,
          source: 1,
          sourcePage: page.number,
        });
        for (const [i, system] of layout.systems.entries()) {
          const rect = system.rect,
            id = `p${page.number}-s${i + 1}`,
            crop = createCanvas(Math.ceil(rect.width), Math.ceil(rect.height));
          crop
            .getContext("2d")
            .drawImage(
              canvas,
              rect.x,
              rect.y,
              rect.width,
              rect.height,
              0,
              0,
              crop.width,
              crop.height,
            );
          await writeFile(join(dir, id + ".png"), await crop.encode("png"), {
            mode: 0o600,
          });
          regions.push({
            id,
            page: page.number,
            system: i + 1,
            rect,
            pageWidth: im.width,
            pageHeight: im.height,
            imagePath: join(dir, id + ".png"),
            context:
              "忠实读取本行全部双手谱表，不能凭曲名补写。首行和来源上下文读取谱号、调号、拍号及速度；未知速度保持未知。后续变化按原图。保留原谱拼写、休止、独立声部、连音、临时升降和八度变化。",
          });
        }
      }
      if (new Set(pages.map((p) => p.sha256)).size !== pages.length)
        throw Object.assign(Error("来源存在重复谱页"), {
          code: "DUPLICATE_PAGES",
          public: true,
        });
      await atomicJson(join(dir, "page-manifest.json"), {
        schema: "piano-score-pages/v1",
        dpi: null,
        sources: [{ file: song.sheetUrl, kind: "original-images" }],
        pages,
      });
      const pdf = await mergeScorePages(images);
      await writeFile(join(dir, "original.pdf"), pdf, { mode: 0o600 });
      const prepared = {
        ...song,
        pages: pages.length,
        rows: regions.length,
        regions,
        problems,
        geometryReady: problems.length === 0,
        cropVersion: "midpoint-v2",
        sourceComplete: "source-page-count",
        preparedAt: new Date().toISOString(),
      };
      await atomicJson(join(dir, "prepared.json"), prepared);
      console.log(
        JSON.stringify({
          stage: "prepared",
          name: song.name,
          sheet: song.sheetId,
          pages: pages.length,
          rows: regions.length,
          problems,
        }),
      );
      return prepared;
    } catch (e) {
      await atomicJson(join(dir, "error.json"), safeError(e));
      console.log(
        JSON.stringify({
          stage: "prepare-error",
          name: song.name,
          ...safeError(e),
        }),
      );
    } finally {
      provider.close();
    }
  };
  await mapLimit(discovery.selected, 3, async (original) => {
    const chosen = sourceChoices[original.id];
    if (chosen) {
      const p = await read(
        join(root, "scores", chosen.sheetId, "prepared.json"),
      ).catch(() => null);
      if (
        p?.geometryReady &&
        (p.cropVersion === "midpoint-v2" || inUse.has(chosen.sheetId))
      )
        return;
    }
    const list = await read(
      join(root, "songs", String(original.id), "sheets.json"),
    );
    const alternatives = (list.sheets || [])
      .filter(
        (s) =>
          s.pianoEvidence &&
          s.id !== original.sheetId &&
          !/四手|双钢琴|总谱|合奏|伴奏|简谱|吉他|声乐/.test(s.title),
      )
      .slice(0, 6);
    const options = [
      original,
      ...alternatives.map((s) => ({
        ...original,
        sheetId: s.id,
        sheetTitle: s.title,
        listedPages: s.pages,
        sheetUrl: `https://music.163.com/st/h5-music-score-v2/detail/index.html?musicSheetId=${s.id}`,
      })),
    ];
    for (const song of options) {
      const p = await prepareOne(song);
      if (p?.geometryReady) {
        sourceChoices[original.id] = song;
        await atomicJson(join(root, "source-choices.json"), sourceChoices);
        break;
      }
    }
  });
  // Each first page remains readable in a separate contact sheet; all full-size
  // pages and layout reports are retained for source/scope review.
  const prepared = [];
  for (const original of discovery.selected) {
    const s = sourceChoices[original.id] || original,
      p = await read(join(root, "scores", s.sheetId, "prepared.json")).catch(
        () => null,
      );
    if (p) prepared.push(p);
  }
  for (let i = 0; i < prepared.length; i += 8) {
    const group = prepared.slice(i, i + 8),
      c = createCanvas(2400, 1800),
      ctx = c.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, c.width, c.height);
    for (const [j, s] of group.entries()) {
      const im = await loadImage(
          await readFile(join(root, "scores", s.sheetId, "page-001.png")),
        ),
        x = (j % 4) * 600,
        y = Math.floor(j / 4) * 900;
      ctx.drawImage(im, x, y, 600, 840);
      ctx.fillStyle = "black";
      ctx.font = "20px sans-serif";
      ctx.fillText(`${s.rank}. ${s.name} / ${s.sheetId}`, x + 8, y + 870, 580);
    }
    await writeFile(
      join(root, `contact-${i / 8 + 1}.jpg`),
      await c.encode("jpeg", 85),
      { mode: 0o600 },
    );
  }
  await atomicJson(join(root, "preparation.json"), {
    at: new Date().toISOString(),
    prepared: prepared.length,
    ready: prepared.filter((p) => p.geometryReady).length,
    scores: prepared.map(({ regions, ...s }) => s),
  });
}

export async function run(root) {
  const { createFullScoreJobStore } =
    await import("../lib/full-score-jobs.mjs");
  const { createSettingsStore } = await import("../lib/settings.mjs");
  const { createLibraryStore } = await import("../lib/library-store.mjs");
  const { generateScoreRegion } = await import("../lib/ai.mjs");
  const { SCORE_RECOGNITION } = await import("../lib/recognition-policy.mjs");
  const settings = createSettingsStore(),
    library = createLibraryStore();
  const discovery = await read(join(root, "discovery.json"));
  const sourceChoices = await read(join(root, "source-choices.json")).catch(
    () => ({}),
  );
  discovery.selected = discovery.selected.map((s) => ({
    ...s,
    ...sourceChoices[s.id],
    rank: s.rank,
  }));
  const state = await read(join(root, "private-run.json")).catch(() => ({
    startedAt: new Date().toISOString(),
    jobs: [],
    imports: [],
  }));
  let stopped = null,
    active = 0,
    peak = 0;
  const adapter = async (request, options) => {
    if (stopped)
      throw Object.assign(Error("供应商限额或认证阻塞；保留进度"), {
        code: stopped,
        public: true,
      });
    active++;
    peak = Math.max(peak, active);
    try {
      return await generateScoreRegion(request, await settings.read(), options);
    } catch (e) {
      if (
        [
          "MODEL_RATE_LIMIT",
          "MODEL_BALANCE_REQUIRED",
          "PI_NOT_CONNECTED",
          "PI_AUTH_REQUIRED",
        ].includes(e.code)
      )
        stopped = e.code;
      throw e;
    } finally {
      active--;
    }
  };
  const store = createFullScoreJobStore({
    maxConcurrency: 16,
    recognizeRegion: adapter,
  });
  const save = () => atomicJson(join(root, "private-run.json"), state);
  const progress = async () => {
    const jobs = [];
    for (const j of state.jobs) {
      const s = await store.getJob(j.id, j);
      jobs.push({
        sheetId: j.sheetId,
        title: j.title,
        status: s.status,
        ...s.progress,
        errors: s.regions
          .filter((r) => r.error || r.result?.checks?.passed === false)
          .map((r) => ({
            id: r.id,
            error: r.error,
            issues: r.result?.checks?.errors,
          })),
        calls: s.calls,
      });
    }
    await atomicJson(join(root, "progress.json"), {
      at: new Date().toISOString(),
      model: SCORE_RECOGNITION.model,
      reasoningEffort: SCORE_RECOGNITION.reasoningEffort,
      stopped,
      active,
      peak,
      jobs,
      imports: state.imports,
    });
  };
  const timer = setInterval(() => progress().catch(() => {}), 15000);
  try {
    // Four score workers share one physical model gate. Successful rows persist
    // in the standard job store and are never reissued by resume.
    await mapLimit(discovery.selected, 4, async (song) => {
      if (
        stopped ||
        state.imports.some((i) => i.sheetId === song.sheetId && i.imported)
      )
        return;
      const dir = join(root, "scores", song.sheetId),
        prepared = await read(join(dir, "prepared.json")).catch(() => null);
      if (!prepared?.geometryReady) return;
      let j = state.jobs.find((j) => j.sheetId === song.sheetId);
      if (!j) {
        const regions = [];
        for (const r of prepared.regions) {
          const { imagePath, ...region } = r;
          regions.push({
            ...region,
            image: {
              mimeType: "image/png",
              data: (await readFile(imagePath)).toString("base64"),
            },
          });
        }
        const created = await store.createJob({
          title: song.name,
          composer: song.artists.join(" / "),
          totalPages: prepared.pages,
          regions,
          engine: "pi",
          needsUserScopeConfirmation: true,
          recognitionPlan: { maxCalls: 2, recover: true, review: "off" },
          source: {
            label:
              "网易云钢琴谱；按来源页数下载；自动范围检测；AI草稿待原图校对",
            url: song.sheetUrl,
          },
          originalPdf: {
            name: song.name + ".pdf",
            mimeType: "application/pdf",
            buffer: await readFile(join(dir, "original.pdf")),
          },
        });
        j = {
          sheetId: song.sheetId,
          title: song.name,
          id: created.id,
          token: created.token,
        };
        state.jobs.push(j);
        await save();
      }
      console.log(
        JSON.stringify({
          stage: "recognizing",
          name: song.name,
          rows: prepared.rows,
          model: SCORE_RECOGNITION.model,
          effort: SCORE_RECOGNITION.reasoningEffort,
        }),
      );
      const before = await store.getJob(j.id, j);
      const regionIds = before.regions
        .filter((r) => !r.result && r.attempts < 2)
        .map((r) => r.id);
      if (regionIds.length) await store.startJob(j.id, { ...j, regionIds });
      let job = await store.waitForIdle(j.id, j);
      const invalid = job.regions
        .filter(
          (r) =>
            r.result && r.result.checks?.passed === false && r.attempts < 2,
        )
        .map((r) => r.id);
      if (!stopped && invalid.length) {
        await store.retryRegions(j.id, j, { regionIds: invalid });
        job = await store.waitForIdle(j.id, j);
      }
      await progress();
      if (stopped) return;
      await atomicJson(join(dir, "recognition-job.json"), job);
      if (
        job.regions.some(
          (r) =>
            !r.result ||
            r.result.coverage?.complete !== true ||
            !r.result.checks?.passed,
        )
      ) {
        console.log(
          JSON.stringify({
            stage: "needs-review",
            name: song.name,
            ...job.progress,
          }),
        );
        return;
      }
      try {
        const draft = await store.exportDraft(j.id, j, {
            scopeConfirmed: true,
          }),
          result = draft.result;
        if (!result.checks.passed)
          throw Object.assign(Error("跨行延音/节奏检查有疑点"), {
            code: "CONTINUITY_REVIEW",
            public: true,
          });
        const id = "netease-popular-20261029-" + song.sheetId;
        // A successful write before a crash is discovered on resume. Existing
        // versions are kept intact, including any later user edits.
        let saved = await library.get(id).catch((e) => {
          if (e.code === "LIBRARY_NOT_FOUND") return null;
          throw e;
        });
        if (!saved) {
          const assets = [];
          for (const r of prepared.regions)
            assets.push({
              id: r.id,
              page: r.page,
              system: r.system,
              mimeType: "image/png",
              data: (await readFile(r.imagePath)).toString("base64"),
            });
          saved = await library.save({
            score: {
              ...result.score,
              id,
              title: song.name + " · AI草稿待校对",
              source: {
                ...result.score.source,
                url: song.sheetUrl,
                reviewRequired: true,
              },
            },
            sourceNotation: result.sourceNotation,
            assets,
            originalFile: {
              name: song.name + ".pdf",
              mimeType: "application/pdf",
              data: (await readFile(join(dir, "original.pdf"))).toString(
                "base64",
              ),
            },
            warnings: [
              ...result.warnings,
              "页数由来源核验；谱行范围由自动检测，尚未逐小节人工确认。",
              "未声称忠实识别准确率或全符号保留。",
            ],
            reviewStatus: {
              humanConfirmed: false,
              method: "ai-draft",
              model: SCORE_RECOGNITION.model,
            },
          });
        }
        const actual = await library.get(id);
        if (
          actual.score.notes.length !== saved.score.notes.length ||
          !actual.originalFile ||
          !actual.sourceNotation
        )
          throw Error("曲库原谱/音符读回不一致");
        const imported = {
          sheetId: song.sheetId,
          imported: true,
          id,
          notes: actual.score.notes.length,
          pages: prepared.pages,
          rows: prepared.rows,
          at: new Date().toISOString(),
          reviewStatus: "ai-draft-not-human-confirmed",
        };
        state.imports = state.imports.filter((i) => i.sheetId !== song.sheetId);
        state.imports.push(imported);
        await save();
        await atomicJson(join(dir, "export.json"), result);
        console.log(
          JSON.stringify({ stage: "imported", name: song.name, ...imported }),
        );
      } catch (e) {
        await atomicJson(join(dir, "import-error.json"), safeError(e));
        console.log(
          JSON.stringify({
            stage: "import-error",
            name: song.name,
            ...safeError(e),
          }),
        );
      }
    });
  } finally {
    clearInterval(timer);
    await progress();
    state.endedAt = new Date().toISOString();
    state.stopped = stopped;
    await save();
    await store.close();
  }
}

export async function artifacts(root) {
  const { recognitionTranscription } =
    await import("../lib/recognition-transcription.mjs");
  const skill = resolve(
    process.env.QINBAN_SCORE_SKILL_DIR ||
      join(homedir(), ".codex/skills/piano-score-to-musicxml"),
  );
  const { build } = await import(
    pathToFileURL(join(skill, "scripts/score_pipeline.mjs"))
  );
  const state = await read(join(root, "private-run.json")),
    results = [];
  for (const item of state.imports.filter((i) => i.imported)) {
    const dir = join(root, "scores", item.sheetId),
      entry = state.jobs.find((j) => j.sheetId === item.sheetId);
    try {
      const job = await read(
        resolve(".local/full-score-jobs", entry.id, "job.json"),
      );
      if (job.status === "running") throw Error("识别仍在运行，不能导出");
      const manifest = await read(join(dir, "page-manifest.json"));
      const transcription = recognitionTranscription(job, manifest);
      transcription.provenance = {
        ...transcription.provenance,
        model: "gpt-6.1-sol",
        reasoning: "high",
        calls: job.regions.flatMap((r) =>
          (r.recognitionAttempts || [])
            .filter((a) => a.stage === "provider-turn")
            .map((a) => ({
              region: r.id,
              runVersion: a.runVersion,
              at: a.recordedAt,
              usage: a.usage
                ? {
                    inputTokens: a.usage.input,
                    outputTokens: a.usage.output,
                    cachedInputTokens: a.usage.cacheRead,
                    cacheWriteTokens: a.usage.cacheWrite,
                    reasoningTokens: a.usage.reasoning,
                    totalTokens: a.usage.totalTokens,
                  }
                : null,
            })),
        ),
      };
      const input = join(dir, "transcription.json");
      // Keep an unchanged input byte-for-byte so completed artifact sets can
      // resume without invalidating their fingerprints.
      const existing = await read(input).catch(() => null);
      const complete = await read(
        join(dir, "skill-result", "artifact-manifest.json"),
      ).catch(() => null);
      if (
        !existing ||
        (!complete &&
          JSON.stringify(existing) !== JSON.stringify(transcription))
      ) {
        if (existing)
          await writeFile(
            input + ".before-bridge-fix.json",
            JSON.stringify(existing, null, 2),
            { mode: 0o600, flag: "wx" },
          ).catch((e) => {
            if (e.code !== "EEXIST") throw e;
          });
        await atomicJson(input, transcription);
      }
      const report = await build(
        input,
        join(dir, "page-manifest.json"),
        join(dir, "skill-result"),
        { draft: true, render: true, resume: true },
      );
      results.push({
        sheetId: item.sheetId,
        status: report.status,
        measures: report.measures,
        engravedPages: report.engravedPages,
      });
    } catch (e) {
      results.push({
        sheetId: item.sheetId,
        status: "blocked",
        message: e.message,
      });
    }
    await atomicJson(join(root, "skill-results.json"), results);
  }
  console.log(JSON.stringify({ stage: "artifacts", results }));
}

export async function repair(root) {
  const { createFullScoreJobStore } =
    await import("../lib/full-score-jobs.mjs");
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const { detectScoreSystems } = await import("../lib/score-image-layout.mjs");
  const state = await read(join(root, "private-run.json")),
    store = createFullScoreJobStore(),
    repairs = [];
  try {
    for (const j of state.jobs) {
      // Do not load a live job into a second store: loading a running record
      // is restart recovery and would otherwise pause its owning process.
      const persisted = await read(
        resolve(".local/full-score-jobs", j.id, "job.json"),
      );
      if (persisted.status === "running") continue;
      const job = await store.getJob(j.id, j),
        dir = join(root, "scores", j.sheetId);
      const prepared = await read(join(dir, "prepared.json"));
      for (const r of job.regions.filter(
        (r) =>
          r.status === "failed" &&
          r.error?.code === "NEEDS_SOURCE" &&
          !r.sourceHistory?.length,
      )) {
        const im = await loadImage(
            await readFile(
              join(dir, `page-${String(r.page).padStart(3, "0")}.png`),
            ),
          ),
          page = createCanvas(im.width, im.height),
          ctx = page.getContext("2d");
        ctx.drawImage(im, 0, 0);
        const layout = expandSystemCrops(
          detectScoreSystems(ctx.getImageData(0, 0, im.width, im.height), {
            pianoSourceVerified: true,
          }),
        );
        if (
          layout.systems.length !==
            job.regions.filter((x) => x.page === r.page).length ||
          layout.systems.some((s) => s.staffs.length !== 2)
        )
          continue;
        const rect = layout.systems[r.system - 1].rect;
        if (
          rect.y >= r.rect.y &&
          rect.y + rect.height <= r.rect.y + r.rect.height
        )
          continue;
        const crop = createCanvas(rect.width, rect.height);
        crop
          .getContext("2d")
          .drawImage(
            page,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            0,
            0,
            crop.width,
            crop.height,
          );
        const bytes = await crop.encode("png"),
          record = prepared.regions.find((x) => x.id === r.id);
        await writeFile(
          record.imagePath + ".before-recrop.png",
          await readFile(record.imagePath),
          { mode: 0o600 },
        );
        await store.uploadRegion(
          j.id,
          r.id,
          {
            image: { mimeType: "image/png", data: bytes.toString("base64") },
            rect,
            pageWidth: im.width,
            pageHeight: im.height,
          },
          j,
        );
        await writeFile(record.imagePath, bytes, { mode: 0o600 });
        Object.assign(record, {
          rect,
          pageWidth: im.width,
          pageHeight: im.height,
        });
        repairs.push({
          sheetId: j.sheetId,
          region: r.id,
          oldRect: r.rect,
          newRect: rect,
          reason: r.error.message,
        });
      }
      await atomicJson(join(dir, "prepared.json"), prepared);
    }
  } finally {
    await store.close();
  }
  await atomicJson(join(root, "source-repairs.json"), repairs);
  console.log(
    JSON.stringify({ stage: "source-repairs", count: repairs.length, repairs }),
  );
}

export async function report(root) {
  const discovery = await read(join(root, "discovery.json"));
  const choices = await read(join(root, "source-choices.json")).catch(
    () => ({}),
  );
  const state = await read(join(root, "private-run.json")).catch(() => ({
    jobs: [],
    imports: [],
  }));
  const entries = [];
  for (const original of discovery.selected) {
    const song = { ...original, ...choices[original.id], rank: original.rank };
    const p = await read(
      join(root, "scores", song.sheetId, "prepared.json"),
    ).catch(() => null);
    const j = state.jobs.find((j) => j.sheetId === song.sheetId);
    const job = j
      ? await read(resolve(".local/full-score-jobs", j.id, "job.json"))
      : null;
    const imported = state.imports.find(
      (i) => i.sheetId === song.sheetId && i.imported,
    );
    const errors =
      job?.regions
        .filter((r) => r.error || r.result?.checks?.passed === false)
        .map((r) => ({
          region: r.id,
          error: r.error,
          issues: r.result?.checks?.errors,
        })) || [];
    entries.push({
      rank: song.rank,
      name: song.name,
      artists: song.artists,
      pop: song.pop,
      candidateRank: song.candidateRank,
      songUrl: song.songUrl,
      sheetId: song.sheetId,
      sheetUrl: song.sheetUrl,
      pages: p?.pages || song.listedPages,
      rows: p?.rows || null,
      geometryReady: p?.geometryReady || false,
      jobStatus: job?.status || null,
      recognizedRows: job?.regions.filter((r) => r.result).length || 0,
      totalRows: job?.regions.length || p?.rows || null,
      imported: Boolean(imported),
      libraryId: imported?.id || null,
      errors,
    });
  }
  const summary = {
    at: new Date().toISOString(),
    method: discovery.method,
    target: 100,
    links: entries.length,
    prepared: entries.filter((s) => s.geometryReady).length,
    recognizedRows: entries.reduce((n, s) => n + s.recognizedRows, 0),
    totalRows: entries.reduce((n, s) => n + (s.totalRows || 0), 0),
    imported: entries.filter((s) => s.imported).length,
    stopped: state.stopped || null,
    reviewStatus: "AI草稿，未经人工逐音确认",
    entries,
    excluded: discovery.excluded,
  };
  await atomicJson(join(root, "report.json"), summary);
  const escape = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const rows = entries
    .map(
      (s) =>
        `<tr><td>${s.rank}</td><td>${escape(s.name)}<small>${escape(s.artists.join(" / "))}</small></td><td><a href="${escape(s.songUrl)}">歌曲</a> · <a href="${escape(s.sheetUrl)}">钢琴谱 ${s.sheetId}</a></td><td>${s.pages || "?"}页 / ${s.totalRows || "?"}行</td><td>${s.imported ? "已导入 · AI草稿" : s.jobStatus === "running" ? "识别中" : s.errors.length ? "待核对" : s.geometryReady ? "已准备原谱" : "待处理原谱"}</td><td>${s.recognizedRows}/${s.totalRows || "?"}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>热门纯音乐100首 · 网易云钢琴谱导入</title><style>body{font:15px/1.6 system-ui;margin:40px auto;max-width:1200px;padding:0 24px;color:#17283b;background:#f5f7fa}h1{font-size:30px}small{display:block;color:#657286}table{border-collapse:collapse;background:white;width:100%;border-radius:12px}td,th{padding:12px;text-align:left;border-bottom:1px solid #e5ebf1}a{color:#235baf}p{max-width:1000px}.stats{font-size:20px;font-weight:600}</style><h1>热门纯音乐100首 · 钢琴谱链接与导入记录</h1><p class="stats">链接 ${summary.links} / 100 · 原谱准备 ${summary.prepared} · 已识别 ${summary.recognizedRows} 行 · 曲库读回 ${summary.imported} 首</p><p>${escape(summary.method)}</p><p>已导入版本均为AI草稿，保留原谱及不确定项；结构通过与可播放不代表原谱准确率。更新时间：${escape(summary.at)}。</p><table><thead><tr><th>序号</th><th>作品</th><th>原站链接</th><th>范围</th><th>状态</th><th>已识别行</th></tr></thead><tbody>${rows}</tbody></table>`;
  await writeFile(join(root, "report.html"), html, { mode: 0o600 });
  console.log(
    JSON.stringify({
      stage: "report",
      links: summary.links,
      prepared: summary.prepared,
      recognizedRows: summary.recognizedRows,
      imported: summary.imported,
      stopped: summary.stopped,
    }),
  );
  return summary;
}

export async function pipeline(root) {
  console.log(JSON.stringify({ stage: "pipeline-wait", root }));
  while (true) {
    const owner = await read(join(root, "run-owner.json")).catch(() => null);
    if (!owner || !processAlive(owner.pid)) break;
    await new Promise((r) => setTimeout(r, 30000));
  }
  for (let pass = 0; pass < 4; pass++) {
    await withRunLease(
      root,
      async () => {
        await reconcile(root);
        await prepare(root);
      },
      "prepare",
    );
    const ready = await report(root);
    if (ready.prepared === 100) break;
    await withRunLease(root, () => backfill(root), "prepare");
  }
  for (let pass = 0; pass < 2; pass++) {
    await repair(root);
    await withRunLease(root, () => run(root));
    const state = await read(join(root, "private-run.json"));
    if (state.stopped) break;
  }
  await artifacts(root);
  const summary = await report(root);
  await atomicJson(join(root, "pipeline-status.json"), {
    at: new Date().toISOString(),
    status: summary.imported === 100 ? "complete" : "needs-attention",
    links: summary.links,
    prepared: summary.prepared,
    imported: summary.imported,
    stopped: summary.stopped,
  });
}

export async function reconcile(root) {
  const discovery = await read(join(root, "discovery.json"));
  const choices = await read(join(root, "source-choices.json")).catch(
    () => ({}),
  );
  const prepared = [];
  for (const dir of await readdir(join(root, "scores"))) {
    const p = await read(join(root, "scores", dir, "prepared.json")).catch(
      () => null,
    );
    if (p?.geometryReady) prepared.push(p);
  }
  let recovered = 0;
  for (const s of discovery.selected) {
    const selected = prepared.find((p) => p.sheetId === choices[s.id]?.sheetId);
    if (selected) continue;
    const p = prepared.find((p) => p.id === s.id);
    if (!p) continue;
    const { regions, problems, ...source } = p;
    choices[s.id] = source;
    recovered++;
  }
  await atomicJson(join(root, "source-choices.json"), choices);
  console.log(JSON.stringify({ stage: "reconcile-sources", recovered }));
}

export async function backfill(root) {
  const summary = await report(root),
    discovery = await read(join(root, "discovery.json"));
  const state = await read(join(root, "private-run.json")).catch(() => ({
    jobs: [],
  }));
  const remove = new Set();
  for (const s of summary.entries) {
    if (s.geometryReady || state.jobs.some((j) => j.sheetId === s.sheetId))
      continue;
    const dir = join(root, "scores", s.sheetId);
    const attempted =
      (await read(join(dir, "error.json")).catch(() => null)) ||
      (await read(join(dir, "prepared.json")).catch(() => null));
    if (attempted) remove.add(s.rank);
  }
  const excluded = discovery.selected.filter((s) => remove.has(s.rank));
  if (excluded.length) {
    await atomicJson(
      join(root, "discovery-before-backfill-" + randomUUID() + ".json"),
      discovery,
    );
    discovery.excluded.push(
      ...excluded.map((s) => ({
        ...s,
        reason: "NO_AUTOMATABLE_PIANO_ARRANGEMENT_IN_CHECKED_EDITIONS",
        previousRank: s.rank,
      })),
    );
    discovery.selected = discovery.selected
      .filter((s) => !remove.has(s.rank))
      .map((s, i) => ({ ...s, rank: i + 1 }));
    discovery.sourceEligibility =
      "仅纳入页数和双谱表检查通过的钢琴编配；排除候选保留原始链接及依据，按原有排序补位。";
    await atomicJson(join(root, "discovery.json"), discovery);
  }
  return discover(root);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [command = "discover", rootArg = ".local/netease-top100-20261029"] =
    process.argv.slice(2);
  const root = resolve(rootArg);
  if (command === "discover") {
    const result = await discover(root);
    console.log(
      JSON.stringify({
        selected: result.selected.length,
        excluded: result.excluded.length,
      }),
    );
  } else if (command === "prepare")
    await withRunLease(root, () => prepare(root), "prepare");
  else if (command === "run") await withRunLease(root, () => run(root));
  else if (command === "artifacts") await artifacts(root);
  else if (command === "repair") await repair(root);
  else if (command === "report") await report(root);
  else if (command === "pipeline") await pipeline(root);
  else if (command === "reconcile")
    await withRunLease(root, () => reconcile(root), "prepare");
  else if (command === "backfill")
    await withRunLease(root, () => backfill(root), "prepare");
  else throw Error("未知命令");
}
