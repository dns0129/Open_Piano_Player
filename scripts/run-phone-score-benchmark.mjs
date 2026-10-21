import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {generateDigitalRegion} from '../lib/digital-recognition.mjs';
import {publicError} from '../lib/auth.mjs';

// Images and raw model responses stay in ignored storage. No source MIDI is read.
const source=JSON.parse(await readFile('docs/phone-score-samples-20261021.json','utf8'));
const root=resolve(process.env.QINBAN_PHONE_RUN_DIR||'.local/phone-score-accuracy-20261021');
await mkdir(root,{recursive:true,mode:0o700});
const protocol=JSON.parse(await readFile(join(root,'protocol.json'),'utf8'));
if(protocol.model!=='gpt-6.1-sol'||protocol.reasoningEffort!=='high'||protocol.passes!==1)throw Error('Benchmark protocol mismatch');
const exists=p=>access(p).then(()=>true,()=>false);
const startedAt=new Date().toISOString();let cursor=0,paused=false,fastFailures=0;
const concurrency=Math.min(protocol.concurrency,Number(process.env.QINBAN_PHONE_CONCURRENCY)||protocol.concurrency);
const skip=new Set((process.env.QINBAN_PHONE_SKIP_IDS||'').split(',').filter(Boolean));
const priority=['p21_q1','p10_q1','p2_q1','p1_q1','p53_q1','p69_q1'];
const samples=[...source.samples].filter(s=>!skip.has(s.id)).sort((a,b)=>{const rank=id=>priority.includes(id)?priority.indexOf(id):100+source.samples.findIndex(s=>s.id===id);return rank(a.id)-rank(b.id)}).slice(0,Number(process.env.QINBAN_PHONE_MAX_SAMPLES)||24);
async function one(sample){
 const dir=join(root,sample.id);await mkdir(dir,{recursive:true,mode:0o700});
 if(await exists(join(dir,'run.json'))){console.log(JSON.stringify({id:sample.id,status:'saved-run-preserved'}));return;}
 const bytes=await readFile(sample.file);
 if(createHash('sha256').update(bytes).digest('hex')!==sample.sha256)throw Error('Input hash mismatch');
 const begin=new Date().toISOString(),clock=performance.now();let result,error=null;
 try{
  result=await generateDigitalRegion({jobId:'phone-score-20261021-'+sample.id,engine:'pi',pass:'read',metadata:{title:'盲测样本 '+sample.id},region:{id:sample.id,page:1,system:sample.first_complete_system,rect:{x:0,y:0,width:sample.width,height:sample.height},image:{mimeType:'image/jpeg',data:bytes.toString('base64')},context:`原生手机实拍照片。仅识别照片中完整的双谱表系统，共${sample.last_complete_system-sample.first_complete_system+1}行，对应源谱第${sample.first_complete_system}至${sample.last_complete_system}行。按从上到下顺序串联这些完整行，排除照片边缘被截断的相邻行；不要按曲名记忆，不使用任何参考MIDI。拍号、调号与速度以图中可读信息为准，无法确定时明确写入warnings。`}}, {traceOptions:{path:join(root,'usage.jsonl')},onParsed:async data=>writeFile(join(dir,'raw.json'),JSON.stringify(data,null,2),{mode:0o600})});
  await writeFile(join(dir,'result.json'),JSON.stringify(result,null,2),{mode:0o600});
 }catch(e){error={code:e.code||'BENCHMARK_FAILED',message:publicError(e)};if(['MODEL_RATE_LIMIT','PI_NOT_CONNECTED','MODEL_BALANCE_REQUIRED'].includes(error.code))paused=true;}
 const run={id:sample.id,inputSha256:sample.sha256,inputKind:'original-native-jpeg',scope:{firstCompleteSystem:sample.first_complete_system,lastCompleteSystem:sample.last_complete_system},model:protocol.model,reasoningEffort:protocol.reasoningEffort,startedAt:begin,endedAt:new Date().toISOString(),wallSeconds:(performance.now()-clock)/1000,status:error?'failed':'returned',notes:result?.score.notes.length??null,measures:result?.coverage.measureCount??null,usage:result?.usage??null,requestAudit:result?.requestAudit??null,independentReferenceScore:null,error};
 if(error&&run.wallSeconds<2&&run.usage===null&&++fastFailures>=3)paused=true;
 await writeFile(join(dir,'run.json'),JSON.stringify(run,null,2),{mode:0o600});
 console.log(JSON.stringify({id:run.id,status:run.status,notes:run.notes,wallSeconds:Math.round(run.wallSeconds),error:run.error?.code}));
}
await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<samples.length&&!paused){const sample=samples[cursor++];await one(sample);}}));
await writeFile(join(root,`batch-${process.pid}.json`),JSON.stringify({startedAt,endedAt:new Date().toISOString(),paused,totalSamples:samples.length,dispatchedThisRun:cursor,concurrency,protocol},null,2),{mode:0o600});
console.log(JSON.stringify({event:'batch-ended',paused,dispatched:cursor,total:samples.length}));
