import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createAccountDatabase } from "../lib/accounts/database.mjs";
import { createIdentity } from "../lib/accounts/identity.mjs";
import { createHostedServer } from "../lib/accounts/http.mjs";

const nonce = () => randomUUID() + randomUUID();

test("email-code sign-in: resend, first-login registration and automatic recovery", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "qinban-sign-in-")),
    db = await createAccountDatabase({ directory: join(dir, "pg") }),
    mail = [];
  let clock = Date.now();
  const identity = createIdentity({
    db,
    secret: "sign-in-secret-".repeat(4),
    mailer: async (m) => mail.push(m),
    now: () => clock,
  });
  t.after(async () => {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  });

  await t.test(
    "asking again inside the resend window keeps the emailed code usable for the same browser",
    async () => {
      await identity.invite("resend@example.test");
      const mine = nonce();
      const first = await identity.code({
          email: "resend@example.test",
          nonce: mine,
        }),
        sent = mail.at(-1);
      clock += 20000;
      const again = await identity.code({
        email: "resend@example.test",
        nonce: mine,
      });
      assert.equal(
        again.challengeId,
        first.challengeId,
        "同一浏览器拿回原来的验证码请求",
      );
      assert.equal(again.retryAfterSeconds, 40);
      assert.equal(mail.length, 1, "窗口内不会重复发信");
      const other = await identity.code({
        email: "resend@example.test",
        nonce: nonce(),
      });
      assert.notEqual(
        other.challengeId,
        first.challengeId,
        "其他浏览器拿不到这次请求",
      );
      const result = await identity.verify({
        challengeId: again.challengeId,
        code: sent.code,
        nonce: mine,
      });
      assert.equal(result.session.email, "resend@example.test");
    },
  );

  await t.test(
    "the first sign-in of an invited email creates the account; later sign-ins do not",
    async () => {
      await identity.invite("new@example.test");
      clock += 61000;
      const n1 = nonce(),
        c1 = await identity.code({ email: "new@example.test", nonce: n1 }),
        first = await identity.verify({
          challengeId: c1.challengeId,
          code: mail.at(-1).code,
          nonce: n1,
        });
      assert.equal(first.isNewAccount, true);
      clock += 61000;
      const n2 = nonce(),
        c2 = await identity.code({ email: "new@example.test", nonce: n2 }),
        second = await identity.verify({
          challengeId: c2.challengeId,
          code: mail.at(-1).code,
          nonce: n2,
        });
      assert.equal(second.isNewAccount, false);
    },
  );

  await t.test(
    "signing in to an account in its deletion waiting period starts recovery",
    async () => {
      await identity.invite("later@example.test");
      clock += 61000;
      const n1 = nonce(),
        c1 = await identity.code({ email: "later@example.test", nonce: n1 }),
        signedIn = await identity.verify({
          challengeId: c1.challengeId,
          code: mail.at(-1).code,
          nonce: n1,
        });
      await identity.deleteAccount(signedIn.session);
      clock += 61000;
      const n2 = nonce(),
        c2 = await identity.code({
          email: "later@example.test",
          purpose: "login",
          nonce: n2,
        });
      assert.equal(
        mail.at(-1).challengeId,
        c2.challengeId,
        "登录请求照常发出验证码",
      );
      const recovery = await identity.verify({
        challengeId: c2.challengeId,
        code: mail.at(-1).code,
        nonce: n2,
      });
      assert.equal(recovery.session.purpose, "recover");
      const restored = await identity.recover(
        await identity.session(recovery.token, { recovery: true }),
      );
      assert.equal((await identity.session(restored.token)).state, "active");
    },
  );

  await t.test(
    "an uninvited email gets the same answer and no mail",
    async () => {
      clock += 61000;
      const before = mail.length,
        c = await identity.code({
          email: "stranger@example.test",
          nonce: nonce(),
        });
      assert.equal(typeof c.challengeId, "string");
      assert.equal(c.retryAfterSeconds, 60);
      assert.equal(mail.length, before);
    },
  );
});

test("the login context keeps the same nonce across page reloads", async (t) => {
  const identity = { csrf: (scope) => "csrf:" + scope };
  const server = createHostedServer({ identity, profile: "local" });
  t.after(() => new Promise((r) => server.close(r)));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const get = (cookie) =>
    new Promise((resolve, reject) => {
      http
        .get(
          {
            host: "127.0.0.1",
            port,
            path: "/api/v1/auth/context",
            headers: {
              host: `127.0.0.1:${port}`,
              ...(cookie ? { cookie } : {}),
            },
          },
          (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () =>
              resolve({
                cookie: res.headers["set-cookie"]?.[0]?.split(";")[0],
                body: JSON.parse(body),
              }),
            );
          },
        )
        .on("error", reject);
    });
  const first = await get(),
    reload = await get(first.cookie);
  assert.equal(reload.cookie, first.cookie, "刷新后沿用同一个登录 nonce");
  assert.equal(reload.body.csrfToken, first.body.csrfToken);
  const forged = await get("qinban_dev_login=short");
  assert.notEqual(
    forged.cookie,
    "qinban_dev_login=short",
    "格式不对的 nonce 会被替换",
  );
});
