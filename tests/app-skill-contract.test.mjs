import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateScoreRegion } from "../lib/ai.mjs";
import { generateDigitalRegion } from "../lib/digital-recognition.mjs";
import { withWrittenFixture } from "./helpers/written-recognition-fixture.mjs";
import {
  createHostedRecognitionProvider,
  decodeHostedRegion,
} from "../lib/accounts/recognition-provider.mjs";
import { RECOGNITION_VERSIONS } from "../lib/recognition-versions.mjs";

const region = {
  id: "source-contract-row",
  page: 1,
  system: 1,
  rect: { x: 0, y: 0, width: 100, height: 100 },
  image: {
    mimeType: "image/png",
    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P7sAAAAASUVORK5CYII=",
  },
};
function input(pass) {
  const raw = withWrittenFixture({
    complete: true,
    meter: [3, 4],
    meters: [
      [3, 4],
      [4, 4],
    ],
    key: 0,
    bpm: 90,
    bars: [3, 4],
    notes: [
      [60, 0, 3, 1, 0.2, 0.2, 0.7],
      [62, 3, 4, 1, 0.6, 0.2, 0.7],
      [72, 0, 3, -1, 0.2, 0.8, 0.7],
      [74, 3, 4, -1, 0.6, 0.8, 0.7],
    ],
    rests: [],
    in: [],
    out: [],
    ties: [],
    graces: [],
    warnings: [],
  });
  raw.notation.clefs = [
    raw.notation.clefs[0],
    { beat: 0, staff: 2, sign: "F", line: 4, octaveChange: 0, order: 0 },
    { beat: 0, staff: 2, sign: "G", line: 2, octaveChange: 0, order: 1 },
  ];
  if (pass === "verify") raw.notes = raw.notes.map((n) => n.slice(0, 4));
  return raw;
}
function assertPrompt(prompt) {
  assert.match(prompt, /Skill 1\.3\.3/u);
  assert.match(prompt, /meters/u);
  assert.match(prompt, /order/u);
  assert.match(prompt, /不能.*缩短.*范围/u);
  assert.match(prompt, /非活动.*休止/u);
}
test("the actual App local recognition request advertises Skill 1.3.3 source fields", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "app-skill-contract-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let captured;
  const result = await generateScoreRegion(
    { engine: "pi", metadata: { title: "Synthetic variable meter" }, region },
    {},
    {
      authenticate: async () => {},
      traceOptions: { path: join(directory, "usage.jsonl") },
      modelsImpl: {
        getModel: () => ({
          id: "gpt-6.1-sol",
          provider: "test",
          api: "test",
          input: ["image"],
        }),
        streamSimple(model, context, options) {
          captured = context;
          options.onPayload({ model: model.id, reasoning: { effort: "high" } });
          const message = {
            role: "assistant",
            model: model.id,
            provider: "test",
            api: "test",
            timestamp: Date.now(),
            stopReason: "toolUse",
            content: [
              {
                type: "toolCall",
                id: "fixture",
                name: "submit_score_region",
                arguments: input("recognize"),
              },
            ],
            usage: { input: 1, output: 1, totalTokens: 2 },
          };
          return {
            result: async () => message,
            async *[Symbol.asyncIterator]() {
              yield { type: "done", message };
            },
          };
        },
      },
    },
  );
  const system = captured.messages.find((m) => m.role === "system");
  assertPrompt(captured.systemPrompt || system.content);
  const schema = (captured.tools || system.toolsAdded).find(
    (t) => t.name === "submit_score_region",
  ).parameters;
  assert.ok(schema.properties.meters);
  assert.ok(schema.properties.notation.properties.clefs.items.properties.order);
  assert.equal(result.checks.passed, true);
  assert.deepEqual(result.coverage.measureTimeSignatures, [
    [3, 4],
    [4, 4],
  ]);
  assert.equal(result.requestAudit[0].reasoningEffort, "high");
  assert.equal(result.promptVersion, RECOGNITION_VERSIONS.prompt);
  assert.equal(result.wireFormat, "compact-v6");
});
test("the actual App independent digital reader carries the same source contract", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "app-digital-contract-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await generateDigitalRegion(
    { metadata: { title: "Synthetic variable meter" }, region },
    {
      authenticate: async () => {},
      traceOptions: { path: join(directory, "usage.jsonl") },
      modelsImpl: {
        getModel: () => ({ id: "gpt-6.1-sol", input: ["image"] }),
        streamSimple(model, context, options) {
          assertPrompt(context.systemPrompt);
          options.onPayload({ model: model.id, reasoning: { effort: "high" } });
          return {
            result: async () => ({
              content: [
                { type: "text", text: JSON.stringify(input("verify")) },
              ],
              stopReason: "stop",
              usage: { input: 1, output: 1, totalTokens: 2 },
            }),
          };
        },
      },
    },
  );
  assert.equal(result.checks.passed, true);
  assert.deepEqual(result.coverage.measureTimeSignatures, [
    [3, 4],
    [4, 4],
  ]);
});
test("hosted App quote and read use the same Skill 1.3.3 instructions and decoder", async () => {
  const payloads = [];
  const provider = createHostedRecognitionProvider({
    config: {
      key: "synthetic-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-6.1-sol",
      inputRate: 1,
      outputRate: 2,
      maxInputTokens: 250000,
      maxOutputTokens: 60000,
    },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      payloads.push(body);
      assertPrompt(body.instructions);
      return new Response(
        JSON.stringify(
          url.endsWith("input_tokens")
            ? { input_tokens: 100 }
            : {
                status: "completed",
                model: "gpt-6.1-sol",
                reasoning: { effort: "high" },
                usage: { input_tokens: 100, output_tokens: 10 },
                output: [
                  {
                    type: "message",
                    content: [
                      {
                        type: "output_text",
                        text: JSON.stringify(input("verify")),
                      },
                    ],
                  },
                ],
              },
        ),
      );
    },
  });
  const request = { metadata: { title: "Synthetic variable meter" }, region };
  const quote = await provider.quote(request),
    response = await provider.read(request, quote, {}),
    result = decodeHostedRegion(response, request);
  assert.equal(payloads[0].instructions, payloads[1].instructions);
  assert.equal(result.checks.passed, true);
  assert.deepEqual(result.coverage.measureTimeSignatures, [
    [3, 4],
    [4, 4],
  ]);
  assert.equal(result.promptVersion, RECOGNITION_VERSIONS.prompt);
});
