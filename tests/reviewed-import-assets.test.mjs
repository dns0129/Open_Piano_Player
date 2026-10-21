import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createUnifiedLibrary} from '../src/library.js';
import {createLibraryStore} from '../lib/library-store.mjs';

const bytes=Buffer.from('synthetic-original-score-image');
const score={version:1,id:'reviewed-import-fixture',title:'合成已审核乐谱',tempo:90,timeSignature:[4,4],keySignature:0,durationBeats:4,notes:[{id:'r',midi:60,beat:0,duration:4,hand:'right'},{id:'l',midi:48,beat:0,duration:4,hand:'left'}]};
function source(){return {reference:{id:score.id,durationBeats:score.durationBeats,keySignature:score.keySignature,timeSignature:score.timeSignature,notes:score.notes.map(note=>[note.id,note.beat,note.duration,note.midi,note.hand]).sort((a,b)=>a[0].localeCompare(b[0]))},notation:{version:1,coordinateSpace:'page',scoreId:score.id,systems:[{id:'row',assetId:'original',page:1,system:1,imageUrl:'blob:temporary-reviewed-image'}],notes:[{noteId:'r',page:1,system:1,x:20,y:20},{noteId:'l',page:1,system:1,x:20,y:60}]},assets:[{id:'original',page:1,system:1,blob:new Blob([bytes],{type:'image/png'})}],reviewStatus:{method:'human-confirmed'}};}
async function client(t,fetchImpl){
  const directory=await mkdtemp(join(tmpdir(),'qinban-reviewed-import-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const adapter=createLibraryStore({directory}),library=createUnifiedLibrary({adapter,metadata:{get:async()=>null,set:async()=>{}},migrateLegacy:false,storage:null,fetchImpl});
  await library.initialize();return {library,adapter};
}

test('reviewed import and later edits preserve original Blob bytes without fetching temporary URLs',async t=>{
  let calls=0;const {library,adapter}=await client(t,async()=>{calls++;throw new TypeError('Failed to fetch');});
  await library.save(score,{sourceRecord:source()});
  const stored=await adapter.get(score.id);assert.equal(stored.reviewStatus.method,'human-confirmed');
  assert.equal(stored.assets[0].data,bytes.toString('base64'));
  const reopened=await library.readSource(score);
  assert.ok(reopened.assets[0].blob instanceof Blob);assert.equal(await reopened.assets[0].blob.text(),bytes.toString());
  URL.revokeObjectURL(reopened.notation.systems[0].imageUrl);
  await library.save({...score,title:'修订后的合成乐谱'},{sourceRecord:reopened});
  const edited=await adapter.get(score.id);assert.equal(edited.revision,2);assert.equal(edited.assets[0].data,stored.assets[0].data);
  assert.equal(edited.history[0].assets[0].data,stored.assets[0].data);assert.equal(calls,0);
});

test('legacy source records can still read an HTTP image when no Blob was supplied',async t=>{
  let calls=0;const {library,adapter}=await client(t,async url=>{calls++;assert.equal(url,'https://source.example/score.png');return new Response(bytes,{headers:{'content-type':'image/png'}});});
  const record=source();delete record.assets;record.notation.systems[0].imageUrl='https://source.example/score.png';
  await library.save(score,{sourceRecord:record});assert.equal(calls,1);assert.equal((await adapter.get(score.id)).assets[0].data,bytes.toString('base64'));
});

test('an empty supplied image fails before saving or falling back to a temporary URL',async t=>{
  let calls=0;const {library}=await client(t,async()=>{calls++;throw new TypeError('Failed to fetch');});
  const record=source();record.assets[0].blob=new Blob([],{type:'image/png'});
  await assert.rejects(library.save(score,{sourceRecord:record}),/图片数据为空/u);
  assert.equal(calls,0);assert.equal(library.scores.length,0);
});

test('image transport failure explains recovery instead of exposing an opaque Failed to fetch',async t=>{
  const {library}=await client(t,async()=>{throw new TypeError('Failed to fetch');});
  const record=source();delete record.assets;
  await assert.rejects(library.save(score,{sourceRecord:record}),error=>error.code==='SOURCE_IMAGE_READ_FAILED'&&/原谱图片读取失败/u.test(error.message)&&!/Failed to fetch/.test(error.message));
  assert.equal(library.scores.length,0);
});
