import {withWrittenFixture} from './helpers/written-recognition-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readDeepseek} from '../lib/deepseek-vision.mjs';
import {generateScoreRegion} from '../lib/ai.mjs';
const settings={deepseekApiKey:'private-test-key',deepseekModel:'deepseek-flash'};
const image={mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P7sAAAAASUVORK5CYII='};
const compact={complete:true,meter:[4,4],key:0,bpm:90,bars:[4],notes:[[60,0,4,1,.3,.3,.7],[48,0,4,-1,.3,.7,.5]],rests:[],in:[],out:[],ties:[],graces:[],warnings:[]};
const response=args=>new Response(JSON.stringify({model:'deepseek-flash',choices:[{finish_reason:'tool_calls',message:{tool_calls:[{function:{name:'submit_score_region',arguments:JSON.stringify(withWrittenFixture(args))}}]}}],usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30}}));
const request={systemPrompt:'rules',text:'read source',images:[image],tools:[{name:'submit_score_region',parameters:{type:'object'}}]};
test('DeepSeek sends original pixels with fixed high effort, counts usage, and does not leak credentials',async()=>{
  const trace=[];let calls=0;
  const result=await readDeepseek(request,settings,{onTrace:e=>trace.push(e),fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');const body=JSON.parse(options.body);
    assert.equal(body.model,'deepseek-flash');assert.equal(body.reasoning_effort,'high');assert.equal(body.thinking.type,'enabled');
    assert.equal(body.messages[1].content[1].image_url.detail,'original');assert.ok(!options.body.includes(settings.deepseekApiKey));return response(compact);
  }});
  assert.equal(calls,1);assert.equal(result.engine,'deepseek');assert.equal(result.usage.totalTokens,30);assert.ok(!JSON.stringify({result,trace}).includes(settings.deepseekApiKey));
});
test('region recognize and independent reread share Pi decoding and never transmit the previous answer',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'deepseek-vision-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const region={id:'row',page:1,system:1,rect:{x:10,y:20,width:200,height:100},image};
  for(const pass of ['recognize','verify']){
    const result=await generateScoreRegion({engine:'deepseek',metadata:{title:'test'},region,pass,previousResult:'DO-NOT-SEND'},settings,{traceOptions:{path:join(directory,'usage.jsonl')},fetchImpl:async(_url,options)=>{
      assert.ok(!options.body.includes('DO-NOT-SEND'));const data=structuredClone(compact);if(pass==='verify')data.notes=data.notes.map(n=>n.slice(0,4));return response(data);
    }});
    assert.equal(result.score.notes.length,2);assert.equal(result.model,'deepseek-flash');assert.equal(result.positionlessReview,pass==='verify');
  }
});
test('missing keys, nonvision models, rate limits, cancellation and truncation stop without retries or partial results',async()=>{
  await assert.rejects(readDeepseek(request,{}),{code:'DEEPSEEK_KEY_REQUIRED'});
  await assert.rejects(readDeepseek(request,{...settings,deepseekModel:'deepseek-v4-pro'}),{code:'DEEPSEEK_IMAGE_MODEL_REQUIRED'});
  let calls=0;await assert.rejects(readDeepseek(request,settings,{fetchImpl:async()=>{calls++;return new Response('secret upstream',{status:429});}}),{code:'MODEL_RATE_LIMIT'});assert.equal(calls,1);
  await assert.rejects(readDeepseek(request,settings,{fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'length'}]}))}),{code:'INCOMPLETE_REGION'});
  const controller=new AbortController();controller.abort();await assert.rejects(readDeepseek(request,settings,{signal:controller.signal,fetchImpl:()=>assert.fail('aborted request transmitted')}));
});
test('DeepSeek schema converts Pi tuples to JSON Schema 2020-12 without losing fixed positions',async()=>{
 const {deepseekToolSchema}=await import('../lib/deepseek-vision.mjs');
 const source={type:'array',items:[{type:'integer'},{type:'string'}],minItems:2,maxItems:2};
 assert.deepEqual(deepseekToolSchema(source),{type:'array',prefixItems:[{type:'integer'},{type:'string'}],items:false,minItems:2,maxItems:2});assert.ok(Array.isArray(source.items));
});
