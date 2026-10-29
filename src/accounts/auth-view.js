import { CODE_LENGTH } from "./sign-in.js";
import { escapeHTML as esc } from "../html.js";

const eye = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;

export function authLayout({ content, error, message, busy }) {
  return `<main class="auth-page"><aside class="auth-scene" aria-label="阳光下的钢琴练习室"><a class="auth-brand" href="/" aria-label="琴伴首页"><svg viewBox="0 0 44 48" fill="none" aria-hidden="true"><rect x="1.5" y="1.5" width="41" height="45" rx="1" stroke="currentColor" stroke-width="2"/><path d="M12 2v44m10-44v44m10-44v44" stroke="currentColor" stroke-width="1.4"/><path d="M9 2v28m10-28v28m10-28v28m10-28v28" stroke="currentColor" stroke-width="6"/></svg><span>琴伴<small>QINBAN</small></span></a><div class="auth-scene-copy"><h2>让每一次练习，<br>都有回响</h2><p>读懂乐谱，专注弹奏。</p></div><p class="auth-scene-caption">你的随身钢琴练习伙伴</p></aside><section class="auth-panel"><div class="auth-content"><div class="account-error" role="alert" ${error ? "" : "hidden"}>${esc(error)}</div><div class="account-message" role="status" ${message ? "" : "hidden"}>${esc(message)}</div>${content}<div class="account-busy" role="status">${busy ? "正在处理，请稍候…" : ""}</div></div><footer class="auth-footer"><a href="/">返回琴伴</a><button type="button" data-auth-info="help">帮助中心</button></footer></section></main><dialog class="auth-dialog" aria-labelledby="auth-dialog-title"><h2 id="auth-dialog-title"></h2><div data-auth-info-body></div><form method="dialog"><button>我知道了</button></form></dialog>`;
}

export function authForm({
  flow,
  state,
  next,
  open,
  inviteStatus,
  resendLabel,
}) {
  const busy = state.busy || flow.busy,
    register = flow.mode === "register",
    reset = flow.mode === "reset",
    codeStep = flow.step === "code",
    passwordMethod = !register && !reset && state.authMethod === "password";
  const heading = reset
    ? "找回你的登录密码"
    : register
      ? "开启你的音乐旅程"
      : next
        ? "登录后继续练习"
        : "登录你的音乐世界";
  const lead = reset
    ? "验证账号邮箱，安全设置新密码"
    : register
      ? "收藏喜欢的乐谱，让练习日有所进"
      : "收藏乐谱，继续你的练习旅程";
  const passwordField = (confirm = false) =>
    `<label class="auth-field">${confirm ? "确认密码" : codeStep ? "设置新密码" : "密码"}<span class="auth-password"><input name="${confirm ? "confirmPassword" : "password"}" type="${state.passwordVisible ? "text" : "password"}" autocomplete="${codeStep ? "new-password" : "current-password"}" ${codeStep ? 'minlength="12"' : ""} maxlength="128" placeholder="${confirm ? "请再次输入新密码" : codeStep ? "12–128 个字符，可使用空格和中文" : "请输入密码"}" value="${esc(confirm ? state.passwordConfirmDraft : state.passwordDraft)}" required ${busy ? "disabled" : ""}>${confirm ? "" : `<button type="button" class="auth-eye" data-toggle-password aria-label="${state.passwordVisible ? "隐藏密码" : "显示密码"}" aria-pressed="${state.passwordVisible}">${eye}</button>`}</span></label>`;
  const consent = `<label class="auth-consent"><input type="checkbox" name="consent" ${state.consent ? "checked" : ""} required ${busy ? "disabled" : ""}><span>我已阅读并同意 <button type="button" data-auth-info="terms">《用户协议》</button>和 <button type="button" data-auth-info="privacy">《隐私政策》</button></span></label>`;
  const disabled = busy ? "disabled" : "";
  let form;
  if (codeStep) {
    form = `<p class="auth-code-destination">请输入发往 <strong>${esc(flow.email)}</strong> 的 ${CODE_LENGTH} 位验证码，10 分钟内有效。</p>${register && flow.inviteCode ? `<p class="invite-chip">邀请码 <code>${esc(flow.inviteCode)}</code></p>` : ""}<form data-verify><label class="auth-field">邮箱验证码<input class="login-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="20" placeholder="${"0".repeat(CODE_LENGTH)}" value="${esc(state.codeDraft)}" required ${disabled}></label>${register || reset ? passwordField() + passwordField(true) : ""}<button class="auth-submit" type="submit" ${disabled}>${busy ? "正在验证…" : reset ? "重置密码并登录" : register ? "完成注册" : "登录"}</button></form><div class="login-links"><button type="button" class="link-button" data-resend ${busy || flow.secondsUntilResend > 0 ? "disabled" : ""}>${resendLabel(flow.secondsUntilResend)}</button><button type="button" class="link-button" data-change-email ${disabled}>换个邮箱</button></div>`;
  } else {
    const tabs =
      register || reset
        ? `<button class="auth-back" type="button" data-auth-mode="login">← 返回登录</button>`
        : `<div class="auth-tabs" role="tablist" aria-label="登录方式"><button id="password-tab" type="button" role="tab" data-auth-method="password" aria-selected="${passwordMethod}" aria-controls="auth-form" tabindex="${passwordMethod ? 0 : -1}" ${disabled}>密码登录</button><button id="code-tab" type="button" role="tab" data-auth-method="code" aria-selected="${!passwordMethod}" aria-controls="auth-form" tabindex="${passwordMethod ? -1 : 0}" ${disabled}>验证码登录</button></div>`;
    form = `${tabs}<form id="auth-form" ${!register && !reset ? `role="tabpanel" aria-labelledby="${passwordMethod ? "password" : "code"}-tab"` : ""} ${passwordMethod ? "data-password-login" : "data-login"}><label class="auth-field">邮箱<input name="email" type="email" autocomplete="username" placeholder="请输入账号邮箱" value="${esc(state.emailDraft ?? flow.email)}" required ${disabled}></label>${passwordMethod ? passwordField() : ""}${register ? `<label class="auth-field">邀请码${open ? '<span class="optional">选填</span>' : ""}<input name="invite" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="QB-XXXXX-XXXXX" value="${esc(state.inviteDraft)}" ${open ? "" : "required"} ${disabled}></label><p class="invite-status" data-invite-status role="status">${inviteStatus}</p>` : ""}${passwordMethod ? `<div class="auth-options"><label><input type="checkbox" name="remember" ${state.remember ? "checked" : ""} ${disabled}>记住我</label><button type="button" data-auth-mode="reset" ${disabled}>忘记密码？</button></div>` : `<p class="auth-method-hint">${reset ? "未设置过密码的账号，也可在此验证邮箱后设置。" : register ? (open ? "用邮箱验证后创建账号，曲谱默认私有。" : "目前仅限邀请注册，请填写有效邀请码。") : "通过邮箱验证码登录，无需输入密码。"}</p>`}<button class="auth-submit" type="submit" ${disabled}>${busy ? "正在处理…" : passwordMethod ? "登录" : reset ? "获取重置验证码" : register ? "注册并获取验证码" : "获取验证码"}</button>${!register && !reset ? `<p class="auth-switch">还没有账号？ <button type="button" data-auth-mode="register" ${disabled}>立即注册</button></p>` : ""}${consent}</form>`;
  }
  const mailbox =
    state.context?.profile === "local-validation"
      ? `<details class="auth-development"><summary>本机预览说明</summary><p>验证码写入开发邮箱，未发送真实邮件。${state.context.mailboxDirectory ? `<code>${esc(state.context.mailboxDirectory)}</code>` : ""}</p></details>`
      : "";
  return `<section class="auth-card"><p class="auth-eyebrow">${reset ? "找回密码" : register ? "欢迎加入琴伴" : "欢迎回到琴伴"}</p><h1>${heading}</h1><p class="auth-lead">${lead}</p>${form}${mailbox}</section>`;
}
