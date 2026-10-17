import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Element} from 'vexflow';
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
