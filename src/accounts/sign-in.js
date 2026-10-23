// Email-code sign-in as a small state machine, independent of any page markup.
// Accounts are invite-only: the first successful sign-in of an invited email
// creates the account, so "register" and "log in" are the same two steps.
export const CODE_LENGTH = 8;
const STORAGE_KEY = "qinban-sign-in-v1";

// Accept codes pasted with spaces, dashes or full-width digits.
export function normalizeCode(value) {
  return String(value ?? "")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, "")
    .slice(0, CODE_LENGTH);
}

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

export function signInHref(next) {
  const target = safeNext(next);
  return (
    "/account.html" + (target ? "?next=" + encodeURIComponent(target) : "")
  );
}

export function createSignInFlow({ account, storage, now = () => Date.now() }) {
  const listeners = new Set();
  let state = restore() || { step: "email", email: "" };
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
    requestCode(email) {
      const address = String(email ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
        return Promise.reject(new Error("请输入有效的邮箱地址。"));
      return guarded(async () => {
        await account.loginContext();
        const challenge = await account.code({
          email: address,
          purpose: "login",
        });
        set({
          step: "code",
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
      return this.requestCode(state.email);
    },
    verify(code) {
      const digits = normalizeCode(code);
      if (state.step !== "code")
        return Promise.reject(new Error("请先获取验证码。"));
      if (digits.length !== CODE_LENGTH)
        return Promise.reject(
          new Error(`请输入邮件中的 ${CODE_LENGTH} 位验证码。`),
        );
      if (state.expiresAt <= now()) {
        set({ step: "email", email: state.email });
        return Promise.reject(new Error("验证码已过期，请重新获取。"));
      }
      return guarded(async () => {
        const result = await account.verify({
          challengeId: state.challengeId,
          code: digits,
        });
        set({ step: "email", email: state.email });
        return result;
      });
    },
    changeEmail() {
      set({ step: "email", email: state.email });
    },
    reset() {
      set({ step: "email", email: "" });
    },
  };
}
