import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { webcrypto, randomUUID } from "node:crypto";
import {
  BILLING_VERSION,
  SUBSCRIPTION_PRODUCTS,
} from "../lib/accounts/subscription-catalog.mjs";

const user = {
  user: { id: randomUUID(), email: "subscriber@example.test", role: "user" },
  csrfToken: "csrf",
};
const catalog = {
  version: BILLING_VERSION,
  products: SUBSCRIPTION_PRODUCTS,
  pointsPerRegion: 5,
  trialPoints: 30,
  providers: [
    { id: "wechat", name: "微信支付", available: true },
    { id: "alipay", name: "支付宝", available: false },
  ],
};
const account = {
  remaining: 30,
  held: 0,
  grants: [],
  events: [],
  orders: [],
  subscription: null,
};
async function until(fn) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("UI timeout");
}
async function open(t, handler) {
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
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.fetch = async (path, options = {}) => {
    const result = await handler?.(path, options);
    if (result) return result;
    return new Response(
      JSON.stringify(
        path.endsWith("/catalog")
          ? catalog
          : path.endsWith("/session")
            ? user
            : account,
      ),
    );
  };
  t.after(() => w.close());
  w.eval(bundle.outputFiles[0].text);
  await until(() => w.document.querySelector(".subscription-balance"));
  return w;
}
test("subscription selection requires consent, uses server products and keeps the same order key after network failure", async (t) => {
  const requests = [],
    oid = randomUUID();
  let paid = false;
  const order = {
    orderId: oid,
    orderNo: oid.replaceAll("-", ""),
    priceFen: 5900,
    product: SUBSCRIPTION_PRODUCTS[1],
    provider: "wechat",
    state: "pending",
    expiresAt: new Date(Date.now() + 1800000).toISOString(),
    checkoutUrl: "weixin://wxpay/bizpayurl?pr=fixture",
  };
  const w = await open(t, async (path, options) => {
    if (path.endsWith("/subscriptions/orders")) {
      requests.push({
        key: options.headers["Idempotency-Key"],
        input: JSON.parse(options.body),
      });
      if (requests.length === 1)
        return new Response(JSON.stringify({ message: "测试网络中断" }), {
          status: 503,
        });
      return new Response(JSON.stringify(order));
    }
    if (path.endsWith("/refresh")) {
      paid = true;
      return new Response(JSON.stringify({ ...order, state: "paid" }));
    }
    if (path.endsWith("/subscriptions") && paid)
      return new Response(
        JSON.stringify({
          ...account,
          remaining: 830,
          orders: [{ ...order, state: "paid" }],
        }),
      );
  });
  const d = w.document;
  assert.match(d.body.textContent, /¥29/);
  assert.match(d.body.textContent, /¥59/);
  assert.match(d.body.textContent, /¥129/);
  d.querySelector('[data-plan="standard"]').click();
  assert.equal(d.querySelector("[data-checkout] button").disabled, true);
  assert.equal(d.querySelector("[value=alipay]").disabled, true);
  const accept = d.querySelector("#billing-accepted");
  accept.checked = true;
  accept.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert.equal(d.querySelector("[data-checkout] button").disabled, false);
  d.querySelector("[data-checkout]").dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await until(() => d.body.textContent.includes("测试网络中断"));
  assert.equal(d.querySelector("#billing-accepted").checked, true);
  d.querySelector("[data-checkout]").dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  try {
    await until(() => d.querySelector(".subscription-qr"));
  } catch (e) {
    throw Error(
      e.message + ": " + d.querySelector(".commerce-alert")?.textContent,
    );
  }
  assert.equal(requests[0].key, requests[1].key);
  assert.deepEqual(requests[1].input, {
    productId: "standard",
    provider: "wechat",
  });
  assert.match(
    d.querySelector(".subscription-qr").src,
    /^data:image\/svg\+xml/,
  );
  assert.equal(new URL(w.location.href).searchParams.get("order"), oid);
  d.querySelector("[data-refresh-order]").click();
  await until(
    () =>
      d.body.textContent.includes("支付成功") &&
      d.body.textContent.includes("830"),
  );
  assert.equal(d.querySelector(".subscription-qr"), null);
  assert.match(d.body.textContent, /不自动扣款/);
});
test("unconfigured merchant channels disable purchase and never expose a fake payment action", async (t) => {
  let orders = 0;
  const w = await open(t, (path) => {
    if (path.endsWith("/catalog"))
      return new Response(
        JSON.stringify({
          ...catalog,
          providers: catalog.providers.map((p) => ({ ...p, available: false })),
        }),
      );
    if (path.endsWith("/orders")) orders++;
  });
  w.document.querySelector('[data-plan="light"]').click();
  assert.match(w.document.body.textContent, /支付暂未开通/);
  assert.equal(
    w.document.querySelector("[data-checkout] button").disabled,
    true,
  );
  assert.equal(orders, 0);
});
