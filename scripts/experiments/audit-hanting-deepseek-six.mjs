import {readFile,writeFile,readdir} from 'node:fs/promises';
import {compareRegionReadings} from '../../lib/recognition-comparison.mjs';
const root='.local/hanting-deepseek-high-six-pages-20261018';
const ref=JSON.parse(await readFile('.local/full-score-jobs/feb36563796cd9a9b7f118a809ad559fe4dc/job.json'));
const key=n=>[n.midi,n.hand,Math.round(n.beat*1e4),Math.round(n.duration*1e4)].join('|');
const delta=(a,b)=>{const m=new Map();for(const x of b)m.set(x,(m.get(x)||0)+1);return a.filter(x=>{const c=m.get(x)||0;if(c){m.set(x,c-1);return false;}return true;});};
const rows=[];
for(const file of (await readdir(root+'/initial-results')).sort()){
 const row=JSON.parse(await readFile(root+'/initial-results/'+file)),reference=ref.regions.find(x=>x.id===row.id).result,result=row.result;
 const missing=delta(reference.score.notes.map(key),result.score.notes.map(key)),extra=delta(result.score.notes.map(key),reference.score.notes.map(key));
 rows.push({id:row.id,page:row.page,referenceHeads:reference.score.notes.length,returnedHeads:result.score.notes.length,matched:reference.score.notes.length-missing.length,missing,extra,comparison:compareRegionReadings(reference,result),checks:result.checks,independent:result.verification});
}
const report={at:new Date().toISOString(),reference:'Earlier source-reviewed transcription used only for offline audit, never supplied to DeepSeek. Differences require review of source pixels.',rows,referenceHeads:ref.regions.reduce((s,r)=>s+r.result.score.notes.length,0),returnedHeads:rows.reduce((s,r)=>s+r.returnedHeads,0),matched:rows.reduce((s,r)=>s+r.matched,0)};
await writeFile(root+'/audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({rows:rows.length,heads:report.returnedHeads,matched:report.matched,differences:rows.filter(r=>!r.comparison.exactMatch||!r.checks.passed).map(r=>({id:r.id,missing:r.missing.length,extra:r.extra.length,notation:r.comparison.notation?.differences,errors:[...new Set(r.checks.errors.map(e=>e.code))]})),independentDisagreements:rows.filter(r=>!r.independent?.comparison?.exactMatch).map(r=>r.id)},null,2));
