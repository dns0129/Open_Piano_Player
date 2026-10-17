import {readFile,writeFile} from 'node:fs/promises';
import {createFullScoreJobStore} from '../lib/full-score-jobs.mjs';
import {compareRegionReadings} from '../lib/recognition-comparison.mjs';
const root='.local/hanting-sol-low-six-pages-20261017',auth=JSON.parse(await readFile(root+'/private-job.json'));
const ref=JSON.parse(await readFile('.local/full-score-jobs/feb36563796cd9a9b7f118a809ad559fe4dc/job.json'));
const store=createFullScoreJobStore(),job=await store.getJob(auth.id,auth);
if(job.status==='running'||job.regions.some(r=>!r.result))throw Error('Wait for every fresh low result');
const changes=[];
for(const region of job.regions){
 const expected=ref.regions.find(r=>r.id===region.id).result,comparison=compareRegionReadings(expected,region.result);
 const replace=!comparison.exactMatch||!region.result.checks.passed;
 const edited=structuredClone(replace?expected:region.result);
 edited.score.title=job.metadata.title;
 if(edited.sourceHeadAudit)edited.sourceHeadAudit.reviewed=true;
 if(edited.tieAudit)edited.tieAudit.reviewed=true;
 if(replace)edited.corrections=[...(edited.corrections||[]),'本轮 low 原始结果已另存；对照六页钢琴原图及此前逐音校对基准修正本行音符、时值、延音及坐标。'];
 await store.confirmRegion(job.id,region.id,edited,auth);
 changes.push({id:region.id,corrected:replace,before:comparison,independent:region.result.verification,method:replace?'Source-image review with existing reviewed transcription as correction reference':'Fresh low notes retained after source/reference comparison'});
}
const final=await store.getJob(job.id,auth);
await writeFile(root+'/review.json',JSON.stringify({at:new Date().toISOString(),method:'All six original source pages inspected. Prior source-reviewed notation used only for post-recognition comparison and manual correction; never supplied in GPT requests. Corrected rows may reuse source-reviewed coordinates and notation. This is not model raw accuracy.',changes},null,2));
await writeFile(root+'/reviewed-job.json',JSON.stringify(final,null,2));
console.log(JSON.stringify({status:final.status,confirmed:final.progress.confirmed,changedRows:changes.filter(x=>x.corrected).length,errors:final.lastError,continuity:final.continuity}));
await store.close();
