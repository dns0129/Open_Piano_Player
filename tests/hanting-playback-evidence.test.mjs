import test from "node:test";
import assert from "node:assert/strict";
import { playbackEvidence } from "../scripts/experiments/hanting-playback-evidence.mjs";

test("the report grades pause and reload independently from recorded observations", () => {
  const loaded = {
    title: "测试曲 · 全谱",
    systems: 28,
    heads: 1068,
    max: 380,
    broken: 0,
  };
  const sample = (second, beat, play) => ({
    at: new Date(second * 1000).toISOString(),
    beat,
    play,
  });
  const browser = {
    loaded,
    finalRestored: { ...loaded, title: "测试曲" },
    paused: sample(1, 3, "播放"),
    pauseAfterWait: sample(3, 3, "播放"),
    resumed: sample(6, 5, "暂停"),
  };
  assert.deepEqual(playbackEvidence(browser), {
    pauseResume: "通过",
    reload: "通过",
  });
  assert.deepEqual(playbackEvidence({ completePlaybackPassed: true }), {
    pauseResume: "未验证",
    reload: "未验证",
  });
  assert.deepEqual(
    playbackEvidence({
      ...browser,
      pauseAfterWait: sample(3, 4, "播放"),
      finalRestored: { ...loaded, broken: 1 },
    }),
    { pauseResume: "未通过", reload: "未通过" },
  );
  assert.equal(
    playbackEvidence({
      ...browser,
      finalRestored: { ...loaded, title: "另一首" },
    }).reload,
    "未通过",
  );
});
