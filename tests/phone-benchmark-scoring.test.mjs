import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBenchmarkSubset} from '../lib/phone-benchmark-scoring.mjs';
test('photo comparison counts missing, extra, wrong pitch and wrong rhythm against the full reference denominator',()=>{
 const notes=[{measure:1,midi:60,beat:0,duration:1,hand:'right'},{measure:1,midi:64,beat:1,duration:1,hand:'right'},{measure:1,midi:67,beat:2,duration:1,hand:'right'},{measure:1,midi:48,beat:0,duration:4,hand:'left'}];
 const r=compareBenchmarkSubset({notes},{bars:[4],notes:[[60,0,1,1],[65,1,1,1],[67,2,.5,1],[72,3,1,1]]});assert.equal(r.referenceNotes,4);assert.equal(r.strictCorrect,1);assert.equal(r.pitchCorrect,2);assert.equal(r.missing,1);assert.equal(r.extras,1);assert.equal(r.bars[0].exact,false);
 const empty=compareBenchmarkSubset({notes},null);assert.equal(empty.missing,4);assert.equal(empty.strictCorrect,0);
});
