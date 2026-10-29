import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root='.local/hanting-sol-low-six-pages-20261017';
const {createFullScoreJobStore}=await import(pathToFileURL(resolve(root,'runtime/lib/full-score-jobs.mjs')));
const auth=JSON.parse(await readFile(root+'/private-job.json')),store=createFullScoreJobStore();
await store.retryRegion(auth.id,'p6-s3',auth,{phase:'recognize'});
while(true){const job=await store.getJob(auth.id,auth);if(job.status!=='running'){await writeFile(root+'/after-retry-job.json',JSON.stringify(job,null,2));const r=job.regions.find(r=>r.id==='p6-s3');if(r.result)await writeFile(root+'/initial-results/p6-s3.json',JSON.stringify(r,null,2));console.log(JSON.stringify({status:job.status,rowStatus:r.status,error:r.error,calls:job.calls}));break;}await new Promise(r=>setTimeout(r,1000));}
await store.close();
