# 数据与工具说明

## 安装与命令

需要 Node.js 22.19+、Python 3.10+。在 Skill 目录运行 `npm ci --ignore-scripts`；在虚拟环境运行 `python -m pip install -r requirements.txt`。渲染使用 Verovio，PDF/图片处理使用 PyMuPDF；首次安装依赖需要网络，识别后的转换不调用模型、不访问网络。不要把 node_modules、原谱、登录凭据放入 Skill 包。

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm ci --ignore-scripts
.venv/bin/python scripts/prepare_score.py book.pdf --out /tmp/score-work/pages
node scripts/score_pipeline.mjs --input /tmp/score-work/transcription.json \
  --manifest /tmp/score-work/pages/manifest.json --out /tmp/score-work/result
npm test
```

`--no-render` 仅导出 XML/MIDI/JSON；`--draft` 允许未完成复核的结构有效草稿。输入错误、漏页、哈希不符、音高/临时记号矛盾仍然失败。输出目录须为新目录，避免覆盖上次制谱结果。按页图顺序提交多个输入文件；工具不会猜文件名中的数字顺序。

## 转录 envelope

完整示例在 [自编符号测试谱数据](../assets/transcription-example.json)。该示例的页哈希是占位标识，不能作为任何真实乐谱的识别答案。测试脚本生成自己的临时页图与真实哈希。

```json
{
  "schema": "piano-score-transcription/v1",
  "provenance": {"promptVersion":"accidentals-v2-20261018", "model":"实际使用的模型", "reasoning":"实际档位", "calls":[]},
  "pages": [{"page":1,"sha256":"manifest 中的真实值","status":"score","reviewed":true,"systems":[
    {"id":"p1s1","staves":2,"measureStart":1,"measureEnd":4,"complete":true,"reviewed":true}
  ]}],
  "score": {"version":1,"id":"piece-v1","title":"曲名","composer":"原作者","tempo":90,
    "timeSignature":[4,4],"keySignature":0,"mode":"major","durationBeats":16,
    "measureMap":[{"beat":0,"duration":4,"timeSignature":[4,4]}],
    "source":{"kind":"image-ai","label":"版本与来源","url":"https://example.org/score"},
    "notes":[{"id":"n1","midi":70,"beat":0,"duration":1,"hand":"right","voice":"1"}]
  },
  "notation": {"notes":{"n1":{
    "pitch":{"step":"B","alter":-1,"octave":4},"printedAccidental":-1,
    "source":{"page":1,"system":"p1s1","measure":1,"staff":1},"checked":true
  }},"keys":[{"measure":1,"fifths":0,"mode":"major"}],
    "tempoMarks":[{"beat":0,"unit":"quarter","dots":0,"bpm":90}],
    "graces":[],"spanners":[],"unhandled":[]},
  "issues":[],"review":{"status":"checked","method":"model-original-reread","humanConfirmed":false}
}
```

上例只展示字段形状，省略的其余小节/音符必须实际补齐；不要将不完整示意直接投入生产。页与行的 `reviewed`、音符的 `checked`、系统行的 `complete` 及 `review.humanConfirmed` 均须为布尔值，字符串或数字即使在草稿模式也会失败。页与行的 `reviewed`、音符的 `checked` 只在完成对应原图复核后设 true。`humanConfirmed` 仅在用户/人工确实确认后设 true。


### v1.1 复核证据与未知速度

`review.evidence` 为逐小节记录数组，每项保存 `measure/page/system/sourceSha256/fields/method/reviewer/reviewedAt/basis`。`fields` 至少覆盖 pitch、rhythm、notation、source；`method` 为 model-original-reread 或 human-original-review。`humanConfirmed=true` 要求全部记录确有人工复核，不能把模型复核改名为人工确认。

在实际看原图复核之后，可调用 `scripts/review-evidence.mjs` 的 `recordMeasureReview(raw, measure, {method, reviewer, reviewedAt})` 生成当前记录，替换该小节的旧记录。该函数只记录调用者的复核声明，不会看图，也不会自动证明准确率。不要为消除阻塞而批量补盖未做过的复核。

`basis` 绑定原图、来源系统、书写事件、音高、节奏、记号及延音依赖。修改同小节音符会使该小节证据失效；延音链相关小节也需要重核。独立小节的有效证据可保留。没有证据的旧文件仍可用 `--draft` 打开，不会自动升级为已复核。

`score.tempo` 为 null（兼容旧响应的 0）时，`score.tempoStatus` 可为 unknown、unreadable 或 not-marked；不得把三者混为“原谱没标速度”。未知或不可辨的原谱速度阻塞正式完成，但允许保存草稿、音符和证据。草稿使用 90 四分音符 BPM 的练习值，`score.qinban.json` 的 `tempoEvidence` 保存原始状态；MusicXML 的默认标速注明练习用途。首个 `notation.tempoMarks` 可为 `{beat:0,unit:"quarter",dots:0,bpm:null}`，或省略以使用练习值。确认原谱确实没有标速时使用 not-marked；这不是数值速度已识别的声明。原始 `transcription.json` 不改写未知值。

### 时间轴、来源与音高

- 所有 `beat`、`duration` 以四分音符为 1；三连八分音符为 1/3，不能因 6/8 拍把单位改为附点四分。
- 显式 `measureMap` 覆盖从 0 到 `durationBeats`，小节连续、含弱起、末尾休止和变拍。notes 只放发声主音，休止由时间轴间隙表达；保留每声部的休止信息在原谱核对记录中。
- 谱表与声部不同：`source.staff` 是原图谱表1/2；`hand` 是新谱分配的左右手。交叉谱表需人工核对 hand 与 voice，不能按 MIDI 高低自动断手。
- `keySignature` / `keys[].fifths` 为五度圈 -7..7，负值为降号；mode 为 major/minor。其他调式先适配，不伪装成大调。
- 每个音符的稳定 ID（字母/下划线开头，其后字母数字、点、下划线、连字符，最多71字符）对应一条 `notation.notes`；重复 ID 直接报错。
- `pitch` 是新谱实际书写音高，`MIDI = (octave+1)*12 + CDEFGAB 对应的[0,2,4,5,7,9,11] + alter`。alter 取 -2..2；`printedAccidental` 无显式符号须写 null，♮为0，不能漏写该字段。
- 8va/8vb 时，保留 `sourceWrittenPitch` 和 `octaveShift`（半音，常为±12）。`pitch` 将八度记号展开成实际八度重绘，两种写法都保存在转录文件；不要声称原样复制8va线条。
- 双谱表系统行须全部列出，小节只能归属一行。若原图在半小节断行、单谱表或更复杂布局，先扩展来源适配；当前工具会拒绝其为全支持输入。

### 已实现的音符效果

直接放入 `score.notes[]`，不加效果等于原谱没有该标记：

| 字段 | 值 | MusicXML / MIDI |
| --- | --- | --- |
| dynamic | pp,p,mp,mf,f,ff | 原生力度 / velocity |
| accent | accent,marcato | `accent`/`strong-accent` / 提高触键力度 |
| articulation | staccato,tenuto | 原生符号 / 缩短或保持发声 |
| ornament | trill,mordent-upper,mordent-lower | 颤音、上/下波音 / 展开辅助音 |
| ornamentInterval | 1或2 | 必须按原谱辅助音确定半音间隔，不凭调式猜 |
| arpeggio | up,down | 原生琶音记号 / 同手和弦顺序触发 |
| tieTo | 后续音符 ID | 原生 tie+tied / 合并为一次发声 |
| velocity | 0..1 | 发声力度；有 dynamic 时默认从动态表取得 |

每个有 ornament 的音必须给 ornamentInterval；方向由 ornament 区分。实际展开是练习播放近似，不是人类演奏的完整力度/速度模型。延音线只能连接同手同声部、同音高、时间相接的音；不能同时带断奏、装饰音或琶音。连奏弧另存 spanners，绝不能用 tieTo 代替。原谱仅一个延长保持符号时也不能凭空加 tieTo。

### 更多谱面信息

- `notation.notes[id].rhythm` 可明确 `{ "type":"eighth", "dots":0, "tuplet":{"actual":3,"normal":2,"group":"triplet-1","number":1} }`，必须与真实 duration 相等。同一连音分组共用 group ID、比例和编号，生成原生连音数字/括号；带休止、嵌套或跨声部分组需要额外适配，不能漏标后当作完整支持。跨小节自动拆分的延音音头由工具重算符值。
- `notation.notes[id].fermata` 可为 normal/angled/square。保存在 MusicXML；不会猜测延长秒数。
- `notation.graces[]`：`{id,beforeNote,pitch,type,slash,source,checked}`。type 为 eighth/16th/32nd，slash 为布尔。无 duration，锚定主音之前，保存在 MusicXML。当前 MIDI/琴伴 JSON 不演奏这些零时值倚音，报告明确提示。
- `notation.spanners[]`：`{type:"slur",start:"n1",end:"n8",number:1}`；number1..6。MusicXML 保留，MIDI 不模拟连奏触键。
- `notation.keys[]` 从小节1开始，列出全部调号/调式变化；`notation.tempoMarks[]` 从beat0开始，列出全部变速，字段 `{beat,unit,dots,bpm}`。例如附点四分音符94 = quarterBpm141。XML保留原单位，MIDI使用换算后的速度。琴伴 JSON 当前只播放首个速度、主要按全局调号显示。
- 踏板、渐强渐弱、回音(turn)、长波浪线、反复/D.C./D.S.、复杂连音括号、其他未实现内容放入 `notation.unhandled:[{"message":"第几页/行/小节的什么符号待适配"}]`。默认阻塞完成导出；不能删掉记录后假装完成。需要完整还原这些符号时，扩展 MusicXML 适配或使用编辑器，并另做验证。

## 实际 usage

`provenance.calls[]` 每次调用、重试、复核各一条，建议字段 `{id,stage,startedAt,endedAt,model,reasoning,usage,rawUsage}`。usage 字段为 provider 实际返回的 `inputTokens,outputTokens,cachedInputTokens,cacheWriteTokens,reasoningTokens,totalTokens`；没有的字段不填。原始对象使用 rawUsage 保留供应商含义，注意脱敏。计时边界与 token 日志不由转换脚本凭空生成。

report.json 每字段提供 sum 和 reportedCalls；部分缺失时只能说“已记录部分合计”。输入、缓存读取、输出与思考常有包含关系，不允许再次相加。`conversionSeconds` 只是本地制谱时间，绝不是整次识别耗时。

## 实现来源与格式依据

`scripts/core/{score,note-effects,pitch-spelling,exporters}.mjs` 来自琴伴提交 `ccb7c7a5e58c8d3640385018febb14348ebdbc86`；Skill 中 exporter 另加稳定音符 ID、显式声部分离，并避免同一和弦重复插入力度标记。Skill 的转换器在其外校验原谱证据、保留音名及附点/连音、倚音/连奏弧/延长记号、调号/速度变化，并调用 Verovio 重排。没有打包项目原谱、私有运行目录或第三方 node_modules。

MusicXML 4 主规范：[pitch](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/pitch/)、[metronome](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/metronome/)、[offset](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/offset/)、[tie](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/tie/)、[grace](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/grace/)。新适配应按标准元素实现并做回读/排版验证；XML语法通过不能代替完整 MusicXML schema 或所有编辑器兼容性验证。

## v1.0.0 发布验证

2026-10-19：6项 Node 测试和1项多页准备测试通过，覆盖漏页/哈希失败、稳定音符ID、临时记号与等音写法、两手/声部、原生记号/连音括号、MIDI变速/调号和实际 usage 缺失处理。自编18主音+1倚音的输出通过 W3C MusicXML 4.0 XSD，浏览器检查了重新绘制的记号。Skill 元数据通过 skill-creator 校验。

这些是工具功能验证；没有调用模型识别真实歌曲，没有独立逐音标注评分，不能据此宣称识谱准确率提高或达到某个百分比。
