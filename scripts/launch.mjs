import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
// server.mjs is spawned by relative path, so run from the project root.
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.QINBAN_PORT) || 8792,
  url = `http://127.0.0.1:${port}`;
async function status() {
  try {
    const r = await fetch(url + "/api/status", {
      signal: AbortSignal.timeout(1200),
    });
    return r.ok ? await r.json() : {mode:'occupied-unknown'};
  } catch {
    return null;
  }
}
function openBrowser() {
  if (process.platform === "darwin" && process.env.QINBAN_NO_BROWSER !== "1") {
    const p = spawn("open", [url], { stdio: "ignore" });
    p.on("error", () => {});
  }
  console.log(`琴伴练习室：${url}`);
}
const running = await status();
if (running) {
  if (running.mode === 'developer') {
    openBrowser();
    console.log("已打开正在运行的琴伴开发者模式。");
  } else {
    console.error(`${port} 已被另一版本服务占用。请在其启动终端完成当前任务并按 Control+C，再重新启动琴伴开发者模式。`);
    process.exitCode = 1;
  }
} else {
  const server = spawn(process.execPath, ["server.mjs"], { stdio: "inherit" });
  let exited = false;
  server.on("exit", (code) => {
    exited = true;
    process.exitCode = code || 0;
  });
  for (const sig of ["SIGINT", "SIGTERM"])
    process.on(sig, () => server.kill(sig));
  for (let i = 0; i < 60 && !exited; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if ((await status())?.mode === 'developer') {
      openBrowser();
      break;
    }
  }
}
