import {
  normalizeLibraryRecord,
  createLibraryBackup,
  readLibraryBackup,
  encodeLibraryResources,
  decodeLibraryResources,
  referencedResources,
  contentHash,
  librarySummary,
} from "../lib/library-format.ts";

const missing = () =>
  Object.assign(new Error("浏览器曲库中没有这份乐谱。"), {
    code: "LIBRARY_NOT_FOUND",
    status: 404,
  });
const conflict = () =>
  Object.assign(new Error("乐谱已在另一窗口修改，请重新打开后保存。"), {
    code: "REVISION_CONFLICT",
    status: 409,
  });
export function createBrowserLibrary({
  name = "qinban-library-v2",
  indexedDB = globalThis.indexedDB,
} = {}) {
  let database;
  function open() {
    if (!database)
      database = new Promise((resolve, reject) => {
        const req = indexedDB.open(name, 2);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains("records"))
            req.result.createObjectStore("records", { keyPath: "id" });
          for (const store of ["metadata", "resources"])
            if (!req.result.objectStoreNames.contains(store))
              req.result.createObjectStore(store);
        };
        req.onsuccess = () => {
          req.result.onversionchange = () => {
            req.result.close();
            database = null;
          };
          resolve(req.result);
        };
        req.onblocked = () =>
          reject(
            new Error("曲库升级正在等待其他窗口关闭，请关闭旧琴伴页面后重试。"),
          );
        req.onerror = () => {
          database = null;
          reject(req.error || new Error("无法打开浏览器曲库。"));
        };
      });
    return database;
  }
  async function transaction(stores, mode, work) {
    const db = await open(),
      names = Array.isArray(stores) ? stores : [stores];
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      let value, error;
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () =>
        reject(
          error || tx.error || new Error("曲库事务未保存，请导出备份后重试。"),
        );
      try {
        work(
          tx.objectStore(names[0]),
          (v) => {
            value = v;
          },
          (e) => {
            error = e;
            tx.abort();
          },
          tx,
        );
      } catch (e) {
        error = e;
        tx.abort();
      }
    });
  }
  const getRaw = (id) =>
    transaction("records", "readonly", (store, done) => {
      store.get(id).onsuccess = (e) => done(e.target.result);
    });
  async function hydrate(raw) {
    const keys = referencedResources([raw]),
      resources = await transaction("resources", "readonly", (store, done) => {
        const values = {};
        if (!keys.length) {
          done(values);
          return;
        }
        for (const key of keys)
          store.get(key).onsuccess = (e) => {
            values[key] = e.target.result;
            if (Object.keys(values).length === keys.length) done(values);
          };
      });
    for (const [key, data] of Object.entries(resources))
      if (typeof data !== "string" || (await contentHash(data)) !== key)
        throw new Error("原谱资源完整性校验失败。");
    return decodeLibraryResources([raw], resources)[0];
  }
  const listRaw = () =>
    transaction("records", "readonly", (store, done) => {
      store.getAll().onsuccess = (e) =>
        done(e.target.result.filter((r) => !r.deleted));
    });
  return {
    async list() {
      return { records: (await listRaw()).map(librarySummary) };
    },
    async get(id) {
      const raw = await getRaw(id);
      if (!raw || raw.deleted) throw missing();
      return hydrate(raw);
    },
    async save(input, { expectedRevision } = {}) {
      const id = input.document?.id || input.score?.id || input.id,
        raw = await getRaw(id);
      const previous = raw
        ? await hydrate(raw.deleted ? raw.record : raw)
        : undefined;
      const activeRevision = raw && !raw.deleted ? raw.revision : 0;
      if (expectedRevision !== undefined && expectedRevision !== activeRevision)
        throw conflict();
      const record = normalizeLibraryRecord(input, previous),
        packed = await encodeLibraryResources([record]);
      return transaction(
        ["records", "resources"],
        "readwrite",
        (store, done, abort, tx) => {
          store.get(id).onsuccess = (e) => {
            try {
              const current = e.target.result,
                revision = current && !current.deleted ? current.revision : 0;
              if (revision !== activeRevision) throw conflict();
              for (const [key, data] of Object.entries(packed.resources))
                tx.objectStore("resources").put(data, key);
              store.put(packed.records[0]);
              done(record);
            } catch (error) {
              abort(error);
            }
          };
        },
      );
    },
    async remove(id) {
      return transaction("records", "readwrite", (store, done, abort) => {
        store.get(id).onsuccess = (e) => {
          try {
            const raw = e.target.result;
            if (!raw || raw.deleted) throw missing();
            store.put({ id, deleted: true, record: raw });
            done({ id, deleted: true });
          } catch (error) {
            abort(error);
          }
        };
      });
    },
    async backup() {
      return createLibraryBackup(
        await Promise.all((await listRaw()).map(hydrate)),
      );
    },
    async restore(input) {
      const incoming = await readLibraryBackup(input),
        packed = await encodeLibraryResources(incoming);
      return transaction(
        ["records", "resources"],
        "readwrite",
        (store, done, abort, tx) => {
          store.getAll().onsuccess = (e) => {
            try {
              const ids = new Set(
                  e.target.result.filter((r) => !r.deleted).map((r) => r.id),
                ),
                restored = [],
                conflicts = [],
                selected = [];
              for (const record of packed.records) {
                if (ids.has(record.id)) conflicts.push(record.id);
                else {
                  store.put(record);
                  selected.push(record);
                  restored.push(record.id);
                }
              }
              for (const key of referencedResources(selected))
                tx.objectStore("resources").put(packed.resources[key], key);
              done({ restored, conflicts });
            } catch (error) {
              abort(error);
            }
          };
        },
      );
    },
    metadata: {
      get: (key) =>
        transaction("metadata", "readonly", (store, done) => {
          store.get(key).onsuccess = (e) => done(e.target.result);
        }),
      set: (key, value) =>
        transaction("metadata", "readwrite", (store, done) => {
          store.put(value, key);
          done(value);
        }),
    },
    async close() {
      const db = await database;
      db?.close();
      database = null;
    },
  };
}
