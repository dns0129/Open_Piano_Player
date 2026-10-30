// Explicit source annotations supplied by saved evidence or the review interface.
// No inference from duration gaps, no change to the verified live-model prompt/schema.
export const SOURCE_CONTRACT_VERSION = "written-source-v2";
export function applySourceMeters(raw, decoded) {
  if (raw.meters === undefined) return decoded;
  const invalid = (path, message) => {
    throw Object.assign(new Error(path + ": " + message), {
      code: "INVALID_COMPACT_REGION",
      status: 422,
      expose: true,
      issues: [{ code: "INVALID_MEASURE_METERS", path, message }],
    });
  };
  if (!Array.isArray(raw.meters) || raw.meters.length !== raw.bars.length)
    invalid("meters", "逐小节拍号须与bars逐项对应");
  for (const [i, m] of raw.meters.entries())
    if (
      !Array.isArray(m) ||
      m.length !== 2 ||
      !Number.isInteger(m[0]) ||
      m[0] < 1 ||
      m[0] > 16 ||
      ![1, 2, 4, 8, 16].includes(m[1])
    )
      invalid(`meters[${i}]`, "拍号无效");
  if (JSON.stringify(raw.meters[0]) !== JSON.stringify(raw.meter))
    invalid("meters[0]", "首小节拍号必须与meter一致");
  decoded.coverage.measureTimeSignatures = structuredClone(raw.meters);
  // Preserve overfull measures as validation failures, never repair their lengths.
  if (
    raw.bars.every(
      (d, i) => d <= (raw.meters[i][0] * 4) / raw.meters[i][1] + 1e-5,
    )
  ) {
    let beat = 0;
    decoded.score.measureMap = raw.bars.map((duration, i) => {
      const measure = {
        beat,
        duration,
        timeSignature: [...raw.meters[i]],
        keySignature:
          (raw.notation?.keys || [])
            .filter((k) => k.staff === 1 && k.beat <= beat)
            .sort((a, b) => a.beat - b.beat)
            .at(-1)?.fifths ?? raw.key,
      };
      beat += duration;
      return measure;
    });
  }
  return decoded;
}
export function encodeSourceMeters(result) {
  return result.coverage.measureTimeSignatures
    ? { meters: structuredClone(result.coverage.measureTimeSignatures) }
    : {};
}
