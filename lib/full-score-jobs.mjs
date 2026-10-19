import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,chmod,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {SCORE_RECOGNITION,recognitionEngine,recognitionPolicy} from './recognition-policy.mjs';
import {join,resolve} from 'node:path';
import {validateScore} from './score.mjs';
import {compareScoreEvents} from './score-assembly.mjs';
import {generateScoreRegion,normalizeGenerateInput} from './ai.mjs';
import {normalizeOmrReview,omrReviewIssues} from './omr-review.mjs';
import {createReviewedRegionCache,recognitionCacheKey,recognitionCacheScope} from './recognition-cache.mjs';
import {createRecognitionGate} from './recognition-gate.mjs';
import {generateDigitalRegion} from './digital-recognition.mjs';
import {assembleScoreTiming,normalizeScoreTiming} from './score-timing.mjs';

const EPS=1e-5, MAX_REGIONS=1000, MAX_PAGES=200;
const copy=value=>structuredClone(value);
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const text=(value,max=300)=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'';
const error=(message,code='INVALID_FULL_SCORE_JOB',status=422)=>Object.assign(new Error(message),{code,status,expose:true});
const safeError=e=>({code:typeof e?.code==='string'&&/^[A-Z_]+$/.test(e.code)?e.code:'RECOGNITION_FAILED',message:e?.expose||e?.public?text(e.message,500):e?.name==='AbortError'?'任务已取消。':'此谱行未完成识别，请查看谱面后使用当前任务模型重试。'});
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(value);
const lengthOf=score=>score.timeSignature[0]*4/score.timeSignature[1];
const issue=(code,message,details={})=>({code,message,...details});
const safeUsage=value=>value&&typeof value==='object'?Object.fromEntries(['input','output','totalTokens'].filter(k=>finite(value[k])&&value[k]>=0).map(k=>[k,value[k]])):null;
const globalNoteId=(regionId,noteId)=>`head-${digest(`${regionId}:${noteId}`).slice(0,48)}`;
function regionScore(raw,notes,source){
  if(notes.length)return validateScore({...raw,notes,source});
  const ts=raw.timeSignature,tempo=raw.tempo??90,key=raw.keySignature??0;
  if(!Array.isArray(ts)||ts.length!==2||!Number.isInteger(ts[0])||ts[0]<1||ts[0]>16||![1,2,4,8,16].includes(ts[1])||!finite(tempo)||tempo<20||tempo>300||!Number.isInteger(key)||Math.abs(key)>7||!finite(raw.durationBeats)||raw.durationBeats<=0||raw.durationBeats>20000)throw error('全休止谱行的拍号、速度或时值无效。','INVALID_REST_ONLY_ROW');
  return {...normalizeScoreTiming(raw,raw.durationBeats),version:1,id:text(raw.id,100)||'rest-only-row',title:text(raw.title,200)||'全休止谱行',composer:text(raw.composer,200)||'未知',tempo,timeSignature:[...ts],keySignature:key,source,notes:[],durationBeats:raw.durationBeats};
}

function normalizeManifest(raw){
  if(!raw||typeof raw!=='object')throw error('缺少完整谱页清单。');
  const totalPages=raw.totalPages??raw.pageCount;
  if(!Number.isInteger(totalPages)||totalPages<1||totalPages>MAX_PAGES)throw error(`谱页数必须为1–${MAX_PAGES}。`);
  if(!Array.isArray(raw.regions)||!raw.regions.length||raw.regions.length>MAX_REGIONS)throw error(`请选择1–${MAX_REGIONS}个谱行。`);
  if((raw.excludeRegions?.length||raw.excludedRegions?.length))throw error('整谱任务不能跳过音乐谱行；请保留全部行，或明确创建片段任务。','EXCLUDED_MUSIC_REGION');
  const excludedPages=(raw.excludedPages||[]).map(value=>typeof value==='number'?{page:value,reason:''}:{page:value.page,reason:text(value.reason,300)});
  const excluded=new Set();
  for(const page of excludedPages){if(!Number.isInteger(page.page)||page.page<1||page.page>totalPages||excluded.has(page.page)||!page.reason)throw error('排除谱页必须提供有效页码、原因且不得重复。');excluded.add(page.page);}
  const ids=new Set(),locations=new Set();
  const regions=raw.regions.map((region,index)=>{
    const id=region.id??`region-${index+1}`,rect=region.rect;
    if(!validId(id)||ids.has(id))throw error('谱行id须唯一，只能含字母、数字、短横线和下划线。');ids.add(id);
    if(!Number.isInteger(region.page)||region.page<1||region.page>totalPages||excluded.has(region.page))throw error('谱行页码无效或与排除页冲突。');
    if(!Number.isInteger(region.system)||region.system<1||region.system>500)throw error('谱行序号无效。');
    const location=`${region.page}:${region.system}`;if(locations.has(location))throw error('同一页谱行重复。');locations.add(location);
    if(!rect||!['x','y','width','height'].every(k=>finite(rect[k]))||rect.x<0||rect.y<0||rect.width<=0||rect.height<=0||rect.width>50000||rect.height>50000)throw error('谱行原图裁切坐标无效。');
    let measureCount=region.measureCount??region.expectedMeasureCount;
    if(region.measureCount!==undefined&&region.expectedMeasureCount!==undefined&&region.measureCount!==region.expectedMeasureCount)throw error('两个期望小节数约束不一致。');
    if(region.firstMeasure!==undefined||region.lastMeasure!==undefined){if(!Number.isInteger(region.firstMeasure)||region.firstMeasure<1||!Number.isInteger(region.lastMeasure)||region.lastMeasure<region.firstMeasure)throw error('小节范围无效。');const count=region.lastMeasure-region.firstMeasure+1;if(measureCount!==undefined&&measureCount!==count)throw error('小节数与范围不一致。');measureCount=count;}
    if(measureCount!==undefined&&(!Number.isInteger(measureCount)||measureCount<1||measureCount>256))throw error('每行小节数必须为1–256。');
    if((region.pageWidth!==undefined||region.pageHeight!==undefined)&&(!finite(region.pageWidth)||!finite(region.pageHeight)||region.pageWidth<=0||region.pageHeight<=0||rect.x+rect.width>region.pageWidth+EPS||rect.y+rect.height>region.pageHeight+EPS))throw error('谱行超出原始页面尺寸。');
    return {id,page:region.page,system:region.system,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},...(region.pageWidth?{pageWidth:region.pageWidth,pageHeight:region.pageHeight}:{}),context:text(typeof region.context==='string'?region.context:JSON.stringify(region.context||{}),4000),...(measureCount?{measureCount}:{}),...(region.firstMeasure?{firstMeasure:region.firstMeasure,lastMeasure:region.lastMeasure}:{}),status:'pending-image',attempts:0,image:null,result:null,error:null,confirmedAt:null};
  }).sort((a,b)=>a.page-b.page||a.system-b.system);
  for(let page=1;page<=totalPages;page++)if(!excluded.has(page)&&!regions.some(region=>region.page===page))throw error(`第${page}页未提供谱行，也未明确排除；不能开始整谱识别。`,'MISSING_PAGE_COVERAGE');
  for(const page of new Set(regions.map(r=>r.page))){const indices=regions.filter(r=>r.page===page).map(r=>r.system);if(indices.some((n,i)=>n!==i+1))throw error(`第${page}页的谱行序号有缺口，须包含全部谱行。`,'MISSING_SYSTEM_COVERAGE');}
  const sourceRaw=raw.source||{},source={kind:'full-score-transcription',label:text(sourceRaw.label||'用户上传的完整原谱',200)};
  if(/^https?:\/\//i.test(sourceRaw.url||''))source.url=text(sourceRaw.url,2000);if(sourceRaw.license)source.license=text(sourceRaw.license,300);
  const metadata={title:text(raw.title,200)||'完整钢琴谱',composer:text(raw.composer,200)||'未知',source};
  if(raw.timeSignature!==undefined){if(!Array.isArray(raw.timeSignature)||raw.timeSignature.length!==2||!Number.isInteger(raw.timeSignature[0])||raw.timeSignature[0]<1||raw.timeSignature[0]>16||![1,2,4,8,16].includes(raw.timeSignature[1]))throw error('拍号无效。');metadata.timeSignature=[...raw.timeSignature];}
  if(raw.tempo!==undefined){if(!finite(raw.tempo)||raw.tempo<20||raw.tempo>300)throw error('速度无效。');metadata.tempo=raw.tempo;}
  if(raw.keySignature!==undefined){if(!Number.isInteger(raw.keySignature)||Math.abs(raw.keySignature)>7)throw error('调号无效。');metadata.keySignature=raw.keySignature;}
  const engine=recognitionEngine(raw.engine||raw.engineChoice);
  if(raw.omrProfile!==undefined&&!['basic','piano-v3','piano-triplets-v3'].includes(raw.omrProfile))throw error('本机识谱配置无效。');
  return {metadata,totalPages,excludedPages,regions,omrProfile:raw.omrProfile||'basic',needsUserScopeConfirmation:raw.needsUserScopeConfirmation===true&&raw.scopeConfirmed!==true,scopeConfirmed:raw.scopeConfirmed===true,engine,verify:false};
}

/** Check score structure, every hand's written time, and exact source-head coverage.
 * Geometry and duration validation cannot prove that a pitch was read correctly.
 */
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

function continuityAudit(regions){
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

function assembleJob(job,{draft=false}={}){
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

/** Persistent, token-protected orchestration. Adapters receive secrets only at call time.
 * create/upload never call a model. start defaults to all rows with concurrency <= 100.
 */
export function createFullScoreJobStore({directory=resolve('.local/full-score-jobs'),recognizeRegion,digitalFallback,digitalRecognizeRegion,settingsProvider=async()=>({}),maxConcurrency=100,timeoutMs=SCORE_RECOGNITION.timeoutMs}={}){
  const jobs=new Map(),locks=new Map(),runtime=new Map();let closed=false;const concurrency=Math.max(1,Math.min(100,Math.floor(maxConcurrency)||100));
  const gate=createRecognitionGate(concurrency),cache=createReviewedRegionCache(join(directory,'reviewed-cache')),seeded=new Set();
  const recognize=recognizeRegion||((request,options)=>settingsProvider().then(settings=>generateScoreRegion(request,settings,options)));
  const fallbackEnabled=digitalFallback??!recognizeRegion;
  const digitalRead=digitalRecognizeRegion||((request,options)=>generateDigitalRegion(request,options));
  const path=id=>join(directory,id);const statePath=id=>join(path(id),'job.json');
  async function save(job){await mkdir(path(job.id),{recursive:true,mode:0o700});await chmod(path(job.id),0o700);const temp=join(path(job.id),`state-${randomBytes(6).toString('hex')}.tmp`);await writeFile(temp,JSON.stringify(job),{mode:0o600});await rename(temp,statePath(job.id));}
  async function load(id){if(!validId(id))throw error('任务不存在。','JOB_NOT_FOUND',404);if(jobs.has(id))return jobs.get(id);let job;try{job=JSON.parse(await readFile(statePath(id),'utf8'));}catch{throw error('任务不存在。','JOB_NOT_FOUND',404);}if(job.status==='running'){job.status='paused';job.lastError={code:'PROCESS_RESTARTED',message:'后台已重启；已保留完成结果，请继续未完成谱行。'};for(const region of job.regions)if(region.status==='running')region.status='queued';await save(job);}jobs.set(id,job);return job;}
  function authorize(job,auth={}){const a=typeof auth.token==='string'?digest(auth.token):'',b=typeof auth.sessionId==='string'&&auth.sessionId?digest(auth.sessionId):'';const equal=(one,two)=>one&&two&&one.length===two.length&&timingSafeEqual(Buffer.from(one),Buffer.from(two));if(!equal(a,job.tokenHash)&&!equal(b,job.ownerHash))throw error('任务不存在或访问凭证已失效。','JOB_NOT_FOUND',404);}
  async function locked(id,auth,fn){const prior=locks.get(id)||Promise.resolve();const task=prior.catch(()=>{}).then(async()=>{const job=await load(id);authorize(job,auth);return fn(job);});locks.set(id,task.catch(()=>{}));return task;}
  const snapshot=job=>{const progress={total:job.regions.length,pending:0,running:0,needsReview:0,confirmed:0,failed:0};for(const region of job.regions){if(['pending-image','queued'].includes(region.status))progress.pending++;else if(region.status==='running')progress.running++;else if(region.status==='needs-review')progress.needsReview++;else if(region.status==='confirmed')progress.confirmed++;else if(region.status==='failed')progress.failed++;}return copy({id:job.id,status:job.status,runVersion:job.runVersion,engine:job.engine==='deepseek'?'deepseek':'pi',recognition:{...(job.recognition||recognitionPolicy(job.engine))},previousEngine:job.previousEngine,omrProfile:job.omrProfile||'basic',title:job.metadata.title,metadata:job.metadata,totalPages:job.totalPages,excludedPages:job.excludedPages,needsUserScopeConfirmation:job.needsUserScopeConfirmation,scopeConfirmed:job.scopeConfirmed,regions:job.regions,progress,documentProgress:job.documentProgress,documentChecks:job.documentChecks,estimate:{regions:job.regions.length,modelCalls:job.regions.length,piCalls:job.engine==='deepseek'?0:job.regions.length,deepseekCalls:job.engine==='deepseek'?job.regions.length:0,documentCalls:0,concurrency},calls:job.calls,reuse:job.reuse||{hits:0,savedCalls:0},originalPdf:job.originalPdf,createdAt:job.createdAt,updatedAt:job.updatedAt,lastError:job.lastError,continuity:continuityAudit(job.regions),result:job.result});};
  async function mutate(job){job.updatedAt=new Date().toISOString();await save(job);}
  async function storeImage(job,region,image){const normalized=normalizeGenerateInput({provider:'pi',mode:'ocr',title:job.metadata.title,images:[image]});const value=normalized.images[0],buffer=Buffer.from(value.data,'base64');await writeFile(join(path(job.id),`${region.id}.image`),buffer,{mode:0o600});region.image={mimeType:value.mimeType,bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')};region.status='queued';}
  async function storePdf(job,pdf){const buffer=Buffer.isBuffer(pdf?.buffer)?pdf.buffer:typeof pdf?.data==='string'?Buffer.from(pdf.data,'base64'):null;if(!buffer||!buffer.length||buffer.length>50*1024*1024||!buffer.subarray(0,5).equals(Buffer.from('%PDF-'))||pdf.mimeType!=='application/pdf')throw error('请提供小于50MB的有效PDF。','INVALID_PDF');await writeFile(join(path(job.id),'original.pdf'),buffer,{mode:0o600});job.originalPdf={name:text(pdf.name,180)||'原谱.pdf',mimeType:'application/pdf',bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')};}
  function derivedStatus(job){if(job.status==='cancelled')return;job.result=null;if(job.regions.every(r=>r.status==='confirmed')){try{job.result=assembleJob(job);job.status=job.result?.reviewStatus==='human-confirmed'?'complete':'needs-review';}catch(e){job.status='needs-review';job.lastError=safeError(e);}}else if(job.regions.some(r=>r.status==='needs-review'||r.status==='confirmed'))job.status='needs-review';else if(job.regions.some(r=>r.status==='failed'))job.status='failed';else job.status='paused';}
  async function invoke(adapter,request,controller,options={}){
    // Logical cancellation returns promptly, but a network request keeps its
    // physical slot until the adapter really exits. A slow abort must not let
    // the next row exceed the global concurrency cap.
    return new Promise((resolveResult,rejectResult)=>{
      gate(async()=>{
        controller.signal.throwIfAborted();await options.onDispatch?.();
        const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(options.timeout??timeoutMs)]);
        const abort=()=>rejectResult(signal.reason);signal.addEventListener('abort',abort,{once:true});
        try{signal.throwIfAborted();const result=await adapter(request,{signal,onProgress:options.onProgress});signal.throwIfAborted();resolveResult(result);}
        catch(e){rejectResult(e);}finally{signal.removeEventListener('abort',abort);}
      },controller.signal).catch(rejectResult);
    });
  }
  async function rememberConfirmed(job,auth){
    const scope=recognitionCacheScope(auth);
    for(const region of job.regions){
      if(region.status!=='confirmed'||region.result?.model!==recognitionPolicy(job.engine).model||region.result.reasoningEffort!==recognitionPolicy(job.engine).reasoningEffort||region.result.promptVersion!==recognitionPolicy(job.engine).promptVersion||!region.result.checks?.passed)continue;
      const key=recognitionCacheKey(job.metadata,region,job.recognition||recognitionPolicy(job.engine)),seed=scope+key+region.confirmedAt;
      if(seeded.has(seed))continue;
      await cache.put(scope,key,{sourceJobId:job.id,confirmedAt:region.confirmedAt,result:region.result});seeded.add(seed);
    }
  }
  async function recordDispatch(id,regionId,run,pass){return locked(id,run.auth,async job=>{if(job.runVersion!==run.version||job.status!=='running')throw error('任务已停止。','STALE_JOB_INTENT');if(pass==='verify')job.calls.verification++;else{job.calls.recognition++;job.regions.find(r=>r.id===regionId).attempts++;}await mutate(job);});}
  async function readWithFallback(adapter,request,run,pass){
    const options={onDispatch:()=>recordDispatch(request.jobId,request.region.id,run,pass)};
    try{return await invoke(adapter,request,run.controller,options);}
    catch(e){
      if(!fallbackEnabled||request.engine!=='pi'||!['NO_REGION_RESULT','INVALID_COMPACT_REGION'].includes(e.code)||run.controller.signal.aborted)throw e;
      return invoke(digitalRead,request,run.controller,options);
    }
  }
  async function processRegion(id,regionId,run){let request,version,checkpoint;
    try{
      await locked(id,run.auth,async job=>{
        if(job.status!=='running'||job.runVersion!==run.version)return;
        const region=job.regions.find(r=>r.id===regionId);if(region.status!=='queued')return;
        version=job.runVersion;const key=recognitionCacheKey(job.metadata,region,job.recognition||recognitionPolicy(job.engine));
        if(!run.forceFresh&&!region.recognitionCheckpoint){
          const hit=await cache.get(recognitionCacheScope(run.auth),key);
          if(hit){try{
            const valid=validateRegionResult(hit.result,region,job.metadata);
            if(valid.checks.passed&&hit.result.model===recognitionPolicy(job.engine).model&&hit.result.reasoningEffort===recognitionPolicy(job.engine).reasoningEffort&&hit.result.promptVersion===recognitionPolicy(job.engine).promptVersion){
              region.result={...hit.result,...valid,reviewStatus:'unreviewed',cacheReuse:{sourceJobId:hit.sourceJobId,confirmedAt:hit.confirmedAt}};
              region.status='needs-review';region.error=null;job.reuse||={hits:0,savedCalls:0};job.reuse.hits++;job.reuse.savedCalls++;await mutate(job);return;
            }
          }catch{/* Invalid cached entries never bypass live recognition or checks. */}}
        }
        checkpoint=region.recognitionCheckpoint?.key===key&&!run.forceFresh?copy(region.recognitionCheckpoint.result):null;
        region.status='running';region.error=null;
        const {result:previousResult,recognitionCheckpoint:priorCheckpoint,...sourceRegion}=copy(region);
        request={jobId:id,engine:job.engine,metadata:copy(job.metadata),region:{...sourceRegion,image:{...region.image,data:(await readFile(join(path(id),`${region.id}.image`))).toString('base64')}},pass:'recognize'};
        await mutate(job);
      });
      if(!request)return;
      let result=checkpoint;
      if(!result){
        const raw=await readWithFallback(recognize,request,run,'recognize');
        const positionlessSource=raw.positionlessReview===true&&raw.wireFormat==='compact-json-v2';
        result={...validateRegionResult(raw,request.region,request.metadata,{requirePositions:!positionlessSource}),positionlessSource,engine:text(raw.engine||raw.provider||'pi',50),model:raw.model||null,reasoningEffort:raw.reasoningEffort||null,promptVersion:raw.promptVersion||null,requestAudit:raw.requestAudit||[],wireFormat:raw.wireFormat||'verbose-v1',usage:safeUsage(raw.usage)};
        await locked(id,run.auth,async job=>{if(job.runVersion!==version||job.status==='cancelled')return;const region=job.regions.find(r=>r.id===regionId);region.recognitionCheckpoint={key:recognitionCacheKey(job.metadata,region,job.recognition||recognitionPolicy(job.engine)),result:copy(result)};await mutate(job);});
      }
      result={...result,verification:null};
      await locked(id,run.auth,async job=>{if(job.runVersion!==version||job.status==='cancelled')return;const region=job.regions.find(r=>r.id===regionId);region.result=result;region.status='needs-review';await mutate(job);});
    }catch(e){if(['MODEL_RATE_LIMIT','MODEL_BALANCE_REQUIRED','DEEPSEEK_AUTH_REQUIRED'].includes(e.code))run.pausedForRateLimit=true;await locked(id,run.auth,async job=>{if(job.runVersion!==version||job.status==='cancelled')return;const region=job.regions.find(r=>r.id===regionId);region.status='failed';region.error=safeError(e);await mutate(job);});}
  }
  async function execute(id,run,ids){try{let cursor=0;await Promise.all(Array.from({length:Math.min(concurrency,ids.length)},async()=>{while(cursor<ids.length&&!run.controller.signal.aborted&&!run.pausedForRateLimit){const index=cursor++;await processRegion(id,ids[index],run);}}));}finally{await locked(id,run.auth,async job=>{if(job.runVersion===run.version&&job.status!=='cancelled'){derivedStatus(job);await mutate(job);}});if(runtime.get(id)===run)runtime.delete(id);}}
  async function applyRecognitionPolicy(job){
    if(!['pi','deepseek'].includes(job.engine)){
      try{await copyFile(statePath(job.id),join(path(job.id),'before-gpt-only.json'),constants.COPYFILE_EXCL);await chmod(join(path(job.id),'before-gpt-only.json'),0o600);}catch(e){if(e.code!=='EEXIST')throw e;}
      job.previousEngine=job.engine;job.engine='pi';
    }
    if(job.documentChecks?.errors?.length&&job.documentChecks.errors.every(e=>e.code==='DOCUMENT_FAILED'))job.documentChecks=null;
    job.verify=false;
    job.recognition={...recognitionPolicy(job.engine)};
  }

  const api={
    async createJob(raw,auth={}){if(closed)throw error('任务存储已关闭。','STORE_CLOSED',503);const manifest=normalizeManifest(raw),id=randomBytes(18).toString('hex'),token=randomBytes(32).toString('base64url'),date=new Date().toISOString();await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);const job={version:1,id,...manifest,status:'draft',tokenHash:digest(token),ownerHash:auth.sessionId?digest(auth.sessionId):null,createdAt:date,updatedAt:date,runVersion:0,calls:{recognition:0,verification:0,document:0},originalPdf:null,result:null,lastError:null};await save(job);jobs.set(id,job);try{for(const region of job.regions){const original=raw.regions.find(r=>r.id===region.id)||raw.regions.find((r,i)=>!r.id&&region.id===`region-${i+1}`);if(original?.image)await storeImage(job,region,original.image);}if(raw.originalPdf)await storePdf(job,raw.originalPdf);await mutate(job);}catch(e){job.status='failed';job.lastError=safeError(e);await mutate(job);throw e;}return {id,token,snapshot:snapshot(job)};},
    async getJob(id,auth={}){return locked(id,auth,async job=>{await rememberConfirmed(job,auth);return snapshot(job);});},
    async uploadRegion(id,regionId,{image},auth={}){return locked(id,auth,async job=>{if(job.status==='running')throw error('识别期间不能替换原图。','JOB_RUNNING',409);const region=job.regions.find(r=>r.id===regionId);if(!region)throw error('谱行不存在。','REGION_NOT_FOUND',404);await storeImage(job,region,image);region.result=null;region.recognitionCheckpoint=null;region.confirmedAt=null;job.result=null;job.status='draft';await mutate(job);return snapshot(job);});},
    async uploadDocument(id,pdf,auth={}){return locked(id,auth,async job=>{if(job.status==='running')throw error('识别期间不能替换PDF。','JOB_RUNNING',409);await storePdf(job,pdf);for(const region of job.regions){region.result=null;region.recognitionCheckpoint=null;region.confirmedAt=null;region.status=region.image?'queued':'pending-image';}job.result=null;job.status='draft';await mutate(job);return snapshot(job);});},
    async readRegionImage(id,regionId,auth={}){return locked(id,auth,async job=>{const region=job.regions.find(r=>r.id===regionId);if(!region?.image)throw error('谱行原图尚未上传。','IMAGE_REQUIRED',404);return {buffer:await readFile(join(path(id),`${region.id}.image`)),mimeType:region.image.mimeType};});},
    async readDocument(id,auth={}){return locked(id,auth,async job=>{if(!job.originalPdf)throw error('原PDF尚未上传。','PDF_REQUIRED',404);return {buffer:await readFile(join(path(id),'original.pdf')),mimeType:'application/pdf',name:job.originalPdf.name};});},
    async startJob(id,options={}){if(closed)throw error('任务存储已关闭。','STORE_CLOSED',503);return locked(id,options,async job=>{if(options.expectedVersion!==undefined&&options.expectedVersion!==job.runVersion)throw error('此启动请求已被较新的停止或启动操作取代，请刷新任务状态。','STALE_JOB_INTENT',409);if(job.status==='running')return snapshot(job);if(options.engine!==undefined&&recognitionEngine(options.engine)!==recognitionEngine(job.engine==='deepseek'?'deepseek':'pi'))throw error('任务识谱服务商已固定，请新建任务切换。','RECOGNITION_ENGINE_LOCKED');await applyRecognitionPolicy(job);
      const queued=job.regions.filter(r=>!r.result&&r.status!=='confirmed'&&(!options.regionIds||options.regionIds.includes(r.id)));if(!queued.length){derivedStatus(job);await mutate(job);return snapshot(job);}
      if(queued.some(r=>!r.image))throw error('所有待识别谱行都必须先上传图片。','IMAGE_REQUIRED');
      const selected=options.autoContinue===false?queued.slice(0,Math.max(1,Math.min(1000,Math.floor(options.batchSize)||2))):queued;
      for(const region of selected){region.status='queued';region.lastEngine=job.engine;if(options.forceFresh)region.recognitionCheckpoint=null;}job.status='running';job.lastError=null;job.runVersion++;job.result=null;const run={auth:{token:options.token,sessionId:options.sessionId},version:job.runVersion,controller:new AbortController(),forceFresh:options.forceFresh===true};runtime.set(id,run);await mutate(job);run.promise=Promise.resolve().then(()=>execute(id,run,selected.map(r=>r.id)));run.promise.catch(()=>{});return snapshot(job);});},
    async cancelJob(id,auth={}){return locked(id,auth,async job=>{runtime.get(id)?.controller.abort();job.runVersion++;job.status='cancelled';job.result=null;for(const region of job.regions)if(region.status==='running'||region.status==='queued')region.status=region.result?'needs-review':'queued';await mutate(job);return snapshot(job);});},
    async retryRegion(id,regionId,auth={},options={}){return api.retryRegions(id,auth,{...options,regionIds:[regionId]});},
    async retryRegions(id,auth={},options={}){
      if(options.phase==='verify')throw error('AI复核阶段已移除；可重新读取此行原图。','VERIFICATION_REMOVED',410);
      let engine,expectedVersion,regionIds;
      await locked(id,auth,async job=>{
        if(options.expectedVersion!==undefined&&options.expectedVersion!==job.runVersion)throw error('此重试请求已被较新的停止或启动操作取代。','STALE_JOB_INTENT',409);
        if(job.status==='running')throw error('请先等待本批完成或取消任务。','JOB_RUNNING',409);
        if(options.regionIds!==undefined&&(!Array.isArray(options.regionIds)||!options.regionIds.length))throw error('请选择要重新识别的谱行。','INVALID_REGIONS');
        const selected=options.regionIds?[...new Set(options.regionIds)].map(id=>{const r=job.regions.find(r=>r.id===id);if(!r)throw error('谱行不存在。','REGION_NOT_FOUND',404);return r;}):job.regions.filter(r=>r.status==='failed'||r.result?.checks?.passed===false);
        if(!selected.length)throw error('没有需要重试的失败谱行。','NO_FAILED_REGIONS');
        if(selected.some(r=>r.status==='confirmed'))throw error('已确认谱行须通过人工编辑修改，不能直接重跑覆盖。','REGION_CONFIRMED',409);
        if(selected.some(r=>!r.image))throw error('请先上传待重试谱行的图片。','IMAGE_REQUIRED');
        engine=recognitionEngine(options.engine??(job.engine==='deepseek'?'deepseek':'pi'));
        // Resolve options before changing persisted results. Other rows keep their
        // original provider/model provenance when this retry changes provider.
        await applyRecognitionPolicy(job);
        if(job.engine!==engine){job.previousEngine=job.engine;job.engine=engine;job.recognition={...recognitionPolicy(engine)};}
        expectedVersion=job.runVersion;regionIds=selected.map(r=>r.id);
        for(const region of selected){region.recognitionCheckpoint=null;region.result=null;region.error=null;region.confirmedAt=null;region.status='queued';}
        job.status='paused';job.result=null;await mutate(job);
      });
      return api.startJob(id,{...auth,engine,expectedVersion,regionIds,autoContinue:true,forceFresh:true});
    },
    async confirmRegion(id,regionId,editedResult,auth={}){return locked(id,auth,async job=>{if(job.status==='running')throw error('请待识别完成再校对。','JOB_RUNNING',409);const region=job.regions.find(r=>r.id===regionId);if(!region)throw error('谱行不存在。','REGION_NOT_FOUND',404);const supplied=editedResult?{...editedResult,...(region.result?.sourceHeadAudit?{sourceHeadAudit:{...region.result.sourceHeadAudit,reviewed:editedResult.sourceHeadAudit?.reviewed===true}}:{}),...(region.result?.tieAudit?{tieAudit:{...region.result.tieAudit,reviewed:editedResult.tieAudit?.reviewed===true}}:{})}:region.result;const result=validateRegionResult(supplied,region,job.metadata,{requirePositions:region.result?.positionlessSource!==true});if(!result.checks.passed)throw error('结构检查未通过：'+result.checks.errors.map(e=>e.message).slice(0,3).join('；'),'REGION_CHECK_FAILED');const prior=region.result;region.result={...result,positionlessSource:prior?.positionlessSource===true,verification:prior?.verification||null,usage:prior?.usage||null,model:prior?.model||null,reasoningEffort:prior?.reasoningEffort||null,promptVersion:prior?.promptVersion||null,requestAudit:prior?.requestAudit||[],wireFormat:prior?.wireFormat||'verbose-v1',cacheReuse:prior?.cacheReuse||null,reviewedChanges:prior?.score?compareScoreEvents(prior.score,result.score):null,reviewStatus:'confirmed',engine:prior?.engine||'manual'};region.status='confirmed';region.confirmedAt=new Date().toISOString();job.status='needs-review';derivedStatus(job);await mutate(job);await rememberConfirmed(job,auth);return snapshot(job);});},
    async exportDraft(id,auth={},options={}){return locked(id,auth,async job=>{if(job.status==='running')throw error('识别仍在进行。','JOB_RUNNING',409);if(options.scopeConfirmed!==true)throw error('请确认全部页和谱行范围。','SCOPE_CONFIRMATION_REQUIRED');if(job.regions.some(r=>!r.result||r.result.coverage?.complete!==true))throw error('仍有未完整识别的谱行；不能导入整谱草稿。','INCOMPLETE_JOB');const result=assembleJob(job,{draft:true});return {...snapshot(job),result};});},
    async confirmJob(id,auth={},options={}){return locked(id,auth,async job=>{if(job.regions.some(r=>r.status!=='confirmed'))throw error('仍有未识别或未人工确认的谱行；不能作为整谱导入。','INCOMPLETE_JOB');if(options.scopeConfirmed===true){job.needsUserScopeConfirmation=false;job.scopeConfirmed=true;}derivedStatus(job);await mutate(job);if(job.needsUserScopeConfirmation)throw error('请先逐页确认全部谱行范围。','SCOPE_CONFIRMATION_REQUIRED');if(job.status!=='complete')throw error('跨谱行连续性或原文覆盖检查未通过。','CONTINUITY_FAILED');return snapshot(job);});},
    async waitForIdle(id,auth={}){await api.getJob(id,auth);await runtime.get(id)?.promise;return api.getJob(id,auth);},
    async close(){closed=true;await Promise.allSettled([...runtime].map(([id,run])=>{run.controller.abort();return locked(id,run.auth,async job=>{job.runVersion++;job.status='paused';job.lastError={code:'SERVICE_STOPPED',message:'服务已关闭；识别结果已保留，可继续未完成谱行。'};for(const region of job.regions)if(region.status==='running')region.status='queued';await mutate(job);});}));},
  };
  return api;
}
