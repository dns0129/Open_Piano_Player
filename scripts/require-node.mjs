// Runs before npm scripts that load lib/*.ts; older Node fails later with a confusing ERR_UNKNOWN_FILE_EXTENSION.
import { readFileSync } from "node:fs";

const range = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).engines.node;
const [major, minor] = range
  .replace(/^>=\s*/, "")
  .split(".")
  .map(Number);
const [currentMajor, currentMinor] = process.versions.node
  .split(".")
  .map(Number);
if (currentMajor < major || (currentMajor === major && currentMinor < minor)) {
  console.error(
    `琴伴需要 Node.js ${range}，当前为 ${process.version}（${process.execPath}）。`,
  );
  console.error(
    "请切换到 .nvmrc 指定的版本（如 nvm use），或升级 Homebrew 的 node 后重试。",
  );
  console.error(
    "已有兼容 Node 时，可用 node scripts/with-node.mjs check（或 build / launch），无需修改全局 Node。",
  );
  process.exit(1);
}
