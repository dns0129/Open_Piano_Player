import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  readFile,
  mkdir,
  writeFile,
  copyFile,
  readdir,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MODEL_SHA256, BASIC_PITCH_VERSION } from "../lib/transcription.mjs";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Copy npm-shipped, checksum-pinned model assets. No network is used here. */
export async function prepareAudioModel({
  destination = join(root, "public/models/basic-pitch"),
} = {}) {
  const packageDirectory = dirname(
    require.resolve("@spotify/basic-pitch/package.json"),
  );
  const pkg = JSON.parse(
    await readFile(join(packageDirectory, "package.json"), "utf8"),
  );
  if (pkg.version !== BASIC_PITCH_VERSION)
    throw new Error(
      `Basic Pitch 版本须为 ${BASIC_PITCH_VERSION}，请同步固定模型校验值后再升级。`,
    );
  await mkdir(destination, { recursive: true });
  const files = {};
  for (const [name, expected] of Object.entries(MODEL_SHA256)) {
    const source = join(packageDirectory, "model", name);
    const bytes = await readFile(source);
    if (digest(bytes) !== expected)
      throw new Error(`Basic Pitch 模型源文件校验失败：${name}`);
    let matches = false;
    try {
      matches = digest(await readFile(join(destination, name))) === expected;
    } catch {
      /* first run */
    }
    if (!matches) await copyFile(source, join(destination, name));
    if (digest(await readFile(join(destination, name))) !== expected)
      throw new Error(`Basic Pitch 模型复制校验失败：${name}`);
    files[name] = { sha256: expected, bytes: bytes.byteLength };
  }
  const wasmDirectory = join(
    dirname(require.resolve("@tensorflow/tfjs-backend-wasm/package.json")),
    "dist",
  );
  for (const name of (await readdir(wasmDirectory)).filter((name) =>
    name.endsWith(".wasm"),
  )) {
    const bytes = await readFile(join(wasmDirectory, name));
    await copyFile(join(wasmDirectory, name), join(destination, name));
    files[name] = { sha256: digest(bytes), bytes: bytes.byteLength };
  }
  await copyFile(
    join(packageDirectory, "LICENSE"),
    join(destination, "LICENSE.basic-pitch.txt"),
  );
  await writeFile(
    join(destination, "manifest.json"),
    `${JSON.stringify(
      {
        engine: "Spotify Basic Pitch",
        version: pkg.version,
        license: "Apache-2.0",
        source: "https://github.com/spotify/basic-pitch-ts",
        files,
      },
      null,
      2,
    )}\n`,
  );
  return { destination, files };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = await prepareAudioModel();
  console.log(`本地音频转谱模型已准备并校验：${result.destination}`);
}
