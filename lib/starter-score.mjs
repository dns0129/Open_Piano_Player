import {validateScore} from './score.mjs';
// The player opens with a tiny app exercise; cloud songs arrive only by download.
export const starterScore=validateScore({id:'qinban-practice-demo',title:'C 大调练习示例',composer:'琴伴',tempo:80,timeSignature:[4,4],keySignature:0,durationBeats:8,source:{kind:'app-exercise',label:'琴伴 · C 大调基础练习'},notes:[...[60,62,64,65,67,65,64,60].map((midi,beat)=>({id:`r${beat}`,midi,beat,duration:1,hand:'right'})),...[0,4].map(beat=>({id:`l${beat}`,midi:48,beat,duration:4,hand:'left'}))]});
