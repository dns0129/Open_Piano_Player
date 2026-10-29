import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
const dir = "evidence/omr-vs-sol-high-20261017",
  r = JSON.parse(await readFile(dir + "/results.json"));
if (!r.complete) throw Error("Cannot publish incomplete results");
const out = "output/识谱对照实验-20261017";
await mkdir(out, { recursive: true });
await cp(dir, out + "/data", {
  recursive: true,
  filter: (src) => !src.endsWith("/progress.json"),
});
await rm(out + "/data/progress.json", { force: true });
for (const row of r.rows) {
  const folder = out + "/samples/" + row.id;
  await mkdir(folder, { recursive: true });
  for (const f of [
    "input.pdf",
    "source.mxl",
    "source.musicxml",
    "reference.json",
    "reference-initial.json",
  ])
    await cp(
      ".local/omr-benchmark-20261017/" + row.id + "/" + f,
      folder + "/" + f,
    );
  for (const p of row.source.pages)
    await cp(
      ".local/omr-benchmark-20261017/" + row.id + "/" + p.path,
      folder + "/" + p.path,
    );
  for (const e of ["omr", "ai-high"])
    await cp(
      ".local/omr-benchmark-20261017/" + row.id + "/" + e,
      folder + "/" + e,
      { recursive: true },
    );
}
for (const f of [
  "reference-parser-v1.py",
  "manifest-initial.json",
  "preflight-note.json",
])
  await cp(".local/omr-benchmark-20261017/" + f, out + "/data/" + f);
await cp(
  ".local/omr-benchmark-20261017/reference-correction.json",
  out + "/data/reference-correction.json",
);
await cp(
  ".local/omr-benchmark-20261017/protocol-freeze-initial.json",
  out + "/data/protocol-freeze-initial.json",
);
await cp("scripts/omr-benchmark", out + "/reproduce", {
  recursive: true,
  filter: (src) => !src.includes("__pycache__"),
});
const data = JSON.stringify(r).replaceAll("<", "\\u003c");
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>钢琴识谱对照实验 · 10份完整谱面</title><style>
:root{color-scheme:light;--ink:#1c2f2a;--green:#28735f;--blue:#4378b8;--muted:#65716b;--line:#dce4dc}*{box-sizing:border-box}body{margin:0;background:#f4f6f0;color:var(--ink);font:15px/1.65 system-ui,-apple-system,"PingFang SC",sans-serif}main{max-width:1200px;margin:auto;padding:40px 28px}header{padding-bottom:28px;border-bottom:1px solid var(--line)}.eyebrow{letter-spacing:.15em;font-size:12px;color:var(--green);font-weight:700}h1{font-size:34px;line-height:1.3;margin:12px 0}h2{font-size:21px;margin:34px 0 15px}p{margin:10px 0}.muted{color:var(--muted)}.badge{border:1px solid var(--line);border-radius:18px;padding:5px 12px;display:inline-block;margin:5px 6px 0 0;background:white}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin:24px 0}.card{background:white;padding:22px;border:1px solid var(--line);border-radius:12px}.big{font-size:29px;font-weight:700;margin:8px 0}.omr{color:var(--green)}.ai{color:var(--blue)}.explanation{background:#e9efe6;border-left:4px solid var(--green);padding:18px 22px;margin:24px 0}.charts{display:grid;grid-template-columns:1fr 1fr;gap:18px}.chart{background:white;border:1px solid var(--line);border-radius:12px;padding:18px}.chart svg{width:100%;height:auto}table{border-collapse:collapse;width:100%;background:white;font-size:13px}th,td{padding:12px 10px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th:first-child,td:first-child,th:nth-child(2),td:nth-child(2){text-align:left}thead{background:#eaf0e8}tbody tr:hover{background:#f4f8f4}.table-scroll{overflow:auto;border:1px solid var(--line);border-radius:10px}select{font:inherit;padding:7px;border:1px solid var(--line);border-radius:6px;background:white}a{color:var(--green)}details{border:1px solid var(--line);border-radius:9px;padding:14px 18px;background:white;margin:10px 0}summary{cursor:pointer;font-weight:650}.sample{display:grid;grid-template-columns:1fr 1fr;gap:16px}.sample img{width:100%;border:1px solid var(--line)}code{background:#e9efe6;padding:2px 5px;border-radius:4px}footer{margin:35px 0 5px;border-top:1px solid var(--line);padding-top:20px}.legend{display:flex;gap:20px;font-size:13px}.dot{display:inline-block;width:10px;height:10px;margin-right:6px;border-radius:50%}@media(max-width:760px){main{padding:24px 15px}.cards,.charts,.sample{grid-template-columns:1fr}h1{font-size:28px}}@media print{main{max-width:none;padding:0}.charts,.cards{break-inside:avoid}details{break-inside:avoid}select{display:none}}
</style><main><header><div class="eyebrow">琴伴 · 可复核实测报告</div><h1>钢琴识谱：本机 OMR 与 GPT-6.1 Sol high</h1><p class="muted">10份所选版本的全部谱页 · 单次读取 · 未经人工修正</p><div id="badges"></div></header><div class="cards" id="cards"></div><div class="explanation"><b>如何读“准确率”</b><p>主指标为延音合并后的事件匹配：音高、全曲起拍、时值、谱表/手别同时一致才算正确。召回率把漏音计错，精确率把多余音计错，F1兼顾两者。逐小节F1仅作诊断，展示排除前面小节长度错误累积后的局部表现。</p></div><h2>同一批谱面的两组结果</h2><p class="legend"><span><i class="dot" style="background:#28735f"></i>Audiveris 5.11.0 基础引擎</span><span><i class="dot" style="background:#4378b8"></i>GPT-6.1 Sol high</span></p><div class="charts"><section class="chart"><b>严格事件 F1</b><div id="accuracy-chart"></div></section><section class="chart"><b>每份识别耗时 / 秒</b><div id="speed-chart"></div></section></div><h2>逐谱比较</h2><p><label>排序 <select id="order"><option value="id">原始顺序</option><option value="accuracy">严格F1差值</option><option value="time">耗时差值</option></select></label></p><div class="table-scroll"><table><thead><tr><th>编号</th><th>谱名</th><th>页</th><th>参考事件</th><th>OMR严格F1</th><th>AI严格F1</th><th>OMR小节F1</th><th>AI小节F1</th><th>OMR秒</th><th>AI秒</th><th>AI Token</th></tr></thead><tbody id="rows"></tbody></table></div><p class="muted">全曲时间线错误会让后续起拍全部错位，因此严格F1和逐小节F1可能差异很大。所有失败和不完整结果都保留在10份样本的统计中。</p><h2>实验口径与限制</h2><ul><li>源谱来自固定Git提交的MusicXML；独立读取标准答案，使用Verovio 6.3.0排版，再栅格化。PDF内嵌图与AI收到的PNG逐像素一致。</li><li>前次《幻听》的93%是单首局部音头口径；本次使用不同样本、延音合并事件和全曲时间线，不能直接相减。总体F1按所有事件汇总，另在JSON保留按曲平均值。</li><li>这是清晰排版谱的引擎级转写测试。未测扫描模糊、拍照倾斜、独立声部编号、记号元数据本身、音头坐标、App导入资格、钢琴演奏表现或人工校对效率。</li><li>OMR直接运行基础识别引擎，不复用结果缓存；App的校对门禁和演奏时值修复不混入本次原始转写评分。</li><li>AI每份完整谱一次新上下文，只调用一次，线上请求检查model和high参数；没有复读、模型裁判或失败重跑。输出使用紧凑音符数组，不输出原图坐标，因此不等同于App默认逐行识谱的耗时。</li><li>反复与跳房子按纸面书写顺序读一次。倚音单独比较音高与所附拍点；踏板、力度和未写出的颤音展开不计分。每份仅一轮，没有稳定性或显著性结论。</li><li>识别计时不含素材制作。OMR计Java启动至MusicXML导出，AI计图片编码/请求至结构化结果返回。失败请求也计入耗时；未返回用量的请求标为未知。</li></ul><div class="explanation"><b>校验修正记录</b><p>图片预检曾发现SVG栅格化漏线，修复后重新检查全部15页，旧预检不计入正式结果。标准答案解析也修正了三份未标implicit的1拍弱起，及OMR超长小节不得截断的问题；原始/修正版本、理由与哈希均保留。两边识别输出没有因此改写或重跑。</p><a href="data/reference-correction.json">查看标准答案解析修正记录</a></div><div id="environment"></div><h2>输入、来源与错音明细</h2><div id="details"></div><footer><a href="data/逐谱结果.csv">下载CSV</a> · <a href="data/results.json">完整指标与逐音差异JSON</a> · <a href="data/protocol-freeze.json">固定协议与哈希</a> · <a href="data/input-validation.json">输入逐像素校验</a><p class="muted">生成于 <span id="generated"></span>。所有文件均在本机；本报告没有部署到公网。</p></footer></main><script type="application/json" id="data">${data}</script><script>
const d=JSON.parse(document.getElementById('data').textContent),el=id=>document.getElementById(id),pct=x=>((x||0)*100).toFixed(1)+'%',sec=x=>Number(x||0).toFixed(1),s=d.summary;el('badges').textContent=d.pages+'页 / '+d.writtenHeads+'书写音头 / '+d.referencePerformed+'演奏事件 / '+d.referenceGraces+'倚音';
for(const [title,a,b,unit]of[['严格事件F1（微平均）',pct(s.omr.strict.f1),pct(s.ai.strict.f1),'综合惩罚漏音与多余音'],['平均识别耗时',sec(s.omr.latency.mean)+'s',sec(s.ai.latency.mean)+'s','包括本轮失败请求'],['整份完全匹配',s.omr.fullExact+'/10',s.ai.fullExact+'/10','含小节长度、倚音和延音关系']]){const c=document.createElement('section');c.className='card';const t=document.createElement('b');t.textContent=title;c.append(t);const v=document.createElement('div');v.className='big';const l=document.createElement('span');l.className='omr';l.textContent=a;const rr=document.createElement('span');rr.className='ai';rr.textContent=b;v.append(l,document.createTextNode(' / '),rr);c.append(v);const p=document.createElement('small');p.textContent=unit;c.append(p);el('cards').append(c)}
function svg(tag,attrs={}){const x=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))x.setAttribute(k,v);return x}function chart(id,metric,max){const v=svg('svg',{viewBox:'0 0 500 490',role:'img','aria-label':metric==='f1'?'逐谱严格F1比较':'逐谱识别耗时比较'});d.rows.forEach((r,i)=>{const y=35+i*43,label=svg('text',{x:0,y:y+9,'font-size':12,fill:'#51625a'});label.textContent=r.id.slice(0,2);v.append(label);for(const[e,color,off]of[['omr','#28735f',0],['ai','#4378b8',17]]){const value=metric==='f1'?r[e].metrics.strict.f1*100:r[e].run.elapsedSeconds,bar=svg('rect',{x:30,y:y-2+off,width:Math.max(0,value/max*380),height:12,rx:3,fill:color}),title=svg('title');title.textContent=r.title+' '+e+': '+sec(value);bar.append(title);v.append(bar);const t=svg('text',{x:Math.min(450,36+value/max*380),y:y+8+off,'font-size':10,fill:color});t.textContent=sec(value)+(metric==='f1'?'%':'s');v.append(t)}});el(id).append(v)}chart('accuracy-chart','f1',100);chart('speed-chart','seconds',Math.max(...d.rows.flatMap(r=>[r.omr.run.elapsedSeconds,r.ai.run.elapsedSeconds]))*1.05);
function table(){const list=[...d.rows],order=el('order').value;if(order==='accuracy')list.sort((a,b)=>(b.ai.metrics.strict.f1-b.omr.metrics.strict.f1)-(a.ai.metrics.strict.f1-a.omr.metrics.strict.f1));else if(order==='time')list.sort((a,b)=>(b.ai.run.elapsedSeconds-b.omr.run.elapsedSeconds)-(a.ai.run.elapsedSeconds-a.omr.run.elapsedSeconds));el('rows').replaceChildren();for(const r of list){const tr=document.createElement('tr');for(const v of[r.id.slice(0,2),r.title,r.pages,r.referencePerformed,pct(r.omr.metrics.strict.f1),pct(r.ai.metrics.strict.f1),pct(r.omr.metrics.barAligned.f1),pct(r.ai.metrics.barAligned.f1),sec(r.omr.run.elapsedSeconds),sec(r.ai.run.elapsedSeconds),r.ai.usageKnown?r.ai.run.usage.totalTokens:'未知']){const td=document.createElement('td');td.textContent=v;tr.append(td)}el('rows').append(tr)}}el('order').addEventListener('change',table);table();
const env=document.createElement('p');env.className='muted';env.textContent='本机环境：'+d.hardware.cpu+' / '+d.hardware.memoryGiB+' GiB / '+d.hardware.platform+' '+d.hardware.arch+'；AI已报告总Token '+s.ai.usage.totalTokens+'，其中用量未知 '+s.ai.usage.unknownRuns+' 次。';el('environment').append(env);
for(const r of d.rows){const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent=r.id.slice(0,2)+' '+r.title+' · '+r.measures+'小节 · OMR '+r.omr.run.status+' / AI '+r.ai.run.status;detail.append(summary);const p=document.createElement('p');p.textContent='OMR 严格精确率 '+pct(r.omr.metrics.strict.precision)+'、召回率 '+pct(r.omr.metrics.strict.recall)+'；AI 严格精确率 '+pct(r.ai.metrics.strict.precision)+'、召回率 '+pct(r.ai.metrics.strict.recall)+'。';detail.append(p);const links=document.createElement('p');for(const[label,url]of[['输入PDF','samples/'+r.id+'/input.pdf'],['原始MusicXML',r.source.sourceUrl],['标准答案','samples/'+r.id+'/reference.json'],['AI原始输出','samples/'+r.id+'/ai-high/raw.json']]){const a=document.createElement('a');a.textContent=label;a.href=url;links.append(a,document.createTextNode(' · '))}detail.append(links);for(const e of['omr','ai']){const p=document.createElement('p');p.textContent=e.toUpperCase()+' 延音F1 '+(r[e].metrics.ties.f1===null?'无样本':pct(r[e].metrics.ties.f1))+'；倚音F1 '+(r[e].metrics.graces.f1===null?'无样本':pct(r[e].metrics.graces.f1));detail.append(p);const ul=document.createElement('ul');for(const n of r[e].metrics.strict.missing.slice(0,5)){const li=document.createElement('li');li.textContent=e.toUpperCase()+' 未准确匹配：第'+n.measure+'小节，'+(n.hand==='right'?'右':'左')+'谱表 MIDI '+n.midi+'，小节内 '+n.localBeat.toFixed(4)+' 拍，时值 '+n.duration.toFixed(4)+' 拍';ul.append(li)}detail.append(ul)}el('details').append(detail)}el('generated').textContent=new Date(d.generatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
</script></html>`;
await writeFile(out + "/识谱对照报告.html", html);
await writeFile(
  out + "/data/结果摘要.json",
  JSON.stringify({ scope: r.method, summary: r.summary }, null, 2),
);
console.log(out);
