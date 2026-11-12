/* Injected at document start into the trusted main frame only. */
(() => {
  "use strict";
  if (window.top !== window) return;
  const invoke = (method, payload = {}) => {
    const handler = window.webkit?.messageHandlers?.qinban;
    if (!handler?.postMessage) {
      return Promise.reject(new Error("NATIVE_UNAVAILABLE: 应用内购买暂不可用，请重新打开琴伴。"));
    }
    return Promise.resolve()
      .then(() => handler.postMessage({ version: 1, method, payload }))
      .catch((error) => {
        const raw = String(error?.message || error);
        const match = /^([A-Z_]+):\s*(.+)$/.exec(raw);
        const failure = new Error(match ? match[2] : "应用内购买暂不可用，请稍后重试。");
        failure.code = match ? match[1] : "NATIVE_UNAVAILABLE";
        throw failure;
      });
  };
  const api = Object.freeze({
    apiVersion: 1,
    platform: "ios",
    distribution: "app-store",
    getProducts: (payload) => invoke("getProducts", payload),
    purchase: (payload) => invoke("purchase", payload),
    pendingTransactions: () => invoke("pendingTransactions"),
    restore: () => invoke("restore"),
    finishTransaction: (payload) => invoke("finishTransaction", payload),
    manageSubscriptions: () => invoke("manageSubscriptions"),
    clearSession: () => invoke("clearSession"),
  });
  Object.defineProperty(window, "QinbanNative", {
    value: api, writable: false, configurable: false, enumerable: true,
  });
})();
