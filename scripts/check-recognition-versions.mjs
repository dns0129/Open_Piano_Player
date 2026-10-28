import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {RECOGNITION_VERSIONS as versions} from '../lib/recognition-versions.mjs';
import {RECOGNITION_PROMPT_VERSION} from '../lib/recognition-prompts.mjs';
import {WIRE_VERSION} from '../lib/recognition-wire.mjs';
import {CACHE_VERSION} from '../lib/recognition-cache.mjs';
const docs=['README.md','docs/recognition-strategy.md','skills/piano-score-to-musicxml/references/app-integration.md'];
export async function checkRecognitionVersions(root,{write=false}={}){
  const marker='<!-- recognition-current '+JSON.stringify(versions)+' -->',pattern=/<!-- recognition-current [^\n]* -->/g;
  const json=async p=>JSON.parse(await readFile(join(root,p),'utf8'));
  if(RECOGNITION_PROMPT_VERSION!==versions.prompt||WIRE_VERSION!==versions.wire||CACHE_VERSION!==versions.cache)throw Error('代码的识别组件版本不一致');
  const pkg=await json('package.json'),skill=await json('skills/piano-score-to-musicxml/package.json'),lock=await json('skills/piano-score-to-musicxml/package-lock.json');
  const skillText=await readFile(join(root,'skills/piano-score-to-musicxml/SKILL.md'),'utf8');
  if(pkg.engines.node!=='>='+versions.nodeMinimum||skill.engines.node!==pkg.engines.node)throw Error('Node 最低版本与运行契约不一致');
  if((await readFile(join(root,'.nvmrc'),'utf8')).trim()!==versions.nodePreferred)throw Error('.nvmrc 与推荐运行时不一致');
  if(!/^\s+node-version-file:\s*\.nvmrc\s*$/m.test(await readFile(join(root,'.github/workflows/check.yml'),'utf8')))throw Error('CI 必须复用 .nvmrc');
  if(skill.version!==versions.skill||lock.version!==skill.version||lock.packages[''].version!==skill.version||skillText.match(/^\s+version:\s*"?([\d.]+)/m)?.[1]!==skill.version)throw Error('Skill 元数据、包及锁文件版本不一致');
  for(const file of docs){let text=await readFile(join(root,file),'utf8');
    if(write){text=pattern.test(text)?text.replace(pattern,marker):text.replace(/\n/,'\n\n'+marker+'\n');await writeFile(join(root,file),text);}
    pattern.lastIndex=0;const found=text.match(pattern);if(found?.length!==1||found[0]!==marker)throw Error(file+' 的当前组件版本已过期，运行 recognition:versions -- --write 更新');
  }
  const target=join(root,'docs/recognition-versions.json'),expected={schema:'recognition-versions/v1',...versions};
  if(write)await writeFile(target,JSON.stringify(expected,null,2)+'\n');
  if(!isDeepStrictEqual(await json('docs/recognition-versions.json'),expected))throw Error('识别版本清单不一致');
  if((await json('docs/recognition-regression-corpus.json')).version!==versions.corpus)throw Error('固定语料登记与回归集版本不一致');
  return {versions,documents:docs.length,skill:skill.version};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const result=await checkRecognitionVersions(fileURLToPath(new URL('..',import.meta.url)),{write:process.argv.includes('--write')});console.log(JSON.stringify(result));}catch(e){console.error(e.message);process.exitCode=1;}
}
