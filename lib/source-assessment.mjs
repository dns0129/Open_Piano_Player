/** Model belief is not a calibrated probability or a deterministic rhythm verdict. */
export function normalizeSourceAssessment(raw) {
  if (!raw || typeof raw !== "object") return null;
  const probability = raw.probability;
  if (
    probability !== null &&
    !(
      typeof probability === "number" &&
      Number.isFinite(probability) &&
      probability >= 0 &&
      probability <= 1
    )
  )
    return null;
  const clean = (s, max = 600) =>
    typeof s === "string"
      ? s
          .replace(/[\u0000-\u001f]/g, " ")
          .trim()
          .slice(0, max)
      : "";
  const list = (value) =>
    Array.isArray(value)
      ? value
          .slice(0, 12)
          .map((s) => clean(s))
          .filter(Boolean)
      : [];
  const summary = clean(raw.summary);
  if (!summary) return null;
  return {
    probability,
    summary,
    cause: [
      "source-notation",
      "image-quality",
      "recognition",
      "uncertain",
    ].includes(raw.cause)
      ? raw.cause
      : "uncertain",
    evidence: list(raw.evidence),
    alternatives: list(raw.alternatives),
    probabilityKind: "model-estimate-not-calibrated",
  };
}

export const SOURCE_ASSESSMENT_INSTRUCTIONS = `原谱问题评估：识读与修订必须分开。complete表示选定范围是否读完，不表示原谱的记谱必然正确。若清晰可见的符号按原样读取后出现拍数矛盾，仍可提交原样转写，禁止为凑拍补写或修改。发现异常时用sourceAssessment给出probability（0到1，表示模型认为原谱本身存在记谱问题的估计概率；证据不足用null）、cause（source-notation/image-quality/recognition/uncertain）、summary、evidence（具体页/行/小节/手别、可见符号与时值算式）、alternatives（可能漏读的附点、连音/多声部、弱起、裁切、图像质量等其他解释）。概率未经校准，不可伪装成测量准确率；不能仅凭拍数不满就断定原谱错误。无法读取时request_source也携带sourceAssessment，区分图像不清与疑似记谱矛盾；疑似原谱问题提示“待诊断”，不要一律索要高清图。原谱的作者意图未确定时禁止补写，由用户决定是否移交独立诊断与修订智能体。`;

export function hasManualScoreRevision(region) {
  return Boolean(
    region.revisionHistory?.some((h) => !h.undoneAt) ||
    region.result?.manualRevisions?.length ||
    region.result?.warnings?.some(
      (w) => typeof w === "string" && w.startsWith("人工修订"),
    ),
  );
}
