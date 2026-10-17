import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {audiverisStatus,extractAudiverisArtifacts,recognizeAudiverisDocument} from '../lib/audiveris.mjs';
import {validateRegionResult} from '../lib/full-score-jobs.mjs';

const note=(step,octave,duration,{staff=1,voice=staff,x=10,chord=false,alter,grace=false}={})=>`<note default-x="${x}">${chord?'<chord/>':''}${grace?'<grace/>':''}<pitch><step>${step}</step>${alter===undefined?'':`<alter>${alter}</alter>`}<octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><staff>${staff}</staff></note>`;
const head=(id,staff,pitch,x,y)=>`<head id="${id}" staff="${staff}" pitch="${pitch}" grade="0.95"><bounds x="${x}" y="${y}" w="20" h="10"/></head>`;
const staff=id=>`<staff id="${id}"><lines><line><point x="100" y="${id===1?100:300}"/><point x="900" y="${id===1?180:380}"/></line></lines></staff>`;
const system=`<system id="1"><stack id="0" left="100" right="200" duration="1/8" expected="3/8" special="PICKUP"/><stack id="1" left="200" right="400" duration="3/8" expected="3/8"/><part>${staff(1)}${staff(2)}</part><sig><inters>${head('1',1,-3,140,105)}${head('2',1,-2,170,115)}${head('3',1,-1,220,125)}${head('4',1,-3,220,105)}${head('5',2,1,220,345)}</inters></sig></system>`;
const score=({grace=false}={})=>`<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="0" implicit="yes"><attributes><divisions>4</divisions><time><beats>3</beats><beat-type>8</beat-type></time><staves>2</staves></attributes>${note('E',5,1,{x:20,grace})}${note('D',5,1,{x:35,alter:1})}<backup><duration>2</duration></backup><note print-object="no"><rest/><duration>2</duration><voice>5</voice><staff>2</staff></note></measure><measure number="1">${note('C',5,6)}${note('E',5,6,{chord:true})}<backup><duration>6</duration></backup>${note('C',3,6,{staff:2,voice:5})}</measure></part></score-partwise>`;

async function fixture(t,{grace=false,extraPage=false}={}){
  const folder=await mkdtemp(join(tmpdir(),'qinban-audiveris-'));t.after(()=>rm(folder,{recursive:true,force:true}));
  const sheet=`<sheet><picture width="1000" height="1000"/><scale><interline main="20"/></scale><page>${system}</page></sheet>`;
  const omr=zipSync({'sheet#1/sheet#1.xml':strToU8(sheet),...(extraPage?{'sheet#2/sheet#2.xml':strToU8(sheet)}:{})});
  const xml=score({grace}),mxl=zipSync({'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>'),'score.xml':strToU8(extraPage?xml.replace('</part></score-partwise>',xml.match(/<measure[^]*<\/measure>/)[0]+'</part></score-partwise>'):xml)});
  const omrPath=join(folder,'source.omr'),mxlPath=join(folder,'source.mxl');await writeFile(omrPath,omr);await writeFile(mxlPath,mxl);
  const input={originalPdf:{buffer:Buffer.from('%PDF-1.4\nfixture source')},metadata:{title:'Fixture Study',composer:'Fixture',tempo:100},regions:[{id:'p1-s1',page:1,system:1,pageWidth:500,pageHeight:500,rect:{x:0,y:20,width:500,height:200}}]};
  return {input,options:{omrPath,mxlPath,outputDirectory:join(folder,'mapping')}};
}

test('Audiveris maps actual head centers with page scaling and preserves pickup, chord, backup, altered pitch and invisible rests',async t=>{
  const {input,options}=await fixture(t),report=await extractAudiverisArtifacts(input,options),result=report.regions[0].result;
  assert.equal(report.checks.complete,true);assert.equal(report.checks.requiresReview,true);
  assert.deepEqual(result.coverage.measureDurations,[.5,1.5]);
  assert.deepEqual(result.score.notes.map(n=>[n.midi,n.beat,n.duration,n.hand]),[[76,0,.25,'right'],[75,.25,.25,'right'],[72,.5,1.5,'right'],[76,.5,1.5,'right'],[48,.5,1.5,'left']]);
  assert.deepEqual(result.positions[0],{noteId:'m1-n1',x:75,y:55,coordinateSpace:'page'});
  assert.deepEqual(result.rests,[{beat:0,duration:.5,hand:'left',voice:'5'}]);
  assert.equal(validateRegionResult(result,input.regions[0],input.metadata).checks.passed,true);
});

test('unprocessed grace notation is an explicit row failure rather than a silently dropped note',async t=>{
  const {input,options}=await fixture(t,{grace:true}),report=await extractAudiverisArtifacts(input,options);
  assert.equal(report.checks.complete,false);assert.equal(report.checks.scopeComplete,true);assert.equal(report.regions[0].error.code,'AUDIVERIS_UNSUPPORTED_NOTATION');assert.match(report.regions[0].error.message,/GRACE/);
});

test('explicit short measure time is preserved even when the exporter omits the implicit attribute',async t=>{
  const {input,options}=await fixture(t);await writeFile(options.mxlPath,score().replace(' implicit="yes"',''));
  const report=await extractAudiverisArtifacts(input,options),result=report.regions[0].result;
  assert.deepEqual(result.coverage.measureDurations,[.5,1.5]);assert.equal(result.score.durationBeats,2);
  assert.equal(validateRegionResult(result,input.regions[0],input.metadata).checks.passed,true);
});

test('a MusicXML chord crossing to the other staff shares the preceding main-note onset',async t=>{
  const {input,options}=await fixture(t);
  const sheet=`<sheet><picture width="1000" height="1000"/><scale><interline main="20"/></scale><page>${system.replace(head('4',1,-3,220,105),head('4',2,-15,220,185))}</page></sheet>`;
  await writeFile(options.omrPath,zipSync({'sheet#1/sheet#1.xml':strToU8(sheet)}));
  await writeFile(options.mxlPath,score().replace(note('E',5,6,{chord:true}),note('E',5,6,{chord:true,staff:2,voice:1})));
  const report=await extractAudiverisArtifacts(input,options),result=report.regions[0].result;
  assert.equal(result.score.durationBeats,2);
  assert.deepEqual(result.score.notes.filter(note=>note.id.startsWith('m2-')).map(note=>[note.midi,note.beat,note.duration]),[[72,.5,1.5],[76,.5,1.5],[48,.5,1.5]]);
});

test('same-row MusicXML ties preserve both written heads and emit an explicit playback merge link',async t=>{
  const {input,options}=await fixture(t);
  const sheet=`<sheet><picture width="1000" height="1000"/><scale><interline main="20"/></scale><page>${system.replace(head('2',1,-2,170,115),head('2',1,-3,170,105))}</page></sheet>`;
  await writeFile(options.omrPath,zipSync({'sheet#1/sheet#1.xml':strToU8(sheet)}));
  const xml=score().replace(note('E',5,1,{x:20}),note('E',5,1,{x:20}).replace('</note>','<tie type="start"/></note>')).replace(note('D',5,1,{x:35,alter:1}),note('E',5,1,{x:35}).replace('</note>','<tie type="stop"/></note>'));
  await writeFile(options.mxlPath,xml);
  const report=await extractAudiverisArtifacts(input,options),result=report.regions[0].result;
  assert.equal(result.score.notes.length,5);assert.equal(result.positions.length,5);
  assert.deepEqual(result.internalTies,[{fromNoteId:'m1-n1',toNoteId:'m1-n2'}]);
  assert.equal(validateRegionResult(result,input.regions[0],input.metadata).checks.passed,true);
});

test('explicit grace keeps its source head and natural accidental while borrowing time from the principal',async t=>{
  const {input,options}=await fixture(t);
  const grace=note('E',5,1,{x:20,grace:true,alter:1}).replace('<duration>1</duration>','').replace('</note>','<accidental>natural</accidental></note>');
  await writeFile(options.mxlPath,score().replace(note('E',5,1,{x:20}),grace).replace(note('D',5,1,{x:35,alter:1}),note('D',5,2,{x:35,alter:1})));
  const report=await extractAudiverisArtifacts(input,options),result=report.regions[0].result;
  assert.ok(result,JSON.stringify(report.regions[0].error));
  assert.deepEqual(result.score.notes.slice(0,2).map(n=>[n.midi,n.beat,n.duration]),[[76,0,.0625],[75,.0625,.4375]]);
  assert.equal(result.positions.length,5);
  assert.equal(validateRegionResult(result,input.regions[0],input.metadata).checks.passed,true);
  assert.ok(result.corrections.some(c=>c.kind==='grace-timing'));
});

test('complete explicit 3:2 groups repair unscaled durations only when both staves recover the written meter',async t=>{
  const {input,options}=await fixture(t);
  const triplet=(step,x,edge)=>note(step,5,1,{x}).replace('</note>',`<type>16th</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>${edge?`<notations><tuplet type="${edge}" number="1"/></notations>`:''}</note>`);
  const originalSecond=score().match(/<measure number="1">[^]*?<\/measure>/)[0];
  const replacement=`<measure number="1">${note('C',5,4)}${triplet('E',30,'start')}${triplet('D',50)}${triplet('C',70,'stop')}<backup><duration>7</duration></backup>${note('C',3,6,{staff:2,voice:5})}</measure>`;
  await writeFile(options.mxlPath,score().replace(originalSecond,replacement));
  const altered=system.replace(head('4',1,-3,220,105),head('4',1,-3,260,105)+head('6',1,-2,300,115)+head('7',1,-1,340,125));
  await writeFile(options.omrPath,zipSync({'sheet#1/sheet#1.xml':strToU8(`<sheet><picture width="1000" height="1000"/><scale><interline main="20"/></scale><page>${altered}</page></sheet>`)}));
  const report=await extractAudiverisArtifacts(input,options),result=report.regions[0].result;
  assert.ok(result,JSON.stringify(report.regions[0].error));
  assert.deepEqual(result.coverage.measureDurations,[.5,1.5]);
  assert.ok(Math.abs(result.score.notes.find(n=>n.id==='m2-n2').duration-1/6)<1e-10);
  assert.equal(validateRegionResult(result,input.regions[0],input.metadata).checks.passed,true);
  assert.ok(result.corrections.some(c=>c.kind==='triplet-duration'));
});

test('a unique adjacent explicit tie survives exporter voice renumbering without dropping either head',async t=>{
  const {input,options}=await fixture(t);
  const altered=system.replace(head('2',1,-2,170,115),head('2',1,-3,170,105));
  await writeFile(options.omrPath,zipSync({'sheet#1/sheet#1.xml':strToU8(`<sheet><picture width="1000" height="1000"/><scale><interline main="20"/></scale><page>${altered}</page></sheet>`)}));
  const xml=score().replace(note('E',5,1,{x:20}),note('E',5,1,{x:20}).replace('</note>','<tie type="start"/></note>')).replace(note('D',5,1,{x:35,alter:1}),note('E',5,1,{x:35,voice:2}).replace('</note>','<tie type="stop"/></note>'));
  await writeFile(options.mxlPath,xml);
  const report=await extractAudiverisArtifacts(input,options),result=report.regions[0].result;
  assert.ok(result,JSON.stringify(report.regions[0].error));
  assert.deepEqual(result.internalTies,[{fromNoteId:'m1-n1',toNoteId:'m1-n2'}]);
  assert.equal(result.positions.length,5);
});

test('an OMR curve explicitly classified as a tie recovers missing MusicXML flags; legato curves do not',async t=>{
  const {input,options}=await fixture(t);
  const xml=score().replace(note('D',5,1,{x:35,alter:1}),note('E',5,1,{x:35}));
  await writeFile(options.mxlPath,xml);
  const geometry=system.replace(head('2',1,-2,170,115),head('2',1,-3,170,105));
  for(const isTie of [false,true]){
    const withCurve=geometry.replace('</inters>',`<slur id="curve" ${isTie?'tie="true"':''}/></inters><relations><relation source="curve" target="1"><slur-head side="LEFT"/></relation><relation source="curve" target="2"><slur-head side="RIGHT"/></relation></relations>`);
    await writeFile(options.omrPath,zipSync({'sheet#1/sheet#1.xml':strToU8(`<sheet><picture width="1000" height="1000"/><scale><interline main="20"/></scale><page>${withCurve}</page></sheet>`)}));
    const report=await extractAudiverisArtifacts(input,options),result=report.regions[0].result;
    assert.ok(result,JSON.stringify(report.regions[0].error));
    assert.equal(result.internalTies.length,isTie?1:0);
  }
});

test('unmapped detected source heads remain visible for review rather than vanishing from coverage',async t=>{
  const {input,options}=await fixture(t);
  const geometry=system.replace('</inters>',head('orphan',1,-2,350,115)+'</inters>');
  await writeFile(options.omrPath,zipSync({'sheet#1/sheet#1.xml':strToU8(`<sheet><picture width="1000" height="1000"/><scale><interline main="20"/></scale><page>${geometry}</page></sheet>`)}));
  const report=await extractAudiverisArtifacts(input,options),result=report.regions[0].result;
  assert.equal(result.sourceHeadAudit.detected,6);
  assert.equal(result.sourceHeadAudit.mapped,5);
  assert.equal(result.sourceHeadAudit.unmapped[0].id,'orphan');
  assert.equal(validateRegionResult(result,input.regions[0],input.metadata).checks.passed,false);
  result.sourceHeadAudit.reviewed=true;
  assert.equal(validateRegionResult(result,input.regions[0],input.metadata).checks.passed,true);
});

test('unresolved ties retain an editable whole row and block confirmation until reviewed',async t=>{
  const {input,options}=await fixture(t);
  await writeFile(options.mxlPath,score().replace(note('E',5,1,{x:20}),note('E',5,1,{x:20}).replace('</note>','<tie type="start"/></note>')));
  const report=await extractAudiverisArtifacts(input,options),result=report.regions[0].result;
  assert.ok(result,'the existing notes must remain editable instead of reducing the row to an error');
  assert.equal(result.score.notes.length,5);
  assert.ok(result.tieAudit.unresolved.length);
  assert.equal(validateRegionResult(result,input.regions[0],input.metadata).checks.passed,false);
  result.tieAudit.reviewed=true;
  assert.equal(validateRegionResult(result,input.regions[0],input.metadata).checks.passed,true);
});

test('triplet cursor arithmetic returns exact zero after a matching backup',async t=>{
  const {input,options}=await fixture(t);
  const movement=[22,6,6,6,6].map(duration=>`<forward><duration>${duration}</duration></forward>`).join('')+'<backup><duration>46</duration></backup>';
  await writeFile(options.mxlPath,score().replace('<divisions>4</divisions>','<divisions>12</divisions>').replace(note('E',5,1,{x:20}),movement+note('E',5,1,{x:20})));
  const report=await extractAudiverisArtifacts(input,options);
  assert.equal(report.regions[0].result.score.notes[0].beat,0,'floating-point residue must not become a negative piano onset');
});

test('all OMR source pages and systems must be included or explicitly excluded for document completeness',async t=>{
  const {input,options}=await fixture(t,{extraPage:true}),report=await extractAudiverisArtifacts(input,options);
  assert.equal(report.checks.complete,false);assert.equal(report.checks.scopeComplete,false);assert.deepEqual(report.checks.unrequestedPages,[2]);assert.ok(report.checks.errors.some(error=>error.code==='AUDIVERIS_SCOPE_MISMATCH'));
});

test('document adapter accepts the shared 50MB PDF limit and rejects bytes beyond it',async t=>{
  const {input,options}=await fixture(t),data=Buffer.alloc(50*1024*1024+1);data.write('%PDF-1.4\n');
  input.originalPdf.buffer=data.subarray(0,50*1024*1024);
  assert.equal((await extractAudiverisArtifacts(input,options)).checks.complete,true);
  input.originalPdf.buffer=data;
  await assert.rejects(()=>recognizeAudiverisDocument(input),error=>error.code==='AUDIVERIS_PDF_REQUIRED'&&/50MB/.test(error.message));
});

test('document adapter cancellation happens before recognition or cache writes and rejects non-PDF inputs',async()=>{
  const controller=new AbortController();controller.abort();
  const input={originalPdf:{buffer:Buffer.from('%PDF-1.4\nfixture')},regions:[{id:'r1',page:1,system:1,pageWidth:100,pageHeight:100,rect:{x:0,y:0,width:100,height:100}}]};
  await assert.rejects(()=>recognizeAudiverisDocument(input,{signal:controller.signal}),error=>error.name==='AbortError');
  await assert.rejects(()=>recognizeAudiverisDocument({...input,originalPdf:{buffer:Buffer.from('<html>not pdf</html>')}}),error=>error.code==='AUDIVERIS_PDF_REQUIRED');
  const status=await audiverisStatus();assert.equal(typeof status.available,'boolean');assert.equal(status.engine,'audiveris');assert.ok(!JSON.stringify(status).includes('user.home'));
});
