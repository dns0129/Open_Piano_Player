import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBulkReview,sourcePoint,rollMove} from '../lib/recognition-review-actions.mjs';
import {normalizeFullScoreRegionResult} from '../lib/full-score-review.mjs';
import {reviewJob} from './helpers/recognition-review-fixture.mjs';
const draft=()=>{const job=reviewJob();return {totalPages:2,pages:[1,2].map(page=>({page,scanned:true,decision:'include'})),regions:job.regions.map(r=>normalizeFullScoreRegionResult({...r,selected:true},r.result))};};

test('one explicit review acknowledges all selected rows and audits without mutating the draft on preflight',()=>{
 const d=draft(),before=structuredClone(d),{summary}=prepareBulkReview(d);
 assert.equal(summary.canImport,true);assert.equal(summary.reviewedCount,2);assert.deepEqual(d,before);
 assert.ok(summary.selected.every(r=>r.coverageComplete&&r.tieAudit.reviewed&&r.sourceHeadAudit.reviewed));
 d.regions[1].notes[0].midi=109;
 const invalid=prepareBulkReview(d);assert.equal(invalid.summary.canImport,false);assert.ok(invalid.summary.issues.some(i=>i.code==='INVALID_MIDI'));
 assert.equal(d.regions[0].reviewed,false);
});

test('batch review preserves excluded scopes and rejects real missing coverage',()=>{
 const d=draft();d.regions[1].selected=false;d.regions[1].excludeReason='music';
 const {regions,summary}=prepareBulkReview(d);assert.equal(summary.selectedCount,1);assert.equal(regions[1].reviewed,false);assert.equal(summary.complete,false);
 d.pages.pop();assert.ok(prepareBulkReview(d).summary.issues.some(i=>i.code==='UNSCANNED_PAGES'));
});

test('source dragging converts resized image coordinates to crop-relative page pixels and clamps edges',()=>{
 const rect={x:20,y:40,width:800,height:220},bounds={left:100,top:200,width:400,height:110};
 assert.deepEqual(sourcePoint(rect,bounds,300,255),{x:420,y:150});
 assert.deepEqual(sourcePoint(rect,bounds,-10,900),{x:20,y:260});
 assert.equal(sourcePoint(rect,{width:0,height:0},0,0),null);
});

test('roll dragging snaps beats, respects note ends and piano bounds, and preserves off-grid timing for pitch-only moves',()=>{
 const region={durationBeats:4},range={min:48,max:75},bounds={width:400,height:392},note={beat:1/3,midi:72,duration:1};
 assert.deepEqual(rollMove(note,region,range,bounds,0,-14),{beat:1/3,midi:73});
 assert.deepEqual(rollMove(note,region,range,bounds,25,0),{beat:.5,midi:72});
 assert.deepEqual(rollMove(note,region,range,bounds,25,0,1/16),{beat:.5625,midi:72});
 assert.deepEqual(rollMove(note,region,range,bounds,9000,-9000),{beat:3,midi:108});
 assert.deepEqual(rollMove(note,region,range,bounds,-9000,9000),{beat:0,midi:21});
});
