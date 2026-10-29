// Dragging notes in the full-PDF import dialog: source-position markers on the
// original image and pitch/beat blocks in the roll, by pointer or arrow keys.
import { activeRegion } from "./full-score-import-context.js";
import { commitMove, selectMapNote } from "./full-score-import-review.js";
import { rollMove, rollRange } from "../lib/recognition-review-actions.mjs";
import { midiName } from "../lib/score.mjs";
export function bindNoteDrag(ctx) {
  const { root, state } = ctx;

  root.addEventListener("pointerdown", (event) => {
    const marker = event.target.closest("[data-source-note],[data-roll-note]");
    const image = root.querySelector("[data-original-image]");
    const region = activeRegion(ctx);
    if (
      event.button !== 0 ||
      state.stage !== "review" ||
      !region?.notes ||
      state.busy ||
      state.importing
    )
      return;
    if (!marker) return;
    const noteId =
      marker?.dataset.sourceNote ||
      marker?.dataset.rollNote ||
      state.selectedNoteId;
    const note = region.notes.find((n) => n.id === noteId);
    if (!note) return;
    selectMapNote(ctx, note.id);
    event.preventDefault();
    const mode = marker.hasAttribute("data-roll-note") ? "roll" : "source";
    const bounds = (
      mode === "roll" ? root.querySelector("[data-note-roll]") : image
    )?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    ctx.noteDrag = {
      pointerId: event.pointerId,
      region,
      note,
      marker,
      mode,
      bounds,
      range: rollRange(region),
      startX: event.clientX,
      startY: event.clientY,
      values: null,
    };
    root.setPointerCapture?.(event.pointerId);
    marker.focus({ preventScroll: true });
  });

  root.addEventListener("pointermove", (event) => {
    const drag = ctx.noteDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - drag.startX,
      dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) < 3 && !drag.values) return;
    drag.values =
      drag.mode === "source"
        ? {
            x: Math.max(
              drag.region.rect.x,
              Math.min(
                drag.region.rect.x + drag.region.rect.width,
                drag.note.x + (dx / drag.bounds.width) * drag.region.rect.width,
              ),
            ),
            y: Math.max(
              drag.region.rect.y,
              Math.min(
                drag.region.rect.y + drag.region.rect.height,
                drag.note.y +
                  (dy / drag.bounds.height) * drag.region.rect.height,
              ),
            ),
          }
        : rollMove(
            drag.note,
            drag.region,
            drag.range,
            drag.bounds,
            dx,
            dy,
            event.altKey ? 1 / 16 : 1 / 4,
          );
    if (!drag.values) return;
    if (drag.mode === "source") {
      drag.marker.style.left = `${((drag.values.x - drag.region.rect.x) / drag.region.rect.width) * 100}%`;
      drag.marker.style.top = `${((drag.values.y - drag.region.rect.y) / drag.region.rect.height) * 100}%`;
    } else {
      drag.marker.style.left = `${(drag.values.beat / drag.region.durationBeats) * 100}%`;
      drag.marker.style.top = `${(drag.range.max - drag.values.midi) * 20}px`;
      drag.marker.textContent = `${midiName(drag.values.midi)} · ${drag.values.beat} 拍`;
    }
  });

  function finishNoteDrag(event) {
    const drag = ctx.noteDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    ctx.noteDrag = null;
    if (root.hasPointerCapture?.(event.pointerId))
      root.releasePointerCapture(event.pointerId);
    if (
      event.type === "pointerup" &&
      drag.values &&
      !state.busy &&
      !state.importing &&
      drag.region === activeRegion(ctx)
    )
      commitMove(ctx, drag.region, drag.note, drag.values);
    else ctx.render();
  }
  root.addEventListener("pointerup", finishNoteDrag);
  root.addEventListener("pointercancel", finishNoteDrag);
  root.addEventListener("lostpointercapture", finishNoteDrag);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ctx.noteDrag) {
      event.stopPropagation();
      finishNoteDrag({
        ...event,
        pointerId: ctx.noteDrag.pointerId,
        type: "pointercancel",
      });
      return;
    }
    const marker = event.target.closest("[data-source-note],[data-roll-note]");
    if (
      !marker ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
        event.key,
      ) ||
      state.busy ||
      state.importing
    )
      return;
    event.preventDefault();
    const region = activeRegion(ctx),
      id = marker.dataset.sourceNote || marker.dataset.rollNote;
    const note = region?.notes.find((n) => n.id === id);
    if (!note) return;
    selectMapNote(ctx, id);
    const dx =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    const step = event.shiftKey ? 10 : 1;
    const values = marker.hasAttribute("data-source-note")
      ? {
          x: Math.max(
            region.rect.x,
            Math.min(region.rect.x + region.rect.width, note.x + dx * step),
          ),
          y: Math.max(
            region.rect.y,
            Math.min(region.rect.y + region.rect.height, note.y + dy * step),
          ),
        }
      : {
          beat: Math.max(
            0,
            Math.min(
              Math.max(0, region.durationBeats - note.duration),
              note.beat +
                dx * (event.shiftKey ? 1 : event.altKey ? 1 / 16 : 1 / 4),
            ),
          ),
          midi: Math.max(21, Math.min(108, note.midi - dy)),
        };
    commitMove(ctx, region, note, values);
    const key = marker.hasAttribute("data-source-note")
      ? "sourceNote"
      : "rollNote";
    [...root.querySelectorAll("[data-source-note],[data-roll-note]")]
      .find((el) => el.dataset[key] === id)
      ?.focus({ preventScroll: true });
  });
}
