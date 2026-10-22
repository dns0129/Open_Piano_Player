import { $, esc, icon, refreshIcons } from "./ui.js";
import { STATIC_NOTICE } from "./capabilities.js";
import { preserveOriginalFile } from "./library.js";
import { assetURL } from "../lib/asset-url.mjs";
import { validateScore } from "../lib/score.mjs";
import { scoreSection } from "../lib/instrument-sections.mjs";

// Score import, AI recognition, NetEase import, full-PDF review and AI settings.
// The parsers and review screens load on first use to keep them out of the startup bundle.
export function createImportFlows({
  state,
  capabilities,
  player,
  api,
  apiClient,
  modal,
  closeModal,
  requestCloseModal,
  modalEpoch,
  setModalCleanup,
  toast,
  remember,
  setScore,
  refreshStatus,
  syncLocalLibrary,
  taskVault,
  recognitionClient,
  isAudioFile,
  receiveAudio,
  openSearch,
  safeLink,
}) {
  function providerOptions() {
    return `<option value="pi">GPT-6.1 Sol high · ChatGPT 订阅</option><option value="deepseek">DeepSeek Flash high · API</option>`;
  }
  async function openAI(attachment = null) {
    if (!capabilities.recognition) {
      toast(STATIC_NOTICE, true);
      return;
    }
    if (!attachment) return openSearch();
    modal(
      "选择识谱范围",
      '<p class="form-note">正在读取原图、检测双手谱行…</p>',
    );
    const openingEpoch = modalEpoch();
    let selector = null,
      currentPage = 0,
      pageLoading = false,
      disposed = false;
    const preparedPages = new Map();
    const cleanup = () => {
      disposed = true;
      selector?.destroy();
      for (const prepared of preparedPages.values()) prepared.destroy();
      attachment.destroy?.();
    };
    setModalCleanup(cleanup);
    try {
      const { prepareScoreImage, mountScoreImageSelector } =
        await import("./score-image.js");
      const totalPages = attachment.totalPages || attachment.images.length;
      const pageNumber = (index) =>
        totalPages === 1 ? attachment.source?.page || 1 : index + 1;
      const preparePage = async (index) => {
        if (preparedPages.has(index)) return preparedPages.get(index);
        const image =
          attachment.images[index] || (await attachment.loadPage(index + 1));
        const prepared = await prepareScoreImage(
          `data:${image.mimeType};base64,${image.data}`,
          {
            page: pageNumber(index),
            pianoSourceVerified:
              attachment.source?.pianoSourceVerified === true,
            sourceLabel:
              attachment.source?.instrumentEvidence ||
              attachment.source?.label ||
              "",
          },
        );
        if (disposed) {
          prepared.destroy();
          return null;
        }
        preparedPages.set(index, prepared);
        return prepared;
      };
      const first = await preparePage(0);
      if (disposed || openingEpoch !== modalEpoch()) return;
      // Replace only the loading body, retaining its cleanup ownership.
      const section = $(".modal");
      section.innerHTML = `<div class="modal-heading"><div><h2>选择识谱范围</h2><p>先识别清楚的小节，再导入练习。</p></div><button id="modal-close" class="icon-button" aria-label="关闭">${icon("x")}</button></div><form id="ai-form"><div class="ocr-file-heading"><strong>${esc(attachment.name)}</strong>${attachment.source ? safeLink(attachment.source.url, "原始来源") : ""}</div>${totalPages > 1 ? `<label class="field ocr-page-picker">谱面页<select id="ocr-page" aria-label="谱面页">${Array.from({ length: totalPages }, (_, i) => `<option value="${i}">第 ${i + 1} 页 / 共 ${totalPages} 页</option>`).join("")}</select></label>` : ""}<div id="score-image-host"></div><p id="ocr-scope-summary" class="ocr-scope-summary" role="status"></p><label class="field">乐谱名称<input name="title" maxlength="150" value="${esc(attachment.source?.songName || attachment.name.replace(/\.[^.]+$/, ""))}" required></label><label class="field">识谱说明<textarea name="prompt" rows="2" maxlength="3000" placeholder="保留两只手和原谱节奏；后续谱行可补充调号、拍号、速度。"></textarea></label><label class="field">识谱服务<select name="provider">${providerOptions()}</select></label><p class="form-note">仅转写选定范围，不补写缺页。框选时请包含完整小节、两只手与谱号。AI 结果仍需对照原图校对。</p><div id="ai-error" class="form-error" role="alert"></div><button class="button primary full" type="submit">${icon("file-music")}识别选段并导入</button></form>`;
      $("#modal-close").onclick = requestCloseModal;
      function updateScope(options = selector?.getSelectionOptions()) {
        const info = $("#ocr-scope-summary");
        if (!options || !info) return;
        const submit = $("#ai-form button[type=submit]");
        if (submit)
          submit.disabled = state.busy || pageLoading || !options.canRequestOcr;
        info.textContent = `第 ${pageNumber(currentPage)} 页 · ${options.mode === "page" ? "当前整页" : options.mode === "manual" ? "手动选段" : `${options.selectedSystemIds.length} 行`} · ${options.canRequestOcr ? "钢琴谱结构已核验 · 导入后标注为片段" : "素材待核验"}`;
      }
      function mount(prepared) {
        selector?.destroy();
        selector = mountScoreImageSelector($("#score-image-host"), prepared, {
          onChange: updateScope,
        });
        updateScope();
      }
      mount(first);
      refreshIcons();
      $("#ocr-page")?.addEventListener("change", async (e) => {
        const index = Number(e.target.value);
        pageLoading = true;
        e.target.disabled = true;
        $("#ai-form button[type=submit]").disabled = true;
        $("#ai-error").textContent = "";
        try {
          const prepared = await preparePage(index);
          if (disposed) return;
          currentPage = index;
          mount(prepared);
          for (const [key, cached] of preparedPages)
            if (key !== index) {
              cached.destroy();
              preparedPages.delete(key);
            }
        } catch (error) {
          if (!disposed) {
            $("#ai-error").textContent = error.message;
            e.target.value = currentPage;
          }
        } finally {
          pageLoading = false;
          if (!disposed) {
            e.target.disabled = false;
            updateScope();
          }
        }
      });
      $("#ai-form").onsubmit = async (e) => {
        e.preventDefault();
        if (state.busy || pageLoading) return;
        const fd = new FormData(e.target),
          button = $("#ai-form button[type=submit]");
        $("#ai-error").textContent = "";
        try {
          const chunks = selector.getSelection();
          if (!chunks.length)
            throw new Error("请至少选择一个完整谱行或手动框选小节。");
          if (chunks.length > 4)
            throw new Error("一次最多选择 4 个谱行，建议从一行开始识别。");
          const indices = chunks
            .flatMap((c) => c.region.systemIndices)
            .sort((a, b) => a - b);
          if (indices.some((n, i) => i > 0 && n !== indices[i - 1] + 1))
            throw new Error("请选择连续的谱行，避免把跳过的小节拼成连续乐谱。");
          const selection = selector.getSelectionOptions();
          const scopeLabel = `第 ${pageNumber(currentPage)} 页 · ${selection.mode === "page" ? "当前整页" : selection.mode === "manual" ? "手动选段" : `第 ${indices.map((i) => i + 1).join("、")} 行`}`;
          state.busy = true;
          state.abort = new AbortController();
          button.innerHTML =
            icon("loader-circle", "spin") + "正在识别选定范围…";
          button.disabled = true;
          $("#ocr-page")?.setAttribute("disabled", "");
          $("#score-image-host").inert = true;
          refreshIcons();
          const result = await api(
            "/api/generate",
            {
              provider: fd.get("provider"),
              mode: "ocr",
              scope: "selection",
              scopeLabel,
              title: `${String(fd.get("title")).trim()} · ${scopeLabel}`,
              prompt: String(
                fd.get("prompt") ||
                  "忠实识别选定范围中的完整小节，保留两只手和原谱节奏，不补写其他页面。",
              ),
              images: chunks.map(({ data, mimeType }) => ({ data, mimeType })),
            },
            state.abort.signal,
          );
          if (disposed) return;
          const score = validateScore(result.score);
          // The excerpt scope is visible even if a model returns only the song title.
          score.title = `${String(fd.get("title")).trim()} · ${scopeLabel}`;
          if (attachment.source)
            score.source = {
              ...attachment.source,
              kind: "image-ai",
              label: `${attachment.source.label} · ${scopeLabel} · AI 识谱，需校对`,
            };
          await remember(score);
          state.busy = false;
          closeModal();
          setScore(score, [
            ...chunks.flatMap((c) => c.warnings),
            ...(result.warnings || []),
          ]);
          toast("选段已导入练习室，请对照原图试听校对。");
        } catch (error) {
          state.busy = false;
          if (disposed || error.name === "AbortError") return;
          $("#ai-error").textContent = error.message;
          button.innerHTML = icon("file-music") + "重新识别选段";
          updateScope();
          $("#ocr-page")?.removeAttribute("disabled");
          $("#score-image-host").inert = false;
          refreshIcons();
        }
      };
    } catch (error) {
      if (disposed) return;
      closeModal();
      toast(error.message || "无法读取谱面图片", true);
    }
  }

  async function openSettings() {
    await refreshStatus();
    const pi = state.status?.pi,
      ds = state.status?.deepseek;
    modal(
      "AI 与设置",
      `<div class="provider-card"><div class="provider-heading"><span class="provider-logo">π</span><div><h3>Pi Agent / ChatGPT</h3><p>${pi?.available ? "已发现本机登录 · 可发起请求验证" : "尚未发现可用本机登录"}</p></div><span class="connection-dot ${pi?.available ? "connected" : ""}"></span></div><p class="form-note">复用本机 Pi / Codex 的登录。登录凭据仅在本机服务端使用，实际可用额度由账户决定。</p></div><form id="settings-form"><label class="field">谱面识别模型<input name="piModel" value="gpt-6.1-sol" readonly aria-label="固定识谱模型"></label><p class="form-note">GPT-6.1 Sol · high。识别与独立核对均使用此模型，通过 Pi Agent 使用你的 ChatGPT 订阅额度。</p><div class="provider-card"><div class="provider-heading"><span class="provider-logo deepseek">D</span><div><h3>DeepSeek</h3><p>${ds?.configured ? "已配置 API Key" : "等待配置 API Key"}</p></div></div><label class="field">API Key<input type="password" name="deepseekApiKey" placeholder="${ds?.configured ? "留空保留已保存的密钥" : "输入你的 DeepSeek API Key"}" autocomplete="off"></label><label class="field">模型<input name="deepseekModel" value="${esc(ds?.model || "deepseek-flash")}" maxlength="120"></label><p class="form-note">密钥保存在本机私有配置中，不写入浏览器存储。DeepSeek Flash high 与 Pi 共用识谱、独立核对与人工校对流程；DeepSeek 使用 API 余额。</p>${ds?.configured ? '<button id="clear-key" class="text-button danger" type="button">移除已保存的 Key</button>' : ""}</div><div id="settings-error" class="form-error"></div><button class="button primary full" type="submit">${icon("check")}保存设置</button></form><div class="piano-credit"><strong>乐器音源</strong><p>钢琴：Salamander Grand Piano · Alexander Holm · CC BY 3.0。醇厚、A3、KAWAI GX-2 / SK-2、YAMAHA GC1、Steinway Model 40 均为此采样库的调音预设，并非对应型号原琴采样。<a href="${assetURL("/audio/piano/ATTRIBUTION.txt")}" target="_blank" rel="noopener">钢琴音源说明</a></p><p>小提琴与弦乐合奏：VSCO 2 Community Edition · Sam Gossner / Simon Dalzell · CC0。<a href="${assetURL("/audio/violin/ATTRIBUTION.txt")}" target="_blank" rel="noopener">小提琴说明</a> · <a href="${assetURL("/audio/strings/ATTRIBUTION.txt")}" target="_blank" rel="noopener">弦乐说明</a></p></div>`,
    );
    $("#settings-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const body = {
          piModel: fd.get("piModel"),
          deepseekModel: fd.get("deepseekModel"),
        };
        if (String(fd.get("deepseekApiKey")).trim())
          body.deepseekApiKey = String(fd.get("deepseekApiKey")).trim();
        await api("/api/settings", body);
        await refreshStatus();
        closeModal();
        toast("AI 设置已保存");
      } catch (err) {
        $("#settings-error").textContent = err.message;
      }
    };
    $("#clear-key")?.addEventListener("click", async () => {
      try {
        await api("/api/settings", { clearDeepseekApiKey: true });
        await refreshStatus();
        openSettings();
        toast("已移除 DeepSeek Key");
      } catch (e) {
        toast(e.message, true);
      }
    });
  }
  function openImportChooser() {
    if (capabilities.coreOnly || state.section === "guitar") {
      $("#file-input").accept = ".xml,.musicxml,.mxl,.mid,.midi,.json";
      $("#file-input").click();
      return;
    }
    $("#file-input").accept =
      ".xml,.musicxml,.mxl,.mid,.midi,.json,.pdf,.png,.jpg,.jpeg,.webp";
    modal(
      "导入乐谱",
      '<div class="import-choices"><button class="import-choice" data-import-local><strong>上传本地乐谱</strong><span>PDF、乐谱图片、MusicXML 或 MIDI</span></button><button class="import-choice" data-import-netease><strong>粘贴网易云分享链接</strong><span>查看谱页与总页数，核验后进入整谱识别</span></button></div>',
      "选择乐谱来源",
    );
    $("[data-import-local]").onclick = () => {
      closeModal();
      $("#file-input").click();
    };
    $("[data-import-netease]").onclick = () => openNeteaseImport();
  }
  async function openNeteaseImport() {
    if (!capabilities.netease) {
      toast(STATIC_NOTICE, true);
      return;
    }
    modal(
      "网易云乐谱导入",
      '<div id="netease-import-host"></div>',
      "粘贴分享链接 → 获取全部谱页 → 整谱识别、校对与练习",
    );
    $(".modal").classList.add("netease-modal");
    const epoch = modalEpoch();
    const { mountNeteaseImport } = await import("./netease-import.js");
    if (epoch !== modalEpoch()) return;
    async function request(path, body, options = {}) {
      if (!options.binary) return api(path, body, options.signal);
      const response = await apiClient.response(path, {
        body,
        signal: options.signal,
      });
      return {
        blob: await response.blob(),
        filename: decodeURIComponent(
          response.headers.get("x-score-filename") || "netease-score.pdf",
        ),
        source: JSON.parse(
          decodeURIComponent(
            response.headers.get("x-score-source") || "%7B%7D",
          ),
        ),
      };
    }
    const view = mountNeteaseImport($("#netease-import-host"), {
      request,
      onImport: (file, source) => openFullPdf(file, source),
      onLocalFile: () => {
        closeModal();
        $("#file-input").click();
      },
    });
    setModalCleanup(() => view.destroy());
  }
  async function receiveFile(file, source = null) {
    const importSection = state.section;
    if (
      state.section === "guitar" &&
      /\.(pdf|png|jpe?g|webp)$/i.test(file.name)
    )
      return toast(
        "吉他第一版支持 MusicXML、MIDI 和 JSON，请导入数字乐谱。",
        true,
      );
    if (isAudioFile(file)) {
      if (state.section === "guitar")
        return toast("吉他第一版支持数字乐谱导入。", true);
      return receiveAudio(file);
    }
    const maxMb = /\.pdf$/i.test(file.name) ? 50 : 20;
    if (file.size > maxMb * 1024 * 1024)
      return toast(`文件超过 ${maxMb} MB，请压缩或拆分后导入。`, true);
    player.pause();
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
        const data = await fileDataURL(file);
        openAI({
          name: file.name,
          source,
          images: [
            { data: data.split(",")[1], mimeType: file.type || "image/png" },
          ],
        });
        return;
      }
      if (ext === "pdf") {
        toast("正在读取 PDF 乐谱…");
        openFullPdf(file, source);
        return;
      }
      toast("正在读取乐谱…");
      const { importScore } = await import("../lib/importers.mjs");
      const imported = await importScore(await file.arrayBuffer(), file.name);
      const score = validateScore({
        ...imported.score,
        instrument: imported.score.instrument || importSection,
      });
      const warnings = imported.warnings;
      if (scoreSection(score) === "guitar")
        warnings.push(
          "六线谱按标准调弦自动建议指法；未保留原谱的弦号、品位及吉他专用奏法，请核对后使用。",
        );
      await remember(score, undefined, await preserveOriginalFile(file));
      setScore(score, warnings);
      toast("乐谱已导入，点击播放即可练习。");
    } catch (e) {
      toast(e.message || "无法读取乐谱", true);
    }
  }
  async function openFullScoreTasks() {
    if (!capabilities.recognition) {
      toast(STATIC_NOTICE, true);
      return;
    }
    await taskVault.initialize();
    modal(
      "整谱识别任务",
      '<div id="full-score-tasks"><p>正在读取本机保存的任务…</p></div>',
      "已完成的谱行会保留；关闭或重启后可继续校对。",
    );
    const host = $("#full-score-tasks"),
      epoch = modalEpoch(),
      service = recognitionClient,
      ids = taskVault.ids().slice(-30).reverse();
    await refreshStatus();
    if (epoch !== modalEpoch()) return;
    const reports = await Promise.allSettled(
      ids.map((id) => service.getJob(id)),
    );
    if (epoch !== modalEpoch()) return;
    const jobs = reports
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);
    const failures = reports.filter((r) => r.status === "rejected");
    host.innerHTML =
      (jobs.length
        ? jobs
            .map(
              (job, index) =>
                `<article class="task-list-row"><div><strong>${esc(job.title)}</strong><p>${job.totalPages}页 · ${job.progress.confirmed}/${job.progress.total}行已确认 · ${job.status === "running" ? "识别中" : job.status === "complete" ? "已校对完成" : job.status === "failed" ? "需要重试" : "待继续"}</p></div><button class="button secondary" data-resume-fullscore="${index}">继续查看与校对</button></article>`,
            )
            .join("")
        : !ids.length
          ? '<p class="form-note">还没有整谱识别任务。上传一份多页钢琴谱PDF即可开始。</p>'
          : "") +
      (failures.length
        ? `<p class="form-note">${failures.length}个任务未能读取：${esc(failures[0].reason?.message || "请检查本机服务并重试")}</p>`
        : "") +
      '<details><summary>用恢复码打开本机任务</summary><p class="form-note">用于恢复已保存在这台电脑上的原谱和校对结果。恢复码含任务访问凭据，请仅在本机使用。</p><label class="form-label">任务恢复码<input class="form-input" type="password" autocomplete="off" aria-label="任务恢复码" data-fullscore-recovery></label><button class="button secondary" data-restore-fullscore>恢复识谱任务</button><p class="form-note" role="status" data-recovery-status></p></details>';
    $("[data-restore-fullscore]").onclick = async () => {
      const button = $("[data-restore-fullscore]"),
        input = $("[data-fullscore-recovery]"),
        message = $("[data-recovery-status]"),
        code = input.value;
      button.disabled = true;
      input.value = "";
      message.textContent = "正在读取本机保存的任务…";
      try {
        const job = await service.restoreJob(code);
        const blob = await service.readDocument(job.id);
        if (epoch !== modalEpoch()) return;
        openFullPdf(
          new File([blob], job.originalPdf?.name || job.title + ".pdf", {
            type: "application/pdf",
          }),
          job.metadata.source,
          job,
        );
      } catch (error) {
        if (epoch === modalEpoch()) {
          message.textContent = error.message;
          button.disabled = false;
        }
      }
    };
    for (const button of host.querySelectorAll("[data-resume-fullscore]"))
      button.onclick = async () => {
        const job = jobs[Number(button.dataset.resumeFullscore)];
        button.disabled = true;
        button.textContent = "正在读取原谱…";
        try {
          const blob = await service.readDocument(job.id);
          if (epoch !== modalEpoch()) return;
          openFullPdf(
            new File([blob], job.originalPdf?.name || job.title + ".pdf", {
              type: "application/pdf",
            }),
            job.metadata.source,
            job,
          );
        } catch (error) {
          toast(error.message, true);
          button.disabled = false;
          button.textContent = "重试打开";
        }
      };
  }
  async function openFullPdf(file, source, resumeJob = null) {
    if (!capabilities.recognition) {
      toast(STATIC_NOTICE, true);
      return;
    }
    modal(
      "完整钢琴谱导入",
      '<div id="full-score-host"></div>',
      "检查全部页面 → 自动识谱 → 对照校对 → 导入练习",
    );
    $(".modal").classList.add("full-score-modal");
    const epoch = modalEpoch();
    const { mountFullScoreImport } = await import("./full-score-import.js");
    if (epoch !== modalEpoch()) return;
    const controller = mountFullScoreImport($("#full-score-host"), {
      file,
      source: source || {},
      resumeJob,
      api: recognitionClient,
      onClose: closeModal,
      onImport: async (result) => {
        const score = validateScore({
          ...result.score,
          source: {
            ...result.score.source,
            kind:
              result.reviewStatus?.method === "ai-unreviewed"
                ? "full-score-ai-draft"
                : result.reviewStatus?.complete === false
                  ? "pdf-excerpt-reviewed"
                  : "full-pdf-reviewed",
          },
        });
        await syncLocalLibrary();
        const sourceRecord = {
          reference: {
            id: score.id,
            durationBeats: score.durationBeats,
            keySignature: score.keySignature,
            timeSignature: score.timeSignature,
            notes: score.notes
              .map((n) => [n.id, n.beat, n.duration, n.midi, n.hand])
              .sort((a, b) => a[0].localeCompare(b[0])),
          },
          notation: result.sourceNotation,
          assets: result.assets,
          warnings: result.warnings,
          reviewStatus: result.reviewStatus,
        };
        await remember(score, sourceRecord);
        setScore(score, result.warnings || []);
        toast(
          `${result.reviewStatus?.method === "ai-unreviewed" ? "AI草稿已导入（待校对）" : "完整谱已导入"}：${score.notes.length}个音符，已重排为可编辑数字谱。`,
        );
      },
    });
    setModalCleanup(() => controller.destroy());
  }
  function fileDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  return {
    openAI,
    openSettings,
    openImportChooser,
    receiveFile,
    openFullScoreTasks,
    openFullPdf,
    fileDataURL,
  };
}
