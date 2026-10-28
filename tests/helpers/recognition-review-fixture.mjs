import {build} from 'esbuild';

export function reviewJob() {
  return {
    id:'review-ui-fixture',status:'needs-review',engine:'pi',totalPages:2,
    metadata:{title:'双手练习曲 · 界面测试',tempo:96,timeSignature:[4,4],keySignature:0},
    regions:[1,2].map(page=>({id:`row-${page}`,page,system:1,rect:{x:20,y:40,width:800,height:220},pageWidth:1000,pageHeight:1400,image:true,status:'needs-review',result:{
      score:{id:`score-${page}`,title:'双手练习曲',tempo:96,timeSignature:[4,4],durationBeats:4,notes:[{id:'r',midi:72,beat:0,duration:2,hand:'right',voice:'right-1'},{id:'r2',midi:74,beat:2,duration:2,hand:'right',voice:'right-1'},{id:'l',midi:48,beat:0,duration:4,hand:'left',voice:'left-1'}]},
      positions:[{noteId:'r',x:160,y:105,coordinateSpace:'page'},{noteId:'r2',x:480,y:95,coordinateSpace:'page'},{noteId:'l',x:160,y:205,coordinateSpace:'page'}],
      coverage:{complete:false,measureCount:1,measureDurations:[4]},rests:[],continuity:{tieIn:[],tieOut:[]},
      sourceHeadAudit:{detected:4,mapped:3,unmapped:[{id:'head',x:450,y:130,staff:1}],reviewed:false},
      tieAudit:{unresolved:[{description:'核对原谱乐句线',noteIds:['r','r2']}],reviewed:false},
    }})),
  };
}

// Mock only PDF rasterization/source detection. The production review UI,
// validators, assembly and event handlers are bundled unchanged.
export async function reviewBundle() {
  const result=await build({stdin:{contents:`export {mountFullScoreImport} from './src/full-score-import.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'ReviewUI',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env':JSON.stringify({BASE_URL:'/'}),'import.meta.url':JSON.stringify('http://localhost:8792/src/full-score-import.js')},logLevel:'silent',plugins:[{name:'fixture-pdf',setup(b){
    b.onResolve({filter:/^pdfjs-dist$/},()=>({path:'pdf',namespace:'fixture'}));
    b.onResolve({filter:/^\.\/score-image\.js$/},()=>({path:'image',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='pdf'?`
      export const GlobalWorkerOptions={};
      export function getDocument(){return {promise:Promise.resolve({numPages:2,getPage:async()=>({getViewport:({scale})=>({width:1000*scale,height:1400*scale}),render:()=>({promise:Promise.resolve()}),cleanup(){}})}),destroy(){}}}
    `:`export async function prepareScoreImage(){return {width:1600,height:2240,systems:[],layout:{systems:[]},assessment:{hasGrandStaff:true,message:'界面测试谱面'},destroy(){}}};export function mountScoreImageSelector(){return {destroy(){}}}` }));
  }}]});
  return result.outputFiles[0].text;
}

export const sourceSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="220" viewBox="0 0 800 220"><rect width="800" height="220" fill="white"/><g stroke="#34483d">${[65,75,85,95,105,155,165,175,185,195].map(y=>`<path d="M25 ${y}H775"/>`).join('')}<path d="M25 65V195M775 65V195M400 65V195"/></g><g fill="#34483d"><ellipse cx="140" cy="65" rx="9" ry="6"/><ellipse cx="460" cy="55" rx="9" ry="6"/><ellipse cx="140" cy="165" rx="10" ry="6"/></g><g stroke="#34483d"><path d="M148 65V25M468 55V15M132 165V205"/></g><text x="30" y="36" font-size="16" fill="#2b796b">双手练习曲 · 界面测试</text></svg>`;
