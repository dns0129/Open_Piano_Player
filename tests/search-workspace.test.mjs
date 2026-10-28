import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createApiClient } from "../src/api-client.js";
import { createSearchWorkspace } from "../src/search-workspace.js";

test("online search uses GET through the production API client and renders returned sources", async (t) => {
  const dom = new JSDOM("<main></main>", { url: "http://localhost" });
  const prior = {};
  for (const key of ["document", "localStorage", "Element", "Node"]) {
    prior[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      value: dom.window[key],
      configurable: true,
      writable: true,
    });
  }
  t.after(() => {
    for (const key of Object.keys(prior)) {
      if (prior[key]) Object.defineProperty(globalThis, key, prior[key]);
      else delete globalThis[key];
    }
    dom.window.close();
  });
  const calls = [],
    capabilities = { localServer: true, scoreSearch: true };
  const api = createApiClient({
    capabilities,
    fetchImpl: async (path, options) => {
      calls.push({ path, options });
      if (path === "/api/status")
        return Response.json({ csrfToken: "test-token" });
      assert.equal(options.method, "GET");
      assert.equal(options.body, undefined);
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json({
        results: [
          {
            title: "Canon in D",
            source: "测试谱源",
            format: "musicxml",
            importable: true,
          },
        ],
        network: { ok: true },
        providerStatuses: [],
      });
    },
  });
  const state = {
    section: "piano",
    searchLinks: [],
    searchProviders: [],
    searchResults: [],
  };
  let workspace;
  const render = () => {
    document.querySelector("main").innerHTML = workspace.searchView();
    workspace.bindSearch();
  };
  workspace = createSearchWorkspace({
    state,
    capabilities,
    player: { pause() {} },
    api: (...args) => api.json(...args),
    render,
    safeLink: () => "",
  });
  workspace.openSearch("卡农");
  for (let i = 0; i < 20 && state.searching; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(calls[1].path, "/api/search?q=" + encodeURIComponent("卡农"));
  assert.equal(state.searchError, "");
  assert.equal(state.searchResults[0].title, "Canon in D");
  assert.match(document.querySelector("main").textContent, /找到的谱源 1/);
  assert.match(document.querySelector("main").textContent, /直接导入练习/);
});
