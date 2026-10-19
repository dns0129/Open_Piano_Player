import {spawn} from 'node:child_process';
import {validCloudId,validateCloudBundle,cloudEntry} from './cloud-library-format.mjs';
const REPO='dns0129/Open_Piano_Player';
const BASE='public/cloud-library/';
const failure=(message,code='CLOUD_UNAVAILABLE',status=503)=>Object.assign(new Error(message),{code,status,public:true});
// gh owns the owner's existing login. No token is sent to the web client or stored here.
export function githubGateway({repository=REPO}={}) {
  async function request(path,{method='GET',body,raw=false}={}) {
    return new Promise((resolve,reject)=>{
      const args=['api',`repos/${repository}/${path}`,'--method',method];
      if(raw)args.push('-H','Accept: application/vnd.github.raw+json');
      if(body)args.push('--input','-');
      const child=spawn('gh',args,{stdio:['pipe','pipe','pipe']});let output='',size=0;
      const timer=setTimeout(()=>{child.kill();reject(failure('云端请求超时，请稍后重试。'));},45000);timer.unref();
      child.stdout.on('data',chunk=>{size+=chunk.length;if(size>100*1024*1024){child.kill();reject(failure('曲目包超过大小上限。'));}else output+=chunk;});
      child.stderr.resume();
      child.on('error',()=>{clearTimeout(timer);reject(failure('云端管理需要本机安装并登录 GitHub CLI。'));});
      child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(failure('云端请求失败，请检查 GitHub 登录、仓库写入权限及网络。'));try{resolve(raw?output:JSON.parse(output));}catch{reject(failure('云端返回内容无效。'));}});
      child.stdin.on('error',()=>{});child.stdin.end(body?JSON.stringify(body):undefined);
    });
  }
  return {request,read:async(path,ref='main')=>{
    try{const response=await fetch(`https://raw.githubusercontent.com/${repository}/${ref}/${BASE}${path}`,{signal:AbortSignal.timeout(45000),headers:{'Cache-Control':'no-cache'}});if(!response.ok)throw new Error('fetch failed');return await response.json();}
    catch{throw failure('云端曲库暂时无法访问，请检查网络后重试。');}
  }};
}
export function createCloudLibrary({gateway=githubGateway()}={}) {
  let queue=Promise.resolve();
  const locked=fn=>{const task=queue.catch(()=>{}).then(fn);queue=task;return task;};
  async function manifest(ref) {
    const data=await gateway.read('index.json',ref);
    if(data.version!==1||!Array.isArray(data.scores)||data.scores.some(s=>!validCloudId(s.id)||s.file!==`scores/${s.id}.json`))throw failure('云端曲库目录格式无效。');
    return data;
  }
  async function commitChange(id,bundle) {
    if(!validCloudId(id))throw failure('曲目 ID 无效。','INVALID_SCORE_ID',422);
    return locked(async()=>{
      const head=await gateway.request('git/ref/heads/main'),sha=head.object.sha;
      const index=await manifest(sha),existing=index.scores.find(s=>s.id===id);
      if(!bundle&&!existing)throw failure('云端曲库中没有这首曲子。','CLOUD_SCORE_NOT_FOUND',404);
      index.scores=index.scores.filter(s=>s.id!==id);
      index.deletedIds=[...new Set([...(index.deletedIds||[]).filter(x=>x!==id),...(!bundle?[id]:[])])];
      if(bundle)index.scores.push(cloudEntry(bundle));
      index.scores.sort((a,b)=>a.id.localeCompare(b.id));index.updatedAt=new Date().toISOString();
      const parent=await gateway.request(`git/commits/${sha}`);
      const tree=[{path:BASE+'index.json',mode:'100644',type:'blob',content:JSON.stringify(index,null,2)+'\n'}];
      if(bundle)tree.push({path:BASE+`scores/${id}.json`,mode:'100644',type:'blob',content:JSON.stringify(bundle)+'\n'});
      else tree.push({path:BASE+`scores/${id}.json`,mode:'100644',type:'blob',sha:null});
      const createdTree=await gateway.request('git/trees',{method:'POST',body:{base_tree:parent.tree.sha,tree}});
      const commit=await gateway.request('git/commits',{method:'POST',body:{message:`${bundle?'Publish':'Remove'} cloud score ${id}`,tree:createdTree.sha,parents:[sha]}});
      // Non-force ref update rejects concurrent changes instead of dropping them.
      await gateway.request('git/refs/heads/main',{method:'PATCH',body:{sha:commit.sha,force:false}});
      return {id,commit:commit.sha,published:Boolean(bundle),deleted:!bundle,deployment:'pending',message:'云端 main 已更新；公开网页等待 Pages 发布。'};
    });
  }
  return {
    list:()=>manifest(),
    async download(id){if(!validCloudId(id))throw failure('曲目 ID 无效。','INVALID_SCORE_ID',422);const index=await manifest();if(!index.scores.some(s=>s.id===id))throw failure('云端曲库中没有这首曲子。','CLOUD_SCORE_NOT_FOUND',404);const bundle=validateCloudBundle(await gateway.read(`scores/${id}.json`));if(bundle.score.id!==id)throw failure('云端曲目 ID 不一致。');return bundle;},
    async publish(input){const bundle=validateCloudBundle(input);return commitChange(bundle.score.id,bundle);},
    remove:id=>commitChange(id,null),
  };
}
