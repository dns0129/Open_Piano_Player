import { execFileSync } from "node:child_process";
import { dirname, join, delimiter } from "node:path";
import { homedir } from "node:os";

export function nodeCompatible(version, minimum = "22.19.0") {
  if (!/^v?\d+\.\d+\.\d+$/.test(version)) return false;
  const a = version.replace(/^v/, "").split(".").map(Number),
    b = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}
export function selectNodeRuntime({
  env = process.env,
  current = process.execPath,
  home = homedir(),
  minimum = "22.19.0",
  probe = (file) =>
    execFileSync(file, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim(),
} = {}) {
  const candidates = env.QINBAN_NODE
    ? [env.QINBAN_NODE]
    : [
        current,
        ...(env.PATH || "")
          .split(delimiter)
          .filter(Boolean)
          .map((p) => join(p, "node")),
        join(
          home,
          ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node",
        ),
        "/opt/homebrew/opt/node@24/bin/node",
        "/opt/homebrew/opt/node@22/bin/node",
      ];
  for (const file of new Set(candidates)) {
    try {
      const version = probe(file);
      if (nodeCompatible(version, minimum))
        return { node: file, version, bin: dirname(file) };
    } catch {
      /* Unavailable installations are not modified. */
    }
  }
  throw Object.assign(
    new Error(
      `未找到 Node.js >=${minimum}；请安装 .nvmrc 指定版本，或用 QINBAN_NODE 指定可用的 Node。`,
    ),
    { code: "NODE_RUNTIME_UNAVAILABLE" },
  );
}
