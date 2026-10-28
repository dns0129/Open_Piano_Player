import test from "node:test";
import assert from "node:assert/strict";
import {
  SCORE_RECOGNITION,
  recognitionEngine,
  recognitionStream,
} from "../lib/recognition-policy.mjs";

test("recognition uses the requested model and high effort despite stale SDK options", () => {
  const audits = [];
  const stream = recognitionStream(
    (model, context, options) => {
      assert.equal(model.id, "gpt-6.1-sol");
      assert.equal(options.reasoning, "high");
      assert.equal(options.maxRetries, 0);
      assert.equal(options.timeoutMs, 600000);
      options.onPayload({
        model: model.id,
        reasoning: { effort: "high" },
        input: "private image data",
      });
      return "stream";
    },
    (audit) => audits.push(audit),
  );
  assert.equal(
    stream({ id: "gpt-6.1-sol" }, {}, { reasoning: "low", maxRetries: 3 }),
    "stream",
  );
  assert.deepEqual(audits, [{ model: "gpt-6.1-sol", reasoningEffort: "high" }]);
  assert.equal(SCORE_RECOGNITION.localOmr, false);
});

test("wrong models or provider-rewritten effort fail before transport and are never audited as success", () => {
  let transmitted = 0,
    audits = 0;
  const stream = recognitionStream(
    (model, context, options) => {
      options.onPayload({ model: model.id, reasoning: { effort: "low" } });
      transmitted++;
    },
    () => audits++,
  );
  assert.throws(() => stream({ id: "another-model" }, {}), /model mismatch/);
  assert.throws(
    () => stream({ id: "gpt-6.1-sol" }, {}),
    /model\/reasoning mismatch/,
  );
  assert.equal(transmitted, 0);
  assert.equal(audits, 0);
});

test("legacy automatic routing resolves to GPT and explicit local engines are blocked", () => {
  for (const engine of [undefined, "pi", "auto"])
    assert.equal(recognitionEngine(engine), "pi");
  for (const engine of ["audiveris", "omr"])
    assert.throws(
      () => recognitionEngine(engine),
      (e) => e.code === "LOCAL_OMR_DISABLED",
    );
  assert.throws(
    () => recognitionEngine("unknown"),
    (e) => e.code === "INVALID_RECOGNITION_ENGINE",
  );
});
