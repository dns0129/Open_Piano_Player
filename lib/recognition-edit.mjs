import {auditWrittenNotation,writtenMidi} from './recognition-notation.mjs';
export function refreshWrittenPitch(region,noteId){
 const note=region.notes.find(n=>n.id===noteId);if(!note)return;
 const evidence=region.score?.recognitionEvidence;if(!evidence)return;
 const source=evidence.notes.find(n=>n.noteId===noteId);
 const accidental={'-2':'flat-flat','-1':'flat','0':'natural','1':'sharp','2':'double-sharp'}[source?.printed];
 if(accidental)note.accidental=accidental;else delete note.accidental;
 let audit;try{audit=auditWrittenNotation({...region.score,notes:region.notes},region.coverage.measureDurations,region.internalTies,region.continuity);}catch{delete note.pitch;return;}const p=audit.pitches[noteId];
 if(p&&writtenMidi(p)===note.midi)note.pitch={...p,provenance:'edited'};else delete note.pitch;
}
export function editWrittenEvidence(region,{kind,index,noteId,field,value}){
 const e=region.score?.recognitionEvidence;if(!e)return false;
 let target;
 if(kind==='note'){
  target=e.notes.find(n=>n.noteId===noteId);
  if(!target){target={noteId,staff:null,step:'',octave:null,alter:null,printed:null,shift:0};e.notes.push(target);}
 }else if(kind==='rest'){
  const rest=region.rests[index];if(!rest)return false;
  if(!rest.id){let suffix=index;while(region.rests.some(r=>r.id==='manual-rest-'+suffix))suffix++;rest.id='manual-rest-'+suffix;}
  target=e.rests.find(r=>r.restId===rest.id);if(!target){target={restId:rest.id,staff:rest.staff||1};e.rests.push(target);}
  if(field==='staff'){rest.staff=value;rest.provenance='edited';}
 }else if(kind==='voice')target=e.voices[index];
 else if(kind==='clef')target=e.clefs[index];
 else if(kind==='key')target=e.keys[index];
 if(!target)return false;
 const before=structuredClone(target);target[field]=value;
 if(kind==='note'){
  if(['step','octave','staff'].includes(field))target.position=null;
  if(field==='staff'){const n=region.notes.find(n=>n.id===noteId);if(n)n.staff=value;}
  try{refreshWrittenPitch(region,noteId);}catch{const note=region.notes.find(n=>n.id===noteId);if(note)delete note.pitch;}
 }
 if(kind==='key'){
  const at=beat=>e.keys.filter(k=>k.staff===1&&k.beat<=beat).sort((a,b)=>a.beat-b.beat).at(-1)?.fifths;
  if(Number.isInteger(at(0)))region.score.keySignature=at(0);
  for(const bar of region.score.measureMap||[])if(Number.isInteger(at(bar.beat)))bar.keySignature=at(bar.beat);
 }
 if(kind==='clef'||kind==='key')for(const note of region.notes)refreshWrittenPitch(region,note.id);
 region.corrections||=[];region.corrections.push({type:'written-source-edit',kind:'written-source-edit',description:`人工修改原谱${kind} ${noteId||index+1} 的 ${field}`,evidence:'校对界面中的明确编辑，仍须对照原图审核',noteIds:noteId?[noteId]:[],before:JSON.stringify(before),after:JSON.stringify(target)});
 return true;
}

export function removeWrittenEvent(region,kind,id){
 const e=region.score?.recognitionEvidence;if(!e)return;
 const before=kind==='note'?{event:region.notes.find(n=>n.id===id),evidence:e.notes.find(n=>n.noteId===id)}:{event:region.rests.find(r=>r.id===id),evidence:e.rests.find(r=>r.restId===id)};
 const removed=new Set([id]);
 if(kind==='note'){
  for(const g of e.graces||[])if(g.anchor===id)removed.add(g.noteId);
  e.graces=(e.graces||[]).filter(g=>!removed.has(g.noteId)&&!removed.has(g.anchor));
  e.notes=e.notes.filter(n=>!removed.has(n.noteId));
  region.internalTies=(region.internalTies||[]).filter(t=>!removed.has(t.fromNoteId)&&!removed.has(t.toNoteId));
  for(const k of ['tieIn','tieOut'])if(region.continuity?.[k])region.continuity[k]=region.continuity[k].filter(t=>!removed.has(t.noteId));
 }else if(kind==='rest')e.rests=e.rests.filter(r=>r.restId!==id);
 region.corrections||=[];region.corrections.push({type:'written-source-delete',kind:'written-source-delete',description:`人工删除原谱${kind} ${id||''}`,evidence:'校对界面中的明确删除，仍须对照原图审核',noteIds:kind==='note'?[id]:[],before:JSON.stringify(before),after:'已删除'});
}
