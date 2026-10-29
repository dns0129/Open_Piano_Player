// @ts-check
import { readFile } from "node:fs/promises";
import { sign, verify, randomBytes, createDecipheriv } from "node:crypto";
import { AlipaySdk } from "alipay-sdk";
import { fail } from "./common.mjs";

const invalid = () =>
  fail(
    "PAYMENT_VERIFICATION",
    "支付信息验证失败，请联系支持人员核对订单。",
    400,
  );
const unavailable = () =>
  fail("PAYMENT_UNAVAILABLE", "支付渠道尚未配置或暂不可用，请稍后重试。", 503);
export function cnyFen(value) {
  if (typeof value !== "string" || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value))
    throw invalid();
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function safePaymentUrl(value, provider) {
  if (typeof value !== "string" || value.length > 4096) throw invalid();
  const u = new URL(value);
  if (
    u.username ||
    u.password ||
    !(provider === "wechat"
      ? u.protocol === "weixin:" && u.hostname === "wxpay"
      : u.protocol === "https:" &&
        (u.hostname === "qr.alipay.com" || u.hostname.endsWith(".alipay.com")))
  )
    throw invalid();
  return value;
}

export function createWechatGateway({
  config,
  fetchImpl = fetch,
  now = () => Date.now(),
}) {
  const ready = !!(
    config.appId &&
    config.mchId &&
    config.serial &&
    config.privateKey &&
    config.publicKey &&
    config.publicKeyId &&
    Buffer.byteLength(config.apiV3Key || "") === 32 &&
    config.notifyUrl?.startsWith("https://")
  );
  function verifyMessage(headers, raw) {
    const get = (key) =>
      headers.get ? headers.get(key) : headers[key.toLowerCase()];
    const timestamp = get("Wechatpay-Timestamp"),
      nonce = get("Wechatpay-Nonce"),
      signature = get("Wechatpay-Signature");
    if (
      !ready ||
      !/^\d+$/.test(timestamp || "") ||
      Math.abs(now() / 1000 - Number(timestamp)) > 300 ||
      !nonce ||
      !signature ||
      get("Wechatpay-Serial") !== config.publicKeyId
    )
      throw invalid();
    if (
      !verify(
        "RSA-SHA256",
        Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),
        config.publicKey,
        Buffer.from(signature, "base64"),
      )
    )
      throw invalid();
  }
  async function request(method, path, body) {
    if (!ready) throw unavailable();
    const raw = body ? JSON.stringify(body) : "",
      timestamp = String(Math.floor(now() / 1000)),
      nonce = randomBytes(16).toString("hex");
    const signature = sign(
      "RSA-SHA256",
      Buffer.from(`${method}\n${path}\n${timestamp}\n${nonce}\n${raw}\n`),
      config.privateKey,
    ).toString("base64");
    const response = await fetchImpl("https://api.mch.weixin.qq.com" + path, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Wechatpay-Serial": config.publicKeyId,
        Authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.serial}",signature="${signature}"`,
      },
      ...(raw ? { body: raw } : {}),
    });
    const text = await response.text();
    if (text.length > 65536) throw invalid();
    // Also verify non-success responses before interpreting an upstream status.
    verifyMessage(response.headers, text);
    if (response.status === 404 && method === "GET") return null;
    if (!response.ok) throw unavailable();
    return JSON.parse(text);
  }
  function payment(data) {
    if (data.mchid !== config.mchId || data.appid !== config.appId)
      throw invalid();
    if (data.trade_state !== "SUCCESS") return null;
    if (
      !Number.isSafeInteger(data.amount?.total) ||
      data.amount.currency !== "CNY" ||
      !data.transaction_id ||
      !data.out_trade_no
    )
      throw invalid();
    return {
      orderNo: data.out_trade_no,
      transactionId: data.transaction_id,
      amountFen: data.amount.total,
      currency: "CNY",
    };
  }
  return {
    ready,
    async checkout(order) {
      const data = await request("POST", "/v3/pay/transactions/native", {
        appid: config.appId,
        mchid: config.mchId,
        out_trade_no: order.orderNo,
        description: "琴伴 · " + order.product.name,
        notify_url: config.notifyUrl,
        time_expire: order.expiresAt,
        amount: { total: order.priceFen, currency: "CNY" },
      });
      return safePaymentUrl(data.code_url, "wechat");
    },
    async query(order) {
      const data = await request(
        "GET",
        `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.orderNo)}?mchid=${encodeURIComponent(config.mchId)}`,
      );
      return data ? payment(data) : null;
    },
    async notification(headers, raw) {
      verifyMessage(headers, raw);
      const body = JSON.parse(raw);
      if (body.event_type !== "TRANSACTION.SUCCESS") return null;
      const r = body.resource;
      if (
        r?.algorithm !== "AEAD_AES_256_GCM" ||
        r.original_type !== "transaction"
      )
        throw invalid();
      const encrypted = Buffer.from(r.ciphertext, "base64");
      if (encrypted.length <= 16) throw invalid();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(config.apiV3Key),
        Buffer.from(r.nonce),
      );
      decipher.setAuthTag(encrypted.subarray(-16));
      decipher.setAAD(Buffer.from(r.associated_data || ""));
      const data = JSON.parse(
        Buffer.concat([
          decipher.update(encrypted.subarray(0, -16)),
          decipher.final(),
        ]).toString("utf8"),
      );
      return payment(data);
    },
  };
}

/** @param {{ config: any, sdk?: any }} options */
export function createAlipayGateway({ config, sdk: injectedSdk }) {
  const ready = !!(
    config.appId &&
    config.sellerId &&
    config.privateKey &&
    config.publicKey &&
    config.notifyUrl?.startsWith("https://")
  );
  const sdk =
    injectedSdk ||
    (ready
      ? new AlipaySdk({
          appId: config.appId,
          privateKey: config.privateKey,
          alipayPublicKey: config.publicKey,
          keyType: config.privateKey.includes("BEGIN RSA PRIVATE KEY")
            ? "PKCS1"
            : "PKCS8",
          signType: "RSA2",
          timeout: 15000,
          camelcase: false,
        })
      : null);
  function payment(data, notify = false) {
    if (
      (notify && data.app_id !== config.appId) ||
      (data.seller_id && data.seller_id !== config.sellerId) ||
      (notify && data.seller_id !== config.sellerId)
    )
      throw invalid();
    if (!["TRADE_SUCCESS", "TRADE_FINISHED"].includes(data.trade_status))
      return null;
    if (!data.trade_no || !data.out_trade_no) throw invalid();
    return {
      orderNo: data.out_trade_no,
      transactionId: data.trade_no,
      amountFen: cnyFen(data.total_amount),
      currency: "CNY",
    };
  }
  return {
    ready,
    async checkout(order) {
      if (!ready) throw unavailable();
      const result = await sdk.curl("POST", "/v3/alipay/trade/precreate", {
        body: {
          out_trade_no: order.orderNo,
          total_amount: (order.priceFen / 100).toFixed(2),
          subject: "琴伴 · " + order.product.name,
          notify_url: config.notifyUrl,
          timeout_express: "30m",
        },
      });
      return safePaymentUrl(result.data.qr_code, "alipay");
    },
    async query(order) {
      if (!ready) throw unavailable();
      try {
        const result = await sdk.curl("POST", "/v3/alipay/trade/query", {
          body: { out_trade_no: order.orderNo },
        });
        return payment(result.data);
      } catch (e) {
        if (e.code === "ACQ.TRADE_NOT_EXIST") return null;
        throw e;
      }
    },
    async notification(_headers, raw) {
      if (!ready) throw unavailable();
      const form = new URLSearchParams(raw),
        data = {};
      for (const [key, value] of form) {
        if (Object.hasOwn(data, key)) throw invalid();
        Object.defineProperty(data, key, { value, enumerable: true });
      }
      if (data.sign_type !== "RSA2" || !sdk.checkNotifySignV2(data))
        throw invalid();
      return payment(data, true);
    },
  };
}

/** @param {{ env?: NodeJS.ProcessEnv, now?: () => number, fetchImpl?: typeof fetch }} [options] */
export async function loadPaymentGateways({
  env = process.env,
  now,
  fetchImpl,
} = {}) {
  const origin = env.QINBAN_PUBLIC_ORIGIN;
  if (
    origin &&
    (new URL(origin).protocol !== "https:" || new URL(origin).origin !== origin)
  )
    throw Error(
      "QINBAN_PUBLIC_ORIGIN must be a plain HTTPS origin for payments",
    );
  const key = async (name) => (env[name] ? readFile(env[name], "utf8") : "");
  const [wxPrivate, wxPublic, aliPrivate, aliPublic] = await Promise.all(
    [
      "QINBAN_WECHAT_PRIVATE_KEY_FILE",
      "QINBAN_WECHAT_PUBLIC_KEY_FILE",
      "QINBAN_ALIPAY_PRIVATE_KEY_FILE",
      "QINBAN_ALIPAY_PUBLIC_KEY_FILE",
    ].map(key),
  );
  return {
    wechat: createWechatGateway({
      now,
      fetchImpl,
      config: {
        appId: env.QINBAN_WECHAT_APP_ID,
        mchId: env.QINBAN_WECHAT_MCH_ID,
        serial: env.QINBAN_WECHAT_CERT_SERIAL,
        publicKeyId: env.QINBAN_WECHAT_PUBLIC_KEY_ID,
        apiV3Key: env.QINBAN_WECHAT_API_V3_KEY,
        privateKey: wxPrivate,
        publicKey: wxPublic,
        notifyUrl: origin && origin + "/api/v1/payments/notify/wechat",
      },
    }),
    alipay: createAlipayGateway({
      config: {
        appId: env.QINBAN_ALIPAY_APP_ID,
        sellerId: env.QINBAN_ALIPAY_SELLER_ID,
        privateKey: aliPrivate,
        publicKey: aliPublic,
        notifyUrl: origin && origin + "/api/v1/payments/notify/alipay",
      },
    }),
  };
}
