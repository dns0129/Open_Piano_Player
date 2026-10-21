import { scoreSection, sectionKey } from '../lib/instrument-sections.mjs';
import { guitarStarterScore } from '../lib/guitar.mjs';
import { $, $$, esc, icon } from "./ui.js";
import { assetURL } from "../lib/asset-url.mjs";
import { tonalityLabel } from "../lib/score-arrangement.mjs";
import { searchCloudScores } from "../lib/library-search.mjs";

export function createLibraryPanel({
  state,
  client,
  api,
  capabilities,
  render,
  setScore,
  starterScore,
  keyName,
  toast,
  download,
  modal,
}) {
  const HOSTED = capabilities.mode === "hosted";
  const STATIC_SITE = capabilities.mode !== "local",
    library = [starterScore];
  const availableScores = () => client.scores.filter(score => scoreSection(score) === (state.section || 'piano'));
  async function remember(score, sourceRecord, originalFile, options = {}) {
    const saved = await client.save(score, {
      sourceRecord,
      originalFile,
      ...options,
    });
    state.shared = client.scores;
    return saved;
  }
  async function loadAvailablePracticeSource(score) {
    try {
      return await client.readSource(score);
    } catch (e) {
      if (e.code === "LIBRARY_NOT_FOUND") return null;
      throw e;
    }
  }
  async function cloudJSON(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("云端曲库读取失败。");
    return response.json();
  }
  let librarySync;
  function syncLocalLibrary() {
    if (librarySync) return librarySync;
    librarySync = (async () => {
      try {
        await client.initialize();
        await client.refresh();
        state.shared = client.scores;
        if (state.view === "library" && !$("#modal-root")?.childElementCount) {
          const query = $("#library-query")?.value || "";
          render();
          if (query && $("#library-query")) {
            $("#library-query").value = query;
            $("#library-query").dispatchEvent(new Event("input"));
          }
        }
      } catch (e) {
        toast("曲库读取失败：" + e.message, true);
        throw e;
      } finally {
        librarySync = null;
      }
    })();
    return librarySync;
  }
  async function syncCloudLibrary() {
    if (state.cloudBusy) return;
    state.cloudBusy = true;
    state.cloudError = "";
    if (state.view === "library") render();
    try {
      const data = STATIC_SITE
        ? await cloudJSON(assetURL("/cloud-library/index.json"))
        : await api("/api/cloud-library");
      if (data.version !== 1 || !Array.isArray(data.scores))
        throw new Error("云端曲库目录格式无效。");
      state.cloudScores = data.scores;
      state.cloudLoaded = true;
    } catch (e) {
      state.cloudError = e.message;
    } finally {
      state.cloudBusy = false;
      if (state.view === "library") render();
    }
  }
  async function cloudAction(action) {
    if (state.cloudBusy) return;
    state.cloudBusy = true;
    render();
    try {
      await action();
    } catch (e) {
      toast(e.message, true);
    } finally {
      state.cloudBusy = false;
      if (state.view === "library") render();
    }
  }
  function libraryView() {
    const cloud = state.libraryTab === "cloud",
      scores = cloud
        ? searchCloudScores(state.cloudScores.filter(score => scoreSection(score) === (state.section || 'piano')), state.cloudLibraryQuery)
        : availableScores();
    return `<section class="content-page"><div class="page-heading"><div><span class="eyebrow">YOUR MUSIC LIBRARY</span><h1>${state.section === "guitar" ? "吉他" : "钢琴"}${cloud ? (HOSTED ? "公开曲库" : "云端曲库") : (HOSTED ? "账号曲库" : "本地曲库")}</h1><p>${HOSTED ? (cloud ? "选择公开曲目，保存到自己的账号后练习。" : "乐谱私有保存到当前账号，回收站和历史可在账号页面管理。") : cloud ? "下载到本地后即可练习；本地删除不影响云端。" : "下载和导入的曲谱按乐器分区保存，可随时删除。"}</p></div>${state.section === "guitar" ? `<button class="button primary" data-guitar-example>${icon("guitar")}打开吉他示例</button><button class="button secondary" data-upload>导入吉他谱</button>` : capabilities.scoreSearch ? `<button class="button primary" data-ai>${icon("search")}按歌名找谱</button>` : `<button class="button primary" data-upload>${icon("upload")}导入数字谱</button>`}</div>
  ${!cloud ? `<div class="library-backup-actions"><button class="button secondary" data-library-backup>备份完整曲库</button><button class="button secondary" data-library-restore>恢复曲库</button></div><button class="continue-practice" data-nav="practice"><span class="continue-icon">${icon("file-music")}</span><span><small>继续练习</small><strong>${esc(state.score.title)}</strong><span>${esc(state.score.composer || "钢琴练习曲")} · ${state.tempo} BPM</span></span><span class="continue-play">${icon("play")}</span></button>` : ""}
  <div class="cloud-library-tabs"><button class="button ${!cloud ? "primary" : "secondary"}" data-library-tab="local">${HOSTED ? "账号曲库" : "本地曲库"}</button><button class="button ${cloud ? "primary" : "secondary"}" data-library-tab="cloud">${HOSTED ? "公开曲库" : "云端曲库"}</button>${cloud && state.section === "guitar" ? '<button class="button secondary" data-guitar-beginners>吉他入门</button>' : ""}${cloud ? `<button class="button quiet" data-cloud-refresh ${state.cloudBusy ? "disabled" : ""}>${state.cloudBusy ? "正在处理…" : "刷新云端"}</button>` : ""}</div>
  ${cloud && state.cloudError ? `<p class="cloud-library-error" role="alert">${esc(state.cloudError)}</p>` : ""}
  ${!cloud && client.warnings.length ? `<p class="cloud-library-error" role="alert">${client.warnings.map(esc).join(" ")}</p>` : ""}
  ${cloud ? `<form id="cloud-library-search" class="library-filter cloud-library-search" role="search"><label class="search-input">${icon("search")}<input id="library-query" aria-label="搜索云端曲库" placeholder="${state.section === "guitar" ? "输入曲名，或点击“吉他入门”" : "输入曲名、作曲家，或“初级”"}" value="${esc(state.cloudLibraryDraft || "")}" maxlength="100"></label><button class="button primary" type="submit">搜索</button></form><p class="cloud-search-summary" id="cloud-search-summary" role="status">${!state.cloudLibraryQuery ? "输入关键词并搜索后显示曲目。" : !state.cloudLoaded && !state.cloudError ? "正在读取云端曲库…" : `找到 ${scores.length} 份乐谱`}</p>` : `<div class="library-filter search-input">${icon("search")}<input id="library-query" aria-label="搜索曲库" placeholder="搜索歌名、作曲家…"><span>${scores.length} 份乐谱</span></div>`}<div class="${cloud ? "cloud-score-list" : "library-grid"}" id="library-grid">${cloud ? cloudRows(scores) : scoreCards(scores)}</div>${!cloud && !scores.length ? '<p class="cloud-library-empty">本地暂无曲目，前往云端曲库下载，或导入自己的乐谱。</p>' : cloud && state.cloudLibraryQuery && state.cloudLoaded && !scores.length ? '<p class="cloud-library-empty" id="cloud-search-empty">没有匹配曲目，请换一个关键词。</p>' : ""}</section>`;
  }
  function cloudRows(scores) {
    const localIds = new Set(availableScores().map((s) => s.id));
    const sourceLink = (value) => {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol)
          ? ` · <a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">来源与授权</a>`
          : "";
      } catch {
        return "";
      }
    };
    return scores
      .map(
        (s) =>
          `<article class="cloud-score-row" data-card="${esc(s.id)}"><div class="cloud-score-copy"><h3>${esc(s.title)}</h3><p>${esc(s.composer)} · ${s.notes} 音符 · ${s.tempo} BPM${s.timeSignature ? " · " + esc(s.timeSignature.join("/")) : ""}</p><small>${esc(s.sourceLabel || (s.reviewApproved ? "已审核 · AI逐谱校对" : s.reviewRequired ? "待人工校对" : s.hasOriginal ? "含原谱图片" : "数字乐谱"))}${sourceLink(s.sourceUrl)}</small></div><div class="cloud-card-actions"><button class="button primary" data-cloud-download="${esc(s.id)}" ${state.cloudBusy ? "disabled" : ""}>${icon("download")}${localIds.has(s.id) ? "重新下载" : HOSTED ? "保存到账号" : "下载到本地"}</button>${capabilities.publish ? `<button class="button quiet" data-cloud-delete="${esc(s.id)}" ${state.cloudBusy ? "disabled" : ""}>删除云端</button>` : ""}</div></article>`,
      )
      .join("");
  }

  function scoreCards(scores) {
    return scores
      .map(
        (s, i) =>
          `<article class="score-card" data-card="${esc(s.id)}"><div class="card-art tone-${i % 4}"><span class="card-note">${["𝄞", "♫", "♩", "♬"][i % 4]}</span><span class="card-type">${HOSTED ? "私有曲谱 · 请核对原谱" : s.source?.kind === "full-score-agent-approved" ? "已审核 · AI逐谱校对" : s.source?.kind === "full-score-model-reviewed" ? "AI全谱校对版 · 待人工确认" : s.source?.reviewRequired || s.source?.kind === "full-score-ai-draft" ? "数字谱 · 待校对" : s.source?.kind === "full-pdf-reviewed" ? "完整PDF钢琴谱" : s.source?.kind === "pdf-transcription-checked" ? "7页完整钢琴谱" : library.some((x) => x.id === s.id) ? "精选练习曲" : "我的乐谱"}</span><button data-open="${esc(s.id)}" class="card-play" aria-label="打开 ${esc(s.title)}">${icon("play")}</button></div><div class="card-info"><h3>${esc(s.title)}</h3><p>${esc(s.composer || (state.section === "guitar" ? "吉他练习曲" : "钢琴练习曲"))}</p><div class="card-details"><span>${s.mode ? esc(tonalityLabel(s)) : keyName(s.keySignature) + " 调"} · ${s.timeSignature.join("/")}</span><span>${s.tempo} BPM</span></div></div>${capabilities.publish ? `<button class="button quiet cloud-upload" data-cloud-upload="${esc(s.id)}" ${state.cloudBusy ? "disabled" : ""}>上传云端</button>` : ""}<button class="button quiet" data-revisions="${esc(s.id)}">修订历史</button><button class="button quiet cloud-delete-local" data-delete="${esc(s.id)}" aria-label="${HOSTED ? "移到回收站" : "本地删除"} ${esc(s.title)}" title="${HOSTED ? "30 天内可在账号页面恢复" : "仅删除本地副本"}">${icon("trash-2")}${HOSTED ? "移到回收站" : "删除本地"}</button></article>`,
      )
      .join("");
  }
  function bindLibrary() {
    $('[data-guitar-example]')?.addEventListener('click', () => setScore(guitarStarterScore));
    $$("[data-open]").forEach(
      (b) =>
        (b.onclick = () => {
          const score = availableScores().find((s) => s.id === b.dataset.open);
          if (score) setScore(score);
        }),
    );
    $$("[data-library-tab]").forEach(
      (b) =>
        (b.onclick = () => {
          state.libraryTab = b.dataset.libraryTab;
          localStorage.setItem(
            sectionKey("qinban-library-tab", state.section),
            JSON.stringify(state.libraryTab),
          );
          render();
          if (state.libraryTab === "cloud") void syncCloudLibrary();
        }),
    );
    $('[data-guitar-beginners]')?.addEventListener('click', () => {
      state.cloudLibraryDraft = state.cloudLibraryQuery = '吉他入门';
      render();
      if (!state.cloudLoaded && !state.cloudBusy) void syncCloudLibrary();
    });
    $("[data-cloud-refresh]")?.addEventListener(
      "click",
      () => void syncCloudLibrary(),
    );
    $$("[data-cloud-download]").forEach(
      (b) =>
        (b.onclick = () =>
          void cloudAction(async () => {
            const id = b.dataset.cloudDownload;
            const bundle = STATIC_SITE
              ? await cloudJSON(assetURL(`/cloud-library/scores/${id}.json`))
              : await api(`/api/cloud-library/${id}`);
            if (bundle.score?.id !== id)
              throw new Error("云端下载曲目不匹配，未保存。");
            await client.saveBundle(bundle);
            await syncLocalLibrary();
            toast(HOSTED ? "已保存到账号曲库，原谱图片一并保存。" : "已下载到本地曲库，原谱图片一并保存。");
          })),
    );
    $$("[data-cloud-delete]").forEach(
      (b) =>
        (b.onclick = () => {
          const entry = state.cloudScores.find(
            (s) => s.id === b.dataset.cloudDelete,
          );
          if (
            !confirm(
              `从云端删除“${entry?.title || b.dataset.cloudDelete}”？所有用户将无法再下载，已有本地副本会保留。`,
            )
          )
            return;
          void cloudAction(async () => {
            await api(`/api/cloud-library/${b.dataset.cloudDelete}/delete`, {});
            state.cloudScores = state.cloudScores.filter(
              (s) => s.id !== b.dataset.cloudDelete,
            );
            toast(
              "云端 main 已删除；公开网页将在 Pages 发布后更新，本地副本保留。",
            );
          });
        }),
    );
    $$("[data-cloud-upload]").forEach(
      (b) =>
        (b.onclick = () =>
          void cloudAction(async () => {
            const score = availableScores().find(
              (s) => s.id === b.dataset.cloudUpload,
            );
            if (
              !confirm(
                `将“${score.title}”及其原谱图片发布到公开云端曲库？所有人都可下载。`,
              )
            )
              return;
            const record = await client.package(score.id);
            const document = {
              ...record.document,
              lineage: {
                ...record.document.lineage,
                publishedFromId: record.id,
              },
            };
            const result = await api("/api/cloud-library", {
              document,
              score: record.score,
              sourceNotation: record.sourceNotation,
              assets: record.assets,
              warnings: record.warnings,
              reviewStatus: record.reviewStatus,
            });
            try {
              await client.save(record.score, {
                publication: {
                  scoreId: score.id,
                  revision: record.revision,
                  commit: result.commit,
                  at: new Date().toISOString(),
                },
              });
            } catch (e) {
              throw new Error("云端已发布，但本机发布记录未保存：" + e.message);
            }
            toast("已上传云端 main，公开下载将在 Pages 发布后更新。");
          })),
    );
    $$("[data-delete]").forEach(
      (b) =>
        (b.onclick = () =>
          void cloudAction(async () => {
            const id = b.dataset.delete;
            if (
              !confirm(HOSTED ? "将这首乐谱移到账号回收站？30 天内可恢复。" : "删除本地曲库中的这首乐谱？原识谱任务与云端曲目会保留。")
            )
              return;
            await client.remove(id);
            state.shared = client.scores;
            if (state.score.id === id) {
              client.release(id);
              setScore(state.section === "guitar" ? guitarStarterScore : starterScore);
              localStorage.removeItem(sectionKey("qinban-active-score", state.section));
              state.view = "library";
            }
            toast(HOSTED ? "已移到账号回收站，30 天内可恢复。" : "已删除本地副本，云端曲目保留。");
          })),
    );
    $("[data-library-backup]")?.addEventListener(
      "click",
      () =>
        void cloudAction(async () => {
          const backup = await client.backup();
          download(
            JSON.stringify(backup),
            "琴伴曲库备份-" + new Date().toISOString().slice(0, 10) + ".json",
            "application/json",
          );
          toast("完整曲库已导出，包含原谱图片和修订历史。");
        }),
    );
    $("[data-library-restore]")?.addEventListener("click", () => {
      if (HOSTED) { location.href = "/account.html"; return; }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = () =>
        void cloudAction(async () => {
          const file = input.files?.[0];
          if (!file) return;
          if (file.size > 512 * 1024 * 1024)
            throw new Error("备份文件超过 512 MB。");
          const result = await client.restore(JSON.parse(await file.text()));
          await syncLocalLibrary();
          toast(
            "已恢复 " +
              result.restored.length +
              " 首；保留 " +
              result.conflicts.length +
              " 首现有同 ID 乐谱。",
          );
        });
      input.click();
    });
    $$("[data-revisions]").forEach(
      (button) =>
        (button.onclick = async () => {
          if (HOSTED) { location.href = "/account.html"; return; }
          button.disabled = true;
          try {
            const history = await client.revisions(button.dataset.revisions);
            modal(
              "乐谱修订历史",
              history.length
                ? history
                    .map(
                      (r) =>
                        "<p>修订 " +
                        r.revision +
                        " · " +
                        esc(r.updatedAt) +
                        ' <button class="button secondary" data-restore-revision="' +
                        r.revision +
                        '">恢复为新修订</button></p>',
                    )
                    .join("")
                : "<p>这份乐谱尚无历史修订。</p>",
            );
            $$("[data-restore-revision]").forEach(
              (b) =>
                (b.onclick = () =>
                  void cloudAction(async () => {
                    await client.restoreRevision(
                      button.dataset.revisions,
                      Number(b.dataset.restoreRevision),
                    );
                    await syncLocalLibrary();
                    toast("已恢复为新修订，原历史保留。");
                  })),
            );
          } catch (e) {
            toast(e.message, true);
          } finally {
            button.disabled = false;
          }
        }),
    );
    if (state.libraryTab === "cloud") {
      $("#cloud-library-search").onsubmit = (event) => {
        event.preventDefault();
        state.cloudLibraryDraft = $("#library-query").value;
        state.cloudLibraryQuery = state.cloudLibraryDraft.trim();
        render();
        if (!state.cloudLoaded && !state.cloudBusy) void syncCloudLibrary();
      };
      $("#library-query").oninput = (event) => {
        state.cloudLibraryDraft = event.target.value;
        if (!event.target.value.trim()) {
          state.cloudLibraryQuery = "";
          $("#library-grid").innerHTML = "";
          $("#cloud-search-summary").textContent =
            "输入关键词并搜索后显示曲目。";
          $("#cloud-search-empty")?.remove();
        }
      };
      return;
    }
    $("#library-query").oninput = (e) => {
      const query = e.target.value.toLowerCase();
      $$("[data-card]").forEach(
        (card) =>
          (card.hidden = !card.textContent.toLowerCase().includes(query)),
      );
    };
  }
  return {
    libraryView,
    bindLibrary,
    availableScores,
    remember,
    loadAvailablePracticeSource,
    syncLocalLibrary,
    syncCloudLibrary,
  };
}
