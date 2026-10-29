import {readFile,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const sha=b=>createHash('sha256').update(b).digest('hex');
const promptFiles=['lib/ai.mjs','lib/digital-recognition.mjs','lib/recognition-policy.mjs','lib/recognition-prompts.mjs','lib/recognition-wire.mjs','lib/source-assessment.mjs','lib/accounts/recognition-provider.mjs'];
const versionNames=new Set(['RECOGNITION_PROMPT_VERSION','WIRE_VERSION']);
// Ignore imports and the separately checked component labels. Keep complete
// template expressions, including substitutions, so edited model text blocks
// require new live evidence rather than an offline decoder replay.
export async function recognitionPromptFingerprint(root){
  const files=[];
  for(const file of promptFiles){const source=ts.createSourceFile(file,await readFile(join(root,file),'utf8'),ts.ScriptTarget.Latest,true),texts=[];
    function visit(node){
      if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)||ts.isVariableDeclaration(node)&&versionNames.has(node.name.getText(source)))return;
      if(ts.isFunctionDeclaration(node)&&node.name?.text==='normalizeProviderUsage')return;
      if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)){texts.push(node.text);return;}
      if(ts.isTemplateExpression(node)){texts.push(node.getText(source));return;}
      ts.forEachChild(node,visit);
    }visit(source);files.push({file,digest:sha(JSON.stringify(texts))});
  }
  for(const file of ['lib/recognition-regions.mjs','lib/recognition-image-input.mjs','lib/score-image-layout.mjs','lib/accounts/recognition-source.mjs'])files.push({file,digest:sha(await readFile(join(root,file)))});
  return {digest:sha(JSON.stringify(files)),files};
}
export async function recognitionReleaseFingerprint(root){
  const paths=[];
  async function collect(folder,predicate){for(const e of await readdir(join(root,folder),{withFileTypes:true})){const p=join(folder,e.name);if(e.isDirectory()){if(e.name!=='node_modules')await collect(p,predicate);}else if(predicate(p))paths.push(p);}}
  await collect('lib',p=>/(?:recognition-|full-score-|score-region|score-validation|score-notation-data|score-types|ai\.|digital-recognition|deepseek-vision|exporters\.|importers\.|node-runtime)/.test(p)&&/\.(?:mjs|ts)$/.test(p));
  await collect('skills/piano-score-to-musicxml/scripts',p=>p.endsWith('.mjs')&&!p.endsWith('self-test.mjs'));
  for(const file of ['scripts/prepare-recognition-regression.mjs','scripts/check-recognition-versions.mjs','scripts/check-recognition-release.mjs','scripts/recognition-regression.mjs','scripts/verify-recognition-regression.py','scripts/with-node.mjs','scripts/omr-benchmark/reference.py','skills/piano-score-to-musicxml/package.json','lib/source-assessment.mjs','lib/score-image-layout.mjs','lib/omr-review.mjs','src/import-flows.js','src/full-score-import.js','src/full-score-import-parts.js','src/recognition-written-editor.js'])paths.push(file);
  const files=[];for(const p of [...new Set(paths)].sort())files.push({path:relative(root,join(root,p)),sha256:sha(await readFile(join(root,p)))});
  return {digest:sha(JSON.stringify(files)),files};
}
