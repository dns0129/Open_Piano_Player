// Email-code sign-in and registration as a small state machine, independent of
// any page markup. Both use the same two steps: an email gets an 8-digit code,
// and verifying it signs in, creating the account on first use. Registration
// may carry an invite code, which adds bonus recognition tasks to a new account.
export const CODE_LENGTH = 8;
const STORAGE_KEY = "qinban-sign-in-v1";

// Accept codes pasted with spaces, dashes or full-width digits.
export function normalizeCode(value) {
  return String(value ?? "")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, "")
    .slice(0, CODE_LENGTH);
}

// Mirrors lib/accounts/invites.mjs: QB-7KX2M-P9QRT, 10 characters without look-alikes.
const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export function normalizeInviteCode(value) {
  let raw = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (raw.length === 12 && raw.startsWith("QB")) raw = raw.slice(2);
  return raw.length === 10 && [...raw].every((c) => INVITE_ALPHABET.includes(c))
    ? raw
    : null;
}
export const formatInviteCode = (raw) =>
  `QB-${raw.slice(0, 5)}-${raw.slice(5)}`;

// Only same-origin paths may be used as a post-login destination.
export function safeNext(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return null;
  if (/[\\\u0000-\u001f]/.test(value)) return null;
  if (value.startsWith("/account.html")) return null;
  return value;
}

export function signInHref(next, { mode } = {}) {
  const target = safeNext(next);
  const query = new URLSearchParams();
  if (mode === "register") query.set("mode", "register");
  if (target) query.set("next", target);
  const search = query.toString();
  return "/account.html" + (search ? "?" + search : "");
}

export function createSignInFlow({ account, storage, now = () => Date.now() }) {
  const listeners = new Set();
  let state = restore() || { step: "email", mode: "login", email: "" };
  let busy = false;

  function restore() {
    try {
      const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
      if (
        saved?.step === "code" &&
        typeof saved.challengeId === "string" &&
        typeof saved.email === "string" &&
        saved.expiresAt > now()
      )
        return saved;
    } catch {}
    return null;
  }
  function save() {
    try {
      if (state.step === "code")
        storage?.setItem(STORAGE_KEY, JSON.stringify(state));
      else storage?.removeItem(STORAGE_KEY);
    } catch {}
  }
  function set(next) {
    state = next;
    save();
    notify();
  }
  function notify() {
    for (const listener of listeners) listener(snapshot());
  }
  function snapshot() {
    return { ...state, busy, secondsUntilResend: secondsUntilResend() };
  }
  function secondsUntilResend() {
    return state.step === "code"
      ? Math.max(0, Math.ceil((state.resendAt - now()) / 1000))
      : 0;
  }
  function backToEmail() {
    set({
      step: "email",
      mode: state.mode,
      email: state.email,
      inviteCode: state.inviteCode,
    });
  }
  async function guarded(task) {
    if (busy) return undefined;
    busy = true;
    notify();
    try {
      return await task();
    } finally {
      busy = false;
      notify();
    }
  }

  return {
    get state() {
      return snapshot();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    // mode is "login" or "register"; the invite code only matters for a new account.
    requestCode(email, { mode = state.mode || "login", inviteCode = "" } = {}) {
      const address = String(email ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
        return Promise.reject(new Error("请输入有效的邮箱地址。"));
      const typed = String(inviteCode ?? "").trim();
      const invite = typed ? normalizeInviteCode(typed) : null;
      if (typed && !invite)
        return Promise.reject(
          new Error("邀请码格式不正确，应类似 QB-7KX2M-P9QRT。"),
        );
      return guarded(async () => {
        await account.loginContext();
        const code = invite ? formatInviteCode(invite) : "";
        const challenge = await account.code({
          email: address,
          purpose: mode === "reset" ? "password" : "login",
          ...(code ? { inviteCode: code } : {}),
        });
        set({
          step: "code",
          mode,
          inviteCode: code,
          email: address,
          challengeId: challenge.challengeId,
          resendAt: now() + (challenge.retryAfterSeconds || 60) * 1000,
          expiresAt: Date.parse(challenge.expiresAt) || now() + 600000,
        });
      });
    },
    resend() {
      if (state.step !== "code" || secondsUntilResend() > 0)
        return Promise.resolve();
      return this.requestCode(state.email, {
        mode: state.mode,
        inviteCode: state.inviteCode,
      });
    },
    // Checks an invite code before sign-up so the form can show its bonus.
    async checkInvite(value) {
      const raw = normalizeInviteCode(value);
      if (!raw) return { valid: false, reason: "format" };
      const code = formatInviteCode(raw);
      await account.loginContext();
      try {
        const result = await account.json("/auth/invite", {
          method: "POST",
          body: { code },
        });
        return { valid: true, code, bonusTasks: result.bonusTasks };
      } catch (error) {
        if (error.code === "INVITE_INVALID")
          return { valid: false, reason: "invalid", code };
        throw error;
      }
    },
    verify(code, { password } = {}) {
      const digits = normalizeCode(code);
      if (state.step !== "code")
        return Promise.reject(new Error("请先获取验证码。"));
      if (digits.length !== CODE_LENGTH)
        return Promise.reject(
          new Error(`请输入邮件中的 ${CODE_LENGTH} 位验证码。`),
        );
      if (state.expiresAt <= now()) {
        backToEmail();
        return Promise.reject(new Error("验证码已过期，请重新获取。"));
      }
      return guarded(async () => {
        const input = {
          challengeId: state.challengeId,
          code: digits,
          ...(password !== undefined ? { password } : {}),
        };
        const result = await (state.mode === "reset"
          ? account.resetPassword(input)
          : account.verify(input));
        set({ step: "email", mode: "login", email: state.email });
        return result;
      });
    },
    changeEmail() {
      backToEmail();
    },
    setMode(mode) {
      if (state.step === "email") set({ ...state, mode });
    },
    reset() {
      set({ step: "email", mode: "login", email: "" });
    },
  };
}
