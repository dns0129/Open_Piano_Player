// @ts-check
import { readLibraryBackup, validateLibraryRecord } from "../library-format.ts";
import { validatePrivateFile } from "./storage.mjs";
import { fail, missing, id, uuid, iso, sha, digest } from "./common.mjs";

export function createPrivateTransfers({
  db,
  files,
  library,
  now = () => Date.now(),
  quotaBytes = 1024 * 1024 * 1024,
}) {
  const date = () => new Date(now()).toISOString();
  async function operation(tx, owner, oid, kind) {
    if (!uuid(oid)) throw missing();
    const o = (
      await tx.query(
        "SELECT * FROM qinban_private.operations WHERE owner_id=$1 AND id=$2 AND kind=$3 FOR UPDATE",
        [owner, oid, kind],
      )
    ).rows[0];
    if (!o || new Date(o.expires_at).getTime() <= now()) throw missing();
    return o;
  }
  async function addResource(
    owner,
    bytes,
    mimeType,
    name,
    /** @type {{ backup?: boolean, expiresAt?: string, tx?: any }} */ {
      backup = false,
      expiresAt,
      tx: providedTx,
    } = {},
  ) {
    const write = async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        owner + ":quota",
      ]);
      const hash = sha(bytes);
      const previous = (
        await tx.query(
          "SELECT * FROM qinban_private.resources WHERE owner_id=$1 AND sha256=$2 AND state='ready' LIMIT 1",
          [owner, hash],
        )
      ).rows[0];
      if (previous && !backup) return previous.id;
      const used = Number(
        (
          await tx.query(
            "SELECT COALESCE(SUM(byte_size),0) AS used FROM qinban_private.resources WHERE owner_id=$1 AND state NOT IN ('quarantined','duplicate')",
            [owner],
          )
        ).rows[0].used,
      );
      if (used + bytes.length > quotaBytes)
        throw fail("STORAGE_QUOTA", "账号存储空间不足。", 429);
      const metadata = backup
          ? { name, backup: true, expiresAt }
          : await validatePrivateFile(bytes, {
              mimeType,
              name,
              purpose: "migration",
            }),
        rid = id();
      await files.write(owner, rid, bytes);
      await tx.query(
        "INSERT INTO qinban_private.resources VALUES($1,$2,$3,$4,$5,'ready',$6,$7)",
        [
          rid,
          owner,
          hash,
          mimeType,
          bytes.length,
          JSON.stringify(metadata),
          date(),
        ],
      );
      return rid;
    };
    return providedTx ? write(providedTx) : db.private(owner, write);
  }
  async function parseBackup(tx, owner, uploadId) {
    if (!uuid(uploadId)) throw missing();
    const u = (
      await tx.query(
        "SELECT * FROM qinban_private.uploads WHERE owner_id=$1 AND id=$2 AND state='complete'",
        [owner, uploadId],
      )
    ).rows[0];
    if (!u || u.payload.purpose !== "backup") throw missing();
    const r = (
      await tx.query(
        "SELECT * FROM qinban_private.resources WHERE owner_id=$1 AND (id=$2 OR (sha256=$3 AND state='ready')) ORDER BY (id=$2) DESC LIMIT 1",
        [owner, u.resource_id, u.payload.sha256],
      )
    ).rows[0];
    if (!r) throw missing();
    const bytes = await files.read(owner, r.id);
    if (sha(bytes) !== u.payload.sha256)
      throw fail("INVALID_BACKUP", "备份完整性检查失败。");
    const raw = JSON.parse(bytes);
    if (raw.version === 1)
      return { raw, records: await readLibraryBackup(raw), groups: [] };
    if (
      raw.format !== "qinban-library-backup" ||
      raw.version !== 2 ||
      digest({
        records: raw.records,
        sourceGroups: raw.sourceGroups,
        resources: raw.resources,
      }) !== raw.sha256
    )
      throw fail("INVALID_BACKUP", "备份格式或校验值无效。");
    const resources = raw.resources;
    if (
      !resources ||
      !Array.isArray(raw.records) ||
      !Array.isArray(raw.sourceGroups) ||
      raw.records.length > 10000
    )
      throw fail("INVALID_BACKUP", "备份内容无效。");
    for (const [hash, v] of Object.entries(resources)) {
      if (
        !v ||
        typeof v.data !== "string" ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(v.data) ||
        !Number.isInteger(v.bytes)
      )
        throw fail("INVALID_BACKUP", "备份资源内容无效。");
      const b = Buffer.from(v.data, "base64");
      if (sha(b) !== hash || b.length !== v.bytes)
        throw fail("INVALID_BACKUP", "备份资源校验失败。");
    }
    function unpack(r, depth = 0) {
      if (depth > 1) throw fail("INVALID_BACKUP", "修订历史嵌套无效。");
      const hydrate = (a) => {
        if (!resources[a.resource])
          throw fail("INVALID_BACKUP", "备份缺少原文件。");
        return { ...a, data: resources[a.resource].data };
      };
      return {
        ...r,
        assets: r.assets.map(hydrate),
        ...(r.originalFile ? { originalFile: hydrate(r.originalFile) } : {}),
        history: (r.history || []).map((h) => unpack(h, depth + 1)),
      };
    }
    return {
      raw,
      records: raw.records.map((r) => validateLibraryRecord(unpack(r))),
      groups: raw.sourceGroups,
    };
  }
  const snapshotIdentity = (r) => ({
    document: r.document,
    sourceNotation: r.sourceNotation || null,
    assets: r.assets
      .map((a) => ({
        id: a.id,
        page: a.page || null,
        system: a.system || null,
        mimeType: a.mimeType,
        sha256: sha(Buffer.from(a.data, "base64")),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    originalFile: r.originalFile
      ? {
          name: r.originalFile.name,
          mimeType: r.originalFile.mimeType,
          sha256: sha(Buffer.from(r.originalFile.data, "base64")),
        }
      : null,
  });
  const groupIdentity = (g) => ({
    kind: g.kind,
    pages: g.pages.map((p) => ({
      ordinal: p.ordinal,
      scope: p.scope,
      rotation: p.rotation || 0,
      original: p.originalResource,
      recognition: p.recognitionResource || null,
      first: p.firstCompleteSystem || null,
      last: p.lastCompleteSystem || null,
    })),
  });
  async function storedIdentity(tx, owner, e) {
    const revisions = (
        await tx.query(
          "SELECT payload FROM qinban_private.revisions WHERE owner_id=$1 AND entry_id=$2 ORDER BY revision",
          [owner, e.id],
        )
      ).rows,
      history = [],
      groups = new Map();
    for (const { payload: p } of revisions) {
      history.push(
        snapshotIdentity({ ...p, ...(await library.hydrate(tx, owner, p)) }),
      );
      for (const gid of p.sourceGroupIds)
        if (!groups.has(gid)) {
          const g = (
              await tx.query(
                "SELECT * FROM qinban_private.source_groups WHERE owner_id=$1 AND id=$2",
                [owner, gid],
              )
            ).rows[0],
            pages = [];
          for (const p of g.pages) {
            const original = await library.resource(
                tx,
                owner,
                p.originalResourceId,
              ),
              recognition = p.recognitionResourceId
                ? await library.resource(tx, owner, p.recognitionResourceId)
                : null;
            pages.push({
              ...p,
              originalResource: original.sha256,
              ...(recognition
                ? { recognitionResource: recognition.sha256 }
                : {}),
            });
          }
          groups.set(gid, groupIdentity({ ...g, pages }));
        }
    }
    return digest({
      history,
      groups: [...new Set([...groups.values()].map(digest))].sort(),
    });
  }
  const incomingIdentity = (record, backup) =>
    digest({
      history: [...record.history, record].map(snapshotIdentity),
      groups: [
        ...new Set(
          backup.groups
            .filter((g) => (g.documentIds || []).includes(record.id))
            .map((g) => digest(groupIdentity(g))),
        ),
      ].sort(),
    });
  return {
    async export(owner, input, key) {
      return library.mutation(owner, "export", key, input, async (tx) => {
        const eid = id(),
          expiresAt = new Date(now() + 86400000).toISOString();
        let entries = (
          await tx.query(
            "SELECT * FROM qinban_private.entries WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY id",
            [owner],
          )
        ).rows;
        if (input.entryIds?.length) {
          if (input.entryIds.some((x) => !uuid(x))) throw missing();
          entries = entries.filter((e) => input.entryIds.includes(e.id));
          if (entries.length !== new Set(input.entryIds).size) throw missing();
        }
        const records = [],
          resourceMap = {},
          groupIds = new Map();
        async function pack(p, revision, createdAt) {
          const assets = [];
          let originalFile;
          for (const a of p.assets) {
            const r = await library.resource(tx, owner, a.resourceId),
              bytes = await files.read(owner, r.id);
            if (sha(bytes) !== r.sha256)
              throw fail("RESOURCE_CORRUPTED", "备份资源校验失败。", 503);
            resourceMap[r.sha256] = {
              mimeType: r.mime_type,
              bytes: bytes.length,
              data: bytes.toString("base64"),
            };
            const value = {
              id: a.assetId,
              page: a.page,
              system: a.system,
              mimeType: r.mime_type,
              resource: r.sha256,
            };
            if (a.role === "original")
              originalFile = {
                name: r.metadata.name || "source",
                mimeType: r.mime_type,
                resource: r.sha256,
              };
            else assets.push(value);
          }
          for (const gid of p.sourceGroupIds) {
            if (!groupIds.has(gid)) groupIds.set(gid, new Set());
            groupIds.get(gid).add(p.document.id);
          }
          return {
            id: p.document.id,
            document: p.document,
            revision,
            createdAt,
            updatedAt: createdAt,
            sourceNotation: p.sourceNotation,
            assets,
            reviewStatus: p.reviewStatus,
            warnings: p.warnings,
            ...(originalFile ? { originalFile } : {}),
          };
        }
        for (const e of entries) {
          const revs = (
            await tx.query(
              "SELECT * FROM qinban_private.revisions WHERE owner_id=$1 AND entry_id=$2 AND revision<=$3 ORDER BY revision",
              [owner, e.id, e.revision],
            )
          ).rows;
          const history = [];
          for (const r of revs)
            history.push(await pack(r.payload, r.revision, iso(r.created_at)));
          const current = /** @type {any} */ (history.pop());
          // Every entry has at least its first revision; skip a row without one rather than fail the export.
          if (!current) continue;
          current.history = history;
          records.push(current);
        }
        if (!input.entryIds?.length)
          for (const g of (
            await tx.query(
              "SELECT id FROM qinban_private.source_groups WHERE owner_id=$1 AND pinned=true",
              [owner],
            )
          ).rows)
            if (!groupIds.has(g.id)) groupIds.set(g.id, new Set());
        const sourceGroups = [];
        for (const [gid, documentIds] of groupIds) {
          const g = (
            await tx.query(
              "SELECT * FROM qinban_private.source_groups WHERE owner_id=$1 AND id=$2",
              [owner, gid],
            )
          ).rows[0];
          if (!g) throw missing();
          const pages = [];
          for (const p of g.pages) {
            const copy = {
              ordinal: p.ordinal,
              scope: p.scope,
              rotation: p.rotation || 0,
              ...(p.firstCompleteSystem
                ? {
                    firstCompleteSystem: p.firstCompleteSystem,
                    lastCompleteSystem: p.lastCompleteSystem,
                  }
                : {}),
            };
            for (const [from, to] of [
              ["originalResourceId", "originalResource"],
              ["recognitionResourceId", "recognitionResource"],
            ])
              if (p[from]) {
                const r = await library.resource(tx, owner, p[from]),
                  bytes = await files.read(owner, r.id);
                if (sha(bytes) !== r.sha256)
                  throw fail("RESOURCE_CORRUPTED", "备份原图校验失败。", 503);
                resourceMap[r.sha256] = {
                  mimeType: r.mime_type,
                  bytes: bytes.length,
                  data: bytes.toString("base64"),
                };
                copy[to] = r.sha256;
              }
            pages.push(copy);
          }
          sourceGroups.push({
            id: gid,
            kind: g.kind,
            pages,
            documentIds: [...documentIds],
          });
        }
        const payload = { records, sourceGroups, resources: resourceMap },
          backup = {
            format: "qinban-library-backup",
            version: 2,
            exportedAt: date(),
            ...payload,
            sha256: digest(payload),
          };
        const bytes = Buffer.from(JSON.stringify(backup));
        if (bytes.length > 512 * 1024 * 1024)
          throw fail("BACKUP_SIZE", "备份超过 512 MiB，请分批导出。", 413);
        const rid = await addResource(
            owner,
            bytes,
            "application/json",
            "琴伴私有曲库备份.json",
            { backup: true, expiresAt, tx },
          ),
          result = {
            exportId: eid,
            state: "ready",
            resourceId: rid,
            expiresAt,
          };
        await tx.query(
          "INSERT INTO qinban_private.operations VALUES($1,$2,'export',$3,'ready',$4)",
          [eid, owner, JSON.stringify({ result }), expiresAt],
        );
        return result;
      });
    },
    async exportState(owner, eid) {
      return db.private(owner, async (tx) => {
        const o = await operation(tx, owner, eid, "export");
        return (
          o.payload.result || {
            exportId: o.id,
            state: o.state,
            expiresAt: iso(o.expires_at),
          }
        );
      });
    },
    preview: (owner, input, key, email) =>
      library.mutation(owner, "import-preview", key, input, async (tx) => {
        const backup = await parseBackup(tx, owner, input.uploadId),
          items = [];
        for (const record of backup.records) {
          const e = (
            await tx.query(
              "SELECT * FROM qinban_private.entries WHERE owner_id=$1 AND document_id=$2",
              [owner, record.id],
            )
          ).rows[0];
          const fingerprint = incomingIdentity(record, backup);
          items.push({
            documentId: record.id,
            state: !e
              ? "new"
              : !e.deleted_at &&
                  (await storedIdentity(tx, owner, e)) === fingerprint
                ? "already_present"
                : "conflict",
            expectedRevision: e?.revision || 0,
            fingerprint,
          });
        }
        for (const g of backup.groups.filter(
          (g) => !(g.documentIds || []).length,
        ))
          items.push({
            documentId: "source:" + g.id,
            state: "new",
            expectedRevision: 0,
            fingerprint: digest(g),
          });
        const importId = id(),
          expiresAt = new Date(now() + 1800000).toISOString(),
          previewDigest = digest({ owner, items, uploadId: input.uploadId });
        await tx.query(
          "INSERT INTO qinban_private.operations VALUES($1,$2,'import',$3,'preview',$4)",
          [
            importId,
            owner,
            JSON.stringify({
              uploadId: input.uploadId,
              items,
              previewDigest,
              targetEmail: email,
            }),
            expiresAt,
          ],
        );
        return {
          importId,
          targetUserId: owner,
          targetEmail: email,
          previewDigest,
          expiresAt,
          items,
        };
      }),
    async commit(owner, importId, input, key) {
      const o = await db.private(owner, (tx) =>
        operation(tx, owner, importId, "import"),
      );
      if (input.previewDigest !== o.payload.previewDigest)
        throw fail(
          "IMPORT_PREVIEW_CHANGED",
          "导入预览已变化，请重新预览。",
          409,
        );
      if (
        !Array.isArray(input.decisions) ||
        new Set(input.decisions.map((d) => d.documentId)).size !==
          input.decisions.length ||
        input.decisions.some(
          (d) =>
            !o.payload.items.some((i) => i.documentId === d.documentId) ||
            !["skip", "copy", "replace"].includes(d.decision),
        )
      )
        throw fail("INVALID_IMPORT_DECISIONS", "导入选择无效。");
      const backup = await db.private(owner, (tx) =>
          parseBackup(tx, owner, o.payload.uploadId),
        ),
        results = [];
      async function importGroup(g) {
        const pages = [];
        for (const p of g.pages) {
          const value = {
            ordinal: p.ordinal,
            scope: p.scope || "unknown",
            rotation: p.rotation || 0,
          };
          for (const [a, b] of [
            ["originalResource", "originalResourceId"],
            ["recognitionResource", "recognitionResourceId"],
          ])
            if (p[a]) {
              const r = backup.raw.resources[p[a]];
              if (!r) throw fail("INVALID_BACKUP", "备份缺少来源图片。");
              value[b] = await addResource(
                owner,
                Buffer.from(r.data, "base64"),
                r.mimeType,
                "source-image",
              );
            }
          if (p.firstCompleteSystem) {
            value.firstCompleteSystem = p.firstCompleteSystem;
            value.lastCompleteSystem = p.lastCompleteSystem;
          }
          pages.push(value);
        }
        return library.sourceGroup(
          owner,
          { kind: g.kind, pages },
          digest({ importId, group: g.id }),
          { trustedImport: true },
        );
      }

      for (const choice of input.decisions) {
        const done = o.payload.result?.items?.find(
          (r) =>
            r.documentId === choice.documentId &&
            ["imported", "already_present", "skipped"].includes(r.state),
        );
        if (done) {
          results.push(done);
          continue;
        }
        const preview = o.payload.items.find(
            (i) => i.documentId === choice.documentId,
          ),
          record = backup.records.find((r) => r.id === choice.documentId);
        if (choice.decision === "skip") {
          results.push({ documentId: choice.documentId, state: "skipped" });
          continue;
        }
        if (!record) {
          try {
            const g = backup.groups.find(
              (g) => "source:" + g.id === choice.documentId,
            );
            if (!g) throw missing();
            const result = await importGroup(g);
            results.push({
              documentId: choice.documentId,
              state: "imported",
              sourceGroupId: result.sourceGroupId,
            });
          } catch (e) {
            results.push({
              documentId: choice.documentId,
              state: "failed",
              errorCode: e.code || "IMPORT_FAILED",
            });
          }
          continue;
        }
        if (preview.state === "already_present") {
          results.push({ documentId: record.id, state: "already_present" });
          continue;
        }
        try {
          const revisionInputs = [];
          for (const snapshot of [...record.history, record]) {
            const assets = [];
            for (const a of snapshot.assets) {
              const rid = await addResource(
                owner,
                Buffer.from(a.data, "base64"),
                a.mimeType,
                `source-${a.id}`,
              );
              assets.push({
                resourceId: rid,
                assetId: a.id,
                role: "source_image",
                ...(a.page ? { page: a.page } : {}),
                ...(a.system ? { system: a.system } : {}),
              });
            }
            if (snapshot.originalFile) {
              const f = snapshot.originalFile,
                rid = await addResource(
                  owner,
                  Buffer.from(f.data, "base64"),
                  f.mimeType,
                  f.name,
                );
              assets.push({
                resourceId: rid,
                assetId: "original-file",
                role: "original",
              });
            }
            revisionInputs.push({
              document: snapshot.document,
              sourceNotation: snapshot.sourceNotation,
              sourceGroupIds: [],
              assets,
              warnings: snapshot.warnings,
            });
          }
          const groups = [];
          for (const g of backup.groups.filter((g) =>
            (g.documentIds || []).includes(record.id),
          ))
            groups.push((await importGroup(g)).sourceGroupId);
          const result = await library.mutation(
            owner,
            "import-item:" + importId,
            digest({ importId, documentId: record.id, choice }),
            { choice, previewDigest: input.previewDigest },
            async (tx) => {
              let eid = null,
                expected = 0,
                targetId = record.id;
              const current = (
                await tx.query(
                  "SELECT * FROM qinban_private.entries WHERE owner_id=$1 AND document_id=$2 FOR UPDATE",
                  [owner, record.id],
                )
              ).rows[0];
              if (choice.decision === "replace") {
                if (
                  choice.expectedRevision !== preview.expectedRevision ||
                  !current ||
                  current.revision !== preview.expectedRevision ||
                  current.deleted_at
                )
                  throw fail("REVISION_CONFLICT", "曲谱已变化，未覆盖。", 409);
                eid = current.id;
                expected = current.revision;
              } else if (current)
                targetId = record.id.slice(0, 50) + "-copy-" + id();
              let saved;
              for (const r of revisionInputs) {
                const document = {
                  ...r.document,
                  id: targetId,
                  ...(targetId !== record.id
                    ? {
                        lineage: {
                          ...r.document.lineage,
                          originalId:
                            r.document.lineage?.originalId || record.id,
                          parentId: record.id,
                        },
                      }
                    : {}),
                };
                const notation = r.sourceNotation
                  ? { ...r.sourceNotation, scoreId: targetId }
                  : null;
                saved = await library.saveTx(tx, owner, eid, {
                  ...r,
                  document,
                  sourceNotation: notation,
                  sourceGroupIds: groups,
                  expectedRevision: expected,
                });
                eid = saved.summary.entryId;
                expected = saved.summary.revision;
              }
              return { documentId: record.id, entryId: eid, state: "imported" };
            },
          );
          results.push(result);
        } catch (e) {
          results.push({
            documentId: record.id,
            state: e.code === "REVISION_CONFLICT" ? "conflict" : "failed",
            errorCode: e.code || "IMPORT_FAILED",
          });
        }
      }
      const state = results.some((r) =>
          ["failed", "conflict"].includes(r.state),
        )
          ? "partial"
          : "completed",
        result = { importId, state, items: results };
      await db.private(owner, (tx) =>
        tx.query(
          "UPDATE qinban_private.operations SET state=$1,payload=$2 WHERE owner_id=$3 AND id=$4",
          [state, JSON.stringify({ ...o.payload, result }), owner, importId],
        ),
      );
      return result;
    },
    async importState(owner, iid) {
      return db.private(owner, async (tx) => {
        const o = await operation(tx, owner, iid, "import");
        return (
          o.payload.result || {
            importId: iid,
            state: o.state === "preview" ? "queued" : o.state,
            items: [],
          }
        );
      });
    },
  };
}
