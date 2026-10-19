import {validateScore} from './score.mjs';
import {assembleScoreTiming} from './score-timing.mjs';
const epsilon=1e-5;
/** Assemble explicit source ranges, rejecting missing/duplicated pages or silently truncated OCR. */
export function assembleScoreSegments(metadata, ranges, segments) {
  if(!Array.isArray(ranges)||!ranges.length||!Array.isArray(segments))throw new Error('缺少完整乐谱范围清单。');
  const ids=new Set(),byId=new Map();
  for(const part of segments){if(byId.has(part.id))throw new Error('识谱结果重复：'+part.id);byId.set(part.id,part);}
  let nextMeasure=1;const notes=[],coverage=[],timingParts=[];
  const beatsPerMeasure=metadata.timeSignature[0]*4/metadata.timeSignature[1];
  for(const range of ranges){
    if(ids.has(range.id))throw new Error('原谱范围清单重复。');ids.add(range.id);
    if(range.firstMeasure!==nextMeasure||!Number.isInteger(range.lastMeasure)||range.lastMeasure<range.firstMeasure)throw new Error('原谱小节范围有缺口或重叠。');
    const part=byId.get(range.id);if(!part)throw new Error('缺少原谱范围：'+range.id);
    const score=validateScore(part.score),length=(range.lastMeasure-range.firstMeasure+1)*beatsPerMeasure;
    if(Math.abs(score.durationBeats-length)>epsilon)throw new Error(`${range.id} 应有 ${length} 拍，实际 ${score.durationBeats} 拍；不能作为完整页导入。`);
    if(score.timeSignature.some((value,i)=>value!==metadata.timeSignature[i]))throw new Error(range.id+' 拍号不一致。');
    const start=(range.firstMeasure-1)*beatsPerMeasure;
    for(const note of score.notes){if(note.beat+note.duration>length+epsilon)throw new Error(range.id+' 音符超出本页范围。');notes.push({...note,id:`${range.id}-${note.id}`,beat:start+note.beat});}
    timingParts.push({score,offset:start});
    coverage.push({...range,startBeat:start,endBeat:start+length,noteCount:score.notes.length});nextMeasure=range.lastMeasure+1;
  }
  if(segments.length!==ranges.length)throw new Error('存在原谱范围以外的识谱结果。');
  const score=validateScore({...metadata,...assembleScoreTiming(timingParts),notes:notes.map(({fermata,...n})=>n),durationBeats:(nextMeasure-1)*beatsPerMeasure});
  return {score,coverage};
}
export function compareScoreEvents(expected,actual,{tolerance=1e-4}={}){
  const key=n=>[n.hand,n.midi,Math.round(n.beat/tolerance),Math.round(n.duration/tolerance)].join(':');
  const a=new Map(),b=new Map();
  for(const n of expected.notes){const k=key(n);a.set(k,(a.get(k)||0)+1);}
  for(const n of actual.notes){const k=key(n);b.set(k,(b.get(k)||0)+1);}
  const missing=[],extra=[];
  for(const [k,count]of a)for(let i=b.get(k)||0;i<count;i++)missing.push(k);
  for(const [k,count]of b)for(let i=a.get(k)||0;i<count;i++)extra.push(k);
  return {exactMatch:missing.length===0&&extra.length===0,expectedCount:expected.notes.length,actualCount:actual.notes.length,missing,extra};
}
