// @ts-check
import http from "node:http";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fail, equal, id, uuid } from "./common.mjs";
import { createLibraryStore } from "../library-store.mjs";
import { createLibraryBackup } from "../library-format.ts";
import { log as defaultLog } from "../log.mjs";
import {
  createRouter,
  readBytes,
  readJson,
  serveStatic,
  setSecurityHeaders,
} from "../http-kit.mjs";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".pdf": "application/pdf",
  ".mid": "audio/midi",
  ".xml": "application/xml",
  ".musicxml": "application/xml",
};
const notFound = () => fail("NOT_FOUND", "文件不存在。", 404);
const methodNotAllowed = () => {
  throw fail("METHOD_NOT_ALLOWED", "请求方法无效。", 405);
};
const errors = {
  tooLarge: () => fail("BODY_TOO_LARGE", "文件或请求过大。", 413),
  contentType: () => fail("CONTENT_TYPE", "请求必须为 JSON。", 415),
  invalidJson: () => fail("INVALID_JSON", "JSON 请求格式无效。"),
  method: () => fail("METHOD_NOT_ALLOWED", "请求方法无效。", 405),
  notFound,
  buildRequired: notFound,
};
// These sign-in endpoints work without a session and skip the idempotency key.
const AUTH_PATHS = new Set([
  "/api/v1/auth/code",
  "/api/v1/auth/verify",
  "/api/v1/auth/invite",
  "/api/v1/auth/password",
  "/api/v1/auth/password/reset",
]);
// A session in the recovery state may only reach these paths.
const RECOVERY_PATHS = new Set([
  "/api/v1/account/recover",
  "/api/v1/session",
  "/api/v1/auth/code",
  "/api/v1/auth/verify",
]);
const PAYMENT_NOTIFY = /^\/api\/v1\/payments\/notify\/(wechat|alipay)$/;
const UUID = "([a-f0-9-]+)";
const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
// Behind the loopback HTTPS proxy every socket is 127.0.0.1; the proxy appends the real peer as the last X-Forwarded-For entry.
export function clientAddress(req, { trustProxy = false } = {}) {
  const peer = req.socket.remoteAddress;
  if (!trustProxy || !loopback.includes(peer)) return peer;
  return (
    String(req.headers["x-forwarded-for"] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .at(-1) || peer
  );
}
/**
 * @param {{ identity?: any, library?: any, transfers?: any, recognition?: any, operations?: any, subscriptions?: any,
 *   landingFile?: string, distDir?: string, profile?: string, origin?: string,
 *   localLibraryDirectory?: string, mailboxDirectory?: string,
 *   log?: ReturnType<typeof import("../log.mjs").createLogger> }} [options]
 */
export function createHostedServer({
  identity,
  library,
  transfers,
  recognition,
  operations,
  subscriptions,
  landingFile = "index.html",
  distDir = resolve("dist-hosted"),
  profile = "local",
  origin,
  localLibraryDirectory = resolve(".local/library-v2"),
  mailboxDirectory,
  log = defaultLog,
} = {}) {
  const local = profile === "local",
    cookieName = local ? "qinban_dev_account" : "__Host-qinban_session",
    loginName = local ? "qinban_dev_login" : "__Host-qinban_login";
  /** @type {(name: string, value: string, age?: number | null) => string} */
  const cookie = (name, value, age = 2592000) =>
    `${name}=${value}; HttpOnly; SameSite=Lax; Path=/${age === null ? "" : "; Max-Age=" + age}${local ? "" : "; Secure"}`;
  const cookies = (req) =>
    Object.fromEntries(
      (req.headers.cookie || "")
        .split(";")
        .map((s) => s.trim().split("="))
        .filter((p) => p.length === 2),
    );
  let activeUploads = 0;
  async function syncCredits(owner) {
    if (!recognition) return;
    for (const r of await identity.invites.redemptionsFor(owner))
      if (r.bonusTasks > 0)
        await recognition.budget.grantCredits(owner, r.bonusTasks, {
          id: r.id,
          kind: "invite",
        });
  }
  // Invite bonuses are re-synced on later requests, so a failure here must not fail the request.
  const syncQuietly = (owner, requestId) =>
    syncCredits(owner).catch((error) =>
      log.warn("invite-credits.sync-failed", { requestId, owner, error }),
    );
  const publicSession = (s) => ({
    user: {
      id: s.userId,
      email: s.email,
      state: s.state,
      role: s.isOperator ? "operator" : "user",
    },
    sessionId: s.id,
    csrfToken: s.csrfToken,
    reauthenticatedAt: s.reauthenticatedAt,
    expiresAt: s.expiresAt,
  });
  const registration = async (fallback) =>
    operations ? await operations.registration() : fallback;
  const noInvites = { friendInvitesPerUser: 0, friendInviteBonus: 0 };
  const noContent = (res) => {
    res.writeHead(204);
    res.end();
  };

  // Reached before any session is loaded.
  const open = createRouter();
  if (subscriptions)
    open
      .add("POST", PAYMENT_NOTIFY, async ({ req, res, params, bytes }) => {
        const provider = params[0],
          type =
            provider === "wechat"
              ? "application/json"
              : "application/x-www-form-urlencoded";
        if (!(req.headers["content-type"] || "").toLowerCase().startsWith(type))
          throw fail("CONTENT_TYPE", "支付通知类型无效。", 415);
        await subscriptions.notification(
          provider,
          req.headers,
          (await bytes(65536)).toString("utf8"),
        );
        if (provider === "wechat") noContent(res);
        else {
          res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
          res.end("success");
        }
      })
      .add("GET", "/api/v1/subscriptions/catalog", ({ json }) =>
        json(200, subscriptions.catalog()),
      );
  if (recognition)
    open.add("GET", "/api/v1/product", async ({ json }) =>
      json(200, await recognition.budget.publicInfo()),
    );
  open.add("GET", "/api/v1/auth/context", ({ res, ck, json }) => {
    // Reuse this browser's login nonce while it is valid, so reloading the page keeps an emailed code usable.
    const nonce = /^[A-Za-z0-9_-]{43}$/.test(ck[loginName] || "")
      ? ck[loginName]
      : randomBytes(32).toString("base64url");
    res.setHeader("set-cookie", cookie(loginName, nonce, 600));
    json(200, {
      csrfToken: identity.csrf("login:" + nonce),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      profile: local ? "local-validation" : "production",
      ...(local
        ? {
            mailboxNotice:
              "本机验证模式：验证码写入私有开发邮箱，没有发送真实邮件。",
            mailboxDirectory,
          }
        : {}),
    });
  });

  // Sign-in and account recovery: no session, or a session in any state.
  const account = createRouter();
  account
    .add("GET", "/api/v1/session", ({ current, json }) =>
      json(200, publicSession(current)),
    )
    .add("POST", "/api/v1/auth/invite", async ({ body, ip, json }) =>
      json(200, await identity.invites.check((await body()).code, { ip })),
    )
    // Only the fields a visitor may choose are passed on; registration policy comes from the server.
    .add("POST", "/api/v1/auth/code", async (c) => {
      const input = await c.body(),
        policy = await registration({ open: false });
      c.json(
        202,
        await identity.code({
          email: input.email,
          purpose: input.purpose,
          inviteCode: input.inviteCode,
          nonce: c.nonce,
          session: c.current,
          ip: c.ip,
          openRegistration: policy.open,
        }),
      );
    })
    .add("POST", "/api/v1/auth/password", async (c) => {
      const input = await c.body();
      const result = await identity.passwordLogin({
        email: input.email,
        password: input.password,
        remember: input.remember === true,
        device: c.req.headers["user-agent"],
        ip: c.ip,
      });
      c.res.setHeader("set-cookie", [
        cookie(
          cookieName,
          result.token,
          input.remember === true ? 2592000 : null,
        ),
        cookie(loginName, "", 0),
      ]);
      c.json(200, publicSession(result.session));
    })
    .add("POST", /^\/api\/v1\/auth\/(?:verify|password\/reset)$/, async (c) => {
      const input = await c.body();
      if (!uuid(input.challengeId))
        throw fail("INVALID_CODE", "验证码无效或已过期。");
      const result = await identity.verify({
        challengeId: input.challengeId,
        code: input.code,
        nonce: c.nonce,
        session: c.current,
        device: c.req.headers["user-agent"],
        ip: c.ip,
        newPassword: input.password,
        expectedPurpose: c.path.endsWith("/password/reset")
          ? "password"
          : "sign-in",
      });
      if (result.token)
        c.res.setHeader("set-cookie", [
          cookie(
            cookieName,
            result.token,
            result.session.purpose === "recover" ? 600 : 2592000,
          ),
          cookie(loginName, "", 0),
        ]);
      if (result.redemption)
        await syncQuietly(result.session.userId, c.requestId);
      c.json(200, {
        ...publicSession(result.session),
        ...(result.isNewAccount ? { isNewAccount: true } : {}),
        ...(result.redemption
          ? { invite: { bonusTasks: result.redemption.bonusTasks } }
          : {}),
      });
    })
    .add("GET", "/api/v1/invites", async ({ owner, json, requestId }) => {
      await syncQuietly(owner, requestId);
      const policy = await registration(noInvites);
      json(200, {
        ...(await identity.invites.mine(owner)),
        limit: policy.friendInvitesPerUser,
        bonusTasks: policy.friendInviteBonus,
      });
    })
    .add("POST", "/api/v1/invites", async ({ owner, json }) => {
      const policy = await registration(noInvites);
      json(
        201,
        await identity.invites.createFriendCode(owner, {
          limit: policy.friendInvitesPerUser,
          bonusTasks: policy.friendInviteBonus,
        }),
      );
    })
    .add(
      "POST",
      "/api/v1/invites/redeem",
      async ({ owner, ip, body, json, requestId }) => {
        const redemption = await identity.invites.redeem(
          owner,
          (await body()).code,
          { ip },
        );
        await syncQuietly(owner, requestId);
        json(200, { bonusTasks: redemption?.bonusTasks ?? 0 });
      },
    )
    .add(
      "DELETE",
      new RegExp(`^/api/v1/invites/${UUID}$`),
      async ({ owner, params, json }) =>
        json(200, await identity.invites.revokeFriendCode(owner, params[0])),
    )
    .add("GET", "/api/v1/sessions", async ({ current, json }) =>
      json(200, await identity.devices(current)),
    )
    .add(
      "DELETE",
      new RegExp(`^/api/v1/sessions/${UUID}$`),
      async ({ res, current, params }) => {
        if (!uuid(params[0])) throw fail("NOT_FOUND", "会话不存在。", 404);
        await identity.revoke(current, params[0]);
        if (params[0] === current.id)
          res.setHeader("set-cookie", cookie(cookieName, "", 0));
        noContent(res);
      },
    )
    .add("POST", "/api/v1/auth/logout-all", async ({ res, current, body }) => {
      await body();
      await identity.logoutAll(current);
      res.setHeader("set-cookie", cookie(cookieName, "", 0));
      noContent(res);
    })
    .add("DELETE", "/api/v1/account", async ({ res, current, body, json }) => {
      await body();
      const r = await identity.deleteAccount(current);
      res.setHeader("set-cookie", cookie(cookieName, "", 0));
      json(202, r);
    })
    .add(
      "POST",
      "/api/v1/account/recover",
      async ({ res, current, body, json }) => {
        await body();
        const r = await identity.recover(current);
        res.setHeader("set-cookie", cookie(cookieName, r.token));
        json(200, publicSession(r.session));
      },
    );

  // Requires an active account in its normal state.
  const active = createRouter();
  if (subscriptions) {
    const order = `^/api/v1/subscriptions/orders/${UUID}`;
    active
      .add(
        "GET",
        "/api/v1/subscriptions",
        async ({ owner, json, requestId }) => {
          await syncQuietly(owner, requestId);
          json(200, await subscriptions.account(owner));
        },
      )
      .add("POST", "/api/v1/subscriptions/orders", async (c) =>
        c.json(
          201,
          await subscriptions.checkout(c.owner, await c.body(), c.key),
        ),
      )
      .add("GET", new RegExp(order + "$"), async ({ owner, params, json }) =>
        json(200, await subscriptions.getOrder(owner, params[0])),
      )
      .add(
        "POST",
        new RegExp(order + "/(refresh|checkout)$"),
        async ({ owner, params, body, json }) => {
          await body();
          json(
            200,
            await (params[1] === "refresh"
              ? subscriptions.refresh(owner, params[0])
              : subscriptions.resume(owner, params[0])),
          );
        },
      )
      .add(
        "*",
        new RegExp(order + "(?:/(refresh|checkout))?$"),
        methodNotAllowed,
      );
  }
  if (recognition) {
    const job = `^/api/v1/recognition/jobs/${UUID}`;
    active
      .add(
        "GET",
        "/api/v1/recognition/quota",
        async ({ owner, json, requestId }) => {
          await syncQuietly(owner, requestId);
          json(200, await recognition.budget.quota(owner));
        },
      )
      .add("GET", "/api/v1/recognition/jobs", async ({ owner, json }) =>
        json(200, await recognition.list(owner)),
      )
      .add("POST", "/api/v1/recognition/jobs", async (c) =>
        c.json(202, await recognition.create(c.owner, await c.body(), c.key)),
      )
      .add("*", "/api/v1/recognition/jobs", methodNotAllowed)
      .add("GET", new RegExp(job + "$"), async ({ owner, params, json }) =>
        json(200, await recognition.get(owner, params[0])),
      )
      .add("POST", new RegExp(job + "/(cancel|retry|save)$"), async (c) => {
        const [jobId, action] = c.params,
          input = await c.body();
        c.json(
          action === "retry" ? 202 : 200,
          await recognition[action](c.owner, jobId, c.key, input),
        );
      })
      .add(
        "*",
        new RegExp(job + "(?:/(cancel|retry|save))?$"),
        methodNotAllowed,
      )
      .add(
        "GET",
        new RegExp(`^/api/v1/source-groups/${UUID}/pages$`),
        async ({ owner, params, json }) =>
          json(200, await recognition.sources.pages(owner, params[0])),
      )
      .add(
        "GET",
        new RegExp(`^/api/v1/source-groups/${UUID}/pages/(\\d+)/preview$`),
        async ({ res, owner, params }) => {
          const p = await recognition.sources.page(
            owner,
            params[0],
            Number(params[1]),
          );
          res.writeHead(200, {
            "content-type": p.mimeType,
            "content-length": p.bytes.length,
          });
          res.end(p.bytes);
        },
      );
  }
  if (operations) {
    active
      .add("GET", "/api/v1/feedback", async ({ owner, json }) =>
        json(200, await operations.mine(owner)),
      )
      .add("POST", "/api/v1/feedback", async (c) =>
        c.json(
          201,
          await operations.submitFeedback(c.owner, await c.body(), c.key),
        ),
      )
      .add("*", "/api/v1/feedback", methodNotAllowed);
    // Operator routes; the operator role is checked before any of them is matched.
    if (subscriptions)
      active.add("GET", "/api/v1/operator/payments", async ({ json }) =>
        json(200, await subscriptions.operatorOrders()),
      );
    active
      .add(
        "GET",
        /^\/api\/v1\/operator\/(overview|users|jobs|feedback|audit)$/,
        async ({ current, params, json }) =>
          json(200, await operations[params[0]](current)),
      )
      .add("PUT", "/api/v1/operator/policy", async (c) =>
        c.json(200, await operations.policy(c.current, await c.body())),
      )
      .add("POST", "/api/v1/operator/invitations", async (c) =>
        c.json(201, await operations.invite(c.current, await c.body())),
      )
      .add("GET", "/api/v1/operator/invite-codes", async ({ current, json }) =>
        json(200, await operations.inviteCodes(current)),
      )
      .add("POST", "/api/v1/operator/invite-codes", async (c) =>
        c.json(
          201,
          await operations.createInviteCode(c.current, await c.body()),
        ),
      )
      .add(
        "PUT",
        new RegExp(`^/api/v1/operator/invite-codes/${UUID}$`),
        async (c) =>
          c.json(
            200,
            await operations.disableInviteCode(
              c.current,
              c.params[0],
              await c.body(),
            ),
          ),
      )
      .add(
        "*",
        new RegExp(
          `^/api/v1/operator/(users|tasks|attempts|feedback)/${UUID}(?:/(refund|reconcile))?$`,
        ),
        async ({ method, current, params, body, json }) => {
          const [kind, target, action] = params,
            input = await body();
          if (kind === "users" && method === "PUT")
            json(200, await operations.user(current, target, input));
          else if (kind === "tasks" && action === "refund" && method === "POST")
            json(200, await operations.refund(current, target, input));
          else if (
            kind === "attempts" &&
            action === "reconcile" &&
            method === "POST"
          )
            json(200, await operations.resolve(current, target, input));
          else if (kind === "feedback" && method === "PUT")
            json(200, await operations.reply(current, target, input));
          else methodNotAllowed();
        },
      );
  }
  const entry = `^/api/v1/library/entries/${UUID}`;
  active
    .add("GET", "/api/v1/library/entries", async ({ owner, url, json }) =>
      json(
        200,
        await library.list(owner, {
          cursor: url.searchParams.get("cursor"),
          limit: url.searchParams.get("limit"),
          deleted: url.searchParams.get("deleted") === "true",
        }),
      ),
    )
    .add("POST", "/api/v1/library/entries", async (c) =>
      c.json(201, await library.save(c.owner, null, await c.body(), c.key)),
    )
    .add("GET", new RegExp(entry + "$"), async ({ owner, params, json }) =>
      json(200, await library.read(owner, params[0])),
    )
    .add("PUT", new RegExp(entry + "$"), async (c) =>
      c.json(
        200,
        await library.save(c.owner, c.params[0], await c.body(), c.key),
      ),
    )
    .add("DELETE", new RegExp(entry + "$"), async (c) =>
      c.json(
        200,
        await library.remove(
          c.owner,
          c.params[0],
          c.url.searchParams.has("expectedRevision")
            ? Number(c.url.searchParams.get("expectedRevision"))
            : undefined,
          c.key,
        ),
      ),
    )
    .add("GET", new RegExp(entry + "/revisions$"), async (c) =>
      c.json(
        200,
        await library.revisions(c.owner, c.params[0], {
          cursor: c.url.searchParams.get("cursor"),
          limit: Math.min(100, Number(c.url.searchParams.get("limit")) || 30),
        }),
      ),
    )
    .add("POST", new RegExp(entry + "/restore$"), async (c) =>
      c.json(
        200,
        await library.restore(c.owner, c.params[0], await c.body(), c.key),
      ),
    )
    .add(
      "*",
      new RegExp(entry + "(?:/(revisions|restore))?$"),
      methodNotAllowed,
    )
    .add("POST", "/api/v1/uploads", async (c) =>
      c.json(201, await library.stage(c.owner, await c.body(), c.key)),
    )
    .add(
      "PUT",
      new RegExp(`^/api/v1/uploads/${UUID}/content$`),
      async ({ req, res, owner, params, bytes }) => {
        if (activeUploads >= 2)
          throw fail("UPLOAD_BUSY", "上传繁忙，请稍后重试。", 429);
        if (req.headers["content-type"] !== "application/octet-stream")
          throw fail("CONTENT_TYPE", "上传内容类型无效。", 415);
        activeUploads++;
        try {
          await library.receive(
            owner,
            params[0],
            await bytes(await library.uploadLimit(owner, params[0])),
          );
        } finally {
          activeUploads--;
        }
        noContent(res);
      },
    )
    .add("POST", new RegExp(`^/api/v1/uploads/${UUID}/complete$`), async (c) =>
      c.json(
        200,
        await library.complete(c.owner, c.params[0], await c.body(), c.key),
      ),
    )
    .add("GET", "/api/v1/source-groups", async ({ owner, json }) =>
      json(200, await library.groups(owner)),
    )
    .add("POST", "/api/v1/source-groups", async (c) =>
      c.json(201, await library.sourceGroup(c.owner, await c.body(), c.key)),
    )
    .add(
      "GET",
      new RegExp(`^/api/v1/source-groups/${UUID}$`),
      async ({ owner, params, json }) =>
        json(200, await library.readGroup(owner, params[0])),
    )
    .add("DELETE", new RegExp(`^/api/v1/source-groups/${UUID}$`), async (c) =>
      c.json(200, await library.removeGroup(c.owner, c.params[0], c.key)),
    )
    .add(
      "GET",
      new RegExp(`^/api/v1/resources/${UUID}$`),
      async ({ res, owner, current, params }) => {
        const r = await library.readResource(owner, params[0]);
        if (r.backup) identity.recent(current);
        res.writeHead(200, {
          "content-type": r.info.mimeType,
          "content-length": r.bytes.length,
          "content-disposition": `attachment; filename="source"; filename*=UTF-8''${encodeURIComponent((r.info.name || "source").replace(/[\r\n]/g, ""))}`,
        });
        res.end(r.bytes);
      },
    )
    .add("POST", "/api/v1/library/exports", async (c) => {
      identity.recent(c.current);
      c.json(202, await transfers.export(c.owner, await c.body(), c.key));
    })
    .add(
      "GET",
      new RegExp(`^/api/v1/library/exports/${UUID}$`),
      async ({ owner, params, json }) =>
        json(200, await transfers.exportState(owner, params[0])),
    )
    .add("POST", "/api/v1/library/imports/preview", async (c) =>
      c.json(
        200,
        await transfers.preview(
          c.owner,
          await c.body(),
          c.key,
          c.current.email,
        ),
      ),
    )
    .add(
      "GET",
      new RegExp(`^/api/v1/library/imports/${UUID}$`),
      async ({ owner, params, json }) =>
        json(200, await transfers.importState(owner, params[0])),
    )
    .add(
      "POST",
      new RegExp(`^/api/v1/library/imports/${UUID}/commit$`),
      async (c) =>
        c.json(
          202,
          await transfers.commit(c.owner, c.params[0], await c.body(), c.key),
        ),
    )
    .add(
      "*",
      new RegExp(`^/api/v1/library/imports/${UUID}(?:/(commit))?$`),
      methodNotAllowed,
    );
  // This local-only, explicit migration entry point never changes the old library.
  if (local)
    active
      .add("GET", "/api/v1/device-library", async ({ json }) => {
        const store = createLibraryStore({ directory: localLibraryDirectory });
        const r = await store.list();
        json(200, {
          records: r.records.map((r) => ({
            id: r.id,
            title: r.document.title,
            revision: r.revision,
          })),
          warnings: r.warnings,
        });
      })
      .add("POST", "/api/v1/device-library/export", async ({ body, json }) => {
        const input = await body();
        if (
          !Array.isArray(input.ids) ||
          !input.ids.length ||
          input.ids.length > 10000
        )
          throw fail("SELECTION_REQUIRED", "请选择本机曲目。");
        const store = createLibraryStore({ directory: localLibraryDirectory });
        const records = [];
        for (const sid of new Set(input.ids))
          records.push(await store.get(sid));
        json(200, await createLibraryBackup(records));
      });

  const server = http.createServer(async (req, res) => {
    const requestId = id();
    setSecurityHeaders(res, { "cache-control": "private, no-store" });
    const json = (code, data) => {
      res.writeHead(code, {
        "content-type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(data));
    };
    try {
      const expected = origin || `http://127.0.0.1:${req.socket.localPort}`;
      if (
        !local &&
        !(/** @type {import("node:tls").TLSSocket} */ (req.socket).encrypted) &&
        !(
          loopback.includes(req.socket.remoteAddress ?? "") &&
          req.headers["x-forwarded-proto"] === "https"
        )
      )
        throw fail(
          "HTTPS_REQUIRED",
          "托管账号必须通过 HTTPS 反向代理访问。",
          403,
        );
      if (req.headers.host !== new URL(expected).host)
        throw fail("HOST_FORBIDDEN", "访问主机无效。", 403);
      if (local && !loopback.includes(req.socket.remoteAddress ?? ""))
        throw fail("LOCAL_ONLY", "本机验证实例仅允许本机访问。", 403);
      // Payment providers post server to server, so their notifications skip the browser origin checks.
      const paymentNotify =
        subscriptions &&
        req.method === "POST" &&
        PAYMENT_NOTIFY.test((req.url || "").split("?")[0]);
      if (
        !paymentNotify &&
        req.headers.origin &&
        req.headers.origin !== expected
      )
        throw fail("ORIGIN_FORBIDDEN", "请求来源不允许。", 403);
      if (
        !paymentNotify &&
        req.headers["sec-fetch-site"] &&
        !["same-origin", "none"].includes(req.headers["sec-fetch-site"])
      )
        throw fail("ORIGIN_FORBIDDEN", "请求来源不允许。", 403);
      const url = new URL(req.url || "/", expected),
        path = url.pathname,
        method = req.method,
        ck = cookies(req);
      if (!path.startsWith("/api/")) {
        await serveStatic(req, res, {
          pathname: path,
          distDir,
          indexFile: landingFile,
          types,
          errors,
        });
        return;
      }
      const c = {
        req,
        res,
        requestId,
        url,
        path,
        method,
        ck,
        json,
        bytes: (limit) => readBytes(req, limit, errors),
        body: () => readJson(req, 8 * 1024 * 1024, errors),
      };
      const run = (route) => route.handler({ ...c, params: route.params });
      const openRoute = open.match(method, path);
      if (openRoute) return void (await run(openRoute));

      const authPath = AUTH_PATHS.has(path);
      let current;
      if (ck[cookieName]) {
        try {
          current = await identity.session(ck[cookieName], {
            recovery: RECOVERY_PATHS.has(path),
          });
        } catch (e) {
          if (!authPath) throw e;
        }
      }
      if (!authPath && !current)
        throw fail("SESSION_REQUIRED", "请先登录账号。", 401);
      if (method !== "GET") {
        const csrf =
          current?.csrfToken ||
          (ck[loginName] && identity.csrf("login:" + ck[loginName]));
        if (!csrf || !equal(csrf, String(req.headers["x-csrf-token"] || "")))
          throw fail("CSRF", "页面验证已过期，请重新打开。", 403);
      }
      const key = String(req.headers["idempotency-key"] || "");
      if (
        method !== "GET" &&
        !authPath &&
        (key.length < 16 || key.length > 128)
      )
        throw fail("IDEMPOTENCY_REQUIRED", "操作需要唯一标识，请重试。", 428);
      Object.assign(c, {
        current,
        key,
        owner: current?.userId,
        nonce: current ? current.id : ck[loginName],
        ip: clientAddress(req, { trustProxy: !local }),
      });
      const accountRoute = account.match(method, path);
      if (accountRoute) return void (await run(accountRoute));

      // A sign-in path reached with an unsupported method may still have no session here.
      if (
        !current ||
        current.purpose !== "normal" ||
        current.state !== "active"
      )
        throw fail("SESSION_REQUIRED", "请先恢复账号。", 401);
      if (operations && path.startsWith("/api/v1/operator/"))
        operations.requireOperator(current, { recent: method !== "GET" });
      const activeRoute = active.match(method, path);
      if (activeRoute) return void (await run(activeRoute));
      throw fail("NOT_FOUND", "接口不存在。", 404);
    } catch (e) {
      if (!e.public)
        log.error("http.internal-error", {
          requestId,
          method: req.method,
          path: (req.url || "").split("?")[0],
          error: e,
        });
      if (res.headersSent) {
        res.destroy();
        return;
      }
      json(e.public ? e.status || 422 : 500, {
        code: e.public ? e.code : "INTERNAL_ERROR",
        message: e.public ? e.message : "操作未完成，请稍后重试。",
        requestId,
      });
    }
  });
  return server;
}
