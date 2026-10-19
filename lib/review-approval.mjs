// An approved agent review remains distinct from a person's manual confirmation.
export function hasApprovedAgentReview(job) {
  const result=job?.result,review=result?.review,a=review?.approval,c=a?.coverage,score=result?.score;
  return result?.reviewStatus==='model-reviewed' && review?.humanConfirmed===false
    && a?.status==='approved' && a.actor==='Codex' && a.method==='full-source-visual-review'
    && a.authorizedByUser===true && a.humanConfirmed===false
    && Number.isFinite(Date.parse(a.approvedAt)) && /^[a-f0-9]{64}$/.test(a.reportSha256||'')
    && ['pages','systems','measures','notes'].every(key=>Number.isInteger(c?.[key])&&c[key]>0)
    && c.pages===job.totalPages && c.systems===job.regions?.length
    && c.measures===score?.measureMap?.length && c.notes===score?.notes?.length
    && Array.isArray(a.unresolvedNoteIssues) && a.unresolvedNoteIssues.length===0;
}
