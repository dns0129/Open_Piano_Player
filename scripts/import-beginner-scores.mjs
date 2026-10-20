// Rebuild this licensed collection offline from its bundled original files.
// Use --local to also install it in this computer's authoritative library.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import MidiPackage from "@tonejs/midi/build/Midi.js";
import { importMidi } from "../lib/importers.mjs";
import { readScoreDocument, toPracticeScore } from "../lib/score-document.ts";
import {
  validateCloudBundle,
  cloudEntry,
} from "../lib/cloud-library-format.mjs";
import { addScore } from "../lib/score-repository.mjs";
import { createLibraryStore } from "../lib/library-store.mjs";

const manifest = JSON.parse(
  await readFile("score-repo/beginner-sources.json", "utf8"),
);
const index = JSON.parse(
  await readFile("public/cloud-library/index.json", "utf8"),
);
const entries = new Map(index.scores.map((s) => [s.id, s]));
const local = process.argv.includes("--local") ? createLibraryStore() : null;
const warning =
  "数字谱来自原版 MIDI：原始音高和节奏保留，音名拼写、声部、休止及延音音头由演奏事件推断；指法、连奏线和页码定位请查原 PDF。反复段按原 MIDI 的展开顺序播放。";

function changingMeterMap(midi, duration) {
  const changes = midi.header.timeSignatures;
  if (changes.length < 2) return {};
  const map = [];
  let beat = 0,
    current = 0;
  while (beat < duration - 1e-7) {
    while (
      current + 1 < changes.length &&
      changes[current + 1].ticks / midi.header.ppq <= beat + 1e-7
    )
      current++;
    const meter = changes[current].timeSignature;
    const next = Math.min(
      duration,
      beat + (meter[0] * 4) / meter[1],
      changes[current + 1]?.ticks / midi.header.ppq || Infinity,
    );
    if (next <= beat) throw Error("MIDI 拍号时间轴无效。");
    map.push({
      measure: map.length + 1,
      beat,
      duration: next - beat,
      timeSignature: meter,
    });
    beat = next;
  }
  return { measureMap: map };
}
await mkdir("public/cloud-library/scores", { recursive: true });
for (const source of manifest.scores) {
  const files = {};
  for (const [kind, file] of Object.entries(source.files)) {
    const bytes = await readFile(file.path);
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
      throw Error(source.id + " 原始文件校验失败。");
    files[kind] = bytes;
  }
  const midi = new MidiPackage.Midi(files.mid),
    imported = importMidi(files.mid, source.id + ".mid");
  const hands = new Map();
  let i = 0;
  for (const track of midi.tracks.filter(
    (t) => t.notes.length && t.channel !== 9,
  )) {
    const hand = /upper|^up:/i.test(track.name)
      ? "right"
      : /lower|^down:/i.test(track.name)
        ? "left"
        : null;
    if (!hand) throw Error(source.id + " 的谱表音轨未标识。");
    for (const note of track.notes)
      if (note.midi >= 21 && note.midi <= 108) hands.set("midi-" + i++, hand);
  }
  const roundedTempo = (n) =>
    Math.abs(n - Math.round(n)) < 0.001 ? Math.round(n) : n;
  const document = readScoreDocument({
    ...imported.score,
    ...changingMeterMap(midi, imported.score.durationBeats),
    tempo: roundedTempo(imported.score.tempo),
    tempoMap: imported.score.tempoMap?.map((e) => ({
      ...e,
      bpm: roundedTempo(e.bpm),
    })),
    id: source.id,
    title: source.title + " · " + source.opus,
    composer: source.composer,
    notes: imported.score.notes.map((n) => ({
      ...n,
      hand: hands.get(n.id),
      staff: hands.get(n.id) === "left" ? 2 : 1,
    })),
    source: {
      kind: "mutopia-midi",
      label:
        source.level +
        (source.batch ? " · 第" + source.batch + "批" : "") +
        " · Mutopia MIDI · 排版：" +
        source.maintainer,
      url: source.sourceUrl,
      license:
        source.license +
        " · " +
        source.licenseUrl +
        " · 排版：" +
        source.maintainer +
        "；琴伴从原 MIDI 转换数字谱，衍生数字谱沿用同一许可。",
    },
  });
  const score = toPracticeScore(document);
  await addScore(score, {
    description:
      source.level + " · " + source.opus + " · Mutopia 原始 MIDI 导入",
  });
  const bundle = validateCloudBundle({
    document,
    score,
    warnings: [warning],
    reviewStatus: { method: "structured-midi-import", humanConfirmed: false },
  });
  await writeFile(
    "public/cloud-library/scores/" + source.id + ".json",
    JSON.stringify(bundle) + "\n",
  );
  entries.set(source.id, cloudEntry(bundle));
  if (local) {
    let existing;
    try {
      existing = await local.get(source.id);
    } catch (e) {
      if (e.code !== "LIBRARY_NOT_FOUND") throw e;
    }
    if (!existing)
      await local.save(
        {
          ...bundle,
          originalFile: {
            name: source.id + ".pdf",
            mimeType: "application/pdf",
            data: files.pdf.toString("base64"),
          },
        },
        { expectedRevision: 0 },
      );
  }
  console.log(
    source.id + " · " + score.notes.length + " 音符 · " + score.tempo + " BPM",
  );
}
index.scores = [...entries.values()].sort((a, b) => a.id.localeCompare(b.id));
index.updatedAt = new Date().toISOString();
await writeFile(
  "public/cloud-library/index.json",
  JSON.stringify(index, null, 2) + "\n",
);
console.log(
  "已准备 " +
    manifest.scores.length +
    " 首授权曲目" +
    (local ? "，并接入本机磁盘曲库。" : "；尚未推送远端。"),
);
