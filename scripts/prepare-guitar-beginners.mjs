// Rebuild the public guitar collection from explicit bars; no network or AI calls.
// --local also installs missing editions into the authoritative disk library.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { guitarBeginnerBundle } from "../lib/guitar-beginner-collection.mjs";
import { cloudEntry } from "../lib/cloud-library-format.mjs";
import { exportMusicXML, exportMidi } from "../lib/exporters.mjs";
import { createLibraryStore } from "../lib/library-store.mjs";

const collection = JSON.parse(
  await readFile("public/guitar-beginner-sources/collection.json", "utf8"),
);
const index = JSON.parse(
  await readFile("public/cloud-library/index.json", "utf8"),
);
const entries = new Map(index.scores.map((s) => [s.id, s]));
const local = process.argv.includes("--local") ? createLibraryStore() : null;
await mkdir("public/cloud-library/scores", { recursive: true });
const report = [];
for (const edition of collection.scores) {
  if (index.deletedIds?.includes(edition.id)) {
    console.log(`保留云端删除状态：${edition.id}`);
    continue;
  }
  const bundle = guitarBeginnerBundle(edition);
  const text = JSON.stringify(bundle) + "\n";
  await writeFile(`public/cloud-library/scores/${edition.id}.json`, text);
  entries.set(edition.id, cloudEntry(bundle));
  await writeFile(
    `public/guitar-beginner-sources/${edition.id}.musicxml`,
    exportMusicXML(bundle.document),
  );
  await writeFile(
    `public/guitar-beginner-sources/${edition.id}.mid`,
    exportMidi(bundle.document),
  );
  if (local) {
    let exists = false;
    try {
      await local.get(edition.id);
      exists = true;
    } catch (e) {
      if (e.code !== "LIBRARY_NOT_FOUND") throw e;
    }
    if (!exists) await local.save(bundle, { expectedRevision: 0 });
  }
  report.push({
    id: edition.id,
    title: edition.title,
    measures: edition.bars.length,
    notes: bundle.score.notes.length,
    durationBeats: bundle.score.durationBeats,
    tempo: edition.tempo,
    sha256: createHash("sha256").update(text).digest("hex"),
  });
  console.log(
    `${edition.title} · ${edition.bars.length}小节 · ${bundle.score.notes.length}音符 · ${edition.tempo}BPM`,
  );
}
index.scores = [...entries.values()].sort((a, b) => a.id.localeCompare(b.id));
index.updatedAt = new Date().toISOString();
await writeFile(
  "public/cloud-library/index.json",
  JSON.stringify(index, null, 2) + "\n",
);
await writeFile(
  "public/guitar-beginner-sources/manifest.json",
  JSON.stringify(
    { version: 1, collection: collection.collection, scores: report },
    null,
    2,
  ) + "\n",
);
console.log(
  `已准备${report.length}首吉他入门曲目${local ? "，并将缺少的版本保存到本机曲库" : ""}；尚未推送或部署。`,
);
