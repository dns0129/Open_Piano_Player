import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  reviewBundle,
  reviewJob,
  sourceSvg,
} from "./helpers/recognition-review-fixture.mjs";
import {
  normalizeFullScoreRegionResult,
  assembleFullScoreReview,
} from "../lib/full-score-review.mjs";

const bundle = reviewBundle();
async function until(check) {
  for (let n = 0; n < 300; n++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail("UI did not reach expected state");
}
async function boot(t, { failOnce = false, invalid = false } = {}) {
  const dom = new JSDOM(
      '<!doctype html><html><head></head><body><main id="host"></main></body></html>',
      {
        url: "http://localhost:8792/",
        runScripts: "outside-only",
        pretendToBeVisual: true,
      },
    ),
    w = dom.window,
    doc = w.document;
  t.after(() => w.close());
  Object.assign(w, {
    structuredClone,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    AbortController,
  });
  const read = (blob) =>
    new Promise((resolve) => {
      const reader = new w.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsArrayBuffer(blob);
    });
  w.Blob.prototype.arrayBuffer = function () {
    return read(this);
  };
  w.URL.createObjectURL = () => `blob:fixture-${Math.random()}`;
  w.URL.revokeObjectURL = () => {};
  w.HTMLCanvasElement.prototype.toBlob = function (fn) {
    fn(new w.Blob(["image"], { type: "image/png" }));
  };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const canvas = this;
    return {
      font: "",
      measureText: (text) => ({
        width: String(text).length * 8,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
      }),
      getImageData: () => ({
        width: canvas.width,
        height: canvas.height,
        data: new Uint8Array(canvas.width * canvas.height).fill(255),
      }),
    };
  };
  w.eval(await bundle);
  const job = reviewJob(),
    calls = [],
    imports = [];
  if (invalid) job.regions[1].result.score.notes[0].midi = 110;
  let failed = false;
  const api = {
    getCapabilities: async () => ({ pi: { ready: true } }),
    readRegionImage: async () =>
      new w.Blob([sourceSvg], { type: "image/svg+xml" }),
    confirmRegion: async (id, regionId, result) => {
      calls.push({ regionId, result: structuredClone(result) });
      if (failOnce && regionId === "row-2" && !failed) {
        failed = true;
        throw new Error("测试网络中断");
      }
      const row = job.regions.find((r) => r.id === regionId);
      row.result = { ...structuredClone(result), reviewStatus: "confirmed" };
      row.status = "confirmed";
      return structuredClone(job);
    },
    confirmJob: async (id, options) => {
      assert.equal(options.scopeConfirmed, true);
      const draft = {
        id: job.id,
        title: job.metadata.title,
        totalPages: 2,
        pages: [1, 2].map((page) => ({
          page,
          scanned: true,
          decision: "include",
        })),
        regions: job.regions.map((r) => ({
          ...normalizeFullScoreRegionResult({ ...r, selected: true }, r.result),
          reviewed: r.status === "confirmed",
        })),
      };
      const result = assembleFullScoreReview(draft);
      job.status = "complete";
      job.result = { ...result, reviewStatus: "human-confirmed" };
      return structuredClone(job);
    },
  };
  const controller = w.ReviewUI.mountFullScoreImport(
    doc.querySelector("#host"),
    {
      file: new w.Blob(["%PDF-1.7 fixture"], { type: "application/pdf" }),
      source: { pianoSourceVerified: true },
      resumeJob: structuredClone(job),
      api,
      onImport: (value) => imports.push(value),
    },
  );
  t.after(() => controller.destroy());
  await controller.ready;
  assert.equal(
    doc.querySelector("[role=alert]")?.textContent,
    undefined,
    "fixture initialization should succeed",
  );
  await until(() => doc.querySelector("[data-source-note]"));
  const click = (action) =>
    doc.querySelector(`[data-action="${action}"]`).click();
  const pointer = (target, type, x, y) => {
    const event = new w.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
    });
    Object.defineProperty(event, "pointerId", { value: 1 });
    target.dispatchEvent(event);
  };
  const drag = (selector, dx, dy, { cancel = false } = {}) => {
    const root = doc.querySelector(".full-score-import"),
      marker = doc.querySelector(selector);
    doc.querySelector("[data-original-image]").getBoundingClientRect = () => ({
      left: 100,
      top: 200,
      width: 400,
      height: 110,
    });
    const region = controller.getDraft().regions[0],
      range = {
        min: 46,
        max: Math.max(72, ...region.notes.map((n) => n.midi)) + 2,
      };
    doc.querySelector("[data-note-roll]").getBoundingClientRect = () => ({
      left: 100,
      top: 400,
      width: 560,
      height: (range.max - range.min + 1) * 20,
    });
    pointer(marker, "pointerdown", 170, 232.5);
    pointer(root, "pointermove", 170 + dx, 232.5 + dy);
    pointer(root, cancel ? "pointercancel" : "pointerup", 170 + dx, 232.5 + dy);
  };
  return { w, doc, controller, calls, imports, job, click, drag };
}

test("one click reviews all pages without individual checkboxes and saving remains separate", async (t) => {
  const { doc, controller, calls, imports, click } = await boot(t);
  assert.equal(doc.querySelector("[data-scope-reviewed]").checked, false);
  assert.equal(
    doc.querySelector('[data-action="approve-all"]').disabled,
    false,
  );
  click("approve-all");
  await until(
    () => doc.querySelector('[data-action="import"]').disabled === false,
  );
  assert.equal(doc.querySelector(".fsi-job-settings").open, false);
  assert.equal(calls.length, 2);
  assert.ok(controller.getDraft().regions.every((r) => r.reviewed));
  assert.equal(imports.length, 0);
  assert.ok(
    calls.every(
      (c) =>
        c.result.coverage.complete &&
        c.result.sourceHeadAudit.reviewed &&
        c.result.tieAudit.reviewed,
    ),
  );
  click("import");
  await until(() => imports.length === 1);
  assert.equal(imports[0].score.notes.length, 6);
  assert.equal(imports[0].assets.length, 4);
  assert.equal(imports[0].sourceNotation.pages.length, 2);
});

test("source drag, cancelled drag, keyboard pitch edit, undo and review persist actual corrections", async (t) => {
  const { w, doc, controller, calls, imports, click, drag } = await boot(t);
  const note = () =>
    controller.getDraft().regions[0].notes.find((n) => n.id === "r");
  drag('[data-source-note="r"]', 20, 11);
  assert.equal(note().x, 200);
  assert.equal(note().y, 127);
  assert.equal(note().midi, 72);
  drag('[data-source-note="r"]', 40, 22, { cancel: true });
  assert.equal(note().x, 200);
  assert.equal(note().y, 127);
  click("undo-move");
  assert.equal(note().x, 160);
  assert.equal(note().y, 105);
  drag('[data-source-note="r"]', 20, 11);
  const marker = doc.querySelector('[data-roll-note="r"]');
  marker.dispatchEvent(
    new w.KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(note().midi, 73);
  assert.equal(note().beat, 0);
  assert.equal(note().x, 200);
  click("approve-all");
  await until(() => !doc.querySelector('[data-action="import"]').disabled);
  assert.equal(calls[0].result.score.notes.find((n) => n.id === "r").midi, 73);
  assert.equal(calls[0].result.positions.find((n) => n.noteId === "r").x, 200);
  click("import");
  await until(() => imports.length === 1);
  assert.ok(imports[0].score.notes.some((n) => n.midi === 73));
  assert.ok(
    imports[0].sourceNotation.notes.some((n) => n.x === 200 && n.y === 127),
  );
  drag('[data-source-note="r"]', 5, 0);
  assert.equal(controller.getDraft().regions[0].reviewed, false);
  assert.equal(doc.querySelector('[data-action="import"]').disabled, true);
});

test("roll dragging changes pitch and beat, preserves original coordinates and can be undone", async (t) => {
  const { controller, click, drag } = await boot(t);
  const note = () => controller.getDraft().regions[0].notes[0];
  drag('[data-roll-note="r"]', 35, -20);
  assert.equal(note().beat, 0.25);
  assert.equal(note().midi, 73);
  assert.equal(note().x, 160);
  assert.equal(note().duration, 2);
  click("undo-move");
  assert.equal(note().beat, 0);
  assert.equal(note().midi, 72);
});

test("bulk structural preflight locates the bad row without partially submitting reviews", async (t) => {
  const { doc, controller, calls, click } = await boot(t, { invalid: true });
  click("approve-all");
  await until(() => doc.querySelector('[role="alert"]'));
  assert.equal(calls.length, 0);
  assert.ok(controller.getDraft().regions.every((r) => !r.reviewed));
  assert.match(
    doc.querySelector('[role="alert"]').textContent,
    /第 2 页.*音高/,
  );
});

test("a network failure preserves completed reviews and retry submits only the remaining row", async (t) => {
  const { doc, controller, calls, click } = await boot(t, { failOnce: true });
  click("approve-all");
  await until(() => doc.querySelector('[role="alert"]'));
  assert.equal(controller.getDraft().regions[0].reviewed, true);
  assert.equal(controller.getDraft().regions[1].reviewed, false);
  click("approve-all");
  await until(() => !doc.querySelector('[data-action="import"]').disabled);
  assert.deepEqual(
    calls.map((c) => c.regionId),
    ["row-1", "row-2", "row-2"],
  );
});

test("precise edits refresh the drag grid and preserve expanded controls and scroll position", async (t) => {
  const { w, doc, click } = await boot(t);
  doc.querySelector(".fsi-note-details").open = true;
  const input = doc.querySelector('[data-note-id="r"][data-note-field="midi"]');
  input.value = "75";
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  input.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert.equal(doc.querySelector(".fsi-note-details").open, true);
  assert.match(
    doc.querySelector('[data-roll-note="r"]').getAttribute("aria-label"),
    /D♯5/,
  );
  doc.querySelector(".fsi-roll-scroll").scrollTop = 150;
  const marker = doc.querySelector('[data-roll-note="r"]');
  marker.dispatchEvent(
    new w.KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(doc.querySelector(".fsi-roll-scroll").scrollTop, 150);
  assert.equal(doc.querySelector(".fsi-note-details").open, true);
  click("undo-move");
  assert.match(
    doc.querySelector('[data-roll-note="r"]').getAttribute("aria-label"),
    /D♯5/,
  );
});

test("new recognition opens the shared full-window page comparison and returns to bulk review", async (t) => {
  const { doc, click } = await boot(t);
  click("page-workbench");
  await until(() => doc.querySelector(".score-workbench"));
  assert.equal(
    doc.querySelector(".score-workbench").classList.contains("swe-overlay"),
    true,
  );
  assert.equal(doc.querySelectorAll(".swe-pane").length, 2);
  assert.equal(
    doc.querySelectorAll(".notation-error").length,
    0,
    doc.body.textContent,
  );
  assert.ok(doc.querySelector("[data-swe-note]"));
  assert.equal(doc.querySelector("[data-swe-page]").max, "2");
  doc.querySelector('[data-swe-action="next"]').click();
  assert.equal(doc.querySelector("[data-swe-page]").value, "2");
  doc.querySelector('[data-swe-action="close"]').click();
  assert.equal(doc.querySelector(".score-workbench"), null);
  assert.equal(
    doc.querySelector('[data-action="approve-all"]').disabled,
    false,
  );
});
