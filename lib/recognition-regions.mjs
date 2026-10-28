import sharp from 'sharp';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=message=>Object.assign(new Error(message),{code:'RECOVERY_SCOPE_REQUIRED',status:422,expose:true});

// Only image geometry and PDF rendering. No local note recognition.
export async function enhanceRecognitionRegion(region,{pdf,scale=2}={}){
  let bytes=Buffer.from(region.image.data,'base64'),provenance={kind:'native-image-detail',sourceSha256:sha(bytes)};
  if(pdf){
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task=getDocument({data:new Uint8Array(pdf),useSystemFonts:true,isEvalSupported:false});
    try{
      const doc=await task.promise,page=await doc.getPage(region.page),base=page.getViewport({scale:1});
      const ratio=region.pageWidth?region.pageWidth/base.width:2;
      const viewport=page.getViewport({scale:Math.min(6,ratio*scale)});
      if(viewport.width*viewport.height>40000000)throw fail('高清页超过像素上限，请提供清晰的完整谱行。');
      const {createCanvas}=await import('@napi-rs/canvas');const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      const full=await canvas.encode('png'),sx=viewport.width/(region.pageWidth||base.width*ratio),sy=viewport.height/(region.pageHeight||base.height*ratio);
      const rect={left:Math.round(region.rect.x*sx),top:Math.round(region.rect.y*sy),width:Math.round(region.rect.width*sx),height:Math.round(region.rect.height*sy)};
      bytes=await sharp(full).extract(rect).png().toBuffer();
      provenance={kind:'pdf-rerender',sourceSha256:sha(pdf),page:region.page,sourceRect:region.rect,renderScale:viewport.scale};
    }finally{await task.destroy();}
  }
  if(!pdf)bytes=await sharp(bytes).png().toBuffer();
  if(bytes.length>4*1024*1024)throw fail('高清谱行超过模型单图大小限制，请提供已核对的小节边界。');
  const info=await sharp(bytes).metadata(),detailImages=[];
  for(const [from,to]of [[0,.58],[.42,1]]){
    const left=Math.floor(info.width*from),width=Math.max(1,Math.floor(info.width*to)-left);
    const data=await sharp(bytes).extract({left,top:0,width,height:info.height}).png().toBuffer();
    if(data.length<=4*1024*1024)detailImages.push({mimeType:'image/png',data:data.toString('base64'),sha256:sha(data),sourceRect:{x:from,y:0,width:to-from,height:1}});
  }
  return {...region,image:{mimeType:'image/png',data:bytes.toString('base64'),sha256:sha(bytes)},detailImages,recoveryImage:{...provenance,sha256:sha(bytes),nativeWidth:info.width,nativeHeight:info.height,detailSha256:detailImages.map(i=>i.sha256)}};
}

export async function splitRecognitionRegion(region){
  const bounds=region.measureBounds;
  if(region.measureBoundsVerified!==true||!Array.isArray(bounds)||bounds.length<2)throw fail('缺少已核对的完整小节边界；保留本行并请求清晰范围，不猜测切分。');
  if(bounds.some((b,i)=>!Number.isFinite(b.from)||!Number.isFinite(b.to)||b.from<0||b.to>1||b.to<=b.from||i&&Math.abs(b.from-bounds[i-1].to)>1e-5))throw fail('小节边界有缺口或重叠。');
  const bytes=Buffer.from(region.image.data,'base64'),info=await sharp(bytes).metadata(),middle=Math.ceil(bounds.length/2),parts=[];
  for(const [start,end]of [[0,middle],[middle,bounds.length]]){
    const from=bounds[start].from,to=bounds[end-1].to,pad=.025,left=Math.max(0,Math.floor((from-pad)*info.width)),right=Math.min(info.width,Math.ceil((to+pad)*info.width));
    const crop=await sharp(bytes).extract({left,top:0,width:right-left,height:info.height}).png().toBuffer();
    parts.push({...region,id:region.id+'-part-'+start,image:{mimeType:'image/png',data:crop.toString('base64'),sha256:sha(crop)},detailImages:[{...region.image,kind:'source-context'},...(region.detailImages||[]).filter(i=>i.kind==='source-context')].slice(0,2),measureCount:end-start,
      context:(region.context||'')+`；本图仅转写第${start+1}至${end}小节；允许的横向范围为归一化${Math.max(0,(from*info.width-left)/(right-left))}至${Math.min(1,(to*info.width-left)/(right-left))}，边缘重叠仅作上下文，不重复计数。`,
      selection:{from:Math.max(0,(from*info.width-left)/(right-left)),to:Math.min(1,(to*info.width-left)/(right-left))},
      parentMapping:{firstMeasure:start,x:region.rect.x+left/info.width*region.rect.width,width:(right-left)/info.width*region.rect.width,parentId:region.id}});
  }
  return parts;
}

export async function sourceContextFromPdf(pdf,{pageNumber=1,firstRegion}={}){
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(pdf),useSystemFonts:true,isEvalSupported:false});
  try{
    const doc=await task.promise,page=await doc.getPage(pageNumber),view=page.getViewport({scale:2});
    if(view.width*view.height>40000000)throw fail('原谱上下文页超过像素上限。');
    const {createCanvas}=await import('@napi-rs/canvas');const canvas=createCanvas(Math.ceil(view.width),Math.ceil(view.height));
    await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
    const full=await canvas.encode('png');let bottom=Math.ceil(view.height*.45);
    if(firstRegion?.page===pageNumber&&firstRegion.pageHeight)bottom=Math.min(canvas.height,Math.ceil((firstRegion.rect.y+firstRegion.rect.height)*canvas.height/firstRegion.pageHeight));
    const bytes=await sharp(full).extract({left:0,top:0,width:canvas.width,height:bottom}).png().toBuffer();
    if(bytes.length>4*1024*1024)throw fail('原谱上下文图超过单图限制。');
    return {mimeType:'image/png',data:bytes.toString('base64'),sha256:sha(bytes),kind:'source-context',sourcePage:pageNumber};
  }finally{await task.destroy();}
}
