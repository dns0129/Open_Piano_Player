import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

/** Validate the bundled strings without downloading anything during build. */
export async function prepareStringAssets() {
  const result = {};
  for (const [bank, count] of [
    ["violin", 14],
    ["strings", 20],
  ]) {
    const root = new URL(`../public/audio/${bank}/`, import.meta.url);
    const manifest = JSON.parse(
      await readFile(new URL("manifest.json", root), "utf8"),
    );
    if (
      manifest.id !== bank ||
      manifest.samples?.length !== count ||
      manifest.license !== "CC0-1.0"
    ) {
      throw new Error(`${bank} 弦乐采样清单不完整。`);
    }
    const roots = new Set();
    for (const sample of manifest.samples) {
      if (
        !Number.isInteger(sample.midi) ||
        sample.midi < 21 ||
        sample.midi > 108 ||
        roots.has(sample.midi) ||
        sample.file !== `${sample.midi}.mp3` ||
        !(
          sample.loopStart >= 0 &&
          sample.loopEnd > sample.loopStart + 0.05 &&
          sample.loopEnd < 8
        )
      ) {
        throw new Error(`${bank} 弦乐采样映射或循环区间无效。`);
      }
      roots.add(sample.midi);
      const bytes = await readFile(new URL(sample.file, root));
      if (
        bytes.length !== sample.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== sample.sha256
      ) {
        throw new Error(
          `${bank} 弦乐采样 ${sample.file} 校验失败，请恢复音源文件。`,
        );
      }
    }
    for (const file of ["LICENSE.txt", "ATTRIBUTION.txt"])
      await readFile(new URL(file, root));
    result[bank] = {
      count,
      bytes: manifest.samples.reduce((sum, sample) => sum + sample.bytes, 0),
    };
  }
  return result;
}
