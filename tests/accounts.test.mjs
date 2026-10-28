import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, mkdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { createAccountDatabase } from "../lib/accounts/database.mjs";
import { createIdentity } from "../lib/accounts/identity.mjs";
import { createPrivateFiles } from "../lib/accounts/storage.mjs";
import { createPrivateLibrary } from "../lib/accounts/private-library.mjs";
import { createPrivateTransfers } from "../lib/accounts/transfers.mjs";
import { maintainAccounts } from "../lib/accounts/maintenance.mjs";
import { createHostedRuntime } from "../lib/accounts/runtime.mjs";
import { createHostedServer } from "../lib/accounts/http.mjs";
import { readScoreDocument } from "../lib/score-document.ts";
import { starterScore } from "../lib/starter-score.mjs";
import { createLibraryBackup } from "../lib/library-format.ts";
import { sha, digest } from "../lib/accounts/common.mjs";

const key = () => randomUUID(),
  codeReject = (e) => ["INVALID_CODE", "SESSION_REQUIRED"].includes(e.code);
test("account and private-library real PostgreSQL integration", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "qinban-accounts-")),
    db = await createAccountDatabase({ directory: join(dir, "postgres") }),
    mail = [];
  let clock = Date.now();
  const now = () => clock,
    files = createPrivateFiles(join(dir, "private-files")),
    identity = createIdentity({
      db,
      secret: "test-secret-".repeat(5),
      mailer: async (m) => mail.push(m),
      now,
    }),
    library = createPrivateLibrary({ db, files, now }),
    transfers = createPrivateTransfers({ db, files, library, now });
  t.after(async () => {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  });
  async function login(email) {
    await identity.invite(email);
    const nonce = key() + key(),
      c = await identity.code({ email, nonce });
    const sent = mail.find((m) => m.challengeId === c.challengeId);
    assert.ok(sent);
    return identity.verify({
      challengeId: c.challengeId,
      code: sent.code,
      nonce,
    });
  }
  const A = await login("teacher-a@example.test"),
    B = await login("teacher-b@example.test"),
    owner = A.session.userId,
    other = B.session.userId;
  const doc = readScoreDocument({
    ...starterScore,
    id: "私人中文曲谱",
    title: "测试私有曲目",
  });
  const input = {
    expectedRevision: 0,
    document: doc,
    sourceNotation: null,
    sourceGroupIds: [],
    assets: [],
  };
  let entry;
  await t.test(
    "uninvited, wrong, replayed and expired codes never create an account",
    async () => {
      const c = await identity.code({
        email: "unknown@example.test",
        nonce: key() + key(),
      });
      assert.equal(
        mail.some((m) => m.challengeId === c.challengeId),
        false,
      );
      await assert.rejects(
        identity.verify({
          challengeId: c.challengeId,
          code: "00000000",
          nonce: key(),
        }),
        codeReject,
      );
      await identity.invite("wrong@example.test");
      const nonce = key() + key(),
        d = await identity.code({ email: "wrong@example.test", nonce });
      const sent = mail.at(-1);
      for (let n = 0; n < 5; n++)
        await assert.rejects(
          identity.verify({
            challengeId: d.challengeId,
            code: sent.code === "00000000" ? "11111111" : "00000000",
            nonce,
          }),
          codeReject,
        );
      await assert.rejects(
        identity.verify({ challengeId: d.challengeId, code: sent.code, nonce }),
        codeReject,
      );
      const r = await db.identity((tx) =>
        tx.query(
          "SELECT id FROM qinban_identity.users WHERE email IN ('wrong@example.test','unknown@example.test')",
        ),
      );
      assert.equal(r.rows.length, 0);
      await identity.invite("expired@example.test");
      const n = key() + key(),
        expired = await identity.code({
          email: "expired@example.test",
          nonce: n,
        }),
        sentExpired = mail.at(-1);
      await db.identity((tx) =>
        tx.query(
          "UPDATE qinban_identity.challenges SET expires_at=$1 WHERE id=$2",
          [new Date(clock - 1).toISOString(), expired.challengeId],
        ),
      );
      await assert.rejects(
        identity.verify({
          challengeId: expired.challengeId,
          code: sentExpired.code,
          nonce: n,
        }),
        codeReject,
      );
      await identity.invite("replay@example.test");
      const n2 = key() + key(),
        one = await identity.code({ email: "replay@example.test", nonce: n2 }),
        sentOne = mail.at(-1);
      await identity.verify({
        challengeId: one.challengeId,
        code: sentOne.code,
        nonce: n2,
      });
      await assert.rejects(
        identity.verify({
          challengeId: one.challengeId,
          code: sentOne.code,
          nonce: n2,
        }),
        codeReject,
      );
      const failedMail = createIdentity({
        db,
        secret: "test-secret-".repeat(5),
        mailer: async () => {
          throw Error("simulated SMTP failure");
        },
        now,
      });
      await identity.invite("mail-failure@example.test");
      const failed = await failedMail.code({
        email: "mail-failure@example.test",
        nonce: key() + key(),
      });
      const stored = (
        await db.identity((tx) =>
          tx.query(
            "SELECT delivery_state,consumed_at FROM qinban_identity.challenges WHERE id=$1",
            [failed.challengeId],
          ),
        )
      ).rows[0];
      assert.equal(stored.delivery_state, "failed");
      assert.ok(stored.consumed_at);
    },
  );
  await t.test(
    "same document id exists separately in two private accounts and RLS filters direct SQL",
    async () => {
      entry = await library.save(owner, null, input, key());
      await library.save(
        other,
        null,
        { ...input, document: { ...doc, title: "B的独立副本" } },
        key(),
      );
      assert.equal((await library.list(owner)).records.length, 1);
      assert.equal((await library.list(other)).records[0].title, "B的独立副本");
      await assert.rejects(
        library.read(other, entry.summary.entryId),
        (e) => e.status === 404,
      );
      const r = await db.private(other, (tx) =>
        tx.query("SELECT * FROM qinban_private.entries WHERE id=$1", [
          entry.summary.entryId,
        ]),
      );
      assert.equal(r.rows.length, 0);
      await assert.rejects(
        db.private(other, (tx) =>
          tx.query("INSERT INTO qinban_private.audit VALUES($1,$2,$3,$4,$5)", [
            key(),
            owner,
            "forged",
            "x",
            new Date(clock).toISOString(),
          ]),
        ),
        /row-level security/,
      );
    },
  );
  await t.test(
    "idempotent creates and concurrent saves cannot duplicate or overwrite newer revisions",
    async () => {
      const k = key(),
        created = await library.save(
          owner,
          null,
          { ...input, document: { ...doc, id: "幂等曲目" } },
          k,
        );
      const again = await library.save(
        owner,
        null,
        { ...input, document: { ...doc, id: "幂等曲目" } },
        k,
      );
      assert.equal(created.summary.entryId, again.summary.entryId);
      await assert.rejects(
        library.save(owner, null, input, k),
        (e) => e.code === "IDEMPOTENCY_CONFLICT",
      );
      const a = {
          ...input,
          expectedRevision: 1,
          document: { ...doc, title: "修改一" },
        },
        b = {
          ...input,
          expectedRevision: 1,
          document: { ...doc, title: "修改二" },
        };
      const r = await Promise.allSettled([
        library.save(owner, entry.summary.entryId, a, key()),
        library.save(owner, entry.summary.entryId, b, key()),
      ]);
      assert.equal(r.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        r.find((r) => r.status === "rejected").reason.code,
        "REVISION_CONFLICT",
      );
      entry = await library.read(owner, entry.summary.entryId);
      assert.equal(entry.summary.revision, 2);
    },
  );
  let png, resource, group;
  async function upload(user, bytes, name, mimeType, purpose = "source") {
    const hash = sha(bytes),
      u = await library.stage(
        user,
        { name, mimeType, bytes: bytes.length, sha256: hash, purpose },
        key(),
      );
    await library.receive(user, u.uploadId, bytes);
    const r = await library.complete(user, u.uploadId, { sha256: hash }, key());
    return { ...r, uploadId: u.uploadId };
  }
  await t.test(
    "native images remain byte-identical; cross-account assets and source groups are refused",
    async () => {
      png = await sharp({
        create: { width: 64, height: 64, channels: 3, background: "#fafaf2" },
      })
        .png()
        .toBuffer();
      resource = await upload(owner, png, "测试原图.png", "image/png");
      assert.deepEqual(
        (await library.readResource(owner, resource.resourceId)).bytes,
        png,
      );
      group = await library.sourceGroup(
        owner,
        {
          kind: "images",
          pages: [
            {
              ordinal: 1,
              scope: "excerpt",
              originalResourceId: resource.resourceId,
              firstCompleteSystem: 1,
              lastCompleteSystem: 2,
            },
          ],
        },
        key(),
      );
      await assert.rejects(
        library.readResource(other, resource.resourceId),
        (e) => e.status === 404,
      );
      await assert.rejects(
        library.readGroup(other, group.sourceGroupId),
        (e) => e.status === 404,
      );
      await assert.rejects(
        library.sourceGroup(
          other,
          {
            kind: "images",
            pages: [
              {
                ordinal: 1,
                scope: "unknown",
                originalResourceId: resource.resourceId,
              },
            ],
          },
          key(),
        ),
        (e) => e.status === 404,
      );
      await assert.rejects(
        library.save(
          other,
          null,
          {
            ...input,
            document: { ...doc, id: "cross-asset" },
            assets: [
              {
                assetId: "x",
                resourceId: resource.resourceId,
                role: "original",
              },
            ],
          },
          key(),
        ),
        (e) => e.status === 404,
      );
      await assert.rejects(
        library.save(
          other,
          null,
          {
            ...input,
            document: { ...doc, id: "cross-group" },
            sourceGroupIds: [group.sourceGroupId],
          },
          key(),
        ),
        (e) => e.status === 404,
      );
    },
  );
  await t.test(
    "hash mismatch, wrong MIME, unsafe types and invalid order are rejected before publication",
    async () => {
      const u = await library.stage(
        owner,
        {
          name: "x.png",
          mimeType: "image/png",
          bytes: png.length,
          sha256: "0".repeat(64),
          purpose: "source",
        },
        key(),
      );
      await assert.rejects(
        library.receive(owner, u.uploadId, png),
        (e) => e.code === "UPLOAD_HASH",
      );
      await assert.rejects(
        upload(
          owner,
          Buffer.from('<svg onload="alert(1)"/>'),
          "fake.png",
          "image/png",
        ),
        (e) => e.code === "MIME_MISMATCH",
      );
      await assert.rejects(
        library.sourceGroup(
          owner,
          {
            kind: "images",
            pages: [
              {
                ordinal: 2,
                scope: "unknown",
                originalResourceId: resource.resourceId,
              },
            ],
          },
          key(),
        ),
        (e) => e.code === "PAGE_ORDER",
      );
    },
  );
  await t.test(
    "history and trash restore create a new revision and block stale resurrection",
    async () => {
      const h = await library.revisions(owner, entry.summary.entryId);
      assert.equal(h.revisions.length, 2);
      const restored = await library.restore(
        owner,
        entry.summary.entryId,
        { expectedRevision: 2, targetRevision: 1 },
        key(),
      );
      assert.equal(restored.summary.revision, 3);
      assert.equal(restored.document.title, "测试私有曲目");
      const d = await library.remove(owner, entry.summary.entryId, 3, key());
      assert.equal(d.revision, 4);
      await assert.rejects(
        library.read(owner, entry.summary.entryId),
        (e) => e.status === 404,
      );
      await assert.rejects(
        library.save(
          owner,
          entry.summary.entryId,
          { ...input, expectedRevision: 3 },
          key(),
        ),
        (e) => e.status === 404,
      );
      const r = await library.restore(
        owner,
        entry.summary.entryId,
        { expectedRevision: 4 },
        key(),
      );
      assert.equal(r.summary.revision, 5);
      entry = r;
    },
  );
  await t.test(
    "v2 backup preserves byte hashes, revisions and native image source groups",
    async () => {
      const current = await library.read(owner, entry.summary.entryId);
      entry = await library.save(
        owner,
        entry.summary.entryId,
        {
          ...current,
          expectedRevision: current.summary.revision,
          sourceGroupIds: [group.sourceGroupId],
          assets: [
            {
              assetId: "original-file",
              role: "original",
              resourceId: resource.resourceId,
            },
          ],
        },
        key(),
      );
      const out = await transfers.export(
        owner,
        { includeHistory: true, entryIds: [entry.summary.entryId] },
        key(),
      );
      assert.equal(out.state, "ready");
      const r = await library.readResource(owner, out.resourceId),
        backup = JSON.parse(r.bytes);
      assert.equal(backup.version, 2);
      assert.equal(backup.records[0].history.length, 5);
      assert.equal(backup.sourceGroups.length, 1);
      assert.equal(backup.resources[sha(png)].data, png.toString("base64"));
      assert.equal(
        backup.sha256,
        digest({
          records: backup.records,
          sourceGroups: backup.sourceGroups,
          resources: backup.resources,
        }),
      );
      await assert.rejects(
        transfers.exportState(other, out.exportId),
        (e) => e.status === 404,
      );
      await assert.rejects(
        library.readResource(other, out.resourceId),
        (e) => e.status === 404,
      );
      const uploaded = await upload(
          other,
          r.bytes,
          "backup.json",
          "application/json",
          "backup",
        ),
        preview = await transfers.preview(
          other,
          { uploadId: uploaded.uploadId },
          key(),
          B.session.email,
        );
      assert.equal(preview.items[0].state, "conflict");
      await assert.rejects(
        transfers.commit(
          owner,
          preview.importId,
          { previewDigest: preview.previewDigest, decisions: [] },
          key(),
        ),
        (e) => e.status === 404,
      );
      const result = await transfers.commit(
        other,
        preview.importId,
        {
          previewDigest: preview.previewDigest,
          decisions: [
            {
              documentId: doc.id,
              decision: "copy",
              expectedRevision: preview.items[0].expectedRevision,
            },
          ],
        },
        key(),
      );
      assert.equal(result.items[0].state, "imported");
      assert.equal(
        (await library.read(other, result.items[0].entryId)).summary.revision,
        6,
      );
    },
  );
  await t.test(
    "duplicate preview compares originals and history, not only identical musical notes",
    async () => {
      const out = await transfers.export(
          owner,
          { includeHistory: true, entryIds: [entry.summary.entryId] },
          key(),
        ),
        bytes = (await library.readResource(owner, out.resourceId)).bytes,
        uploaded = await upload(
          owner,
          bytes,
          "same.json",
          "application/json",
          "backup",
        ),
        same = await transfers.preview(
          owner,
          { uploadId: uploaded.uploadId },
          key(),
          A.session.email,
        );
      assert.equal(same.items[0].state, "already_present");
      const changed = JSON.parse(bytes),
        newOriginal = await sharp({
          create: { width: 64, height: 64, channels: 3, background: "#223344" },
        })
          .png()
          .toBuffer(),
        hash = sha(newOriginal);
      changed.resources[hash] = {
        mimeType: "image/png",
        bytes: newOriginal.length,
        data: newOriginal.toString("base64"),
      };
      changed.records[0].originalFile.resource = hash;
      changed.sha256 = digest({
        records: changed.records,
        sourceGroups: changed.sourceGroups,
        resources: changed.resources,
      });
      const altered = await upload(
          owner,
          Buffer.from(JSON.stringify(changed)),
          "changed.json",
          "application/json",
          "backup",
        ),
        conflict = await transfers.preview(
          owner,
          { uploadId: altered.uploadId },
          key(),
          A.session.email,
        );
      assert.equal(conflict.items[0].state, "conflict");
    },
  );
  await t.test(
    "EXIF normalization keeps original bytes and records the derived image mapping",
    async () => {
      const jpeg = await sharp({
        create: { width: 80, height: 40, channels: 3, background: "#f0ead0" },
      })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer();
      const r = await upload(owner, jpeg, "portrait.jpg", "image/jpeg");
      assert.ok(r.recognitionResourceId);
      assert.deepEqual(
        (await library.readResource(owner, r.resourceId)).bytes,
        jpeg,
      );
      const derived = await library.readResource(
        owner,
        r.recognitionResourceId,
      );
      assert.equal(derived.info.width, 40);
      assert.equal(derived.info.height, 80);
      const g = await library.sourceGroup(
        owner,
        {
          kind: "images",
          pages: [
            { ordinal: 1, scope: "unknown", originalResourceId: r.resourceId },
          ],
        },
        key(),
      );
      assert.equal(g.pages[0].recognitionResourceId, r.recognitionResourceId);
    },
  );
  await t.test(
    "PDF sources retain original bytes and require their actual complete page order",
    async () => {
      const pdf = await PDFDocument.create();
      pdf.addPage();
      pdf.addPage();
      const bytes = Buffer.from(await pdf.save()),
        r = await upload(owner, bytes, "original.pdf", "application/pdf");
      assert.equal(r.pages, 2);
      assert.deepEqual(
        (await library.readResource(owner, r.resourceId)).bytes,
        bytes,
      );
      const pages = [1, 2].map((ordinal) => ({
        ordinal,
        scope: "full_page",
        originalResourceId: r.resourceId,
      }));
      await library.sourceGroup(owner, { kind: "pdf", pages }, key());
      await assert.rejects(
        library.sourceGroup(
          owner,
          { kind: "pdf", pages: pages.slice(0, 1) },
          key(),
        ),
        (e) => e.code === "INVALID_SOURCE_GROUP",
      );
    },
  );
  await t.test(
    "standalone source images survive backup import and repeated commits do not duplicate entries",
    async () => {
      const out = await transfers.export(
          owner,
          { includeHistory: true },
          key(),
        ),
        bytes = (await library.readResource(owner, out.resourceId)).bytes;
      const uploaded = await upload(
        other,
        bytes,
        "all.json",
        "application/json",
        "backup",
      );
      const p = await transfers.preview(
        other,
        { uploadId: uploaded.uploadId },
        key(),
        B.session.email,
      );
      assert.ok(p.items.some((x) => x.documentId.startsWith("source:")));
      const decisions = p.items.map((i) => ({
          documentId: i.documentId,
          decision: "copy",
          expectedRevision: i.expectedRevision,
        })),
        req = { previewDigest: p.previewDigest, decisions },
        r = await transfers.commit(other, p.importId, req, key());
      assert.equal(r.state, "completed");
      const before = (await library.list(other)).records.length,
        groupCount = (await library.groups(other)).groups.length;
      await transfers.commit(other, p.importId, req, key());
      assert.equal((await library.list(other)).records.length, before);
      assert.equal((await library.groups(other)).groups.length, groupCount);
    },
  );
  await t.test(
    "maintenance purges only expired account-owned data and retains other owners and pinned images",
    async () => {
      const D = await login("purge@example.test"),
        d = await library.save(
          D.session.userId,
          null,
          { ...input, document: { ...doc, id: "purge-only-this-account" } },
          key(),
        );
      await identity.deleteAccount(D.session);
      const counts = await maintainAccounts({
        db,
        files,
        now: clock + 31 * 86400000,
      });
      assert.equal(counts.accountsPurged, 1);
      const u = await db.identity((tx) =>
        tx.query("SELECT id FROM qinban_identity.users WHERE id=$1", [
          D.session.userId,
        ]),
      );
      assert.equal(u.rows.length, 0);
      assert.equal(
        (await library.read(owner, entry.summary.entryId)).document.id,
        doc.id,
      );
      assert.ok((await library.groups(owner)).groups.length >= 2);
    },
  );
  await t.test(
    "maintenance reclaims old orphan objects but preserves fresh files and referenced originals",
    async () => {
      const orphan = key(),
        fresh = key();
      await files.write(owner, orphan, png);
      await files.write(owner, fresh, png);
      const old = new Date(clock - 2 * 86400000);
      await utimes(join(dir, "private-files", owner, orphan), old, old);
      const counts = await maintainAccounts({ db, files, now: clock });
      assert.equal(counts.orphansPurged, 1);
      await assert.rejects(files.read(owner, orphan), (e) => e.status === 404);
      assert.deepEqual(await files.read(owner, fresh), png);
      assert.deepEqual(
        (await library.readResource(owner, resource.resourceId)).bytes,
        png,
      );
    },
  );
  await t.test(
    "identity expiry and account recovery cannot access private data before recovery",
    async () => {
      const C = await login("recover@example.test");
      await identity.deleteAccount(C.session);
      await assert.rejects(identity.session(C.token), codeReject);
      clock += 61000;
      const nonce = key() + key(),
        c = await identity.code({
          email: C.session.email,
          purpose: "recover",
          nonce,
        }),
        sent = mail.find((x) => x.challengeId === c.challengeId),
        r = await identity.verify({
          challengeId: c.challengeId,
          code: sent.code,
          nonce,
        });
      await assert.rejects(identity.session(r.token), codeReject);
      const recovery = await identity.session(r.token, { recovery: true }),
        restored = await identity.recover(recovery);
      await assert.rejects(
        identity.session(r.token, { recovery: true }),
        codeReject,
      );
      assert.notEqual(restored.token, r.token);
      assert.equal((await identity.session(restored.token)).state, "active");
      clock += 31 * 86400000;
      await assert.rejects(identity.session(A.token), codeReject);
    },
  );
});

test("cold restart preserves account, sessions, revisions and byte-identical private originals", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "qinban-restart-")),
    mail = [];
  let runtime = await createHostedRuntime({
    directory,
    mailer: async (m) => mail.push(m),
  });
  t.after(async () => {
    await runtime.close();
    await rm(directory, { recursive: true, force: true });
  });
  await runtime.identity.invite("restart@example.test");
  const nonce = key() + key(),
    c = await runtime.identity.code({ email: "restart@example.test", nonce }),
    signed = await runtime.identity.verify({
      challengeId: c.challengeId,
      code: mail[0].code,
      nonce,
    });
  const owner = signed.session.userId,
    png = await sharp({
      create: { width: 32, height: 64, channels: 3, background: "#abcabc" },
    })
      .png()
      .toBuffer(),
    hash = sha(png);
  const upload = await runtime.library.stage(
    owner,
    {
      name: "original.png",
      mimeType: "image/png",
      bytes: png.length,
      sha256: hash,
      purpose: "source",
    },
    key(),
  );
  await runtime.library.receive(owner, upload.uploadId, png);
  const resource = await runtime.library.complete(
    owner,
    upload.uploadId,
    { sha256: hash },
    key(),
  );
  const group = await runtime.library.sourceGroup(
    owner,
    {
      kind: "images",
      pages: [
        {
          ordinal: 1,
          scope: "unknown",
          originalResourceId: resource.resourceId,
        },
      ],
    },
    key(),
  );
  const saved = await runtime.library.save(
    owner,
    null,
    {
      expectedRevision: 0,
      document: readScoreDocument({ ...starterScore, id: "restart-score" }),
      sourceNotation: null,
      sourceGroupIds: [group.sourceGroupId],
      assets: [],
    },
    key(),
  );
  await runtime.close();
  runtime = await createHostedRuntime({
    directory,
    mailer: async (m) => mail.push(m),
  });
  assert.equal((await runtime.identity.session(signed.token)).userId, owner);
  const read = await runtime.library.read(owner, saved.summary.entryId);
  assert.equal(read.summary.revision, 1);
  assert.equal(read.document.id, "restart-score");
  assert.deepEqual(
    (await runtime.library.readResource(owner, resource.resourceId)).bytes,
    png,
  );
  assert.equal((await runtime.library.groups(owner)).groups.length, 1);
});
