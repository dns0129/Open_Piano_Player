import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const root='.local/hanting-deepseek-high-six-pages-20261018';
const {createFullScoreJobStore}=await import(pathToFileURL(resolve(root,'runtime/lib/full-score-jobs.mjs')));
const {createSettingsStore}=await import(pathToFileURL(resolve(root,'runtime/lib/settings.mjs')));
const auth=JSON.parse(await readFile(root+'/private-job.json')),settings=await createSettingsStore().read();
const store=createFullScoreJobStore({settingsProvider:async()=>settings,maxConcurrency:4});
let job=await store.getJob(auth.id,auth);if(job.status==='running')throw Error('Initial run still active');
const failed=job.regions.filter(r=>!r.result),verificationFailed=job.regions.filter(r=>r.result?.verification?.error);
const retryLog=[];
try{
 // Prepare all enlarged failed sources, then retry them in the existing global gate.
 for(const row of failed)await store.uploadRegion(auth.id,row.id,{image:{mimeType:'image/png',data:(await readFile(root+'/enlarged-source/'+row.id+'.png')).toString('base64')}},auth);
 if(failed.length){
   await store.startJob(auth.id,{...auth,regionIds:failed.map(r=>r.id),forceFresh:true});
   job=await store.waitForIdle(auth.id,auth);
   for(const row of job.regions.filter(r=>failed.some(f=>f.id===r.id))){await writeFile(root+'/initial-results/'+row.id+'.json',JSON.stringify(row,null,2));retryLog.push({id:row.id,phase:'recognize',source:'2x display-enlarged original pixels',status:row.status,error:row.error});}
 }
 for(const row of verificationFailed){await store.retryRegion(auth.id,row.id,auth,{phase:'verify',engine:'deepseek'});job=await store.waitForIdle(auth.id,auth);const current=job.regions.find(r=>r.id===row.id);await writeFile(root+'/initial-results/'+row.id+'.json',JSON.stringify(current,null,2));retryLog.push({id:row.id,phase:'verify',status:current.status,error:current.result?.verification?.error});}
 job=await store.getJob(auth.id,auth);await writeFile(root+'/after-retry-job.json',JSON.stringify(job,null,2));await writeFile(root+'/retries.json',JSON.stringify({at:new Date().toISOString(),retryLog},null,2));console.log(JSON.stringify({progress:job.progress,retries:retryLog}));
}finally{await store.close();}
