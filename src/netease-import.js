const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export function mountNeteaseImport(
  host,
  { request, onImport, onLocalFile = () => {}, initialShare = "" } = {},
) {
  const controller = new AbortController();
  let destroyed = false,
    pollTimer = null,
    challengeId = null,
    preview = null,
    resolved = null,
    busy = false;
  let status = { configured: false },
    message = "粘贴歌曲或乐谱的分享文字，先获取谱页，再检查完整性。";
  let error = "",
    sheets = [],
    qr = null,
    loginState = "",
    pianoConfirmed = false,
    pageCount = "";
  let share = initialShare;
  const $ = (selector) => host.querySelector(selector);
  const req = (path, body) =>
    request(path, body, { signal: controller.signal });
  function clearPoll() {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  function render() {
    if (destroyed) return;
    host.innerHTML = `<div class="netease-import">
      <div class="nsi-steps"><span>1 获取谱页</span><span>2 核对完整性</span><span>3 整谱识别与校对</span><span>4 播放练习</span></div>
      <div class="nsi-account"><div><strong>网易云音乐</strong><p>${status.configured ? `已保存登录${status.nickname ? " · " + esc(status.nickname) : ""}，获取时验证` : "尚未登录 · 获取谱面内容需要网易云登录"}</p></div><div><button type="button" data-action="login" ${busy ? "disabled" : ""}>${status.configured ? "重新扫码" : "扫码登录"}</button>${status.configured ? '<button type="button" data-action="logout">退出登录</button>' : ""}</div></div>
      <p class="form-note">通过第三方开源接口获取；登录会话仅存于本机服务端。只会读取当前账号可访问的谱页。</p>
      <form data-share-form><label class="field">网易云分享链接<textarea data-share aria-label="网易云分享链接" rows="3" maxlength="6000" placeholder="钢琴谱 -《幻听》 https://163cn.tv/biOuPTpw (@网易云音乐)">${esc(share)}</textarea></label><button class="button primary" type="submit" ${busy ? "disabled" : ""}>${busy ? "正在处理…" : "获取乐谱"}</button></form>
      ${qr ? `<section class="nsi-login" aria-label="网易云扫码登录"><img src="${esc(qr)}" alt="网易云音乐登录二维码"><div><h3>使用网易云音乐 App 扫码</h3><p>${esc(loginState)}</p><button type="button" data-action="cancel-login">取消扫码</button></div></section>` : ""}
      <p class="nsi-status" role="status" aria-live="polite">${esc(message)}</p>${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ""}
      ${sheets.length ? `<section class="nsi-editions"><h3>选择钢琴谱版本</h3>${sheets.map((sheet, index) => `<article><div><strong>${esc(sheet.title)}</strong><p>${esc(sheet.instrument || "乐器信息待核验")}${sheet.pages ? " · " + sheet.pages + " 页" : ""}${sheet.pianoEvidence ? " · 来源包含钢琴标记" : ""}</p></div><button type="button" data-sheet-index="${index}" ${busy ? "disabled" : ""}>查看谱页</button></article>`).join("")}</section>` : ""}
      ${
        preview
          ? `<section class="nsi-preview"><div class="nsi-preview-heading"><h3>${esc(preview.title)}</h3><span>已返回 ${preview.pagesFound} 页 / 来源总页数 ${preview.totalPages ?? "未知"}</span></div><p class="nsi-integrity ${preview.integrity.status}">${preview.integrity.status === "complete" ? "接口页数一致，仍需核验谱面内容" : preview.integrity.status === "incomplete" ? "谱页不完整，暂不能导入全谱" : "总页数待核验"}${preview.integrity.reasons.length ? "：" + esc(preview.integrity.reasons.join("；")) : ""}</p>
      <div class="nsi-pages">${preview.pages.map((page) => `<figure><a href="${esc(page.url)}" target="_blank" rel="noopener"><img src="${esc(page.url)}" alt="原谱第 ${page.number} 页" loading="lazy"></a><figcaption>第 ${page.number} 页 · 点击查看大图</figcaption></figure>`).join("")}</div><p data-image-errors class="form-error" role="alert"></p>
      <label class="nsi-confirm"><input type="checkbox" data-piano ${pianoConfirmed ? "checked" : ""}> 我已查看谱页，确认是钢琴双手五线谱，页面顺序正确</label>
      ${preview.integrity.status === "unknown" ? `<label class="field">对照原站确认的乐谱总页数<input data-page-count aria-label="原站乐谱总页数" type="number" min="1" max="200" step="1" value="${esc(pageCount)}" placeholder="必须与实际返回的谱页数相同"></label>` : ""}
      <button type="button" class="button primary" data-action="import" ${busy || !canImport() ? "disabled" : ""}>获取全部谱页并进入整谱识别</button><p class="form-note">接下来检查全部页面、逐行识谱与校对，确认后才会加入曲库。获取图片不代表音符已识别准确。</p></section>`
          : ""
      }
      <div class="nsi-footer"><button type="button" class="text-button" data-action="local">改为上传本地 PDF / 乐谱图片</button><small>不补写缺页；无法识别的接口格式会明确报错。</small></div>
    </div>`;
    $("[data-share]").oninput = (e) => {
      share = e.target.value;
    };
    $("[data-share-form]").onsubmit = (e) => {
      e.preventDefault();
      void resolveShare();
    };
    $('[data-action="login"]').onclick = () => void login();
    $('[data-action="logout"]')?.addEventListener("click", () => void logout());
    $('[data-action="cancel-login"]')?.addEventListener("click", cancelLogin);
    $('[data-action="local"]').onclick = onLocalFile;
    host
      .querySelectorAll("[data-sheet-index]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            void loadPreview(sheets[Number(button.dataset.sheetIndex)].id)),
      );
    $("[data-piano]")?.addEventListener("change", (e) => {
      pianoConfirmed = e.target.checked;
      updateImportButton();
    });
    $("[data-page-count]")?.addEventListener("input", (e) => {
      pageCount = e.target.value;
      updateImportButton();
    });
    $('[data-action="import"]')?.addEventListener(
      "click",
      () => void importPdf(),
    );
    const failed = new Set();
    const updateErrors = () => {
      const note = $("[data-image-errors]");
      if (note)
        note.textContent = failed.size
          ? `有 ${failed.size} 页加载失败，请点击对应页的重试按钮。仍失败时重新获取乐谱；导入时服务端会校验全部图片。`
          : "";
    };
    host.querySelectorAll(".nsi-pages img").forEach((image, index) => {
      const retry = host.ownerDocument.createElement("button");
      retry.type = "button";
      retry.dataset.retryPage = String(index + 1);
      retry.textContent = "重试此页";
      retry.hidden = true;
      image.closest("figure").append(retry);
      image.onload = () => {
        failed.delete(index);
        retry.hidden = true;
        image.alt = `原谱第 ${index + 1} 页`;
        updateErrors();
      };
      image.onerror = () => {
        failed.add(index);
        image.alt = "此页加载失败，请重试";
        retry.hidden = false;
        retry.disabled = false;
        retry.textContent = "重试此页";
        updateErrors();
      };
      retry.onclick = () => {
        retry.disabled = true;
        retry.textContent = "正在重试…";
        image.src =
          preview.pages[index].url +
          (preview.pages[index].url.includes("?") ? "&" : "?") +
          "retry=" +
          Date.now();
      };
    });
  }
  function canImport() {
    return (
      preview &&
      pianoConfirmed &&
      preview.integrity.status !== "incomplete" &&
      (preview.integrity.status === "complete" ||
        Number(pageCount) === preview.pagesFound)
    );
  }
  function updateImportButton() {
    const button = $('[data-action="import"]');
    if (button) button.disabled = busy || !canImport();
  }
  async function run(action) {
    if (busy || destroyed) return;
    busy = true;
    error = "";
    render();
    try {
      await action();
    } catch (e) {
      if (destroyed || e.name === "AbortError") return;
      error = e.message;
      if (e.code === "NETEASE_LOGIN_REQUIRED") {
        status.configured = false;
        message = "请点击扫码登录，完成后再次获取乐谱。";
      }
    } finally {
      busy = false;
      render();
    }
  }
  async function resolveShare() {
    await run(async () => {
      preview = null;
      sheets = [];
      pianoConfirmed = false;
      pageCount = "";
      resolved = await req("/api/netease/resolve", { share });
      if (resolved.kind === "sheet") await previewRequest(resolved.sheetId);
      else {
        sheets = resolved.sheets;
        message = sheets.length
          ? `找到 ${sheets.length} 份乐谱，请选择钢琴谱版本。`
          : "这首歌曲没有返回可用的乐谱版本。";
      }
    });
  }
  async function previewRequest(sheetId) {
    preview = await req("/api/netease/preview", {
      sheetId,
      sourceUrl: resolved.sourceUrl,
    });
    pianoConfirmed = false;
    pageCount = "";
    message = `已取得谱页清单：${preview.pagesFound} 页。请查看原谱并检查总页数。`;
  }
  async function loadPreview(sheetId) {
    await run(() => previewRequest(sheetId));
  }
  async function importPdf() {
    await run(async () => {
      message = "正在读取并校验全部原始谱页，合并后进入整谱识别…";
      render();
      const result = await request(
        "/api/netease/pdf",
        {
          id: preview.id,
          pianoConfirmed,
          confirmedPageCount:
            preview.integrity.status === "unknown"
              ? Number(pageCount)
              : undefined,
        },
        { signal: controller.signal, binary: true },
      );
      if (destroyed) return;
      const file = new File([result.blob], result.filename, {
        type: "application/pdf",
      });
      await onImport(file, result.source);
    });
  }
  async function login() {
    await run(async () => {
      cancelLogin();
      const result = await req("/api/netease/login/start", {});
      if (destroyed) return;
      challengeId = result.id;
      qr = result.image;
      loginState = "等待扫码；二维码有效期约 3 分钟。";
      message = "请在手机网易云音乐中扫码，并由你确认登录。";
      schedulePoll();
    });
  }
  function schedulePoll() {
    clearPoll();
    if (!destroyed && challengeId)
      pollTimer = setTimeout(() => void poll(), 2500);
  }
  async function poll() {
    const id = challengeId;
    if (!id || destroyed) return;
    try {
      const result = await req("/api/netease/login/check", { id });
      if (destroyed || challengeId !== id) return;
      if (result.state === "authorized") {
        clearPoll();
        challengeId = null;
        qr = null;
        status = { configured: true, nickname: result.nickname };
        message = "网易云登录已保存。请点击获取乐谱继续。";
      } else if (result.state === "expired") {
        clearPoll();
        challengeId = null;
        qr = null;
        message = "二维码已过期，请重新扫码。";
      } else {
        loginState =
          result.state === "scanned"
            ? "已扫码，请在手机中确认登录。"
            : "等待扫码…";
        schedulePoll();
      }
      // Update only the login panel; do not replace a share link being edited.
      if (result.state === "waiting" || result.state === "scanned") {
        const p = $(".nsi-login p");
        if (p) p.textContent = loginState;
      } else render();
    } catch (e) {
      if (!destroyed && challengeId === id) {
        clearPoll();
        challengeId = null;
        qr = null;
        error = e.message;
        render();
      }
    }
  }
  function cancelLogin() {
    clearPoll();
    const id = challengeId;
    challengeId = null;
    qr = null;
    if (id) request("/api/netease/login/cancel", { id }).catch(() => {});
    if (!destroyed) render();
  }
  async function logout() {
    await run(async () => {
      cancelLogin();
      await req("/api/netease/logout", {});
      status = { configured: false };
      preview = null;
      sheets = [];
      message = "已删除本机保存的网易云登录。";
    });
  }
  render();
  const ready = req("/api/netease/status")
    .then((result) => {
      status = result;
      render();
    })
    .catch((e) => {
      if (!destroyed) {
        error = e.message;
        render();
      }
    });
  return {
    ready,
    destroy() {
      destroyed = true;
      cancelLogin();
      controller.abort();
      host.innerHTML = "";
    },
  };
}
