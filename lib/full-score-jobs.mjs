import {validateRegionResult,assembleJob,continuityAudit} from './score-region.mjs';
export {validateRegionResult} from './score-region.mjs';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,chmod,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {SCORE_RECOGNITION,recognitionEngine,recognitionPolicy} from './recognition-policy.mjs';
import {join,resolve} from 'node:path';
import {compareScoreEvents} from './score-assembly.mjs';
import {generateScoreRegion,normalizeGenerateInput} from './ai.mjs';
import {createReviewedRegionCache,recognitionCacheKey,recognitionCacheScope} from './recognition-cache.mjs';
import {createRecognitionGate} from './recognition-gate.mjs';
import {generateDigitalRegion} from './digital-recognition.mjs';
import {generateScoreDiagnosis} from './score-diagnosis-agent.mjs';
import {createScoreDiagnosisWorkflow} from './score-diagnosis-workflow.mjs';
import {normalizeSourceAssessment,hasManualScoreRevision} from './source-assessment.mjs';
import {MAX_RECOGNITION_CALLS} from './recognition-submission.mjs';

const EPS=1e-5, MAX_REGIONS=1000, MAX_PAGES=200;
const copy=value=>structuredClone(value);
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const text=(value,max=300)=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'';
const error=(message,code='INVALID_FULL_SCORE_JOB',status=422)=>Object.assign(new Error(message),{code,status,expose:true});
const safeError=e=>({code:typeof e?.code==='string'&&/^[A-Z_]+$/.test(e.code)?e.code:'RECOGNITION_FAILED',message:e?.expose||e?.public?text(e.message,500):e?.name==='AbortError'?'任务已取消。':'此谱行未完成识别，请查看谱面后使用当前任务模型重试。'});
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(value);
const safeUsage=value=>value&&typeof value==='object'?Object.fromEntries(['input','output','totalTokens'].filter(k=>finite(value[k])&&value[k]>=0).map(k=>[k,value[k]])):null;
function normalizeManifest(raw){
  if(!raw||typeof raw!=='object')throw error('缺少完整谱页清单。');
  const totalPages=raw.totalPages??raw.pageCount;
  if(!Number.isInteger(totalPages)||totalPages<1||totalPages>MAX_PAGES)throw error(`谱页数必须为1–${MAX_PAGES}。`);
  if(!Array.isArray(raw.regions)||!raw.regions.length||raw.regions.length>MAX_REGIONS)throw error(`请选择1–${MAX_REGIONS}个谱行。`);
  if((raw.excludeRegions?.length||raw.excludedRegions?.length))throw error('整谱任务不能跳过音乐谱行；请保留全部行，或明确创建片段任务。','EXCLUDED_MUSIC_REGION');
  const excludedPages=(raw.excludedPages||[]).map(value=>typeof value==='number'?{page:value,reason:''}:{page:value.page,reason:text(value.reason,300)});
  const excluded=new Set();
  for(const page of excludedPages){if(!Number.isInteger(page.page)||page.page<1||page.page>totalPages||excluded.has(page.page)||!page.reason)throw error('排除谱页必须提供有效页码、原因且不得重复。');excluded.add(page.page);}
  const ids=new Set(),locations=new Set();
  const regions=raw.regions.map((region,index)=>{
    const id=region.id??`region-${index+1}`,rect=region.rect;
    if(!validId(id)||ids.has(id))throw error('谱行id须唯一，只能含字母、数字、短横线和下划线。');ids.add(id);
    if(!Number.isInteger(region.page)||region.page<1||region.page>totalPages||excluded.has(region.page))throw error('谱行页码无效或与排除页冲突。');
    if(!Number.isInteger(region.system)||region.system<1||region.system>500)throw error('谱行序号无效。');
    const location=`${region.page}:${region.system}`;if(locations.has(location))throw error('同一页谱行重复。');locations.add(location);
    if(!rect||!['x','y','width','height'].every(k=>finite(rect[k]))||rect.x<0||rect.y<0||rect.width<=0||rect.height<=0||rect.width>50000||rect.height>50000)throw error('谱行原图裁切坐标无效。');
    let measureCount=region.measureCount??region.expectedMeasureCount;
    if(region.measureCount!==undefined&&region.expectedMeasureCount!==undefined&&region.measureCount!==region.expectedMeasureCount)throw error('两个期望小节数约束不一致。');
    if(region.firstMeasure!==undefined||region.lastMeasure!==undefined){if(!Number.isInteger(region.firstMeasure)||region.firstMeasure<1||!Number.isInteger(region.lastMeasure)||region.lastMeasure<region.firstMeasure)throw error('小节范围无效。');const count=region.lastMeasure-region.firstMeasure+1;if(measureCount!==undefined&&measureCount!==count)throw error('小节数与范围不一致。');measureCount=count;}
    if(measureCount!==undefined&&(!Number.isInteger(measureCount)||measureCount<1||measureCount>256))throw error('每行小节数必须为1–256。');
    if((region.pageWidth!==undefined||region.pageHeight!==undefined)&&(!finite(region.pageWidth)||!finite(region.pageHeight)||region.pageWidth<=0||region.pageHeight<=0||rect.x+rect.width>region.pageWidth+EPS||rect.y+rect.height>region.pageHeight+EPS))throw error('谱行超出原始页面尺寸。');
    return {id,page:region.page,system:region.system,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},...(region.pageWidth?{pageWidth:region.pageWidth,pageHeight:region.pageHeight}:{}),context:text(typeof region.context==='string'?region.context:JSON.stringify(region.context||{}),4000),...(measureCount?{measureCount}:{}),...(region.firstMeasure?{firstMeasure:region.firstMeasure,lastMeasure:region.lastMeasure}:{}),status:'pending-image',attempts:0,image:null,result:null,error:null,confirmedAt:null};
  }).sort((a,b)=>a.page-b.page||a.system-b.system);
  for(let page=1;page<=totalPages;page++)if(!excluded.has(page)&&!regions.some(region=>region.page===page))throw error(`第${page}页未提供谱行，也未明确排除；不能开始整谱识别。`,'MISSING_PAGE_COVERAGE');
  for(const page of new Set(regions.map(r=>r.page))){const indices=regions.filter(r=>r.page===page).map(r=>r.system);if(indices.some((n,i)=>n!==i+1))throw error(`第${page}页的谱行序号有缺口，须包含全部谱行。`,'MISSING_SYSTEM_COVERAGE');}
  const sourceRaw=raw.source||{},source={kind:'full-score-transcription',label:text(sourceRaw.label||'用户上传的完整原谱',200)};
  if(/^https?:\/\//i.test(sourceRaw.url||''))source.url=text(sourceRaw.url,2000);if(sourceRaw.license)source.license=text(sourceRaw.license,300);
  const metadata={title:text(raw.title,200)||'完整钢琴谱',composer:text(raw.composer,200)||'未知',source};
  if(raw.timeSignature!==undefined){if(!Array.isArray(raw.timeSignature)||raw.timeSignature.length!==2||!Number.isInteger(raw.timeSignature[0])||raw.timeSignature[0]<1||raw.timeSignature[0]>16||![1,2,4,8,16].includes(raw.timeSignature[1]))throw error('拍号无效。');metadata.timeSignature=[...raw.timeSignature];}
  if(raw.tempo!==undefined){if(!finite(raw.tempo)||raw.tempo<20||raw.tempo>300)throw error('速度无效。');metadata.tempo=raw.tempo;}
  if(raw.keySignature!==undefined){if(!Number.isInteger(raw.keySignature)||Math.abs(raw.keySignature)>7)throw error('调号无效。');metadata.keySignature=raw.keySignature;}
  const engine=recognitionEngine(raw.engine||raw.engineChoice);
  if(raw.omrProfile!==undefined&&!['basic','piano-v3','piano-triplets-v3'].includes(raw.omrProfile))throw error('本机识谱配置无效。');
  return {metadata,totalPages,excludedPages,regions,omrProfile:raw.omrProfile||'basic',needsUserScopeConfirmation:raw.needsUserScopeConfirmation===true&&raw.scopeConfirmed!==true,scopeConfirmed:raw.scopeConfirmed===true,engine,verify:false};
}

/** Check score structure, every hand's written time, and exact source-head coverage.
 * Geometry and duration validation cannot prove that a pitch was read correctly.
 */
/** Persistent, token-protected orchestration. Adapters receive secrets only at call time.
 * create/upload never call a model. start defaults to all rows with concurrency <= 100.
 */
export function createFullScoreJobStore({directory=resolve('.local/full-score-jobs'),recognizeRegion,digitalFallback,digitalRecognizeRegion,diagnoseRegion=generateScoreDiagnosis,settingsProvider=async()=>({}),maxConcurrency=100,timeoutMs=SCORE_RECOGNITION.timeoutMs}={}){
  const jobs=new Map(),locks=new Map(),runtime=new Map();let closed=false;const concurrency=Math.max(1,Math.min(100,Math.floor(maxConcurrency)||100));
  const gate=createRecognitionGate(concurrency),cache=createReviewedRegionCache(join(directory,'reviewed-cache')),seeded=new Set();
  const recognize=recognizeRegion||((request,options)=>settingsProvider().then(settings=>generateScoreRegion(request,settings,options)));
  const fallbackEnabled=digitalFallback??!recognizeRegion;
  const digitalRead=digitalRecognizeRegion||((request,options)=>generateDigitalRegion(request,options));
  const path=id=>join(directory,id);const statePath=id=>join(path(id),'job.json');
  async function save(job){await mkdir(path(job.id),{recursive:true,mode:0o700});await chmod(path(job.id),0o700);const temp=join(path(job.id),`state-${randomBytes(6).toString('hex')}.tmp`);await writeFile(temp,JSON.stringify(job),{mode:0o600});await rename(temp,statePath(job.id));}
  async function load(id){if(!validId(id))throw error('任务不存在。','JOB_NOT_FOUND',404);if(jobs.has(id))return jobs.get(id);let job;try{job=JSON.parse(await readFile(statePath(id),'utf8'));}catch{throw error('任务不存在。','JOB_NOT_FOUND',404);}if(job.status==='running'){job.status='paused';job.lastError={code:'PROCESS_RESTARTED',message:'后台已重启；已保留完成结果，请继续未完成谱行。'};for(const region of job.regions)if(region.status==='running')region.status='queued';await save(job);}for(const r of job.regions)if(r.diagnosis?.status==='running')r.diagnosis={...r.diagnosis,status:'failed',error:{code:'DIAGNOSIS_INTERRUPTED',message:'服务已重启，诊断已中断；已有乐谱保留，可重试。'}};jobs.set(id,job);return job;}
  function authorize(job,auth={}){const a=typeof auth.token==='string'?digest(auth.token):'',b=typeof auth.sessionId==='string'&&auth.sessionId?digest(auth.sessionId):'';const equal=(one,two)=>one&&two&&one.length===two.length&&timingSafeEqual(Buffer.from(one),Buffer.from(two));if(!equal(a,job.tokenHash)&&!equal(b,job.ownerHash))throw error('任务不存在或访问凭证已失效。','JOB_NOT_FOUND',404);}
  async function locked(id,auth,fn){const prior=locks.get(id)||Promise.resolve();const task=prior.catch(()=>{}).then(async()=>{const job=await load(id);authorize(job,auth);return fn(job);});locks.set(id,task.catch(()=>{}));return task;}
  const snapshot=job=>{const progress={total:job.regions.length,pending:0,running:0,needsReview:0,confirmed:0,failed:0};for(const region of job.regions){if(['pending-image','queued'].includes(region.status))progress.pending++;else if(region.status==='running')progress.running++;else if(region.status==='needs-review')progress.needsReview++;else if(region.status==='confirmed')progress.confirmed++;else if(region.status==='failed')progress.failed++;}return copy({id:job.id,status:job.status,runVersion:job.runVersion,engine:job.engine==='deepseek'?'deepseek':'pi',recognition:{...(job.recognition||recognitionPolicy(job.engine))},previousEngine:job.previousEngine,omrProfile:job.omrProfile||'basic',title:job.metadata.title,metadata:job.metadata,totalPages:job.totalPages,excludedPages:job.excludedPages,needsUserScopeConfirmation:job.needsUserScopeConfirmation,scopeConfirmed:job.scopeConfirmed,regions:job.regions,progress,documentProgress:job.documentProgress,documentChecks:job.documentChecks,estimate:{regions:job.regions.length,modelCalls:job.regions.length,piCalls:job.engine==='deepseek'?0:job.regions.length,deepseekCalls:job.engine==='deepseek'?job.regions.length:0,documentCalls:0,concurrency},calls:job.calls,reuse:job.reuse||{hits:0,savedCalls:0},originalPdf:job.originalPdf,createdAt:job.createdAt,updatedAt:job.updatedAt,lastError:job.lastError,continuity:continuityAudit(job.regions),result:job.result});};
  async function mutate(job){job.updatedAt=new Date().toISOString();await save(job);}
  async function storeImage(job,region,image){const normalized=normalizeGenerateInput({provider:'pi',mode:'ocr',title:job.metadata.title,images:[image]});const value=normalized.images[0],buffer=Buffer.from(value.data,'base64');await writeFile(join(path(job.id),`${region.id}.image`),buffer,{mode:0o600});region.image={mimeType:value.mimeType,bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')};region.status='queued';}
  async function storePdf(job,pdf){const buffer=Buffer.isBuffer(pdf?.buffer)?pdf.buffer:typeof pdf?.data==='string'?Buffer.from(pdf.data,'base64'):null;if(!buffer||!buffer.length||buffer.length>50*1024*1024||!buffer.subarray(0,5).equals(Buffer.from('%PDF-'))||pdf.mimeType!=='application/pdf')throw error('请提供小于50MB的有效PDF。','INVALID_PDF');await writeFile(join(path(job.id),'original.pdf'),buffer,{mode:0o600});job.originalPdf={name:text(pdf.name,180)||'原谱.pdf',mimeType:'application/pdf',bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')};}
  function derivedStatus(job){if(job.status==='cancelled')return;job.result=null;if(job.regions.every(r=>r.status==='confirmed')){try{job.result=assembleJob(job);job.status=job.result?.reviewStatus==='human-confirmed'?'complete':'needs-review';}catch(e){job.status='needs-review';job.lastError=safeError(e);}}else if(job.regions.some(r=>r.status==='needs-review'||r.status==='confirmed'))job.status='needs-review';else if(job.regions.some(r=>r.status==='failed'))job.status='failed';else job.status='paused';}
  async function invoke(adapter,request,controller,options={}){
    // Logical cancellation returns promptly, but a network request keeps its
    // physical slot until the adapter really exits. A slow abort must not let
    // the next row exceed the global concurrency cap.
    return new Promise((resolveResult,rejectResult)=>{
      gate(async()=>{
        controller.signal.throwIfAborted();await options.onDispatch?.();
        const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(options.timeout??timeoutMs)]);
        const abort=()=>rejectResult(signal.reason);signal.addEventListener('abort',abort,{once:true});
        try{signal.throwIfAborted();const result=await adapter(request,{signal,onProgress:options.onProgress,onSubmission:options.onSubmission,maxCalls:options.maxCalls});signal.throwIfAborted();resolveResult(result);}
        catch(e){rejectResult(e);}finally{signal.removeEventListener('abort',abort);}
      },controller.signal).catch(rejectResult);
    });
  }
  async function rememberConfirmed(job,auth){
    const scope=recognitionCacheScope(auth);
    for(const region of job.regions){
      if(hasManualScoreRevision(region)||region.status!=='confirmed'||region.result?.model!==recognitionPolicy(job.engine).model||region.result.reasoningEffort!==recognitionPolicy(job.engine).reasoningEffort||region.result.promptVersion!==recognitionPolicy(job.engine).promptVersion||!region.result.checks?.passed)continue;
      const key=recognitionCacheKey(job.metadata,region,job.recognition||recognitionPolicy(job.engine)),seed=scope+key+region.confirmedAt;
      if(seeded.has(seed))continue;
      await cache.put(scope,key,{sourceJobId:job.id,confirmedAt:region.confirmedAt,result:region.result});seeded.add(seed);
    }
  }
  async function recordDispatch(id,regionId,run,pass){return locked(id,run.auth,async job=>{if(job.runVersion!==run.version||job.status!=='running')throw error('任务已停止。','STALE_JOB_INTENT');if(pass==='verify')job.calls.verification++;else{job.calls.recognition++;job.regions.find(r=>r.id===regionId).attempts++;}await mutate(job);});}
  async function readWithFallback(adapter,request,run,pass){
    const options={onDispatch:()=>recordDispatch(request.jobId,request.region.id,run,pass),onSubmission:record=>locked(request.jobId,run.auth,async job=>{const region=job.regions.find(r=>r.id===request.region.id);region.recognitionAttempts||=[];region.recognitionAttempts.push({runVersion:run.version,...copy(record)});await mutate(job);})};
    try{return await invoke(adapter,request,run.controller,options);}
    catch(e){
      if(!fallbackEnabled||request.engine!=='pi'||!['NO_REGION_RESULT','INVALID_COMPACT_REGION'].includes(e.code)||run.controller.signal.aborted||(e.providerCalls??1)>=MAX_RECOGNITION_CALLS)throw e;
      return invoke(digitalRead,request,run.controller,{...options,maxCalls:MAX_RECOGNITION_CALLS-(e.providerCalls??1)});
    }
  }
  async function processRegion(id,regionId,run){let request,version,checkpoint;
    try{
      await locked(id,run.auth,async job=>{
        if(job.status!=='running'||job.runVersion!==run.version)return;
        const region=job.regions.find(r=>r.id===regionId);if(region.status!=='queued')return;
        version=job.runVersion;const key=recognitionCacheKey(job.metadata,region,job.recognition||recognitionPolicy(job.engine));
        if(!run.forceFresh&&!region.recognitionCheckpoint){
          const hit=await cache.get(recognitionCacheScope(run.auth),key);
          if(hit){try{
            const valid=validateRegionResult(hit.result,region,job.metadata);
            if(valid.checks.passed&&hit.result.model===recognitionPolicy(job.engine).model&&hit.result.reasoningEffort===recognitionPolicy(job.engine).reasoningEffort&&hit.result.promptVersion===recognitionPolicy(job.engine).promptVersion){
              region.result={...hit.result,...valid,reviewStatus:'unreviewed',cacheReuse:{sourceJobId:hit.sourceJobId,confirmedAt:hit.confirmedAt}};
              region.sourceAssessment=normalizeSourceAssessment(hit.result.sourceAssessment);region.status='needs-review';region.error=null;job.reuse||={hits:0,savedCalls:0};job.reuse.hits++;job.reuse.savedCalls++;await mutate(job);return;
            }
          }catch{/* Invalid cached entries never bypass live recognition or checks. */}}
        }
        checkpoint=region.recognitionCheckpoint?.key===key&&!run.forceFresh?copy(region.recognitionCheckpoint.result):null;
        region.status='running';region.error=null;
        const {result:previousResult,recognitionCheckpoint:priorCheckpoint,...sourceRegion}=copy(region);
        request={jobId:id,engine:job.engine,metadata:copy(job.metadata),region:{...sourceRegion,image:{...region.image,data:(await readFile(join(path(id),`${region.id}.image`))).toString('base64')}},pass:'recognize'};
        await mutate(job);
      });
      if(!request)return;
      let result=checkpoint;
      if(!result){
        const raw=await readWithFallback(recognize,request,run,'recognize');
        const positionlessSource=raw.positionlessReview===true&&raw.wireFormat==='compact-json-v2';
        result={sourceAssessment:normalizeSourceAssessment(raw.sourceAssessment),...validateRegionResult(raw,request.region,request.metadata,{requirePositions:!positionlessSource}),positionlessSource,engine:text(raw.engine||raw.provider||'pi',50),model:raw.model||null,reasoningEffort:raw.reasoningEffort||null,promptVersion:raw.promptVersion||null,requestAudit:raw.requestAudit||[],wireFormat:raw.wireFormat||'verbose-v1',submissionAudit:raw.submissionAudit||[],usage:safeUsage(raw.usage)};
        await locked(id,run.auth,async job=>{if(job.runVersion!==version||job.status==='cancelled')return;const region=job.regions.find(r=>r.id===regionId);region.recognitionCheckpoint={key:recognitionCacheKey(job.metadata,region,job.recognition||recognitionPolicy(job.engine)),result:copy(result)};await mutate(job);});
      }
      result={...result,verification:null};
      await locked(id,run.auth,async job=>{if(job.runVersion!==version||job.status==='cancelled')return;const region=job.regions.find(r=>r.id===regionId);region.result=result;region.sourceAssessment=normalizeSourceAssessment(result.sourceAssessment);region.diagnosis=null;region.status='needs-review';await mutate(job);});
    }catch(e){if(['MODEL_RATE_LIMIT','MODEL_BALANCE_REQUIRED','DEEPSEEK_AUTH_REQUIRED'].includes(e.code))run.pausedForRateLimit=true;await locked(id,run.auth,async job=>{if(job.runVersion!==version||job.status==='cancelled')return;const region=job.regions.find(r=>r.id===regionId);region.status='failed';region.sourceAssessment=normalizeSourceAssessment(e.sourceAssessment);region.diagnosis=null;region.error={...safeError(e),...(e.issues?{issues:e.issues}: {})};if(e.submissionAudit?.length)region.failedSubmissionAudit=copy(e.submissionAudit);await mutate(job);});}
  }
  async function execute(id,run,ids){try{let cursor=0;await Promise.all(Array.from({length:Math.min(concurrency,ids.length)},async()=>{while(cursor<ids.length&&!run.controller.signal.aborted&&!run.pausedForRateLimit){const index=cursor++;await processRegion(id,ids[index],run);}}));}finally{await locked(id,run.auth,async job=>{if(job.runVersion===run.version&&job.status!=='cancelled'){derivedStatus(job);await mutate(job);}});if(runtime.get(id)===run)runtime.delete(id);}}
  async function applyRecognitionPolicy(job){
    if(!['pi','deepseek'].includes(job.engine)){
      try{await copyFile(statePath(job.id),join(path(job.id),'before-gpt-only.json'),constants.COPYFILE_EXCL);await chmod(join(path(job.id),'before-gpt-only.json'),0o600);}catch(e){if(e.code!=='EEXIST')throw e;}
      job.previousEngine=job.engine;job.engine='pi';
    }
    if(job.documentChecks?.errors?.length&&job.documentChecks.errors.every(e=>e.code==='DOCUMENT_FAILED'))job.documentChecks=null;
    job.verify=false;
    job.recognition={...recognitionPolicy(job.engine)};
  }

  const diagnosisWorkflow=createScoreDiagnosisWorkflow({locked,mutate,snapshot,directory,settingsProvider,diagnose:diagnoseRegion,derivedStatus,timeoutMs});
  const api={
    ...diagnosisWorkflow,
    async createJob(raw,auth={}){if(closed)throw error('任务存储已关闭。','STORE_CLOSED',503);const manifest=normalizeManifest(raw),id=randomBytes(18).toString('hex'),token=randomBytes(32).toString('base64url'),date=new Date().toISOString();await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);const job={version:1,id,...manifest,status:'draft',tokenHash:digest(token),ownerHash:auth.sessionId?digest(auth.sessionId):null,createdAt:date,updatedAt:date,runVersion:0,calls:{recognition:0,verification:0,document:0},originalPdf:null,result:null,lastError:null};await save(job);jobs.set(id,job);try{for(const region of job.regions){const original=raw.regions.find(r=>r.id===region.id)||raw.regions.find((r,i)=>!r.id&&region.id===`region-${i+1}`);if(original?.image)await storeImage(job,region,original.image);}if(raw.originalPdf)await storePdf(job,raw.originalPdf);await mutate(job);}catch(e){job.status='failed';job.lastError=safeError(e);await mutate(job);throw e;}return {id,token,snapshot:snapshot(job)};},
    async getJob(id,auth={}){return locked(id,auth,async job=>{await rememberConfirmed(job,auth);return snapshot(job);});},
    async uploadRegion(id,regionId,{image},auth={}){return locked(id,auth,async job=>{if(job.status==='running')throw error('识别期间不能替换原图。','JOB_RUNNING',409);const region=job.regions.find(r=>r.id===regionId);if(!region)throw error('谱行不存在。','REGION_NOT_FOUND',404);await storeImage(job,region,image);region.result=null;region.sourceAssessment=null;region.diagnosis=null;region.diagnosisAttempts=0;region.recognitionCheckpoint=null;region.confirmedAt=null;job.result=null;job.status='draft';await mutate(job);return snapshot(job);});},
    async uploadDocument(id,pdf,auth={}){return locked(id,auth,async job=>{if(job.status==='running')throw error('识别期间不能替换PDF。','JOB_RUNNING',409);await storePdf(job,pdf);for(const region of job.regions){region.result=null;region.sourceAssessment=null;region.diagnosis=null;region.diagnosisAttempts=0;region.recognitionCheckpoint=null;region.confirmedAt=null;region.status=region.image?'queued':'pending-image';}job.result=null;job.status='draft';await mutate(job);return snapshot(job);});},
    async readRegionImage(id,regionId,auth={}){return locked(id,auth,async job=>{const region=job.regions.find(r=>r.id===regionId);if(!region?.image)throw error('谱行原图尚未上传。','IMAGE_REQUIRED',404);return {buffer:await readFile(join(path(id),`${region.id}.image`)),mimeType:region.image.mimeType};});},
    async readDocument(id,auth={}){return locked(id,auth,async job=>{if(!job.originalPdf)throw error('原PDF尚未上传。','PDF_REQUIRED',404);return {buffer:await readFile(join(path(id),'original.pdf')),mimeType:'application/pdf',name:job.originalPdf.name};});},
    async startJob(id,options={}){if(closed)throw error('任务存储已关闭。','STORE_CLOSED',503);return locked(id,options,async job=>{if(options.expectedVersion!==undefined&&options.expectedVersion!==job.runVersion)throw error('此启动请求已被较新的停止或启动操作取代，请刷新任务状态。','STALE_JOB_INTENT',409);if(job.status==='running')return snapshot(job);if(options.engine!==undefined&&recognitionEngine(options.engine)!==recognitionEngine(job.engine==='deepseek'?'deepseek':'pi'))throw error('任务识谱服务商已固定，请新建任务切换。','RECOGNITION_ENGINE_LOCKED');await applyRecognitionPolicy(job);
      const queued=job.regions.filter(r=>!r.result&&r.status!=='confirmed'&&(!options.regionIds||options.regionIds.includes(r.id)));if(!queued.length){derivedStatus(job);await mutate(job);return snapshot(job);}
      if(queued.some(r=>!r.image))throw error('所有待识别谱行都必须先上传图片。','IMAGE_REQUIRED');
      const selected=options.autoContinue===false?queued.slice(0,Math.max(1,Math.min(1000,Math.floor(options.batchSize)||2))):queued;
      for(const region of selected){region.status='queued';region.lastEngine=job.engine;if(options.forceFresh)region.recognitionCheckpoint=null;}job.status='running';job.lastError=null;job.runVersion++;job.result=null;const run={auth:{token:options.token,sessionId:options.sessionId},version:job.runVersion,controller:new AbortController(),forceFresh:options.forceFresh===true};runtime.set(id,run);await mutate(job);run.promise=Promise.resolve().then(()=>execute(id,run,selected.map(r=>r.id)));run.promise.catch(()=>{});return snapshot(job);});},
    async cancelJob(id,auth={}){return locked(id,auth,async job=>{diagnosisWorkflow.cancelDiagnosis(id);runtime.get(id)?.controller.abort();job.runVersion++;job.status='cancelled';job.result=null;for(const region of job.regions)if(region.status==='running'||region.status==='queued')region.status=region.result?'needs-review':'queued';await mutate(job);return snapshot(job);});},
    async retryRegion(id,regionId,auth={},options={}){return api.retryRegions(id,auth,{...options,regionIds:[regionId]});},
    async retryRegions(id,auth={},options={}){
      if(options.phase==='verify')throw error('AI复核阶段已移除；可重新读取此行原图。','VERIFICATION_REMOVED',410);
      let engine,expectedVersion,regionIds;
      await locked(id,auth,async job=>{
        if(options.expectedVersion!==undefined&&options.expectedVersion!==job.runVersion)throw error('此重试请求已被较新的停止或启动操作取代。','STALE_JOB_INTENT',409);
        if(job.status==='running')throw error('请先等待本批完成或取消任务。','JOB_RUNNING',409);
        if(options.regionIds!==undefined&&(!Array.isArray(options.regionIds)||!options.regionIds.length))throw error('请选择要重新识别的谱行。','INVALID_REGIONS');
        const selected=options.regionIds?[...new Set(options.regionIds)].map(id=>{const r=job.regions.find(r=>r.id===id);if(!r)throw error('谱行不存在。','REGION_NOT_FOUND',404);return r;}):job.regions.filter(r=>r.status==='failed'||r.result?.checks?.passed===false);
        if(!selected.length)throw error('没有需要重试的失败谱行。','NO_FAILED_REGIONS');
        if(selected.some(r=>r.status==='confirmed'))throw error('已确认谱行须通过人工编辑修改，不能直接重跑覆盖。','REGION_CONFIRMED',409);
        if(selected.some(r=>!r.image))throw error('请先上传待重试谱行的图片。','IMAGE_REQUIRED');
        engine=recognitionEngine(options.engine??(job.engine==='deepseek'?'deepseek':'pi'));
        // Resolve options before changing persisted results. Other rows keep their
        // original provider/model provenance when this retry changes provider.
        await applyRecognitionPolicy(job);
        if(job.engine!==engine){job.previousEngine=job.engine;job.engine=engine;job.recognition={...recognitionPolicy(engine)};}
        expectedVersion=job.runVersion;regionIds=selected.map(r=>r.id);
        for(const region of selected){region.recognitionCheckpoint=null;region.result=null;region.sourceAssessment=null;region.diagnosis=null;region.diagnosisAttempts=0;region.error=null;region.confirmedAt=null;region.status='queued';}
        job.status='paused';job.result=null;await mutate(job);
      });
      return api.startJob(id,{...auth,engine,expectedVersion,regionIds,autoContinue:true,forceFresh:true});
    },
    async confirmRegion(id,regionId,editedResult,auth={}){return locked(id,auth,async job=>{if(job.status==='running')throw error('请待识别完成再校对。','JOB_RUNNING',409);const region=job.regions.find(r=>r.id===regionId);if(!region)throw error('谱行不存在。','REGION_NOT_FOUND',404);const supplied=editedResult?{...editedResult,...(region.result?.sourceHeadAudit?{sourceHeadAudit:{...region.result.sourceHeadAudit,reviewed:editedResult.sourceHeadAudit?.reviewed===true}}:{}),...(region.result?.tieAudit?{tieAudit:{...region.result.tieAudit,reviewed:editedResult.tieAudit?.reviewed===true}}:{})}:region.result;const result=validateRegionResult(supplied,region,job.metadata,{requirePositions:region.result?.positionlessSource!==true});if(!result.checks.passed)throw error('结构检查未通过：'+result.checks.errors.map(e=>e.message).slice(0,3).join('；'),'REGION_CHECK_FAILED');const prior=region.result;region.result={...result,...(prior?.manualRevisions?.length?{manualRevisions:prior.manualRevisions}:{}),positionlessSource:prior?.positionlessSource===true,verification:prior?.verification||null,usage:prior?.usage||null,model:prior?.model||null,reasoningEffort:prior?.reasoningEffort||null,promptVersion:prior?.promptVersion||null,requestAudit:prior?.requestAudit||[],wireFormat:prior?.wireFormat||'verbose-v1',cacheReuse:prior?.cacheReuse||null,reviewedChanges:prior?.score?compareScoreEvents(prior.score,result.score):null,reviewStatus:'confirmed',engine:prior?.engine||'manual'};region.status='confirmed';region.confirmedAt=new Date().toISOString();job.status='needs-review';derivedStatus(job);await mutate(job);await rememberConfirmed(job,auth);return snapshot(job);});},
    async exportDraft(id,auth={},options={}){return locked(id,auth,async job=>{if(job.status==='running')throw error('识别仍在进行。','JOB_RUNNING',409);if(options.scopeConfirmed!==true)throw error('请确认全部页和谱行范围。','SCOPE_CONFIRMATION_REQUIRED');if(job.regions.some(r=>!r.result||r.result.coverage?.complete!==true))throw error('仍有未完整识别的谱行；不能导入整谱草稿。','INCOMPLETE_JOB');const result=assembleJob(job,{draft:true});return {...snapshot(job),result};});},
    async confirmJob(id,auth={},options={}){return locked(id,auth,async job=>{if(job.regions.some(r=>r.status!=='confirmed'))throw error('仍有未识别或未人工确认的谱行；不能作为整谱导入。','INCOMPLETE_JOB');if(options.scopeConfirmed===true){job.needsUserScopeConfirmation=false;job.scopeConfirmed=true;}derivedStatus(job);await mutate(job);if(job.needsUserScopeConfirmation)throw error('请先逐页确认全部谱行范围。','SCOPE_CONFIRMATION_REQUIRED');if(job.status!=='complete')throw error('跨谱行连续性或原文覆盖检查未通过。','CONTINUITY_FAILED');return snapshot(job);});},
    async waitForIdle(id,auth={}){await api.getJob(id,auth);await runtime.get(id)?.promise;return api.getJob(id,auth);},
    async close(){closed=true;diagnosisWorkflow.close();await Promise.allSettled([...runtime].map(([id,run])=>{run.controller.abort();return locked(id,run.auth,async job=>{job.runVersion++;job.status='paused';job.lastError={code:'SERVICE_STOPPED',message:'服务已关闭；识别结果已保留，可继续未完成谱行。'};for(const region of job.regions)if(region.status==='running')region.status='queued';await mutate(job);});}));},
  };
  return api;
}
