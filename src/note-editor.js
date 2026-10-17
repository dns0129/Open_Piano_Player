import { createNoteEditor } from '../lib/note-editor.mjs';
import { beatsPerMeasure, midiName } from '../lib/score.mjs';
import { renderNotation } from './notation.js';

const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const durations = [[4,'全音符'],[2,'二分'],[1,'四分'],[.5,'八分'],[.25,'十六分']];
export function mountNoteEditor(root, raw, { onSave, onPreview, initialBeat = 0 } = {}) {
  const editor = createNoteEditor(raw), bar = beatsPerMeasure(raw);
  let measure = Math.floor(initialBeat / bar), selected = null, renderer, error = '', dirty = false;
  function selectedNote() { return editor.score.notes.find(n => n.id === selected); }
  function action(fn) { try { fn(); dirty = true; error = ''; } catch (e) { error = e.message; } render(); }
  function render() {
    renderer?.destroy();
    const score = editor.score, count = Math.max(1, Math.ceil(score.durationBeats / bar));
    measure = Math.max(0, Math.min(count - 1, measure));
    const notes = editor.notesInMeasure(measure);
    if (!notes.some(n => n.id === selected)) selected = notes[0]?.id || null;
    const note = selectedNote();
    root.innerHTML = `<p class="form-note">选小节 → 点音符 → 调整。修改会同步到五线谱、简谱和播放。首次保存保留原谱。</p>
      <div class="note-editor-toolbar"><button data-previous ${measure === 0 ? 'disabled' : ''}>上一小节</button><label>第 <input data-measure aria-label="编辑小节" type="number" min="1" max="${count}" value="${measure + 1}"> / ${count} 小节</label><button data-next ${measure >= count - 1 ? 'disabled' : ''}>下一小节</button><span></span><button data-undo ${!editor.canUndo ? 'disabled' : ''}>撤销</button><button data-redo ${!editor.canRedo ? 'disabled' : ''}>重做</button></div>
      <div data-editor-preview class="note-editor-preview" aria-label="当前小节预览"></div>
      <div class="note-editor-notes" aria-label="选择要修改的音符">${notes.map(n => `<button data-note="${esc(n.id)}" aria-pressed="${n.id === selected}" class="${n.id === selected ? 'selected' : ''}"><strong>${esc(midiName(n.midi))}</strong><small>${n.hand === 'right' ? '右手' : '左手'} · ${n.beat < measure * bar ? '上一小节延续' : `第 ${+(n.beat - measure * bar + 1).toFixed(3)} 拍`}</small></button>`).join('') || '<p>本小节没有音符，可以补一个。</p>'}</div>
      ${note ? `<div class="note-editor-controls"><div><strong>音高 ${esc(midiName(note.midi))}</strong><div class="note-editor-toolbar">${[[-12,'低八度'],[-1,'降半音'],[1,'升半音'],[12,'高八度']].map(([v,label]) => `<button data-pitch="${v}" ${note.midi + v < 21 || note.midi + v > 108 ? 'disabled' : ''}>${label}</button>`).join('')}<button data-preview>试听这个音</button></div></div><div><strong>时值</strong><div class="note-editor-toolbar">${durations.map(([v,label]) => `<button data-duration="${v}" aria-pressed="${Math.abs(note.duration-v)<.00001}" class="${Math.abs(note.duration-v)<.00001 ? 'selected' : ''}">${label}</button>`).join('')}<button data-dotted class="${durations.some(([v]) => Math.abs(note.duration-v*1.5)<.00001) ? 'selected' : ''}">附点</button><span>${+note.duration.toFixed(4)} 拍</span></div></div><div class="note-editor-toolbar"><label>演奏手 <select data-hand aria-label="演奏手"><option value="right" ${note.hand === 'right' ? 'selected' : ''}>右手</option><option value="left" ${note.hand === 'left' ? 'selected' : ''}>左手</option></select></label><button data-remove>删除这个音</button></div><details><summary>调整落点与特殊时值</summary><p class="form-note">拍数以四分音符为 1 拍。移动音符会保留其他音符的落点，空出的时间为休止。</p><label>起始拍（本小节从 1 起） <input data-beat type="number" step="any" min="1" max="${bar + 1}" value="${note.beat - measure * bar + 1}"></label><label>时值（拍） <input data-custom-duration type="number" min="0.0009765625" max="256" step="any" value="${note.duration}"></label><button data-timing>应用落点与时值</button></details></div>` : ''}
      <p class="form-error" role="alert">${esc(error)}</p><div class="note-editor-footer"><button data-add>＋ ${note ? '在此音后补一个音' : '在小节开头补一个音'}</button>${note ? '<button data-chord>＋ 同时发声的音</button>' : ''}<span data-save-status role="status">${dirty ? '有未保存的修改' : '尚未修改'}</span><button data-save class="button primary" ${!dirty ? 'disabled' : ''}>保存${raw.source?.kind === 'user-edited' ? '修改' : '为修改版'}</button></div><p class="form-note">原始 PDF / 图片保持原样；修改版使用重新排版的谱面。关闭窗口会放弃本次未保存修改。</p>`;
    const $ = s => root.querySelector(s);
    $('[data-previous]').onclick = () => { measure--; render(); };
    $('[data-next]').onclick = () => { measure++; render(); };
    $('[data-measure]').onchange = e => { measure = Number(e.target.value) - 1 || 0; render(); };
    root.querySelectorAll('[data-note]').forEach(b => b.onclick = () => { selected = b.dataset.note; render(); });
    $('[data-undo]').onclick = () => action(() => editor.undo());
    $('[data-redo]').onclick = () => action(() => editor.redo());
    root.querySelectorAll('[data-pitch]').forEach(b => b.onclick = () => action(() => editor.update(selected, { midi: note.midi + Number(b.dataset.pitch) })));
    root.querySelectorAll('[data-duration]').forEach(b => b.onclick = () => action(() => editor.update(selected, { duration: Number(b.dataset.duration) })));
    $('[data-dotted]')?.addEventListener('click', () => action(() => { const dotted = durations.find(([v]) => Math.abs(note.duration-v*1.5)<.00001); editor.update(selected, { duration: dotted ? dotted[0] : note.duration*1.5 }); }));
    $('[data-hand]')?.addEventListener('change', e => action(() => editor.update(selected, { hand: e.target.value })));
    $('[data-remove]')?.addEventListener('click', () => action(() => editor.remove(selected)));
    $('[data-preview]')?.addEventListener('click', async () => { try { await onPreview(note.midi, note.duration); } catch (e) { error = e.message; render(); } });
    $('[data-timing]')?.addEventListener('click', () => action(() => {
      const beat = Number($('[data-beat]').value), duration = Number($('[data-custom-duration]').value);
      if (beat < 1 || beat > bar + 1) throw new Error(`起始拍须在 1 到 ${bar + 1} 之间。`);
      editor.update(selected, { beat: measure*bar + beat - 1, duration });
    }));
    $('[data-add]').onclick = () => action(() => { selected = editor.add(note ? note.beat + note.duration : measure * bar, note?.hand); measure = Math.floor(selectedNote().beat / bar); });
    $('[data-chord]')?.addEventListener('click', () => action(() => { selected = editor.add(note.beat, note.hand); }));
    $('[data-save]').onclick = async () => {
      try { await onSave(editor.savedScore()); } catch (e) { error = e.message; render(); }
    };
    // Rebase one measure for a small, directly clickable preview; sustained notes are clipped only for display.
    if (notes.length) {
      const start = measure * bar;
      const preview = { ...score, durationBeats: bar, notes: notes.map(n => ({ ...n, beat: Math.max(0, n.beat-start), duration: Math.min(n.beat+n.duration, start+bar)-Math.max(n.beat,start) })) };
      try { renderer = renderNotation($('[data-editor-preview]'), preview, { autoScroll: false, onSelectNotes: ids => { selected = ids.includes(selected) ? ids[(ids.indexOf(selected)+1)%ids.length] : ids[0]; render(); } }); renderer.setBeat(Math.max(0, (note?.beat ?? start) - start)); }
      catch { $('[data-editor-preview]').textContent = '当前时值无法排版，请使用下方音符按钮调整。'; }
    } else $('[data-editor-preview]').textContent = '本小节休止';
  }
  render();
  return () => renderer?.destroy();
}
