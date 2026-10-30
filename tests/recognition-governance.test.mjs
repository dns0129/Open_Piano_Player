import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  writeFile,
  mkdir,
  copyFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateRecognitionRun,
  compareRecognitionRegression,
  scoreRecognitionCase,
} from "../lib/recognition-regression.mjs";
import { checkRecognitionVersions } from "../scripts/check-recognition-versions.mjs";
import {
  checkRecognitionRelease,
  recordRecognitionRelease,
} from "../scripts/check-recognition-release.mjs";
import {
  recognitionPromptFingerprint,
  recognitionReleaseFingerprint,
} from "../lib/recognition-governance.mjs";
import { nodeCompatible, selectNodeRuntime } from "../lib/node-runtime.mjs";
import { regressionScopeFingerprint } from "../lib/recognition-regression-io.mjs";
const root = fileURLToPath(new URL("..", import.meta.url)),
  note = (midi = 60, beat = 0) => ({ midi, beat, duration: 1, hand: "right" });
const c = (id, notes) => ({
  id,
  dataset: "synthetic",
  eventUnit: "written-head",
  referenceLevel: "synthetic-test-only",
  alignment: "frozen-row-relative",
  reference: { notes },
});
test("fixed scope binds references and input identities but allows new responses to be compared", () => {
  const suite = {
    cases: [c("row", [note()])],
    files: [],
    runs: [
      {
        trial: "read",
        caseIds: ["row"],
        readings: [{ value: "first output" }],
      },
    ],
  };
  const digest = regressionScopeFingerprint(suite);
  suite.runs[0].readings[0].value = "new output";
  assert.equal(regressionScopeFingerprint(suite), digest);
  suite.cases[0].reference.notes[0].midi++;
  assert.notEqual(regressionScopeFingerprint(suite), digest);
});
test("fixed regression retains refused rows, duplicate predictions and missing cases; metadata measure labels do not shift row time", () => {
  const cases = [
    c("a", [{ ...note(), measure: 4 }]),
    c("b", [note(65), note(67, 1)]),
    c("missing", [note(70)]),
  ];
  const result = evaluateRecognitionRun(
      cases,
      [
        {
          caseId: "a",
          status: "returned",
          notes: [note(), note()],
          checksPassed: true,
        },
        { caseId: "b", status: "refused", notes: [] },
      ],
      { trial: "first" },
    ),
    g = result.groups[0];
  assert.equal(g.strict.reference, 4);
  assert.equal(g.strict.predicted, 2);
  assert.equal(g.strict.correct, 1);
  assert.equal(g.strict.unmatchedPrediction, 1);
  assert.equal(g.statuses.refused, 1);
  assert.equal(g.statuses.missing, 1);
  assert.equal(g.falseCompletions, 1);
  assert.equal(result.overallAccuracy, null);
});
test("bar-local evidence cannot borrow an identical event from a different annotated bar; source tiers and event units stay separate", () => {
  const one = c("photo", [
    { ...note(), measure: 1 },
    { ...note(), measure: 2 },
  ]);
  one.alignment = "annotated-bar-local";
  const other = {
    ...c("midi", [note()]),
    eventUnit: "performed-event",
    referenceLevel: "different-reference",
  };
  const result = evaluateRecognitionRun(
    [one, other],
    [
      {
        caseId: "photo",
        status: "returned",
        notes: [
          { ...note(), measure: 1 },
          { ...note(), measure: 1 },
        ],
      },
      { caseId: "midi", status: "returned", notes: [note()] },
    ],
  );
  assert.equal(result.groups.length, 2);
  assert.equal(result.groups[0].strict.correct, 1);
  assert.equal(result.groups[0].strict.unmatchedPrediction, 1);
});
test("enharmonic sound and paper spelling are different metrics; unavailable printed or rest truth remains unknown", () => {
  const ref = {
      notes: [{ ...note(70), written: { step: "B", octave: 4, alter: -1 } }],
    },
    prediction = {
      status: "returned",
      notes: [{ ...note(70), written: { step: "A", octave: 4, alter: 1 } }],
    };
  const r = scoreRecognitionCase(ref, prediction);
  assert.equal(r.strict.correct, 1);
  assert.equal(r.writtenSpelling.correct, 0);
  assert.equal(r.writtenSpelling.accuracy, 0);
  assert.equal(r.printedAccidentals.accuracy, null);
  assert.equal(r.rests, null);
  const unavailable = scoreRecognitionCase(ref, {
    status: "returned",
    notes: [note(70)],
  });
  assert.equal(unavailable.writtenSpelling.measured, false);
  assert.equal(unavailable.writtenSpelling.accuracy, null);
});
test("quality comparison blocks a deleted chord head even when rhythm coverage and structural checks pass", () => {
  const cases = [c("row", [note(), note(64)])],
    a = evaluateRecognitionRun(
      cases,
      [
        {
          caseId: "row",
          status: "returned",
          notes: [note(), note(64)],
          checksPassed: true,
        },
      ],
      { trial: "fixed" },
    ),
    b = evaluateRecognitionRun(
      cases,
      [
        {
          caseId: "row",
          status: "returned",
          notes: [note()],
          checksPassed: true,
        },
      ],
      { trial: "fixed" },
    );
  const comparison = compareRecognitionRegression(a, b);
  assert.equal(comparison.passed, false);
  assert.ok(comparison.problems.some((p) => p.includes("严格匹配下降")));
  assert.equal(b.groups[0].falseCompletions, 1);
  assert.throws(
    () =>
      evaluateRecognitionRun(cases, [
        { caseId: "outside", status: "failed", notes: [] },
      ]),
    /未声明/,
  );
});
test("component documentation and skill versions are checked independently; stale active metadata fails", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "p2-versions-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const files = [
    "README.md",
    "docs/recognition-strategy.md",
    "docs/recognition-versions.json",
    "docs/recognition-regression-corpus.json",
    "package.json",
    ".nvmrc",
    ".github/workflows/check.yml",
    "skills/piano-score-to-musicxml/references/app-integration.md",
    "skills/piano-score-to-musicxml/SKILL.md",
    "skills/piano-score-to-musicxml/package.json",
    "skills/piano-score-to-musicxml/package-lock.json",
  ];
  for (const file of files) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await copyFile(join(root, file), join(dir, file));
  }
  const checked = await checkRecognitionVersions(dir);
  assert.notEqual(checked.versions.prompt, checked.versions.accidentals);
  assert.equal(checked.skill, "1.3.3");
  const path = join(dir, "README.md");
  await writeFile(
    path,
    (await readFile(path, "utf8")).replace(
      "piano-written-evidence-v8",
      "obsolete-prompt",
    ),
  );
  await assert.rejects(checkRecognitionVersions(dir), /README.*过期/);
});
test("release gate rejects changed implementation and offline evidence for a changed model prompt", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "p2-release-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const impl = await recognitionReleaseFingerprint(root);
  const files = [
    ...impl.files.map((f) => f.path),
    "lib/source-assessment.mjs",
    "docs/recognition-release-evidence.json",
  ];
  for (const file of new Set(files)) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await copyFile(join(root, file), join(dir, file));
  }
  await checkRecognitionRelease(dir);
  await writeFile(join(dir, "lib/recognition-plan.mjs"), "\n// changed\n", {
    flag: "a",
  });
  await assert.rejects(checkRecognitionRelease(dir), /实现已变化/);
  const cases = [c("row", [note()])],
    run = evaluateRecognitionRun(cases, [
      { caseId: "row", status: "returned", notes: [note()] },
    ]);
  const file = join(dir, "evaluation.json");
  await writeFile(
    file,
    JSON.stringify({
      schema: "recognition-release-evaluation/v1",
      before: [run],
      after: [run],
      implementation: impl,
      prompt: await recognitionPromptFingerprint(root),
      baselinePrompt: { digest: "old-model-input" },
      sourceFiles: [],
      independentVerification: { passed: true },
      mode: "offline-frozen-responses",
    }),
  );
  await assert.rejects(
    recordRecognitionRelease(root, file),
    /离线重放不能证明/,
  );
});
test("release fingerprint binds every module of the full-PDF review dialog", async () => {
  const bound = new Set(
    (await recognitionReleaseFingerprint(root)).files.map((f) => f.path),
  );
  const modules = (await readdir(join(root, "src"))).filter((name) =>
    /^full-score-import.*\.js$/.test(name),
  );
  assert.ok(modules.length > 1);
  for (const name of modules)
    assert.ok(bound.has(`src/${name}`), `src/${name} is not release-gated`);
});
test("runtime discovery skips Node 21, respects explicit selection and requires the actual minimum patch", () => {
  assert.equal(nodeCompatible("v21.3.0"), false);
  assert.equal(nodeCompatible("v22.18.0"), false);
  assert.equal(nodeCompatible("v22.19.0"), true);
  assert.equal(nodeCompatible("v24.19.0"), true);
  assert.equal(nodeCompatible("v24.0.0-nightly"), false);
  const versions = { "/old/node": "v21.3.0", "/good/node": "v24.19.0" },
    probe = (file) => {
      if (!versions[file]) throw Error("missing");
      return versions[file];
    };
  const found = selectNodeRuntime({
    current: "/old/node",
    env: { PATH: "/old:/good" },
    home: "/unused",
    probe,
  });
  assert.equal(found.node, "/good/node");
  assert.throws(
    () =>
      selectNodeRuntime({
        current: "/good/node",
        env: { QINBAN_NODE: "/old/node" },
        probe,
      }),
    /未找到/,
  );
});
