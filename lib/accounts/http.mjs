import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fail,equal,id,uuid} from './common.mjs';
import {createLibraryStore} from '../library-store.mjs';
import {createLibraryBackup} from '../library-format.ts';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.mp3':'audio/mpeg','.wav':'audio/wav','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf','.wasm':'application/wasm','.bin':'application/octet-stream','.txt':'text/plain; charset=utf-8','.webmanifest':'application/manifest+json','.pdf':'application/pdf','.mid':'audio/midi','.xml':'application/xml','.musicxml':'application/xml'};
const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'];
// Behind the loopback HTTPS proxy every socket is 127.0.0.1; the proxy appends the real peer as the last X-Forwarded-For entry.
export function clientAddress(req,{trustProxy=false}={}){const peer=req.socket.remoteAddress;if(!trustProxy||!loopback.includes(peer))return peer;return String(req.headers['x-forwarded-for']||'').split(',').map(s=>s.trim()).filter(Boolean).at(-1)||peer}
export function createHostedServer({identity,library,transfers,recognition,operations,landingFile='index.html',distDir=resolve('dist-hosted'),profile='local',origin,localLibraryDirectory=resolve('.local/library-v2'),mailboxDirectory}={}){
 const local=profile==='local',cookieName=local?'qinban_dev_account':'__Host-qinban_session',loginName=local?'qinban_dev_login':'__Host-qinban_login';
 const cookie=(name,value,age=2592000)=>`${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${local?'':'; Secure'}`;
 const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=')).filter(p=>p.length===2));
 let activeUploads=0;
 const server=http.createServer(async(req,res)=>{
  const requestId=id();res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('cache-control','private, no-store');res.setHeader('content-security-policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  const json=(code,data)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
  async function bytes(limit){if(Number(req.headers['content-length'])>limit)throw fail('BODY_TOO_LARGE','文件或请求过大。',413);const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw fail('BODY_TOO_LARGE','文件或请求过大。',413);chunks.push(chunk)}return Buffer.concat(chunks)}
  async function body(){if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail('CONTENT_TYPE','请求必须为 JSON。',415);try{return JSON.parse((await bytes(8*1024*1024)).toString('utf8'))}catch(e){if(e.public)throw e;throw fail('INVALID_JSON','JSON 请求格式无效。')}}
  try{
   const expected=origin||`http://127.0.0.1:${req.socket.localPort}`;
   if(!local&&!req.socket.encrypted&&!( loopback.includes(req.socket.remoteAddress)&&req.headers['x-forwarded-proto']==='https'))throw fail('HTTPS_REQUIRED','托管账号必须通过 HTTPS 反向代理访问。',403);
   if(req.headers.host!==new URL(expected).host)throw fail('HOST_FORBIDDEN','访问主机无效。',403);
   if(local&&!loopback.includes(req.socket.remoteAddress))throw fail('LOCAL_ONLY','本机验证实例仅允许本机访问。',403);
   if(req.headers.origin&&req.headers.origin!==expected)throw fail('ORIGIN_FORBIDDEN','请求来源不允许。',403);
   if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))throw fail('ORIGIN_FORBIDDEN','请求来源不允许。',403);
   const url=new URL(req.url,expected),path=url.pathname,method=req.method,ck=cookies(req);
   if(!path.startsWith('/api/')){
    if(!['GET','HEAD'].includes(method))throw fail('METHOD_NOT_ALLOWED','请求方法无效。',405);
    let name;try{name=decodeURIComponent(path==='/'?'/'+landingFile:path)}catch{throw fail('NOT_FOUND','文件不存在。',404)}
    if(name.split('/').some(s=>s.startsWith('.'))||name.includes('\\')||!types[extname(name)])throw fail('NOT_FOUND','文件不存在。',404);
    const base=await realpath(distDir),file=await realpath(resolve(base,'.'+name)).catch(()=>null);if(!file||!file.startsWith(base+sep))throw fail('NOT_FOUND','文件不存在。',404);
    const info=await stat(file);if(!info.isFile())throw fail('NOT_FOUND','文件不存在。',404);res.writeHead(200,{'content-type':types[extname(name)],'content-length':info.size,...(name.startsWith('/assets/')?{'cache-control':'public, max-age=31536000, immutable'}:{})});res.end(method==='HEAD'?undefined:await readFile(file));return;
   }
   if(path==='/api/v1/product'&&method==='GET'&&recognition){json(200,await recognition.budget.publicInfo());return;}
   if(path==='/api/v1/auth/context'&&method==='GET'){const nonce=randomBytes(32).toString('base64url');res.setHeader('set-cookie',cookie(loginName,nonce,600));json(200,{csrfToken:identity.csrf('login:'+nonce),expiresAt:new Date(Date.now()+600000).toISOString(),profile:local?'local-validation':'production',...(local?{mailboxNotice:'本机验证模式：验证码写入私有开发邮箱，没有发送真实邮件。',mailboxDirectory}: {})});return;}
   let current;
   if(ck[cookieName]){try{current=await identity.session(ck[cookieName],{recovery:path==='/api/v1/account/recover'||path==='/api/v1/session'||path==='/api/v1/auth/code'||path==='/api/v1/auth/verify'})}catch(e){if(!['/api/v1/auth/code','/api/v1/auth/verify'].includes(path))throw e}}
   const authPath=['/api/v1/auth/code','/api/v1/auth/verify'].includes(path);
   if(!authPath&&!current)throw fail('SESSION_REQUIRED','请先登录账号。',401);
   if(method!=='GET'){
    const csrf=current?.csrfToken||(ck[loginName]&&identity.csrf('login:'+ck[loginName]));if(!csrf||!equal(csrf,String(req.headers['x-csrf-token']||'')))throw fail('CSRF','页面验证已过期，请重新打开。',403);
   }
   const key=String(req.headers['idempotency-key']||'');if(method!=='GET'&&!authPath&&(key.length<16||key.length>128))throw fail('IDEMPOTENCY_REQUIRED','操作需要唯一标识，请重试。',428);const owner=current?.userId,nonce=current?current.id:ck[loginName],ip=clientAddress(req,{trustProxy:!local});
   const publicSession=s=>({user:{id:s.userId,email:s.email,state:s.state,role:s.isOperator?'operator':'user'},sessionId:s.id,csrfToken:s.csrfToken,reauthenticatedAt:s.reauthenticatedAt,expiresAt:s.expiresAt});
   if(path==='/api/v1/session'&&method==='GET'){json(200,publicSession(current));return;}
   if(authPath&&method==='POST'){const input=await body();if(path.endsWith('/code')){json(202,await identity.code({...input,nonce,session:current,ip}));return;}if(!uuid(input.challengeId))throw fail('INVALID_CODE','验证码无效或已过期。');const result=await identity.verify({...input,nonce,session:current,device:req.headers['user-agent'],ip});if(result.token)res.setHeader('set-cookie',[cookie(cookieName,result.token,result.session.purpose==='recover'?600:2592000),cookie(loginName,'',0)]);json(200,publicSession(result.session));return;}
   if(path==='/api/v1/sessions'&&method==='GET'){json(200,await identity.devices(current));return;}
   const sessionMatch=/^\/api\/v1\/sessions\/([a-f0-9-]+)$/.exec(path);if(sessionMatch&&method==='DELETE'){if(!uuid(sessionMatch[1]))throw fail('NOT_FOUND','会话不存在。',404);await identity.revoke(current,sessionMatch[1]);if(sessionMatch[1]===current.id)res.setHeader('set-cookie',cookie(cookieName,'',0));res.writeHead(204);res.end();return;}
   if(path==='/api/v1/auth/logout-all'&&method==='POST'){await body();await identity.logoutAll(current);res.setHeader('set-cookie',cookie(cookieName,'',0));res.writeHead(204);res.end();return;}
   if(path==='/api/v1/account'&&method==='DELETE'){await body();const r=await identity.deleteAccount(current);res.setHeader('set-cookie',cookie(cookieName,'',0));json(202,r);return;}
   if(path==='/api/v1/account/recover'&&method==='POST'){await body();const r=await identity.recover(current);res.setHeader('set-cookie',cookie(cookieName,r.token));json(200,publicSession(r.session));return;}
   if(current.purpose!=='normal'||current.state!=='active')throw fail('SESSION_REQUIRED','请先恢复账号。',401);
   if(recognition){
    if(path==='/api/v1/recognition/quota'&&method==='GET'){json(200,await recognition.budget.quota(owner));return;}
    if(path==='/api/v1/recognition/jobs'){if(method==='GET')json(200,await recognition.list(owner));else if(method==='POST')json(202,await recognition.create(owner,await body(),key));else throw fail('METHOD_NOT_ALLOWED','请求方法无效。',405);return;}
    const job=/^\/api\/v1\/recognition\/jobs\/([a-f0-9-]+)(?:\/(cancel|retry|save))?$/.exec(path);
    if(job){if(method==='GET'&&!job[2])json(200,await recognition.get(owner,job[1]));else if(method==='POST'&&job[2]){await body();json(job[2]==='retry'?202:200,await recognition[job[2]](owner,job[1],key));}else throw fail('METHOD_NOT_ALLOWED','请求方法无效。',405);return;}
    const page=/^\/api\/v1\/source-groups\/([a-f0-9-]+)\/pages(?:\/(\d+)\/preview)?$/.exec(path);
    if(page&&method==='GET'){if(!page[2])json(200,await recognition.sources.pages(owner,page[1]));else{const p=await recognition.sources.page(owner,page[1],Number(page[2]));res.writeHead(200,{'content-type':p.mimeType,'content-length':p.bytes.length});res.end(p.bytes)}return;}
   }
   if(operations){
    if(path==='/api/v1/feedback'){if(method==='GET')json(200,await operations.mine(owner));else if(method==='POST')json(201,await operations.submitFeedback(owner,await body(),key));else throw fail('METHOD_NOT_ALLOWED','请求方法无效。',405);return;}
    if(path.startsWith('/api/v1/operator/')){
     operations.requireOperator(current,{recent:method!=='GET'});const op=path.slice('/api/v1/operator/'.length);
     if(method==='GET'&&['overview','users','jobs','feedback','audit'].includes(op)){json(200,await operations[op](current));return;}
     if(op==='policy'&&method==='PUT'){json(200,await operations.policy(current,await body()));return;}
     if(op==='invitations'&&method==='POST'){json(201,await operations.invite(current,await body()));return;}
     const target=/^(users|tasks|attempts|feedback)\/([a-f0-9-]+)(?:\/(refund|reconcile))?$/.exec(op);
     if(target){const input=await body();if(target[1]==='users'&&method==='PUT')json(200,await operations.user(current,target[2],input));else if(target[1]==='tasks'&&target[3]==='refund'&&method==='POST')json(200,await operations.refund(current,target[2],input));else if(target[1]==='attempts'&&target[3]==='reconcile'&&method==='POST')json(200,await operations.resolve(current,target[2],input));else if(target[1]==='feedback'&&method==='PUT')json(200,await operations.reply(current,target[2],input));else throw fail('METHOD_NOT_ALLOWED','请求方法无效。',405);return;}
    }
   }
   if(path==='/api/v1/library/entries'){
    if(method==='GET'){json(200,await library.list(owner,{cursor:url.searchParams.get('cursor'),limit:url.searchParams.get('limit'),deleted:url.searchParams.get('deleted')==='true'}));return;}
    if(method==='POST'){json(201,await library.save(owner,null,await body(),key));return;}
   }
   const e=/^\/api\/v1\/library\/entries\/([a-f0-9-]+)(?:\/(revisions|restore))?$/.exec(path);
   if(e){const eid=e[1];if(method==='GET'&&!e[2])json(200,await library.read(owner,eid));else if(method==='PUT'&&!e[2])json(200,await library.save(owner,eid,await body(),key));else if(method==='DELETE'&&!e[2])json(200,await library.remove(owner,eid,url.searchParams.has('expectedRevision')?Number(url.searchParams.get('expectedRevision')):undefined,key));else if(method==='GET'&&e[2]==='revisions')json(200,await library.revisions(owner,eid,{cursor:url.searchParams.get('cursor'),limit:Math.min(100,Number(url.searchParams.get('limit'))||30)}));else if(method==='POST'&&e[2]==='restore')json(200,await library.restore(owner,eid,await body(),key));else throw fail('METHOD_NOT_ALLOWED','请求方法无效。',405);return;}
   if(path==='/api/v1/uploads'&&method==='POST'){json(201,await library.stage(owner,await body(),key));return;}
   const u=/^\/api\/v1\/uploads\/([a-f0-9-]+)\/(content|complete)$/.exec(path);
   if(u){if(u[2]==='content'&&method==='PUT'){if(activeUploads>=2)throw fail('UPLOAD_BUSY','上传繁忙，请稍后重试。',429);if(req.headers['content-type']!=='application/octet-stream')throw fail('CONTENT_TYPE','上传内容类型无效。',415);activeUploads++;try{await library.receive(owner,u[1],await bytes(await library.uploadLimit(owner,u[1])))}finally{activeUploads--}res.writeHead(204);res.end();return;}if(u[2]==='complete'&&method==='POST'){json(200,await library.complete(owner,u[1],await body(),key));return;}}
   if(path==='/api/v1/source-groups'&&method==='GET'){json(200,await library.groups(owner));return;}
   if(path==='/api/v1/source-groups'&&method==='POST'){json(201,await library.sourceGroup(owner,await body(),key));return;}
   const g=/^\/api\/v1\/source-groups\/([a-f0-9-]+)$/.exec(path);if(g&&method==='GET'){json(200,await library.readGroup(owner,g[1]));return;}if(g&&method==='DELETE'){json(200,await library.removeGroup(owner,g[1],key));return;}
   const resource=/^\/api\/v1\/resources\/([a-f0-9-]+)$/.exec(path);if(resource&&method==='GET'){const r=await library.readResource(owner,resource[1]);if(r.backup)identity.recent(current);res.writeHead(200,{'content-type':r.info.mimeType,'content-length':r.bytes.length,'content-disposition':`attachment; filename="source"; filename*=UTF-8''${encodeURIComponent((r.info.name||'source').replace(/[\r\n]/g,''))}`});res.end(r.bytes);return;}
   if(path==='/api/v1/library/exports'&&method==='POST'){identity.recent(current);json(202,await transfers.export(owner,await body(),key));return;}
   const exp=/^\/api\/v1\/library\/exports\/([a-f0-9-]+)$/.exec(path);if(exp&&method==='GET'){json(200,await transfers.exportState(owner,exp[1]));return;}
   if(path==='/api/v1/library/imports/preview'&&method==='POST'){json(200,await transfers.preview(owner,await body(),key,current.email));return;}
   const imp=/^\/api\/v1\/library\/imports\/([a-f0-9-]+)(?:\/(commit))?$/.exec(path);if(imp){if(method==='GET'&&!imp[2])json(200,await transfers.importState(owner,imp[1]));else if(method==='POST'&&imp[2])json(202,await transfers.commit(owner,imp[1],await body(),key));else throw fail('METHOD_NOT_ALLOWED','请求方法无效。',405);return;}
   // This local-only, explicit migration entry point never changes the old library.
   if(local&&path==='/api/v1/device-library'&&method==='GET'){const store=createLibraryStore({directory:localLibraryDirectory});const r=await store.list();json(200,{records:r.records.map(r=>({id:r.id,title:r.document.title,revision:r.revision})),warnings:r.warnings});return;}
   if(local&&path==='/api/v1/device-library/export'&&method==='POST'){const input=await body();if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>10000)throw fail('SELECTION_REQUIRED','请选择本机曲目。');const store=createLibraryStore({directory:localLibraryDirectory});const records=[];for(const sid of new Set(input.ids))records.push(await store.get(sid));json(200,await createLibraryBackup(records));return;}
   throw fail('NOT_FOUND','接口不存在。',404);
  }catch(e){if(res.headersSent){res.destroy();return;}json(e.public?e.status||422:500,{code:e.public?e.code:'INTERNAL_ERROR',message:e.public?e.message:'操作未完成，请稍后重试。',requestId});}
 });return server;
}
