const idPattern = /^[A-Za-z0-9_-]{1,80}$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function encodeFullScoreRecovery({ id, token }) {
  if (!idPattern.test(id || "") || !tokenPattern.test(token || ""))
    throw new Error("识谱任务恢复码格式无效。");
  return `qinban-job:v1:${id}:${token}`;
}

export function decodeFullScoreRecovery(value) {
  if (typeof value !== "string" || value.length > 240)
    throw new Error("请输入有效的本机识谱任务恢复码。");
  const parts = value.trim().split(":");
  if (
    parts.length !== 4 ||
    parts[0] !== "qinban-job" ||
    parts[1] !== "v1" ||
    !idPattern.test(parts[2]) ||
    !tokenPattern.test(parts[3])
  )
    throw new Error("识谱任务恢复码格式无效。");
  return { id: parts[2], token: parts[3] };
}
