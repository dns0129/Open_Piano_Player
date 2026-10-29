import {readFile,writeFile} from 'node:fs/promises';
import {detectScoreSystems} from '../../lib/score-image-layout.mjs';
import {completePianoSystemRects} from '../../lib/full-score-review.mjs';
const root='.local/batch-five-20261018',pages=JSON.parse(await readFile(root+'/pixels.json'));
for(const p of pages){
 const image={width:p.width,height:p.height,data:new Uint8Array(await readFile(p.gray))};
 const variants=[{}, {minLineCoverage:.45,minLineRun:.35},{minLineCoverage:.6,minLineRun:.5}].map(o=>detectScoreSystems(image,o));
 const l=variants.sort((a,b)=>(b.staffs.length%2===0)-(a.staffs.length%2===0)||b.staffs.length-a.staffs.length)[0];
 if(l.systems.some(s=>s.staffs.length!==2)||!l.systems.length){console.log('NEEDS_SCOPE_REVIEW',p.key,p.page,l.staffs.length);continue;}
 const sx=p.pageWidth/p.width,sy=p.pageHeight/p.height;
 const rects=completePianoSystemRects(image,l);
 l.systems.forEach(s=>{const r=rects.find(r=>r.id===s.id).rect;s.rect={x:Math.floor(r.x*sx),y:Math.floor(r.y*sy),width:Math.min(p.pageWidth-Math.floor(r.x*sx),Math.ceil(r.width*sx)),height:Math.min(p.pageHeight-Math.floor(r.y*sy),Math.ceil(r.height*sy))};s.staffs=s.staffs.map(t=>({...t,x:t.x*sx,width:t.width*sx,spacing:t.spacing*sy,lines:t.lines.map(y=>y*sy)}));});
 l.width=p.pageWidth;l.height=p.pageHeight;
 await writeFile(p.path.replace('.png','.layout.json'),JSON.stringify(l));console.log(p.key,p.page,l.systems.length);
}
