import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, verify, createCipheriv } from "node:crypto";
import {
  createWechatGateway,
  createAlipayGateway,
  cnyFen,
  safePaymentUrl,
} from "../lib/accounts/payment-gateways.mjs";

const keys = () =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
const platform = keys(),
  merchant = keys(),
  timestamp = "1793131200";
const signed = (raw) => ({
  "wechatpay-timestamp": timestamp,
  "wechatpay-nonce": "nonce",
  "wechatpay-serial": "PUB_KEY_ID_fixture",
  "wechatpay-signature": sign(
    "RSA-SHA256",
    Buffer.from(`${timestamp}\nnonce\n${raw}\n`),
    platform.privateKey,
  ).toString("base64"),
});
const wxConfig = {
  appId: "wx-app",
  mchId: "mch-1",
  serial: "merchant-serial",
  publicKeyId: "PUB_KEY_ID_fixture",
  privateKey: merchant.privateKey,
  publicKey: platform.publicKey,
  apiV3Key: "0123456789abcdef0123456789abcdef",
  notifyUrl: "https://piano.example/api/v1/payments/notify/wechat",
};
const paid = {
  appid: "wx-app",
  mchid: "mch-1",
  trade_state: "SUCCESS",
  out_trade_no: "order1",
  transaction_id: "txn1",
  amount: { total: 2900, currency: "CNY" },
};
function wxNotification(data) {
  const nonce = "123456789012",
    aad = "transaction";
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(wxConfig.apiV3Key),
    Buffer.from(nonce),
  );
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data)),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return JSON.stringify({
    event_type: "TRANSACTION.SUCCESS",
    resource: {
      algorithm: "AEAD_AES_256_GCM",
      original_type: "transaction",
      ciphertext: encrypted.toString("base64"),
      nonce,
      associated_data: aad,
    },
  });
}
test("WeChat signs requests, verifies responses, authenticates and decrypts notifications", async () => {
  let requestBody;
  const wx = createWechatGateway({
    config: wxConfig,
    now: () => Number(timestamp) * 1000,
    fetchImpl: async (url, options) => {
      assert.equal(
        url,
        "https://api.mch.weixin.qq.com/v3/pay/transactions/native",
      );
      requestBody = JSON.parse(options.body);
      const auth = Object.fromEntries(
        [...options.headers.Authorization.matchAll(/(\w+)="([^"]+)"/g)].map(
          (m) => [m[1], m[2]],
        ),
      );
      assert.ok(
        verify(
          "RSA-SHA256",
          Buffer.from(
            `POST\n/v3/pay/transactions/native\n${auth.timestamp}\n${auth.nonce_str}\n${options.body}\n`,
          ),
          merchant.publicKey,
          Buffer.from(auth.signature, "base64"),
        ),
      );
      const raw = JSON.stringify({
        code_url: "weixin://wxpay/bizpayurl?pr=test",
      });
      return new Response(raw, { headers: signed(raw) });
    },
  });
  assert.equal(
    await wx.checkout({
      orderNo: "order1",
      product: { name: "轻享版" },
      priceFen: 2900,
      expiresAt: "2026-10-28T00:00:00Z",
    }),
    "weixin://wxpay/bizpayurl?pr=test",
  );
  assert.deepEqual(requestBody.amount, { total: 2900, currency: "CNY" });
  const raw = wxNotification(paid),
    payment = await wx.notification(signed(raw), raw);
  assert.deepEqual(payment, {
    orderNo: "order1",
    transactionId: "txn1",
    amountFen: 2900,
    currency: "CNY",
  });
  await assert.rejects(
    wx.notification(signed(raw), raw + " "),
    (e) => e.code === "PAYMENT_VERIFICATION",
  );
  await assert.rejects(
    wx.notification({ ...signed(raw), "wechatpay-serial": "unknown" }, raw),
    (e) => e.code === "PAYMENT_VERIFICATION",
  );
  const wrongMerchant = wxNotification({ ...paid, mchid: "wrong" });
  await assert.rejects(
    wx.notification(signed(wrongMerchant), wrongMerchant),
    (e) => e.code === "PAYMENT_VERIFICATION",
  );
  const stale = createWechatGateway({
    config: wxConfig,
    now: () => Number(timestamp) * 1000 + 301000,
  });
  await assert.rejects(
    stale.notification(signed(raw), raw),
    (e) => e.code === "PAYMENT_VERIFICATION",
  );
  const invalidResponse = createWechatGateway({
    config: wxConfig,
    now: () => Number(timestamp) * 1000,
    fetchImpl: async () =>
      new Response('{"code_url":"weixin://wxpay/bizpayurl?pr=forged"}'),
  });
  await assert.rejects(
    invalidResponse.checkout({ product: { name: "test" } }),
    (e) => e.code === "PAYMENT_VERIFICATION",
  );
});
test("Alipay official SDK verifies RSA2 callbacks and validates app, merchant, status and exact amount", async () => {
  const config = {
    appId: "ali-app",
    sellerId: "seller-1",
    privateKey: merchant.privateKey,
    publicKey: platform.publicKey,
    notifyUrl: "https://piano.example/api/v1/payments/notify/alipay",
  };
  const ali = createAlipayGateway({ config });
  function form(changes = {}) {
    const data = {
      app_id: "ali-app",
      seller_id: "seller-1",
      trade_status: "TRADE_SUCCESS",
      out_trade_no: "order1",
      trade_no: "ali-txn",
      total_amount: "59.00",
      subject: "琴伴 + 100%",
      ...changes,
    };
    const message = Object.keys(data)
      .sort()
      .map((k) => k + "=" + data[k])
      .join("&");
    return new URLSearchParams({
      ...data,
      sign_type: "RSA2",
      sign: sign(
        "RSA-SHA256",
        Buffer.from(message),
        platform.privateKey,
      ).toString("base64"),
    }).toString();
  }
  assert.equal((await ali.notification({}, form())).amountFen, 5900);
  await assert.rejects(
    ali.notification({}, form({ app_id: "other" })),
    (e) => e.code === "PAYMENT_VERIFICATION",
  );
  await assert.rejects(
    ali.notification({}, form({ seller_id: "other" })),
    (e) => e.code === "PAYMENT_VERIFICATION",
  );
  await assert.rejects(
    ali.notification({}, form().replace("59.00", "0.01")),
    (e) => e.code === "PAYMENT_VERIFICATION",
  );
  assert.equal(
    await ali.notification({}, form({ trade_status: "WAIT_BUYER_PAY" })),
    null,
  );
  await assert.rejects(
    ali.notification({}, form() + "&total_amount=59.00"),
    (e) => e.code === "PAYMENT_VERIFICATION",
  );
  assert.equal(cnyFen("0.01"), 1);
  assert.equal(cnyFen("29"), 2900);
  for (const amount of ["1e2", "-1", "0.001", "NaN"])
    assert.throws(() => cnyFen(amount));
  for (const url of [
    "javascript:alert(1)",
    "https://qr.alipay.com.evil.example/pay",
  ])
    assert.throws(() => safePaymentUrl(url, "alipay"));
  let sent;
  const fake = createAlipayGateway({
    config,
    sdk: {
      async curl(pathMethod, path, options) {
        sent = { pathMethod, path, ...options };
        return { data: { qr_code: "https://qr.alipay.com/fixture" } };
      },
    },
  });
  await fake.checkout({
    orderNo: "order1",
    product: { name: "标准版" },
    priceFen: 5900,
  });
  assert.equal(sent.path, "/v3/alipay/trade/precreate");
  assert.equal(sent.body.total_amount, "59.00");
  assert.equal(sent.body.notify_url, config.notifyUrl);
});
