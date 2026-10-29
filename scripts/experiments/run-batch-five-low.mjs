import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mergeScorePages} from '../../lib/netease-scores.mjs';
const root='.local/batch-five-20261018';
const {createFullScoreJobStore}=await import(pathToFileURL(resolve(root,'runtime/lib/full-score-jobs.mjs')));
const {generateScoreRegion}=await import(pathToFileURL(resolve(root,'runtime/lib/ai.mjs')));
const entries=[{key:'merry',title:'Merry Christmas Mr. Lawrence',pages:6,tempo:60,url:'https://163cn.tv/biSpHIi7'},{key:'eutopia-staff',title:'Eutopia',pages:4,tempo:65,url:'https://163cn.tv/biSp0tUq'},{key:'sudi',title:'天龙八部之宿敌',pages:5,tempo:90,url:'https://163cn.tv/biSqvgtL'},{key:'ifyou',title:'IF YOU',pages:6,tempo:68,url:'https://163cn.tv/biSp8xiy'},{key:'golden',title:'golden hour',pages:9,tempo:94,url:'https://163cn.tv/biSqltsE'}];
let active=0,peak=0;const prior=JSON.parse(await readFile(root+'/private-jobs.json').catch(()=>'{"jobs":[]}'));const jobs=prior.jobs,startedAt=prior.startedAt||new Date().toISOString();
await mkdir(root+'/raw-calls',{recursive:true});
const adapter=async(request,options)=>{active++;peak=Math.max(peak,active);const start=new Date().toISOString();try{const result=await generateScoreRegion(request,{},options);await writeFile(root+'/raw-calls/'+request.jobId+'-'+request.region.id+'-'+request.pass+'.json',JSON.stringify({startedAt:start,endedAt:new Date().toISOString(),result},null,2));return result;}finally{active--;}};
const store=createFullScoreJobStore({maxConcurrency:100,recognizeRegion:adapter,checkRegion:(request,options)=>adapter({...request,pass:'verify'},options)});
async function launch(e){
 const regions=[],images=[];for(let page=1;page<=e.pages;page++){
  const layout=JSON.parse(await readFile(root+'/'+e.key+'/render-'+page+'.layout.json'));
  const buffer=await readFile(root+'/'+e.key+'/page-'+page+'.jpg');images.push({buffer,mimeType:buffer[0]===137?'image/png':'image/jpeg'});
  for(const [i,s]of layout.systems.entries()){const id='p'+page+'-s'+(i+1);regions.push({id,page,system:i+1,rect:s.rect,pageWidth:layout.width,pageHeight:layout.height,context:'仅识别当前完整双手谱行；保留全部音符、休止、声部、临时升降、换谱号、8va起止、倚音、三连音和跨行延音。禁止凭曲名补写。',image:{mimeType:'image/png',data:(await readFile(root+'/'+e.key+'/'+id+'.png')).toString('base64')}});}
 }
 const pdf=await mergeScorePages(images);await writeFile(root+'/'+e.key+'/original.pdf',pdf);
 const c=await store.createJob({title:e.title+' · GPT low 批量识别',totalPages:e.pages,tempo:e.tempo,source:{label:'网易云钢琴双手原谱',url:e.url},regions,verify:true,needsUserScopeConfirmation:true,originalPdf:{name:e.title+'.pdf',mimeType:'application/pdf',buffer:pdf}});
 jobs.push({key:e.key,title:e.title,id:c.id,token:c.token,rows:regions.length});await writeFile(root+'/private-jobs.json',JSON.stringify({startedAt,jobs},null,2),{mode:0o600});
 await store.startJob(c.id,{token:c.token,forceFresh:true});console.log(JSON.stringify({started:e.key,pages:e.pages,rows:regions.length,policy:'gpt-6.1-sol low',concurrency:100}));
}
for(const j of jobs){const old=await store.getJob(j.id,j);await store.startJob(j.id,{...j,forceFresh:true});console.log('Resumed fresh task',j.key,old.calls);}
let last='';while(true){
 for(const e of entries)if(!jobs.some(j=>j.key===e.key)&&await access(root+'/'+e.key+'/p'+e.pages+'-s1.png').then(()=>true,()=>false))await launch(e);
 const states=[];for(const j of jobs){const s=await store.getJob(j.id,j);states.push({key:j.key,status:s.status,...s.progress,calls:s.calls});if(s.status!=='running')await writeFile(root+'/'+j.key+'/initial-job.json',JSON.stringify(s,null,2));}
 const progress=JSON.stringify(states);if(progress!==last){console.log(progress);last=progress;await writeFile(root+'/progress.json',JSON.stringify({startedAt,at:new Date().toISOString(),peak,states},null,2));}
 if(jobs.length===entries.length&&states.every(s=>s.status!=='running'))break;
 await new Promise(r=>setTimeout(r,1000));
}
await writeFile(root+'/recognition-timing.json',JSON.stringify({startedAt,endedAt:new Date().toISOString(),concurrency:100,peak,model:'gpt-6.1-sol',effort:'low'},null,2));await store.close();console.log('BATCH_FIVE_INITIAL_FINISHED');
