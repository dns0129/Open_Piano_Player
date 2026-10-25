import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createFullScoreJobStore} from '../lib/full-score-jobs.mjs';
import {prepareScoreRevision} from '../lib/score-diagnosis.mjs';
import {normalizeSourceAssessment} from '../lib/source-assessment.mjs';
import {scoreDiagnosisCard} from '../src/score-diagnosis-card.js';
import {diagnosisPrompt,generateScoreDiagnosis} from '../lib/score-diagnosis-agent.mjs';
import {createFullScoreClient} from '../src/full-score-client.js';
const auth={sessionId:'owner'},image={mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P7sAAAAASUVORK5CYII='};
const assessment={probability:.75,cause:'source-notation',summary:'原谱可能缺少半拍，但也可能漏读附点。',evidence:['4 - 3.5 = 0.5拍'],alternatives:['附点或声部误读']};
const rawResult=()=>({score:{title:'fixture',tempo:80,timeSignature:[4,4],keySignature:0,durationBeats:4,notes:[{id:'r',beat:0,duration:3.5,midi:60,hand:'right',voice:'right-1'},{id:'l',beat:0,duration:4,midi:48,hand:'left',voice:'left-1'}]},coverage:{complete:true,measureCount:1,measureDurations:[4]},positions:[{noteId:'r',x:30,y:30},{noteId:'l',x:30,y:80}],rests:[],continuity:{tieIn:[],tieOut:[]},internalTies:[],warnings:[]});
const report=phase=>({assessment,explanation:'建议补一个八分休止；这是人工修订，不是原图识读。',remainingDoubts:['作者原意仍需人工判断'],edits:phase==='assess'?[]:[{op:'add-rest',beat:3.5,duration:.5,hand:'right',voice:'right-1',reason:'按用户可选择的人工修订解释半拍空缺'}],model:'test-model',usage:{input:100,output:30,totalTokens:130}});
async function setup(t,extra={}){
 const directory=await mkdtemp(join(tmpdir(),'qinban-diagnosis-'));const calls=[];
 const store=createFullScoreJobStore({directory,recognizeRegion:async()=>rawResult(),diagnoseRegion:async req=>{calls.push(req);return report(req.phase);},...extra});
 t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
 const created=await store.createJob({title:'fixture',totalPages:1,timeSignature:[4,4],regions:[{id:'row',page:1,system:1,rect:{x:0,y:0,width:200,height:100},image}]},auth);
 await store.startJob(created.id,auth);await store.waitForIdle(created.id,auth);return {store,directory,id:created.id,calls};
}
test('assessment does not fabricate calibrated odds; UI escapes evidence and exposes explicit consent',()=>{
 assert.equal(normalizeSourceAssessment({...assessment,probability:3}),null);
 assert.equal(normalizeSourceAssessment({...assessment,probability:null}).probability,null);
 const html=scoreDiagnosisCard({image,sourceAssessment:{...assessment,summary:'<script>alert(1)</script>'},result:{checks:{errors:[{message:'0.5拍缺口'}]}}});
 assert.match(html,/75%/);assert.match(html,/未经校准/);assert.match(html,/确认移交/);assert(!html.includes('<script>'));
 assert.match(scoreDiagnosisCard({image,result:{checks:{errors:[]}}}),/尚未给出概率/);
 assert.match(diagnosisPrompt('diagnose'),/全新会话/);assert.match(diagnosisPrompt('diagnose'),/不能直接接受上一轮答案/);
 assert.match(diagnosisPrompt('assess'),/edits必须为空/);
});
test('real lifecycle preserves original, requires two consents, checks candidate, persists and undoes only the revised row',async t=>{
 const {store,id,directory,calls}=await setup(t);const original=(await store.getJob(id,auth)).regions[0].result;
 assert.equal(original.checks.passed,false);
 await assert.rejects(store.diagnoseRegion(id,'row',{},auth),e=>e.code==='DIAGNOSIS_CONSENT_REQUIRED');assert.equal(calls.length,0);
 await assert.rejects(store.assessRegion(id,'row',{}, {sessionId:'foreign'}),e=>e.code==='JOB_NOT_FOUND');assert.equal(calls.length,0);
 let job=await store.assessRegion(id,'row',{},auth);assert.deepEqual(job.regions[0].result,original);assert.equal(job.regions[0].sourceAssessment.probability,.75);
 job=await store.diagnoseRegion(id,'row',{confirmed:true},auth);const proposal=job.regions[0].diagnosis;
 assert.equal(proposal.report.canApply,true);assert.deepEqual(job.regions[0].result,original);assert.equal(calls.length,2);
 await assert.rejects(store.applyRevision(id,'row',{proposalId:proposal.id},auth),e=>e.code==='REVISION_CONSENT_REQUIRED');
 job=await store.applyRevision(id,'row',{proposalId:proposal.id,confirmed:true},auth);
 assert(job.regions[0].result.checks.passed);assert.equal(job.regions[0].status,'needs-review');assert.deepEqual(job.regions[0].result.score.notes,original.score.notes);
 assert.match(job.regions[0].result.warnings.at(-1),/人工修订/);assert.equal(job.regions[0].recognitionCheckpoint,null);
 await assert.rejects(store.applyRevision(id,'row',{proposalId:proposal.id,confirmed:true},auth),e=>e.code==='DIAGNOSIS_CONFLICT');
 const restored=createFullScoreJobStore({directory});t.after(()=>restored.close());assert.equal((await restored.getJob(id,auth)).regions[0].revisionHistory.length,1);
 job=await store.undoRevision(id,'row',{revisionId:proposal.id},auth);assert.deepEqual(job.regions[0].result,original);assert(job.regions[0].revisionHistory[0].undoneAt);
});
test('failed recognition retains model cause and can be diagnosed without inventing a transcription',async t=>{
 const {store,id}=await setup(t,{recognizeRegion:async()=>{throw Object.assign(new Error('疑似原谱问题，待诊断'),{code:'NEEDS_SOURCE',expose:true,sourceAssessment:assessment});},diagnoseRegion:async()=>({...report('assess'),edits:[]})});
 let job=await store.getJob(id,auth);assert.equal(job.regions[0].status,'failed');assert.equal(job.regions[0].sourceAssessment.probability,.75);
 job=await store.diagnoseRegion(id,'row',{confirmed:true},auth);assert.equal(job.regions[0].result,null);assert.equal(job.regions[0].diagnosis.report.canApply,false);
});
test('diagnosis failure and per-row attempt bound preserve the original and make no automatic repeated requests',async t=>{
 let calls=0;const {store,id}=await setup(t,{diagnoseRegion:async()=>{calls++;throw Error('private upstream body must not be exposed');}});
 const original=(await store.getJob(id,auth)).regions[0].result;
 for(let i=0;i<4;i++)await assert.rejects(store.assessRegion(id,'row',{},auth));
 await assert.rejects(store.assessRegion(id,'row',{},auth),e=>e.code==='DIAGNOSIS_LIMIT');assert.equal(calls,4);
 const job=await store.getJob(id,auth);assert.deepEqual(job.regions[0].result,original);assert(!JSON.stringify(job.regions[0].diagnosis).includes('private upstream'));
});
test('a proposal cannot overwrite edits submitted after the handoff',async t=>{
 const {store,id}=await setup(t);await store.assessRegion(id,'row',{},auth);let job=await store.diagnoseRegion(id,'row',{confirmed:true},auth);const p=job.regions[0].diagnosis;
 const edited=structuredClone(job.regions[0].result);edited.rests.push({beat:3.5,duration:.5,hand:'right',voice:'right-1'});edited.score.notes.find(n=>n.id==='r').midi=61;
 await store.confirmRegion(id,'row',edited,auth);
 await assert.rejects(store.applyRevision(id,'row',{proposalId:p.id,confirmed:true},auth),e=>e.code==='DIAGNOSIS_CONFLICT');
 assert.equal((await store.getJob(id,auth)).regions[0].result.score.notes.find(n=>n.id==='r').midi,61);
});
test('invalid or unsupported candidates cannot bypass musical checks',()=>{
 const r={rect:{x:0,y:0,width:200,height:100},page:1,system:1,result:rawResult()};
 assert.throws(()=>prepareScoreRevision({...report('diagnose'),edits:[{op:'invent-song',reason:'bad'}]},r,{}));
 assert.throws(()=>prepareScoreRevision({...report('diagnose'),edits:[{op:'add-note',reason:'bad',beat:0,duration:4,midi:60,hand:'right'}]},r,{}));
 const over=prepareScoreRevision({...report('diagnose'),edits:[{op:'add-rest',beat:3,duration:2,hand:'right',voice:'right-1',reason:'invalid range'}]},r,{});assert.equal(over.canApply,false);
});
test('client sends proposal identity and consent in protected job requests, never URL credentials',async()=>{
 const calls=[];const client=createFullScoreClient({vault:{initialize:async()=>{},get:()=> 'private-test-token'},api:{json:async(...args)=>{calls.push(args);return {status:'needs-review'};}}});
 await client.assessRegion('job','row');await client.diagnoseRegion('job','row',{confirmed:true});await client.applyRevision('job','row',{confirmed:true,proposalId:'p'});await client.undoRevision('job','row',{revisionId:'p'});
 assert.deepEqual(calls.map(c=>c[0]),['/api/full-score-jobs/job/assess-source/row','/api/full-score-jobs/job/diagnose-source/row','/api/full-score-jobs/job/apply-revision/row','/api/full-score-jobs/job/undo-revision/row']);
 assert.equal(calls[2][1].proposalId,'p');assert.equal(calls[2][3].headers['X-Fullscore-Token'],'private-test-token');
});
test('independent diagnostic model transport receives source evidence and a separate role, not a transcription tool',async()=>{
 let payload;const result=await generateScoreDiagnosis({phase:'diagnose',engine:'deepseek',metadata:{title:'data'},region:{page:5,system:4,image,rect:{x:0,y:0,width:200,height:100}},priorResult:rawResult(),observations:{checks:{errors:[{code:'RHYTHM_GAP'}]}}},{deepseekApiKey:'test-key'},{traceOptions:{path:join(tmpdir(),'qinban-diagnosis-test-usage.jsonl')},fetchImpl:async(_url,opt)=>{payload=JSON.parse(opt.body);return new Response(JSON.stringify({model:'deepseek-flash',choices:[{finish_reason:'tool_calls',message:{tool_calls:[{function:{name:'submit_diagnosis',arguments:JSON.stringify(report('diagnose'))}}]}}]}));}});
 assert.equal(payload.tools[0].function.name,'submit_diagnosis');assert.match(payload.messages[0].content,/独立/);assert.match(payload.messages[1].content[0].text,/RHYTHM_GAP/);assert.equal(result.edits[0].duration,.5);
});

test('late diagnostic output is rejected after a newer source image, without altering other rows',async t=>{
 let release,started;const waiting=new Promise(r=>{started=r;});
 const {store,id}=await setup(t,{diagnoseRegion:async()=>{started();await new Promise(r=>{release=r;});return report('assess');}});
 const pending=store.assessRegion(id,'row',{},auth);await waiting;
 await store.uploadRegion(id,'row',{image},auth);release();
 await assert.rejects(pending,e=>e.code==='DIAGNOSIS_CONFLICT');
 const job=await store.getJob(id,auth);assert.equal(job.regions[0].result,null);assert.equal(job.regions[0].diagnosis,null);
});
test('undo refuses to overwrite a later manually confirmed edit',async t=>{
 const {store,id}=await setup(t);await store.assessRegion(id,'row',{},auth);
 let job=await store.diagnoseRegion(id,'row',{confirmed:true},auth);const p=job.regions[0].diagnosis;
 job=await store.applyRevision(id,'row',{confirmed:true,proposalId:p.id},auth);
 const edited=structuredClone(job.regions[0].result);edited.score.notes.find(n=>n.id==='r').midi=62;
 await store.confirmRegion(id,'row',edited,auth);
 await assert.rejects(store.undoRevision(id,'row',{revisionId:p.id},auth),e=>e.code==='DIAGNOSIS_CONFLICT');
 assert.equal((await store.getJob(id,auth)).regions[0].result.score.notes.find(n=>n.id==='r').midi,62);
});

test('confirming an unchanged accepted revision does not prevent undo',async t=>{
 const {store,id}=await setup(t);await store.assessRegion(id,'row',{},auth);
 let job=await store.diagnoseRegion(id,'row',{confirmed:true},auth);const p=job.regions[0].diagnosis;
 job=await store.applyRevision(id,'row',{confirmed:true,proposalId:p.id},auth);
 await store.confirmRegion(id,'row',job.regions[0].result,auth);
 job=await store.undoRevision(id,'row',{revisionId:p.id},auth);assert.equal(job.regions[0].result.checks.passed,false);assert.equal(job.regions[0].result.rests.length,0);
});
test('actual request_source protocol preserves source suspicion instead of always blaming image clarity',async()=>{
 const {generateScoreRegion}=await import('../lib/ai.mjs');
 await assert.rejects(generateScoreRegion({engine:'deepseek',metadata:{title:'fixture'},region:{id:'r',page:5,system:4,rect:{x:0,y:0,width:200,height:100},image}},{deepseekApiKey:'test-key'},{traceOptions:{path:join(tmpdir(),'qinban-source-assessment-test.jsonl')},fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{function:{name:'request_source',arguments:JSON.stringify({message:'清晰原谱右手少半拍，需诊断',sourceAssessment:assessment})}}]}}]}))}),e=>e.code==='NEEDS_SOURCE'&&e.sourceAssessment.probability===.75&&e.message.startsWith('疑似原谱问题，待诊断：'));
});

test('a failed row without a prior result can be independently transcribed and repaired with explicit acceptance, then restored',async t=>{
 const {encodeCompactRegion}=await import('../lib/recognition-wire.mjs');
 const {store,id}=await setup(t,{recognizeRegion:async()=>{throw Object.assign(new Error('待诊断'),{code:'NEEDS_SOURCE',expose:true,sourceAssessment:assessment});},diagnoseRegion:async request=>({...report('diagnose'),sourceTranscription:encodeCompactRegion({...rawResult(),score:{...rawResult().score,notes:rawResult().score.notes.map(n=>({...n,velocity:.7}))}},request.region),reasoningEffort:'high'})});
 let job=await store.diagnoseRegion(id,'row',{confirmed:true},auth);const p=job.regions[0].diagnosis;
 assert.equal(job.regions[0].result,null);assert.equal(p.report.changes[0].op,'transcribe');assert(p.report.canApply);
 job=await store.applyRevision(id,'row',{confirmed:true,proposalId:p.id},auth);assert(job.regions[0].result.checks.passed);assert.equal(job.regions[0].result.score.notes.length,2);
 job=await store.undoRevision(id,'row',{revisionId:p.id},auth);assert.equal(job.regions[0].status,'failed');assert.equal(job.regions[0].result,null);
});
