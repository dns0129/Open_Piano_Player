import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(new URL("./Qinban/NativeBridge.js", import.meta.url), "utf8");
function load(handler, frame = false) {
  const calls = [];
  const window = {
    webkit: { messageHandlers: { qinban: { postMessage(body) {
      calls.push(body);
      return handler?.(body) ?? Promise.resolve({ ok: true });
    } } } },
  };
  window.top = frame ? {} : window;
  runInNewContext(source, { window, Promise, Error, Object, String });
  return { window, calls };
}

test("native bridge is immutable, does not expose auth tokens, and never restores automatically", async () => {
  const { window, calls } = load();
  assert.equal(window.QinbanNative.platform, "ios");
  assert.equal(Object.isFrozen(window.QinbanNative), true);
  assert.equal(Object.getOwnPropertyDescriptor(window, "QinbanNative").configurable, false);
  assert.equal(Object.getOwnPropertyDescriptor(window, "QinbanNative").writable, false);
  assert.equal("session" in window.QinbanNative, false);
  assert.equal(calls.length, 0);
  await window.QinbanNative.pendingTransactions();
  assert.equal(calls[0].method, "pendingTransactions");
  assert.equal(calls.some((call) => call.method === "restore"), false);
});

test("iframes receive no native purchase interface", () => {
  assert.equal(load(undefined, true).window.QinbanNative, undefined);
});

test("purchase preserves the server account token and cancellation result", async () => {
  const { window, calls } = load(() => Promise.resolve({ status: "cancelled" }));
  const payload = { productId: "test.qinban.topup", appAccountToken: "6377d0ef-6e38-4c49-919a-b6215e8e2892" };
  assert.equal((await window.QinbanNative.purchase(payload)).status, "cancelled");
  assert.equal(calls[0].version, 1);
  assert.equal(calls[0].method, "purchase");
  assert.deepEqual(calls[0].payload, payload);
});

test("native codes are machine-readable while the user sees a Chinese message", async () => {
  const { window } = load(() => Promise.reject(new Error("PRODUCT_NOT_ALLOWED: 该商品未开放。")));
  await assert.rejects(window.QinbanNative.getProducts({ productIds: ["test"] }), (error) =>
    error.code === "PRODUCT_NOT_ALLOWED" && error.message === "该商品未开放。",
  );
});

test("clearSession is explicit and the bridge cannot invoke arbitrary native methods", async () => {
  const { window, calls } = load();
  assert.equal(window.QinbanNative.openURL, undefined);
  assert.equal(window.QinbanNative.evaluate, undefined);
  await window.QinbanNative.clearSession();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "clearSession");
});
