import { navigation } from "../commercial/shared.js";
import { createAccountClient } from "./client.js";
import {
  createSignInFlow,
  normalizeCode,
  normalizeInviteCode,
  formatInviteCode,
  safeNext,
  CODE_LENGTH,
} from "./sign-in.js";
import { importScore } from "../../lib/importers.mjs";
import { readScoreDocument } from "../../lib/score-document.ts";
import "../style.css";
import "./style.css";
const root = document.querySelector("#account-app"),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const account = createAccountClient(),
  state = {
    records: [],
    trash: false,
    busy: false,
    error: "",
    message: "",
    codeDraft: "",
    emailDraft: null,
    inviteDraft: "",
    inviteCheck: null,
    product: null,
    invites: null,
    quota: null,
    newInvite: null,
    context: null,
    devices: [],
    preview: null,
    localRecords: [],
    group: null,
    groups: [],
    pendingImages: [],
  };
let sessionStore = null;
try {
  sessionStore = window.sessionStorage;
} catch {}
const signIn = createSignInFlow({ account, storage: sessionStore });
// Where to return after signing in, e.g. account.html?next=/recognition.html
const params = new URLSearchParams(location.search),
  next = safeNext(params.get("next"));
// An invite link (account.html?invite=QB-…) opens registration with the code filled in.
if (params.get("invite")) state.inviteDraft = params.get("invite").slice(0, 20);
if (params.get("invite") || params.get("mode") === "register")
  signIn.setMode("register");
let resendTimer = null,
  inviteTimer = null;
const $ = (s) => root.querySelector(s),
  $$ = (s) => [...root.querySelectorAll(s)];
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
  if (!account.session) return;
  state.records = (
    await account.json("/library/entries?limit=100&deleted=" + state.trash)
  ).records;
  state.devices = (await account.json("/sessions")).sessions;
  state.groups = (await account.json("/source-groups")).groups;
  // Invites and quota are optional services; the library stays usable without them.
  state.invites = await account.json("/invites").catch(() => null);
  state.quota = await account.json("/recognition/quota").catch(() => null);
}
const registration = () => state.product?.registration || { open: true };
function render() {
  const s = account.session;
  root.innerHTML = `${navigation("account", s)}<main class="account-shell"><header class="account-heading"><a href="/">← 返回我的曲库</a><span>账号与原始资料</span></header>${state.context?.profile === "local-validation" ? '<div class="account-notice">商业版本机预览：账号和文件保存在独立数据库。验证码写入开发邮箱，未发送真实邮件。</div>' : ""}<div role="alert" class="account-error">${esc(state.error)}</div><div role="status" class="account-message">${esc(state.message)}</div>${!s ? login() : s.user.state === "deletion_pending" ? `<section class="account-card"><h1>恢复账号</h1><p>已验证 ${esc(s.user.email)}，可以在等待期内恢复账号。</p><button data-recover>恢复账号</button></section>` : dashboard(s)}<div class="account-busy" role="status">${state.busy ? "正在处理，请稍候…" : ""}</div></main>`;
  bind();
}
function resendLabel(seconds) {
  return seconds > 0 ? `${seconds} 秒后可重新发送` : "重新发送验证码";
}
function inviteStatus() {
  const check = state.inviteCheck;
  if (!check) return "";
  if (check.pending)
    return '<span class="invite-pending">正在核对邀请码…</span>';
  return check.valid
    ? `<span class="invite-ok">邀请码有效${check.bonusTasks ? `，注册后获赠 ${check.bonusTasks} 个识谱任务` : ""}</span>`
    : '<span class="invite-bad">邀请码无效、已过期或已用完</span>';
}
// One card for both: the email gets a code, and the first verified sign-in creates the account.
function login() {
  const flow = signIn.state,
    busy = state.busy || flow.busy,
    register = flow.mode === "register",
    open = registration().open;
  const mailbox = state.context?.mailboxDirectory
    ? `<p class="account-help">本机开发邮箱：<code>${esc(state.context.mailboxDirectory)}</code>。生成邀请码：<code>npm run accounts:invite-code -- --uses 10 --bonus 3</code></p>`
    : "";
  if (flow.step === "code")
    return `<section class="account-card auth-card"><p class="eyebrow">${register ? "注册" : "登录"} · 第 2 步，共 2 步</p><h1>输入验证码</h1><p class="auth-lead">验证码已发往 <strong>${esc(flow.email)}</strong>，10 分钟内有效。</p>${register && flow.inviteCode ? `<p class="invite-chip">邀请码 <code>${esc(flow.inviteCode)}</code> 将在注册完成时使用</p>` : ""}<form data-verify><label>${CODE_LENGTH} 位验证码<input class="login-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="20" placeholder="${"0".repeat(CODE_LENGTH)}" value="${esc(state.codeDraft)}" required></label><button type="submit" ${busy ? "disabled" : ""}>${busy ? "正在验证…" : register ? "完成注册" : "登录"}</button></form><div class="login-links"><button type="button" class="link-button" data-resend ${busy || flow.secondsUntilResend > 0 ? "disabled" : ""}>${resendLabel(flow.secondsUntilResend)}</button><button type="button" class="link-button" data-change-email>换个邮箱</button></div>${mailbox}</section>`;
  const tabs = `<div class="auth-tabs" role="tablist" aria-label="登录或注册"><button type="button" role="tab" data-auth-mode="login" aria-selected="${!register}">登录</button><button type="button" role="tab" data-auth-mode="register" aria-selected="${register}">注册</button></div>`;
  const email = `<label>邮箱<input type="email" name="email" autocomplete="email" value="${esc(state.emailDraft ?? flow.email)}" required></label>`;
  if (register)
    return `<section class="account-card auth-card">${tabs}<h1>${next ? "注册后继续" : "创建账号"}</h1><p class="auth-lead">${open ? "用邮箱注册，无需密码。曲谱默认私有保存；有邀请码可额外获赠识谱任务。" : "目前仅限邀请注册，请填写邀请码。"}</p><form data-login>${email}<label>邀请码${open ? '<span class="optional">选填</span>' : ""}<input name="invite" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="QB-XXXXX-XXXXX" value="${esc(state.inviteDraft)}" ${open ? "" : "required"}></label><p class="invite-status" data-invite-status role="status">${inviteStatus()}</p><button type="submit" ${busy ? "disabled" : ""}>${busy ? "正在发送…" : "注册并获取验证码"}</button></form><p class="account-hint">已有账号？切换到「登录」即可；本设备曲库不会自动上传。</p>${mailbox}</section>`;
  return `<section class="account-card auth-card">${tabs}<h1>${next ? "登录后继续" : "欢迎回来"}</h1><p class="auth-lead">用邮箱验证码登录，无需密码。</p><form data-login>${email}<button type="submit" ${busy ? "disabled" : ""}>${busy ? "正在发送…" : "获取验证码"}</button></form><p class="account-hint">还没有账号？切换到「注册」。账号在注销等待期内，用原邮箱登录即可恢复。</p>${mailbox}</section>`;
}
// After a successful sign-in, go back to the page that asked for it.
async function afterSignIn({ session, isNewAccount, invite }) {
  state.codeDraft = "";
  state.inviteDraft = "";
  state.inviteCheck = null;
  if (next && session.user.state !== "deletion_pending") {
    state.message = "已登录，正在返回…";
    location.replace(next);
    return;
  }
  await load();
  state.message =
    session.user.state === "deletion_pending"
      ? "邮箱已验证，可以恢复账号。"
      : isNewAccount
        ? `注册完成，欢迎来到琴伴。${invite?.bonusTasks ? `已获赠 ${invite.bonusTasks} 个识谱任务。` : ""}曲谱默认私有保存，可以从「上传识谱」开始。`
        : "欢迎回来，已登录。";
}
// Re-check the invite code shortly after typing stops; the status updates in place.
function scheduleInviteCheck(value) {
  clearTimeout(inviteTimer);
  const raw = normalizeInviteCode(value);
  const show = () => {
    const target = $("[data-invite-status]");
    if (target) target.innerHTML = inviteStatus();
  };
  if (!raw) {
    state.inviteCheck = null;
    return show();
  }
  if (
    state.inviteCheck?.code === formatInviteCode(raw) &&
    !state.inviteCheck.pending
  )
    return show();
  state.inviteCheck = { pending: true, code: formatInviteCode(raw) };
  show();
  inviteTimer = setTimeout(async () => {
    try {
      const result = await signIn.checkInvite(raw);
      if (normalizeInviteCode(state.inviteDraft) === raw)
        state.inviteCheck = result;
    } catch (error) {
      state.inviteCheck = null;
      state.error = error.message;
    }
    show();
  }, 400);
}
function bindSignIn() {
  clearInterval(resendTimer);
  const emailInput = $("[data-login] input[name=email]"),
    inviteInput = $("[data-login] input[name=invite]"),
    codeInput = $("[data-verify] input[name=code]");
  if (!state.busy)
    (codeInput || (emailInput?.value ? null : emailInput))?.focus();
  $$("[data-auth-mode]").forEach((tab) =>
    tab.addEventListener("click", () => {
      signIn.setMode(tab.dataset.authMode);
      state.error = "";
      state.message = "";
      render();
    }),
  );
  emailInput?.addEventListener("input", () => {
    state.emailDraft = emailInput.value;
  });
  if (inviteInput) {
    inviteInput.addEventListener("input", () => {
      state.inviteDraft = inviteInput.value;
      scheduleInviteCheck(inviteInput.value);
    });
    if (state.inviteDraft && !state.inviteCheck)
      scheduleInviteCheck(state.inviteDraft);
  }
  $("[data-login]")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.target),
      register = signIn.state.mode === "register";
    run(async () => {
      if (
        register &&
        state.inviteCheck &&
        !state.inviteCheck.valid &&
        !state.inviteCheck.pending
      )
        throw new Error("邀请码无效、已过期或已用完；可以清空后直接注册。");
      await signIn.requestCode(form.get("email"), {
        mode: register ? "register" : "login",
        inviteCode: register ? form.get("invite") || "" : "",
      });
      state.emailDraft = null;
      state.codeDraft = "";
      state.message = "验证码已发送，通常一分钟内送达。";
    });
  });
  if (codeInput) {
    codeInput.focus();
    codeInput.setSelectionRange(codeInput.value.length, codeInput.value.length);
    codeInput.addEventListener("input", () => {
      const digits = normalizeCode(codeInput.value);
      codeInput.value = digits;
      state.codeDraft = digits;
      // Submit as soon as the full code is typed or pasted.
      if (digits.length === CODE_LENGTH && !state.busy)
        $("[data-verify]").requestSubmit();
    });
    $("[data-verify]").addEventListener("submit", (e) => {
      e.preventDefault();
      run(async () => {
        const result = await signIn.verify(codeInput.value);
        if (result) await afterSignIn(result);
      });
    });
    const resend = $("[data-resend]");
    // Count down in place; re-rendering every second would reset the code field.
    resendTimer = setInterval(() => {
      const seconds = signIn.state.secondsUntilResend;
      resend.textContent = resendLabel(seconds);
      resend.disabled = state.busy || seconds > 0;
      if (!seconds) clearInterval(resendTimer);
    }, 1000);
    resend.addEventListener("click", () =>
      run(async () => {
        await signIn.resend();
        state.codeDraft = "";
        state.message = "新的验证码已发送，旧验证码随即失效。";
      }),
    );
    $("[data-change-email]").addEventListener("click", () => {
      signIn.changeEmail();
      state.codeDraft = "";
      state.message = "";
      state.error = "";
      render();
    });
  }
}
const inviteLink = (code) =>
  `${location.origin}/account.html?invite=${encodeURIComponent(code)}`;
function inviteState(code) {
  if (code.uses > 0) return "好友已注册";
  if (code.disabled) return "已撤销";
  if (code.expiresAt && new Date(code.expiresAt) <= new Date()) return "已过期";
  return "未使用";
}
// Invite friends, redeem a code once, and see bonus recognition tasks.
function inviteCard() {
  const inv = state.invites;
  if (!inv) return "";
  const quota = state.quota
    ? `<p class="account-hint">识谱任务：本月剩余 ${state.quota.monthlyRemaining ?? state.quota.remaining} 个${state.quota.credits ? ` · 赠送剩余 ${state.quota.credits} 个` : ""}</p>`
    : "";
  const created = inv.codes.filter((c) => !c.disabled || c.uses > 0).length,
    canCreate = inv.limit > 0 && created < inv.limit;
  const reveal = state.newInvite
    ? `<div class="invite-reveal"><p>新的邀请码（完整码只显示这一次）</p><code class="invite-code">${esc(state.newInvite)}</code><div class="invite-actions"><button type="button" data-copy="${esc(state.newInvite)}">复制邀请码</button><button type="button" data-copy="${esc(inviteLink(state.newInvite))}">复制邀请链接</button></div></div>`
    : "";
  const list = inv.codes.length
    ? `<ul class="invite-list">${inv.codes.map((c) => `<li><code>QB-•••••-•${esc(c.hint)}</code><span class="invite-state">${inviteState(c)}</span><small>${c.expiresAt ? "有效期至 " + esc(new Date(c.expiresAt).toLocaleDateString()) : ""}</small>${inviteState(c) === "未使用" ? `<button type="button" data-invite-revoke="${c.id}">撤销</button>` : ""}</li>`).join("")}</ul>`
    : "";
  const redeem = inv.redemption
    ? `<p class="account-hint">已使用邀请码${inv.redemption.bonusTasks ? `，获赠 ${inv.redemption.bonusTasks} 个识谱任务` : ""}。</p>`
    : '<form data-invite-redeem class="invite-redeem"><label>有邀请码？<input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="QB-XXXXX-XXXXX" required></label><button type="submit">兑换</button></form>';
  return `<section class="account-card invite-card"><div class="account-row"><div><h2>邀请好友</h2><p>${inv.limit ? `好友用你的邀请码注册，可获赠 ${inv.bonusTasks} 个识谱任务。每个账号可生成 ${inv.limit} 个，已生成 ${created} 个。` : "好友邀请暂未开放。"}</p></div>${inv.limit ? `<button type="button" data-invite-create ${canCreate ? "" : "disabled"}>生成邀请码</button>` : ""}</div>${reveal}${list}${redeem}${quota}</section>`;
}
function bindInvites() {
  $("[data-invite-create]")?.addEventListener("click", () =>
    run(async () => {
      const created = await account.json("/invites", {
        method: "POST",
        body: {},
      });
      state.newInvite = created.code;
      await load();
      state.message = "邀请码已生成，复制后发给好友即可。";
    }),
  );
  $$("[data-invite-revoke]").forEach((b) =>
    b.addEventListener("click", () =>
      run(async () => {
        await account.json("/invites/" + b.dataset.inviteRevoke, {
          method: "DELETE",
          body: {},
        });
        await load();
        state.message = "邀请码已撤销。";
      }),
    ),
  );
  $$("[data-copy]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        state.message = "已复制。";
      } catch {
        state.message = "无法自动复制，请手动选中复制：" + b.dataset.copy;
      }
      render();
    }),
  );
  $("[data-invite-redeem]")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get("code");
    run(async () => {
      const raw = normalizeInviteCode(code);
      if (!raw) throw new Error("邀请码格式不正确，应类似 QB-7KX2M-P9QRT。");
      const result = await account.json("/invites/redeem", {
        method: "POST",
        body: { code: formatInviteCode(raw) },
      });
      await load();
      state.message = result.bonusTasks
        ? `兑换成功，获赠 ${result.bonusTasks} 个识谱任务。`
        : "兑换成功。";
    });
  });
}
function dashboard(s) {
  return `<section class="account-card"><div class="account-row"><div><h1>我的私有曲库</h1><p>${esc(s.user.email)} · ${state.records.length} 首${state.trash ? "已回收" : ""}曲目</p></div><button data-logout>退出账号</button></div><div class="account-actions"><label class="account-file">导入数字乐谱<input data-digital type="file" accept=".json,.mid,.midi,.xml,.musicxml,.mxl" hidden></label><label class="account-file">保存原始图片<input data-images type="file" accept="image/png,image/jpeg,image/webp" multiple hidden></label><label class="account-file">保存原始 PDF<input data-pdf type="file" accept="application/pdf,.pdf" hidden></label><button data-export>下载完整备份</button><label class="account-file">恢复备份<input data-backup type="file" accept=".json" hidden></label><button data-local>选择导入本机曲库</button><button data-trash>${state.trash ? "返回曲库" : "回收站"}</button></div>${state.group ? `<p class="account-notice">原始资料已私有保存：${state.group.pages.length} 页，来源组 ${esc(state.group.sourceGroupId)}。本页面不调用识谱模型。</p>` : ""}<div class="account-list">${state.records.length ? state.records.map((r) => `<article class="account-record"><div><strong>${esc(r.title)}</strong><small>修订 ${r.revision} · ${esc(new Date(r.updatedAt).toLocaleString())} · 私有</small></div><div>${state.trash ? `<button data-restore="${r.entryId}">恢复</button>` : `<a href="/practice.html?entry=${r.entryId}">打开练习</a><button data-history="${r.entryId}">历史</button><button data-delete="${r.entryId}">移到回收站</button>`}</div></article>`).join("") : '<p class="account-empty">曲库暂无内容。导入不会公开曲谱。</p>'}</div></section>${inviteCard()}${state.pendingImages.length ? imageOrder() : ""}${sourceGroups()}${state.preview ? preview() : ""}${state.localRecords.length ? localSelection() : ""}<section class="account-card"><h2>设备与账号</h2>${state.devices.map((d) => `<div class="account-row"><span>${esc(d.device)} ${d.current ? "（当前设备）" : ""}</span><button data-revoke="${d.id}">退出此设备</button></div>`).join("")}<form data-reauth><p>备份、退出所有设备和注销需要近期邮箱验证。</p><button type="submit">重新发送验证邮件</button>${state.reauthChallenge ? '<input name="code" placeholder="8 位验证码" inputmode="numeric" pattern="[0-9]{8}"><button data-reauth-verify type="button">完成再次验证</button>' : ""}</form><button data-logout-all>退出所有设备</button><button data-delete-account class="danger">申请注销账号</button></section>`;
}
function imageOrder() {
  return `<section class="account-card"><h2>核对原图页序</h2><p>原文件保持不变。请按谱面顺序调整后保存。</p>${state.pendingImages.map((f, i) => `<div class="account-row"><span>第 ${i + 1} 页 · ${esc(f.name)} · ${(f.size / 1048576).toFixed(2)} MiB</span><div><button data-image-move="-1" data-index="${i}" ${i === 0 ? "disabled" : ""}>上移</button><button data-image-move="1" data-index="${i}" ${i === state.pendingImages.length - 1 ? "disabled" : ""}>下移</button></div></div>`).join("")}<button data-save-images>按此页序保存到账号</button><button data-cancel-images>取消</button></section>`;
}
function sourceGroups() {
  if (!account.session || !state.groups.length) return "";
  return `<section class="account-card"><h2>已保存的原始资料</h2><p>这些原始资料保存在账号中，尚未附加数字谱时也可重新下载。</p>${state.groups.map((g) => `<article class="account-record"><div><strong>${esc(g.kind)} · ${g.pages.length} 页</strong><small>${esc(g.sourceGroupId)}</small></div><div>${g.kind === "pdf" ? `<button data-source-download="${g.pages[0].originalResourceId}">下载原始 PDF</button>` : g.pages.map((p) => `<button data-source-download="${p.originalResourceId}">下载第 ${p.ordinal} 页</button>`).join("")}<button data-source-delete="${g.sourceGroupId}">删除未使用资料</button></div></article>`).join("")}</section>`;
}
function preview() {
  return `<section class="account-card"><h2>确认导入到 ${esc(state.preview.targetEmail)}</h2><p>本机原数据保留；冲突默认另存副本。</p>${state.preview.items.map((i) => `<div class="account-row"><span>${esc(i.documentId)} · ${esc(i.state)}</span><select data-decision="${esc(i.documentId)}"><option value="copy">导入或另存副本</option><option value="skip">跳过</option>${i.state === "conflict" ? '<option value="replace">覆盖预览中的当前版本</option>' : ""}</select></div>`).join("")}<button data-commit>确认导入所选内容</button><button data-cancel-preview>取消</button></section>`;
}
function localSelection() {
  return `<section class="account-card"><h2>选择本机曲库内容</h2><p>只上传勾选的曲目及其原图和历史，目标账号 ${esc(account.session.user.email)}。</p>${state.localRecords.map((r) => `<label class="account-row"><span>${esc(r.title)} · 修订 ${r.revision}</span><input type="checkbox" data-local-id="${esc(r.id)}"></label>`).join("")}<button data-local-import>上传选中内容并预览</button><button data-local-cancel>取消</button></section>`;
}
function bind() {
  bindSignIn();
  bindInvites();
  $("[data-recover]")?.addEventListener("click", () =>
    run(async () => {
      await account.json("/account/recover", { method: "POST", body: {} });
      await account.initialize();
      if (next) {
        location.replace(next);
        return;
      }
      await load();
      state.message = "账号已恢复。";
    }),
  );
  $("[data-logout]")?.addEventListener("click", () =>
    run(async () => {
      await account.logout();
      state.records = [];
      state.preview = null;
      state.localRecords = [];
      state.context = await account.loginContext();
      state.message = "已退出当前账号。";
    }),
  );
  $("[data-trash]")?.addEventListener("click", () =>
    run(async () => {
      state.trash = !state.trash;
      await load();
    }),
  );
  $("[data-digital]")?.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f)
      run(async () => {
        const parsed = await importScore(f),
          r = await account.upload(f, { purpose: "digital" });
        await account.json("/library/entries", {
          method: "POST",
          body: {
            expectedRevision: 0,
            document: readScoreDocument(parsed.score || parsed),
            sourceNotation: null,
            sourceGroupIds: [],
            assets: [
              {
                resourceId: r.resourceId,
                assetId: "original-file",
                role: "original",
              },
            ],
            warnings: parsed.warnings || [],
          },
        });
        await load();
        state.message = "已保存到账号，可打开练习。";
      });
  });
  $("[data-pdf]")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file)
      run(async () => {
        const r = await account.upload(file);
        state.group = await account.json("/source-groups", {
          method: "POST",
          body: {
            kind: "pdf",
            pages: Array.from({ length: r.pages }, (_, i) => ({
              ordinal: i + 1,
              originalResourceId: r.resourceId,
              scope: "full_page",
            })),
          },
        });
        await load();
        state.message = "原始 PDF 已私有保存，未发起识谱。";
      });
  });
  $("[data-images]")?.addEventListener("change", (e) => {
    const files = [...e.target.files];
    if (files.length > 6) {
      state.error = "每组最多 6 张图片。";
      render();
      return;
    }
    state.pendingImages = files;
    render();
  });
  $("[data-save-images]")?.addEventListener("click", () =>
    run(async () => {
      const pages = [];
      for (const f of state.pendingImages) {
        const r = await account.upload(f);
        pages.push({
          ordinal: pages.length + 1,
          originalResourceId: r.resourceId,
          scope: "unknown",
        });
      }
      state.group = await account.json("/source-groups", {
        method: "POST",
        body: { kind: "images", pages },
      });
      state.pendingImages = [];
      await load();
      state.message = "原图已保存到账号；未发起识谱。";
    }),
  );
  $("[data-cancel-images]")?.addEventListener("click", () => {
    state.pendingImages = [];
    render();
  });
  $$("[data-image-move]").forEach(
    (b) =>
      (b.onclick = () => {
        const index = Number(b.dataset.index),
          next = index + Number(b.dataset.imageMove);
        if (next >= 0 && next < state.pendingImages.length)
          [state.pendingImages[index], state.pendingImages[next]] = [
            state.pendingImages[next],
            state.pendingImages[index],
          ];
        render();
      }),
  );
  $$("[data-source-download]").forEach(
    (b) =>
      (b.onclick = () => run(() => account.download(b.dataset.sourceDownload))),
  );
  $$("[data-source-delete]").forEach(
    (b) =>
      (b.onclick = () =>
        run(async () => {
          await account.json("/source-groups/" + b.dataset.sourceDelete, {
            method: "DELETE",
            body: {},
          });
          await load();
          state.message = "已删除未关联曲谱的原始资料组。";
        })),
  );
  $("[data-backup]")?.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f)
      run(async () => {
        const r = await account.upload(f, { purpose: "backup" });
        state.preview = await account.json("/library/imports/preview", {
          method: "POST",
          body: { uploadId: r.uploadId },
        });
        state.message = "请核对目标账号和导入内容。";
      });
  });
  $("[data-commit]")?.addEventListener("click", () => {
    const decisions = $$("[data-decision]").map((s) => ({
      documentId: s.dataset.decision,
      decision: s.value,
      expectedRevision: state.preview.items.find(
        (i) => i.documentId === s.dataset.decision,
      ).expectedRevision,
    }));
    run(async () => {
      const r = await account.json(
        "/library/imports/" + state.preview.importId + "/commit",
        {
          method: "POST",
          body: { previewDigest: state.preview.previewDigest, decisions },
        },
      );
      state.message = "导入结果：" + r.items.map((i) => i.state).join("、");
      state.preview = null;
      state.localRecords = [];
      await load();
    });
  });
  $("[data-cancel-preview]")?.addEventListener("click", () => {
    state.preview = null;
    render();
  });
  $("[data-export]")?.addEventListener("click", () =>
    run(async () => {
      const r = await account.json("/library/exports", {
        method: "POST",
        body: { includeHistory: true },
      });
      if (r.state !== "ready") throw Error("备份尚未就绪，请稍后重试。");
      await account.download(r.resourceId, "琴伴私有曲库备份.json");
      state.message = "完整备份已生成。";
    }),
  );
  $("[data-local]")?.addEventListener("click", () =>
    run(async () => {
      state.localRecords = (await account.json("/device-library")).records;
      if (!state.localRecords.length)
        state.message = "本机曲库暂无可导入记录。";
    }),
  );
  $("[data-local-cancel]")?.addEventListener("click", () => {
    state.localRecords = [];
    render();
  });
  $("[data-local-import]")?.addEventListener("click", () => {
    const ids = $$("[data-local-id]:checked").map((x) => x.dataset.localId);
    run(async () => {
      if (!ids.length) throw Error("请选择要上传的曲目。");
      const b = await account.json("/device-library/export", {
          method: "POST",
          body: { ids },
        }),
        r = await account.upload(
          new File([JSON.stringify(b)], "device-library.json", {
            type: "application/json",
          }),
          { purpose: "backup" },
        );
      state.preview = await account.json("/library/imports/preview", {
        method: "POST",
        body: { uploadId: r.uploadId },
      });
    });
  });
  $$("[data-delete]").forEach(
    (b) =>
      (b.onclick = () =>
        run(async () => {
          const r = state.records.find((r) => r.entryId === b.dataset.delete);
          await account.json(
            "/library/entries/" + r.entryId + "?expectedRevision=" + r.revision,
            { method: "DELETE", body: {} },
          );
          await load();
          state.message = "已移到回收站，保留 30 天。";
        })),
  );
  $$("[data-restore]").forEach(
    (b) =>
      (b.onclick = () =>
        run(async () => {
          const r = state.records.find((r) => r.entryId === b.dataset.restore);
          await account.json("/library/entries/" + r.entryId + "/restore", {
            method: "POST",
            body: { expectedRevision: r.revision },
          });
          await load();
          state.message = "已恢复为新修订。";
        })),
  );
  $$("[data-history]").forEach(
    (b) =>
      (b.onclick = () =>
        run(async () => {
          const r = state.records.find((r) => r.entryId === b.dataset.history),
            h = await account.json(
              "/library/entries/" + r.entryId + "/revisions",
            );
          const choice = window.prompt(
            "已有修订：" +
              h.revisions.map((r) => r.revision).join("、") +
              "。输入要恢复的编号，取消则只查看。",
          );
          if (choice) {
            await account.json("/library/entries/" + r.entryId + "/restore", {
              method: "POST",
              body: {
                expectedRevision: r.revision,
                targetRevision: Number(choice),
              },
            });
            await load();
            state.message = "历史已恢复为新修订。";
          }
        })),
  );
  $$("[data-revoke]").forEach(
    (b) =>
      (b.onclick = () =>
        run(async () => {
          const own = b.dataset.revoke === account.session.sessionId;
          await account.json("/sessions/" + b.dataset.revoke, {
            method: "DELETE",
            body: {},
          });
          if (own) {
            await account.initialize();
            state.records = [];
          } else await load();
        })),
  );
  $("[data-reauth]")?.addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => {
      state.reauthChallenge = await account.code({
        email: account.session.user.email,
        purpose: "reauth",
      });
      state.message = "再次验证的验证码已投递。";
    });
  });
  $("[data-reauth-verify]")?.addEventListener("click", () => {
    const code = $("[data-reauth] input").value;
    run(async () => {
      await account.verify({
        challengeId: state.reauthChallenge.challengeId,
        code,
      });
      state.reauthChallenge = null;
      state.message = "再次验证完成。";
    });
  });
  $("[data-logout-all]")?.addEventListener("click", () =>
    run(async () => {
      await account.json("/auth/logout-all", { method: "POST", body: {} });
      await account.initialize();
      state.records = [];
      state.context = await account.loginContext();
    }),
  );
  $("[data-delete-account]")?.addEventListener("click", () => {
    if (
      window.confirm(
        "申请注销后会退出全部设备，30 天内可用原邮箱恢复。是否继续？",
      )
    )
      run(async () => {
        await account.json("/account", { method: "DELETE", body: {} });
        await account.initialize();
        state.records = [];
        state.context = await account.loginContext();
        state.message = "已申请注销，30 天内可以恢复。";
      });
  });
}
account.subscribe(() => {
  state.invites = null;
  state.quota = null;
  state.newInvite = null;
  state.records = [];
  state.devices = [];
  state.preview = null;
  state.localRecords = [];
  state.group = null;
  state.groups = [];
  state.pendingImages = [];
  render();
});
run(async () => {
  state.context = await account.loginContext();
  // Registration policy (open or invite-only); the form works without it.
  state.product = await account.json("/product").catch(() => null);
  await account.initialize();
  // Already signed in (for example in another tab): go straight on.
  if (
    next &&
    account.session &&
    account.session.user.state !== "deletion_pending"
  ) {
    location.replace(next);
    return;
  }
  await load();
});
// Returning to the window refreshes the data of a signed-in account. On the sign-in
// card it only checks quietly whether another tab signed in, so typed input stays.
window.addEventListener("focus", () => {
  if (state.busy) return;
  void account
    .initialize()
    .then(() => (account.session ? run(load) : undefined))
    .catch(() => {});
});
window.addEventListener("pagehide", () => account.clearLocal());
window.addEventListener("pageshow", (event) => {
  if (event.persisted && !state.busy)
    void run(async () => {
      await account.initialize();
      await load();
    });
});
