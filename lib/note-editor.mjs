import { validateScore, beatsPerMeasure, scoreMeasureBounds } from './score.mjs';
import { convertScoreMode, replaceOnsetChord } from './score-arrangement.mjs';
import { DYNAMICS, detachInvalidTies, nextTieNote } from './note-effects.mjs';

/** Changes are isolated from the library until explicitly saved. */
export function createNoteEditor(raw) {
  let score = validateScore(raw), undo = [], redo = [];
  function commit(next) {
    if (next.measureMap?.length) {
      const map = next.measureMap.map(b=>({...b})), last = map.at(-1);
      let end = last.beat + last.duration;
      while (end < next.durationBeats - 1e-7) {
        const meter = last.timeSignature || next.timeSignature;
        const duration = Math.min(meter[0]*4/meter[1],next.durationBeats-end);
        map.push({beat:end,duration,timeSignature:[...meter]}); end+=duration;
      }
      next = {...next,measureMap:map};
    }
    const valid = validateScore(next);
    undo.push(score); redo = []; score = valid;
  }
  return {
    get score() { return score; },
    get canUndo() { return undo.length > 0; },
    get canRedo() { return redo.length > 0; },
    notesInMeasure(index) {
      const {start,end} = scoreMeasureBounds(score,index);
      return score.notes.filter(n => n.beat < end && n.beat + n.duration > start);
    },
    update(id, patch) {
      if (!score.notes.some(n => n.id === id)) throw new Error('请先选择音符。');
      const notes = detachInvalidTies(score.notes.map(n => n.id === id ? { ...n, ...patch, id } : n));
      commit({ ...score, notes, durationBeats: Math.max(score.durationBeats, ...notes.map(n => n.beat + n.duration)) });
    },
    setTiming(tempoMap,fermatas) { commit({...score,tempoMap,fermatas}); },
    setDynamic(id,dynamic) {
      const value=DYNAMICS.find(d=>d.id===dynamic);
      if(!value) throw new Error('请选择力度。');
      this.update(id,{dynamic,velocity:value.velocity});
    },
    setArpeggio(id,direction) {
      const n=score.notes.find(n=>n.id===id);
      if(!n) throw new Error('请先选择音符。');
      const group=score.notes.filter(p=>p.hand===n.hand&&Math.abs(p.beat-n.beat)<1e-7);
      if(direction && group.length<2) throw new Error('琶音至少需要两个同手、同时起奏的音；可先添加和弦音。');
      const ids=new Set(group.map(n=>n.id));
      commit({...score,notes:detachInvalidTies(score.notes.map(n=>ids.has(n.id)?{...n,arpeggio:direction||undefined}:n))});
    },
    toggleTie(id) {
      const n=score.notes.find(n=>n.id===id);
      if(!n) throw new Error('请先选择音符。');
      const target=nextTieNote(score,id);
      if(!n.tieTo&&!target) throw new Error('下一拍没有可相接的同手、同声部同音，或含不兼容的装饰效果。请先调整落点与时值。');
      this.update(id,{tieTo:n.tieTo?undefined:target.id});
    },
    clearEffects(id) {
      const selected=score.notes.find(n=>n.id===id);
      if(!selected) throw new Error('请先选择音符。');
      const notes=score.notes.map(n=>n.id===id?{...n,dynamic:undefined,velocity:.7,accent:undefined,articulation:undefined,ornament:undefined,ornamentInterval:undefined,tieTo:undefined,arpeggio:undefined,grace:undefined,fermata:undefined}
        :n.tieTo===id?{...n,tieTo:undefined}:selected.arpeggio&&n.hand===selected.hand&&Math.abs(n.beat-selected.beat)<1e-7?{...n,arpeggio:undefined}:n);
      commit({...score,notes});
    },
    add(beat, hand = 'right') {
      const id = `edit-${globalThis.crypto.randomUUID()}`;
      commit({ ...score, notes: [...score.notes, { id, beat, duration: 1, midi: hand === 'left' ? 48 : 60, hand, velocity: .7 }], durationBeats: Math.max(score.durationBeats, beat + 1) });
      return id;
    },
    remove(id) {
      if (score.notes.length <= 1) throw new Error('请至少保留一个音符。');
      if (!score.notes.some(n => n.id === id)) throw new Error('请先选择音符。');
      commit({ ...score, notes: detachInvalidTies(score.notes.filter(n => n.id !== id)) });
    },
    convertMode(targetMode, sourceMode) {
      const result = convertScoreMode(score,targetMode,sourceMode);
      commit(result.score); return result;
    },
    replaceChord(id, options) {
      const result = replaceOnsetChord(score,id,options);
      commit(result.score); return result.ids;
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
