// This launcher itself works on old Node; it never changes the global runtime.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { selectNodeRuntime } from "../lib/node-runtime.mjs";
const root = fileURLToPath(new URL("..", import.meta.url)),
  pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
try {
  const [script, ...args] = process.argv.slice(2);
  if (!Object.hasOwn(pkg.scripts, script))
    throw Error(
      "用法：node scripts/with-node.mjs <npm 脚本> [参数]，例如 check、build 或 launch。",
    );
  const runtime = selectNodeRuntime({
    minimum: pkg.engines.node.replace(/^>=\s*/, ""),
  });
  console.log(`使用 Node ${runtime.version}：${runtime.node}`);
  const child = spawn(
    "npm",
    ["run", script, ...(args.length ? ["--", ...args] : [])],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: runtime.bin + delimiter + (process.env.PATH || ""),
      },
    },
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => child.kill(signal));
  child.once("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
