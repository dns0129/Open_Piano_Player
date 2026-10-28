import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {providerUsage,aggregateRecognitionUsage} from '../lib/recognition-accounting.mjs';
import {recognitionTrace} from '../lib/recognition-usage.mjs';
import {runRecognitionPlan} from '../lib/recognition-plan.mjs';
import {readDeepseek,DEEPSEEK_RECOGNITION} from '../lib/deepseek-vision.mjs';
import {withWrittenFixture} from './helpers/written-recognition-fixture.mjs';
import {normalizeProviderUsage,pricedUsage} from '../lib/accounts/recognition-provider.mjs';
test('hosted accounting preserves missing provider totals without changing input/output settlement',()=>{
 const usage=normalizeProviderUsage({input_tokens:10,output_tokens:20});assert.deepEqual(usage,{input:10,output:20});assert.equal(pricedUsage(usage,{inputRate:1,outputRate:2}),50);
 const explicit=normalizeProviderUsage({input_tokens:10,output_tokens:20,total_tokens:32,input_tokens_details:{cached_tokens:0}});assert.deepEqual(explicit,{input:10,output:20,totalTokens:32,cached:0});
 assert.equal(normalizeProviderUsage({output_tokens:20}),null,'missing billing inputs still require reconciliation');
});
test('partial provider usage stays partial and duplicate persisted audit IDs never count twice',()=>{
 assert.deepEqual(providerUsage({completion_tokens:5},{input:'prompt_tokens',output:'completion_tokens',totalTokens:'total_tokens'}),{output:5});assert.equal(providerUsage({input:-1,output:NaN}),null);
 const a={id:'first',actualRequests:1,usage:{input:10,output:20,totalTokens:30}},b={id:'second',actualRequests:1,usage:{output:5}};
 const r=aggregateRecognitionUsage([a,b,a]);assert.deepEqual(r.usage,{input:10,output:25,totalTokens:30});assert.equal(r.actualRequests,2);assert.equal(r.usageComplete,false);assert.equal(r.stages,2);
});
test('finishing a trace twice persists one physical request record and returns the same identity',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'p2-ledger-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'usage.jsonl'),trace=recognitionTrace({region:{id:'r',page:1,system:1}},{path});
 trace.observe({request:{model:'gpt-6.1-sol',reasoningEffort:'high'}});trace.observe({usage:{output:7}});
 const [a,b]=await Promise.all([trace.finish('returned'),trace.finish('returned')]);assert.equal(a.id,b.id);assert.equal((await readFile(path,'utf8')).trim().split('\n').length,1);assert.deepEqual(a.usage,{output:7});
});
test('recovery and independent review costs include failed and successful stages; resuming never repeats or doubles them',async()=>{
 const r={score:{keySignature:5,timeSignature:[4,4],notes:[],durationBeats:4},coverage:{measureCount:1,measureDurations:[4]},checks:{passed:true,errors:[]},warnings:[],internalTies:[],continuity:{tieIn:[],tieOut:[]}};let calls=0,checkpoint;
 const request={engine:'pi',metadata:{title:'fixture'},region:{id:'r',page:1,system:1,rect:{x:0,y:0,width:10,height:10},image:{data:'fixture',sha256:'fixture'}}};
 const read=async()=>{calls++;if(calls===1)throw Object.assign(new Error('source'),{code:'NEEDS_SOURCE',usageAudit:{id:'failed-first',actualRequests:1,usage:{input:10}}});return {...structuredClone(r),usageAudit:{id:'call-'+calls,actualRequests:1,usage:{input:20,output:30,totalTokens:50}}};};
 const result=await runRecognitionPlan(request,{policy:{review:'risk',maxCalls:3},prepare:async row=>row,read,onCheckpoint:async p=>checkpoint=p});
 assert.equal(calls,3);assert.deepEqual(result.usage,{input:50,output:60,totalTokens:100});assert.equal(result.usageAudit.usageComplete,false);assert.equal(result.usageAudit.actualRequests,3);
 assert.equal(result.verification.status,'agreement');
 const resumed=await runRecognitionPlan(request,{policy:{review:'risk',maxCalls:3},read:()=>assert.fail('repeat request'),prepare:async row=>row,checkpoint});assert.deepEqual(resumed.usage,result.usage);
});
test('DeepSeek high stays experimental; a complete JSON in the same response crosses normal submission without a second request',async()=>{
 const raw=withWrittenFixture({complete:true,meter:[4,4],key:0,bpm:90,bars:[4],notes:[[60,0,4,1,.2,.2,.7],[48,0,4,-1,.2,.8,.5]],rests:[],in:[],out:[],ties:[],graces:[],warnings:[]});let calls=0;
 const req={systemPrompt:'source rules',text:'read',images:[{mimeType:'image/png',data:'native-pixels'}],tools:[{name:'submit_score_region',parameters:{type:'object'}}]},settings={deepseekApiKey:'test-key',deepseekModel:'deepseek-flash'};
 const result=await readDeepseek(req,settings,{fetchImpl:async(_url,options)=>{calls++;const b=JSON.parse(options.body);assert.equal(b.tool_choice,'auto');assert.equal(b.thinking.type,'enabled');assert.equal(b.reasoning_effort,'high');return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}],usage:{completion_tokens:9}}));}});
 assert.equal(calls,1);assert.equal(result.submissionMethod,'json-content');assert.deepEqual(result.usage,{output:9});assert.equal(DEEPSEEK_RECOGNITION.experimental,true);assert.equal(DEEPSEEK_RECOGNITION.forcedToolChoice,false);
 await assert.rejects(readDeepseek(req,settings,{fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:'plain prose without a transcription'}}]}))}),{code:'NO_REGION_RESULT'});
});
