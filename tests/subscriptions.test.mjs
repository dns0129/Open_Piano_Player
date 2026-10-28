import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createAccountDatabase } from "../lib/accounts/database.mjs";
import { createSubscriptions } from "../lib/accounts/subscriptions.mjs";
import { subscriptionEnd } from "../lib/accounts/subscription-catalog.mjs";

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "qinban-subscription-")),
    db = await createAccountDatabase({ directory: dir });
  t.after(async () => {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  });
  let time = Date.parse("2026-01-31T08:15:00Z"),
    queryPayment = null,
    checkouts = 0;
  const gateway = {
    ready: true,
    async checkout(o) {
      checkouts++;
      return "weixin://wxpay/bizpayurl?pr=" + o.orderNo;
    },
    async notification(_h, raw) {
      const p = JSON.parse(raw);
      if (!p.valid) throw Error("signature invalid");
      return p;
    },
    async query() {
      return queryPayment;
    },
  };
  const b = createSubscriptions({
    db,
    gateways: { wechat: gateway },
    now: () => time,
  });
  return {
    db,
    b,
    gateway,
    owner: randomUUID(),
    other: randomUUID(),
    setTime: (value) => (time = Date.parse(value)),
    setQuery: (p) => (queryPayment = p),
    checkouts: () => checkouts,
    async pay(order, overrides = {}) {
      return b.notification(
        "wechat",
        {},
        JSON.stringify({
          valid: true,
          orderNo: order.orderNo,
          transactionId: "wx-" + order.orderId,
          amountFen: order.priceFen,
          currency: "CNY",
          ...overrides,
        }),
      );
    },
  };
}
test("server owns price, checkout is idempotent, forged notifications cannot mint points", async (t) => {
  const f = await fixture(t),
    { b, owner, other } = f;
  assert.equal((await b.account(owner)).remaining, 30);
  const key = randomUUID(),
    order = await b.checkout(
      owner,
      {
        productId: "standard",
        provider: "wechat",
        priceFen: 1,
        points: 999999,
        ownerId: other,
      },
      key,
    );
  assert.equal(order.priceFen, 5900);
  assert.equal(order.product.points, 800);
  assert.equal(
    (
      await b.checkout(
        owner,
        { productId: "standard", provider: "wechat" },
        key,
      )
    ).orderId,
    order.orderId,
  );
  assert.equal(f.checkouts(), 1);
  await assert.rejects(
    b.getOrder(other, order.orderId),
    (e) => e.status === 404,
  );
  await assert.rejects(
    b.checkout(owner, { productId: "light", provider: "wechat" }, key),
    (e) => e.code === "IDEMPOTENCY_CONFLICT",
  );
  await assert.rejects(
    f.pay(order, { valid: false }),
    (e) => e.code === "PAYMENT_VERIFICATION",
  );
  await assert.rejects(
    f.pay(order, { amountFen: 1 }),
    (e) => e.code === "PAYMENT_MISMATCH",
  );
  assert.equal((await b.account(owner)).remaining, 30);
  await Promise.all([f.pay(order), f.pay(order), f.pay(order)]);
  assert.equal((await b.account(owner)).remaining, 830);
  assert.equal((await b.account(other)).remaining, 30);
  const grants = (await b.account(owner)).grants.filter(
    (g) => g.kind === "monthly",
  );
  assert.equal(grants.length, 1);
  assert.equal(grants[0].expiresAt, "2026-02-28T08:15:00.000Z");
  await assert.rejects(
    f.pay(order, { transactionId: "different" }),
    (e) => e.code === "PAYMENT_MISMATCH",
  );
});
test("renewals queue by billing anniversary, expired points do not roll over, topups last 180 days", async (t) => {
  const f = await fixture(t),
    { b, owner } = f;
  for (const productId of ["light", "professional"]) {
    const o = await b.checkout(
      owner,
      { productId, provider: "wechat" },
      randomUUID(),
    );
    await f.pay(o);
  }
  let a = await b.account(owner);
  assert.equal(a.remaining, 330);
  assert.equal(
    a.grants.find((g) => g.productId === "professional").state,
    "scheduled",
  );
  f.setTime("2026-02-28T08:15:00Z");
  a = await b.account(owner);
  assert.equal(a.remaining, 2030);
  assert.equal(a.subscription.productId, "professional");
  assert.equal(a.subscription.expiresAt, "2026-03-31T08:15:00.000Z");
  const topup = await b.checkout(
    owner,
    { productId: "topup", provider: "wechat" },
    randomUUID(),
  );
  await f.pay(topup);
  f.setTime("2026-03-31T08:15:00Z");
  assert.equal((await b.account(owner)).remaining, 180);
  f.setTime("2026-08-27T08:15:00Z");
  assert.equal((await b.account(owner)).remaining, 30);
  assert.equal(
    subscriptionEnd("2028-01-31T16:30:00Z"),
    "2028-02-29T16:30:00.000Z",
  ); // Feb 1 HKT -> Mar 1 HKT
});
test("owner query recovers a missed notification, failed query and unavailable channels never grant", async (t) => {
  const f = await fixture(t),
    { b, owner } = f;
  await assert.rejects(
    b.checkout(owner, { productId: "light", provider: "alipay" }, randomUUID()),
    (e) => e.code === "PAYMENT_UNAVAILABLE",
  );
  const o = await b.checkout(
    owner,
    { productId: "topup", provider: "wechat" },
    randomUUID(),
  );
  f.setTime("2026-01-31T08:16:00Z");
  f.setQuery({
    orderNo: o.orderNo,
    transactionId: "query-txn",
    amountFen: 1900,
    currency: "CNY",
  });
  assert.equal((await b.refresh(owner, o.orderId)).state, "paid");
  assert.equal((await b.account(owner)).remaining, 180);
  const second = await b.checkout(
    owner,
    { productId: "light", provider: "wechat" },
    randomUUID(),
  );
  await assert.rejects(
    f.pay(second, { transactionId: "query-txn" }),
    (e) => e.code === "PAYMENT_MISMATCH",
  );
  assert.equal((await b.account(owner)).remaining, 180);
});
test("legacy credits migrate once, invoice/account locks prevent concurrent overspending and failed admission rolls back", async (t) => {
  const f = await fixture(t),
    { db, b, owner } = f;
  const source = randomUUID();
  await db.control((tx) =>
    tx.query("INSERT INTO qinban_control.task_credits VALUES($1,$2,$3,$4,$5)", [
      source,
      owner,
      2,
      "invite",
      "2025-12-01T00:00:00Z",
    ]),
  );
  assert.equal((await b.account(owner)).remaining, 330);
  assert.equal(await b.wallet.grantInvite(owner, 2, { id: source }), false);
  assert.equal((await b.account(owner)).remaining, 330);
  const newOwner = randomUUID(),
    jid = randomUUID();
  await assert.rejects(
    db.control((tx) =>
      b.wallet.reserve(tx, newOwner, jid, ["a", "b", "c", "d", "e", "f", "g"]),
    ),
    (e) => e.code === "POINTS_INSUFFICIENT",
  );
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      db.control((tx) =>
        b.wallet.reserve(tx, newOwner, randomUUID(), ["a", "b", "c", "d"]),
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await b.account(newOwner)).remaining, 10);
  assert.equal((await b.account(newOwner)).held, 20);
});

test("a lost checkout response can resume the stored order after reloading without a new merchant order", async (t) => {
  const f = await fixture(t);
  f.gateway.checkout = async () => {
    throw Error("simulated network loss");
  };
  await assert.rejects(
    f.b.checkout(
      f.owner,
      { productId: "light", provider: "wechat" },
      randomUUID(),
    ),
    (e) => e.code === "PAYMENT_UNAVAILABLE",
  );
  const stored = (await f.b.account(f.owner)).orders[0];
  assert.equal(stored.checkoutUrl, null);
  const requested = [];
  f.gateway.checkout = async (order) => {
    requested.push(order.orderNo);
    return "weixin://wxpay/bizpayurl?pr=recovered";
  };
  const reloaded = createSubscriptions({
    db: f.db,
    gateways: { wechat: f.gateway },
    now: () => Date.parse("2026-01-31T08:16:00Z"),
  });
  const resumed = await reloaded.resume(f.owner, stored.orderId);
  assert.equal(resumed.orderId, stored.orderId);
  assert.deepEqual(requested, [stored.orderNo]);
  await assert.rejects(
    reloaded.resume(f.other, stored.orderId),
    (e) => e.status === 404,
  );
  assert.equal((await reloaded.account(f.owner)).orders.length, 1);
});
