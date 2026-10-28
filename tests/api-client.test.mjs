import test from "node:test";
import assert from "node:assert/strict";
import { createApiClient } from "../src/api-client.js";
import { createCapabilities } from "../src/capabilities.js";
test("local Qinban retains original image/PDF recognition while hosted accounts stay isolated", () => {
  const local = createCapabilities({ staticSite: false, hosted: false });
  assert.equal(
    local.recognition,
    true,
    "本机琴伴必须保留原来的图片/PDF识谱入口",
  );
  assert.equal(local.coreOnly, false, "本机导入菜单不能被限制成数字谱选择器");
  assert.equal(local.scoreSearch, true);
  assert.equal(local.netease, true);
  const hosted = createCapabilities({ staticSite: false, hosted: true });
  assert.equal(hosted.recognition, false);
  assert.equal(hosted.localServer, false);
  assert.equal(hosted.hostedRecognition, true);
});
test("static capabilities reject local calls before fetch and leave global fetch untouched", async () => {
  const native = globalThis.fetch;
  let calls = 0;
  const api = createApiClient({
    capabilities: createCapabilities({ staticSite: true }),
    fetchImpl: async () => {
      calls++;
    },
  });
  await assert.rejects(api.json("/api/search"), { code: "STATIC_SITE" });
  await assert.rejects(api.blob("/api/full-score-jobs/a/document"), {
    code: "STATIC_SITE",
  });
  assert.equal(calls, 0);
  assert.equal(globalThis.fetch, native);
});
test("local interface refreshes CSRF once and retries with current credentials", async () => {
  let refreshes = 0;
  const writes = [];
  const api = createApiClient({
    capabilities: createCapabilities({ staticSite: false }),
    fetchImpl: async (path, options) => {
      if (path === "/api/status")
        return Response.json({ csrfToken: "csrf-" + ++refreshes });
      writes.push(options);
      return writes.length === 1
        ? Response.json({ code: "CSRF" }, { status: 403 })
        : Response.json({ saved: true });
    },
  });
  assert.deepEqual(await api.json("/api/library", { title: "score" }), {
    saved: true,
  });
  assert.equal(refreshes, 2);
  assert.equal(writes[1].headers["X-CSRF-Token"], "csrf-2");
  assert.deepEqual(JSON.parse(writes[1].body), { title: "score" });
});
