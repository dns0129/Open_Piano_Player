import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root='.local/hanting-sol-low-six-pages-20261017';
const {createFullScoreJobStore}=await import(pathToFileURL(resolve(root,'runtime/lib/full-score-jobs.mjs')));
const source=JSON.parse(await readFile('.local/full-score-jobs/feb36563796cd9a9b7f118a809ad559fe4dc/job.json'));
const store=createFullScoreJobStore({maxConcurrency:4});
const regions=[];
for(const r of source.regions){const {id,page,system,rect,pageWidth,pageHeight,context}=r;regions.push({id,page,system,rect,pageWidth,pageHeight,context,image:{mimeType:r.image.mimeType,data:(await readFile('.local/full-score-jobs/'+source.id+'/'+id+'.image')).toString('base64')}});}
const startedAt=new Date().toISOString();
const created=await store.createJob({...source.metadata,title:'幻听 · GPT low 六页重识别',totalPages:6,regions,verify:true,needsUserScopeConfirmation:true,originalPdf:{mimeType:'application/pdf',name:'幻听-完整钢琴原谱.pdf',buffer:await readFile('output/pdf/幻听-完整钢琴原谱.pdf')}});
await writeFile(root+'/private-job.json',JSON.stringify({id:created.id,token:created.token}),{mode:0o600});
await writeFile(root+'/timing.json',JSON.stringify({startedAt,quotaUsedPercentBefore:73,forceFresh:true,plannedCalls:56,model:'gpt-6.1-sol',reasoningEffort:'low'}));
await mkdir(root+'/initial-results',{recursive:true});
await store.startJob(created.id,{token:created.token,forceFresh:true});
let last='',saved=new Set();
while(true){const job=await store.getJob(created.id,{token:created.token});for(const r of job.regions){if(r.result&&!saved.has(r.id)){await writeFile(root+'/initial-results/'+r.id+'.json',JSON.stringify(r,null,2));saved.add(r.id);}}
const progress=JSON.stringify(job.progress);if(progress!==last){console.log(progress);last=progress;}
if(job.status!=='running'){await writeFile(root+'/initial-job.json',JSON.stringify(job,null,2));await writeFile(root+'/timing.json',JSON.stringify({startedAt,recognitionEndedAt:new Date().toISOString(),quotaUsedPercentBefore:73,forceFresh:true,plannedCalls:56,model:'gpt-6.1-sol',reasoningEffort:'low'},null,2));break;}
await new Promise(r=>setTimeout(r,1000));}
await store.close();console.log('LOW_SIX_PAGES_FINISHED');
