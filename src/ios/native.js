// Native availability chooses a storefront; it is never proof of payment or identity.
export function isIOSApp() {
  return (
    globalThis.window?.QinbanNative?.platform === "ios" ||
    /\bQinbanIOS\//.test(globalThis.navigator?.userAgent || "")
  );
}

export function nativeBridge() {
  const bridge = globalThis.window?.QinbanNative;
  if (!bridge || bridge.apiVersion !== 1 || bridge.platform !== "ios")
    throw new Error("Apple 购买暂时不可用，请关闭并重新打开 App。");
  return bridge;
}

// The transaction is kept unfinished by StoreKit until the server commits it.
// A network interruption, logout or wrong-account restore must never finish it.
export function createApplePurchases({ client, bridge, onUpdate = () => {} }) {
  const inFlight = new Map();
  async function submit(transaction, generation = client.epoch) {
    client.checkEpoch(generation);
    if (!client.session) throw new Error("请先登录购买时使用的琴伴账号。");
    if (
      !transaction ||
      typeof transaction.signedTransaction !== "string" ||
      !transaction.signedTransaction ||
      typeof transaction.transactionId !== "string"
    )
      throw new Error("Apple 交易信息不完整，请使用恢复购买重新同步。");
    const key = generation + ":" + transaction.transactionId;
    if (inFlight.has(key)) return inFlight.get(key);
    const work = (async () => {
      const result = await client.json("/app-store/transactions", {
        method: "POST",
        expectedEpoch: generation,
        body: { signedTransaction: transaction.signedTransaction },
      });
      client.checkEpoch(generation);
      if (
        !result.accepted ||
        result.transactionId !== transaction.transactionId
      )
        throw new Error("交易尚未确认，已保留购买记录，请稍后重新同步。");
      await bridge.finishTransaction({
        transactionId: transaction.transactionId,
      });
      client.checkEpoch(generation);
      await onUpdate(result);
      return result;
    })();
    inFlight.set(key, work);
    try {
      return await work;
    } finally {
      inFlight.delete(key);
    }
  }
  async function syncTransactions({ restore = false } = {}) {
    const generation = client.epoch;
    if (!client.session) throw new Error("请先登录购买时使用的琴伴账号。");
    const result = await (restore
      ? bridge.restore()
      : bridge.pendingTransactions());
    client.checkEpoch(generation);
    let synced = 0;
    const failures = [];
    for (const transaction of result.transactions || []) {
      try {
        await submit(transaction, generation);
        synced++;
      } catch (error) {
        if (error.code === "IDENTITY_CHANGED") throw error;
        failures.push(error.message);
      }
    }
    if (result.unverifiedCount)
      failures.push("部分 Apple 交易未通过验证，尚未计入权益。");
    return { synced, failures };
  }
  return {
    submit,
    syncTransactions,
    async purchase(productId) {
      const generation = client.epoch;
      if (!client.session) throw new Error("请先登录琴伴账号。");
      const account = await client.json("/app-store/account", {
        expectedEpoch: generation,
      });
      client.checkEpoch(generation);
      if (!account.available || !account.appAccountToken)
        throw new Error("Apple 购买尚未开通，请稍后再试。");
      const result = await bridge.purchase({
        productId,
        appAccountToken: account.appAccountToken,
      });
      client.checkEpoch(generation);
      if (result.status === "success") {
        try {
          await submit(result.transaction, generation);
        } catch (error) {
          // Apple may already have charged. A retry must deliver the existing transaction, not buy again.
          if (error.code !== "IDENTITY_CHANGED") error.pendingPurchase = true;
          throw error;
        }
      } else if (!["cancelled", "pending"].includes(result.status))
        throw new Error("未能确认购买状态，请使用恢复购买查询，勿重复付款。");
      return result;
    },
  };
}
