// Private one-request worker: the upstream dependency writes raw errors to its
// console, so the parent suppresses stdout/stderr and accepts only this IPC reply.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const runtime = require("node:os").tmpdir();
const methods = new Set([
  "sheet_list",
  "sheet_preview",
  "login_qr_key",
  "login_qr_check",
  "login_status",
]);
process.once("message", async ({ method, input }) => {
  try {
    if (!methods.has(method)) throw new Error("unsupported");
    const tokenFile = path.join(runtime, "anonymous_token");
    try {
      fs.writeFileSync(tokenFile, "", { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const deviceFile = path.join(runtime, "device-id");
    try {
      fs.writeFileSync(deviceFile, crypto.randomBytes(16).toString("hex"), {
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    global.deviceId = fs.readFileSync(deviceFile, "utf8");
    const api = require(
      `@neteasecloudmusicapienhanced/api/module/${method}.js`,
    );
    const request = require("@neteasecloudmusicapienhanced/api/util/request.js");
    const result = await api(
      { ...input, timeout: 20000, randomCNIP: false },
      request,
    );
    if (JSON.stringify(result).length > 4 * 1024 * 1024)
      throw new Error("response too large");
    process.send({ ok: true, result }, () => process.exit(0));
  } catch {
    process.send({ ok: false }, () => process.exit(0));
  }
});
