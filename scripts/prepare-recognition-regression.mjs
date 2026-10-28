import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceStatus=code=>code==='NEEDS_SOURCE'?'refused':'failed';

export async function prepareRecognitionRegression({dense,prelude,phone,p1,p1First,output}){
  output=resolve(output);await mkdir(output);const files=new Map(),cases=[],runs=[];
  const read=async(file,expected)=>{file=resolve(file);const b=await readFile(file),digest=sha(b);if(expected&&digest!==expected)throw Error('预先记录的输入哈希不符：'+file);files.set(file,digest);return b;};
  const json=async(file,expected)=>JSON.parse(await read(file,expected));
  const optional=async file=>{try{return await json(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
  const independentWritten=async(xml,name)=>{
    const bytes=await read(xml),out=join(output,name+'-independent-reference.json');
    execFileSync('python3',[fileURLToPath(new URL('./omr-benchmark/reference.py',import.meta.url)),xml,out,'--written'],{stdio:['ignore','pipe','pipe']});
    const ref=JSON.parse(await readFile(out));if(ref.sourceSha256!==sha(bytes))throw Error('独立 XML 解析来源不符');
    return ref;
  };
  if(dense){
    dense=resolve(dense);const manifest=await json(join(dense,'manifest.json')),run=await json(join(dense,'run.json'));
    const original={trial:'dense-historical-framework',caseIds:[],readings:[]},p0={trial:'dense-p0-offline-recovery',caseIds:[],readings:[]};
    for(const source of manifest){
      const originalReference=await json(join(dense,source.id,'reference-all.json'));await read(join(dense,source.id,'reference.musicxml'),originalReference.sourceSha256);await read(join(dense,source.id,'score.pdf'));
      const independent=await independentWritten(join(dense,source.id,'reference.musicxml'),source.id),byId=new Map(independent.notes.map(n=>[n.id,n]));
      const job=run.jobs.find(j=>j.key===source.id);if(!job)throw Error('缺少冻结任务映射');const final=await json(join(dense,source.id,'final-state.json'));
      for(const region of source.regions){
        await read(region.path,region.sha256);const reference=await json(join(dense,source.id,`reference-row-${region.system}.json`),region.referenceSha256);
        if(independent.sourceOctaveShiftMeasures.some(m=>m>=region.referenceRange[0]&&m<=region.referenceRange[1]))throw Error('参考范围存在尚未独立适配的八度记号');
        const notes=reference.notes.map(n=>{const full=byId.get(n.id);if(!full||['midi','duration','hand','localBeat','grace'].some(k=>full[k]!==n[k]))throw Error('独立 XML 音头身份或时值与冻结参考不符');return {...n,written:full.written};});
        const id=source.id+'/'+region.id;
        cases.push({id,dataset:'dense-pdf',eventUnit:'written-head',referenceLevel:'independent-musicxml',alignment:'frozen-row-relative',partition:'development',region:{id:region.id,page:region.page,system:region.system,rect:region.rect,pageWidth:region.pageWidth,pageHeight:region.pageHeight,measureCount:region.measureCount},sourceImage:{path:region.path,sha256:region.sha256},sourcePdf:join(dense,source.id,'score.pdf'),reference:{...reference,notes}});
        const saved=final.regions.find(r=>r.id===region.id);original.caseIds.push(id);original.readings.push({caseId:id,format:'region-result',status:saved?.result?'returned':sourceStatus(saved?.error?.code),value:saved?.result||null});
        const first=await optional(join(dense,'raw-calls',`${job.id}-${region.id}-first.json`)),fallback=await optional(join(dense,'raw-calls',`${job.id}-${region.id}-fallback-wire.json`));
        p0.caseIds.push(id);p0.readings.push({caseId:id,format:first?.result?'region-result':'compact',status:first?.result||fallback?.raw?'returned':sourceStatus(first?.error?.code),value:first?.result||fallback?.raw||null});
      }
    }
    runs.push(original,p0);
  }
  if(prelude){
    prelude=resolve(prelude);const integrity=await json(join(prelude,'文件校验.json')),expected=new Map(integrity.map(f=>[f.path,f.sha256]));
    if(!expected.has('reference/reference.json')||!expected.has('reference/source.musicxml'))throw Error('前奏曲缺少历史导出文件哈希');
    const protocol=await json(join(prelude,'protocol.json'),expected.get('protocol.json')),frozen=await json(join(prelude,'reference/reference.json'),expected.get('reference/reference.json'));
    await read(join(prelude,'reference/source.musicxml'),expected.get('reference/source.musicxml'));const reference=await independentWritten(join(prelude,'reference/source.musicxml'),'prelude');
    if(reference.sourceOctaveShiftMeasures.length)throw Error('前奏曲含未适配八度语义');
    if(reference.notes.length!==frozen.notes.length||reference.notes.some((n,i)=>['id','midi','beat','duration','hand','grace'].some(k=>n[k]!==frozen.notes[i][k])))throw Error('前奏曲独立参考与既有冻结不一致');
    for(const image of protocol.pages)await read(join(prelude,image.path),image.sha256);
    const id='prelude-two-pages';cases.push({id,dataset:'prelude',eventUnit:'written-head',referenceLevel:'independent-musicxml',alignment:'frozen-document-relative',partition:'development',reference,sourceImages:protocol.pages.map(p=>({path:join(prelude,p.path),sha256:p.sha256}))});
    for(const effort of ['low','high','max']){const value=await json(join(prelude,'runs',effort,'transcription.json')),raw=await json(join(prelude,'runs',effort,'raw.json'));
      runs.push({trial:'prelude-client-'+effort,caseIds:[id],readings:[{caseId:id,format:'normalized-events',status:raw.complete?'returned':'partial',value:{notes:value.notes,measureDurations:value.measures.map(m=>m.duration),checksPassed:raw.complete&&value.issues.length===0}}]});}
  }
  if(phone){
    phone=resolve(phone);const protocol=await json(join(phone,'protocol.json')),roster=await json(fileURLToPath(new URL('../docs/phone-score-samples-20261021.json',import.meta.url)));const annotated=new Map();
    const previousReport=await json(fileURLToPath(new URL('../docs/phone-score-accuracy-20261021.json',import.meta.url)));
    for(const [id,name]of [['p21_q1','reference-p21-bars1-2.json'],['p10_q1','reference-p10-bar5.json']]){
      const expected=previousReport.independentAgentVisualSubset.references.find(r=>r.sampleId===id)?.referenceHash;if(!expected)throw Error('照片参考缺少历史冻结哈希');annotated.set(id,await json(join(phone,name),expected));
    }
    const photoRun={trial:'phone-historical-whole-photo',caseIds:[],readings:[]};
    const sampleIds=Array.isArray(protocol.samples)?protocol.samples:roster.samples;
    if(!Array.isArray(sampleIds)||typeof protocol.samples==='number'&&sampleIds.length!==protocol.samples)throw Error('照片固定清单与原协议数量不一致');
    for(const id of sampleIds){
      const name=typeof id==='string'?id:id.id;if(!name)throw Error('照片范围缺少固定 ID');
      const photo=roster.samples.find(s=>s.id===name);if(!photo)throw Error('照片不属于预先登记范围');await read(join(roster.local_directory,'queries',basename(photo.file)),photo.sha256);
      const run=await optional(join(phone,name,'run.json')),raw=await optional(join(phone,name,'raw.json')),reference=annotated.get(name);
      const caseId='phone/'+name;cases.push({id:caseId,dataset:'phone-photos',eventUnit:'written-head',referenceLevel:'agent-visual-subset-unconfirmed',alignment:'annotated-bar-local',partition:'development',sourceImage:{path:join(roster.local_directory,'queries',basename(photo.file)),sha256:photo.sha256},reference:reference?{notes:reference.notes,compareMeasure:true}:null});
      photoRun.caseIds.push(caseId);photoRun.readings.push({caseId,format:'photo-subset',status:raw?.raw?.complete===false?'partial':run?.status==='returned'?'returned':sourceStatus(run?.error?.code),value:raw?.raw||null});
    }runs.push(photoRun);
    const crop=await optional(join(phone,'system-crop/raw.json'));if(crop){const id='phone/p21-single-system';cases.push({id,dataset:'phone-system-crop',eventUnit:'written-head',referenceLevel:'agent-visual-subset-unconfirmed',alignment:'annotated-bar-local',partition:'development',reference:{notes:annotated.get('p21_q1').notes,compareMeasure:true}});runs.push({trial:'phone-single-system-supplement',caseIds:[id],readings:[{caseId:id,format:'photo-subset',status:crop.raw?.complete?'returned':'partial',value:crop.raw}]});}
  }
  if(p1){
    p1=resolve(p1);const protocol=await json(join(p1,'protocol.json')),run={trial:'p1-context-live-development',caseIds:[],readings:[]};
    for(const source of protocol.scope){const c=cases.find(c=>c.id===source.source+'/'+source.region);if(!c||c.sourceImage.sha256!==source.sourceSha256)throw Error('P1 请求范围与已冻结原图不符');const record=await json(join(p1,source.source+'-result.json')),result=record.result,raw=result?.submissionAudit?.findLast(a=>a.raw?.notation)?.raw;
      if(!raw)throw Error('P1 缺少未修改的原始结构化提交');run.caseIds.push(c.id);run.readings.push({caseId:c.id,format:'compact',status:'returned',value:raw});}
    runs.push(run);
  }
  if(p1First){
    p1First=resolve(p1First);const protocol=await json(join(p1First,'protocol.json')),run={trial:'p1-initial-without-context',caseIds:[],readings:[]};
    for(const source of protocol.scope){const c=cases.find(c=>c.id===source.source+'/'+source.region);if(!c||c.sourceImage.sha256!==source.sourceSha256)throw Error('P1 初始失败范围与固定原图不符');const record=await json(join(p1First,source.source+'-result.json'));
      run.caseIds.push(c.id);run.readings.push({caseId:c.id,format:'region-result',status:record.result?'returned':sourceStatus(record.error?.code),value:record.result||null});}
    runs.push(run);
  }
  if(!cases.length||!runs.length)throw Error('至少提供一种可核验回归来源');
  const suite={schema:'recognition-regression-suite/v1',frozenAt:new Date().toISOString(),files:[...files].map(([path,sha256])=>({path,sha256})),cases,runs,
    referencePolicy:'Original hashes and independent XML identity checked. Written spelling is XML truth; printed accidental/rest truth remains unknown unless explicitly supplied. Phone reference is unconfirmed agent visual subset.',holdout:false};
  await writeFile(join(output,'suite.json'),JSON.stringify(suite,null,2)+'\n',{flag:'wx',mode:0o600});return {file:join(output,'suite.json'),cases:cases.length,runs:runs.length,files:files.size};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),value=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined;
  try{if(!value('--out'))throw Error('用法：--dense DIR [--prelude DIR] [--phone DIR] [--p1 DIR] [--p1-first DIR] --out NEW_DIRECTORY');console.log(JSON.stringify(await prepareRecognitionRegression({dense:value('--dense'),prelude:value('--prelude'),phone:value('--phone'),p1:value('--p1'),p1First:value('--p1-first'),output:value('--out')})));}catch(e){console.error(e.message);process.exitCode=1;}
}
