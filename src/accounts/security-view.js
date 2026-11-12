import { escapeHTML as esc } from "../html.js";

export function canDeleteAccount(session, state) {
  return (
    !state.busy &&
    state.deletionAccepted &&
    state.deletionEmail.trim().toLowerCase() ===
      session.user.email.toLowerCase()
  );
}

export function accountSecurity({
  session,
  state,
  nativeSubscriptions = false,
}) {
  const disabled = state.busy ? "disabled" : "";
  const recentlyVerified =
    Date.parse(session.reauthenticatedAt || "") + 600000 > Date.now();
  return `<section class="account-card" id="account-security"><h2>设备与账号安全</h2>${state.devices
    .map(
      (d) =>
        `<div class="account-row"><span>${esc(d.device)} ${d.current ? "（当前设备）" : ""}${d.lastSeenAt ? `<small class="account-device-date">最近使用：${esc(new Date(d.lastSeenAt).toLocaleString())}</small>` : ""}</span><button data-revoke="${esc(d.id)}" ${disabled}>退出此设备</button></div>`,
    )
    .join(
      "",
    )}<form data-reauth><p>导出备份、退出所有设备和删除账号前，请验证当前邮箱。${recentlyVerified ? "本次邮箱验证仍在 10 分钟有效期内。" : ""}</p><button type="button" data-reauth-send ${disabled}>发送邮箱验证码</button>${state.reauthChallenge ? `<label>邮箱验证码<input name="code" placeholder="8 位验证码" inputmode="numeric" autocomplete="one-time-code" maxlength="20" value="${esc(state.reauthCodeDraft)}" ${disabled}></label><button data-reauth-verify type="submit" ${disabled}>完成再次验证</button>` : ""}</form><div class="account-actions"><button data-logout-all ${disabled}>退出所有设备</button><button data-delete-account class="danger" aria-expanded="${state.deletionOpen}" aria-controls="account-deletion" ${disabled}>删除账号</button></div>${
    state.deletionOpen
      ? `<form data-delete-account-form id="account-deletion" class="account-deletion"><h3>删除你的琴伴账号</h3><p>删除会退出所有设备，并删除账号与私有曲谱资料。请先下载需要保留的备份；必要的交易记录按适用要求保留。</p>${nativeSubscriptions ? '<div class="account-notice"><p>删除琴伴账号不会自动取消 Apple 订阅。你可管理订阅后删除，也可直接继续删除账号。</p><button type="button" data-manage-apple-subscriptions>管理 Apple 订阅</button></div>' : ""}<fieldset><legend>选择删除方式</legend><label><input type="radio" name="deletionMode" value="immediate" ${state.deletionMode === "immediate" ? "checked" : ""} ${disabled}> 立即删除：立即关闭账号，开始永久清理，无法恢复。</label><label><input type="radio" name="deletionMode" value="recoverable" ${state.deletionMode === "recoverable" ? "checked" : ""} ${disabled}> 保留 30 天恢复期：立即退出全部设备，等待期内可用原邮箱恢复；期满永久删除。</label></fieldset><label>输入当前账号邮箱以确认<input name="confirmationEmail" type="email" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${esc(session.user.email)}" value="${esc(state.deletionEmail)}" required ${disabled}></label><label class="account-deletion-consent"><input name="deletionAccepted" type="checkbox" ${state.deletionAccepted ? "checked" : ""} required ${disabled}> 我已了解所选删除方式和资料处理说明。</label><p class="account-hint">如果邮箱验证已过期，请先在上方完成再次验证。</p><div class="account-actions"><button type="submit" class="danger" ${canDeleteAccount(session, state) ? "" : "disabled"}>${state.deletionMode === "immediate" ? "确认永久删除" : "确认申请删除"}</button><button type="button" data-cancel-deletion ${disabled}>取消</button></div></form>`
      : ""
  }<p class="account-legal"><a href="/privacy.html">隐私政策</a> · <a href="/terms.html">用户协议</a></p></section>`;
}
