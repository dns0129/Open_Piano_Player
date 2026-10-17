import {spawn} from 'node:child_process';
import {access,mkdir,readFile,writeFile,readdir,rename,chmod,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const cacheRoot=join(project,'.local','audiveris-cache');
const parser=join(project,'scripts','audiveris-extract.py');
const failure=(message,code='AUDIVERIS_FAILED')=>Object.assign(new Error(message),{code,status:422,expose:true});
const available=async(path,mode=constants.R_OK)=>access(path,mode).then(()=>true,()=>false);
const safeProgress=(fn,value)=>{try{Promise.resolve(fn?.(value)).catch(()=>{});}catch{}};
const pending=new Map();
export function audiverisProfile(value='basic'){
  if(!['basic','piano-v3','piano-triplets-v3'].includes(value))throw failure('本机识谱配置无效。','AUDIVERIS_PROFILE');
  const constants=value==='basic'?[]:['smallHeads','smallBeams',...(value==='piano-triplets-v3'?['implicitTuplets']:[])];
  return {id:value,args:constants.flatMap(name=>['-constant',`org.audiveris.omr.sheet.ProcessingSwitches.${name}=true`])};
}

async function configuration(){
  const configured=process.env.QINBAN_AUDIVERIS_PATH;
  const target=resolve(configured||join(project,'.local','tools','Audiveris.app'));
  const app=target.endsWith('.app')?target:target.includes('.app/Contents/')?target.slice(0,target.indexOf('.app/Contents/')+4):null;
  if(app){
    const java=join(app,'Contents','runtime','Contents','Home','bin','java'),jars=join(app,'Contents','app');
    if(await available(java,constants.X_OK)&&await available(join(jars,'audiveris.jar'))){
      let version='';try{version=(await readFile(join(jars,'Audiveris.cfg'),'utf8')).match(/jpackage\.app-version=([^\s]+)/)?.[1]||'';}catch{}
      return {command:java,args:['-Djava.awt.headless=true','-Dfile.encoding=UTF-8',`-Duser.home=${join(project,'.local','omr-home')}`,'--add-exports=java.desktop/sun.awt.image=ALL-UNNAMED','--enable-native-access=ALL-UNNAMED','-Xms128m','-Xmx3G','-cp',join(jars,'*'),'Audiveris'],version};
    }
  }
  if(configured&&await available(target,constants.X_OK))return {command:target,args:[],version:null};
  return null;
}

export async function audiverisStatus(){
  const config=await configuration();
  return {available:Boolean(config),engine:'audiveris',...(config?.version?{version:config.version}:{}),message:config?'本机 Audiveris 光学识谱可用；无需模型额度，结果仍需逐行校对。':'本机尚未安装 Audiveris；可通过 QINBAN_AUDIVERIS_PATH 配置官方程序。'};
}

async function python(){
  const configured=process.env.QINBAN_PYTHON_PATH;
  if(configured){if(!await available(configured,constants.X_OK))throw failure('配置的 Python 不可执行。','AUDIVERIS_PYTHON_UNAVAILABLE');return configured;}
  const bundled=join(process.env.USERPROFILE||process.env.HOME||'','.cache','codex-runtimes','codex-primary-runtime','dependencies','python','bin','python3');
  return await available(bundled,constants.X_OK)?bundled:'python3';
}

/** Spawn without a shell; cancellation kills only this invocation's process group. */
function run(command,args,{signal,timeoutMs=30000,onLine}={}){
  signal?.throwIfAborted();
  return new Promise((resolveRun,rejectRun)=>{
    const child=spawn(command,args,{cwd:project,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
    let transcript='',tail='',aborted=false,killTimer;
    const kill=()=>{aborted=true;try{process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGTERM');}catch{}
      killTimer=setTimeout(()=>{try{process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGKILL');}catch{}},1200);killTimer.unref();};
    const timer=setTimeout(kill,timeoutMs);timer.unref();
    signal?.addEventListener('abort',kill,{once:true});
    const collect=chunk=>{const value=chunk.toString('utf8');transcript=(transcript+value).slice(-4*1024*1024);tail+=value;const lines=tail.split(/\r?\n/);tail=lines.pop();for(const line of lines)onLine?.(line);};
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    const cleanup=()=>{clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',kill);};
    child.on('error',error=>{cleanup();rejectRun(Object.assign(failure('无法启动本机识谱程序。','AUDIVERIS_EXEC'),{cause:error}));});
    child.on('close',code=>{cleanup();if(aborted)rejectRun(signal?.aborted?signal.reason:failure('本机识谱超时，已停止此任务。','AUDIVERIS_TIMEOUT'));
      else if(code!==0)rejectRun(Object.assign(failure('本机识谱程序未正常完成，请检查原谱清晰度或尝试其他版本。','AUDIVERIS_PROCESS'),{diagnostic:transcript}));
      else resolveRun(transcript);});
  });
}

function validateInput(input){
  const pdf=input?.originalPdf?.buffer;
  if(!Buffer.isBuffer(pdf)||pdf.length>50*1024*1024||!pdf.subarray(0,1024).includes(Buffer.from('%PDF-')))throw failure('请提供50MB以内的完整原始PDF。','AUDIVERIS_PDF_REQUIRED');
  if(!Array.isArray(input.regions)||!input.regions.length||input.regions.length>1000)throw failure('缺少待识别的完整谱行清单。','AUDIVERIS_REGION_REQUIRED');
  const ids=new Set(),locations=new Set();
  for(const region of input.regions){
    const location=`${region.page}:${region.system}`;
    if(typeof region.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(region.id)||ids.has(region.id)||locations.has(location)||!Number.isInteger(region.page)||region.page<1||region.page>200||!Number.isInteger(region.system)||region.system<1||!Number.isFinite(region.pageWidth)||!Number.isFinite(region.pageHeight)||region.pageWidth<=0||region.pageHeight<=0||!region.rect||!['x','y','width','height'].every(key=>Number.isFinite(region.rect[key]))||region.rect.x<0||region.rect.y<0||region.rect.width<=0||region.rect.height<=0||region.rect.x+region.rect.width>region.pageWidth+1e-5||region.rect.y+region.rect.height>region.pageHeight+1e-5)throw failure('谱行页码、序号、页面像素尺寸或裁切坐标缺失/重复。','AUDIVERIS_REGION_REQUIRED');
    ids.add(region.id);locations.add(location);
  }
  return createHash('sha256').update(pdf).digest('hex');
}

/** Parse already-produced artifacts; exported for deterministic coordinate tests. */
export async function extractAudiverisArtifacts(input,{omrPath,mxlPath,logPath,signal,onProgress,outputDirectory}={}){
  validateInput(input);signal?.throwIfAborted();
  const folder=outputDirectory||join(cacheRoot,'mapping-'+randomBytes(10).toString('hex'));
  await mkdir(folder,{recursive:true,mode:0o700});await chmod(folder,0o700);
  const requestPath=join(folder,'mapping-input.json'),outputPath=join(folder,'mapping-output.json');
  await writeFile(requestPath,JSON.stringify({metadata:input.metadata||{},regions:input.regions,totalPages:input.totalPages,excludedPages:input.excludedPages||[]}),{mode:0o600});
  safeProgress(onProgress,{stage:'mapping',progress:.94,message:'正在将MusicXML音符逐一定位到原PDF音头，并核对全部谱页/谱行。'});
  const args=[parser,'--omr',resolve(omrPath),'--mxl',resolve(mxlPath),'--input',requestPath,'--output',outputPath,...(logPath?['--log',resolve(logPath)]:[])];
  let processError;try{await run(await python(),args,{signal,timeoutMs:60000});}catch(error){processError=error;}
  if(signal?.aborted)throw signal.reason;
  let result;try{result=JSON.parse(await readFile(outputPath,'utf8'));}catch{throw processError||failure('无法读取光学识谱的音符映射结果。','AUDIVERIS_MAPPING');}
  if(result.error)throw failure(result.error.message,result.error.code);
  if(processError)throw processError;
  safeProgress(onProgress,{stage:'complete',progress:1,message:`已处理${result.checks.pageCount}页、${result.checks.systemCount}条谱行；请逐行对照校对。`});
  return result;
}

async function prepareArtifacts(input,sha,{signal,onProgress,profile}){
  const folder=join(cacheRoot,profile.id==='basic'?sha:`${sha}-${profile.id}`),manifestPath=join(folder,'artifacts.json');
  await mkdir(folder,{recursive:true,mode:0o700});await chmod(folder,0o700);
  try{
    const cached=JSON.parse(await readFile(manifestPath,'utf8'));
    if(cached.sha256===sha&&(cached.profile||'basic')===profile.id&&await available(join(folder,cached.omr))&&await available(join(folder,cached.mxl))){safeProgress(onProgress,{stage:'cached',progress:.9,message:'复用相同PDF及识谱配置的本机OMR结果；重新校验当前全部谱行。'});return {folder,omrPath:join(folder,cached.omr),mxlPath:join(folder,cached.mxl),logPath:join(folder,'diagnostics.log')};}
  }catch{}
  const config=await configuration();if(!config)throw failure('本机Audiveris尚未安装，请配置官方程序后重试。','AUDIVERIS_UNAVAILABLE');
  await mkdir(join(project,'.local','omr-home'),{recursive:true,mode:0o700});
  const work=join(folder,'work-'+randomBytes(8).toString('hex'));await mkdir(work,{recursive:true,mode:0o700});
  const pdfPath=join(work,'document.pdf');await writeFile(pdfPath,input.originalPdf.buffer,{mode:0o600});
  const pages=Math.max(...input.regions.map(region=>region.page));
  safeProgress(onProgress,{stage:'recognizing',page:1,progress:.02,message:'Audiveris正在本机识别全部PDF页；不会使用ChatGPT额度。'});
  let diagnostic='';
  try{
    diagnostic=await run(config.command,[...config.args,'-batch',...profile.args,'-transcribe','-export','-output',work,'--',pdfPath],{signal,timeoutMs:Math.min(30*60*1000,Math.max(180000,pages*90000)),onLine:line=>{
      const page=Number(line.match(/document#(\d+)/)?.[1]);if(!page)return;
      const step=line.match(/StepMonitoring[^|]*\|\s*(\w+)/)?.[1];
      if(step)safeProgress(onProgress,{stage:'recognizing',page,progress:Math.min(.9,.03+.86*(page-1)/pages),message:`正在识别第${page}/${pages}页：${step}`});
    }});
    const files=await readdir(work),omr=files.find(name=>name.endsWith('.omr')),mxl=files.find(name=>name.endsWith('.mxl'));
    if(!omr||!mxl)throw failure('Audiveris未生成完整的OMR和MusicXML文件。','AUDIVERIS_OUTPUT_MISSING');
    await rename(join(work,omr),join(folder,'document.omr'));await rename(join(work,mxl),join(folder,'document.mxl'));
    await writeFile(join(folder,'diagnostics.log'),diagnostic,{mode:0o600});
    await writeFile(manifestPath,JSON.stringify({sha256:sha,profile:profile.id,version:config.version,omr:'document.omr',mxl:'document.mxl',createdAt:new Date().toISOString()}),{mode:0o600});
    return {folder,omrPath:join(folder,'document.omr'),mxlPath:join(folder,'document.mxl'),logPath:join(folder,'diagnostics.log')};
  }catch(error){if(error.diagnostic)await writeFile(join(folder,'last-error.log'),error.diagnostic,{mode:0o600});throw error;}
  finally{await rm(work,{recursive:true,force:true});}
}

export async function recognizeAudiverisDocument(input,{signal,onProgress}={}){
  const sha=validateInput(input),profile=audiverisProfile(input.omrProfile),cacheKey=`${sha}:${profile.id}`;signal?.throwIfAborted();
  // Calls for the same PDF share neither cancellation nor mappings: a cancelled
  // owner finishes cleanup before a later caller reuses/restarts recognition.
  const before=pending.get(cacheKey)||Promise.resolve();
  const task=before.catch(()=>{}).then(()=>{signal?.throwIfAborted();return prepareArtifacts(input,sha,{signal,onProgress,profile});});pending.set(cacheKey,task);
  task.finally(()=>{if(pending.get(cacheKey)===task)pending.delete(cacheKey);}).catch(()=>{});
  let artifacts;
  if(!signal)artifacts=await task;
  else{
    let abort;try{artifacts=await Promise.race([task,new Promise((_,reject)=>{abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();})]);}
    finally{signal.removeEventListener('abort',abort);}
  }
  const outputDirectory=join(artifacts.folder,'mapping-'+randomBytes(8).toString('hex'));
  return extractAudiverisArtifacts(input,{...artifacts,outputDirectory,signal,onProgress});
}
