from pathlib import Path
import json,math,os
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph,Table,TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape,A4
from xml.sax.saxutils import escape
r=json.loads(Path('evidence/omr-vs-sol-high-20261017/results.json').read_text());assert r['complete']
out=Path('output/识谱对照实验-20261017');out.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('ReportCJK','/System/Library/Fonts/Supplemental/Arial Unicode.ttf'))
W,H=landscape(A4);c=canvas.Canvas(str(out/'识谱对照报告.pdf'),pagesize=(W,H));c.setTitle('钢琴识谱对照实验 - 10份完整谱面');c.setAuthor('琴伴本机实测');M=38;green=colors.HexColor('#28735f');blue=colors.HexColor('#4378b8');ink=colors.HexColor('#21352e');muted=colors.HexColor('#62746b')
style=ParagraphStyle('body',fontName='ReportCJK',fontSize=10.5,leading=17,textColor=ink,wordWrap='CJK');small=ParagraphStyle('small',parent=style,fontSize=8,leading=12)
page=0
def txt(x,y,text,size=10,color=ink):c.setFillColor(color);c.setFont('ReportCJK',size);c.drawString(x,y,str(text))
def para(text,x,y,width,size=10.5):
 st=ParagraphStyle('x',parent=style,fontSize=size,leading=size*1.6);p=Paragraph(text,st);_,h=p.wrap(width,1000);p.drawOn(c,x,y-h);return y-h

def start(title,sub=''):
 global page
 page+=1;c.setFillColor(colors.HexColor('#f5f7f1'));c.rect(0,0,W,H,fill=1,stroke=0);txt(M,H-32,'琴伴 / 本机实测 / 2026-10-17',9,green);txt(M,H-66,title,24)
 if sub:txt(M,H-88,sub,10,muted)
 c.setStrokeColor(colors.HexColor('#d6e1d5'));c.line(M,32,W-M,32);txt(M,18,'单轮测量 | 同图输入 | 原始自动转写 | 无人工修正',8,muted);txt(W-75,18,str(page),8,muted)
def end():c.showPage()
P=lambda v:f'{(v or 0)*100:.1f}%';S=lambda v:f'{v:.1f}'
a,b=r['summary']['omr'],r['summary']['ai']
start('钢琴识谱对照实验','Audiveris 5.11.0 基础引擎 / GPT-6.1 Sol high')
y=H-125;y=para(f"10份所选版本的全部谱页，共 {r['pages']} 页、{r['writtenHeads']:,} 个书写音头；延音合并后 {r['referencePerformed']:,} 个普通演奏事件，另有 {r['referenceGraces']} 个倚音单独计分。标准答案来自固定提交的原始MusicXML。",M,y,W-2*M)
metrics=[('严格事件F1 (微平均)',P(a['strict']['f1']),P(b['strict']['f1'])),('正确事件召回率',P(a['strict']['recall']),P(b['strict']['recall'])),('平均耗时',S(a['latency']['mean'])+' 秒',S(b['latency']['mean'])+' 秒'),('耗时中位数',S(a['latency']['median'])+' 秒',S(b['latency']['median'])+' 秒'),('整份完全匹配',str(a['fullExact'])+' / 10',str(b['fullExact'])+' / 10'),('返回 / 失败',f"{a['returned']} / {a['failed']}",f"{b['returned']} / {b['failed']}")]
for i,(label,left,right) in enumerate(metrics):
 x=M+(i%3)*(W-2*M)/3;yy=y-35-(i//3)*105;txt(x,yy,label,11,muted);txt(x,yy-32,left,22,green);txt(x+120,yy-32,right,22,blue)
y=y-265;y=para('绿色为本机OMR，蓝色为AI。严格事件F1同时惩罚漏音和多余音；音高、全曲起拍、时值与谱表/手别同时相同才算匹配。所有失败保留在10份样本的分母中。',M,y,W-2*M)
y=para(f"逐小节对齐后的诊断F1：OMR {P(a['barAligned']['f1'])}，AI {P(b['barAligned']['f1'])}。OMR的全曲分数还受到小节长度错误累积的影响。",M,y-10,W-2*M)
y=para(f"按曲平均严格F1：OMR {P(a['strict']['macroF1'])}，AI {P(b['strict']['macroF1'])}。本机累计识别 {S(a['latency']['total'])} 秒；AI累计 {S(b['latency']['total'])} 秒。AI已报告总Token {b['usage']['totalTokens']:,}，用量未知 {b['usage']['unknownRuns']} 次。仅一轮、未测试稳定性或统计显著性。",M,y-12,W-2*M)
end()
start('逐谱准确度与速度','严格F1采用全曲时间线；小节F1是消除累计错位后的诊断值。')
headers=['编号 / 谱名','页','事件','OMR严格F1','AI严格F1','OMR小节F1','AI小节F1','OMR秒','AI秒']
data=[headers]
for row in r['rows']:
 data.append([Paragraph(escape(row['id'][:2]+' '+row['title']),small),str(row['pages']),str(row['referencePerformed']),P(row['omr']['metrics']['strict']['f1']),P(row['ai']['metrics']['strict']['f1']),P(row['omr']['metrics']['barAligned']['f1']),P(row['ai']['metrics']['barAligned']['f1']),S(row['omr']['run']['elapsedSeconds']),S(row['ai']['run']['elapsedSeconds'])])
widths=[172,26,39,79,79,79,79,60,60];t=Table(data,colWidths=widths,rowHeights=[28]+[31]*10);t.setStyle(TableStyle([('FONTNAME',(0,0),(-1,-1),'ReportCJK'),('FONTSIZE',(0,0),(-1,-1),9),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e5ede2')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f1f5ef')]),('TEXTCOLOR',(3,1),(3,-1),green),('TEXTCOLOR',(4,1),(4,-1),blue),('ALIGN',(1,0),(-1,-1),'CENTER'),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('BOTTOMPADDING',(0,0),(-1,-1),7)]));t.wrapOn(c,W,H);t.drawOn(c,M,H-115-338)
y=H-470;para('“返回转写”只表示有可评分输出，不代表全曲准确。没有成功导出的样本以0个匹配计分。前一小节读长/读短会使后续全曲起拍错位，所以两种F1可能相差很大。',M,y,W-2*M,9.5)
end()
start('逐谱比较图','左：严格事件F1 / 右：识别耗时，单位秒')
maxTime=max(row[e]['run']['elapsedSeconds'] for row in r['rows'] for e in ['omr','ai']);chartW=(W-2*M-70)/2
for i,row in enumerate(r['rows']):
 y=H-128-i*37;txt(M,y+2,row['id'][:2],8,muted)
 for engine,color,offset in [('omr',green,0),('ai',blue,-12)]:
  f=row[engine]['metrics']['strict']['f1']or 0;x=M+25;c.setFillColor(color);c.rect(x,y+offset,chartW*.82*f,8,fill=1,stroke=0);txt(x+chartW*.82*f+4,y+offset,P(f),7.5,color)
  sec=row[engine]['run']['elapsedSeconds'];x=M+chartW+75;c.setFillColor(color);c.rect(x,y+offset,chartW*.82*sec/maxTime,8,fill=1,stroke=0);txt(x+chartW*.82*sec/maxTime+4,y+offset,S(sec),7.5,color)
end()
start('实验方法与评分边界','用相同的可见谱面比较首次转写，避免人工校对成绩混入自动准确度。')
y=H-118
items=[
('输入与标准答案', '源文件固定在MuseTrainer曲库Git提交 '+r['rows'][0]['source']['repositoryCommit']+'。Verovio 6.3.0独立排版后栅格化；逐像素检查确认PDF内嵌图与AI收到的PNG相同。标准答案单独读取原始MusicXML，未使用任一识别器作为裁判。'),
('OMR设置', 'Audiveris 5.11.0，基础识别策略，逐份顺序运行，不复用持久结果缓存。计时包含Java启动、PDF读取、识别和MusicXML导出。这里比较引擎原始转写；App校对门禁、坐标映射和演奏时值修复未混入。'),
('AI设置', 'Pi现有ChatGPT登录，精确请求模型gpt-6.1-sol，reasoning.effort=high，经发送前请求审计核对。每份完整谱一次新上下文、单次请求、顺序运行，不做复读或失败重跑。输出紧凑音符数组，不请求原图坐标。每份超时上限600秒。'),
('准确度', '先合并明确同音相接的延音，再按音高、全曲起拍、时值和上/下谱表匹配，时间按0.0001个四分音符拍量化。召回率=正确事件/参考事件；精确率=正确事件/输出事件；F1=2×正确事件/(参考事件+输出事件)。逐小节F1另按小节局部起拍匹配。'),
('另行计分与排除项', '倚音按书写音高、所属小节和主音拍点单独计分，不指定解释性演奏时长。延音连边另计分。反复/跳房子按纸面书写次序读一次。独立声部编号、拍号/调号/谱号标记本身、力度、踏板、指法、速度表现和未写出的颤音展开不计分；这些记号对音高与时值的影响会反映在事件分数中。'),
('可推广范围', '前次《幻听》的93%为单首局部音头口径，本次按延音合并事件和全曲时间线评分，不能直接相减。仅10份清晰排版的所选版本，各一轮。包含简易改编，不能推断任意原版、模糊扫描或手机照片的效果。网络负载、服务端缓存及谱面复杂度影响AI时延；本机系统缓存也可能影响OMR启动。')]
for head,body in items:txt(M,y,head,11,green);y=para(escape(body),M+105,y+11,W-2*M-105,9.2)-16
end()
start('校验、失败与素材来源','原始输入、响应、时间记录、用量、哈希和逐音差异随报告保留。')
y=H-115;y=para('预检曾出现SVG栅格化漏线；修复后核对全部15页，并确认3,630个源音符均在排版中出现。旧预检记录单列，不纳入正式结果。标准答案读入修正了三份未标implicit的1拍弱起，并保留OMR超长小节的真实累计时长；没有改写或重跑两边识别输出。原始及修正版本、原因和哈希均保留。',M,y,W-2*M,9.5)
y=para('独立Python评分器复核了40组逐谱指标，全部一致；10次AI请求的实际模型和high参数、双方输入哈希均已核验。',M,y-8,W-2*M,9.5)
for row in r['rows']:
 for engine in ['omr','ai']:
  run=row[engine]['run']
  if run['status']!='returned':y=para(escape(row['id']+' / '+engine+'：'+run['status']+'；'+str(row[engine].get('failureReason') or run.get('error') or ('exitCode='+str(run.get('exitCode'))))),M,y-8,W-2*M,8.5)
y-=20;txt(M,y,'所选源文件（点击谱名打开固定提交）',11,green);y-=20
for row in r['rows']:
 text=f"{row['id'][:2]} <a href='{escape(row['source']['sourceUrl'],{chr(39):'&apos;'})}' color='#28735f'>{escape(row['title'])}</a> · {row['measures']}小节 / {row['pages']}页 · 曲库标注Public Domain"
 y=para(text,M,y,W-2*M,9.2)-5
para('《致爱丽丝》为简易版，巴赫前奏曲为曲库34小节版本。本实验覆盖所选文件全部谱页，不等同于对其他出版社原版全曲的认证。',M,y-5,W-2*M,8.5)
end();c.save();print(out/'识谱对照报告.pdf')
