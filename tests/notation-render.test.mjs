import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Element,Articulation} from 'vexflow';
import {fontsReady,renderNotation} from '../src/notation.js';

test('multi-note chord ties at both system boundaries render without dropping either staff', async () => {
  await fontsReady;
  const dom=new JSDOM('<div id="host"></div>');
  const saved={document:globalThis.document,window:globalThis.window,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  const savedError=console.error, errors=[],measurementCanvas=Element.getTextMeasurementCanvas();
  let renderer;
  try {
    globalThis.document=dom.window.document;globalThis.window=dom.window;
    globalThis.cancelAnimationFrame=()=>{};
    dom.window.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:text=>({width:String(text).length*8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2})});
    Element.setTextMeasurementCanvas(document.createElement('canvas'));
    console.error=(...args)=>errors.push(args);
    const host=document.querySelector('#host');
    Object.defineProperty(host,'clientWidth',{value:360});
    const score={tempo:90,timeSignature:[4,4],keySignature:7,durationBeats:8,notes:[
      ...[61,65,68].map(midi=>({id:`right-${midi}`,beat:0,duration:8,midi,hand:'right'})),
      ...[37,41].map(midi=>({id:`left-${midi}`,beat:0,duration:8,midi,hand:'left'}))]};
    renderer=renderNotation(host,score,{mode:'staff',autoScroll:false});
    assert.equal(host.querySelectorAll('.notation-error').length,0,errors.map(args=>args.map(String).join(' ')).join('\n'));
    assert.equal(host.querySelectorAll('.notation-system svg').length,2);
    assert.equal(host.querySelectorAll('.notation-hit').length,4,'both hands keep their seek targets in both systems');
  } finally {
    renderer?.destroy();console.error=savedError;
    Element.setTextMeasurementCanvas(measurementCanvas);
    for(const [key,value] of Object.entries(saved)) {if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
    dom.window.close();
  }
});

test('piano roll preserves exact triplet and independent overlap timing and seeks an individual note',()=>{
 const dom=new JSDOM('<div id="host"></div>');const saved={document:globalThis.document,window:globalThis.window,cancelAnimationFrame:globalThis.cancelAnimationFrame};let renderer,selected;
 try{
  globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.cancelAnimationFrame=()=>{};
  const score={tempo:90,timeSignature:[4,4],keySignature:0,durationBeats:4,notes:[{id:'r',midi:72,beat:1/3,duration:1/3,hand:'right'},{id:'l',midi:48,beat:0,duration:4,hand:'left'}]};
  const host=document.querySelector('#host');renderer=renderNotation(host,score,{mode:'roll',autoScroll:false,onSelectNotes:ids=>{selected=ids;}});
  assert.equal(host.querySelectorAll('.notation-error').length,0);
  assert.equal(host.querySelectorAll('.notation-roll-note').length,2);
  const r=host.querySelector('[data-note-id="r"]');assert.equal(Number(r.dataset.start),1/3);assert.equal(Number(r.dataset.duration),1/3);assert.equal(Number(r.dataset.midi),72);
  r.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));assert.deepEqual(selected,['r']);
  renderer.setBeat(.5);assert.ok(r.classList.contains('is-active'));
 }finally{renderer?.destroy();for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}dom.window.close();}
});

test('effects engrave on both written formats; the roll shows actual ornament pitches and arpeggio offsets',()=>{
 const dom=new JSDOM('<div id="host"></div>');const saved={document:globalThis.document,window:globalThis.window,cancelAnimationFrame:globalThis.cancelAnimationFrame};let renderer;
 const canvas=Element.getTextMeasurementCanvas();
 try{
  globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.cancelAnimationFrame=()=>{};
  dom.window.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:text=>({width:String(text).length*8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2})});Element.setTextMeasurementCanvas(document.createElement('canvas'));
  const score={tempo:90,timeSignature:[4,4],keySignature:0,durationBeats:8,notes:[
   {id:'a',beat:0,duration:1,midi:60,hand:'right',dynamic:'p',accent:'accent',articulation:'tenuto',tieTo:'b'},
   {id:'b',beat:1,duration:1,midi:60,hand:'right'},
   {id:'tr',beat:2,duration:1,midi:64,hand:'right',ornament:'trill',ornamentInterval:2},
   {id:'mo',beat:3,duration:1,midi:64,hand:'right',ornament:'mordent-lower',ornamentInterval:1},
   ...[60,64,67].map((midi,i)=>({id:`arp${i}`,beat:4,duration:1,midi,hand:'right',arpeggio:'up'}))]};
  const host=document.querySelector('#host');
  for(const mode of ['staff','numbered']){renderer=renderNotation(host,score,{mode,autoScroll:false});assert.equal(host.querySelectorAll('.notation-error').length,0,host.textContent);assert.ok(host.querySelectorAll('.notation-effects').length>=3);if(mode==='staff'){assert.ok(host.querySelector('.notation-arpeggio'));assert.equal(host.querySelector('.notation-dynamic').textContent,'p');}else assert.ok(host.querySelector('.notation-tie'));renderer.destroy();}
  renderer=renderNotation(host,score,{mode:'roll',autoScroll:false});
  assert.ok(host.querySelector('.notation-roll-note[data-midi="66"]'),'the custom trill auxiliary F sharp is an actual played note');
  const arp=host.querySelector('[data-note-id="arp2"]');assert.equal(Number(arp.dataset.start),4.24);
  assert.equal(host.querySelectorAll('[data-note-id="b"]').length,0,'the tied continuation has no new attack');
 }finally{renderer?.destroy();Element.setTextMeasurementCanvas(canvas);for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}dom.window.close();}
});


test('both written formats follow a mid-system key change and repeat the active key on the next system',async()=>{
 await fontsReady;
 const dom=new JSDOM('<div id="host"></div>'),saved={document:globalThis.document,window:globalThis.window,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 const canvas=Element.getTextMeasurementCanvas();let renderer;
 try{
  globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.cancelAnimationFrame=()=>{};
  dom.window.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:text=>({width:String(text).length*8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2})});Element.setTextMeasurementCanvas(document.createElement('canvas'));
  const host=document.querySelector('#host');Object.defineProperty(host,'clientWidth',{value:800});
  const score={tempo:95,timeSignature:[4,4],keySignature:-3,durationBeats:20,measureMap:Array.from({length:5},(_,i)=>({beat:i*4,duration:4,...(i===1?{keySignature:4}:{})})),notes:Array.from({length:5},(_,i)=>[70,74].map(midi=>({id:'n'+i+'_'+midi,midi,beat:i*4,duration:4,hand:'right',accent:'accent'}))).flat()};
  for(const mode of ['staff','numbered']){
   renderer=renderNotation(host,score,{mode,showNoteNames:true,autoScroll:false});
   assert.equal(host.querySelectorAll('.notation-error').length,0,host.textContent);
   assert.deepEqual([...host.querySelectorAll('.notation-measure')].map(e=>e.dataset.keySignature),['-3','4','4','4','4']);
   assert.match(host.querySelector('[data-measure="0"]').textContent,/B♭4/);
   assert.match(host.querySelector('[data-measure="1"]').textContent,/A♯4/);
   if(mode==='staff')assert.equal([...host.querySelectorAll('svg text')].filter(t=>t.textContent===new Articulation('a>').getText()).length,5,'one printed accent per chord, while both notes retain accented playback');
   if(mode==='numbered')assert.match(host.querySelector('[data-measure="1"] .notation-key-label').textContent,/1 = E/);
   renderer.destroy();
  }
 }finally{renderer?.destroy();Element.setTextMeasurementCanvas(canvas);for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}dom.window.close();}
});

test('paper rendering includes every offscreen system without waiting for intersections', async () => {
  await fontsReady;
  const dom = new JSDOM('<div id="host"></div>');
  const saved = Object.fromEntries(['document', 'window', 'cancelAnimationFrame', 'IntersectionObserver'].map(key => [key, globalThis[key]]));
  let renderer;
  try {
    globalThis.document = dom.window.document; globalThis.window = dom.window;
    globalThis.cancelAnimationFrame = () => {};
    // Never fire an intersection: print rendering must explicitly include the end.
    globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    const host = document.querySelector('#host');
    Object.defineProperty(host, 'clientWidth', { value: 694 });
    const score = { tempo: 80, timeSignature: [4, 4], keySignature: 0, durationBeats: 160,
      notes: Array.from({ length: 40 }, (_, i) => ({ id: `note-${i}`, beat: i * 4, duration: 4, midi: 60, hand: 'right' })) };
    renderer = renderNotation(host, score, { mode: 'numbered', autoScroll: false });
    const count = host.querySelectorAll('.notation-system').length;
    assert.ok(count > 3);
    assert.equal(host.querySelectorAll('.notation-system > svg').length, 3);
    renderer.destroy();
    renderer = renderNotation(host, score, { mode: 'numbered', autoScroll: false, renderAll: true });
    assert.equal(host.querySelectorAll('.notation-system > svg').length, count);
    assert.equal(host.querySelector('.notation-system:last-child').dataset.lastMeasure, '39');
    assert.equal(host.querySelectorAll('.notation-error').length, 0);
  } finally {
    renderer?.destroy();
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
    dom.window.close();
  }
});

test('extended glyphs, rests, compound duplets, nested tuplets and real imported passages engrave in both formats',async()=>{
 await fontsReady;
 const {readFile}=await import('node:fs/promises');
 const dom=new JSDOM('<div id="host"></div>'),saved={document:globalThis.document,window:globalThis.window,cancelAnimationFrame:globalThis.cancelAnimationFrame},canvas=Element.getTextMeasurementCanvas();let renderer;
 const errors=[],priorError=console.error;
 try{
  globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.cancelAnimationFrame=()=>{};
  dom.window.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:t=>({width:String(t).length*8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2})});Element.setTextMeasurementCanvas(document.createElement('canvas'));console.error=(...e)=>errors.push(e.join(' '));
  const host=document.querySelector('#host');Object.defineProperty(host,'clientWidth',{value:1100});
  const fixtures=[];
  for(const n of [3,5,7,9,11,13])fixtures.push({id:'group'+n,tempo:90,timeSignature:[1,4],durationBeats:1,notes:Array.from({length:n},(_,i)=>({id:'n'+i,beat:i/n,duration:1/n,midi:60+i%7,hand:'right'}))});
  fixtures.push({id:'nested',tempo:90,timeSignature:[1,4],durationBeats:1,notes:Array.from({length:9},(_,i)=>({id:'n'+i,beat:i/9,duration:1/9,midi:60+i%7,hand:'right',rhythm:{type:'16th',dots:0,tuplets:[{actual:3,normal:2,group:'outer'},{actual:3,normal:2,group:'inner'+Math.floor(i/3)}]}}))});
  fixtures.push({id:'duplet',tempo:90,timeSignature:[6,8],durationBeats:3,notes:Array.from({length:4},(_,i)=>({id:'d'+i,beat:i*.75,duration:.75,midi:60+i,hand:'right',rhythm:{type:'eighth',dots:0,tuplets:[{actual:2,normal:3}]}}))});
  for(const duration of [8,7,3.5,1.875,.109375,.015625])fixtures.push({id:'duration'+duration,tempo:90,timeSignature:[4,4],durationBeats:duration,notes:[{id:'a',beat:0,duration,midi:60,hand:'right'}]});
  for(const [id,measure] of [['intermediate-beethoven-op27-2-m1',0],['intermediate-beethoven-op13-m2',20],['beginner-schumann-op68-18',0],['intermediate-beethoven-op49-1-m2',3]]){
   const {score}=JSON.parse(await readFile(new URL('../public/cloud-library/scores/'+id+'.json',import.meta.url)));
   const {scoreMeasureBounds}=await import('../lib/score.mjs');const {start,end,length,timeSignature}=scoreMeasureBounds(score,measure);
   fixtures.push({...score,id,timeSignature,measureMap:[{beat:0,duration:length,timeSignature}],durationBeats:length,notes:score.notes.filter(n=>n.beat<end&&n.beat+n.duration>start).map(n=>({...n,beat:Math.max(0,n.beat-start),duration:Math.min(end,n.beat+n.duration)-Math.max(start,n.beat)})),rests:[]});
  }
  for(const fixture of fixtures)for(const mode of ['staff','numbered']){
   renderer=renderNotation(host,fixture,{mode,autoScroll:false,renderAll:true});
   assert.equal(host.querySelectorAll('.notation-error').length,0,fixture.id+' '+mode+' '+errors.join('\n'));
   const ids=new Set([...host.querySelectorAll('.notation-hit')].flatMap(el=>el.dataset.noteIds.split(' ')));
   for(const note of fixture.notes)assert.ok(ids.has(note.id),fixture.id+' lost '+note.id);
   if(fixture.id==='duplet'&&mode==='numbered')assert.match(host.querySelector('.notation-tuplet').textContent,/2:3/);
   if(fixture.id==='nested'&&mode==='numbered')assert.equal(host.querySelectorAll('.notation-tuplet').length,4);
   renderer.destroy();
  }
  assert.deepEqual(errors,[]);
 }finally{renderer?.destroy();console.error=priorError;Element.setTextMeasurementCanvas(canvas);for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}dom.window.close();}
});
