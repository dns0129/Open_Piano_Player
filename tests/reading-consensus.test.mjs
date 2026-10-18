import test from'node:test';import assert from'node:assert/strict';
import{chooseReadingAgreement}from'../lib/reading-consensus.mjs';import{SCORE_RECOGNITION as policy}from'../lib/recognition-policy.mjs';
const region={id:'row',page:2,system:1,rect:{x:0,y:0,width:100,height:100},measureCount:1};
function candidate(id,midi=60,review=false){return{id,startedAt:'2026-10-18T11:00:'+id+'.000Z',endedAt:'2026-10-18T11:01:'+id+'.000Z',result:{model:policy.model,reasoningEffort:'high',promptVersion:policy.promptVersion,requestAudit:[{model:policy.model,reasoningEffort:'high'}],score:{title:'piano',tempo:90,timeSignature:[4,4],keySignature:0,durationBeats:4,notes:[{id:'r',midi,beat:0,duration:4,hand:'right',voice:'r'},{id:'l',midi:48,beat:0,duration:4,hand:'left',voice:'l'}]},positions:review?[]:[{noteId:'r',x:20,y:25},{noteId:'l',x:20,y:75}],positionlessReview:review,coverage:{complete:true,measureCount:1,measureDurations:[4]},rests:[],continuity:{tieIn:[],tieOut:[]},internalTies:[]}};}
test('two independent valid readings may resolve a third reading, without a ground-truth claim',()=>{
 const r=chooseReadingAgreement([candidate('01',61),candidate('02'),candidate('03',60,true)],region,{});
 assert.equal(r.resolved,true);assert.deepEqual(r.counts,[2,1]);assert.equal(r.primary.normalized.score.notes.find(n=>n.id==='r').midi,60);assert.equal(r.comparison.exactMatch,true);
});
test('a tie, duplicate invocation, changed model/prompt or missing source positions cannot manufacture consensus',()=>{
 assert.equal(chooseReadingAgreement([candidate('01'),candidate('02'),candidate('03',61),candidate('04',61)],region,{}).resolved,false);
 const one=candidate('01');assert.equal(chooseReadingAgreement([one,{...one,id:'copy'}],region,{}).resolved,false);
 for(const change of [{model:'other'},{promptVersion:'old'},{reasoningEffort:'low'},{requestAudit:[]}])assert.equal(chooseReadingAgreement([candidate('01'),{...candidate('02'),result:{...candidate('02').result,...change}}],region,{}).resolved,false);
 assert.equal(chooseReadingAgreement([candidate('01',60,true),candidate('02',60,true)],region,{}).resolved,false);
 const digital=chooseReadingAgreement([candidate('01',60,true),candidate('02',60,true)],region,{},undefined,{allowDigital:true});
 assert.equal(digital.resolved,true);assert.equal(digital.sourcePositionsAvailable,false);assert.deepEqual(digital.primary.normalized.positions,[]);
});
