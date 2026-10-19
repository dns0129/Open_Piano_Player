import test from 'node:test';
import assert from 'node:assert/strict';
import {validateScore,scoreKeySignature,transposeScore} from '../lib/score.mjs';
test('sparse keys inherit and transposition updates the complete key map',()=>{
 const s=validateScore({tempo:95,keySignature:-3,timeSignature:[4,4],durationBeats:12,measureMap:[{beat:0,duration:4},{beat:4,duration:4,keySignature:4},{beat:8,duration:4}],notes:[{id:'a',midi:70,beat:0,duration:12,hand:'right'}]});
 assert.deepEqual([0,1,2].map(i=>scoreKeySignature(s,i)),[-3,4,4]);
 const t=transposeScore(s,1);assert.deepEqual([0,1,2].map(i=>scoreKeySignature(t,i)),[4,-1,-1]);assert.equal(t.notes[0].midi,71);
 assert.throws(()=>validateScore({...s,measureMap:[{beat:0,duration:12,keySignature:8,timeSignature:[12,4]}]}),/小节调号/);
});
