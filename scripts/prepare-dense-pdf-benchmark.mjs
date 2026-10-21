import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createCanvas,DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
const {detectScoreSystems,normalizeCropRect}=await import('../lib/score-image-layout.mjs');
const {completePianoSystemRects}=await import('../lib/full-score-review.mjs');
const root=resolve(process.argv[2] || '.local/dense-pdf-benchmark-20261021');const sources=JSON.parse(await readFile(root+'/sources.json'));
try { await readFile(root+'/protocol.json'); throw new Error('已冻结的评测不能重新裁图；请使用新目录。'); } catch (e) { if(e.code !== 'ENOENT') throw e; }
const manifest=[];
for(const [i,source] of sources.entries()){
 const folder=root+'/'+source.id,selectedPage=i===2?2:1;
 const pdf=await pdfjs.getDocument({data:new Uint8Array(await readFile(folder+'/score.pdf')),isEvalSupported:false,standardFontDataUrl:resolve('node_modules/pdfjs-dist/standard_fonts')+'/',wasmUrl:resolve('node_modules/pdfjs-dist/wasm')+'/'}).promise;
 const page=await pdf.getPage(selectedPage),base=page.getViewport({scale:1});
 async function render(scale){const viewport=page.getViewport({scale}),c=createCanvas(Math.round(viewport.width),Math.round(viewport.height));await page.render({canvasContext:c.getContext('2d'),viewport}).promise;return c;}
 const low=await render(Math.min(3,1600/base.width,8000/base.height));
 const pixels=low.getContext('2d').getImageData(0,0,low.width,low.height);
 const layout=detectScoreSystems(pixels,{pianoSourceVerified:true});
 const high=await render(Math.min(2.5,2200/base.width,8000/base.height));await writeFile(folder+'/selected-page.png',high.toBuffer('image/png'));
 const rects=completePianoSystemRects(pixels,layout),regions=[];
 for(const [j,s] of layout.systems.entries()){
 const r=rects.find(r=>r.id===s.id).rect,rect=normalizeCropRect({x:r.x*high.width/low.width,y:r.y*high.height/low.height,width:r.width*high.width/low.width,height:r.height*high.height/low.height},high.width,high.height);
 const c=createCanvas(rect.width,rect.height);c.getContext('2d').drawImage(high,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);const bytes=c.toBuffer('image/png'),path=folder+`/row-${j+1}.png`;await writeFile(path,bytes);
 regions.push({id:`p1-s${j+1}`,page:1,system:j+1,rect,pageWidth:high.width,pageHeight:high.height,path,sha256:createHash('sha256').update(bytes).digest('hex'),staffCount:s.staffs.length});}
 await writeFile(folder+'/pdf-text.json',JSON.stringify(await page.getTextContent()));
 manifest.push({...source,selectedPage,totalPdfPages:pdf.numPages,regions});
 console.log(source.id,'pages',pdf.numPages,'selected',selectedPage,'staffs',layout.staffs.length,'systems',regions.length,regions.map(r=>r.staffCount));await pdf.cleanup();}
 await writeFile(root+'/manifest.json',JSON.stringify(manifest,null,2));
