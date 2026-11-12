import test from "node:test";
import assert from "node:assert/strict";
import { createApplePurchases } from "../src/ios/native.js";

const transaction = {
  transactionId: "1234",
  signedTransaction: "signed.by.apple",
  productId: "piano.topup",
};
function setup() {
  const calls = [];
  const client = {
    epoch: 1,
    session: { user: { id: "user-a" } },
    checkEpoch(epoch) {
      if (epoch !== this.epoch)
        throw Object.assign(new Error("账号已切换"), {
          code: "IDENTITY_CHANGED",
        });
    },
    async json(path, options) {
      calls.push({ path, options });
      if (path === "/app-store/account")
        return { available: true, appAccountToken: "server-account-token" };
      return { accepted: true, transactionId: "1234" };
    },
  };
  const bridge = {
    async purchase(input) {
      calls.push({ purchase: input });
      return { status: "success", transaction };
    },
    async finishTransaction(input) {
      calls.push({ finish: input });
    },
    async pendingTransactions() {
      return { transactions: [transaction] };
    },
    async restore() {
      calls.push({ restore: true });
      return { transactions: [transaction] };
    },
  };
  return {
    client,
    bridge,
    calls,
    purchases: createApplePurchases({ client, bridge }),
  };
}

test("native purchase uses server account token and finishes only after committed matching server transaction", async () => {
  const { purchases, calls } = setup();
  await purchases.purchase("piano.topup");
  assert.deepEqual(calls[1], {
    purchase: {
      productId: "piano.topup",
      appAccountToken: "server-account-token",
    },
  });
  assert.deepEqual(calls[2].options.body, {
    signedTransaction: transaction.signedTransaction,
  });
  assert.deepEqual(calls[3], { finish: { transactionId: "1234" } });
});

test("failed verification and mismatched server transaction never finish the StoreKit transaction", async () => {
  for (const result of [
    new Error("网络中断"),
    { accepted: false },
    { accepted: true, transactionId: "wrong" },
  ]) {
    const { client, purchases, calls } = setup();
    client.json = async () => {
      if (result instanceof Error) throw result;
      return result;
    };
    await assert.rejects(purchases.submit(transaction));
    assert.equal(
      calls.some((c) => c.finish),
      false,
    );
  }
});

test("switching account while server validates cannot finish or expose old account result", async () => {
  const { client, purchases, calls } = setup();
  client.json = async () => {
    client.epoch++;
    return { accepted: true, transactionId: "1234" };
  };
  await assert.rejects(purchases.submit(transaction), {
    code: "IDENTITY_CHANGED",
  });
  assert.equal(
    calls.some((c) => c.finish),
    false,
  );
});

test("cancelled and pending Apple purchases do not call the transaction API or finish", async () => {
  for (const status of ["cancelled", "pending"]) {
    const { bridge, purchases, calls } = setup();
    bridge.purchase = async () => ({ status });
    assert.equal((await purchases.purchase("piano.topup")).status, status);
    assert.equal(
      calls.some((c) => c.path === "/app-store/transactions" || c.finish),
      false,
    );
  }
});

test("a purchase event and purchase callback coalesce; restore prompts only on explicit restore", async () => {
  const { purchases, calls } = setup();
  await Promise.all([
    purchases.submit(transaction),
    purchases.submit(transaction),
  ]);
  assert.equal(
    calls.filter((c) => c.path === "/app-store/transactions").length,
    1,
  );
  assert.equal(calls.filter((c) => c.finish).length, 1);
  await purchases.syncTransactions();
  assert.equal(
    calls.some((c) => c.restore),
    false,
  );
  await purchases.syncTransactions({ restore: true });
  assert.equal(calls.filter((c) => c.restore).length, 1);
});

test("wrong-account restore preserves unfinished transactions and still processes independent valid purchases", async () => {
  const { client, bridge, purchases, calls } = setup();
  bridge.restore = async () => ({
    transactions: [
      { ...transaction, signedTransaction: "another.account" },
      transaction,
    ],
    unverifiedCount: 1,
  });
  const json = client.json.bind(client);
  client.json = async (path, options) => {
    if (options?.body.signedTransaction === "another.account")
      throw new Error("购买属于其他账号");
    return json(path, options);
  };
  const result = await purchases.syncTransactions({ restore: true });
  assert.equal(result.synced, 1);
  assert.equal(result.failures.length, 2);
  assert.equal(calls.filter((c) => c.finish).length, 1);
});
