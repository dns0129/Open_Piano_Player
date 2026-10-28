import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

// Freeze an existing independent benchmark. No credentials or private job-auth
// files are read, and no reference is passed to a model.
export async function freezeRecognitionBaseline(root,output){
  root=resolve(root);
  const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
  const run=JSON.parse(await readFile(join(root,'run.json'),'utf8'));
  const files=[],seen=new Set();
  const add=async(file,expected,optional=false)=>{
    file=resolve(file);if(!file.startsWith(root+'/'))throw Error('评测输入必须位于原评测目录内');
    let bytes;try{bytes=await readFile(file);}catch(e){if(optional&&e.code==='ENOENT')return;throw e;}
    const digest=sha(bytes);if(expected&&digest!==expected)throw Error('独立参考或原图哈希变化');
    if(!seen.has(file)){files.push({path:file,sha256:digest});seen.add(file);}
  };
  for(const name of ['manifest.json','run.json','protocol.json'])await add(join(root,name));
  await add(join(root,'protocol-addendum.json'),null,true);
  for(const source of manifest){
    const job=run.jobs.find(j=>j.key===source.id);if(!job)throw Error('缺少原始任务映射');
    await add(join(root,source.id,'final-state.json'));
    for(const r of source.regions){
      await add(r.path,r.sha256);await add(join(root,source.id,`reference-row-${r.system}.json`),r.referenceSha256);
      for(const suffix of ['first','fallback','fallback-wire'])await add(join(root,'raw-calls',`${job.id}-${r.id}-${suffix}.json`),null,true);
    }
  }
  const baseline={schema:'recognition-p0-baseline/v1',frozenAt:new Date().toISOString(),referenceLevel:'same-edition independent MusicXML',scope:'fixed historical ordinary-note benchmark; no spelling/rest/performance truth',files};
  await writeFile(output,JSON.stringify(baseline,null,2)+'\n',{flag:'wx',mode:0o600});
  return baseline;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const [root,output]=process.argv.slice(2);if(!root||!output)throw Error('用法：node scripts/freeze-recognition-baseline.mjs ORIGINAL_ROOT NEW_BASELINE');
  const result=await freezeRecognitionBaseline(root,output);console.log(JSON.stringify({files:result.files.length,output}));
}
