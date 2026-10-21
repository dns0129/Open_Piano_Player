import {fail,id} from './common.mjs';
import {pricedUsage} from './recognition-provider.mjs';
export const utcPeriod=now=>new Date(now).toISOString().slice(0,7);
export const utcDay=now=>new Date(now).toISOString().slice(0,10);
export const ACTIVE_JOB_STATES=['queued','running'];
export const integer=(value,min,max,code='INVALID_POLICY')=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw fail(code,'请输入范围内的整数。');return value};
export const numberRows=(rows,key)=>Number(rows[0]?.[key]||0);

export function createRecognitionBudget({db,now=()=>Date.now(),provider}){
 const date=()=>new Date(now()).toISOString();
 async function lock(tx){return (await tx.query('SELECT * FROM qinban_control.settings WHERE id=1 FOR UPDATE')).rows[0]}
 async function usage(tx,owner,period=utcPeriod(now())){
  const p=(await tx.query('SELECT * FROM qinban_control.settings WHERE id=1')).rows[0],custom=(await tx.query('SELECT task_limit FROM qinban_control.entitlements WHERE owner_id=$1',[owner])).rows[0];
  const used=numberRows((await tx.query('SELECT COUNT(*) AS n FROM qinban_control.job_index WHERE owner_id=$1 AND period=$2 AND slot_released=false',[owner,period])).rows,'n'),limit=custom?.task_limit??p.default_task_limit;
  return {period,limit,used,remaining:Math.max(0,limit-used),unit:'task',resetAt:new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),1)).toISOString()};
 }
 function enabled(p){if(!provider.ready||!p.enabled||p.paused_reason||Number(p.daily_cap)<=0||Number(p.monthly_cap)<=0||Number(p.job_cap)<=0)throw fail('RECOGNITION_UNAVAILABLE','识谱服务暂不可用；已保存的曲谱仍可练习。',503)}
 async function totals(tx){return (await tx.query('SELECT COALESCE(SUM(cost) FILTER(WHERE day=$1),0) AS day,COALESCE(SUM(cost) FILTER(WHERE month=$2),0) AS month,COUNT(*) FILTER(WHERE state=\'unknown\') AS unknown FROM qinban_control.attempts',[utcDay(now()),utcPeriod(now())])).rows[0]}
 async function available(tx,p){if(!provider.ready||!p.enabled||p.paused_reason||Number(p.daily_cap)<=0||Number(p.monthly_cap)<=0||Number(p.job_cap)<=0)return false;const b=await totals(tx);return Number(b.day)<Number(p.daily_cap)&&Number(b.month)<Number(p.monthly_cap)}
 async function admit(tx,owner,jid){
  const p=await lock(tx);enabled(p);const quota=await usage(tx,owner);if(quota.remaining<1)throw fail('TASK_LIMIT','本月任务数已用完，可联系运营调整。',429);
  const active=numberRows((await tx.query("SELECT COUNT(*) AS n FROM qinban_control.job_index WHERE owner_id=$1 AND state IN ('queued','running')",[owner])).rows,'n');if(active)throw fail('TASK_ACTIVE','已有任务正在处理，请等待或先取消。',409);
  if(numberRows((await tx.query("SELECT COUNT(*) AS n FROM qinban_control.job_index WHERE state='queued'")).rows,'n')>=100)throw fail('QUEUE_FULL','当前等待任务较多，请稍后再试。',429);
  const b=await totals(tx);if(Number(b.day)>=Number(p.daily_cap)||Number(b.month)>=Number(p.monthly_cap))throw fail('GLOBAL_BUDGET','今日或本月的识谱服务额度已达到上限，请稍后再试。',429);
  await tx.query("INSERT INTO qinban_control.job_index(id,owner_id,period,state,created_at,updated_at) VALUES($1,$2,$3,'queued',$4,$4)",[jid,owner,quota.period,date()]);
 }
 async function reserve(tx,owner,jid,regionId,quote,workerId){
  const p=await lock(tx);enabled(p);
  const job=(await tx.query('SELECT * FROM qinban_control.job_index WHERE id=$1 AND owner_id=$2 FOR UPDATE',[jid,owner])).rows[0];if(!job||job.worker_id!==workerId||job.state!=='running'||job.cancel_requested)throw fail('JOB_CANCELLED','任务已停止。',409);
  integer(quote.reserved,1,1000000000,'INVALID_QUOTE');
  const b=await totals(tx),jobCost=numberRows((await tx.query('SELECT COALESCE(SUM(cost),0) AS n FROM qinban_control.attempts WHERE job_id=$1',[jid])).rows,'n');
  if(Number(b.day)+quote.reserved>Number(p.daily_cap)||Number(b.month)+quote.reserved>Number(p.monthly_cap)||jobCost+quote.reserved>Number(p.job_cap))throw fail('GLOBAL_BUDGET','本次请求超过可用服务预算，任务已保留。',429);
  const aid=id();await tx.query("INSERT INTO qinban_control.attempts(id,owner_id,job_id,region_id,day,month,state,reserved,cost,rate_card,created_at) VALUES($1,$2,$3,$4,$5,$6,'reserved',$7,$7,$8,$9)",[aid,owner,jid,regionId,utcDay(now()),utcPeriod(now()),quote.reserved,JSON.stringify({...quote.rates,inputBound:quote.inputBound,maxOutputTokens:quote.maxOutputTokens}),date()]);
  await tx.query('UPDATE qinban_control.job_index SET dispatched=dispatched+1,updated_at=$1 WHERE id=$2',[date(),jid]);return aid;
 }
 async function settle(aid,{usage:actual,knownNotStarted=false,observation=null}={}){
  return db.control(async tx=>{await lock(tx);const a=(await tx.query('SELECT * FROM qinban_control.attempts WHERE id=$1 FOR UPDATE',[aid])).rows[0];if(!a||!['reserved','unknown'].includes(a.state))return;
   const cost=knownNotStarted?0:actual?pricedUsage(actual,a.rate_card):Number(a.reserved),state=knownNotStarted?'rejected':actual?'settled':'unknown';integer(cost,0,Number.MAX_SAFE_INTEGER,'INVALID_COST');
   await tx.query('UPDATE qinban_control.attempts SET state=$1,cost=$2,usage=$3,settled_at=$4 WHERE id=$5',[state,cost,actual?JSON.stringify(actual):observation?JSON.stringify({observation}):null,date(),aid]);
   const reason=state==='unknown'?'USAGE_UNKNOWN':cost>Number(a.reserved)?'COST_BOUND_EXCEEDED':'';if(reason)await tx.query('UPDATE qinban_control.settings SET paused_reason=$1,revision=revision+1,updated_at=$2 WHERE id=1',[reason,date()]);return {state,cost};
  });
 }
 async function releaseUnused(tx,jid){
  const charged=numberRows((await tx.query("SELECT COUNT(*) AS n FROM qinban_control.attempts WHERE job_id=$1 AND state<>'rejected'",[jid])).rows,'n');if(!charged)await tx.query('UPDATE qinban_control.job_index SET slot_released=true WHERE id=$1',[jid]);
 }
 return {lock,admit,reserve,settle,releaseUnused,usage,totals,
  async quota(owner){return db.control(async tx=>({...await usage(tx,owner),available:await available(tx,(await tx.query('SELECT * FROM qinban_control.settings WHERE id=1')).rows[0])}))},
  async publicInfo(){return db.control(async tx=>{const p=(await tx.query('SELECT * FROM qinban_control.settings WHERE id=1')).rows[0];return {product:'qinban-commercial',recognitionAvailable:await available(tx,p),announcement:p.announcement,supportContact:p.support_contact,limits:{pages:6,imageMiB:20,pdfMiB:50,regions:30},quotaUnit:'task',billing:'每人按月任务数；无按页或谱行扣次'}})},
  async pause(reason){await db.control(tx=>tx.query('UPDATE qinban_control.settings SET paused_reason=$1,revision=revision+1,updated_at=$2 WHERE id=1',[reason,date()]))},
 };
}
