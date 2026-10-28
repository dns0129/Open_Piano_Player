import sharp from 'sharp';
import {sourceContextFromPdf} from '../recognition-regions.mjs';
import {fail,sha} from './common.mjs';

// Rendering/cropping only. No local note recognition and no photo downscaling.
export function createRecognitionSources({library}){
 async function page(owner,groupId,ordinal,{metadataOnly=false,scale=2}={}){
  const group=await library.readGroup(owner,groupId),p=group.pages.find(p=>p.ordinal===ordinal);if(!p)throw fail('NOT_FOUND','原谱页不存在。',404);
  const r=await library.readResource(owner,p.recognitionResourceId||p.originalResourceId);
  if(group.kind==='pdf'){
   const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=getDocument({data:new Uint8Array(r.bytes),useSystemFonts:true,isEvalSupported:false});
   try{const pdf=await task.promise,source=await pdf.getPage(ordinal),viewport=source.getViewport({scale});if(viewport.width*viewport.height>40000000)throw fail('PAGE_PIXEL_LIMIT','此 PDF 页面过大，请使用单页图片。');if(metadataOnly)return {ordinal,width:Math.ceil(viewport.width),height:Math.ceil(viewport.height),mimeType:'image/png'};
    const {createCanvas}=await import('@napi-rs/canvas'),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await source.render({canvasContext:canvas.getContext('2d'),viewport}).promise;return {ordinal,width:canvas.width,height:canvas.height,mimeType:'image/png',bytes:await canvas.encode('png')};
   }finally{await task.destroy()}
  }
  if(!r.info.mimeType.startsWith('image/'))throw fail('SOURCE_NOT_IMAGE','请选择已保存的原图或 PDF。');
  const info=await sharp(r.bytes,{limitInputPixels:40000000}).metadata();return {ordinal,width:info.width,height:info.height,mimeType:r.info.mimeType,...(!metadataOnly?{bytes:r.bytes}:{})};
 }
 return {page,
  async context(owner,gid){const group=await library.readGroup(owner,gid);if(group.kind!=='pdf')return null;const first=group.pages[0];const r=await library.readResource(owner,first.recognitionResourceId||first.originalResourceId);return sourceContextFromPdf(r.bytes,{pageNumber:first.ordinal});},
  async pages(owner,gid){const g=await library.readGroup(owner,gid);if(!['images','pdf'].includes(g.kind))throw fail('SOURCE_NOT_IMAGE','请选择原图或 PDF。');const pages=[];for(const p of g.pages)pages.push(await page(owner,gid,p.ordinal,{metadataOnly:true}));return {kind:g.kind,pages}},
  async crop(owner,gid,region,{scale=2}={}){const p=await page(owner,gid,region.page,{scale}),r=region.rect;
   const rect={x:Math.floor(r.x*p.width),y:Math.floor(r.y*p.height),width:Math.round(r.width*p.width),height:Math.round(r.height*p.height)};rect.width=Math.min(rect.width,p.width-rect.x);rect.height=Math.min(rect.height,p.height-rect.y);
   if(rect.width<32||rect.height<32)throw fail('REGION_TOO_SMALL','选区太小，请保留完整的左右手谱表。');const bytes=await sharp(p.bytes,{limitInputPixels:40000000}).extract({left:rect.x,top:rect.y,width:rect.width,height:rect.height}).png().toBuffer();if(bytes.length>20*1024*1024)throw fail('REGION_TOO_LARGE','选区文件过大，请按完整谱行拆分。');return {bytes,mimeType:'image/png',sha256:sha(bytes),rect,pageWidth:p.width,pageHeight:p.height};
  },
 };
}
