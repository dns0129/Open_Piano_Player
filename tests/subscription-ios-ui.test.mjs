import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { webcrypto, randomUUID } from "node:crypto";

const catalog = {
  available: true,
  products: [
    {
      id: "light",
      appleProductId: "piano.light",
      name: "轻享版",
      kind: "subscription",
      points: 300,
    },
    {
      id: "topup",
      appleProductId: "piano.topup",
      name: "补充积分包",
      kind: "consumable",
      points: 150,
    },
  ],
};
async function until(fn) {
  const end = Date.now() + 6000;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("UI timeout");
}
async function open(
  t,
  {
    missingBridge = false,
    failVerification = false,
    failRefresh = false,
    purchaseStatus = "success",
  } = {},
) {
  const bundle = await build({
    entryPoints: ["src/commercial/subscription.js"],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    loader: { ".css": "empty" },
  });
  const dom = new JSDOM('<!doctype html><div id="subscription-app"></div>', {
    url: "https://piano.example/subscription.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.TextEncoder = TextEncoder;
  Object.defineProperty(w, "crypto", { value: webcrypto });
  Object.defineProperty(w.navigator, "userAgent", {
    value: "Mozilla/5.0 QinbanIOS/1.0",
  });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  const calls = [];
  let balance = 30;
  const transaction = {
    transactionId: "123",
    signedTransaction: "apple.signed.transaction",
  };
  if (!missingBridge)
    w.QinbanNative = {
      platform: "ios",
      apiVersion: 1,
      distribution: "app-store",
      async getProducts() {
        return {
          products: [
            {
              id: "piano.light",
              displayName: "轻享版",
              displayPrice: "HK$28.00",
              type: "autoRenewable",
              subscriptionPeriod: { value: 1, unit: "month" },
            },
            {
              id: "piano.topup",
              displayName: "积分包",
              displayPrice: "HK$18.00",
              type: "consumable",
            },
          ],
        };
      },
      async purchase(input) {
        calls.push({ purchase: input });
        return { status: purchaseStatus, transaction };
      },
      async pendingTransactions() {
        return { transactions: [] };
      },
      async restore() {
        calls.push({ restore: true });
        return { transactions: [transaction] };
      },
      async manageSubscriptions() {},
      async finishTransaction(input) {
        calls.push({ finish: input });
      },
    };
  w.fetch = async (path, options) => {
    calls.push({ path, options });
    if (path === "/api/v1/app-store/transactions") {
      if (failVerification)
        return new Response(JSON.stringify({ message: "服务器暂未确认" }), {
          status: 503,
        });
      balance += 150;
      return Response.json({ accepted: true, transactionId: "123" });
    }
    if (path === "/api/v1/app-store/catalog") return Response.json(catalog);
    if (path === "/api/v1/session")
      return Response.json({
        user: {
          id: randomUUID(),
          email: "owner@example.test",
          state: "active",
        },
        csrfToken: "csrf",
      });
    if (path === "/api/v1/app-store/account")
      return Response.json({
        available: true,
        appAccountToken: "server-token",
        subscription: null,
        transactions: [],
      });
    if (path === "/api/v1/subscriptions") {
      if (failRefresh && balance > 30)
        return new Response(JSON.stringify({ message: "余额暂时无法刷新" }), {
          status: 503,
        });
      return Response.json({
        remaining: balance,
        held: 0,
        grants: [],
        orders: [],
        events: [],
      });
    }
    throw new Error("Unexpected route " + path);
  };
  t.after(() => w.close());
  w.eval(bundle.outputFiles[0].text);
  await until(() =>
    missingBridge
      ? w.document.body.textContent.includes("Apple 购买暂时不可用")
      : w.document.querySelector("[data-apple-plan]") &&
        !w.document.querySelector("[data-apple-plan]").disabled,
  );
  return { w, calls };
}
function buy(w) {
  w.document.querySelector('[data-apple-plan="piano.topup"]').click();
  const input = w.document.querySelector("#apple-consent");
  input.checked = true;
  input.dispatchEvent(new w.Event("change", { bubbles: true }));
  w.document.querySelector("[data-apple-buy]").click();
}

test("iOS shows Apple localized prices and disclosure, then validates server-side before finishing", async (t) => {
  const { w, calls } = await open(t);
  assert.match(w.document.body.textContent, /HK\$28\.00/);
  assert.doesNotMatch(w.document.body.textContent, /微信|支付宝|扫码|¥29/);
  assert.match(w.document.body.textContent, /自动续期/);
  buy(w);
  await until(() => w.document.body.textContent.includes("购买已确认"));
  const verify = calls.findIndex(
    (c) => c.path === "/api/v1/app-store/transactions",
  );
  assert.ok(verify > 0 && calls.findIndex((c) => c.finish) > verify);
  assert.equal(
    calls.find((c) => c.purchase).purchase.appAccountToken,
    "server-token",
  );
  assert.match(w.document.body.textContent, /180/);
  assert.equal(
    calls.some(
      (c) =>
        c.path === "/api/v1/subscriptions/orders" ||
        c.path === "/api/v1/subscriptions/catalog",
    ),
    false,
  );
});

test("native bridge failure never falls back to web checkout", async (t) => {
  const { w, calls } = await open(t, { missingBridge: true });
  assert.equal(w.document.querySelector("[data-checkout]"), null);
  assert.doesNotMatch(w.document.body.textContent, /微信|支付宝|扫码/);
  assert.equal(
    calls.some((c) => c.path === "/api/v1/subscriptions/catalog"),
    false,
  );
});

test("charged but unconfirmed purchase retains its transaction and prevents buying again", async (t) => {
  const { w, calls } = await open(t, { failVerification: true });
  buy(w);
  await until(() => w.document.body.textContent.includes("不要再次购买"));
  assert.equal(
    calls.some((c) => c.finish),
    false,
  );
  assert.equal(w.document.querySelector("[data-apple-buy]"), null);
  assert.ok(
    [...w.document.querySelectorAll("[data-apple-plan]")].every(
      (b) => b.disabled,
    ),
  );
  assert.equal(w.document.querySelector("[data-apple-sync]").disabled, false);
});

test("pending purchase is displayed as awaiting approval, without server credit or finish", async (t) => {
  const { w, calls } = await open(t, { purchaseStatus: "pending" });
  buy(w);
  await until(() => w.document.body.textContent.includes("等待 Apple 批准"));
  assert.equal(
    calls.some((c) => c.finish || c.path === "/api/v1/app-store/transactions"),
    false,
  );
  assert.equal(w.document.querySelector("[data-apple-buy]"), null);
});

test("a refresh failure after an accepted purchase cannot leave an enabled repeat checkout", async (t) => {
  const { w, calls } = await open(t, { failRefresh: true });
  buy(w);
  await until(() => w.document.body.textContent.includes("不要再次购买"));
  assert.equal(calls.filter((c) => c.finish).length, 1);
  assert.equal(w.document.querySelector("[data-apple-buy]"), null);
  assert.ok(
    [...w.document.querySelectorAll("[data-apple-plan]")].every(
      (b) => b.disabled,
    ),
  );
  assert.equal(w.document.querySelector("[data-apple-sync]").disabled, false);
});
