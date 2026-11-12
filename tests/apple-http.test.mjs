import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createHostedServer } from "../lib/accounts/http.mjs";
import { fail } from "../lib/accounts/common.mjs";

test("App Store HTTP isolates signed notifications from session-protected purchases and blocks native web checkout", async (t) => {
  const owner = randomUUID();
  const session = {
    id: randomUUID(),
    userId: owner,
    email: "owner@example.test",
    state: "active",
    purpose: "normal",
    csrfToken: "valid-csrf",
  };
  const calls = [];
  const server = createHostedServer({
    identity: {
      async session(token) {
        if (token !== "session") throw fail("SESSION_REQUIRED", "登录", 401);
        return session;
      },
      csrf: () => "guest-csrf",
      invites: {},
    },
    appleBilling: {
      catalog: () => ({
        available: true,
        products: [{ appleProductId: "piano.light" }],
      }),
      account: async (s) => ({ appAccountToken: s.userId }),
      verifyPurchase: async (s, input) => {
        calls.push({ s, input });
        return { accepted: true, transactionId: "123" };
      },
      sync: async () => ({ accepted: true }),
      notification: async (input) => {
        if (input.signedPayload !== "verified")
          throw fail("APPLE_VERIFICATION", "签名无效", 400);
        return { accepted: true };
      },
    },
    subscriptions: {
      catalog: () => ({ products: [] }),
      account: async () => ({
        orders: [
          { checkoutUrl: "weixin://sensitive-checkout", orderId: "web-order" },
        ],
      }),
      checkout: async () => {
        calls.push({ webCheckout: true });
        return { orderId: "web-order" };
      },
      getOrder: async () => ({
        checkoutUrl: "weixin://sensitive-checkout",
        orderId: "web-order",
      }),
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const origin = "http://127.0.0.1:" + server.address().port;
  const request = (
    path,
    { method = "GET", authenticated = true, headers = {}, body } = {},
  ) =>
    fetch(origin + "/api/v1" + path, {
      method,
      headers: {
        origin,
        cookie: authenticated ? "qinban_dev_account=session" : "",
        "content-type": "application/json",
        "x-csrf-token": "valid-csrf",
        "idempotency-key": randomUUID(),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  assert.equal(
    (await request("/app-store/catalog", { authenticated: false })).status,
    200,
  );
  assert.equal(
    (await request("/app-store/account", { authenticated: false })).status,
    401,
  );
  assert.equal(
    (
      await request("/app-store/transactions", {
        method: "POST",
        authenticated: false,
        body: {},
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/app-store/transactions", {
        method: "POST",
        headers: { "x-csrf-token": "bad" },
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/app-store/transactions", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/app-store/transactions", {
        method: "POST",
        body: { signedTransaction: "x".repeat(140000) },
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await request("/app-store/transactions", {
        method: "POST",
        body: {
          signedTransaction: "real-jws",
          userId: "attacker",
          points: 99999,
          environment: "Xcode",
        },
      })
    ).status,
    200,
  );
  assert.equal(calls[0].s.userId, owner);
  assert.deepEqual(calls[0].input, { signedTransaction: "real-jws" });
  assert.equal(
    (
      await request("/app-store/notifications", {
        method: "POST",
        authenticated: false,
        headers: { origin: "https://apple.example", "x-csrf-token": "" },
        body: { signedPayload: "forged" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/app-store/notifications", {
        method: "POST",
        authenticated: false,
        headers: { origin: "https://apple.example", "x-csrf-token": "" },
        body: { signedPayload: "verified" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/app-store/notifications", {
        method: "POST",
        authenticated: false,
        body: { signedPayload: "x".repeat(270000) },
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await request("/subscriptions/orders", {
        method: "POST",
        headers: { "user-agent": "QinbanIOS/1.0" },
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/subscriptions/orders", {
        method: "POST",
        headers: { "x-qinban-distribution": "app-store" },
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    calls.some((c) => c.webCheckout),
    false,
  );
  assert.equal(
    (await request("/subscriptions/orders", { method: "POST", body: {} }))
      .status,
    201,
  );
  const order = await request("/subscriptions/orders/" + randomUUID(), {
    headers: { "user-agent": "QinbanIOS/1.0" },
  });
  assert.equal((await order.json()).checkoutUrl, null);
  const account = await request("/subscriptions", {
    headers: { "user-agent": "QinbanIOS/1.0" },
  });
  assert.equal((await account.json()).orders[0].checkoutUrl, null);
});
