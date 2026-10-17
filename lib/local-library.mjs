import {readdir,readFile,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {validateScore} from './score.mjs';

const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id);
const missing = () => Object.assign(new Error('本机曲库中没有这份已校对乐谱。'),{status:404,code:'SCORE_NOT_FOUND',public:true});

// Completed job.json and its images are the durable source of truth. Never expose
// task tokens, unfinished transcriptions, or unconfirmed scope to other browsers.
export function createLocalLibrary({directory=resolve('.local/full-score-jobs')}={}) {
  async function read(id) {
    if(!validId(id))throw missing();
    let job;
    try { job=JSON.parse(await readFile(join(directory,id,'job.json'),'utf8')); }
    catch(error) { if(error.code==='ENOENT')throw missing();throw error; }
    const result=job.result;
    if(job.id!==id || job.status!=='complete' || job.needsUserScopeConfirmation
      || result?.reviewStatus!=='human-confirmed' || result.checks?.passed!==true
      || !job.regions?.length || !job.regions.every(r=>r.status==='confirmed')
      || !result.sourceNotation?.systems?.length)throw missing();
    const score=validateScore({...result.score,source:{...result.score.source,
      kind:result.scope?.completeDocument===false?'pdf-excerpt-reviewed':'full-pdf-reviewed'}});
    if(score.id!==`full-score-${id}`)throw missing();
    for(const system of result.sourceNotation.systems) {
      const region=job.regions.find(r=>r.id===system.id);
      if(!validId(system.id)||!region?.image || !['image/png','image/jpeg','image/webp'].includes(region.image.mimeType))throw missing();
      if(!(await stat(join(directory,id,`${system.id}.image`))).size)throw missing();
    }
    return {job,score};
  }
  return {
    async list() {
      let ids;
      try { ids=await readdir(directory); }catch(error){if(error.code==='ENOENT')return {scores:[],warnings:[]};throw error;}
      const scores=[],warnings=[];
      for(const id of ids.filter(validId))try {
        const {job,score}=await read(id);
        scores.push({jobId:id,score,updatedAt:job.updatedAt});
      }catch(error){if(error.code!=='SCORE_NOT_FOUND')warnings.push(`任务 ${id} 的曲库文件未能读取。`);}
      scores.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return {scores,warnings};
    },
    async source(id) {
      const {job,score}=await read(id);
      return {score,notation:{...job.result.sourceNotation,systems:job.result.sourceNotation.systems.map(s=>({...s,
        imageUrl:`/api/local-library/${id}/images/${s.id}`}))},warnings:job.result.warnings||[]};
    },
    async image(id,regionId) {
      const {job}=await read(id);
      if(!validId(regionId)||!job.result.sourceNotation.systems.some(s=>s.id===regionId))throw missing();
      return {buffer:await readFile(join(directory,id,`${regionId}.image`)),mimeType:job.regions.find(r=>r.id===regionId).image.mimeType};
    },
  };
}
