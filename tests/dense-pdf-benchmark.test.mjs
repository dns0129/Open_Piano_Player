import test from 'node:test';
import assert from 'node:assert/strict';
import {matchBenchmarkHeads,scoreDensePdfRow} from '../lib/dense-pdf-benchmark.mjs';
const n=(midi=60,beat=0,duration=1,hand='right')=>({midi,beat,duration,hand});
const ref=(notes)=>({notes,measures:[{duration:4}]});
const result=(notes,bars=[4])=>({score:{notes},coverage:{measureDurations:bars}});
test('duplicate predictions and extra bars never disappear from denominator',()=>{
 const s=scoreDensePdfRow(ref([n()]),result([n(),n(),n(72,8)],[4,4,4]));
 assert.equal(s.strict.correct,1);assert.equal(s.strict.predicted,3);assert.equal(s.strict.extra.length,2);assert.equal(s.barDurationsExact,false);
});
test('wrong hand, timing and duration are distinct from pitch multiset recall',()=>{
 const s=scoreDensePdfRow(ref([n()]),result([n(60,0,2)]));
 assert.equal(s.strict.correct,0);assert.equal(s.pitchHandOnset.correct,1);assert.equal(s.pitchAndHand.correct,1);
 assert.equal(scoreDensePdfRow(ref([n()]),result([n(60,0,1,'left')])).pitchAndHand.correct,0);
 assert.equal(scoreDensePdfRow(ref([n()]),result([n(60,1)])).pitchHandOnset.correct,0);
});
test('failed rows keep all expected notes; empty grace denominator is unknown',()=>{
 const s=scoreDensePdfRow(ref([n(),n(64)]),null);assert.equal(s.strict.reference,2);assert.equal(s.strict.correct,0);assert.equal(s.strict.missing.length,2);assert.equal(s.grace.recall,null);
});
test('one-to-one maximum matching handles chords and tolerance boundaries',()=>{
 const e=[n(60,0),n(60,0.00015)],a=[n(60,0.000075),n(60,0)];
 assert.equal(matchBenchmarkHeads(e,a).correct,2);assert.equal(matchBenchmarkHeads(e,[a[0]]).correct,1);
});
test('grace groups score separately, with no tie-merging of written heads',()=>{
 const r=ref([{...n(),tieStart:true},{...n(60,1),tieStop:true},{...n(62),grace:true,duration:0}]);
 const s=scoreDensePdfRow(r,result([{...n(),grace:{notes:[{midi:62}]}},n(60,1)]));
 assert.equal(s.strict.reference,2);assert.equal(s.strict.correct,2);assert.equal(s.grace.correct,1);
});
