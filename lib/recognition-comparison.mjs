import {compareScoreEvents} from './score-assembly.mjs';
const event=n=>[n.hand,n.midi,Math.round(n.beat*1e5),Math.round(n.duration*1e5)].join(':');
const sorted=a=>JSON.stringify(a.sort());
function notation(result){
 const notes=new Map(result.score.notes.map(n=>[n.id,n]));
 return {meter:result.score.timeSignature,key:result.score.keySignature,bars:result.coverage.measureDurations.map(x=>Math.round(x*1e5)),ties:sorted(result.internalTies.map(t=>event(notes.get(t.fromNoteId))+'>'+event(notes.get(t.toNoteId)))),incoming:sorted(result.continuity.tieIn.map(t=>event(notes.get(t.noteId)))),outgoing:sorted(result.continuity.tieOut.map(t=>event(notes.get(t.noteId))))};
}
export function compareRegionReadings(a,b){
 const comparison=compareScoreEvents(a.score,b.score),left=notation(a),right=notation(b),differences=Object.keys(left).filter(k=>JSON.stringify(left[k])!==JSON.stringify(right[k]));
 return {...comparison,exactMatch:comparison.exactMatch&&differences.length===0,notation:{passed:differences.length===0,differences}};
}
