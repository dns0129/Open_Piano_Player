import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepareRecognitionRegression} from './prepare-recognition-regression.mjs';
import {verifiedRegressionSuite,evaluateRegressionSuite,compareRegressionSuites,regressionScopeFingerprint} from '../lib/recognition-regression-io.mjs';
import {recognitionPromptFingerprint,recognitionReleaseFingerprint} from '../lib/recognition-governance.mjs';
import {recordRecognitionRelease} from './check-recognition-release.mjs';
import {runLiveRecognitionRegression} from '../lib/recognition-live-regression.mjs';
export async function evaluateFrozenRecognition({suiteFile,baselineRoot,liveResultFile,output,root=fileURLToPath(new URL('..',import.meta.url))}){
  const {suite,sha256}=await verifiedRegressionSuite(suiteFile);
  const oracleRuns=[],prompt=await recognitionPromptFingerprint(root),implementation=await recognitionReleaseFingerprint(root);
  let currentSuite=suite,live=null;
  if(liveResultFile){
    live=JSON.parse(await readFile(liveResultFile,'utf8'));const scope=suite.cases.filter(c=>c.sourceImage&&c.sourcePdf).map(c=>c.id);
    if(live.schema!=='recognition-live-result/v1'||live.protocol.suiteSha256!==sha256||live.protocol.promptFingerprint!==prompt.digest||live.protocol.implementationFingerprint!==implementation.digest||JSON.stringify(live.protocol.caseIds)!==JSON.stringify(scope)||live.providerCalls<scope.length)throw Error('真实读取证据未覆盖当前版本和全部固定范围');
    for(const r of live.responses)if(r.result&&(!r.result.requestAudit?.length||r.result.requestAudit.some(a=>a.model!=='gpt-6.1-sol'||a.reasoningEffort!=='high')))throw Error('真实读取缺少模型/档位凭据');
    currentSuite={...suite,runs:[{trial:'live-first-read',caseIds:scope,readings:live.responses.map(r=>({caseId:r.caseId,format:'region-result',status:r.result?'returned':r.error?.code==='NEEDS_SOURCE'?'refused':'failed',value:r.result}))}]};
  }
  const after=evaluateRegressionSuite(currentSuite,{onDecoded:r=>oracleRuns.push(r)});
  let before=null,baselinePrompt=null;
  if(baselineRoot){
    const [wire,region]=await Promise.all([import(pathToFileURL(join(baselineRoot,'lib/recognition-wire.mjs')).href),import(pathToFileURL(join(baselineRoot,'lib/score-region.mjs')).href)]);
    const baselineSuite=live?{...suite,runs:suite.runs.filter(r=>r.trial==='dense-p0-offline-recovery').map(r=>({...r,trial:'live-first-read'}))}:suite;
    before=evaluateRegressionSuite(baselineSuite,{adapter:{decode:wire.decodeCompactRegion,validate:region.validateRegionResult}});baselinePrompt=await recognitionPromptFingerprint(baselineRoot);
  }
  await mkdir(dirname(output),{recursive:true});const oracleFile=output+'.independent-input.json',oracleReport=output+'.independent-check.json';
  await writeFile(oracleFile,JSON.stringify({runs:oracleRuns}),{flag:'wx',mode:0o600});
  execFileSync('python3',[join(root,'scripts/verify-recognition-regression.py'),oracleFile,oracleReport],{stdio:['ignore','pipe','pipe']});
  const verification=JSON.parse(await readFile(oracleReport,'utf8')),files=[...suite.files];
  if(liveResultFile)files.push({path:liveResultFile,sha256:createHash('sha256').update(await readFile(liveResultFile)).digest('hex')});
  for(const file of [oracleFile,oracleReport])files.push({path:file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});
  const result={schema:'recognition-release-evaluation/v1',evaluatedAt:new Date().toISOString(),mode:live?'live-first-read':'offline-frozen-responses',providerCalls:live?.providerCalls||0,suiteSha256:sha256,corpusScopeSha256:regressionScopeFingerprint(suite),sourceFiles:files,independentVerification:verification,
    implementation,prompt,baselinePrompt,before,after,comparison:before?compareRegressionSuites(before,after):null};
  await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [action,...args]=process.argv.slice(2),value=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined;
  try{
    if(action==='prepare'){
      if(!value('--out'))throw Error('prepare 需要 --out NEW_DIRECTORY');console.log(JSON.stringify(await prepareRecognitionRegression({dense:value('--dense'),prelude:value('--prelude'),phone:value('--phone'),p1:value('--p1'),p1First:value('--p1-first'),output:resolve(value('--out'))})));
    }else if(action==='evaluate'){
      if(!value('--suite')||!value('--out'))throw Error('evaluate 需要 --suite FILE --out NEW_FILE，可用 --baseline-code DIR --attest');
      const root=fileURLToPath(new URL('..',import.meta.url)),output=resolve(value('--out'));
      const r=await evaluateFrozenRecognition({root,suiteFile:resolve(value('--suite')),baselineRoot:value('--baseline-code')?resolve(value('--baseline-code')):null,liveResultFile:value('--live-result')?resolve(value('--live-result')):null,output});
      if(args.includes('--attest'))await recordRecognitionRelease(root,output);
      console.log(JSON.stringify({providerCalls:r.providerCalls,comparison:r.comparison,promptUnchanged:r.baselinePrompt?.digest===r.prompt.digest,runs:r.after.map(run=>({trial:run.trial,groups:run.groups.map(g=>({dataset:g.dataset,rows:g.rows,scorableRows:g.scorableRows,strict:g.strict,spelling:g.writtenSpelling,statuses:g.statuses}))}))},null,2));
      if(r.comparison&&!r.comparison.passed)process.exitCode=1;
    }else if(action==='live'){
      if(!value('--suite')||!value('--out')||!value('--budget'))throw Error('live 需要 --suite FILE --out NEW_DIRECTORY --budget 总调用数，未声明预算时不发请求');
      const r=await runLiveRecognitionRegression({suiteFile:resolve(value('--suite')),output:resolve(value('--out')),maxCalls:Number(value('--budget'))});console.log(JSON.stringify({providerCalls:r.providerCalls,comparison:r.comparison,groups:r.after.groups},null,2));if(!r.comparison.passed)process.exitCode=1;
    }else throw Error('用法：recognition:regression prepare --dense DIR [--prelude DIR --phone DIR --p1 DIR] --out NEW_DIRECTORY；evaluate --suite FILE --baseline-code DIR --out NEW_FILE [--attest]。这两项均离线。真实读取另用 live --suite FILE --out NEW_DIRECTORY --budget N，必须显式选择。');
  }catch(e){console.error(e.message);process.exitCode=1;}
}
