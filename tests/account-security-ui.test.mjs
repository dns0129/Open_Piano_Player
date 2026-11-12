import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { webcrypto } from "node:crypto";
import { until } from "./app-harness.mjs";
import { createAccountClient } from "../src/accounts/client.js";

const bundled = build({
  entryPoints: ["src/accounts/page.js"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  loader: { ".css": "empty" },
  define: { "import.meta.env": "{}" },
  logLevel: "silent",
});

async function boot(
  t,
  { recovery = false, native = false, failCleanup = false } = {},
) {
  const errors = [],
    virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => errors.push(e));
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="account-app"></div></body></html>',
    {
      url: "https://qinban.example/account.html",
      runScripts: "outside-only",
      pretendToBeVisual: true,
      virtualConsole,
    },
  );
  const w = dom.window;
  t.after(() => w.close());
  Object.defineProperty(w, "crypto", { value: webcrypto });
  Object.assign(w, { TextEncoder, TextDecoder, Response, AbortController });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  const requests = [],
    transactions = [],
    calls = { manage: 0, cleanup: 0, pending: 0, finished: [] };
  let session = {
    user: {
      id: "user-a",
      email: "a@example.test",
      state: recovery ? "deletion_pending" : "active",
    },
    sessionId: "session-a",
    csrfToken: "csrf-a",
    reauthenticatedAt: new Date().toISOString(),
  };
  if (native)
    w.QinbanNative = {
      apiVersion: 1,
      platform: "ios",
      pendingTransactions: async () => {
        calls.pending++;
        return { transactions: [...transactions] };
      },
      finishTransaction: async ({ transactionId }) => {
        calls.finished.push(transactionId);
        const index = transactions.findIndex(
          (t) => t.transactionId === transactionId,
        );
        if (index >= 0) transactions.splice(index, 1);
      },
      manageSubscriptions: async () => {
        calls.manage++;
      },
      clearSession: async () => {
        calls.cleanup++;
        if (failCleanup && calls.cleanup === 1)
          throw new Error("native unavailable");
      },
    };
  const reply = (status, data) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });
  w.fetch = async (path, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({
      path: String(path),
      method: options.method || "GET",
      body,
    });
    if (path === "/api/v1/auth/context")
      return reply(200, { csrfToken: "login-csrf", profile: "production" });
    if (path === "/api/v1/product")
      return reply(200, { registration: { open: true } });
    if (path === "/api/v1/session")
      return session
        ? reply(200, session)
        : reply(401, { code: "SESSION_REQUIRED" });
    if (path === "/api/v1/auth/code")
      return reply(202, {
        challengeId: "reauth-challenge",
        retryAfterSeconds: 60,
      });
    if (path === "/api/v1/auth/verify") {
      session = {
        ...session,
        sessionId: "reauth-session",
        reauthenticatedAt: new Date().toISOString(),
      };
      return reply(200, session);
    }
    if (path === "/api/v1/auth/password") {
      session = {
        user: { id: "user-a", email: body.email, state: "active" },
        sessionId: "signed-in-again",
        csrfToken: "csrf-again",
      };
      return reply(200, session);
    }
    if (
      String(path).startsWith("/api/v1/sessions/") &&
      options.method === "DELETE"
    ) {
      session = null;
      return new Response(null, { status: 204 });
    }
    if (path === "/api/v1/app-store/transactions") {
      const transaction = transactions.find(
        (t) => t.signedTransaction === body.signedTransaction,
      );
      return transaction && session
        ? reply(200, {
            accepted: true,
            transactionId: transaction.transactionId,
          })
        : reply(409, { code: "TRANSACTION_NOT_FOUND" });
    }
    if (path === "/api/v1/account/recover") {
      session = {
        ...session,
        user: { ...session.user, state: "active" },
        sessionId: "restored",
      };
      return reply(200, session);
    }
    if (path === "/api/v1/account" && options.method === "DELETE") {
      session = null;
      return reply(202, {
        mode: body.mode,
        state: body.mode === "immediate" ? "deleting" : "deletion_pending",
        recoverUntil:
          body.mode === "immediate"
            ? null
            : new Date(Date.now() + 30 * 86400000).toISOString(),
      });
    }
    if (String(path).startsWith("/api/v1/library/entries"))
      return session?.user.state === "active"
        ? reply(200, { records: [] })
        : reply(401, { code: "SESSION_REQUIRED", message: "请先恢复账号。" });
    if (path === "/api/v1/sessions") return reply(200, { sessions: [] });
    if (path === "/api/v1/source-groups") return reply(200, { groups: [] });
    return reply(404, { code: "NOT_FOUND" });
  };
  w.eval((await bundled).outputFiles[0].text);
  const doc = w.document;
  await until(
    () =>
      doc.querySelector(
        recovery ? "[data-recover]" : "[data-delete-account]",
      ) && !doc.querySelector(".account-busy")?.textContent,
  );
  return {
    w,
    doc,
    requests,
    calls,
    errors,
    queueTransaction: (id) => {
      const transaction = {
        transactionId: id,
        signedTransaction: "signed." + id,
      };
      transactions.push(transaction);
      return transaction;
    },
    setSession: (value) => {
      session = value;
    },
  };
}

function confirmEmail(w, doc, email = "a@example.test") {
  const input = doc.querySelector("[name=confirmationEmail]");
  input.value = email;
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  const accepted = doc.querySelector("[name=deletionAccepted]");
  accepted.checked = true;
  accepted.dispatchEvent(new w.Event("change", { bubbles: true }));
}

test("the recovery screen stays signed in without calling active-account APIs", async (t) => {
  const { doc, requests, errors } = await boot(t, { recovery: true });
  assert.ok(doc.querySelector("[data-recover]"));
  assert.equal(
    requests.some((r) =>
      /\/library\/|\/sessions$|\/source-groups$/.test(r.path),
    ),
    false,
  );
  doc.querySelector("[data-recover]").click();
  await until(
    () =>
      doc.querySelector("[data-delete-account]") &&
      !doc.querySelector(".account-busy")?.textContent,
  );
  assert.ok(requests.some((r) => r.path.startsWith("/api/v1/library/entries")));
  assert.match(doc.querySelector(".account-message").textContent, /账号已恢复/);
  assert.deepEqual(errors, []);
});

test("native deletion allows immediate removal, links subscription management, and retries device cleanup", async (t) => {
  const { w, doc, requests, calls, errors } = await boot(t, {
    native: true,
    failCleanup: true,
  });
  doc.querySelector("[data-delete-account]").click();
  assert.equal(
    doc.querySelector("[name=deletionMode]:checked").value,
    "immediate",
  );
  assert.equal(
    doc.querySelector("[data-delete-account-form] button[type=submit]")
      .disabled,
    true,
  );
  assert.match(
    doc.querySelector("#account-deletion").textContent,
    /不会自动取消 Apple 订阅/,
  );
  doc.querySelector("[data-manage-apple-subscriptions]").click();
  await until(
    () =>
      calls.manage === 1 && !doc.querySelector(".account-busy")?.textContent,
  );
  assert.equal(
    requests.some((r) => r.method === "DELETE"),
    false,
  );
  confirmEmail(w, doc, "someone-else@example.test");
  assert.equal(
    doc.querySelector("[data-delete-account-form] button[type=submit]")
      .disabled,
    true,
  );
  confirmEmail(w, doc);
  assert.equal(
    doc.querySelector("[data-delete-account-form] button[type=submit]")
      .disabled,
    false,
  );
  doc.querySelector("[data-delete-account-form]").requestSubmit();
  await until(
    () =>
      doc.querySelector("[data-retry-device-cleanup]") &&
      !doc.querySelector(".account-busy")?.textContent,
  );
  assert.deepEqual(requests.find((r) => r.method === "DELETE").body, {
    mode: "immediate",
    confirmationEmail: "a@example.test",
  });
  assert.match(
    doc.querySelector(".account-message").textContent,
    /永久删除已开始/,
  );
  assert.equal(doc.querySelector("[data-delete-account]"), null);
  doc.querySelector("[data-retry-device-cleanup]").click();
  await until(
    () =>
      calls.cleanup === 2 && !doc.querySelector("[data-retry-device-cleanup]"),
  );
  assert.match(
    doc.querySelector(".account-message").textContent,
    /本机登录数据已清理/,
  );
  assert.equal(
    requests.filter((r) => r.method === "DELETE").length,
    1,
    "cleanup retry does not repeat the account deletion",
  );
  assert.deepEqual(errors, []);
});

test("the web account can choose a 30-day recovery window and has direct legal links", async (t) => {
  const { w, doc, requests, errors } = await boot(t);
  assert.ok(doc.querySelector('a[href="/privacy.html"]'));
  assert.ok(doc.querySelector('a[href="/terms.html"]'));
  doc.querySelector("[data-delete-account]").click();
  assert.equal(doc.querySelector("[data-manage-apple-subscriptions]"), null);
  const radio = doc.querySelector('[name=deletionMode][value="recoverable"]');
  radio.checked = true;
  radio.dispatchEvent(new w.Event("change", { bubbles: true }));
  confirmEmail(w, doc);
  doc.querySelector("[data-delete-account-form]").requestSubmit();
  await until(
    () =>
      doc.querySelector("[data-password-login]") &&
      !doc.querySelector(".account-busy")?.textContent,
  );
  assert.equal(
    requests.find((r) => r.method === "DELETE").body.mode,
    "recoverable",
  );
  assert.match(
    doc.querySelector(".account-message").textContent,
    /期满永久删除/,
  );
  assert.deepEqual(errors, []);
});

test("switching the signed-in account clears the previous deletion form", async (t) => {
  const { w, doc, setSession } = await boot(t);
  doc.querySelector("[data-delete-account]").click();
  confirmEmail(w, doc);
  setSession({
    user: { id: "user-b", email: "b@example.test", state: "active" },
    sessionId: "session-b",
    csrfToken: "csrf-b",
  });
  w.dispatchEvent(new w.Event("focus"));
  await until(
    () =>
      /b@example\.test/.test(doc.body.textContent) &&
      !doc.querySelector(".account-busy")?.textContent,
  );
  assert.equal(doc.querySelector("#account-deletion"), null);
  doc.querySelector("[data-delete-account]").click();
  assert.equal(doc.querySelector("[name=confirmationEmail]").value, "");
  assert.equal(doc.querySelector("[name=deletionAccepted]").checked, false);
});

test("account reauthentication accepts pasted digits and keyboard submit verifies without resending", async (t) => {
  const { w, doc, requests, errors } = await boot(t);
  doc.querySelector("[data-reauth-send]").click();
  await until(
    () =>
      doc.querySelector("[data-reauth] input[name=code]") &&
      !doc.querySelector(".account-busy")?.textContent,
  );
  assert.deepEqual(requests.find((r) => r.path === "/api/v1/auth/code").body, {
    email: "a@example.test",
    purpose: "reauth",
  });
  const input = doc.querySelector("[data-reauth] input[name=code]");
  input.value = "１２３４ ５６７８";
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  assert.equal(input.value, "12345678");
  doc.querySelector("[data-reauth]").requestSubmit();
  await until(() =>
    /再次验证完成/.test(
      doc.querySelector(".account-message")?.textContent || "",
    ),
  );
  assert.deepEqual(
    requests.find((r) => r.path === "/api/v1/auth/verify").body,
    {
      challengeId: "reauth-challenge",
      code: "12345678",
    },
  );
  assert.equal(
    requests.filter((r) => r.path === "/api/v1/auth/code").length,
    1,
  );
  assert.deepEqual(errors, []);
});

test("signing out of an expired session succeeds while a network failure remains retryable", async () => {
  let status = 401;
  const session = {
    user: { id: "u1", email: "test@example.test", state: "active" },
    sessionId: "s1",
    csrfToken: "csrf",
  };
  const client = createAccountClient({
    fetchImpl: async (path) => {
      if (path.endsWith("/session"))
        return new Response(JSON.stringify(session), { status: 200 });
      if (status === 0) throw new Error("offline");
      return new Response(JSON.stringify({ code: "SESSION_REQUIRED" }), {
        status,
      });
    },
  });
  try {
    await client.initialize();
    const result = await client.logout();
    assert.equal(result.deviceCleared, true);
    assert.equal(client.session, null);
    assert.equal(client.sessionExpired, false);
    status = 0;
    await client.initialize();
    await assert.rejects(client.logout(), /offline/);
    assert.ok(
      client.session,
      "the client never claims the server session was revoked after a failed request",
    );
  } finally {
    client.dispose();
  }
});

test("native pending purchases resume after BFCache return and a fresh account sign-in", async (t) => {
  const { w, doc, requests, calls, errors, queueTransaction } = await boot(t, {
    native: true,
  });
  assert.equal(calls.pending, 1);
  const submitted = () =>
    requests.filter((r) => r.path === "/api/v1/app-store/transactions");

  w.dispatchEvent(new w.PageTransitionEvent("pagehide", { persisted: true }));
  const cachedPurchase = queueTransaction("while-cached");
  w.dispatchEvent(
    new w.CustomEvent("qinban:transaction", { detail: cachedPurchase }),
  );
  assert.equal(
    submitted().length,
    0,
    "a hidden cached page cannot deliver purchases",
  );

  w.dispatchEvent(new w.PageTransitionEvent("pageshow", { persisted: true }));
  await until(
    () =>
      calls.finished.includes("while-cached") &&
      doc.querySelector("[data-logout]") &&
      !doc.querySelector(".account-busy")?.textContent,
  );
  assert.equal(
    calls.pending,
    2,
    "returning checks StoreKit again after refreshing the server session",
  );
  assert.equal(submitted().length, 1);

  doc.querySelector("[data-logout]").click();
  await until(
    () =>
      doc.querySelector("[data-password-login]") &&
      !doc.querySelector(".account-busy")?.textContent,
  );
  const signedOutPurchase = queueTransaction("while-signed-out");
  w.dispatchEvent(
    new w.CustomEvent("qinban:transaction", { detail: signedOutPurchase }),
  );
  assert.equal(
    submitted().length,
    1,
    "signed-out transaction events remain unfinished",
  );

  const form = doc.querySelector("[data-password-login]");
  form.querySelector("[name=email]").value = "a@example.test";
  const password = form.querySelector("[name=password]");
  password.value = "A password for testing";
  password.dispatchEvent(new w.Event("input", { bubbles: true }));
  const consent = form.querySelector("[name=consent]");
  consent.checked = true;
  consent.dispatchEvent(new w.Event("change", { bubbles: true }));
  form.requestSubmit();
  await until(
    () =>
      calls.finished.includes("while-signed-out") &&
      doc.querySelector("[data-logout]") &&
      !doc.querySelector(".account-busy")?.textContent,
  );
  assert.equal(
    calls.pending,
    3,
    "the restored page remains subscribed to account changes",
  );
  assert.equal(submitted().length, 2);

  const livePurchase = queueTransaction("after-return");
  w.dispatchEvent(
    new w.CustomEvent("qinban:transaction", { detail: livePurchase }),
  );
  await until(() => calls.finished.includes("after-return"));
  assert.deepEqual(calls.finished, [
    "while-cached",
    "while-signed-out",
    "after-return",
  ]);
  assert.equal(submitted().length, 3, "each transaction is delivered once");

  // A page that actually unloads still releases its native and identity listeners.
  w.dispatchEvent(new w.PageTransitionEvent("pagehide", { persisted: false }));
  const unloadedPurchase = queueTransaction("after-unload");
  w.dispatchEvent(new w.PageTransitionEvent("pageshow", { persisted: true }));
  await until(
    () =>
      doc.querySelector("[data-logout]") &&
      !doc.querySelector(".account-busy")?.textContent,
  );
  w.dispatchEvent(
    new w.CustomEvent("qinban:transaction", { detail: unloadedPurchase }),
  );
  assert.equal(calls.pending, 3);
  assert.equal(submitted().length, 3);
  assert.deepEqual(errors, []);
});
