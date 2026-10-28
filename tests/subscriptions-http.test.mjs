import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createHostedRuntime } from "../lib/accounts/runtime.mjs";

test("subscription HTTP protects orders and balances while authenticated payment notifications require no customer session", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "qinban-subscriptions-http-")),
    mail = [];
  const gateway = {
    ready: true,
    async checkout(o) {
      return "weixin://wxpay/bizpayurl?pr=" + o.orderNo;
    },
    async query() {
      return null;
    },
    async notification(_headers, raw) {
      const data = JSON.parse(raw);
      if (!data.verified) throw Error("invalid");
      return data;
    },
  };
  const r = await createHostedRuntime({
    directory: dir,
    port: 0,
    mailer: async (m) => mail.push(m),
    paymentGateways: { wechat: gateway },
  });
  t.after(async () => {
    await r.close();
    await rm(dir, { recursive: true, force: true });
  });
  await new Promise((resolve) => r.server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + r.server.address().port;
  function browser() {
    const jar = new Map();
    return {
      csrf: "",
      async request(
        path,
        { method = "GET", body, csrf = this.csrf, origin = base } = {},
      ) {
        const response = await fetch(base + path, {
          method,
          headers: {
            origin,
            cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
            "content-type": "application/json",
            "x-csrf-token": csrf,
            "idempotency-key": randomUUID(),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        for (const cookie of response.headers.getSetCookie()) {
          const [k, v] = cookie.split(";")[0].split("=");
          jar.set(k, v);
        }
        return {
          status: response.status,
          data: response.status === 204 ? null : await response.json(),
        };
      },
    };
  }
  async function login(email) {
    const b = browser();
    await r.identity.invite(email);
    b.csrf = (await b.request("/api/v1/auth/context")).data.csrfToken;
    const c = await b.request("/api/v1/auth/code", {
      method: "POST",
      body: { email, purpose: "login" },
    });
    const signed = await b.request("/api/v1/auth/verify", {
      method: "POST",
      body: {
        challengeId: c.data.challengeId,
        code: mail.find((m) => m.challengeId === c.data.challengeId).code,
      },
    });
    b.csrf = signed.data.csrfToken;
    return b;
  }
  const guest = browser(),
    a = await login("a@example.test"),
    b = await login("b@example.test");
  assert.equal(
    (await guest.request("/api/v1/subscriptions/catalog")).status,
    200,
  );
  assert.equal((await guest.request("/api/v1/subscriptions")).status, 401);
  assert.equal((await a.request("/api/v1/subscriptions")).data.remaining, 30);
  assert.equal((await a.request("/api/v1/operator/payments")).status, 403);
  const input = { productId: "light", provider: "wechat" };
  assert.equal(
    (
      await a.request("/api/v1/subscriptions/orders", {
        method: "POST",
        body: input,
        csrf: "bad",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await a.request("/api/v1/subscriptions/orders", {
        method: "POST",
        body: input,
        origin: "https://other.example",
      })
    ).status,
    403,
  );
  const order = (
    await a.request("/api/v1/subscriptions/orders", {
      method: "POST",
      body: input,
    })
  ).data;
  assert.equal(
    (await b.request("/api/v1/subscriptions/orders/" + order.orderId)).status,
    404,
  );
  assert.equal(
    (
      await b.request(
        "/api/v1/subscriptions/orders/" + order.orderId + "/refresh",
        { method: "POST", body: {} },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await b.request(
        "/api/v1/subscriptions/orders/" + order.orderId + "/checkout",
        { method: "POST", body: {} },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await a.request(
        "/api/v1/subscriptions/orders/" + order.orderId + "/checkout",
        { method: "POST", body: {} },
      )
    ).data.orderId,
    order.orderId,
  );
  const notify = {
    verified: true,
    orderNo: order.orderNo,
    transactionId: "transaction",
    amountFen: 2900,
    currency: "CNY",
  };
  for (let i = 0; i < 2; i++) {
    const response = await fetch(base + "/api/v1/payments/notify/wechat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(notify),
    });
    assert.equal(response.status, 204);
  }
  assert.equal((await a.request("/api/v1/subscriptions")).data.remaining, 330);
  assert.equal((await b.request("/api/v1/subscriptions")).data.remaining, 30);
  const bad = await fetch(base + "/api/v1/payments/notify/wechat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...notify, verified: false }),
  });
  assert.equal(bad.status, 400);
  assert.equal(
    (await guest.request("/api/v1/payments/notify/wechat")).status,
    401,
  );
  assert.equal(
    (await a.request("/api/v1/subscriptions/orders/" + order.orderId)).data
      .state,
    "paid",
  );
});
