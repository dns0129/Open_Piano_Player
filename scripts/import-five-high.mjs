// Export this fresh batch only after every row and cross-row tie is checked.
import{readFile,writeFile,mkdir}from'node:fs/promises';
import{resolve,join}from'node:path';
import{createFullScoreJobStore}from'../lib/full-score-jobs.mjs';
import{addScore,verifyRepository}from'../lib/score-repository.mjs';
import{SCORE_RECOGNITION}from'../lib/recognition-policy.mjs';
import{FIVE_SCORES}from'./reread-five-high.mjs';
const root=resolve(process.argv[2]||'.local/batch-five-high-accidentals-v2');
const state=JSON.parse(await readFile(join(root,'private-jobs.json'),'utf8'));
if(state.promptVersion!==SCORE_RECOGNITION.promptVersion)throw Error('Wrong prompt version');
await readFile(join(root,'targeted-review','finished.json'),'utf8');
const store=createFullScoreJobStore();const items=[];
try{
 for(const task of state.jobs){
  const persisted=JSON.parse(await readFile(resolve('.local/full-score-jobs',task.id,'job.json'),'utf8'));
  if(persisted.status==='running')throw Error(task.key+' still running; import did not touch it');
  const job=await store.getJob(task.id,{token:task.token});
  if(job.status==='running')throw Error(task.key+' still running');
  const bad=job.regions.filter(r=>!r.result?.checks?.passed||!r.result.verification?.checks?.passed||!r.result.verification?.comparison?.exactMatch||r.result.model!==SCORE_RECOGNITION.model||r.result.reasoningEffort!=='high'||r.result.promptVersion!==SCORE_RECOGNITION.promptVersion);
  if(bad.length)throw Error(task.key+' has unresolved rows: '+bad.map(r=>r.id).join(','));
  const exported=await store.exportDraft(task.id,{token:task.token},{scopeConfirmed:true});
  const result=exported.result;
  if(!result.checks.passed||!result.scope.completeDocument)throw Error(task.key+' failed cross-row coverage/ties');
  const definition=FIVE_SCORES.find(s=>s.key===task.key);
  const score={...result.score,id:'reread-gpt61-high-v2-'+task.key,title:definition.title+' · GPT‑6.1 high 新策略',source:{...result.score.source,reviewRequired:true,label:'升降号增强版 · 全页复读及原图疑点校核完成 · AI待人工复核'}};
  const sourceCorrections=job.regions.filter(r=>r.result.sourceCorrections?.length).map(r=>({regionId:r.id,page:r.page,system:r.system,corrections:r.result.sourceCorrections}));
  const output={score,scope:result.scope,coverage:result.coverage,checks:result.checks,sourceCorrections,warnings:result.warnings,reviewStatus:'ai-checked-not-human-reviewed',promptVersion:SCORE_RECOGNITION.promptVersion};
  await writeFile(join(root,task.key+'-score.json'),JSON.stringify(output,null,2)+'\n',{mode:0o600});
  items.push({key:task.key,score,pages:job.totalPages,rows:job.regions.length});
 }
 for(const item of items)await addScore(item.score,{description:`${SCORE_RECOGNITION.promptVersion} · ${item.pages}页${item.rows}行完整新识别 · 复读与原图疑点校核完成，待人工逐音复核`});
 const checked=await verifyRepository();if(!checked.ok)throw Error(checked.problems.join(';'));
 await writeFile(join(root,'imported.json'),JSON.stringify({at:new Date().toISOString(),policy:SCORE_RECOGNITION,items:items.map(({score,...rest})=>({...rest,id:score.id,notes:score.notes.length,measures:score.measureMap?.length})),libraryCount:checked.count},null,2));
 console.log(JSON.stringify({imported:items.length,libraryCount:checked.count}));
}finally{await store.close();}
