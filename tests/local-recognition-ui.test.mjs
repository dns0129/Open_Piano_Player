import test from "node:test";
import assert from "node:assert/strict";
import { boot, until } from "./app-harness.mjs";

test("local practice UI exposes original recognition, image/PDF import and task recovery", async (t) => {
  const { w, doc, requests } = await boot(t);
  assert.ok(
    doc.querySelector("[data-fullscore-jobs]"),
    "原有识谱任务入口必须可见",
  );
  assert.ok(doc.querySelector("[data-settings]"), "识谱设置入口必须保留");
  doc.querySelector("[data-upload]").click();
  assert.ok(
    doc.querySelector("[data-import-local]"),
    "导入菜单应提供图片/PDF来源",
  );
  assert.match(doc.querySelector(".modal").textContent, /PDF、乐谱图片/);
  assert.match(doc.querySelector("#file-input").accept, /\.pdf/);
  assert.match(doc.querySelector("#file-input").accept, /\.png/);
  doc.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  doc.querySelector("[data-fullscore-jobs]").click();
  await until(
    () => doc.querySelector("[data-restore-fullscore]"),
    "识谱任务列表应打开",
  );
  assert.equal(doc.querySelector(".modal h2").textContent, "整谱识别任务");
  assert.ok(doc.querySelector("[data-restore-fullscore]"));
  assert.equal(
    requests.some((p) => p.includes("/api/v1/") || p.includes("/api/generate")),
    false,
    "打开入口和历史列表不能开始识谱或切到商业账号",
  );
});

test("startup lists the library once and does not look up an original for the built-in exercise", async (t) => {
  const { requests } = await boot(t);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(
    requests.filter((p) => p.endsWith("/api/library")).length,
    1,
    "启动时曲库列表只应请求一次",
  );
  assert.equal(
    requests.some((p) => p.includes("/api/library/records/")),
    false,
    "内置练习曲没有原谱，不应查询",
  );
});
