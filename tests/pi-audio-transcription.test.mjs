import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { convertResponsesMessages } from "@earendil-works/pi-ai/api/openai-responses-shared";
import { models, provider } from "../lib/auth.mjs";
import {
  createPiMediaInspector,
  directMediaCapability,
  inspectMediaSource,
  normalizeMediaShare,
} from "../lib/pi-media-source.mjs";
import { createAppServer } from "../server.mjs";
import { boot, until } from "./app-harness.mjs";

const shared = "我分享了一首歌：https://music.163.com/#/song?id=1857099391";

test("Pi receives the original share text and its request remains pinned to Sol high", async () => {
  let promptSeen, sourceSeen, modelOptions;
  const modelsImpl = {
    getModel: (_provider, id) => ({ id }),
    streamSimple(model, _context, options) {
      modelOptions = options;
      options.onPayload({
        model: model.id,
        reasoning: { effort: options.reasoning },
      });
    },
  };
  const inspect = createPiMediaInspector({
    modelsImpl,
    credentialReader: async () => {},
    verified: () => {},
    sourceInspector: async (share) => {
      sourceSeen = share;
      return {
        kind: "netease",
        found: true,
        songId: "1857099391",
        message: "来源已找到。",
      };
    },
    agentFactory: (options) => ({
      abort() {},
      async prompt(message) {
        promptSeen = message;
        options.streamFn(options.initialState.model, {}, {});
        await options.initialState.tools[0].execute();
      },
    }),
  });
  const result = await inspect({ share: shared });
  assert.equal(promptSeen.content[0].text, shared);
  assert.equal(sourceSeen, shared);
  assert.equal(modelOptions.reasoning, "high");
  assert.equal(result.source.songId, "1857099391");
  assert.deepEqual(result.requestAudit, [
    { model: "gpt-6.1-sol", reasoningEffort: "high" },
  ]);
  assert.equal(result.supported, false);
  assert.match(result.message, /无法识别音符/);
  assert.equal(result.score, undefined);
});

test("NetEase lookup uses only the normal playback API and never exposes cookies or signed URLs", async () => {
  let request;
  const result = await inspectMediaSource(shared, {
    neteaseSession: {
      read: async () => ({ cookie: { MUSIC_U: "private-cookie" } }),
    },
    neteaseSdk: async (method, input) => {
      request = { method, input };
      return {
        body: {
          data: [
            {
              id: 1857099391,
              url: "https://audio.example.com/song.mp3?signature=private",
              freeTrialInfo: null,
            },
          ],
        },
      };
    },
  });
  assert.equal(request.method, "song_url_v1");
  assert.equal(request.input.level, "standard");
  assert.equal(request.input.unblock, undefined);
  assert.equal(request.input.cookie.MUSIC_U, "private-cookie");
  assert.equal(result.kind, "netease");
  assert.equal(result.found, true);
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.ok(!JSON.stringify(result).includes("audio.example.com"));
});

test("NetEase availability does not disguise a preview or a missing URL as a full song", async () => {
  const inspect = (track) =>
    inspectMediaSource(shared, {
      neteaseSession: { read: async () => ({}) },
      neteaseSdk: async () => ({ body: { data: [track] } }),
    });
  const preview = await inspect({
    id: 1857099391,
    url: "https://audio.example.com/sample.mp3",
    freeTrialInfo: { start: 0, end: 30 },
  });
  assert.equal(preview.previewOnly, true);
  assert.match(preview.message, /试听/);
  const unavailable = await inspect({ id: 1857099391, url: null });
  assert.equal(unavailable.found, false);
  assert.match(unavailable.message, /没有返回/);
});

test("NetEase short links resolve with headers only and retain the song fragment", async () => {
  let method;
  const result = await inspectMediaSource("https://163cn.tv/example", {
    fetcher: async (_url, options) => {
      method = options.method;
      options.onRedirect("https://music.163.com/#/song?id=1857099391");
      return {
        url: "https://music.163.com/",
        headers: {},
        buffer: Buffer.alloc(0),
      };
    },
    neteaseSession: { read: async () => ({}) },
    neteaseSdk: async () => ({
      body: {
        data: [{ id: 1857099391, url: "https://audio.example.com/a.mp3" }],
      },
    }),
  });
  assert.equal(method, "HEAD");
  assert.equal(result.songId, "1857099391");
  assert.equal(result.found, true);
});

test("direct media lookup reads only HTTP headers and refuses private URLs", async () => {
  const calls = [];
  const source = await inspectMediaSource("https://example.com/file.mp3", {
    fetcher: async (url, options) => {
      calls.push({ url, method: options.method });
      return {
        url,
        headers: { "content-type": "audio/mpeg", "content-length": "30000000" },
        buffer: Buffer.alloc(0),
      };
    },
  });
  assert.deepEqual(
    calls.map((item) => item.method),
    ["HEAD"],
  );
  assert.equal(source.found, true);
  assert.throws(
    () => normalizeMediaShare("http://127.0.0.1/test.mp3"),
    (error) => error.code === "UNSAFE_URL",
  );
});

test("audio parts are not supported by the current Pi transport and are not submitted as images", () => {
  const model = models.getModel(provider, "gpt-6.1-sol");
  assert.deepEqual(model.input, ["text", "image"]);
  // Verify the actual SDK behavior: an unsupported audio part is incorrectly
  // encoded as an image, so sending it would not test native audio recognition.
  const payload = convertResponsesMessages(
    model,
    {
      messages: [
        {
          role: "user",
          content: [{ type: "audio", mimeType: "audio/wav", data: "UklGRg==" }],
          timestamp: 1,
        },
      ],
    },
    new Set([provider]),
  );
  assert.equal(payload[0].content[0].type, "input_image");
  const capability = directMediaCapability();
  assert.equal(capability.supported, false);
  assert.match(capability.message, /文件未上传/);
});

test("Pi lookup cannot return an unaudited result or ignore a cancellation", async () => {
  const inspect = createPiMediaInspector({
    modelsImpl: { getModel: () => ({ id: "gpt-6.1-sol" }) },
    credentialReader: async () => {},
    sourceInspector: async () => ({ found: true }),
    agentFactory: (options) => ({
      abort() {},
      async prompt() {
        await options.initialState.tools[0].execute();
      },
    }),
  });
  await assert.rejects(
    inspect({ share: shared }),
    (error) => error.code === "AUDIO_MODEL_UNVERIFIED",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    inspect({ share: shared }, { signal: controller.signal }),
    { name: "AbortError" },
  );
});

test("local routes guard access and reject the old spectral-transcription path", async (t) => {
  let seen;
  const server = createAppServer({
    statusReader: async () => ({ available: true }),
    mediaInspector: async (input) => {
      seen = input.share;
      return { source: { found: false }, provider: "pi" };
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}`;
  const status = await fetch(url + "/api/status");
  const cookie = status.headers.get("set-cookie").split(";")[0],
    data = await status.json();
  const headers = {
    "content-type": "application/json",
    "x-csrf-token": data.csrfToken,
    cookie,
    origin: url,
  };
  assert.equal(
    (
      await fetch(url + "/api/audio/inspect-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
  const response = await fetch(url + "/api/audio/inspect-link", {
    method: "POST",
    headers,
    body: JSON.stringify({ share: shared }),
  });
  assert.equal(response.status, 200);
  assert.equal(seen, shared);
  for (const path of ["source", "decode", "transcribe"]) {
    const old = await fetch(url + "/api/audio/" + path, {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(old.status, 410);
    assert.equal((await old.json()).code, "AUDIO_SPECTRUM_DISABLED");
  }
});

test("audio workspace lets users paste a link and file check sends metadata only", async (t) => {
  const { w, doc } = await boot(t);
  doc.querySelector('[data-nav="audio"]').click();
  assert.ok(doc.querySelector("#audio-link"));
  assert.match(
    doc.querySelector(".audio-page").textContent,
    /不会提取或发送频谱/,
  );
  const input = doc.querySelector("#audio-input");
  Object.defineProperty(input, "files", {
    value: [
      new w.File(["private-audio-bytes"], "example.mp3", {
        type: "audio/mpeg",
      }),
    ],
  });
  input.dispatchEvent(new w.Event("change"));
  let requestBody;
  w.fetch = async (path, options) => {
    if (String(path).endsWith("/api/audio/direct-capability")) {
      requestBody = JSON.parse(options.body);
      return Response.json(directMediaCapability());
    }
    return Response.json({ records: [], warnings: [] });
  };
  doc.querySelector("#check-direct-media").click();
  await until(() => requestBody, "direct capability request");
  await until(
    () =>
      doc
        .querySelector(".audio-output-empty")
        ?.textContent.includes("文件未上传"),
    "clear direct-input limitation",
  );
  assert.deepEqual(Object.keys(requestBody).sort(), ["name", "size", "type"]);
  assert.ok(!JSON.stringify(requestBody).includes("private-audio-bytes"));
});
