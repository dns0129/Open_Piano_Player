/** Written rhythm only. Playback continues to use the untouched score events. */
export const NOTE_VALUES = [
  ['breve','1/2',8,'倍全'],['whole','w',4,'全音符'],['half','h',2,'二分'],['quarter','q',1,'四分'],
  ['eighth','8',.5,'八分'],['16th','16',.25,'十六分'],['32nd','32',.125,'三十二分'],
  ['64th','64',.0625,'六十四分'],['128th','128',.03125,'一百二十八分'],['256th','256',.015625,'二百五十六分'],
];
export const RHYTHM_EPSILON = 1e-5;
export const closeRhythm = (a,b) => Math.abs(a-b)<RHYTHM_EPSILON;
export const dotFactor = dots => 2-2**-dots;
export function writtenBeats(rhythm){
  const value=NOTE_VALUES.find(([type])=>type===rhythm.type);
  if(!value)throw Error('音符类型无效。');
  return (rhythm.tuplets||[]).reduce((beats,t)=>beats*t.normal/t.actual,value[2]*dotFactor(rhythm.dots||0));
}
const candidates=NOTE_VALUES.flatMap(([type,glyph,base])=>Array.from({length:4},(_,dots)=>({type,glyph,dots,printedBeats:base*dotFactor(dots)})));
// A bounded continued fraction recovers exact MIDI tick fractions, including
// nonstandard ratios. Six-decimal legacy data carries at most 1e-6 beat error.
function fraction(value){
  let x=value,p0=0,p1=1,q0=1,q1=0;
  for(let i=0;i<32;i++){
    const a=Math.floor(x),p=a*p1+p0,q=a*q1+q0;
    if(p>1e7||q>1e7)break;
    if(Math.abs(p/q-value)<Math.min(1e-7,value*1e-7))return [p,q];
    [p0,p1,q0,q1]=[p1,p,q1,q];const rest=x-a;if(rest<1e-12)break;x=1/rest;
  }
  return [p1,q1];
}
function descriptor(c,tuplets=[]){
  const result={glyph:c.glyph,dots:c.dots,printedBeats:c.printedBeats,triplet:tuplets.length===1&&tuplets[0].actual===3&&tuplets[0].normal===2};
  if(tuplets.length&& !result.triplet) result.tuplet=tuplets[0];
  if(tuplets.length>1)result.tuplets=tuplets;
  return result;
}
export function notationDuration(duration,rhythm){
  if(!Number.isFinite(duration)||duration<=0)throw Error('排版时值必须为正数。');
  if(rhythm&&closeRhythm(writtenBeats(rhythm),duration)){
    const c=candidates.find(c=>c.type===rhythm.type&&c.dots===(rhythm.dots||0));return descriptor(c,rhythm.tuplets);
  }
  const ordinary=candidates.find(c=>closeRhythm(c.printedBeats,duration));
  if(ordinary)return descriptor(ordinary);
  // Prefer undotted simple ratios when inferring from a duration alone.
  for(const actual of [3,5,7,9,11,13,15,17,19,21,23,25,27,29,31]){
    const normal=2**Math.floor(Math.log2(actual));
    const c=candidates.find(c=>!c.dots&&closeRhythm(c.printedBeats*normal/actual,duration));
    if(c)return descriptor(c,[{actual,normal}]);
  }
  const c=candidates.filter(c=>!c.dots).reduce((best,c)=>Math.abs(Math.log2(c.printedBeats/duration))<Math.abs(Math.log2(best.printedBeats/duration))?c:best);
  const [actual,normal]=fraction(c.printedBeats/duration);
  return {...descriptor(c,[{actual,normal}]),inferredRatio:true};
}
export function descriptorTuplets(d){return d.tuplets|| (d.triplet?[{actual:3,normal:2}]:d.tuplet?[d.tuplet]:[]);}

/** Groups carry their ratio, including singleton/partial and nested groups. */
export function notationTupletPlans(segments){
  const result=[];let level=0;
  while(true){
    let found=false;
    for(let i=0;i<segments.length;i++){
      const d=notationDuration(segments[i].duration,segments[i].rhythm),t=descriptorTuplets(d)[level];
      if(!t)continue;found=true;
      const indices=[i];let span=segments[i].duration;
      for(let j=i+1;j<segments.length;j++){
        const next=segments[j],other=descriptorTuplets(notationDuration(next.duration,next.rhythm))[level];
        if(!other||other.actual!==t.actual||other.normal!==t.normal||other.group!==t.group||!closeRhythm(next.beat,segments[i].beat+span))break;
        // Inferred ratios close on the first conventional beat span. Written
        // group ids instead delimit the original bracket, even across values.
        if(!t.group&&indices.length>1&&[.03125,.0625,.125,.25,.5,1,2,4,8,16].some(n=>closeRhythm(span,n)))break;
        indices.push(j);span+=next.duration;
      }
      result.push({indices,actual:t.actual,normal:t.normal,level});i=indices.at(-1);
    }
    if(!found)break;level++;
  }
  return result;
}
export const notationTupletGroups=segments=>notationTupletPlans(segments).map(p=>p.indices);
