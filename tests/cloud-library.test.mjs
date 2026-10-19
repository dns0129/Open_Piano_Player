import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {createCloudLibrary} from '../lib/cloud-library-admin.mjs';
import {validateCloudBundle,cloudEntry} from '../lib/cloud-library-format.mjs';
import {createDownloadLibrary} from '../lib/download-library.mjs';
import {createAppServer} from '../server.mjs';
const bundle=id=>validateCloudBundle({score:{id,title:'测试曲',tempo:90,timeSignature:[4,4],keySignature:0,notes:[{id:'n',midi:60,beat:0,duration:4,hand:'right'}]}});
function gateway(){
 const calls=[],index={version:1,scores:[cloudEntry(bundle('song-a')),cloudEntry(bundle('song-b'))]};
 return {calls,index,read:async(path,ref)=>{calls.push(['read',path,ref]);return structuredClone(path==='index.json'?index:bundle(path.split('/')[1].replace('.json','')));},request:async(path,options)=>{calls.push([path,options]);if(path==='git/ref/heads/main')return {object:{sha:'head'}};if(path==='git/commits/head')return {tree:{sha:'base-tree'}};if(path==='git/trees')return {sha:'new-tree'};if(path==='git/commits')return {sha:'new-commit'};return {};}};
}
test('cloud deletion updates index and package in one non-force commit and does not delete other scores',async()=>{
 const remote=gateway(),cloud=createCloudLibrary({gateway:remote});
 const result=await cloud.remove('song-a');assert.equal(result.commit,'new-commit');assert.equal(result.deployment,'pending');
 const tree=remote.calls.find(c=>c[0]==='git/trees')[1].body;
 assert.equal(tree.base_tree,'base-tree');assert.equal(tree.tree.length,2);
 const index=JSON.parse(tree.tree[0].content);assert.deepEqual(index.scores.map(s=>s.id),['song-b']);assert.deepEqual(index.deletedIds,['song-a']);
 assert.deepEqual(tree.tree[1],{path:'public/cloud-library/scores/song-a.json',mode:'100644',type:'blob',sha:null});
 assert.deepEqual(remote.calls.find(c=>c[0]==='git/refs/heads/main')[1].body,{sha:'new-commit',force:false});
 await assert.rejects(cloud.remove('../private'),{code:'INVALID_SCORE_ID'});
});
test('publishing a score removes its tombstone and concurrent remote updates are surfaced',async()=>{
 const remote=gateway();remote.index.deletedIds=['song-a'];const cloud=createCloudLibrary({gateway:remote});
 await cloud.publish(bundle('song-a'));const tree=remote.calls.find(c=>c[0]==='git/trees')[1].body.tree;
 assert.deepEqual(JSON.parse(tree[0].content).deletedIds,[]);assert.equal(JSON.parse(tree[1].content).score.id,'song-a');
 const original=remote.request;remote.request=async(path,options)=>{if(path==='git/refs/heads/main')throw new Error('non-fast-forward');return original(path,options);};
 await assert.rejects(cloud.remove('song-b'),/non-fast-forward/);
});
test('downloaded score and original images persist across stores; deletion removes the local package only',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'qinban-downloads-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const input={...bundle('song-a'),sourceNotation:{systems:[{id:'row',imageUrl:'https://ignored.example',page:1,system:1}],notes:[]},assets:[{id:'row',page:1,system:1,mimeType:'image/png',data:Buffer.from('image').toString('base64')}]};
 const store=createDownloadLibrary({directory});await store.save(input);
 const fresh=createDownloadLibrary({directory});assert.equal((await fresh.list()).scores.length,1);
 assert.equal((await fresh.source('song-a')).notation.systems[0].imageUrl,'/api/local-downloads/song-a/images/row');assert.equal((await fresh.image('song-a','row')).buffer.toString(),'image');
 await fresh.remove('song-a');assert.equal((await store.list()).scores.length,0);await assert.rejects(fresh.source('song-a'),{code:'LOCAL_SCORE_NOT_FOUND'});
 await assert.rejects(readFile(join(directory,'song-a.json')),{code:'ENOENT'});await assert.rejects(fresh.remove('../escape'));
 await fresh.save(input);assert.equal((await fresh.list()).scores.length,1);
});
test('cloud administration and local deletion require a same-origin session and CSRF',async t=>{
 const calls=[];const record=(method,result)=>(...args)=>{calls.push([method,...args]);return result;};
 const server=createAppServer({cloudLibrary:{list:record('list',{version:1,scores:[]}),download:record('download',bundle('song-a')),publish:record('publish',{commit:'commit'}),remove:record('remove',{deleted:true})},downloadLibrary:{save:record('save',{saved:true}),list:record('local-list',{scores:[]}),remove:record('local-delete',{deleted:true})},localLibrary:{remove:record('job-delete',{deleted:true})},fullScoreJobs:{close:async()=>{}},neteaseProvider:{close(){}},statusReader:async()=>({available:false}),settingsStore:{read:async()=>({})}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const base=`http://127.0.0.1:${server.address().port}`;const status=await fetch(base+'/api/status');const data=await status.json();const cookie=status.headers.get('set-cookie').split(';')[0];
 const post=(path,body={},headers={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',cookie,...headers},body:JSON.stringify(body)});
 assert.equal((await post('/api/cloud-library/song-a/delete')).status,403);assert.equal(calls.length,0);
 const headers={'x-csrf-token':data.csrfToken,origin:base};
 assert.equal((await post('/api/cloud-library/song-a/delete',{},headers)).status,200);assert.deepEqual(calls[0],['remove','song-a']);
 assert.equal((await post('/api/cloud-library',bundle('song-b'),headers)).status,200);
 assert.equal((await post('/api/local-downloads',bundle('song-b'),headers)).status,200);
 assert.equal((await post('/api/local-downloads/song-b/delete',{},headers)).status,200);
 assert.equal((await post('/api/local-library/job-id/delete',{},headers)).status,200);
 const del=await fetch(base+'/api/cloud-library/song-b',{method:'DELETE',headers:{cookie,...headers}});assert.equal(del.status,200);
 const forbidden=await fetch(base+'/api/cloud-library/song-b',{method:'DELETE',headers:{cookie}});assert.equal(forbidden.status,403);
 const count=calls.length;assert.equal((await post('/api/cloud-library/song-a/delete',{}, {...headers,origin:'https://untrusted.example'})).status,403);assert.equal(calls.length,count);
});
test('committed cloud download manifest covers packages and strips task secrets',async()=>{
 const root=new URL('../public/cloud-library/',import.meta.url),index=JSON.parse(await readFile(new URL('index.json',root),'utf8'));
 assert.ok(index.scores.length>0);
 for(const entry of index.scores){const text=await readFile(new URL(entry.file,root),'utf8'),b=validateCloudBundle(JSON.parse(text));assert.equal(b.score.id,entry.id);assert.ok(!text.includes('tokenHash'));assert.ok(!text.includes('ownerHash'));assert.ok(!text.includes('recognitionCheckpoint'));}
});
