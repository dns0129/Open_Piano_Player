import {Type} from '@earendil-works/pi-ai';
import {decodeWrittenNotation,groupBy} from './recognition-notation.mjs';
import {recognitionTempo} from './recognition-tempo.mjs';
import {normalizeSourceAssessment,SOURCE_ASSESSMENT_INSTRUCTIONS} from './source-assessment.mjs';
export const sourceAssessmentSchema=Type.Object({probability:Type.Union([Type.Number({minimum:0,maximum:1}),Type.Null()]),cause:Type.String({enum:['source-notation','image-quality','recognition','uncertain']}),summary:Type.String({maxLength:600}),evidence:Type.Array(Type.String({maxLength:600}),{maxItems:12}),alternatives:Type.Array(Type.String({maxLength:600}),{maxItems:12})});

const midi=Type.Integer({minimum:21,maximum:108}),beat=Type.Number({minimum:0,maximum:512}),duration=Type.Number({minimum:1/1024,maximum:256}),voice=Type.Integer({minimum:-32,maximum:32}),coordinate=Type.Number({minimum:0,maximum:1}),index=Type.Integer({minimum:0,maximum:1023});
export const WIRE_VERSION='compact-v5';
const nullableAccidental=Type.Union([Type.Integer({minimum:-2,maximum:2}),Type.Null()]);
const notationSchema=Type.Object({version:Type.Literal(1),
 notes:Type.Array(Type.Object({index,staff:Type.Integer({minimum:1,maximum:2}),step:Type.String({enum:['C','D','E','F','G','A','B']}),octave:Type.Integer({minimum:-1,maximum:9}),alter:Type.Integer({minimum:-2,maximum:2}),printed:nullableAccidental,shift:Type.Integer({minimum:-24,maximum:24}),position:Type.Optional(Type.Union([Type.Integer({minimum:-30,maximum:40}),Type.Null()]))}),{maxItems:1024}),
 clefs:Type.Array(Type.Object({beat,staff:Type.Integer({minimum:1,maximum:2}),sign:Type.String({enum:['G','F','C']}),line:Type.Integer({minimum:1,maximum:5}),octaveChange:Type.Integer({minimum:-2,maximum:2})}),{maxItems:256}),
 keys:Type.Optional(Type.Array(Type.Object({beat,staff:Type.Integer({minimum:1,maximum:2}),fifths:Type.Integer({minimum:-7,maximum:7})}),{maxItems:256})),
 rests:Type.Array(Type.Object({index:Type.Integer({minimum:0,maximum:2047}),staff:Type.Integer({minimum:1,maximum:2}),x:Type.Optional(coordinate),y:Type.Optional(coordinate)}),{maxItems:2048}),
 voices:Type.Array(Type.Object({voice,from:beat,to:beat}),{maxItems:256})});
export function compactRegionSchema(pass='recognize'){
 const noteDuration=Type.Number({minimum:0,maximum:256});
 return Type.Object({notation:Type.Optional(notationSchema),sourceAssessment:Type.Optional(sourceAssessmentSchema),complete:Type.Boolean(),meter:Type.Tuple([Type.Integer({minimum:1,maximum:16}),Type.Integer({minimum:1,maximum:16})]),key:Type.Integer({minimum:-7,maximum:7}),bpm:Type.Union([Type.Number({minimum:20,maximum:300}),Type.Null(),Type.Literal(0)]),tempoStatus:Type.Optional(Type.String({enum:['read','not-marked','unreadable','unknown']})),bars:Type.Array(duration,{minItems:1,maxItems:256}),notes:Type.Array(Type.Tuple(pass==='verify'?[midi,beat,noteDuration,voice]:[midi,beat,noteDuration,voice,coordinate,coordinate,Type.Number({minimum:0,maximum:1})]),{maxItems:1024}),rests:Type.Array(Type.Tuple([beat,duration,voice]),{maxItems:2048}),in:Type.Array(index,{maxItems:32}),out:Type.Array(index,{maxItems:32}),ties:Type.Array(Type.Tuple([index,index]),{maxItems:1024}),graces:Type.Array(Type.Tuple([index,index]),{maxItems:128}),graceStyles:Type.Optional(Type.Array(Type.Tuple([index,Type.Integer({minimum:0,maximum:1}),Type.Integer({minimum:0,maximum:1}),Type.Number({minimum:1/1024,maximum:16})]),{maxItems:128})),tempos:Type.Optional(Type.Array(Type.Tuple([beat,Type.Number({minimum:20,maximum:300}),Type.Integer({minimum:0,maximum:1})]),{maxItems:256})),fermatas:Type.Optional(Type.Array(Type.Tuple([beat,Type.Number({minimum:1/1024,maximum:64})]),{maxItems:256})),warnings:Type.Array(Type.String({maxLength:300}),{maxItems:8})});
}
export function compactRegionInstructions(pass='recognize'){
 return '所有新转录必须提交notation（version=1）：notes每个主音和倚音均有{index,staff,step,octave,alter,printed,shift,position?}；index引用notes原数组；staff是原谱上下谱表1/2，与手别独立；step为CDEFGAB之一，octave为原谱书写八度，alter为调号/临时记号作用后的升降值，printed必须明确为原图显式-2..2或null（还原号为0）；shift是8va/8vb的半音数，不能再重复算谱号八度。position可填相对五线谱最下线的线间级数（最下线0，向上逐线间加1），不确定填null。clefs每项{beat,staff,sign,line,octaveChange}，两谱表从beat0开始并列全部变化；keys可列{beat,staff,fifths}，省略时沿用key。rests每项{index,staff,x?,y?}对原rests逐项提供证据；voices每项{voice,from,to}列原谱声部实际活动区间，区间内每拍须有读到的音或明确休止，不能根据空缺猜休止。保留重复音和多声部，不按MIDI高低决定谱表/手别。'+SOURCE_ASSESSMENT_INSTRUCTIONS+`\n必须用submit_score_region一次提交完整行。complete只有全部小节均读完才为true。meter为拍号，key为升降号数，bpm为读出的四分音符速度；未印速度、不可辨认或尚未读到时填null，tempoStatus分别填not-marked、unreadable或unknown；有可靠数字时填read。练习默认速度由程序另行设置，不能作为原谱数字提交。bars逐项列出每小节实际四分音符拍数（弱起保留实际值）。voice用非零整数：正数右手、负数左手，绝对值区分同手独立声部。notes每项严格为${pass==='verify'?'[MIDI,起始拍,时值,voice]，独立复读无需重新输出图像坐标或力度':'[MIDI,起始拍,时值,voice,音头x,音头y,力度]；x/y为当前图片归一化坐标，力度0到1'}。rests每项[起始拍,时值,voice]。in/out为跨行延音的音头数组下标，ties为行内延音的[起点下标,终点下标]，下标均从0开始，指向本次notes原始数组。不要提前合并延音音头；不要把连奏弧当延音。三连音保留分数拍（数值精度至少6位）。倚音只读纸面，借时仅记为独立演奏设置：每个倚音仍列入notes，beat填后续主音的纸面拍位，duration填0；graces逐项[倚音下标,后续主音下标]，没有则[]。graceStyles逐项[主音下标,借时位置,斜线,总借时拍数]，位置0为拍前、1为占用主音开头，斜线0无/1有；按原图区分有斜线短倚音与无斜线长倚音。借时是可编辑演奏设置：短倚音默认每个0.0625拍，长倚音默认主音时值的一半；没有则[]。主音、前置音与休止全部保留纸面原时值，不减时不移拍；App将统一分配倚音借时。速度变化用tempos逐项[拍位,四分音符BPM,到下一标记的曲线]，曲线0为突然变速、1为线性渐变；渐变必须带结束拍位及BPM，没有变化填[]。延长记号用fermatas逐项[停留拍位,额外拍数]；音符上的记号放在其纸面结束拍位，休止上的也保留。谱上未定量的延长默认额外1拍；未定量的rit./accel.给出保守可编辑终点并在warnings注明演奏估计，不能冒充原谱明确数字。不能可靠读取完整行就request_source。只调用工具，不另外输出说明段落。若提交工具返回具体校验疑点，只按原图修正，最多补救一次；不得为凑拍补写音符或休止。`;
}
export function decodeCompactRegion(raw,{metadata={},region,pass='recognize'}) {
  const fail=(path,message,code='INVALID_FIELD')=>{
    const noteIndex=/^notes\[(\d+)\]/.exec(path)?.[1];
    const item={code,path,message,...(noteIndex!==undefined?{noteId:'n'+noteIndex}:{})};
    throw Object.assign(new Error(`${path}: ${message}`),{code:code==='INCOMPLETE_REGION'?'INCOMPLETE_REGION':'INVALID_COMPACT_REGION',status:422,expose:true,issues:[item]});
  };
  const array=(value,path,max,required=false)=>{
    if(value===undefined&&!required)return [];
    if(!Array.isArray(value)||value.length>max)fail(path,`必须为最多 ${max} 项的数组`);
    return value;
  };
  const number=(v,path,min,max,integer=false)=>{
    if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||integer&&!Number.isInteger(v))fail(path,`必须为 ${min}–${max} 的${integer?'整数':'数值'}`);
    return v;
  };
  const tuple=(v,path,length)=>{if(!Array.isArray(v)||v.length!==length)fail(path,`必须恰有 ${length} 项`);};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('$','必须为对象');
  if(typeof raw.complete!=='boolean')fail('complete','必须使用布尔值');
  if(raw.complete!==true)fail('complete','尚未覆盖当前完整谱行，保留部分结果并请求清晰来源','INCOMPLETE_REGION');
  tuple(raw.meter,'meter',2);number(raw.meter[0],'meter[0]',1,16,true);
  if(![1,2,4,8,16].includes(raw.meter[1]))fail('meter[1]','拍号分母必须为 1、2、4、8 或 16');
  number(raw.key,'key',-7,7,true);
  const tempo=recognitionTempo(raw.bpm,raw.tempoStatus,metadata);
  const bars=array(raw.bars,'bars',256,true);if(!bars.length)fail('bars','必须列出全部小节');
  bars.forEach((v,i)=>number(v,`bars[${i}]`,1/1024,256));
  const total=bars.reduce((a,b)=>a+b,0);
  const voiceFields=(v,path)=>{number(v,path,-32,32,true);if(v===0)fail(path,'声部不能为 0');return {hand:v>0?'right':'left',voice:(v>0?'right-':'left-')+Math.abs(v)};};
  const notes=[],positions=[];
  array(raw.notes,'notes',1024,true).forEach((n,i)=>{
    const path=`notes[${i}]`;tuple(n,path,pass==='verify'?4:7);
    const [midi,beat,duration,v,x,y,velocity]=n;
    number(midi,path+'[0]',21,108,true);number(beat,path+'[1]',0,512);number(duration,path+'[2]',0,256);
    if(beat+duration>total+1e-5)fail(path+'[2]','音符结束超过本行小节范围','NOTE_OVERRUN');
    const id='n'+i;notes.push({id,midi,beat,duration,...voiceFields(v,path+'[3]'),velocity:pass==='verify'?(v>0?.75:.55):number(velocity,path+'[6]',0,1)});
    if(pass!=='verify'){
      number(x,path+'[4]',0,1);number(y,path+'[5]',0,1);
      positions.push({noteId:id,x:region.rect.x+x*region.rect.width,y:region.rect.y+y*region.rect.height,coordinateSpace:'page'});
    }
  });
  const noteId=(i,path)=>{number(i,path,0,notes.length-1,true);return 'n'+i;};
  const rests=array(raw.rests,'rests',2048).map((r,i)=>{
    const path=`rests[${i}]`;tuple(r,path,3);number(r[0],path+'[0]',0,512);number(r[1],path+'[1]',1/1024,256);
    if(r[0]+r[1]>total+1e-5)fail(path,'休止结束超过本行小节范围','REST_OVERRUN');
    return {beat:r[0],duration:r[1],...voiceFields(r[2],path+'[2]')};
  });
  const graceIds=new Set(),groups=new Map();
  array(raw.graces,'graces',128).forEach((pair,i)=>{
    const path=`graces[${i}]`;tuple(pair,path,2);const g=notes.find(n=>n.id===noteId(pair[0],path+'[0]')),main=notes.find(n=>n.id===noteId(pair[1],path+'[1]'));
    if(g===main||graceIds.has(g.id)||g.duration!==0||main.duration<=0||g.hand!==main.hand||Math.abs(g.beat-main.beat)>1e-5)fail(path,'倚音必须唯一、零时值，并锚定同手同拍位的主音');
    graceIds.add(g.id);if(!groups.has(main.id))groups.set(main.id,[]);groups.get(main.id).push(g);
  });
  for(const [id,graces]of groups)notes.find(n=>n.id===id).grace={placement:'before',slash:true,stealBeats:.0625*graces.length,notes:graces.map(g=>({midi:g.midi,velocity:g.velocity}))};
  const styled=new Set();
  array(raw.graceStyles,'graceStyles',128).forEach((e,i)=>{
    const path=`graceStyles[${i}]`;tuple(e,path,4);number(e[1],path+'[1]',0,1,true);number(e[2],path+'[2]',0,1,true);number(e[3],path+'[3]',1/1024,16);
    const main=notes.find(n=>n.id===noteId(e[0],path+'[0]'));if(!main?.grace||styled.has(main.id))fail(path,'主音没有倚音或样式重复');styled.add(main.id);
    Object.assign(main.grace,{placement:e[1]===1?'on':'before',slash:e[2]===1,stealBeats:e[3]});
  });
  for(const [i,n]of notes.entries())if(n.duration<1/1024&&!graceIds.has(n.id))fail(`notes[${i}][2]`,'非倚音时值须至少为 1/1024');
  const reference=(i,path)=>{const id=noteId(i,path);if(graceIds.has(id))fail(path,'延音不能引用零时值倚音');return id;};
  const tempos=array(raw.tempos,'tempos',256).map((e,i)=>{
    const path=`tempos[${i}]`;tuple(e,path,3);number(e[0],path+'[0]',0,total);number(e[1],path+'[1]',20,300);number(e[2],path+'[2]',0,1,true);
    return {beat:e[0],bpm:e[1],curve:e[2]===1?'linear':'step'};
  });
  const fermatas=array(raw.fermatas,'fermatas',256).map((e,i)=>{const path=`fermatas[${i}]`;tuple(e,path,2);number(e[0],path+'[0]',0,total);number(e[1],path+'[1]',1/1024,64);return {beat:e[0],holdBeats:e[1]};});
  const warnings=array(raw.warnings,'warnings',8);warnings.forEach((w,i)=>{if(typeof w!=='string'||w.length>300)fail(`warnings[${i}]`,'须为最多 300 字符的文字');});
  const decoded={sourceAssessment:normalizeSourceAssessment(raw.sourceAssessment),
    score:{title:metadata.title,composer:metadata.composer||'',tempo:tempo.tempo,tempoEvidence:tempo.tempoEvidence,timeSignature:raw.meter,keySignature:raw.key,durationBeats:total,notes:notes.filter(n=>!graceIds.has(n.id)),tempoMap:tempos,fermatas},
    coverage:{complete:true,measureCount:bars.length,measureDurations:bars},positions:positions.filter(p=>!graceIds.has(p.noteId)),rests,
    continuity:{tieIn:array(raw.in,'in',32).map((v,i)=>({noteId:reference(v,`in[${i}]`)})),tieOut:array(raw.out,'out',32).map((v,i)=>({noteId:reference(v,`out[${i}]`)}))},
    internalTies:array(raw.ties,'ties',1024).map((pair,i)=>{const path=`ties[${i}]`;tuple(pair,path,2);return {fromNoteId:reference(pair[0],path+'[0]'),toNoteId:reference(pair[1],path+'[1]')};}),
    warnings:[...warnings,...tempo.warnings],positionlessReview:pass==='verify',wireFormat:raw.notation?WIRE_VERSION:'legacy-compact-v4'};
  if(bars.every(b=>b<=raw.meter[0]*4/raw.meter[1]+1e-5)){let cursor=0;decoded.score.measureMap=bars.map(duration=>{const beat=cursor;cursor+=duration;const key=(raw.notation?.keys||[]).filter(k=>k.staff===1&&k.beat<=beat).sort((a,b)=>a.beat-b.beat).at(-1)?.fifths??raw.key;return {beat,duration,timeSignature:[...raw.meter],keySignature:key};});}
  return decodeWrittenNotation(raw,decoded,region);
}

// Lossless fixture conversion for offline protocol regression; never supplied to a model.
export function encodeCompactRegion(result,region,pass='recognize'){
 const voices=new Map(),next={right:1,left:1},v=n=>{const k=n.hand+':'+n.voice;if(!voices.has(k))voices.set(k,next[n.hand]++*(n.hand==='right'?1:-1));return voices.get(k);};
 const gracePairs=[],wireNotes=[...result.score.notes];
 for(const n of result.score.notes)for(const g of n.grace?.notes||[]){gracePairs.push([wireNotes.length,wireNotes.indexOf(n)]);wireNotes.push({...n,...g,id:n.id+'-grace-'+wireNotes.length,duration:0,grace:undefined});}
 const positions=new Map(result.positions.map(p=>[p.noteId,p])),ids=new Map(wireNotes.map((n,i)=>[n.id,i]));
 const evidence=result.score.recognitionEvidence;
 const graceIndex=new Map();if(evidence)for(const [anchor,group]of groupBy(evidence.graces||[],g=>g.anchor)){const pairs=gracePairs.filter(([,main])=>wireNotes[main].id===anchor);group.forEach((g,i)=>graceIndex.set(g.noteId,pairs[i]?.[0]));}
 return {complete:result.coverage.complete,meter:result.score.timeSignature,key:result.score.keySignature,bpm:result.score.tempoEvidence?.rawBpm??(result.score.tempoEvidence?.sourceBpm===null?null:result.score.tempo),...(result.score.tempoEvidence?{tempoStatus:result.score.tempoEvidence.sourceStatus}:{}),bars:result.coverage.measureDurations,notes:wireNotes.map(n=>{const base=[n.midi,n.beat,n.duration,v(n)];if(pass==='verify')return base;const p=positions.get(n.id)||positions.get(result.score.notes.find(main=>n.id.startsWith(main.id+'-grace-'))?.id);return [...base,(p.x-region.rect.x)/region.rect.width,(p.y-region.rect.y)/region.rect.height,n.velocity];}),rests:result.rests.map(r=>[r.beat,r.duration,v(r)]),in:result.continuity.tieIn.map(t=>ids.get(t.noteId)),out:result.continuity.tieOut.map(t=>ids.get(t.noteId)),ties:result.internalTies.map(t=>[ids.get(t.fromNoteId),ids.get(t.toNoteId)]),graces:gracePairs,graceStyles:result.score.notes.filter(n=>n.grace).map(n=>[ids.get(n.id),n.grace.placement==='on'?1:0,n.grace.slash?1:0,n.grace.stealBeats]),tempos:(result.score.tempoMap||[]).map(e=>[e.beat,e.bpm,e.curve==='linear'?1:0]),fermatas:(result.score.fermatas||[]).map(e=>[e.beat,e.holdBeats]),warnings:(result.warnings||[]).slice(0,8),...(evidence?{notation:{version:1,notes:evidence.notes.map(({noteId,...n})=>({...n,index:ids.get(noteId)??graceIndex.get(noteId)})),clefs:evidence.clefs,keys:evidence.keys,rests:(result.rests||[]).map((r,index)=>({index,staff:r.staff,...(evidence.rests.find(x=>x.restId===r.id)||{})})),voices:evidence.voices.map(scope=>({voice:v(scope),from:scope.from,to:scope.to}))}}:{})};
}
