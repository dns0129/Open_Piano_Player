// @ts-check
import { randomBytes, randomInt } from "node:crypto";
import {
  sha,
  hmac,
  equal,
  fail,
  id,
  iso,
  emailKey,
  missing,
} from "./common.mjs";
import { hashPassword, checkPassword, validatePassword } from "./passwords.mjs";
import { createInvites } from "./invites.mjs";
import { log } from "../log.mjs";
export function createIdentity({ db, secret, mailer, now = () => Date.now() }) {
  if (!secret || secret.length < 32)
    throw Error("Account secret must contain at least 32 characters");
  const csrf = (scope) => hmac(secret, "csrf:" + scope),
    date = (ms) => new Date(ms).toISOString(),
    invites = createInvites({ db, secret, now });
  async function issueSession(
    tx,
    user,
    {
      purpose = "normal",
      device = "浏览器",
      remember = true,
      emailVerified = true,
    } = {},
  ) {
    const token = randomBytes(32).toString("base64url"),
      sid = id(),
      expires = date(
        now() +
          (purpose === "recover" ? 600000 : (remember ? 30 : 1) * 86400000),
      );
    await tx.query(
      "INSERT INTO qinban_identity.sessions(id,user_id,token_hash,created_at,last_seen_at,expires_at,reauthenticated_at,purpose,device) VALUES($1,$2,$3,$4,$4,$5,$8,$6,$7)",
      [
        sid,
        user.id,
        sha(token),
        date(now()),
        expires,
        purpose,
        String(device).slice(0, 120),
        emailVerified ? date(now()) : null,
      ],
    );
    return {
      token,
      session: {
        id: sid,
        userId: user.id,
        email: user.email,
        state: user.state,
        isOperator: user.is_operator === true,
        csrfToken: csrf(sid),
        reauthenticatedAt: emailVerified ? date(now()) : null,
        expiresAt: expires,
        purpose,
      },
    };
  }
  async function invite(email) {
    email = emailKey(email);
    await db.identity((tx) =>
      tx.query(
        "INSERT INTO qinban_identity.invitations(email,expires_at) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET expires_at=EXCLUDED.expires_at,consumed_at=NULL",
        [email, date(now() + 7 * 86400000)],
      ),
    );
    return { email, expiresAt: date(now() + 7 * 86400000) };
  }
  async function session(token, { recovery = false } = {}) {
    if (typeof token !== "string" || token.length > 100)
      throw fail("SESSION_REQUIRED", "请先登录账号。", 401);
    return db.identity(async (tx) => {
      const r = await tx.query(
        "SELECT s.*,u.email,u.state,u.delete_after,u.is_operator FROM qinban_identity.sessions s JOIN qinban_identity.users u ON u.id=s.user_id WHERE token_hash=$1 AND revoked_at IS NULL FOR UPDATE OF s",
        [sha(token)],
      );
      const s = r.rows[0];
      if (
        !s ||
        new Date(s.expires_at).getTime() <= now() ||
        new Date(s.last_seen_at).getTime() + 7 * 86400000 <= now() ||
        !["active", ...(recovery ? ["deletion_pending"] : [])].includes(
          s.state,
        ) ||
        (!recovery && s.purpose !== "normal")
      )
        throw fail("SESSION_REQUIRED", "登录已过期，请重新登录。", 401);
      await tx.query(
        "UPDATE qinban_identity.sessions SET last_seen_at=$1 WHERE id=$2",
        [date(now()), s.id],
      );
      return {
        id: s.id,
        userId: s.user_id,
        email: s.email,
        state: s.state,
        isOperator: s.is_operator === true,
        csrfToken: csrf(s.id),
        reauthenticatedAt: s.reauthenticated_at
          ? iso(s.reauthenticated_at)
          : null,
        expiresAt: iso(s.expires_at),
        purpose: s.purpose,
      };
    });
  }
  function recent(s) {
    if (
      !s.reauthenticatedAt ||
      new Date(s.reauthenticatedAt).getTime() + 600000 <= now()
    )
      throw fail("RECENT_AUTH_REQUIRED", "此操作需要再次验证邮箱。", 403);
  }
  // openRegistration lets any new email sign up; otherwise a new email needs an email invitation or an invite code.
  async function code({
    email,
    purpose = "login",
    nonce,
    session: current,
    ip = "local",
    inviteCode,
    openRegistration = false,
  }) {
    email = emailKey(email);
    if (!["login", "reauth", "recover", "password"].includes(purpose))
      throw fail("INVALID_PURPOSE", "验证用途无效。");
    if (purpose === "reauth" && (!current || current.email !== email))
      throw fail("REAUTH_IDENTITY", "请验证当前账号邮箱。", 403);
    if (typeof nonce !== "string" || nonce.length < 32)
      throw fail("CSRF", "请重新打开登录页面。", 403);
    const challengeId = id(),
      code = String(randomInt(0, 100000000)).padStart(8, "0"),
      expiresAt = date(now() + 600000);
    let reused = null;
    const sent = await db.identity(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "login:" + email,
      ]);
      for (const [
        subject,
        action,
        window,
        limit,
      ] of /** @type {[string, string, number, number][]} */ ([
        [hmac(secret, email), "email-send", 900000, 3],
        [hmac(secret, ip), "ip-send", 900000, 20],
        [hmac(secret, "all"), "global-send", 900000, 200],
      ])) {
        const b = Math.floor(now() / window);
        const r = await tx.query(
          "INSERT INTO qinban_identity.rate_limits VALUES($1,$2,$3,1) ON CONFLICT(subject,action,bucket) DO UPDATE SET n=qinban_identity.rate_limits.n+1 RETURNING n",
          [subject, action, b],
        );
        if (r.rows[0].n > limit) return false;
      }
      const user = (
        await tx.query("SELECT * FROM qinban_identity.users WHERE email=$1", [
          email,
        ])
      ).rows[0];
      if (
        purpose === "login" &&
        user?.state === "deletion_pending" &&
        new Date(user.delete_after) > new Date(now())
      )
        purpose = "recover";
      // A second request inside the 60 s window sends nothing. The same browser (same login nonce) gets its live
      // challenge back so the code already emailed still works; anyone else gets an unusable id, as before.
      const prior = (
        await tx.query(
          "SELECT id,nonce_hash,expires_at FROM qinban_identity.challenges WHERE email=$1 AND consumed_at IS NULL AND expires_at>$2 AND expires_at>$3 AND purpose=$4 ORDER BY expires_at DESC LIMIT 1",
          [email, date(now()), date(now() + 540000), purpose],
        )
      ).rows[0];
      if (prior) {
        const expires = new Date(prior.expires_at).getTime();
        reused = {
          challengeId: equal(prior.nonce_hash, sha(nonce))
            ? prior.id
            : challengeId,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((expires - 540000 - now()) / 1000),
          ),
          expiresAt: date(expires),
        };
        return false;
      }
      // Check a typed invite code before looking at the account, so the answer never reveals whether the email is registered.
      const inviteId =
        inviteCode && purpose === "login"
          ? await invites.resolveForSignup(tx, inviteCode, { ip })
          : null;
      // Signing in to an account in its deletion waiting period is a recovery; no separate option is needed.
      if (
        purpose === "login" &&
        user?.state === "deletion_pending" &&
        new Date(user.delete_after) > new Date(now())
      )
        purpose = "recover";
      const invitation = (
        await tx.query(
          "SELECT * FROM qinban_identity.invitations WHERE email=$1 AND expires_at>$2 AND consumed_at IS NULL",
          [email, date(now())],
        )
      ).rows[0];
      const allowed =
        purpose === "recover"
          ? user?.state === "deletion_pending" &&
            new Date(user.delete_after) > new Date(now())
          : user?.state === "active" ||
            (!user &&
              purpose === "login" &&
              !!(invitation || inviteId || openRegistration));
      await tx.query(
        "UPDATE qinban_identity.challenges SET consumed_at=$1 WHERE email=$2 AND purpose=$3 AND consumed_at IS NULL",
        [date(now()), email, purpose],
      );
      await tx.query(
        "INSERT INTO qinban_identity.challenges(id,email,nonce_hash,code_hmac,purpose,session_id,expires_at,delivery_state,invite_code_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          challengeId,
          email,
          sha(nonce),
          hmac(secret, challengeId + ":" + email + ":" + code),
          purpose,
          current?.id || null,
          expiresAt,
          allowed ? "pending" : "denied",
          user ? null : inviteId,
        ],
      );
      return !!allowed;
    });
    if (sent) {
      try {
        await mailer({ email, code, challengeId, expiresAt, purpose });
        await db.identity((tx) =>
          tx.query(
            "UPDATE qinban_identity.challenges SET delivery_state='sent' WHERE id=$1",
            [challengeId],
          ),
        );
      } catch (error) {
        log.error("auth.code-delivery-failed", { challengeId, purpose, error });
        await db.identity((tx) =>
          tx.query(
            "UPDATE qinban_identity.challenges SET delivery_state='failed',consumed_at=$1 WHERE id=$2",
            [date(now()), challengeId],
          ),
        );
      }
    }
    return reused || { challengeId, retryAfterSeconds: 60, expiresAt };
  }
  async function verify({
    challengeId,
    code,
    nonce,
    session: current,
    device = "浏览器",
    ip = "local",
    newPassword,
    expectedPurpose = "sign-in",
  }) {
    if (typeof code !== "string" || !/^\d{8}$/.test(code))
      throw fail("INVALID_CODE", "验证码无效或已过期。");
    if (newPassword !== undefined) validatePassword(newPassword);
    if (expectedPurpose === "password" && newPassword === undefined)
      throw fail("INVALID_PASSWORD", "请填写新密码。");
    const outcome = await db.identity(async (tx) => {
      const bucket = Math.floor(now() / 900000),
        ipKey = hmac(secret, ip);
      const rate = await tx.query(
        "INSERT INTO qinban_identity.rate_limits VALUES($1,'verify',$2,1) ON CONFLICT(subject,action,bucket) DO UPDATE SET n=qinban_identity.rate_limits.n+1 RETURNING n",
        [ipKey, bucket],
      );
      if (rate.rows[0].n > 60) return { error: true };
      const c = (
        await tx.query(
          "SELECT * FROM qinban_identity.challenges WHERE id=$1 FOR UPDATE",
          [challengeId],
        )
      ).rows[0];
      if (
        !c ||
        (expectedPurpose === "password"
          ? c.purpose !== "password"
          : !["login", "recover", "reauth"].includes(c.purpose)) ||
        c.consumed_at ||
        c.delivery_state !== "sent" ||
        new Date(c.expires_at).getTime() <= now() ||
        c.attempts >= 5 ||
        !equal(c.nonce_hash, sha(nonce || "")) ||
        (c.session_id && c.session_id !== current?.id)
      )
        return { error: true };
      if (
        !equal(
          c.code_hmac,
          hmac(secret, challengeId + ":" + c.email + ":" + code),
        )
      ) {
        await tx.query(
          "UPDATE qinban_identity.challenges SET attempts=attempts+1 WHERE id=$1",
          [challengeId],
        );
        return { error: true };
      }
      let user = (
        await tx.query(
          "SELECT * FROM qinban_identity.users WHERE email=$1 FOR UPDATE",
          [c.email],
        )
      ).rows[0];
      let isNewAccount = false;
      let redemption = null;
      // A login challenge is only delivered when sign-up was allowed (invitation, invite code or open registration).
      if (!user) {
        isNewAccount = true;
        if (c.purpose !== "login") return { error: true };
        const inv = (
          await tx.query(
            "SELECT * FROM qinban_identity.invitations WHERE email=$1 AND consumed_at IS NULL AND expires_at>$2 FOR UPDATE",
            [c.email, date(now())],
          )
        ).rows[0];
        user = {
          id: id(),
          email: c.email,
          state: "active",
          is_operator: inv?.is_operator === true,
        };
        await tx.query(
          "INSERT INTO qinban_identity.users(id,email,created_at,verified_at,is_operator) VALUES($1,$2,$3,$3,$4)",
          [user.id, user.email, date(now()), user.is_operator],
        );
        if (inv)
          await tx.query(
            "UPDATE qinban_identity.invitations SET consumed_at=$1 WHERE email=$2",
            [date(now()), c.email],
          );
        if (c.invite_code_id)
          redemption = await invites.applyInTx(tx, c.invite_code_id, user.id);
      }
      if (
        !["active", "deletion_pending"].includes(user.state) ||
        (user.state === "deletion_pending" &&
          (c.purpose !== "recover" ||
            new Date(user.delete_after).getTime() <= now()))
      )
        return { error: true };
      // A sign-in code can set a password only while creating a new account. Existing
      // accounts use a separate, purpose-bound email challenge, never a login code.
      if (newPassword !== undefined) {
        if (!isNewAccount && c.purpose !== "password") return { error: true };
        const encoded = await hashPassword(newPassword);
        await tx.query(
          "INSERT INTO qinban_identity.passwords(user_id,password_hash,updated_at) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,updated_at=EXCLUDED.updated_at",
          [user.id, encoded, date(now())],
        );
        await tx.query(
          "UPDATE qinban_identity.sessions SET revoked_at=$1 WHERE user_id=$2",
          [date(now()), user.id],
        );
        await tx.query(
          "UPDATE qinban_identity.challenges SET consumed_at=$1 WHERE email=$2 AND consumed_at IS NULL",
          [date(now()), user.email],
        );
      }
      await tx.query(
        "UPDATE qinban_identity.challenges SET consumed_at=$1 WHERE id=$2",
        [date(now()), challengeId],
      );
      if (c.purpose === "reauth") {
        if (current?.userId !== user.id) return { error: true };
        await tx.query(
          "UPDATE qinban_identity.sessions SET revoked_at=$1 WHERE id=$2",
          [date(now()), current.id],
        );
      }
      return {
        ...(await issueSession(tx, user, {
          purpose: c.purpose === "recover" ? "recover" : "normal",
          device,
        })),
        isNewAccount,
        redemption,
      };
    });
    if (outcome.error) throw fail("INVALID_CODE", "验证码无效或已过期。", 422);
    return outcome;
  }
  async function passwordLogin({
    email,
    password,
    remember = false,
    device = "浏览器",
    ip = "local",
  }) {
    email = emailKey(email);
    if (typeof password !== "string" || !password || password.length > 128)
      throw fail("INVALID_CREDENTIALS", "邮箱或密码不正确。", 401);
    const limited = await db.identity(async (tx) => {
      let blocked = false;
      for (const [subject, limit] of [
        [hmac(secret, "password:" + email), 10],
        [hmac(secret, "password:" + ip), 60],
      ]) {
        const r = await tx.query(
          "INSERT INTO qinban_identity.rate_limits VALUES($1,'password',$2,1) ON CONFLICT(subject,action,bucket) DO UPDATE SET n=qinban_identity.rate_limits.n+1 RETURNING n",
          [subject, Math.floor(now() / 900000)],
        );
        if (r.rows[0].n > limit) blocked = true;
      }
      return blocked;
    });
    if (limited)
      throw fail("AUTH_RATE_LIMIT", "尝试次数过多，请 15 分钟后重试。", 429);
    const record = await db.identity(
      async (tx) =>
        (
          await tx.query(
            "SELECT u.*,p.password_hash FROM qinban_identity.users u LEFT JOIN qinban_identity.passwords p ON p.user_id=u.id WHERE email=$1",
            [email],
          )
        ).rows[0],
    );
    const valid = await checkPassword(password, record?.password_hash);
    if (!valid || record?.state !== "active")
      throw fail("INVALID_CREDENTIALS", "邮箱或密码不正确。", 401);
    const result = await db.identity(async (tx) => {
      const user = (
        await tx.query(
          "SELECT * FROM qinban_identity.users WHERE id=$1 FOR UPDATE",
          [record.id],
        )
      ).rows[0];
      const credential = (
        await tx.query(
          "SELECT password_hash FROM qinban_identity.passwords WHERE user_id=$1",
          [record.id],
        )
      ).rows[0];
      // Reset and sign-in serialize on the user row; an old checked hash cannot mint a session.
      if (
        user?.state !== "active" ||
        credential?.password_hash !== record.password_hash
      )
        return null;
      return issueSession(tx, user, { device, remember, emailVerified: false });
    });
    if (!result) throw fail("INVALID_CREDENTIALS", "邮箱或密码不正确。", 401);
    return result;
  }
  return {
    csrf,
    invite,
    session,
    recent,
    code,
    verify,
    passwordLogin,
    invites,
    async accountState(userId) {
      return db.identity(
        async (tx) =>
          (
            await tx.query(
              "SELECT state FROM qinban_identity.users WHERE id=$1",
              [userId],
            )
          ).rows[0]?.state || "missing",
      );
    },
    async bootstrapOperator(email) {
      email = emailKey(email);
      await invite(email);
      await db.identity(async (tx) => {
        await tx.query(
          "UPDATE qinban_identity.invitations SET is_operator=true WHERE email=$1",
          [email],
        );
        await tx.query(
          "UPDATE qinban_identity.users SET is_operator=true WHERE email=$1",
          [email],
        );
        await tx.query(
          "UPDATE qinban_identity.sessions SET revoked_at=$1 WHERE user_id IN(SELECT id FROM qinban_identity.users WHERE email=$2)",
          [date(now()), email],
        );
      });
      return { email };
    },
    async devices(s) {
      return db.identity(async (tx) => ({
        sessions: (
          await tx.query(
            "SELECT id,device,created_at,last_seen_at,expires_at FROM qinban_identity.sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>$2 ORDER BY created_at DESC",
            [s.userId, date(now())],
          )
        ).rows.map((r) => ({
          id: r.id,
          device: r.device,
          current: r.id === s.id,
          createdAt: iso(r.created_at),
          lastSeenAt: iso(r.last_seen_at),
          expiresAt: iso(r.expires_at),
        })),
      }));
    },
    async revoke(s, sid) {
      await db.identity(async (tx) => {
        const r = await tx.query(
          "UPDATE qinban_identity.sessions SET revoked_at=$1 WHERE id=$2 AND user_id=$3 RETURNING id",
          [date(now()), sid, s.userId],
        );
        if (!r.rows.length) throw missing();
      });
    },
    async logoutAll(s) {
      recent(s);
      await db.identity((tx) =>
        tx.query(
          "UPDATE qinban_identity.sessions SET revoked_at=$1 WHERE user_id=$2",
          [date(now()), s.userId],
        ),
      );
    },
    async deleteAccount(s) {
      recent(s);
      const recoverUntil = date(now() + 30 * 86400000);
      await db.identity(async (tx) => {
        await tx.query(
          "UPDATE qinban_identity.users SET state='deletion_pending',delete_after=$1 WHERE id=$2",
          [recoverUntil, s.userId],
        );
        await tx.query(
          "UPDATE qinban_identity.sessions SET revoked_at=$1 WHERE user_id=$2",
          [date(now()), s.userId],
        );
      });
      return { state: "deletion_pending", recoverUntil };
    },
    async recover(s) {
      if (s.purpose !== "recover")
        throw fail("RECOVER_REQUIRED", "请通过原邮箱验证恢复账号。", 403);
      return db.identity(async (tx) => {
        const u = (
          await tx.query(
            "SELECT * FROM qinban_identity.users WHERE id=$1 FOR UPDATE",
            [s.userId],
          )
        ).rows[0];
        if (
          !u ||
          u.state !== "deletion_pending" ||
          new Date(u.delete_after).getTime() <= now()
        )
          throw missing();
        await tx.query(
          "UPDATE qinban_identity.users SET state='active',delete_after=NULL WHERE id=$1",
          [s.userId],
        );
        await tx.query(
          "UPDATE qinban_identity.sessions SET revoked_at=$1 WHERE user_id=$2",
          [date(now()), s.userId],
        );
        return issueSession(tx, { ...u, state: "active" });
      });
    },
  };
}
