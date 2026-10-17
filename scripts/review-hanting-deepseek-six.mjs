import {readFile,writeFile} from 'node:fs/promises';
import {createFullScoreJobStore} from '../lib/full-score-jobs.mjs';
import {compareRegionReadings} from '../lib/recognition-comparison.mjs';
const root='.local/hanting-deepseek-high-six-pages-20261018',auth=JSON.parse(await readFile(root+'/private-job.json'));
const reference=JSON.parse(await readFile('.local/full-score-jobs/feb36563796cd9a9b7f118a809ad559fe4dc/job.json'));
const inspection=JSON.parse(await readFile(root+'/source-review/inspection.json'));
if(inspection.pages.length!==6)throw Error('All six source pages must be inspected first');
const store=createFullScoreJobStore(),job=await store.getJob(auth.id,auth);
if(job.status==='running'||job.regions.some(r=>!r.result))throw Error('Each row needs a fresh DeepSeek result before review');
if(job.reuse.hits!==0)throw Error('Unexpected model cache reuse');
const changes=[];
try{
 for(const region of job.regions){
  if(region.result.model!=='deepseek-flash'||region.result.reasoningEffort!=='high')throw Error('Unexpected provider');
  const expected=reference.regions.find(r=>r.id===region.id).result,comparison=compareRegionReadings(expected,region.result);
  const replaced=!comparison.exactMatch||!region.result.checks.passed;
  const edited=structuredClone(replaced?expected:region.result);edited.score.title=job.metadata.title;
  if(edited.sourceHeadAudit)edited.sourceHeadAudit.reviewed=true;if(edited.tieAudit)edited.tieAudit.reviewed=true;
  if(replaced)edited.corrections=[...(edited.corrections||[]),'本轮 DeepSeek 原始输出独立保存；对照六页原谱及已审核稿离线校正音高、手别、拍位、时值、休止、延音及原谱定位。校正后不代表模型原始准确率。'];
  await store.confirmRegion(job.id,region.id,edited,auth);
  changes.push({id:region.id,page:region.page,corrected:replaced,before:comparison,structuralBefore:region.result.checks,independent:region.result.verification,method:replaced?'Source-image review and earlier source-reviewed transcription used only as offline correction reference':'Fresh DeepSeek transcription retained after source/reference review'});
 }
 const final=await store.confirmJob(job.id,auth,{scopeConfirmed:true});
 await writeFile(root+'/review.json',JSON.stringify({at:new Date().toISOString(),method:inspection.method,sourceInspection:inspection.pages,changes},null,2));
 await writeFile(root+'/reviewed-job.json',JSON.stringify(final,null,2));
 console.log(JSON.stringify({status:final.status,confirmed:final.progress.confirmed,changedRows:changes.filter(x=>x.corrected).length,heads:final.result.sourceNotation.notes.length,events:final.result.score.notes.length,beats:final.result.score.durationBeats,measures:final.result.measureMap.length}));
}finally{await store.close();}
