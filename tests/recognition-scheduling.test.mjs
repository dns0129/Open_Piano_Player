import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRecognitionGate} from '../lib/recognition-gate.mjs';
import {classifyRecognitionError,RETRY_LIMITS} from '../lib/recognition-retry.mjs';
import {createFullScoreJobStore} from '../lib/full-score-jobs.mjs';

const image={mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P7sAAAAASUVORK5CYII='};
const auth={sessionId:'scheduling-owner'};
const manifest=(rows=1)=>({title:'Scheduling source',totalPages:rows,timeSignature:[4,4],tempo:90,keySignature:0,regions:Array.from({length:rows},(_,i)=>({id:'row-'+i,page:i+1,system:1,rect:{x:0,y:0,width:100,height:100},pageWidth:100,pageHeight:100,measureCount:1,image}))});
const result=()=>({score:{title:'Source',tempo:90,timeSignature:[4,4],keySignature:0,durationBeats:4,notes:[{id:'r',beat:0,duration:4,midi:60,hand:'right',voice:'right-1'},{id:'l',beat:0,duration:4,midi:48,hand:'left',voice:'left-1'}]},coverage:{complete:true,measureCount:1,measureDurations:[4]},positions:[{noteId:'r',x:30,y:25},{noteId:'l',x:30,y:75}]});
const coded=(code,extra={})=>Object.assign(new Error(code),{code,...extra});
async function withStore(t,options){const directory=await mkdtemp(join(tmpdir(),'qinban-scheduling-'));const store=createFullScoreJobStore({directory,retryBaseMs:1,...options});t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});return store;}

test('error classification separates bad request, rate limit, connection, timeout and missing results',()=>{
 assert.equal(classifyRecognitionError(Object.assign(new Error('x'),{status:400})),'bad-request');
 assert.equal(classifyRecognitionError(coded('MODEL_RATE_LIMIT')),'rate-limit');
 assert.equal(classifyRecognitionError(Object.assign(new Error('x'),{status:429})),'rate-limit');
 assert.equal(classifyRecognitionError(coded('ECONNRESET')),'connection');
 assert.equal(classifyRecognitionError(new TypeError('fetch failed')),'connection');
 assert.equal(classifyRecognitionError(Object.assign(new Error('t'),{name:'TimeoutError'})),'timeout');
 assert.equal(classifyRecognitionError(coded('INVALID_SCORE',{status:422})),'no-result');
 assert.equal(classifyRecognitionError(coded('MODEL_BALANCE_REQUIRED')),'account');
 assert.equal(classifyRecognitionError(new Error('anything'),{cancelled:true}),'cancelled');
 assert.equal(RETRY_LIMITS['bad-request'],0);assert.equal(RETRY_LIMITS['rate-limit'],0);
});

test('a held slot stays occupied until the abandoned request actually exits',async()=>{
 const gate=createRecognitionGate(1),controller=new AbortController();let finishOld;const order=[];
 const first=gate(async({hold})=>{const old=new Promise(resolve=>finishOld=resolve).then(()=>order.push('old-exited'));hold(old);throw new Error('timed out');},controller.signal).catch(()=>order.push('caller-answered'));
 const second=gate(async()=>{order.push('second-started');},controller.signal);
 await first;await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(order,['caller-answered'],'the next call must wait for the old request, not just for the timeout');
 assert.equal(gate.stats().active,1);
 finishOld();await second;
 assert.deepEqual(order,['caller-answered','old-exited','second-started']);assert.equal(gate.stats().active,0);
});

test('a timed-out model call is retried once and never overlaps its own abandoned request',async t=>{
 let active=0,peak=0,calls=0;
 const slowThenFast=async()=>{calls++;active++;peak=Math.max(peak,active);try{await new Promise(resolve=>setTimeout(resolve,calls===1?120:5));return result();}finally{active--;}};
 const store=await withStore(t,{recognizeRegion:slowThenFast,maxConcurrency:1,timeoutMs:30});
 const {id}=await store.createJob(manifest(),auth);await store.startJob(id,auth,{verify:false});const job=await store.waitForIdle(id,auth);
 assert.equal(peak,1,'the retry must not start while the timed-out request is still running');
 assert.equal(calls,2);assert.equal(job.regions[0].status,'needs-review');assert.equal(job.calls.retries.timeout,1);
});

test('connection errors retry with backoff up to the limit; Bad Request and rate limit do not retry',async t=>{
 let flaky=0;const store=await withStore(t,{recognizeRegion:async()=>{if(++flaky<=2)throw coded('ECONNRESET');return result();}});
 let {id}=await store.createJob(manifest(),auth);await store.startJob(id,auth,{verify:false});let job=await store.waitForIdle(id,auth);
 assert.equal(flaky,3);assert.equal(job.calls.recognition,3);assert.equal(job.calls.retries.connection,2);assert.equal(job.regions[0].status,'needs-review');

 let bad=0;const badStore=await withStore(t,{recognizeRegion:async()=>{bad++;throw Object.assign(new Error('bad'),{status:400});}});
 ({id}=await badStore.createJob(manifest(),auth));await badStore.startJob(id,auth,{verify:false});job=await badStore.waitForIdle(id,auth);
 assert.equal(bad,1);assert.equal(job.regions[0].status,'failed');assert.equal(job.regions[0].error.type,'bad-request');

 let limited=0;const limitStore=await withStore(t,{recognizeRegion:async()=>{limited++;throw coded('MODEL_RATE_LIMIT');},maxConcurrency:1});
 ({id}=await limitStore.createJob(manifest(3),auth));await limitStore.startJob(id,auth,{verify:false});job=await limitStore.waitForIdle(id,auth);
 assert.equal(limited,1,'a rate limit pauses the run instead of spending more requests');assert.equal(job.regions[0].error.type,'rate-limit');
});

test('an invalid model result is read once more, then reported as no valid result',async t=>{
 let reads=0;const store=await withStore(t,{recognizeRegion:async()=>{reads++;return {coverage:{complete:false}};}});
 const {id}=await store.createJob(manifest(),auth);await store.startJob(id,auth,{verify:false});const job=await store.waitForIdle(id,auth);
 assert.equal(reads,2);assert.equal(job.calls.retries['no-result'],1);assert.equal(job.regions[0].status,'failed');assert.equal(job.regions[0].error.type,'no-result');
});

test('rows are scheduled as a rolling queue: a free slot takes the next row without waiting for the batch',async t=>{
 const started=[];let releaseSlow;
 const store=await withStore(t,{maxConcurrency:2,recognizeRegion:async request=>{started.push(request.region.id);if(request.region.id==='row-0')await new Promise(resolve=>releaseSlow=resolve);return result();}});
 const {id}=await store.createJob(manifest(4),auth);await store.startJob(id,auth,{verify:false});
 for(let i=0;i<50&&started.length<4;i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.deepEqual(started.sort(),['row-0','row-1','row-2','row-3'],'rows 2 and 3 start while row 0 is still running');
 releaseSlow();await store.waitForIdle(id,auth);
});
