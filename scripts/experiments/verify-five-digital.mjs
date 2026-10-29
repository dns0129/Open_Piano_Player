// Offline verification of actual imported scores; makes no model/network calls.
import {readFile,writeFile}from'node:fs/promises';
import {JSDOM}from'jsdom';import{Element}from'vexflow';
import{fontsReady,renderNotation}from'../../src/notation.js';
import{PianoPlayer}from'../../src/audio.js';
import{exportMusicXML}from'../../lib/exporters.mjs';import{importMusicXML}from'../../lib/importers.mjs';
import{validateScore}from'../../lib/score.mjs';
const root=process.argv[2]||'.local/batch-five-high-accidentals-v2';
const keys=['merry','eutopia-staff','sudi','ifyou','golden'];
const reports=[];await fontsReady;
const signature=n=>[n.hand,n.midi,Math.round(n.beat*1e6),Math.round(n.duration*1e6)].join(':');
const multiset=a=>a.map(signature).sort();
class Param{value=0;setTargetAtTime(){}setValueAtTime(){}linearRampToValueAtTime(){}cancelScheduledValues(){}}
class Node{gain=new Param();threshold=new Param();knee=new Param();ratio=new Param();attack=new Param();release=new Param();connect(){}disconnect(){}}
for(const key of keys){
 const raw=JSON.parse(await readFile(root+'/'+key+'-score.json','utf8')),score=validateScore(raw.score||raw);
 const report={key,id:score.id,notes:score.notes.length,measures:score.measureMap?.length,durationBeats:score.durationBeats,formats:{}};
 const xml=exportMusicXML(score),back=importMusicXML(xml).score;
 report.musicXmlRoundTrip=JSON.stringify(multiset(score.notes))===JSON.stringify(multiset(back.notes));
 const dom=new JSDOM('<div id="host"></div>'),saved={document:globalThis.document,window:globalThis.window,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 const canvas=Element.getTextMeasurementCanvas(),errors=[],oldError=console.error;
 try{
  globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.cancelAnimationFrame=()=>{};
  dom.window.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:t=>({width:String(t).length*8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2})});
  Element.setTextMeasurementCanvas(document.createElement('canvas'));console.error=(...a)=>errors.push(a.map(String).join(' '));
  const host=document.querySelector('#host');Object.defineProperty(host,'clientWidth',{value:1400});
  for(const mode of ['staff','numbered','roll']){
   const renderer=renderNotation(host,score,{mode,autoScroll:false});
   const failures=[...host.querySelectorAll('.notation-error')].map(e=>e.textContent);
   const samples=[];
   for(const bar of [0,Math.floor(score.measureMap.length/2),score.measureMap.length-1]){
    const bounds=score.measureMap[bar],note=score.notes.find(n=>n.beat>=bounds.beat&&n.beat<bounds.beat+bounds.duration);
    const beat=note?note.beat+Math.min(note.duration/2,.01):bounds.beat+.01;
    renderer.setBeat(beat);samples.push({bar:bar+1,beat,current:host.querySelectorAll('.is-current').length,active:host.querySelectorAll('.is-active').length});
   }
   report.formats[mode]={systems:host.querySelectorAll('.notation-system').length,errors:failures,followSamples:samples};renderer.destroy();
  }
 }finally{
  console.error=oldError;Element.setTextMeasurementCanvas(canvas);
  for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}dom.window.close();
 }
 let tick;const context={currentTime:0,state:'running',destination:{},createGain:()=>new Node(),createDynamicsCompressor:()=>new Node(),async resume(){},async close(){}};
 const attacks=[];const player=new PianoPlayer({instrument:'synth',audioContextFactory:()=>context,setIntervalFn:f=>(tick=f,1),clearIntervalFn:()=>{tick=null;},requestFrame:()=>1,cancelFrame:()=>{}});
 player._piano=(midi,start,duration,velocity,elapsed)=>attacks.push({midi,start,duration,velocity,elapsed});
 player.setScore(score);await player.play();
 const endSeconds=score.durationBeats*60/score.tempo+.1;
 while(context.currentTime<endSeconds&&player.state==='playing'){context.currentTime+=.025;tick?.();}
 report.fullPlayback={ended:player.state==='stopped',beat:player.beat,attacks:attacks.length,expected:score.notes.length};await player.dispose();
 report.passed=report.musicXmlRoundTrip&&report.fullPlayback.ended&&report.fullPlayback.attacks===score.notes.length&&Object.values(report.formats).every(f=>!f.errors.length&&f.followSamples.every(s=>s.current>0));
 reports.push(report);console.log(JSON.stringify(report));
}
await writeFile(root+'/digital-verification.json',JSON.stringify({at:new Date().toISOString(),reports},null,2));
if(reports.some(r=>!r.passed))process.exitCode=2;
