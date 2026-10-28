import { createNoteEditor } from "../lib/note-editor.mjs";
import {
  savedScorePages,
  editedSourceRecord,
} from "../lib/score-workbench.mjs";
import { mountScoreWorkbench } from "./score-workbench.js";

/** A library score stays isolated until Save, including its source-image locations. */
export function mountPageNoteEditor(
  root,
  raw,
  { sourceRecord, onSave, onClose, onDetails, initialBeat = 0, audio } = {},
) {
  const editor = createNoteEditor(raw);
  const pages = () =>
    savedScorePages(
      editor.score,
      editedSourceRecord(editor.score, sourceRecord)?.notation,
    ).map((page) => ({
      ...page,
      systems: page.systems.map((system) => ({
        ...system,
        label: `第 ${system.source?.system || page.systems.indexOf(system) + 1} 行`,
        editableNoteIds: editor.score.notes
          .filter((n) => n.beat >= system.startBeat && n.beat < system.endBeat)
          .map((n) => n.id),
      })),
    }));
  const initialPage = pages().find((p) =>
    p.systems.some(
      (s) => initialBeat >= s.startBeat && initialBeat < s.endBeat,
    ),
  )?.page;
  const controller = mountScoreWorkbench(root, {
    audio,
    initialPage,
    read: () => ({
      title: raw.title,
      pages: pages(),
      canUndo: editor.canUndo,
      canRedo: editor.canRedo,
      saveLabel: "保存修改版",
    }),
    onEdit: ({ systemId, noteId, patch, sourcePosition }) => {
      const system = pages()
          .flatMap((p) => p.systems)
          .find((s) => s.id === systemId),
        note = editor.score.notes.find((n) => n.id === noteId);
      if (!system || !note) throw new Error("音符所在谱行已变化，请重新选择。");
      const next = {
        ...patch,
        ...(patch.beat !== undefined
          ? { beat: patch.beat + system.startBeat }
          : {}),
      };
      const beat = next.beat ?? note.beat,
        duration = next.duration ?? note.duration;
      if (
        beat < system.startBeat ||
        (beat + duration > system.endBeat + 1e-7 &&
          !(
            patch.duration === undefined &&
            beat === note.beat &&
            note.beat + note.duration > system.endBeat
          ))
      )
        throw new Error("请把音符保留在当前谱行范围内。");
      if (sourcePosition)
        next.sourcePositions = [
          ...(note.sourcePositions || []).filter(
            (p) =>
              p.page !== sourcePosition.page ||
              p.system !== sourcePosition.system,
          ),
          sourcePosition,
        ];
      editor.updateGrid(noteId, next);
    },
    onUndo: () => editor.undo(),
    onRedo: () => editor.redo(),
    onSave: () => {
      const saved = editor.savedScore();
      return onSave?.(saved, editedSourceRecord(saved, sourceRecord));
    },
    onClose,
    onDetails: onDetails
      ? (host, back) => onDetails(host, editor, back)
      : undefined,
  });
  return () => controller.destroy();
}
