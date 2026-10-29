// Reflow a public 8-bar piano edition onto two pages; musical content is unchanged.
import {readFile,writeFile} from 'node:fs/promises';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import createModule from '../../.local/omr-benchmark-20261017/tooling/node_modules/verovio/dist/verovio-module.mjs';
import {VerovioToolkit} from '../../.local/omr-benchmark-20261017/tooling/node_modules/verovio/dist/verovio.mjs';
const out='.local/gpt-only-20261017';
let xml=await readFile('.local/omr-benchmark-20261017/03-birthday/source.musicxml','utf8');
xml=xml.replace(/new-system="yes"/g,'').replace(/(<measure number="5"[^>]*>)/,'$1<print new-page="yes"/>');
await writeFile(out+'/source.musicxml',xml);
const tk=new VerovioToolkit(await createModule());
tk.setOptions({inputFrom:'musicxml',pageWidth:2100,pageHeight:1485,scale:40,breaks:'encoded',header:'none',footer:'none',svgViewBox:true,svgHtml5:true});
if(!tk.loadData(xml)||tk.getPageCount()!==2)throw Error('Expected two complete pages');
let heads=0;
for(let page=1;page<=2;page++){
  const svg=tk.renderToSVG(page).replace(/<(path|ellipse|polygon|polyline|rect)(\s)/g,'<$1 stroke="#000"$2');
  heads+=(svg.match(/\sclass="note"/g)||[]).length;
  await writeFile(out+`/page-${page}.svg`,svg);
  const image=await loadImage(Buffer.from(svg)),canvas=createCanvas(1680,Math.round(image.height/image.width*1680)),ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  await writeFile(out+`/page-${page}.png`,canvas.toBuffer('image/png'));
}
tk.destroy();if(heads!==52)throw Error('Missing source notes: '+heads);
console.log(JSON.stringify({pages:2,heads,layoutOnlyChange:true}));
