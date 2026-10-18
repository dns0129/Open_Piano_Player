// 由 scripts/score-repo.mjs 生成，请勿手工编辑。
import { validateScore } from '../lib/score.mjs';
import s0 from './scores/beethoven-prelude-woo55.json' with { type: 'json' };
import s1 from './scores/golden-hour-netease-664959.json' with { type: 'json' };

export const repositoryScores = [
  { ...validateScore(s0), description: "Mutopia #939（Public Domain）PDF 页图经优化识谱流程（识读+独立复核）转写；未经人工修正，评测见 benchmarks/omr-2026-10-18" },
  { ...validateScore(s1), description: "网易云9页55小节逐音转写 · E 大调 12/8 · 待对照原谱校对" },
];
