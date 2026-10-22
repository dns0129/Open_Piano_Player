export function createAccountClient({
  fetchImpl = (...a) => fetch(...a),
  onIdentityChange = () => {},
} = {}) {
  let session = null,
    context = null,
    epoch = 0;
  const listeners = new Set();
  const checkEpoch = (generation) => {
    if (generation !== epoch)
      throw Object.assign(new Error("账号已切换，旧操作已停止。"), {
        code: "IDENTITY_CHANGED",
      });
  };
  function update(value) {
    const changed = session?.user.id !== value?.user.id;
    session = value;
    if (changed) {
      epoch++;
      onIdentityChange(value);
      for (const fn of listeners) fn(value);
    }
  }
  async function request(
    path,
    {
      method = "GET",
      body,
      key,
      binary = false,
      headers = {},
      expectedEpoch = epoch,
    } = {},
  ) {
    const generation = expectedEpoch;
    checkEpoch(generation);
    const options = {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { ...headers },
    };
    if (method !== "GET") {
      options.headers["X-CSRF-Token"] =
        session?.csrfToken || context?.csrfToken || "";
      options.headers["Idempotency-Key"] = key || crypto.randomUUID();
      if (body !== undefined) {
        options.headers["Content-Type"] = binary
          ? "application/octet-stream"
          : "application/json";
        options.body = binary ? body : JSON.stringify(body);
      }
    }
    const r = await fetchImpl("/api/v1" + path, options);
    if (generation !== epoch)
      throw Object.assign(new Error("账号已切换，旧操作已停止。"), {
        code: "IDENTITY_CHANGED",
      });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      if (r.status === 401) update(null);
      throw Object.assign(new Error(e.message || "操作未完成。"), {
        code: e.code,
        status: r.status,
        requestId: e.requestId,
      });
    }
    for (const method of ["json", "blob", "arrayBuffer"]) {
      const original = r[method].bind(r);
      r[method] = async () => {
        const value = await original();
        if (generation !== epoch)
          throw Object.assign(new Error("账号已切换，旧数据已丢弃。"), {
            code: "IDENTITY_CHANGED",
          });
        return value;
      };
    }
    return r;
  }
  const api = {
    checkEpoch,
    clearLocal() {
      context = null;
      update(null);
    },
    get session() {
      return session;
    },
    get epoch() {
      return epoch;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async json(path, options) {
      const r = await request(path, options);
      return r.status === 204 ? null : r.json();
    },
    request,
    async initialize() {
      try {
        const s = await api.json("/session");
        update(s);
        return s;
      } catch (e) {
        if (e.status !== 401) throw e;
        return null;
      }
    },
    async loginContext() {
      context = await api.json("/auth/context");
      return context;
    },
    code: (input) => api.json("/auth/code", { method: "POST", body: input }),
    async verify(input) {
      const s = await api.json("/auth/verify", { method: "POST", body: input });
      update(s);
      context = null;
      announce();
      return s;
    },
    async logout() {
      if (session)
        await api.json("/sessions/" + session.sessionId, {
          method: "DELETE",
          body: {},
        });
      update(null);
      announce();
    },
    async upload(
      file,
      {
        purpose = "source",
        key = crypto.randomUUID(),
        expectedEpoch = epoch,
      } = {},
    ) {
      const data = new Uint8Array(await file.arrayBuffer()),
        hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
      const types = {
        json: "application/json",
        musicxml: "application/vnd.recordare.musicxml+xml",
        xml: "application/xml",
        mxl: "application/vnd.recordare.musicxml",
        mid: "audio/midi",
        midi: "audio/midi",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        pdf: "application/pdf",
      };
      const mimeType =
        types[file.name?.split(".").at(-1).toLowerCase()] || file.type;
      const staged = await api.json("/uploads", {
        method: "POST",
        key: key + ":stage",
        expectedEpoch,
        body: {
          name: file.name || "source",
          mimeType,
          bytes: data.length,
          sha256: hash,
          purpose,
        },
      });
      await api.request(`/uploads/${staged.uploadId}/content`, {
        method: "PUT",
        key: key + ":content",
        expectedEpoch,
        body: data,
        binary: true,
      });
      const resource = await api.json(`/uploads/${staged.uploadId}/complete`, {
        method: "POST",
        key: key + ":complete",
        expectedEpoch,
        body: { sha256: hash },
      });
      return { uploadId: staged.uploadId, ...resource };
    },
    async download(rid, name) {
      const r = await request("/resources/" + rid),
        blob = await r.blob();
      const u = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = u;
      const match = r.headers
        .get("content-disposition")
        ?.match(/filename\*=UTF-8''([^;]+)/i);
      let fromHeader;
      try {
        fromHeader = match && decodeURIComponent(match[1]);
      } catch {}
      a.download = name || fromHeader || "琴伴文件";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    },
  };
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel("qinban-account-identity")
      : null;
  const announce = () => channel?.postMessage({ changed: true });
  if (channel)
    channel.onmessage = () => {
      epoch++;
      session = null;
      onIdentityChange(null);
      for (const fn of listeners) fn(null);
      void api.initialize().catch(() => {});
    };
  api.dispose = () => {
    epoch++;
    session = null;
    channel?.close();
    listeners.clear();
  };
  return api;
}

export function createHostedLibrary(account) {
  let summaries = [],
    initialized;
  const resourceCache = new Map();
  const metadataMap = new Map(),
    metadata = {
      get: async (k) => metadataMap.get(k),
      set: async (k, v) => metadataMap.set(k, v),
    };
  const noLogin = () =>
    Object.assign(new Error("请在“账号与私有曲库”登录。"), {
      code: "SESSION_REQUIRED",
      status: 401,
    });
  account.subscribe(() => {
    summaries = [];
    initialized = null;
    metadataMap.clear();
    resourceCache.clear();
  });
  async function list() {
    if (!initialized)
      initialized = account.initialize().catch((e) => {
        initialized = null;
        throw e;
      });
    await initialized;
    if (!account.session) return { records: [], warnings: [] };
    const generation = account.epoch;
    const all = [];
    let cursor;
    do {
      const page = await account.json(
        "/library/entries?limit=100" + (cursor ? "&cursor=" + cursor : ""),
        { expectedEpoch: generation },
      );
      all.push(...page.records);
      cursor = page.nextCursor;
    } while (cursor);
    summaries = all;
    // The existing player requires score projections; load documents, never image bytes here.
    const { toPracticeScore } = await import("../../lib/score-document.ts");
    const records = [];
    for (const s of all) {
      const e = await account.json("/library/entries/" + s.entryId, {
        expectedEpoch: generation,
      });
      records.push({
        id: s.documentId,
        entryId: s.entryId,
        document: e.document,
        score: toPracticeScore(e.document),
        revision: s.revision,
        createdAt: s.updatedAt,
        updatedAt: s.updatedAt,
        history: [],
        assets: [],
        sourceNotation: e.sourceNotation,
        reviewStatus: { status: s.reviewState, humanConfirmed: false },
      });
    }
    account.checkEpoch(generation);
    return { records, warnings: [] };
  }
  async function get(docId, generation = account.epoch) {
    account.checkEpoch(generation);
    const found = summaries.find((s) => s.documentId === docId);
    if (!found)
      throw Object.assign(new Error("账号曲库中没有这份乐谱。"), {
        code: "LIBRARY_NOT_FOUND",
      });
    const e = await account.json("/library/entries/" + found.entryId, {
        expectedEpoch: generation,
      }),
      assets = [];
    let originalFile;
    const base64 = async (r) => {
      const bytes = new Uint8Array(await r.arrayBuffer());
      let text = "";
      for (let i = 0; i < bytes.length; i += 32768)
        text += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return btoa(text);
    };
    for (const a of e.assets) {
      const r = await account.request("/resources/" + a.resourceId, {
          expectedEpoch: generation,
        }),
        data = await base64(r);
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
        hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (n) => n.toString(16).padStart(2, "0"),
        ).join("");
      account.checkEpoch(generation);
      resourceCache.set(hash, a.resourceId);
      let filename = "source";
      try {
        const m = r.headers
          .get("content-disposition")
          ?.match(/filename\*=UTF-8''([^;]+)/i);
        if (m) filename = decodeURIComponent(m[1]);
      } catch {}
      if (a.role === "original")
        originalFile = {
          name: filename,
          mimeType: r.headers.get("content-type"),
          data,
        };
      else
        assets.push({
          id: a.assetId,
          page: a.page,
          system: a.system,
          mimeType: r.headers.get("content-type"),
          data,
        });
    }
    const { normalizeLibraryRecord } =
      await import("../../lib/library-format.ts");
    account.checkEpoch(generation);
    return {
      ...normalizeLibraryRecord({
        document: e.document,
        revision: e.summary.revision,
        createdAt: e.summary.updatedAt,
        updatedAt: e.summary.updatedAt,
        sourceNotation: e.sourceNotation,
        assets,
        reviewStatus: { status: "unreviewed", humanConfirmed: false },
        warnings: e.warnings,
        ...(originalFile ? { originalFile } : {}),
      }),
      entryId: found.entryId,
    };
  }
  async function ensureFile(
    file,
    purpose = "source",
    generation = account.epoch,
  ) {
    const bytes = await file.arrayBuffer(),
      hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (n) => n.toString(16).padStart(2, "0"),
      ).join("");
    account.checkEpoch(generation);
    if (resourceCache.has(hash)) return { resourceId: resourceCache.get(hash) };
    const r = await account.upload(file, {
      purpose,
      expectedEpoch: generation,
    });
    account.checkEpoch(generation);
    resourceCache.set(hash, r.resourceId);
    return r;
  }
  return {
    metadata,
    list,
    get,
    async save(record, { expectedRevision = 0 } = {}) {
      if (!account.session) throw noLogin();
      const generation = account.epoch;
      const { readScoreDocument } = await import("../../lib/score-document.ts");
      account.checkEpoch(generation);
      record = {
        ...record,
        document: readScoreDocument(record.document || record.score),
      };
      const known = summaries.find((s) => s.documentId === record.document.id),
        assets = [];
      for (const a of record.assets || []) {
        const bytes = Uint8Array.from(atob(a.data), (c) => c.charCodeAt(0));
        const f = new File([bytes], "source." + a.mimeType.split("/")[1], {
          type: a.mimeType,
        });
        const r = await ensureFile(f, "source", generation);
        assets.push({
          resourceId: r.resourceId,
          assetId: a.id,
          role: "source_image",
          ...(a.page ? { page: a.page } : {}),
          ...(a.system ? { system: a.system } : {}),
        });
      }
      if (record.originalFile) {
        const f = record.originalFile,
          bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0)),
          r = await ensureFile(
            new File([bytes], f.name, { type: f.mimeType }),
            "digital",
            generation,
          );
        assets.push({
          resourceId: r.resourceId,
          assetId: "original-file",
          role: "original",
        });
      }
      const parent = summaries.find(
          (s) => s.documentId === record.document.lineage?.parentId,
        ),
        previous =
          known || parent
            ? await account.json(
                "/library/entries/" + (known || parent).entryId,
                { expectedEpoch: generation },
              )
            : null;
      const payload = {
        expectedRevision,
        document: record.document,
        sourceNotation: record.sourceNotation || null,
        assets,
        sourceGroupIds: previous?.sourceGroupIds || [],
        warnings: record.warnings || [],
      };
      const r = await account.json(
        "/library/entries" + (known ? "/" + known.entryId : ""),
        {
          method: known ? "PUT" : "POST",
          expectedEpoch: generation,
          body: payload,
        },
      );
      if (!known) summaries.push(r.summary);
      else Object.assign(known, r.summary);
      return get(r.document.id, generation);
    },
    async remove(docId) {
      const known = summaries.find((s) => s.documentId === docId);
      if (!known) throw noLogin();
      await account.json(
        `/library/entries/${known.entryId}?expectedRevision=${known.revision}`,
        { method: "DELETE", body: {} },
      );
      summaries = summaries.filter((s) => s.documentId !== docId);
    },
    async backup() {
      const r = await account.json("/library/exports", {
        method: "POST",
        body: { includeHistory: true },
      });
      return (await account.request("/resources/" + r.resourceId)).json();
    },
    async restore() {
      throw new Error("请在“账号与私有曲库”预览并确认备份导入。");
    },
  };
}
