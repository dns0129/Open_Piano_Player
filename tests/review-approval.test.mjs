import test from 'node:test';
import assert from 'node:assert/strict';
import {hasApprovedAgentReview} from '../lib/review-approval.mjs';
const fixture=()=>({totalPages:6,regions:Array(29).fill({}),result:{reviewStatus:'model-reviewed',score:{measureMap:Array(83).fill({}),notes:Array(1882).fill({})},review:{humanConfirmed:false,approval:{status:'approved',actor:'Codex',method:'full-source-visual-review',authorizedByUser:true,humanConfirmed:false,approvedAt:'2026-10-19T05:35:06Z',reportSha256:'a'.repeat(64),coverage:{pages:6,systems:29,measures:83,notes:1882},unresolvedNoteIssues:[]}}}});
test('approval requires complete evidence without claiming human confirmation',()=>{
 assert.equal(hasApprovedAgentReview(fixture()),true);
 for(const mutate of [j=>delete j.result.review.approval,j=>j.result.review.approval.coverage.measures--,j=>j.result.review.approval.reportSha256='',j=>j.result.review.approval.unresolvedNoteIssues.push('ambiguous'),j=>j.result.review.approval.authorizedByUser=false,j=>j.result.review.humanConfirmed=true,j=>j.result.review.approval.humanConfirmed=true,j=>j.result.review.approval.approvedAt='invalid']){
  const j=fixture();mutate(j);assert.equal(Boolean(hasApprovedAgentReview(j)),false);
 }
 const empty=fixture();delete empty.result.score.measureMap;delete empty.result.review.approval.coverage.measures;assert.equal(Boolean(hasApprovedAgentReview(empty)),false);
});
