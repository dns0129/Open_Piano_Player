import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

/** Samples are bundled with the app; build and playback never need a sample CDN. */
export async function preparePianoAssets() {
  const root = new URL("../public/audio/piano/", import.meta.url);
  const manifest = JSON.parse(
    await readFile(new URL("manifest.json", root), "utf8"),
  );
  if (manifest.samples?.length !== 30)
    throw new Error("钢琴音源缺少完整采样清单。");
  for (const [index, sample] of manifest.samples.entries()) {
    if (
      sample.midi !== 21 + index * 3 ||
      !/^(?:[AC]|Ds|Fs)[0-8]\.mp3$/.test(sample.file)
    ) {
      throw new Error("钢琴音源的音区映射无效。");
    }
    const bytes = await readFile(new URL(sample.file, root)).catch(() => {
      throw new Error(
        `缺少钢琴采样 ${sample.file}，请恢复 public/audio/piano 后重新构建。`,
      );
    });
    if (
      bytes.byteLength !== sample.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== sample.sha256
    ) {
      throw new Error(`钢琴采样 ${sample.file} 校验失败，请恢复原文件。`);
    }
  }
  for (const file of ["LICENSE.txt", "ATTRIBUTION.txt", "README.txt"])
    await readFile(new URL(file, root));
  return {
    count: manifest.samples.length,
    bytes: manifest.samples.reduce((sum, sample) => sum + sample.bytes, 0),
  };
}
