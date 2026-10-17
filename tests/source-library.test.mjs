import test from 'node:test';
import assert from 'node:assert/strict';

let sequence=0;
async function mockStorage(t){
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');
  const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
  const allocated=[],revoked=[],records=new Map();let failNext=false;
  URL.createObjectURL=blob=>{assert.ok(blob instanceof Blob);const url=`blob:source-library-test-${++sequence}`;allocated.push(url);return url;};
  URL.revokeObjectURL=url=>revoked.push(url);
  const database={transaction(){
    const tx={objectStore(){return {
      put(record){return request('put',record.id,record);},
      get(id){return request('get',id);},
      delete(id){return request('delete',id);},
    };}};
    function request(operation,id,record){
      const req={},fail=failNext;failNext=false;
      queueMicrotask(()=>{
        if(fail){tx.onabort?.();return;}
        if(operation==='put')records.set(id,structuredClone(record));
        if(operation==='delete')records.delete(id);
        req.result=operation==='get'?structuredClone(records.get(id)):id;
        req.onsuccess?.();tx.oncomplete?.();
      });
      return req;
    }
    return tx;
  }};
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,writable:true,value:{open(){const request={result:database};queueMicrotask(()=>request.onsuccess?.());return request;}}});
  const module=await import(`../src/source-library.js?isolated-test=${++sequence}`);
  t.after(()=>{
    for(const id of records.keys())module.releasePracticeSource(id);
    URL.createObjectURL=create;URL.revokeObjectURL=revoke;
    if(descriptor)Object.defineProperty(globalThis,'indexedDB',descriptor);else delete globalThis.indexedDB;
  });
  return {module,allocated,revoked,records,failNext:()=>{failNext=true;}};
}

function input(){
  const score={version:1,id:'persisted-original',title:'原图与弱起',composer:'source',tempo:90,timeSignature:[3,8],keySignature:0,durationBeats:2,
    notes:[{id:'r',beat:0,duration:.5,midi:76,hand:'right'},{id:'l',beat:.5,duration:1.5,midi:48,hand:'left'}]};
  return {score,sourceNotation:{version:1,coordinateSpace:'page',scoreId:score.id,measureMap:[{measure:1,beat:0,duration:.5},{measure:2,beat:.5,duration:1.5}],systems:[{id:'row-1',assetId:'crop-1',page:1,system:1,rect:{x:10,y:20,width:200,height:100},startBeat:0,endBeat:2}],notes:score.notes.map((n,i)=>({noteId:n.id,beat:n.beat,duration:n.duration,midi:n.midi,hand:n.hand,page:1,system:1,x:40,y:40+i*40}))},assets:[{id:'crop-1',page:1,system:1,blob:new Blob(['source-image-bytes'],{type:'image/png'})}],reviewStatus:{reviewed:true}};
}

test('same-ID transaction abort preserves the displayed original URLs and allocates no replacement',async t=>{
  const mock=await mockStorage(t),data=input();const active=await mock.module.savePracticeSource(data),shown=active.notation.systems[0].imageUrl;
  assert.equal(mock.allocated.length,1);mock.failNext();await assert.rejects(mock.module.savePracticeSource(data),/保存失败/);
  assert.equal(mock.allocated.length,1,'failed commit must not allocate replacement URLs');assert.ok(!mock.revoked.includes(shown),'the current score must keep working after a failed save');assert.equal(mock.records.get(data.score.id).id,data.score.id);
});

test('save and restore preserve note IDs, Blob assets and actual pickup measure map',async t=>{
  const mock=await mockStorage(t),data=input();const saved=await mock.module.savePracticeSource(data),firstUrl=saved.notation.systems[0].imageUrl;
  const disk=mock.records.get(data.score.id);assert.equal(disk.notation.systems[0].imageUrl,'');assert.ok(disk.assets[0].blob instanceof Blob);assert.equal(await disk.assets[0].blob.text(),'source-image-bytes');
  const restored=await mock.module.loadPracticeSource(data.score);assert.ok(restored);assert.notEqual(restored.notation.systems[0].imageUrl,firstUrl);assert.ok(mock.revoked.includes(firstUrl));assert.deepEqual(restored.notation.measureMap,data.sourceNotation.measureMap);assert.deepEqual(restored.notation.notes.map(n=>n.noteId),['r','l']);assert.equal(restored.notation.systems[0].assetId,'crop-1');
});

test('reference permits practice speed/order changes but rejects changed pitches, IDs, hands and timeline',async t=>{
  const mock=await mockStorage(t),data=input();const saved=await mock.module.savePracticeSource(data),match=mock.module.sourceMatchesScore;
  assert.equal(match({...data.score,tempo:60,notes:[...data.score.notes].reverse()},saved),true);
  for(const [field,value]of [['midi',77],['id','other-id'],['hand','left'],['beat',.25],['duration',.25]]){const altered=structuredClone(data.score);altered.notes[0][field]=value;assert.equal(match(altered,saved),false,field);assert.equal(await mock.module.loadPracticeSource(altered),null);}
  for(const patch of [{id:'other-score'},{durationBeats:3},{keySignature:1},{timeSignature:[4,4]}])assert.equal(match({...data.score,...patch},saved),false);
  assert.equal(match({...data.score,notes:[data.score.notes[0]]},saved),false);
});

test('missing asset links are rejected before replacing the active saved source',async t=>{
  const mock=await mockStorage(t),data=input();const saved=await mock.module.savePracticeSource(data),shown=saved.notation.systems[0].imageUrl,broken=structuredClone(data);broken.sourceNotation.systems[0].assetId='missing';broken.assets[0].page=2;
  await assert.rejects(mock.module.savePracticeSource(broken),/图片缺失/);assert.equal(mock.allocated.length,1);assert.ok(!mock.revoked.includes(shown));
});
