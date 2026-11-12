import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createAccountDatabase } from "../lib/accounts/database.mjs";
import { createIdentity } from "../lib/accounts/identity.mjs";
import { createHostedServer } from "../lib/accounts/http.mjs";
import { createPrivateFiles } from "../lib/accounts/storage.mjs";
import { maintainAccounts } from "../lib/accounts/maintenance.mjs";

test("account deletion and sensitive actions validate the live session", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "qinban-lifecycle-")),
    db = await createAccountDatabase({ directory: join(directory, "pg") }),
    files = createPrivateFiles(join(directory, "files")),
    mail = [];
  let clock = Date.now();
  const identity = createIdentity({
    db,
    secret: "lifecycle-test-secret-".repeat(4),
    mailer: async (m) => mail.push(m),
    now: () => clock,
  });
  t.after(async () => {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });
  const rejectSession = (e) => e.code === "SESSION_REQUIRED";
  async function challenge(email, purpose = "login") {
    const nonce = randomUUID() + randomUUID(),
      c = await identity.code({
        email,
        purpose,
        nonce,
        openRegistration: true,
      });
    return {
      challengeId: c.challengeId,
      nonce,
      code: mail.find((m) => m.challengeId === c.challengeId)?.code,
    };
  }
  async function login(email, { password } = {}) {
    clock += 61000;
    return identity.verify({
      ...(await challenge(email)),
      ...(password ? { newPassword: password } : {}),
    });
  }
  const untouched = await login("keep@example.test");

  await t.test(
    "immediate deletion confirms the email and permanently blocks every old login",
    async () => {
      const signed = await login("delete@example.test", {
        password: "A long deletion test password",
      });
      const passwordSession = await identity.passwordLogin({
        email: signed.session.email,
        password: "A long deletion test password",
      });
      const confirmation = {
        mode: "immediate",
        confirmationEmail: "DELETE@example.test ",
      };
      await assert.rejects(
        identity.deleteAccount(
          {
            ...passwordSession.session,
            reauthenticatedAt: new Date(clock).toISOString(),
          },
          confirmation,
        ),
        (e) => e.code === "RECENT_AUTH_REQUIRED",
        "a forged fresh timestamp cannot replace a server-verified email challenge",
      );
      for (const confirmationEmail of [undefined, "keep@example.test"]) {
        await assert.rejects(
          identity.deleteAccount(signed.session, {
            mode: "immediate",
            confirmationEmail,
          }),
          (e) => e.code === "DELETE_CONFIRMATION_REQUIRED",
        );
      }
      await assert.rejects(
        identity.deleteAccount(signed.session, { mode: "forever" }),
        (e) => e.code === "INVALID_DELETION_MODE",
      );
      assert.equal(
        await identity.accountState(signed.session.userId),
        "active",
      );
      const unusedCode = await challenge(signed.session.email);
      const objectId = randomUUID();
      await files.write(
        signed.session.userId,
        objectId,
        Buffer.from("private original"),
      );
      const result = await identity.deleteAccount(signed.session, confirmation);
      assert.deepEqual(result, {
        state: "deleting",
        recoverUntil: null,
        mode: "immediate",
      });
      for (const token of [signed.token, passwordSession.token])
        await assert.rejects(identity.session(token), rejectSession);
      await assert.rejects(
        identity.verify(unusedCode),
        (e) => e.code === "INVALID_CODE",
      );
      const count = mail.length;
      await challenge(signed.session.email, "recover");
      assert.equal(
        mail.length,
        count,
        "immediately deleted accounts cannot request recovery",
      );
      await assert.rejects(
        identity.deleteAccount(signed.session),
        rejectSession,
      );

      const cleaned = await maintainAccounts({ db, files, now: clock });
      assert.equal(cleaned.accountsPurged, 1);
      assert.equal(
        await identity.accountState(signed.session.userId),
        "missing",
      );
      await assert.rejects(
        files.read(signed.session.userId, objectId),
        (e) => e.code === "ACCOUNT_DELETED",
      );
      assert.deepEqual(await files.objects(signed.session.userId), []);
      assert.equal((await identity.session(untouched.token)).state, "active");
    },
  );

  await t.test(
    "a pre-read revoked session cannot delete, list, or revoke other live sessions",
    async () => {
      const first = await login("revoked@example.test"),
        second = await login("revoked@example.test");
      await identity.revoke(first.session, first.session.id);
      for (const action of [
        () => identity.devices(first.session),
        () => identity.revoke(first.session, second.session.id),
        () => identity.logoutAll(first.session),
        () => identity.deleteAccount(first.session),
      ])
        await assert.rejects(action(), rejectSession);
      assert.equal((await identity.session(second.token)).state, "active");
    },
  );

  await t.test(
    "logging out all devices cannot be replayed with its old session snapshot",
    async () => {
      const first = await login("all@example.test"),
        second = await login("all@example.test");
      await identity.logoutAll(second.session);
      for (const token of [first.token, second.token])
        await assert.rejects(identity.session(token), rejectSession);
      await assert.rejects(
        identity.deleteAccount(second.session),
        rejectSession,
      );
      assert.equal(await identity.accountState(first.session.userId), "active");
    },
  );

  await t.test(
    "the optional recovery period works but revoked recovery sessions cannot restore an account",
    async () => {
      const signed = await login("recoverable@example.test"),
        deleted = await identity.deleteAccount(signed.session, {
          mode: "recoverable",
        });
      assert.equal(Date.parse(deleted.recoverUntil) - clock, 30 * 86400000);
      clock += 61000;
      const recovery = await identity.verify(
        await challenge(signed.session.email, "recover"),
      );
      await assert.rejects(identity.session(recovery.token), rejectSession);
      await db.identity((tx) =>
        tx.query(
          "UPDATE qinban_identity.sessions SET revoked_at=$1 WHERE id=$2",
          [new Date(clock).toISOString(), recovery.session.id],
        ),
      );
      await assert.rejects(identity.recover(recovery.session), rejectSession);
      assert.equal(
        await identity.accountState(signed.session.userId),
        "deletion_pending",
      );
      clock += 61000;
      const fresh = await identity.verify(
          await challenge(signed.session.email, "recover"),
        ),
        restored = await identity.recover(fresh.session);
      assert.equal((await identity.session(restored.token)).state, "active");
      await assert.rejects(identity.recover(fresh.session), rejectSession);
    },
  );

  await t.test(
    "recent verification and session inactivity are evaluated from stored timestamps",
    async () => {
      const first = await login("timestamps@example.test"),
        second = await login("timestamps@example.test");
      clock += 11 * 60000;
      await assert.rejects(
        identity.deleteAccount({
          ...second.session,
          reauthenticatedAt: new Date(clock).toISOString(),
        }),
        (e) => e.code === "RECENT_AUTH_REQUIRED",
      );
      await db.identity((tx) =>
        tx.query(
          "UPDATE qinban_identity.sessions SET last_seen_at=$1 WHERE id=$2",
          [new Date(clock - 8 * 86400000).toISOString(), first.session.id],
        ),
      );
      const devices = await identity.devices(second.session);
      assert.deepEqual(
        devices.sessions.map((s) => s.id),
        [second.session.id],
      );
    },
  );

  await t.test(
    "HTTP deletion enforces CSRF, confirms the authenticated account, and forwards the selected mode",
    async () => {
      const signed = await login("http-delete@example.test"),
        server = createHostedServer({ identity, profile: "local" });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      try {
        const origin = "http://127.0.0.1:" + server.address().port;
        const request = (body, csrf = signed.session.csrfToken) =>
          fetch(origin + "/api/v1/account", {
            method: "DELETE",
            headers: {
              origin,
              cookie: "qinban_dev_account=" + signed.token,
              "content-type": "application/json",
              "x-csrf-token": csrf,
              "idempotency-key": randomUUID(),
            },
            body: JSON.stringify(body),
          });
        assert.equal(
          (
            await request(
              { mode: "immediate", confirmationEmail: signed.session.email },
              "wrong",
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request({
              mode: "immediate",
              confirmationEmail: untouched.session.email,
            })
          ).status,
          422,
        );
        const done = await request({
          mode: "immediate",
          confirmationEmail: signed.session.email,
          userId: untouched.session.userId,
        });
        assert.equal(done.status, 202);
        assert.equal((await done.json()).state, "deleting");
        assert.match(done.headers.get("set-cookie"), /Max-Age=0/);
        assert.equal(
          await identity.accountState(untouched.session.userId),
          "active",
        );
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    },
  );
});
