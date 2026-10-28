import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePrintStyle,
  printStylePreferences,
  printSVGColor,
  PRINT_PAGE_STYLES,
} from "../lib/score-print-style.mjs";

test("print preferences never carry the previous piece title or credit into a new piece", () => {
  const style = normalizePrintStyle({
    title: "我的标题",
    credit: "自定义编配者",
    creditLabel: "编配",
    subtitle: "音乐会",
    textFont: "kai",
    creditPosition: "under-title",
    musicFont: "Petaluma",
  });
  const preferences = printStylePreferences(style);
  assert.equal(preferences.title, undefined);
  assert.equal(preferences.credit, undefined);
  assert.equal(preferences.subtitle, undefined);
  assert.equal(preferences.creditLabel, undefined);
  const next = normalizePrintStyle(preferences, {
    title: "下一首曲目",
    composer: "下一位作曲家",
  });
  assert.equal(next.title, "下一首曲目");
  assert.equal(next.credit, "下一位作曲家");
  assert.equal(next.musicFont, "Petaluma");
  assert.equal(next.creditPosition, "under-title");
  assert.equal(next.textFont, "kai");
});

test("unknown saved choices and out-of-range sizes fall back to printable bounds", () => {
  const style = normalizePrintStyle(
    {
      textFont: "removed-font",
      musicFont: "<script>",
      headerFormat: "unknown",
      titleSize: 900,
      marginMM: -20,
      scoreScale: "NaN",
      showDetails: false,
      showPageNumbers: false,
      title: "  ",
      credit: "",
      creditLabel: "",
    },
    { title: "原始曲名", composer: "原作者" },
  );
  assert.equal(style.textFont, "song");
  assert.equal(style.musicFont, "Bravura");
  assert.equal(style.headerFormat, "center");
  assert.equal(style.titleSize, 34);
  assert.equal(style.marginMM, 10);
  assert.equal(style.scoreScale, 100);
  assert.equal(style.showDetails, false);
  assert.equal(style.showPageNumbers, false);
  assert.equal(style.title, "原始曲名");
  assert.equal(style.credit, "");
  assert.equal(style.creditLabel, "");
});

test("tuplet label masks retain the paper color while ink and transparent fills stay distinct", () => {
  for (const palette of Object.values(PRINT_PAGE_STYLES)) {
    assert.equal(printSVGColor("rgb(255, 255, 255)", palette), palette.paper);
    assert.equal(printSVGColor("#fff", palette), palette.paper);
    assert.equal(printSVGColor("rgb(70, 100, 79)", palette), palette.ink);
    assert.equal(printSVGColor("none", palette), "none");
    assert.equal(
      printSVGColor("rgba(0, 0, 0, 0)", palette),
      "rgba(0, 0, 0, 0)",
    );
  }
});
