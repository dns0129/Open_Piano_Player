import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { generateScore } from "../lib/ai.mjs";
import { createSettingsStore } from "../lib/settings.mjs";
import { publicError } from "../lib/auth.mjs";
const argv = process.argv.slice(2),
  option = (key, fallback) => {
    const i = argv.indexOf(key);
    return i < 0 ? fallback : argv[i + 1];
  };
const manifestPath = resolve(
    option("--manifest", "evidence/full-score/page-manifest.json"),
  ),
  out = resolve(option("--out", "evidence/full-score/ai-pages"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8")),
  settings = await createSettingsStore().read();
await mkdir(out, { recursive: true });
const selected = option("--pages", "").split(",").map(Number).filter(Boolean),
  pages = manifest.pages.filter(
    (page) => !selected.length || selected.includes(page.page),
  );
const limit = Math.max(1, Math.min(2, Number(option("--concurrency", "1"))));
let next = 0,
  failures = 0;
await Promise.all(
  Array.from({ length: limit }, async () => {
    while (next < pages.length) {
      const page = pages[next++],
        path = resolve(out, `page-${String(page.page).padStart(2, "0")}.json`);
      if (!argv.includes("--force"))
        try {
          const old = JSON.parse(await readFile(path, "utf8"));
          if (old.score && old.page === page.page) {
            console.log(
              `page ${page.page}: existing verified response retained`,
            );
            continue;
          }
        } catch {}
      const first = page.firstMeasure,
        last = page.lastMeasure,
        total = (last - first + 1) * 2;
      try {
        const images = await Promise.all(
          page.systems.map(async (system) => ({
            data: (await readFile(resolve(system.imagePath))).toString(
              "base64",
            ),
            mimeType: "image/png",
          })),
        );
        if (images.length > 4)
          throw new Error("一页超过4行，必须显式分段，不能静默忽略。");
        console.log(
          `page ${page.page}: recognizing ${images.length} systems / measures ${first}-${last} / ${total} beats`,
        );
        const result = await generateScore(
          {
            provider: "pi",
            mode: "ocr",
            title: `野蜂飞舞 · Yeung版 · 第${page.page}页`,
            scope: "selection",
            scopeLabel: `第${page.page}页全部谱行；原谱第${first}–${last}小节`,
            prompt: `忠实转写本次全部${images.length}张双手谱行图片，按顺序覆盖第${first}–${last}小节（${last - first + 1}小节，每小节2/4=2个四分音符拍），本次输出共${total}拍，beat从0开始。原谱确认为185 BPM、无调号、2/4拍。注意中途换谱号、高低音加线、临时升降号仅对本小节同八度有效、三连音、多声部、跨小节连音和8va起止。左手整小节休止要保留时间，不添加音符。所有谱行都必须识别，不能只返回首行。页面外前后音符不补写。${page.context || ""}`,
            images,
          },
          settings,
        );
        const expectedDuration = total,
          actualDuration = result.score.durationBeats;
        await writeFile(
          path,
          JSON.stringify(
            {
              page: page.page,
              firstMeasure: first,
              lastMeasure: last,
              expectedDuration,
              actualDuration,
              scopeComplete: Math.abs(expectedDuration - actualDuration) < 1e-5,
              ...result,
            },
            null,
            2,
          ) + "\n",
        );
        if (Math.abs(expectedDuration - actualDuration) > 1e-5) {
          failures++;
          console.error(
            `page ${page.page}: duration mismatch ${actualDuration} vs ${expectedDuration}`,
          );
        } else
          console.log(
            `page ${page.page}: ${result.score.notes.length} notes / complete duration`,
          );
      } catch (error) {
        failures++;
        await writeFile(
          path.replace(".json", ".failure.json"),
          JSON.stringify(
            {
              page: page.page,
              error: publicError(error),
              code: error.code || "FAILED",
            },
            null,
            2,
          ) + "\n",
        );
        console.error(`page ${page.page}: ${publicError(error)}`);
      }
    }
  }),
);
if (failures) process.exitCode = 1;
