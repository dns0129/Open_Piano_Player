import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
const root='.local/hanting-page1-low-20261017',model=process.argv[2];
if(!['gpt-6.1-sol','gpt-5.6-luna'].includes(model))throw Error('Select requested benchmark model');
const runtime=resolve(root,'runtime',model,'lib');
const {generateScoreRegion}=await import(pathToFileURL(runtime+'/ai.mjs'));
const {validateRegionResult}=await import(pathToFileURL(runtime+'/full-score-jobs.mjs'));
const manifest=JSON.parse(await readFile(root+'/manifest.json')),enlarged=process.argv.includes('--enlarged-first'),label=model+(enlarged?'-2x':'');
if(enlarged)manifest.regions=manifest.regions.slice(0,1);
const runId='page1-low-'+label+'-'+randomUUID(),startedAt=new Date().toISOString(),started=performance.now(),results=[];
await mkdir(root+'/results/'+label,{recursive:true});
await writeFile(root+'/run-'+label+'.json',JSON.stringify({runId,model,reasoningEffort:'low',startedAt,resultCache:'bypassed',expectedRows:manifest.regions.length,plannedCalls:manifest.regions.length,enlarged},null,2));
let cursor=0;
await Promise.all(Array.from({length:2},async()=>{while(cursor<manifest.regions.length){
 const region=manifest.regions[cursor++],bytes=await readFile(enlarged?root+'/p1-s1-2x.png':'.local/full-score-jobs/'+manifest.sourceJobId+'/'+region.id+'.image');
 const rowStarted=performance.now(),rowStartedAt=new Date().toISOString();
 let entry;
 try{
   const raw=await generateScoreRegion({jobId:runId,metadata:manifest.metadata,region:{...region,image:{mimeType:'image/png',data:bytes.toString('base64')}},pass:'recognize'});
   const normalized=validateRegionResult(raw,region,manifest.metadata);
   entry={regionId:region.id,status:'returned',raw,normalized};
 }catch(error){entry={regionId:region.id,status:'failed',error:{code:error.code||'FAILED',message:error.expose||error.public?error.message:'本次识别未提交完整结果。'}};}
 entry={...entry,model,reasoningEffort:'low',sourceImageSha256:createHash('sha256').update(bytes).digest('hex'),startedAt:rowStartedAt,endedAt:new Date().toISOString(),elapsedSeconds:(performance.now()-rowStarted)/1000};
 await writeFile(root+'/results/'+label+'/'+region.id+'.json',JSON.stringify(entry,null,2));results.push(entry);
 console.log(JSON.stringify({model,row:region.id,status:entry.status,notes:entry.normalized?.score.notes.length,structural:entry.normalized?.checks.passed,elapsedSeconds:entry.elapsedSeconds,error:entry.error}));
}}));
const report={runId,model,reasoningEffort:'low',startedAt,endedAt:new Date().toISOString(),elapsedSeconds:(performance.now()-started)/1000,resultCache:'bypassed',passesPerRow:1,results:results.sort((a,b)=>a.regionId.localeCompare(b.regionId))};
await writeFile(root+'/result-'+label+'.json',JSON.stringify({...report,enlarged},null,2));
console.log(JSON.stringify({finished:true,model,elapsedSeconds:report.elapsedSeconds,returned:results.filter(r=>r.status==='returned').length,failed:results.filter(r=>r.status==='failed').length}));
