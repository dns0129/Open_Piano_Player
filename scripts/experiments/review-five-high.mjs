// Targeted same-model rereads of this fresh batch; never marks AI work human-reviewed.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createFullScoreJobStore} from '../../lib/full-score-jobs.mjs';
import {recognitionCacheKey} from '../../lib/recognition-cache.mjs';
import {SCORE_RECOGNITION} from '../../lib/recognition-policy.mjs';
import {generateScoreRegion} from '../../lib/ai.mjs';
import {assertNewReading,withFreshTempoContext} from '../reread-five-high.mjs';

const root=resolve(process.argv[2]||'.local/batch-five-high-accidentals-v2');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const save=async(p,d)=>{const temp=p+'.'+randomUUID()+'.review.tmp';await writeFile(temp,JSON.stringify(d,null,2)+'\n',{mode:0o600});await rename(temp,p);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const bad=r=>!r.result?.coverage?.complete||!r.result.checks?.passed||!r.result.verification?.checks?.passed||r.result.verification?.error||!r.result.verification?.comparison?.exactMatch;
const auditDirectory=join(root,'targeted-review');await mkdir(auditDirectory,{recursive:true,mode:0o700});
const state=await read(join(root,'private-jobs.json'));
if(state.promptVersion!==SCORE_RECOGNITION.promptVersion)throw Error('Wrong prompt version');
const reports=[];
let stopping=false;const activeStores=new Set();
const stop=()=>{stopping=true;for(const store of activeStores)void store.close();};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
async function processBook(task){
 if(stopping)return;
 try{const done=await read(join(auditDirectory,task.key+'-finished.json'));reports.push(done);return;}catch{}
 const path=resolve('.local/full-score-jobs',task.id,'job.json');
 // The main reader owns this job until its per-book snapshot is written.
 while(true){
  if(stopping)break;
  const current=await read(path),owner=await read(join(root,'private-jobs.json'));
  const started=owner.jobs.find(j=>j.id===task.id)?.started;
  let completed;
  try{completed=await read(join(root,task.key+'-job.json'));}catch{}
  if(started&&current.status!=='running'&&completed&&completed.regions.every(r=>!['queued','running','pending-image'].includes(r.status)))break;
  await sleep(3000);
 }
 if(stopping)return;
 let completedRound=0;
 for(const round of [1,2])try{const done=await read(join(auditDirectory,task.key+'-after-'+round+'.json'));if(done.regions.every(r=>!['queued','running','pending-image'].includes(r.status)))completedRound=round;}catch{}
 for(let round=completedRound+1;round<=2;round++){
  if(stopping)break;
  const job=await read(path),first=job.regions[0];
  const needsHeader=round===1&&!first.headerIncluded;
  const problems=job.regions.filter(r=>bad(r)||(needsHeader&&r.id===first.id));
  if(!problems.length)break;
  const sourceTempo=job.regions[0].result||job.regions[0].recognitionCheckpoint?.result;
  await save(join(auditDirectory,task.key+'-before-'+round+'-'+Date.now()+'.json'),job);
  const ids=problems.map(r=>r.id),verificationOnly=[];
  for(const r of problems){
   const result=r.result;
   if(result?.checks?.passed&&result.verification?.error&&!(needsHeader&&r.id===first.id)){
    r.recognitionCheckpoint={key:recognitionCacheKey(job.metadata,r,job.recognition),result};verificationOnly.push(r.id);
   }else{
    r.recognitionCheckpoint=null;
    if(r.id===first.id&&!r.headerIncluded){
     r.rect={x:0,y:0,width:r.pageWidth,height:r.rect.y+r.rect.height};r.headerIncluded=true;
     r.context+='\n本图包含本页顶部标题和标速区域；只转写第一条完整钢琴双手谱行的音符，标题/标速作为上下文，不增加小节。';
    }
    const pageRoot=resolve('.local/batch-five-20261018',task.key),out=join(auditDirectory,task.key+'-'+r.id+'.png');
    // Crop exactly the old geometric scope from the native source raster.
    const python=`from PIL import Image\nimport sys,json,pathlib\nb=pathlib.Path(sys.argv[1]);page=int(sys.argv[2]);r=json.loads(sys.argv[3]);p=next((b/('page-'+str(page)+e)for e in ['.jpg','.png','.jpeg']if(b/('page-'+str(page)+e)).exists()),None)\nif p is None:raise RuntimeError('Native source page missing')\nim=Image.open(p).convert('RGB');sx=im.width/r['pageWidth'];sy=im.height/r['pageHeight'];q=r['rect'];box=(round(q['x']*sx),round(q['y']*sy),round((q['x']+q['width'])*sx),round((q['y']+q['height'])*sy));im=im.crop(box);scale=min(1.5,4096/im.width);im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS);im.save(sys.argv[4],'PNG')`;
    execFileSync(process.env.QINBAN_PYTHON||'python3',['-I','-c',python,pageRoot,String(r.page),JSON.stringify({rect:r.rect,pageWidth:r.pageWidth,pageHeight:r.pageHeight}),out]);
    const buffer=await readFile(out);if(buffer.length>4*1024*1024)throw Error('Detail image too large');
    await writeFile(resolve('.local/full-score-jobs',task.id,r.id+'.image'),buffer,{mode:0o600});
    r.image={mimeType:'image/png',bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')};
    if(!r.context.includes('本轮定点校对：'))r.context+='\n本轮定点校对：完整逐音核对全部小节，特别核实谱号、调号及升降还原记号；延音必须连接同音高、同手、同声部且时间无间隔的音头，不能把中间插入其他音的连奏弧当成延音。所有和弦音头保留，不用和声习惯猜音。';
    r.context=r.context.slice(0,4000);
   }
   r.result=null;r.status='queued';r.error=null;
  }
  job.status='paused';job.result=null;job.runVersion++;await save(path,job);
  const adapter=async(request,options)=>{
   const startedAt=new Date().toISOString();
   const result=await generateScoreRegion(withFreshTempoContext(request,sourceTempo),{}, {...options,traceOptions:{path:join(root,'usage.jsonl')}});
   assertNewReading(result);await save(join(root,'raw-calls',`${request.jobId}-${request.region.id}-${request.pass}-review${round}-${Date.now()}.json`),{startedAt,endedAt:new Date().toISOString(),result});return result;
  };
  const store=createFullScoreJobStore({maxConcurrency:4,recognizeRegion:adapter,checkRegion:adapter});
  activeStores.add(store);
  try{
   await store.startJob(task.id,{token:task.token,regionIds:ids,forceFresh:false});
   const after=await store.waitForIdle(task.id,{token:task.token});
   await save(join(auditDirectory,task.key+'-after-'+round+'.json'),after);
   console.log(JSON.stringify({key:task.key,round,rows:ids.length,verificationOnly,remaining:after.regions.filter(bad).map(r=>r.id)}));
  }finally{await store.close();activeStores.delete(store);}
 }
 if(stopping)return;
 const final=await read(path);const report={key:task.key,pages:final.totalPages,rows:final.regions.length,remaining:final.regions.filter(bad).map(r=>r.id)};
 reports.push(report);await save(join(auditDirectory,task.key+'-finished.json'),report);await save(join(auditDirectory,'progress.json'),reports);
}
await Promise.all(state.jobs.map(processBook));
if(!stopping){await save(join(auditDirectory,'finished.json'),{at:new Date().toISOString(),reports});console.log('TARGETED_REVIEW_FINISHED');}
