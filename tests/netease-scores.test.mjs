import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,stat,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {PDFDocument} from 'pdf-lib';
import {parseNeteaseShare,normalizeNeteasePreview,createNeteaseScoreProvider,createNeteaseSessionStore,mergeScorePages} from '../lib/netease-scores.mjs';

const source='https://music.163.com/#/music-sheet?id=143190';
const url=n=>`https://p1.music.126.net/score-${n}.png`;
const complete=(extra={})=>({code:200,data:{title:'接口测试钢琴谱',pageCount:2,pages:[{pageNo:2,url:url(2)},{pageNo:1,url:url(1)}],...extra}});
const loggedIn=()=>({read:async()=>({cookie:'MUSIC_U=unit-test-not-a-real-cookie; __csrf=unit-test'}),clear:async()=>{},save:async()=>{}});
const provider=(options={})=>createNeteaseScoreProvider({sessionStore:loggedIn(),sdk:async()=>({body:complete()}),...options});

export function testPagePng(tint=0){
  // Original synthetic raster fixture; no downloaded or real-song data.
  const crc=buffer=>{let c=0xffffffff;for(const n of buffer){c^=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
  const chunk=(name,data)=>{const type=Buffer.from(name),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,sum]);};
  const width=600,height=800,header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  const raw=Buffer.alloc((width*3+1)*height,255);
  for(let y=0;y<height;y++){raw[y*(width*3+1)]=0;for(let x=0;x<width;x++)if((y>80&&y<650&&y%12===tint%12&&x>45&&x<555)||(x>90+tint&&x<98+tint&&y>100&&y<150)){const offset=y*(width*3+1)+1+x*3;raw.fill(20,offset,offset+3);}}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

test('share text distinguishes song IDs, sheet IDs, hash routes, and rejects other hosts',()=>{
  assert.equal(parseNeteaseShare('钢琴谱 -《幻听》 https://163cn.tv/biOuPTpw (@网易云音乐)').kind,'unresolved');
  assert.equal(parseNeteaseShare('https://music.163.com/#/song?id=12').songId,'12');
  assert.equal(parseNeteaseShare(source).sheetId,'143190');
  assert.equal(parseNeteaseShare('https://y.music.163.com/m/sheet?musicSheetId=42').sheetId,'42');
  for(const link of ['http://music.163.com/song?id=1','https://music.163.com.evil.example/song?id=1','https://127.0.0.1/song?id=1','https://music.163.com:444/song?id=1','hello']){
    assert.throws(()=>parseNeteaseShare(link),{code:'NETEASE_LINK'});
  }
  assert.throws(()=>parseNeteaseShare('https://music.163.com/?url=https%3A%2F%2F127.0.0.1%2F'),{code:'NETEASE_LINK'});
});

test('preview counts, explicit page order and source hosts are verified; covers are not pages',()=>{
  const result=normalizeNeteasePreview(complete());assert.equal(result.integrity.status,'complete');assert.deepEqual(result.pages.map(p=>p.url),[url(1),url(2)]);
  assert.equal(normalizeNeteasePreview(complete({pageCount:7})).integrity.status,'incomplete');
  assert.equal(normalizeNeteasePreview(complete({pageCount:undefined})).integrity.status,'unknown');
  assert.equal(normalizeNeteasePreview(complete({isPreview:true})).integrity.status,'incomplete');
  assert.equal(normalizeNeteasePreview(complete({needPay:1})).integrity.status,'incomplete');
  assert.equal(normalizeNeteasePreview(complete({canRead:'false'})).integrity.status,'incomplete');
  assert.equal(normalizeNeteasePreview(complete({pages:[url(1),url(1)]})).integrity.status,'incomplete');
  assert.equal(normalizeNeteasePreview(complete({pages:[{pageNo:1,url:url(1)},{pageNo:3,url:url(2)}]})).integrity.status,'incomplete');
  assert.throws(()=>normalizeNeteasePreview({data:{coverUrl:url(1)}}),{code:'NETEASE_SCHEMA'});
  assert.throws(()=>normalizeNeteasePreview(complete({pages:['https://example.com/piano.jpg']})),{code:'NETEASE_IMAGE_URL'});
});

test('real preview response layout: page records are directly in data, with pageNumber and sheetId',async()=>{
  // Reconstructed from the user-operated response's redacted shape, with only
  // synthetic URLs/checksums. This is not a downloaded copy of the song.
  const response={code:200,data:[6,5,4,3,2,1].map(number=>({id:100+number,sheetId:143190,url:url(number),md5:'synthetic-checksum',pageNumber:number,size:2000})),message:'success'};
  const p=provider({sdk:async()=>({body:response}),fetcher:async value=>({buffer:testPagePng(Number(value.match(/score-(\d+)\.png/)[1]))})});
  await p.resolveShare('钢琴谱 -《幻听》 '+source,'owner');
  const preview=await p.preview('143190',source,'owner');
  assert.equal(preview.title,'幻听');
  assert.equal(preview.pagesFound,6);assert.deepEqual(preview.pages.map(page=>page.number),[1,2,3,4,5,6]);
  assert.equal(preview.totalPages,null);assert.equal(preview.integrity.status,'unknown');
  const parsed=normalizeNeteasePreview(response);assert.deepEqual(parsed.pages.map(page=>page.url),[1,2,3,4,5,6].map(url));
  await assert.rejects(p.pdf(preview.id,{pianoConfirmed:true},'owner'),{code:'NETEASE_PAGE_COUNT'});
  const imported=await p.pdf(preview.id,{pianoConfirmed:true,confirmedPageCount:6},'owner');
  assert.equal((await PDFDocument.load(imported.buffer)).getPageCount(),6);assert.equal(imported.source.totalPages,6);assert.equal(imported.filename,'幻听.pdf');p.close();
});

test('short-share redirect retains fragment ID without evaluating HTML or fetching arbitrary URLs',async()=>{
  const p=provider({fetcher:async(_url,options)=>{assert.ok(options.allowedHosts.includes('163cn.tv'));options.onRedirect(source);return {url:'https://music.163.com/',buffer:Buffer.from('')};}});
  const found=await p.resolveShare('https://163cn.tv/test','scope');assert.equal(found.sheetId,'143190');p.close();
});

test('catalog total page count blocks a shorter preview even if preview claims to be complete',async()=>{
  const p=provider({sdk:async method=>({body:method==='sheet_list'?{code:200,data:[{id:'143190',title:'测试钢琴谱',pageCount:7}]}:complete()})});
  await p.resolveShare('https://music.163.com/song?id=1','owner');const preview=await p.preview('143190',source,'owner');
  assert.equal(preview.integrity.status,'incomplete');await assert.rejects(p.pdf(preview.id,{pianoConfirmed:true},'owner'),{code:'NETEASE_INCOMPLETE'});p.close();
});

test('complete image bundle becomes a PDF with all pages, original aspect ratio and scoped preview',async()=>{
  const seen=[];const p=provider({fetcher:async(value)=>{seen.push(value);return {buffer:testPagePng(value===url(1)?1:2)};}});
  const view=await p.preview('143190',source,'owner');
  assert.equal(view.pagesFound,2);assert.ok(view.pages.every(page=>page.url.startsWith('/api/netease/imports/')));assert.equal(JSON.stringify(view).includes('MUSIC_U'),false);
  await assert.rejects(p.image(view.id,1,'other'),{code:'NETEASE_IMPORT_EXPIRED'});
  await assert.rejects(p.pdf(view.id,{},'owner'),{code:'NETEASE_PIANO_CONFIRM'});
  const result=await p.pdf(view.id,{pianoConfirmed:true},'owner');
  const pdf=await PDFDocument.load(result.buffer);assert.equal(pdf.getPageCount(),2);assert.ok(Math.abs(pdf.getPage(0).getHeight()/pdf.getPage(0).getWidth()-800/600)<.00001);
  assert.deepEqual(seen,[url(1),url(2)]);assert.equal(result.source.totalPages,2);assert.equal(result.source.completeness,'source-page-count');p.close();
});

test('reimporting identical ordered score pages produces identical PDF bytes for the OMR cache',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,0,1)});
  const images=[1,2].map(tint=>({buffer:testPagePng(tint),mimeType:'image/png'}));
  const first=await mergeScorePages(images);t.mock.timers.tick(4000);
  const second=await mergeScorePages(images);
  assert.equal(second.equals(first),true,'creation timestamps must not force another full OMR run');
  const reversed=await mergeScorePages([...images].reverse());
  assert.equal(reversed.equals(first),false,'page order remains part of the cache identity');
});

test('partial, unknown-count, duplicate bytes, non-image and expired previews cannot silently import as full scores',async()=>{
  let fetched=0;const partial=provider({sdk:async()=>({body:complete({pageCount:7})}),fetcher:async()=>{fetched++;return {buffer:testPagePng()};}});
  const partialView=await partial.preview('143190',source,'a');await assert.rejects(partial.pdf(partialView.id,{pianoConfirmed:true,confirmedPageCount:2},'a'),{code:'NETEASE_INCOMPLETE'});assert.equal(fetched,0);
  const unknown=provider({sdk:async()=>({body:complete({pageCount:undefined})}),fetcher:async value=>({buffer:testPagePng(value===url(1)?1:2)})});
  const u=await unknown.preview('143190',source,'a');await assert.rejects(unknown.pdf(u.id,{pianoConfirmed:true},'a'),{code:'NETEASE_PAGE_COUNT'});
  assert.equal((await unknown.pdf(u.id,{pianoConfirmed:true,confirmedPageCount:2},'a')).source.completeness,'user-verified-page-count');
  const duplicate=provider({fetcher:async()=>({buffer:testPagePng()})});const d=await duplicate.preview('143190',source,'a');await assert.rejects(duplicate.pdf(d.id,{pianoConfirmed:true},'a'),{code:'NETEASE_DUPLICATE'});
  const notImage=provider({fetcher:async()=>({buffer:Buffer.from('<html>login</html>')})});const n=await notImage.preview('143190',source,'a');await assert.rejects(notImage.image(n.id,1,'a'),{code:'NETEASE_IMAGE'});
  let clock=1000;const expired=provider({now:()=>clock});const e=await expired.preview('143190',source,'a');clock+=3600001;await assert.rejects(expired.image(e.id,1,'a'),{code:'NETEASE_IMPORT_EXPIRED'});
  for(const item of [partial,unknown,duplicate,notImage,expired])item.close();
});

test('login persists only verified sessions privately; QR challenge is scoped and logout removes credentials',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'qinban-netease-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const path=join(directory,'login.json'),store=createNeteaseSessionStore(path);let clock=10000;
  const sdk=async method=>method==='login_qr_key'?{body:{code:200,data:{unikey:'test-key-123456'}}}:method==='login_qr_check'?{body:{code:803,cookie:'MUSIC_U=private-unit-fixture; Domain=music.163.com; __csrf=test-csrf;'}}:{body:{data:{profile:{userId:1,nickname:'测试账号'}}}};
  const p=provider({sdk,sessionStore:store,now:()=>clock,qrEncoder:async()=> 'data:image/png;base64,fixture'});
  assert.equal((await p.status()).configured,false);await assert.rejects(p.preview('143190',source,'a'),{code:'NETEASE_LOGIN_REQUIRED'});
  const qr=await p.startLogin('owner');await assert.rejects(p.pollLogin(qr.id,'other'),{code:'NETEASE_QR_EXPIRED'});
  const result=await p.pollLogin(qr.id,'owner');assert.deepEqual(result,{state:'authorized',nickname:'测试账号'});assert.equal(JSON.stringify(result).includes('private-unit-fixture'),false);
  assert.equal((await stat(path)).mode&0o777,0o600);assert.equal((await stat(directory)).mode&0o777,0o700);
  const saved=JSON.parse(await readFile(path));assert.equal(saved.cookie,'MUSIC_U=private-unit-fixture; __csrf=test-csrf');assert.equal((await p.status()).configured,true);
  await p.logout();await assert.rejects(readFile(path),{code:'ENOENT'});assert.equal((await p.status()).configured,false);p.close();
});

test('cancelled QR does not accept a late authorization and unsafe errors do not expose upstream bodies',async()=>{
  const p=provider({sdk:async method=>{if(method==='login_qr_key')return {body:{data:{unikey:'test-key-123456'}}};throw new Error('secret-cookie-upstream');},qrEncoder:async()=>''});
  const qr=await p.startLogin('a');p.cancelLogin(qr.id,'a');await assert.rejects(p.pollLogin(qr.id,'a'),{code:'NETEASE_QR_EXPIRED'});
  await assert.rejects(p.preview('143190',source,'a'),error=>error.public&&!error.message.includes('secret-cookie'));p.close();
});

test('PDF packer rejects thumbnail-sized or corrupt pictures',async()=>{
  await assert.rejects(mergeScorePages([{buffer:Buffer.from('broken'),mimeType:'image/jpeg'}]),{code:'NETEASE_IMAGE'});
});

test('direct data arrays require page identity and reject a different sheet ID',async()=>{
  assert.throws(()=>normalizeNeteasePreview({code:200,data:[{url:url(1),name:'cover'}]}),{code:'NETEASE_SCHEMA'});
  const p=provider({sdk:async()=>({body:{code:200,data:[{sheetId:123,url:url(1),pageNumber:1}]}})});
  await assert.rejects(p.preview('143190',source,'owner'),{code:'NETEASE_SHEET_MISMATCH'});p.close();
});

test('known NetEase CDN HTTP addresses are upgraded to HTTPS without changing signed paths or queries',()=>{
  const result=normalizeNeteasePreview({code:200,data:[{sheetId:1,pageNumber:1,url:'http://p1.music.126.net/score.png?param=original&signature=fixture'}]});
  assert.equal(result.pages[0].url,'https://p1.music.126.net/score.png?param=original&signature=fixture');
  assert.throws(()=>normalizeNeteasePreview({data:[{sheetId:1,pageNumber:1,url:'https://evil.example/private-score.png?signature=not-for-logs'}]}),error=>error.code==='NETEASE_IMAGE_URL'&&error.message.includes('evil.example')&&!error.message.includes('private-score')&&!error.message.includes('not-for-logs'));
});

test('temporary CDN failure retries once, while permission failures are not retried',async()=>{
  let attempts=0;const p=provider({fetcher:async()=>{if(++attempts===1)throw Object.assign(new Error('temporary CDN'),{code:'SOURCE_UNAVAILABLE',upstreamStatus:503});return {buffer:testPagePng()};}});
  const view=await p.preview('143190',source,'owner');await p.image(view.id,1,'owner');assert.equal(attempts,2);p.close();
  let denied=0;const q=provider({fetcher:async()=>{denied++;throw Object.assign(new Error('denied'),{code:'SOURCE_UNAVAILABLE',upstreamStatus:403});}});
  const other=await q.preview('143190',source,'owner');await assert.rejects(q.image(other.id,1,'owner'));assert.equal(denied,1);q.close();
});

test('current musicSheetSimpleInfoVOS response exposes piano identity and authoritative page count',async()=>{
 const p=provider({sdk:async method=>({body:method==='sheet_list'?{code:200,data:{musicSheetSimpleInfoVOS:[{id:180911,name:'钢琴谱',type:[{code:1,name:'钢琴'}],totalPageSize:2}]}}:{code:200,data:[{sheetId:180911,pageNumber:1,url:url(1)},{sheetId:180911,pageNumber:2,url:url(2)}]}})});
 const list=await p.resolveShare('https://music.163.com/song?id=29129889','current-schema');assert.equal(list.sheets[0].pianoEvidence,true);assert.equal(list.sheets[0].pages,2);
 const preview=await p.preview('180911',list.sourceUrl,'current-schema');assert.equal(preview.totalPages,2);assert.equal(preview.integrity.status,'complete');p.close();
});
