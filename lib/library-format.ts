import {
  readScoreDocument,
  toPracticeScore,
  validateScoreDocument,
} from "./score-document.ts";
import { validateSourceNotation } from "./score-notation-data.ts";
import type { LibraryRecord, SourceNotation } from "./score-types.ts";

export const validLibraryId = (id: unknown): id is string =>
  typeof id === "string" &&
  id.length > 0 &&
  id.length <= 100 &&
  !/[\u0000-\u001f]/.test(id);
const fail = (message: string) =>
  Object.assign(new Error(message), {
    public: true,
    code: "INVALID_LIBRARY_DATA",
    status: 422,
  });
function originalFileOf(value: unknown): LibraryRecord["originalFile"] {
  if (value === undefined) return undefined;
  const f = value as NonNullable<LibraryRecord["originalFile"]>;
  if (
    !f ||
    typeof f.name !== "string" ||
    !f.name ||
    f.name.length > 250 ||
    typeof f.mimeType !== "string" ||
    f.mimeType.length > 120 ||
    typeof f.data !== "string" ||
    !f.data.length ||
    f.data.length > 72 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(f.data)
  )
    throw fail("原始乐谱文件无效。");
  return {
    name: f.name.replace(/[\u0000-\u001f]/g, ""),
    mimeType: f.mimeType,
    data: f.data,
  };
}
function assetsOf(value: unknown): LibraryRecord["assets"] {
  if (!Array.isArray(value) || value.length > 1000)
    throw fail("曲库图片列表无效。");
  const ids = new Set<string>();
  return value.map((a) => {
    if (
      !a ||
      !validLibraryId(a.id) ||
      ids.has(a.id) ||
      !["image/png", "image/jpeg", "image/webp"].includes(a.mimeType) ||
      typeof a.data !== "string" ||
      !a.data.length ||
      a.data.length > 16 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(a.data)
    )
      throw fail("曲库图片内容无效。");
    ids.add(a.id);
    return {
      id: a.id,
      mimeType: a.mimeType,
      data: a.data,
      ...(a.page !== undefined ? { page: a.page } : {}),
      ...(a.system !== undefined ? { system: a.system } : {}),
    };
  });
}
export function recordSnapshot(
  record: LibraryRecord,
): Omit<LibraryRecord, "history"> {
  const { history, ...snapshot } = record;
  return structuredClone(snapshot);
}
export function normalizeLibraryRecord(
  input: unknown,
  previous?: LibraryRecord,
  now = new Date().toISOString(),
): LibraryRecord {
  const raw = input as Record<string, unknown>;
  if (!raw || typeof raw !== "object") throw fail("曲库记录无效。");
  const notation = raw.sourceNotation
    ? validateSourceNotation(raw.sourceNotation)
    : undefined;
  const document = readScoreDocument(
    raw.document || raw.score || raw,
    notation ? { sourceNotation: notation } : {},
  );
  if (!validLibraryId(document.id)) throw fail("曲库乐谱 ID 无效。");
  if (raw.id !== undefined && raw.id !== document.id)
    throw fail("曲库记录与乐谱 ID 不一致。");
  const assets = assetsOf(raw.assets || []);
  const sourceNotation: SourceNotation | null =
    notation || (assets.length ? document.sourceNotation : null) || null;
  if (sourceNotation) {
    const ids = new Set(assets.map((a) => a.id));
    for (const s of sourceNotation.systems)
      if (!ids.has(String(s.assetId || s.id)))
        throw fail("曲库缺少原谱图片，未保存不完整记录。");
    for (const s of sourceNotation.systems) s.imageUrl = "";
    document.sourceNotation = structuredClone(sourceNotation);
  } else if (assets.length) throw fail("原谱图片缺少定位结构。");
  const date = (v: unknown) =>
    typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : now;
  const revision = previous
    ? previous.revision + 1
    : Number.isInteger(raw.revision) && (raw.revision as number) > 0
      ? (raw.revision as number)
      : 1;
  const history = previous
    ? [...previous.history, recordSnapshot(previous)]
    : [];
  return {
    id: document.id,
    document,
    score: toPracticeScore(document),
    revision,
    createdAt: previous?.createdAt || date(raw.createdAt),
    updatedAt: previous ? now : date(raw.updatedAt),
    sourceNotation,
    assets,
    reviewStatus: raw.reviewStatus || {},
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((w) => typeof w === "string").slice(0, 100)
      : [],
    downloaded: raw.downloaded === true,
    history,
    ...(raw.originalFile !== undefined
      ? { originalFile: originalFileOf(raw.originalFile) }
      : previous?.originalFile
        ? { originalFile: previous.originalFile }
        : {}),
    sourceReference:
      raw.sourceReference ||
      previous?.sourceReference ||
      (sourceNotation
        ? {
            id: document.id,
            durationBeats: document.durationBeats,
            keySignature: document.keySignature,
            timeSignature: document.timeSignature,
            notes: document.notes
              .map((n) => [n.id, n.beat, n.duration, n.midi, n.hand])
              .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
          }
        : undefined),
    ...(raw.publication
      ? { publication: raw.publication }
      : previous?.publication
        ? { publication: previous.publication }
        : {}),
  };
}
export function validateLibraryRecord(input: unknown): LibraryRecord {
  const raw = input as LibraryRecord,
    record = normalizeLibraryRecord(raw);
  if (!Array.isArray(raw.history) || raw.history.length > 10000)
    throw fail("曲库修订历史无效。");
  let last = 0;
  record.history = raw.history.map((h) => {
    if (
      !Number.isInteger(h.revision) ||
      h.revision <= last ||
      h.revision >= record.revision
    )
      throw fail("曲库修订编号不连续或重复。");
    last = h.revision;
    const revision = normalizeLibraryRecord(h);
    if (revision.id !== record.id) throw fail("修订历史属于另一份乐谱。");
    return recordSnapshot(revision);
  });
  validateScoreDocument(record.document);
  return record;
}
export async function contentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function encodeLibraryResources(records: LibraryRecord[]) {
  const validated = records.map(validateLibraryRecord);
  // Large source images/files shared by revisions are stored only once.
  const resources: Record<string, string> = {},
    known = new Map<string, string>();
  async function resource(data: string) {
    if (known.has(data)) return known.get(data)!;
    const key = await contentHash(data);
    known.set(data, key);
    resources[key] = data;
    return key;
  }
  async function pack(
    record: LibraryRecord | Omit<LibraryRecord, "history">,
  ): Promise<Record<string, unknown>> {
    const assets = [];
    for (const a of record.assets) {
      const { data, ...info } = a;
      assets.push({ ...info, resource: await resource(data) });
    }
    const { history, originalFile, ...rest } = record as LibraryRecord;
    const packed: Record<string, unknown> = { ...rest, assets };
    if (originalFile) {
      const { data, ...info } = originalFile;
      packed.originalFile = { ...info, resource: await resource(data) };
    }
    if (history) packed.history = await Promise.all(history.map(pack));
    return packed;
  }
  const packed = await Promise.all(validated.map(pack));
  return { records: packed, resources };
}
export async function createLibraryBackup(records: LibraryRecord[]) {
  const payload = await encodeLibraryResources(records);
  return {
    format: "qinban-library-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    ...payload,
    sha256: await contentHash(payload),
  };
}
export function referencedResources(records: unknown[]): string[] {
  const refs = new Set<string>();
  function visit(record: Record<string, unknown>, depth = 0) {
    if (depth > 1) throw fail("修订历史嵌套无效。");
    for (const a of [
      ...(Array.isArray(record.assets) ? record.assets : []),
      ...(record.originalFile ? [record.originalFile] : []),
    ]) {
      if (a.resource !== undefined) {
        if (
          typeof a.resource !== "string" ||
          !/^[a-f0-9]{64}$/.test(a.resource)
        )
          throw fail("资源引用无效。");
        refs.add(a.resource);
      }
    }
    if (Array.isArray(record.history))
      for (const h of record.history) visit(h, depth + 1);
  }
  for (const r of records) visit(r as Record<string, unknown>);
  return [...refs];
}
export function decodeLibraryResources(
  records: unknown[],
  resources: Record<string, string>,
): LibraryRecord[] {
  function unpack(record: Record<string, unknown>, depth = 0): unknown {
    if (depth > 1) throw fail("修订历史嵌套无效。");
    const assets = record.assets as Array<Record<string, unknown>>;
    if (!Array.isArray(assets)) throw fail("备份缺少图片清单。");
    const data = (entry: Record<string, unknown>) => {
      if (typeof entry.data === "string") return entry.data;
      const ref = entry.resource;
      if (typeof ref !== "string" || typeof resources[ref] !== "string")
        throw fail("备份资源缺失。");
      return resources[ref];
    };
    const original = record.originalFile as Record<string, unknown> | undefined;
    return {
      ...record,
      assets: assets.map((a) => ({ ...a, data: data(a) })),
      ...(original
        ? { originalFile: { ...original, data: data(original) } }
        : {}),
      ...(Array.isArray(record.history)
        ? { history: record.history.map((h) => unpack(h, depth + 1)) }
        : {}),
    };
  }
  return records.map((r) =>
    validateLibraryRecord(unpack(r as Record<string, unknown>)),
  );
}
export function librarySummary(input: unknown) {
  const raw = input as LibraryRecord,
    document = validateScoreDocument(raw.document);
  if (
    raw.id !== document.id ||
    !validLibraryId(raw.id) ||
    !Number.isInteger(raw.revision) ||
    raw.revision < 1
  )
    throw fail("曲库索引无效。");
  return {
    id: raw.id,
    document,
    score: toPracticeScore(document),
    revision: raw.revision,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    downloaded: raw.downloaded,
    publication: raw.publication,
  };
}
export async function readLibraryBackup(
  input: unknown,
): Promise<LibraryRecord[]> {
  const raw = input as Record<string, unknown>;
  if (
    !raw ||
    raw.format !== "qinban-library-backup" ||
    raw.version !== 1 ||
    !Array.isArray(raw.records) ||
    raw.records.length > 10000 ||
    (await contentHash(
      raw.resources
        ? { records: raw.records, resources: raw.resources }
        : raw.records,
    )) !== raw.sha256
  )
    throw fail("曲库备份格式或完整性校验失败。");
  const records = raw.resources
    ? decodeLibraryResources(
        raw.records,
        raw.resources as Record<string, string>,
      )
    : raw.records.map(validateLibraryRecord);
  if (new Set(records.map((r) => r.id)).size !== records.length)
    throw fail("曲库备份包含重复乐谱 ID。");
  return records;
}
