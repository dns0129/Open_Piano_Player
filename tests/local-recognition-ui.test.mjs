import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';

// Polls instead of a fixed delay; the bundle boots slowly when the whole suite runs in parallel.
async function until(check,message){for(const end=Date.now()+5000;!check();){if(Date.now()>end)assert.fail(message);await new Promise(r=>setTimeout(r,10));}}

async function boot(t){
 const bundle=await build({entryPoints:['src/app.js'],bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env':JSON.stringify({BASE_URL:'/',VITE_STATIC_SITE:'0',VITE_HOSTED_SITE:'0'})},logLevel:'silent'});
 const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{url:'http://127.0.0.1:8792/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 t.after(()=>w.close());Object.defineProperty(w,'crypto',{value:webcrypto});Object.assign(w,{structuredClone,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,Response,AbortController,AbortSignal});w.indexedDB=new IDBFactory();w.IDBKeyRange=IDBKeyRange;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};
 w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:text=>({width:String(text).length*8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2})});
 const requests=[];w.fetch=async path=>{requests.push(String(path));return Response.json(String(path).endsWith('/api/status')?{csrfToken:'fixture-csrf',pi:{available:false},fullScore:{pi:{ready:false},deepseek:{ready:false}}}:{records:[],scores:[],warnings:[]})};
 w.eval(bundle.outputFiles[0].text);await until(()=>w.document.querySelector('[data-fullscore-jobs]')&&requests.some(p=>p.endsWith('/api/library')),'练习室应完成启动和曲库同步');
 return {w,doc:w.document,requests};
}

test('local practice UI exposes original recognition, image/PDF import and task recovery',async t=>{
 const {w,doc,requests}=await boot(t);
 assert.ok(doc.querySelector('[data-fullscore-jobs]'),'原有识谱任务入口必须可见');assert.ok(doc.querySelector('[data-settings]'),'识谱设置入口必须保留');
 doc.querySelector('[data-upload]').click();assert.ok(doc.querySelector('[data-import-local]'),'导入菜单应提供图片/PDF来源');assert.match(doc.querySelector('.modal').textContent,/PDF、乐谱图片/);assert.match(doc.querySelector('#file-input').accept,/\.pdf/);assert.match(doc.querySelector('#file-input').accept,/\.png/);
 doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));doc.querySelector('[data-fullscore-jobs]').click();await until(()=>doc.querySelector('[data-restore-fullscore]'),'识谱任务列表应打开');assert.equal(doc.querySelector('.modal h2').textContent,'整谱识别任务');assert.ok(doc.querySelector('[data-restore-fullscore]'));
 assert.equal(requests.some(p=>p.includes('/api/v1/')||p.includes('/api/generate')),false,'打开入口和历史列表不能开始识谱或切到商业账号');
});

test('startup lists the library once and does not look up an original for the built-in exercise',async t=>{
 const {requests}=await boot(t);await new Promise(r=>setTimeout(r,200));
 assert.equal(requests.filter(p=>p.endsWith('/api/library')).length,1,'启动时曲库列表只应请求一次');
 assert.equal(requests.some(p=>p.includes('/api/library/records/')),false,'内置练习曲没有原谱，不应查询');
});
