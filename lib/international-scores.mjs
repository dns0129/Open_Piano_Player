import {safeFetch,normalizePublicUrl} from './safe-network.mjs';
import {getScoreQueryPlan,normalizeScoreText,stripScoreTerms} from './score-query.mjs';

const text=value=>entities(String(value||'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const entities=value=>String(value).replace(/&(amp|quot|apos|lt|gt|nbsp|#\d+|#x[\da-f]+);/gi,(all,name)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[name.toLowerCase()]??String.fromCodePoint(Math.min(0x10ffff,Math.max(0,name[1]?.toLowerCase()==='x'?parseInt(name.slice(2),16):parseInt(name.slice(1),10)))||32)));
const attr=(tag,name)=>{const found=tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,'i'));return found?entities(found[1]??found[2]):'';};
const unscript=html=>String(html).replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi,'');
const sourceCache=new WeakMap();
const pianoSolo=label=>/^For Piano(?:\s*\([^)]*\))?\s*$/i.test(label);
function publicLink(value,base,hosts){try{const url=normalizePublicUrl(new URL(entities(value),base).href);return hosts.includes(url.hostname)?url.href:null;}catch{return null;}}

/** Only actual result-table instrument fields establish piano instrumentation. */
export function parseMutopiaCatalogue(html,pageUrl){
  const rows=[];
  for(const match of unscript(html).matchAll(/<table\b[^>]*class=["'][^"']*\bresult-table\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi)){
    const blocks=[...match[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row=>[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell=>cell[1]));
    const title=text(blocks[0]?.[0]),composer=text(blocks[0]?.[1]).replace(/^by\s+/i,''),instrument=text(blocks[1]?.[0]);
    if(!title||!/^for\s+(?:Piano|Pianoforte)(?:\s*,\s*(?:Piano|Pianoforte|Harpsichord|Clavichord))*\s*$/i.test(instrument))continue;
    const anchors=[...match[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(anchor=>({label:text(anchor[2]),url:publicLink(attr(anchor[1],'href'),pageUrl,['www.mutopiaproject.org','mutopiaproject.org'])})).filter(a=>a.url);
    const sourceUrl=anchors.find(a=>/piece-info\.cgi\?id=\d+/.test(a.url))?.url||pageUrl;
    const license=text(blocks[2]?.[1])||'以 Mutopia 具体版本的许可为准';
    const files=[anchors.find(a=>/A4\s*\.pdf file$/i.test(a.label)),anchors.find(a=>/^\.mid file$/i.test(a.label))].filter(Boolean);
    for(const file of files){
      if(!new URL(file.url).pathname.startsWith('/ftp/'))continue;
      const format=/\.mid$/i.test(new URL(file.url).pathname)?'midi':/\.pdf$/i.test(new URL(file.url).pathname)?'pdf':null;if(!format)continue;
      rows.push({title,composer,url:file.url,sourceUrl,source:'Mutopia 公开乐谱目录',format,catalogScore:true,scope:'site',international:true,notation:'staff',instrumentation:'piano',pianoSourceVerified:true,instrumentEvidence:`Mutopia 版本目录 ${sourceUrl} 的乐器字段：${instrument}`,license,edition:text(blocks[2]?.[0]),preview:false,description:`${instrument} · ${license} · ${format.toUpperCase()}`});
    }
  }
  return rows;
}

/** Keep each public edition's own file-description page and instrument evidence. */
function imslpPianoCards(html,pageUrl){
  const body=unscript(html),headings=[...body.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(match=>({level:Number(match[1]),at:match.index,end:match.index+match[0].length,title:text(match[2])}));
  const pageTitle=text(body.match(/<h1\b[^>]*id=["']firstHeading["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]||body.match(/<title>([\s\S]*?)<\/title>/i)?.[1]).replace(/\s*-\s*IMSLP.*$/,'');
  const composer=pageTitle.match(/\(([^()]+,[^()]+)\)\s*$/)?.[1]||'';
  const instrument=[...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row=>({key:text(row[1].match(/<th\b[^>]*>([\s\S]*?)<\/th>/i)?.[1]),value:text(row[1].match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1])})).find(row=>/^Instrumentation$/i.test(row.key))?.value||'';
  const markers=[...body.matchAll(/<div\b[^>]*class=["'][^"']*\bwe\b[^"']*["'][^>]*>\s*<div\b[^>]*id=["']IMSLP(\d+)["']/gi)];
  const rows=[];
  for(let i=0;i<markers.length;i++){
    const marker=markers[i],before=headings.filter(h=>h.at<marker.index),editionHeading=before.at(-1);
    if(!editionHeading)continue;
    const scoresHeading=before.filter(h=>/^Scores(?:\s|\(|$)/i.test(h.title)).at(-1),otherSection=before.filter(h=>/Arrangements and Transcriptions|Vocal Scores|Parts|^For (?!Piano(?:\s*\([^)]*\))?\s*$)/i.test(h.title)).at(-1);
    const originalPiano=/^(?:piano|pianoforte)$/i.test(instrument)&&scoresHeading&&(!otherSection||otherSection.at<scoresHeading.at);
    if(!pianoSolo(editionHeading.title)&&!originalPiano)continue;
    // The nearest movement heading prevents an opera's other piano excerpts
    // from being mislabeled as the piece the user requested.
    const sectionHeading=before.filter(h=>h.level<editionHeading.level).at(-1)?.title;
    const section=originalPiano||!sectionHeading||/^(?:Scores|Complete|Sheet Music|Arrangements and Transcriptions)$/i.test(sectionHeading)?pageTitle:sectionHeading;
    const nextHeading=headings.find(h=>h.at>marker.index)?.at??body.length,end=Math.min(markers[i+1]?.index??body.length,nextHeading),block=body.slice(marker.index,end);
    const preview=block.match(/<img\b[^>]*(?:data-src|src)=["'](?:https?:)?\/\/cdn\.imslp\.org\/images\/thumb\/pdfs\/[^"']+["'][^>]*>/i)?.[0];
    const previewUrl=preview?publicLink(attr(preview,'data-src')||attr(preview,'src'),pageUrl,['cdn.imslp.org']):null;
    const license=text(block.match(/<th>\s*Copyright\s*<\/th>\s*<td>([\s\S]*?)<\/td>/i)?.[1]).replace(/\s*\[.*$/,'')||'以 IMSLP 本版本页面及所在地区规定为准';
    const arranger=text(block.match(/<th>\s*Arranger\s*<\/th>\s*<td>([\s\S]*?)<\/td>/i)?.[1]);
    const fileAnchors=[...block.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter(anchor=>/^#\d+$/.test(text(anchor[2]))&&/^\/wiki\/File:/i.test(attr(anchor[1],'href')));
    for(const anchor of fileAnchors){
      const sourceUrl=publicLink(attr(anchor[1],'href'),pageUrl,['imslp.org','www.imslp.org']);if(!sourceUrl)continue;
      let filename;try{filename=decodeURIComponent(new URL(sourceUrl).pathname);}catch{continue;}
      if(!/\.(?:pdf|midi?|musicxml|mxl|png|jpe?g|webp)$/i.test(filename)||/cover|portrait|封面/i.test(filename))continue;
      const fileId=text(anchor[2]).slice(1),info=block.slice(anchor.index,anchor.index+1800);
      rows.push({title:section,composer,url:sourceUrl,sourceUrl,workUrl:pageUrl,source:'IMSLP 公开钢琴版本',format:'web',catalogScore:true,scope:'site',international:true,notation:'staff',instrumentation:'piano',pianoSourceVerified:true,instrumentEvidence:`IMSLP 作品页 ${pageUrl} 的${originalPiano?` Instrumentation 字段：${instrument}，原作 Scores 栏；`:''}版本小节：${editionHeading.title}；文件 #${fileId}`,edition:editionHeading.title,arranger,license,imslpId:fileId,pageCount:Number(info.match(/,\s*(\d+)\s*pp\./)?.[1])||undefined,...(previewUrl&&/\.png$/i.test(new URL(previewUrl).pathname)&&fileId===marker[1]?{previewUrl}:{}),description:`${editionHeading.title} · 版本文件页；能否自动获取以该页公开链接为准`,discoveryKind:'edition'});
    }
  }
  return rows;
}

/** Edition pages remain web results; they are never mislabeled as PDF files. */
export function parseImslpPianoEditions(html,pageUrl){return imslpPianoCards(html,pageUrl).map(({previewUrl,...row})=>row);}

/** IMSLP publishes edition thumbnails openly. Never derive an enlarged URL. */
export function parseImslpPianoPreviews(html,pageUrl){
  return imslpPianoCards(html,pageUrl).filter(row=>row.previewUrl).map(({previewUrl,...row})=>({...row,url:previewUrl,source:'IMSLP 公开钢琴谱预览',format:'image',preview:true,page:1,description:`${row.edition} · 公开第 1 页预览，非全曲文件`,warnings:['这是来源公开展示的第 1 页预览，不等于完整乐谱；不补写缺页。']}));
}

// A separately verified, openly accessible edition. This exact URL was supplied
// and checked; it is never constructed by rewriting a restricted download URL.
const verifiedBumblebee={title:'Flight of the Bumblebee',composer:'Nikolai Rimsky-Korsakov',url:'https://bnf.cn2.imslp.org/files/imglnks/caimg/4/4b/IMSLP39254-PMLP03170-Flight_of_the_Bumblebee_--_for_Piano_Solo__Yeung_.pdf',sourceUrl:'https://imslp.org/wiki/File:PMLP03170-Flight_of_the_Bumblebee_--_for_Piano_Solo_(Yeung).pdf',workUrl:'https://imslp.org/wiki/Flight_of_the_Bumblebee',source:'IMSLP · Yeung 钢琴独奏版',format:'pdf',catalogScore:true,scope:'site',international:true,notation:'staff',instrumentation:'piano',pianoSourceVerified:true,instrumentEvidence:'实际 PDF 第 1 页标注 For Piano Solo；署名 Nikolai Rimsky-Korsakov / Arrangement by Kevin W. K. Yeung，并已视觉核实高低音双谱表。',edition:'For Piano Solo · Kevin W. K. Yeung（PDF 首页署名）',license:'Creative Commons Attribution-ShareAlike 3.0；IMSLP 本版本另标 Non-PD US，请核对所在地区适用范围。',preview:false,pageCount:7,description:'7 页钢琴独奏五线谱 PDF；实际谱页已核实，导入后选择页码及清晰谱行。',warnings:['来源标注 CC BY-SA 3.0，并同时标注 Non-PD US；保留作者及编配署名，使用范围以来源和所在地区规定为准。']};
function relevant(row,query){
  const plan=getScoreQueryPlan(query),title=normalizeScoreText(row.title),primary=normalizeScoreText(row.title+' '+row.composer);
  if(plan.matchedWork){
    if(!plan.matchedWork.aliases.some(alias=>title.includes(normalizeScoreText(alias))))return false;
    const expected=normalizeScoreText(plan.matchedWork.creator);if(!primary.includes(expected))return false;
    let remainder=stripScoreTerms(query);
    for(const alias of [...plan.matchedWork.aliases,...plan.matchedWork.creatorAliases].sort((a,b)=>b.length-a.length))remainder=remainder.replaceAll(alias,' ');
    return remainder.split(/[\s,，《》“”]+/).map(normalizeScoreText).filter(Boolean).every(part=>primary.includes(part));
  }
  return stripScoreTerms(query).split(/[\s,，《》“”]+/).map(normalizeScoreText).filter(Boolean).every(part=>primary.includes(part));
}
async function cachedFetch(url,context){
  let cache=sourceCache.get(context.fetcher);if(!cache){cache=new Map();sourceCache.set(context.fetcher,cache);}
  const hit=cache.get(url);if(hit&&Date.now()-hit.at<10*60*1000)return hit.response;
  context.signal.throwIfAborted();
  const request=context.fetcher(url,{signal:context.signal,maxBytes:3*1024*1024,allowedHosts:[new URL(url).hostname],headers:{'user-agent':'Qinban-Piano-Studio/0.1 (public sheet music catalogue)'}});
  const response=await new Promise((resolve,reject)=>{const abort=()=>reject(context.signal.reason);context.signal.addEventListener('abort',abort,{once:true});Promise.resolve(request).then(resolve,reject).finally(()=>context.signal.removeEventListener('abort',abort));});
  cache.set(url,{at:Date.now(),response});while(cache.size>30)cache.delete(cache.keys().next().value);return response;
}
async function imslpProvider(query,context){
  const plan=getScoreQueryPlan(query),rows=[];let excludedLowResolution=0,blocked=false;
  const reserveMs=Math.min(200,Math.max(1,(context.providerTimeoutMs||7000)/5));
  const deadline=(context.deadline||Date.now()+7000)-reserveMs;
  const remaining=limit=>Math.max(1,Math.min(limit,Math.floor(deadline-Date.now())));
  if(relevant(verifiedBumblebee,query)){
    try{const response=await cachedFetch(verifiedBumblebee.url,{...context,signal:AbortSignal.any([context.signal,AbortSignal.timeout(remaining(3500))])});if(response.buffer.subarray(0,4).toString()==='%PDF')rows.push({...verifiedBumblebee,fileVerified:true});}catch(error){if(context.signal.aborted&&!rows.length)throw error;blocked=[401,403,429].includes(error.upstreamStatus);}
  }
  // A delayed general catalogue must not discard the independently verified PDF.
  const catalogueContext={...context,signal:AbortSignal.any([context.signal,AbortSignal.timeout(remaining(4500))])};
  const terms=plan.matchedWork?.title||stripScoreTerms(query),api='https://imslp.org/api.php?'+new URLSearchParams({action:'query',format:'json',list:'search',srsearch:terms,srlimit:'5'});
  try{
    const data=JSON.parse((await cachedFetch(api,catalogueContext)).buffer.toString('utf8'));
    const articles=(data.query?.search||[]).filter(row=>row.ns===0&&typeof row.title==='string'&&(!plan.matchedWork||plan.matchedWork.aliases.some(alias=>normalizeScoreText(row.title).startsWith(normalizeScoreText(alias))))).slice(0,1);
    for(const article of articles){
      const pageUrl='https://imslp.org/wiki/'+encodeURIComponent(article.title.replaceAll(' ','_'));
      const response=await cachedFetch(pageUrl,catalogueContext),html=response.buffer.toString('utf8');
      if(/<title>[^<]*(?:Bot Check|Access Denied)|verify you are human|captcha/i.test(html)){blocked=true;continue;}
      const editions=parseImslpPianoEditions(html,pageUrl).filter(row=>relevant(row,query)).slice(0,6);
      // A real edition remains selectable even when IMSLP only exposes a tiny
      // thumbnail. It stays HTML, never an importable PDF or enlarged image.
      rows.push(...editions);
      const candidates=parseImslpPianoPreviews(html,pageUrl).filter(row=>relevant(row,query)).sort((a,b)=>(/Creative Commons/i.test(b.license)?1:0)-(/Creative Commons/i.test(a.license)?1:0)).slice(0,2);
      for(const candidate of candidates){
        try{
          const image=await cachedFetch(candidate.url,catalogueContext),b=image.buffer;
          if(b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||b.length<24)continue;
          const width=b.readUInt32BE(16),height=b.readUInt32BE(20);
          if(width<1000||height<1200){excludedLowResolution++;continue;}
          const editionIndex=rows.findIndex(row=>row.format==='web'&&row.imslpId===candidate.imslpId);if(editionIndex>=0)rows.splice(editionIndex,1);
          rows.push({...candidate,imageWidth:width,imageHeight:height,fileVerified:true});
        }catch(error){if(context.signal.aborted&&!rows.length)throw error;blocked||=[401,403,429].includes(error.upstreamStatus);}
      }
    }
  }catch(error){if(!rows.length)throw error;}
  return {rows,status:rows.length?'ok':blocked?'blocked':'empty',message:`只检索 IMSLP 的公开钢琴独奏版本；HTML 版本页需继续获取公开谱面，网页验证、受限下载和其他乐器版本不自动处理。${excludedLowResolution?` 已排除 ${excludedLowResolution} 张低清缩略图，保留对应版本网页入口。`:''}`};
}
export function createInternationalScoreProviders(query){
  return [
    {id:'imslp-piano',name:'IMSLP 国外钢琴谱',scope:'site',run:context=>imslpProvider(query,{fetcher:safeFetch,...context})},
    {id:'mutopia',name:'Mutopia 钢琴目录',scope:'site',async run(context){
      const plan=getScoreQueryPlan(query),terms=plan.matchedWork?.title||stripScoreTerms(query);
      const url='https://www.mutopiaproject.org/cgibin/make-table.cgi?'+new URLSearchParams({searchingfor:terms,Instrument:'Piano',solo:'1'});
      const response=await cachedFetch(url,{fetcher:safeFetch,...context}),rows=parseMutopiaCatalogue(response.buffer.toString('utf8'),url).filter(row=>relevant(row,query));
      return {rows,status:rows.length?'ok':'empty',message:'仅查询 Mutopia 公开目录中实际注明 Piano 的独奏版本；目录没有该曲时不会补造结果。'};
    }}
  ];
}
