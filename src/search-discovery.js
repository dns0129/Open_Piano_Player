import { $, $$, esc, icon, refreshIcons } from "./ui.js";
import { scoreSection } from "../lib/instrument-sections.mjs";
import {
  discoverCloudScores,
  rankedCloudScores,
  suggestCloudQueries,
  readSearchHistory,
  rememberSearch,
  clearSearchHistory,
} from "../lib/library-search.mjs";

export function createSearchDiscovery({
  state,
  capabilities,
  render,
  rows,
  syncCloudLibrary,
  openOnlineSearch,
}) {
  const catalogue = () =>
    (state.cloudScores || []).filter(
      (score) => scoreSection(score) === (state.section || "piano"),
    );
  const storage = () => {
    try {
      return globalThis.localStorage;
    } catch {
      return null;
    }
  };
  const history = () => readSearchHistory(storage(), state.section);
  const shortTitle = (score) => score.title.split(" · ")[0];
  function queryButton(query, label = query, cls = "") {
    return `<button type="button" class="${cls}" data-discovery-query="${esc(query)}" ${query === "吉他入门" ? "data-guitar-beginners" : ""}>${esc(label)}</button>`;
  }
  function board(kind, title, subtitle, number) {
    const scores = rankedCloudScores(catalogue(), kind).slice(0, 4);
    return `<section class="discovery-board board-${number}"><header><span class="board-kicker">${number === 0 ? "EDITOR’S PICKS" : number === 1 ? "FIRST STEPS" : "NEXT CHALLENGE"}</span><h3>${title}</h3><p>${subtitle}</p></header><ol>${scores.map((score, i) => `<li><span class="board-rank">${String(i + 1).padStart(2, "0")}</span><button type="button" data-discovery-query="${esc(shortTitle(score))}"><strong>${esc(shortTitle(score))}</strong><small>${esc(score.composer || "作曲者未标注")}</small></button>${icon("arrow-up-right")}</li>`).join("") || '<li class="discovery-muted">这个分区暂无相应曲目</li>'}</ol><button type="button" class="board-more" data-discovery-jump data-discovery-level="${kind === "featured" ? "all" : kind}">查看${kind === "featured" ? "全部曲目" : "完整榜单"} ${icon("arrow-up-right")}</button></section>`;
  }
  function historyMarkup() {
    const recent = history().slice(0, 6);
    return recent.length
      ? `<div class="discovery-history"><span>最近搜索</span><div>${recent.map((item) => queryButton(item.query)).join("")}</div><button class="icon-button" type="button" data-clear-history aria-label="清空搜索历史与本机热搜" title="清空搜索历史与本机热搜">${icon("trash-2")}</button></div>`
      : "";
  }
  function resultsMarkup() {
    const query = state.cloudLibraryQuery || "";
    const filtered = discoverCloudScores(catalogue(), {
      query,
      level: state.discoveryLevel || "all",
      original: state.discoveryOriginal,
      sort: state.discoverySort || "relevance",
    });
    const count = state.discoveryLimit || 12;
    const isFiltered =
      query ||
      (state.discoveryLevel && state.discoveryLevel !== "all") ||
      state.discoveryOriginal;
    return `<div class="discovery-results-heading"><div><h2>${query ? `「${esc(query)}」的搜索结果` : "发现乐谱"}</h2><p id="cloud-search-summary" role="status">${state.cloudLoaded ? `${filtered.length} 份乐谱 · ${state.section === "guitar" ? "吉他" : "钢琴"}曲库` : state.cloudError ? "曲库暂时无法读取，请重试" : "正在读取曲库…"}</p></div><label>排序 <select id="discovery-sort" aria-label="排序乐谱"><option value="relevance" ${!state.discoverySort || state.discoverySort === "relevance" ? "selected" : ""}>${query ? "相关度优先" : "推荐顺序"}</option><option value="title" ${state.discoverySort === "title" ? "selected" : ""}>曲名 A–Z</option><option value="tempo" ${state.discoverySort === "tempo" ? "selected" : ""}>速度由慢到快</option></select></label></div>
      <div class="discovery-filters" role="group" aria-label="筛选曲目难度">${[
        ["all", "全部"],
        ["beginner", "入门"],
        ["intermediate", "进阶"],
        ["unknown", "难度未标注"],
      ]
        .map(
          ([key, label]) =>
            `<button type="button" data-discovery-level="${key}" aria-pressed="${(state.discoveryLevel || "all") === key}" class="${(state.discoveryLevel || "all") === key ? "selected" : ""}">${label}</button>`,
        )
        .join(
          "",
        )}<label><input type="checkbox" id="discovery-original" ${state.discoveryOriginal ? "checked" : ""}> 含原谱图片</label>${isFiltered ? '<button type="button" class="discovery-reset" data-discovery-reset>重置筛选</button>' : ""}</div>
      <div id="library-grid" class="cloud-score-list">${rows(filtered.slice(0, count))}</div>
      ${!filtered.length && state.cloudLoaded ? `<div class="discovery-empty">${icon("search")}<h3>暂时没有找到这份乐谱</h3><p>试试更短的曲名、作曲家，或清除筛选条件。</p><button class="button secondary" data-discovery-reset>清除筛选</button>${query ? moreSources(query) : ""}</div>` : ""}
      ${filtered.length > count ? `<button class="button secondary discovery-more" data-discovery-more>再看 ${Math.min(12, filtered.length - count)} 份 · 共 ${filtered.length} 份</button>` : ""}
      ${query && filtered.length ? `<div class="discovery-more-sources"><span>想找其他编配或版本？</span>${moreSources(query)}</div>` : ""}`;
  }
  function moreSources(query) {
    return capabilities.scoreSearch && state.section !== "guitar"
      ? `<button class="button secondary" type="button" data-discovery-online="${esc(query)}">${icon("search")}全网找「${esc(query)}」</button>`
      : `<a class="button secondary" href="https://www.bing.com/search?q=${encodeURIComponent(query + (state.section === "guitar" ? " 吉他谱" : " 钢琴谱"))}" target="_blank" rel="noopener noreferrer">${icon("external-link")}搜索更多谱源</a>`;
  }
  function view() {
    const query = state.cloudLibraryDraft ?? state.cloudLibraryQuery ?? "";
    const hot = [...history()]
      .sort((a, b) => b.count - a.count || b.at - a.at)
      .slice(0, 5);
    const showBoards =
      !state.cloudLibraryQuery &&
      (!state.discoveryLevel || state.discoveryLevel === "all") &&
      !state.discoveryOriginal;
    const seeds =
      state.section === "guitar"
        ? ["小星星", "欢乐颂", "吉他入门"]
        : ["致爱丽丝", "卡农", "月光奏鸣曲", "肖邦", "幻听"];
    return `<section class="content-page discovery-page"><div class="discovery-heading"><div><span class="eyebrow">FIND YOUR NEXT PIECE</span><h1>下一首，想弹什么？</h1><p>从喜欢的旋律开始，找到适合你的那一版。</p></div><button class="button quiet" data-cloud-refresh ${state.cloudBusy ? "disabled" : ""}>${icon("rotate-ccw")}${state.cloudBusy ? "更新中" : "刷新曲库"}</button></div>
      <div class="discovery-search-surface"><div class="discovery-scopes" aria-label="搜索范围"><button class="selected" aria-pressed="true">${icon("music-2")}云端乐谱</button>${capabilities.scoreSearch && state.section !== "guitar" ? `<button data-discovery-online="${esc(query)}" aria-pressed="false">${icon("search")}全网谱源</button>` : "<span>搜索公开曲库 · 下载后即可练习</span>"}</div>
      <form id="cloud-library-search" class="discovery-form" role="search"><div class="discovery-search-field">${icon("search")}<input id="library-query" type="search" role="combobox" aria-label="搜索曲名、作曲家" aria-autocomplete="list" aria-controls="discovery-suggestions" aria-expanded="false" placeholder="搜曲名、作曲家，中英文都可以" autocomplete="off" maxlength="100" value="${esc(query)}"><button type="button" class="icon-button" data-clear-query aria-label="清空搜索" ${query ? "" : "hidden"}>${icon("x")}</button><button class="button primary" type="submit">搜索</button></div><div id="discovery-suggestions" role="listbox" aria-label="曲名建议" hidden></div></form>
      <div class="discovery-seeds"><span>找谱灵感</span>${seeds.map((q) => queryButton(q)).join("")}</div></div>
      <div id="discovery-history">${historyMarkup()}</div>
      ${state.cloudError ? `<div class="cloud-library-error" role="alert">${esc(state.cloudError)} <button class="button quiet" data-cloud-refresh>重新加载</button></div>` : ""}
      ${!state.cloudLoaded && state.cloudBusy ? `<div class="discovery-loading" role="status">${icon("loader-circle", "spin")}正在加载乐谱与榜单…</div>` : ""}
      ${showBoards && state.cloudLoaded ? `<div class="discovery-section-heading"><div><h2>榜单精选</h2><p>按曲库推荐顺序整理，帮你发现值得练的旋律。</p></div><span>精选推荐 · 非播放量排名</span></div><div class="discovery-boards">${board("featured", "精选推荐榜", "熟悉的旋律，新的练习灵感", 0)}${board("beginner", "入门练习榜", "从简单旋律开始，慢慢积累", 1)}${board("intermediate", "进阶挑战榜", "多一点变化，多一点成就", 2)}</div>` : ""}
      <div class="discovery-content"><section class="discovery-results" id="discovery-results">${resultsMarkup()}</section><aside class="discovery-aside"><div class="discovery-section-heading"><h2>搜索热榜</h2><span>我的热搜</span></div><p>仅按本浏览器搜索次数排序</p><ol class="discovery-hot">${hot.map((item, i) => `<li><span>${String(i + 1).padStart(2, "0")}</span>${queryButton(item.query)}<small>${item.count} 次</small></li>`).join("") || '<li class="discovery-muted">还没有搜索记录。<br>你常找的曲目会出现在这里。</li>'}</ol><div class="discovery-tip">${icon("file-music")}<strong>找到曲谱，就开始练习</strong><p>已下载的乐谱可直接打开；带有原谱图片的版本，方便边练边核对。</p></div></aside></div></section>`;
  }
  function submit(query) {
    state.cloudLibraryDraft = state.cloudLibraryQuery = String(query)
      .trim()
      .slice(0, 100);
    state.discoveryLimit = 12;
    rememberSearch(storage(), state.section, state.cloudLibraryQuery);
    render();
    if (!state.cloudLoaded && !state.cloudBusy) void syncCloudLibrary();
  }
  function bind() {
    const input = $("#library-query"),
      suggestions = $("#discovery-suggestions");
    if (!input || !suggestions) return;
    let active = -1,
      composing = false,
      matches = [];
    const close = () => {
      suggestions.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      active = -1;
    };
    const show = () => {
      matches = input.value.trim()
        ? suggestCloudQueries(catalogue(), input.value)
        : [];
      active = -1;
      suggestions.innerHTML = matches
        .map(
          (score, i) =>
            `<div id="discovery-option-${i}" role="option" aria-selected="false" data-suggestion="${i}">${icon("music-2")}<span><strong>${esc(score.title)}</strong><small>${esc(score.composer)}</small></span>${icon("arrow-up-right")}</div>`,
        )
        .join("");
      suggestions.hidden = !matches.length;
      input.setAttribute("aria-expanded", String(Boolean(matches.length)));
      input.removeAttribute("aria-activedescendant");
      $$("[data-suggestion]", suggestions).forEach((item) => {
        item.onpointerdown = (event) => event.preventDefault();
        item.onclick = () =>
          submit(matches[Number(item.dataset.suggestion)].title);
      });
      refreshIcons();
    };
    $("#cloud-library-search").onsubmit = (event) => {
      event.preventDefault();
      if (!composing) submit(input.value);
    };
    input.addEventListener("compositionstart", () => {
      composing = true;
    });
    input.addEventListener("compositionend", () => {
      composing = false;
      state.cloudLibraryDraft = input.value;
      show();
    });
    input.oninput = () => {
      state.cloudLibraryDraft = input.value;
      $("[data-clear-query]").hidden = !input.value;
      if (!composing) show();
    };
    input.onfocus = show;
    input.onblur = close;
    input.onkeydown = (event) => {
      if (event.isComposing || composing) return;
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key === "Enter" && active >= 0) {
        event.preventDefault();
        submit(matches[active].title);
        return;
      }
      if (["ArrowDown", "ArrowUp"].includes(event.key) && matches.length) {
        event.preventDefault();
        suggestions.hidden = false;
        input.setAttribute("aria-expanded", "true");
        active =
          (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) %
          matches.length;
        $$('[role="option"]', suggestions).forEach((item, i) =>
          item.setAttribute("aria-selected", String(i === active)),
        );
        input.setAttribute(
          "aria-activedescendant",
          `discovery-option-${active}`,
        );
      }
    };
    $$("[data-discovery-query]").forEach(
      (button) =>
        (button.onclick = () => submit(button.dataset.discoveryQuery)),
    );
    $$("[data-discovery-online]").forEach(
      (button) =>
        (button.onclick = () =>
          openOnlineSearch(button.dataset.discoveryOnline)),
    );
    $("[data-clear-query]").onclick = () => {
      submit("");
      $("#library-query")?.focus();
    };
    $("[data-clear-history]")?.addEventListener("click", () => {
      clearSearchHistory(storage(), state.section);
      render();
    });
    $$("[data-discovery-level]").forEach(
      (button) =>
        (button.onclick = () => {
          state.discoveryLevel = button.dataset.discoveryLevel;
          state.discoveryLimit = 12;
          render();
          if (button.hasAttribute("data-discovery-jump"))
            $("#discovery-results")?.scrollIntoView?.({ block: "start" });
        }),
    );
    $("#discovery-sort").onchange = (event) => {
      state.discoverySort = event.target.value;
      state.discoveryLimit = 12;
      render();
    };
    $("#discovery-original").onchange = (event) => {
      state.discoveryOriginal = event.target.checked;
      state.discoveryLimit = 12;
      render();
    };
    $$("[data-discovery-reset]").forEach(
      (button) =>
        (button.onclick = () => {
          state.discoveryLevel = "all";
          state.discoveryOriginal = false;
          state.discoverySort = "relevance";
          submit("");
        }),
    );
    $("[data-discovery-more]")?.addEventListener("click", () => {
      state.discoveryLimit = (state.discoveryLimit || 12) + 12;
      const y = globalThis.scrollY;
      render();
      globalThis.scrollTo?.({ top: y });
    });
  }
  return { view, bind };
}
