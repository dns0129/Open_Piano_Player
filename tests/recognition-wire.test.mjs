import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeCompactRegion,encodeCompactRegion} from '../lib/recognition-wire.mjs';
import {validateRegionResult} from '../lib/full-score-jobs.mjs';
import {compareRegionReadings} from '../lib/recognition-comparison.mjs';
const region={id:'r',page:1,system:1,rect:{x:10,y:20,width:400,height:200}};
const request={region,metadata:{title:'fixture',tempo:90,timeSignature:[4,4],keySignature:0}};
const raw={complete:true,meter:[4,4],key:0,bpm:90,bars:[4],notes:[[60,0,1,1,.2,.2,.75],[60,1,3,1,.5,.2,.75],[48,0,4,-1,.2,.8,.55]],rests:[],in:[],out:[],ties:[[0,1]],warnings:[]};
test('compact full read retains every head, position and tie; independent read omits only unused coordinates',()=>{
 const a=validateRegionResult(decodeCompactRegion(raw,request),region,request.metadata);
 const wire=encodeCompactRegion(a,region,'verify'),b=validateRegionResult(decodeCompactRegion(wire,{...request,pass:'verify'}),region,request.metadata,{requirePositions:false});
 assert.equal(a.positions.length,3);assert.equal(b.positions.length,0);assert.equal(b.checks.passed,true);assert.equal(compareRegionReadings(a,b).exactMatch,true);
 assert.equal(validateRegionResult(b,region).checks.passed,false,'positionless review must never be accepted as a primary transcription');
 const changed=structuredClone(b);changed.internalTies=[];assert.equal(compareRegionReadings(a,changed).exactMatch,false,'independent tie disagreement must be visible');
});
test('compact format rejects partial coverage, invented indices, missing coordinates and handless voices',()=>{
 for(const mutate of [r=>r.complete=false,r=>r.notes[0][3]=0,r=>r.notes[0].pop(),r=>r.ties=[[0,99]],r=>r.notes[0][4]=1.2]){const input=structuredClone(raw);mutate(input);assert.throws(()=>decodeCompactRegion(input,request));}
});
test('written grace notes borrow a fixed amount from preceding rests or chord tones without moving main beats',()=>{
 const input={...raw,notes:[[69,2,0,1,.4,.2,.75],[70,2,2,1,.5,.2,.75],[48,0,4,-1,.2,.8,.55]],rests:[[0,2,1]],ties:[],graces:[[0,1]]};
 const a=validateRegionResult(decodeCompactRegion(input,request),region,request.metadata);
 assert.equal(a.checks.passed,true);assert.equal(a.score.notes.find(n=>n.midi===69).beat,1.9375);assert.equal(a.score.notes.find(n=>n.midi===70).beat,2);assert.equal(a.rests[0].duration,1.9375);
 const atStart={...input,notes:[[69,0,0,1,.1,.2,.75],[70,0,4,1,.2,.2,.75],[48,0,4,-1,.2,.8,.55]],rests:[]};
 const b=validateRegionResult(decodeCompactRegion(atStart,request),region,request.metadata);assert.equal(b.checks.passed,true);assert.equal(b.score.notes.find(n=>n.midi===70).duration,3.9375);
});
