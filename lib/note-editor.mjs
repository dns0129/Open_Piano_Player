import { validateScore, beatsPerMeasure } from './score.mjs';

/** Changes are isolated from the library until explicitly saved. */
export function createNoteEditor(raw) {
  let score = validateScore(raw), undo = [], redo = [];
  function commit(next) {
    const valid = validateScore(next);
    undo.push(score); redo = []; score = valid;
  }
  return {
    get score() { return score; },
    get canUndo() { return undo.length > 0; },
    get canRedo() { return redo.length > 0; },
    notesInMeasure(index) {
      const start = index * beatsPerMeasure(score), end = start + beatsPerMeasure(score);
      return score.notes.filter(n => n.beat < end && n.beat + n.duration > start);
    },
    update(id, patch) {
      if (!score.notes.some(n => n.id === id)) throw new Error('请先选择音符。');
      const notes = score.notes.map(n => n.id === id ? { ...n, ...patch, id } : n);
      commit({ ...score, notes, durationBeats: Math.max(score.durationBeats, ...notes.map(n => n.beat + n.duration)) });
    },
    add(beat, hand = 'right') {
      const id = `edit-${globalThis.crypto.randomUUID()}`;
      commit({ ...score, notes: [...score.notes, { id, beat, duration: 1, midi: hand === 'left' ? 48 : 60, hand, velocity: .7 }], durationBeats: Math.max(score.durationBeats, beat + 1) });
      return id;
    },
    remove(id) {
      if (score.notes.length <= 1) throw new Error('请至少保留一个音符。');
      if (!score.notes.some(n => n.id === id)) throw new Error('请先选择音符。');
      commit({ ...score, notes: score.notes.filter(n => n.id !== id) });
    },
    undo() { if (undo.length) { redo.push(score); score = undo.pop(); } },
    redo() { if (redo.length) { undo.push(score); score = redo.pop(); } },
    savedScore() {
      return validateScore({ ...score,
        id: raw.source?.kind === 'user-edited' ? raw.id : `edited-${globalThis.crypto.randomUUID()}`,
        title: raw.source?.kind === 'user-edited' ? raw.title : `${raw.title}（修改版）`,
        source: { ...score.source, kind: 'user-edited', label: '手动修改 · 原谱另行保留' },
      });
    },
  };
}
