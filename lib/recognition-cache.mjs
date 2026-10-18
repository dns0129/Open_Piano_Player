import {createHash,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {RECOGNITION_PROMPT_VERSION} from './recognition-prompts.mjs';

// Source identity includes the musical context and exact crop. Titles are labels.
export const CACHE_VERSION='reviewed-source-v2';
export function recognitionCacheKey(metadata,region,policy={model:'gpt-6.1-sol',reasoningEffort:'high'}){
 return createHash('sha256').update(JSON.stringify([CACHE_VERSION,policy.model,policy.reasoningEffort,policy.promptVersion??RECOGNITION_PROMPT_VERSION,region.image?.sha256,metadata.timeSignature??null,metadata.keySignature??null,metadata.tempo??null,region.page,region.system,region.rect,region.pageWidth,region.pageHeight,region.measureCount??null,region.context||''])).digest('hex');
}
export const recognitionCacheScope=auth=>createHash('sha256').update(auth.sessionId?'session:'+auth.sessionId:'token:'+auth.token).digest('hex');
export function createReviewedRegionCache(directory){
 const file=(scope,key)=>join(directory,scope+'-'+key+'.json');
 return {
  async get(scope,key){try{const value=JSON.parse(await readFile(file(scope,key),'utf8'));return value.version===CACHE_VERSION&&value.key===key?value:null;}catch{return null;}},
  async put(scope,key,value){await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);const path=file(scope,key),temp=path+'.'+randomBytes(6).toString('hex')+'.tmp';await writeFile(temp,JSON.stringify({version:CACHE_VERSION,key,...value}),{mode:0o600});await rename(temp,path);},
 };
}
