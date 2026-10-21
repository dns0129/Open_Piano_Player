// Pure score validation and assembly shared by developer tools and hosted jobs.
// This module never imports account credentials, local jobs, or model transports.
import {createHash} from 'node:crypto';
import {validateScore} from './score.mjs';
import {normalizeOmrReview,omrReviewIssues} from './omr-review.mjs';
import {assembleScoreTiming,normalizeScoreTiming} from './score-timing.mjs';
const EPS=1e-5;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const text=(value,max=300)=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'';
const error=(message,code='INVALID_FULL_SCORE_JOB',status=422)=>Object.assign(new Error(message),{code,status,expose:true});
const issue=(code,message,details={})=>({code,message,...details});
const lengthOf=score=>score.timeSignature[0]*4/score.timeSignature[1];
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const globalNoteId=(regionId,noteId)=>`head-${digest(`${regionId}:${noteId}`).slice(0,48)}`;
function regionScore(raw,notes,source){
  if(notes.length)return validateScore({...raw,notes,source});
  const ts=raw.timeSignature,tempo=raw.tempo??90,key=raw.keySignature??0;
  if(!Array.isArray(ts)||ts.length!==2||!Number.isInteger(ts[0])||ts[0]<1||ts[0]>16||![1,2,4,8,16].includes(ts[1])||!finite(tempo)||tempo<20||tempo>300||!Number.isInteger(key)||Math.abs(key)>7||!finite(raw.durationBeats)||raw.durationBeats<=0||raw.durationBeats>20000)throw error('全休止谱行的拍号、速度或时值无效。','INVALID_REST_ONLY_ROW');
  return {...normalizeScoreTiming(raw,raw.durationBeats),version:1,id:text(raw.id,100)||'rest-only-row',title:text(raw.title,200)||'全休止谱行',composer:text(raw.composer,200)||'未知',tempo,timeSignature:[...ts],keySignature:key,source,notes:[],durationBeats:raw.durationBeats};
}

export function validateRegionResult(raw,region,metadata={}, {requirePositions=true}={}){
  if(!raw||raw.coverage?.complete!==true)throw error('识别未覆盖整条谱行；部分结果不能冒充完整结果。','INCOMPLETE_REGION');
  const supplied=raw.score||raw, inputNotes=supplied.notes;
  if(!Array.isArray(inputNotes))throw error('缺少谱行音符。','INVALID_REGION_SCORE');
  const originals=inputNotes.map((note,index)=>({...note,id:note.id??`n${index}`}));
  if(originals.some(note=>typeof note.id!=='string'||!note.id||note.id!==text(note.id,80)))throw error('音符id须为1–80个可见字符。','INVALID_NOTE_ID');
  if(new Set(originals.map(n=>n.id)).size!==originals.length)throw error('音符id重复。','DUPLICATE_NOTE_ID');
  const score=regionScore(supplied,originals,{kind:'full-score-unreviewed',label:`第${region.page}页第${region.system}行 · 待人工校对`});
  const omrReview=normalizeOmrReview(raw),errors=omrReviewIssues(omrReview),warnings=['算法与模型检查不能证明识谱无误；必须逐行对照原图确认。'];
  const count=raw.coverage.measureCount??Math.round(score.durationBeats/lengthOf(score));
  const suppliedDurations=raw.coverage.measureDurations;
  const measureTimeSignatures=raw.coverage.measureTimeSignatures;
  if(measureTimeSignatures!==undefined&&(!Array.isArray(measureTimeSignatures)||measureTimeSignatures.length!==count||measureTimeSignatures.some(ts=>!Array.isArray(ts)||ts.length!==2||!Number.isInteger(ts[0])||ts[0]<1||ts[0]>16||![1,2,4,8,16].includes(ts[1]))))throw error('逐小节拍号无效。','INVALID_MEASURE_METERS');
  const measureDurations=Array.isArray(suppliedDurations)?[...suppliedDurations]:Array.from({length:Number.isInteger(count)&&count>0&&count<=256?count:0},()=>lengthOf(score));
  if(!Number.isInteger(count)||count<1||count>256||measureDurations.length!==count||measureDurations.some(d=>!finite(d)||d<=0||d>256)||Math.abs(measureDurations.reduce((a,b)=>a+b,0)-score.durationBeats)>EPS)errors.push(issue('METER_LENGTH','谱行长度与明确的小节时值清单不一致；弱起须保留实际时长。'));
  for(const [index,duration]of measureDurations.entries())if(duration>lengthOf(score)+EPS)errors.push(issue('OVERFULL_MEASURE','小节时长超过拍号，请校对声部或拍号。',{measure:index+1}));else if(duration<lengthOf(score)-EPS)warnings.push(`第${index+1}小节按原谱保留${duration}拍弱起/不满小节，须对照确认。`);
  if(region.measureCount&&count!==region.measureCount)errors.push(issue('MEASURE_COVERAGE',`应覆盖${region.measureCount}小节，实际${count}小节。`));
  if(metadata.timeSignature&&score.timeSignature.some((n,i)=>n!==metadata.timeSignature[i]))errors.push(issue('METER_CHANGE','拍号与任务清单不一致；须明确校对，不能统一改写。'));
  if(metadata.keySignature!==undefined&&score.keySignature!==metadata.keySignature)errors.push(issue('KEY_CHANGE','调号与任务清单不一致；请对照原谱校对。'));
  const byId=new Map(originals.map(n=>[n.id,n]));
  score.notes=score.notes.map(note=>({...note,voice:text(byId.get(note.id).voice,50)||`${note.hand}-1`}));
  const positions=[],seen=new Set();
  for(const position of Array.isArray(raw.positions)?raw.positions:[]){
    const noteId=position.noteId??position.id;
    if(!byId.has(noteId)||seen.has(noteId)){errors.push(issue('HEAD_ID','音头位置id重复或不属于谱行。'));continue;}seen.add(noteId);
    let x=position.x,y=position.y;
    if(position.coordinateSpace==='normalized'){x=region.rect.x+x*region.rect.width;y=region.rect.y+y*region.rect.height;}
    if(!finite(x)||!finite(y)||x<region.rect.x-EPS||y<region.rect.y-EPS||x>region.rect.x+region.rect.width+EPS||y>region.rect.y+region.rect.height+EPS){errors.push(issue('HEAD_BOUNDS','音头位置不在原谱裁切范围内。',{noteId}));continue;}
    positions.push({noteId,x,y,coordinateSpace:'page'});
  }
  if(requirePositions&&positions.length!==score.notes.length)errors.push(issue('MISSING_HEADS','必须为每个音符提供唯一原图位置；新增音符需重新定位。',{expected:score.notes.length,actual:positions.length}));
  const rests=[];
  for(const rest of Array.isArray(raw.rests)?raw.rests:[]){
    if(!rest||!finite(rest.beat)||!finite(rest.duration)||rest.beat<0||rest.duration<=0||rest.beat+rest.duration>score.durationBeats+EPS||!['right','left'].includes(rest.hand)){errors.push(issue('INVALID_REST','休止范围或手别无效。'));continue;}
    rests.push({beat:rest.beat,duration:rest.duration,hand:rest.hand,voice:text(rest.voice,50)||`${rest.hand}-1`});
  }
  const rhythm=[];let measureStart=0;
  for(let measure=0;measure<measureDurations.length;measure++){const bar=measureDurations[measure],begin=measureStart,end=begin+bar;measureStart=end;for(const hand of ['right','left']){
    const events=[...score.notes.map(n=>({...n,kind:'note'})),...rests.map(r=>({...r,kind:'rest'}))].filter(e=>e.hand===hand&&e.beat<end-EPS&&e.beat+e.duration>begin+EPS);
    const intervals=events.map(e=>[Math.max(begin,e.beat),Math.min(end,e.beat+e.duration)]).sort((a,b)=>a[0]-b[0]);let cursor=begin,gaps=0;
    for(const [start,stop]of intervals){if(start>cursor+EPS)gaps+=start-cursor;cursor=Math.max(cursor,stop);}if(cursor<end-EPS)gaps+=end-cursor;
    if(gaps>EPS)errors.push(issue('RHYTHM_GAP',`第${measure+1}小节${hand==='right'?'右':'左'}手有${Number(gaps.toFixed(6))}拍未以音符或休止解释。`,{measure:measure+1,hand}));
    for(const voice of new Set(events.map(e=>e.voice))){const unique=new Map();for(const event of events.filter(e=>e.voice===voice))unique.set(`${event.beat}:${event.duration}:${event.kind}`,event);const ordered=[...unique.values()].sort((a,b)=>a.beat-b.beat);let previous;
      for(const event of ordered){if(previous&&event.beat<previous.beat+previous.duration-EPS)errors.push(issue('VOICE_OVERLAP','同声部时值相互重叠；和弦须同起点同长度，独立声部须分开。',{measure:measure+1,hand,voice}));if(!previous||event.beat+event.duration>previous.beat+previous.duration)previous=event;}
    }
    rhythm.push({measure:measure+1,hand,coveredBeats:bar-gaps,expectedBeats:bar,passed:gaps<=EPS});
  }}
  const continuity={tieIn:[],tieOut:[]};
  for(const key of ['tieIn','tieOut'])for(const item of Array.isArray(raw.continuity?.[key])?raw.continuity[key]:[]){const note=score.notes.find(n=>n.id===(item.noteId??item.id));if(!note||continuity[key].some(t=>t.noteId===note.id)){errors.push(issue('INVALID_TIE','跨行连音引用无效或重复。'));continue;}const required=key==='tieIn'?note.beat:score.durationBeats-note.beat-note.duration;if(Math.abs(required)>EPS)errors.push(issue('TIE_BOUNDARY','跨行连音必须连接本行开始/结束处的音符。'));continuity[key].push({noteId:note.id,midi:note.midi,hand:note.hand});}
  const internalTies=[],tieOut=new Set(),tieIn=new Set();
  if(raw.internalTies!==undefined&&!Array.isArray(raw.internalTies))errors.push(issue('INVALID_INTERNAL_TIE','行内延音须为明确的音头引用列表。'));
  for(const tie of Array.isArray(raw.internalTies)?raw.internalTies:[]){const from=score.notes.find(n=>n.id===tie?.fromNoteId),to=score.notes.find(n=>n.id===tie?.toNoteId);if(!from||!to||from.id===to.id||from.midi!==to.midi||from.hand!==to.hand||from.voice!==to.voice||Math.abs(from.beat+from.duration-to.beat)>EPS||tieOut.has(from.id)||tieIn.has(to.id)){errors.push(issue('INVALID_INTERNAL_TIE','行内延音必须连接同音高、同手别、同声部且时间相接的两个音头，不能重复或成环。'));continue;}tieOut.add(from.id);tieIn.add(to.id);internalTies.push({fromNoteId:from.id,toNoteId:to.id});}
  // Prior validation output is fed back by manual review; derive rhythm notices
  // from the edited durations and deduplicate before source notices are capped.
  const sourceWarnings=[...new Set((Array.isArray(raw.warnings)?raw.warnings:[]).filter(w=>typeof w==='string').map(w=>text(w,300)).filter(w=>w&&!/^第\d+小节(?:按原谱保留.*拍弱起\/不满小节|识别声部超过拍号时值)/u.test(w)))].slice(0,12);
  return {score,positions,rests,coverage:{complete:true,measureCount:count,measureDurations,...(measureTimeSignatures?{measureTimeSignatures}:{} )},continuity,internalTies,...omrReview,checks:{passed:errors.length===0,errors,rhythm},warnings:[...new Set([...warnings,...sourceWarnings])],reviewStatus:errors.length?'needs-correction':'unreviewed'};
}

export function continuityAudit(regions){
  const errors=[],pairs=[];
  for(let index=0;index<regions.length;index++){
    const region=regions[index],result=region.result;if(!result)continue;
    if(index===0&&result.continuity.tieIn.length)errors.push(issue('OPEN_TIE_START','整谱首行有未连接的前向连音。',{regionId:region.id}));
    if(index===regions.length-1&&result.continuity.tieOut.length)errors.push(issue('OPEN_TIE_END','整谱末行有未连接的后续连音。',{regionId:region.id}));
    const next=regions[index+1];if(!next?.result)continue;
    const incoming=[...next.result.continuity.tieIn];
    for(const outgoing of result.continuity.tieOut){const match=incoming.findIndex(t=>t.midi===outgoing.midi&&t.hand===outgoing.hand);if(match<0)errors.push(issue('TIE_DISCONTINUITY','相邻谱行连音的音高/手别不一致或缺少接续。',{regionId:region.id,nextRegionId:next.id}));else{const target=incoming.splice(match,1)[0];pairs.push({fromRegion:region.id,from:outgoing.noteId,toRegion:next.id,to:target.noteId});}}
    if(incoming.length)errors.push(issue('TIE_DISCONTINUITY','相邻谱行存在没有起点的连音。',{regionId:next.id}));
  }
  return {passed:!errors.length,errors,pairs};
}

export function assembleJob(job,{draft=false}={}){
  if(job.regions.some(r=>draft?!r.result:r.status!=='confirmed'))return null;
  if(job.needsUserScopeConfirmation&&!draft)return {checks:{passed:false,errors:[issue('SCOPE_CONFIRMATION_REQUIRED','自动检测不能证明完整谱行范围；请逐页核实后明确确认来源范围。')]},reviewStatus:'needs-scope-confirmation'};
  if(job.documentChecks?.complete===false&&!draft)return {checks:{passed:false,errors:job.documentChecks.errors},reviewStatus:'needs-correction'};
  const continuity=continuityAudit(job.regions);if(!continuity.passed&&!draft)return {checks:continuity,reviewStatus:'needs-correction'};
  const first=job.regions[0].result.score,metadata={...first,...job.metadata,id:`full-score-${job.id}`,source:{...job.metadata.source,kind:draft?'full-score-ai-draft':'full-score-human-reviewed',label:job.metadata.source.label+(draft?' · AI草稿待校对':' · 逐行人工确认')}};
  let measure=1,beat=0;const mergedNotes=[],coverage=[],measureMap=[];
  for(const region of job.regions){const result=region.result,count=result.coverage.measureCount;if(region.firstMeasure&&region.firstMeasure!==measure)throw error('原谱小节编号存在缺口或重叠。','MEASURE_CONTINUITY');const range={id:region.id,page:region.page,system:region.system,firstMeasure:measure,lastMeasure:measure+count-1,startBeat:beat,endBeat:beat+result.score.durationBeats,noteCount:result.score.notes.length};coverage.push(range);for(const note of result.score.notes)mergedNotes.push({...note,id:globalNoteId(region.id,note.id),beat:beat+note.beat});let local=0;for(const [barIndex,duration] of result.coverage.measureDurations.entries()){const timeSignature=[...(result.coverage.measureTimeSignatures?.[barIndex]||result.score.timeSignature)];measureMap.push({timeSignature,measure:measure++,page:region.page,system:region.system,beat:beat+local,duration,startBeat:beat+local,endBeat:beat+local+duration,implicit:duration<timeSignature[0]*4/timeSignature[1]-EPS});local+=duration;}beat=range.endBeat;}
  const timing=assembleScoreTiming(job.regions.map((r,i)=>({score:r.result.score,offset:coverage[i].startBeat})));
  const assembled={score:validateScore({...metadata,...timing,notes:mergedNotes.map(({fermata,...n})=>n),durationBeats:beat,measureMap}),coverage};
  const notes=new Map(assembled.score.notes.map(n=>[n.id,{...n}])),roots=new Map([...notes.keys()].map(id=>[id,id]));
  const tiePairs=continuity.pairs.map(pair=>({from:globalNoteId(pair.fromRegion,pair.from),to:globalNoteId(pair.toRegion,pair.to)}));
  for(const region of job.regions)for(const tie of region.result.internalTies||[])tiePairs.push({from:globalNoteId(region.id,tie.fromNoteId),to:globalNoteId(region.id,tie.toNoteId)});
  tiePairs.sort((a,b)=>notes.get(a.from).beat-notes.get(b.from).beat);
  for(const pair of tiePairs){const root=roots.get(pair.from),targetRoot=roots.get(pair.to),from=notes.get(root),to=notes.get(targetRoot);if(root===targetRoot||!from||!to||Math.abs(from.beat+from.duration-to.beat)>EPS){if(draft)continue;throw error('延音链的音头时间不相接。','TIE_TIME_DISCONTINUITY');}from.duration+=to.duration;notes.delete(targetRoot);for(const [id,value]of roots)if(value===targetRoot)roots.set(id,root);}
  assembled.score=validateScore({...assembled.score,notes:[...notes.values()]});
  const sourceNotation={version:1,coordinateSpace:'page',scoreId:assembled.score.id,measureMap,notePositionsComplete:job.regions.every(r=>r.result.positions.length===r.result.score.notes.length),systems:[],notes:[]};
  for(let index=0;index<job.regions.length;index++){
    const region=job.regions[index],range=assembled.coverage[index],startBeat=range.startBeat;
    sourceNotation.systems.push({id:region.id,page:region.page,system:region.system,rect:region.rect,firstMeasure:range.firstMeasure,lastMeasure:range.lastMeasure,startBeat,endBeat:range.endBeat,imageUrl:`full-score-region:${region.id}`});
    const positions=new Map(region.result.positions.map(p=>[p.noteId,p]));
    for(const note of region.result.score.notes){const position=positions.get(note.id);if(!position){if(region.result.positionlessSource===true)continue;throw error('原谱音头坐标缺失，不能生成逐音原图定位。','MISSING_HEAD_POSITIONS');}sourceNotation.notes.push({noteId:roots.get(globalNoteId(region.id,note.id)),beat:startBeat+note.beat,duration:note.duration,midi:note.midi,hand:note.hand,page:region.page,system:region.system,x:position.x,y:position.y});}
  }
  return {score:assembled.score,sourceNotation,measureMap,coverage:assembled.coverage,scope:{totalPages:job.totalPages,includedPages:[...new Set(job.regions.map(r=>r.page))],excludedPages:job.excludedPages,allIncludedRowsConfirmed:!draft,completeDocument:job.excludedPages.length===0},checks:continuity,reviewStatus:draft?'ai-unreviewed':'human-confirmed',warnings:[draft?'AI草稿仅完成首次识别，未完成人工逐音校对；节奏与延音疑点可对照原图修改，试听不代表识谱准确。':'已完成逐行人工确认及结构检查；这不是自动识谱绝对准确的保证。',...(!sourceNotation.notePositionsComplete?['原谱图片仅供对照；请使用重绘的数字乐谱跟随练习。']:[]),...(job.excludedPages.length?['来源中有明确排除页；覆盖范围见scope.excludedPages，不将排除内容计入识别结果。']:[])]};
}
