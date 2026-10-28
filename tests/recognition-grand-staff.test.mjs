import {withWrittenFixture} from './helpers/written-recognition-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {instructions,generateScoreRegion} from '../lib/ai.mjs';
import {createHostedRecognitionProvider} from '../lib/accounts/recognition-provider.mjs';

function assertSystemRules(prompt){
  assert.match(prompt,/两条五线谱.*同一个双手系统/u);
  assert.match(prompt,/两个双手系统.*不是四行/u);
  assert.match(prompt,/同一时间轴/u);
  assert.match(prompt,/灰度.*缺失/u);
  assert.match(prompt,/同为高音谱号.*缺手/u);
  assert.match(prompt,/具体.*页.*谱行.*谱表/u);
  assert.match(prompt,/不得将两手.*相加/u);
}
const image={mimeType:'image/png',data:Buffer.from([137,80,78,71,13,10,26,10,1]).toString('base64')};
const region={id:'fixture-row',page:1,system:1,rect:{x:0,y:0,width:600,height:400},image};
const compact={complete:true,meter:[4,4],key:0,bpm:90,bars:[4],notes:[[60,0,4,1,.3,.3,.7],[48,0,4,-1,.3,.7,.5]],rests:[],in:[],out:[],ties:[],graces:[],warnings:[]};

test('general image recognition defines grand staffs and simultaneous hands explicitly',()=>{
  assertSystemRules(instructions);
});

test('actual local region requests carry system grouping rules in recognition and reread passes',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'qinban-grand-staff-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  for(const pass of ['recognize','verify']){
    let calls=0;
    const result=await generateScoreRegion({engine:'deepseek',metadata:{title:'synthetic source'},region,pass},{deepseekApiKey:'synthetic-key',deepseekModel:'deepseek-flash'},{traceOptions:{path:join(directory,'trace.jsonl')},fetchImpl:async(_url,options)=>{
      calls++;const request=JSON.parse(options.body);assertSystemRules(request.messages[0].content);
      const data=structuredClone(compact);if(pass==='verify')data.notes=data.notes.map(note=>note.slice(0,4));
      return new Response(JSON.stringify({model:'deepseek-flash',choices:[{finish_reason:'tool_calls',message:{tool_calls:[{function:{name:'submit_score_region',arguments:JSON.stringify(withWrittenFixture(data))}}]}}]}));
    }});
    assert.equal(calls,1);assert.deepEqual(result.score.notes.map(note=>note.beat),[0,0]);
  }
});

test('hosted token quote and recognition use the same explicit two-hand system contract',async()=>{
  const payloads=[];
  const provider=createHostedRecognitionProvider({config:{key:'synthetic-key',baseUrl:'https://api.openai.com/v1',model:'gpt-6.1-sol',inputRate:1,outputRate:2,maxInputTokens:250000,maxOutputTokens:60000},fetchImpl:async(url,options)=>{
    const body=JSON.parse(options.body);payloads.push(body);assertSystemRules(body.instructions);
    return new Response(JSON.stringify(url.endsWith('input_tokens')?{input_tokens:100}:{status:'completed',model:'gpt-6.1-sol',reasoning:{effort:'high'},usage:{input_tokens:100,output_tokens:10},output:[]}));
  }});
  const request={metadata:{title:'synthetic source'},region},quote=await provider.quote(request);
  await provider.read(request,quote,{});assert.equal(payloads.length,2);
  assert.equal(payloads[0].instructions,payloads[1].instructions);
});
