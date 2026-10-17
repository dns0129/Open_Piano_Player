import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRecognitionGate} from '../lib/recognition-gate.mjs';
import {createFullScoreJobStore} from '../lib/full-score-jobs.mjs';

const image={mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P7sAAAAASUVORK5CYII='};
const auth={sessionId:'efficiency-owner'};
const manifest=()=>({title:'Repeated piano source',totalPages:1,timeSignature:[4,4],tempo:90,keySignature:0,regions:[{id:'row',page:1,system:1,rect:{x:0,y:0,width:100,height:100},pageWidth:100,pageHeight:100,measureCount:1,image}]});
const result=()=>({score:{title:'Source',tempo:90,timeSignature:[4,4],keySignature:0,durationBeats:4,notes:[{id:'r',beat:0,duration:4,midi:60,hand:'right',voice:'right-1'},{id:'l',beat:0,duration:4,midi:48,hand:'left',voice:'left-1'}]},coverage:{complete:true,measureCount:1,measureDurations:[4]},positions:[{noteId:'r',x:30,y:25},{noteId:'l',x:30,y:75}],rests:[],continuity:{tieIn:[],tieOut:[]},internalTies:[],model:'gpt-6.1-sol',reasoningEffort:'high'});
test('reimporting exactly the same reviewed source does not spend two more model calls',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'qinban-efficiency-'));let calls=0;
 const adapter=async()=>{calls++;return result();};
 const store=createFullScoreJobStore({directory,recognizeRegion:adapter,checkRegion:adapter});
 t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
 const first=await store.createJob(manifest(),auth);assert.equal(first.snapshot.estimate.concurrency,100);await store.startJob(first.id,auth);let job=await store.waitForIdle(first.id,auth);
 await store.confirmRegion(first.id,'row',job.regions[0].result,auth);assert.equal(calls,2);
 const second=await store.createJob(manifest(),auth);await store.startJob(second.id,auth);job=await store.waitForIdle(second.id,auth);
 assert.equal(calls,2,'identical reviewed images must reuse the prior result instead of recognizing and rereading again');
 assert.equal(job.regions[0].result.score.notes.length,2);assert.equal(job.progress.total,1);
});

test('a completed transcription survives cancellation during verification and resumes only the second read',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'qinban-checkpoint-'));let reads=0,checks=0,checking;
 const entered=new Promise(resolve=>checking=resolve);
 const store=createFullScoreJobStore({directory,recognizeRegion:async()=>{reads++;return result();},checkRegion:async(_request,{signal})=>{checks++;if(checks===1){checking();await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));throw signal.reason;}return result();}});
 t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
 const {id}=await store.createJob(manifest(),auth);await store.startJob(id,auth);await entered;await store.cancelJob(id,auth);await store.waitForIdle(id,auth);
 await store.startJob(id,auth);const job=await store.waitForIdle(id,auth);
 assert.equal(reads,1,'resume must not repeat a completed first read');assert.equal(checks,2);assert.equal(job.regions[0].result.verification.comparison.exactMatch,true);
});
test('cache is private to the authorized session and invalidates changed musical context',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'qinban-cache-boundary-'));let calls=0;const adapter=async()=>{calls++;return result();};
 const store=createFullScoreJobStore({directory,recognizeRegion:adapter,checkRegion:adapter});t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
 const first=await store.createJob(manifest(),auth);await store.startJob(first.id,auth);let job=await store.waitForIdle(first.id,auth);await store.confirmRegion(first.id,'row',job.regions[0].result,auth);
 const other={sessionId:'different-owner'},second=await store.createJob(manifest(),other);await store.startJob(second.id,other);await store.waitForIdle(second.id,other);assert.equal(calls,4);
 const changed=manifest();changed.regions[0].context='different clef or octave context';const third=await store.createJob(changed,auth);await store.startJob(third.id,auth);await store.waitForIdle(third.id,auth);assert.equal(calls,6);
});
test('retrying only failed verification retains the successful primary and its source positions',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'qinban-review-retry-'));let reads=0,checks=0;
 const store=createFullScoreJobStore({directory,recognizeRegion:async()=>{reads++;return result();},checkRegion:async()=>{if(++checks===1)throw new Error('failed independent read');return result();}});t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
 const {id}=await store.createJob(manifest(),auth);await store.startJob(id,auth);const first=await store.waitForIdle(id,auth);assert.ok(first.regions[0].result.verification.error);
 await store.retryRegion(id,'row',auth,{phase:'verify'});const second=await store.waitForIdle(id,auth);assert.equal(reads,1);assert.equal(checks,2);assert.deepEqual(second.regions[0].result.positions,first.regions[0].result.positions);
});
test('the shared request gate keeps four-call concurrency across two simultaneous full-score jobs',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'qinban-concurrency-'));let active=0,maximum=0;
 const adapter=async()=>{active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,5));active--;return result();};
 const store=createFullScoreJobStore({directory,recognizeRegion:adapter,checkRegion:adapter,maxConcurrency:4});t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
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
