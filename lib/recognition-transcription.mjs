import {assembleJob} from './score-region.mjs';
// Bridge confirmed source data without inventing review flags or pitch spelling.
export function recognitionTranscription(job,manifest){
  if(manifest?.schema!=='piano-score-pages/v1'||!Array.isArray(manifest.pages))throw Error('需要真实页图的 prepare_score 清单。');
  const result=assembleJob(job,{draft:true});if(!result?.score.recognitionEvidence)throw Error('旧 MIDI 结果缺少书写证据，不能推断成完整转录。');
  const score=result.score,e=score.recognitionEvidence,meta=new Map(e.notes.map(n=>[n.noteId,n])),notes={},rests=[];
  const pageMap=new Map(manifest.pages.map(p=>[p.page,p]));
  const sources=new Map(result.coverage.map(r=>[r.id,r]));
  const sourceFor=(id,beat,staff)=>{
    const range=result.coverage.find(r=>beat>=r.startBeat-1e-6&&beat<r.endBeat-1e-6),region=job.regions.find(r=>r.id===range?.id);
    if(!range||!region||!pageMap.has(region.page))throw Error('来源页/行映射缺失：'+id);
    const measure=result.measureMap.findIndex(m=>beat>=m.beat-1e-6&&beat<m.beat+m.duration-1e-6)+1;
    return {page:region.page,system:region.id,measure,staff};
  };
  for(const n of score.notes){const w=meta.get(n.id);if(!w||!n.pitch||!['source','edited'].includes(n.pitch.provenance))throw Error('音符尚有书写音高矛盾，不能导出为已确认音名：'+n.id);
    const source=sourceFor(n.id,n.beat,w.staff),sourcePitch={step:w.step,alter:w.alter,octave:w.octave};
    const shift=n.midi-((w.octave+1)*12+[0,2,4,5,7,9,11]['CDEFGAB'.indexOf(w.step)]+w.alter);
    notes[n.id]={pitch:{step:n.pitch.step,alter:n.pitch.alter,octave:n.pitch.octave},printedAccidental:w.printed,source,checked:false,...(shift?{sourceWrittenPitch:sourcePitch,octaveShift:shift}:{})};
  }
  for(const r of score.rests||[])if(r.provenance!=='inferred')rests.push({id:r.id,beat:r.beat,duration:r.duration,hand:r.hand,voice:r.voice,source:sourceFor(r.id,r.beat,r.staff),checked:false});
  const keys=[];for(const k of e.keys.filter(k=>k.staff===1)){const m=result.measureMap.findIndex(m=>Math.abs(m.beat-k.beat)<1e-5)+1;if(!m)throw Error('小节中途调号变化需先扩展 Skill 适配。');if(!keys.length||keys.at(-1).fifths!==k.fifths)keys.push({measure:m,fifths:k.fifths,mode:score.mode||'major'});}
  const unhandled=[];if(!score.mode)unhandled.push({message:'调式尚未确认；请核对原谱后选择 major/minor，当前转换仅供草稿检查。'});
  if(e.keys.some(k=>k.staff===2&&!e.keys.some(a=>a.staff===1&&a.beat===k.beat&&a.fifths===k.fifths)))unhandled.push({message:'上下谱表调号不同，Skill 完整导出需适配分谱表调号；原数据保留在 App 转录。'});
  if(e.graces?.length)unhandled.push({message:'App 倚音需补充原谱符值和斜线证据后映射 Skill，不能把播放借时当作书写符值。'});
  const pages=manifest.pages.map(p=>{
    const rows=job.regions.filter(r=>r.page===p.page);if(!rows.length){const excluded=job.excludedPages.find(x=>x.page===p.page);if(!excluded)throw Error('谱页既无行也没有排除说明');return {page:p.page,sha256:p.sha256,status:'excluded',reason:excluded.reason,reviewed:false,systems:[]};}
    return {page:p.page,sha256:p.sha256,status:'score',reviewed:false,systems:rows.map(r=>{const c=sources.get(r.id);return {id:r.id,staves:2,measureStart:c.firstMeasure,measureEnd:c.lastMeasure,complete:true,reviewed:false};})};
  });
  const allowed=['id','midi','beat','duration','hand','voice','velocity','staff','dynamic','accent','articulation','ornament','ornamentInterval','arpeggio','tieTo'];
  return {schema:'piano-score-transcription/v1',provenance:{source:'qinban-compact-v5',calls:[]},pages,
    score:{...score,notes:score.notes.map(n=>Object.fromEntries(allowed.filter(k=>n[k]!==undefined).map(k=>[k,n[k]])))},
    notation:{notes,rests,clefs:e.clefs,voices:e.voices,keys,tempoMarks:[{beat:0,unit:'quarter',dots:0,bpm:score.tempoEvidence?.sourceBpm??score.tempo},...(score.tempoMap||[]).filter(t=>t.beat>0).map(t=>({beat:t.beat,unit:'quarter',dots:0,bpm:t.bpm}))],graces:[],spanners:[],unhandled},
    issues:result.checks.errors.map(i=>({...i,message:i.message})),review:{status:'needs-review',humanConfirmed:false,evidence:[]}};
}
