import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRecognitionGate} from '../lib/recognition-gate.mjs';
import {createFullScoreJobStore} from '../lib/full-score-jobs.mjs';
import {RECOGNITION_PROMPT_VERSION} from '../lib/recognition-prompts.mjs';
import {recognitionCacheKey} from '../lib/recognition-cache.mjs';

const image={mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P7sAAAAASUVORK5CYII='};
const auth={sessionId:'efficiency-owner'};
const manifest=()=>({title:'Repeated piano source',totalPages:1,timeSignature:[4,4],tempo:90,keySignature:0,regions:[{id:'row',page:1,system:1,rect:{x:0,y:0,width:100,height:100},pageWidth:100,pageHeight:100,measureCount:1,image}]});
const result=()=>({score:{title:'Source',tempo:90,timeSignature:[4,4],keySignature:0,durationBeats:4,notes:[{id:'r',beat:0,duration:4,midi:60,hand:'right',voice:'right-1'},{id:'l',beat:0,duration:4,midi:48,hand:'left',voice:'left-1'}]},coverage:{complete:true,measureCount:1,measureDurations:[4]},positions:[{noteId:'r',x:30,y:25},{noteId:'l',x:30,y:75}],rests:[],continuity:{tieIn:[],tieOut:[]},internalTies:[],model:'gpt-6.1-sol',reasoningEffort:'high',promptVersion:RECOGNITION_PROMPT_VERSION});

test('prompt changes invalidate source keys and old reviewed results are never seeded into the new cache',async t=>{
 const source=manifest(),region=source.regions[0],policy={model:'gpt-6.1-sol',reasoningEffort:'high'};
 assert.notEqual(recognitionCacheKey(source,region,{...policy,promptVersion:'previous'}),recognitionCacheKey(source,region,{...policy,promptVersion:RECOGNITION_PROMPT_VERSION}));
 const directory=await mkdtemp(join(tmpdir(),'qinban-prompt-cache-'));let calls=0;
 const adapter=async()=>({...result(),promptVersion:++calls<=1?'previous':RECOGNITION_PROMPT_VERSION});
 const store=createFullScoreJobStore({directory,recognizeRegion:adapter,checkRegion:adapter});
 t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
 const first=await store.createJob(source,auth);await store.startJob(first.id,auth);const old=await store.waitForIdle(first.id,auth);
 await store.confirmRegion(first.id,'row',old.regions[0].result,auth);
 const second=await store.createJob(source,auth);await store.startJob(second.id,auth);const fresh=await store.waitForIdle(second.id,auth);
 assert.equal(calls,2);assert.equal(fresh.reuse.hits,0);assert.equal(fresh.regions[0].result.promptVersion,RECOGNITION_PROMPT_VERSION);
});
test('reimporting exactly the same reviewed source does not spend another model call',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'qinban-efficiency-'));let calls=0;
 const adapter=async()=>{calls++;return result();};
 const store=createFullScoreJobStore({directory,recognizeRegion:adapter,checkRegion:adapter});
 t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
 const first=await store.createJob(manifest(),auth);assert.equal(first.snapshot.estimate.concurrency,100);await store.startJob(first.id,auth);let job=await store.waitForIdle(first.id,auth);
 await store.confirmRegion(first.id,'row',job.regions[0].result,auth);assert.equal(calls,1);
 const second=await store.createJob(manifest(),auth);await store.startJob(second.id,auth);job=await store.waitForIdle(second.id,auth);
 assert.equal(calls,1,'identical reviewed images must reuse the prior result instead of recognizing and rereading again');
 assert.equal(job.regions[0].result.score.notes.length,2);assert.equal(job.progress.total,1);
});

test('legacy on-disk verify flag is ignored when a saved task resumes',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'qinban-legacy-'));let reads=0,checks=0;
 const {readFile,writeFile}=await import('node:fs/promises');
 const original=createFullScoreJobStore({directory,recognizeRegion:async()=>result()});
 const {id}=await original.createJob(manifest(),auth);await original.close();
 const path=join(directory,id,'job.json'),saved=JSON.parse(await readFile(path,'utf8'));saved.verify=true;await writeFile(path,JSON.stringify(saved));
 const store=createFullScoreJobStore({directory,recognizeRegion:async()=>{reads++;return result();},checkRegion:async()=>{checks++;return result();}});
 t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
 await store.startJob(id,auth);const job=await store.waitForIdle(id,auth);
 assert.equal(reads,1);assert.equal(checks,0);assert.equal(job.estimate.modelCalls,1);assert.equal(job.calls.verification,0);
});
test('cache is private to the authorized session and invalidates changed musical context',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'qinban-cache-boundary-'));let calls=0;const adapter=async()=>{calls++;return result();};
 const store=createFullScoreJobStore({directory,recognizeRegion:adapter,checkRegion:adapter});t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
 const first=await store.createJob(manifest(),auth);await store.startJob(first.id,auth);let job=await store.waitForIdle(first.id,auth);await store.confirmRegion(first.id,'row',job.regions[0].result,auth);
 const other={sessionId:'different-owner'},second=await store.createJob(manifest(),other);await store.startJob(second.id,other);await store.waitForIdle(second.id,other);assert.equal(calls,2);
 const changed=manifest();changed.regions[0].context='different clef or octave context';const third=await store.createJob(changed,auth);await store.startJob(third.id,auth);await store.waitForIdle(third.id,auth);assert.equal(calls,3);
});
test('removed verification retry fails without clearing the first reading',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'qinban-review-removed-'));let reads=0;
 const store=createFullScoreJobStore({directory,recognizeRegion:async()=>{reads++;return result();}});
 t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
 const {id}=await store.createJob(manifest(),auth);await store.startJob(id,auth);const first=await store.waitForIdle(id,auth);
 await assert.rejects(store.retryRegion(id,'row',auth,{phase:'verify'}),{code:'VERIFICATION_REMOVED'});
 const second=await store.getJob(id,auth);assert.equal(reads,1);assert.deepEqual(second.regions[0].result,first.regions[0].result);
});
test('the shared request gate keeps four-call concurrency across two simultaneous full-score jobs',{timeout:10000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'qinban-concurrency-'));let active=0,maximum=0;const firstWave=[];
 const adapter=async()=>{active++;maximum=Math.max(maximum,active);await new Promise(resolve=>{
   if(firstWave.length<4){firstWave.push(resolve);if(firstWave.length===4)for(const release of firstWave)release();}
   else setImmediate(resolve);
 });active--;return result();};
 const store=createFullScoreJobStore({directory,recognizeRegion:adapter,checkRegion:adapter,maxConcurrency:4});t.after(async()=>{for(const release of firstWave)release();await store.close();await rm(directory,{recursive:true,force:true});});
 const many=()=>({...manifest(),totalPages:6,regions:Array.from({length:6},(_,i)=>({...manifest().regions[0],id:'row-'+i,page:i+1}))});
 const a=await store.createJob(many(),auth),b=await store.createJob(many(),auth);await store.startJob(a.id,auth);await store.startJob(b.id,auth);const completed=await Promise.all([store.waitForIdle(a.id,auth),store.waitForIdle(b.id,auth)]);assert.equal(maximum,4);assert.ok(completed.every(j=>j.progress.needsReview===6));
});


test('default recognition gate permits 100 requests and queues the 101st until a slot releases',async()=>{
 const gate=createRecognitionGate(),controller=new AbortController(),releases=[];let active=0,peak=0,started=0;
 const tasks=Array.from({length:101},()=>gate(async()=>{active++;started++;peak=Math.max(peak,active);await new Promise(resolve=>releases.push(resolve));active--;},controller.signal));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(started,100);assert.equal(active,100);
 releases.shift()();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(started,101);assert.equal(peak,100);
 for(const release of releases)release();await Promise.all(tasks);assert.equal(active,0);
});
