import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createAccountDatabase } from "../lib/accounts/database.mjs";
import { createIdentity } from "../lib/accounts/identity.mjs";
import { createPrivateFiles } from "../lib/accounts/storage.mjs";
import { createSubscriptions } from "../lib/accounts/subscriptions.mjs";
import { maintainAccounts } from "../lib/accounts/maintenance.mjs";

test("deleting an account during checkout cannot restore a QR code, wallet, private file, or another transaction's payment record", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "qinban-deleted-payment-"));
  const db = await createAccountDatabase({ directory: join(directory, "db") });
  const files = createPrivateFiles(join(directory, "files"));
  const messages = [];
  const identity = createIdentity({
    db,
    secret: "test-only-secret".repeat(4),
    mailer: async (m) => messages.push(m),
  });
  t.after(async () => {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });
  const nonce = randomUUID();
  await identity.invite("deleted@example.test");
  const challenge = await identity.code({
    email: "deleted@example.test",
    nonce,
  });
  const signed = await identity.verify({
    challengeId: challenge.challengeId,
    code: messages[0].code,
    nonce,
  });
  const owner = signed.session.userId;
  let releaseGateway;
  let gatewayEntered;
  const entered = new Promise((r) => {
    gatewayEntered = r;
  });
  const gateway = new Promise((r) => {
    releaseGateway = r;
  });
  const subscriptions = createSubscriptions({
    db,
    gateways: {
      wechat: {
        ready: true,
        async checkout() {
          gatewayEntered();
          return gateway;
        },
        async notification(_headers, raw) {
          return JSON.parse(raw);
        },
      },
    },
  });
  const pending = subscriptions.checkout(
    owner,
    { productId: "light", provider: "wechat" },
    randomUUID(),
  );
  // Attach the rejection handler before unblocking the asynchronous payment request.
  const rejected = assert.rejects(pending, { code: "ACCOUNT_DELETED" });
  await entered;
  const resource = randomUUID();
  await files.write(owner, resource, Buffer.from("private score"));
  await identity.deleteAccount(signed.session, {
    mode: "immediate",
    confirmationEmail: "deleted@example.test",
  });
  assert.equal((await maintainAccounts({ db, files })).accountsPurged, 1);
  releaseGateway("weixin://wxpay/bizpayurl?pr=deleted-order");
  await rejected;
  const order = (
    await db.control((tx) =>
      tx.query(
        "SELECT * FROM qinban_control.payment_orders WHERE owner_id=$1",
        [owner],
      ),
    )
  ).rows[0];
  assert.equal(order.checkout_url, null);
  const payment = {
    orderNo: order.order_no,
    transactionId: "first-real-transaction",
    amountFen: 2900,
    currency: "CNY",
  };
  assert.deepEqual(
    await subscriptions.notification("wechat", {}, JSON.stringify(payment)),
    { accountDeleted: true, requiresMerchantReview: true },
  );
  await assert.rejects(
    subscriptions.notification(
      "wechat",
      {},
      JSON.stringify({ ...payment, transactionId: "another-transaction" }),
    ),
    { code: "PAYMENT_MISMATCH" },
  );
  assert.equal(
    (
      await db.control((tx) =>
        tx.query(
          "SELECT transaction_id FROM qinban_control.payment_orders WHERE id=$1",
          [order.id],
        ),
      )
    ).rows[0].transaction_id,
    payment.transactionId,
  );
  assert.equal(
    (
      await db.control((tx) =>
        tx.query(
          "SELECT * FROM qinban_control.point_accounts WHERE owner_id=$1",
          [owner],
        ),
      )
    ).rows.length,
    0,
  );
  await assert.rejects(subscriptions.wallet.account(owner), {
    code: "ACCOUNT_DELETED",
  });
  await assert.rejects(
    files.write(owner, randomUUID(), Buffer.from("late upload")),
    { code: "ACCOUNT_DELETED" },
  );
  await assert.rejects(
    createPrivateFiles(join(directory, "files")).write(
      owner,
      randomUUID(),
      Buffer.from("after restart"),
    ),
    { code: "ACCOUNT_DELETED" },
  );
  assert.deepEqual(await files.objects(owner), []);
  const other = randomUUID();
  await files.write(other, resource, Buffer.from("another account"));
  assert.equal(
    (await files.read(other, resource)).toString(),
    "another account",
  );
});
