import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createAppServer} from '../server.mjs';

test('full-document HTTP routes preserve session/CSRF boundaries and explicit retry/scope decisions',async t=>{
  const calls=[];
  const record=(method,result)=>(...args)=>{calls.push({method,args});return Promise.resolve(result);};
  const store={
    createJob:record('create',{id:'test-job',token:'private-test-token',snapshot:{status:'draft'}}),
    getJob:record('get',{id:'test-job',status:'needs-review'}),
    uploadDocument:record('pdf',{id:'test-job'}),uploadRegion:record('image',{id:'test-job'}),
    readDocument:record('read-pdf',{buffer:Buffer.from('%PDF-test'),mimeType:'application/pdf',name:'source.pdf'}),
    readRegionImage:record('read-image',{buffer:Buffer.from('png'),mimeType:'image/png'}),
    startJob:record('start',{status:'running'}),retryRegion:record('retry',{status:'running'}),retryRegions:record('retry-failed',{status:'running'}),
    cancelJob:record('cancel',{status:'cancelled'}),confirmRegion:record('review',{status:'needs-review'}),
    confirmJob:record('confirm',{status:'complete'}),close:record('close',undefined),
  };
  const server=createAppServer({fullScoreJobs:store,statusReader:async()=>({available:false}),settingsStore:{read:async()=>({})}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const url=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body,headers={})=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await post('/api/full-score-jobs',{})).status,403);
  assert.equal(calls.length,0);
  const response=await fetch(url+'/api/status'),cookie=response.headers.get('set-cookie').split(';')[0],status=await response.json();
  const headers={cookie,'x-csrf-token':status.csrfToken,'x-fullscore-token':'private-test-token',origin:url};
  assert.equal((await post('/api/full-score-jobs',{totalPages:3}, {cookie})).status,403);
  assert.equal((await post('/api/full-score-jobs',{totalPages:3},headers)).status,201);
  const created=calls.find(c=>c.method==='create');assert.equal(created.args[0].totalPages,3);assert.ok(created.args[1].sessionId);
  await post('/api/full-score-jobs/test-job/start',{engine:'pi',autoContinue:true,sessionId:'untrusted',token:'untrusted'},headers);
  const started=calls.find(c=>c.method==='start');assert.equal(started.args[1].token,'private-test-token');assert.notEqual(started.args[1].sessionId,'untrusted');assert.equal(started.args[1].autoContinue,true);
  await post('/api/full-score-jobs/test-job/retry/page-2-row-1',{engine:'pi',expectedVersion:3},headers);
  assert.deepEqual(calls.find(c=>c.method==='retry').args[3],{engine:'pi',expectedVersion:3});
  assert.equal((await post('/api/full-score-jobs/test-job/retry-failed',{engine:'deepseek',expectedVersion:4,regionIds:['row-2']},headers)).status,200);
  assert.deepEqual(calls.find(c=>c.method==='retry-failed').args[2],{engine:'deepseek',expectedVersion:4,regionIds:['row-2']});
  await post('/api/full-score-jobs/test-job/confirm',{scopeConfirmed:true},headers);
  assert.deepEqual(calls.find(c=>c.method==='confirm').args[2],{scopeConfirmed:true});
  const pdf=await fetch(url+'/api/full-score-jobs/test-job/document',{headers});assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.equal(await pdf.text(),'%PDF-test');
  const image=await fetch(url+'/api/full-score-jobs/test-job/region/page-2-row-1',{headers});assert.equal(image.headers.get('content-type'),'image/png');assert.equal(await image.text(),'png');
  const foreign=await post('/api/full-score-jobs/test-job/cancel',{}, {...headers,origin:'https://foreign.example'});assert.equal(foreign.status,403);assert.ok(!calls.some(c=>c.method==='cancel'));
});
