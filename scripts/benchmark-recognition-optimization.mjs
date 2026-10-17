import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createFullScoreJobStore} from '../lib/full-score-jobs.mjs';
const root='.local/recognition-optimization-20261017';await mkdir(root,{recursive:true});
const sourceId='feb36563796cd9a9b7f118a809ad559fe4dc',source=JSON.parse(await readFile('.local/full-score-jobs/'+sourceId+'/job.json'));
const graceOnly=process.argv.includes('--graces'),label=graceOnly?'live-graces':'live';
const selected=graceOnly?['p4-s3','p4-s4']:['p1-s3','p4-s3','p4-s4','p6-s3'];
const regions=await Promise.all(source.regions.map(async r=>{const {id,page,system,rect,pageWidth,pageHeight,context,measureCount}=r;return {id,page,system,rect,pageWidth,pageHeight,context,measureCount,image:{mimeType:r.image.mimeType,data:(await readFile('.local/full-score-jobs/'+sourceId+'/'+id+'.image')).toString('base64')}};}));
const store=createFullScoreJobStore({directory:root+'/live-jobs',maxConcurrency:4}),auth={sessionId:'local-optimization-benchmark'};
try{
 const created=await store.createJob({title:source.metadata.title,totalPages:6,timeSignature:source.metadata.timeSignature,tempo:source.metadata.tempo,keySignature:source.metadata.keySignature,regions,verify:true},auth);
 await writeFile(root+'/'+label+'-job-id.txt',created.id);console.log(JSON.stringify({jobId:created.id,selected,startedAt:new Date().toISOString(),fresh:true,concurrency:4}));
 const started=performance.now();await store.startJob(created.id,{...auth,regionIds:selected,forceFresh:true});
 const job=await store.waitForIdle(created.id,auth);
 const result={jobId:job.id,selected,elapsedSeconds:(performance.now()-started)/1000,calls:job.calls,regions:job.regions.filter(r=>selected.includes(r.id)),endedAt:new Date().toISOString()};
 await writeFile(root+'/'+label+'-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify({elapsedSeconds:result.elapsedSeconds,calls:result.calls,rows:result.regions.map(r=>({id:r.id,status:r.status,notes:r.result?.score.notes.length,structural:r.result?.checks.passed,verification:r.result?.verification?.comparison?.exactMatch,error:r.error}))}));
}finally{await store.close();}
