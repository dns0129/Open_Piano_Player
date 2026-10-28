import { editWrittenEvidence } from "../lib/recognition-edit.mjs";
const escape = (value) =>
  String(value ?? "").replace(
    /[<>&"']/g,
    (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function writtenEvidenceEditor(region) {
  const evidence = region?.score?.recognitionEvidence;
  if (!evidence) return "";
  const field = (kind, index, noteId, key, value, label, type = "number") =>
    `<input type="${type}" data-written-kind="${kind}" data-written-index="${index}" data-written-note="${escape(noteId)}" data-written-field="${key}" value="${escape(value)}" aria-label="${escape(label)}">`;
  const changes = [
    [
      "clef",
      "谱号",
      evidence.clefs,
      [
        ["beat", "起拍"],
        ["staff", "谱表"],
        ["sign", "G/F/C", "text"],
        ["line", "所在谱线"],
        ["octaveChange", "谱号八度移位"],
      ],
    ],
    [
      "key",
      "调号",
      evidence.keys,
      [
        ["beat", "起拍"],
        ["staff", "谱表"],
        ["fifths", "升降数"],
      ],
    ],
  ]
    .map(
      ([kind, label, items, columns]) =>
        `<div class="fsi-review-table"><table><caption>原谱${label}与变化</caption><thead><tr>${columns.map(([, name]) => `<th>${name}</th>`).join("")}</tr></thead><tbody>${items.map((item, i) => `<tr>${columns.map(([key, name, type]) => `<td>${field(kind, i, "", key, item[key], `${label} ${i + 1} ${name}`, type)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
    )
    .join("");
  return `<details class="fsi-written-evidence"><summary>按原图核对书写音名与声部</summary><p>升降值：降号 −1、还原 0、升号 1；显式记号留空表示原图没有重写。修改后请核对本小节后续音及延音。</p><div class="fsi-review-table"><table><thead><tr><th>音符</th><th>谱表 1/2</th><th>字母</th><th>八度</th><th>实际升降值</th><th>显式记号</th><th>八度移位半音</th></tr></thead><tbody>${region.notes
    .map((n, i) => {
      const e = evidence.notes.find((e) => e.noteId === n.id);
      return `<tr><td>${i + 1}</td>${[
        ["staff", e?.staff, "谱表"],
        ["step", e?.step, "字母"],
        ["octave", e?.octave, "八度"],
        ["alter", e?.alter, "升降值"],
        ["printed", e?.printed, "显式记号"],
        ["shift", e?.shift ?? 0, "八度移位"],
      ]
        .map(
          ([key, value, label]) =>
            `<td>${field("note", i, n.id, key, value, `音符 ${i + 1} 书写${label}`, key === "step" ? "text" : "number")}</td>`,
        )
        .join("")}</tr>`;
    })
    .join(
      "",
    )}</tbody></table></div><div class="fsi-review-table"><table><thead><tr><th>休止</th><th>原谱谱表 1/2</th></tr></thead><tbody>${(region.rests || []).map((r, i) => `<tr><td>${i + 1}</td><td>${field("rest", i, "", "staff", r.staff, `休止 ${i + 1} 原谱谱表`)}</td></tr>`).join("")}</tbody></table></div><div class="fsi-review-table"><table><thead><tr><th>声部</th><th>手别</th><th>起拍</th><th>结束拍</th></tr></thead><tbody>${evidence.voices
    .map(
      (v, i) =>
        `<tr>${[
          ["voice", v.voice, "text"],
          ["hand", v.hand, "text"],
          ["from", v.from, "number"],
          ["to", v.to, "number"],
        ]
          .map(
            ([key, value, type]) =>
              `<td>${field("voice", i, "", key, value, `声部 ${i + 1} ${key}`, type)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("")}</tbody></table></div>${changes}</details>`;
}
export function applyWrittenEvidenceInput(input, region) {
  const {
    writtenKind: kind,
    writtenIndex: index,
    writtenNote: noteId,
    writtenField: field,
  } = input.dataset;
  if (!kind || !field) return false;
  const value = ["step", "voice", "hand", "sign"].includes(field)
    ? ["step", "sign"].includes(field)
      ? input.value.trim().toUpperCase()
      : input.value.trim()
    : input.value === ""
      ? null
      : Number(input.value);
  return editWrittenEvidence(region, {
    kind,
    index: Number(index),
    noteId,
    field,
    value,
  });
}
