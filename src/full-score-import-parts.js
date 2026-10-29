// Closure-free pieces of the full-PDF import dialog (full-score-import.js):
// image/blob conversion, labels and review markup that depend only on their arguments.
import { escapeHTML } from "./html.js";

export const finite = (value) =>
  typeof value === "number" && Number.isFinite(value);
export const numberValue = (value) =>
  value === "" ? undefined : Number(value);
export const errorText = (error) =>
  String(error?.message || error || "操作失败，请重试。");
export const unwrap = (value) => value?.snapshot || value?.job || value;
/** A manual change invalidates the row's review until it is approved again. */
export function edited(region) {
  region.reviewed = false;
  region.dirty = true;
}
export const blobFromImage = (image) => {
  const bytes = atob(image.data),
    data = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index++)
    data[index] = bytes.charCodeAt(index);
  return new Blob([data], { type: image.mimeType || "image/png" });
};
export const blobImage = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("文件读取失败。"));
    reader.onload = () =>
      resolve({
        data: String(reader.result).split(",")[1],
        mimeType: blob.type || "image/png",
      });
    reader.readAsDataURL(blob);
  });
export const canvasBlob = (canvas) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("谱面图片生成失败。")),
      "image/png",
    ),
  );
export const scopeLabel = (region) =>
  `第 ${region.page} 页 · 第 ${region.system} 行`;

export function internalTieCandidates(region) {
  const notes = region.notes || [],
    pairs = new Map();
  for (const tie of region.internalTies || [])
    if (tie)
      pairs.set(`${tie.fromNoteId}:${tie.toNoteId}`, { ...tie, checked: true });
  for (const from of notes) {
    const to = notes.find(
      (note) =>
        note.id !== from.id &&
        note.hand === from.hand &&
        note.midi === from.midi &&
        Math.abs(note.beat - from.beat - from.duration) < 0.00001,
    );
    if (to) {
      const key = `${from.id}:${to.id}`;
      if (!pairs.has(key))
        pairs.set(key, {
          fromNoteId: from.id,
          toNoteId: to.id,
          checked: false,
        });
    }
  }
  return [...pairs.values()].map((pair) => ({
    ...pair,
    from: notes.find((note) => note.id === pair.fromNoteId),
    to: notes.find((note) => note.id === pair.toNoteId),
  }));
}

export function omrReviewMarkup(region) {
  const changes = region.corrections || [],
    audit = region.sourceHeadAudit;
  const records = changes.length
    ? `<details class="fsi-advanced"><summary>校正与人工修改记录（${changes.length}项，仍需对照原谱）</summary><ul>${changes.map((c) => `<li>${c.measure ? `第${c.measure}小节：` : ""}${escapeHTML(c.description)}<br><small>${escapeHTML(c.before)} → ${escapeHTML(c.after)}；依据：${escapeHTML(c.evidence)}</small></li>`).join("")}</ul></details>`
    : "";
  const heads = audit?.unmapped?.length
    ? `<div class="fsi-warning"><strong>初次识别有${audit.unmapped.length}个未映射源音头${audit.reviewed ? "（已核查）" : "，需核查或补音"}</strong><p>以下保留原始识别的疑点记录。点击定位后对照原谱与已校对音符；可用“新增音符”补入漏音，或确认属于误检。</p><div>${audit.unmapped.map((head, index) => `<button type="button" data-action="source-head" data-head-index="${index}">查看${head.staff === 1 ? "右" : "左"}谱表音头${index + 1}</button>`).join("")}</div><label><input type="checkbox" data-head-reviewed ${audit.reviewed ? "checked" : ""}> 已逐个检查，补入漏音或确认误检</label></div>`
    : audit
      ? `<p class="fsi-muted">源音头覆盖：${audit.mapped} / ${audit.detected}，仍需对照音高、节奏与变音记号。</p>`
      : "";
  const ties = region.tieAudit?.unresolved?.length
    ? `<div class="fsi-warning"><strong>初次识别有${region.tieAudit.unresolved.length}处延音疑点${region.tieAudit.reviewed ? "（已核查）" : "，音符已保留供编辑"}</strong><ul>${region.tieAudit.unresolved.map((item) => `<li>${escapeHTML(item.description)} ${item.noteIds.map((id) => `<button type="button" data-action="select-note" data-note-id="${escapeHTML(id)}">定位 ${escapeHTML(id)}</button>`).join("")}</li>`).join("")}</ul><p>以上为原始疑点记录；请在上方延音编辑区核对修正后的行内/跨行关系，普通乐句线应保留分次弹奏。</p><label><input type="checkbox" data-tie-reviewed ${region.tieAudit.reviewed ? "checked" : ""}> 已按原谱修正并核对以上延音疑点</label></div>`
    : "";
  const disagreement =
    region.verification?.status === "disagreement"
      ? '<div class="fsi-warning"><strong>独立复读存在分歧</strong><p>请对照原图核对音符、休止和书写信息。完成修改后，“审核当前行”会记录本次人工裁决。</p></div>'
      : "";
  return records + heads + ties + disagreement;
}
