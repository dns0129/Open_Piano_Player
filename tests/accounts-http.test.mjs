import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createAccountDatabase } from "../lib/accounts/database.mjs";
import { createIdentity } from "../lib/accounts/identity.mjs";
import { createPrivateFiles } from "../lib/accounts/storage.mjs";
import { createPrivateLibrary } from "../lib/accounts/private-library.mjs";
import { createPrivateTransfers } from "../lib/accounts/transfers.mjs";
import { createHostedServer } from "../lib/accounts/http.mjs";
import { readScoreDocument } from "../lib/score-document.ts";
import { starterScore } from "../lib/starter-score.mjs";
import { createAccountClient } from "../src/accounts/client.js";
import { createHostedLibrary } from "../src/accounts/client.js";
import { createLibraryClient } from "../src/library.js";
import sharp from "sharp";

test("hosted HTTP authentication, CSRF, account boundaries and late responses", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "qinban-http-")),
    db = await createAccountDatabase({ directory: join(dir, "pg") }),
    mail = [];
  const identity = createIdentity({
      db,
      secret: "s".repeat(64),
      mailer: async (m) => mail.push(m),
    }),
    files = createPrivateFiles(join(dir, "files")),
    library = createPrivateLibrary({ db, files }),
    transfers = createPrivateTransfers({ db, files, library });
  const dist = join(dir, "dist");
  await mkdir(dist);
  await writeFile(join(dist, "index.html"), "<h1>private account test</h1>");
  const server = createHostedServer({
    identity,
    library,
    transfers,
    distDir: dist,
  });
  t.after(async () => {
    if (server.listening) await new Promise((r) => server.close(r));
    await db.close();
    await rm(dir, { recursive: true, force: true });
  });
  await new Promise((r, j) => {
    server.once("error", j);
    server.listen(0, "127.0.0.1", r);
  });
  const base = "http://127.0.0.1:" + server.address().port;
  function browser() {
    const jar = new Map();
    return {
      jar,
      csrf: "",
      async req(
        path,
        {
          method = "GET",
          body,
          csrf = this.csrf,
          origin = base,
          headers = {},
        } = {},
      ) {
        const h = {
          cookie: [...jar].map(([k, v]) => k + "=" + v).join("; "),
          origin,
          ...headers,
        };
        if (method !== "GET") {
          h["x-csrf-token"] = csrf;
          h["idempotency-key"] = randomUUID();
          if (body !== undefined) {
            h["content-type"] = "application/json";
            body = JSON.stringify(body);
          }
        }
        const r = await fetch(base + "/api/v1" + path, {
          method,
          body,
          headers: h,
        });
        for (const cookie of r.headers.getSetCookie()) {
          const [n, v] = cookie.split(";")[0].split("=");
          if (v) jar.set(n, v);
          else jar.delete(n);
        }
        const data = r.status === 204 ? null : await r.json().catch(() => null);
        return { status: r.status, data, headers: r.headers };
      },
    };
  }
  async function login(b, email) {
    await identity.invite(email);
    const context = await b.req("/auth/context");
    b.csrf = context.data.csrfToken;
    const code = await b.req("/auth/code", {
      method: "POST",
      body: { email, purpose: "login" },
    });
    assert.equal(code.status, 202);
    const sent = mail.find((m) => m.challengeId === code.data.challengeId);
    assert.ok(sent);
    const verified = await b.req("/auth/verify", {
      method: "POST",
      body: { challengeId: code.data.challengeId, code: sent.code },
    });
    assert.equal(verified.status, 200);
    b.csrf = verified.data.csrfToken;
    return verified.data;
  }
  const a = browser(),
    b = browser(),
    sa = await login(a, "http-a@example.test"),
    sb = await login(b, "http-b@example.test");
  await t.test(
    "cookie and authentication routes never expose challenge secrets",
    async () => {
      assert.ok(a.jar.get("qinban_dev_account"));
      const current = await a.req("/session");
      assert.equal(current.data.user.email, "http-a@example.test");
      assert.equal(JSON.stringify(current.data).includes("token_hash"), false);
      const guest = await browser().req("/library/entries");
      assert.equal(guest.status, 401);
    },
  );
  let saved;
  await t.test(
    "CSRF and Origin checks execute before a private write",
    async () => {
      const payload = {
        expectedRevision: 0,
        document: readScoreDocument({ ...starterScore, id: "http-private" }),
        sourceNotation: null,
        sourceGroupIds: [],
        assets: [],
      };
      assert.equal(
        (
          await a.req("/library/entries", {
            method: "POST",
            body: payload,
            csrf: "wrong",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await a.req("/library/entries", {
            method: "POST",
            body: payload,
            origin: "https://other.example",
          })
        ).status,
        403,
      );
      const r = await a.req("/library/entries", {
        method: "POST",
        body: payload,
      });
      assert.equal(r.status, 201);
      saved = r.data;
      assert.equal(saved.document.id, "http-private");
    },
  );
  await t.test(
    "all cross-account entry and revision paths use 404",
    async () => {
      for (const tail of ["", "/revisions"])
        assert.equal(
          (await b.req("/library/entries/" + saved.summary.entryId + tail))
            .status,
          404,
        );
      assert.equal(
        (
          await b.req(
            "/library/entries/" + saved.summary.entryId + "/restore",
            { method: "POST", body: { expectedRevision: 1 } },
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await b.req("/sessions/" + sa.sessionId, {
            method: "DELETE",
            body: {},
          })
        ).status,
        404,
      );
    },
  );
  await t.test(
    "the hosted server cannot expose old settings, credentials, raw files or local publishing",
    async () => {
      for (const path of [
        "/api/status",
        "/api/settings",
        "/.local/settings.json",
        "/api/cloud-library",
        "/api/v1/resources/../../secret",
      ]) {
        const r = await fetch(base + path, {
          headers: {
            cookie: [...a.jar].map(([k, v]) => k + "=" + v).join("; "),
          },
        });
        assert.ok([403, 404].includes(r.status), path + " " + r.status);
      }
    },
  );
  await t.test("revoked sessions lose access immediately", async () => {
    assert.equal(
      (await a.req("/sessions/" + sa.sessionId, { method: "DELETE", body: {} }))
        .status,
      204,
    );
    assert.equal((await a.req("/library/entries")).status, 401);
    assert.equal((await b.req("/library/entries")).status, 200);
  });
  await t.test(
    "client aborts data returned after identity changed",
    async () => {
      let release;
      const wait = new Promise((r) => (release = r));
      const client = createAccountClient({
        fetchImpl: async (path) => {
          if (path.endsWith("/session"))
            return new Response(
              JSON.stringify({
                ...sb,
                user: { id: "B", email: "B@example.test", state: "active" },
              }),
            );
          await wait;
          return new Response(JSON.stringify({ private: "old-account" }));
        },
      });
      const pending = client.json("/library/entries");
      await client.initialize();
      release();
      await assert.rejects(pending, (e) => e.code === "IDENTITY_CHANGED");
      client.dispose();
    },
  );
  await t.test(
    "a file selected by the previous account is not uploaded after identity changes",
    async () => {
      let release,
        identityId = "A",
        uploadRequests = 0;
      const bytes = new Promise((r) => (release = r)),
        client = createAccountClient({
          fetchImpl: async (path) => {
            if (path.endsWith("/session"))
              return new Response(
                JSON.stringify({
                  ...sb,
                  user: {
                    id: identityId,
                    email: identityId + "@example.test",
                    state: "active",
                  },
                }),
              );
            uploadRequests++;
            throw Error("Old file must not reach a new account");
          },
        });
      await client.initialize();
      const pending = client.upload({
        name: "old-account.png",
        type: "image/png",
        arrayBuffer: () => bytes,
      });
      identityId = "B";
      await client.initialize();
      release(Uint8Array.of(1, 2, 3).buffer);
      await assert.rejects(pending, (e) => e.code === "IDENTITY_CHANGED");
      assert.equal(uploadRequests, 0);
      client.dispose();
    },
  );
  await t.test(
    "the existing player library saves, edits and reopens hosted source images through real HTTP",
    async () => {
      const account = createAccountClient({
        fetchImpl: async (path, options) => {
          const headers = new Headers(options.headers);
          headers.set("origin", base);
          headers.set(
            "cookie",
            [...b.jar].map(([k, v]) => k + "=" + v).join("; "),
          );
          return fetch(base + path, { ...options, headers });
        },
      });
      await account.initialize();
      const playerLibrary = createLibraryClient({
        capabilities: { mode: "hosted" },
        hosted: createHostedLibrary(account),
        storage: null,
      });
      await playerLibrary.initialize();
      const score = {
          version: 1,
          id: "hosted-player-original",
          title: "账号谱面端到端",
          tempo: 80,
          timeSignature: [4, 4],
          keySignature: 0,
          durationBeats: 4,
          notes: [{ id: "a", beat: 0, duration: 4, midi: 60, hand: "right" }],
        },
        png = await sharp({
          create: { width: 64, height: 64, channels: 3, background: "#abcabc" },
        })
          .png()
          .toBuffer();
      await playerLibrary.saveBundle({
        score,
        sourceNotation: {
          version: 1,
          coordinateSpace: "page",
          scoreId: score.id,
          systems: [{ id: "row", page: 1, system: 1 }],
          notes: [{ noteId: "a", page: 1, system: 1, x: 20, y: 20 }],
        },
        assets: [
          { id: "row", mimeType: "image/png", data: png.toString("base64") },
        ],
        reviewStatus: { humanConfirmed: true },
      });
      const reopened = await playerLibrary.readSource(score);
      assert.ok(reopened);
      assert.ok(reopened.notation.systems[0].imageUrl.startsWith("blob:"));
      assert.deepEqual(
        Buffer.from(
          await (
            await fetch(reopened.notation.systems[0].imageUrl)
          ).arrayBuffer(),
        ),
        png,
      );
      assert.equal(reopened.reviewStatus.humanConfirmed, false);
      await playerLibrary.save(
        { ...score, title: "账号修改已保存" },
        { expectedRevision: 1 },
      );
      assert.equal(playerLibrary.records[0].revision, 2);
      assert.equal(playerLibrary.scores[0].title, "账号修改已保存");
      const privateCopy = await playerLibrary.package(score.id);
      assert.equal(privateCopy.assets[0].data, png.toString("base64"));
      playerLibrary.reset();
      account.dispose();
    },
  );
});
