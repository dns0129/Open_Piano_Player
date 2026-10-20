import {validateScoreDocument} from './score-document.ts';
import { validateScore } from './score.mjs';
export const validCloudId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(id);
export function validateCloudBundle(input) {
  const document=input?.document?validateScoreDocument(input.document):undefined;
  const score=validateScore(document||input?.score);
  if(document&&input.score?.id!==undefined&&input.score.id!==document.id)throw new Error('发布文档与乐谱 ID 不一致。');
  if(!validCloudId(score.id))throw new Error('云端曲目 ID 格式无效。');
  const assets=(input.assets||[]).map(asset=>{
    if(!validCloudId(asset.id)||!['image/png','image/jpeg','image/webp'].includes(asset.mimeType)||typeof asset.data!=='string'||asset.data.length>16*1024*1024||!asset.data.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data))throw new Error('原谱图片格式或大小无效。');
    return {id:asset.id,page:asset.page,system:asset.system,mimeType:asset.mimeType,data:asset.data};
  });
  let sourceNotation=null;
  if(input.sourceNotation){
    const n=input.sourceNotation;
    if(!n.systems?.length||!Array.isArray(n.notes))throw new Error('原谱结构无效。');
    const ids=new Set(assets.map(a=>a.id));
    sourceNotation={...n,systems:n.systems.map(s=>{
      const assetId=s.assetId||s.id;
      if(!ids.has(assetId))throw new Error('缺少完整的原谱图片。');
      return {...s,assetId,imageUrl:''};
    })};
  }else if(assets.length)throw new Error('原谱图片缺少对应的谱面结构。');
  return {version:1,score,...(document?{document}:{}),sourceNotation,assets,reviewStatus:input.reviewStatus||{},warnings:(input.warnings||[]).filter(w=>typeof w==='string').slice(0,100)};
}
export const cloudEntry = bundle => ({...(bundle.score.instrument?{instrument:bundle.score.instrument}:{}),id:bundle.score.id,title:bundle.score.title,composer:bundle.score.composer,tempo:bundle.score.tempo,timeSignature:bundle.score.timeSignature,keySignature:bundle.score.keySignature,notes:bundle.score.notes.length,hasOriginal:Boolean(bundle.sourceNotation),sourceLabel:bundle.score.source?.label || '',sourceUrl:bundle.score.source?.url || '',license:bundle.score.source?.license || '',...(bundle.score.source?.kind==='full-score-agent-approved'?{reviewApproved:true}:{}),reviewRequired:bundle.score.source?.reviewRequired===true||bundle.score.source?.kind==='full-score-ai-draft',file:`scores/${bundle.score.id}.json`});
