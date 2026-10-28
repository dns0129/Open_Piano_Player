import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLauncher,
  launcherVersions,
  listenerProcesses,
} from "../lib/launcher.mjs";

async function workspace(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "琴伴-launcher-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("launcher groups the account/commercial alias and validates separate ports", () => {
  assert.deepEqual(Object.keys(launcherVersions({})), ["local", "commercial"]);
  assert.equal(launcherVersions({}).local.port, 8792);
  assert.equal(
    launcherVersions({ QINBAN_ACCOUNT_PORT: "8893" }).commercial.port,
    8893,
  );
  for (const value of ["0", "65536", "abc", "8792.5"]) {
    assert.throws(() => launcherVersions({ QINBAN_PORT: value }), /端口/);
  }
  assert.throws(
    () => launcherVersions({ QINBAN_ACCOUNT_PORT: "8792" }),
    /不同端口/,
  );
});

test("launcher refuses unknown versions and never signals foreign or unverified processes", async (t) => {
  const root = await workspace(t),
    signals = [];
  for (const cwd of ["/another/project", null]) {
    const launcher = createLauncher({
      root,
      env: {},
      inspect: async () => [{ pid: 123, cwd }],
      signal: (...args) => signals.push(args),
    });
    await assert.rejects(launcher.start("local"), /其他目录/);
    await assert.rejects(launcher.stop("commercial"), /其他目录/);
    await assert.rejects(launcher.start("__proto__"), /请选择/);
  }
  assert.deepEqual(signals, []);
});

test("launcher stops only verified processes and continues closing the other version after a conflict", async (t) => {
  const root = await workspace(t),
    signals = [],
    messages = [];
  let running = true;
  const launcher = createLauncher({
    root,
    env: {},
    write: (text) => messages.push(text),
    inspect: async (port) =>
      port === 8792
        ? [{ pid: 111, cwd: "/other" }]
        : running
          ? [{ pid: 222, cwd: root }]
          : [],
    signal: (pid, name) => {
      signals.push([pid, name]);
      running = false;
    },
  });
  await assert.rejects(launcher.stopAll(), /8792/);
  assert.deepEqual(signals, [[222, "SIGTERM"]]);
  assert.ok(messages.includes("商业账号版已关闭。"));
});

test("busy shutdown reports the unfinished task without force-killing", async (t) => {
  const root = await workspace(t),
    signals = [];
  const launcher = createLauncher({
    root,
    env: {},
    stopTimeout: 1,
    inspect: async () => [{ pid: 123, cwd: root }],
    signal: (...args) => signals.push(args),
  });
  await assert.rejects(launcher.stop("local"), /仍在处理任务/);
  assert.deepEqual(signals, [[123, "SIGTERM"]]);
});

async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "琴伴-launcher-")));
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, ".local/accounts-v1"), { recursive: true });
  await mkdir(join(root, ".local/full-score-jobs"), { recursive: true });
  await writeFile(
    join(root, ".local/accounts-v1/preserve.txt"),
    "existing account",
  );
  await writeFile(
    join(root, ".local/full-score-jobs/preserve.txt"),
    "existing score",
  );
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  for (const name of [
    "vite",
    "@spotify/basic-pitch",
    "@tensorflow/tfjs-backend-wasm",
    "@electric-sql/pglite",
    "sharp",
    "nodemailer",
  ]) {
    const path = join(root, "node_modules", name);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "package.json"), '{"main":"index.js"}');
    await writeFile(join(path, "index.js"), "");
  }
  await mkdir(join(root, "node_modules/vite/bin"));
  await writeFile(join(root, "scripts/prepare-assets.mjs"), "");
  await writeFile(
    join(root, "node_modules/vite/bin/vite.js"),
    `
    const {appendFileSync} = require('node:fs');
    if(process.env.QINBAN_FIXTURE_BUILD_FAIL === '1') process.exit(2);
    appendFileSync('builds.jsonl', JSON.stringify({args:process.argv.slice(2),hosted:process.env.VITE_HOSTED_SITE,static:process.env.VITE_STATIC_SITE})+'\\n');
  `,
  );
  const service = `
    import http from 'node:http';
    if(process.env.QINBAN_FIXTURE_START_FAIL === '1') process.exit(2);
    const commercial = process.argv[2] === 'start';
    const server = http.createServer((req,res)=>{
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify(commercial ? {product:'qinban-commercial'} : {mode:'developer',features:['recognition']}));
    });
    server.listen(Number(commercial ? process.env.QINBAN_ACCOUNT_PORT : process.env.QINBAN_PORT),'127.0.0.1');
    process.on('SIGTERM',()=>{server.close();server.closeIdleConnections();});
  `;
  await writeFile(join(root, "server.mjs"), service);
  await writeFile(join(root, "scripts/accounts.mjs"), service);
  const localPort = await freePort();
  let commercialPort = await freePort();
  while (commercialPort === localPort) commercialPort = await freePort();
  const result = {
    root,
    env: {
      ...process.env,
      QINBAN_PORT: String(localPort),
      QINBAN_ACCOUNT_PORT: String(commercialPort),
      QINBAN_NO_BROWSER: "1",
      VITE_HOSTED_SITE: "1",
      VITE_STATIC_SITE: "1",
    },
  };
  t.after(async () => {
    await createLauncher({ root, env: result.env, write() {} }).stopAll();
    await rm(root, { recursive: true, force: true });
  });
  return result;
}

test(
  "Mac launcher starts both versions, reuses listeners, stops both, and preserves existing data",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const { root, env } = await fixture(t),
      launcher = createLauncher({ root, env, write() {}, startTimeout: 5000 });
    const local = await launcher.start("local"),
      commercial = await launcher.start("commercial");
    assert.equal(local.reused, false);
    assert.equal(commercial.reused, false);
    assert.equal((await launcher.start("local")).reused, true);
    assert.equal((await launcher.start("commercial")).reused, true);
    const builds = (await readFile(join(root, "builds.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.deepEqual(
      builds.map((b) => [b.hosted, b.static, b.args.at(-1)]),
      [
        ["0", "0", "dist"],
        ["1", "0", "dist-hosted"],
      ],
    );
    assert.equal(
      (await listenerProcesses(Number(env.QINBAN_PORT)))[0].cwd,
      root,
    );
    await launcher.stopAll();
    assert.deepEqual(await listenerProcesses(Number(env.QINBAN_PORT)), []);
    assert.deepEqual(
      await listenerProcesses(Number(env.QINBAN_ACCOUNT_PORT)),
      [],
    );
    assert.equal(
      await readFile(join(root, ".local/accounts-v1/preserve.txt"), "utf8"),
      "existing account",
    );
    assert.equal(
      await readFile(join(root, ".local/full-score-jobs/preserve.txt"), "utf8"),
      "existing score",
    );
  },
);

test(
  "Mac launcher reports failed builds and exited services without opening a browser or leaving a listener",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const { root, env } = await fixture(t),
      messages = [];
    const buildFailure = createLauncher({
      root,
      env: { ...env, QINBAN_FIXTURE_BUILD_FAIL: "1" },
      write: (text) => messages.push(text),
    });
    await assert.rejects(buildFailure.start("local"), /准备失败/);
    const startFailure = createLauncher({
      root,
      env: { ...env, QINBAN_FIXTURE_START_FAIL: "1" },
      write: (text) => messages.push(text),
      startTimeout: 2000,
    });
    await assert.rejects(
      startFailure.start("commercial"),
      /未能启动.*commercial.log/,
    );
    assert.ok(!messages.some((text) => text.startsWith("已开启")));
    assert.deepEqual(await listenerProcesses(Number(env.QINBAN_PORT)), []);
    assert.deepEqual(
      await listenerProcesses(Number(env.QINBAN_ACCOUNT_PORT)),
      [],
    );
  },
);
