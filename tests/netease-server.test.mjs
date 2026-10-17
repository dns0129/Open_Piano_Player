import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createAppServer} from '../server.mjs';

test('NetEase HTTP flow enforces session, CSRF and session-scoped PDF/page reads',async t=>{
  const calls=[];const record=(name,value)=>(...args)=>{calls.push({name,args});return Promise.resolve(value);};
  const netease={status:record('status',{configured:false}),resolveShare:record('resolve',{kind:'sheet',sheetId:'1'}),preview:record('preview',{pagesFound:2}),startLogin:record('login',{id:'private-challenge',image:'fixture'}),pollLogin:record('poll',{state:'waiting'}),cancelLogin:record('cancel',{}),logout:record('logout',{}),image:record('image',{buffer:Buffer.from('png-fixture'),mimeType:'image/png'}),pdf:record('pdf',{buffer:Buffer.from('%PDF-fixture'),filename:'测试钢琴谱.pdf',source:{sheetId:'1',totalPages:2}}),close:()=>{}};
  const server=createAppServer({neteaseProvider:netease,fullScoreJobs:{close:async()=>{}},statusReader:async()=>({available:false}),settingsStore:{read:async()=>({})}});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});const base=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await post('/api/netease/login/start',{})).status,403);
  const initial=await fetch(base+'/api/status'),cookie=initial.headers.get('set-cookie').split(';')[0],status=await initial.json();const headers={cookie,'x-csrf-token':status.csrfToken,origin:base};
  assert.equal((await post('/api/netease/resolve',{share:'x'},{cookie})).status,403);
  assert.equal((await post('/api/netease/resolve',null,headers)).status,400);
  assert.equal((await post('/api/netease/resolve',{share:'x'},headers)).status,200);const scope=calls.find(call=>call.name==='resolve').args[1];assert.equal(typeof scope,'string');
  assert.equal((await post('/api/netease/preview',{sheetId:'1',sourceUrl:'source',scope:'forged'},headers)).status,200);assert.equal(calls.find(call=>call.name==='preview').args[2],scope);
  const pdf=await post('/api/netease/pdf',{id:'x',pianoConfirmed:true},headers);assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.equal(await pdf.text(),'%PDF-fixture');assert.equal(JSON.parse(decodeURIComponent(pdf.headers.get('x-score-source'))).totalPages,2);
  assert.equal(calls.find(call=>call.name==='pdf').args[2],scope);
  const page=await fetch(base+'/api/netease/imports/'+'a'.repeat(48)+'/pages/2',{headers:{cookie}});assert.equal(await page.text(),'png-fixture');assert.equal(calls.find(call=>call.name==='image').args[2],scope);
  assert.equal((await post('/api/netease/login/start',{},headers)).status,200);
  assert.equal((await post('/api/netease/logout',{}, {...headers,origin:'https://evil.example'})).status,403);
  assert.equal((await post('/api/netease/unknown',{},headers)).status,404);
});
