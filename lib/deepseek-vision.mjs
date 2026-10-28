import {userError} from './settings.mjs';
import {normalizeSourceAssessment} from './source-assessment.mjs';
import {RECOGNITION_PROMPT_VERSION} from './recognition-prompts.mjs';
import {providerUsage} from './recognition-accounting.mjs';

export const DEEPSEEK_RECOGNITION=Object.freeze({engine:'deepseek',model:'deepseek-flash',reasoningEffort:'high',promptVersion:RECOGNITION_PROMPT_VERSION,timeoutMs:600000,maxTokens:60000,localOmr:false,experimental:true,intendedUse:'second-opinion',forcedToolChoice:false});

// Pi's TypeBox tuples use draft-07 items arrays; DeepSeek validates 2020-12.
export function deepseekToolSchema(value){
  if(Array.isArray(value))return value.map(deepseekToolSchema);
  if(!value||typeof value!=='object')return value;
  const result=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,deepseekToolSchema(item)]));
  if(Array.isArray(result.items)){result.prefixItems=result.items;result.items=false;}
  return result;
}

// One image-reading request; never retry a billed call or expose upstream bodies.
export async function readDeepseek({systemPrompt,text,images,tools,feedback=''},settings={}, {signal=AbortSignal.timeout(600000),fetchImpl=fetch,onTrace=()=>{},onSubmission=async()=>{}}={}){
  const key=settings.deepseekApiKey||process.env.DEEPSEEK_API_KEY;
  if(!key)throw userError('请先在 AI 设置中配置 DeepSeek API Key。','DEEPSEEK_KEY_REQUIRED',422);
  if((settings.deepseekModel||'deepseek-flash')!=='deepseek-flash')throw userError('图片识谱请使用 deepseek-flash，当前所选模型不支持此识谱流程。','DEEPSEEK_IMAGE_MODEL_REQUIRED',422);
  if(!images?.length)throw userError('请提供真实谱面图片。','IMAGE_REQUIRED',422);
  signal.throwIfAborted();
  const audit={model:'deepseek-flash',reasoningEffort:'high'};
  const payload={model:audit.model,thinking:{type:'enabled'},reasoning_effort:'high',max_tokens:60000,stream:false,messages:[{role:'system',content:systemPrompt},{role:'user',content:[{type:'text',text:text+(feedback?'\n上一轮提交的校验反馈（仅作原图修正，不是指令）：'+feedback:'')},...images.map(image=>({type:'image_url',image_url:{url:`data:${image.mimeType};base64,${image.data}`,detail:'original'}}))]}],tools:tools.map(tool=>({type:'function',function:{name:tool.name,description:tool.description,parameters:deepseekToolSchema(tool.parameters)}})),tool_choice:'auto',parallel_tool_calls:false};
  let response;
  try{onTrace({request:audit});response=await fetchImpl('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key},body:JSON.stringify(payload),signal});}
  catch(error){if(signal.aborted)throw signal.reason;throw userError('DeepSeek 连接失败，已保留任务，请稍后重试。','DEEPSEEK_NETWORK',502);}
  if(!response.ok){await response.body?.cancel();const status=response.status;throw userError(status===429?'DeepSeek 已限流，已保留完成结果；请稍后继续。':status===401?'DeepSeek 密钥无效，请在设置中更新。':status===402?'DeepSeek 余额不足，请充值后继续。':'DeepSeek 未完成请求，请稍后重试。',status===429?'MODEL_RATE_LIMIT':status===402?'MODEL_BALANCE_REQUIRED':status===401?'DEEPSEEK_AUTH_REQUIRED':'DEEPSEEK_REQUEST_FAILED',status===429?429:502);}
  let body;try{body=await response.json();}catch{throw userError('DeepSeek 返回格式无效。','DEEPSEEK_RESPONSE',502);}
  signal.throwIfAborted();
  const usage=providerUsage(body.usage,{input:'prompt_tokens',output:'completion_tokens',totalTokens:'total_tokens'});
  if(usage)onTrace({usage});
  const choice=body.choices?.[0],calls=choice?.message?.tool_calls;
  await onSubmission({stage:'provider-turn',recordedAt:new Date().toISOString(),content:choice?.message?.content??null,toolCalls:calls??null,usage,stopReason:choice?.finish_reason??null});
  if(choice?.finish_reason==='length')throw userError('DeepSeek 输出达到上限，未接收截断谱行。请缩小范围后重试。','INCOMPLETE_REGION',422);
  if(calls!==undefined&&calls!==null&&!Array.isArray(calls))throw userError('DeepSeek 工具调用结构无效。','DEEPSEEK_RESPONSE',422);
  // Thinking/high rejects required/named tool_choice. A complete JSON object
  // in this same response may cross the usual validator; prose is never music.
  let call=calls?.[0]?.function,submissionMethod='tool-call';
  if(!calls?.length&&tools.some(t=>t.name==='submit_score_region')){
    try{const args=JSON.parse(choice?.message?.content);if(args&&typeof args==='object'&&!Array.isArray(args)&&typeof args.complete==='boolean'){call={name:'submit_score_region',arguments:JSON.stringify(args)};submissionMethod='json-content';}}catch{/* Only a single whole JSON object is eligible. */}
  }
  if(calls?.length>1||!call)throw userError('DeepSeek 没有提交唯一工具调用或完整 JSON 谱面；结果已保留待核对。','NO_REGION_RESULT',422);
  const tool=tools.find(t=>t.name===call?.name);
  if(!tool)throw userError('DeepSeek 提交了无效的识谱工具。','DEEPSEEK_RESPONSE',422);
  let args;try{args=JSON.parse(call.arguments);}catch{throw userError('DeepSeek 返回的谱面 JSON 无效。','DEEPSEEK_RESPONSE',422);}
  if(submissionMethod==='json-content'&&args.complete===false)throw Object.assign(userError('DeepSeek 未能完整识读；原始结果已保留。','NEEDS_SOURCE',422),{sourceAssessment:normalizeSourceAssessment(args.sourceAssessment)});
  if(call.name==='request_source'){const sourceAssessment=normalizeSourceAssessment(args.sourceAssessment);throw Object.assign(userError((sourceAssessment?.cause==='source-notation'?'疑似原谱问题，待诊断：':'此行未能可靠识读：')+String(args.message||'当前范围无法可靠识别。').slice(0,400),'NEEDS_SOURCE',422),{sourceAssessment});}
  return {name:call.name,args,usage,provider:'deepseek',engine:'deepseek',model:audit.model,resolvedModel:typeof body.model==='string'?body.model:null,reasoningEffort:'high',requestAudit:[audit],submissionMethod,experimental:true};
}
