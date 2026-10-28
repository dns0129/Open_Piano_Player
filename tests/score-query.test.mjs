import test from "node:test";
import assert from "node:assert/strict";
import { getScoreQueryPlan } from "../lib/score-query.mjs";
import { relevanceScore, discoverScoreFiles } from "../lib/public-library.mjs";
test("Chinese work queries search English title without losing original words or extra artist constraints", () => {
  const plan = getScoreQueryPlan("《野蜂飞舞》 钢琴谱");
  assert.equal(plan.matchedWork.title, "Flight of the Bumblebee");
  assert.match(
    plan.queries[0],
    /Flight of the Bumblebee piano solo sheet music Rimsky-Korsakov/,
  );
  assert.match(plan.queries[1], /野蜂飞舞/);
  assert.match(getScoreQueryPlan("野蜂飞舞 王羽佳").queries[0], /王羽佳/);
  assert.equal(getScoreQueryPlan("陌生的新歌 周杰伦").matchedWork, null);
  assert.ok(
    !getScoreQueryPlan("陌生的新歌 周杰伦").queries.some((q) =>
      q.includes("Bumblebee"),
    ),
  );
});
test("Chinese title matches actual foreign piano score while unrelated works and wrong artist never match", () => {
  const row = {
    title: "Flight of the Bumblebee - Rimsky-Korsakov - Piano solo sheet music",
    url: "https://scores.example.org/flight.pdf",
  };
  assert.ok(relevanceScore(row, "野蜂飞舞") > 0);
  assert.ok(relevanceScore(row, "Hummelflug") > 0);
  assert.equal(relevanceScore(row, "野蜂飞舞 周杰伦"), 0);
  assert.equal(
    relevanceScore(
      { ...row, title: "Fugue sur le nom de Bach - Rimsky-Korsakov piano" },
      "野蜂飞舞",
    ),
    0,
  );
  assert.equal(
    relevanceScore(
      { ...row, title: "Flight of the Bumblebee violin part" },
      "野蜂飞舞",
    ),
    0,
  );
  assert.equal(
    relevanceScore(
      {
        ...row,
        title: "Rimski Korsakov The Flight Of The Bumblebee For Accordion",
      },
      "野蜂飞舞",
    ),
    0,
  );
});
test("piano photographs, covers and unrelated images are excluded even on a score page", () => {
  const found = discoverScoreFiles(
    '<title>野蜂飞舞钢琴谱</title><img src="/piano-photo.jpg" alt="钢琴照片"><img src="/sheet-cover.jpg" alt="钢琴谱封面"><img src="/random.jpg" alt="钢琴"><img src="/flight-score-page-1.png" alt="Flight of the Bumblebee piano sheet music page 1"><img src="/violin-score.png" alt="Flight of the Bumblebee violin sheet music">',
    "https://scores.example.org/bumblebee",
  );
  assert.equal(found.files.length, 1);
  assert.ok(found.files[0].url.endsWith("flight-score-page-1.png"));
  assert.equal(found.files[0].imageVerification, "pending");
});
