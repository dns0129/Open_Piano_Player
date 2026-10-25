import test from'node:test';import assert from'node:assert/strict';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';
import{generateDigitalRegion}from'../lib/digital-recognition.mjs';import{ACCIDENTAL_READING_INSTRUCTIONS,PIANO_SYSTEM_READING_INSTRUCTIONS}from'../lib/recognition-prompts.mjs';
const request={metadata:{title:'source',timeSignature:[4,4],keySignature:0},region:{id:'r',page:1,system:1,rect:{x:0,y:0,width:100,height:100},image:{mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P7sAAAAASUVORK5CYII='}}};
const raw={complete:true,meter:[4,4],key:0,bpm:90,bars:[4],notes:[[60,0,4,1],[48,0,4,-1]],rests:[],in:[],out:[],ties:[],graces:[],warnings:[]};
test('digital output pins high and retains the exact accidental rules without inventing image coordinates',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'digital-read-'));
 try{
  let context;
  const fake={getModel:()=>({id:'gpt-6.1-sol',input:['image']}),streamSimple:(m,c,o)=>{context=c;assert.equal(o.reasoning,'high');o.onPayload({model:m.id,reasoning:{effort:o.reasoning}});return{result:async()=>({content:[{type:'text',text:JSON.stringify(raw)}],stopReason:'stop',usage:{input:10,output:20,totalTokens:30}})};}};
  const r=await generateDigitalRegion(request,{modelsImpl:fake,authenticate:async()=>{},traceOptions:{path:join(dir,'usage.jsonl')}});
  assert.ok(context.systemPrompt.includes(ACCIDENTAL_READING_INSTRUCTIONS));assert.ok(context.systemPrompt.includes(PIANO_SYSTEM_READING_INSTRUCTIONS));assert.equal(r.score.notes.length,2);assert.equal(r.positionlessReview,true);assert.deepEqual(r.positions,[]);assert.equal(r.requestAudit[0].reasoningEffort,'high');
  fake.streamSimple=(m,c,o)=>{o.onPayload({model:m.id,reasoning:{effort:'high'}});return{result:async()=>({content:[{type:'text',text:'{"complete":false}'}],stopReason:'stop'})};};
  await assert.rejects(generateDigitalRegion(request,{modelsImpl:fake,authenticate:async()=>{},traceOptions:{path:join(dir,'usage.jsonl')}}),e=>e.code==='NEEDS_SOURCE');
 }finally{await rm(dir,{recursive:true,force:true});}
});
