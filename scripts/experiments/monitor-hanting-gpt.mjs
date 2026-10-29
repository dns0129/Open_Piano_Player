import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
const root='.local/hanting-gpt-high-20261017',id=(await readFile(root+'/job-id.txt','utf8')).trim(),path='.local/full-score-jobs/'+id+'/job.json';
await mkdir(root+'/initial-results',{recursive:true});
const oldId=(await readFile('.local/hanting-source/final-job-id.txt','utf8')).trim(),reference=JSON.parse(await readFile('.local/full-score-jobs/'+oldId+'/job.json'));
const key=n=>[Math.round(n.beat*1e4),Math.round(n.duration*1e4),n.midi,n.hand].join('|');
function difference(expected,actual){const left=new Map(),right=new Map();for(const n of expected)left.set(key(n),(left.get(key(n))||0)+1);for(const n of actual)right.set(key(n),(right.get(key(n))||0)+1);let matches=0;for(const[k,n]of left)matches+=Math.min(n,right.get(k)||0);return{expected:expected.length,actual:actual.length,matches,missing:expected.filter(n=>{const k=key(n),v=right.get(k)||0;if(v){right.set(k,v-1);return false;}return true;}),extra:actual.filter(n=>{const k=key(n),v=left.get(k)||0;if(v){left.set(k,v-1);return false;}return true;})};}
let last='';
while(true){
  const job=JSON.parse(await readFile(path));const rows=[];
  for(const region of job.regions){
    if(region.result){const destination=root+'/initial-results/'+region.id+'.json';if(!await access(destination).then(()=>true,()=>false))await writeFile(destination,JSON.stringify({region,result:region.result,savedAt:new Date().toISOString()},null,2));}
    const original=reference.regions.find(r=>r.id===region.id),diff=region.result?difference(original.result.score.notes,region.result.score.notes):null;
    rows.push({id:region.id,page:region.page,system:region.system,status:region.status,structural:region.result?.checks,verification:region.result?.verification?.comparison,comparisonWithPriorReviewed:diff,error:region.error});
  }
  const summary={at:new Date().toISOString(),jobId:id,status:job.status,calls:job.calls,completed:rows.filter(r=>r.status==='needs-review'||r.status==='confirmed').length,failed:rows.filter(r=>r.status==='failed').length,rows};
  await writeFile(root+'/progress.json',JSON.stringify(summary,null,2));
  const label=JSON.stringify({status:summary.status,completed:summary.completed,failed:summary.failed,calls:summary.calls});if(label!==last){console.log(new Date().toISOString(),label);last=label;}
  if(job.status!=='running'){await writeFile(root+'/first-round-summary.json',JSON.stringify(summary,null,2));break;}
  await new Promise(resolve=>setTimeout(resolve,5000));
}
