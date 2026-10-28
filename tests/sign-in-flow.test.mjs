import test from "node:test";
import assert from "node:assert/strict";
import {
  createSignInFlow,
  normalizeCode,
  safeNext,
  signInHref,
} from "../src/accounts/sign-in.js";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
function fakeAccount() {
  const calls = [];
  return {
    calls,
    async loginContext() {
      calls.push(["context"]);
      return { csrfToken: "x" };
    },
    async code(input) {
      calls.push(["code", input]);
      return {
        challengeId: "challenge-" + calls.length,
        retryAfterSeconds: 60,
        expiresAt: new Date(Date.parse("2026-10-23T00:10:00Z")).toISOString(),
      };
    },
    async verify(input) {
      calls.push(["verify", input]);
      return {
        session: { user: { email: "a@example.test", state: "active" } },
        isNewAccount: true,
      };
    },
  };
}

test("codes are accepted with spaces, dashes and full-width digits", () => {
  assert.equal(normalizeCode(" 6057-6537 "), "60576537");
  assert.equal(normalizeCode("６０５７６５３７"), "60576537");
  assert.equal(normalizeCode("1234567890"), "12345678");
});

test("only same-origin paths can be a post-login destination", () => {
  assert.equal(safeNext("/recognition.html?x=1"), "/recognition.html?x=1");
  for (const bad of [
    "https://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "/\\evil",
    "/account.html?next=/x",
    "",
    null,
  ])
    assert.equal(safeNext(bad), null);
  assert.equal(
    signInHref("/recognition.html"),
    "/account.html?next=%2Frecognition.html",
  );
  assert.equal(signInHref("//evil.example"), "/account.html");
});

test("the code step survives a reload, counts down and verifies the normalized code", async () => {
  let clock = Date.parse("2026-10-23T00:00:00Z");
  const now = () => clock,
    storage = memoryStorage(),
    account = fakeAccount();
  const flow = createSignInFlow({ account, storage, now });
  await assert.rejects(flow.requestCode("not-an-email"), /有效的邮箱/);
  await flow.requestCode(" a@example.test ");
  assert.deepEqual(account.calls.slice(0, 2), [
    ["context"],
    ["code", { email: "a@example.test", purpose: "login" }],
  ]);
  assert.equal(flow.state.step, "code");
  assert.equal(flow.state.secondsUntilResend, 60);
  clock += 15000;
  const reloaded = createSignInFlow({ account, storage, now });
  assert.equal(reloaded.state.step, "code", "刷新页面后仍停在输入验证码这一步");
  assert.equal(reloaded.state.secondsUntilResend, 45);
  await reloaded.resend();
  assert.equal(
    account.calls.filter((c) => c[0] === "code").length,
    1,
    "倒计时结束前不会重发",
  );
  await assert.rejects(reloaded.verify("1234"), /8 位验证码/);
  assert.equal(
    account.calls.some((c) => c[0] === "verify"),
    false,
    "位数不足时不发请求",
  );
  const result = await reloaded.verify("6057 6537");
  assert.deepEqual(account.calls.at(-1), [
    "verify",
    { challengeId: "challenge-2", code: "60576537" },
  ]);
  assert.equal(result.isNewAccount, true);
  assert.equal(reloaded.state.step, "email");
  assert.equal(
    createSignInFlow({ account, storage, now }).state.step,
    "email",
    "登录成功后不再恢复验证码步骤",
  );
});

test("an expired code returns to the email step and changing email keeps the address", async () => {
  let clock = Date.parse("2026-10-23T00:00:00Z");
  const now = () => clock,
    account = fakeAccount();
  const flow = createSignInFlow({ account, storage: memoryStorage(), now });
  await flow.requestCode("b@example.test");
  flow.changeEmail();
  assert.deepEqual(
    [flow.state.step, flow.state.email],
    ["email", "b@example.test"],
  );
  await flow.requestCode("b@example.test");
  clock += 11 * 60000;
  await assert.rejects(flow.verify("12345678"), /已过期/);
  assert.equal(flow.state.step, "email");
});
