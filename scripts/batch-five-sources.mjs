import {mkdir,writeFile,access} from 'node:fs/promises';
import {createNeteaseScoreProvider} from '../lib/netease-scores.mjs';
const root='.local/batch-five-20261018';await mkdir(root,{recursive:true});
const entries=[['merry','Merry Christmas Mr. Lawrence','https://163cn.tv/biSpHIi7'],['eutopia','Eutopia','https://163cn.tv/biSp0tUq'],['sudi','天龙八部之宿敌','https://163cn.tv/biSqvgtL'],['ifyou','IF YOU','https://163cn.tv/biSp8xiy'],['golden','golden hour','https://163cn.tv/biSqltsE']];
await Promise.all(entries.map(async([key,title,url])=>{const provider=createNeteaseScoreProvider(),scope='batch-five-'+key;try{
 const resolved=await provider.resolveShare('《'+title+'》 '+url,scope);await mkdir(root+'/'+key,{recursive:true});await writeFile(root+'/'+key+'/resolved.json',JSON.stringify(resolved,null,2));
 const selected=resolved.kind==='sheet'?resolved.sheetId:resolved.sheets.find(s=>s.pianoEvidence)?.id;
 if(!selected){console.log(JSON.stringify({key,title,resolved,status:'NO_PIANO_SHEET'}));return;}
 const preview=await provider.preview(selected,resolved.sourceUrl,scope);await writeFile(root+'/'+key+'/preview.json',JSON.stringify(preview,null,2));
 for(const p of preview.pages){if(await access(root+'/'+key+'/page-'+p.number+'.png').then(()=>true,()=>false)||await access(root+'/'+key+'/page-'+p.number+'.jpg').then(()=>true,()=>false))continue;const image=await provider.image(preview.id,p.number,scope);await writeFile(root+'/'+key+'/page-'+p.number+(image.mimeType==='image/png'?'.png':'.jpg'),image.buffer);}
 console.log(JSON.stringify({key,title,pages:preview.pagesFound,integrity:preview.integrity,sheetId:selected,status:'DOWNLOADED'}));
 }catch(e){await writeFile(root+'/'+key+'-error.json',JSON.stringify({code:e.code,message:e.public||e.expose?e.message:'Source request failed'},null,2));console.log(JSON.stringify({key,error:e.code,message:e.public||e.expose?e.message:'Source request failed'}));}finally{provider.close();}}));
