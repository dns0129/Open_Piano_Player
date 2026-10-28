#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';
import MidiFilePackage from 'midi-file';
import { validateScore, scoreMeasureIndex } from './core/score.mjs';
import { exportMusicXML, exportMidi } from './core/exporters.mjs';
import { performanceNotes } from './core/note-effects.mjs';
import {reviewEvidenceBlockers} from './review-evidence.mjs';
import {recognitionTempo,validateTempoEvidence} from './recognition-tempo.mjs';

const { parseMidi, writeMidi } = MidiFilePackage;
const DIVISIONS = 15360, EPS = 1e-6;
const letters = ['C','D','E','F','G','A','B'], semitones = [0,2,4,5,7,9,11];
const units = { whole:4, half:2, quarter:1, eighth:.5, '16th':.25, '32nd':.125, '64th':.0625, '128th':.03125 };
const accidentals = { '-2':'flat-flat', '-1':'flat', 0:'natural', 1:'sharp', 2:'double-sharp' };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const eq = (a,b) => Math.abs(a-b) < EPS;
const sha = data => createHash('sha256').update(data).digest('hex');
const element = (name, value) => ({[name]: Array.isArray(value) ? value : value === null ? [] : [{'#text':value}]});
const nameOf = item => Object.keys(item).find(k=>k!==':@');
const attr = (item,key) => item?.[':@']?.[`@${key}`];
const children = (item,name) => item?.[name] || [];
const child = (items,name) => items.find(item=>Object.hasOwn(item,name));
const getText = (items,name) => child(items,name)?.[name]?.[0]?.['#text'];
const options = { preserveOrder:true, ignoreAttributes:false, attributeNamePrefix:'@', parseTagValue:false };
const pitch = p => {
  assert(p && letters.includes(p.step) && Number.isInteger(p.alter) && Math.abs(p.alter)<=2 && Number.isInteger(p.octave), '音高须含 step C–B、alter -2..2、octave 整数');
  return (p.octave+1)*12+semitones[letters.indexOf(p.step)]+p.alter;
};
const pitchElement = p => element('pitch',[element('step',p.step), ...(p.alter?[element('alter',p.alter)]:[]),element('octave',p.octave)]);
const keyAlter = (step,fifths) => (fifths>=0?['F','C','G','D','A','E','B']:['B','E','A','D','G','C','F']).slice(0,Math.abs(fifths)).includes(step) ? Math.sign(fifths):0;
const knownKeys = (object,allowed,label) => {
  for (const key of Object.keys(object||{})) assert(allowed.includes(key),`${label} 未支持字段 ${key}；放入 notation.unhandled 并说明，不要静默丢弃`);
};

export function validateTranscription(raw, manifest, { draft=false }={}) {
  assert(raw?.schema==='piano-score-transcription/v1','转录文件 schema 必须为 piano-score-transcription/v1');
  assert(manifest?.schema==='piano-score-pages/v1' && manifest.pages?.length,'必须提供 prepare_score.py 的全页 manifest');
  assert(Array.isArray(raw.pages) && raw.pages.length===manifest.pages.length,'转录页数与原始清单不一致，不能交付完整谱');
  const blockers=[], warnings=[], coverage=[], ids=new Set(), owners=new Map();
  const reviewFlag=(value,label)=>assert(typeof value==='boolean',`${label} 必须为布尔值，不能使用字符串或数字`);
  reviewFlag(raw.review?.humanConfirmed,'review.humanConfirmed');
  for(const note of raw.score?.notes||[]) {
    assert(/^[A-Za-z_][A-Za-z0-9_.-]{0,70}$/.test(note.id||'')&&!ids.has(note.id),`音符 ID 无效或重复：${note.id}`);
    ids.add(note.id);
    knownKeys(note,['id','midi','beat','duration','hand','voice','velocity','dynamic','accent','articulation','ornament','ornamentInterval','arpeggio','tieTo'],'score.notes');
  }
  const tempoState=raw.score?.tempoEvidence?{tempo:raw.score.tempo,tempoEvidence:validateTempoEvidence(raw.score.tempoEvidence),warnings:[]}:recognitionTempo(raw.score?.tempo??null,raw.score?.tempoStatus);
  warnings.push(...tempoState.warnings);
  if(tempoState.tempoEvidence.sourceStatus==='unknown'||tempoState.tempoEvidence.sourceStatus==='unreadable')blockers.push('原谱速度待确认；草稿可使用单独标注的练习速度，音符转录已保留');
  const score=validateScore({...raw.score,tempo:tempoState.tempo,source:{...raw.score?.source,kind:'image-ai',reviewRequired:true}});
  score.tempoEvidence=tempoState.tempoEvidence;
  assert(score.measureMap?.length,'必须显式提交 measureMap，包括弱起和最后休止，不能凭末音猜页尾');
  const notation=raw.notation||{};
  knownKeys(notation,['notes','graces','spanners','keys','tempoMarks','unhandled'],'notation');
  const noteMeta=notation.notes||{}, byId=new Map(score.notes.map(n=>[n.id,n]));
  assert(Object.keys(noteMeta).length===score.notes.length,'每个数字音符必须恰有一条 notation.notes 原谱证据');
  const pageIds=new Set();
  for(const page of raw.pages) {
    reviewFlag(page.reviewed,`第 ${page.page} 页 reviewed`);
    assert(Number.isInteger(page.page)&&!pageIds.has(page.page),'页编号无效或重复'); pageIds.add(page.page);
    const expected=manifest.pages.find(p=>p.page===page.page);
    assert(expected && page.sha256===expected.sha256,`第 ${page.page} 页原图哈希不一致`);
    assert(['score','excluded'].includes(page.status),`第 ${page.page} 页未分类`);
    if(page.status==='excluded') {
      assert(typeof page.reason==='string'&&page.reason.trim()&&!page.systems?.length,`排除第 ${page.page} 页须说明封面/空白等原因`);
      if(!page.reviewed)blockers.push(`第 ${page.page} 页排除理由未核对`);
      coverage.push({page:page.page,status:'excluded',reason:page.reason}); continue;
    }
    assert(page.systems?.length,`第 ${page.page} 页缺少逐行清单`);
    const sysIds=new Set();
    for(const system of page.systems) {
      reviewFlag(system.complete,`${system.id}.complete`);reviewFlag(system.reviewed,`${system.id}.reviewed`);
      assert(typeof system.id==='string'&&!sysIds.has(system.id),'系统行 ID 重复');sysIds.add(system.id);
      assert(system.staves===2,`第 ${page.page} 页 ${system.id} 须确认为双谱表钢琴行；其他布局先适配，不当作已支持`);
      assert(Number.isInteger(system.measureStart)&&Number.isInteger(system.measureEnd)&&system.measureStart>=1&&system.measureEnd>=system.measureStart,'系统行小节范围无效');
      if(!system.complete||!system.reviewed)blockers.push(`第 ${page.page} 页 ${system.id} 未完整复核`);
      for(let m=system.measureStart;m<=system.measureEnd;m++) {
        assert(!owners.has(m),`小节 ${m} 被重复分配；跨行断开的小节须先建立统一来源记录`);
        owners.set(m,{page:page.page,system:system.id});
      }
    }
    coverage.push({page:page.page,status:'score',systems:page.systems.length,reviewed:!!page.reviewed});
    if(!page.reviewed)blockers.push(`第 ${page.page} 页未复核`);
  }
  assert(owners.size===score.measureMap.length && score.measureMap.every((_,i)=>owners.has(i+1)),'系统行清单没有连续覆盖全部小节');
  const keys=notation.keys||[{measure:1,fifths:score.keySignature,mode:score.mode||'major'}];
  assert(keys.length && keys[0].measure===1,'调号清单必须从第1小节开始');
  keys.forEach((k,i)=>assert(Number.isInteger(k.measure)&&k.measure<=score.measureMap.length&&k.measure>(i?keys[i-1].measure:0)&&Number.isInteger(k.fifths)&&Math.abs(k.fifths)<=7&&['major','minor'].includes(k.mode),'调号/调式变更无效'));
  assert(keys[0].fifths===score.keySignature&&keys[0].mode===(score.mode||'major'),'首调与 score 调号/调式不一致');
  const keyAt=m=>keys.filter(k=>k.measure<=m).at(-1);
  const tempos=structuredClone(notation.tempoMarks||[{beat:0,unit:'quarter',dots:0,bpm:score.tempo,practice:tempoState.tempoEvidence.sourceBpm===null}]);
  if(tempoState.tempoEvidence.sourceBpm===null&&tempos[0])tempos[0].practice=true;
  if(tempoState.tempoEvidence.sourceBpm===null&&tempos[0]&&(tempos[0].bpm===null||tempos[0].bpm===0)){assert(tempos[0].unit==='quarter'&&(tempos[0].dots||0)===0,'未知速度的练习值使用四分音符单位');tempos[0].bpm=score.tempo;tempos[0].practice=true;}
  assert(tempos.length&&tempos[0].beat===0,'速度清单必须从第0拍开始');
  tempos.forEach((t,i)=>{
    assert(Number.isFinite(t.beat)&&t.beat>=0&&t.beat<score.durationBeats&&t.beat>(i?tempos[i-1].beat:-1)&&units[t.unit]&&Number.isInteger(t.dots)&&t.dots>=0&&t.dots<=2&&Number.isFinite(t.bpm)&&t.bpm>0,'BPM/节拍单位/变速位置无效');
    t.quarterBpm=t.bpm*units[t.unit]*(2-1/2**t.dots);
    assert(t.quarterBpm>=20&&t.quarterBpm<=300,'换算后的四分音符 BPM 超出20–300范围');
  });
  assert(eq(tempos[0].quarterBpm,score.tempo),'印刷速度换算后与 score.tempo 不一致');
  const checkSource=(meta,label)=>{
    const s=meta?.source, owner=owners.get(s?.measure);
    assert(owner&&owner.page===s.page&&owner.system===s.system&&[1,2].includes(s.staff),`${label} 原页/行/小节/谱表证据无效`);
    reviewFlag(meta.checked,`${label}.checked`);
    if(!meta.checked)blockers.push(`${label} 未按原图复核`);
  };
  const incoming=new Map(score.notes.filter(n=>n.tieTo).map(n=>[n.tieTo,n.id]));
  const state=new Map();
  for(const n of score.notes) {
    const meta=noteMeta[n.id];
    knownKeys(meta,['pitch','printedAccidental','source','checked','sourceWrittenPitch','octaveShift','rhythm','fermata'],`notation.notes.${n.id}`);
    assert(meta && pitch(meta.pitch)===n.midi,`${n.id} 书写音名、八度、升降值与 MIDI 不一致`);
    checkSource(meta,n.id);
    const measure=scoreMeasureIndex(score,n.beat)+1;
    assert(meta.source.measure===measure,`${n.id} 来源小节与时间轴不一致`);
    if(meta.sourceWrittenPitch)assert(pitch(meta.sourceWrittenPitch)+(meta.octaveShift||0)===n.midi,`${n.id} 原谱八度记号与实际音高不一致`);
    else assert(!meta.octaveShift,`${n.id} 缺少八度移位之前的原谱写法`);
    const written=meta.sourceWrittenPitch||meta.pitch;
    assert(meta.printedAccidental===null || Number.isInteger(meta.printedAccidental)&&Math.abs(meta.printedAccidental)<=2,`${n.id} 必须显式记录 printedAccidental（无符号为 null）`);
    const k=`${measure}:${meta.source.staff}:${written.step}:${written.octave}`;
    const inherited=state.has(k)?state.get(k):keyAlter(written.step,keyAt(measure).fifths);
    if(meta.printedAccidental!==null)state.set(k,meta.printedAccidental);
    const expected=meta.printedAccidental===null?inherited:meta.printedAccidental;
    if(!incoming.has(n.id)||meta.printedAccidental!==null)assert(written.alter===expected,`${n.id} 临时记号沿用/还原/调号规则冲突`);
    if(incoming.has(n.id))assert(pitch(noteMeta[incoming.get(n.id)].pitch)===n.midi,'延音后续实际音高不一致');
    if(n.ornament)assert([1,2].includes(n.ornamentInterval),`${n.id} 装饰音须从原谱确定辅助音间隔，不能按旋律猜测`);
    if(meta.rhythm) {
      const r=meta.rhythm;
      assert(units[r.type]&&Number.isInteger(r.dots)&&r.dots>=0&&r.dots<=2,'书写时值无效');
      const ratio=r.tuplet?(r.tuplet.normal/r.tuplet.actual):1;
      if(r.tuplet)assert(Number.isInteger(r.tuplet.actual)&&r.tuplet.actual>0&&Number.isInteger(r.tuplet.normal)&&r.tuplet.normal>0&&typeof r.tuplet.group==='string'&&r.tuplet.group.length>0&&Number.isInteger(r.tuplet.number??1)&&(r.tuplet.number??1)>=1&&(r.tuplet.number??1)<=6,'连音比例/分组 ID/编号无效');
      assert(eq(units[r.type]*(2-1/2**r.dots)*ratio,n.duration),`${n.id} 书写符值/附点/连音与时值不一致`);
    }
    if(meta.fermata)assert(['normal','angled','square'].includes(meta.fermata),'延长记号形状无效');
  }
  for(const id of Object.keys(noteMeta))assert(ids.has(id),`多余的原谱音符证据 ${id}`);
  const graces=notation.graces||[];
  for(const g of graces) {
    knownKeys(g,['id','beforeNote','pitch','type','slash','source','checked'],'notation.graces');
    assert(/^[A-Za-z_][A-Za-z0-9_.-]{0,70}$/.test(g.id||'')&&!ids.has(g.id)&&byId.has(g.beforeNote),'倚音 ID 重复或锚点无效');ids.add(g.id);
    assert(pitch(g.pitch)>=21&&pitch(g.pitch)<=108&&['eighth','16th','32nd'].includes(g.type)&&typeof g.slash==='boolean','倚音音高/符值无效');
    checkSource(g,g.id);
    assert(g.source.measure===noteMeta[g.beforeNote].source.measure,'倚音和锚点必须属于同一小节');
  }
  for(const s of notation.spanners||[])assert(s.type==='slur'&&byId.has(s.start)&&byId.has(s.end)&&byId.get(s.start).beat<=byId.get(s.end).beat&&Number.isInteger(s.number)&&s.number>=1&&s.number<=6,'仅支持有效的 slur 连奏弧；其他跨音符符号放入 unhandled');
  for(const issue of raw.issues||[]) {
    assert(typeof issue.message==='string'&&issue.message.trim(),'未解决项目须提供 message');
    (issue.severity==='warning'?warnings:blockers).push(issue.message);
  }
  for(const issue of notation.unhandled||[]) {
    assert(typeof issue.message==='string'&&issue.message.trim(),'未支持符号须提供 message');
    blockers.push(issue.message);
  }
  if(raw.review?.status!=='checked')blockers.push('转录尚未完成原谱复核');
  blockers.push(...reviewEvidenceBlockers(raw));
  if(graces.length)warnings.push('倚音保存在 MusicXML/重绘谱；MIDI 和琴伴 JSON 暂不演奏这些零时值倚音');
  if(Object.values(noteMeta).some(n=>n.fermata))warnings.push('延长记号保存在谱面；MIDI 和琴伴 JSON 不自动猜测延长时长');
  if(tempos.length>1)warnings.push('MusicXML/MIDI 包含变速；琴伴 JSON 播放器当前仅使用首个 BPM');
  if(keys.length>1)warnings.push('MusicXML/MIDI 包含变调；琴伴 JSON 的显示编辑当前主要使用全局调号');
  if((notation.spanners||[]).length)warnings.push('连奏弧保存在谱面；当前 MIDI 不另行模拟连奏触键');
  assert(draft||!blockers.length,`尚不能作为校对完成谱：${blockers.join('；')}。仅供检查时加 --draft`);
  return {score,notation,noteMeta,keys,tempos,coverage,blockers,warnings};
}

function addNotation(note,mark) {
  let node=child(note.note,'notations');
  if(!node) { node=element('notations',[]);const play=note.note.findIndex(n=>nameOf(n)==='play');note.note.splice(play<0?note.note.length:play,0,node); }
  node.notations.push(mark);
}

export function musicXML(checked) {
  const {score,noteMeta,notation,keys,tempos}=checked;
  const tree=new XMLParser(options).parse(exportMusicXML(score));
  const root=child(tree,'score-partwise')['score-partwise'];
  const measures=children(child(root,'part'),'part').filter(n=>nameOf(n)==='measure');
  const segments=new Map();
  for(const [index,measure] of measures.entries()) {
    const content=measure.measure;
    // Remove generated global tempo/key and rebuild explicit source maps below.
    for(let i=content.length-1;i>=0;i--) {
      if(nameOf(content[i])==='direction' && child(content[i].direction,'direction-type')?.['direction-type'].some(n=>nameOf(n)==='metronome')) content.splice(i,1);
      if(nameOf(content[i])==='attributes')content[i].attributes=content[i].attributes.filter(n=>nameOf(n)!=='key');
    }
    const key=keys.find(k=>k.measure===index+1);
    if(key) {
      let attributes=child(content,'attributes');
      if(!attributes){attributes=element('attributes',[]);content.unshift(attributes);}
      // MusicXML attributes order: divisions, key, time, staves, clefs.
      const divIndex=attributes.attributes.findIndex(n=>nameOf(n)==='divisions');
      attributes.attributes.splice(divIndex+1,0,element('key',[element('fifths',key.fifths),element('mode',key.mode)]));
    }
    let insert=content.findIndex(n=>nameOf(n)!=='attributes');if(insert<0)insert=content.length;
    const bar=score.measureMap[index];
    for(const t of tempos.filter(t=>t.beat>=bar.beat-EPS&&t.beat<bar.beat+bar.duration-EPS)) {
      const met=element('metronome',[element('beat-unit',t.unit),...Array.from({length:t.dots},()=>element('beat-unit-dot',null)),element('per-minute',t.bpm)]);
      const offset=element('offset',Math.round((t.beat-bar.beat)*DIVISIONS));offset[':@']={'@sound':'yes'};
      const sound=element('sound',null);sound[':@']={'@tempo':String(t.quarterBpm)};
      content.splice(insert++,0,element('direction',[element('direction-type',t.practice?[element('words','练习速度（原谱无已确认数值）'),met]:[met]),offset,element('staff',1),sound]));
    }
    for(const note of content.filter(n=>nameOf(n)==='note'&&attr(n,'id'))) {
      const id=String(attr(note,'id')).replace(/^note-/,'').replace(/-m\d+$/,'');
      const meta=noteMeta[id];assert(meta,`导出音符 ${id} 无来源`);
      const pi=note.note.findIndex(n=>nameOf(n)==='pitch'); note.note[pi]=pitchElement(meta.pitch);
      if(!segments.has(id))segments.set(id,[]); segments.get(id).push({note,content});
      const isAttack=segments.get(id).length===1;
      if(isAttack&&meta.printedAccidental!==null) {
        const i=note.note.findIndex(n=>['time-modification','staff','notations','play'].includes(nameOf(n)));
        note.note.splice(i<0?note.note.length:i,0,element('accidental',accidentals[meta.printedAccidental]));
      }
      const sourceNote=score.notes.find(n=>n.id===id), ticks=Number(getText(note.note,'duration'));
      if(isAttack&&sourceNote.ornament) {
        // The App core infers a spelling from MIDI; here use the read letter,
        // so a Bb trill has a C auxiliary, rather than treating it as A#–B#.
        const direction=sourceNote.ornament==='mordent-lower'?-1:1;
        const next=letters.indexOf(meta.pitch.step)+direction, letter=letters[(next+7)%7];
        const octave=meta.pitch.octave+(next<0?-1:next>6?1:0);
        const aux=sourceNote.midi+direction*sourceNote.ornamentInterval;
        const alter=aux-((octave+1)*12+semitones[letters.indexOf(letter)]);
        assert(Number.isInteger(alter)&&Math.abs(alter)<=2,`${id} 装饰音辅助音不能按本版音名字母表示`);
        const ornaments=child(child(note.note,'notations')?.notations||[],'ornaments');
        ornaments.ornaments=ornaments.ornaments.filter(n=>nameOf(n)!=='accidental-mark');
        const key=keys.filter(k=>k.measure<=index+1).at(-1);
        if(alter!==keyAlter(letter,key.fifths)) {
          const mark=element('accidental-mark',accidentals[alter]);mark[':@']={'@placement':direction<0?'below':'above'};ornaments.ornaments.push(mark);
        }
      }
      if(meta.rhythm&&eq(ticks/DIVISIONS,sourceNote.duration)) {
        note.note=note.note.filter(n=>!['type','dot','time-modification'].includes(nameOf(n)));
        const r=meta.rhythm, rr=[element('type',r.type),...Array.from({length:r.dots},()=>element('dot',null))];
        const pos=note.note.findIndex(n=>['accidental','staff','notations','play'].includes(nameOf(n)));note.note.splice(pos<0?note.note.length:pos,0,...rr);
        if(r.tuplet) {
          const pos=note.note.findIndex(n=>['staff','notations','play'].includes(nameOf(n)));
          note.note.splice(pos<0?note.note.length:pos,0,element('time-modification',[element('actual-notes',r.tuplet.actual),element('normal-notes',r.tuplet.normal)]));
        }
      }
    }
  }
  for(const [id,parts] of segments)if(noteMeta[id].fermata)addNotation(parts.at(-1).note,element('fermata',noteMeta[id].fermata));
  const tuplets=new Map();
  for(const n of score.notes) {
    const t=noteMeta[n.id].rhythm?.tuplet;if(!t)continue;
    const key=`${n.hand}:${n.voice??''}:${t.group}`;
    if(!tuplets.has(key))tuplets.set(key,[]);tuplets.get(key).push(n);
  }
  for(const notes of tuplets.values()) {
    const first=notes[0], last=notes.at(-1), t=noteMeta[first.id].rhythm.tuplet;
    assert(notes.every(n=>{const x=noteMeta[n.id].rhythm.tuplet;return x.actual===t.actual&&x.normal===t.normal&&(x.number??1)===(t.number??1);}), '同一连音分组的比例/编号不一致');
    for(const [id,phase,index] of [[first.id,'start',0],[last.id,'stop',-1]]) {
      const mark=element('tuplet',null);mark[':@']={'@type':phase,'@number':String(t.number??1),...(phase==='start'?{'@bracket':'yes','@show-number':'actual'}:{})};
      addNotation(segments.get(id).at(index).note,mark);
    }
  }
  for(const s of notation.spanners||[]) {
    for(const [id,phase,segment] of [[s.start,'start',0],[s.end,'stop',-1]]) {
      const mark=element('slur',null);mark[':@']={'@type':phase,'@number':String(s.number)};
      addNotation(segments.get(id).at(segment).note,mark);
    }
  }
  for(const g of notation.graces||[]) {
    const {note:anchor,content}=segments.get(g.beforeNote)[0];
    const grace=element('grace',null);grace[':@']={'@slash':g.slash?'yes':'no'};
    const node=element('note',[grace,pitchElement(g.pitch),element('voice',getText(anchor.note,'voice')),element('type',g.type),element('staff',getText(anchor.note,'staff'))]);
    node[':@']={'@id':`grace-${g.id}`};content.splice(content.indexOf(anchor),0,node);
  }
  const xml=new XMLBuilder({...options,format:true,suppressEmptyNode:true}).build(tree);
  assert(XMLValidator.validate(xml)===true,'生成的 MusicXML 不是有效 XML');
  return xml;
}

export function midi(checked) {
  const data=parseMidi(exportMidi(checked.score)), conductor=data.tracks[0];
  let elapsed=0;
  const events=conductor.map((e,i)=>{elapsed+=e.deltaTime;return {...e,absolute:elapsed,order:i};}).filter(e=>!['setTempo','keySignature'].includes(e.type));
  for(const t of checked.tempos)events.push({absolute:Math.round(t.beat*data.header.ticksPerBeat),order:-2,meta:true,type:'setTempo',microsecondsPerBeat:Math.round(60000000/t.quarterBpm)});
  for(const k of checked.keys)events.push({absolute:Math.round(checked.score.measureMap[k.measure-1].beat*data.header.ticksPerBeat),order:-1,meta:true,type:'keySignature',key:k.fifths,scale:k.mode==='minor'?1:0});
  events.sort((a,b)=>a.absolute-b.absolute||a.order-b.order);elapsed=0;
  data.tracks[0]=events.map(({absolute,order,...e})=>{e.deltaTime=absolute-elapsed;elapsed=absolute;return e;});
  return new Uint8Array(writeMidi(data));
}

export function usageSummary(calls=[]) {
  const fields=['inputTokens','outputTokens','cachedInputTokens','cacheWriteTokens','reasoningTokens','totalTokens'];
  return {calls:calls.length,callsWithUsage:calls.filter(c=>c.usage).length,fields:Object.fromEntries(fields.map(f=>{
    const values=calls.map(c=>c.usage?.[f]).filter(v=>Number.isFinite(v)&&v>=0);
    return [f,{sum:values.length?values.reduce((a,b)=>a+b,0):null,reportedCalls:values.length}];
  })),note:'逐字段只累计实际返回值；缓存/思考字段可能包含于 input/output/total，不能再相加。空缺不是0。'};
}

export async function build(input,manifestFile,out,{draft=false,render=true}={}) {
  const started=performance.now(), raw=JSON.parse(await fs.readFile(input,'utf8'));
  const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
  // Verify the actual images still match the evidence, not just matching JSON strings.
  for(const p of manifest.pages) {
    assert(!path.isAbsolute(p.file)&&!p.file.split(/[\\/]/).includes('..'),'manifest 中的页图必须在清单目录内');
    assert(sha(await fs.readFile(path.resolve(path.dirname(manifestFile),p.file)))===p.sha256,`原图第 ${p.page} 页已变化`);
  }
  const checked=validateTranscription(raw,manifest,{draft});
  assert(!await fs.stat(out).then(()=>true,()=>false),'输出目录已存在；选择新目录以保留上次结果');
  await fs.mkdir(out,{recursive:true});
  const xml=musicXML(checked), midiBytes=midi(checked);
  await fs.writeFile(path.join(out,'score.musicxml'),xml);
  await fs.writeFile(path.join(out,'score.mid'),midiBytes);
  await fs.writeFile(path.join(out,'score.qinban.json'),JSON.stringify(checked.score,null,2)+'\n');
  await fs.copyFile(input,path.join(out,'transcription.json'));
  await fs.copyFile(manifestFile,path.join(out,'source-manifest.json'));
  let engravedPages=null;
  if(render) {
    const [{default:createModule},{VerovioToolkit}]=await Promise.all([import('verovio/wasm'),import('verovio/esm')]);
    const tk=new VerovioToolkit(await createModule());
    try {
      tk.setOptions({inputFrom:'musicxml',breaks:'auto',pageWidth:2100,pageHeight:2970,scale:40,svgViewBox:true,svgHtml5:true,header:'none',footer:'none'});
      assert(tk.loadData(xml),'Verovio 无法加载生成的 MusicXML');engravedPages=tk.getPageCount();
      assert(engravedPages>0,'没有生成重绘谱页');
      for(let p=1;p<=engravedPages;p++)await fs.writeFile(path.join(out,`engraved-${String(p).padStart(3,'0')}.svg`),tk.renderToSVG(p));
    } finally {tk.destroy();}
    const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>重新制谱</title><style>body{margin:0;background:#eee}img{display:block;width:100%;max-width:1100px;margin:16px auto;background:white}@media print{img{break-after:page;margin:0;max-width:100%}}</style>'+Array.from({length:engravedPages},(_,i)=>`<img alt="重绘第${i+1}页" src="engraved-${String(i+1).padStart(3,'0')}.svg">`).join('');
    await fs.writeFile(path.join(out,'index.html'),html);
  }
  const report={schema:'piano-score-report/v1',status:checked.blockers.length?'draft':'checked',review:raw.review,humanConfirmed:raw.review?.humanConfirmed===true,
    sourcePages:manifest.pages.length,coverage:checked.coverage,measures:checked.score.measureMap.length,writtenMainNotes:checked.score.notes.length,
    writtenGraces:(checked.notation.graces||[]).length,performedEvents:performanceNotes(checked.score).length,engravedPages,
    blockers:checked.blockers,warnings:checked.warnings,recognition:raw.provenance||null,usage:usageSummary(raw.provenance?.calls),
    accuracy:{measured:false,reason:'未提供独立参考并逐音评分；结构通过、模型复核及可播放不等于识别准确率'},
    conversionSeconds:(performance.now()-started)/1000,hashes:{musicxml:sha(xml),midi:sha(midiBytes)}};
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
  const args=process.argv.slice(2), flag=k=>args.includes(k), value=k=>args[args.indexOf(k)+1];
  if(!flag('--input')||!flag('--manifest')||!flag('--out')) {
    console.error('node score_pipeline.mjs --input transcription.json --manifest pages/manifest.json --out NEW_DIRECTORY [--draft] [--no-render]');process.exitCode=2;
  } else {
    try {console.log(JSON.stringify(await build(value('--input'),value('--manifest'),value('--out'),{draft:flag('--draft'),render:!flag('--no-render')}),null,2));}
    catch(error){console.error(error.message);process.exitCode=1;}
  }
}
