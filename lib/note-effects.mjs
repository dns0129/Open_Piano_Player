import {validateWrittenPitch} from './score-notation-data.ts';
import { diatonicNeighbor, diatonicNeighborInfo } from './pitch-spelling.mjs';
/** Written notation stays intact; this layer expands it into piano attacks. */
export const DYNAMICS = [
  {id:'pp',label:'很轻',velocity:.28}, {id:'p',label:'轻',velocity:.42},
  {id:'mp',label:'中轻',velocity:.56}, {id:'mf',label:'中强',velocity:.7},
  {id:'f',label:'强',velocity:.84}, {id:'ff',label:'很强',velocity:.96},
];
const EPS = 1e-7;
const options = { dynamic:DYNAMICS.map(d=>d.id), accent:['accent','marcato'], articulation:['staccato','tenuto'], ornament:['trill','mordent-upper','mordent-lower'], arpeggio:['up','down'] };
export function normalizeNoteEffects(note) {
  const result = {};
  if(note.fermata!=null){
    const holdBeats=note.fermata.holdBeats;
    if(!Number.isFinite(holdBeats)||holdBeats<1/1024||holdBeats>64)throw Error('延长记号额外拍数须为 1/1024–64。');
    result.fermata={holdBeats};
  }
  if(note.grace!=null){
    const g=note.grace;
    if(!['before','on'].includes(g.placement)||!Array.isArray(g.notes)||!g.notes.length||g.notes.length>32||typeof g.slash!=='boolean'||!Number.isFinite(g.stealBeats)||g.stealBeats<=0||g.stealBeats>16)throw Error('倚音须有音高顺序、拍前/拍内位置及有效借时拍数。');
    result.grace={placement:g.placement,slash:g.slash,stealBeats:g.stealBeats,notes:g.notes.map(p=>{
      if(!Number.isInteger(p.midi)||p.midi<21||p.midi>108||p.velocity!==undefined&&(!Number.isFinite(p.velocity)||p.velocity<0||p.velocity>1))throw Error('倚音音高或力度无效。');
      return {midi:p.midi,...(p.pitch?{pitch:validateWrittenPitch(p.pitch,p.midi)}:{}),...(p.velocity===undefined?{}:{velocity:p.velocity})};
    })};
  }
  for (const [field,values] of Object.entries(options)) if (note[field] !== undefined && note[field] !== null && note[field] !== '') {
    if (!values.includes(note[field])) throw new Error(`音符效果 ${field} 无效。`);
    result[field] = note[field];
  }
  if (note.ornamentInterval !== undefined && note.ornamentInterval !== null) {
    if (![1,2].includes(note.ornamentInterval)) throw new Error('装饰音辅助音须相隔 1 或 2 个半音。');
    result.ornamentInterval = note.ornamentInterval;
  }
  if (note.tieTo !== undefined && note.tieTo !== null && note.tieTo !== '') {
    if (typeof note.tieTo !== 'string' || note.tieTo.length > 80) throw new Error('延音线目标无效。');
    result.tieTo = note.tieTo;
  }
  return result;
}
export function synchronizeArpeggios(notes) {
  const groups=new Map();
  for(const n of notes) if(n.arpeggio) {
    const key=`${n.hand}:${n.beat}`;
    if(groups.has(key)&&groups.get(key)!==n.arpeggio) throw new Error('同一和弦的琶音方向须一致。');
    groups.set(key,n.arpeggio);
  }
  return notes.map(n=>groups.has(`${n.hand}:${n.beat}`)?{...n,arpeggio:groups.get(`${n.hand}:${n.beat}`)}:n);
}
export function compatibleTie(a,b) {
  return b && a.id !== b.id && a.midi === b.midi && a.hand === b.hand
    && String(a.voice ?? '') === String(b.voice ?? '') && Math.abs(a.beat+a.duration-b.beat)<EPS
    && !a.ornament && !b.ornament && !a.arpeggio && !b.arpeggio && !b.grace
    && a.articulation !== 'staccato' && b.articulation !== 'staccato';
}
export function validateTies(notes) {
  const byId=new Map(notes.map(n=>[n.id,n])), incoming=new Set();
  for(const n of notes) if(n.tieTo) {
    if(!compatibleTie(n,byId.get(n.tieTo))) throw new Error('延音线只能连接同手、同声部、前后相接的同音；请先取消断奏、装饰音或琶音。');
    if(incoming.has(n.tieTo)) throw new Error('同一个音符不能接收两条延音线。');
    incoming.add(n.tieTo);
  }
}
export function detachInvalidTies(notes) {
  const byId=new Map(notes.map(n=>[n.id,n]));
  return notes.map(n=> { if(!n.tieTo || compatibleTie(n,byId.get(n.tieTo))) return n; const {tieTo,...rest}=n;return rest; });
}
export function nextTieNote(score,id) {
  const n=score.notes.find(n=>n.id===id);
  return n && score.notes.find(b=>compatibleTie(n,b) && !score.notes.some(a=>a.id!==id && a.tieTo===b.id));
}
export function tieChains(notes) {
  const byId=new Map(notes.map(n=>[n.id,n])), incoming=new Set(notes.filter(n=>compatibleTie(n,byId.get(n.tieTo))).map(n=>n.tieTo)), chains=new Map();
  for(const head of notes) if(!incoming.has(head.id)) {
    const members=[head];let last=head;
    while(compatibleTie(last,byId.get(last.tieTo))) { last=byId.get(last.tieTo);members.push(last); }
    const chain={head,members,start:head.beat,end:last.beat+last.duration};
    members.forEach(n=>chains.set(n.id,chain));
  }
  return chains;
}
export function ornamentNeighbor(note,keySignature=0) {
  const direction=note.ornament==='mordent-lower'?-1:1;
  if(note.ornamentInterval) return note.midi+direction*note.ornamentInterval;
  return diatonicNeighbor(note.midi,keySignature,direction,note.pitch);
}
export function validateOrnaments(notes,keySignature=0) {
  for(const n of notes) if(n.ornament) {
    const aux=ornamentNeighbor(n,keySignature);
    if(aux<21 || aux>108) throw new Error('装饰音的辅助音超出了 88 键钢琴范围。');
  }
}
export function ornamentAccidental(note,keySignature=0) {
  if(!note.ornament) return null;
  const next=diatonicNeighborInfo(note.midi,keySignature,note.ornament==='mordent-lower'?-1:1,note.pitch), aux=ornamentNeighbor(note,keySignature);
  if(aux===next.naturalMidi+next.accidental) return null;
  return ({'-2':'bb','-1':'b',0:'n',1:'#',2:'##'})[aux-next.naturalMidi]??null;
}
export function effectLabels(note) {
  return [note.dynamic, note.accent==='accent'?'>':note.accent==='marcato'?'^':'',
    note.articulation==='staccato'?'·':note.articulation==='tenuto'?'—':'',
    ({trill:'tr', 'mordent-upper':'上波音', 'mordent-lower':'下波音'})[note.ornament],
    note.arpeggio ? (note.arpeggio==='up'?'琶音↑':'琶音↓') : '',note.tieTo?'延音线':'',note.grace?`${note.grace.notes.length}音倚音`:'',note.fermata?'延长记号':''].filter(Boolean);
}

/** All offsets remain quarter-note beats, so tempo changes, loops and MIDI agree. */
export function performanceNotes(score) {
  const notes=(score.notes||[]).map((n,i)=>n.id?n:{...n,id:`performance-note-${i}`});
  const chains=tieChains(notes), result=[];
  for(const n of notes) {
    if(result.length>200000) throw new Error('装饰音展开超过 20 万个发声事件，请减少长颤音后再播放或导出。');
    const chain=chains.get(n.id);
    if(chain && chain.head.id!==n.id) continue;
    const end=chain?.end ?? n.beat+n.duration;
    let start=n.beat;
    if(n.arpeggio) {
      const chord=notes.filter(p=>p.hand===n.hand&&Math.abs(p.beat-n.beat)<EPS).sort((a,b)=>a.midi-b.midi);
      if(n.arpeggio==='down') chord.reverse();
      const spread=Math.min(.24,...chord.map(p=>p.duration/2));
      start+=chord.length>1?chord.findIndex(p=>p.id===n.id)*spread/(chord.length-1):0;
    }
    const velocity=Math.min(1,(n.velocity??.7)*(n.accent==='accent'?1.2:n.accent==='marcato'?1.4:1));
    const gate=n.articulation==='staccato'?.45:1;
    const base={...n,sourceIds:chain?.members.map(p=>p.id)||[n.id],velocity};
    if(!n.ornament) { result.push({...base,beat:start,duration:(end-start)*gate});continue; }
    const aux=ornamentNeighbor(n,score.keySignature), length=(end-start)*gate;
    if(n.ornament==='trill') {
      const count=Math.min(2048,Math.max(2,Math.ceil(length/.125))), step=length/count;
      for(let i=0;i<count;i++) result.push({...base,midi:i%2?aux:n.midi,beat:start+i*step,duration:step});
    } else {
      const step=Math.min(.125,length/4);
      for(const [offset,midi,duration] of [[0,n.midi,step],[step,aux,step],[2*step,n.midi,length-2*step]]) result.push({...base,midi,beat:start+offset,duration});
    }
  }
  // Grace notes keep the principal's written position/duration intact. Borrow
  // only in the performance copy, within that hand and voice; the other hand
  // remains on the original clock. At the start, before-beat falls back to on.
  for(const main of notes.filter(n=>n.grace)){
    const g=main.grace,on=g.placement==='on'||main.beat<g.stealBeats;
    const borrow=Math.min(g.stealBeats,on?main.duration/2:main.beat),start=on?main.beat:main.beat-borrow;
    const same=n=>n.hand===main.hand&&String(n.voice??'')===String(main.voice??'');
    for(const n of result.filter(same)){
      const end=n.beat+n.duration;
      if(on&&n.beat>=main.beat-EPS&&n.beat<main.beat+borrow){n.beat=main.beat+borrow;n.duration=Math.max(0,end-n.beat);}
      else if(!on&&n.beat<main.beat&&end>start){n.duration=Math.max(0,start-n.beat);}
    }
    g.notes.forEach((p,i)=>result.push({id:`${main.id}-grace-${i}`,sourceIds:[main.id],hand:main.hand,voice:main.voice,midi:p.midi,velocity:p.velocity??main.velocity??.7,beat:start+i*borrow/g.notes.length,duration:borrow/g.notes.length,isGrace:true}));
  }
  return result.filter(n=>n.duration>0).sort((a,b)=>a.beat-b.beat||a.midi-b.midi);
}
