import { applyWrittenGridPitch } from "../lib/recognition-edit.mjs";
import { mountScoreWorkbench } from "./score-workbench.js";
import { validateScore } from "../lib/score.mjs";
import { moveGridNote } from "../lib/score-workbench.mjs";

/** Live recognition edits retain their evidence and invalidate approval atomically. */
export function mountRecognitionPageEditor(
  host,
  { draft, regions, assets, thumbnails, onClose, initialPage = 1, audio },
) {
  const undo = [],
    redo = [];
  const pages = () =>
    draft.pages
      .filter((p) => p.decision === "include")
      .map((page) => ({
        page: page.page,
        width: page.width,
        height: page.height,
        imageUrl: thumbnails.get(page.page)?.url,
        systems: regions
          .filter((r) => r.page === page.page)
          .map((r) => ({
            id: r.id,
            label: `第 ${r.system} 行`,
            startBeat: 0,
            endBeat: r.durationBeats,
            score: r.notes
              ? {
                  ...r.score,
                  durationBeats: r.durationBeats,
                  notes: r.notes,
                  rests: r.rests || [],
                  recognitionEvidence: undefined,
                }
              : null,
            error: r.error || "本行尚未识别成功，请返回重试。",
            source: {
              ...r,
              imageUrl: assets.get(r.id)?.url,
              notes: (r.notes || []).map((n) => ({ ...n, noteId: n.id })),
            },
          })),
      }));
  function restore(from, to) {
    const entry = from.pop();
    if (!entry) return;
    const region = regions.find((r) => r.id === entry.id);
    to.push({ id: region.id, before: structuredClone(region) });
    Object.assign(region, entry.before, { dirty: true, reviewed: false });
  }
  return mountScoreWorkbench(host, {
    overlay: true,
    audio,
    initialPage,
    read: () => ({
      title: draft.title + " · 识别结果校对",
      pages: pages(),
      canUndo: undo.length > 0,
      canRedo: redo.length > 0,
      saveLabel: "应用并返回审核",
    }),
    onEdit: ({ systemId, noteId, patch, sourcePosition }) => {
      const region = regions.find((r) => r.id === systemId),
        note = region?.notes.find((n) => n.id === noteId);
      if (!note) throw new Error("音符已变化，请重新选择。");
      const before = structuredClone(region),
        next = { ...note, ...patch };
      if (
        next.beat < 0 ||
        next.beat + next.duration > region.durationBeats + 1e-7
      )
        throw new Error("音符不能超出当前谱行的拍数范围。");
      if (sourcePosition)
        Object.assign(next, { x: sourcePosition.x, y: sourcePosition.y });
      const moved = moveGridNote(
        {
          ...region.score,
          notes: region.notes,
          rests: region.rests,
          durationBeats: region.durationBeats,
        },
        noteId,
        next,
      );
      if (patch.pitch) applyWrittenGridPitch(moved.recognitionEvidence, next);
      validateScore({ ...moved, recognitionEvidence: undefined });
      undo.push({ id: region.id, before });
      redo.length = 0;
      region.notes = moved.notes;
      region.rests = moved.rests;
      if (moved.recognitionEvidence)
        region.score.recognitionEvidence = moved.recognitionEvidence;
      region.corrections ||= [];
      region.corrections.push({
        kind: "manual-grid-edit",
        type: "manual-grid-edit",
        description: "人工在整页对照中吸附修改音符",
        evidence: "用户拖拽确认，待对照原谱重新审核",
        noteIds: [noteId],
        before: JSON.stringify(note),
        after: JSON.stringify(next),
      });
      region.reviewed = false;
      region.dirty = true;
    },
    onUndo: () => restore(undo, redo),
    onRedo: () => restore(redo, undo),
    onSave: onClose,
    onClose,
  });
}
