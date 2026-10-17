const clean=(value,max=500)=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,' ').slice(0,max):'';
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const kinds=new Set(['triplet-duration','grace-timing','grace-accidental','tie-voice','tie-source']);

/** Bounded, credential-free notation evidence shared by the server and editor. */
export function normalizeOmrReview(raw={}) {
  const corrections=(Array.isArray(raw.corrections)?raw.corrections:[]).filter(c=>c&&kinds.has(c.kind)).slice(0,1000).map(c=>({
    kind:c.kind,description:clean(c.description),evidence:clean(c.evidence),before:clean(c.before),after:clean(c.after),
    ...(Number.isInteger(c.measure)&&c.measure>0?{measure:c.measure}:{}),
    noteIds:(Array.isArray(c.noteIds)?c.noteIds:[]).filter(id=>typeof id==='string').slice(0,100).map(id=>clean(id,80)),
  }));
  const audit=raw.sourceHeadAudit;
  let sourceHeadAudit;
  if(audit&&Number.isInteger(audit.detected)&&audit.detected>=0&&Number.isInteger(audit.mapped)&&audit.mapped>=0&&audit.mapped<=audit.detected){
    const unmapped=(Array.isArray(audit.unmapped)?audit.unmapped:[]).filter(h=>h&&finite(h.x)&&finite(h.y)&&[1,2].includes(h.staff)).slice(0,10000).map(h=>({id:clean(h.id,80),x:h.x,y:h.y,staff:h.staff,pitch:finite(h.pitch)?h.pitch:0,grade:finite(h.grade)?h.grade:0}));
    sourceHeadAudit={detected:audit.detected,mapped:audit.mapped,unmapped,invalid:unmapped.length!==audit.detected-audit.mapped,reviewed:unmapped.length===0||audit.reviewed===true};
  }
  let tieAudit;
  if(raw.tieAudit){const unresolved=(Array.isArray(raw.tieAudit.unresolved)?raw.tieAudit.unresolved:[]).slice(0,1000).map(item=>({description:clean(item.description),noteIds:(Array.isArray(item.noteIds)?item.noteIds:[]).filter(id=>typeof id==='string').slice(0,100).map(id=>clean(id,80))}));tieAudit={unresolved,reviewed:unresolved.length===0||raw.tieAudit.reviewed===true};}
  return {corrections,...(sourceHeadAudit?{sourceHeadAudit}:{}),...(tieAudit?{tieAudit}:{})};
}

export function omrReviewIssues(raw) {
  const audit=raw.sourceHeadAudit;
  return [...(audit?.invalid?[{code:'INVALID_SOURCE_HEAD_AUDIT',message:'源音头覆盖清单数量不一致，请重试此行。'}]:[]),
    ...(audit?.unmapped?.length&&!audit.reviewed?[{code:'UNMAPPED_HEAD_REVIEW',message:`还有${audit.unmapped.length}个源音头未映射；请对照原图补音或确认误检后再审核。`}]:[]),
    ...(raw.tieAudit?.unresolved?.length&&!raw.tieAudit.reviewed?[{code:'UNRESOLVED_TIE_REVIEW',message:`还有${raw.tieAudit.unresolved.length}处延音疑点，须对照原图修改延音关系后确认。`}]:[])];
}
