import {appendFile,mkdir,chmod} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {SCORE_RECOGNITION,recognitionPolicy} from './recognition-policy.mjs';

// No images, prompts, credentials, titles or upstream error bodies in this ledger.
export function recognitionTrace(request,{path=resolve('.local/recognition-usage.jsonl')}={}) {
  const startedAt=new Date().toISOString(),start=performance.now(),requestAudit=[];
  const usage={input:0,output:0,totalTokens:0};let usageKnown=false;
  return {
    observe(event){
      if(event.request)requestAudit.push({model:event.request.model,reasoningEffort:event.request.reasoningEffort});
      if(event.usage){for(const key of Object.keys(usage))usage[key]+=Number(event.usage[key])||0;usageKnown ||=Number(event.usage.totalTokens)>0;}
    },
    async finish(status){
      const event={id:randomUUID(),jobId:request.jobId||null,regionId:request.region.id,page:request.region.page,system:request.region.system,pass:request.pass||'recognize',wireFormat:request.wireFormat||'verbose-v1',provider:request.engine||'pi',model:recognitionPolicy(request.engine).model,reasoningEffort:recognitionPolicy(request.engine).reasoningEffort,startedAt,endedAt:new Date().toISOString(),elapsedSeconds:(performance.now()-start)/1000,status,actualRequests:requestAudit.length,requestAudit,usageKnown,usage:usageKnown?usage:null};
      await mkdir(dirname(path),{recursive:true,mode:0o700});
      await appendFile(path,JSON.stringify(event)+'\n',{mode:0o600});await chmod(path,0o600);
      return event;
    },
  };
}
