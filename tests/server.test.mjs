import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import http from 'node:http';
import {createAppServer} from '../server.mjs';
import {createSettingsStore} from '../lib/settings.mjs';
import {createScoreSearch} from '../lib/public-library.mjs';
import {generateScore} from '../lib/ai.mjs';

async function fixture(t,generate=async()=>({score:{title:'测试'}}),scoreSearch=createScoreSearch({searchEngine:async()=>({ok:true,engine:'fixture engine',results:[]})})){
  const dir=await mkdtemp(join(tmpdir(),'qinban-server-'));const dist=join(dir,'dist');await mkdir(dist);await writeFile(join(dist,'index.html'),'<h1>琴伴</h1>');
  await mkdir(join(dist,'pdfjs'));await writeFile(join(dist,'pdfjs/decoder.wasm'),Buffer.from([0,97,115,109,1,0,0,0]));
  await writeFile(join(dir,'private.json'),'secret');await symlink(join(dir,'private.json'),join(dist,'private.json'));
  const server=createAppServer({distDir:dist,settingsStore:createSettingsStore(join(dir,'.local/settings.json')),generate,statusReader:async()=>({available:true,model:'test-model',source:'测试登录'}),publicDownloader:async()=>({buffer:Buffer.from('mxl'),filename:'score.mxl'}),scoreSearch});
  server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});});
  const status=await fetch(url+'/api/status');const cookie=status.headers.get('set-cookie').split(';')[0];const data=await status.json();
  const headers={'content-type':'application/json','x-csrf-token':data.csrfToken,cookie,origin:url};
  return {url,headers,cookie,csrfToken:data.csrfToken,server};
}
test('local status establishes private session and API refuses foreign hosts and origins',async t=>{
  const {url,headers}=await fixture(t);
  const status=await fetch(url+'/api/status');assert.match(status.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  const data=await status.json();assert.equal(data.pi.available,true);assert.equal(data.deepseek.configured,false);assert.ok(!JSON.stringify(data).includes('ApiKey'));
  assert.equal(data.pi.model,'gpt-6.1-sol');assert.equal(data.pi.reasoningEffort,'high');assert.equal(data.pi.modelLocked,true);
  assert.equal(data.fullScore.localOmr,false);assert.equal(data.fullScore.engine,'pi');assert.equal(data.fullScore.pi.reasoningEffort,'high');assert.equal(data.fullScore.audiveris,undefined);
  const foreignHost=await new Promise((resolve,reject)=>{const req=http.get(url+'/api/status',{headers:{host:'attacker.example'}},response=>{response.resume();resolve(response.statusCode);});req.on('error',reject);});assert.equal(foreignHost,403);
  assert.equal((await fetch(url+'/api/status',{headers:{origin:'https://attacker.example'}})).status,403);
  assert.equal((await fetch(url+'/api/search?q=卡农')).status,403);
  assert.equal((await fetch(url+'/api/settings',{method:'POST',headers:{...headers,'x-csrf-token':'x'},body:'{}'})).status,403);
  assert.equal((await fetch(url+'/api/settings',{method:'POST',headers:{...headers,'x-csrf-token':'é'.repeat(64)},body:'{}'})).status,403);
});
test('session tokens cannot be reused across sessions and state writes do not return key',async t=>{
  const {url,headers}=await fixture(t);const second=await fetch(url+'/api/status');const secondCookie=second.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(url+'/api/settings',{method:'POST',headers:{...headers,cookie:secondCookie},body:'{}'})).status,403);
  const saved=await fetch(url+'/api/settings',{method:'POST',headers,body:JSON.stringify({deepseekApiKey:'private-test-api-key'})});const result=await saved.json();assert.equal(saved.status,200);assert.equal(result.deepseekConfigured,true);assert.ok(!JSON.stringify(result).includes('private-test-api-key'));
  const wrongType=await fetch(url+'/api/settings',{method:'POST',headers:{...headers,'content-type':'text/plain'},body:'{}'});assert.equal(wrongType.status,415);
});
test('static files stay within dist and cannot follow symlinks into private data',async t=>{
  const {url}=await fixture(t);assert.equal((await fetch(url)).status,200);
  for(const path of ['/server.mjs','/.local/settings.json','/private.json','/assets/not-present.js'])assert.equal((await fetch(url+path)).status,404);
});
test('public search and download require same local session',async t=>{
  const {url,headers}=await fixture(t);const response=await fetch(url+'/api/search?q=欢乐颂',{headers});const data=await response.json();assert.ok(data.results.length);
  const download=await fetch(url+'/api/public-score?path='+encodeURIComponent(data.results[0].path),{headers});assert.equal(await download.text(),'mxl');
});
test('PDF decoding assets have WebAssembly MIME and CSP permits compiled codecs and embedded fonts',async t=>{
  const {url}=await fixture(t);const response=await fetch(url+'/pdfjs/decoder.wasm');assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/wasm');
  assert.match(response.headers.get('content-security-policy'),/script-src 'self' 'wasm-unsafe-eval'/);assert.match(response.headers.get('content-security-policy'),/font-src 'self' data:/);
  assert.ok(await WebAssembly.compile(await response.arrayBuffer()));
});
test('HTTP generation rejects original composition and title-only guessing before model access',async t=>{
  const {url,headers}=await fixture(t,generateScore);
  for(const [mode,code,status]of [['compose','COMPOSE_DISABLED',400],['arrange','IMAGE_REQUIRED',422]]){
    const response=await fetch(url+'/api/generate',{method:'POST',headers,body:JSON.stringify({provider:'pi',title:'晴天',mode})});assert.equal(response.status,status);assert.equal((await response.json()).code,code);
  }
});
test('search result import returns actual bytes and format headers and rejects a different session',async t=>{
  const service=createScoreSearch({searchEngine:async()=>({ok:true,engine:'fixture',results:[{title:'晴天',url:'https://scores.example.org/sheet.pdf'}]}),fetcher:async url=>({url,headers:{'content-type':'application/pdf'},buffer:Buffer.from('%PDF-1.7\nfixture')})});
  const {url,headers}=await fixture(t,undefined,service);const report=await(await fetch(url+'/api/search?q=晴天',{headers})).json();const file=report.results[0];
  const response=await fetch(url+file.downloadUrl,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('x-score-format'),'pdf');assert.equal(decodeURIComponent(response.headers.get('x-score-filename')),'sheet.pdf');assert.match(await response.text(),/^%PDF-/);
  const other=await fetch(url+'/api/status');const cookie=other.headers.get('set-cookie').split(';')[0];assert.equal((await fetch(url+file.downloadUrl,{headers:{cookie}})).status,403);
});
test('generation is single-flight per session and disconnect cancels upstream',async t=>{
  let entered;const started=new Promise(resolve=>{entered=resolve;});let wasAborted=false;
  const {url,headers}=await fixture(t,async(_input,_settings,{signal})=>{entered();await new Promise(resolve=>signal.addEventListener('abort',()=>{wasAborted=true;resolve();},{once:true}));signal.throwIfAborted();});
  const controller=new AbortController();const first=fetch(url+'/api/generate',{method:'POST',headers,body:'{}',signal:controller.signal}).catch(()=>{});await started;
  const other=await fetch(url+'/api/generate',{method:'POST',headers,body:'{}'});assert.equal(other.status,429);
  controller.abort();await first;for(let i=0;i<20&&!wasAborted;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(wasAborted,true);
});
