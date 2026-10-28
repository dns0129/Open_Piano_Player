import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOmrReview, omrReviewIssues } from "../lib/omr-review.mjs";

test("notation correction evidence stays bounded and excludes arbitrary fields", () => {
  const output = normalizeOmrReview({
    corrections: [
      {
        kind: "grace-timing",
        description: "kept",
        evidence: "explicit grace",
        before: "0",
        after: ".0625",
        noteIds: ["a"],
        apiKey: "must-not-persist",
      },
      { kind: "invented-rule", description: "drop me" },
    ],
  });
  assert.equal(output.corrections.length, 1);
  assert.equal(output.corrections[0].evidence, "explicit grace");
  assert.ok(!JSON.stringify(output).includes("must-not-persist"));
});

test("an unmapped source head requires a deliberate review acknowledgment", () => {
  const raw = {
    sourceHeadAudit: {
      detected: 2,
      mapped: 1,
      unmapped: [{ id: "head", staff: 1, x: 50, y: 40, pitch: -1, grade: 0.9 }],
    },
  };
  assert.equal(
    omrReviewIssues(normalizeOmrReview(raw))[0].code,
    "UNMAPPED_HEAD_REVIEW",
  );
  raw.sourceHeadAudit.reviewed = true;
  assert.equal(omrReviewIssues(normalizeOmrReview(raw)).length, 0);
});
