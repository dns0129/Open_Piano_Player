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
