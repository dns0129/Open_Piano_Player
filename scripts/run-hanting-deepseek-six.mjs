import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root='.local/hanting-deepseek-high-six-pages-20261018';
try{await access(root+'/private-job.json');throw Error('This run already exists; use its saved task rather than dispatching another paid run');}catch(error){if(error.code!=='ENOENT')throw error;}
const {createFullScoreJobStore}=await import(pathToFileURL(resolve(root,'runtime/lib/full-score-jobs.mjs')));
const {createSettingsStore}=await import(pathToFileURL(resolve(root,'runtime/lib/settings.mjs')));
const sourceRoot='.local/full-score-jobs/feb36563796cd9a9b7f118a809ad559fe4dc';
const source=JSON.parse(await readFile(sourceRoot+'/job.json'));
const settings=await createSettingsStore().read();
if(!settings.deepseekApiKey||settings.deepseekModel!=='deepseek-flash')throw Error('DeepSeek Flash configuration required');
const store=createFullScoreJobStore({maxConcurrency:4,settingsProvider:async()=>settings});
const regions=[];
for(const r of source.regions){const {id,page,system,rect,pageWidth,pageHeight,context}=r;regions.push({id,page,system,rect,pageWidth,pageHeight,context,image:{mimeType:r.image.mimeType,data:(await readFile(sourceRoot+'/'+id+'.image')).toString('base64')}});}
const startedAt=new Date().toISOString();
const created=await store.createJob({...source.metadata,title:'幻听 · DeepSeek high 六页重识别',engine:'deepseek',totalPages:6,regions,verify:true,needsUserScopeConfirmation:true,originalPdf:{mimeType:'application/pdf',name:'幻听-完整钢琴原谱.pdf',buffer:await readFile(sourceRoot+'/original.pdf')}});
await writeFile(root+'/private-job.json',JSON.stringify({id:created.id,token:created.token}),{mode:0o600});
const timing={startedAt,forceFresh:true,readOldRecognitionResults:false,plannedCalls:56,model:'deepseek-flash',reasoningEffort:'high',sourcePages:6,sourceRows:28};
await writeFile(root+'/timing.json',JSON.stringify(timing,null,2));
await mkdir(root+'/initial-results',{recursive:true});
console.log(JSON.stringify({startedAt,id:created.id,model:'deepseek-flash',reasoningEffort:'high',pages:6,rows:28,forceFresh:true}));
try{
 await store.startJob(created.id,{token:created.token,forceFresh:true});
 let last='',saved=new Set();
 while(true){const job=await store.getJob(created.id,{token:created.token});for(const r of job.regions)if(r.result&&!saved.has(r.id)){await writeFile(root+'/initial-results/'+r.id+'.json',JSON.stringify(r,null,2));saved.add(r.id);}
 const progress=JSON.stringify(job.progress);if(progress!==last){console.log(JSON.stringify({at:new Date().toISOString(),...job.progress}));last=progress;}
 await writeFile(root+'/progress.json',JSON.stringify({at:new Date().toISOString(),status:job.status,progress:job.progress,calls:job.calls,reuse:job.reuse}));
 if(job.status!=='running'){await writeFile(root+'/initial-job.json',JSON.stringify(job,null,2));await writeFile(root+'/timing.json',JSON.stringify({...timing,recognitionEndedAt:new Date().toISOString()},null,2));break;}
 await new Promise(r=>setTimeout(r,1000));}
}finally{await store.close();}
console.log('DEEPSEEK_SIX_PAGES_FINISHED');
