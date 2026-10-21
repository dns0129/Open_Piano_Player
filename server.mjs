import {createLibraryStore} from './lib/library-store.mjs';
import {createCloudLibrary} from './lib/cloud-library-admin.mjs';
import {createDownloadLibrary} from './lib/download-library.mjs';
import {createLocalLibrary} from './lib/local-library.mjs';
import http from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {authStatus,publicError} from './lib/auth.mjs';
import {createSettingsStore,defaultDeepseekModel,userError} from './lib/settings.mjs';
import {generateScore} from './lib/ai.mjs';
import {createScoreSearch,downloadPublicScore} from './lib/public-library.mjs';
import {createFullScoreJobStore} from './lib/full-score-jobs.mjs';
import {SCORE_RECOGNITION} from './lib/recognition-policy.mjs';
import {createNeteaseScoreProvider} from './lib/netease-scores.mjs';

const COOKIE='qinban_session';
const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.xml':'application/xml','.musicxml':'application/vnd.recordare.musicxml+xml','.mxl':'application/vnd.recordare.musicxml','.mid':'audio/midi','.midi':'audio/midi','.svg':'image/svg+xml','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf','.pfb':'application/octet-stream','.bcmap':'application/octet-stream','.wasm':'application/wasm','.bin':'application/octet-stream','.txt':'text/plain; charset=utf-8','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.pdf':'application/pdf'};
function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y);}

export function createAppServer({developerMode=false,distDir=resolve('dist'),settingsStore=createSettingsStore(),generate=generateScore,statusReader=authStatus,publicDownloader=downloadPublicScore,scoreSearch=createScoreSearch(),fullScoreJobs,neteaseProvider,localLibrary=createLocalLibrary(),cloudLibrary=createCloudLibrary(),downloadLibrary=createDownloadLibrary(),libraryStore}={}) {
  const scoreLibrary=libraryStore||createLibraryStore({legacyLibrary:localLibrary,legacyDownloads:downloadLibrary});
  const scoreJobs=fullScoreJobs||createFullScoreJobStore({settingsProvider:()=>settingsStore.read()});
  const netease=neteaseProvider||createNeteaseScoreProvider();
  const sessions=new Map();let activeGenerations=0;
  function session(req,res,create=false){
    const now=Date.now();for(const [key,value] of sessions)if(now-value.last>12*60*60*1000)sessions.delete(key);
    const cookie=(req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    let value=sessions.get(cookie);
    if(!value && create){
      if(sessions.size>=64)sessions.delete(sessions.keys().next().value);
      const id=randomBytes(32).toString('hex');value={scope:id,csrfToken:randomBytes(32).toString('hex'),last:now,running:false,calls:[],searchCalls:[]};sessions.set(id,value);
      res.setHeader('set-cookie',`${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
    }
    if(value)value.last=now;return value;
  }
  function json(res,code,data){if(res.destroyed)return;res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
  function trust(req){
    if(!['127.0.0.1','::ffff:127.0.0.1','::1'].includes(req.socket.remoteAddress))throw userError('仅允许本机访问。','LOCAL_ONLY',403);
    const port=req.socket.localPort;
    const allowed=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
    if(!allowed.has(req.headers.host))throw userError('访问主机不正确，请使用 127.0.0.1。','HOST_FORBIDDEN',403);
    if(req.headers.origin && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin))throw userError('请求来源不正确，请从琴伴页面操作。','ORIGIN_FORBIDDEN',403);
    if(req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site']))throw userError('不允许跨站访问本机服务。','ORIGIN_FORBIDDEN',403);
  }
  async function body(req,limit=18*1024*1024){
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || ''))throw userError('请求必须为 JSON。','CONTENT_TYPE',415);
    if(Number(req.headers['content-length'])>limit)throw userError('请求体超出此接口允许的大小。','BODY_TOO_LARGE',413);
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>limit)throw userError('请求体超出此接口允许的大小。','BODY_TOO_LARGE',413);chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw userError('JSON 请求格式不正确。');}
  }
  async function staticFile(req,res,url){
    if(!['GET','HEAD'].includes(req.method))throw userError('不支持此请求方法。','METHOD_NOT_ALLOWED',405);
    let pathname;
    try{pathname=decodeURIComponent(url.pathname);}catch{throw userError('路径无效。','NOT_FOUND',404);}
    if(pathname==='/' )pathname='/index.html';
    if(pathname.split('/').some(segment=>segment.startsWith('.')) || pathname.includes('\\') || !contentTypes[extname(pathname)])throw userError('文件不存在。','NOT_FOUND',404);
    const base=await realpath(distDir).catch(()=>null);
    if(!base)throw userError('应用尚未构建，请先运行 npm run build。','BUILD_REQUIRED',503);
    const path=await realpath(resolve(base,'.'+pathname)).catch(()=>null);
    if(!path || !path.startsWith(base+sep))throw userError('文件不存在。','NOT_FOUND',404);
    const info=await stat(path);if(!info.isFile())throw userError('文件不存在。','NOT_FOUND',404);
    res.writeHead(200,{'content-type':contentTypes[extname(path)],'content-length':info.size,'cache-control':pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'});
    res.end(req.method==='HEAD'?undefined:await readFile(path));
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('cross-origin-resource-policy','same-origin');
    res.setHeader('content-security-policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    let timer,controller;
    try{
      trust(req);
      const url=new URL(req.url,'http://127.0.0.1');
      if(!url.pathname.startsWith('/api/')){await staticFile(req,res,url);return;}
      if(url.pathname==='/api/status' && req.method==='GET'){
        const current=session(req,res,true);if(developerMode){json(res,200,{csrfToken:current.csrfToken,mode:'developer',localOnly:true,features:['score','import','edit','playback']});return;}const settings=await settingsStore.read();
        const pi={...await statusReader(SCORE_RECOGNITION.model),model:SCORE_RECOGNITION.model,reasoningEffort:SCORE_RECOGNITION.reasoningEffort,modelLocked:true};
        json(res,200,{csrfToken:current.csrfToken,pi,deepseek:{configured:Boolean(settings.deepseekApiKey || process.env.DEEPSEEK_API_KEY),model:settings.deepseekModel || defaultDeepseekModel,models:['deepseek-flash','deepseek-v4-pro','deepseek-chat','deepseek-reasoner'],vision:(settings.deepseekModel||defaultDeepseekModel)==='deepseek-flash'},fullScore:{...SCORE_RECOGNITION,deepseek:{available:Boolean(settings.deepseekApiKey||process.env.DEEPSEEK_API_KEY)&&(settings.deepseekModel||defaultDeepseekModel)==='deepseek-flash',ready:Boolean(settings.deepseekApiKey||process.env.DEEPSEEK_API_KEY)&&(settings.deepseekModel||defaultDeepseekModel)==='deepseek-flash',model:'deepseek-flash',reasoningEffort:'high'},pi:{available:pi.available===true,ready:pi.available===true,model:SCORE_RECOGNITION.model,reasoningEffort:SCORE_RECOGNITION.reasoningEffort},maxPages:200,maxPdfBytes:50*1024*1024},localOnly:true});return;
      }
      const current=session(req,res);if(!current)throw userError('会话已过期，请刷新页面。','SESSION_REQUIRED',403);
      if(['POST','PUT','DELETE','PATCH'].includes(req.method) && !safeEqual(req.headers['x-csrf-token'],current.csrfToken))throw userError('请求校验失败，请刷新页面后重试。','CSRF',403);
      if(developerMode&&(!['/api/library','/api/local-library','/api/local-downloads','/api/cloud-library'].some(prefix=>url.pathname===prefix||url.pathname.startsWith(prefix+'/'))||req.method!=='GET'&&url.pathname.startsWith('/api/cloud-library')))throw userError('账号、托管识谱和运营功能请使用独立商业版。','COMMERCIAL_APP_REQUIRED',403);
      if(url.pathname==='/api/library'&&req.method==='GET'){
        const {records,warnings=[]}=await scoreLibrary.list();json(res,200,{records:records.map(({assets,history,originalFile,...record})=>record),warnings});return;
      }
      if(url.pathname==='/api/library'&&req.method==='POST'){
        const input=await body(req,72*1024*1024);json(res,200,await scoreLibrary.save(input.record,{expectedRevision:input.expectedRevision}));return;
      }
      if(url.pathname==='/api/library/backup'&&req.method==='GET'){json(res,200,await scoreLibrary.backup());return;}
      if(url.pathname==='/api/library/restore'&&req.method==='POST'){const input=await body(req,512*1024*1024);json(res,200,await scoreLibrary.restore(input.backup));return;}
      const unifiedRoute=/^\/api\/library\/records\/([^/]+)(\/delete)?$/.exec(url.pathname);
      if(unifiedRoute){
        let id;try{id=decodeURIComponent(unifiedRoute[1]);}catch{throw userError('曲库 ID 编码无效。');}
        if(req.method==='GET'&&!unifiedRoute[2]){json(res,200,await scoreLibrary.get(id));return;}
        if(req.method==='POST'&&unifiedRoute[2]){await body(req,16000);json(res,200,await scoreLibrary.remove(id));return;}
      }
      if(url.pathname==='/api/cloud-library'&&req.method==='GET'){json(res,200,await cloudLibrary.list());return;}
      if(url.pathname==='/api/cloud-library'&&req.method==='POST'){json(res,200,await cloudLibrary.publish(await body(req,72*1024*1024)));return;}
      const cloudRoute=/^\/api\/cloud-library\/([a-z0-9][a-z0-9_-]{0,79})(\/delete)?$/.exec(url.pathname);
      if(cloudRoute){
        if(req.method==='GET'&&!cloudRoute[2]){json(res,200,await cloudLibrary.download(cloudRoute[1]));return;}
        if(req.method==='DELETE'&&!cloudRoute[2]||req.method==='POST'&&cloudRoute[2]){if(req.method==='POST')await body(req,16000);json(res,200,await cloudLibrary.remove(cloudRoute[1]));return;}
      }
      if(url.pathname==='/api/local-downloads'&&req.method==='GET'){json(res,200,await downloadLibrary.list());return;}
      if(url.pathname==='/api/local-downloads'&&req.method==='POST'){json(res,200,await downloadLibrary.save(await body(req,72*1024*1024)));return;}
      const downloadRoute=/^\/api\/local-downloads\/([a-z0-9][a-z0-9_-]{0,79})(?:\/(delete)|\/images\/([a-z0-9][a-z0-9_-]{0,79}))?$/.exec(url.pathname);
      if(downloadRoute){
        if(req.method==='DELETE'&&!downloadRoute[2]&&!downloadRoute[3]||req.method==='POST'&&downloadRoute[2]){if(req.method==='POST')await body(req,16000);json(res,200,await downloadLibrary.remove(downloadRoute[1]));return;}
        if(req.method==='GET'&&!downloadRoute[2]){
          if(downloadRoute[3]){const asset=await downloadLibrary.image(downloadRoute[1],downloadRoute[3]);res.writeHead(200,{'content-type':asset.mimeType,'cache-control':'no-store'});res.end(asset.buffer);}
          else json(res,200,await downloadLibrary.source(downloadRoute[1]));return;
        }
      }
      const removeLocal=/^\/api\/local-library\/([A-Za-z0-9_-]{1,80})\/delete$/.exec(url.pathname);
      if(req.method==='POST'&&removeLocal){await body(req,16000);json(res,200,await localLibrary.remove(removeLocal[1]));return;}
      if(req.method==='GET' && url.pathname==='/api/local-library') {
        json(res,200,await localLibrary.list());return;
      }
      const libraryRoute=/^\/api\/local-library\/([A-Za-z0-9_-]{1,80})(?:\/images\/([A-Za-z0-9_-]{1,80}))?$/.exec(url.pathname);
      if(req.method==='GET' && libraryRoute) {
        if(libraryRoute[2]) {
          const asset=await localLibrary.image(libraryRoute[1],libraryRoute[2]);
          res.writeHead(200,{'content-type':asset.mimeType,'content-length':asset.buffer.length,'cache-control':'no-store'});res.end(asset.buffer);
        }else json(res,200,await localLibrary.source(libraryRoute[1]));
        return;
      }
      if(url.pathname==='/api/settings' && req.method==='POST'){json(res,200,await settingsStore.update(await body(req)));return;}
      if(url.pathname.startsWith('/api/netease/')){
        if(url.pathname==='/api/netease/status'&&req.method==='GET'){json(res,200,await netease.status());return;}
        const page=/^\/api\/netease\/imports\/([a-f0-9]{48})\/pages\/(\d{1,3})$/.exec(url.pathname);
        controller=new AbortController();timer=setTimeout(()=>controller.abort(),url.pathname.endsWith('/pdf')?180000:30000);timer.unref();
        const abort=()=>{if(!res.writableEnded)controller.abort();};res.on('close',abort);
        try{
          if(page&&req.method==='GET'){
            const image=await netease.image(page[1],Number(page[2]),current.scope,{signal:controller.signal});
            res.writeHead(200,{'content-type':image.mimeType,'content-length':image.buffer.length,'cache-control':'no-store'});res.end(image.buffer);return;
          }
          if(req.method!=='POST')throw userError('网易云接口不存在。','NOT_FOUND',404);
          const input=await body(req,16000);if(!input||typeof input!=='object'||Array.isArray(input))throw userError('网易云操作参数必须是 JSON 对象。');let result;
          if(url.pathname==='/api/netease/login/start')result=await netease.startLogin(current.scope,{signal:controller.signal});
          else if(url.pathname==='/api/netease/login/check')result=await netease.pollLogin(input.id,current.scope,{signal:controller.signal});
          else if(url.pathname==='/api/netease/login/cancel')result=netease.cancelLogin(input.id,current.scope);
          else if(url.pathname==='/api/netease/logout')result=await netease.logout();
          else if(url.pathname==='/api/netease/resolve'){
            const now=Date.now();current.searchCalls=current.searchCalls.filter(t=>now-t<60000);
            if(current.searchCalls.length>=12)throw userError('获取过于频繁，请稍后重试。','SEARCH_RATE_LIMIT',429);current.searchCalls.push(now);
            result=await netease.resolveShare(input.share,current.scope,{signal:controller.signal});
          }
          else if(url.pathname==='/api/netease/preview')result=await netease.preview(input.sheetId,input.sourceUrl,current.scope,{signal:controller.signal});
          else if(url.pathname==='/api/netease/pdf'){
            const pdf=await netease.pdf(input.id,input,current.scope,{signal:controller.signal});
            res.writeHead(200,{'content-type':'application/pdf','content-length':pdf.buffer.length,'cache-control':'no-store','x-score-filename':encodeURIComponent(pdf.filename),'x-score-source':encodeURIComponent(JSON.stringify(pdf.source))});res.end(pdf.buffer);return;
          }
          else throw userError('网易云接口不存在。','NOT_FOUND',404);
          json(res,200,result);return;
        }finally{res.removeListener('close',abort);}
      }
      const jobRoute=/^\/api\/full-score-jobs(?:\/([A-Za-z0-9_-]{1,80}))?(?:\/([a-z-]+))?(?:\/([A-Za-z0-9_-]{1,80}))?$/.exec(url.pathname);
      if(jobRoute){
        const [,id,action,regionId]=jobRoute;
        const auth={sessionId:current.scope,token:req.headers['x-fullscore-token']||url.searchParams.get('token')||undefined};
        if(!id&&req.method==='POST'){json(res,201,await scoreJobs.createJob(await body(req),auth));return;}
        if(id&&!action&&req.method==='GET'){json(res,200,await scoreJobs.getJob(id,auth));return;}
        if(id&&action==='document'&&req.method==='GET'){
          const pdf=await scoreJobs.readDocument(id,auth);
          res.writeHead(200,{'content-type':'application/pdf','content-length':pdf.buffer.length,'cache-control':'no-store'});res.end(pdf.buffer);return;
        }
        if(id&&action==='region'&&regionId&&req.method==='GET'){
          const image=await scoreJobs.readRegionImage(id,regionId,auth);
          res.writeHead(200,{'content-type':image.mimeType,'content-length':image.buffer.length,'cache-control':'no-store'});res.end(image.buffer);return;
        }
        if(id&&req.method==='POST'){
          const input=await body(req,action==='document'?72*1024*1024:8*1024*1024);
          let result;
          if(action==='region'&&regionId)result=await scoreJobs.uploadRegion(id,regionId,input,auth);
          else if(action==='document')result=await scoreJobs.uploadDocument(id,input,auth);
          else if(action==='start')result=await scoreJobs.startJob(id,{...input,...auth});
          else if(action==='retry'&&regionId)result=await scoreJobs.retryRegion(id,regionId,auth,{engine:input.engine,expectedVersion:input.expectedVersion,...(input.phase!==undefined?{phase:input.phase}:{})});
          else if(action==='retry-failed')result=await scoreJobs.retryRegions(id,auth,{engine:input.engine,expectedVersion:input.expectedVersion,regionIds:input.regionIds});
          else if(action==='cancel')result=await scoreJobs.cancelJob(id,auth);
          else if(action==='confirm-region'&&regionId)result=await scoreJobs.confirmRegion(id,regionId,input.result||input,auth);
          else if(action==='draft')result=await scoreJobs.exportDraft(id,auth,{scopeConfirmed:input.scopeConfirmed===true});
          else if(action==='confirm')result=await scoreJobs.confirmJob(id,auth,{scopeConfirmed:input.scopeConfirmed===true});
          else throw userError('识谱任务操作不存在。','NOT_FOUND',404);
          json(res,200,result);return;
        }
      }
      if(url.pathname==='/api/search' && req.method==='GET'){
        const now=Date.now();current.searchCalls=current.searchCalls.filter(t=>now-t<60000);
        if(current.searchCalls.length>=12)throw userError('联网查询过于频繁，请稍后重试。','SEARCH_RATE_LIMIT',429);current.searchCalls.push(now);
        controller=new AbortController();timer=setTimeout(()=>controller.abort(),25000);timer.unref();
        const abort=()=>{if(!res.writableEnded)controller.abort();};res.on('close',abort);
        try{json(res,200,await scoreSearch.search(url.searchParams.get('q') || '',current.scope,{signal:controller.signal}));}finally{res.removeListener('close',abort);}return;
      }
      if(url.pathname==='/api/resolve-score' && req.method==='GET'){json(res,200,await scoreSearch.resolve(url.searchParams.get('id'),current.scope,{signal:AbortSignal.timeout(20000)}));return;}
      if(url.pathname==='/api/import-score' && req.method==='GET'){
        const result=await scoreSearch.download(url.searchParams.get('id'),current.scope,{signal:AbortSignal.timeout(25000)});
        res.writeHead(200,{'content-type':result.mime,'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,'x-score-format':result.format,'x-score-filename':encodeURIComponent(result.filename),'cache-control':'no-store'});res.end(result.buffer);return;
      }
      if(url.pathname==='/api/public-score' && req.method==='GET'){
        const result=await publicDownloader(url.searchParams.get('path'),{signal:AbortSignal.timeout(20000)});
        res.writeHead(200,{'content-type':'application/vnd.recordare.musicxml','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,'cache-control':'private, max-age=3600'});res.end(result.buffer);return;
      }
      if(url.pathname==='/api/generate' && req.method==='POST'){
        if(current.running || activeGenerations>=2)throw userError('已有生成任务正在进行，请稍后重试。','BUSY',429);
        const now=Date.now();current.calls=current.calls.filter(t=>now-t<60000);if(current.calls.length>=6)throw userError('生成请求过于频繁，请一分钟后重试。','RATE_LIMIT',429);
        const input=await body(req);const settings=await settingsStore.read();
        // Reserve synchronously after asynchronous body parsing to avoid concurrent request races.
        if(current.running || activeGenerations>=2)throw userError('已有生成任务正在进行，请稍后重试。','BUSY',429);
        current.running=true;activeGenerations++;current.calls.push(now);
        controller=new AbortController();timer=setTimeout(()=>controller.abort(new Error('timeout')),SCORE_RECOGNITION.timeoutMs);timer.unref();
        const abort=()=>{if(!res.writableEnded)controller.abort(new Error('client aborted'));};res.on('close',abort);
        try{const result=await generate(input,settings,{signal:controller.signal});json(res,200,result);}
        finally{current.running=false;activeGenerations--;res.removeListener('close',abort);}
        return;
      }
      throw userError('接口不存在或请求方法不正确。','NOT_FOUND',404);
    }catch(error){json(res,error.status || (controller?.signal.aborted?408:500),{error:publicError(error),code:error.code || (controller?.signal.aborted?'ABORTED':'REQUEST_FAILED')});}
    finally{if(timer)clearTimeout(timer);}
  });
  server.requestTimeout=SCORE_RECOGNITION.timeoutMs+20000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  server.on('close',()=>{void scoreJobs.close();netease.close();});
  return server;
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const port=8792;
  const server=createAppServer({developerMode:true});server.listen(port,'127.0.0.1',()=>console.log(`琴伴钢琴练习室已启动：http://127.0.0.1:${port}`));
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'8792 端口已在使用，请打开现有琴伴窗口。':'本机服务未能启动。');process.exitCode=1;});
  for(const name of ['SIGTERM','SIGINT'])process.on(name,()=>{server.close();server.closeIdleConnections();});
}
