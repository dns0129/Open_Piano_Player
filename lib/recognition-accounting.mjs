const fields=['input','output','totalTokens'];
const number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;

export function providerUsage(value,mapping={input:'input',output:'output',totalTokens:'totalTokens'}){
  const entries=Object.entries(mapping).filter(([,key])=>number(value?.[key])).map(([key,source])=>[key,value[source]]);
  return entries.length?Object.fromEntries(entries):null;
}

// A partial sum is useful but never becomes a complete bill or a zero for an
// unreported request. Deduplicate persisted audit IDs when resuming a plan.
export function aggregateRecognitionUsage(audits){
  const unique=[],seen=new Set();
  for(const a of audits.filter(Boolean)){if(a.id&&seen.has(a.id))continue;if(a.id)seen.add(a.id);unique.push(a);}
  const sums={},reportedFields={input:0,output:0,totalTokens:0};let actualRequests=0,unknownRequestCounts=0;
  for(const a of unique){
    if(Number.isInteger(a.actualRequests)&&a.actualRequests>=0)actualRequests+=a.actualRequests;else unknownRequestCounts++;
    for(const f of fields)if(number(a.usage?.[f])){sums[f]=(sums[f]||0)+a.usage[f];reportedFields[f]+=a.reportedFields?.[f]??1;}
  }
  const usageComplete=!unknownRequestCounts&&actualRequests>0&&fields.every(f=>reportedFields[f]===actualRequests);
  return {usage:Object.keys(sums).length?sums:null,actualRequests:unknownRequestCounts?null:actualRequests,knownActualRequests:actualRequests,unknownRequestCounts,reportedFields,usageComplete,stages:unique.length};
}
