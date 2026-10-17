import {Type} from '@earendil-works/pi-ai';

const midi=Type.Integer({minimum:21,maximum:108}),beat=Type.Number({minimum:0,maximum:512}),duration=Type.Number({minimum:1/1024,maximum:256}),voice=Type.Integer({minimum:-32,maximum:32}),coordinate=Type.Number({minimum:0,maximum:1}),index=Type.Integer({minimum:0,maximum:1023});
export const WIRE_VERSION='compact-v2';
export function compactRegionSchema(pass='recognize'){
 const noteDuration=Type.Number({minimum:0,maximum:256});
 return Type.Object({complete:Type.Boolean(),meter:Type.Tuple([Type.Integer({minimum:1,maximum:16}),Type.Integer({minimum:1,maximum:16})]),key:Type.Integer({minimum:-7,maximum:7}),bpm:Type.Number({minimum:20,maximum:300}),bars:Type.Array(duration,{minItems:1,maxItems:256}),notes:Type.Array(Type.Tuple(pass==='verify'?[midi,beat,noteDuration,voice]:[midi,beat,noteDuration,voice,coordinate,coordinate,Type.Number({minimum:0,maximum:1})]),{maxItems:1024}),rests:Type.Array(Type.Tuple([beat,duration,voice]),{maxItems:2048}),in:Type.Array(index,{maxItems:32}),out:Type.Array(index,{maxItems:32}),ties:Type.Array(Type.Tuple([index,index]),{maxItems:1024}),graces:Type.Array(Type.Tuple([index,index]),{maxItems:128}),warnings:Type.Array(Type.String({maxLength:300}),{maxItems:8})});
}
export function compactRegionInstructions(pass='recognize'){
 return `必须用submit_score_region一次提交完整行。complete只有全部小节均读完才为true。meter为拍号，key为升降号数，bpm为速度，bars逐项列出每小节实际四分音符拍数（弱起保留实际值）。voice用非零整数：正数右手、负数左手，绝对值区分同手独立声部。notes每项严格为${pass==='verify'?'[MIDI,起始拍,时值,voice]，独立复读无需重新输出图像坐标或力度':'[MIDI,起始拍,时值,voice,音头x,音头y,力度]；x/y为当前图片归一化坐标，力度0到1'}。rests每项[起始拍,时值,voice]。in/out为跨行延音的音头数组下标，ties为行内延音的[起点下标,终点下标]，下标均从0开始，指向本次notes原始数组。不要提前合并延音音头；不要把连奏弧当延音。三连音保留分数拍（数值精度至少6位）。倚音只读纸面，不估计演奏借时：每个倚音仍列入notes，beat填后续主音的纸面拍位，duration填0；graces逐项[倚音下标,后续主音下标]，没有则[]。主音、前置音与休止全部保留纸面原时值，不减时不移拍；App将统一分配倚音借时。不能可靠读取完整行就request_source。只调用工具，不另外输出说明段落。`;
}
export function decodeCompactRegion(raw,{metadata,region,pass='recognize'}){
 const fail=()=>{throw Object.assign(new Error('紧凑谱行格式无效或未完整覆盖原图。'),{code:'INVALID_COMPACT_REGION',expose:true,status:422});};
 if(raw?.complete!==true||!Array.isArray(raw.notes)||raw.notes.length>1024||!Array.isArray(raw.bars)||!raw.bars.length||raw.bars.some(v=>!Number.isFinite(v)||v<=0)||!Array.isArray(raw.meter)||raw.meter.length!==2)fail();
 const notes=[],positions=[];const voiceFields=v=>{if(!Number.isInteger(v)||v===0||Math.abs(v)>32)fail();return {hand:v>0?'right':'left',voice:(v>0?'right-':'left-')+Math.abs(v)};};
 raw.notes.forEach((n,i)=>{if(!Array.isArray(n)||n.length!==(pass==='verify'?4:7)||n.some(v=>!Number.isFinite(v)))fail();const [midi,beat,duration,v,x,y,velocity]=n;if(!Number.isInteger(midi)||midi<21||midi>108||beat<0||duration<0||duration>256)fail();const id='n'+i;notes.push({id,midi,beat,duration,...voiceFields(v),velocity:pass==='verify'?(v>0?.75:.55):velocity});if(pass!=='verify'){if(x<0||x>1||y<0||y>1||velocity<0||velocity>1)fail();positions.push({noteId:id,x:region.rect.x+x*region.rect.width,y:region.rect.y+y*region.rect.height,coordinateSpace:'page'});}});
 const noteId=i=>{if(!Number.isInteger(i)||i<0||i>=notes.length)fail();return 'n'+i;};
 const rests=(raw.rests||[]).map(r=>{if(!Array.isArray(r)||r.length!==3||r.some(v=>!Number.isFinite(v)))fail();return {beat:r[0],duration:r[1],...voiceFields(r[2])};});
 const graceIds=new Set(),groups=new Map();
 for(const pair of raw.graces||[]){if(!Array.isArray(pair)||pair.length!==2)fail();const g=notes.find(n=>n.id===noteId(pair[0])),main=notes.find(n=>n.id===noteId(pair[1]));if(g===main||graceIds.has(g.id)||g.duration!==0||main.duration<=0||g.hand!==main.hand||Math.abs(g.beat-main.beat)>1e-5)fail();graceIds.add(g.id);if(!groups.has(main.id))groups.set(main.id,[]);groups.get(main.id).push(g);}
 for(const [id,graces]of groups){const main=notes.find(n=>n.id===id),anchor=main.beat,borrow=.0625*graces.length;
   if(anchor>=borrow){
     for(const predecessor of [...notes,...rests])if(!graceIds.has(predecessor.id)&&predecessor.hand===main.hand&&predecessor.voice===main.voice&&Math.abs(predecessor.beat+predecessor.duration-anchor)<1e-5){if(predecessor.duration<=borrow)fail();predecessor.duration-=borrow;}
     graces.forEach((g,i)=>{g.beat=anchor-borrow+i*.0625;g.duration=.0625;g.voice=main.voice;});
   }else if(anchor===0){
     for(const chord of notes)if(!graceIds.has(chord.id)&&chord.hand===main.hand&&chord.voice===main.voice&&chord.beat===anchor){if(chord.duration<=borrow)fail();chord.beat+=borrow;chord.duration-=borrow;}
     graces.forEach((g,i)=>{g.beat=i*.0625;g.duration=.0625;g.voice=main.voice;});
   }else fail();
 }
 if(notes.some(n=>n.duration<1/1024))fail();
 return {score:{title:metadata.title,composer:metadata.composer||'',tempo:raw.bpm,timeSignature:raw.meter,keySignature:raw.key,durationBeats:raw.bars.reduce((s,v)=>s+v,0),notes},coverage:{complete:true,measureCount:raw.bars.length,measureDurations:raw.bars},positions,rests,continuity:{tieIn:(raw.in||[]).map(i=>({noteId:noteId(i)})),tieOut:(raw.out||[]).map(i=>({noteId:noteId(i)}))},internalTies:(raw.ties||[]).map(pair=>{if(!Array.isArray(pair)||pair.length!==2)fail();return {fromNoteId:noteId(pair[0]),toNoteId:noteId(pair[1])};}),warnings:raw.warnings||[],positionlessReview:pass==='verify',wireFormat:WIRE_VERSION};
}

// Lossless fixture conversion for offline protocol regression; never supplied to a model.
export function encodeCompactRegion(result,region,pass='recognize'){
 const voices=new Map(),next={right:1,left:1},v=n=>{const k=n.hand+':'+n.voice;if(!voices.has(k))voices.set(k,next[n.hand]++*(n.hand==='right'?1:-1));return voices.get(k);};
 const positions=new Map(result.positions.map(p=>[p.noteId,p])),ids=new Map(result.score.notes.map((n,i)=>[n.id,i]));
 return {complete:result.coverage.complete,meter:result.score.timeSignature,key:result.score.keySignature,bpm:result.score.tempo,bars:result.coverage.measureDurations,notes:result.score.notes.map(n=>{const base=[n.midi,n.beat,n.duration,v(n)];if(pass==='verify')return base;const p=positions.get(n.id);return [...base,(p.x-region.rect.x)/region.rect.width,(p.y-region.rect.y)/region.rect.height,n.velocity];}),rests:result.rests.map(r=>[r.beat,r.duration,v(r)]),in:result.continuity.tieIn.map(t=>ids.get(t.noteId)),out:result.continuity.tieOut.map(t=>ids.get(t.noteId)),ties:result.internalTies.map(t=>[ids.get(t.fromNoteId),ids.get(t.toNoteId)]),graces:[],warnings:result.warnings||[]};
}
