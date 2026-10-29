import test from "node:test";
import assert from "node:assert/strict";
import { createRouter, safeEqual } from "../lib/http-kit.mjs";
import { equal } from "../lib/accounts/common.mjs";

test("routes match in registration order and a * fallback only catches what specific methods left", () => {
  const seen = [];
  const router = createRouter()
    .add("GET", "/api/items", () => seen.push("list"))
    .add("GET", /^\/api\/items\/([a-z]+)$/, ({ params }) => seen.push(params))
    .add("*", /^\/api\/items\/([a-z]+)$/, () => seen.push("405"));
  router.match("GET", "/api/items").handler({});
  const one = router.match("GET", "/api/items/abc");
  one.handler(one);
  router.match("DELETE", "/api/items/abc").handler({});
  assert.deepEqual(seen, ["list", ["abc"], "405"]);
  assert.equal(router.match("POST", "/api/items"), null);
  assert.equal(router.match("GET", "/api/items/abc/extra"), null);
});

test("constant-time comparison rejects equal-length strings of different byte size instead of throwing", () => {
  for (const compare of [safeEqual, equal]) {
    assert.equal(compare("abcd", "abcd"), true);
    assert.equal(compare("abcd", "abce"), false);
    assert.equal(compare("abcd", "ab琴d"), false);
    assert.equal(compare("abcd", undefined), false);
  }
});
