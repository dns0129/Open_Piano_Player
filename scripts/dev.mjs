import { spawn } from "node:child_process";
import "./prepare-assets.mjs";
const watch = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build", "--watch"],
  { stdio: "inherit" },
);
const server = spawn(process.execPath, ["server.mjs"], { stdio: "inherit" });
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  watch.kill("SIGTERM");
  server.kill("SIGTERM");
}
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, stop);
for (const p of [watch, server])
  p.on("exit", (code) => {
    stop();
    process.exitCode = code || 0;
  });
