import http from 'node:http';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {gunzipSync,inflateSync,brotliDecompressSync} from 'node:zlib';
import {userError} from './settings.mjs';

export function isPublicAddress(address) {
  const ip=address.toLowerCase().replace(/^\[|\]$/g,'');
  if(isIP(ip)===4){
    const [a,b,c]=ip.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
  }
  if(isIP(ip)===6){
    if(ip.startsWith('::ffff:'))return isPublicAddress(ip.slice(7));
    const canonical=new URL(`http://[${ip}]`).hostname.slice(1,-1);
    // Only global unicast IPv6 (2000::/3); exclude documentation and local-use ranges.
    return /^[23][0-9a-f]{0,3}:/.test(canonical)&&!/^2001:db8:/i.test(canonical)&&!/^2001:(?::|(?:10|20):)/i.test(canonical);
  }
  return false;
}
export function normalizePublicUrl(value) {
  let url;try{url=new URL(value);}catch{throw userError('曲谱地址不是有效网页链接。','UNSAFE_URL',400);}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash.length>2000||(url.port&&!['80','443'].includes(url.port))||url.href.length>4000)throw userError('只支持标准 HTTP/HTTPS 公开曲谱地址。','UNSAFE_URL',400);
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||(!host.includes('.')&&!isIP(host))||(isIP(host)&&!isPublicAddress(host)))throw userError('不允许访问本机或私有网络地址。','UNSAFE_URL',400);
  url.hash='';return url;
}
function cancellable(promise,signal){
  if(!signal)return promise;signal.throwIfAborted();
  return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason||new Error('aborted'));signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
export async function validatePublicTarget(value,{lookupImpl=lookup,signal}={}) {
  const url=normalizePublicUrl(value),host=url.hostname.replace(/^\[|\]$/g,'');
  let addresses;try{addresses=isIP(host)?[{address:host,family:isIP(host)}]:await cancellable(lookupImpl(host,{all:true,verbatim:true}),signal);}catch(error){if(signal?.aborted)throw error;throw userError('暂时无法解析曲谱来源域名。','SOURCE_DNS',502);}
  if(!addresses.length||addresses.some(entry=>!isPublicAddress(entry.address)))throw userError('曲谱来源解析到了私有或保留网络，已拒绝访问。','UNSAFE_URL',400);
  return {url,address:addresses[0].address,family:addresses[0].family};
}

// DNS is validated once and the exact public IP is pinned for each connection.
// Every redirect is independently checked; no ambient cookies or credentials are sent.
export async function safeFetch(value,{signal=AbortSignal.timeout(20000),maxBytes=3*1024*1024,allowedHosts,headers={},lookupImpl=lookup,method='GET',body,maxRedirects=4,onRedirect}={}) {
  let target=normalizePublicUrl(value);
  if(!['GET','POST'].includes(method)||body!==undefined&&(typeof body!=='string'||Buffer.byteLength(body)>65536))throw userError('不支持的网络请求。','INVALID_REQUEST',400);
  const allowed=new Set((allowedHosts||[target.hostname]).map(host=>host.toLowerCase()));
  for(let redirects=0;redirects<=maxRedirects;redirects++){
    if(!allowed.has(target.hostname.toLowerCase()))throw userError('曲谱跳转到了未获允许的来源，请在原网站打开。','REDIRECT_NOT_ALLOWED',400);
    const pinned=await validatePublicTarget(target,{lookupImpl,signal});signal.throwIfAborted();
    const response=await new Promise((resolve,reject)=>{
      const request=(target.protocol==='https:'?https:http).request(target,{method,signal,headers:{'user-agent':'Mozilla/5.0','accept':'text/html, application/xml, */*','accept-encoding':'gzip, deflate, br',...headers},lookup:(_host,options,callback)=>options?.all?callback(null,[{address:pinned.address,family:pinned.family}]):callback(null,pinned.address,pinned.family)},res=>resolve(res));
      request.on('error',reject);request.end(body);
    });
    if([301,302,303,307,308].includes(response.statusCode)){
      const location=response.headers.location;response.resume();
      if(!location||redirects===maxRedirects)throw userError('曲谱来源跳转次数过多。','SOURCE_REDIRECT',502);
      const redirect=new URL(location,target).href;
      // A music share may carry its resource ID in a fragment. Preserve that
      // metadata for the caller while still validating every network target.
      const next=normalizePublicUrl(redirect);
      if(!allowed.has(next.hostname.toLowerCase()))throw userError('曲谱跳转到了未获允许的来源，请在原网站打开。','REDIRECT_NOT_ALLOWED',400);
      onRedirect?.(redirect);target=next;continue;
    }
    if(response.statusCode<200||response.statusCode>=300){response.resume();throw Object.assign(userError(response.statusCode===401||response.statusCode===403||response.statusCode===429?'来源要求权限、验证或限制自动访问，请在原网站查看。':'曲谱来源暂时不可访问，请尝试其他版本。','SOURCE_UNAVAILABLE',502),{upstreamStatus:response.statusCode});}
    if(Number(response.headers['content-length'])>maxBytes){response.destroy();throw userError('曲谱文件超过允许大小，请在来源网站查看。','SOURCE_TOO_LARGE',413);}
    const chunks=[];let total=0;
    for await(const chunk of response){total+=chunk.length;if(total>maxBytes){response.destroy();throw userError('曲谱文件超过允许大小，请在来源网站查看。','SOURCE_TOO_LARGE',413);}chunks.push(chunk);}
    let buffer=Buffer.concat(chunks);const encoding=String(response.headers['content-encoding']||'').toLowerCase();
    try{if(encoding==='gzip')buffer=gunzipSync(buffer,{maxOutputLength:maxBytes});else if(encoding==='deflate')buffer=inflateSync(buffer,{maxOutputLength:maxBytes});else if(encoding==='br')buffer=brotliDecompressSync(buffer,{maxOutputLength:maxBytes});}
    catch{throw userError('来源压缩响应无法安全读取。','SOURCE_ENCODING',502);}
    return {url:target.href,status:response.statusCode,headers:response.headers,buffer};
  }
}
