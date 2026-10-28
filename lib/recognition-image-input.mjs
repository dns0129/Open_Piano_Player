import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {detectScoreSystems} from './score-image-layout.mjs';
import {completePianoSystemRects} from './full-score-review.mjs';
import {assembleJob} from './score-region.mjs';

export async function imageRecognitionRegions(images){
  const regions=[];let contextImage;
  for(const [i,image]of images.entries()){
    const bytes=Buffer.from(image.data,'base64'),info=await sharp(bytes).metadata();
    const {data,info:pixels}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const raster={width:pixels.width,height:pixels.height,data},layout=detectScoreSystems(raster,{pianoSourceVerified:true});
    if(!layout.systems.length||layout.systems.some(s=>s.staffs.length!==2))throw Object.assign(new Error('无法可靠划分完整钢琴双谱表，请选择清晰完整谱行。'),{code:'NEEDS_SOURCE',expose:true,status:422});
    const rects=completePianoSystemRects(raster,layout);
    if(!contextImage&&rects.length){const bottom=Math.min(info.height,Math.ceil(rects[0].rect.y+rects[0].rect.height));const buffer=await sharp(bytes).extract({left:0,top:0,width:info.width,height:bottom}).png().toBuffer();if(buffer.length<=4*1024*1024)contextImage={mimeType:'image/png',data:buffer.toString('base64'),sha256:createHash('sha256').update(buffer).digest('hex'),kind:'source-context'};}
    for(const [j,{rect}]of rects.entries()){
      const r={left:Math.max(0,Math.floor(rect.x)),top:Math.max(0,Math.floor(rect.y)),width:Math.min(info.width-Math.floor(rect.x),Math.ceil(rect.width)),height:Math.min(info.height-Math.floor(rect.y),Math.ceil(rect.height))};
      const cropped=await sharp(bytes).extract(r).png().toBuffer();
      regions.push({...((i||j)&&contextImage?{detailImages:[contextImage]}:{}),id:`p${i+1}-s${j+1}`,page:i+1,system:j+1,pageWidth:info.width,pageHeight:info.height,rect:{x:r.left,y:r.top,width:r.width,height:r.height},image:{mimeType:'image/png',data:cropped.toString('base64'),sha256:createHash('sha256').update(cropped).digest('hex')}});
    }
  }
  return regions;
}
export async function recognizeImageSelection(input,{read,prepare=imageRecognitionRegions,signal}){
  const regions=await prepare(input.images),results=[];
  for(const region of regions){signal?.throwIfAborted();const result=await read({engine:input.provider,metadata:{title:input.title},region,requireNotation:true});
    results.push({...region,result,status:'needs-review'});
  }
  if(!results.length)throw Object.assign(new Error('选区没有完整谱行。'),{code:'NEEDS_SOURCE',expose:true});
  const assembled=assembleJob({id:'image-selection',metadata:{title:input.title,source:{label:'用户选定原谱'}},regions:results,totalPages:input.images.length,excludedPages:[]},{draft:true});
  return {...assembled,scope:{...assembled.scope,completeDocument:false,selection:'provided-image-regions',sourceScopeVerified:false},regions:results,warnings:[...assembled.warnings,...results.flatMap(r=>r.result.warnings||[])],checks:{passed:results.every(r=>r.result.checks.passed)&&assembled.checks.passed,errors:[...results.flatMap(r=>r.result.checks.errors),...assembled.checks.errors]}};
}
