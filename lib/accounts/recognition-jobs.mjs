import {recognitionIssues,MAX_RECOGNITION_CALLS} from '../recognition-submission.mjs';
import {fail,id,uuid,missing,iso} from './common.mjs';
import {createRecognitionBudget,integer} from './recognition-budget.mjs';
import {BILLING_VERSION,POINTS_PER_REGION} from './subscription-catalog.mjs';
import {decodeHostedRegion} from './recognition-provider.mjs';
import {assembleJob} from '../score-region.mjs';
import {readScoreDocument} from '../score-document.ts';

const terminal=state=>!['queued','running','cancelling'].includes(state);
const safeCode=e=>e?.name==='TimeoutError'?'PROVIDER_TIMEOUT':e?.name==='AbortError'?'JOB_CANCELLED':typeof e?.code==='string'&&/^[A-Z_]+$/.test(e.code)?e.code:'RECOGNITION_FAILED';
export function normalizeHostedManifest(input,group){
 if(!input||input.scopeConfirmed!==true)throw fail('SCOPE_CONFIRMATION','请确认选区包含要识别的完整双谱表行。');
 if(typeof input.title!=='string'||!input.title.trim()||input.title.length>100)throw fail('INVALID_TITLE','请填写 1–100 字的曲名。');
 integer(input.fallbackTempo,20,240,'INVALID_TEMPO');
 if(!['images','pdf'].includes(group.kind)||!Array.isArray(input.regions)||input.regions.length<1||input.regions.length>30)throw fail('INVALID_REGIONS','请选择 1–30 条完整谱行。');
 const systems=new Map(),seen=new Set();let previousPage=0;
 const regions=input.regions.map((r,i)=>{if(!Number.isInteger(r.page)||!group.pages.some(p=>p.ordinal===r.page)||r.page<previousPage)throw fail('PAGE_ORDER','谱行须按原谱页序排列。');previousPage=r.page;const b=r.rect;
  if(!b||!['x','y','width','height'].every(k=>Number.isFinite(b[k]))||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>1.000001||b.y+b.height>1.000001)throw fail('INVALID_REGION','谱行选区超出原图。');
  const fingerprint=r.page+':'+[b.x,b.y,b.width,b.height].map(v=>v.toFixed(6)).join(':');if(seen.has(fingerprint))throw fail('DUPLICATE_REGION','相同谱行选区不能重复提交。');seen.add(fingerprint);
  const system=(systems.get(r.page)||0)+1;systems.set(r.page,system);return {id:'region-'+(i+1),page:r.page,system,rect:{x:b.x,y:b.y,width:b.width,height:b.height}};
 });
 return {title:input.title.trim(),fallbackTempo:input.fallbackTempo,sourceGroupId:group.sourceGroupId,totalPages:group.pages.length,scope:'user-selected-regions',scopeConfirmed:true,allPagesIncluded:group.pages.every(p=>regions.some(r=>r.page===p.ordinal)),regions};
}

export function createHostedRecognition({db,identity,library,sources,provider,billing,now=()=>Date.now()}){
 const budget=createRecognitionBudget({db,now,provider,billing}),date=()=>new Date(now()).toISOString(),workers=new Map(),workerId=id();let timer,stopped=true,pumping=false;
 async function stored(tx,owner,jid){if(!uuid(jid))throw missing();const j=(await tx.query('SELECT * FROM qinban_private.recognition_jobs WHERE owner_id=$1 AND id=$2',[owner,jid])).rows[0];if(!j)throw missing();const regions=(await tx.query('SELECT * FROM qinban_private.recognition_regions WHERE owner_id=$1 AND job_id=$2 ORDER BY ordinal',[owner,jid])).rows;return {...j,regions}}
 function assembled(j){
  if(!j.regions.every(r=>r.state==='complete'&&r.result?.checks?.passed))return null;
  const manifest=j.manifest,result=assembleJob({id:j.id,totalPages:manifest.totalPages,excludedPages:[],metadata:{title:manifest.title,source:{kind:'hosted-recognition-ai-draft',label:'用户选定原谱范围'}},regions:j.regions.map((r,i)=>({...manifest.regions[i],rect:r.result.sourceRect,result:r.result,status:'needs-review'}))},{draft:true});
  // A complete list of selected rows does not establish complete-document coverage.
  if(result.score)result.score.source={...result.score.source,kind:'hosted-selected-regions-ai-draft',label:'用户选定谱行 · AI 草稿待校对'};
  if(result.scope)result.scope={...result.scope,completeDocument:false,selection:'user-selected-regions'};
  return result;
 }
 function view(j){let output;try{output=assembled(j)}catch{}return {jobId:j.id,title:j.manifest.title,state:j.state,sourceGroupId:j.source_group_id,scope:j.manifest.scope,allPagesIncluded:j.manifest.allPagesIncluded,savedEntryId:j.result_entry_id||null,canSave:!!output?.checks.passed,createdAt:iso(j.created_at),updatedAt:iso(j.updated_at),progress:{total:j.regions.length,complete:j.regions.filter(r=>r.state==='complete').length},regions:j.regions.map((r,i)=>({id:r.region_id,page:j.manifest.regions[i].page,system:j.manifest.regions[i].system,state:r.state,notes:r.result?.score?.notes?.length||0,measures:r.result?.coverage?.measureCount||0,errorCode:r.error_code||null,warnings:r.result?.warnings||[],issues:r.result?.checks?.errors||[],cropResourceId:r.crop_resource_id||null})),issues:output?.checks.errors||[]};}
 async function add(owner,input,key,parent){
  const group=await library.readGroup(owner,input.sourceGroupId),manifest=normalizeHostedManifest(input,group);
  const billable=manifest.regions.filter((_r,i)=>!(parent?.regions[i]?.state==='complete'&&parent.regions[i].result?.checks.passed)).map(r=>r.id);
  if(billing&&(input.pointQuote?.version!==BILLING_VERSION||input.pointQuote?.points!==billable.length*POINTS_PER_REGION))throw fail('POINT_QUOTE_REQUIRED','请核对识别积分并确认后开始。',409);
  const result=await library.mutation(owner,'recognition-create',key,input,async tx=>{
   if(!(await tx.query('SELECT id FROM qinban_private.source_groups WHERE owner_id=$1 AND id=$2',[owner,group.sourceGroupId])).rows.length)throw missing();
   const jid=id();await budget.admit(tx,owner,jid,billable);
   await tx.query("INSERT INTO qinban_private.recognition_jobs(id,owner_id,source_group_id,manifest,state,created_at,updated_at) VALUES($1,$2,$3,$4,'queued',$5,$5)",[jid,owner,group.sourceGroupId,JSON.stringify(manifest),date()]);
   for(const [i,r]of manifest.regions.entries()){
    const previous=parent?.regions[i],reuse=previous?.state==='complete'&&previous.result?.checks.passed;
    await tx.query('INSERT INTO qinban_private.recognition_regions(owner_id,job_id,region_id,ordinal,state,result,crop_resource_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[owner,jid,r.id,i,reuse?'complete':'pending',reuse?JSON.stringify(previous.result):null,reuse?previous.crop_resource_id:null]);
    if(reuse&&previous.crop_resource_id)await tx.query('INSERT INTO qinban_private.job_resources VALUES($1,$2,$3)',[owner,jid,previous.crop_resource_id]);
   }return {jobId:jid,state:'queued'};
  });wake();return result;
 }
 async function finish(owner,jid,{errorCode,cancelled=false}={}){
  await db.private(owner,async tx=>{await budget.lock(tx);const index=(await tx.query('SELECT * FROM qinban_control.job_index WHERE id=$1 AND owner_id=$2 FOR UPDATE',[jid,owner])).rows[0];if(!index||index.worker_id!==workerId)return;let j;try{j=await stored(tx,owner,jid)}catch{return;}
   const all=j.regions.every(r=>r.state==='complete'&&r.result?.checks?.passed),some=j.regions.some(r=>r.state==='complete');const state=cancelled||index.cancel_requested?'cancelled':all?'needs_review':some?'partial':'failed';
   await tx.query("UPDATE qinban_private.recognition_regions SET state='not_started',error_code=$1 WHERE owner_id=$2 AND job_id=$3 AND state IN ('pending','preparing')",[errorCode||null,owner,jid]);
   await tx.query('UPDATE qinban_private.recognition_jobs SET state=$1,updated_at=$2 WHERE owner_id=$3 AND id=$4',[state,date(),owner,jid]);await tx.query('UPDATE qinban_control.job_index SET state=$1,lease_until=NULL,worker_id=NULL,error_code=$2,updated_at=$3 WHERE id=$4',[state,errorCode||null,date(),jid]);await budget.releaseUnused(tx,jid);
  });
 }
 async function claim(){return db.control(async tx=>{const p=await budget.lock(tx);if(stopped||!provider.ready||!p.enabled||p.paused_reason)return null;
  const n=Number((await tx.query("SELECT COUNT(*) AS n FROM qinban_control.job_index WHERE state='running' AND lease_until>$1",[date()])).rows[0].n);if(n>=p.max_active)return null;
  const job=(await tx.query("SELECT * FROM qinban_control.job_index WHERE state='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];if(!job)return null;
  await tx.query("UPDATE qinban_control.job_index SET state='running',worker_id=$1,lease_until=$2,updated_at=$3 WHERE id=$4",[workerId,new Date(now()+120000).toISOString(),date(),job.id]);return job;
 })}
 async function run(index,controller){
  const owner=index.owner_id,jid=index.id;let errorCode;
  const beat=setInterval(()=>void db.control(tx=>tx.query("UPDATE qinban_control.job_index SET lease_until=$1 WHERE id=$2 AND worker_id=$3 AND state='running' RETURNING cancel_requested",[new Date(now()+120000).toISOString(),jid,workerId])).then(r=>{if(!r.rows.length||r.rows[0].cancel_requested)controller.abort()}).catch(()=>controller.abort()),20000);beat.unref();
  try{
   const j=await db.private(owner,tx=>stored(tx,owner,jid));await db.private(owner,tx=>tx.query("UPDATE qinban_private.recognition_jobs SET state='running',updated_at=$1 WHERE owner_id=$2 AND id=$3",[date(),owner,jid]));
   for(const [i,row]of j.regions.entries()){
    if(row.state==='complete')continue;controller.signal.throwIfAborted();if(await identity.accountState(owner)!=='active')throw fail('ACCOUNT_DISABLED','账号已暂停，任务已停止。');
    const active=(await db.control(tx=>tx.query('SELECT cancel_requested,state FROM qinban_control.job_index WHERE id=$1',[jid]))).rows[0];if(active?.cancel_requested||active?.state!=='running')throw fail('JOB_CANCELLED','任务已停止。');
    const policy=(await db.control(tx=>tx.query('SELECT enabled,paused_reason FROM qinban_control.settings WHERE id=1'))).rows[0];if(!policy.enabled||policy.paused_reason)throw fail('RECOGNITION_UNAVAILABLE','识谱服务已暂停，任务已保留。');
    const region=j.manifest.regions[i];let aid,response;
    try{
     await db.private(owner,tx=>tx.query("UPDATE qinban_private.recognition_regions SET state='preparing' WHERE owner_id=$1 AND job_id=$2 AND region_id=$3",[owner,jid,row.region_id]));
     const crop=await sources.crop(owner,j.source_group_id,region),key='crop:'+jid+':'+row.region_id;
     const upload=await library.stage(owner,{name:'page-'+region.page+'-system-'+region.system+'.png',mimeType:'image/png',bytes:crop.bytes.length,sha256:crop.sha256,purpose:'source'},key+':stage');await library.receive(owner,upload.uploadId,crop.bytes);const resource=await library.complete(owner,upload.uploadId,{sha256:crop.sha256},key+':complete');
     await db.private(owner,async tx=>{await tx.query('INSERT INTO qinban_private.job_resources VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[owner,jid,resource.resourceId]);await tx.query('UPDATE qinban_private.recognition_regions SET crop_resource_id=$1 WHERE owner_id=$2 AND job_id=$3 AND region_id=$4',[resource.resourceId,owner,jid,row.region_id]);});
     const request={metadata:{title:j.manifest.title,fallbackTempo:j.manifest.fallbackTempo},region:{...region,rect:crop.rect,image:{mimeType:'image/png',data:crop.bytes.toString('base64')}}};
     const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(600000)]);
     const submissionAudit=[...(row.result?.submissionAudit||[])];
     let result;
     for(let attempt=0;attempt<MAX_RECOGNITION_CALLS;attempt++){
       const quote=await provider.quote(request,{signal});controller.signal.throwIfAborted();
       aid=await db.private(owner,async tx=>{const value=await budget.reserve(tx,owner,jid,row.region_id,quote,workerId);await tx.query("UPDATE qinban_private.recognition_regions SET state='calling' WHERE owner_id=$1 AND job_id=$2 AND region_id=$3",[owner,jid,row.region_id]);return value;});
       response=null;
       try{response=await provider.read(request,quote,{signal});await budget.settle(aid,{usage:response.usage,observation:response.protocolVerified===false?response.observation:null});}catch(e){await budget.settle(aid,{knownNotStarted:e.knownNotStarted===true});throw e;}
       let invalid;
       try{result={...decodeHostedRegion(response,request),sourceRect:crop.rect};}
       catch(e){invalid=e;}
       const issues=invalid?recognitionIssues(invalid):result.checks.errors;
       submissionAudit.push({attemptId:aid,stage:attempt?'repair':'first',recordedAt:date(),rawText:response.text,issues,accepted:!!result?.checks.passed,usage:response.usage??null});
       await db.private(owner,tx=>tx.query('UPDATE qinban_private.recognition_regions SET result=$1 WHERE owner_id=$2 AND job_id=$3 AND region_id=$4',[JSON.stringify({...result,submissionAudit}),owner,jid,row.region_id]));
       if(!issues.length)break;
       const repairable=!invalid||['INVALID_COMPACT_REGION','INVALID_RECOGNITION_RESULT'].includes(invalid.code);
       if(!repairable||!response.usage||attempt+1>=MAX_RECOGNITION_CALLS){if(invalid)throw invalid;break;}
       request.repair={previous:response.text,issues};
     }
     result={...result,submissionAudit};
     await db.private(owner,tx=>tx.query('UPDATE qinban_private.recognition_regions SET state=$1,result=$2,error_code=NULL WHERE owner_id=$3 AND job_id=$4 AND region_id=$5',[result.checks.passed?'complete':'needs_correction',JSON.stringify(result),owner,jid,row.region_id]));
     if(!response.usage){errorCode='USAGE_UNKNOWN';break;}
    }catch(e){const code=safeCode(e);errorCode=code;await db.private(owner,tx=>tx.query('UPDATE qinban_private.recognition_regions SET state=$1,error_code=$2 WHERE owner_id=$3 AND job_id=$4 AND region_id=$5',[aid&&!response?'uncertain':'failed',code,owner,jid,row.region_id]));
     if(['PROVIDER_AUTH','PROVIDER_RATE_LIMIT','PROVIDER_PROTOCOL_MISMATCH'].includes(code))await budget.pause(code);
     if(controller.signal.aborted||['GLOBAL_BUDGET','RECOGNITION_UNAVAILABLE','PROVIDER_AUTH','PROVIDER_RATE_LIMIT','PROVIDER_PROTOCOL_MISMATCH','JOB_CANCELLED'].includes(code)||aid&&!response)break;
    }
   }
  }catch(e){errorCode=safeCode(e)}finally{clearInterval(beat);await finish(owner,jid,{errorCode,cancelled:controller.signal.aborted});}
 }
 async function recover(){
  const stale=(await db.control(tx=>tx.query("SELECT * FROM qinban_control.job_index WHERE state='running' AND lease_until<$1",[date()]))).rows;
  for(const job of stale){const changed=await db.private(job.owner_id,async tx=>{await budget.lock(tx);const claimed=(await tx.query("UPDATE qinban_control.job_index SET state='interrupted',worker_id=NULL,lease_until=NULL,error_code='WORKER_INTERRUPTED',updated_at=$1 WHERE id=$2 AND state='running' AND lease_until<$1 RETURNING id",[date(),job.id])).rows[0];if(!claimed)return false;
    const unknown=(await tx.query("UPDATE qinban_control.attempts SET state='unknown' WHERE job_id=$1 AND state='reserved' RETURNING id",[job.id])).rows;if(unknown.length)await tx.query("UPDATE qinban_control.settings SET paused_reason='USAGE_UNKNOWN',revision=revision+1 WHERE id=1");
    await tx.query("UPDATE qinban_private.recognition_jobs SET state='interrupted',updated_at=$1 WHERE owner_id=$2 AND id=$3",[date(),job.owner_id,job.id]);await tx.query("UPDATE qinban_private.recognition_regions SET state='uncertain',error_code='WORKER_INTERRUPTED' WHERE owner_id=$1 AND job_id=$2 AND state='calling'",[job.owner_id,job.id]);await budget.releaseUnused(tx,job.id);return true;
   });if(changed)workers.get(job.id)?.controller.abort();
  }
 }
 const wake=()=>{void pump().catch(()=>budget.pause('WORKER_ERROR')).catch(()=>{})};
 async function pump(){if(stopped||pumping)return;pumping=true;try{await recover();while(!stopped&&workers.size<4){const index=await claim();if(!index)break;const controller=new AbortController(),promise=run(index,controller).catch(()=>budget.pause('WORKER_ERROR')).finally(()=>{workers.delete(index.id);wake()});workers.set(index.id,{controller,promise});}}finally{pumping=false}}
 return {budget,sources,providerReady:provider.ready,
  create:(owner,input,key)=>add(owner,input,key),
  async get(owner,jid){return db.private(owner,async tx=>({...view(await stored(tx,owner,jid)),billing:billing?await billing.jobView(tx,jid):null}))},
  async list(owner){return db.private(owner,async tx=>{const ids=(await tx.query('SELECT id FROM qinban_private.recognition_jobs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 30',[owner])).rows,jobs=[];for(const {id:jid}of ids)jobs.push({...view(await stored(tx,owner,jid)),billing:billing?await billing.jobView(tx,jid):null});return {jobs}})},
  async cancel(owner,jid,key){const r=await library.mutation(owner,'recognition-cancel:'+jid,key,{},async tx=>{await budget.lock(tx);const j=await stored(tx,owner,jid);if(terminal(j.state))return {jobId:jid,state:j.state};const state=j.state==='queued'?'cancelled':'cancelling';await tx.query('UPDATE qinban_private.recognition_jobs SET state=$1,updated_at=$2 WHERE owner_id=$3 AND id=$4',[state,date(),owner,jid]);await tx.query('UPDATE qinban_control.job_index SET cancel_requested=true,state=$1,updated_at=$2 WHERE owner_id=$3 AND id=$4',[state==='cancelled'?state:'running',date(),owner,jid]);if(state==='cancelled')await budget.releaseUnused(tx,jid);return {jobId:jid,state};});workers.get(jid)?.controller.abort();return r},
  async retry(owner,jid,key,input={}){const j=await db.private(owner,tx=>stored(tx,owner,jid));if(!terminal(j.state)||j.regions.every(r=>r.state==='complete'))throw fail('NOT_RETRYABLE','当前任务无需重试。',409);return add(owner,{...j.manifest,sourceGroupId:j.source_group_id,retryOf:jid,pointQuote:input.pointQuote},key,j)},
  async save(owner,jid,key){return library.mutation(owner,'recognition-save:'+jid,key,{},async tx=>{const j=await stored(tx,owner,jid);if(j.result_entry_id)return {entryId:j.result_entry_id};const result=assembled(j);if(!result?.checks.passed)throw fail('RECOGNITION_NOT_READY','尚有未完成的谱行或延音问题，不能作为完整结果保存。',409);
   const notation={...result.sourceNotation,systems:result.sourceNotation.systems.map(s=>({...s,assetId:s.id,imageUrl:''}))},document=readScoreDocument(result.score,{sourceNotation:notation}),assets=j.regions.map((r,i)=>({assetId:r.region_id,resourceId:r.crop_resource_id,role:'source_image',page:j.manifest.regions[i].page,system:j.manifest.regions[i].system}));
   const g=(await tx.query('SELECT * FROM qinban_private.source_groups WHERE owner_id=$1 AND id=$2',[owner,j.source_group_id])).rows[0];if(g.kind==='pdf')assets.push({assetId:'original-file',resourceId:g.pages[0].originalResourceId,role:'original'});
   const saved=await library.saveTx(tx,owner,null,{expectedRevision:0,document,sourceNotation:notation,assets,sourceGroupIds:[j.source_group_id],warnings:[...result.warnings,'识别范围为用户选定谱行，不承诺覆盖图片外的整曲。']});await tx.query('UPDATE qinban_private.recognition_jobs SET result_entry_id=$1,updated_at=$2 WHERE owner_id=$3 AND id=$4',[saved.summary.entryId,date(),owner,jid]);return {entryId:saved.summary.entryId};})},
  async start(){if(!stopped)return;stopped=false;await pump();timer=setInterval(wake,2000);timer.unref()},
  async close(){stopped=true;clearInterval(timer);for(const w of workers.values())w.controller.abort();await Promise.allSettled([...workers.values()].map(w=>w.promise))},
  recover,
 };
}
