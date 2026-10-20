import {NOTE_VALUES,writtenBeats,notationDuration} from '../lib/notation-rhythm.mjs';
import { createNoteEditor } from '../lib/note-editor.mjs';
import { beatsPerMeasure, midiName, scoreMeasureBounds, scoreMeasureIndex } from '../lib/score.mjs';
import { CHORD_QUALITIES, onsetGroup, tonalityLabel } from '../lib/score-arrangement.mjs';
import { renderNotation } from './notation.js';
import { DYNAMICS, effectLabels, nextTieNote, ornamentNeighbor } from '../lib/note-effects.mjs';

const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const durations = [[4,'全音符'],[2,'二分'],[1,'四分'],[.5,'八分'],[.25,'十六分']];
const pitchNames = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
function rhythmPanel(note){
  const inferred=notationDuration(note.duration),rhythm=note.rhythm||{type:NOTE_VALUES.find(v=>v[1]===inferred.glyph)[0],dots:inferred.dots,tuplets:inferred.triplet?[{actual:3,normal:2}]:inferred.tuplet?[inferred.tuplet]:[]};
  const t=rhythm.tuplets?.[0],nested=rhythm.tuplets?.[1];
  return `<details data-rhythm-panel><summary>完整音符时值与连音</summary><div class="note-effects-grid"><label>音符类型<select data-rhythm-type aria-label="音符类型">${NOTE_VALUES.map(([type,,beats,label])=>`<option value="${type}" ${rhythm.type===type?'selected':''}>${label}（${beats}拍）</option>`).join('')}</select></label><label>附点<select data-rhythm-dots aria-label="附点数量">${['无附点','单附点','双附点','三附点'].map((label,n)=>`<option value="${n}" ${rhythm.dots===n?'selected':''}>${label}</option>`).join('')}</select></label><label>连音个数<input data-rhythm-actual aria-label="连音个数" type="number" min="1" max="1024" value="${t?.actual||1}"></label><label>占普通音个数<input data-rhythm-normal aria-label="连音占普通音个数" type="number" min="1" max="1024" value="${t?.normal||1}"></label><label>嵌套连音个数<input data-rhythm-nested-actual aria-label="嵌套连音个数" type="number" min="1" max="1024" value="${nested?.actual||1}"></label><label>嵌套占普通音个数<input data-rhythm-nested-normal aria-label="嵌套连音占普通音个数" type="number" min="1" max="1024" value="${nested?.normal||1}"></label></div><p class="form-note">例如八分三连音填 3 与 2，五连音填 5 与 4；复拍子的二连音填 2 与 3。1:1 为普通时值。相邻相同比例自动归组，嵌套比例逐层相乘。</p><button data-apply-rhythm>应用书写时值</button></details>`;
}
function effectsPanel(note,score) {
  const option=(value,label,current)=>`<option value="${value}" ${value===(current||'')?'selected':''}>${label}</option>`;
  const tieTarget=nextTieNote(score,note.id);
  return `<section class="note-effects-panel" aria-label="音符演奏效果"><div class="note-effects-heading"><strong>演奏效果</strong><span>${esc(effectLabels(note).join(' · ')||'自然演奏')}</span><button data-clear-effects>清除效果</button></div>
  <div class="note-dynamics" aria-label="音符力度">${DYNAMICS.map(d=>`<button data-dynamic="${d.id}" class="${note.dynamic===d.id?'selected':''}" aria-pressed="${note.dynamic===d.id}" title="${d.label}"><em>${d.id}</em><small>${d.label}</small></button>`).join('')}<label>力度 <input data-velocity aria-label="音符力度百分比" type="number" min="0" max="100" step="1" value="${Math.round(note.velocity*100)}"> %</label></div>
  <div class="note-effects-grid"><label>轻重音<select data-accent aria-label="重音标记">${[['','无重音'],['accent','> 重音'],['marcato','^ 强重音']].map(([v,l])=>option(v,l,note.accent)).join('')}</select></label>
  <label>触键<select data-articulation aria-label="触键效果">${[['','自然'],['staccato','· 断奏'],['tenuto','— 保持音']].map(([v,l])=>option(v,l,note.articulation)).join('')}</select></label>
  <label>波音与颤音<select data-ornament aria-label="装饰音">${[['','无装饰音'],['trill','tr 颤音'],['mordent-upper','上波音'],['mordent-lower','下波音']].map(([v,l])=>option(v,l,note.ornament)).join('')}</select></label>
  <label>辅助音间距<select data-ornament-interval aria-label="装饰音间距" ${!note.ornament?'disabled':''}>${[['','随调号'],['1','半音'],['2','全音']].map(([v,l])=>option(v,l,String(note.ornamentInterval||''))).join('')}</select></label>
  <label>琶音 · 此手整个音组<select data-arpeggio aria-label="和弦琶音">${[['','同时弹奏'],['up','竖波浪线 ↑ 上行'],['down','竖波浪线 ↓ 下行']].map(([v,l])=>option(v,l,note.arpeggio)).join('')}</select></label>
  <div class="note-tie-control"><span>同音延音线</span><button data-tie aria-pressed="${!!note.tieTo}" class="${note.tieTo?'selected':''}" ${!note.tieTo&&!tieTarget?'disabled':''}>${note.tieTo?'取消延音线':'连接下一同音'}</button></div></div>
  <div class="note-effects-grid"><label>倚音音高（MIDI，按演奏顺序）<input data-grace-pitches aria-label="倚音音高顺序" placeholder="例如 62 64" value="${esc(note.grace?.notes.map(n=>n.midi).join(' ')||'')}"></label><label>借时位置<select data-grace-placement aria-label="倚音借时位置"><option value="before" ${note.grace?.placement!=='on'?'selected':''}>主音拍前</option><option value="on" ${note.grace?.placement==='on'?'selected':''}>占用主音开头</option></select></label><label>倚音总借时（拍）<input data-grace-steal aria-label="倚音总借时拍数" type="number" min="0.0009765625" max="16" step="any" value="${note.grace?.stealBeats??.125}"></label><label><input data-grace-slash type="checkbox" ${note.grace?.slash!==false?'checked':''}> 短倚音斜线</label><button data-apply-grace>应用倚音（留空清除）</button><label>延长记号额外停留（拍，0 清除）<input data-fermata aria-label="延长记号额外拍数" type="number" min="0" max="64" step="any" value="${note.fermata?.holdBeats??0}"></label></div><p class="form-note">倚音依附此主音，不改变纸面时值。拍前空间不足时占用主音开头；实际借时最多占其一半。延长记号会让双手一起停留；延长拍数是可编辑的演奏设置。</p>
  <p class="form-note">${note.ornament?`辅助音：${esc(midiName(ornamentNeighbor(note,score.keySignature)))}。`:''}延音线只连接相接的同手、同声部同音，只起音一次；调整音高、时值或冲突效果会解除无效连接。力度只作用于所选音；琶音作用于此时此手的整个和弦。试听最多 8 拍。</p></section>`;
}
export function mountNoteEditor(root, raw, { onSave, onPreview, initialBeat = 0 } = {}) {
  const editor = createNoteEditor(raw);
  let measure = scoreMeasureIndex(editor.score, initialBeat), selected = null, renderer, error = '', notice = '', dirty = false;
  let previewMode = 'staff', sourceMode = raw.mode || '';
  function selectedNote() { return editor.score.notes.find(n => n.id === selected); }
  function action(fn) { try { fn(); dirty = true; error = ''; } catch (e) { error = e.message; } render(); }
  function render() {
    const expanded = [...root.querySelectorAll('details[open]')].map(el=>el.hasAttribute('data-mode-panel')?'[data-mode-panel]':el.hasAttribute('data-chord-panel')?'[data-chord-panel]':el.hasAttribute('data-timing-panel')?'[data-timing-panel]':el.hasAttribute('data-rhythm-panel')?'[data-rhythm-panel]':null).filter(Boolean);
    renderer?.destroy();
    const score = editor.score, count = score.measureMap?.length || Math.max(1, Math.ceil(score.durationBeats / beatsPerMeasure(score)));
    measure = Math.max(0, Math.min(count - 1, measure));
    const bounds = scoreMeasureBounds(score,measure), {start,length:bar} = bounds;
    const notes = editor.notesInMeasure(measure);
    if (!notes.some(n => n.id === selected)) selected = notes[0]?.id || null;
    const note = selectedNote(), group = note ? onsetGroup(score,note.id) : [];
    const rootNote = group[0] || note;
    root.innerHTML = `<p class="form-note">数字谱面由音符重新排版。修改音高、节奏、和弦或调式后，五线谱、简谱、钢琴卷帘和播放共同更新；首次保存会另存版本。</p>
      <div class="note-editor-toolbar"><button data-previous ${measure === 0 ? 'disabled' : ''}>上一小节</button><label>第 <input data-measure aria-label="编辑小节" type="number" min="1" max="${count}" value="${measure + 1}"> / ${count} 小节</label><button data-next ${measure >= count - 1 ? 'disabled' : ''}>下一小节</button><span></span><button data-undo ${!editor.canUndo ? 'disabled' : ''}>撤销</button><button data-redo ${!editor.canRedo ? 'disabled' : ''}>重做</button></div>
      <div class="note-editor-toolbar"><strong>当前小节 · ${bounds.timeSignature.join('/')}</strong><span></span><div class="notation-switch">${[['staff','五线谱'],['numbered','简谱'],['roll','钢琴卷帘']].map(([v,label])=>`<button data-editor-mode="${v}" aria-pressed="${previewMode===v}" class="${previewMode===v?'selected':''}">${label}</button>`).join('')}</div></div>
      <div data-editor-preview class="note-editor-preview" aria-label="当前小节预览"></div>
      <details class="note-editor-arrangement" data-mode-panel><summary>调式改编 · ${score.mode ? esc(tonalityLabel(score)) : '原调式未标注'}</summary><p class="form-note">同主音大调 ↔ 自然小调：转换音阶内的第3、6、7级，保留节奏与声部。原有调外音保留原音高，转换后需试听；这是规则改编。</p><div class="note-editor-toolbar"><label>原调式 <select data-source-mode aria-label="原调式"><option value="" ${!sourceMode&&!score.mode?'selected':''}>请选择</option>${[['major','大调'],['minor','自然小调']].map(([v,l])=>`<option value="${v}" ${(score.mode||sourceMode)===v?'selected':''}>${l}</option>`).join('')}</select></label><label>目标调式 <select data-target-mode aria-label="目标调式"><option value="minor" ${(score.mode||sourceMode)==='major'?'selected':''}>自然小调</option><option value="major" ${(score.mode||sourceMode)==='minor'?'selected':''}>大调</option></select></label><button data-apply-mode>转换整首调式</button></div></details>
      <details class="note-editor-arrangement" data-timing-panel><summary>变速与休止延长 · ${score.tempoMap?.length||0} 个速度点</summary><p class="form-note">全曲拍位从 0 起，以四分音符为 1 拍。渐变从该点持续到下一速度点；练习速度会按比例缩放整首。延长拍位填在音符或休止的结束处。</p><table><thead><tr><th>全曲拍位</th><th>BPM</th><th>到下一点</th></tr></thead><tbody data-tempo-rows>${(score.tempoMap||[]).concat([null,null]).map(e=>`<tr><td><input data-tempo-beat aria-label="速度点拍位" type="number" min="0" max="${score.durationBeats}" step="any" value="${e?.beat??''}"></td><td><input data-tempo-bpm aria-label="速度点 BPM" type="number" min="20" max="300" step="any" value="${e?.bpm??''}"></td><td><select data-tempo-curve aria-label="速度变化方式"><option value="step">保持速度</option><option value="linear" ${e?.curve==='linear'?'selected':''}>渐变至下一点</option></select></td></tr>`).join('')}</tbody></table><p class="form-note">清空某行拍位即可删除该点。每次应用会再提供两个空行。</p><table><thead><tr><th>停留拍位</th><th>额外拍数</th></tr></thead><tbody data-fermata-rows>${(score.fermatas||[]).concat([null,null]).map(e=>`<tr><td><input data-hold-beat aria-label="停留拍位" type="number" min="0" max="${score.durationBeats}" step="any" value="${e?.beat??''}"></td><td><input data-hold-length aria-label="额外停留拍数" type="number" min="0.0009765625" max="64" step="any" value="${e?.holdBeats??''}"></td></tr>`).join('')}</tbody></table><button data-apply-timing>应用变速与停留</button></details>
      <div class="note-editor-notes" aria-label="选择要修改的音符">${notes.map(n => `<button data-note="${esc(n.id)}" aria-pressed="${n.id === selected}" class="${n.id === selected ? 'selected' : ''}"><strong>${esc(midiName(n.midi))}</strong><small>${n.hand === 'right' ? '右手' : '左手'} · ${n.beat < start ? '上一小节延续' : `第 ${+(n.beat - start + 1).toFixed(3)} 拍`}</small></button>`).join('') || '<p>本小节没有音符，可以补一个。</p>'}</div>
      ${note ? `<div class="note-editor-controls"><div><strong>音高 ${esc(midiName(note.midi))}</strong><div class="note-editor-toolbar">${[[-12,'低八度'],[-1,'降半音'],[1,'升半音'],[12,'高八度']].map(([v,label]) => `<button data-pitch="${v}" ${note.midi + v < 21 || note.midi + v > 108 ? 'disabled' : ''}>${label}</button>`).join('')}<button data-preview>试听这个音</button></div></div><div><strong>时值</strong><div class="note-editor-toolbar">${durations.map(([v,label]) => `<button data-duration="${v}" aria-pressed="${Math.abs(note.duration-v)<.00001}" class="${Math.abs(note.duration-v)<.00001 ? 'selected' : ''}">${label}</button>`).join('')}<button data-dotted class="${durations.some(([v]) => Math.abs(note.duration-v*1.5)<.00001) ? 'selected' : ''}">附点</button><span>${+note.duration.toFixed(4)} 拍</span></div></div><div class="note-editor-toolbar"><label>演奏手 <select data-hand aria-label="演奏手"><option value="right" ${note.hand === 'right' ? 'selected' : ''}>右手</option><option value="left" ${note.hand === 'left' ? 'selected' : ''}>左手</option></select></label><button data-remove>删除这个音</button></div>
      ${rhythmPanel(note)}${effectsPanel(note,score)}
      <details class="note-editor-arrangement" data-chord-panel><summary>替换和弦 · ${note.hand==='right'?'右手':'左手'}此时的 ${group.length} 个音</summary><p class="form-note">只替换所选音符同一时刻、同一只手起奏的音组，另一只手保持原样。按从低到高沿用现有时值，新增和弦音沿用所选音符时值。</p><div class="note-editor-toolbar"><label>根音 <select data-chord-root aria-label="和弦根音">${pitchNames.map((p,i)=>`<option value="${i}" ${rootNote.midi%12===i?'selected':''}>${p}</option>`).join('')}</select></label><label>八度 <select data-chord-octave aria-label="和弦根音八度">${[1,2,3,4,5,6,7].map(o=>`<option ${Math.floor(rootNote.midi/12)-1===o?'selected':''}>${o}</option>`).join('')}</select></label><label>类型 <select data-chord-quality aria-label="和弦类型">${CHORD_QUALITIES.map(c=>`<option value="${c.id}">${c.label}</option>`).join('')}</select></label><button data-replace-chord>替换此音组</button></div></details>
      <details><summary>调整落点与特殊时值</summary><p class="form-note">拍数以四分音符为 1 拍。移动音符会保留其他音符的落点，空出的时间为休止。</p><label>起始拍（本小节从 1 起） <input data-beat type="number" step="any" min="1" max="${bar + 1}" value="${note.beat - start + 1}"></label><label>时值（拍） <input data-custom-duration type="number" min="0.0009765625" max="256" step="any" value="${note.duration}"></label><button data-timing>应用落点与时值</button></details></div>` : ''}
      <p class="form-error" role="alert">${esc(error)}</p><p class="form-note" role="status" data-edit-notice>${esc(notice)}</p><div class="note-editor-footer"><button data-add>＋ ${note ? '在此音后补一个音' : '在小节开头补一个音'}</button>${note ? '<button data-chord>＋ 同时发声的音</button>' : ''}<span data-save-status role="status">${dirty ? '有未保存的修改' : '尚未修改'}</span><button data-save class="button primary" ${!dirty ? 'disabled' : ''}>保存${raw.source?.kind === 'user-edited' ? '修改' : '为修改版'}</button></div><p class="form-note">源图可在原版本的“原图参考”查看。关闭窗口会放弃本次未保存修改；重新排版不会自动修复识别错误。</p>`;
    const $ = s => root.querySelector(s);
    for (const selector of expanded) if ($(selector)) $(selector).open=true;
    $('[data-previous]').onclick = () => { measure--; render(); };
    $('[data-next]').onclick = () => { measure++; render(); };
    const changeMeasure=()=>{measure=Number($('[data-measure]').value)-1||0;render();};
    $('[data-measure]').onchange=changeMeasure;
    $('[data-measure]').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();changeMeasure();}};
    root.querySelectorAll('[data-note]').forEach(b => b.onclick = () => { selected = b.dataset.note; render(); });
    root.querySelectorAll('[data-editor-mode]').forEach(b=>b.onclick=()=>{previewMode=b.dataset.editorMode;render();});
    $('[data-undo]').onclick = () => action(() => {editor.undo();notice='已撤销。';});
    $('[data-redo]').onclick = () => action(() => {editor.redo();notice='已重做。';});
    $('[data-apply-mode]').onclick=()=>action(()=>{const result=editor.convertMode($('[data-target-mode]').value,$('[data-source-mode]').value);notice=`已转换为${tonalityLabel(result.score)}：修改 ${result.changedNotes} 个音；保留 ${result.chromaticNotes} 个调外音，请试听。`;});
    $('[data-source-mode]').onchange=e=>{sourceMode=e.target.value;};
    $('[data-replace-chord]')?.addEventListener('click',()=>action(()=>{selected=editor.replaceChord(selected,{rootMidi:(Number($('[data-chord-octave]').value)+1)*12+Number($('[data-chord-root]').value),quality:$('[data-chord-quality]').value})[0];notice='已替换此时此手的和弦；另一只手保持原样。';}));
    root.querySelectorAll('[data-pitch]').forEach(b => b.onclick = () => action(() => editor.update(selected, { midi: note.midi + Number(b.dataset.pitch) })));
    root.querySelectorAll('[data-duration]').forEach(b => b.onclick = () => action(() => editor.update(selected, { duration: Number(b.dataset.duration) })));
    $('[data-dotted]')?.addEventListener('click', () => action(() => { const dotted = durations.find(([v]) => Math.abs(note.duration-v*1.5)<.00001); editor.update(selected, { duration: dotted ? dotted[0] : note.duration*1.5 }); }));
    $('[data-apply-rhythm]')?.addEventListener('click',()=>action(()=>{
      const tuplets=[['actual','normal'],['nested-actual','nested-normal']].map(([a,n])=>({actual:Number($(`[data-rhythm-${a}]`).value),normal:Number($(`[data-rhythm-${n}]`).value)})).filter(t=>t.actual!==1||t.normal!==1);
      const rhythm={type:$('[data-rhythm-type]').value,dots:Number($('[data-rhythm-dots]').value),...(tuplets.length?{tuplets}:{})};
      editor.update(selected,{duration:writtenBeats(rhythm),rhythm});notice='已保存书写时值和连音比例。';
    }));
    $('[data-hand]')?.addEventListener('change', e => action(() => editor.update(selected, { hand: e.target.value })));
    $('[data-remove]')?.addEventListener('click', () => action(() => editor.remove(selected)));
    $('[data-preview]')?.addEventListener('click', async () => { try { await onPreview?.(note.midi, note.duration, editor.score, selected); } catch (e) { error = e.message; render(); } });
    root.querySelectorAll('[data-dynamic]').forEach(b=>b.onclick=()=>action(()=>editor.setDynamic(selected,b.dataset.dynamic)));
    $('[data-velocity]')?.addEventListener('change',e=>action(()=>{const v=e.target.value.trim()===''?NaN:Number(e.target.value);if(!Number.isFinite(v)||v<0||v>100)throw new Error('力度请输入 0–100。');editor.update(selected,{velocity:v/100,dynamic:undefined});}));
    for(const field of ['accent','articulation','ornament']) $('[data-'+field+']')?.addEventListener('change',e=>action(()=>editor.update(selected,{[field]:e.target.value||undefined})));
    $('[data-ornament-interval]')?.addEventListener('change',e=>action(()=>editor.update(selected,{ornamentInterval:e.target.value?Number(e.target.value):undefined})));
    $('[data-arpeggio]')?.addEventListener('change',e=>action(()=>{editor.setArpeggio(selected,e.target.value);notice='已更新此手整个音组的琶音方向。';}));
    $('[data-tie]')?.addEventListener('click',()=>action(()=>editor.toggleTie(selected)));
    $('[data-apply-grace]')?.addEventListener('click',()=>action(()=>{const pitches=$('[data-grace-pitches]').value.trim();editor.update(selected,{grace:pitches?{notes:pitches.split(/[\s,，]+/).map(midi=>({midi:Number(midi)})),placement:$('[data-grace-placement]').value,stealBeats:Number($('[data-grace-steal]').value),slash:$('[data-grace-slash]').checked}:undefined});}));
    $('[data-fermata]')?.addEventListener('change',e=>action(()=>{const holdBeats=Number(e.target.value);editor.update(selected,{fermata:holdBeats===0?undefined:{holdBeats}});}));
    $('[data-apply-timing]').onclick=()=>action(()=>{
      const tempoMap=[...root.querySelectorAll('[data-tempo-rows] tr')].filter(r=>r.querySelector('[data-tempo-beat]').value!=='').map(r=>({beat:Number(r.querySelector('[data-tempo-beat]').value),bpm:Number(r.querySelector('[data-tempo-bpm]').value),curve:r.querySelector('[data-tempo-curve]').value}));
      const fermatas=[...root.querySelectorAll('[data-fermata-rows] tr')].filter(r=>r.querySelector('[data-hold-beat]').value!=='').map(r=>({beat:Number(r.querySelector('[data-hold-beat]').value),holdBeats:Number(r.querySelector('[data-hold-length]').value)}));
      editor.setTiming(tempoMap,fermatas);notice='已更新演奏时间轴；原谱拍位与时值保留。';
    });
    $('[data-clear-effects]')?.addEventListener('click',()=>action(()=>editor.clearEffects(selected)));
    $('[data-timing]')?.addEventListener('click', () => action(() => {
      const beat = Number($('input[data-beat]').value), duration = Number($('[data-custom-duration]').value);
      if (beat < 1 || beat > bar + 1) throw new Error(`起始拍须在 1 到 ${bar + 1} 之间。`);
      editor.update(selected, { beat: start + beat - 1, duration });
    }));
    $('[data-add]').onclick = () => action(() => { selected = editor.add(note ? note.beat + note.duration : start, note?.hand); if(note)editor.update(selected,{duration:note.duration,rhythm:note.rhythm}); measure = scoreMeasureIndex(editor.score,selectedNote().beat); });
    $('[data-chord]')?.addEventListener('click', () => action(() => { selected = editor.add(note.beat, note.hand); }));
    $('[data-save]').onclick = async () => { try { await onSave(editor.savedScore()); } catch (e) { error = e.message; render(); } };
    if (notes.length) {
      const preview = editor.previewMeasure(measure);
      try { renderer = renderNotation($('[data-editor-preview]'), preview, {mode:previewMode, autoScroll:false, onSelectNotes:ids=>{selected=ids.includes(selected)?ids[(ids.indexOf(selected)+1)%ids.length]:ids[0];render();} }); renderer.setBeat(Math.max(0, (note?.beat ?? start) - start)); }
      catch { $('[data-editor-preview]').textContent = '当前时值无法排版，可切换钢琴卷帘查看精确音符。'; }
    } else $('[data-editor-preview]').textContent = '本小节休止';
  }
  render();
  return () => renderer?.destroy();
}
