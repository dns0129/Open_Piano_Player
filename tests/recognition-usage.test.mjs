import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {recognitionTrace} from '../lib/recognition-usage.mjs';

test('private ledger records actual requests, time and usage without source material or credentials',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'qinban-usage-')),path=join(dir,'usage.jsonl');
  try{
    const trace=recognitionTrace({jobId:'job',region:{id:'row',page:1,system:2,image:{data:'private-image'}},title:'private-title',token:'private-token'},{path});
    trace.observe({request:{model:'gpt-6.1-sol',reasoningEffort:'high',image:'private-image'}});
    trace.observe({usage:{input:10,output:20,totalTokens:30}});
    const event=await trace.finish('returned'),saved=await readFile(path,'utf8');
    assert.equal(event.actualRequests,1);assert.equal(event.usage.totalTokens,30);assert.ok(event.elapsedSeconds>=0);
    assert.equal(event.jobId,'job');assert.equal((await stat(path)).mode&0o777,0o600);
    for(const value of ['private-title','private-token','private-image'])assert.ok(!saved.includes(value));
    const failed=recognitionTrace({region:{id:'failed',page:2,system:1},pass:'verify'},{path});
    failed.observe({request:{model:'gpt-6.1-sol',reasoningEffort:'high'}});
    const failure=await failed.finish('failed');assert.equal(failure.actualRequests,1);assert.equal(failure.usageKnown,false);assert.equal(failure.usage,null);
    assert.equal((await readFile(path,'utf8')).trim().split('\n').length,2);
    const partial=recognitionTrace({region:{id:'repair',page:1,system:1}},{path});
    partial.observe({request:{model:'gpt-6.1-sol',reasoningEffort:'high'}});partial.observe({usage:{output:20}});
    partial.observe({request:{model:'gpt-6.1-sol',reasoningEffort:'high'}});
    const incomplete=await partial.finish('returned');assert.equal(incomplete.usageComplete,false);assert.equal(incomplete.reportedUsageCalls,1);
    assert.deepEqual(incomplete.usage,{output:20});assert.equal(incomplete.reportedFields.input,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
