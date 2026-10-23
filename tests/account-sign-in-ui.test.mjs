import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import {webcrypto} from 'node:crypto';
import {until} from './app-harness.mjs';

async function bootAccountPage(t,url){
 const bundle=await build({entryPoints:['src/accounts/page.js'],bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env':'{}'},logLevel:'silent'});
 const navigations=[],virtualConsole=new VirtualConsole();
 virtualConsole.on('jsdomError',e=>{if(/navigation/i.test(e.message))navigations.push(e.message);});
 const dom=new JSDOM('<!doctype html><html><body><div id="account-app"></div></body></html>',{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole}),w=dom.window;
 t.after(()=>w.close());
 Object.defineProperty(w,'crypto',{value:webcrypto});Object.assign(w,{TextEncoder,TextDecoder,Response,AbortController});
 const requests=[];
 w.fetch=async(path,options={})=>{
  const body=options.body?JSON.parse(options.body):undefined;requests.push({path:String(path),method:options.method||'GET',body});
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  if(path==='/api/v1/auth/context')return reply(200,{csrfToken:'login-csrf',profile:'local-validation'});
  if(path==='/api/v1/session')return reply(401,{code:'SESSION_REQUIRED',message:'请先登录账号。'});
  if(path==='/api/v1/auth/code')return reply(202,{challengeId:'challenge-1',retryAfterSeconds:60,expiresAt:new Date(Date.now()+600000).toISOString()});
  if(path==='/api/v1/auth/verify')return reply(200,{user:{id:'u1',email:body.code&&'new@example.test',state:'active',role:'user'},sessionId:'s1',csrfToken:'session-csrf',isNewAccount:true});
  if(String(path).startsWith('/api/v1/library/entries'))return reply(200,{records:[]});
  if(path==='/api/v1/sessions')return reply(200,{sessions:[]});
  if(path==='/api/v1/source-groups')return reply(200,{groups:[]});
  return reply(404,{code:'NOT_FOUND'});
 };
 w.eval(bundle.outputFiles[0].text);
 const doc=w.document;
 await until(()=>doc.querySelector('[data-login]'),'登录卡片应出现');
 return {w,doc,requests,navigations};
}

test('the two-step login card focuses each step, accepts a pasted code and returns to the requesting page',async t=>{
 const {w,doc,requests,navigations}=await bootAccountPage(t,'http://127.0.0.1:8793/account.html?next=%2Frecognition.html');
 assert.match(doc.querySelector('.login-card h1').textContent,/登录后继续/);
 assert.equal(doc.querySelector('[data-login] select'),null,'不再要求选择「用途」');
 await until(()=>doc.activeElement===doc.querySelector('[data-login] input[name=email]'),'邮箱输入框应自动获得焦点');

 const form=doc.querySelector('[data-login]');form.querySelector('[name=email]').value='new@example.test';form.requestSubmit();
 await until(()=>doc.querySelector('[data-verify]'),'应进入输入验证码这一步');
 assert.deepEqual(requests.find(r=>r.path==='/api/v1/auth/code').body,{email:'new@example.test',purpose:'login'});
 assert.equal(doc.querySelector('[data-login]'),null,'邮箱表单不再与验证码表单叠在一起');
 assert.match(doc.querySelector('.login-card').textContent,/new@example\.test/);
 const code=doc.querySelector('[data-verify] input[name=code]');
 assert.equal(doc.activeElement,code,'验证码输入框应自动获得焦点');
 assert.match(doc.querySelector('[data-resend]').textContent,/秒后可重新发送/);
 assert.equal(doc.querySelector('[data-resend]').disabled,true);

 code.value='6057 6537';code.dispatchEvent(new w.Event('input',{bubbles:true}));
 await until(()=>requests.some(r=>r.path==='/api/v1/auth/verify'),'输满 8 位后应自动提交');
 assert.deepEqual(requests.find(r=>r.path==='/api/v1/auth/verify').body,{challengeId:'challenge-1',code:'60576537'});
 await until(()=>navigations.length>0,'登录后应返回发起登录的页面');
});

test('without a return page, a first sign-in confirms registration',async t=>{
 const {doc,w}=await bootAccountPage(t,'http://127.0.0.1:8793/account.html');
 assert.match(doc.querySelector('.login-card h1').textContent,/登录或注册/);
 await until(()=>!doc.querySelector('.account-busy')?.textContent,'初始加载完成');
 const form=doc.querySelector('[data-login]');form.querySelector('[name=email]').value='new@example.test';form.requestSubmit();
 await until(()=>doc.querySelector('[data-verify]'),'应进入输入验证码这一步');
 const code=doc.querySelector('[data-verify] input[name=code]');code.value='60576537';code.dispatchEvent(new w.Event('input',{bubbles:true}));
 await until(()=>/注册完成/.test(doc.querySelector('.account-message')?.textContent||''),'首次登录应提示注册完成');
 assert.ok(doc.querySelector('[data-logout]'),'登录后显示账号面板');
 await until(()=>!doc.querySelector('.account-busy')?.textContent,'页面处理完毕');
});

test('switching back to the window keeps what was typed on the sign-in card',async t=>{
 const {w,doc,requests}=await bootAccountPage(t,'http://127.0.0.1:8793/account.html');
 await until(()=>!doc.querySelector('.account-busy')?.textContent,'初始加载完成');
 const input=doc.querySelector('[data-login] [name=email]');input.value='typed@example.test';input.dispatchEvent(new w.Event('input',{bubbles:true}));
 const before=requests.length;w.dispatchEvent(new w.Event('focus'));
 await until(()=>requests.length>before,'回到窗口时检查登录状态');
 await new Promise(r=>setTimeout(r,50));
 assert.equal(doc.querySelector('[data-login] [name=email]').value,'typed@example.test');
});
