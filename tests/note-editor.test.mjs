import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createNoteEditor } from '../lib/note-editor.mjs';
const raw = { id:'original', title:'编辑测试', tempo:80, timeSignature:[4,4], durationBeats:8, notes:[{ id:'a',beat:0,duration:1,midi:60,hand:'right' },{id:'b',beat:3,duration:2,midi:48,hand:'left'}] };

test('editing is isolated; rejected pitches do not destroy undo history; undo and redo restore notes', () => {
  const editor = createNoteEditor(raw);
  editor.update('a', {midi:61,duration:1.5});
  assert.equal(raw.notes[0].midi,60);
  assert.throws(() => editor.update('a',{midi:109}));
  assert.equal(editor.score.notes[0].midi,61);
  editor.undo(); assert.equal(editor.score.notes[0].midi,60);
  editor.redo(); assert.equal(editor.score.notes[0].duration,1.5);
  editor.update('a',{hand:'left',beat:2});
  assert.equal(editor.canRedo,false);
});
test('add, delete, sustained selection and duration extend preserve score timing', () => {
  const editor = createNoteEditor(raw);
  assert.equal(editor.notesInMeasure(1)[0].id,'b');
  const id = editor.add(8,'left');
  assert.equal(editor.score.durationBeats,9);
  editor.update(id,{duration:2}); assert.equal(editor.score.durationBeats,10);
  editor.remove(id); assert.equal(editor.score.notes.length,2);
  editor.undo(); assert.equal(editor.score.notes.length,3);
  editor.remove('a'); editor.remove('b');
  assert.throws(() => editor.remove(id), /至少保留/);
});
test('first save creates a distinct revision; reopening a revision retains its identity', () => {
  const editor = createNoteEditor(raw); editor.update('a',{midi:62});
  const saved = editor.savedScore();
  assert.notEqual(saved.id,raw.id);
  assert.equal(saved.source.kind,'user-edited');
  const reopened = createNoteEditor(JSON.parse(JSON.stringify(saved)));
  reopened.update('a',{midi:64});
  assert.equal(reopened.savedScore().id,saved.id);
  assert.equal(reopened.savedScore().title,saved.title);
});
test('editor controls change, preview, undo and save a copy through the visible UI', async () => {
  const dom = new JSDOM('<div id="host"></div>', {pretendToBeVisual:true});
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({font:'', measureText:text => ({width:String(text).length*8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2})});
  const previous = {};
  for (const key of ['window','document','HTMLElement','SVGElement','requestAnimationFrame','cancelAnimationFrame']) {
    previous[key]=globalThis[key]; globalThis[key]=typeof dom.window[key] === 'function' && key.includes('AnimationFrame') ? dom.window[key].bind(dom.window) : dom.window[key];
  }
  let saved, heard;
  const { mountNoteEditor } = await import('../src/note-editor.js');
  const root = document.querySelector('#host');
  const dispose = mountNoteEditor(root, raw, {onSave:s => {saved=s;},onPreview:m => {heard=m;}});
  try {
    const click = s => { const target=root.querySelector(s); assert.ok(target,s); target.click(); };
    click('[data-pitch="1"]');
    assert.match(root.textContent,/C♯4/);
    click('[data-duration="0.5"]');
    click('[data-preview]'); assert.equal(heard,61);
    click('[data-undo]'); click('[data-redo]');
    click('[data-chord]');
    click('[data-pitch="-12"]');
    click('[data-remove]');
    click('[data-save]');
    assert.equal(saved.notes.find(n=>n.id==='a').midi,61);
    assert.equal(saved.notes.find(n=>n.id==='a').duration,.5);
    assert.equal(saved.notes.length,2);
    assert.notEqual(saved.id,raw.id);
    click('[data-next]'); assert.match(root.textContent,/上一小节延续/);
  } finally {
    dispose(); dom.window.close();
    for (const [key,value] of Object.entries(previous)) { if(value===undefined) delete globalThis[key]; else globalThis[key]=value; }
  }
});

test('visible mode and chord controls update real saved pitches and support undo with a mixed meter preview',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{pretendToBeVisual:true});dom.window.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:t=>({width:String(t).length*8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2})});const previous={};for(const key of ['window','document','HTMLElement','SVGElement','requestAnimationFrame','cancelAnimationFrame']){previous[key]=globalThis[key];globalThis[key]=typeof dom.window[key]==='function'&&key.includes('AnimationFrame')?dom.window[key].bind(dom.window):dom.window[key];}
 let saved;const {mountNoteEditor}=await import('../src/note-editor.js');const root=document.querySelector('#host');const dispose=mountNoteEditor(root,{...raw,mode:'major',keySignature:0,notes:[{id:'a',beat:0,duration:4,midi:64,hand:'right'},{id:'l',beat:0,duration:4,midi:48,hand:'left'}]}, {onSave:s=>{saved=s;}});
 try{
  root.querySelector('[data-apply-mode]').click();assert.match(root.querySelector('[data-edit-notice]').textContent,/C小调/);assert.match(root.textContent,/D♯4/);
  root.querySelector('[data-note="l"]').click();root.querySelector('[data-chord-root]').value='2';root.querySelector('[data-chord-quality]').value='minor';root.querySelector('[data-replace-chord]').click();
  root.querySelector('[data-editor-mode="roll"]').click();assert.equal(root.querySelectorAll('.notation-roll-note').length,4);
  root.querySelector('[data-save]').click();assert.deepEqual(saved.notes.filter(n=>n.hand==='left').map(n=>n.midi),[50,53,57]);assert.equal(saved.notes.find(n=>n.id==='a').midi,63);assert.equal(saved.mode,'minor');
  root.querySelector('[data-undo]').click();root.querySelector('[data-save]').click();assert.equal(saved.notes.filter(n=>n.hand==='left').length,1);
 }finally{dispose();dom.window.close();for(const[k,v]of Object.entries(previous)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});


test('expression controls preview real settings and save them through undo/redo',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{pretendToBeVisual:true});dom.window.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:t=>({width:String(t).length*8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2})});const previous={};for(const key of ['window','document','HTMLElement','SVGElement','requestAnimationFrame','cancelAnimationFrame']){previous[key]=globalThis[key];globalThis[key]=typeof dom.window[key]==='function'&&key.includes('AnimationFrame')?dom.window[key].bind(dom.window):dom.window[key];}
 let saved,preview;const {mountNoteEditor}=await import('../src/note-editor.js');const root=document.querySelector('#host');const dispose=mountNoteEditor(root,{...raw,notes:[{id:'a',beat:0,duration:1,midi:60,hand:'right'},{id:'b',beat:1,duration:1,midi:60,hand:'right'}]}, {onSave:s=>{saved=s;},onPreview:(m,d,s,id)=>{preview={score:s,id};}});
 try{
  const click=s=>root.querySelector(s).click(), change=(s,v)=>{const el=root.querySelector(s);el.value=v;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
  click('[data-dynamic="pp"]');click('[data-tie]');click('[data-preview]');assert.equal(preview.score.notes[0].tieTo,'b');assert.equal(preview.score.notes[0].velocity,.28);
  change('[data-ornament]','mordent-upper');assert.equal(root.querySelector('[data-tie]').getAttribute('aria-pressed'),'false');change('[data-ornament-interval]','1');
  change('[data-accent]','marcato');change('[data-articulation]','staccato');click('[data-undo]');click('[data-redo]');click('[data-save]');
  const note=saved.notes.find(n=>n.id==='a');assert.equal(note.dynamic,'pp');assert.equal(note.ornament,'mordent-upper');assert.equal(note.ornamentInterval,1);assert.equal(note.accent,'marcato');assert.equal(note.articulation,'staccato');assert.equal(note.tieTo,undefined);
  click('[data-clear-effects]');click('[data-save]');assert.equal(saved.notes[0].ornament,undefined);
  assert.equal(root.querySelectorAll('.notation-error').length,0);
 }finally{dispose();dom.window.close();for(const[k,v]of Object.entries(previous)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});

test('visible grace, fermata and tempo tables save structured expression and render grace glyphs',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{pretendToBeVisual:true});dom.window.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:t=>({width:String(t).length*8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2})});const previous={};for(const key of ['window','document','HTMLElement','SVGElement','requestAnimationFrame','cancelAnimationFrame']){previous[key]=globalThis[key];globalThis[key]=typeof dom.window[key]==='function'&&key.includes('AnimationFrame')?dom.window[key].bind(dom.window):dom.window[key];}
 let saved;const {mountNoteEditor}=await import('../src/note-editor.js');const root=document.querySelector('#host');const dispose=mountNoteEditor(root,raw,{onSave:s=>{saved=s;}});
 try{
  const baseGlyphs=root.querySelectorAll('.vf-stavenote').length;
  root.querySelector('[data-grace-pitches]').value='62 64';root.querySelector('[data-grace-steal]').value='.25';root.querySelector('[data-apply-grace]').click();
  assert.equal(root.querySelectorAll('.notation-error').length,0);assert.ok(root.querySelectorAll('.vf-stavenote').length>=baseGlyphs+2,'grace glyphs are visible instead of ordinary written durations');
  const hold=root.querySelector('[data-fermata]');hold.value='2';hold.dispatchEvent(new dom.window.Event('change'));
  const rows=root.querySelectorAll('[data-tempo-rows] tr');rows[0].querySelector('[data-tempo-beat]').value='0';rows[0].querySelector('[data-tempo-bpm]').value='80';rows[0].querySelector('[data-tempo-curve]').value='linear';rows[1].querySelector('[data-tempo-beat]').value='4';rows[1].querySelector('[data-tempo-bpm]').value='60';root.querySelector('[data-apply-timing]').click();
  root.querySelector('[data-save]').click();assert.deepEqual(saved.tempoMap,[{beat:0,bpm:80,curve:'linear'},{beat:4,bpm:60,curve:'step'}]);assert.equal(saved.notes.find(n=>n.id==='a').grace.notes.length,2);assert.equal(saved.notes.find(n=>n.id==='a').fermata.holdBeats,2);
 }finally{dispose();dom.window.close();for(const[k,v]of Object.entries(previous)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
