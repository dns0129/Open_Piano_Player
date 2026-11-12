import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  SignedDataVerifier,
  Environment,
} from "@apple/app-store-server-library";
import { createAccountDatabase } from "../lib/accounts/database.mjs";
import { createPointWallet } from "../lib/accounts/point-wallet.mjs";
import {
  createAppleBilling,
  loadAppleBillingConfiguration,
} from "../lib/accounts/apple-billing.mjs";

const MONTH = 30 * 86400000;
const products = [
  {
    id: "light",
    appleProductId: "test.qinban.light",
    name: "轻享版",
    kind: "subscription",
    points: 300,
    period: "P1M",
  },
  {
    id: "standard",
    appleProductId: "test.qinban.standard",
    name: "标准版",
    kind: "subscription",
    points: 800,
    period: "P1M",
  },
  {
    id: "professional",
    appleProductId: "test.qinban.professional",
    name: "专业版",
    kind: "subscription",
    points: 2000,
    period: "P1M",
  },
  {
    id: "topup",
    appleProductId: "test.qinban.topup",
    name: "补充积分包",
    kind: "consumable",
    points: 150,
    period: null,
  },
];

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "qinban-apple-")),
    db = await createAccountDatabase({ directory });
  t.after(async () => {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });
  let clock = Date.parse("2026-11-12T11:00:00Z"),
    count = 0,
    apiCalls = 0;
  const claims = new Map(),
    latest = new Map(),
    history = new Map(),
    statuses = new Map(),
    wallet = createPointWallet({ db, now: () => clock }),
    user = { userId: randomUUID() },
    other = { userId: randomUUID() };
  function sign(value) {
    const token = `test.${Buffer.from(JSON.stringify(value)).toString("base64url")}.${++count}`;
    claims.set(token, structuredClone(value));
    return token;
  }
  async function decode(token) {
    if (!claims.has(token)) throw Error("Untrusted test signature");
    return structuredClone(claims.get(token));
  }
  const config = {
    available: true,
    environment: "Sandbox",
    bundleId: "test.qinban",
    products,
    verifier: {
      verifyAndDecodeTransaction: decode,
      verifyAndDecodeNotification: decode,
      verifyAndDecodeRenewalInfo: decode,
    },
    api: {
      async getTransactionInfo(txn) {
        apiCalls++;
        if (!latest.has(txn)) throw Error("unavailable");
        return { signedTransactionInfo: latest.get(txn) };
      },
      async getTransactionHistory(txn) {
        return { signedTransactions: history.get(txn) || [], hasMore: false };
      },
      async getAllSubscriptionStatuses(txn) {
        return { data: statuses.get(txn) || [] };
      },
    },
  };
  const billing = createAppleBilling({ db, wallet, config, now: () => clock }),
    account = await billing.account(user),
    otherAccount = await billing.account(other);
  function transaction(overrides = {}) {
    return {
      transactionId: "100001",
      originalTransactionId: "100001",
      appAccountToken: account.appAccountToken,
      bundleId: "test.qinban",
      environment: "Sandbox",
      productId: products[0].appleProductId,
      type: "Auto-Renewable Subscription",
      quantity: 1,
      inAppOwnershipType: "PURCHASED",
      purchaseDate: clock - 1000,
      expiresDate: clock + MONTH,
      signedDate: clock,
      ...overrides,
    };
  }
  function publish(data) {
    const token = sign(data);
    latest.set(data.transactionId, token);
    return token;
  }
  function notice(
    type,
    data,
    {
      renewal,
      notificationUUID = randomUUID(),
      signedDate = clock,
      status,
      ...overrides
    } = {},
  ) {
    return {
      signedPayload: sign({
        notificationUUID,
        notificationType: type,
        version: "2.0",
        signedDate,
        data: {
          bundleId: "test.qinban",
          environment: "Sandbox",
          signedTransactionInfo: sign(data),
          ...(renewal
            ? {
                signedRenewalInfo: sign({
                  environment: "Sandbox",
                  originalTransactionId: data.originalTransactionId,
                  signedDate: clock,
                  ...renewal,
                }),
              }
            : {}),
          ...(status ? { status } : {}),
        },
        ...overrides,
      }),
    };
  }
  return {
    db,
    wallet,
    billing,
    config,
    user,
    other,
    account,
    otherAccount,
    sign,
    publish,
    transaction,
    notice,
    latest,
    history,
    statuses,
    clock: () => clock,
    advance: (ms) => (clock += ms),
    apiCalls: () => apiCalls,
    balance: () => wallet.account(user.userId),
  };
}

test("App Store is disabled without configuration and rejects partial, unsafe environments and untrusted JWS", async (t) => {
  const empty = await loadAppleBillingConfiguration({ env: {} });
  assert.equal(empty.available, false);
  await assert.rejects(
    loadAppleBillingConfiguration({
      env: { QINBAN_APPLE_BUNDLE_ID: "test.qinban" },
    }),
    /Incomplete/,
  );
  const base = {
    QINBAN_APPLE_BUNDLE_ID: "test.qinban",
    QINBAN_APPLE_ENVIRONMENT: "Xcode",
    QINBAN_APPLE_ROOT_CERT_FILES: '["root.cer"]',
    QINBAN_APPLE_KEY_ID: "KEY",
    QINBAN_APPLE_ISSUER_ID: "ISSUER",
    QINBAN_APPLE_PRIVATE_KEY_FILE: "key.p8",
    QINBAN_APPLE_PRODUCT_LIGHT: "light",
    QINBAN_APPLE_PRODUCT_STANDARD: "standard",
    QINBAN_APPLE_PRODUCT_PROFESSIONAL: "professional",
    QINBAN_APPLE_PRODUCT_TOPUP: "topup",
  };
  await assert.rejects(
    loadAppleBillingConfiguration({ env: base }),
    /Production or Sandbox/,
  );
  await assert.rejects(
    loadAppleBillingConfiguration({
      env: { ...base, QINBAN_APPLE_ENVIRONMENT: "Sandbox" },
      profile: "production",
    }),
    /cannot fund/,
  );
  const f = await fixture(t),
    off = createAppleBilling({ db: f.db, wallet: f.wallet, config: empty });
  assert.equal(off.catalog().available, false);
  await assert.rejects(
    off.verifyPurchase(f.user, { signedTransaction: f.sign(f.transaction()) }),
    (e) => e.code === "APPLE_UNAVAILABLE",
  );
  const genuineAdapter = createAppleBilling({
    db: f.db,
    wallet: f.wallet,
    config: {
      ...f.config,
      verifier: new SignedDataVerifier(
        [],
        true,
        Environment.SANDBOX,
        "test.qinban",
      ),
    },
  });
  const fake = [{ alg: "ES256" }, f.transaction(), "forged"]
    .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
    .join(".");
  await assert.rejects(
    genuineAdapter.verifyPurchase(f.user, { signedTransaction: fake }),
    (e) => e.code === "APPLE_VERIFICATION",
  );
  assert.equal((await f.balance()).remaining, 30);
  assert.equal(f.apiCalls(), 0);
});

test("account tokens are stable, verified purchases are idempotent, client prices and other users cannot claim them", async (t) => {
  const f = await fixture(t),
    d = f.transaction(),
    jws = f.publish(d);
  assert.equal(
    (await f.billing.account(f.user)).appAccountToken,
    f.account.appAccountToken,
  );
  assert.notEqual(f.account.appAccountToken, f.otherAccount.appAccountToken);
  assert.equal(f.billing.catalog().products[0].points, 300);
  assert.equal(f.billing.catalog().pointsExpire, false);
  await assert.rejects(
    f.billing.verifyPurchase(f.other, { signedTransaction: jws }),
    (e) => e.code === "APPLE_ACCOUNT_MISMATCH",
  );
  assert.equal(f.apiCalls(), 0);
  const results = await Promise.all([
    f.billing.verifyPurchase(f.user, {
      signedTransaction: jws,
      points: 999999,
      priceFen: 1,
    }),
    f.billing.verifyPurchase(f.user, { signedTransaction: jws }),
  ]);
  assert.equal(results.filter((r) => r.duplicate).length, 1);
  assert.equal((await f.balance()).remaining, 330);
  const grants = (await f.balance()).grants.filter((g) => g.kind === "apple");
  assert.equal(grants.length, 1);
  assert.equal(grants[0].expiresAt, null);
  await f.billing.notification(f.notice("SUBSCRIBED", d));
  assert.equal((await f.balance()).remaining, 330);
  f.advance(2 * MONTH);
  assert.equal(
    (await f.billing.account(f.user)).subscription.status,
    "expired",
  );
  assert.equal((await f.balance()).remaining, 330);
});

test("a client JWS predating a refund is reconciled against Apple's current signed transaction", async (t) => {
  const f = await fixture(t),
    original = f.transaction(),
    old = f.sign(original);
  f.advance(1000);
  f.publish({ ...original, revocationDate: f.clock(), signedDate: f.clock() });
  const r = await f.billing.verifyPurchase(f.user, { signedTransaction: old });
  assert.equal(r.accepted, true);
  assert.equal(r.account.subscription.status, "revoked");
  assert.equal((await f.balance()).remaining, 30);
  // An old original signature cannot erase the durable refund even on a replay.
  f.publish(original);
  await f.billing.verifyPurchase(f.user, { signedTransaction: old });
  assert.equal((await f.balance()).remaining, 30);
  assert.equal(
    (await f.billing.account(f.user)).subscription.status,
    "revoked",
  );
});

test("forged scope, environment, product, quantity, ownership and missing account tokens fail before crediting", async (t) => {
  const f = await fixture(t);
  for (const override of [
    { bundleId: "evil.app" },
    { environment: "Production" },
    { productId: "unknown" },
    { quantity: 100 },
    { inAppOwnershipType: "FAMILY_SHARED" },
    { appAccountToken: null },
    { type: "Consumable" },
    { transactionId: "not-a-number" },
    { purchaseDate: f.clock() + 3600000 },
    { signedDate: 0 },
  ]) {
    const bad = f.transaction(override);
    await assert.rejects(
      f.billing.verifyPurchase(f.user, { signedTransaction: f.publish(bad) }),
      (e) => e.code === "APPLE_VERIFICATION",
    );
  }
  const d = f.transaction(),
    signed = f.sign(d);
  f.publish({ ...d, transactionId: "100002" });
  await assert.rejects(
    f.billing.verifyPurchase(f.user, { signedTransaction: signed }),
    (e) => e.code === "APPLE_VERIFICATION",
  );
  assert.equal((await f.balance()).remaining, 30);
});

test("renewals survive duplicate and out-of-order notifications; cancelling renewal preserves the paid term", async (t) => {
  const f = await fixture(t),
    first = f.transaction(),
    firstJWS = f.publish(first);
  await f.billing.verifyPurchase(f.user, { signedTransaction: firstJWS });
  f.advance(MONTH + 1000);
  const next = f.transaction({
    transactionId: "100002",
    originalTransactionId: first.originalTransactionId,
  });
  const n = f.notice("DID_RENEW", next, {
    renewal: { autoRenewStatus: 1 },
    status: 1,
  });
  await Promise.all([f.billing.notification(n), f.billing.notification(n)]);
  assert.equal((await f.balance()).remaining, 630);
  await f.billing.notification(
    f.notice("EXPIRED", first, { signedDate: first.expiresDate, status: 2 }),
  );
  assert.equal((await f.billing.account(f.user)).subscription.status, "active");
  f.advance(1000);
  await f.billing.notification(
    f.notice(
      "DID_CHANGE_RENEWAL_STATUS",
      { ...next, signedDate: f.clock() },
      { renewal: { autoRenewStatus: 0 }, status: 1 },
    ),
  );
  const a = await f.billing.account(f.user);
  assert.equal(a.subscription.autoRenew, false);
  assert.equal(a.subscription.status, "active");
  assert.equal(
    a.subscription.expiresAt,
    new Date(next.expiresDate).toISOString(),
  );
  // Replaying the older enabled state does not switch auto-renew back on.
  await f.billing.notification(n);
  assert.equal((await f.billing.account(f.user)).subscription.autoRenew, false);
  const originalNotice = JSON.parse(
    Buffer.from(n.signedPayload.split(".")[1], "base64url").toString(),
  );
  await assert.rejects(
    f.billing.notification(
      f.notice("REFUND", next, {
        notificationUUID: originalNotice.notificationUUID,
      }),
    ),
    (e) => e.code === "APPLE_VERIFICATION",
  );
});

test("only a verified active grace period extends service, without minting another month's points", async (t) => {
  const f = await fixture(t),
    d = f.transaction();
  await f.billing.verifyPurchase(f.user, { signedTransaction: f.publish(d) });
  f.advance(MONTH + 1000);
  const grace = f.clock() + 3 * 86400000;
  await f.billing.notification(
    f.notice(
      "DID_FAIL_TO_RENEW",
      { ...d, signedDate: f.clock() },
      {
        status: 4,
        renewal: { autoRenewStatus: 1, gracePeriodExpiresDate: grace },
      },
    ),
  );
  assert.equal(
    (await f.billing.account(f.user)).subscription.status,
    "gracePeriod",
  );
  assert.equal((await f.balance()).remaining, 330);
  f.advance(3 * 86400000 + 1);
  assert.equal(
    (await f.billing.account(f.user)).subscription.status,
    "expired",
  );
  await f.billing.notification(
    f.notice(
      "GRACE_PERIOD_EXPIRED",
      { ...d, signedDate: f.clock() },
      { status: 3, renewal: { autoRenewStatus: 1 } },
    ),
  );
  assert.equal(
    (await f.billing.account(f.user)).subscription.status,
    "expired",
  );
});

test("refunds revoke remaining and frozen grants without negative balances; reversal restores only unused credits", async (t) => {
  const f = await fixture(t),
    d = f.transaction();
  await f.billing.verifyPurchase(f.user, { signedTransaction: f.publish(d) });
  const grant = (await f.balance()).grants.find((g) => g.kind === "apple"),
    job = randomUUID();
  await f.db.control(async (tx) => {
    await tx.query(
      "UPDATE qinban_control.point_grants SET spent=40,held=15 WHERE id=$1",
      [grant.id],
    );
    await tx.query(
      "INSERT INTO qinban_control.point_jobs(job_id,owner_id,region_ids,points_per_region,reserved,created_at) VALUES($1,$2,$3,5,15,$4)",
      [
        job,
        f.user.userId,
        JSON.stringify(["r1", "r2", "r3"]),
        new Date(f.clock()).toISOString(),
      ],
    );
    await tx.query(
      "INSERT INTO qinban_control.point_allocations(job_id,grant_id,amount) VALUES($1,$2,15)",
      [job, grant.id],
    );
  });
  assert.equal((await f.balance()).remaining, 275);
  f.advance(1000);
  const refunded = { ...d, signedDate: f.clock(), revocationDate: f.clock() };
  const refund = f.notice("REFUND", refunded);
  // A later re-signing of normal purchase data must not mask a delayed refund.
  f.advance(1000);
  f.publish({ ...d, signedDate: f.clock() });
  await f.billing.verifyPurchase(f.user, { signedTransaction: f.sign(d) });
  await f.billing.notification(refund);
  await f.billing.notification(refund);
  assert.equal((await f.balance()).remaining, 30);
  assert.equal((await f.balance()).held, 15);
  assert.equal(
    (await f.billing.account(f.user)).subscription.status,
    "revoked",
  );
  await f.db.private(f.user.userId, (tx) => f.wallet.settle(tx, job));
  assert.equal((await f.balance()).remaining, 30);
  assert.equal((await f.balance()).held, 0);
  f.advance(1000);
  const reversal = f.notice("REFUND_REVERSED", { ...d, signedDate: f.clock() });
  // Advance the normal transaction proof again while the signed reversal is
  // delayed in transit; its independent financial version must still apply.
  f.advance(1000);
  f.publish({ ...refunded, signedDate: f.clock() });
  await f.billing.verifyPurchase(f.user, { signedTransaction: f.sign(d) });
  assert.equal((await f.balance()).remaining, 30);
  await f.billing.notification(reversal);
  await f.billing.notification(reversal);
  assert.equal((await f.balance()).remaining, 290);
  assert.equal((await f.billing.account(f.user)).subscription.status, "active");
  assert.equal(
    (await f.balance()).grants.find((g) => g.id === grant.id).remaining,
    260,
  );
  // Older refund delivery after the reversal must not revoke the restored points.
  await f.billing.notification(
    f.notice("REFUND", refunded, { signedDate: refunded.signedDate }),
  );
  assert.equal((await f.balance()).remaining, 290);
  // Re-signing the historical refund cannot make its old revocation newer.
  f.advance(1000);
  f.publish({ ...refunded, signedDate: f.clock() });
  await f.billing.verifyPurchase(f.user, { signedTransaction: f.sign(d) });
  assert.equal((await f.balance()).remaining, 290);
});

test("retired accounts acknowledge late notifications without resurrecting a wallet or allowing a new account to claim purchases", async (t) => {
  const f = await fixture(t),
    d = f.transaction(),
    jws = f.publish(d);
  await f.billing.verifyPurchase(f.user, { signedTransaction: jws });
  await f.db.control(async (tx) => {
    await tx.query(
      "INSERT INTO qinban_control.deleted_accounts VALUES($1,$2)",
      [f.user.userId, new Date(f.clock()).toISOString()],
    );
    await tx.query(
      "UPDATE qinban_control.apple_accounts SET owner_id=NULL,retired_at=$1 WHERE owner_id=$2",
      [new Date(f.clock()).toISOString(), f.user.userId],
    );
    await tx.query(
      "UPDATE qinban_control.apple_transactions SET owner_id=NULL WHERE owner_id=$1",
      [f.user.userId],
    );
    await tx.query(
      "UPDATE qinban_control.apple_subscriptions SET owner_id=NULL WHERE owner_id=$1",
      [f.user.userId],
    );
  });
  f.advance(1000);
  const later = f.transaction({
    transactionId: "100009",
    originalTransactionId: d.originalTransactionId,
  });
  const n = await f.billing.notification(f.notice("DID_RENEW", later));
  assert.equal(n.accepted, true);
  await assert.rejects(f.balance(), (e) => e.code === "ACCOUNT_DELETED");
  await assert.rejects(
    f.billing.verifyPurchase(f.other, { signedTransaction: jws }),
    (e) => e.code === "APPLE_ACCOUNT_MISMATCH",
  );
  const rows = await f.db.control((tx) =>
    tx.query("SELECT outcome FROM qinban_control.apple_notifications"),
  );
  assert.equal(rows.rows[0].outcome, "retired_account");
});

test("restore reconciles missed transaction history and authoritative renewal status, with throttling", async (t) => {
  const f = await fixture(t),
    first = f.transaction();
  await f.billing.verifyPurchase(f.user, {
    signedTransaction: f.publish(first),
  });
  f.advance(MONTH + 1000);
  const next = f.transaction({
      transactionId: "100010",
      originalTransactionId: first.originalTransactionId,
    }),
    thirdParty = f.transaction({
      transactionId: "100020",
      originalTransactionId: "100020",
      appAccountToken: f.otherAccount.appAccountToken,
    });
  f.history.set(first.originalTransactionId, [
    f.sign(first),
    f.sign(next),
    f.sign(thirdParty),
  ]);
  f.statuses.set(first.originalTransactionId, [
    {
      lastTransactions: [
        {
          status: 1,
          signedTransactionInfo: f.sign(next),
          signedRenewalInfo: f.sign({
            environment: "Sandbox",
            originalTransactionId: first.originalTransactionId,
            signedDate: f.clock(),
            autoRenewStatus: 0,
          }),
        },
      ],
    },
  ]);
  const result = await f.billing.sync(f.user);
  assert.equal(result.reconciled, 2);
  assert.equal(result.account.subscription.autoRenew, false);
  assert.equal((await f.balance()).remaining, 630);
  assert.equal((await f.wallet.account(f.other.userId)).remaining, 30);
  await assert.rejects(
    f.billing.sync(f.user),
    (e) => e.code === "APPLE_SYNC_RATE_LIMIT",
  );
});

test("one database cannot accept both Sandbox and Production receipts", async (t) => {
  const f = await fixture(t);
  const production = createAppleBilling({
    db: f.db,
    wallet: f.wallet,
    config: { ...f.config, environment: "Production", appAppleId: 123456 },
  });
  await assert.rejects(
    production.initialize(),
    (e) => e.code === "APPLE_ENVIRONMENT_MISMATCH",
  );
  await assert.rejects(
    production.account(f.user),
    (e) => e.code === "APPLE_ENVIRONMENT_MISMATCH",
  );
  const rows = await f.db.control((tx) =>
    tx.query("SELECT * FROM qinban_control.apple_environment"),
  );
  assert.deepEqual(rows.rows, [{ id: 1, environment: "Sandbox" }]);
});

test("consumable-only restore uses transaction information and never requests a subscription status", async (t) => {
  const f = await fixture(t),
    d = f.transaction({
      productId: "test.qinban.topup",
      type: "Consumable",
      expiresDate: undefined,
    });
  await f.billing.verifyPurchase(f.user, { signedTransaction: f.publish(d) });
  f.config.api.getAllSubscriptionStatuses = async () => {
    throw Error("No subscription for a consumable");
  };
  f.config.api.getTransactionHistory = async () => {
    throw Error("No subscription history needed");
  };
  const result = await f.billing.sync(f.user);
  assert.equal(result.reconciled, 1);
  assert.equal(result.account.subscription, null);
  assert.equal((await f.balance()).remaining, 180);
});
