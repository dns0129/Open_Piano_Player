import {userError} from './settings.mjs';

export const DEEPSEEK_RECOGNITION=Object.freeze({engine:'deepseek',model:'deepseek-flash',reasoningEffort:'high',timeoutMs:600000,maxTokens:60000,localOmr:false});

// Pi's TypeBox tuples use draft-07 items arrays; DeepSeek validates 2020-12.
export function deepseekToolSchema(value){
  if(Array.isArray(value))return value.map(deepseekToolSchema);
  if(!value||typeof value!=='object')return value;
  const result=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,deepseekToolSchema(item)]));
  if(Array.isArray(result.items)){result.prefixItems=result.items;result.items=false;}
  return result;
}

// One image-reading request; never retry a billed call or expose upstream bodies.
export async function readDeepseek({systemPrompt,text,images,tools},settings={}, {signal=AbortSignal.timeout(600000),fetchImpl=fetch,onTrace=()=>{}}={}){
  const key=settings.deepseekApiKey||process.env.DEEPSEEK_API_KEY;
  if(!key)throw userError('请先在 AI 设置中配置 DeepSeek API Key。','DEEPSEEK_KEY_REQUIRED',422);
  if((settings.deepseekModel||'deepseek-flash')!=='deepseek-flash')throw userError('图片识谱请使用 deepseek-flash，当前所选模型不支持此识谱流程。','DEEPSEEK_IMAGE_MODEL_REQUIRED',422);
  if(!images?.length)throw userError('请提供真实谱面图片。','IMAGE_REQUIRED',422);
  signal.throwIfAborted();
  const audit={model:'deepseek-flash',reasoningEffort:'high'};
  const payload={model:audit.model,thinking:{type:'enabled'},reasoning_effort:'high',max_tokens:60000,stream:false,messages:[{role:'system',content:systemPrompt},{role:'user',content:[{type:'text',text},...images.map(image=>({type:'image_url',image_url:{url:`data:${image.mimeType};base64,${image.data}`,detail:'original'}}))]}],tools:tools.map(tool=>({type:'function',function:{name:tool.name,description:tool.description,parameters:deepseekToolSchema(tool.parameters)}})),tool_choice:'auto',parallel_tool_calls:false};
  let response;
  try{onTrace({request:audit});response=await fetchImpl('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key},body:JSON.stringify(payload),signal});}
  catch(error){if(signal.aborted)throw signal.reason;throw userError('DeepSeek 连接失败，已保留任务，请稍后重试。','DEEPSEEK_NETWORK',502);}
  if(!response.ok){await response.body?.cancel();const status=response.status;throw userError(status===429?'DeepSeek 已限流，已保留完成结果；请稍后继续。':status===401?'DeepSeek 密钥无效，请在设置中更新。':status===402?'DeepSeek 余额不足，请充值后继续。':'DeepSeek 未完成请求，请稍后重试。',status===429?'MODEL_RATE_LIMIT':status===402?'MODEL_BALANCE_REQUIRED':status===401?'DEEPSEEK_AUTH_REQUIRED':'DEEPSEEK_REQUEST_FAILED',status===429?429:502);}
  let body;try{body=await response.json();}catch{throw userError('DeepSeek 返回格式无效。','DEEPSEEK_RESPONSE',502);}
  signal.throwIfAborted();
  const reported=body.usage;
  const usage=reported?{input:reported.prompt_tokens||0,output:reported.completion_tokens||0,totalTokens:reported.total_tokens||0}:null;
  if(usage)onTrace({usage});
  const choice=body.choices?.[0],calls=choice?.message?.tool_calls;
  if(choice?.finish_reason==='length')throw userError('DeepSeek 输出达到上限，未接收截断谱行。请缩小范围后重试。','INCOMPLETE_REGION',422);
  if(!Array.isArray(calls)||calls.length!==1)throw userError('DeepSeek 没有提交唯一完整的结构化谱面，未导入结果。','NO_REGION_RESULT',422);
  const call=calls[0]?.function,tool=tools.find(t=>t.name===call?.name);
  if(!tool)throw userError('DeepSeek 提交了无效的识谱工具。','DEEPSEEK_RESPONSE',422);
  let args;try{args=JSON.parse(call.arguments);}catch{throw userError('DeepSeek 返回的谱面 JSON 无效。','DEEPSEEK_RESPONSE',422);}
  if(call.name==='request_source')throw userError('需要清晰谱面：'+String(args.message||'当前范围无法可靠识别。').slice(0,400),'NEEDS_SOURCE',422);
  return {name:call.name,args,usage,provider:'deepseek',engine:'deepseek',model:audit.model,resolvedModel:typeof body.model==='string'?body.model:null,reasoningEffort:'high',requestAudit:[audit]};
}
