import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { generateKeyPairSync } from "node:crypto";
import { fork } from "node:child_process";
import { once } from "node:events";

const require = createRequire(import.meta.url);
const { ensureXeapiKey, MAX_KEY_AGE_MS } = require("../lib/netease-xeapi.cjs");
const { xeapi } = require("@neteasecloudmusicapienhanced/api/util/crypto.js");
function fixtureKey(deviceId = "test-device") {
  const { publicKey } = generateKeyPairSync("x25519");
  return {
    deviceId,
    version: "1",
    sk: "test-only",
    publicKey: publicKey
      .export({ format: "der", type: "spki" })
      .subarray(-32)
      .toString("base64"),
  };
}
async function directory(t) {
  const dir = await mkdtemp(join(tmpdir(), "qinban-xeapi-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("initializes the missing xeapi key before the real SDK encrypts a request", async (t) => {
  const runtime = await directory(t),
    key = fixtureKey();
  let calls = 0;
  const getKey = async (previous, device) => {
    calls++;
    assert.deepEqual(previous, {});
    assert.equal(device, "test-device");
    return key;
  };
  const result = await ensureXeapiKey({
    runtime,
    deviceId: "test-device",
    getKey,
  });
  assert.deepEqual(result, key);
  assert.equal(
    (await stat(join(runtime, "xeapi_public_key"))).mode & 0o777,
    0o600,
  );
  const encrypted = xeapi(
    "/api/song/enhance/player/url/v1",
    { ids: "[1857099391]", level: "standard" },
    { publicKeyState: result, deviceId: "test-device", os: "android" },
  );
  assert.ok(encrypted.C && encrypted.S && encrypted.R);
  assert.deepEqual(
    await ensureXeapiKey({ runtime, deviceId: "test-device", getKey }),
    key,
  );
  assert.equal(calls, 1);
});

test("stale or wrong-device keys refresh; failures never replace the stored key", async (t) => {
  const runtime = await directory(t),
    original = fixtureKey();
  await ensureXeapiKey({
    runtime,
    deviceId: "test-device",
    getKey: async () => original,
  });
  const keyPath = join(runtime, "xeapi_public_key");
  const modified = (await stat(keyPath)).mtimeMs;
  await assert.rejects(
    ensureXeapiKey({
      runtime,
      deviceId: "test-device",
      now: () => modified + MAX_KEY_AGE_MS + 1,
      getKey: async () => {
        throw new Error("offline");
      },
    }),
    /offline/,
  );
  assert.deepEqual(JSON.parse(await readFile(keyPath, "utf8")), original);
  const replacement = fixtureKey("other-device");
  await ensureXeapiKey({
    runtime,
    deviceId: "other-device",
    getKey: async (previous) => {
      assert.deepEqual(previous, {});
      return replacement;
    },
  });
  assert.deepEqual(JSON.parse(await readFile(keyPath, "utf8")), replacement);
});

test("the isolated worker initializes a key before invoking the real song_url_v1 module", async (t) => {
  const runtime = await directory(t);
  const preload = join(runtime, "preload.cjs");
  await writeFile(
    preload,
    `
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const load = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === '@neteasecloudmusicapienhanced/api/util/xeapiKey.js') return { getXeapiPublicKey: async (_old, deviceId) => ({ deviceId, version: '1', sk: 'test-only', publicKey: crypto.generateKeyPairSync('x25519').publicKey.export({ format:'der', type:'spki' }).subarray(-32).toString('base64') }) };
  if (name === '@neteasecloudmusicapienhanced/api/util/request.js') return async (uri, data, options) => {
    const key = JSON.parse(fs.readFileSync(path.join(require('node:os').tmpdir(), 'xeapi_public_key'), 'utf8'));
    const { xeapi } = load('@neteasecloudmusicapienhanced/api/util/crypto.js', parent, false);
    const encrypted = xeapi(uri, data, { publicKeyState: key, deviceId: global.deviceId, os: 'android' });
    if (options.crypto !== 'xeapi' || !encrypted.C || !encrypted.S || !encrypted.R) throw Error('no xeapi key');
    return { status:200, body:{ code:200, data:[{ id:1857099391, url:'https://audio.example.com/test.mp3' }] } };
  };
  return load.apply(this, arguments);
};
`,
  );
  const child = fork(
    new URL("../lib/netease-sdk-worker.cjs", import.meta.url),
    [],
    {
      cwd: runtime,
      env: {
        ...process.env,
        TMPDIR: runtime,
        NODE_OPTIONS: `--require=${preload}`,
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  t.after(() => child.kill());
  const reply = once(child, "message");
  child.send({
    method: "song_url_v1",
    input: { id: "1857099391", level: "standard", randomCNIP: false },
  });
  const [message] = await reply;
  assert.equal(message.ok, true);
  assert.equal(message.result.body.data[0].id, 1857099391);
});

test("key registration failure returns a safe diagnostic without leaking upstream errors", async (t) => {
  const runtime = await directory(t);
  const preload = join(runtime, "failing-preload.cjs");
  await writeFile(
    preload,
    `
const Module = require('node:module');
const load = Module._load;
Module._load = function(name) {
  if (name === '@neteasecloudmusicapienhanced/api/util/xeapiKey.js') return { getXeapiPublicKey: async () => { throw new Error('upstream private response'); } };
  return load.apply(this, arguments);
};
`,
  );
  const child = fork(
    new URL("../lib/netease-sdk-worker.cjs", import.meta.url),
    [],
    {
      cwd: runtime,
      env: {
        ...process.env,
        TMPDIR: runtime,
        NODE_OPTIONS: `--require=${preload}`,
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  t.after(() => child.kill());
  const reply = once(child, "message");
  child.send({
    method: "song_url_v1",
    input: { id: "1857099391", level: "standard", randomCNIP: false },
  });
  const [message] = await reply;
  assert.deepEqual(message, { ok: false, code: "XEAPI_KEY_INIT" });
});
