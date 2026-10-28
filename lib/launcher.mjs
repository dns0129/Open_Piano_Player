import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, open, realpath, access } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, join, dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const execute = promisify(execFile);

function portNumber(value, fallback) {
  const port = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw Error("琴伴端口必须为 1–65535 的整数。");
  }
  return port;
}

export function launcherVersions(env = process.env) {
  const versions = {
    local: {
      label: "本地完整版",
      port: portNumber(env.QINBAN_PORT, 8792),
      script: "server.mjs",
      args: [],
    },
    commercial: {
      label: "商业账号版",
      port: portNumber(env.QINBAN_ACCOUNT_PORT, 8793),
      script: "scripts/accounts.mjs",
      args: ["start"],
    },
  };
  if (versions.local.port === versions.commercial.port) {
    throw Error("本地版和商业账号版需要使用不同端口。");
  }
  return versions;
}

// lsof escapes Chinese paths under the C locale; force UTF-8 before comparing cwd.
export async function listenerProcesses(port) {
  const env = { ...process.env, LC_ALL: "en_US.UTF-8" };
  let stdout;
  try {
    ({ stdout } = await execute(
      "/usr/sbin/lsof",
      ["-nP", `-tiTCP:${port}`, "-sTCP:LISTEN"],
      { env },
    ));
  } catch (error) {
    if (error.code === 1 && !error.stdout && !error.stderr) return [];
    throw Error(`无法核对 ${port} 端口的所属进程：${error.message}`);
  }
  const result = [];
  for (const pid of new Set(stdout.trim().split(/\s+/).map(Number))) {
    if (!Number.isSafeInteger(pid) || pid <= 0)
      throw Error("端口进程信息无效。");
    // A disappearing process is harmless; an unreadable cwd must never count as ours.
    const info = await execute(
      "/usr/sbin/lsof",
      ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
      { env },
    ).catch(() => null);
    const cwd = info?.stdout
      .split("\n")
      .find((line) => line.startsWith("n"))
      ?.slice(1);
    result.push({
      pid,
      cwd: cwd ? await realpath(cwd).catch(() => null) : null,
    });
  }
  return result;
}

export function createLauncher({
  root,
  env = process.env,
  inspect = listenerProcesses,
  signal = (pid, name) => process.kill(pid, name),
  write = console.log,
  startTimeout = 120000,
  stopTimeout = 15000,
} = {}) {
  const directory = resolve(root);
  const versions = launcherVersions(env);
  const environment = {
    ...env,
    PATH: dirname(process.execPath) + ":" + (env.PATH || ""),
  };
  const logDirectory = join(directory, ".local/launcher");
  function version(id) {
    if (!Object.hasOwn(versions, id))
      throw Error("请选择 local 或 commercial 版本。");
    return versions[id];
  }
  async function ownedProcesses(v) {
    const processes = await inspect(v.port);
    const canonicalRoot = await realpath(directory);
    if (processes.some((p) => p.cwd !== canonicalRoot)) {
      throw Error(
        `${v.port} 端口由其他目录的程序占用或无法核对归属，未启动或关闭该程序。`,
      );
    }
    return processes;
  }
  async function healthy(id) {
    const v = version(id);
    const path = id === "local" ? "/api/status" : "/api/v1/product";
    try {
      const response = await fetch(`http://127.0.0.1:${v.port}${path}`, {
        signal: AbortSignal.timeout(1500),
      });
      if (!response.ok) return false;
      const data = await response.json();
      return id === "local"
        ? data.mode === "developer" && data.features?.includes("recognition")
        : data.product === "qinban-commercial";
    } catch {
      return false;
    }
  }
  function run(command, args, runEnv = environment) {
    return new Promise((done, reject) => {
      const child = spawn(command, args, {
        cwd: directory,
        env: runEnv,
        stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", (code, sig) =>
        code === 0
          ? done()
          : reject(Error(`准备失败（${sig || code}），请检查上方输出后重试。`)),
      );
    });
  }
  async function prepare(id) {
    const require = createRequire(join(directory, "package.json"));
    const dependencies =
      id === "local"
        ? ["vite", "@spotify/basic-pitch", "@tensorflow/tfjs-backend-wasm"]
        : ["vite", "@electric-sql/pglite", "sharp", "nodemailer"];
    try {
      for (const dependency of dependencies) require.resolve(dependency);
    } catch {
      write("正在安装或补齐琴伴依赖…");
      const locked = await access(join(directory, "package-lock.json")).then(
        () => true,
        () => false,
      );
      await run("npm", [
        locked ? "ci" : "install",
        "--ignore-scripts",
        "--registry=https://registry.npmjs.org",
        "--cache=.local/npm-cache",
      ]);
    }
    // Build flags must not leak from a previous hosted/static shell environment.
    const buildEnv = {
      ...environment,
      VITE_HOSTED_SITE: id === "commercial" ? "1" : "0",
      VITE_STATIC_SITE: "0",
    };
    write(`正在准备${version(id).label}…`);
    await run(process.execPath, ["scripts/prepare-assets.mjs"], buildEnv);
    await run(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "build",
        "--outDir",
        id === "commercial" ? "dist-hosted" : "dist",
      ],
      buildEnv,
    );
  }
  function show(id, reused) {
    const v = version(id),
      url = `http://127.0.0.1:${v.port}/`;
    write(`${reused ? "已打开正在运行的" : "已开启"}${v.label}：${url}`);
    if (process.platform === "darwin" && env.QINBAN_NO_BROWSER !== "1") {
      const browser = spawn("open", [url], { stdio: "ignore" });
      browser.once("error", () => write(`请在浏览器打开 ${url}`));
      browser.unref();
    }
    return { id, url, reused };
  }
  async function start(id) {
    const v = version(id);
    if ((await ownedProcesses(v)).length) {
      if (await healthy(id)) return show(id, true);
      throw Error(
        `${v.port} 已有服务，但版本或状态不符；请先关闭该服务再启动。`,
      );
    }
    await prepare(id);
    // Another launcher may have started the service while we were building.
    if ((await ownedProcesses(v)).length) {
      if (await healthy(id)) return show(id, true);
      throw Error(`${v.port} 已被占用，请稍后重试。`);
    }
    await mkdir(logDirectory, { recursive: true, mode: 0o700 });
    const logPath = join(logDirectory, `${id}.log`);
    const log = await open(logPath, "a", 0o600);
    let child;
    let exited = false;
    try {
      child = spawn(process.execPath, [v.script, ...v.args], {
        cwd: directory,
        env: environment,
        detached: true,
        stdio: ["ignore", log.fd, log.fd],
      });
      child.once("exit", () => {
        exited = true;
      });
      await new Promise((done, reject) => {
        child.once("spawn", done);
        child.once("error", reject);
      });
    } finally {
      await log.close();
    }
    child.unref();
    let ready = false;
    try {
      const deadline = Date.now() + startTimeout;
      while (!exited && Date.now() < deadline) {
        if (await healthy(id)) {
          const listeners = await ownedProcesses(v);
          if (listeners.some((p) => p.pid === child.pid)) {
            ready = true;
            return show(id, false);
          }
          break;
        }
        await delay(250);
      }
      throw Error(`${v.label}未能启动，请查看日志：${logPath}`);
    } finally {
      if (!ready && !exited) child.kill("SIGTERM");
    }
  }
  async function stop(id) {
    const v = version(id);
    const processes = await ownedProcesses(v);
    if (!processes.length) {
      write(`${v.label}未在运行。`);
      return;
    }
    for (const { pid } of processes) {
      try {
        signal(pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    const deadline = Date.now() + stopTimeout;
    while (Date.now() < deadline) {
      if (
        !(await inspect(v.port)).some((p) =>
          processes.some((old) => old.pid === p.pid),
        )
      ) {
        write(`${v.label}已关闭。`);
        return;
      }
      await delay(250);
    }
    throw Error(`${v.label}仍在处理任务，请稍后再试；未强制结束进程。`);
  }
  async function stopAll() {
    const errors = [];
    for (const id of Object.keys(versions)) {
      try {
        await stop(id);
      } catch (error) {
        errors.push(error.message);
      }
    }
    if (errors.length) throw Error(errors.join("\n"));
  }
  return { start, stop, stopAll };
}
