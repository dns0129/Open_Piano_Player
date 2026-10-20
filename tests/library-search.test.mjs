import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { searchCloudScores } from "../lib/library-search.mjs";
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
];
test("cloud searches hide empty queries and match all words including accents and Chinese", () => {
  assert.deepEqual(searchCloudScores(scores, "  "), []);
  assert.deepEqual(
    searchCloudScores(scores, "MELODIE 舒曼").map((s) => s.id),
    ["melody"],
  );
  assert.equal(searchCloudScores(scores, "初级").length, 2);
});
test("cloud library shows rows only after submitting a search and clears them with the query", (t) => {
  const dom = new JSDOM('<main></main><div id="modal-root"></div>');
  const prior = globalThis.document;
  globalThis.document = dom.window.document;
  t.after(() => {
    globalThis.document = prior;
    dom.window.close();
  });
  const state = {
    libraryTab: "cloud",
    view: "library",
    cloudScores: scores,
    cloudLoaded: true,
  };
  let panel;
  const render = () => {
    document.querySelector("main").innerHTML = panel.libraryView();
    panel.bindLibrary();
  };
  panel = createLibraryPanel({
    state,
    client: { scores: [], warnings: [] },
    capabilities: { mode: "browser" },
    render,
  });
  render();
  assert.equal(document.querySelectorAll(".cloud-score-row").length, 0);
  const input = document.querySelector("#library-query");
  input.value = "舒曼";
  input.dispatchEvent(new dom.window.Event("input"));
  assert.equal(document.querySelectorAll(".cloud-score-row").length, 0);
  document
    .querySelector("form")
    .dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  assert.equal(document.querySelectorAll(".cloud-score-row").length, 1);
  assert.equal(
    document.querySelector("[data-cloud-download]").dataset.cloudDownload,
    "melody",
  );
  const refreshed = document.querySelector("#library-query");
  refreshed.value = "";
  refreshed.dispatchEvent(new dom.window.Event("input"));
  assert.equal(document.querySelectorAll(".cloud-score-row").length, 0);
  render();
  assert.equal(document.querySelectorAll(".cloud-score-row").length, 0);
});
