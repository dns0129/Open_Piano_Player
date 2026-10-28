import { randomInt } from "node:crypto";
import { fail, hmac, id, iso, missing, uuid } from "./common.mjs";

// Codes look like QB-7KX2M-P9QRT: 10 characters without look-alikes (0/O, 1/I/L, U), about 49 bits.
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const LENGTH = 10;
export function normalizeInviteCode(value) {
  if (typeof value !== "string") return null;
  let raw = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length === LENGTH + 2 && raw.startsWith("QB")) raw = raw.slice(2);
  return raw.length === LENGTH &&
    [...raw].every((c) => INVITE_ALPHABET.includes(c))
    ? raw
    : null;
}
export const formatInviteCode = (raw) =>
  `QB-${raw.slice(0, 5)}-${raw.slice(5)}`;
const invalid = () =>
  fail("INVITE_INVALID", "邀请码无效、已过期或已用完。", 422);

export function createInvites({ db, secret, now = () => Date.now() }) {
  const date = (ms) => new Date(ms).toISOString(),
    hash = (raw) => hmac(secret, "invite:" + raw);
  const usable = (row, at = now()) =>
    row &&
    !row.disabled_at &&
    row.uses < row.max_uses &&
    (!row.expires_at || new Date(row.expires_at).getTime() > at);
  const view = (r) => ({
    id: r.id,
    hint: r.code_hint,
    kind: r.kind,
    maxUses: r.max_uses,
    uses: r.uses,
    bonusTasks: r.bonus_tasks,
    note: r.note,
    expiresAt: r.expires_at ? iso(r.expires_at) : null,
    disabled: !!r.disabled_at,
    usable: usable(r),
    createdAt: iso(r.created_at),
  });
  // Counts against a per-subject budget in the shared rate-limit table; false once the window is spent.
  async function allow(tx, subject, action, limit, windowMs = 900000) {
    const r = await tx.query(
      "INSERT INTO qinban_identity.rate_limits VALUES($1,$2,$3,1) ON CONFLICT(subject,action,bucket) DO UPDATE SET n=qinban_identity.rate_limits.n+1 RETURNING n",
      [hmac(secret, subject), action, Math.floor(now() / windowMs)],
    );
    return r.rows[0].n <= limit;
  }
  async function find(tx, value, { lock = false } = {}) {
    const raw = normalizeInviteCode(value);
    if (!raw) return null;
    return (
      (
        await tx.query(
          `SELECT * FROM qinban_identity.invite_codes WHERE code_hash=$1${lock ? " FOR UPDATE" : ""}`,
          [hash(raw)],
        )
      ).rows[0] || null
    );
  }
  async function insert(
    tx,
    {
      kind,
      createdBy = null,
      maxUses,
      bonusTasks,
      expiresAt = null,
      note = "",
    },
  ) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const raw = Array.from(
          { length: LENGTH },
          () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)],
        ).join(""),
        row = { id: id(), created_at: date(now()) };
      const r = await tx.query(
        "INSERT INTO qinban_identity.invite_codes(id,code_hash,code_hint,kind,created_by,max_uses,bonus_tasks,note,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(code_hash) DO NOTHING RETURNING *",
        [
          row.id,
          hash(raw),
          raw.slice(-4),
          kind,
          createdBy,
          maxUses,
          bonusTasks,
          note,
          expiresAt,
          row.created_at,
        ],
      );
      // The full code is returned exactly once, at creation.
      if (r.rows.length)
        return { ...view(r.rows[0]), code: formatInviteCode(raw) };
    }
    throw fail("INVITE_UNAVAILABLE", "暂时无法生成邀请码，请重试。", 503);
  }
  function integerIn(value, min, max, message) {
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw fail("INVALID_INVITE", message);
    return value;
  }
  // Inside the email-verification transaction: lock the code, re-check it and record the redemption.
  async function applyInTx(tx, codeId, userId) {
    const row = (
      await tx.query(
        "SELECT * FROM qinban_identity.invite_codes WHERE id=$1 FOR UPDATE",
        [codeId],
      )
    ).rows[0];
    if (!usable(row) || row.created_by === userId) return null;
    if (
      (
        await tx.query(
          "SELECT 1 FROM qinban_identity.invite_redemptions WHERE user_id=$1",
          [userId],
        )
      ).rows.length
    )
      return null;
    const redemption = { id: id(), bonusTasks: row.bonus_tasks };
    await tx.query(
      "UPDATE qinban_identity.invite_codes SET uses=uses+1 WHERE id=$1",
      [codeId],
    );
    await tx.query(
      "INSERT INTO qinban_identity.invite_redemptions(id,code_id,user_id,bonus_tasks,redeemed_at) VALUES($1,$2,$3,$4,$5)",
      [redemption.id, codeId, userId, row.bonus_tasks, date(now())],
    );
    return redemption;
  }
  return {
    applyInTx,
    // The sign-up form checks a code before sending email; limited per address to stop guessing.
    async check(value, { ip = "local" } = {}) {
      return db.identity(async (tx) => {
        if (!(await allow(tx, "invite-check:" + ip, "invite-check", 30)))
          throw fail("RATE_LIMITED", "尝试次数过多，请稍后再试。", 429);
        const row = await find(tx, value);
        if (!usable(row)) throw invalid();
        return { valid: true, bonusTasks: row.bonus_tasks };
      });
    },
    // Resolves a code typed at sign-up to its id; unusable codes are rejected before any mail is sent.
    async resolveForSignup(tx, value, { ip = "local" } = {}) {
      if (!(await allow(tx, "invite-signup:" + ip, "invite-check", 30)))
        throw fail("RATE_LIMITED", "尝试次数过多，请稍后再试。", 429);
      const row = await find(tx, value);
      if (!usable(row)) throw invalid();
      return row.id;
    },
    // An existing account without a redemption may still enter a code once.
    async redeem(userId, value, { ip = "local" } = {}) {
      return db.identity(async (tx) => {
        if (
          !(await allow(
            tx,
            "invite-redeem:" + userId + ":" + ip,
            "invite-redeem",
            10,
          ))
        )
          throw fail("RATE_LIMITED", "尝试次数过多，请稍后再试。", 429);
        if (
          (
            await tx.query(
              "SELECT 1 FROM qinban_identity.invite_redemptions WHERE user_id=$1",
              [userId],
            )
          ).rows.length
        )
          throw fail(
            "INVITE_ALREADY_REDEEMED",
            "每个账号只能使用一次邀请码。",
            409,
          );
        const row = await find(tx, value, { lock: true });
        if (!usable(row)) throw invalid();
        if (row.created_by === userId)
          throw fail("INVITE_OWN_CODE", "不能使用自己生成的邀请码。", 409);
        return applyInTx(tx, row.id, userId);
      });
    },
    async redemptionsFor(userId) {
      return (
        await db.identity((tx) =>
          tx.query(
            "SELECT id,bonus_tasks,redeemed_at FROM qinban_identity.invite_redemptions WHERE user_id=$1",
            [userId],
          ),
        )
      ).rows.map((r) => ({
        id: r.id,
        bonusTasks: r.bonus_tasks,
        redeemedAt: iso(r.redeemed_at),
      }));
    },
    async mine(userId) {
      return db.identity(async (tx) => {
        const codes = (
          await tx.query(
            "SELECT * FROM qinban_identity.invite_codes WHERE created_by=$1 AND kind='friend' ORDER BY created_at DESC",
            [userId],
          )
        ).rows.map(view);
        const r = (
          await tx.query(
            "SELECT bonus_tasks,redeemed_at FROM qinban_identity.invite_redemptions WHERE user_id=$1",
            [userId],
          )
        ).rows[0];
        return {
          codes,
          redemption: r
            ? { bonusTasks: r.bonus_tasks, redeemedAt: iso(r.redeemed_at) }
            : null,
        };
      });
    },
    // Friend codes: single use, 30 days. Revoked unused codes free their slot; used ones keep it.
    async createFriendCode(userId, { limit, bonusTasks }) {
      return db.identity(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          "friend-invites:" + userId,
        ]);
        const n = Number(
          (
            await tx.query(
              "SELECT COUNT(*) AS n FROM qinban_identity.invite_codes WHERE created_by=$1 AND kind='friend' AND (disabled_at IS NULL OR uses>0)",
              [userId],
            )
          ).rows[0].n,
        );
        if (n >= limit)
          throw fail(
            "INVITE_LIMIT",
            limit
              ? `每个账号最多生成 ${limit} 个好友邀请码。`
              : "好友邀请暂未开放。",
            409,
          );
        return insert(tx, {
          kind: "friend",
          createdBy: userId,
          maxUses: 1,
          bonusTasks,
          expiresAt: date(now() + 30 * 86400000),
        });
      });
    },
    async revokeFriendCode(userId, codeId) {
      if (!uuid(codeId)) throw missing();
      return db.identity(async (tx) => {
        const r = await tx.query(
          "UPDATE qinban_identity.invite_codes SET disabled_at=$1 WHERE id=$2 AND created_by=$3 AND kind='friend' AND disabled_at IS NULL RETURNING *",
          [date(now()), codeId, userId],
        );
        if (!r.rows.length) throw missing();
        return view(r.rows[0]);
      });
    },
    async createOperatorCode({
      createdBy = null,
      maxUses,
      bonusTasks,
      expiresInDays,
      note = "",
    }) {
      integerIn(maxUses, 1, 10000, "可用次数须为 1–10000。");
      integerIn(bonusTasks, 0, 1000, "赠送任务数须为 0–1000。");
      if (expiresInDays !== null && expiresInDays !== undefined)
        integerIn(expiresInDays, 1, 3650, "有效天数须为 1–3650。");
      if (typeof note !== "string" || note.length > 200)
        throw fail("INVALID_INVITE", "备注最多 200 字。");
      return db.identity((tx) =>
        insert(tx, {
          kind: "operator",
          createdBy,
          maxUses,
          bonusTasks,
          note: note.trim(),
          expiresAt: expiresInDays
            ? date(now() + expiresInDays * 86400000)
            : null,
        }),
      );
    },
    async list() {
      return db.identity(async (tx) => ({
        codes: (
          await tx.query(
            "SELECT c.*,u.email AS creator_email,(SELECT COUNT(*) FROM qinban_identity.invite_redemptions r WHERE r.code_id=c.id) AS redemptions FROM qinban_identity.invite_codes c LEFT JOIN qinban_identity.users u ON u.id=c.created_by ORDER BY c.created_at DESC LIMIT 200",
          )
        ).rows.map((r) => ({
          ...view(r),
          creatorEmail: r.creator_email || null,
        })),
      }));
    },
    async disable(codeId) {
      if (!uuid(codeId)) throw missing();
      return db.identity(async (tx) => {
        const r = await tx.query(
          "UPDATE qinban_identity.invite_codes SET disabled_at=COALESCE(disabled_at,$1) WHERE id=$2 RETURNING *",
          [date(now()), codeId],
        );
        if (!r.rows.length) throw missing();
        return view(r.rows[0]);
      });
    },
  };
}
