import { createHash } from "node:crypto";

const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .filter((k) => value[k] !== undefined)
            .map((k) => [k, stable(value[k])]),
        )
      : value;
const hash = (value) =>
  createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
const methods = ["model-original-reread", "human-original-review"];

// Hash a measure and its musical dependencies, not checkboxes. A change to an
// accidental invalidates the measure; a tied pitch invalidates both endpoints.
export function reviewBasis(raw, measure) {
  const notation = raw.notation || {},
    meta = notation.notes || {},
    all = raw.score?.notes || [];
  const ids = new Set(
    all.filter((n) => meta[n.id]?.source?.measure === measure).map((n) => n.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of all)
      if (n.tieTo && (ids.has(n.id) || ids.has(n.tieTo))) {
        for (const id of [n.id, n.tieTo])
          if (!ids.has(id)) {
            ids.add(id);
            changed = true;
          }
      }
  }
  const pages = (raw.pages || []).map((p) => ({
    page: p.page,
    sha256: p.sha256,
    status: p.status,
    reason: p.reason,
    systems: (p.systems || []).map(({ reviewed, complete, ...s }) => s),
  }));
  const notes = all
    .filter((n) => ids.has(n.id))
    .map((n) => {
      const { checked, ...evidence } = meta[n.id] || {};
      return { note: n, evidence };
    });
  return hash({
    measure,
    pages,
    measureMap: raw.score?.measureMap,
    timeSignature: raw.score?.timeSignature,
    keySignature: raw.score?.keySignature,
    mode: raw.score?.mode,
    notes,
    keys: notation.keys,
    tempo: raw.score?.tempo,
    tempoMarks: notation.tempoMarks,
    graces: (notation.graces || [])
      .filter((g) => ids.has(g.beforeNote))
      .map(({ checked, ...g }) => g),
    rests: (notation.rests || [])
      .filter((r) => r.source?.measure === measure)
      .map(({ checked, ...r }) => r),
    clefs: notation.clefs,
    voices: notation.voices,
    spanners: (notation.spanners || []).filter(
      (s) => ids.has(s.start) || ids.has(s.end),
    ),
    unhandled: notation.unhandled,
  });
}

// Called only AFTER actual original-image review. It records the caller's
// attestation; it is not an automatic visual verifier or an accuracy claim.
export function recordMeasureReview(
  raw,
  measure,
  {
    method,
    reviewer,
    reviewedAt,
    fields = ["pitch", "rhythm", "notation", "source"],
  } = {},
) {
  if (
    !methods.includes(method) ||
    typeof reviewer !== "string" ||
    !reviewer.trim() ||
    !Number.isFinite(Date.parse(reviewedAt))
  )
    throw Error("复核须记录实际方式、执行者与时间。");
  const page = raw.pages.find((p) =>
    p.systems?.some(
      (s) => s.measureStart <= measure && s.measureEnd >= measure,
    ),
  );
  const system = page?.systems.find(
    (s) => s.measureStart <= measure && s.measureEnd >= measure,
  );
  if (!system || !raw.score.measureMap[measure - 1])
    throw Error("复核小节不在原图清单中。");
  return {
    measure,
    page: page.page,
    system: system.id,
    sourceSha256: page.sha256,
    fields: [...fields],
    method,
    reviewer,
    reviewedAt,
    basis: reviewBasis(raw, measure),
  };
}

export function reviewEvidenceBlockers(raw) {
  const records = raw.review?.evidence;
  if (!Array.isArray(records))
    return [
      "缺少与当前转录绑定的逐小节复核证据；旧版本需按原图复核后补记，可先导出草稿",
    ];
  const blockers = [],
    seen = new Set();
  for (const r of records) {
    if (
      !r ||
      !Number.isInteger(r.measure) ||
      r.measure < 1 ||
      r.measure > raw.score.measureMap.length ||
      seen.has(r.measure)
    ) {
      blockers.push("复核小节无效或重复");
      continue;
    }
    seen.add(r.measure);
    const page = raw.pages.find((p) => p.page === r.page),
      system = page?.systems?.find((s) => s.id === r.system);
    if (
      !system ||
      r.measure < system.measureStart ||
      r.measure > system.measureEnd ||
      page.sha256 !== r.sourceSha256 ||
      !methods.includes(r.method) ||
      typeof r.reviewer !== "string" ||
      !r.reviewer.trim() ||
      !Number.isFinite(Date.parse(r.reviewedAt)) ||
      !Array.isArray(r.fields) ||
      !["pitch", "rhythm", "notation", "source"].every((f) =>
        r.fields.includes(f),
      )
    )
      blockers.push(`第${r.measure}小节复核来源、方式或覆盖字段无效`);
    if (r.basis !== reviewBasis(raw, r.measure))
      blockers.push(`第${r.measure}小节或其依赖已修改，原复核证据失效`);
    if (
      raw.review.humanConfirmed === true &&
      r.method !== "human-original-review"
    )
      blockers.push(`第${r.measure}小节没有人工确认依据`);
  }
  for (let m = 1; m <= raw.score.measureMap.length; m++)
    if (!seen.has(m)) blockers.push(`第${m}小节尚无当前复核证据`);
  return blockers;
}
