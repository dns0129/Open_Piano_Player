// 在真实浏览器中打开曲库里的一首曲目，从开头、中段、末段各播放几秒，确认播放位置与跟谱高亮随之前进。
// 用法：node scripts/verify-playback.cjs <曲目ID> [网址，默认 http://127.0.0.1:8792/] [截图目录]
// 只验证“能导入、能播放、能跟谱”，不代表音符正确；音符正确性用 omr-benchmark-score.mjs 评分。
const path = require('node:path');
const { execSync } = require('node:child_process');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));

(async () => {
  const [id, url = 'http://127.0.0.1:8792/', shots] = process.argv.slice(2);
  if (!id) { console.error('用法：verify-playback.cjs <曲目ID> [网址] [截图目录]'); process.exit(2); }
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [], failed = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('/api/')) failed.push(`${r.status()} ${r.url()}`); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('[data-nav="library"]');
  await page.waitForTimeout(500);
  await page.click(`[data-open="${id}"]`);
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => ({ total: Number(document.querySelector('#seek')?.max || 0), bars: document.body.innerText.match(/第 \d+ \/ (\d+) 小节/)?.[1] }));
  const results = [];
  for (const [label, fraction] of [['开头', 0], ['中段', 0.5], ['末段', 0.9]]) {
    const beat = Math.floor(info.total * fraction);
    await page.evaluate(b => { const s = document.querySelector('#seek'); s.value = b; s.dispatchEvent(new Event('input', { bubbles: true })); }, beat);
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => document.body.innerText.match(/第 (\d+) \/ \d+ 小节/)?.[1]);
    await page.keyboard.press('Space');
    await page.waitForTimeout(4000);
    const after = await page.evaluate(() => {
      const measure = document.querySelector('#notation .notation-measure.is-current');
      return { bar: document.body.innerText.match(/第 (\d+) \/ \d+ 小节/)?.[1], seek: Number(document.querySelector('#seek')?.value || 0),
        highlightedMeasure: measure ? Number(measure.dataset.measure) + 1 : null, activeNotes: document.querySelectorAll('#notation .notation-hit.is-active').length };
    });
    await page.keyboard.press('Space');
    if (shots) await page.screenshot({ path: path.join(shots, `playback-${label}.png`) });
    results.push({ label, startBeat: beat, barBefore: Number(before), barAfter: Number(after.bar), seekAfter: after.seek, advanced: after.seek > beat,
      highlightedMeasure: after.highlightedMeasure, activeNotes: after.activeNotes, followsPlayback: after.highlightedMeasure === Number(after.bar) });
  }
  console.log(JSON.stringify({ id, totalBeats: info.total, bars: Number(info.bars), results, pageErrors: errors, failedRequests: failed }, null, 1));
  await browser.close();
  process.exit(results.every(r => r.advanced && r.followsPlayback) && !errors.length ? 0 : 1);
})();
