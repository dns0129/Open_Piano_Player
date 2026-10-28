import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sharedCredential, publicError } from "../lib/auth.mjs";
import {
  normalizeGenerateInput,
  acceptScore,
  generateDeepseek,
} from "../lib/ai.mjs";
import { createSettingsStore } from "../lib/settings.mjs";
import {
  searchPublicScores,
  downloadPublicScore,
} from "../lib/public-library.mjs";

const image = {
  mimeType: "image/png",
  data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]).toString("base64"),
};
const input = {
  provider: "pi",
  mode: "arrange",
  title: "真实谱面",
  prompt: "",
  images: [image],
};
const rawScore = {
  title: "雨后",
  composer: "mock",
  tempo: 80,
  timeSignature: [4, 4],
  keySignature: 0,
  durationBeats: 4,
  coverage: { complete: true },
  notes: [
    { midi: 60, beat: 0, duration: 4, hand: "right", velocity: 0.8 },
    { midi: 48, beat: 0, duration: 4, hand: "left", velocity: 0.5 },
  ],
  warnings: [],
};

test("OCR recognition scope refers to supplied excerpts and rejects silent partial coverage", () => {
  const selected = normalizeGenerateInput({
    ...input,
    scope: "selection",
    scopeLabel: "第1页第1行",
  });
  assert.equal(selected.scope, "selection");
  assert.equal(selected.scopeLabel, "第1页第1行");
  assert.equal(normalizeGenerateInput(input).scope, "provided");
  assert.throws(
    () => normalizeGenerateInput({ ...input, scope: "complete-song" }),
    /范围/,
  );
  assert.throws(
    () => acceptScore({ ...rawScore, coverage: { complete: false } }, selected),
    (error) => error.code === "INCOMPLETE_OCR",
  );
  const accepted = acceptScore(
    { ...rawScore, coverage: { complete: true } },
    selected,
  );
  assert.match(accepted.score.source.label, /第1页第1行/);
});

test("all composition and title-only reconstruction are disabled before any model call", () => {
  for (const title of ["晴天", "欢乐颂", "任意歌名"])
    assert.throws(
      () => normalizeGenerateInput({ ...input, title, images: [] }),
      (e) => e.code === "IMAGE_REQUIRED" && e.status === 422,
    );
  assert.throws(
    () => normalizeGenerateInput({ ...input, mode: "compose" }),
    (e) => e.code === "COMPOSE_DISABLED",
  );
  assert.equal(normalizeGenerateInput(input).mode, "arrange");
});
test("score image MIME and binary signature are checked before model calls", () => {
  assert.throws(
    () =>
      normalizeGenerateInput({
        ...input,
        images: [
          {
            mimeType: "image/png",
            data: Buffer.from("not an image").toString("base64"),
          },
        ],
      }),
    /图片内容/,
  );
  assert.throws(
    () => normalizeGenerateInput({ ...input, images: Array(5).fill({}) }),
    /最多/,
  );
  assert.equal(
    normalizeGenerateInput({ ...input, provider: "deepseek" }).provider,
    "deepseek",
  );
});
test("model output is independently validated and provenance is assigned by server", () => {
  const result = acceptScore(
    {
      ...rawScore,
      source: { kind: "original", url: "https://invented.example" },
    },
    normalizeGenerateInput(input),
  );
  assert.equal(result.score.source.kind, "image-ai");
  assert.equal(result.score.composer, "mock");
  assert.equal(result.score.source.url, undefined);
  assert.ok(result.warnings.length);
  assert.throws(
    () =>
      acceptScore(
        {
          ...rawScore,
          notes: [{ midi: 900, beat: 0, duration: 1, hand: "right" }],
        },
        normalizeGenerateInput(input),
      ),
    (e) => e.code === "INVALID_SCORE",
  );
});
test("DeepSeek requires source images and a key before transport", async () => {
  await assert.rejects(
    () => generateDeepseek(input, {}),
    (e) => e.code === "DEEPSEEK_KEY_REQUIRED",
  );
  assert.throws(
    () =>
      normalizeGenerateInput({ ...input, provider: "deepseek", images: [] }),
    (e) => e.code === "IMAGE_REQUIRED",
  );
});
test("OAuth source is read only and expired/API-key credentials are not accepted", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qinban-auth-"));
  try {
    await mkdir(join(dir, ".codex"), { recursive: true });
    const token =
      "header." +
      Buffer.from(
        JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      ).toString("base64url") +
      ".signature";
    const path = join(dir, ".codex/auth.json");
    const saved = JSON.stringify({
      auth_mode: "chatgpt",
      tokens: { access_token: token },
    });
    await writeFile(path, saved);
    const result = await sharedCredential({
      baseHome: dir,
      codexHome: join(dir, ".codex"),
    });
    assert.equal(result.source, "本机 Codex 登录");
    assert.equal(await readFile(path, "utf8"), saved);
    await writeFile(
      path,
      JSON.stringify({ auth_mode: "apikey", tokens: { access_token: token } }),
    );
    await assert.rejects(
      () => sharedCredential({ baseHome: dir, codexHome: join(dir, ".codex") }),
      (e) => e.code === "PI_NOT_CONNECTED",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("settings protect key, empty input preserves it, and explicit clear removes backup copy", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qinban-settings-"));
  const path = join(dir, ".local/settings.json");
  const store = createSettingsStore(path);
  try {
    const status = await store.update({
      deepseekApiKey: "private-test-api-key",
    });
    assert.equal(status.deepseekConfigured, true);
    assert.ok(!JSON.stringify(status).includes("private-test-api-key"));
    await store.update({ deepseekApiKey: "" });
    assert.equal((await store.read()).deepseekApiKey, "private-test-api-key");
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal((await stat(join(dir, ".local"))).mode & 0o777, 0o700);
    await store.update({ clearDeepseekApiKey: true });
    assert.equal((await store.read()).deepseekApiKey, undefined);
    assert.ok(
      !(await readFile(path + ".bak", "utf8")).includes("private-test-api-key"),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("stale saved model settings cannot change the fixed score-recognition model", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qinban-fixed-model-")),
    path = join(dir, "settings.json"),
    store = createSettingsStore(path);
  try {
    await writeFile(
      path,
      JSON.stringify({
        piModel: "old-model",
        deepseekApiKey: "private-test-key",
      }),
    );
    assert.equal(store.summarize(await store.read()).piModel, "gpt-6.1-sol");
    assert.equal(store.summarize({}).piReasoningEffort, "high");
    await assert.rejects(
      store.update({ piModel: "old-model" }),
      (e) => e.code === "FIXED_RECOGNITION_MODEL",
    );
    await store.update({ piModel: "gpt-6.1-sol" });
    assert.equal((await store.read()).deepseekApiKey, "private-test-key");
    assert.equal(
      JSON.parse(await readFile(path + ".bak", "utf8")).piModel,
      "old-model",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("public music catalog resolves real filenames and refuses arbitrary upstream URLs", async () => {
  const result = searchPublicScores("致爱丽丝");
  assert.ok(result.results.length);
  assert.ok(result.results[0].path.endsWith(".mxl"));
  await assert.rejects(
    () => downloadPublicScore("https://evil.example/private"),
    (e) => e.code === "PUBLIC_SCORE_NOT_ALLOWED",
  );
  const score = await downloadPublicScore(result.results[0].path, {
    fetchImpl: async (url, options) => {
      assert.ok(
        url.startsWith(
          "https://raw.githubusercontent.com/musetrainer/library/master/scores/",
        ),
      );
      assert.equal(options.redirect, "error");
      return new Response(new Uint8Array([80, 75, 3, 4]));
    },
  });
  assert.equal(score.buffer.length, 4);
});
test("upstream errors cannot expose tokens, file paths or arbitrary API bodies", () => {
  assert.equal(
    publicError(new Error("Bearer private-token, /Users/sensitive, sk-secret")),
    "本次请求未完成。请检查输入并重试。",
  );
  assert.match(publicError(new Error("HTTP 401 bearer secret")), /登录已失效/);
});
