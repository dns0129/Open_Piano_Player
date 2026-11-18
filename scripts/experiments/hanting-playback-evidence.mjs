export function playbackEvidence(browser) {
  const { paused, pauseAfterWait, resumed, loaded, finalRestored } = browser;
  let pauseResume = "未验证",
    reload = "未验证";
  const samples = [paused, pauseAfterWait, resumed];
  if (
    samples.every(
      (s) =>
        Number.isFinite(s?.beat) &&
        Number.isFinite(Date.parse(s.at)) &&
        typeof s.play === "string",
    )
  ) {
    const held =
      Date.parse(paused.at) < Date.parse(pauseAfterWait.at) &&
      paused.play === "播放" &&
      pauseAfterWait.play === "播放" &&
      Math.abs(paused.beat - pauseAfterWait.beat) < 0.01;
    const continued =
      Date.parse(resumed.at) > Date.parse(pauseAfterWait.at) &&
      resumed.play === "暂停" &&
      resumed.beat > pauseAfterWait.beat;
    pauseResume = held && continued ? "通过" : "未通过";
  }
  const title = (value) => value.trim().replace(/ · 全谱$/, "");
  if (
    [loaded, finalRestored].every(
      (s) =>
        typeof s?.title === "string" &&
        title(s.title) &&
        [s.systems, s.heads, s.max, s.broken].every(Number.isFinite),
    )
  ) {
    reload =
      title(loaded.title) === title(finalRestored.title) &&
      loaded.broken === 0 &&
      finalRestored.broken === 0 &&
      ["systems", "heads", "max"].every(
        (k) => loaded[k] > 0 && loaded[k] === finalRestored[k],
      )
        ? "通过"
        : "未通过";
  }
  return { pauseResume, reload };
}
