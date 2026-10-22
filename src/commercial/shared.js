import { createAccountClient } from "../accounts/client.js";
import "./style.css";
if ("serviceWorker" in navigator)
  void navigator.serviceWorker
    .register("/commercial-sw.js", { scope: "/" })
    .catch(() => {});
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const date = (value) =>
  new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export const stateLabels = {
  queued: "等待处理",
  running: "正在识别",
  cancelling: "正在停止",
  cancelled: "已取消",
  needs_review: "识别完成 · 待核对",
  partial: "部分完成",
  failed: "未完成",
  interrupted: "处理中断",
  pending: "尚未开始",
  not_started: "尚未调用",
  preparing: "准备原图",
  calling: "读取原谱",
  complete: "结构通过",
  needs_correction: "需要校对",
  uncertain: "结果未确认",
  open: "待处理",
  in_progress: "处理中",
  resolved: "已处理",
};
export const errorLabels = {
  TASK_LIMIT: "本月任务名额已用完。",
  TASK_ACTIVE: "已有任务正在处理。",
  GLOBAL_BUDGET: "服务预算已达到上限，已保留成功结果。",
  USAGE_UNKNOWN: "调用结果未确认，已停止后续调用，等待运营核对。",
  NEEDS_SOURCE: "这一行没有读完整，请调整选区或使用更清晰的原图。",
  WORKER_INTERRUPTED: "处理中断，成功结果已保留，可只重试未完成行。",
  RECOGNITION_UNAVAILABLE: "识谱服务暂未启用，已保存的乐谱仍可练习。",
};
export const money = (value) => "$" + (Number(value) / 1000000).toFixed(6);
export function navigation(active, session) {
  return `<header class="commerce-header"><a class="commerce-brand" href="/"><img src="/favicon.svg" alt="" width="30" height="30"><span>琴伴<small>自己的谱，自己的练习</small></span></a><nav aria-label="商业版导航"><a href="/" ${active === "library" ? 'aria-current="page"' : ""}>我的曲库</a><a href="/recognition.html" ${active === "recognition" ? 'aria-current="page"' : ""}>上传识谱</a><a href="/#support">帮助与反馈</a><a href="/account.html">${session ? "账号与资料" : "登录"}</a>${session?.user.role === "operator" ? `<a href="/operations.html" ${active === "operations" ? 'aria-current="page"' : ""}>运营</a>` : ""}</nav></header>`;
}
export function layout({
  active,
  session,
  body,
  error = "",
  message = "",
  busy = false,
  info,
}) {
  return `${navigation(active, session)}<main class="commerce-shell">${info?.announcement ? `<aside class="commerce-notice" role="status">${esc(info.announcement)}</aside>` : ""}<div class="commerce-alert" role="alert">${esc(error)}</div><div class="commerce-message" role="status">${esc(message)}</div>${body}</main><footer class="commerce-footer">琴伴 · 私有乐谱与日常练习<span>AI 识谱结果需对照原图核对</span></footer><div class="commerce-processing" role="status" ${busy ? "" : "hidden"}><span class="commerce-spinner"></span>正在处理，请稍候…</div>`;
}
export function loginPrompt() {
  return '<section class="commerce-card commerce-empty"><h1>让自己的乐谱随时可用</h1><p>登录后上传原谱、查看识别任务，并在自己的私有曲库中继续练习。</p><a class="commerce-button primary" href="/account.html">登录账号</a></section>';
}
export function createPage(onIdentityChange) {
  const client = createAccountClient(),
    urls = new Set();
  client.subscribe(() => {
    for (const u of urls) URL.revokeObjectURL(u);
    urls.clear();
    onIdentityChange?.();
  });
  window.addEventListener("pagehide", () => client.clearLocal());
  return {
    client,
    async image(path) {
      const epoch = client.epoch,
        r = await client.request(path),
        blob = await r.blob();
      client.checkEpoch(epoch);
      const url = URL.createObjectURL(blob);
      urls.add(url);
      return url;
    },
    release() {
      for (const u of urls) URL.revokeObjectURL(u);
      urls.clear();
    },
  };
}
