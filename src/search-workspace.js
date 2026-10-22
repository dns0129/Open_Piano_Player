import { preserveOriginalFile } from "./library.js";
import { $, $$, esc, icon, refreshIcons } from "./ui.js";
import { validateScore } from "../lib/score.mjs";
import { mountSourceBrowser } from "./source-browser.js";
import { STATIC_NOTICE } from "./capabilities.js";
export function createSearchWorkspace({
  state,
  player,
  render,
  toast,
  api,
  requestResponse,
  refreshStatus,
  capabilities,
  openAI,
  openFullPdf,
  modal,
  closeModal,
  setModalCleanup,
  setScore,
  remember,
  fileDataURL,
  safeLink,
  receiveFile,
}) {
  function openSearch(query = "") {
    player.pause();
    state.view = "search";
    if (query) state.searchQuery = query;
    render();
    $("#song-query")?.focus();
    if (query) searchOnline();
  }
  function searchView() {
    if (!capabilities.scoreSearch)
      return `<section class="content-page search-page"><div class="page-heading"><div><span class="eyebrow">FIND THE ORIGINAL SCORE</span><h1>联网找谱需要本机版</h1><p>${STATIC_NOTICE}</p></div></div><button class="button primary" data-upload>${icon("file-music")}导入数字乐谱</button></section>`;
    return `<section class="content-page search-page"><div class="page-heading"><div><span class="eyebrow">FIND THE ORIGINAL SCORE</span><h1>输入歌名，找到它的乐谱。</h1><p>联网查找原曲五线谱、简谱和钢琴谱，选择版本后导入练习室。</p></div><span class="search-live-tag"><span class="status-dot"></span>实时互联网检索</span></div><form id="song-search-form" class="song-search-form"><div class="song-search-box">${icon("search")}<input id="song-query" aria-label="歌曲名称" placeholder="输入任意歌名，可加歌手，例如：晴天 周杰伦" maxlength="100" value="${esc(state.searchQuery)}" required><button class="button primary" type="submit" ${state.searching ? "disabled" : ""}>${icon(state.searching ? "loader-circle" : "search", state.searching ? "spin" : "")}${state.searching ? "正在搜索" : "搜索乐谱"}</button></div><div class="search-examples"><span>试试</span>${["野蜂飞舞", "青花瓷", "晴天 周杰伦", "致爱丽丝", "卡农"].map((q) => `<button type="button" data-example="${q}">${q}</button>`).join("")}<span class="search-scope">搜索真实谱源 · 保留原始来源</span></div></form><div id="online-results">${onlineResultsMarkup()}</div></section>`;
  }
  function formatLabel(format) {
    return (
      {
        musicxml: "MusicXML",
        mxl: "MusicXML",
        midi: "MIDI",
        pdf: "PDF 谱面",
        image: "图片 · 待核验",
        web: "谱源网页",
      }[format] || "谱源网页"
    );
  }
  function resultMarkup(r, i, nested = false) {
    const file = r.importable && r.format !== "web";
    const ready = ["midi", "mxl", "musicxml"].includes(r.format);
    const providerNames = [
      ...new Set((r.providers || []).map((p) => p.name || p.id)),
    ].filter((name) => name !== r.source);
    return `<article class="online-result ${nested ? "nested" : ""}"><div class="result-type ${ready ? "direct" : ""}">${icon(ready ? "file-music" : "external-link")}<small>${formatLabel(r.format)}</small></div><div class="result-copy"><h3><button class="result-title-button" data-online-browse="${i}">${esc(r.title || state.searchQuery)}</button></h3><p><span>${esc(r.source || "互联网谱源")}</span>${providerNames.length ? `<span class="result-provider">${providerNames.map(esc).join(" · ")}</span>` : ""}${r.composer ? ` · ${esc(r.composer)}` : ""}</p>${ready ? `<div class="score-route-badge">${icon("check-circle-2")}${r.verified ? "已下载解析验证" : "结构化谱文件"} · 无需 AI 识图${r.noteCount ? ` · ${r.noteCount} 个音符` : ""}${r.instrumentation === "piano" ? " · 钢琴 MIDI" : r.instrumentation === "ensemble" ? " · 合奏 MIDI，转钢琴需校对" : ""}</div>` : ""}${!ready && r.pianoSourceVerified ? `<div class="score-route-badge">${icon("piano")}钢琴独奏版本 · 原站乐器标注 · 图像待核验</div>` : ""}${r.description || r.snippet ? `<p class="result-snippet">${esc(r.description || r.snippet)}</p>` : ""}</div><div class="result-actions">${file ? `<button class="button ${ready ? "primary" : "secondary"}" data-online-import="${i}">${icon(ready ? "play" : "file-music")}${ready ? "直接导入练习" : "预览并核验钢琴谱"}</button>` : `<button class="button secondary" data-online-resolve="${i}">${icon("file-music")}打开并筛选谱面</button>`}${file ? `<button class="button quiet" data-online-browse="${i}">打开并筛选</button>` : ""}${safeLink(r.sourceUrl || r.url, "查看原站")}</div><div class="resolved-files" id="resolved-${i}"></div></article>`;
  }
  function onlineResultsMarkup() {
    if (state.searching)
      return `<div class="search-loading">${icon("loader-circle", "spin")}<strong>正在网上查找「${esc(state.searchQuery)}」的曲谱</strong><p>正在查找可直接导入的 MIDI / MusicXML，同时汇总图片与网页谱源…</p></div>`;
    if (!state.searchNetwork && !state.searchError)
      return `<div class="search-intro"><div>${icon("search")}<h3>搜索歌名</h3><p>支持中文、英文曲名<br>加上歌手可减少重名结果</p></div><span>→</span><div>${icon("file-music")}<h3>选择谱源</h3><p>打开来源并筛选版本<br>预览可公开下载的谱面</p></div><span>→</span><div>${icon("play")}<h3>导入练习</h3><p>MIDI / MusicXML 无需识图<br>PDF 全页识别，校对后跟谱</p></div></div>`;
    const n = state.searchNetwork,
      rows = state.searchResults;
    const indexed = rows
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r }) =>
          (state.searchFilter === "all" ||
            (state.searchFilter === "structured" &&
              ["midi", "mxl", "musicxml"].includes(r.format)) ||
            r.format === state.searchFilter) &&
          (!state.searchOnlyPiano ||
            r.pianoSourceVerified ||
            r.instrumentation === "piano") &&
          (!state.searchProvider ||
            state.searchProvider === "all" ||
            r.source === state.searchProvider),
      );
    const structured = indexed.filter(({ r }) =>
      ["midi", "mxl", "musicxml"].includes(r.format),
    );
    const visual = indexed
      .filter(({ r }) => !["midi", "mxl", "musicxml"].includes(r.format))
      .sort(
        (a, b) =>
          Number(Boolean(b.r.pianoSourceVerified)) -
          Number(Boolean(a.r.pianoSourceVerified)),
      );
    const filters = `<div class="search-result-filters"><label>文件类型 <select id="search-format-filter" aria-label="筛选搜索文件类型">${[
      ["all", "全部类型"],
      ["pdf", "PDF"],
      ["image", "图片谱面"],
      ["structured", "MIDI / MusicXML"],
      ["web", "谱源网页"],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}" ${state.searchFilter === value ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><label>来源 <select id="search-provider-filter" aria-label="筛选搜索来源"><option value="all">全部来源</option>${[...new Set(rows.map((r) => r.source).filter(Boolean))].map((value) => `<option value="${esc(value)}" ${state.searchProvider === value ? "selected" : ""}>${esc(value)}</option>`).join("")}</select></label><label><input id="search-piano-filter" type="checkbox" ${state.searchOnlyPiano ? "checked" : ""}> 仅钢琴来源明确</label><span>${indexed.length} / ${rows.length} 条结果</span></div>`;
    const grouped = indexed.length
      ? `${structured.length ? `<section class="score-result-section"><div class="score-result-section-title"><h3>可直接导入的乐谱 <span>${structured.length}</span></h3><p>读取文件中的音高与节奏，优先使用此类结果。</p></div>${structured.map(({ r, i }) => resultMarkup(r, i)).join("")}</section>` : ""}${visual.length ? `<section class="score-result-section"><div class="score-result-section-title"><h3>谱面网页与图片 <span>${visual.length}</span></h3><p>先核验钢琴谱图片，再选择清晰谱行识别。照片、封面及其他乐器分谱不进入钢琴识谱。</p></div>${visual.map(({ r, i }) => resultMarkup(r, i)).join("")}</section>` : ""}`
      : '<div class="empty-state">暂未找到匹配的公开谱源。试试加入歌手名或更换中英文曲名。</div>';
    const providers = state.searchProviders,
      success = providers.filter((p) => p.status === "ok").length;
    const providerMarkup = providers.length
      ? `<div class="search-channel-status" aria-label="搜索渠道状态">${providers.map((p) => `<span class="channel-chip ${p.status}" title="${esc(p.message || "")}"><span class="status-dot"></span>${esc(p.name)}<small>${p.status === "ok" ? p.count + " 条" + (p.cached ? " · 缓存" : "") : p.status === "blocked" ? "暂受限" : p.status === "empty" ? "无匹配" : "暂不可用"}</small></span>`).join("")}</div>`
      : "";
    const queryPlan = state.searchQueryPlan;
    const translationMarkup = queryPlan?.matchedWork
      ? `<div class="search-query-plan"><span>外文曲名</span><strong>${esc(queryPlan.matchedWork.title)}</strong><small>${esc(queryPlan.matchedWork.creator)} · 联合检索原曲名与外文曲名</small></div>`
      : "";
    return `${translationMarkup}<div class="results-heading"><h2>找到的谱源 <span>${rows.length}</span></h2><span>${n?.ok ? (providers.length ? `${success} / ${providers.length} 个渠道返回结果` : "已实时联网检索") : n?.attempted ? "在线渠道暂不可用" : "曲谱目录"}</span></div>${providerMarkup}${filters}${state.searchError || (!n?.ok && n?.message) ? `<div class="search-notice">${esc(state.searchError || n.message)}</div>` : ""}<div class="online-result-list">${grouped}</div><div class="search-footer"><p>网页结果可能需要在原站登录或购买。找到可公开获取的谱面后，才能导入练习。</p>${externalSearchMarkup()}</div>`;
  }
  function externalSearchMarkup() {
    const links = state.searchLinks.length
      ? [...state.searchLinks]
      : [
          {
            name: "必应",
            url:
              "https://www.bing.com/search?q=" +
              encodeURIComponent(state.searchQuery + " 钢琴谱"),
          },
          {
            name: "百度",
            url:
              "https://www.baidu.com/s?wd=" +
              encodeURIComponent(state.searchQuery + " 钢琴谱"),
          },
          {
            name: "搜狗",
            url:
              "https://www.sogou.com/web?query=" +
              encodeURIComponent(state.searchQuery + " 钢琴谱"),
          },
        ];
    if (state.searchQueryPlan?.matchedWork)
      links.push(
        {
          name: "英文找谱",
          url:
            "https://www.bing.com/search?q=" +
            encodeURIComponent(state.searchQueryPlan.queries[0]),
        },
        {
          name: "IMSLP",
          url:
            "https://imslp.org/index.php?search=" +
            encodeURIComponent(state.searchQueryPlan.matchedWork.title),
        },
      );
    return `<div class="external-search-links"><span>也可在原站搜索</span>${links.map((l) => safeLink(l.url, l.name || l.label || "打开搜索")).join("")}</div>`;
  }
  function bindSearch() {
    if (!capabilities.scoreSearch) return;
    $("#song-search-form").onsubmit = (e) => {
      e.preventDefault();
      state.searchQuery = $("#song-query").value.trim();
      searchOnline();
    };
    $$("[data-example]").forEach(
      (b) =>
        (b.onclick = () => {
          state.searchQuery = b.dataset.example;
          $("#song-query").value = state.searchQuery;
          searchOnline();
        }),
    );
    bindOnlineResults();
  }
  function bindOnlineResults() {
    const updateFilters = () => {
      $("#online-results").innerHTML = onlineResultsMarkup();
      bindOnlineResults();
      refreshIcons();
    };
    $("#search-format-filter")?.addEventListener("change", (event) => {
      state.searchFilter = event.target.value;
      updateFilters();
    });
    $("#search-provider-filter")?.addEventListener("change", (event) => {
      state.searchProvider = event.target.value;
      updateFilters();
    });
    $("#search-piano-filter")?.addEventListener("change", (event) => {
      state.searchOnlyPiano = event.target.checked;
      updateFilters();
    });
    $$("[data-online-browse]").forEach(
      (button) =>
        (button.onclick = () =>
          openSourceBrowser(state.searchResults[+button.dataset.onlineBrowse])),
    );
    $$("[data-online-import]").forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          b.innerHTML = icon("loader-circle", "spin") + "导入中";
          refreshIcons();
          try {
            await loadOnlineEntry(state.searchResults[+b.dataset.onlineImport]);
          } catch (e) {
            toast(e.message, true);
            b.disabled = false;
            b.innerHTML = "重试导入";
          }
        }),
    );
    $$("[data-online-resolve]").forEach(
      (b) =>
        (b.onclick = () =>
          openSourceBrowser(state.searchResults[+b.dataset.onlineResolve])),
    );
  }
  function openSourceBrowser(entry) {
    modal(
      "筛选谱源与版本",
      '<div id="source-browser-host"></div>',
      entry.title || state.searchQuery,
    );
    $(".modal").classList.add("source-browser-modal");
    const browser = mountSourceBrowser($("#source-browser-host"), {
      entry,
      resolve: (value) =>
        api(
          value.resolveUrl ||
            "/api/resolve-score?id=" + encodeURIComponent(value.id),
        ),
      onSelect: async (value) => {
        try {
          await loadOnlineEntry(value);
        } catch (error) {
          toast(error.message, true);
          throw error;
        }
      },
      onClose: closeModal,
    });
    setModalCleanup(() => browser.destroy());
  }
  async function searchOnline() {
    if (!capabilities.scoreSearch) return;
    const query = state.searchQuery.trim();
    if (!query) return;
    state.searchAbort?.abort();
    const abort = new AbortController();
    state.searchAbort = abort;
    state.searching = true;
    state.searchFilter = "all";
    state.searchProvider = "all";
    state.searchOnlyPiano = false;
    state.searchError = "";
    state.searchResults = [];
    state.searchQueryPlan = null;
    state.searchNetwork = null;
    state.searchProviders = [];
    state.searchSourcesCount = 0;
    state.searchLinks = [];
    if (state.view === "search") render();
    try {
      const data = await api(
        "/api/search?q=" + encodeURIComponent(query),
        null,
        abort.signal,
      );
      if (abort.signal.aborted) return;
      state.searchResults = data.results || [];
      state.searchQueryPlan = data.queryPlan || null;
      state.searchNetwork = data.network || {
        attempted: false,
        ok: false,
        message: data.warning || "",
      };
      state.externalSearchUrl = data.externalSearchUrl || "";
      state.searchProviders =
        data.providerStatuses || data.network?.providerStatuses || [];
      state.searchSourcesCount =
        data.sourcesCount ||
        state.searchProviders.filter((p) => p.status === "ok").length;
      state.searchLinks = data.searchLinks || data.externalSearchLinks || [];
    } catch (e) {
      if (e.name === "AbortError") return;
      state.searchError = e.message;
      state.searchNetwork = { attempted: true, ok: false };
    } finally {
      if (state.searchAbort === abort) {
        state.searching = false;
        if (state.view === "search") render();
      }
    }
  }
  async function loadOnlineEntry(entry) {
    if (!state.status) await refreshStatus();
    const url =
      entry.downloadUrl ||
      (entry.id
        ? "/api/import-score?id=" + encodeURIComponent(entry.id)
        : "/api/public-score?path=" + encodeURIComponent(entry.path));
    const response = await (url.startsWith("/api/")
      ? requestResponse(url)
      : fetch(url));
    if (!response.ok) {
      let message = "谱面下载失败，请稍后重试";
      try {
        message = (await response.json()).error || message;
      } catch {}
      throw new Error(message);
    }
    const data = await response.arrayBuffer(),
      format =
        response.headers.get("x-score-format") ||
        entry.format ||
        (entry.path ? "mxl" : "");
    let filename = response.headers.get("x-score-filename");
    try {
      filename = filename ? decodeURIComponent(filename) : null;
    } catch {
      filename = null;
    }
    filename ||=
      entry.path ||
      (entry.title || state.searchQuery) +
        "." +
        ({
          musicxml: "musicxml",
          mxl: "mxl",
          midi: "mid",
          pdf: "pdf",
          image: "jpg",
        }[format] || "musicxml");
    const source = {
      kind: "web-score",
      songName: state.searchQuery,
      page: entry.page,
      preview: Boolean(entry.preview),
      pianoSourceVerified: entry.pianoSourceVerified === true,
      instrumentEvidence: entry.instrumentEvidence || "",
      label:
        (entry.title || state.searchQuery) +
        " · " +
        (entry.source || "网络乐谱"),
      url: entry.sourceUrl || entry.url,
      license: entry.license || "以原站和具体谱面标注为准",
    };
    if (["pdf", "image"].includes(format)) {
      const mime =
        format === "pdf"
          ? "application/pdf"
          : response.headers.get("content-type") || "image/jpeg";
      await receiveFile(new File([data], filename, { type: mime }), source);
      return;
    }
    const { importScore } = await import("../lib/importers.mjs");
    const { score, warnings } = await importScore(data, filename);
    if (
      entry.pianoSourceVerified &&
      entry.title &&
      /^(?:control track|untitled|track\s*\d*|midi(?: file)?)$/i.test(
        score.title.trim(),
      )
    )
      score.title = entry.title;
    if (score.composer === "MIDI 导入" && entry.composer)
      score.composer = entry.composer;
    score.source = source;
    warnings.unshift(
      ...(entry.warnings || []).filter((w) => !warnings.includes(w)),
    );
    if (entry.instrumentation === "ensemble")
      warnings.unshift(
        "来源是合奏 MIDI，当前使用钢琴音色播放，各声部与左右手分配需要校对。",
      );
    await remember(
      score,
      undefined,
      await preserveOriginalFile(
        new File([data], filename, {
          type:
            response.headers.get("content-type") || "application/octet-stream",
        }),
      ),
    );
    closeModal();
    setScore(score, warnings);
    toast("原曲乐谱已导入练习室");
  }

  return { openSearch, searchView, bindSearch, loadOnlineEntry };
}
