import { $, esc, icon, refreshIcons } from "./ui.js";

// One dialog at a time. Every open or close bumps the epoch, so asynchronous work
// started for a dialog can tell that it was closed or replaced in the meantime.
export function createModal({ state, player }) {
  let cleanup = null,
    epoch = 0;
  function closeModal() {
    epoch++;
    cleanup?.();
    cleanup = null;
    if (state.busy) {
      state.abort?.abort();
      state.busy = false;
    }
    $("#modal-root").innerHTML = "";
  }
  // Closing while recognition runs discards the model request, so ask first.
  function requestCloseModal() {
    if (
      state.busy &&
      !confirm("识谱仍在进行，关闭将取消本次识别。确定关闭吗？")
    )
      return;
    closeModal();
  }
  function modal(title, body, subtitle = "") {
    epoch++;
    cleanup?.();
    cleanup = null;
    player.pause();
    $("#modal-root").innerHTML =
      `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-heading"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div><button id="modal-close" class="icon-button" aria-label="关闭">${icon("x")}</button></div><div class="modal-body">${body}</div></section></div>`;
    refreshIcons();
    $("#modal-close").onclick = requestCloseModal;
    $(".modal-backdrop").onclick = (e) => {
      if (e.target === e.currentTarget && !state.busy) closeModal();
    };
    setTimeout(
      () =>
        $(
          ".modal input:not([type=hidden]),.modal select,.modal button",
        )?.focus(),
      0,
    );
  }
  return {
    modal,
    closeModal,
    requestCloseModal,
    modalEpoch: () => epoch,
    setModalCleanup: (fn) => {
      cleanup = fn;
    },
  };
}
