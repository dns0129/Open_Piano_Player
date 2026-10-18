// Reuse agreeing answers from this fresh run, not previous recognition caches.
import{readFile,writeFile,readdir,rename}from'node:fs/promises';import{resolve,join}from'node:path';
import{chooseReadingAgreement}from'../lib/reading-consensus.mjs';
import{recognitionCacheKey}from'../lib/recognition-cache.mjs';
const root=resolve(process.argv[2]||'.local/batch-five-high-accidentals-v2');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const finishedOnly=process.argv.includes('--finished-only');
if(!finishedOnly)await read(join(root,'targeted-review','finished.json'));
const state=await read(join(root,'private-jobs.json')),files=await readdir(join(root,'raw-calls'));
const snapshots=await readdir(join(root,'targeted-review')),reports=[];
for(const task of state.jobs){
 if(finishedOnly){try{await read(join(root,'targeted-review',task.key+'-finished.json'));}catch{continue;}}
 const path=resolve('.local/full-score-jobs',task.id,'job.json'),job=await read(path);
 if(job.status==='running')throw Error('Cannot consolidate a live job');
 await writeFile(join(root,'targeted-review',task.key+'-before-consolidation-'+Date.now()+'.json'),JSON.stringify(job),{mode:0o600});
 let headerCutoff=0;
 for(const f of snapshots.filter(f=>f.startsWith(task.key+'-before-'))){
  const m=f.match(/-(\d{13})\.json$/);if(!m)continue;
  const before=await read(join(root,'targeted-review',f));
  if(!before.regions[0].headerIncluded)headerCutoff=Math.max(headerCutoff,Number(m[1]));
 }
 const changes=[],remaining=[];
 for(const region of job.regions){
  const z=region.result;
  if(z?.checks?.passed&&z.verification?.checks?.passed&&z.verification?.comparison?.exactMatch)continue;
  const candidates=[];
  for(const f of files.filter(f=>f.startsWith(task.id+'-'+region.id+'-'))){
   const c=await read(join(root,'raw-calls',f));
   if(region.page===1&&region.system===1&&Date.parse(c.startedAt)<headerCutoff)continue;
   candidates.push({...c,id:f});
  }
  const choice=chooseReadingAgreement(candidates,region,job.metadata,undefined,{allowDigital:true});
  if(!choice.resolved){remaining.push({id:region.id,counts:choice.counts,validReadings:choice.validReadings});continue;}
  const p=choice.primary,q=choice.independent;
  region.result={...p.normalized,engine:p.result.engine||'pi',model:p.result.model,reasoningEffort:p.result.reasoningEffort,promptVersion:p.result.promptVersion,requestAudit:p.result.requestAudit,usage:p.result.usage,wireFormat:p.result.wireFormat,
   verification:{comparison:choice.comparison,checks:q.normalized.checks,usage:q.result.usage,model:q.result.model,reasoningEffort:q.result.reasoningEffort,promptVersion:q.result.promptVersion,requestAudit:q.result.requestAudit},
   positionlessSource:!choice.sourcePositionsAvailable,
   reconciliation:{currentBatchOnly:true,agreeingInvocations:choice.counts[0],validReadings:choice.validReadings,sourceFiles:[p.id,q.id]},reviewStatus:'unreviewed'};
  region.recognitionCheckpoint={key:recognitionCacheKey(job.metadata,region,job.recognition),result:region.result};region.status='needs-review';region.error=null;
  changes.push({id:region.id,counts:choice.counts,sourceFiles:[p.id,q.id]});
 }
 job.status='needs-review';job.result=null;job.updatedAt=new Date().toISOString();job.runVersion++;
 const temp=path+'.consensus.tmp';await writeFile(temp,JSON.stringify(job),{mode:0o600});await rename(temp,path);
 reports.push({key:task.key,changes,remaining});
}
const report={at:new Date().toISOString(),reports};
await writeFile(join(root,'targeted-review','agreement-'+Date.now()+'.json'),JSON.stringify(report,null,2));
await writeFile(join(root,'agreement-consolidation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(reports.map(r=>({key:r.key,resolved:r.changes.length,remaining:r.remaining}))));
