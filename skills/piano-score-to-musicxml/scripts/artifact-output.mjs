import * as fs from "node:fs/promises";
import { resolve, dirname, basename, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const error = (code, message) => Object.assign(new Error(message), { code });
const exists = async (file) =>
  fs.lstat(file).then(
    () => true,
    (e) => {
      if (e.code === "ENOENT") return false;
      throw e;
    },
  );
const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
async function atomicFile(file, bytes) {
  const temporary = file + "." + randomUUID() + ".tmp",
    handle = await fs.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    await fs.rename(temporary, file);
  } catch (e) {
    await handle.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
    throw e;
  }
}
async function checkedFile(folder, name, expected) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(name))
    throw error("ARTIFACT_PATH", "产物文件名无效");
  const p = join(folder, name),
    stat = await fs.lstat(p);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw error("ARTIFACT_TAMPERED", "产物不是普通文件：" + name);
  const bytes = await fs.readFile(p);
  if (hash(bytes) !== expected.sha256 || bytes.length !== expected.bytes)
    throw error("ARTIFACT_TAMPERED", "产物内容或大小已变化：" + name);
  return bytes;
}
export async function verifyArtifactOutput(folder, { fingerprint } = {}) {
  const receipt = await json(join(folder, "artifact-manifest.json"));
  if (
    receipt.schema !== "piano-score-artifacts/v1" ||
    receipt.artifactSetComplete !== true ||
    (fingerprint && receipt.fingerprint !== fingerprint)
  )
    throw error("ARTIFACT_FINGERPRINT", "交付清单或输入指纹不一致");
  if (
    !["draft", "checked"].includes(receipt.transcriptionStatus) ||
    !receipt.files ||
    [
      "score.musicxml",
      "score.mid",
      "score.qinban.json",
      "transcription.json",
      "source-manifest.json",
      "report.json",
    ].some((n) => !receipt.files[n])
  )
    throw error("ARTIFACT_INCOMPLETE", "交付缺少必需产物");
  for (const [name, entry] of Object.entries(receipt.files))
    await checkedFile(folder, name, entry);
  const expected = new Set([
    ...Object.keys(receipt.files),
    "artifact-manifest.json",
    ".build-state.json",
  ]);
  for (const name of await fs.readdir(folder))
    if (!expected.has(name))
      throw error("ARTIFACT_UNEXPECTED", "产物目录有未登记文件：" + name);
  return receipt;
}

// One output location, one exclusive builder. No prior completed output is
// removed. A failed stage remains inspectable and requires explicit --resume.
export async function artifactOutput(
  output,
  { fingerprint, version, resume = false, onArtifact = async () => {} },
) {
  output = resolve(output);
  const parent = dirname(output),
    stage = join(parent, "." + basename(output) + ".partial"),
    lock = join(parent, "." + basename(output) + ".build.lock"),
    token = randomUUID();
  await fs.mkdir(parent, { recursive: true });
  if (await exists(output)) {
    if (!resume)
      throw error(
        "ARTIFACT_EXISTS",
        "输出目录已存在；选择新目录以保留上次结果",
      );
    await verifyArtifactOutput(output, { fingerprint });
    return { completed: true, folder: output };
  }
  let handle;
  try {
    handle = await fs.open(lock, "wx", 0o600);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const prior = await json(lock);
    let alive = true;
    try {
      process.kill(prior.pid, 0);
    } catch (cause) {
      if (cause.code === "ESRCH") alive = false;
    }
    if (!resume || alive)
      throw error(
        "ARTIFACT_BUILD_BUSY",
        "该输出正在构建或有未核实锁；保留暂存目录，确认旧进程结束后用 --resume 继续",
      );
    if (prior.output !== output || prior.fingerprint !== fingerprint)
      throw error("ARTIFACT_FINGERPRINT", "旧构建锁与本次输入不一致");
    // Serialize explicit stale-lock recovery as well as ordinary writers.
    // An interrupted recovery is left for inspection rather than stolen again.
    const reclaim = lock + ".reclaim";
    let guard;
    try {
      guard = await fs.open(reclaim, "wx", 0o600);
    } catch (cause) {
      if (cause.code === "EEXIST")
        throw error(
          "ARTIFACT_BUILD_BUSY",
          "构建恢复锁尚未核实；保留目录并确认恢复操作已结束",
        );
      throw cause;
    }
    try {
      await guard.writeFile(JSON.stringify({ token, pid: process.pid }));
      await guard.sync();
      if ((await json(lock)).token !== prior.token)
        throw error("ARTIFACT_BUILD_BUSY", "构建锁已被其他进程更新");
      await fs.unlink(lock);
      handle = await fs.open(lock, "wx", 0o600);
    } finally {
      await guard.close();
      await fs.unlink(reclaim);
    }
  }
  await handle.writeFile(
    JSON.stringify({ output, fingerprint, pid: process.pid, token }),
  );
  await handle.sync();
  await handle.close();
  const release = async () => {
    if ((await exists(lock)) && (await json(lock)).token === token)
      await fs.unlink(lock);
  };
  let state;
  try {
    if (await exists(stage)) {
      if (!resume)
        throw error(
          "ARTIFACT_RESUME_REQUIRED",
          "存在未完成暂存目录；使用 --resume 继续，或选择新输出目录",
        );
      if (
        !(await fs.lstat(stage)).isDirectory() ||
        (await fs.lstat(stage)).isSymbolicLink()
      )
        throw error("ARTIFACT_TAMPERED", "暂存路径不是普通目录");
      state = await json(join(stage, ".build-state.json"));
      if (state.fingerprint !== fingerprint || state.version !== version)
        throw error(
          "ARTIFACT_FINGERPRINT",
          "输入、构建选项或工具版本已变化，不能继续旧构建",
        );
      for (const [name, entry] of Object.entries(state.files))
        await checkedFile(stage, name, entry);
      const canonical =
        /^(?:score\.(?:musicxml|mid|qinban\.json)|transcription\.json|source-manifest\.json|report\.json|index\.html|engraved-\d{3}\.svg)$/;
      const allowed = new Set([
        ...Object.keys(state.files),
        ".build-state.json",
        "artifact-manifest.json",
      ]);
      for (const name of await fs.readdir(stage))
        if (!allowed.has(name) && !canonical.test(name)) {
          if (/\.[a-f0-9-]{36}\.tmp$/.test(name)) {
            const quarantine = stage + ".interrupted";
            await fs.mkdir(quarantine, { recursive: true, mode: 0o700 });
            const dest = join(quarantine, name + "-" + token);
            await fs.rename(join(stage, name), dest);
            state.interruptedFiles = [...(state.interruptedFiles || []), dest];
          } else
            throw error("ARTIFACT_UNEXPECTED", "暂存目录有未登记文件：" + name);
        }
    } else {
      await fs.mkdir(stage, { mode: 0o700 });
      state = {
        schema: "piano-score-build/v1",
        fingerprint,
        version,
        phase: "building",
        files: {},
      };
    }
    const save = () =>
      atomicFile(
        join(stage, ".build-state.json"),
        JSON.stringify(state, null, 2) + "\n",
      );
    await save();
    return {
      folder: stage,
      completed: false,
      async has(name) {
        if (!state.files[name]) return false;
        await checkedFile(stage, name, state.files[name]);
        return true;
      },
      async put(name, value) {
        const bytes =
            typeof value === "string" ? Buffer.from(value) : Buffer.from(value),
          entry = { sha256: hash(bytes), bytes: bytes.length };
        if (state.files[name]) {
          await checkedFile(stage, name, state.files[name]);
          if (entry.sha256 === state.files[name].sha256) return;
        }
        if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(name))
          throw error("ARTIFACT_PATH", "产物文件名无效");
        if (!state.files[name] && (await exists(join(stage, name)))) {
          await checkedFile(stage, name, entry);
          state.files[name] = entry;
          await save();
          return;
        }
        await atomicFile(join(stage, name), bytes);
        state.files[name] = entry;
        await save();
        await onArtifact(name);
      },
      async commit({ transcriptionStatus }) {
        const receipt = {
          schema: "piano-score-artifacts/v1",
          artifactSetComplete: true,
          transcriptionStatus,
          fingerprint,
          version,
          files: state.files,
        };
        state.phase = "prepared";
        await save();
        await atomicFile(
          join(stage, "artifact-manifest.json"),
          JSON.stringify(receipt, null, 2) + "\n",
        );
        await verifyArtifactOutput(stage, { fingerprint });
        if (await exists(output))
          throw error(
            "ARTIFACT_EXISTS",
            "输出目录已由其他操作创建；未覆盖，暂存结果保留",
          );
        await fs.rename(stage, output);
        await release();
        return receipt;
      },
      async close(cause) {
        try {
          if (cause && (await exists(stage))) {
            state.phase = "failed";
            state.error = {
              code: cause.code || "BUILD_FAILED",
              message: String(cause.message).slice(0, 1000),
            };
            await save();
          }
        } finally {
          await release();
        }
      },
    };
  } catch (e) {
    await release();
    throw e;
  }
}
