import {fork} from 'node:child_process';
import {readFile,writeFile,mkdir,rename,chmod,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {safeFetch,normalizePublicUrl} from './safe-network.mjs';
import {userError} from './settings.mjs';

const SHARE_HOSTS=['163cn.tv','163cn.com','music.163.com','y.music.163.com'];
const sdkMethods=new Set(['sheet_list','sheet_preview','login_qr_key','login_qr_check','login_status']);
const clean=value=>String(value??'').replace(/[\u0000-\u001f]/g,'').slice(0,200);
const positive=value=>['number','string'].includes(typeof value)&&Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;
const flagTrue=value=>[true,1,'true','1'].includes(value);
const flagFalse=value=>[false,0,'false','0'].includes(value);
const identifier=value=>/^\d{1,20}$/.test(String(value??''))?String(value):null;
const fail=(message,code='NETEASE_RESPONSE',status=422)=>userError(message,code,status);

export function parseNeteaseShare(input,depth=0){
  if(typeof input!=='string'||input.length>6000||depth>2)throw fail('请粘贴网易云歌曲或乐谱的分享链接。','NETEASE_LINK',400);
  const match=input.match(/https?:\/\/[^\s<>"'，。；）)]+/i);
  if(!match)throw fail('没有找到分享链接，请复制完整的网易云分享文字。','NETEASE_LINK',400);
  let url;try{url=new URL(match[0]);}catch{throw fail('分享链接格式不正确。','NETEASE_LINK',400);}
  if(!SHARE_HOSTS.includes(url.hostname)||url.username||url.password||url.port||url.protocol!=='https:')throw fail('仅支持 HTTPS 网易云音乐及 163cn 分享链接。','NETEASE_LINK',400);
  const fragment=url.hash.replace(/^#\/?/,'');
  const route=fragment?new URL('/'+fragment,url.origin):url;
  const params=new URLSearchParams([...url.searchParams,...route.searchParams]);
  const nested=params.get('url')||params.get('redirectUrl');
  if(nested?.startsWith('https://'))return parseNeteaseShare(nested,depth+1);
  let sheetId;
  for(const key of ['sheetId','sheetid','musicSheetId','musicSheetID','scoreId'])sheetId ||= identifier(params.get(key));
  if(!sheetId&&/sheet|score/i.test(route.pathname))sheetId=identifier(params.get('id'))||identifier(route.pathname.match(/(?:sheet|score)\/(\d+)/i)?.[1]);
  const songId=identifier(params.get('songId'))||(/\/song(?:\/|$)/i.test(route.pathname)?identifier(params.get('id'))||identifier(route.pathname.match(/\/song\/(\d+)/i)?.[1]):null);
  return {url:url.href,kind:sheetId?'sheet':songId?'song':'unresolved',...(sheetId?{sheetId}:songId?{songId}:{})};
}

function imageUrl(value){
  let url;try{url=normalizePublicUrl(value);}catch{throw fail('谱页图片地址无效。','NETEASE_IMAGE_URL');}
  if(!(url.hostname==='music.126.net'||url.hostname.endsWith('.music.126.net')||url.hostname==='nos.netease.com'||url.hostname.endsWith('.nos.netease.com')))throw fail(`谱页图片域名尚未支持（${url.hostname}）。未读取图片；请提供此错误以便核验来源。`,'NETEASE_IMAGE_URL');
  // Some API records use HTTP for the same public CDN asset. Keep the signed
  // path/query intact and always download it over HTTPS.
  if(url.protocol==='http:')url.protocol='https:';
  // Preserve original pixels; do not invent or strip signed URL parameters.
  return url.href;
}
function containers(body){
  const values=[body];
  for(let i=0;i<values.length&&i<20;i++)for(const key of ['data','sheet','musicSheet','detail','previewInfo','sheetInfo','resource']){
    const value=values[i]?.[key];if(value&&typeof value==='object'&&!Array.isArray(value)&&!values.includes(value))values.push(value);
  }
  return values;
}

// The upstream project does not publish a response schema. Only explicit page
// collections are accepted; cover/avatar/HTML links are never treated as pages.
export function normalizeNeteasePreview(body){
  const nodes=containers(body);let raw;
  // The real sheet/preview response puts page records directly in data.
  // Require explicit sheet/page identity so a cover-only data array cannot pass.
  if(Array.isArray(body?.data)&&body.data.length&&body.data.every(item=>item&&typeof item==='object'&&!Array.isArray(item)&&typeof item.url==='string'&&identifier(item.sheetId)&&['number','string'].includes(typeof item.pageNumber)&&Number.isSafeInteger(Number(item.pageNumber))))raw=body.data;
  for(const node of nodes){for(const key of ['pages','pageList','imageList','images','pictureList','pictures','previewImages','picList','picUrls','imageUrls'])if(Array.isArray(node?.[key])&&node[key].length){raw=node[key];break;}if(raw)break;}
  if(!raw)throw fail('接口未返回可识别的谱页清单；不能将封面或网页当作乐谱。','NETEASE_SCHEMA');
  if(raw.length>200)throw fail('该乐谱超过 200 页，暂不支持自动导入。','NETEASE_PAGE_LIMIT');
  const pages=raw.map((item,index)=>{
    const value=typeof item==='string'?item:item?.originalUrl||item?.imageUrl||item?.picUrl||item?.url||item?.pngUrl;
    const explicit=typeof item==='object'?(item.pageNo??item.pageNumber??item.pageIndex??item.index):undefined;
    return {number:index+1,url:imageUrl(value),order:explicit===undefined?null:Number(explicit),sheetId:identifier(item?.sheetId)};
  });
  const numbered=pages.filter(page=>page.order!==null);
  const reasons=[];
  if(numbered.length){
    if(numbered.length!==pages.length||numbered.some(page=>!Number.isSafeInteger(page.order)))reasons.push('页码信息不完整');
    else{pages.sort((a,b)=>a.order-b.order);const first=pages[0].order;if(![0,1].includes(first)||pages.some((page,index)=>page.order!==first+index))reasons.push('谱页页码有缺失或重复');}
  }
  pages.forEach((page,index)=>page.number=index+1);
  if(new Set(pages.map(page=>page.url)).size!==pages.length)reasons.push('谱页地址重复');
  const counts=nodes.flatMap(node=>['pageCount','totalPages','totalPage','imageCount','pictureCount','picCount'].map(key=>positive(node?.[key])).filter(Boolean));
  const uniqueCounts=[...new Set(counts)],totalPages=uniqueCounts.length===1?uniqueCounts[0]:null;
  if(uniqueCounts.length>1)reasons.push('接口返回的总页数互相冲突');
  const restricted=nodes.some(node=>['isPreview','previewOnly','hasMore','needPay','needPurchase'].some(key=>flagTrue(node[key]))||['hasPermission','canRead'].some(key=>flagFalse(node[key])));
  if(restricted)reasons.push('来源标记为预览、未完结或需要额外权限');
  if(totalPages&&totalPages!==pages.length)reasons.push(`来源标注 ${totalPages} 页，实际返回 ${pages.length} 页`);
  const title=nodes.map(node=>node.title||node.name||node.sheetName).find(value=>typeof value==='string'&&value.trim());
  return {title:clean(title)||'网易云钢琴谱',pages,totalPages,integrity:{status:reasons.length?'incomplete':totalPages?'complete':'unknown',reasons:reasons.length?reasons:totalPages?[]:['接口未提供可信总页数，请对照原站核验后填写']}};
}

function normalizeList(body){
  const nodes=containers(body);let raw=Array.isArray(body?.data)?body.data:null;
  for(const node of nodes){for(const key of ['sheets','musicSheets','sheetList','musicSheetList','musicSheetSimpleInfoVOS','list'])if(Array.isArray(node?.[key])){raw=node[key];break;}if(raw)break;}
  if(!raw)throw fail('乐谱列表的返回格式尚未支持。','NETEASE_SCHEMA');
  return raw.slice(0,100).map(entry=>{
    const item=entry.musicSheet||entry.sheet||entry;const id=identifier(item.id??item.sheetId??item.musicSheetId);
    const instrument=clean(typeof item.instrument==='object'?item.instrument?.name:item.instrument||item.instrumentName||(Array.isArray(item.type)?item.type.map(t=>t.name).join(' '):''));
    const title=clean(item.title||item.name||item.sheetName)||'未命名乐谱';
    return {id,title,instrument,pianoEvidence:/钢琴|piano/i.test(instrument+' '+title),pages:positive(item.pageCount??item.totalPages??item.totalPageSize)};
  }).filter(item=>item.id);
}

function cookieValues(value){
  const result={};
  for(const part of (Array.isArray(value)?value.join(';'):String(value||'')).split(';')){
    const match=part.trim().match(/^(MUSIC_U|MUSIC_A|__csrf|NMTID)=([^;\r\n]*)$/);
    if(match&&match[2].length<8192)result[match[1]]=match[2];
  }
  return result;
}
const cookieString=jar=>Object.entries(jar).map(([key,value])=>`${key}=${value}`).join('; ');

export function createNeteaseSessionStore(path=resolve('.local/netease-session.json')){
  let queue=Promise.resolve();
  async function read(){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return {};throw fail('网易云本机登录文件无法读取。','NETEASE_SESSION',500);}}
  function save(value){const task=queue.then(async()=>{await mkdir(dirname(path),{recursive:true,mode:0o700});await chmod(dirname(path),0o700);const temp=path+'.'+randomBytes(6).toString('hex')+'.tmp';try{await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,path);await chmod(path,0o600);}finally{await rm(temp,{force:true});}});queue=task.catch(()=>{});return task;}
  function clear(){const task=queue.then(()=>rm(path,{force:true}));queue=task.catch(()=>{});return task;}
  return {read,save,clear};
}

export async function callNeteaseSdk(method,input={}, {signal}={}){
  if(!sdkMethods.has(method))throw fail('不支持此网易云操作。','NETEASE_METHOD',400);
  signal?.throwIfAborted();
  const runtime=resolve('.local/netease-runtime');await mkdir(runtime,{recursive:true,mode:0o700});await chmod(runtime,0o700);
  return new Promise((resolveResult,reject)=>{
    // Upstream logs may include Set-Cookie. Isolate its stdout/stderr and pass
    // credentials over IPC, never process arguments, environment, or app logs.
    const child=fork(new URL('./netease-sdk-worker.cjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,TMPDIR:runtime},serialization:'json'});
    let finished=false;const timer=setTimeout(()=>finish(fail('网易云接口请求超时。','NETEASE_TIMEOUT',504)),25000);timer.unref();
    function finish(error,result){if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);child.kill();if(error)reject(error);else resolveResult(result);}
    const abort=()=>finish(signal.reason||fail('导入已取消。','ABORTED',408));signal?.addEventListener('abort',abort,{once:true});
    child.once('error',()=>finish(fail('网易云接口进程未能启动。','NETEASE_SDK',503)));
    child.once('exit',()=>finish(fail('网易云第三方接口未能完成请求。','NETEASE_UPSTREAM',502)));
    child.once('message',message=>message?.ok?finish(null,message.result):finish(fail('网易云第三方接口暂时不可用，请稍后重试。','NETEASE_UPSTREAM',502)));
    child.send({method,input:{...input,cookie:cookieValues(input.cookie)}},error=>{if(error)finish(fail('网易云接口进程通信失败。','NETEASE_SDK',503));});
    if(signal?.aborted)abort();
  });
}

function imageDimensions(buffer,mimeType){
  if(mimeType==='image/png'&&buffer.length>=24&&buffer.toString('ascii',12,16)==='IHDR')return {width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};
  if(mimeType==='image/jpeg')for(let offset=2;offset+8<buffer.length;){
    if(buffer[offset++]!==255)break;while(buffer[offset]===255)offset++;const marker=buffer[offset++];
    if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;
    const length=buffer.readUInt16BE(offset);if(length<2||offset+length>buffer.length)break;
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8)return {width:buffer.readUInt16BE(offset+5),height:buffer.readUInt16BE(offset+3)};
    offset+=length;
  }
  throw fail('谱页图片尺寸无法读取。','NETEASE_IMAGE');
}

export async function mergeScorePages(images){
  const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.create();
  // This PDF contains only the ordered source images. Stable metadata lets an
  // unchanged import reuse its exact-byte OMR cache on a later visit.
  pdf.setCreationDate(new Date(0));pdf.setModificationDate(new Date(0));
  for(const input of images){
    const dimensions=imageDimensions(input.buffer,input.mimeType);
    if(dimensions.width<600||dimensions.height<600||dimensions.width>20000||dimensions.height>20000||dimensions.width*dimensions.height>45000000)throw fail('某页不是清晰的完整谱面图片，请检查原始谱页。','NETEASE_IMAGE');
    let embedded;try{embedded=input.mimeType==='image/png'?await pdf.embedPng(input.buffer):input.mimeType==='image/jpeg'?await pdf.embedJpg(input.buffer):null;}catch{throw fail('某页图片损坏，无法合并原谱。','NETEASE_IMAGE');}
    if(!embedded||embedded.width<600||embedded.height<600||embedded.width>20000||embedded.height>20000||embedded.width*embedded.height>45000000)throw fail('某页不是清晰的完整谱面图片，请检查原始谱页。','NETEASE_IMAGE');
    const width=595.28,height=width*embedded.height/embedded.width;
    const page=pdf.addPage([width,height]);page.drawImage(embedded,{x:0,y:0,width,height});
  }
  const buffer=Buffer.from(await pdf.save());if(buffer.length>50*1024*1024)throw fail('合并后的全谱超过 50 MB。','NETEASE_SIZE');return buffer;
}

export function createNeteaseScoreProvider({sdk=callNeteaseSdk,fetcher=safeFetch,sessionStore=createNeteaseSessionStore(),makePdf=mergeScorePages,now=Date.now,qrEncoder}={}){
  const imports=new Map(),challenges=new Map(),listHints=new Map();let loginVersion=0;
  function trim(){for(const map of [imports,challenges,listHints]){for(const [key,value]of map)if(value.expires<now())map.delete(key);while(map.size>(map===imports?4:map===challenges?20:400))map.delete(map.keys().next().value);}}
  async function call(method,args={},options={}){
    try{const response=await sdk(method,args,options);const body=response?.body??response;
      const code=Number(body?.code??200);
      if([301,401,403].includes(code))throw fail('请先登录网易云音乐，再获取乐谱内容。','NETEASE_LOGIN_REQUIRED',401);
      if(code!==200&&![800,801,802,803].includes(code))throw fail('网易云接口未成功返回；可能需要登录、权限或稍后重试。','NETEASE_UPSTREAM',502);
      return {body,cookie:response?.cookie};
    }catch(error){if(error.public||options.signal?.aborted)throw error;throw fail('网易云第三方接口暂时不可用，请稍后重试；未获取到完整乐谱。','NETEASE_UPSTREAM',502);}
  }
  async function credentials(){const stored=await sessionStore.read();if(!cookieValues(stored.cookie).MUSIC_U)throw fail('获取乐谱内容需要登录网易云音乐。','NETEASE_LOGIN_REQUIRED',401);return stored;}
  function record(id,scope){trim();const item=imports.get(id);if(!item||item.scope!==scope)throw fail('谱页预览已过期，请重新获取。','NETEASE_IMPORT_EXPIRED',404);return item;}
  function view(item){return {id:item.id,sheetId:item.sheetId,title:item.title,sourceUrl:item.sourceUrl,totalPages:item.totalPages,pagesFound:item.pages.length,integrity:item.integrity,pages:item.pages.map(page=>({number:page.number,url:`/api/netease/imports/${item.id}/pages/${page.number}`}))};}
  async function readImage(item,index,{signal}={}){
    if(!Number.isInteger(index)||index<1||index>item.pages.length)throw fail('谱页不存在。','NETEASE_PAGE',404);
    if(item.images.has(index))return item.images.get(index);
    const url=item.pages[index-1].url;
    let result;
    for(let attempt=0;attempt<2;attempt++){
      signal?.throwIfAborted();
      try{result=await fetcher(url,{allowedHosts:[new URL(url).hostname],signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000),maxBytes:7*1024*1024});break;}
      catch(error){
        const transient=[408,500,502,503,504].includes(error.upstreamStatus)||['ECONNRESET','EPROTO','ETIMEDOUT','EAI_AGAIN','TimeoutError'].includes(error.code||error.name);
        if(attempt||signal?.aborted||!transient)throw error;
      }
    }
    const buffer=result.buffer;const mimeType=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':buffer[0]===255&&buffer[1]===216?'image/jpeg':null;
    if(!mimeType)throw fail('来源返回的不是 PNG/JPEG 原谱图片，已停止导入。','NETEASE_IMAGE');
    const bytes=[...item.images.values()].reduce((sum,image)=>sum+image.buffer.length,0)+buffer.length;
    if(bytes>50*1024*1024)throw fail('该乐谱图片总量超过 50 MB。','NETEASE_SIZE');
    const cached=[...imports.values()].reduce((sum,value)=>sum+[...value.images.values()].reduce((n,image)=>n+image.buffer.length,0),0);
    if(cached+buffer.length>96*1024*1024)for(const value of imports.values())if(value!==item)value.images.clear();
    const dimensions=imageDimensions(buffer,mimeType);
    if(dimensions.width>20000||dimensions.height>20000||dimensions.width*dimensions.height>45000000)throw fail('谱页图片尺寸超过允许范围。','NETEASE_IMAGE');
    const image={buffer,mimeType,sha256:createHash('sha256').update(buffer).digest('hex')};item.images.set(index,image);return image;
  }
  return {
    async status(){const stored=await sessionStore.read();return {configured:Boolean(cookieValues(stored.cookie).MUSIC_U),nickname:clean(stored.nickname),provider:'NeteaseCloudMusicApiEnhanced',official:false};},
    async startLogin(scope,options={}){
      trim();const version=++loginVersion;const result=await call('login_qr_key',{},options);
      const key=result.body?.data?.unikey||result.body?.data?.data?.unikey;
      if(typeof key!=='string'||!/^[\w-]{8,256}$/.test(key))throw fail('未获取到有效的网易云登录二维码。','NETEASE_QR',502);
      const id=randomBytes(24).toString('hex'),qrUrl=`https://music.163.com/login?codekey=${encodeURIComponent(key)}`;
      const encode=qrEncoder||((await import('qrcode')).default.toDataURL);
      const image=await encode(qrUrl,{width:240,margin:2});
      if(version!==loginVersion)throw fail('登录操作已取消。','NETEASE_QR_EXPIRED',410);
      challenges.set(id,{scope,key,jar:cookieValues(result.cookie),version,expires:now()+180000,lastPoll:0});trim();return {id,image,expiresIn:180};
    },
    async pollLogin(id,scope,options={}){
      const challenge=challenges.get(id);if(!challenge||challenge.scope!==scope||challenge.expires<now()||challenge.version!==loginVersion)throw fail('登录二维码已过期，请重新获取。','NETEASE_QR_EXPIRED',410);
      if(now()-challenge.lastPoll<2000)return {state:'waiting'};challenge.lastPoll=now();
      const result=await call('login_qr_check',{key:challenge.key,cookie:cookieString(challenge.jar)},options);const code=Number(result.body?.code);
      if(code===800){challenges.delete(id);return {state:'expired'};}
      if(code===801)return {state:'waiting'};
      if(code===802)return {state:'scanned'};
      if(code!==803)throw fail('二维码状态无法识别，请重新登录。','NETEASE_QR',502);
      const jar={...challenge.jar,...cookieValues(result.cookie),...cookieValues(result.body.cookie)};
      if(!jar.MUSIC_U)throw fail('登录响应没有有效会话，请重新扫码。','NETEASE_QR',502);
      const verified=await call('login_status',{cookie:cookieString(jar)},options),profile=verified.body?.data?.profile||verified.body?.profile;
      if(!profile?.userId)throw fail('登录会话尚未验证，请重新扫码。','NETEASE_LOGIN_REQUIRED',401);
      if(challenge.version!==loginVersion)throw fail('登录操作已取消。','NETEASE_QR_EXPIRED',410);
      await sessionStore.save({cookie:cookieString(jar),nickname:clean(profile.nickname),savedAt:now()});challenges.delete(id);return {state:'authorized',nickname:clean(profile.nickname)};
    },
    cancelLogin(id,scope){const challenge=challenges.get(id);if(challenge?.scope===scope){challenges.delete(id);if(challenge.version===loginVersion)loginVersion++;}return {cancelled:true};},
    async logout(){loginVersion++;challenges.clear();imports.clear();listHints.clear();await sessionStore.clear();return {configured:false};},
    async resolveShare(input,scope,{signal}={}){
      const shareTitle=clean(typeof input==='string'?input.match(/《([^》]{1,180})》/)?.[1]:'');
      let parsed=parseNeteaseShare(input);
      if(parsed.kind==='unresolved'){
        let redirected;
        const response=await fetcher(parsed.url,{allowedHosts:SHARE_HOSTS,maxBytes:512*1024,signal:signal||AbortSignal.timeout(20000),onRedirect:url=>{const candidate=parseNeteaseShare(url);if(candidate.kind!=='unresolved')redirected=candidate;}});
        parsed=redirected||parseNeteaseShare(response.url);
        if(parsed.kind==='unresolved'){
          const html=response.buffer.toString('utf8');const canonical=html.match(/<(?:link|meta)\b[^>]*(?:rel=["']canonical["']|property=["']og:url["'])[^>]*(?:href|content)=["']([^"']+)["']/i)?.[1];
          if(canonical)parsed=parseNeteaseShare(canonical.replace(/&amp;/g,'&'));
        }
      }
      if(parsed.kind==='unresolved')throw fail('分享链接没有提供可识别的歌曲/乐谱 ID。请使用原站完整链接。','NETEASE_LINK_UNRESOLVED');
      if(parsed.kind==='sheet'){if(shareTitle)listHints.set(`${scope}:${parsed.sheetId}`,{title:shareTitle,expires:now()+60*60*1000});trim();return {kind:'sheet',sheetId:parsed.sheetId,sourceUrl:parsed.url};}
      const stored=await sessionStore.read(),result=await call('sheet_list',{id:parsed.songId,cookie:stored.cookie},{signal});
      const sheets=normalizeList(result.body);for(const sheet of sheets)listHints.set(`${scope}:${sheet.id}`,{title:sheet.title,pages:sheet.pages,expires:now()+60*60*1000});trim();
      return {kind:'song',songId:parsed.songId,sourceUrl:parsed.url,sheets};
    },
    async preview(sheetId,sourceUrl,scope,options={}){
      if(!identifier(sheetId))throw fail('乐谱 ID 无效。','NETEASE_ID',400);
      const canonicalSource=parseNeteaseShare(sourceUrl).url;
      const stored=await credentials(),result=await call('sheet_preview',{id:String(sheetId),cookie:stored.cookie},options);
      const normalized=normalizeNeteasePreview(result.body);trim();const hint=listHints.get(`${scope}:${sheetId}`),hinted=hint?.pages;
      if(normalized.pages.some(page=>page.sheetId&&page.sheetId!==String(sheetId)))throw fail('返回的谱页不属于所选乐谱，已停止导入。','NETEASE_SHEET_MISMATCH');
      if(normalized.title==='网易云钢琴谱'&&hint?.title)normalized.title=hint.title;
      if(hinted&&(hinted!==normalized.pages.length||normalized.totalPages&&hinted!==normalized.totalPages)){normalized.integrity.status='incomplete';normalized.integrity.reasons.push(`乐谱列表标注 ${hinted} 页，与内容页数不一致`);}
      else if(hinted&&normalized.integrity.status==='unknown'){normalized.totalPages=hinted;normalized.integrity={status:'complete',reasons:[]};}
      const id=randomBytes(24).toString('hex'),item={...normalized,id,sheetId:String(sheetId),sourceUrl:canonicalSource,scope,expires:now()+60*60*1000,images:new Map()};imports.set(id,item);trim();return view(item);
    },
    async image(id,page,scope,options){return readImage(record(id,scope),page,options);},
    async pdf(id,input,scope,options={}){
      const item=record(id,scope);if(input.pianoConfirmed!==true)throw fail('请先对照谱面确认这是钢琴双手五线谱。','NETEASE_PIANO_CONFIRM');
      if(item.integrity.status==='incomplete')throw fail(item.integrity.reasons.join('；')+'。不能作为完整谱导入。','NETEASE_INCOMPLETE');
      if(item.integrity.status==='unknown'&&positive(input.confirmedPageCount)!==item.pages.length)throw fail('请对照原站确认总页数；缺少完整性依据时不能导入全谱。','NETEASE_PAGE_COUNT');
      const images=[];for(let index=1;index<=item.pages.length;index++){options.signal?.throwIfAborted();images.push(await readImage(item,index,options));}
      if(new Set(images.map(image=>image.sha256)).size!==images.length)throw fail('下载结果含重复谱页，已停止全谱导入。','NETEASE_DUPLICATE');
      const buffer=await makePdf(images);
      return {buffer,filename:item.title.replace(/[\\/:*?"<>|]/g,'-')+'.pdf',source:{kind:'netease-sheet',provider:'NeteaseCloudMusicApiEnhanced',songName:item.title,url:item.sourceUrl,sheetId:item.sheetId,totalPages:item.pages.length,pianoSourceVerified:true,completeness:item.integrity.status==='complete'?'source-page-count':'user-verified-page-count',retrievedAt:new Date(now()).toISOString()}};
    },
    close(){loginVersion++;challenges.clear();imports.clear();listHints.clear();},
  };
}
