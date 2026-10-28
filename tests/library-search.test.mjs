import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  searchCloudScores,
  discoverCloudScores,
  readSearchHistory,
  rememberSearch,
  clearSearchHistory,
} from "../lib/library-search.mjs";
import { createLibraryPanel } from "../src/library-panel.js";

const scores = [
  {
    id: "melody",
    title: "旋律 · Mélodie",
    composer: "Robert Schumann 舒曼",
    sourceLabel: "初级 · Mutopia",
    tempo: 80,
    notes: 24,
    timeSignature: [4, 4],
  },
  {
    id: "arabesque",
    title: "阿拉伯风格曲",
    composer: "布格缪勒",
    sourceLabel: "初级进阶 · Mutopia",
    tempo: 96,
    notes: 64,
    timeSignature: [2, 4],
  },
  {
    id: "canon",
    title: "Canon in D",
    composer: "Pachelbel",
    tempo: 0,
    notes: 30,
    hasOriginal: true,
  },
  {
    id: "elise",
    title: "Für Elise",
    composer: "Ludwig van Beethoven",
    tempo: 90,
    notes: 30,
  },
  {
    id: "guitar",
    title: "小星星 · 吉他入门",
    instrument: "guitar",
    sourceLabel: "吉他入门",
    tempo: 60,
  },
];
test("search ranks exact titles first and supports accents, traditional Chinese and work/composer aliases", () => {
  assert.deepEqual(searchCloudScores(scores, " "), []);
  assert.equal(searchCloudScores(scores, "MELODIE 舒曼")[0].id, "melody");
  assert.equal(searchCloudScores(scores, "卡農 鋼琴譜")[0].id, "canon");
  assert.equal(searchCloudScores(scores, "致愛麗絲 貝多芬")[0].id, "elise");
  assert.equal(searchCloudScores(scores, "卡农 周杰伦").length, 0);
  assert.equal(searchCloudScores(scores, "初级").length, 2);
  const variants = [
    { id: "long", title: "幻听 · 六页重识别" },
    { id: "exact", title: "幻听" },
  ];
  assert.equal(searchCloudScores(variants, "幻听")[0].id, "exact");
});
test("discovery combines filters and puts unknown tempo last without inventing difficulty", () => {
  assert.equal(discoverCloudScores(scores, { level: "beginner" }).length, 2);
  assert.equal(
    discoverCloudScores(scores, { query: "旋律", level: "intermediate" })
      .length,
    0,
  );
  assert.deepEqual(
    discoverCloudScores(scores, { original: true }).map((s) => s.id),
    ["canon"],
  );
  assert.equal(
    discoverCloudScores(scores, { sort: "tempo" }).at(-1).id,
    "canon",
  );
});
function harness(t, overrides = {}) {
  const dom = new JSDOM('<main></main><div id="modal-root"></div>', {
    url: "https://qinban.example",
  });
  const prior = {};
  for (const key of ["document", "window", "localStorage", "Element", "Node"]) {
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
  const state = {
    libraryTab: "local",
    view: "search",
    section: "piano",
    cloudScores: scores,
    cloudLoaded: true,
    ...overrides.state,
  };
  const client = overrides.client || { scores: [], warnings: [] };
  let panel;
  const render = () => {
    document.querySelector("main").innerHTML = panel.libraryView();
    panel.bindLibrary();
  };
  panel = createLibraryPanel({
    state,
    client,
    capabilities: { mode: "browser" },
    render,
    ...overrides,
    state,
  });
  render();
  const $ = (selector) => document.querySelector(selector);
  const enter = (query) => {
    const input = $("#library-query");
    input.value = query;
    input.dispatchEvent(new dom.window.Event("input"));
  };
  const submit = () =>
    $("#cloud-library-search").dispatchEvent(
      new dom.window.Event("submit", { cancelable: true }),
    );
  return { dom, state, panel, render, $, enter, submit };
}
test("search opens with boards and scores, finds an alias, and clearing returns to discovery", (t) => {
  const h = harness(t);
  assert.equal(document.querySelectorAll(".discovery-board").length, 3);
  assert.equal(document.querySelectorAll(".cloud-score-row").length, 4);
  h.enter("卡农");
  h.submit();
  assert.equal(document.querySelectorAll(".cloud-score-row").length, 1);
  assert.equal(h.$("[data-cloud-download]").dataset.cloudDownload, "canon");
  assert.match(h.$(".discovery-hot").textContent, /卡农.*1 次/s);
  h.$("[data-clear-query]").click();
  assert.equal(document.querySelectorAll(".discovery-board").length, 3);
  assert.equal(h.state.cloudLibraryQuery, "");
});
test("suggestions support keyboard selection, Escape and Chinese composition without premature submission", (t) => {
  const h = harness(t);
  h.enter("致愛");
  assert.equal(h.$("#library-query").getAttribute("aria-expanded"), "true");
  h.$("#library-query").dispatchEvent(
    new h.dom.window.KeyboardEvent("keydown", {
      key: "ArrowDown",
      cancelable: true,
    }),
  );
  assert.equal(
    h.$("#library-query").getAttribute("aria-activedescendant"),
    "discovery-option-0",
  );
  h.$("#library-query").dispatchEvent(
    new h.dom.window.KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
    }),
  );
  assert.equal(h.state.cloudLibraryQuery, "Für Elise");
  h.enter("旋律");
  h.$("#library-query").dispatchEvent(
    new h.dom.window.KeyboardEvent("keydown", { key: "Escape" }),
  );
  assert.equal(h.$("#discovery-suggestions").hidden, true);
  h.$("#library-query").dispatchEvent(
    new h.dom.window.CompositionEvent("compositionstart"),
  );
  h.enter("舒曼");
  h.submit();
  assert.equal(h.state.cloudLibraryQuery, "Für Elise");
  h.$("#library-query").dispatchEvent(
    new h.dom.window.CompositionEvent("compositionend"),
  );
  h.submit();
  assert.equal(h.state.cloudLibraryQuery, "舒曼");
});
test("history persists across render, stays instrument-scoped, and clearing removes hot counts", (t) => {
  const h = harness(t);
  h.enter("旋律");
  h.submit();
  h.enter("旋律");
  h.submit();
  h.render();
  assert.match(h.$(".discovery-hot").textContent, /2 次/);
  assert.equal(readSearchHistory(localStorage, "guitar").length, 0);
  h.$("[data-clear-history]").click();
  assert.equal(readSearchHistory(localStorage, "piano").length, 0);
  assert.match(h.$(".discovery-hot").textContent, /还没有搜索记录/);
});
test("filters, empty recovery, guitar isolation and more-results pagination work together", (t) => {
  const h = harness(t);
  h.$('[data-discovery-level="intermediate"]').click();
  assert.equal(document.querySelectorAll(".cloud-score-row").length, 1);
  h.enter("旋律");
  h.submit();
  assert.ok(h.$(".discovery-empty"));
  h.$("[data-discovery-reset]").click();
  assert.equal(document.querySelectorAll(".cloud-score-row").length, 4);
  h.state.section = "guitar";
  h.render();
  assert.equal(document.querySelectorAll(".cloud-score-row").length, 1);
  h.state.section = "piano";
  h.state.cloudScores = Array.from({ length: 25 }, (_, i) => ({
    ...scores[0],
    id: "m" + i,
  }));
  h.render();
  assert.equal(document.querySelectorAll(".cloud-score-row").length, 12);
  h.$("[data-discovery-more]").click();
  assert.equal(document.querySelectorAll(".cloud-score-row").length, 24);
});
test("download saves the selected bundle and exposes open-practice for the saved score", async (t) => {
  const client = {
    scores: [],
    warnings: [],
    initialize: async () => {},
    saveBundle: async (bundle) => {
      client.scores.push(bundle.score);
    },
  };
  let opened, requested;
  const h = harness(t, {
    client,
    capabilities: { mode: "local" },
    api: async (url) => {
      requested = url;
      return { score: scores[0] };
    },
    toast: () => {},
    setScore: (score) => {
      opened = score;
    },
  });
  h.$('[data-cloud-download="melody"]').click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requested, "/api/cloud-library/melody");
  assert.equal(client.scores[0].id, "melody");
  h.$('[data-cloud-open="melody"]').click();
  assert.equal(opened.id, "melody");
});
test("cloud failure is visible with retry and catalog retains its search on recovery", async (t) => {
  let calls = 0;
  const h = harness(t, {
    state: {
      cloudLoaded: false,
      cloudScores: [],
      cloudLibraryQuery: "旋律",
      cloudLibraryDraft: "旋律",
    },
    capabilities: { mode: "local" },
    api: async () => {
      if (++calls === 1) throw new Error("连接中断");
      return { version: 1, scores };
    },
  });
  await h.panel.syncCloudLibrary();
  assert.match(h.$('[role="alert"]').textContent, /连接中断/);
  await h.panel.syncCloudLibrary();
  assert.equal(h.state.cloudLibraryQuery, "旋律");
  assert.equal(document.querySelectorAll(".cloud-score-row").length, 1);
});
test("search text and remote metadata render as text, and unsafe source links are omitted", (t) => {
  const evil = "<img src=x onerror=alert(1)>";
  const h = harness(t, {
    state: {
      cloudScores: [
        { ...scores[0], title: evil, sourceUrl: "javascript:alert(1)" },
      ],
    },
  });
  assert.equal(document.querySelectorAll("img").length, 0);
  assert.equal(document.querySelectorAll('a[href^="javascript:"]').length, 0);
  h.enter(evil);
  h.submit();
  assert.equal(document.querySelectorAll("img").length, 0);
});
test("history tolerates unavailable/corrupt storage and is bounded", () => {
  const store = new Map(),
    storage = {
      getItem: (k) => store.get(k),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
  for (let i = 0; i < 30; i++) rememberSearch(storage, "piano", "曲目" + i, i);
  assert.equal(readSearchHistory(storage, "piano").length, 20);
  clearSearchHistory(storage, "piano");
  assert.equal(readSearchHistory(storage, "piano").length, 0);
  const denied = {
    getItem() {
      throw Error("denied");
    },
    setItem() {
      throw Error("denied");
    },
  };
  assert.doesNotThrow(() => rememberSearch(denied, "piano", "卡农"));
  store.set("qinban-search-history-v1-piano", '{"bad":true}');
  assert.deepEqual(readSearchHistory(storage, "piano"), []);
});
