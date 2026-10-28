import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {recognitionPromptFingerprint,recognitionReleaseFingerprint} from '../lib/recognition-governance.mjs';
import {compareRegressionSuites} from '../lib/recognition-regression-io.mjs';
import {RECOGNITION_VERSIONS} from '../lib/recognition-versions.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const compact=run=>({trial:run.trial,scopeRows:run.scopeRows,rows:run.rows.map(r=>({caseId:r.caseId})),groups:run.groups});
export async function recordRecognitionRelease(root,evaluationFile){
  const bytes=await readFile(evaluationFile),evaluation=JSON.parse(bytes),implementation=await recognitionReleaseFingerprint(root),prompt=await recognitionPromptFingerprint(root);
  if(evaluation.schema!=='recognition-release-evaluation/v1'||!evaluation.before||!evaluation.after||evaluation.implementation.digest!==implementation.digest||evaluation.prompt.digest!==prompt.digest)throw Error('评测与当前实现不一致，请重新执行回归');
  if(evaluation.independentVerification?.passed!==true)throw Error('缺少独立评分器核验');
  if(!['offline-frozen-responses','live-first-read'].includes(evaluation.mode)||evaluation.mode==='live-first-read'&&evaluation.providerCalls<=0)throw Error('评测方式与真实调用证据不符');
  for(const f of evaluation.sourceFiles)if(sha(await readFile(f.path))!==f.sha256)throw Error('冻结评测输入已变化');
  if(!compareRegressionSuites(evaluation.before,evaluation.after).passed)throw Error('固定回归发生退化，不能生成通过的发布证据');
  if(evaluation.mode==='offline-frozen-responses'&&evaluation.baselinePrompt.digest!==prompt.digest)throw Error('模型输入文本已变化，离线重放不能证明新提示词准确率；需要固定范围的真实新读取');
  let prior;try{prior=JSON.parse(await readFile(join(root,'docs/recognition-release-evidence.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!evaluation.corpusScopeSha256)throw Error('缺少固定来源与参考范围的指纹');
  if(prior?.corpus?.version===RECOGNITION_VERSIONS.corpus&&prior.corpus.scopeSha256!==evaluation.corpusScopeSha256)throw Error('固定来源、参考或运行范围已变化；不能沿用同一回归集版本');
  const evidence={schema:'recognition-release-evidence/v1',release:RECOGNITION_VERSIONS.release,recordedAt:new Date().toISOString(),implementation,prompt,
    corpus:{version:RECOGNITION_VERSIONS.corpus,scopeSha256:evaluation.corpusScopeSha256},
    evaluation:{mode:evaluation.mode,providerCalls:evaluation.providerCalls,sourceEvaluationSha256:sha(bytes),suiteSha256:evaluation.suiteSha256,sourceFiles:evaluation.sourceFiles.length,baselinePromptDigest:evaluation.baselinePrompt.digest,independentVerification:evaluation.independentVerification,
      before:evaluation.before.map(compact),after:evaluation.after.map(compact)},
    limitations:[evaluation.mode==='live-first-read'?'New first reads on the explicitly declared fixed scope.':'Historical frozen responses, not a new visual-model trial.','Development sets only; no holdout guarantee.','Source tiers and event units are not pooled.','Printed accidental/rest truth is unknown unless independently supplied.']};
  await writeFile(join(root,'docs/recognition-release-evidence.json'),JSON.stringify(evidence,null,2)+'\n');return evidence;
}
export async function checkRecognitionRelease(root){
  const evidence=JSON.parse(await readFile(join(root,'docs/recognition-release-evidence.json'),'utf8'));
  const implementation=await recognitionReleaseFingerprint(root),prompt=await recognitionPromptFingerprint(root);
  if(evidence.schema!=='recognition-release-evidence/v1'||evidence.release!==RECOGNITION_VERSIONS.release)throw Error('识别发布证据缺失或版本过期');
  if(evidence.corpus?.version!==RECOGNITION_VERSIONS.corpus||!evidence.corpus.scopeSha256)throw Error('固定回归集版本或来源范围未绑定');
  if(evidence.implementation.digest!==implementation.digest)throw Error('识别实现已变化：先重跑固定回归，再更新发布证据');
  if(evidence.prompt.digest!==prompt.digest||evidence.evaluation.mode==='offline-frozen-responses'&&evidence.evaluation.baselinePromptDigest!==prompt.digest)throw Error('模型输入文本变化不能沿用旧识别证据，需要真实新读取');
  const comparison=compareRegressionSuites(evidence.evaluation.before,evidence.evaluation.after);if(!comparison.passed)throw Error('识别发布记录的比较未通过');
  return {release:evidence.release,mode:evidence.evaluation.mode,runs:comparison.runs.length,regressionPassed:true,newVisualAccuracyClaim:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const root=fileURLToPath(new URL('..',import.meta.url));const i=process.argv.indexOf('--attest');if(i>=0)await recordRecognitionRelease(root,resolve(process.argv[i+1]));console.log(JSON.stringify(await checkRecognitionRelease(root)));}catch(e){console.error(e.message);process.exitCode=1;}
}
