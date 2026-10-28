const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const list = (items) =>
  items?.length
    ? `<ul>${items.map((s) => `<li>${escape(s)}</li>`).join("")}</ul>`
    : "";
const eventText = (event) =>
  event?.kind === "transcription"
    ? `完整复读：${event.measureCount} 小节、${event.noteCount} 个音符`
    : event
      ? `${event.hand === "right" ? "右手" : "左手"}${event.midi === undefined ? "休止" : ` MIDI ${event.midi}`} · 行内起始拍 ${event.beat} · 时值 ${event.duration} 拍`
      : "无";
const operations = {
  transcribe: "完整复读",
  "add-rest": "新增休止",
  "update-rest": "修改休止",
  "remove-rest": "删除休止",
  "add-note": "新增音符",
  "update-note": "修改音符",
  "remove-note": "删除音符",
};
/** Render only: probability comes exclusively from a model, never from a rhythm rule. */
export function scoreDiagnosisCard(
  region,
  { busy = false, dirty = false } = {},
) {
  if (!region?.image) return "";
  const a = region.sourceAssessment,
    d = region.diagnosis,
    p = d?.report;
  const disabled = busy || d?.status === "running" || dirty;
  const button = (action, label, off = false) =>
    `<button type="button" data-action="${action}" ${disabled || off ? "disabled" : ""}>${label}</button>`;
  const probability =
    a?.probability == null
      ? "尚未给出概率"
      : `${Math.round(a.probability * 100)}%`;
  const history = region.revisionHistory?.filter((h) => !h.undoneAt).at(-1);
  return `<section class="fsi-diagnosis" aria-label="原谱问题诊断与修订"><h3>原谱问题诊断与修订</h3>
    <p><strong>原谱存在记谱问题的估计概率：${probability}</strong></p><p class="fsi-muted">模型估计，未经校准；拍数校验只能发现矛盾，不能证明原谱有错。</p>
    ${a ? `<p>${escape(a.summary)}</p>${a.evidence?.length ? `<details><summary>查看识谱证据（${a.evidence.length} 条）</summary>${list(a.evidence)}</details>` : ""}${a.alternatives?.length ? `<details><summary>其他可能原因</summary>${list(a.alternatives)}</details>` : ""}` : "<p>此行尚未由识谱智能体评估原因；可先评估，也可在任意疑点行主动请求评估。</p>"}
    ${region.result?.checks?.errors?.length ? `<p>结构检查发现：</p>${list(region.result.checks.errors.map((e) => e.message))}` : ""}
    ${dirty ? '<p class="fsi-warning">此行有未提交的人工编辑。请先完成校对提交，再进行诊断，以免覆盖你的修改。</p>' : ""}
    <p class="fsi-muted">评估及独立诊断各需一次额外模型请求，按当前服务商用量计入；本行最多4次评估/诊断，不自动循环重试。移交仅生成方案，接受后才修改乐谱。</p>
    <div class="fsi-actions">${button("assess-source", a ? "重新评估原谱问题" : "评估原谱问题", (region.diagnosisAttempts || 0) >= 4)}${button("diagnose-source", "确认移交诊断与修订智能体", !a || (region.diagnosisAttempts || 0) >= 4)}</div>
    ${d?.status === "running" ? `<p role="status">${d.phase === "assess" ? "识谱智能体正在评估" : "独立智能体正在诊断并准备修订"}；已有结果保持原样。</p>` : ""}
    ${d?.status === "failed" ? `<p class="fsi-warning">${escape(d.error?.message || "诊断中断，已有乐谱已保留。")}</p>` : ""}
    ${
      p && d.phase === "diagnose"
        ? `<div class="fsi-revision"><h4>诊断方案${d.status === "applied" ? "（已应用）" : "（待接受）"}</h4>${d.status === "applied" ? '<p class="fsi-muted">以下保留方案生成时的说明；此方案现已接受并应用。</p>' : ""}<p>${escape(p.explanation)}</p><p>诊断智能体对原谱问题的估计：${p.assessment?.probability == null ? "证据不足" : `${Math.round(p.assessment.probability * 100)}%`}，未经校准。</p>${p.assessment?.evidence?.length ? `<details><summary>查看独立诊断证据（${p.assessment.evidence.length} 条）</summary>${list(p.assessment.evidence)}</details>` : ""}
    ${p.changes?.length ? `<div class="fsi-review-table"><table><thead><tr><th>修改</th><th>修改前</th><th>修改后</th><th>依据</th></tr></thead><tbody>${p.changes.map((c) => `<tr><td>${escape(operations[c.op] || c.op)}</td><td>${escape(eventText(c.before))}</td><td>${escape(eventText(c.after))}</td><td>${escape(c.reason)}</td></tr>`).join("")}</tbody></table></div>` : "<p>此次未提出可直接应用的修改，请根据诊断建议处理。</p>"}
    ${p.remainingDoubts?.length ? `<p>仍需核对：</p>${list(p.remainingDoubts)}` : ""}
    ${p.candidate?.checks?.errors?.length ? `<p>候选仍未通过结构检查，不能应用：</p>${list(p.candidate.checks.errors.map((e) => e.message))}` : ""}
    ${d.status === "ready" ? button("apply-revision", "接受以上修订并应用", !p.canApply) : ""}</div>`
        : ""
    }
    ${history ? `<p>已保存原版本和修订记录；此修订不代表整行已完成逐音校对。</p>${button("undo-revision", "撤销最近一次修订")}` : ""}
  </section>`;
}
