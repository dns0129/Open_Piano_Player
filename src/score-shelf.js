import { escapeHTML as esc } from "./html.js";

const preference = "qinban-library-layout";
const layouts = [
  ["grid", "网格"],
  ["list", "列表"],
];

export function createScoreShelf() {
  let mode = "grid",
    draft;
  try {
    if (globalThis.localStorage?.getItem(preference) === "list") mode = "list";
  } catch {
    /* Storage can be unavailable in private browsing. */
  }

  function titleMarkup(id, title) {
    if (!draft || draft.id !== id)
      return `<h3>${esc(title)}</h3><button class="shelf-rename" type="button" data-rename aria-label="重命名 ${esc(title)}">改名</button>`;
    return `<form class="shelf-edit" novalidate>
      <input aria-label="新曲名" maxlength="200" autocomplete="off" value="${esc(draft.value)}" ${draft.busy ? "readonly" : ""}>
      <div><button type="submit" ${draft.busy ? "disabled" : ""}>${draft.busy ? "保存中…" : "保存"}</button><button type="button" data-cancel-rename ${draft.busy ? "disabled" : ""}>取消</button></div>
      <span role="alert">${esc(draft.error)}</span></form>`;
  }

  function markup(records, actions) {
    return `<section class="score-shelf" data-shelf-mode="${mode}" aria-label="乐谱目录">
      <div class="shelf-switch" role="group" aria-label="曲库显示方式">${layouts.map(([key, label]) => `<button type="button" data-layout-choice="${key}" aria-pressed="${key === mode}"><span aria-hidden="true" class="shelf-glyph ${key}"></span>${label}</button>`).join("")}</div>
      <div class="shelf-items">${records
        .map((r) => {
          const music = r.music || {};
          const details = [
            music.composer,
            r.instrument === "guitar" ? "吉他" : "钢琴",
            music.tempo && music.tempo + " BPM",
          ].filter(Boolean);
          return `<article class="shelf-item" data-entry="${esc(r.entryId)}" data-card="${esc(r.documentId)}" data-title="${esc(r.title)}" data-revision="${esc(r.revision)}">
          <div class="shelf-info"><div class="shelf-title">${titleMarkup(r.entryId, r.title)}</div><p>${details.map(esc).join(" · ")}</p></div>
          <div class="shelf-foot"><small>修订 ${esc(r.revision)}${r.updatedAt ? " · " + esc(new Date(r.updatedAt).toLocaleDateString("zh-CN")) : ""}</small><div class="shelf-actions">${actions(r)}</div></div>
        </article>`;
        })
        .join("")}</div></section>`;
  }

  function bind(root, save, saved) {
    const shelf = root?.querySelector(".score-shelf");
    if (!shelf) return;
    function paint(row) {
      row.querySelector(".shelf-title").innerHTML = titleMarkup(
        row.dataset.entry,
        row.dataset.title,
      );
    }
    function cancel(row) {
      draft = null;
      paint(row);
      row.querySelector("[data-rename]").focus();
    }
    shelf.onclick = (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.layoutChoice) {
        mode = button.dataset.layoutChoice;
        shelf.dataset.shelfMode = mode;
        for (const item of shelf.querySelectorAll("[data-layout-choice]"))
          item.setAttribute("aria-pressed", String(item === button));
        try {
          globalThis.localStorage?.setItem(preference, mode);
        } catch {}
        return;
      }
      const row = button.closest("[data-entry]");
      if (!row || draft?.busy) return;
      if (button.hasAttribute("data-cancel-rename")) return cancel(row);
      if (!button.hasAttribute("data-rename")) return;
      const previous = shelf
        .querySelector(".shelf-edit")
        ?.closest("[data-entry]");
      draft = {
        id: row.dataset.entry,
        revision: Number(row.dataset.revision),
        value: row.dataset.title,
        error: "",
        busy: false,
      };
      if (previous && previous !== row) paint(previous);
      paint(row);
      const input = row.querySelector("input");
      input.focus();
      input.select();
    };
    shelf.oninput = (event) => {
      if (draft && event.target.matches(".shelf-edit input")) {
        draft.value = event.target.value;
        draft.error = "";
        event.target
          .closest("form")
          .querySelector('[role="alert"]').textContent = "";
      }
    };
    let composing = false;
    shelf.addEventListener("compositionstart", () => {
      composing = true;
    });
    shelf.addEventListener("compositionend", () => {
      composing = false;
    });
    shelf.onkeydown = (event) => {
      if (!event.target.closest(".shelf-edit")) return;
      event.stopPropagation();
      if (event.isComposing || event.keyCode === 229 || composing) return;
      if (event.key === "Escape" && !draft?.busy) {
        event.preventDefault();
        cancel(event.target.closest("[data-entry]"));
      }
    };
    shelf.onsubmit = async (event) => {
      event.preventDefault();
      const row = event.target.closest("[data-entry]"),
        active = draft;
      if (
        composing ||
        !active ||
        active.busy ||
        active.id !== row?.dataset.entry
      )
        return;
      const title = active.value.trim();
      if (!title) {
        active.error = "请输入曲名。";
        paint(row);
        row.querySelector("input").focus();
        return;
      }
      if (title === row.dataset.title) return cancel(row);
      active.busy = true;
      paint(row);
      try {
        if (active.request?.title !== title)
          active.request = { title, key: crypto.randomUUID() };
        const result = await save(
          active.id,
          title,
          active.revision,
          active.request.key,
        );
        if (draft !== active) return;
        draft = null;
        saved(result);
        const next = [...root.querySelectorAll(".shelf-item")].find(
          (item) => item.dataset.entry === active.id,
        );
        next?.querySelector("[data-rename]")?.focus({ preventScroll: true });
      } catch (error) {
        if (draft !== active) return;
        active.busy = false;
        active.error = error.message || "保存失败，请重试。";
        const current = [...root.querySelectorAll(".shelf-item")].find(
          (item) => item.dataset.entry === active.id,
        );
        if (current) {
          paint(current);
          current.querySelector("input").focus();
        }
      }
    };
  }
  return {
    markup,
    bind,
    reset() {
      draft = null;
    },
  };
}

export const practiceLink = (r) =>
  `<a class="shelf-primary" href="/practice.html?entry=${encodeURIComponent(r.entryId)}">打开练习</a>`;
