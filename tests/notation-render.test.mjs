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
