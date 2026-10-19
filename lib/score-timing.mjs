/** Written quarter-note beats and performance seconds are separate coordinates.
 * curve belongs to the interval starting at that tempo event. Fermatas are
 * global pauses at a written boundary; duplicate marks use the longest hold.
 */
const EPS=1e-8;
const numeric=(v,min,max,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(label+'无效。');return v;};
export function normalizeScoreTiming(raw,duration){
  const result={};
  if(raw.tempoMap!==undefined){
    if(!Array.isArray(raw.tempoMap)||raw.tempoMap.length>32768)throw Error('速度时间轴无效。');
    const seen=new Set();
    result.tempoMap=raw.tempoMap.map(e=>{
      const beat=numeric(e?.beat,0,duration,'变速拍位'),bpm=numeric(e?.bpm,20,300,'变速 BPM');
      if(seen.has(beat)||!['step','linear'].includes(e.curve??'step'))throw Error('速度拍位重复或渐变方式无效。');
      seen.add(beat);return {beat,bpm,curve:e.curve??'step'};
    }).sort((a,b)=>a.beat-b.beat);
    if(result.tempoMap.at(-1)?.curve==='linear')throw Error('渐变速度需要一个后续终点。');
  }
  if(raw.fermatas!==undefined){
    if(!Array.isArray(raw.fermatas)||raw.fermatas.length>4096)throw Error('延长记号无效。');
    const marks=new Map();
    for(const e of raw.fermatas){const beat=numeric(e?.beat,0,duration,'延长拍位'),holdBeats=numeric(e?.holdBeats,1/1024,64,'额外延长拍数');marks.set(beat,Math.max(marks.get(beat)||0,holdBeats));}
    result.fermatas=[...marks].map(([beat,holdBeats])=>({beat,holdBeats})).sort((a,b)=>a.beat-b.beat);
  }
  return result;
}

export function createScoreTimeline(score){
  const duration=score.durationBeats||0,tempo=score.tempo||88;
  const normalized=normalizeScoreTiming(score,duration),events=[...(normalized.tempoMap||[])];
  if(!events.length||events[0].beat>0)events.unshift({beat:0,bpm:tempo,curve:'step'});
  const holds=new Map((normalized.fermatas||[]).map(e=>[e.beat,e.holdBeats]));
  for(const n of score.notes||[])if(n.fermata){const beat=n.beat+n.duration;holds.set(beat,Math.max(holds.get(beat)||0,n.fermata.holdBeats));}
  function tempoAt(beat){
    let i=events.length-1;while(i>0&&events[i].beat>beat)i--;
    const e=events[i],next=events[i+1];
    return e.curve==='linear'&&next?e.bpm+(next.bpm-e.bpm)*(beat-e.beat)/(next.beat-e.beat):e.bpm;
  }
  const cuts=[...new Set([0,duration,...events.map(e=>e.beat),...holds.keys()])].sort((a,b)=>a-b),segments=[];
  let seconds=0;
  const holdAt=beat=>{const length=(holds.get(beat)||0)*60/tempoAt(beat);if(length){segments.push({from:beat,to:beat,start:seconds,end:seconds+length});seconds+=length;}};
  holdAt(0);
  for(let i=0;i<cuts.length-1;i++){
    const from=cuts[i],to=cuts[i+1],bpm=tempoAt(from);
    // The left limit avoids integrating across an instantaneous tempo jump.
    let e=events.length-1;while(e>0&&events[e].beat>from)e--;
    const next=events[e+1],slope=events[e].curve==='linear'&&next?(next.bpm-events[e].bpm)/(next.beat-events[e].beat):0;
    const integrate=length=>Math.abs(slope)<EPS?length*60/bpm:60*Math.log1p(slope*length/bpm)/slope;
    const length=integrate(to-from);
    segments.push({from,to,start:seconds,end:seconds+length,bpm,slope});seconds+=length;holdAt(to);
  }
  const clampBeat=b=>Math.max(0,Math.min(duration,b));
  function secondsAt(beat,side='after'){
    beat=clampBeat(beat);let time=0;
    for(const s of segments){
      if(s.from===s.to){if(s.from<beat||side==='after'&&s.from===beat)time=s.end;else break;}
      else if(beat>=s.to)time=s.end;
      else if(beat>=s.from){const d=beat-s.from;return s.start+(Math.abs(s.slope)<EPS?d*60/s.bpm:60*Math.log1p(s.slope*d/s.bpm)/s.slope);}
      else break;
    }return time;
  }
  function beatAt(time){
    if(time<=0)return 0;if(time>=seconds)return duration;
    let lo=0,hi=segments.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(segments[mid].end<time)lo=mid+1;else hi=mid;}
    const s=segments[lo];if(s.from===s.to)return s.from;
    const t=time-s.start;return s.from+(Math.abs(s.slope)<EPS?t*s.bpm/60:s.bpm*Math.expm1(t*s.slope/60)/s.slope);
  }
  return {durationSeconds:seconds,secondsAt,beatAt,tempoAt,segments};
}

/** Offset explicit changes when joining independently read rows. Row base BPM
 * is contextual; only the first row supplies the document's initial tempo. */
export function offsetScoreTiming(score,offset){
  return {tempoMap:(score.tempoMap||[]).map(e=>({...e,beat:e.beat+offset})),fermatas:(score.fermatas||[]).map(e=>({...e,beat:e.beat+offset}))};
}

export function assembleScoreTiming(parts){
  const tempos=new Map(),holds=new Map();
  for(const {score,offset} of parts){
    const timing=offsetScoreTiming(score,offset);
    for(const e of timing.tempoMap)tempos.set(e.beat,e);
    for(const e of [...timing.fermatas,...(score.notes||[]).filter(n=>n.fermata).map(n=>({beat:offset+n.beat+n.duration,holdBeats:n.fermata.holdBeats}))])holds.set(e.beat,Math.max(holds.get(e.beat)||0,e.holdBeats));
  }
  return {tempoMap:[...tempos.values()].sort((a,b)=>a.beat-b.beat),fermatas:[...holds].map(([beat,holdBeats])=>({beat,holdBeats})).sort((a,b)=>a.beat-b.beat)};
}
