import {createHash} from 'node:crypto';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])])):value;

// Capture after actual source review; never call this to auto-approve legacy work.
export function agentReviewBasis(job){
  return createHash('sha256').update(JSON.stringify(canonical({
    score:job.result?.score,sourceNotation:job.result?.sourceNotation,totalPages:job.totalPages,
    regions:(job.regions||[]).map(r=>({id:r.id,page:r.page,system:r.system,rect:r.rect,imageSha256:r.image?.sha256,
      score:r.result?.score,positions:r.result?.positions,rests:r.result?.rests,coverage:r.result?.coverage,continuity:r.result?.continuity,internalTies:r.result?.internalTies})),
  }))).digest('hex');
}

// An approved agent review remains distinct from a person's manual confirmation.
export function hasApprovedAgentReview(job) {
  const result=job?.result,review=result?.review,a=review?.approval,c=a?.coverage,score=result?.score;
  return result?.reviewStatus==='model-reviewed' && review?.humanConfirmed===false
    && a?.status==='approved' && a.actor==='Codex' && a.method==='full-source-visual-review'
    && a.authorizedByUser===true && a.humanConfirmed===false
    && Number.isFinite(Date.parse(a.approvedAt)) && /^[a-f0-9]{64}$/.test(a.reportSha256||'')
    && a.basis===agentReviewBasis(job)
    && ['pages','systems','measures','notes'].every(key=>Number.isInteger(c?.[key])&&c[key]>0)
    && c.pages===job.totalPages && c.systems===job.regions?.length
    && c.measures===score?.measureMap?.length && c.notes===score?.notes?.length
    && Array.isArray(a.unresolvedNoteIssues) && a.unresolvedNoteIssues.length===0;
}
