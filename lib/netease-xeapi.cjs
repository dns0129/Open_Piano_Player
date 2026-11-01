const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_KEY_AGE_MS = 6 * 60 * 60 * 1000;
function validKey(value, deviceId) {
  if (
    !value ||
    value.deviceId !== deviceId ||
    typeof value.sk !== "string" ||
    !value.sk ||
    typeof value.publicKey !== "string" ||
    !["string", "number"].includes(typeof value.version)
  )
    return false;
  try {
    return Buffer.from(value.publicKey, "base64").length === 32;
  } catch {
    return false;
  }
}

// The SDK's song_url_v1 uses xeapi. Its public key is normally prepared by
// generateConfig; our isolated worker must initialize it explicitly.
async function ensureXeapiKey({ runtime, deviceId, getKey, now = Date.now }) {
  const keyPath = path.join(runtime, "xeapi_public_key");
  let cached,
    modified = 0;
  try {
    const [raw, info] = await Promise.all([
      fs.readFile(keyPath, "utf8"),
      fs.stat(keyPath),
    ]);
    cached = JSON.parse(raw);
    modified = info.mtimeMs;
  } catch {
    /* Missing or malformed cache is refreshed from NetEase. */
  }
  const usable = validKey(cached, deviceId);
  if (usable && now() - modified >= 0 && now() - modified < MAX_KEY_AGE_MS)
    return cached;
  const key = await getKey(usable ? cached : {}, deviceId);
  if (!validKey(key, deviceId))
    throw new Error("Invalid NetEase xeapi public key");
  const temporary = `${keyPath}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(key), {
      mode: 0o600,
      flag: "wx",
    });
    await fs.rename(temporary, keyPath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return key;
}
module.exports = { ensureXeapiKey, validKey, MAX_KEY_AGE_MS };
