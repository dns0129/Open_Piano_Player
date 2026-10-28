import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createAccountDatabase } from "../lib/accounts/database.mjs";
import { createIdentity } from "../lib/accounts/identity.mjs";
import { createRecognitionBudget } from "../lib/accounts/recognition-budget.mjs";
import { createHostedServer } from "../lib/accounts/http.mjs";
import {
  normalizeInviteCode,
  formatInviteCode,
} from "../lib/accounts/invites.mjs";

const nonce = () => randomUUID() + randomUUID();

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), "qinban-invites-")),
    db = await createAccountDatabase({ directory: join(dir, "pg") }),
    mail = [];
  let clock = Date.now();
  const now = () => clock;
  const identity = createIdentity({
    db,
    secret: "invite-secret-".repeat(4),
    mailer: async (m) => mail.push(m),
    now,
  });
  t.after(async () => {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  });
  async function signUp(email, { inviteCode, openRegistration = false } = {}) {
    const n = nonce(),
      c = await identity.code({
        email,
        nonce: n,
        inviteCode,
        openRegistration,
      });
    const sent = mail.find((m) => m.challengeId === c.challengeId);
    if (!sent) return null;
    return identity.verify({
      challengeId: c.challengeId,
      code: sent.code,
      nonce: n,
    });
  }
  return {
    db,
    identity,
    mail,
    signUp,
    tick: (ms) => {
      clock += ms;
    },
    now,
  };
}

test("invite codes are normalized from any common spelling", () => {
  assert.equal(normalizeInviteCode("qb-7kx2m-p9qrt"), "7KX2MP9QRT");
  assert.equal(normalizeInviteCode(" 7KX2M P9QRT "), "7KX2MP9QRT");
  assert.equal(
    normalizeInviteCode("QB-7KX2M-P9QR0"),
    null,
    "含易混字符 0 的码无效",
  );
  assert.equal(formatInviteCode("7KX2MP9QRT"), "QB-7KX2M-P9QRT");
});

test("registration: open sign-up, invite codes with bonus tasks and friend invites", async (t) => {
  const { db, identity, mail, signUp, tick, now } = await setup(t);

  await t.test(
    "closed registration sends nothing to a new email; open registration creates the account",
    async () => {
      assert.equal(await signUp("closed@example.test"), null);
      const opened = await signUp("open@example.test", {
        openRegistration: true,
      });
      assert.equal(opened.isNewAccount, true);
      assert.equal(opened.redemption, null);
    },
  );

  let operatorCode;
  await t.test(
    "an invite code lets a new email register while registration is closed, within its use limit",
    async () => {
      operatorCode = await identity.invites.createOperatorCode({
        maxUses: 2,
        bonusTasks: 3,
        expiresInDays: 30,
        note: "首批测试",
      });
      assert.match(operatorCode.code, /^QB-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      const first = await signUp("first@example.test", {
        inviteCode: operatorCode.code.toLowerCase(),
      });
      assert.equal(first.isNewAccount, true);
      assert.deepEqual(first.redemption && first.redemption.bonusTasks, 3);
      tick(61000);
      await signUp("second@example.test", { inviteCode: operatorCode.code });
      tick(61000);
      await assert.rejects(
        identity.code({
          email: "third@example.test",
          nonce: nonce(),
          inviteCode: operatorCode.code,
        }),
        (e) => e.code === "INVITE_INVALID",
      );
      const listed = (await identity.invites.list()).codes.find(
        (c) => c.id === operatorCode.id,
      );
      assert.deepEqual(
        [listed.uses, listed.maxUses, listed.usable],
        [2, 2, false],
      );
      assert.equal(
        JSON.stringify(listed).includes(operatorCode.code),
        false,
        "列表不含完整邀请码",
      );
    },
  );

  await t.test(
    "a wrong code fails the same way for registered and unregistered emails",
    async () => {
      tick(61000);
      for (const email of ["first@example.test", "nobody@example.test"])
        await assert.rejects(
          identity.code({
            email,
            nonce: nonce(),
            inviteCode: "QB-AAAAA-AAAAA",
          }),
          (e) => e.code === "INVITE_INVALID",
        );
    },
  );

  await t.test(
    "an existing account ignores a code at sign-in but may redeem one code later",
    async () => {
      const code = await identity.invites.createOperatorCode({
        maxUses: 5,
        bonusTasks: 1,
      });
      tick(61000);
      const again = await signUp("open@example.test", {
        inviteCode: code.code,
      });
      assert.equal(again.isNewAccount, false);
      assert.equal(again.redemption, null);
      const redeemed = await identity.invites.redeem(
        again.session.userId,
        code.code,
      );
      assert.equal(redeemed.bonusTasks, 1);
      await assert.rejects(
        identity.invites.redeem(again.session.userId, code.code),
        (e) => e.code === "INVITE_ALREADY_REDEEMED",
      );
    },
  );

  await t.test(
    "friend codes are single-use, limited per account and never usable by their creator",
    async () => {
      const owner = (
        await db.identity((tx) =>
          tx.query(
            "SELECT id FROM qinban_identity.users WHERE email='first@example.test'",
          ),
        )
      ).rows[0].id;
      const a = await identity.invites.createFriendCode(owner, {
          limit: 2,
          bonusTasks: 2,
        }),
        b = await identity.invites.createFriendCode(owner, {
          limit: 2,
          bonusTasks: 2,
        });
      await assert.rejects(
        identity.invites.createFriendCode(owner, { limit: 2, bonusTasks: 2 }),
        (e) => e.code === "INVITE_LIMIT",
      );
      await identity.invites.revokeFriendCode(owner, b.id);
      const c = await identity.invites.createFriendCode(owner, {
        limit: 2,
        bonusTasks: 2,
      });
      await assert.rejects(identity.invites.redeem(owner, a.code), (e) =>
        ["INVITE_OWN_CODE", "INVITE_ALREADY_REDEEMED"].includes(e.code),
      );
      tick(61000);
      const friend = await signUp("friend@example.test", {
        inviteCode: a.code,
      });
      assert.equal(friend.redemption.bonusTasks, 2);
      tick(61000);
      await assert.rejects(
        identity.code({
          email: "friend2@example.test",
          nonce: nonce(),
          inviteCode: a.code,
        }),
        (e) => e.code === "INVITE_INVALID",
      );
      await assert.rejects(
        identity.invites.revokeFriendCode(owner, b.id),
        (e) => e.status === 404,
        "已撤销的码不能再撤销",
      );
      const mine = await identity.invites.mine(owner);
      assert.deepEqual(
        mine.codes.map((x) => x.id).sort(),
        [a.id, b.id, c.id].sort(),
      );
    },
  );

  await t.test(
    "bonus tasks are spent only after the monthly tasks, and grants are applied once",
    async () => {
      const budget = createRecognitionBudget({
        db,
        now,
        provider: { ready: true },
      });
      await db.control((tx) =>
        tx.query(
          "UPDATE qinban_control.settings SET enabled=true,default_task_limit=1,daily_cap=1000000,monthly_cap=1000000,job_cap=1000000",
        ),
      );
      const owner = (
        await db.identity((tx) =>
          tx.query(
            "SELECT id FROM qinban_identity.users WHERE email='friend@example.test'",
          ),
        )
      ).rows[0].id;
      const [redemption] = await identity.invites.redemptionsFor(owner);
      assert.equal(
        await budget.grantCredits(owner, redemption.bonusTasks, {
          id: redemption.id,
          kind: "invite",
        }),
        true,
      );
      assert.equal(
        await budget.grantCredits(owner, redemption.bonusTasks, {
          id: redemption.id,
          kind: "invite",
        }),
        false,
        "重复发放被忽略",
      );
      assert.deepEqual(
        (({ monthlyRemaining, credits, remaining }) => ({
          monthlyRemaining,
          credits,
          remaining,
        }))(await budget.quota(owner)),
        { monthlyRemaining: 1, credits: 2, remaining: 3 },
      );
      const finish = (jid) =>
        db.control((tx) =>
          tx.query(
            "UPDATE qinban_control.job_index SET state='needs_review' WHERE id=$1",
            [jid],
          ),
        );
      const jobs = [randomUUID(), randomUUID()];
      for (const jid of jobs) {
        await db.control((tx) => budget.admit(tx, owner, jid));
        await finish(jid);
      }
      const flags = (
        await db.control((tx) =>
          tx.query(
            "SELECT id,uses_credit FROM qinban_control.job_index WHERE owner_id=$1",
            [owner],
          ),
        )
      ).rows;
      assert.deepEqual(
        jobs.map((j) => flags.find((f) => f.id === j).uses_credit),
        [false, true],
        "先用每月任务，再用赠送任务",
      );
      const q = await budget.quota(owner);
      assert.deepEqual([q.monthlyRemaining, q.credits], [0, 1]);
      await db.control((tx) => budget.releaseUnused(tx, jobs[1]));
      assert.equal(
        (await budget.quota(owner)).credits,
        2,
        "未实际调用的任务退回赠送额度",
      );
    },
  );
});

test("the sign-up route ignores a client attempt to open registration and reports invite bonuses", async (t) => {
  const { identity, mail } = await setup(t);
  let open = false;
  const server = createHostedServer({
    identity,
    operations: {
      registration: async () => ({
        open,
        friendInvitesPerUser: 3,
        friendInviteBonus: 2,
      }),
    },
  });
  t.after(() => new Promise((r) => server.close(r)));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  async function browser() {
    const jar = new Map(),
      take = (r) => {
        for (const c of r.headers.getSetCookie?.() || []) {
          const [pair] = c.split(";"),
            [k, v] = pair.split("=");
          if (v) jar.set(k, v);
          else jar.delete(k);
        }
      };
    const cookie = () => [...jar].map(([k, v]) => k + "=" + v).join("; ");
    const ctx = await fetch(base + "/auth/context", {
      headers: { cookie: cookie() },
    });
    take(ctx);
    const { csrfToken } = await ctx.json();
    return {
      post: async (path, body, csrf = csrfToken) => {
        const r = await fetch(base + path, {
          method: "POST",
          headers: {
            cookie: cookie(),
            "content-type": "application/json",
            "x-csrf-token": csrf,
            "idempotency-key": randomUUID(),
          },
          body: JSON.stringify(body),
        });
        take(r);
        return { status: r.status, data: await r.json() };
      },
      get: async (path) => {
        const r = await fetch(base + path, { headers: { cookie: cookie() } });
        return { status: r.status, data: await r.json() };
      },
    };
  }
  const forced = await browser();
  assert.equal(
    (
      await forced.post("/auth/code", {
        email: "forced@example.test",
        openRegistration: true,
      })
    ).status,
    202,
  );
  assert.equal(mail.length, 0, "客户端无法自行开放注册");

  const code = await identity.invites.createOperatorCode({
    maxUses: 1,
    bonusTasks: 4,
  });
  const visitor = await browser();
  assert.deepEqual(
    (await visitor.post("/auth/invite", { code: code.code })).data,
    { valid: true, bonusTasks: 4 },
  );
  assert.equal(
    (await visitor.post("/auth/invite", { code: "QB-AAAAA-AAAAA" })).data.code,
    "INVITE_INVALID",
  );
  const sent = await visitor.post("/auth/code", {
    email: "invited@example.test",
    inviteCode: code.code,
  });
  const verified = await visitor.post("/auth/verify", {
    challengeId: sent.data.challengeId,
    code: mail.at(-1).code,
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.isNewAccount, true);
  assert.deepEqual(verified.data.invite, { bonusTasks: 4 });
  const invites = await visitor.get("/invites");
  assert.equal(invites.status, 200);
  assert.deepEqual(
    [
      invites.data.limit,
      invites.data.bonusTasks,
      invites.data.redemption.bonusTasks,
    ],
    [3, 2, 4],
  );
  // Signed in now: writes must carry the session's CSRF token, not the sign-in one.
  const created = await visitor.post("/invites", {}, verified.data.csrfToken);
  assert.equal(created.status, 201);
  assert.match(created.data.code, /^QB-/);

  open = true;
  const newcomer = await browser();
  const s2 = await newcomer.post("/auth/code", {
    email: "newcomer@example.test",
  });
  assert.equal(
    mail.at(-1).challengeId,
    s2.data.challengeId,
    "开放注册时新邮箱可直接注册",
  );
});
