import {appendFile,mkdir,chmod} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {recognitionPolicy} from './recognition-policy.mjs';

// No images, prompts, credentials, titles or upstream error bodies in this ledger.
export function recognitionTrace(request,{path=resolve('.local/recognition-usage.jsonl')}={}) {
  const startedAt=new Date().toISOString(),start=performance.now(),requestAudit=[];
  const usage={input:0,output:0,totalTokens:0};let usageKnown=false,reportedUsageCalls=0;const reportedFields={input:0,output:0,totalTokens:0};let completion;
  return {
    observe(event){
      if(event.request)requestAudit.push({model:event.request.model,reasoningEffort:event.request.reasoningEffort});
      if(event.usage){reportedUsageCalls++;for(const key of Object.keys(usage))if(Number.isFinite(event.usage[key])&&event.usage[key]>=0){usage[key]+=event.usage[key];reportedFields[key]++;usageKnown=true;}}
    },
    async submission(record){
      // Source transcriptions are private evidence, separate from the usage-only ledger.
      const evidencePath=path+'.submissions.jsonl';
      await mkdir(dirname(evidencePath),{recursive:true,mode:0o700});
      await appendFile(evidencePath,JSON.stringify({jobId:request.jobId||null,regionId:request.region.id,page:request.region.page,system:request.region.system,...record})+'\n',{mode:0o600});
      await chmod(evidencePath,0o600);
    },
    async finish(status){
      if(completion)return completion;
      completion=(async()=>{
      const event={id:randomUUID(),jobId:request.jobId||null,regionId:request.region.id,page:request.region.page,system:request.region.system,pass:request.pass||'recognize',wireFormat:request.wireFormat||'verbose-v1',provider:request.engine||'pi',model:recognitionPolicy(request.engine).model,reasoningEffort:recognitionPolicy(request.engine).reasoningEffort,promptVersion:recognitionPolicy(request.engine).promptVersion,startedAt,endedAt:new Date().toISOString(),elapsedSeconds:(performance.now()-start)/1000,status,actualRequests:requestAudit.length,requestAudit,usageKnown,usageComplete:requestAudit.length>0&&Object.values(reportedFields).every(n=>n===requestAudit.length),reportedUsageCalls,reportedFields,usage:usageKnown?Object.fromEntries(Object.entries(usage).filter(([key])=>reportedFields[key]>0)):null};
      await mkdir(dirname(path),{recursive:true,mode:0o700});
      await appendFile(path,JSON.stringify(event)+'\n',{mode:0o600});await chmod(path,0o600);
      return event;
      })();return completion;
    },
  };
}
