import test from "node:test";
import assert from "node:assert/strict";
import { boot, until } from "./app-harness.mjs";

test("dialogs isolate their scroll body from the title and keep the active practice DOM intact", async (t) => {
  const { w, doc } = await boot(t);
  const score = doc.querySelector("#notation"),
    seek = doc.querySelector("#seek");
  seek.value = "3";
  doc.querySelector("[data-upload]").click();
  const modal = doc.querySelector(".modal"),
    heading = modal.querySelector(":scope > .modal-heading"),
    body = modal.querySelector(":scope > .modal-body");
  assert.ok(heading && body);
  assert.ok(body.querySelector("[data-import-local]"));
  assert.equal(body.contains(heading), false);
  doc.querySelector("#modal-close").click();
  assert.equal(doc.querySelector(".modal"), null);
  assert.equal(doc.querySelector("#notation"), score);
  assert.equal(doc.querySelector("#seek"), seek);
  assert.equal(seek.value, "3");
  doc.querySelector("[data-edit-notes]").click();
  await until(
    () => doc.querySelector(".modal-body #note-editor-host"),
    "editor should mount inside dialog body",
  );
  assert.ok(doc.querySelector(".modal > .modal-heading"));
  assert.equal(doc.querySelector("#notation"), score);
  doc.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(doc.querySelector(".modal"), null);
});
