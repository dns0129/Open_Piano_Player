// @ts-check
import {
  Environment,
  GetTransactionHistoryVersion,
  Order,
  Type,
} from "@apple/app-store-server-library";
import { fail, id, sha, uuid } from "./common.mjs";
import { APPLE_BILLING_VERSION } from "./apple-config.mjs";
export { loadAppleBillingConfiguration } from "./apple-config.mjs";

const lifecycle = new Set([
  "SUBSCRIBED",
  "DID_RENEW",
  "ONE_TIME_CHARGE",
  "OFFER_REDEEMED",
  "REFUND",
  "REFUND_REVERSED",
  "REVOKE",
  "EXPIRED",
  "DID_FAIL_TO_RENEW",
  "DID_CHANGE_RENEWAL_STATUS",
  "DID_CHANGE_RENEWAL_PREF",
  "GRACE_PERIOD_EXPIRED",
  "RENEWAL_EXTENDED",
]);
const transactionId = (value) =>
  typeof value === "string" && /^\d{1,64}$/.test(value);
const millis = (value) => Number.isSafeInteger(value) && value > 0;
const invalid = () =>
  fail("APPLE_VERIFICATION", "苹果交易验证失败，请稍后重试或联系支持。", 400);
const unavailable = () =>
  fail("APPLE_UNAVAILABLE", "App Store 购买暂未开通。", 503);

/** The only injection point is this server-side constructor, never an HTTP flag. */
export function createAppleBilling({
  db,
  wallet,
  config,
  now = () => Date.now(),
}) {
  const environment = config?.environment,
    enabled = config?.available === true,
    products = config?.products || [],
    byAppleId = new Map(products.map((p) => [p.appleProductId, p])),
    date = () => new Date(now()).toISOString();
  if (
    enabled &&
    (![Environment.PRODUCTION, Environment.SANDBOX].includes(environment) ||
      !config.verifier ||
      !config.api)
  )
    throw Error(
      "App Store requires verified Sandbox or Production configuration",
    );

  function ready() {
    if (!enabled) throw unavailable();
  }
  function ownerOf(session) {
    if (!uuid(session?.userId))
      throw fail("SESSION_REQUIRED", "请先登录账号。", 401);
    return session.userId;
  }
  function signed(value) {
    if (
      typeof value !== "string" ||
      value.length > 64000 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
    )
      throw invalid();
    return value;
  }
  async function decode(method, value) {
    ready();
    try {
      return await config.verifier[method](signed(value));
    } catch {
      throw invalid();
    }
  }
  async function api(method, ...args) {
    try {
      return await config.api[method](...args);
    } catch {
      throw fail(
        "APPLE_RETRY",
        "暂时无法确认苹果交易，请稍后重试；无需再次购买。",
        503,
      );
    }
  }
  function normalize(value) {
    const product = byAppleId.get(value?.productId);
    if (
      !product ||
      value.bundleId !== config.bundleId ||
      value.environment !== environment ||
      !transactionId(value.transactionId) ||
      !transactionId(value.originalTransactionId) ||
      !uuid(value.appAccountToken) ||
      value.quantity !== 1 ||
      value.inAppOwnershipType !== "PURCHASED" ||
      value.type !==
        (product.kind === "subscription"
          ? Type.AUTO_RENEWABLE_SUBSCRIPTION
          : Type.CONSUMABLE) ||
      !millis(value.purchaseDate) ||
      !millis(value.signedDate) ||
      value.purchaseDate > now() + 300000 ||
      value.signedDate > now() + 300000 ||
      (product.kind === "subscription" &&
        (!millis(value.expiresDate) ||
          value.expiresDate <= value.purchaseDate)) ||
      (value.revocationDate != null &&
        (!millis(value.revocationDate) ||
          value.revocationDate > now() + 300000))
    )
      throw invalid();
    return {
      ...value,
      appAccountToken: value.appAccountToken.toLowerCase(),
      product,
    };
  }
  async function renewal(value, transaction) {
    if (!value) return null;
    const r = await decode("verifyAndDecodeRenewalInfo", value);
    if (
      r.environment !== environment ||
      r.originalTransactionId !== transaction.originalTransactionId ||
      !millis(r.signedDate) ||
      r.signedDate > now() + 300000 ||
      (r.autoRenewStatus != null && ![0, 1].includes(r.autoRenewStatus)) ||
      (r.gracePeriodExpiresDate != null && !millis(r.gracePeriodExpiresDate))
    )
      throw invalid();
    return r;
  }
  async function notDeleted(tx, owner) {
    if (
      (
        await tx.query(
          "SELECT 1 FROM qinban_control.deleted_accounts WHERE owner_id=$1",
          [owner],
        )
      ).rows.length
    )
      throw fail("ACCOUNT_DELETED", "账号已删除，无法继续购买。", 409);
  }
  async function ensureEnvironment(tx) {
    await tx.query(
      "INSERT INTO qinban_control.apple_environment(id,environment) VALUES(1,$1) ON CONFLICT(id) DO NOTHING",
      [environment],
    );
    const row = (
      await tx.query(
        "SELECT environment FROM qinban_control.apple_environment WHERE id=1",
      )
    ).rows[0];
    if (row.environment !== environment)
      throw fail(
        "APPLE_ENVIRONMENT_MISMATCH",
        "此数据库已绑定另一购买环境，请使用独立的测试或正式数据库。",
        503,
      );
  }
  async function ensureAccount(tx, owner) {
    await ensureEnvironment(tx);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      owner + ":points",
    ]);
    await notDeleted(tx, owner);
    await tx.query(
      "INSERT INTO qinban_control.apple_accounts(environment,account_token,owner_id,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(environment,owner_id) DO NOTHING",
      [environment, id(), owner, date()],
    );
    return (
      await tx.query(
        "SELECT * FROM qinban_control.apple_accounts WHERE environment=$1 AND owner_id=$2",
        [environment, owner],
      )
    ).rows[0];
  }
  async function revokeGrant(tx, row, revoked) {
    const g = (
      await tx.query(
        "SELECT * FROM qinban_control.point_grants WHERE id=$1 FOR UPDATE",
        [row.grant_id],
      )
    ).rows[0];
    if (!g || Boolean(g.revoked_at) === revoked) return;
    await tx.query(
      "UPDATE qinban_control.point_grants SET revoked_at=$1 WHERE id=$2",
      [revoked ? date() : null, g.id],
    );
    const available = g.amount - g.spent - g.held;
    await tx.query(
      "INSERT INTO qinban_control.point_events VALUES($1,$2,$3,$4,$5,$6)",
      [
        id(),
        row.owner_id,
        revoked ? "apple_refund" : "apple_refund_reversed",
        revoked ? -available : available,
        row.grant_id,
        date(),
      ],
    );
  }
  async function membership(tx, row, context) {
    if (row.product_kind !== "subscription") return;
    const old = (
      await tx.query(
        "SELECT * FROM qinban_control.apple_subscriptions WHERE environment=$1 AND original_transaction_id=$2 FOR UPDATE",
        [environment, row.original_transaction_id],
      )
    ).rows[0];
    const newerPurchase =
      !old ||
      Number(row.purchase_ms) > Number(old.purchase_ms) ||
      (Number(row.purchase_ms) === Number(old.purchase_ms) &&
        BigInt(row.transaction_id) > BigInt(old.transaction_id));
    if (old && !newerPurchase && old.transaction_id !== row.transaction_id)
      return;
    if (old && old.owner_id !== row.owner_id) throw invalid();
    const r = context.renewal,
      version = context.evidenceVersion || Number(row.version_ms),
      freshState = !old || newerPurchase || version >= Number(old.version_ms),
      freshRenewal =
        r && (!old || r.signedDate >= Number(old.renewal_version_ms));
    if (!freshState && !freshRenewal && !context.revocationChanged) return;
    let status = freshState
      ? context.status || (Number(row.expires_ms) > now() ? 1 : 2)
      : old.status;
    if (row.revoked_ms) status = 5;
    else if (context.revocationChanged && old?.status === 5)
      status = Number(row.expires_ms) > now() ? 1 : 2;
    else if (
      freshState &&
      ["EXPIRED", "GRACE_PERIOD_EXPIRED"].includes(context.type)
    )
      status = 2;
    else if (freshState && context.type === "DID_FAIL_TO_RENEW")
      status = r?.gracePeriodExpiresDate > now() ? 4 : 3;
    const autoRenew =
      freshRenewal && r.autoRenewStatus != null
        ? r.autoRenewStatus === 1
        : (old?.auto_renew ?? null);
    const grace =
      status === 4
        ? freshRenewal
          ? r.gracePeriodExpiresDate || null
          : old?.grace_expires_ms || null
        : null;
    await tx.query(
      `INSERT INTO qinban_control.apple_subscriptions
      (environment,original_transaction_id,owner_id,transaction_id,product_id,apple_product_id,purchase_ms,expires_ms,revoked_ms,status,auto_renew,grace_expires_ms,version_ms,renewal_version_ms,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT(environment,original_transaction_id) DO UPDATE SET
      transaction_id=EXCLUDED.transaction_id,product_id=EXCLUDED.product_id,apple_product_id=EXCLUDED.apple_product_id,
      purchase_ms=EXCLUDED.purchase_ms,expires_ms=EXCLUDED.expires_ms,revoked_ms=EXCLUDED.revoked_ms,
      status=EXCLUDED.status,auto_renew=EXCLUDED.auto_renew,grace_expires_ms=EXCLUDED.grace_expires_ms,
      version_ms=EXCLUDED.version_ms,renewal_version_ms=EXCLUDED.renewal_version_ms,updated_at=EXCLUDED.updated_at`,
      [
        environment,
        row.original_transaction_id,
        row.owner_id,
        row.transaction_id,
        row.product_id,
        row.apple_product_id,
        row.purchase_ms,
        row.expires_ms,
        row.revoked_ms,
        status,
        autoRenew,
        grace,
        Math.max(version, Number(old?.version_ms || 0)),
        freshRenewal ? r.signedDate : Number(old?.renewal_version_ms || 0),
        date(),
      ],
    );
  }
  async function accept(tx, data, context = {}, expectedOwner = null) {
    await ensureEnvironment(tx);
    const mapping = (
      await tx.query(
        "SELECT * FROM qinban_control.apple_accounts WHERE environment=$1 AND account_token=$2",
        [environment, data.appAccountToken],
      )
    ).rows[0];
    if (
      expectedOwner &&
      (!mapping || mapping.owner_id !== expectedOwner || mapping.retired_at)
    )
      throw fail(
        "APPLE_ACCOUNT_MISMATCH",
        "这笔购买属于其他琴伴账号，请使用购买时的账号登录。",
        409,
      );
    if (!mapping || mapping.retired_at || !mapping.owner_id)
      return {
        duplicate: false,
        outcome: mapping ? "retired_account" : "unknown_account",
      };
    const owner = mapping.owner_id;
    if (
      (
        await tx.query(
          "SELECT 1 FROM qinban_control.deleted_accounts WHERE owner_id=$1",
          [owner],
        )
      ).rows.length
    )
      return { duplicate: false, outcome: "retired_account" };
    try {
      await wallet.lock(tx, owner);
    } catch (error) {
      if (!expectedOwner && error.code === "ACCOUNT_DELETED")
        return { duplicate: false, outcome: "retired_account" };
      throw error;
    }
    const lockedMapping = (
      await tx.query(
        "SELECT owner_id,retired_at FROM qinban_control.apple_accounts WHERE environment=$1 AND account_token=$2 FOR UPDATE",
        [environment, data.appAccountToken],
      )
    ).rows[0];
    if (!lockedMapping?.owner_id || lockedMapping.retired_at) {
      if (expectedOwner)
        throw fail("ACCOUNT_DELETED", "账号已删除，无法继续购买。", 409);
      return { duplicate: false, outcome: "retired_account" };
    }
    const original = (
      await tx.query(
        "SELECT account_token,owner_id FROM qinban_control.apple_transactions WHERE environment=$1 AND original_transaction_id=$2 LIMIT 1",
        [environment, data.originalTransactionId],
      )
    ).rows[0];
    if (
      original &&
      (original.account_token !== data.appAccountToken ||
        original.owner_id !== owner)
    )
      throw fail(
        "APPLE_ACCOUNT_MISMATCH",
        "原购买已绑定其他账号，无法转移购买权益。",
        409,
      );
    let row = (
      await tx.query(
        "SELECT * FROM qinban_control.apple_transactions WHERE environment=$1 AND transaction_id=$2 FOR UPDATE",
        [environment, data.transactionId],
      )
    ).rows[0];
    const duplicate = !!row;
    if (
      row &&
      (row.owner_id !== owner ||
        row.account_token !== data.appAccountToken ||
        row.original_transaction_id !== data.originalTransactionId ||
        row.apple_product_id !== data.productId ||
        Number(row.purchase_ms) !== data.purchaseDate)
    )
      throw invalid();
    const version = Math.max(
        data.signedDate,
        context.signedMs || 0,
        context.renewal?.signedDate || 0,
      ),
      isReversal = context.type === "REFUND_REVERSED",
      incomingRevocation = isReversal
        ? null
        : data.revocationDate ||
          (["REFUND", "REVOKE"].includes(context.type) || context.status === 5
            ? context.signedMs || data.signedDate
            : null);
    // A later re-signing of ordinary transaction data must not supersede a
    // delayed refund/reversal event. Order this financial state independently.
    const revocationVersion = isReversal
      ? context.signedMs || data.signedDate
      : incomingRevocation
        ? Math.max(
            incomingRevocation,
            ["REFUND", "REVOKE"].includes(context.type)
              ? context.signedMs || 0
              : 0,
          )
        : 0;
    const revocationAccepted =
      revocationVersion > 0 &&
      revocationVersion >= Number(row?.revocation_version_ms || 0);
    const oldRevocation = row?.revoked_ms ?? null;
    if (!row) {
      row = (
        await tx.query(
          `INSERT INTO qinban_control.apple_transactions
        (environment,transaction_id,original_transaction_id,account_token,owner_id,product_id,apple_product_id,product_kind,points,purchase_ms,expires_ms,revoked_ms,version_ms,revocation_version_ms,grant_id,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) RETURNING *`,
          [
            environment,
            data.transactionId,
            data.originalTransactionId,
            data.appAccountToken,
            owner,
            data.product.id,
            data.productId,
            data.product.kind,
            data.product.points,
            data.purchaseDate,
            data.expiresDate || null,
            incomingRevocation,
            version,
            revocationVersion,
            `apple:${environment}:${data.transactionId}`,
            date(),
          ],
        )
      ).rows[0];
    } else if (version >= Number(row.version_ms) || revocationAccepted) {
      // A normal replay never clears a refund tombstone. Only Apple's signed
      // REFUND_REVERSED event can reinstate a previously refunded grant.
      const revoked = revocationAccepted
        ? isReversal
          ? null
          : incomingRevocation
        : row.revoked_ms;
      const expires =
        version >= Number(row.version_ms)
          ? data.expiresDate || row.expires_ms
          : row.expires_ms;
      row = (
        await tx.query(
          "UPDATE qinban_control.apple_transactions SET expires_ms=$1,revoked_ms=$2,version_ms=$3,updated_at=$4,revocation_version_ms=$7 WHERE environment=$5 AND transaction_id=$6 RETURNING *",
          [
            expires,
            revoked,
            Math.max(version, Number(row.version_ms)),
            date(),
            environment,
            data.transactionId,
            revocationAccepted
              ? revocationVersion
              : Number(row.revocation_version_ms),
          ],
        )
      ).rows[0];
    }
    if (!row.revoked_ms) {
      await wallet.grant(tx, owner, {
        key: row.grant_id,
        kind: "apple",
        amount: row.points,
        productId: row.product_id,
        startsAt: new Date(Number(row.purchase_ms)).toISOString(),
        expiresAt: null,
      });
      if (isReversal && revocationAccepted) await revokeGrant(tx, row, false);
    } else await revokeGrant(tx, row, true);
    await membership(tx, row, {
      ...context,
      evidenceVersion: version,
      revocationChanged: (oldRevocation != null) !== (row.revoked_ms != null),
    });
    return {
      duplicate,
      outcome: "processed",
      transactionId: data.transactionId,
    };
  }
  function subscriptionView(s) {
    const expired = Number(s.expires_ms) <= now(),
      grace = s.status === 4 && Number(s.grace_expires_ms) > now(),
      status =
        s.revoked_ms || s.status === 5
          ? "revoked"
          : !expired
            ? "active"
            : grace
              ? "gracePeriod"
              : s.status === 3
                ? "billingRetry"
                : "expired";
    return {
      productId: s.product_id,
      appleProductId: s.apple_product_id,
      status,
      startsAt: new Date(Number(s.purchase_ms)).toISOString(),
      expiresAt: new Date(Number(s.expires_ms)).toISOString(),
      gracePeriodExpiresAt: s.grace_expires_ms
        ? new Date(Number(s.grace_expires_ms)).toISOString()
        : null,
      autoRenew: s.auto_renew,
    };
  }
  async function account(session) {
    const owner = ownerOf(session);
    if (!enabled)
      return {
        available: false,
        environment: null,
        appAccountToken: null,
        subscription: null,
        transactions: [],
      };
    return db.control(async (tx) => {
      const a = await ensureAccount(tx, owner),
        subs = (
          await tx.query(
            "SELECT * FROM qinban_control.apple_subscriptions WHERE environment=$1 AND owner_id=$2 ORDER BY expires_ms DESC,purchase_ms DESC",
            [environment, owner],
          )
        ).rows.map(subscriptionView),
        transactions = (
          await tx.query(
            "SELECT transaction_id,product_id,apple_product_id,points,purchase_ms,expires_ms,revoked_ms FROM qinban_control.apple_transactions WHERE environment=$1 AND owner_id=$2 ORDER BY purchase_ms DESC LIMIT 100",
            [environment, owner],
          )
        ).rows.map((t) => ({
          transactionId: t.transaction_id,
          productId: t.product_id,
          appleProductId: t.apple_product_id,
          points: t.points,
          purchasedAt: new Date(Number(t.purchase_ms)).toISOString(),
          expiresAt: t.expires_ms
            ? new Date(Number(t.expires_ms)).toISOString()
            : null,
          revoked: t.revoked_ms != null,
        }));
      return {
        available: true,
        environment,
        appAccountToken: a.account_token,
        subscription:
          subs.find((s) => ["active", "gracePeriod"].includes(s.status)) ||
          subs[0] ||
          null,
        transactions,
      };
    });
  }
  /** @param {any} session @param {{signedTransaction?: string}} input */
  async function verifyPurchase(session, { signedTransaction } = {}) {
    ready();
    const owner = ownerOf(session),
      submitted = normalize(
        await decode("verifyAndDecodeTransaction", signedTransaction),
      );
    // Confirm account binding before an expensive authenticated Apple API call.
    await db.control(async (tx) => {
      const a = await ensureAccount(tx, owner);
      if (a.account_token !== submitted.appAccountToken)
        throw fail(
          "APPLE_ACCOUNT_MISMATCH",
          "这笔购买属于其他琴伴账号，请切换到购买时的账号。",
          409,
        );
    });
    // The submitted JWS may predate a refund. Always reconcile its current
    // transaction from Apple's server before delivering or finishing a purchase.
    const latest = await api("getTransactionInfo", submitted.transactionId),
      data = normalize(
        await decode(
          "verifyAndDecodeTransaction",
          latest?.signedTransactionInfo,
        ),
      );
    if (
      data.transactionId !== submitted.transactionId ||
      data.originalTransactionId !== submitted.originalTransactionId ||
      data.appAccountToken !== submitted.appAccountToken
    )
      throw invalid();
    const result = await db.control((tx) => accept(tx, data, {}, owner));
    return {
      accepted: true,
      duplicate: result.duplicate,
      transactionId: data.transactionId,
      account: await account(session),
    };
  }
  async function notification(raw) {
    ready();
    let body = raw;
    if (Buffer.isBuffer(body) || typeof body === "string") {
      try {
        body = JSON.parse(String(body));
      } catch {
        throw invalid();
      }
    }
    const payload = signed(body?.signedPayload),
      n = await decode("verifyAndDecodeNotification", payload);
    if (
      !uuid(n.notificationUUID) ||
      !millis(n.signedDate) ||
      n.signedDate > now() + 300000 ||
      typeof n.notificationType !== "string" ||
      n.notificationType.length > 100 ||
      n.version !== "2.0"
    )
      throw invalid();
    if (
      n.data &&
      (n.data.bundleId !== config.bundleId ||
        n.data.environment !== environment ||
        (environment === Environment.PRODUCTION &&
          n.data.appAppleId !== config.appAppleId))
    )
      throw invalid();
    const digest = sha(payload),
      previous = (
        await db.control((tx) =>
          tx.query(
            "SELECT payload_hash FROM qinban_control.apple_notifications WHERE environment=$1 AND notification_uuid=$2",
            [environment, n.notificationUUID],
          ),
        )
      ).rows[0];
    if (previous) {
      if (previous.payload_hash !== digest) throw invalid();
      return {
        accepted: true,
        duplicate: true,
        notificationUUID: n.notificationUUID,
      };
    }
    let data, r;
    if (lifecycle.has(n.notificationType)) {
      data = normalize(
        await decode(
          "verifyAndDecodeTransaction",
          n.data?.signedTransactionInfo,
        ),
      );
      r = await renewal(n.data?.signedRenewalInfo, data);
      if (n.data?.status != null && ![1, 2, 3, 4, 5].includes(n.data.status))
        throw invalid();
    }
    return db.control(async (tx) => {
      // Serialize the UUID before any wallet change; retries race safely with purchases.
      await ensureEnvironment(tx);
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "apple-notification:" + environment + ":" + n.notificationUUID,
      ]);
      const duplicate = (
        await tx.query(
          "SELECT payload_hash FROM qinban_control.apple_notifications WHERE environment=$1 AND notification_uuid=$2",
          [environment, n.notificationUUID],
        )
      ).rows[0];
      if (duplicate) {
        if (duplicate.payload_hash !== digest) throw invalid();
        return {
          accepted: true,
          duplicate: true,
          notificationUUID: n.notificationUUID,
        };
      }
      const result = data
        ? await accept(tx, data, {
            type: n.notificationType,
            signedMs: n.signedDate,
            status: n.data?.status,
            renewal: r,
          })
        : { outcome: "ignored" };
      await tx.query(
        "INSERT INTO qinban_control.apple_notifications(environment,notification_uuid,payload_hash,notification_type,signed_ms,transaction_id,outcome,received_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          environment,
          n.notificationUUID,
          digest,
          n.notificationType,
          n.signedDate,
          data?.transactionId || null,
          result.outcome,
          date(),
        ],
      );
      return {
        accepted: true,
        duplicate: false,
        notificationUUID: n.notificationUUID,
      };
    });
  }
  async function sync(session) {
    ready();
    const owner = ownerOf(session);
    const anchors = await db.control(async (tx) => {
      const a = await ensureAccount(tx, owner);
      await wallet.lock(tx, owner);
      const locked = (
        await tx.query(
          "SELECT * FROM qinban_control.apple_accounts WHERE environment=$1 AND account_token=$2 FOR UPDATE",
          [environment, a.account_token],
        )
      ).rows[0];
      if (
        locked.last_synced_at &&
        now() - new Date(locked.last_synced_at).getTime() < 30000
      )
        throw fail("APPLE_SYNC_RATE_LIMIT", "请稍候 30 秒再恢复购买。", 429);
      await tx.query(
        "UPDATE qinban_control.apple_accounts SET last_synced_at=$1 WHERE environment=$2 AND account_token=$3",
        [date(), environment, a.account_token],
      );
      return (
        await tx.query(
          "SELECT original_transaction_id,product_kind,MAX(purchase_ms) AS latest FROM qinban_control.apple_transactions WHERE environment=$1 AND owner_id=$2 GROUP BY original_transaction_id,product_kind ORDER BY latest DESC LIMIT 20",
          [environment, owner],
        )
      ).rows;
    });
    let reconciled = 0;
    const seen = new Set();
    for (const anchor of anchors) {
      if (anchor.product_kind === "consumable") {
        const response = await api(
            "getTransactionInfo",
            anchor.original_transaction_id,
          ),
          data = normalize(
            await decode(
              "verifyAndDecodeTransaction",
              response?.signedTransactionInfo,
            ),
          );
        if (data.transactionId !== anchor.original_transaction_id)
          throw invalid();
        await db.control((tx) => accept(tx, data, {}, owner));
        reconciled++;
        continue;
      }
      let revision,
        more = true;
      for (let page = 0; more && page < 20; page++) {
        const history = await api(
          "getTransactionHistory",
          anchor.original_transaction_id,
          revision,
          {
            sort: Order.ASCENDING,
            productIds: products.map((p) => p.appleProductId),
          },
          GetTransactionHistoryVersion.V2,
        );
        if (!Array.isArray(history?.signedTransactions)) throw invalid();
        for (const jws of history.signedTransactions) {
          const data = normalize(
            await decode("verifyAndDecodeTransaction", jws),
          );
          const a = await account(session);
          // Apple history can include a different Qinban account belonging to
          // this Apple ID. It is neither transferred nor returned to this user.
          if (
            data.appAccountToken !== a.appAccountToken ||
            seen.has(data.transactionId)
          )
            continue;
          await db.control((tx) => accept(tx, data, {}, owner));
          seen.add(data.transactionId);
          reconciled++;
        }
        more = history.hasMore === true;
        if (
          more &&
          (typeof history.revision !== "string" ||
            history.revision === revision)
        )
          throw invalid();
        revision = history.revision;
        if (more && page === 19)
          throw fail(
            "APPLE_SYNC_INCOMPLETE",
            "购买历史较长，已保存本次核对结果，请联系支持继续核对。",
            503,
          );
      }
      const response = await api(
        "getAllSubscriptionStatuses",
        anchor.original_transaction_id,
      );
      if (!Array.isArray(response?.data)) throw invalid();
      for (const group of response.data)
        for (const last of group.lastTransactions || []) {
          const data = normalize(
              await decode(
                "verifyAndDecodeTransaction",
                last.signedTransactionInfo,
              ),
            ),
            a = await account(session);
          if (data.appAccountToken !== a.appAccountToken) continue;
          const r = await renewal(last.signedRenewalInfo, data);
          if (![1, 2, 3, 4, 5].includes(last.status)) throw invalid();
          await db.control((tx) =>
            accept(tx, data, { status: last.status, renewal: r }, owner),
          );
        }
    }
    return { accepted: true, reconciled, account: await account(session) };
  }
  return {
    initialize: () =>
      enabled ? db.control(ensureEnvironment) : Promise.resolve(),
    catalog: () => ({
      available: enabled,
      environment: enabled ? environment : null,
      billingVersion: APPLE_BILLING_VERSION,
      pointsExpire: false,
      products: enabled
        ? products.map(
            ({ id, appleProductId, name, kind, points, period }) => ({
              id,
              appleProductId,
              name,
              kind,
              points,
              period,
            }),
          )
        : [],
      ...(!enabled ? { reason: "App Store 购买尚未配置，请稍后再试。" } : {}),
    }),
    account,
    verifyPurchase,
    notification,
    sync,
  };
}
