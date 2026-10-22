import { validateCloudBundle } from "../lib/cloud-library-format.mjs";
import { savePracticeSource, loadPracticeSource } from "./source-library.js";
export async function saveCloudDownload(raw, { saveOnDisk } = {}) {
  const bundle = validateCloudBundle(raw);
  if (saveOnDisk) {
    await saveOnDisk(bundle);
    return bundle.score;
  }
  {
    const assets = bundle.assets.map((a) => ({
      ...a,
      blob: new Blob([Uint8Array.from(atob(a.data), (c) => c.charCodeAt(0))], {
        type: a.mimeType,
      }),
    }));
    await savePracticeSource({ ...bundle, assets, downloaded: true });
  }
  return bundle.score;
}
export async function packageLocalScore(score, sourceRecord = undefined) {
  const source =
    sourceRecord === undefined ? await loadPracticeSource(score) : sourceRecord;
  const assets = [];
  if (source?.notation)
    for (const system of source.notation.systems) {
      const response = await fetch(system.imageUrl);
      if (!response.ok) throw new Error("原谱图片读取失败，未上传不完整曲目。");
      const blob = await response.blob();
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      assets.push({
        id: system.assetId || system.id,
        page: system.page,
        system: system.system,
        mimeType: blob.type,
        data,
      });
    }
  return validateCloudBundle({
    score,
    sourceNotation: source?.notation || null,
    assets,
    warnings: source?.warnings || [],
    reviewStatus: source?.reviewStatus || {},
  });
}
