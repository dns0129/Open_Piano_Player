import { esc, date, stateLabels, layout, createPage } from "./shared.js";
const root = document.querySelector("#commercial-app"),
  state = {
    records: [],
    jobs: [],
    feedback: [],
    quota: null,
    info: null,
    query: "",
    error: "",
    message: "",
    busy: false,
    nextCursor: null,
    feedbackDraft: { category: "recognition", message: "" },
  };
const page = createPage(() => {
    state.records = [];
    state.jobs = [];
    state.feedback = [];
    state.quota = null;
    state.feedbackDraft = { category: "recognition", message: "" };
    render();
  }),
  { client } = page;
const $ = (selector) => root.querySelector(selector);
async function run(fn) {
  if (state.busy) return;
  state.busy = true;
  state.error = "";
  render();
  try {
    await fn();
  } catch (e) {
    state.error = e.message;
  } finally {
    state.busy = false;
    render();
  }
}
async function load() {
  state.info = await client.json("/product");
  await client.initialize();
  if (!client.session) return;
  const results = await Promise.all([
    client.json("/library/entries?limit=30"),
    client.json("/recognition/jobs"),
    client.json("/recognition/quota"),
    client.json("/feedback"),
  ]);
  state.records = results[0].records;
  state.nextCursor = results[0].nextCursor;
  state.jobs = results[1].jobs;
  state.quota = results[2];
  state.feedback = results[3].feedback;
}
function guest() {
  return `<section class="commerce-hero"><div><div class="commerce-eyebrow">QINBAN · PRIVATE MUSIC LIBRARY</div><h1>把手里的谱，<br>变成每天都想练的谱。</h1><p>原谱私有保存，识别后对照核对。用自己的速度，分手、循环、反复练习。换一台设备，仍从自己的曲库开始。</p><div class="commerce-actions"><a class="commerce-button primary" href="/account.html">登录，建立自己的曲库</a><a class="commerce-button" href="/practice.html">体验练习室</a></div><p class="commerce-muted">邀请制开放。上传保存与识谱分开，识别任务开始前会检查可用名额。</p></div><div class="commerce-hero-art" aria-hidden="true"><div class="commerce-mini-score"><b>今天，慢一点也很好。</b><div class="commerce-staff">𝄞 ♩ ♫ ♩</div><small>自己的谱 · 自己的速度 · 每一次进步</small></div></div></section><div class="commerce-grid"><section class="commerce-card"><span class="commerce-tag">01 私有保存</span><h3>原谱和修改版都留下</h3><p>图片、PDF、数字谱放进自己的账号，历史修订随时可查。</p></section><section class="commerce-card"><span class="commerce-tag">02 托管识谱</span><h3>手机上传，后台处理</h3><p>选择完整谱行后开始任务，关闭页面也能回来查看进度。</p></section><section class="commerce-card"><span class="commerce-tag">03 对照练习</span><h3>核对后，按自己的节奏练</h3><p>把结构通过的识别结果另存为草稿，再核对、修改和播放。</p></section></div>`;
}
function library() {
  const q = state.query.toLowerCase(),
    records = state.records.filter((r) => r.title.toLowerCase().includes(q));
  return `<section class="commerce-summary"><div><div class="commerce-eyebrow">YOUR PRIVATE LIBRARY</div><h1>我的乐谱，随时接着练。</h1><p>${esc(client.session.user.email)}<br>原始曲谱与修改历史私有保存。</p><div class="commerce-actions"><a class="commerce-button primary" href="/recognition.html">拍照或上传识谱</a><a class="commerce-button" href="/account.html">导入数字谱与管理资料</a></div></div>${state.quota ? `<aside class="commerce-quota"><strong>${state.quota.remaining}</strong> 个本月可用任务<small>已用 ${state.quota.used} / ${state.quota.limit} · ${state.quota.period}</small></aside>` : ""}</section>${!state.info?.recognitionAvailable ? '<p class="commerce-notice">识谱服务暂未启用或已暂停。上传资料、已保存的乐谱和练习功能仍可使用。</p>' : ""}<div class="commerce-section-heading"><h2>私有曲库 <small class="commerce-muted">${state.records.length} 首已载入</small></h2><a href="/account.html">历史、备份与回收站</a></div><section class="commerce-card"><label for="score-search">查找曲目<input id="score-search" value="${esc(state.query)}" placeholder="输入曲名" maxlength="100"></label><div class="commerce-grid">${records.map((r) => `<article class="commerce-card commerce-score"><span class="commerce-tag">私有 · 修订 ${r.revision}</span><h3>${esc(r.title)}</h3><p class="commerce-muted">${date(r.updatedAt)}</p><a class="commerce-button" href="/practice.html?entry=${r.entryId}">打开练习</a></article>`).join("")}</div>${!records.length ? '<div class="commerce-empty"><p>还没有这首乐谱。可以导入数字文件，或拍照建立识谱任务。</p></div>' : ""}${state.nextCursor ? "<button data-more>继续载入曲目</button>" : ""}</section>${
    state.jobs.length
      ? `<section class="commerce-card"><h2>最近的识谱任务</h2>${state.jobs
          .slice(0, 4)
          .map(
            (j) =>
              `<article class="commerce-task-row"><div><strong>${esc(j.title)}</strong><span class="commerce-muted">${esc(stateLabels[j.state] || j.state)} · ${j.progress.complete}/${j.progress.total} 行</span></div><a class="commerce-button" href="/recognition.html?job=${j.jobId}">查看任务</a></article>`,
          )
          .join("")}</section>`
      : ""
  }`;
}
function support() {
  return `<section class="commerce-section commerce-card" id="support"><div class="commerce-eyebrow">HELP & FEEDBACK</div><h2>需要帮忙时，问题留在这里。</h2><p>原图应清楚、完整，框选时保留整条左右手谱表。AI 返回完整结构也需要对照原谱核对；播放顺畅不能证明逐音正确。</p><details><summary>什么情况下退回任务名额？</summary><p>取消排队任务或在发起识别前失败，名额会退回。已经调用模型的任务会保留使用记录；失败可提交反馈，由运营核对并补偿名额。服务不会自动重试付费请求。</p></details><details><summary>关闭页面后，任务会停止吗？</summary><p>已提交的任务在服务器继续处理。重新登录后可查看进度，成功行保留，只需重试未完成行。</p></details><details><summary>如何保存原始文件和历史？</summary><p>在“账号与资料”中下载完整备份、恢复历史或从回收站取回曲目。登录不会自动上传旧本机曲库。</p></details>${state.info?.supportContact ? `<p>联系说明：${esc(state.info.supportContact)}</p>` : ""}${client.session ? `<form data-feedback><label>问题类别<select name="category"><option value="recognition">识谱结果</option><option value="practice">手机或练习体验</option><option value="account">账号与曲库</option><option value="other">其他</option></select></label><label>问题描述<textarea name="message" maxlength="4000" required placeholder="描述遇到的步骤与现象。请勿填写密码或验证码。">${esc(state.feedbackDraft.message)}</textarea></label><button class="primary" type="submit" ${state.busy ? "disabled" : ""}>提交反馈</button></form>${state.feedback.map((f) => `<article class="commerce-feedback"><span class="commerce-tag">${esc(stateLabels[f.state] || f.state)}</span><p>${esc(f.message)}</p>${f.reply ? `<blockquote>运营回复：${esc(f.reply)}</blockquote>` : ""}<small>${date(f.createdAt)}</small></article>`).join("")}` : '<a class="commerce-button" href="/account.html">登录后提交反馈</a>'}</section>`;
}
function render() {
  root.innerHTML = layout({
    active: "library",
    session: client.session,
    body: (client.session ? library() : guest()) + support(),
    ...state,
  });
  bind();
}
function bind() {
  $("[data-feedback]")?.addEventListener("input", (e) => {
    state.feedbackDraft = Object.fromEntries(new FormData(e.currentTarget));
  });
  if ($("[data-feedback] select"))
    $("[data-feedback] select").value = state.feedbackDraft.category;
  $("[data-feedback]")?.addEventListener("change", (e) => {
    state.feedbackDraft = Object.fromEntries(new FormData(e.currentTarget));
  });
  $("#score-search")?.addEventListener("input", (e) => {
    state.query = e.target.value;
    const selection = e.target.selectionStart;
    render();
    $("#score-search").focus();
    $("#score-search").setSelectionRange(selection, selection);
  });
  $("[data-feedback]")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = Object.fromEntries(new FormData(e.target));
    const linked = new URL(location.href).searchParams.get("feedbackJob");
    if (linked) input.jobId = linked;
    run(async () => {
      await client.json("/feedback", { method: "POST", body: input });
      state.feedbackDraft = { category: "recognition", message: "" };
      state.feedback = (await client.json("/feedback")).feedback;
      state.message = "反馈已收到，可在这里查看处理结果。";
    });
  });
  $("[data-more]")?.addEventListener("click", () =>
    run(async () => {
      const p = await client.json(
        "/library/entries?limit=30&cursor=" + state.nextCursor,
      );
      state.records.push(...p.records);
      state.nextCursor = p.nextCursor;
    }),
  );
}
run(load);
window.addEventListener("pageshow", (e) => {
  if (e.persisted) void run(load);
});
window.addEventListener("focus", () => {
  if (!state.busy) void run(load);
});
