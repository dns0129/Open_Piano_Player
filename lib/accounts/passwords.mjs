// @ts-check
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { fail } from "./common.mjs";

/** @type {(password: string, salt: Buffer | string, keylen: number, options: import("node:crypto").ScryptOptions) => Promise<Buffer>} */
const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
// Also derive a key for unknown accounts; the response must not disclose registration.
const dummy = `scrypt-v1$${"00".repeat(16)}$${"00".repeat(64)}`;
let active = 0;

export function validatePassword(password) {
  if (
    typeof password !== "string" ||
    [...password].length < 12 ||
    password.length > 128
  )
    throw fail(
      "INVALID_PASSWORD",
      "密码须为 12–128 个字符，可使用空格和中文。",
    );
}
async function key(password, salt) {
  // Bound memory/CPU even when requests target many different email addresses.
  if (active >= 4) throw fail("AUTH_BUSY", "登录请求较多，请稍后重试。", 429);
  active++;
  try {
    return await derive(password, salt, 64, options);
  } finally {
    active--;
  }
}
export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1$${salt}$${(await key(password, salt)).toString("hex")}`;
}
export async function checkPassword(password, encoded) {
  const valid =
    typeof encoded === "string" &&
    /^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded);
  const [, salt, expected] = (valid ? encoded : dummy).split("$");
  const actual = await key(password, salt);
  return timingSafeEqual(actual, Buffer.from(expected, "hex")) && valid;
}
