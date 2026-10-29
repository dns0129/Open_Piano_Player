import { createLibraryStore } from "./lib/library-store.mjs";
import { createCloudLibrary } from "./lib/cloud-library-admin.mjs";
import { createDownloadLibrary } from "./lib/download-library.mjs";
import { createLocalLibrary } from "./lib/local-library.mjs";
import http from "node:http";
import { resolve, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { authStatus, publicError } from "./lib/auth.mjs";
import {
  createSettingsStore,
  defaultDeepseekModel,
  userError,
} from "./lib/settings.mjs";
import { generateScore } from "./lib/ai.mjs";
import {
  createScoreSearch,
  downloadPublicScore,
} from "./lib/public-library.mjs";
import { createFullScoreJobStore } from "./lib/full-score-jobs.mjs";
import { SCORE_RECOGNITION } from "./lib/recognition-policy.mjs";
import { createNeteaseScoreProvider } from "./lib/netease-scores.mjs";
import {
  createRouter,
  readJson,
  safeEqual,
  serveStatic,
  setSecurityHeaders,
} from "./lib/http-kit.mjs";

const COOKIE = "qinban_session";
const MB = 1024 * 1024;
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml",
  ".musicxml": "application/vnd.recordare.musicxml+xml",
  ".mxl": "application/vnd.recordare.musicxml",
  ".mid": "audio/midi",
  ".midi": "audio/midi",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pfb": "application/octet-stream",
  ".bcmap": "application/octet-stream",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
};
const errors = {
  tooLarge: () =>
    userError("请求体超出此接口允许的大小。", "BODY_TOO_LARGE", 413),
  contentType: () => userError("请求必须为 JSON。", "CONTENT_TYPE", 415),
  invalidJson: () => userError("JSON 请求格式不正确。"),
  method: () => userError("不支持此请求方法。", "METHOD_NOT_ALLOWED", 405),
  notFound: () => userError("文件不存在。", "NOT_FOUND", 404),
  badPath: () => userError("路径无效。", "NOT_FOUND", 404),
  buildRequired: () =>
    userError("应用尚未构建，请先运行 npm run build。", "BUILD_REQUIRED", 503),
};
const neteaseMissing = () => userError("网易云接口不存在。", "NOT_FOUND", 404);
const ID = "[A-Za-z0-9_-]{1,80}";
const SLUG = "[a-z0-9][a-z0-9_-]{0,79}";

export function createAppServer({
  developerMode = false,
  distDir = resolve("dist"),
  settingsStore = createSettingsStore(),
  generate = generateScore,
  statusReader = authStatus,
  publicDownloader = downloadPublicScore,
  scoreSearch = createScoreSearch(),
  fullScoreJobs,
  neteaseProvider,
  localLibrary = createLocalLibrary(),
  cloudLibrary = createCloudLibrary(),
  downloadLibrary = createDownloadLibrary(),
  libraryStore,
} = {}) {
  const scoreLibrary =
    libraryStore ||
    createLibraryStore({
      legacyLibrary: localLibrary,
      legacyDownloads: downloadLibrary,
    });
  const scoreJobs =
    fullScoreJobs ||
    createFullScoreJobStore({ settingsProvider: () => settingsStore.read() });
  const netease = neteaseProvider || createNeteaseScoreProvider();
  const sessions = new Map();
  let activeGenerations = 0;
  function session(req, res, create = false) {
    const now = Date.now();
    for (const [key, value] of sessions)
      if (now - value.last > 12 * 60 * 60 * 1000) sessions.delete(key);
    const cookie = (req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(COOKIE + "="))
      ?.slice(COOKIE.length + 1);
    let value = sessions.get(cookie);
    if (!value && create) {
      if (sessions.size >= 64) sessions.delete(sessions.keys().next().value);
      const id = randomBytes(32).toString("hex");
      value = {
        scope: id,
        csrfToken: randomBytes(32).toString("hex"),
        last: now,
        running: false,
        calls: [],
        searchCalls: [],
      };
      sessions.set(id, value);
      res.setHeader(
        "set-cookie",
        `${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
      );
    }
    if (value) value.last = now;
    return value;
  }
  function json(res, code, data) {
    if (res.destroyed) return;
    res.writeHead(code, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(data));
  }
  function send(res, buffer, headers) {
    res.writeHead(200, { "cache-control": "no-store", ...headers });
    res.end(buffer);
  }
  function trust(req) {
    if (
      !["127.0.0.1", "::ffff:127.0.0.1", "::1"].includes(
        req.socket.remoteAddress,
      )
    )
      throw userError("仅允许本机访问。", "LOCAL_ONLY", 403);
    const port = req.socket.localPort;
    const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!allowed.has(req.headers.host))
      throw userError(
        "访问主机不正确，请使用 127.0.0.1。",
        "HOST_FORBIDDEN",
        403,
      );
    if (
      req.headers.origin &&
      ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(
        req.headers.origin,
      )
    )
      throw userError(
        "请求来源不正确，请从琴伴页面操作。",
        "ORIGIN_FORBIDDEN",
        403,
      );
    if (
      req.headers["sec-fetch-site"] &&
      !["same-origin", "none"].includes(req.headers["sec-fetch-site"])
    )
      throw userError("不允许跨站访问本机服务。", "ORIGIN_FORBIDDEN", 403);
  }
  // Searches and share resolution share one per-session budget of 12 calls a minute.
  function limitSearch(current, message) {
    const now = Date.now();
    current.searchCalls = current.searchCalls.filter((t) => now - t < 60000);
    if (current.searchCalls.length >= 12)
      throw userError(message, "SEARCH_RATE_LIMIT", 429);
    current.searchCalls.push(now);
  }

  async function status({ req, res }) {
    const current = session(req, res, true),
      settings = await settingsStore.read();
    const pi = {
      ...(await statusReader(SCORE_RECOGNITION.model)),
      model: SCORE_RECOGNITION.model,
      reasoningEffort: SCORE_RECOGNITION.reasoningEffort,
      modelLocked: true,
    };
    const deepseekModel = settings.deepseekModel || defaultDeepseekModel,
      deepseekConfigured = Boolean(
        settings.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
      ),
      deepseekVision = deepseekConfigured && deepseekModel === "deepseek-flash";
    json(res, 200, {
      csrfToken: current.csrfToken,
      mode: developerMode ? "developer" : "local",
      features: [
        "score",
        "import",
        "edit",
        "playback",
        "recognition",
        "scoreSearch",
        "netease",
      ],
      pi,
      deepseek: {
        configured: deepseekConfigured,
        model: deepseekModel,
        models: [
          "deepseek-flash",
          "deepseek-v4-pro",
          "deepseek-chat",
          "deepseek-reasoner",
        ],
        vision: deepseekModel === "deepseek-flash",
      },
      fullScore: {
        ...SCORE_RECOGNITION,
        deepseek: {
          available: deepseekVision,
          ready: deepseekVision,
          model: "deepseek-flash",
          reasoningEffort: "high",
        },
        pi: {
          available: pi.available === true,
          ready: pi.available === true,
          model: SCORE_RECOGNITION.model,
          reasoningEffort: SCORE_RECOGNITION.reasoningEffort,
        },
        maxPages: 200,
        maxPdfBytes: 50 * MB,
      },
      localOnly: true,
    });
  }

  // Every route below runs after the session and CSRF checks.
  const routes = createRouter();

  routes
    .add("GET", "/api/library", async ({ res }) => {
      const { records, warnings = [] } = await scoreLibrary.list();
      json(res, 200, {
        records: records.map(
          ({ assets, history, originalFile, ...record }) => record,
        ),
        warnings,
      });
    })
    .add("POST", "/api/library", async ({ res, body }) => {
      const input = await body(72 * MB);
      json(
        res,
        200,
        await scoreLibrary.save(input.record, {
          expectedRevision: input.expectedRevision,
        }),
      );
    })
    .add("GET", "/api/library/backup", async ({ res }) =>
      json(res, 200, await scoreLibrary.backup()),
    )
    .add("POST", "/api/library/restore", async ({ res, body }) => {
      const input = await body(80 * MB);
      json(res, 200, await scoreLibrary.restore(input.backup));
    });
  const libraryRecordId = (encoded) => {
    try {
      return decodeURIComponent(encoded);
    } catch {
      throw userError("曲库 ID 编码无效。");
    }
  };
  routes
    .add("GET", /^\/api\/library\/records\/([^/]+)$/, async ({ res, params }) =>
      json(res, 200, await scoreLibrary.get(libraryRecordId(params[0]))),
    )
    .add(
      "POST",
      /^\/api\/library\/records\/([^/]+)\/delete$/,
      async ({ res, params, body }) => {
        const id = libraryRecordId(params[0]);
        await body(16000);
        json(res, 200, await scoreLibrary.remove(id));
      },
    );

  routes
    .add("GET", "/api/cloud-library", async ({ res }) =>
      json(res, 200, await cloudLibrary.list()),
    )
    .add("POST", "/api/cloud-library", async ({ res, body }) =>
      json(res, 200, await cloudLibrary.publish(await body(72 * MB))),
    )
    .add("GET", new RegExp(`^/api/cloud-library/(${SLUG})$`), async (c) =>
      json(c.res, 200, await cloudLibrary.download(c.params[0])),
    )
    .add("DELETE", new RegExp(`^/api/cloud-library/(${SLUG})$`), async (c) =>
      json(c.res, 200, await cloudLibrary.remove(c.params[0])),
    )
    .add(
      "POST",
      new RegExp(`^/api/cloud-library/(${SLUG})/delete$`),
      async (c) => {
        await c.body(16000);
        json(c.res, 200, await cloudLibrary.remove(c.params[0]));
      },
    );

  routes
    .add("GET", "/api/local-downloads", async ({ res }) =>
      json(res, 200, await downloadLibrary.list()),
    )
    .add("POST", "/api/local-downloads", async ({ res, body }) =>
      json(res, 200, await downloadLibrary.save(await body(72 * MB))),
    )
    .add("DELETE", new RegExp(`^/api/local-downloads/(${SLUG})$`), async (c) =>
      json(c.res, 200, await downloadLibrary.remove(c.params[0])),
    )
    .add(
      "POST",
      new RegExp(`^/api/local-downloads/(${SLUG})/delete$`),
      async (c) => {
        await c.body(16000);
        json(c.res, 200, await downloadLibrary.remove(c.params[0]));
      },
    )
    .add("GET", new RegExp(`^/api/local-downloads/(${SLUG})$`), async (c) =>
      json(c.res, 200, await downloadLibrary.source(c.params[0])),
    )
    .add(
      "GET",
      new RegExp(`^/api/local-downloads/(${SLUG})/images/(${SLUG})$`),
      async ({ res, params }) => {
        const asset = await downloadLibrary.image(params[0], params[1]);
        send(res, asset.buffer, { "content-type": asset.mimeType });
      },
    );

  routes
    .add(
      "POST",
      new RegExp(`^/api/local-library/(${ID})/delete$`),
      async (c) => {
        await c.body(16000);
        json(c.res, 200, await localLibrary.remove(c.params[0]));
      },
    )
    .add("GET", "/api/local-library", async ({ res }) =>
      json(res, 200, await localLibrary.list()),
    )
    .add("GET", new RegExp(`^/api/local-library/(${ID})$`), async (c) =>
      json(c.res, 200, await localLibrary.source(c.params[0])),
    )
    .add(
      "GET",
      new RegExp(`^/api/local-library/(${ID})/images/(${ID})$`),
      async ({ res, params }) => {
        const asset = await localLibrary.image(params[0], params[1]);
        send(res, asset.buffer, {
          "content-type": asset.mimeType,
          "content-length": asset.buffer.length,
        });
      },
    );

  routes.add("POST", "/api/settings", async ({ res, body }) =>
    json(res, 200, await settingsStore.update(await body())),
  );

  // NetEase calls are bounded by a deadline and stop when the page goes away.
  const neteasePost = (handler, timeoutMs = 30000) =>
    async function (c) {
      const signal = c.deadline(timeoutMs);
      const input = await c.body(16000);
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw userError("网易云操作参数必须是 JSON 对象。");
      await handler(c, input, { signal });
    };
  routes
    .add("GET", "/api/netease/status", async ({ res }) =>
      json(res, 200, await netease.status()),
    )
    .add(
      "GET",
      /^\/api\/netease\/imports\/([a-f0-9]{48})\/pages\/(\d{1,3})$/,
      async (c) => {
        const image = await netease.image(
          c.params[0],
          Number(c.params[1]),
          c.current.scope,
          { signal: c.deadline(30000) },
        );
        send(c.res, image.buffer, {
          "content-type": image.mimeType,
          "content-length": image.buffer.length,
        });
      },
    )
    .add(
      "POST",
      "/api/netease/login/start",
      neteasePost(async (c, input, options) =>
        json(c.res, 200, await netease.startLogin(c.current.scope, options)),
      ),
    )
    .add(
      "POST",
      "/api/netease/login/check",
      neteasePost(async (c, input, options) =>
        json(
          c.res,
          200,
          await netease.pollLogin(input.id, c.current.scope, options),
        ),
      ),
    )
    .add(
      "POST",
      "/api/netease/login/cancel",
      neteasePost(async (c, input) =>
        json(c.res, 200, netease.cancelLogin(input.id, c.current.scope)),
      ),
    )
    .add(
      "POST",
      "/api/netease/logout",
      neteasePost(async (c) => json(c.res, 200, await netease.logout())),
    )
    .add(
      "POST",
      "/api/netease/resolve",
      neteasePost(async (c, input, options) => {
        limitSearch(c.current, "获取过于频繁，请稍后重试。");
        json(
          c.res,
          200,
          await netease.resolveShare(input.share, c.current.scope, options),
        );
      }),
    )
    .add(
      "POST",
      "/api/netease/preview",
      neteasePost(async (c, input, options) =>
        json(
          c.res,
          200,
          await netease.preview(
            input.sheetId,
            input.sourceUrl,
            c.current.scope,
            options,
          ),
        ),
      ),
    )
    .add(
      "POST",
      "/api/netease/pdf",
      neteasePost(async (c, input, options) => {
        const pdf = await netease.pdf(
          input.id,
          input,
          c.current.scope,
          options,
        );
        send(c.res, pdf.buffer, {
          "content-type": "application/pdf",
          "content-length": pdf.buffer.length,
          "x-score-filename": encodeURIComponent(pdf.filename),
          "x-score-source": encodeURIComponent(JSON.stringify(pdf.source)),
        });
      }, 180000),
    )
    .add("*", /^\/api\/netease\//, () => {
      throw neteaseMissing();
    });

  const jobAuth = ({ req, current }) => ({
    sessionId: current.scope,
    token: req.headers["x-fullscore-token"] || undefined,
  });
  // Actions posted to /api/full-score-jobs/:id/:action[/:regionId].
  const jobActions = {
    region: {
      region: true,
      run: (id, regionId, input, auth) =>
        scoreJobs.uploadRegion(id, regionId, input, auth),
    },
    document: {
      run: (id, regionId, input, auth) =>
        scoreJobs.uploadDocument(id, input, auth),
    },
    start: {
      run: (id, regionId, input, auth) =>
        scoreJobs.startJob(id, { ...input, ...auth }),
    },
    retry: {
      region: true,
      run: (id, regionId, input, auth) =>
        scoreJobs.retryRegion(id, regionId, auth, {
          engine: input.engine,
          expectedVersion: input.expectedVersion,
          ...(input.phase !== undefined ? { phase: input.phase } : {}),
        }),
    },
    "retry-failed": {
      run: (id, regionId, input, auth) =>
        scoreJobs.retryRegions(id, auth, {
          engine: input.engine,
          expectedVersion: input.expectedVersion,
          regionIds: input.regionIds,
        }),
    },
    cancel: {
      run: (id, regionId, input, auth) => scoreJobs.cancelJob(id, auth),
    },
    "confirm-region": {
      region: true,
      run: (id, regionId, input, auth) =>
        scoreJobs.confirmRegion(id, regionId, input.result || input, auth),
    },
    "assess-source": {
      region: true,
      run: (id, regionId, input, auth) =>
        scoreJobs.assessRegion(id, regionId, input, auth),
    },
    "diagnose-source": {
      region: true,
      run: (id, regionId, input, auth) =>
        scoreJobs.diagnoseRegion(
          id,
          regionId,
          { confirmed: input.confirmed === true, baseHash: input.baseHash },
          auth,
        ),
    },
    "apply-revision": {
      region: true,
      run: (id, regionId, input, auth) =>
        scoreJobs.applyRevision(
          id,
          regionId,
          { confirmed: input.confirmed === true, proposalId: input.proposalId },
          auth,
        ),
    },
    "undo-revision": {
      region: true,
      run: (id, regionId, input, auth) =>
        scoreJobs.undoRevision(
          id,
          regionId,
          { revisionId: input.revisionId },
          auth,
        ),
    },
    draft: {
      run: (id, regionId, input, auth) =>
        scoreJobs.exportDraft(id, auth, {
          scopeConfirmed: input.scopeConfirmed === true,
        }),
    },
    confirm: {
      run: (id, regionId, input, auth) =>
        scoreJobs.confirmJob(id, auth, {
          scopeConfirmed: input.scopeConfirmed === true,
        }),
    },
  };
  routes
    .add("POST", "/api/full-score-jobs", async (c) =>
      json(c.res, 201, await scoreJobs.createJob(await c.body(), jobAuth(c))),
    )
    .add("GET", new RegExp(`^/api/full-score-jobs/(${ID})$`), async (c) =>
      json(c.res, 200, await scoreJobs.getJob(c.params[0], jobAuth(c))),
    )
    .add(
      "GET",
      new RegExp(`^/api/full-score-jobs/(${ID})/document$`),
      async (c) => {
        const pdf = await scoreJobs.readDocument(c.params[0], jobAuth(c));
        send(c.res, pdf.buffer, {
          "content-type": "application/pdf",
          "content-length": pdf.buffer.length,
        });
      },
    )
    .add(
      "GET",
      new RegExp(`^/api/full-score-jobs/(${ID})/region/(${ID})$`),
      async (c) => {
        const image = await scoreJobs.readRegionImage(
          c.params[0],
          c.params[1],
          jobAuth(c),
        );
        send(c.res, image.buffer, {
          "content-type": image.mimeType,
          "content-length": image.buffer.length,
        });
      },
    )
    .add(
      "POST",
      new RegExp(`^/api/full-score-jobs/(${ID})(?:/([a-z-]+))?(?:/(${ID}))?$`),
      async (c) => {
        const [id, action, regionId] = c.params;
        const input = await c.body(action === "document" ? 72 * MB : 8 * MB);
        const handler = Object.hasOwn(jobActions, action)
          ? jobActions[action]
          : null;
        if (!handler || (handler.region && !regionId))
          throw userError("识谱任务操作不存在。", "NOT_FOUND", 404);
        json(c.res, 200, await handler.run(id, regionId, input, jobAuth(c)));
      },
    );

  routes
    .add("GET", "/api/search", async (c) => {
      limitSearch(c.current, "联网查询过于频繁，请稍后重试。");
      json(
        c.res,
        200,
        await scoreSearch.search(
          c.url.searchParams.get("q") || "",
          c.current.scope,
          { signal: c.deadline(25000) },
        ),
      );
    })
    .add("GET", "/api/resolve-score", async (c) =>
      json(
        c.res,
        200,
        await scoreSearch.resolve(
          c.url.searchParams.get("id"),
          c.current.scope,
          {
            signal: AbortSignal.timeout(20000),
          },
        ),
      ),
    )
    .add("GET", "/api/import-score", async ({ res, url, current }) => {
      const result = await scoreSearch.download(
        url.searchParams.get("id"),
        current.scope,
        { signal: AbortSignal.timeout(25000) },
      );
      send(res, result.buffer, {
        "content-type": result.mime,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
        "x-score-format": result.format,
        "x-score-filename": encodeURIComponent(result.filename),
      });
    })
    .add("GET", "/api/public-score", async ({ res, url }) => {
      const result = await publicDownloader(url.searchParams.get("path"), {
        signal: AbortSignal.timeout(20000),
      });
      res.writeHead(200, {
        "content-type": "application/vnd.recordare.musicxml",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
        "cache-control": "private, max-age=3600",
      });
      res.end(result.buffer);
    });

  routes.add("POST", "/api/generate", async (c) => {
    const { current } = c;
    const busy = () =>
      userError("已有生成任务正在进行，请稍后重试。", "BUSY", 429);
    if (current.running || activeGenerations >= 2) throw busy();
    const now = Date.now();
    current.calls = current.calls.filter((t) => now - t < 60000);
    if (current.calls.length >= 6)
      throw userError("生成请求过于频繁，请一分钟后重试。", "RATE_LIMIT", 429);
    const input = await c.body();
    const settings = await settingsStore.read();
    // Reserve synchronously after asynchronous body parsing to avoid concurrent request races.
    if (current.running || activeGenerations >= 2) throw busy();
    current.running = true;
    activeGenerations++;
    current.calls.push(now);
    try {
      const signal = c.deadline(SCORE_RECOGNITION.timeoutMs, {
        timeout: () => new Error("timeout"),
        closed: () => new Error("client aborted"),
      });
      json(c.res, 200, await generate(input, settings, { signal }));
    } finally {
      current.running = false;
      activeGenerations--;
    }
  });

  const server = http.createServer(async (req, res) => {
    setSecurityHeaders(res, { "cross-origin-resource-policy": "same-origin" });
    let controller;
    const cleanup = [];
    // Aborts after `ms`, or when the client disconnects before the response ends.
    const deadline = (ms, reasons = {}) => {
      controller = new AbortController();
      const timer = setTimeout(() => controller.abort(reasons.timeout?.()), ms);
      timer.unref();
      const abort = () => {
        if (!res.writableEnded) controller.abort(reasons.closed?.());
      };
      res.on("close", abort);
      cleanup.push(() => {
        clearTimeout(timer);
        res.removeListener("close", abort);
      });
      return controller.signal;
    };
    try {
      trust(req);
      const url = new URL(req.url, "http://127.0.0.1");
      if (!url.pathname.startsWith("/api/")) {
        await serveStatic(req, res, {
          pathname: url.pathname,
          distDir,
          types: contentTypes,
          errors,
          cacheControl: "no-cache",
        });
        return;
      }
      if (url.pathname === "/api/status" && req.method === "GET") {
        await status({ req, res });
        return;
      }
      const current = session(req, res);
      if (!current)
        throw userError("会话已过期，请刷新页面。", "SESSION_REQUIRED", 403);
      if (
        ["POST", "PUT", "DELETE", "PATCH"].includes(req.method) &&
        !safeEqual(req.headers["x-csrf-token"], current.csrfToken)
      )
        throw userError("请求校验失败，请刷新页面后重试。", "CSRF", 403);
      if (url.pathname.startsWith("/api/v1/"))
        throw userError(
          "账号与托管额度请使用独立商业版。",
          "COMMERCIAL_APP_REQUIRED",
          403,
        );
      const route = routes.match(req.method, url.pathname);
      if (!route)
        throw userError("接口不存在或请求方法不正确。", "NOT_FOUND", 404);
      await route.handler({
        req,
        res,
        url,
        current,
        params: route.params,
        body: (limit = 18 * MB) => readJson(req, limit, errors),
        deadline,
      });
    } catch (error) {
      json(res, error.status || (controller?.signal.aborted ? 408 : 500), {
        error: publicError(error),
        code:
          error.code ||
          (controller?.signal.aborted ? "ABORTED" : "REQUEST_FAILED"),
      });
    } finally {
      for (const done of cleanup) done();
    }
  });
  server.requestTimeout = SCORE_RECOGNITION.timeoutMs + 20000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.on("close", () => {
    void scoreJobs.close();
    netease.close();
  });
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  // .local/ and dist/ are resolved from the working directory; pin it to the project wherever node was started.
  process.chdir(dirname(fileURLToPath(import.meta.url)));
  const port = Number(process.env.QINBAN_PORT) || 8792;
  const server = createAppServer({ developerMode: true });
  server.listen(port, "127.0.0.1", () =>
    console.log(`琴伴钢琴练习室已启动：http://127.0.0.1:${port}`),
  );
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `${port} 端口已在使用，请打开现有琴伴窗口。`
        : "本机服务未能启动。",
    );
    process.exitCode = 1;
  });
  for (const name of ["SIGTERM", "SIGINT"])
    process.on(name, () => {
      server.close();
      server.closeIdleConnections();
    });
}
