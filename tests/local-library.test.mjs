import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createLocalLibrary} from '../lib/local-library.mjs';
import {createAppServer} from '../server.mjs';

async function fixture(t) {
  const directory=await mkdtemp(join(tmpdir(),'qinban-library-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const id='reviewed-song';
  const job={id,status:'needs-review',needsUserScopeConfirmation:false,updatedAt:'2026-10-18T00:00:00Z',
    tokenHash:'PRIVATE',ownerHash:'PRIVATE',regions:[{id:'p1-s1',status:'confirmed',image:{mimeType:'image/png'}}],
    result:{reviewStatus:'human-confirmed',checks:{passed:true},scope:{completeDocument:true},
      score:{id:`full-score-${id}`,title:'跨浏览器测试谱',tempo:90,timeSignature:[4,4],keySignature:0,durationBeats:4,
        notes:[{id:'n1',midi:60,beat:0,duration:1,hand:'right'}]},
      sourceNotation:{version:1,scoreId:`full-score-${id}`,systems:[{id:'p1-s1',imageUrl:'full-score-region:p1-s1'}],notes:[]}}};
  await mkdir(join(directory,id));await writeFile(join(directory,id,'p1-s1.image'),'fixture-image');
  const save=()=>writeFile(join(directory,id,'job.json'),JSON.stringify(job));await save();
  return {directory,id,job,save};
}

test('only completed, scoped, checked scores enter the disk-backed library and survive a fresh store',async t=>{
  const f=await fixture(t),store=createLocalLibrary(f);
  assert.equal((await store.list()).scores.length,0);
  f.job.status='complete';f.job.needsUserScopeConfirmation=true;await f.save();
  assert.equal((await store.list()).scores.length,0);
  f.job.needsUserScopeConfirmation=false;f.job.result.checks.passed=false;await f.save();
  assert.equal((await store.list()).scores.length,0);
  f.job.result.checks.passed=true;await f.save();
  assert.equal((await store.list()).scores.length,1);
  assert.equal((await createLocalLibrary(f).list()).scores[0].score.title,'跨浏览器测试谱');
  const source=await store.source(f.id);
  assert.equal(source.notation.systems[0].imageUrl,`/api/local-library/${f.id}/images/p1-s1`);
  assert(!JSON.stringify(source).includes('PRIVATE'));
  assert.equal((await store.image(f.id,'p1-s1')).buffer.toString(),'fixture-image');
  await assert.rejects(store.image(f.id,'../job'),{code:'SCORE_NOT_FOUND'});
  f.job.regions[0].status='needs-review';await f.save();
  assert.equal((await store.list()).scores.length,0);
  await assert.rejects(store.source(f.id),{code:'SCORE_NOT_FOUND'});
});

test('two independent browser sessions see the same completed score and original images without task credentials',async t=>{
  const f=await fixture(t);f.job.status='complete';await f.save();
  const server=createAppServer({localLibrary:createLocalLibrary(f),statusReader:async()=>({available:false}),settingsStore:{read:async()=>({})},fullScoreJobs:{close:async()=>{}},neteaseProvider:{close(){}}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  const url=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url+'/api/local-library')).status,403);
  const cookies=[];
  for(let i=0;i<2;i++) {
    const status=await fetch(url+'/api/status');const cookie=status.headers.get('set-cookie').split(';')[0];cookies.push(cookie);
    const response=await fetch(url+'/api/local-library',{headers:{cookie}});assert.equal(response.status,200);
    const data=await response.json();assert.equal(data.scores[0].score.id,f.job.result.score.id);assert(!JSON.stringify(data).includes('PRIVATE'));
    const source=await (await fetch(url+`/api/local-library/${f.id}`,{headers:{cookie}})).json();
    const image=await fetch(url+source.notation.systems[0].imageUrl,{headers:{cookie}});
    assert.equal(image.status,200);assert.equal(await image.text(),'fixture-image');
  }
  assert.notEqual(cookies[0],cookies[1]);
  assert.equal((await fetch(url+'/api/local-library',{headers:{cookie:cookies[0],origin:'https://untrusted.example'}})).status,403);
});

test('model-checked complete scores remain distinct from human confirmation and require full review evidence',async t=>{
  const f=await fixture(t),store=createLocalLibrary(f);
  f.job.status='complete';f.job.regions[0].status='model-reviewed';f.job.result.reviewStatus='model-reviewed';await f.save();
  assert.equal((await store.list()).scores.length,0);
  f.job.result.review={method:'source-image-check',model:'gpt-6.1-sol',reasoning:'high',humanConfirmed:false,checkedRegions:1,completedAt:'2026-10-19T00:00:00Z'};await f.save();
  const listed=await store.list();assert.equal(listed.scores.length,1);
  assert.equal(listed.scores[0].score.source.kind,'full-score-model-reviewed');
  assert.equal(listed.scores[0].score.source.reviewRequired,true);
  const source=await store.source(f.id);assert.equal(source.reviewStatus,'model-reviewed');assert.equal(source.review.humanConfirmed,false);
  assert(!JSON.stringify(source).includes('PRIVATE'));
  f.job.result.review.checkedRegions=0;await f.save();assert.equal((await store.list()).scores.length,0);
  f.job.result.review.checkedRegions=1;f.job.result.review.humanConfirmed=true;await f.save();assert.equal((await store.list()).scores.length,0);
});

test('removing a local job score survives restart without destroying recognition history',async t=>{
 const f=await fixture(t);f.job.status='complete';await f.save();const store=createLocalLibrary(f);
 await store.remove(f.id);assert.equal((await createLocalLibrary(f).list()).scores.length,0);
 await assert.rejects(store.source(f.id),{code:'SCORE_NOT_FOUND'});
 assert.equal(JSON.parse(await (await import('node:fs/promises')).readFile(join(f.directory,f.id,'job.json'),'utf8')).status,'complete');
});

test('an explicitly authorized full review exposes an approved score while retaining model provenance',async t=>{
 const f=await fixture(t),store=createLocalLibrary(f);f.job.status='complete';f.job.totalPages=1;f.job.regions[0].status='model-reviewed';f.job.result.reviewStatus='model-reviewed';f.job.result.score.measureMap=[{number:1,beat:0,duration:4}];
 f.job.result.review={method:'source-image-check',model:'gpt-6.1-sol',reasoning:'high',humanConfirmed:false,checkedRegions:1,completedAt:'2026-10-19T00:00:00Z',approval:{status:'approved',actor:'Codex',method:'full-source-visual-review',authorizedByUser:true,humanConfirmed:false,approvedAt:'2026-10-19T01:00:00Z',reportSha256:'a'.repeat(64),coverage:{pages:1,systems:1,measures:1,notes:1},unresolvedNoteIssues:[]}};await f.save();
 const source=await store.source(f.id);assert.equal(source.score.source.kind,'full-score-agent-approved');assert.notEqual(source.score.source.reviewRequired,true);assert.equal(source.review.humanConfirmed,false);assert.equal(source.reviewStatus,'model-reviewed');
 f.job.result.review.approval.coverage.measures=2;await f.save();assert.equal((await store.source(f.id)).score.source.reviewRequired,true);
});
