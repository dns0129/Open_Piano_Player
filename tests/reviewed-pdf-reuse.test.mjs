import test from 'node:test';import assert from 'node:assert/strict';
import {findReviewedPdf} from '../lib/reviewed-pdf-reuse.mjs';
const hash='a'.repeat(64),job={id:'source',status:'complete',originalPdf:{sha256:hash},result:{scope:{completeDocument:true},reviewStatus:'human-confirmed'},regions:[{status:'confirmed',result:{model:'gpt-6.1-sol',reasoningEffort:'high',checks:{passed:true},score:{notes:[{}]},positions:[{}]}}]};
test('same PDF reuses only fully reviewed GPT source; failed authorization and partial/legacy scores are skipped',async()=>{
 assert.equal((await findReviewedPdf(hash,['old','valid'],async id=>id==='old'?{...job,regions:[{status:'confirmed',result:{model:'audiveris'}}]}:job)).reusedExactPdf,true);
 assert.equal(await findReviewedPdf('b'.repeat(64),['valid'],async()=>job),null);
 assert.equal(await findReviewedPdf(hash,['unavailable'],async()=>{throw Error('denied');}),null);
 assert.equal(await findReviewedPdf(hash,['partial'],async()=>({...job,result:{...job.result,scope:{completeDocument:false}}})),null);
});
test('exact PDF reuse is isolated by recognition provider',async()=>{
 assert.equal(await findReviewedPdf(hash,['pi'],async()=>job,'deepseek'),null);
 const ds={...job,engine:'deepseek',regions:job.regions.map(r=>({...r,result:{...r.result,model:'deepseek-flash'}}))};
 assert.equal((await findReviewedPdf(hash,['ds'],async()=>ds,'deepseek')).reusedExactPdf,true);
 assert.equal(await findReviewedPdf(hash,['ds'],async()=>ds,'pi'),null);
});
