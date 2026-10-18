import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FIVE_SCORES,inspectFiveSources,assertNewReading,withFreshTempoContext} from '../scripts/reread-five-high.mjs';
import {SCORE_RECOGNITION} from '../lib/recognition-policy.mjs';
import {PDFDocument} from 'pdf-lib';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC0lEQVR42mP8/x8AAusB9Wl6P7sAAAAASUVORK5CYII=','base64');
test('rows without printed tempo inherit only a fresh reading, with a labelled practice fallback',()=>{
 const request={metadata:{title:'source'},region:{id:'p2-s1',context:'4/4'}};
 const fresh=withFreshTempoContext(request,{score:{tempo:141,notes:['PRIVATE-NOTES']}});
 assert.equal(fresh.metadata.tempo,141);assert.ok(!JSON.stringify(fresh).includes('PRIVATE-NOTES'));
 assert.match(fresh.region.context,/原图明确印出的速度及音符单位优先/);
 const absent=withFreshTempoContext(request);assert.equal(absent.metadata.tempo,undefined);
 assert.match(absent.region.context,/可编辑的练习默认速度/);assert.equal(request.region.context,'4/4');
});
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'piano-five-source-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const sourceDirectory=join(root,'source'),jobsDirectory=join(root,'jobs');await mkdir(sourceDirectory);const jobs=[];
 for(const definition of FIVE_SCORES){
  const id='old-'+definition.key,folder=join(jobsDirectory,id);await mkdir(folder,{recursive:true});jobs.push({key:definition.key,id,token:'PRIVATE-OLD-TOKEN'});
  const regions=[];
  for(let page=1;page<=definition.pages;page++){
   const count=definition.key==='sudi'&&page===3?3:definition.key==='ifyou'&&page===1?5:1;
   for(let system=1;system<=count;system++){
    const rid=`p${page}-s${system}`;
    regions.push({id:rid,page,system,rect:{x:0,y:0,width:100,height:100},pageWidth:100,pageHeight:100,
     image:{mimeType:'image/png'},context:'原谱调号与拍号',result:'PRIVATE-OLD-NOTE-ANSWER',recognitionCheckpoint:'PRIVATE-OLD-NOTE-ANSWER'});
    await writeFile(join(folder,rid+'.image'),png);
   }
  }
  await writeFile(join(folder,'job.json'),JSON.stringify({id,totalPages:definition.pages,excludedPages:[],regions,
   metadata:{title:definition.title,tempo:90,timeSignature:[4,4],keySignature:0,oldAnswer:'PRIVATE-OLD-NOTE-ANSWER'}}));
  const pdf=await PDFDocument.create();for(let i=0;i<definition.pages;i++)pdf.addPage([100,100]);
  await writeFile(join(folder,'original.pdf'),await pdf.save());
 }
 await writeFile(join(sourceDirectory,'private-jobs.json'),JSON.stringify({jobs}));
 return {root,sourceDirectory,jobsDirectory};
}
test('the five-score preflight covers all 30 original pages and excludes prior answers and credentials',async t=>{
 const options=await fixture(t),{preflight,plans,fingerprint}=await inspectFiveSources(options);
 assert.equal(preflight.ready,true);assert.equal(preflight.modelCalls,0);assert.equal(plans.length,5);
 assert.equal(preflight.entries.reduce((sum,s)=>sum+s.pages,0),30);assert.equal(fingerprint.length,64);
 const sent=JSON.stringify(plans);assert.ok(!sent.includes('PRIVATE-OLD-NOTE-ANSWER'));assert.ok(!sent.includes('PRIVATE-OLD-TOKEN'));
 assert.ok(plans.every(p=>p.manifest.verify&&p.manifest.engine==='pi'));
 assert.ok(plans.every(p=>p.manifest.tempo===undefined),'prior practice BPM must not replace the fresh reading');
});
test('missing previously failed source rows or any page prevent starting the complete batch',async t=>{
 const options=await fixture(t),path=join(options.jobsDirectory,'old-sudi','job.json');
 const old=JSON.parse(await readFile(path));old.regions=old.regions.filter(r=>r.id!=='p3-s3');await writeFile(path,JSON.stringify(old));
 const {preflight}=await inspectFiveSources(options);assert.equal(preflight.ready,false);assert.equal(preflight.modelCalls,0);
 assert.ok(preflight.errors.some(e=>e.includes('p3-s3')));
 const missing=await inspectFiveSources({...options,sourceDirectory:join(options.root,'absent')});
 assert.equal(missing.preflight.ready,false);assert.equal(missing.plans.length,0);
});
test('batch accepts only actual high-model request audits with the new prompt, never a label alone',()=>{
 const current={model:SCORE_RECOGNITION.model,reasoningEffort:'high',promptVersion:SCORE_RECOGNITION.promptVersion,
  requestAudit:[{model:SCORE_RECOGNITION.model,reasoningEffort:'high'}]};
 assert.doesNotThrow(()=>assertNewReading(current));
 for(const change of [{model:'another-model'},{reasoningEffort:'low'},{promptVersion:'previous'},{requestAudit:[]},
  {requestAudit:[{model:SCORE_RECOGNITION.model,reasoningEffort:'low'}]}])assert.throws(()=>assertNewReading({...current,...change}));
});
