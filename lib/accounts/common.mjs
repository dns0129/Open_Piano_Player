import {createHash,createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
export const fail=(code,message,status=422)=>Object.assign(new Error(message),{code,status,public:true});
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const hmac=(secret,value)=>createHmac('sha256',secret).update(value).digest('hex');
export function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;return timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function canonical(value){if(value===null||typeof value==='boolean')return JSON.stringify(value);if(typeof value==='number'){if(!Number.isFinite(value))throw fail('INVALID_DATA','数据包含无效数字。');return JSON.stringify(value)}if(typeof value==='string'){if(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))throw fail('INVALID_DATA','数据包含无效字符。');return JSON.stringify(value)}if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';throw fail('INVALID_DATA','数据类型无效。')}
export const digest=value=>sha(canonical(value));
export const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const id=()=>randomUUID();
export const iso=value=>value instanceof Date?value.toISOString():new Date(value).toISOString();
export const missing=()=>fail('NOT_FOUND','内容不存在或无权访问。',404);
export function emailKey(value){if(typeof value!=='string')throw fail('INVALID_EMAIL','请输入邮箱。');const email=value.trim().toLowerCase();if(email.length>254||!/^[-a-z0-9.!#$%&'*+/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email))throw fail('INVALID_EMAIL','请输入有效邮箱。');return email}
export async function audit(tx,owner,action,target,now){await tx.query('INSERT INTO qinban_private.audit VALUES($1,$2,$3,$4,$5)',[id(),owner,action,target,now]);}
