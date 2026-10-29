import {readFile,writeFile,readdir} from 'node:fs/promises';
import {compareRegionReadings} from '../../lib/recognition-comparison.mjs';
const root='.local/hanting-sol-low-six-pages-20261017';
const ref=JSON.parse(await readFile('.local/full-score-jobs/feb36563796cd9a9b7f118a809ad559fe4dc/job.json'));
const event=n=>[n.midi,n.hand,Math.round(n.beat*1e4),Math.round(n.duration*1e4)].join('|');
const delta=(a,b)=>{const m=new Map();for(const x of b)m.set(x,(m.get(x)||0)+1);return a.filter(x=>{const c=m.get(x)||0;if(c){m.set(x,c-1);return false;}return true;});};
const rows=[];
for(const file of (await readdir(root+'/initial-results')).sort()){
 const r=JSON.parse(await readFile(root+'/initial-results/'+file)),a=ref.regions.find(x=>x.id===r.id).result,b=r.result;
 const missing=delta(a.score.notes.map(event),b.score.notes.map(event)),extra=delta(b.score.notes.map(event),a.score.notes.map(event));
 rows.push({id:r.id,referenceHeads:a.score.notes.length,returnedHeads:b.score.notes.length,matched:a.score.notes.length-missing.length,missing,extra,comparison:compareRegionReadings(a,b),checks:b.checks,independent:b.verification});
}
const out={at:new Date().toISOString(),reference:'Source-reviewed high final; comparison only, never provided as model input',rows,referenceHeads:ref.regions.reduce((s,r)=>s+r.result.score.notes.length,0),returnedHeads:rows.reduce((s,r)=>s+r.returnedHeads,0),matched:rows.reduce((s,r)=>s+r.matched,0)};
await writeFile(root+'/audit.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({rows:rows.length,heads:out.returnedHeads,matched:out.matched,differences:rows.filter(r=>!r.comparison.exactMatch||!r.checks.passed).map(r=>({id:r.id,missing:r.missing,extra:r.extra,notation:r.comparison.notation,errors:r.checks.errors})),independentDisagreements:rows.filter(r=>!r.independent?.comparison?.exactMatch).map(r=>r.id)},null,2));
