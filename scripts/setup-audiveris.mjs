import { mkdir, writeFile, rename, rm, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

// Optional setup, never run by build or startup. The official bundle includes Java.
const version = "5.11.0";
const root = resolve(fileURLToPath(new URL("..", import.meta.url))),
  tools = join(root, ".local", "tools");
if (process.platform !== "darwin")
  throw new Error(
    "此安装脚本适用于macOS；其他系统请安装官方Audiveris并配置QINBAN_AUDIVERIS_PATH。",
  );
const architecture =
  process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x86_64" : null;
if (!architecture) throw new Error("此CPU架构没有配置官方Audiveris安装包。");
await mkdir(tools, { recursive: true, mode: 0o700 });
const target = join(tools, "Audiveris.app");
if (
  await access(target).then(
    () => true,
    () => false,
  )
) {
  console.log("本项目已安装Audiveris。可通过AI设置中的引擎状态检查。");
  process.exit(0);
}
const response = await fetch(
  `https://api.github.com/repos/Audiveris/audiveris/releases/tags/${version}`,
  {
    headers: { accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(30000),
  },
);
if (!response.ok) throw new Error("无法读取官方Audiveris发布信息。");
const release = await response.json(),
  name = `Audiveris-${version}-macosx-${architecture}.dmg`,
  asset = release.assets.find((item) => item.name === name);
if (
  !asset ||
  !asset.browser_download_url.startsWith(
    `https://github.com/Audiveris/audiveris/releases/download/${version}/`,
  ) ||
  asset.size > 120 * 1024 * 1024
)
  throw new Error("官方安装包元数据不符合预期。");
console.log(
  `正在下载官方Audiveris ${version}，约${Math.ceil(asset.size / 1024 / 1024)}MB…`,
);
const download = await fetch(asset.browser_download_url, {
  signal: AbortSignal.timeout(240000),
});
if (!download.ok) throw new Error("安装包下载失败，请检查网络后重试。");
const bytes = Buffer.from(await download.arrayBuffer()),
  sha256 = createHash("sha256").update(bytes).digest("hex");
if (
  bytes.length !== asset.size ||
  (asset.digest && asset.digest !== `sha256:${sha256}`)
)
  throw new Error("官方安装包大小或校验和不匹配，未安装。");
const image = join(tools, name),
  mount = join(tools, "audiveris-setup-mount"),
  staging = join(tools, "Audiveris.installing.app");
await writeFile(image, bytes, { mode: 0o600 });
await mkdir(mount, { recursive: true });
const run = (command, args, input = "") =>
  new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output = (output + chunk).slice(-100000);
    });
    child.stderr.on("data", (chunk) => {
      output = (output + chunk).slice(-100000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolveRun(output)
        : reject(new Error("安装步骤失败：" + command)),
    );
    child.stdin.end(input);
  });
let mounted = false;
try {
  const notice = await run(
    "/usr/bin/hdiutil",
    ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, image],
    "Y\n",
  );
  mounted = true;
  await writeFile(join(tools, "Audiveris-open-source-notice.txt"), notice, {
    mode: 0o600,
  });
  await run("/usr/bin/ditto", [join(mount, "Audiveris.app"), staging]);
  await rename(staging, target);
  await writeFile(
    join(tools, "audiveris-install.json"),
    JSON.stringify(
      {
        version,
        source: asset.browser_download_url,
        sha256,
        installedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(
    "Audiveris已安装到本项目.local/tools；未修改系统Java或Applications。重新启动琴伴后可使用本机整谱识别。",
  );
} finally {
  if (mounted) await run("/usr/bin/hdiutil", ["detach", mount]);
  await rm(staging, { recursive: true, force: true });
}
