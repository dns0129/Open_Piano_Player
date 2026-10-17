import test from 'node:test';
import assert from 'node:assert/strict';
import {createInternationalScoreProviders,parseImslpPianoPreviews,parseImslpPianoEditions,parseMutopiaCatalogue} from '../lib/international-scores.mjs';
import {createScoreSearch,searchWeb} from '../lib/public-library.mjs';

const mutopiaTable=(instrument='Piano',title='Für Elise')=>`<table class="table-bordered result-table"><tr><td>${title}</td><td>by L. V. Beethoven (1770–1827)</td><td>WoO 59</td><td></td></tr><tr><td>for ${instrument}</td><td>1810</td><td>Classical</td><td></td></tr><tr><td>Breitkopf &amp; Härtel, 1888</td><td><a href="../legal.html">Public Domain</a></td><td><a href="piece-info.cgi?id=931">More Information</a></td><td></td></tr><tr><td><a href="https://www.mutopiaproject.org/ftp/Beethoven/elise.mid">.mid file</a></td><td><a href="https://www.mutopiaproject.org/ftp/Beethoven/elise-a4.pdf">A4 .pdf file</a></td></tr></table>`;
const previewBlock=(id,{section='Piano Study',edition='For Piano (Editor)',license='Public Domain',image='sheet'+id}={})=>`<h4>${section}</h4><h5>${edition}</h5><div class="we"><div id="IMSLP${id}"><a href="/wiki/File:Study_${id}.pdf">#${id}</a> - 0.2MB, 7 pp.</div><table><tr><th>Copyright</th><td>${license}</td></tr></table><div class="we_thumb"><a href="/wiki/File:Study_${id}.pdf"><img data-src="//cdn.imslp.org/images/thumb/pdfs/ab/${image}.png" width="600"></a></div></div>`;
const imslpPage=body=>`<h1 id="firstHeading">Piano Study (Beethoven, Ludwig van)</h1><h2>Sheet Music</h2>${body}`;
function pngHeader(width,height){const data=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(data);data.writeUInt32BE(width,16);data.writeUInt32BE(height,20);return data;}
const provider=(query,id)=>createInternationalScoreProviders(query).filter(p=>p.id===id);

test('Mutopia reads actual piano instrument and licence fields and rejects voice, duet and piano photos',()=>{
  const page='https://www.mutopiaproject.org/cgibin/make-table.cgi?searchingfor=Elise';
  const rows=parseMutopiaCatalogue(mutopiaTable()+mutopiaTable('Voice and Piano')+mutopiaTable('Piano Duet')+'<img alt="Elise piano" src="/piano-photo.jpg">',page);
  assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.format),['pdf','midi']);assert.ok(rows.every(r=>r.pianoSourceVerified&&r.instrumentation==='piano'));assert.equal(rows[0].composer,'L. V. Beethoven (1770–1827)');assert.equal(rows[0].license,'Public Domain');assert.equal(rows[0].sourceUrl,'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=931');assert.match(rows[0].instrumentEvidence,/乐器字段：for Piano/);
  assert.equal(parseMutopiaCatalogue(mutopiaTable().replaceAll('https://www.mutopiaproject.org/ftp/Beethoven/','https://127.0.0.1/private/'),page).length,0);
});
test('IMSLP retains each excerpt, edition, page count and regional licence while excluding other instruments and four hands',()=>{
  const html=imslpPage(previewBlock('123',{section:'Flight of the Bumblebee (Act III)',edition:'For Piano (Rachmaninoff)',license:'Creative Commons Attribution Share Alike 3.0 - Non-PD US'})+previewBlock('456',{edition:'For Violin and Piano'})+previewBlock('789',{edition:'For 2 Pianos'})+previewBlock('999',{edition:'For Piano 4 hands'}));
  const rows=parseImslpPianoPreviews(html,'https://imslp.org/wiki/Work');assert.equal(rows.length,1);const row=rows[0];assert.equal(row.title,'Flight of the Bumblebee (Act III)');assert.equal(row.composer,'Beethoven, Ludwig van');assert.equal(row.edition,'For Piano (Rachmaninoff)');assert.match(row.license,/Non-PD US/);assert.equal(row.pageCount,7);assert.equal(row.page,1);assert.equal(row.preview,true);assert.equal(row.pianoSourceVerified,true);assert.match(row.instrumentEvidence,/For Piano \(Rachmaninoff\)/);assert.ok(row.url.startsWith('https://cdn.imslp.org/'));
});
test('original solo piano scores use the Instrumentation field without granting piano identity to orchestral arrangements',()=>{
  const original=imslpPage(previewBlock('10',{section:'Scores',edition:'Complete'}).replace('<h5>Complete</h5>','<h4>Complete</h4>')+previewBlock('20',{section:'Arrangements and Transcriptions',edition:'For Orchestra (Editor)'}))+'<table><tr><th>Instrumentation</th><td>piano</td></tr></table>';
  const rows=parseImslpPianoEditions(original,'https://imslp.org/wiki/Piano_Study');
  assert.equal(rows.length,1);assert.equal(rows[0].imslpId,'10');assert.equal(rows[0].format,'web');assert.match(rows[0].title,/Piano Study/);assert.equal(rows[0].pianoSourceVerified,true);assert.match(rows[0].instrumentEvidence,/Instrumentation/);
});
test('multiple file cards share only their own edition metadata and retain separate file pages',()=>{
  const html=imslpPage('<h4>Piano Study</h4><h5>For Piano (Editor)</h5><div class="we"><div id="IMSLP10"><a href="/wiki/File:Study_10.pdf">#10</a> - 0.2MB, 3 pp.</div><div id="IMSLP11"><a href="/wiki/File:Study_11.pdf">#11</a> - 0.2MB, 4 pp.</div><table><tr><th>Copyright</th><td>CC BY 4.0</td></tr></table></div>');
  const rows=parseImslpPianoEditions(html,'https://imslp.org/wiki/Work');assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row.pageCount),[3,4]);assert.ok(rows.every(row=>row.license==='CC BY 4.0'&&row.format==='web'));
});
test('edition file pages do not expose cover-only PDFs or braille/source archives as piano staff scores',()=>{
  const html=imslpPage('<h4>Piano Study</h4><h5>For Piano (Editor)</h5><div class="we"><div id="IMSLP10"><a href="/wiki/File:Study.pdf">#10</a> - 3 pp.</div><div id="IMSLP11"><a href="/wiki/File:Study_colorcover.pdf">#11</a> - 1 pp.</div><div id="IMSLP12"><a href="/wiki/File:Study.brf">#12</a></div><div id="IMSLP13"><a href="/wiki/File:Study.zip">#13</a></div></div>');
  assert.deepEqual(parseImslpPianoEditions(html,'https://imslp.org/wiki/Study').map(row=>row.imslpId),['10']);
});
test('international providers retain real query scope and exclude low resolution thumbnails without inventing enlarged URLs',async()=>{
  const requested=[];
  const result=await searchWeb('Piano Study',{providers:provider('Piano Study','imslp-piano'),cache:new Map(),fetcher:async url=>{
    requested.push(url);return {buffer:url.includes('/api.php')?Buffer.from(JSON.stringify({query:{search:[{ns:0,title:'Piano Study'}]}})):url.includes('/wiki/')?Buffer.from(imslpPage(previewBlock('1')+previewBlock('2'))):pngHeader(url.includes('sheet1')?180:1130,url.includes('sheet1')?240:1600)};
  }});
  assert.equal(result.results.length,2);const image=result.results.find(row=>row.format==='image'),web=result.results.find(row=>row.format==='web');assert.equal(image.imslpId,'2');assert.equal(image.imageWidth,1130);assert.equal(web.imslpId,'1');assert.match(web.url,/\/wiki\/File:/);assert.match(result.providerStatuses[0].message,/排除 1 张低清/);assert.equal(result.scope,'site');assert.ok(requested.filter(url=>url.includes('cdn.imslp.org')).every(url=>/sheet[12]\.png$/.test(url)));
});
test('known piano PDF is independently validated and stays available if the subsequent general API stalls',async()=>{
  const queries=[];
  const result=await searchWeb('野蜂飞舞',{providers:provider('野蜂飞舞','imslp-piano'),providerTimeoutMs:80,totalTimeoutMs:300,cache:new Map(),fetcher:async url=>{
    queries.push(url);if(url.includes('bnf.cn2.imslp.org'))return {buffer:Buffer.from('%PDF-1.4\nverified fixture')};
    await new Promise(resolve=>setTimeout(resolve,140));return {buffer:Buffer.from('{"query":{"search":[]}}')};
  }});
  assert.equal(result.results.length,1);const row=result.results[0];assert.equal(row.format,'pdf');assert.equal(row.pianoSourceVerified,true);assert.equal(row.preview,false);assert.equal(row.pageCount,7);assert.match(row.license,/Non-PD US/);assert.match(row.edition,/Yeung/);assert.ok(queries.some(url=>url.includes('api.php')));assert.equal(result.providerStatuses[0].status,'ok');
});
test('HTML validation pages cannot be returned as piano PDFs and wrong artist constraints do not invoke a known edition',async()=>{
  const seen=[];
  const result=await searchWeb('野蜂飞舞 周杰伦',{providers:provider('野蜂飞舞 周杰伦','imslp-piano'),cache:new Map(),fetcher:async url=>{seen.push(url);return {buffer:Buffer.from('{"query":{"search":[]}}')};}});
  assert.equal(result.results.length,0);assert.ok(!seen.some(url=>url.includes('bnf.cn2')));
  const html=await searchWeb('野蜂飞舞',{providers:provider('野蜂飞舞','imslp-piano'),cache:new Map(),fetcher:async url=>({buffer:Buffer.from(url.includes('bnf.cn2')?'<title>Bot Check</title>':'{"query":{"search":[]}}')})});assert.equal(html.results.length,0);
});
test('international PDF result uses the existing session-bound registered download route',async()=>{
  const pdf=Buffer.from('%PDF-1.4\npublic fixture'),requests=[];
  const fetcher=async url=>{requests.push(url);return {url,headers:{'content-type':url.includes('bnf.cn2')?'application/pdf':'application/json'},buffer:url.includes('bnf.cn2')?pdf:Buffer.from('{"query":{"search":[]}}')};};
  const service=createScoreSearch({fetcher,searchEngine:(query,options)=>searchWeb(query,{...options,providers:provider(query,'imslp-piano'),cache:new Map()})});
  const report=await service.search('野蜂飞舞','session'),row=report.results[0];assert.equal(row.importable,true);assert.ok(row.downloadUrl.startsWith('/api/import-score?id='));
  const download=await service.download(row.id,'session');assert.equal(download.format,'pdf');assert.deepEqual(download.buffer,pdf);assert.equal(download.source.instrumentation,'piano');assert.equal(download.source.pianoSourceVerified,true);await assert.rejects(()=>service.download(row.id,'other'),error=>error.code==='SEARCH_RESULT_EXPIRED');
});
