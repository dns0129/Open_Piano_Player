import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountNeteaseImport} from '../src/netease-import.js';

const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
test('paste -> edition -> all-page preview -> PDF handoff, retaining manual completeness/piano gates',async t=>{
  const dom=new JSDOM('<div id="host"></div>',{url:'http://127.0.0.1:8793'});const previous=globalThis.File;globalThis.File=dom.window.File;t.after(()=>{globalThis.File=previous;dom.window.close();});
  const host=dom.window.document.querySelector('#host'),calls=[];let imported;
  const request=async(path,body)=>{calls.push({path,body});if(path.endsWith('/status'))return {configured:true};if(path.endsWith('/resolve'))return {kind:'song',sourceUrl:'https://music.163.com/song?id=1',sheets:[{id:'2',title:'<img src=x onerror=alert(1)> 测试钢琴谱',instrument:'钢琴'}]};if(path.endsWith('/preview'))return {id:'fixture',title:'测试钢琴谱',pagesFound:2,totalPages:null,integrity:{status:'unknown',reasons:['总页数未知']},pages:[1,2].map(number=>({number,url:'/test-'+number+'.png'}))};if(path.endsWith('/pdf'))return {blob:new Blob(['%PDF-fixture']),filename:'测试钢琴谱.pdf',source:{totalPages:2}};throw new Error('Unexpected '+path);};
  const ui=mountNeteaseImport(host,{request,onImport:(file,source)=>{imported={file,source};}});await ui.ready;
  const textarea=host.querySelector('[data-share]');textarea.value='分享 https://music.163.com/song?id=1';textarea.dispatchEvent(new dom.window.Event('input'));
  host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await flush();assert.equal(calls.find(call=>call.path.endsWith('/resolve')).body.share,textarea.value);
  assert.equal(host.querySelector('.nsi-editions img'),null);host.querySelector('[data-sheet-index]').click();await flush();
  assert.equal(host.querySelectorAll('.nsi-pages img').length,2);assert.equal(host.querySelector('[data-action="import"]').disabled,true);
  const checkbox=host.querySelector('[data-piano]');checkbox.checked=true;checkbox.dispatchEvent(new dom.window.Event('change'));assert.equal(host.querySelector('[data-action="import"]').disabled,true);
  const count=host.querySelector('[data-page-count]');count.value='2';count.dispatchEvent(new dom.window.Event('input'));assert.equal(host.querySelector('[data-action="import"]').disabled,false);
  host.querySelector('[data-action="import"]').click();await flush();assert.equal(imported.file.type,'application/pdf');assert.equal(imported.source.totalPages,2);ui.destroy();assert.equal(host.children.length,0);
});

test('login-required response offers login and never advances to recognition',async t=>{
  const dom=new JSDOM('<div id="host"></div>');t.after(()=>dom.window.close());const host=dom.window.document.querySelector('#host');
  const ui=mountNeteaseImport(host,{request:async path=>path.endsWith('/status')?{configured:false}:Promise.reject(Object.assign(new Error('请先登录网易云'),{code:'NETEASE_LOGIN_REQUIRED'})),onImport:()=>assert.fail('should not import')});await ui.ready;
  host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await flush();assert.match(host.textContent,/请先登录网易云/);assert.equal(host.querySelector('[data-action="login"]').disabled,false);assert.equal(host.querySelector('[data-action="import"]'),null);ui.destroy();
});

test('failed preview page can be retried individually without discarding successful pages',async t=>{
  const dom=new JSDOM('<div id="host"></div>');t.after(()=>dom.window.close());const host=dom.window.document.querySelector('#host');
  const ui=mountNeteaseImport(host,{request:async path=>path.endsWith('/status')?{configured:true}:path.endsWith('/resolve')?{kind:'sheet',sheetId:'2',sourceUrl:'https://music.163.com/sheet?id=2'}:{id:'fixture',title:'测试',pagesFound:2,totalPages:2,integrity:{status:'complete',reasons:[]},pages:[1,2].map(number=>({number,url:'/page-'+number}))}});await ui.ready;
  host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await flush();
  const images=[...host.querySelectorAll('.nsi-pages img')];images[1].dispatchEvent(new dom.window.Event('load'));images[0].dispatchEvent(new dom.window.Event('error'));
  const retry=host.querySelector('[data-retry-page]');assert.ok(retry,'failed page must offer a retry');retry.click();
  assert.equal(host.querySelectorAll('.nsi-pages img')[1],images[1],'successful page must not be replaced');
  assert.match(images[0].src,/retry=/);images[0].dispatchEvent(new dom.window.Event('load'));
  assert.equal(host.querySelector('[data-image-errors]').textContent,'');ui.destroy();
});
