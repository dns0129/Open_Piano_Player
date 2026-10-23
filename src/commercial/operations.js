import {
  esc,
  date,
  money,
  stateLabels,
  layout,
  loginPrompt,
  createPage,
} from "./shared.js";
const root = document.querySelector("#operations-app"),
  state = {
    overview: null,
    users: [],
    jobs: [],
    feedback: [],
    audit: [],
    error: "",
    message: "",
    busy: false,
    dialog: null,
    challenge: null,
    retryAt: 0,
    policyDraft: null,
    inviteDraft: null,
  };
const page = createPage(() => {
    Object.assign(state, {
      overview: null,
      users: [],
      jobs: [],
      feedback: [],
      audit: [],
      dialog: null,
      challenge: null,
      policyDraft: null,
      inviteDraft: null,
    });
    render();
  }),
  { client } = page;
const $ = (s) => root.querySelector(s),
  $$ = (s) => [...root.querySelectorAll(s)];
const dollars = (n) => (Number(n) / 1000000).toString();
function micro(value) {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value))
    throw Error("金额须为非负美元数，最多六位小数。");
  const n = Math.round(Number(value) * 1000000);
  if (!Number.isSafeInteger(n) || n > 1000000000000)
    throw Error("金额超出允许范围。");
  return n;
}
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
  await client.initialize();
  if (client.session?.user.role !== "operator") return;
  const [overview, users, jobs, feedback, audit] = await Promise.all(
    ["overview", "users", "jobs", "feedback", "audit"].map((p) =>
      client.json("/operator/" + p),
    ),
  );
  Object.assign(state, {
    overview,
    users: users.users,
    jobs: jobs.jobs,
    feedback: feedback.feedback,
    audit: audit.events,
  });
}
function settings() {
  const p = state.overview.policy;
  return `<section class="commerce-card"><h2>任务与成本控制</h2><p>按每人每月任务数控制，不按页或谱行扣次。成本以服务端单价计算，包含未结算预留；供应商实际账单需另外核对。</p><p class="commerce-notice">${state.overview.providerConfigured ? "服务端模型配置已就绪。" : "服务端模型凭据或单价尚未配置；当前不可开启识谱。"}${p.pausedReason ? " 当前暂停原因：" + esc(p.pausedReason) : ""}</p><form data-policy><div class="commerce-form-grid"><label>默认每人每月任务数<input name="defaultTaskLimit" type="number" min="0" max="10000" value="${p.defaultTaskLimit}" required></label><label>全站同时处理任务数<input name="maxActive" type="number" min="1" max="4" value="${p.maxActive}" required></label><label>每日成本上限（USD）<input name="dailyCap" type="number" min="0" max="1000000" step=".01" value="${dollars(p.dailyCap)}" required></label><label>每月成本上限（USD）<input name="monthlyCap" type="number" min="0" max="1000000" step=".01" value="${dollars(p.monthlyCap)}" required></label><label>单任务成本上限（USD）<input name="jobCap" type="number" min="0" max="1000000" step=".01" value="${dollars(p.jobCap)}" required></label><label class="commerce-wide">公开公告<textarea name="announcement" maxlength="1000">${esc(p.announcement)}</textarea></label><label class="commerce-wide">帮助页联系说明<input name="supportContact" maxlength="300" value="${esc(p.supportContact)}"></label><label class="commerce-wide"><input name="enabled" type="checkbox" ${p.enabled ? "checked" : ""}>开启识谱接单（暂停原因清除前须核对全部未知用量）</label><label class="commerce-wide">调整原因<input name="reason" maxlength="500" required placeholder="本次预算、名额或公告调整的原因"></label></div><button class="primary" type="submit" ${state.busy ? "disabled" : ""}>保存运营设置</button><p class="commerce-muted">启用时须满足：0 &lt; 单任务上限 ≤ 每日上限 ≤ 每月上限。超出预算时保留任务并停止后续调用。</p></form></section>`;
}
function overview() {
  const o = state.overview;
  return `<section class="commerce-summary"><div><div class="commerce-eyebrow">QINBAN OPERATIONS</div><h1>运营控制台</h1><p>${esc(client.session.user.email)} · 仅运营账号可见</p></div><button class="commerce-button" data-refresh>刷新数据</button></section><div class="commerce-grid"><section class="commerce-card"><span class="commerce-muted">今日成本与预留</span><h2>${money(o.budget.dayCommitted)}</h2><small>上限 ${money(o.policy.dailyCap)} · ${esc(o.budget.day)} UTC</small></section><section class="commerce-card"><span class="commerce-muted">本月成本与预留</span><h2>${money(o.budget.monthCommitted)}</h2><small>上限 ${money(o.policy.monthlyCap)} · ${esc(o.budget.month)}</small></section><section class="commerce-card"><span class="commerce-muted">需要核对用量的调用</span><h2>${o.budget.unknown} 笔</h2><small>未知调用保留完整预留，不当作零成本。</small></section></div><section class="commerce-card"><h2>再次验证邮箱</h2><p>调整名额、预算、账号或反馈回复，需要最近 10 分钟内验证邮箱。</p><button data-send-reauth ${Date.now() < state.retryAt ? "disabled" : ""}>发送再次验证的验证码</button>${state.challenge ? '<form data-verify-reauth><label>8 位验证码<input name="code" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" required autocomplete="one-time-code"></label><button type="submit">完成再次验证</button></form>' : ""}<a class="commerce-toplink" href="/account.html">账号与本机验证邮箱说明</a></section>${settings()}${users()}${tasks()}${attempts()}${feedback()}${audit()}`;
}
function users() {
  return `<section class="commerce-card"><h2>邀请与账号</h2><form data-invite class="commerce-form-grid"><label>邀请邮箱<input name="email" type="email" required autocomplete="off"></label><label>邀请原因<input name="reason" maxlength="500" required></label><div><button type="submit">建立邀请</button></div></form><p class="commerce-muted">邀请建立后，用户通过自己的邮箱验证码登录；此操作不会替用户登录。</p><div class="commerce-table-wrap"><table class="commerce-table"><thead><tr><th>账号</th><th>状态</th><th>本月任务</th><th>操作</th></tr></thead><tbody>${state.users.map((u) => `<tr><td>${esc(u.email)}${u.isOperator ? "<br><small>运营账号</small>" : ""}</td><td>${esc({ active: "正常", disabled: "已暂停", deletion_pending: "注销等待期", deleting: "清理中" }[u.state] || u.state)}</td><td>${u.quota.used} / ${u.quota.limit}<br><small>${u.quota.period}</small></td><td>${["active", "disabled"].includes(u.state) ? `<button data-user="${u.id}">调整名额 / 状态</button>` : ""}</td></tr>`).join("")}</tbody></table></div></section>`;
}
function tasks() {
  return `<section class="commerce-card"><h2>最近任务与失败处理</h2><p class="commerce-muted">这里显示任务状态、调用数与成本，不提供用户私有曲谱或原图。</p><div class="commerce-table-wrap"><table class="commerce-table"><thead><tr><th>任务</th><th>账号</th><th>状态</th><th>调用 / 成本</th><th>名额</th></tr></thead><tbody>${state.jobs.map((j) => `<tr><td>${esc(j.jobId.slice(0, 12))}<br><small>${date(j.createdAt)}</small></td><td>${esc(state.users.find((u) => u.id === j.userId)?.email || j.userId.slice(0, 12))}</td><td>${esc(stateLabels[j.state] || j.state)}${j.errorCode ? "<br><small>" + esc(j.errorCode) + "</small>" : ""}</td><td>${j.dispatched} 次<br>${money(j.cost)}</td><td>${j.slotReleased ? "已退回名额" : ["queued", "running"].includes(j.state) ? "处理中" : `<button data-refund="${j.jobId}">补偿名额</button>`}</td></tr>`).join("")}</tbody></table></div></section>`;
}
function attempts() {
  return `<section class="commerce-card"><h2>调用与成本核对</h2><p class="commerce-muted">未知记录不会自动释放预算。录入已核对成本后，再保存运营设置恢复接单；记录与调整原因保留。</p><div class="commerce-table-wrap"><table class="commerce-table"><thead><tr><th>时间 / 任务</th><th>状态</th><th>预留 / 已计成本</th><th>实际 Tokens</th><th>核对</th></tr></thead><tbody>${state.overview.attempts.map((a) => `<tr><td>${date(a.createdAt)}<br>${esc(a.jobId.slice(0, 12))} · ${esc(a.regionId)}</td><td>${esc({ reserved: "已预留", settled: "用量已返回", unknown: "用量未知", rejected: "请求被拒绝", reconciled: "人工核对" }[a.state] || a.state)}</td><td>${money(a.reserved)} / ${money(a.cost)}</td><td>${a.usage && Number.isSafeInteger(a.usage.input) && Number.isSafeInteger(a.usage.output) ? `${a.usage.input} 输入<br>${a.usage.output} 输出` : a.usage?.observation ? esc(a.usage.observation.model || "模型未核实") + " / " + esc(a.usage.observation.effort || "档位未核实") : "未知"}</td><td>${a.state === "unknown" ? `<button data-resolve="${a.id}">录入核对结果</button>` : esc(a.resolutionNote || "—")}</td></tr>`).join("")}</tbody></table></div></section>`;
}
function feedback() {
  return `<section class="commerce-card"><h2>用户反馈</h2>${state.feedback.length ? state.feedback.map((f) => `<article class="commerce-feedback"><span class="commerce-tag">${esc(stateLabels[f.state] || f.state)}</span><p>${esc(state.users.find((u) => u.id === f.userId)?.email || f.userId.slice(0, 12))} · ${date(f.createdAt)} · ${esc(f.category)}</p><p>${esc(f.message)}</p>${f.reply ? `<blockquote>${esc(f.reply)}</blockquote>` : ""}<button data-reply="${f.id}">回复 / 更新状态</button></article>`).join("") : "<p>暂无反馈。</p>"}</section>`;
}
function audit() {
  return `<section class="commerce-card"><h2>运营操作记录</h2><div class="commerce-table-wrap"><table class="commerce-table"><thead><tr><th>时间</th><th>操作</th><th>对象</th></tr></thead><tbody>${state.audit.map((e) => `<tr><td>${date(e.createdAt)}</td><td>${esc(e.action)}</td><td>${esc(e.target)}</td></tr>`).join("")}</tbody></table></div></section>`;
}
function dialog() {
  const d = state.dialog;
  if (!d) return "";
  let fields = "";
  if (d.type === "user") {
    const u = state.users.find((u) => u.id === d.id);
    fields = `<p>${esc(u.email)}</p><label>每月任务上限<input name="taskLimit" type="number" min="0" max="10000" value="${u.quota.limit}" required></label><label>账号状态<select name="state"><option value="active" ${u.state === "active" ? "selected" : ""}>正常</option><option value="disabled" ${u.state === "disabled" ? "selected" : ""}>暂停并退出全部设备</option></select></label>`;
  }
  if (d.type === "resolve")
    fields =
      '<label>核对后的该次成本（USD）<input name="cost" type="number" min="0" max="1000" step=".000001" required></label>';
  if (d.type === "reply") {
    const f = state.feedback.find((f) => f.id === d.id);
    fields = `<p>${esc(f.message)}</p><label>处理状态<select name="state"><option value="open">待处理</option><option value="in_progress" ${f.state === "in_progress" ? "selected" : ""}>处理中</option><option value="resolved" ${f.state === "resolved" ? "selected" : ""}>已处理</option></select></label><label>给用户的回复<textarea name="reply" maxlength="4000">${esc(f.reply)}</textarea></label>`;
  } else
    fields +=
      '<label>调整原因<input name="reason" maxlength="500" required></label>';
  return `<dialog class="commerce-dialog commerce-card" open aria-label="运营调整"><h2>${esc({ user: "调整账号", refund: "补偿 1 个任务名额", resolve: "核对未知成本", reply: "处理反馈" }[d.type])}</h2><form data-dialog>${fields}<div class="commerce-actions"><button class="primary" type="submit">确认保存</button><button type="button" data-close-dialog>取消</button></div></form></dialog>`;
}
function render() {
  const s = client.session,
    body = !s
      ? loginPrompt(client.sessionExpired)
      : s.user.role !== "operator"
        ? '<section class="commerce-card commerce-empty"><h1>此页面仅向运营账号开放</h1><a class="commerce-button" href="/">返回自己的曲库</a></section>'
        : state.overview
          ? overview()
          : '<p role="status">正在读取运营数据…</p>';
  root.innerHTML = layout({
    active: "operations",
    session: s,
    body: body + dialog(),
    ...state,
  });
  bind();
  if (state.dialog) {
    const element = $("dialog");
    if (element && typeof element.showModal === "function") {
      element.removeAttribute("open");
      element.showModal();
    }
  }
}
function bind() {
  $("[data-refresh]")?.addEventListener("click", () => run(load));
  $("[data-policy]")?.addEventListener("input", (e) => {
    state.policyDraft = Object.fromEntries(new FormData(e.currentTarget));
  });
  $("[data-policy]")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.policyDraft = Object.fromEntries(f);
    run(async () => {
      const input = {
        revision: state.overview.policy.revision,
        enabled: f.has("enabled"),
        defaultTaskLimit: Number(f.get("defaultTaskLimit")),
        maxActive: Number(f.get("maxActive")),
        dailyCap: micro(f.get("dailyCap")),
        monthlyCap: micro(f.get("monthlyCap")),
        jobCap: micro(f.get("jobCap")),
        announcement: f.get("announcement"),
        supportContact: f.get("supportContact"),
        reason: f.get("reason"),
      };
      await client.json("/operator/policy", { method: "PUT", body: input });
      state.policyDraft = null;
      await load();
      state.message = "运营设置已保存。";
    });
  });
  $("[data-invite]")?.addEventListener("input", (e) => {
    state.inviteDraft = Object.fromEntries(new FormData(e.currentTarget));
  });
  $("[data-invite]")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = Object.fromEntries(new FormData(e.target));
    run(async () => {
      await client.json("/operator/invitations", {
        method: "POST",
        body: input,
      });
      state.inviteDraft = null;
      await load();
      state.message = "邀请已建立，请让受邀用户自行验证邮箱。";
    });
  });
  $("[data-send-reauth]")?.addEventListener("click", () =>
    run(async () => {
      state.challenge = await client.code({
        email: client.session.user.email,
        purpose: "reauth",
      });
      state.retryAt = Date.now() + 60000;
      setTimeout(render, 60000);
      state.message = "验证码已投递至当前账号邮箱。";
    }),
  );
  $("[data-verify-reauth]")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get("code");
    run(async () => {
      await client.verify({ challengeId: state.challenge.challengeId, code });
      state.challenge = null;
      state.message = "再次验证已完成。";
    });
  });
  for (const type of ["user", "refund", "resolve", "reply"])
    $$("[data-" + type + "]").forEach(
      (b) =>
        (b.onclick = () => {
          state.dialog = { type, id: b.dataset[type] };
          render();
        }),
    );
  $("[data-close-dialog]")?.addEventListener("click", () => {
    state.dialog = null;
    render();
  });
  $("dialog")?.addEventListener("cancel", () => {
    state.dialog = null;
  });
  $("[data-dialog]")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = state.dialog,
      input = Object.fromEntries(new FormData(e.target));
    d.input = { ...input };
    const path =
      d.type === "user"
        ? "/operator/users/" + d.id
        : d.type === "refund"
          ? "/operator/tasks/" + d.id + "/refund"
          : d.type === "resolve"
            ? "/operator/attempts/" + d.id + "/reconcile"
            : "/operator/feedback/" + d.id;
    run(async () => {
      if (d.type === "user") input.taskLimit = Number(input.taskLimit);
      if (d.type === "resolve") input.cost = micro(input.cost);
      await client.json(path, {
        method: ["user", "reply"].includes(d.type) ? "PUT" : "POST",
        body: input,
      });
      state.dialog = null;
      await load();
      state.message =
        d.type === "resolve"
          ? "成本核对已保存；核对全部未知记录后，可保存运营设置恢复接单。"
          : "调整已保存并记录。";
    });
  });
  for (const [selector, draft] of [
    ["[data-policy]", state.policyDraft],
    ["[data-invite]", state.inviteDraft],
    ["[data-dialog]", state.dialog?.input],
  ])
    if (draft) {
      const form = $(selector);
      if (form)
        for (const el of form.elements) {
          if (!el.name) continue;
          if (el.type === "checkbox")
            el.checked = Object.hasOwn(draft, el.name);
          else if (Object.hasOwn(draft, el.name)) el.value = draft[el.name];
        }
    }
}
run(load);
window.addEventListener("pageshow", (e) => {
  if (e.persisted) void run(load);
});
