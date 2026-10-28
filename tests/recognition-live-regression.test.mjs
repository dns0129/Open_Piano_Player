import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {runLiveRecognitionRegression} from '../lib/recognition-live-regression.mjs';
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'p2-live-'));t.after(()=>rm(dir,{recursive:true,force:true}));const image=join(dir,'source.png'),pdf=join(dir,'source.pdf');await writeFile(image,'mock-source-image');await writeFile(pdf,'mock-pdf');
 const region={id:'r',page:1,system:1,rect:{x:0,y:0,width:100,height:60},previousAnswer:'PRIVATE-ANSWER'},notes=[{id:'n0',midi:60,beat:0,duration:4,hand:'right',voice:'right-1'},{id:'n1',midi:48,beat:0,duration:4,hand:'left',voice:'left-1'}];
 const cases=['a','b'].map(id=>({id,dataset:'synthetic-only',eventUnit:'written-head',referenceLevel:'synthetic',alignment:'frozen-row-relative',reference:{notes,secret:'PRIVATE-ANSWER'},region,sourceImage:{path:image,sha256:createHash('sha256').update('mock-source-image').digest('hex')},sourcePdf:pdf}));
 const reading={score:{version:1,id:'fixture',title:'fixture',tempo:90,keySignature:0,timeSignature:[4,4],notes,durationBeats:4},positions:[{noteId:'n0',x:20,y:20},{noteId:'n1',x:20,y:45}],coverage:{complete:true,measureCount:1,measureDurations:[4]},rests:[],internalTies:[],continuity:{tieIn:[],tieOut:[]}};
 const suite={schema:'recognition-regression-suite/v1',cases,files:[],runs:[{trial:'dense-p0-offline-recovery',caseIds:cases.map(c=>c.id),readings:cases.map(c=>({caseId:c.id,format:'region-result',status:'returned',value:reading}))}]};
 const file=join(dir,'suite.json');await writeFile(file,JSON.stringify(suite));return {dir,file,reading};
}
test('live regression is opt-in, refuses an insufficient budget before dispatch, and never passes answers to a reader',async t=>{
 const {dir,file,reading}=await fixture(t);let calls=0;
 await assert.rejects(runLiveRecognitionRegression({suiteFile:file,output:join(dir,'never'),maxCalls:1,read:()=>assert.fail('unbudgeted model call')}),/明确的调用预算/);
 const result=await runLiveRecognitionRegression({suiteFile:file,output:join(dir,'run'),maxCalls:2,context:async()=>null,read:async(request,limits)=>{
  calls++;assert.ok(!JSON.stringify(request).includes('PRIVATE-ANSWER'));assert.equal(limits.maxCalls,1);assert.equal(request.requireNotation,true);
  return {...structuredClone(reading),model:'gpt-6.1-sol',reasoningEffort:'high',requestAudit:[{model:'gpt-6.1-sol',reasoningEffort:'high'}],usageAudit:{id:'call-'+calls,actualRequests:1,usage:{input:2,output:3,totalTokens:5}}};
 }});
 assert.equal(calls,2);assert.equal(result.providerCalls,2);assert.equal(result.comparison.passed,true);assert.equal(result.after.groups[0].strict.correct,4);
 await assert.rejects(runLiveRecognitionRegression({suiteFile:file,output:join(dir,'run'),maxCalls:2,read:()=>assert.fail('overwrite dispatched again')}),{code:'EEXIST'});
 const protocol=JSON.parse(await readFile(join(dir,'run/protocol.json'),'utf8'));assert.equal(protocol.referenceSentToModel,false);
});
test('an unresolved provider failure stops later dispatch and leaves every unreturned reference in the denominator',async t=>{
 const {dir,file}=await fixture(t);let calls=0;
 const result=await runLiveRecognitionRegression({suiteFile:file,output:join(dir,'failed'),maxCalls:2,context:async()=>null,read:async()=>{calls++;throw Object.assign(new Error('private upstream'),{code:'MODEL_REQUEST_FAILED',usageAudit:{actualRequests:1,usage:null}});}});
 assert.equal(calls,1);assert.equal(result.providerCalls,1);assert.equal(result.after.groups[0].strict.reference,4);assert.equal(result.after.groups[0].strict.correct,0);assert.equal(result.after.groups[0].statuses.missing,1);
});
test('a local source preparation failure is zero provider dispatch, with unreturned references still visible',async t=>{
 const {dir,file}=await fixture(t);const result=await runLiveRecognitionRegression({suiteFile:file,output:join(dir,'source-error'),maxCalls:2,context:async()=>{throw Error('unreadable original PDF');},read:()=>assert.fail('local failure dispatched a model')});
 assert.equal(result.providerCalls,0);assert.equal(result.unknownRequestCounts,0);assert.equal(result.after.groups[0].strict.reference,4);assert.equal(result.after.groups[0].statuses.missing,1);
});
