// Offline only: replay preserved submissions/results, never import a model transport.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { XMLParser } from "fast-xml-parser";
import MidiPackage from "midi-file";
import { JSDOM } from "jsdom";
import { decodeCompactRegion } from "../lib/recognition-wire.mjs";
import { validateRegionResult, assembleJob } from "../lib/score-region.mjs";
import { recognitionTranscription } from "../lib/recognition-transcription.mjs";
import { createLibraryStore } from "../lib/library-store.mjs";
import { importMusicXML } from "../lib/importers.mjs";
import {
  build,
  validateTranscription,
} from "../skills/piano-score-to-musicxml/scripts/score_pipeline.mjs";
import { RECOGNITION_VERSIONS } from "../lib/recognition-versions.mjs";

const hash = (b) => createHash("sha256").update(b).digest("hex");
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
const list = (x) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const events = (score) =>
  score.notes.map((n) => [n.id, n.midi, n.beat, n.duration, n.hand, n.voice]);
const soundingEvents = (score) =>
  score.notes
    .map((n) => [n.midi, +n.beat.toFixed(6), +n.duration.toFixed(6)])
    .sort();
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export async function verifyRealCases(manifestFile, output) {
  manifestFile = resolve(manifestFile);
  output = resolve(output);
  const manifestBytes = await readFile(manifestFile),
    manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.schema, "recognition-real-cases/v1");
  assert.ok(
    Array.isArray(manifest.cases) &&
      manifest.cases.length > 0 &&
      manifest.cases.length <= 100,
  );
  const path = (p) => resolve(dirname(manifestFile), p);
  const baseline = manifest.baselineSkill
    ? await import(pathToFileURL(path(manifest.baselineSkill)))
    : null;
  // A new directory is mandatory. A failed run is preserved and never overwritten.
  await mkdir(output);
  const sources = new Map([[manifestFile, hash(manifestBytes)]]);
  const read = async (p) => {
    const b = await readFile(p);
    const digest = hash(b);
    if (sources.has(p)) assert.equal(sources.get(p), digest);
    sources.set(p, digest);
    return b;
  };
  if (manifest.baselineSkill) {
    await read(path(manifest.baselineSkill));
    await read(
      join(dirname(path(manifest.baselineSkill)), "core/qinban-core.mjs"),
    );
  }
  const library = createLibraryStore({
    directory: join(output, "validation-library"),
  });
  const results = [],
    ids = new Set();
  for (const c of manifest.cases) {
    assert.match(c.id, /^[a-z0-9-]{1,80}$/);
    assert.ok(!ids.has(c.id));
    ids.add(c.id);
    const dir = join(output, c.id);
    await mkdir(dir);
    const jobPath = path(c.job),
      job = JSON.parse(await read(jobPath));
    assert.notEqual(job.status, "running", "do not load a live task");
    for (const input of c.rowInputs || []) {
      const row = job.regions.find((r) => r.id === input.region);
      assert.ok(row);
      const raw = JSON.parse(await read(path(input.file)));
      row.result = validateRegionResult(
        decodeCompactRegion(raw, { metadata: job.metadata, region: row }),
        row,
        job.metadata,
      );
    }
    for (const row of job.regions) {
      assert.equal(
        hash(await read(resolve(dirname(jobPath), row.id + ".image"))),
        row.image.sha256,
        "recorded row image hash mismatch",
      );
      assert.ok(row.result, c.id + "/" + row.id + " is incomplete");
      row.result = {
        ...row.result,
        ...validateRegionResult(row.result, row, job.metadata),
      };
      assert.equal(
        row.result.checks.passed,
        true,
        c.id + "/" + row.id + " row check failed",
      );
    }
    const assembled = assembleJob(job, { draft: true });
    assert.equal(assembled.checks.passed, true);
    const pageManifest = path(c.pageManifest),
      pages = JSON.parse(await read(pageManifest));
    for (const p of pages.pages)
      await read(resolve(dirname(pageManifest), p.file));
    const graceEvidence = c.graceEvidence
      ? JSON.parse(await read(path(c.graceEvidence))).graces
      : [];
    const canonical = recognitionTranscription(job, pages, {
      sourceGraceNotation: graceEvidence,
    });
    const transcription = c.transcription
      ? JSON.parse(await read(path(c.transcription)))
      : canonical;
    assert.deepEqual(
      events(transcription.score),
      events(canonical.score),
      "curated notation must preserve current principal events",
    );
    const input = join(dir, "transcription.json");
    await writeFile(input, JSON.stringify(transcription, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    const built = await build(
      input,
      pageManifest,
      join(dir, "skill-v" + RECOGNITION_VERSIONS.skill),
      { draft: true, render: true },
    );
    assert.equal(built.status, "draft");
    const artifact = join(dir, "skill-v" + RECOGNITION_VERSIONS.skill);
    const xml = new XMLParser({ ignoreAttributes: false }).parse(
      await readFile(join(artifact, "score.musicxml"), "utf8"),
    );
    const measures = list(xml["score-partwise"].part.measure);
    let xmlNotes = 0,
      svgNotes = 0,
      svgMeasures = 0,
      meter;
    const meterStates = [];
    for (const m of measures) {
      for (const a of list(m.attributes))
        if (a.time) meter = [+a.time.beats, +a.time["beat-type"]];
      const number = +m["@_number"],
        notes = list(m.note);
      xmlNotes += notes.filter((n) => n.rest === undefined).length;
      meterStates.push({ measure: number, meter });
      // Every exported rest must carry the original explicit source rest metadata.
      for (const n of notes.filter((n) => n.rest !== undefined))
        assert.ok(
          list(n.play?.["other-play"]).some(
            (p) => p["@_type"] === "qinban-rest",
          ),
          c.id + " invented an XML rest",
        );
    }
    for (let i = 1; i <= built.engravedPages; i++) {
      const svg = await readFile(
        join(artifact, "engraved-" + String(i).padStart(3, "0") + ".svg"),
        "utf8",
      );
      const dom = new JSDOM(svg, { contentType: "image/svg+xml" });
      svgNotes += dom.window.document.querySelectorAll(
        'g[data-class="note"]',
      ).length;
      for (const m of dom.window.document.querySelectorAll(
        'g[data-class="measure"]',
      )) {
        const original = measures[svgMeasures++];
        assert.ok(original);
        if (!list(original.note).some((n) => n.rest !== undefined))
          assert.equal(
            m.querySelectorAll('g[data-class="rest"],g[data-class="mRest"]')
              .length,
            0,
            c.id + " renderer invented a rest",
          );
      }
      dom.window.close();
    }
    assert.equal(
      svgNotes,
      xmlNotes,
      "renderer must retain every exported head including grace heads",
    );
    assert.equal(svgMeasures, measures.length);
    const imported = importMusicXML(
      await readFile(join(artifact, "score.musicxml"), "utf8"),
    );
    assert.deepEqual(
      soundingEvents(imported.score),
      soundingEvents(transcription.score),
      "MusicXML roundtrip changed principal notes (1e-6 beat precision)",
    );
    const midiBytes = await readFile(join(artifact, "score.mid"));
    const useBaseline = baseline && c.baselineContractSupported !== false;
    if (useBaseline)
      assert.equal(
        hash(midiBytes),
        hash(
          baseline.midi(
            validateTranscription(transcription, pages, { draft: true }),
          ),
        ),
        "layout repair changed MIDI against the unchanged project baseline",
      );
    const previousArtifactMidiIdentical = c.compareMidi
      ? hash(midiBytes) === hash(await read(path(c.compareMidi)))
      : null;
    if (c.compareMidi && !useBaseline)
      assert.equal(
        previousArtifactMidiIdentical,
        true,
        "MIDI differs from the explicit reference",
      );
    const midi = MidiPackage.parseMidi(midiBytes),
      midiMeters = [];
    for (const track of midi.tracks) {
      let tick = 0;
      for (const event of track) {
        tick += event.deltaTime;
        if (event.type === "timeSignature")
          midiMeters.push({
            beat: tick / midi.header.ticksPerBeat,
            meter: [event.numerator, event.denominator],
          });
      }
    }
    const graceCount = measures
      .flatMap((m) => list(m.note))
      .filter((n) => n.grace !== undefined).length;
    if (c.expected?.graces !== undefined)
      assert.equal(graceCount, c.expected.graces);
    for (const m of c.expected?.meters || [])
      assert.deepEqual(
        meterStates.find((x) => x.measure === m.measure)?.meter,
        m.meter,
      );
    for (const m of c.expected?.midiMeters || [])
      assert.ok(
        midiMeters.some(
          (x) =>
            x.beat === m.beat &&
            JSON.stringify(x.meter) === JSON.stringify(m.meter),
        ),
      );
    let readback = false;
    if (c.libraryReadback) {
      const assets = [];
      for (const row of job.regions)
        assets.push({
          id: row.id,
          page: row.page,
          system: row.system,
          mimeType: row.image.mimeType,
          data: (
            await read(resolve(dirname(jobPath), row.id + ".image"))
          ).toString("base64"),
        });
      const saved = await library.save({
        score: { ...assembled.score, id: "e2e-" + c.id },
        sourceNotation: assembled.sourceNotation,
        assets,
        originalFile: {
          name: c.id + ".pdf",
          mimeType: "application/pdf",
          data: (await read(path(c.originalPdf))).toString("base64"),
        },
        reviewStatus: { method: "offline-e2e-draft", humanConfirmed: false },
      });
      const actual = await library.get(saved.id);
      assert.deepEqual(events(actual.score), events(saved.score));
      assert.ok(actual.originalFile && actual.sourceNotation);
      readback = true;
    }
    results.push({
      id: c.id,
      passed: true,
      stages: {
        recordedRecognitionReplay: true,
        rowChecks: true,
        fullScoreChecks: true,
        validationLibraryReadback: readback,
        musicXMLRoundtrip: true,
        engravingHeadConservation: true,
        noInventedRests: true,
        midiUnchanged: !!(useBaseline || c.compareMidi),
      },
      previousArtifactMidiIdentical,
      midiComparisonBaseline: useBaseline
        ? manifest.baselineLabel
        : "previous-explicit-reference (legacy contract cannot represent ordered clefs)",
      principalNotes: transcription.score.notes.length,
      graceHeads: graceCount,
      engravedPages: built.engravedPages,
      unhandled: transcription.notation.unhandled.length,
      output: artifact,
    });
    await writeFile(
      join(output, "progress.json"),
      JSON.stringify({ providerCalls: 0, results }, null, 2),
      { mode: 0o600 },
    );
  }
  for (const [p, digest] of sources)
    assert.equal(hash(await readFile(p)), digest, "original source changed");
  const report = {
    schema: "recognition-real-e2e/v1",
    at: new Date().toISOString(),
    skillVersion: RECOGNITION_VERSIONS.skill,
    providerCalls: 0,
    modelInputChanged: false,
    sourceAccuracy: { status: "not-scored", humanConfirmed: false },
    sourcesPreserved: true,
    sources: [...sources].map(([path, sha256]) => ({ path, sha256 })),
    results,
  };
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    join(output, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>真实难例端到端验证</title><style>body{font:16px/1.7 system-ui;max-width:1100px;margin:30px auto}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}a{color:#1769aa}</style><h1>真实难例端到端验证 · Skill ${report.skillVersion}</h1><p>${results.length}个案例通过；供应商请求0次。原版哈希不变。此为已保存识别结果的离线端到端验证，不是模型新识读或原谱准确率测验；产物仍为AI草稿，未适配符号保留。</p><table><tr><th>案例</th><th>主音/倚音头</th><th>验证库读回</th><th>新产物</th></tr>${results.map((r) => `<tr><td>${escape(r.id)}</td><td>${r.principalNotes}/${r.graceHeads}</td><td>${r.stages.validationLibraryReadback ? "通过" : "本例未执行"}</td><td><a href="${r.id}/skill-v${report.skillVersion}/index.html">MusicXML / MIDI / 重排谱</a></td></tr>`).join("")}</table>`,
    { flag: "wx", mode: 0o600 },
  );
  return report;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const value = (flag) => process.argv[process.argv.indexOf(flag) + 1];
  if (!process.argv.includes("--cases") || !process.argv.includes("--out"))
    throw Error(
      "Use --cases PRIVATE_MANIFEST --out NEW_DIRECTORY; offline only",
    );
  const result = await verifyRealCases(value("--cases"), value("--out"));
  console.log(
    JSON.stringify({
      cases: result.results.length,
      passed: true,
      providerCalls: 0,
      sourcesPreserved: true,
    }),
  );
}
