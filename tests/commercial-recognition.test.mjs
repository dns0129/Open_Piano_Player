import { withWrittenFixture } from "./helpers/written-recognition-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { createHostedRuntime } from "../lib/accounts/runtime.mjs";
import {
  createHostedRecognitionProvider,
  normalizeProviderUsage,
  pricedUsage,
  decodeHostedRegion,
} from "../lib/accounts/recognition-provider.mjs";
import { sha } from "../lib/accounts/common.mjs";
import { BILLING_VERSION } from "../lib/accounts/subscription-catalog.mjs";
import {
  createRecognitionBudget,
  utcPeriod,
} from "../lib/accounts/recognition-budget.mjs";

const key = () => randomUUID(),
  raw = () =>
    withWrittenFixture({
      complete: true,
      meter: [4, 4],
      key: 0,
      bpm: 0,
      bars: [4],
      notes: [
        [60, 0, 4, 1],
        [48, 0, 4, -1],
      ],
      rests: [],
      in: [],
      out: [],
      ties: [],
      graces: [],
      warnings: [],
    });
function provider(read) {
  const calls = [];
  return {
    calls,
    ready: true,
    model: "fixture-vision",
    async quote() {
      return {
        reserved: 1000,
        rates: { inputRate: 1, outputRate: 1 },
        inputBound: 100,
        maxOutputTokens: 900,
      };
    },
    async read(request, quote, options) {
      calls.push(request);
      if (read) return read(request, quote, options);
      return {
        status: "completed",
        text: JSON.stringify(raw()),
        usage: { input: 10, output: 20, totalTokens: 30 },
        model: "fixture-vision",
      };
    },
  };
}
async function fixture(t, p = provider()) {
  const directory = await mkdtemp(join(tmpdir(), "qinban-commercial-")),
    mail = [],
    r = await createHostedRuntime({
      directory,
      recognitionProvider: p,
      mailer: async (m) => mail.push(m),
    });
  t.after(async () => {
    await r.close();
    await rm(directory, { recursive: true, force: true });
  });
  async function login(email, operator = false) {
    if (operator) await r.identity.bootstrapOperator(email);
    else await r.identity.invite(email);
    const nonce = key() + key(),
      c = await r.identity.code({ email, nonce });
    return r.identity.verify({
      challengeId: c.challengeId,
      code: mail.find((m) => m.challengeId === c.challengeId).code,
      nonce,
    });
  }
  const A = await login("customer-a@example.test"),
    B = await login("customer-b@example.test"),
    O = await login("operator@example.test", true);
  async function policy(values = {}) {
    const current = (await r.operations.overview(O.session)).policy;
    return r.operations.policy(O.session, {
      ...current,
      enabled: true,
      dailyCap: 100000,
      monthlyCap: 1000000,
      jobCap: 50000,
      defaultTaskLimit: 5,
      maxActive: 1,
      reason: "隔离测试的运营配置",
      ...values,
    });
  }
  await policy();
  async function upload(owner, bytes, mimeType, name) {
    const hash = sha(bytes),
      u = await r.library.stage(
        owner,
        {
          name,
          mimeType,
          sha256: hash,
          bytes: bytes.length,
          purpose: "source",
        },
        key(),
      );
    await r.library.receive(owner, u.uploadId, bytes);
    return r.library.complete(owner, u.uploadId, { sha256: hash }, key());
  }
  async function group(user) {
    const bytes = await sharp({
        create: { width: 240, height: 160, channels: 3, background: "#faf5ee" },
      })
        .png()
        .toBuffer(),
      x = await upload(user.session.userId, bytes, "image/png", "原图.png");
    return r.library.sourceGroup(
      user.session.userId,
      {
        kind: "images",
        pages: [
          { ordinal: 1, scope: "excerpt", originalResourceId: x.resourceId },
        ],
      },
      key(),
    );
  }
  const G = await group(A),
    H = await group(B);
  const input = (g) => ({
    sourceGroupId: g.sourceGroupId,
    title: "测试选定谱行",
    pointQuote: { version: BILLING_VERSION, points: 5 },
    fallbackTempo: 80,
    scopeConfirmed: true,
    regions: [{ page: 1, rect: { x: 0, y: 0, width: 1, height: 1 } }],
  });
  return { ...r, A, B, O, G, H, p, policy, upload, input };
}
// Generous: the suite runs files in parallel and a loaded machine slows the job pump.
async function until(fn) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const r = await fn();
    if (r) return r;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw Error("Timed out waiting for deterministic fixture job");
}
test("hosted P0 repair is budgeted once and keeps original tempo and failed submission evidence", async (t) => {
  let count = 0;
  const p = provider(async (request) => {
    const wire = raw();
    if (++count === 1) wire.notes[0][2] = 3;
    else assert.ok(request.repair.issues.some((i) => i.code === "RHYTHM_GAP"));
    return {
      status: "completed",
      text: JSON.stringify(wire),
      usage: { input: 10, output: 20, totalTokens: 30 },
      model: "fixture-vision",
    };
  });
  const f = await fixture(t, p),
    owner = f.A.session.userId,
    j = await f.recognition.create(owner, f.input(f.G), key());
  await f.recognition.start();
  await until(async () => {
    const x = await f.recognition.get(owner, j.jobId);
    assert.notEqual(x.state, "failed", JSON.stringify(x.regions));
    return x.state === "needs_review" && x;
  });
  assert.equal(count, 2);
  const row = await f.db.private(
    owner,
    async (tx) =>
      (
        await tx.query(
          "SELECT result FROM qinban_private.recognition_regions WHERE owner_id=$1 AND job_id=$2",
          [owner, j.jobId],
        )
      ).rows[0],
  );
  assert.equal(row.result.submissionAudit.length, 2);
  assert.equal(
    JSON.parse(row.result.submissionAudit[0].rawText).notes[0][2],
    3,
  );
  assert.equal(row.result.score.tempoEvidence.rawBpm, 0);
  assert.equal(row.result.score.tempoEvidence.sourceBpm, null);
  assert.equal(
    (await f.operations.overview(f.O.session)).budget.dayCommitted,
    60,
  );
});
test("hosted invalid JSON stops after one repair and retains failed evidence without breaking task reads", async (t) => {
  const p = provider(async () => ({
    status: "completed",
    text: "invalid json",
    usage: { input: 10, output: 20, totalTokens: 30 },
    model: "fixture-vision",
  }));
  const f = await fixture(t, p),
    owner = f.A.session.userId,
    j = await f.recognition.create(owner, f.input(f.G), key());
  await f.recognition.start();
  const done = await until(async () => {
    const x = await f.recognition.get(owner, j.jobId);
    return x.state === "failed" && x;
  });
  assert.equal(p.calls.length, 2, JSON.stringify(done.regions));
  assert.equal(done.canSave, false);
  assert.equal(done.regions[0].notes, 0);
  const row = await f.db.private(
    owner,
    async (tx) =>
      (
        await tx.query(
          "SELECT result FROM qinban_private.recognition_regions WHERE owner_id=$1 AND job_id=$2",
          [owner, j.jobId],
        )
      ).rows[0],
  );
  assert.equal(row.result.submissionAudit.length, 2);
  assert.equal(row.result.submissionAudit[0].rawText, "invalid json");
});
test("hosted task lifecycle retains originals, quota and a playable private draft", async (t) => {
  const f = await fixture(t),
    owner = f.A.session.userId,
    job = await f.recognition.create(owner, f.input(f.G), key());
  assert.equal((await f.recognition.budget.quota(owner)).remaining, 25);
  await assert.rejects(
    f.recognition.get(f.B.session.userId, job.jobId),
    (e) => e.status === 404,
  );
  await assert.rejects(
    f.recognition.create(owner, f.input(f.H), key()),
    (e) => e.status === 404,
  );
  await f.recognition.start();
  const done = await until(async () => {
    const j = await f.recognition.get(owner, job.jobId);
    return j.state === "needs_review" && j;
  });
  assert.equal(done.canSave, true);
  assert.equal(f.p.calls.length, 1);
  const saved = await f.recognition.save(owner, job.jobId, key()),
    again = await f.recognition.save(owner, job.jobId, key());
  assert.equal(again.entryId, saved.entryId);
  const entry = await f.library.read(owner, saved.entryId);
  assert.equal(entry.document.tempo, 80);
  assert.equal(entry.document.notes.length, 2);
  assert.equal(entry.reviewStatus.humanConfirmed, false);
  assert.equal(entry.sourceGroupIds[0], f.G.sourceGroupId);
  assert.ok(entry.warnings.some((s) => s.includes("未完成人工")));
  assert.equal(
    (await f.operations.overview(f.O.session)).budget.dayCommitted,
    30,
  );
  assert.equal(done.billing.charged, 5);
  assert.equal(
    (
      await f.operations.refund(f.O.session, job.jobId, {
        reason: "核对原谱后补偿错识",
      })
    ).refundedPoints,
    5,
  );
  assert.equal(
    (
      await f.operations.refund(f.O.session, job.jobId, {
        reason: "重发相同补偿请求",
      })
    ).refundedPoints,
    0,
  );
  assert.equal((await f.recognition.budget.quota(owner)).remaining, 30);
  assert.equal(
    (await f.operations.audit(f.O.session)).events.filter(
      (e) => e.action === "points.refund",
    ).length,
    1,
  );
});
test("queued cancellation refunds task slot and failed rows alone are retried", async (t) => {
  let n = 0;
  const p = provider(async () => ({
      status: "completed",
      text: JSON.stringify(++n === 1 ? { complete: false } : raw()),
      usage: { input: 10, output: 20 },
      model: "fixture-vision",
    })),
    f = await fixture(t, p),
    owner = f.A.session.userId;
  const q = await f.recognition.create(owner, f.input(f.G), key());
  await f.recognition.cancel(owner, q.jobId, key());
  assert.equal((await f.recognition.budget.quota(owner)).remaining, 30);
  assert.equal(p.calls.length, 0);
  const input = {
      ...f.input(f.G),
      recognitionPlan: { recover: false },
      pointQuote: { version: BILLING_VERSION, points: 10 },
      regions: [
        { page: 1, rect: { x: 0, y: 0, width: 1, height: 0.5 } },
        { page: 1, rect: { x: 0, y: 0.5, width: 1, height: 0.5 } },
      ],
    },
    j = await f.recognition.create(owner, input, key());
  await f.recognition.start();
  const partial = await until(async () => {
    const r = await f.recognition.get(owner, j.jobId);
    return r.state === "partial" && r;
  });
  assert.equal(partial.progress.complete, 1);
  assert.equal(partial.canSave, false);
  await assert.rejects(
    f.recognition.save(owner, j.jobId, key()),
    (e) => e.code === "RECOGNITION_NOT_READY",
  );
  const retry = await f.recognition.retry(owner, j.jobId, key(), {
    pointQuote: { version: BILLING_VERSION, points: 5 },
  });
  await until(
    async () =>
      (await f.recognition.get(owner, retry.jobId)).state === "needs_review",
  );
  assert.equal(
    p.calls.length,
    3,
    "second job reads only failed row, not the previous success",
  );
  assert.equal((await f.recognition.budget.quota(owner)).remaining, 20);
});
test("concurrent owners cannot oversubscribe global reservations", async (t) => {
  let release;
  const wait = new Promise((r) => (release = r)),
    p = provider(async () => {
      await wait;
      return {
        status: "completed",
        text: JSON.stringify(raw()),
        usage: { input: 10, output: 20 },
        model: "fixture-vision",
      };
    }),
    f = await fixture(t, p);
  // A failed wait must not leave the held provider call blocking fixture shutdown.
  try {
    await f.policy({
      dailyCap: 1500,
      monthlyCap: 3000,
      jobCap: 1500,
      maxActive: 2,
    });
    const a = await f.recognition.create(
        f.A.session.userId,
        f.input(f.G),
        key(),
      ),
      b = await f.recognition.create(f.B.session.userId, f.input(f.H), key());
    await f.recognition.start();
    await until(
      async () =>
        p.calls.length === 1 &&
        (await f.recognition.get(f.B.session.userId, b.jobId)).state ===
          "failed",
    );
    assert.equal(
      (await f.operations.overview(f.O.session)).budget.dayCommitted,
      1000,
    );
    assert.equal(
      (await f.recognition.budget.quota(f.B.session.userId)).remaining,
      30,
    );
    release();
    await until(
      async () =>
        (await f.recognition.get(f.A.session.userId, a.jobId)).state ===
        "needs_review",
    );
    assert.equal(p.calls.length, 1);
  } finally {
    release();
  }
});
test("uncertain calls retain budget, block new work and require audited operator reconciliation", async (t) => {
  const p = provider(
      async (_r, _q, { signal }) =>
        new Promise((_, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(Error("lost response")),
            { once: true },
          ),
        ),
    ),
    f = await fixture(t, p),
    owner = f.A.session.userId,
    j = await f.recognition.create(owner, f.input(f.G), key());
  await f.recognition.start();
  await until(() => p.calls.length === 1);
  await f.recognition.cancel(owner, j.jobId, key());
  await until(
    async () => (await f.recognition.get(owner, j.jobId)).state === "cancelled",
  );
  const overview = await f.operations.overview(f.O.session);
  assert.equal(overview.budget.unknown, 1);
  assert.equal(overview.budget.dayCommitted, 1000);
  assert.equal((await f.recognition.budget.quota(owner)).remaining, 30);
  await assert.rejects(
    f.recognition.create(f.B.session.userId, f.input(f.H), key()),
    (e) => e.code === "RECOGNITION_UNAVAILABLE",
  );
  await assert.rejects(f.policy(), (e) => e.code === "USAGE_REVIEW_REQUIRED");
  await assert.rejects(
    f.operations.resolve(f.A.session, overview.attempts[0].id, {
      cost: 40,
      reason: "not allowed",
    }),
    (e) => e.status === 403,
  );
  await f.operations.resolve(f.O.session, overview.attempts[0].id, {
    cost: 40,
    reason: "已核对模拟供应商记录",
  });
  await f.policy();
  assert.equal(
    (await f.operations.overview(f.O.session)).budget.dayCommitted,
    40,
  );
  await f.operations.refund(f.O.session, j.jobId, {
    reason: "人工补偿失败任务",
  });
  await f.operations.refund(f.O.session, j.jobId, {
    reason: "重复提交同一补偿",
  });
  assert.equal((await f.recognition.budget.quota(owner)).remaining, 30);
  assert.equal(
    (await f.operations.audit(f.O.session)).events.filter(
      (e) => e.action === "points.refund",
    ).length,
    0,
  );
});
test("a stale dispatch is marked uncertain without another provider call", async (t) => {
  const f = await fixture(t),
    owner = f.A.session.userId,
    j = await f.recognition.create(owner, f.input(f.G), key()),
    worker = key();
  await f.db.private(owner, async (tx) => {
    await tx.query(
      "UPDATE qinban_control.job_index SET state='running',worker_id=$1,lease_until=$2 WHERE id=$3",
      [worker, new Date(Date.now() - 1000).toISOString(), j.jobId],
    );
    await f.recognition.budget.reserve(
      tx,
      owner,
      j.jobId,
      "region-1",
      await f.p.quote(),
      worker,
    );
    await tx.query(
      "UPDATE qinban_private.recognition_regions SET state='calling' WHERE job_id=$1 AND owner_id=$2",
      [j.jobId, owner],
    );
  });
  await f.recognition.recover();
  assert.equal((await f.recognition.get(owner, j.jobId)).state, "interrupted");
  assert.equal((await f.operations.overview(f.O.session)).budget.unknown, 1);
  await f.recognition.start();
  assert.equal(f.p.calls.length, 0);
});
test("unverified provider model or reasoning retains the full reservation and never reaches draft saving", async (t) => {
  const observation = {
      model: "unexpected-model",
      effort: "low",
      usage: { input: 10, output: 20 },
    },
    p = provider(async () => ({
      status: "completed",
      text: JSON.stringify(raw()),
      usage: null,
      model: "unexpected-model",
      reasoningEffort: "low",
      protocolVerified: false,
      observation,
    })),
    f = await fixture(t, p),
    owner = f.A.session.userId,
    j = await f.recognition.create(owner, f.input(f.G), key());
  await f.recognition.start();
  const done = await until(async () => {
    const x = await f.recognition.get(owner, j.jobId);
    return x.state === "failed" && x;
  });
  assert.equal(done.canSave, false);
  assert.equal(done.regions[0].errorCode, "PROVIDER_PROTOCOL_MISMATCH");
  const o = await f.operations.overview(f.O.session);
  assert.equal(o.budget.unknown, 1);
  assert.equal(o.budget.dayCommitted, 1000);
  assert.deepEqual(o.attempts[0].usage.observation, observation);
  assert.equal((await f.recognition.budget.quota(owner)).remaining, 30);
  assert.equal(p.calls.length, 1);
});
test("PDF preview and crop are server rendered while the source bytes remain unchanged", async (t) => {
  const f = await fixture(t),
    owner = f.A.session.userId,
    pdf = await PDFDocument.create();
  pdf.addPage([240, 360]);
  pdf.addPage([240, 360]);
  const bytes = Buffer.from(await pdf.save()),
    r = await f.upload(owner, bytes, "application/pdf", "source.pdf"),
    g = await f.library.sourceGroup(
      owner,
      {
        kind: "pdf",
        pages: [1, 2].map((ordinal) => ({
          ordinal,
          scope: "full_page",
          originalResourceId: r.resourceId,
        })),
      },
      key(),
    );
  const pages = await f.recognition.sources.pages(owner, g.sourceGroupId);
  assert.equal(pages.pages.length, 2);
  assert.equal(pages.pages[0].width, 480);
  const crop = await f.recognition.sources.crop(owner, g.sourceGroupId, {
    page: 2,
    rect: { x: 0, y: 0, width: 1, height: 0.5 },
  });
  assert.equal((await sharp(crop.bytes).metadata()).height, 360);
  assert.deepEqual(
    (await f.library.readResource(owner, r.resourceId)).bytes,
    bytes,
  );
});
test("feedback, suspension, quota adjustment and operator promotion respect account roles", async (t) => {
  const f = await fixture(t),
    a = f.A.session,
    b = f.B.session,
    o = f.O.session;
  assert.equal(o.isOperator, true);
  await assert.rejects(f.operations.users(a), (e) => e.status === 403);
  const posted = await f.operations.submitFeedback(
    a.userId,
    { category: "practice", message: "手机练习定位问题" },
    key(),
  );
  assert.equal((await f.operations.mine(b.userId)).feedback.length, 0);
  await f.operations.reply(o, posted.feedbackId, {
    state: "resolved",
    reply: "已记录处理结果",
  });
  assert.equal(
    (await f.operations.mine(a.userId)).feedback[0].reply,
    "已记录处理结果",
  );
  await f.operations.user(o, a.userId, {
    state: "disabled",
    taskLimit: 8,
    reason: "隔离测试暂停账号",
  });
  await assert.rejects(f.identity.session(f.A.token), (e) => e.status === 401);
  assert.equal(
    (
      await f.db.control((tx) =>
        tx.query(
          "SELECT task_limit FROM qinban_control.entitlements WHERE owner_id=$1",
          [a.userId],
        ),
      )
    ).rows[0].task_limit,
    8,
  );
  await assert.rejects(
    f.operations.user(o, o.userId, {
      state: "disabled",
      taskLimit: 1,
      reason: "self disable",
    }),
    (e) => e.code === "SELF_DISABLE",
  );
});
test("point admission is idempotent and keeps active-owner limits while legacy budgets retain UTC month resets", async (t) => {
  const f = await fixture(t),
    owner = f.A.session.userId;
  await f.policy({ defaultTaskLimit: 1 });
  const input = f.input(f.G),
    operation = key(),
    j = await f.recognition.create(owner, input, operation),
    repeated = await f.recognition.create(owner, input, operation);
  assert.equal(repeated.jobId, j.jobId);
  assert.equal((await f.recognition.budget.quota(owner)).remaining, 25);
  await assert.rejects(
    f.recognition.create(owner, input, key()),
    (e) => e.code === "TASK_ACTIVE",
  );
  const next = new Date();
  next.setUTCMonth(next.getUTCMonth() + 1, 1);
  const b = createRecognitionBudget({
      db: f.db,
      provider: f.p,
      now: () => next.getTime(),
    }),
    q = await b.quota(owner);
  assert.equal(q.period, utcPeriod(next));
  assert.equal(q.used, 0);
  assert.equal(q.remaining, 1);
  const endOfMonth = new Date("2026-12-31T23:59:59Z"),
    yearBoundary = createRecognitionBudget({
      db: f.db,
      provider: f.p,
      now: () => endOfMonth.getTime(),
    });
  assert.equal(
    (await yearBoundary.quota(owner)).resetAt,
    "2027-01-01T00:00:00.000Z",
  );
});
test("maintenance preserves live task sources and crops until their references expire", async (t) => {
  const f = await fixture(t),
    owner = f.A.session.userId,
    j = await f.recognition.create(owner, f.input(f.G), key());
  await f.recognition.start();
  const done = await until(async () => {
    const x = await f.recognition.get(owner, j.jobId);
    return x.state === "needs_review" && x;
  });
  const crop = done.regions[0].cropResourceId,
    old = new Date(Date.now() - 3 * 86400000).toISOString();
  await f.db.private(owner, async (tx) => {
    await tx.query(
      "UPDATE qinban_private.source_groups SET pinned=false,created_at=$1 WHERE owner_id=$2 AND id=$3",
      [old, owner, f.G.sourceGroupId],
    );
    await tx.query(
      "UPDATE qinban_private.resources SET created_at=$1 WHERE owner_id=$2",
      [old, owner],
    );
    await tx.query(
      "UPDATE qinban_private.uploads SET expires_at=$1 WHERE owner_id=$2",
      [old, owner],
    );
  });
  await f.cleanup();
  assert.ok(await f.library.readGroup(owner, f.G.sourceGroupId));
  assert.ok((await f.library.readResource(owner, crop)).bytes.length);
  await assert.rejects(
    f.library.removeGroup(owner, f.G.sourceGroupId, key()),
    (e) => e.code === "SOURCE_IN_USE",
  );
  await f.recognition.save(owner, j.jobId, key());
  await f.db.private(owner, (tx) =>
    tx.query(
      "UPDATE qinban_private.recognition_jobs SET created_at=$1 WHERE owner_id=$2 AND id=$3",
      [new Date(Date.now() - 61 * 86400000).toISOString(), owner, j.jobId],
    ),
  );
  await f.cleanup();
  await assert.rejects(
    f.recognition.get(owner, j.jobId),
    (e) => e.status === 404,
  );
  assert.ok(await f.library.readGroup(owner, f.G.sourceGroupId));
  assert.ok((await f.library.readResource(owner, crop)).bytes.length);
});
test("Responses adapter pins credentials, no retries, token bounds and full usage accounting", async () => {
  const requests = [],
    p = createHostedRecognitionProvider({
      config: {
        key: "synthetic-server-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-6.1-sol",
        inputRate: 1,
        outputRate: 2,
        maxInputTokens: 250000,
        maxOutputTokens: 60000,
      },
      fetchImpl: async (url, options) => {
        requests.push({ url, options, body: JSON.parse(options.body) });
        return new Response(
          JSON.stringify(
            url.endsWith("input_tokens")
              ? { input_tokens: 100 }
              : {
                  status: "completed",
                  model: "gpt-6.1-sol",
                  reasoning: { effort: "high" },
                  usage: {
                    input_tokens: 100,
                    output_tokens: 50,
                    output_tokens_details: { reasoning_tokens: 40 },
                  },
                  output: [
                    {
                      type: "message",
                      content: [
                        { type: "output_text", text: JSON.stringify(raw()) },
                      ],
                    },
                  ],
                },
          ),
        );
      },
    }),
    req = {
      metadata: { title: "test", fallbackTempo: 88 },
      region: {
        page: 1,
        system: 1,
        image: { mimeType: "image/png", data: "AA==" },
      },
    };
  const quote = await p.quote(req),
    r = await p.read(req, quote, {});
  assert.equal(requests.length, 2);
  assert.equal(requests[1].body.reasoning.effort, "high");
  assert.equal(requests[1].body.max_output_tokens, 60000);
  assert.equal(requests[1].body.store, false);
  assert.equal(requests[1].body.model, "gpt-6.1-sol");
  assert.equal(
    pricedUsage(r.usage, quote.rates),
    200,
    "reasoning is already in output, no double counting",
  );
  assert.equal(quote.reserved, 121144);
  assert.equal(normalizeProviderUsage({ input_tokens: 0 }), null);
  for (const [status, knownNotStarted] of [
    [400, true],
    [401, true],
    [403, true],
    [404, true],
    [405, true],
    [413, true],
    [415, true],
    [422, true],
    [429, true],
    [408, false],
    [409, false],
    [499, false],
    [500, false],
  ]) {
    let requests = 0;
    const rejection = createHostedRecognitionProvider({
      config: {
        key: "synthetic-server-key",
        baseUrl: "https://api.openai.com/v1",
        model: "fixture",
        inputRate: 1,
        outputRate: 1,
      },
      fetchImpl: async () => {
        requests++;
        return new Response("{}", { status });
      },
    });
    await assert.rejects(
      rejection.read(req, quote, {}),
      (e) => e.knownNotStarted === knownNotStarted,
    );
    assert.equal(requests, 1, "failed response is never retried automatically");
  }
  for (const observed of [
    { model: "unexpected", reasoning: { effort: "high" } },
    { model: "fixture", reasoning: { effort: "low" } },
    {},
  ]) {
    const adapter = createHostedRecognitionProvider({
        config: {
          key: "synthetic",
          baseUrl: "https://api.openai.com/v1",
          model: "fixture",
          inputRate: 1,
          outputRate: 1,
        },
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              status: "completed",
              usage: { input_tokens: 10, output_tokens: 20 },
              ...observed,
            }),
          ),
      }),
      unverified = await adapter.read(req, quote, {});
    assert.equal(unverified.protocolVerified, false);
    assert.equal(unverified.usage, null);
    assert.equal(unverified.observation.usage.output, 20);
    assert.throws(
      () => decodeHostedRegion(unverified, req),
      (e) => e.code === "PROVIDER_PROTOCOL_MISMATCH",
    );
  }
});

test("recognition requires the confirmed server point quote and insufficient points create no job", async (t) => {
  const f = await fixture(t),
    owner = f.A.session.userId,
    input = f.input(f.G);
  await assert.rejects(
    f.recognition.create(owner, { ...input, pointQuote: undefined }, key()),
    (e) => e.code === "POINT_QUOTE_REQUIRED",
  );
  await assert.rejects(
    f.recognition.create(
      owner,
      { ...input, pointQuote: { version: BILLING_VERSION, points: 1 } },
      key(),
    ),
    (e) => e.code === "POINT_QUOTE_REQUIRED",
  );
  const regions = Array.from({ length: 7 }, (_, i) => ({
    page: 1,
    rect: { x: 0, y: i / 7, width: 1, height: 1 / 7 },
  }));
  await assert.rejects(
    f.recognition.create(
      owner,
      {
        ...input,
        regions,
        pointQuote: { version: BILLING_VERSION, points: 35 },
      },
      key(),
    ),
    (e) => e.code === "POINTS_INSUFFICIENT",
  );
  assert.equal((await f.recognition.list(owner)).jobs.length, 0);
  assert.equal((await f.recognition.budget.quota(owner)).remaining, 30);
  assert.equal(f.p.calls.length, 0);
});
