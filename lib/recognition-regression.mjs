import {matchBenchmarkHeads,BENCHMARK_TOLERANCE as EPS} from './dense-pdf-benchmark.mjs';
import {aggregateRecognitionUsage} from './recognition-accounting.mjs';
const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=EPS;
const rate=(a,b)=>b?a/b:null;
const counts=(reference,predicted,correct)=>({reference,predicted,correct,recall:rate(correct,reference),precision:rate(correct,predicted),unmatchedReference:reference-correct,unmatchedPrediction:predicted-correct});
const strict=(a,b)=>a.midi===b.midi&&a.hand===b.hand&&close(a.beat,b.beat)&&close(a.duration,b.duration);
const written=(a,b)=>a&&b&&a.step===b.step&&a.alter===b.alter&&a.octave===b.octave;
const summary=metric=>counts(metric.reference,metric.predicted,metric.correct);
function checkedNotes(notes,{graces=false}={}){
  if(!Array.isArray(notes))throw Error('参考与预测必须提供事件数组');
  for(const n of notes)if(!n||!Number.isInteger(n.midi)||n.midi<0||n.midi>127||!['right','left'].includes(n.hand)||!Number.isFinite(n.beat)||n.beat<0||!Number.isFinite(n.duration)||n.duration<0||!graces&&n.duration===0)throw Error('评分事件含无效音高、手别或时间，不能静默丢弃');
  return notes;
}
export function scoreRecognitionCase(reference,prediction){
  if(!Array.isArray(reference.notes))throw Error('缺少明确的独立参考事件数组，不能当作零个音符评分');
  const notes=checkedNotes((reference.notes||[]).filter(n=>!n.grace)),actual=checkedNotes((prediction.notes||[]).filter(n=>!n.grace));
  const sameMeasure=(a,b)=>!reference.compareMeasure||a.measure===b.measure,equal=(a,b)=>strict(a,b)&&sameMeasure(a,b);
  const scored=matchBenchmarkHeads(notes,actual,equal),pitch=matchBenchmarkHeads(notes,actual,(a,b)=>a.midi===b.midi&&a.hand===b.hand&&sameMeasure(a,b));
  const spellingReference=notes.filter(n=>n.written),spellingActual=actual.filter(n=>n.written),spelling=matchBenchmarkHeads(spellingReference,spellingActual,(a,b)=>equal(a,b)&&written(a.written,b.written));
  const printedReference=notes.filter(n=>n.printed!==undefined),printedActual=actual.filter(n=>n.printed!==undefined),printed=matchBenchmarkHeads(printedReference,printedActual,(a,b)=>equal(a,b)&&a.printed===b.printed);
  let rests=null;if(reference.rests!==undefined){
    if(!Array.isArray(reference.rests)||!Array.isArray(prediction.rests||[]))throw Error('休止参考必须为明确数组');
    rests=summary(matchBenchmarkHeads(reference.rests,prediction.rests||[],(a,b)=>a.hand===b.hand&&close(a.beat,b.beat)&&close(a.duration,b.duration)));
  }
  const graceReference=checkedNotes((reference.notes||[]).filter(n=>n.grace),{graces:true}),graceActual=checkedNotes((prediction.notes||[]).filter(n=>n.grace),{graces:true});
  const bars=reference.measures?.map(m=>m.duration),actualBars=prediction.measureDurations;
  const barsExact=bars?Array.isArray(actualBars)&&bars.length===actualBars.length&&bars.every((b,i)=>close(b,actualBars[i])):null;
  const exactEvents=scored.correct===notes.length&&scored.extra.length===0;
  const spellingMeasured=spellingReference.length===notes.length&&spellingActual.length===actual.length&&spellingActual.length>0;
  const printedMeasured=printedReference.length===notes.length&&printedActual.length===actual.length&&printedActual.length>0;
  return {strict:summary(scored),pitchAndHand:summary(pitch),
    writtenSpelling:{...summary(spelling),measured:spellingMeasured,predictionEvidence:spellingActual.length,availableReference:spellingReference.length,recall:spellingMeasured?spelling.recall:null,precision:spellingMeasured?spelling.precision:null,accuracy:spellingMeasured?spelling.recall:null},
    printedAccidentals:{...summary(printed),measured:printedMeasured,recall:printedMeasured?printed.recall:null,precision:printedMeasured?printed.precision:null,accuracy:printedMeasured?printed.recall:null},
    rests,graces:summary(matchBenchmarkHeads(graceReference,graceActual,(a,b)=>a.hand===b.hand&&a.midi===b.midi&&close(a.beat,b.beat))),barsExact,
    exactScope:prediction.status==='returned'&&exactEvents&&barsExact!==false,
    falseCompletion:prediction.checksPassed===true&&(!exactEvents||barsExact===false)};
}

// All rows declared before scoring stay in scope, including missing/refused rows.
// Different source tiers, event units, alignment rules and trials stay separate.
export function evaluateRecognitionRun(cases,predictions,{caseIds=cases.map(c=>c.id),trial='unspecified'}={}){
  if(new Set(cases.map(c=>c.id)).size!==cases.length||new Set(caseIds).size!==caseIds.length)throw Error('评分范围的事件区域 ID 重复');
  const byId=new Map(cases.map(c=>[c.id,c])),wanted=new Set(caseIds),predicted=new Map();
  for(const p of predictions){if(!wanted.has(p.caseId)||predicted.has(p.caseId))throw Error('响应重复或属于未声明评分范围');predicted.set(p.caseId,p);}
  const rows=caseIds.map(id=>{const c=byId.get(id);if(!c)throw Error('评分范围引用未知区域');const p=predicted.get(id)||{status:'missing',notes:[]};if(!['returned','refused','failed','partial','missing'].includes(p.status))throw Error('响应状态无效');
    return {caseId:id,dataset:c.dataset,eventUnit:c.eventUnit,referenceLevel:c.referenceLevel,alignment:c.alignment,partition:c.partition||'development',status:p.status,metrics:c.reference?scoreRecognitionCase({...c.reference,compareMeasure:c.alignment==='annotated-bar-local'},p):null,usageAudit:p.usageAudit||null};});
  const grouped=new Map();
  for(const r of rows){const key=JSON.stringify([r.dataset,r.eventUnit,r.referenceLevel,r.alignment,r.partition]);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r);}
  const groups=[...grouped.values()].map(rs=>{
    const scored=rs.filter(r=>r.metrics),sum=key=>summary(scored.reduce((a,r)=>{for(const k of ['reference','predicted','correct'])a[k]+=r.metrics[key][k];return a;},{reference:0,predicted:0,correct:0}));
    const statuses=Object.fromEntries(['returned','refused','failed','partial','missing'].map(s=>[s,rs.filter(r=>r.status===s).length]));
    const field=key=>{const measured=scored.filter(r=>r.metrics[key].measured),total=sum(key),knownReference=measured.reduce((n,r)=>n+r.metrics[key].reference,0),knownCorrect=measured.reduce((n,r)=>n+r.metrics[key].correct,0),complete=measured.length===scored.length&&measured.length>0;return {...total,measuredRows:measured.length,unknownRows:scored.length-measured.length,accuracy:complete?total.recall:null,recall:complete?total.recall:null,precision:complete?total.precision:null,knownReference,knownCorrect,knownSubsetAccuracy:rate(knownCorrect,knownReference)};};
    return {dataset:rs[0].dataset,eventUnit:rs[0].eventUnit,referenceLevel:rs[0].referenceLevel,alignment:rs[0].alignment,partition:rs[0].partition,trial,rows:rs.length,scorableRows:scored.length,statuses,refusalRate:rate(statuses.refused,rs.length),
      strict:sum('strict'),pitchAndHand:sum('pitchAndHand'),writtenSpelling:field('writtenSpelling'),printedAccidentals:field('printedAccidentals'),
      falseCompletions:scored.filter(r=>r.metrics.falseCompletion).length,exactScopes:scored.filter(r=>r.metrics.exactScope).length,usage:aggregateRecognitionUsage(rs.map(r=>r.usageAudit))};
  });
  return {schema:'recognition-regression-result/v1',trial,rows,groups,scopeRows:rows.length,providerCalls:0,mode:'offline-frozen-responses',overallAccuracy:null};
}

export function compareRecognitionRegression(baseline,current,{maxLostCorrect=0,maxNewExtras=0,maxNewRefusals=0}={}){
  const problems=[];if(baseline.scopeRows!==current.scopeRows||JSON.stringify(baseline.rows.map(r=>r.caseId))!==JSON.stringify(current.rows.map(r=>r.caseId)))problems.push('评分范围改变');
  if(baseline.groups.length!==current.groups.length)problems.push('参考分组改变');
  for(const [i,a]of baseline.groups.entries()){
    const b=current.groups[i];if(!b)continue;
    for(const k of ['dataset','eventUnit','referenceLevel','alignment','partition','trial'])if(a[k]!==b[k])problems.push(k+' 改变');
    if(a.strict.reference!==b.strict.reference)problems.push('参考分母改变');
    if(a.strict.correct-b.strict.correct>maxLostCorrect)problems.push(a.dataset+' 严格匹配下降');
    if(b.strict.unmatchedPrediction-a.strict.unmatchedPrediction>maxNewExtras)problems.push(a.dataset+' 新增未匹配预测');
    if(b.statuses.refused+b.statuses.failed+b.statuses.missing+b.statuses.partial-a.statuses.refused-a.statuses.failed-a.statuses.missing-a.statuses.partial>maxNewRefusals)problems.push(a.dataset+' 失败、部分输出或拒识增加');
    if(b.exactScopes<a.exactScopes)problems.push(a.dataset+' 完整范围匹配减少');
    if(b.falseCompletions>a.falseCompletions)problems.push(a.dataset+' 错误完成增加');
    for(const k of ['writtenSpelling','printedAccidentals'])if(a[k].measuredRows&&(b[k].measuredRows<a[k].measuredRows||b[k].correct<a[k].correct))problems.push(a.dataset+' '+k+' 证据或匹配下降');
  }
  return {passed:problems.length===0,policy:{maxLostCorrect,maxNewExtras,maxNewRefusals},problems};
}
