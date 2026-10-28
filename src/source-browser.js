const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const labels = {
  pdf: "PDF",
  image: "图片谱面",
  musicxml: "MusicXML",
  mxl: "MusicXML",
  midi: "MIDI",
  web: "版本网页",
};
const safeUrl = (value) => {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
};

/** Inspect public extracted files/edition pages inside the app before importing. */
export function mountSourceBrowser(
  host,
  { entry, resolve, onSelect, onClose },
) {
  let destroyed = false,
    epoch = 0,
    current = entry,
    history = [],
    rows = [],
    warnings = [],
    type = "all",
    query = "";
  host.classList.add("source-browser");
  host.innerHTML = `<style>.source-browser{font:13px/1.6 system-ui;color:var(--text-1)}.source-browser-toolbar{display:flex;gap:9px;flex-wrap:wrap;margin:14px 0}.source-browser-toolbar input{flex:1;min-width:150px}.source-browser-toolbar input,.source-browser-toolbar select{padding:9px 12px;border:1px solid var(--border);border-radius:7px;background:var(--surface-0)}.source-browser-warning{padding:10px 14px;background:var(--warm-surface);border-radius:7px;color:var(--bronze)}.source-browser-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,235px),1fr));gap:12px;max-height:55vh;overflow:auto;padding:4px 0}.source-browser-card{border:1px solid var(--border);border-radius:9px;padding:14px;min-width:0;display:flex;flex-direction:column;gap:8px}.source-browser-card img{width:100%;height:160px;object-fit:contain;background:var(--surface-2)}.source-browser-card strong{font-size:14px;overflow-wrap:anywhere}.source-browser-card small{color:var(--text-3)}.source-browser-card .button{justify-content:center;margin-top:auto}.source-browser-location{overflow-wrap:anywhere;font-size:12px;color:var(--text-3)}.source-browser-count{font-size:12px;color:var(--text-3)}.source-browser-empty{padding:26px;text-align:center;color:var(--text-3)}</style><p>先筛选版本与素材，再打开原谱预览。PDF可继续逐页查看、排除封面并选择全部谱行。</p><div class="source-browser-location"></div><div class="source-browser-toolbar"><button class="button quiet" data-back disabled>返回上一层</button><input aria-label="筛选谱面名称" placeholder="筛选版本、编配者、文件名…"><select aria-label="谱面文件类型"><option value="all">全部素材</option><option value="piano">钢琴来源明确</option><option value="pdf">PDF</option><option value="image">图片谱面</option><option value="structured">MIDI / MusicXML</option><option value="web">版本网页</option></select></div><div class="source-browser-warning" hidden></div><p class="source-browser-count"></p><div class="source-browser-list"></div>`;
  const $ = (selector) => host.querySelector(selector);
  function render() {
    const visible = rows.filter(
      (row) =>
        (type === "all" ||
          (type === "piano" && row.pianoSourceVerified) ||
          (type === "structured" &&
            ["midi", "mxl", "musicxml"].includes(row.format)) ||
          type === row.format) &&
        `${row.title || ""} ${row.source || ""} ${row.description || ""}`
          .toLowerCase()
          .includes(query),
    );
    $("[data-back]").disabled = !history.length;
    const currentUrl = safeUrl(
      current.format === "web"
        ? current.url || current.sourceUrl
        : current.sourceUrl || current.url,
    );
    $(".source-browser-location").innerHTML = currentUrl
      ? `<a href="${escape(currentUrl)}" target="_blank" rel="noopener noreferrer">在浏览器查看当前原站 ↗</a><br>${escape(currentUrl)}`
      : escape(current.title || "");
    $(".source-browser-count").textContent =
      `${visible.length} / ${rows.length} 个可筛选素材与版本`;
    const warning = $(".source-browser-warning");
    warning.hidden = !warnings.length;
    warning.textContent = warnings.join(" ");
    $(".source-browser-list").innerHTML = visible.length
      ? visible
          .map((row) => {
            const index = rows.indexOf(row),
              isFile = row.format !== "web" && row.importable !== false;
            const image =
              row.format === "image" &&
              typeof row.downloadUrl === "string" &&
              row.downloadUrl.startsWith("/api/")
                ? `<img src="${escape(row.downloadUrl)}" alt="${escape(row.title || "待核验谱面预览")}" loading="lazy">`
                : "";
            const url = safeUrl(
              row.format === "web"
                ? row.url || row.sourceUrl
                : row.sourceUrl || row.url,
            );
            return `<article class="source-browser-card">${image}<small>${escape(labels[row.format] || "版本网页")}${row.preview ? " · 预览范围" : ""}${row.pianoSourceVerified ? " · 钢琴独奏来源" : ""}</small><strong>${escape(row.title || current.title || "谱面素材")}</strong><small>${escape(row.source || "原始谱源")}</small><button class="button secondary" data-source-choice="${index}">${isFile ? (row.format === "pdf" ? "预览全部页并筛选" : ["midi", "mxl", "musicxml"].includes(row.format) ? "导入此版本练习" : "查看原图并筛选") : "继续获取这个版本"}</button>${url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">在浏览器查看原站 ↗</a>` : ""}</article>`;
          })
          .join("")
      : '<div class="source-browser-empty">当前条件下没有素材。可修改筛选条件，或在浏览器查看原站。</div>';
    for (const button of host.querySelectorAll("[data-source-choice]"))
      button.onclick = async () => {
        const row = rows[Number(button.dataset.sourceChoice)];
        if (row.format === "web" || row.importable === false) {
          history.push(current);
          await open(row);
          return;
        }
        button.disabled = true;
        button.textContent = "正在读取谱面…";
        try {
          await onSelect(row);
        } catch (error) {
          button.disabled = false;
          button.textContent = "重试打开谱面";
          warnings = [error.message];
          render();
        }
      };
  }
  async function open(value) {
    const requestEpoch = ++epoch;
    current = value;
    rows = [];
    warnings = [];
    render();
    $(".source-browser-count").textContent = "正在检查公开谱面与版本链接…";
    try {
      const result =
        value.importable && value.format !== "web"
          ? { files: [value] }
          : await resolve(value);
      if (destroyed || requestEpoch !== epoch) return;
      rows = [...(result.files || []), ...(result.links || [])];
      warnings = result.warnings || [];
      render();
    } catch (error) {
      if (!destroyed && requestEpoch === epoch) {
        warnings = [error.message];
        render();
      }
    }
  }
  $("input").oninput = (event) => {
    query = event.target.value.toLowerCase();
    render();
  };
  $("select").onchange = (event) => {
    type = event.target.value;
    render();
  };
  $("[data-back]").onclick = () => {
    const previous = history.pop();
    if (previous) void open(previous);
  };
  void open(entry);
  return {
    destroy() {
      destroyed = true;
      epoch++;
      host.replaceChildren();
    },
    close() {
      onClose?.();
    },
  };
}
