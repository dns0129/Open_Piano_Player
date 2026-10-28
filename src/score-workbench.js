import { renderNotation } from "./notation.js";
import { PianoPlayer } from "./audio.js";
import { detectScoreSystems } from "../lib/score-image-layout.mjs";
import {
  snapStaffTarget,
  sourceGrid,
  pagePlayback,
} from "../lib/score-workbench.mjs";
import { midiName } from "../lib/score.mjs";
const NS = "http://www.w3.org/2000/svg";
const esc = (v) =>
  String(v ?? "").replace(
    /[<>&"']/g,
    (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const svgNode = (tag, attrs) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {}))
    el.setAttribute(k, String(v));
  return el;
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** Two editors supply data and a commit callback; rendering and drag semantics live here. */
export function mountScoreWorkbench(
  host,
  {
    read,
    onEdit,
    onUndo,
    onRedo,
    onSave,
    onClose,
    onDetails,
    onPageChange,
    initialPage = 1,
    audio: providedAudio,
    instrument = "synth",
    overlay = false,
  } = {},
) {
  const root = document.createElement("section");
  root.className = "score-workbench" + (overlay ? " swe-overlay" : "");
  root.setAttribute("aria-label", "整页乐谱对照修改");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  host.replaceChildren(root);
  let pageIndex = 0,
    selected = null,
    drag = null,
    disposed = false,
    busy = false,
    playing = false,
    renderVersion = 0,
    views = [],
    sourceView = null,
    step = 0.25,
    zoom = 1,
    syncScroll = true,
    detailsDispose = null;
  const calibrated = new Map(),
    pendingCalibration = new Set(),
    ownedURLs = [];
  const initial = read();
  let pageSnapshot = initial;
  pageIndex = Math.max(
    0,
    initial.pages.findIndex((p) => p.page === initialPage),
  );
  const player = providedAudio
    ? null
    : new PianoPlayer({
        instrument,
        onStateChange: (s) => {
          playing = s === "playing";
          updatePlayButton();
        },
        onFrame: (beat) => {
          let offset = 0;
          for (const view of views) {
            view.renderer?.setBeat(
              clamp(beat - offset, 0, view.system.score.durationBeats),
            );
            offset += view.system.score.durationBeats;
          }
        },
      });
  const stop = () => {
    providedAudio?.stop?.();
    player?.stop();
    player?.stopPreview();
    playing = false;
    updatePlayButton();
  };
  const current = () => pageSnapshot.pages[pageIndex];
  const selectedItem = () => {
    const system = current()?.systems.find((s) => s.id === selected?.systemId);
    const note = system?.score?.notes.find((n) => n.id === selected?.noteId);
    return { system, note };
  };
  const status = (message, error = false) => {
    const el = root.querySelector("[data-swe-status]");
    if (el) {
      el.textContent = message;
      el.classList.toggle("swe-error", error);
    }
  };
  function updatePlayButton() {
    const button = root.querySelector('[data-swe-action="play-page"]');
    if (button) button.textContent = playing ? "停止当前页" : "播放当前页";
  }
  function clearViews() {
    for (const view of views) view.renderer?.destroy();
    views = [];
    sourceView = null;
  }
  function pointIn(svg, e) {
    const r = svg.getBoundingClientRect(),
      box = svg.viewBox?.baseVal;
    const width =
        box?.width || Number(svg.getAttribute("viewBox")?.split(/\s+/)[2]),
      height =
        box?.height || Number(svg.getAttribute("viewBox")?.split(/\s+/)[3]);
    if (
      !r.width ||
      !r.height ||
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      return null;
    return {
      x: ((e.clientX - r.left) / r.width) * width,
      y: ((e.clientY - r.top) / r.height) * height,
      width,
      height,
    };
  }
  function select(systemId, noteId) {
    selected = { systemId, noteId };
    for (const h of root.querySelectorAll("[data-swe-note]"))
      h.classList.toggle(
        "is-selected",
        h.dataset.sweSystem === systemId && h.dataset.sweNote === noteId,
      );
    const { system, note } = selectedItem();
    const out = root.querySelector("[data-swe-selection]");
    if (out)
      out.textContent = note
        ? `${midiName(note.midi)} · 第 ${Number((note.beat + 1).toFixed(4))} 拍`
        : "请选择音符";
    const audition = root.querySelector('[data-swe-action="audition"]');
    if (audition) audition.disabled = !note || busy;
    const duration = root.querySelector("[data-swe-duration]");
    if (duration) {
      duration.disabled = !note;
      duration.value = note?.duration ?? 1;
    }
    highlightOriginal(system, note);
  }
  function highlightOriginal(system, note) {
    sourceView?.svg
      .querySelectorAll(".swe-source-head")
      .forEach((e) => e.remove());
    if (!system?.source || !note || !sourceView) return;
    const point = system.source.notes?.find((n) => n.noteId === note.id);
    if (point)
      sourceView.svg.append(
        svgNode("ellipse", {
          cx: point.x,
          cy: point.y,
          rx: 9,
          ry: 7,
          class: "swe-source-head",
        }),
      );
  }
  function drawGhost(target) {
    for (const el of root.querySelectorAll("[data-swe-ghost]")) el.remove();
    if (!target) return;
    const g = svgNode("g", { "data-swe-ghost": "", "aria-hidden": "true" });
    g.append(
      svgNode("line", {
        x1: target.x,
        y1: target.y - 26,
        x2: target.x,
        y2: target.y + 26,
        class: "swe-target-guide",
      }),
      svgNode("line", {
        x1: target.x - 22,
        y1: target.y,
        x2: target.x + 22,
        y2: target.y,
        class: "swe-target-guide",
      }),
      svgNode("ellipse", {
        cx: target.x,
        cy: target.y,
        rx: 7,
        ry: 4.5,
        transform: `rotate(-18 ${target.x} ${target.y})`,
        class: "swe-ghost",
      }),
      svgNode("line", {
        x1: target.x + 6,
        y1: target.y,
        x2: target.x + 6,
        y2: target.y - 28,
        class: "swe-ghost-ledger",
      }),
    );
    target.svg.append(g);
    status("松开后落在：" + target.label);
  }
  function pitchStaffs(bars, height) {
    return bars.map((bar) => ({
      ...bar,
      staffs: bar.staffs.map((s) => ({
        ...s,
        minStep: Math.ceil(
          s.bottomStep - (height - 12 - s.bottomY) / (s.spacing / 2),
        ),
        maxStep: Math.floor(s.bottomStep + (s.bottomY - 12) / (s.spacing / 2)),
      })),
    }));
  }
  function attachHandles(view, layout) {
    if (disposed || !layout.svg.isConnected) return;
    layout.svg.querySelector("[data-swe-handles]")?.remove();
    const group = svgNode("g", { "data-swe-handles": "" });
    for (const n of layout.notes) {
      if (
        view.system.editableNoteIds &&
        !view.system.editableNoteIds.includes(n.noteId)
      )
        continue;
      const note = view.system.score.notes.find((v) => v.id === n.noteId);
      if (!note) continue;
      const h = svgNode("ellipse", {
        cx: n.x + 5,
        cy: n.y,
        rx: 11,
        ry: 8,
        class:
          "swe-note-handle" +
          (selected?.systemId === view.system.id &&
          selected?.noteId === n.noteId
            ? " is-selected"
            : ""),
        role: "button",
        tabindex: 0,
        "aria-label": `${midiName(note.midi)} 第 ${note.beat + 1} 拍，拖拽到线间与拍点`,
        "data-swe-system": view.system.id,
        "data-swe-note": note.id,
      });
      group.append(h);
    }
    layout.svg.append(group);
  }
  async function calibrate(system) {
    if (
      system.source?.staffLines?.right?.length === 5 &&
      system.source?.staffLines?.left?.length === 5
    ) {
      calibrated.set(system.id, system.source.staffLines);
      return;
    }
    if (
      calibrated.has(system.id) ||
      pendingCalibration.has(system.id) ||
      !system.source?.imageUrl
    )
      return;
    pendingCalibration.add(system.id);
    try {
      const image = new Image();
      image.src = system.source.imageUrl;
      await image.decode();
      if (disposed) return;
      const scale = Math.min(1, 1400 / image.naturalWidth),
        canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const found = detectScoreSystems(
        ctx.getImageData(0, 0, canvas.width, canvas.height),
      );
      const staffs = found.staffs?.sort((a, b) => a.lines[0] - b.lines[0]);
      if (staffs?.length === 2) {
        const r = system.source.rect,
          sy = r.height / canvas.height;
        calibrated.set(system.id, {
          right: staffs[0].lines.map((y) => r.y + y * sy),
          left: staffs[1].lines.map((y) => r.y + y * sy),
        });
      }
      canvas.width = 0;
      canvas.height = 0;
    } catch {
      /* Uncalibrated originals remain readable; only the engraved lattice accepts a drop. */
    } finally {
      pendingCalibration.delete(system.id);
    }
  }
  function renderSource(page, container) {
    const systems = page.systems.filter(
      (s) => s.source?.imageUrl && s.source?.rect,
    );
    if (!systems.length && !page.imageUrl) {
      container.innerHTML =
        '<p class="swe-empty">这份乐谱没有保留原谱图片。可以在左侧整页数字谱中吸附修改与试听。</p>';
      return;
    }
    const width =
        page.width ||
        Math.max(
          800,
          ...systems.map(
            (s) =>
              s.source.pageWidth || s.source.rect.x + s.source.rect.width + 20,
          ),
        ),
      height =
        page.height ||
        Math.max(
          width * 1.3,
          ...systems.map(
            (s) =>
              s.source.pageHeight ||
              s.source.rect.y + s.source.rect.height + 20,
          ),
        );
    const svg = svgNode("svg", {
      viewBox: `0 0 ${width} ${height}`,
      class: "swe-source-page",
      "aria-label": `原谱第 ${page.page} 页`,
    });
    svg.append(svgNode("rect", { width, height, fill: "white" }));
    if (page.imageUrl)
      svg.append(svgNode("image", { href: page.imageUrl, width, height }));
    else
      for (const system of systems) {
        const r = system.source.rect;
        svg.append(
          svgNode("image", {
            href: system.source.imageUrl,
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
          }),
        );
      }
    container.append(svg);
    sourceView = { svg, page, width, height };
    for (const system of systems) void calibrate(system);
  }
  function render() {
    if (disposed) return;
    detailsDispose?.();
    detailsDispose = null;
    const version = ++renderVersion,
      snapshot = read(),
      pages = snapshot.pages;
    pageSnapshot = snapshot;
    pageIndex = clamp(pageIndex, 0, Math.max(0, pages.length - 1));
    const page = pages[pageIndex];
    const scrolls = [...root.querySelectorAll("[data-swe-scroll]")].map((e) => [
      e.dataset.sweScroll,
      e.scrollTop,
      e.scrollLeft,
    ]);
    clearViews();
    root.style.setProperty("--swe-zoom", zoom);
    root.innerHTML = `<header class="swe-header"><div class="swe-heading"><strong>${esc(snapshot.title || "整页乐谱对照修改")}</strong><small>左侧数字谱 · 右侧原谱 · 按整页浏览</small></div><button data-swe-action="previous" ${pageIndex === 0 ? "disabled" : ""}>上一页</button><label>第 <input data-swe-page type="number" aria-label="对照页码" min="1" max="${pages.length}" value="${pageIndex + 1}"> / ${pages.length || 1} 页</label><button data-swe-action="next" ${pageIndex >= pages.length - 1 ? "disabled" : ""}>下一页</button>${onDetails ? '<button data-swe-action="details">精细参数与改编</button>' : ""}<button class="swe-primary" data-swe-action="save" ${busy ? "disabled" : ""}>${esc(snapshot.saveLabel || "保存修改版")}</button><button data-swe-action="close">${overlay ? "返回识别审核" : "关闭编辑"}</button></header>
 <div class="swe-toolbar"><button data-swe-action="undo" ${!snapshot.canUndo || busy ? "disabled" : ""}>撤销</button><button data-swe-action="redo" ${!snapshot.canRedo || busy ? "disabled" : ""}>重做</button><label>拍点格 <select data-swe-grid aria-label="拖拽拍点网格">${[
   [1, "1 拍"],
   [0.5, "1/2 拍"],
   [0.25, "1/4 拍"],
   [1 / 3, "三连音 1/3 拍"],
   [0.125, "1/8 拍"],
 ]
   .map(
     ([v, l]) =>
       `<option value="${v}" ${step === v ? "selected" : ""}>${l}</option>`,
   )
   .join(
     "",
   )}</select></label><label>缩放 <select data-swe-zoom aria-label="对照缩放">${[1, 1.25, 1.5, 2].map((v) => `<option value="${v}" ${zoom === v ? "selected" : ""}>${v * 100}%</option>`).join("")}</select></label><label><input data-swe-sync type="checkbox" ${syncScroll ? "checked" : ""}> 同步滚动</label><span class="swe-selection" data-swe-selection>请选择音符</span><label>时值 <input data-swe-duration aria-label="所选音符时值" type="number" step="0.125" min="0.0009765625" max="256" disabled></label><button data-swe-action="audition" disabled>单音试听</button><button data-swe-action="play-page">播放当前页</button><button data-swe-action="stop">停止试听</button></div>
 <div class="swe-comparison"><section class="swe-pane"><div class="swe-pane-heading"><span>数字谱 · ${page?.systems.length || 0} 行</span><small>拖动音符，吸附到谱线／间与拍点</small></div><div class="swe-scroll" data-swe-scroll="digital"><div class="swe-sheet" data-swe-digital></div></div></section><section class="swe-pane"><div class="swe-pane-heading"><span>原谱 · 第 ${page?.page || 1} 页</span><small>${page?.imageUrl ? "完整原页" : page?.systems.some((s) => s.source) ? "保留谱行组成的整页视图" : "未保留原谱"}</small></div><div class="swe-scroll" data-swe-scroll="original"><div class="swe-sheet" data-swe-original></div></div></section></div>
 <footer class="swe-footer"><span role="status" aria-live="polite" data-swe-status>拖动时显示半透明落点；松开确认，Esc 取消。原谱谱线校准后也可直接拖到右侧对照。</span><small>试听使用${instrument === "synth" ? "轻量合成钢琴" : "当前钢琴音色"}</small></footer>`;
    if (!page) {
      status("尚无可编辑的识别结果。");
      return;
    }
    const digital = root.querySelector("[data-swe-digital]");
    for (const system of page.systems) {
      const article = document.createElement("div");
      article.className = "swe-digital-system";
      article.dataset.sweRegion = system.id;
      article.innerHTML = `<div class="swe-system-label">第 ${page.page} 页 · ${esc(system.label || system.id)}</div><div data-swe-notation></div>`;
      digital.append(article);
      const host = article.querySelector("[data-swe-notation]"),
        view = { system, renderer: null };
      views.push(view);
      if (!system.score?.notes?.length) {
        host.innerHTML = `<p class="swe-empty">${esc(system.error || "本行无发声音符，可继续对照休止。")}</p>`;
        continue;
      }
      try {
        view.renderer = renderNotation(host, system.score, {
          mode: "staff",
          editGrid: true,
          renderAll: true,
          autoScroll: false,
          onEditLayout: (layout) => {
            if (version === renderVersion) attachHandles(view, layout);
          },
        });
      } catch (e) {
        host.textContent = "此行暂不能排版：" + e.message;
      }
    }
    renderSource(page, root.querySelector("[data-swe-original]"));
    for (const [key, top, left] of scrolls) {
      const e = root.querySelector(`[data-swe-scroll="${key}"]`);
      if (e) {
        e.scrollTop = top;
        e.scrollLeft = left;
      }
    }
    select(selected?.systemId, selected?.noteId);
    let syncing = false;
    for (const panel of root.querySelectorAll("[data-swe-scroll]"))
      panel.addEventListener("scroll", () => {
        if (!syncScroll || syncing) return;
        const other = [...root.querySelectorAll("[data-swe-scroll]")].find(
          (e) => e !== panel,
        );
        const max = panel.scrollHeight - panel.clientHeight;
        if (!other || max <= 0) return;
        syncing = true;
        other.scrollTop =
          (panel.scrollTop / max) *
          Math.max(0, other.scrollHeight - other.clientHeight);
        requestAnimationFrame(() => (syncing = false));
      });
  }
  async function audition() {
    const { system, note } = selectedItem();
    if (!note) return;
    stop();
    const single = {
      ...system.score,
      recognitionEvidence: undefined,
      notes: [
        {
          ...note,
          beat: 0,
          duration: Math.min(note.duration, 2),
          tieTo: undefined,
          arpeggio: undefined,
          grace: undefined,
          ornament: undefined,
        },
      ],
      rests: [],
      tempoMap: undefined,
      fermatas: undefined,
      durationBeats: Math.min(note.duration, 2),
      measureMap: undefined,
    };
    if (providedAudio) await providedAudio.note(single, note.id);
    else await player.previewNotes(single, note.id);
    status(`单音试听：${midiName(note.midi)}`);
  }
  async function edit(systemId, noteId, patch, sourcePosition) {
    stop();
    await onEdit({ systemId, noteId, patch, sourcePosition });
    if (disposed) return;
    render();
    select(systemId, noteId);
    status(
      "修改已应用；可撤销。" +
        (sourcePosition ? "原谱定位已吸附到目标格。" : ""),
    );
  }
  function targetAt(e) {
    const { system: origin, note } = selectedItem();
    if (!origin || !note) return null;
    for (const view of views)
      for (const layout of view.renderer?.getEditLayout() || []) {
        const p = pointIn(layout.svg, e);
        if (!p) continue;
        const bar = pitchStaffs(layout.bars, layout.height).find(
          (b) => p.x >= b.left - 12 && p.x <= b.right + 12,
        );
        if (!bar) return null;
        if (view.system.id !== origin.id) return null;
        const result = snapStaffTarget({
          note,
          bar,
          x: p.x,
          y: p.y,
          staffs: bar.staffs,
          step,
          endBeat: origin.score.durationBeats,
          existingBeats: origin.score.notes.map((n) => n.beat),
          notes: origin.score.notes,
        });
        return result
          ? { ...result, svg: layout.svg, systemId: origin.id }
          : null;
      }
    if (sourceView) {
      const p = pointIn(sourceView.svg, e);
      if (!p) return null;
      const source = origin.source;
      if (!source) return null;
      const r = source.rect;
      if (p.x < r.x || p.x > r.x + r.width || p.y < r.y || p.y > r.y + r.height)
        return null;
      const grid = sourceGrid(origin, calibrated.get(origin.id), note.id);
      if (!grid) {
        status("此行原谱的谱线尚未确认，请先在左侧固定格中调整。");
        return null;
      }
      const result = snapStaffTarget({
        note,
        bar: grid.bar,
        x: p.x,
        y: p.y,
        staffs: grid.staffs.map((s) => ({
          ...s,
          minStep: Math.ceil(
            s.bottomStep - (r.y + r.height - s.bottomY) / (s.spacing / 2),
          ),
          maxStep: Math.floor(
            s.bottomStep + (s.bottomY - r.y) / (s.spacing / 2),
          ),
        })),
        step,
        endBeat: origin.score.durationBeats,
        existingBeats: origin.score.notes.map((n) => n.beat),
        notes: origin.score.notes,
      });
      return result
        ? {
            ...result,
            svg: sourceView.svg,
            systemId: origin.id,
            sourcePosition: {
              page: current().page,
              system: source.system,
              x: result.x,
              y: result.y,
            },
          }
        : null;
    }
    return null;
  }
  root.addEventListener("pointerdown", (e) => {
    const h = e.target.closest("[data-swe-note]");
    if (!h || busy || e.button !== 0) return;
    e.preventDefault();
    stop();
    select(h.dataset.sweSystem, h.dataset.sweNote);
    drag = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      target: null,
      moved: false,
    };
    root.setPointerCapture?.(e.pointerId);
    h.focus({ preventScroll: true });
  });
  root.addEventListener("pointermove", (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4)
      return;
    drag.moved = true;
    drag.target = targetAt(e);
    drawGhost(drag.target);
    if (!drag.target) status("此处没有可放置的音符格，松开会保留原音。");
  });
  function finish(e, cancel = false) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const d = drag;
    drag = null;
    if (root.hasPointerCapture?.(e.pointerId))
      root.releasePointerCapture(e.pointerId);
    drawGhost(null);
    if (!cancel && d.moved && d.target) {
      const item = selected;
      void edit(
        item.systemId,
        item.noteId,
        d.target.patch,
        d.target.sourcePosition,
      ).catch((err) => status(err.message, true));
    } else if (d.moved)
      status(cancel ? "已取消拖拽。" : "未落入有效格，原音保持不变。");
  }
  root.addEventListener("pointerup", (e) => finish(e));
  root.addEventListener("pointercancel", (e) => finish(e, true));
  root.addEventListener("lostpointercapture", (e) => finish(e, true));
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      if (drag) finish({ pointerId: drag.pointerId }, true);
      else onClose?.();
      return;
    }
    const h = e.target.closest("[data-swe-note]");
    if (!h) return;
    select(h.dataset.sweSystem, h.dataset.sweNote);
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void audition().catch((err) => status(err.message, true));
    }
  });
  root.addEventListener("click", (e) => {
    const action = e.target.closest("[data-swe-action]");
    if (!action || action.disabled) return;
    void (async () => {
      switch (action.dataset.sweAction) {
        case "previous":
        case "next":
          stop();
          pageIndex += action.dataset.sweAction === "next" ? 1 : -1;
          selected = null;
          render();
          onPageChange?.(current().page);
          break;
        case "undo":
          stop();
          await onUndo?.();
          render();
          break;
        case "redo":
          stop();
          await onRedo?.();
          render();
          break;
        case "audition":
          await audition();
          break;
        case "play-page":
          if (playing) {
            stop();
            break;
          }
          stop();
          if (providedAudio) await providedAudio.page(pagePlayback(current()));
          else {
            player.setScore(pagePlayback(current()));
            await player.play();
          }
          playing = true;
          updatePlayButton();
          status("正在播放当前整页，修改或翻页将停止试听。");
          break;
        case "stop":
          stop();
          status("试听已停止。");
          break;
        case "save":
          stop();
          busy = true;
          render();
          try {
            await onSave?.();
            if (!disposed) status(read().savedMessage || "修改已保存。");
          } finally {
            busy = false;
            if (!disposed) {
              render();
              status(read().savedMessage || "修改已保存。");
            }
          }
          break;
        case "close":
          stop();
          onClose?.();
          break;
        case "details":
          stop();
          if (detailsDispose) {
            detailsDispose();
            detailsDispose = null;
            render();
            break;
          }
          clearViews();
          root.querySelector(".swe-comparison").innerHTML =
            '<section class="swe-details" data-swe-details></section>';
          action.textContent = "返回整页对照";
          detailsDispose = onDetails(
            root.querySelector("[data-swe-details]"),
            () => {
              detailsDispose?.();
              detailsDispose = null;
              render();
            },
          );
          break;
      }
    })().catch((err) => {
      busy = false;
      status(err.message, true);
    });
  });
  root.addEventListener("change", (e) => {
    const el = e.target;
    if (el.hasAttribute("data-swe-page")) {
      stop();
      pageIndex = clamp(Number(el.value) - 1, 0, read().pages.length - 1);
      selected = null;
      render();
      onPageChange?.(current().page);
    } else if (el.hasAttribute("data-swe-grid")) step = Number(el.value);
    else if (el.hasAttribute("data-swe-zoom")) {
      zoom = Number(el.value);
      render();
    } else if (el.hasAttribute("data-swe-sync")) syncScroll = el.checked;
    else if (el.hasAttribute("data-swe-duration") && selected) {
      void edit(selected.systemId, selected.noteId, {
        duration: Number(el.value),
      }).catch((err) => status(err.message, true));
    }
  });
  render();
  return {
    refresh: render,
    getSelection: () => selected,
    destroy() {
      if (disposed) return;
      disposed = true;
      stop();
      clearViews();
      detailsDispose?.();
      for (const url of ownedURLs) URL.revokeObjectURL(url);
      void player?.dispose();
      root.remove();
    },
  };
}
