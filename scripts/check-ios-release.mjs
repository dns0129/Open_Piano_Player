// Read-only preflight. Never prints credentials or makes purchases.
import { loadAppleBillingConfiguration } from "../lib/accounts/apple-config.mjs";
import { publicLegalInformation } from "../lib/accounts/legal.mjs";

const env = process.env;
const problems = [];
const profile = env.QINBAN_ACCOUNT_PROFILE;
if (!["staging", "production"].includes(profile))
  problems.push("设置 QINBAN_ACCOUNT_PROFILE=staging 或 production。");
for (const name of [
  "QINBAN_AUTH_DATABASE_URL",
  "QINBAN_LIBRARY_DATABASE_URL",
  "QINBAN_SMTP_URL",
  "QINBAN_MAIL_FROM",
])
  if (!env[name]) problems.push(`缺少 ${name}。`);
if ((env.QINBAN_ACCOUNT_SECRET || "").length < 32)
  problems.push("账号会话密钥必须至少 32 字符。");
try {
  const origin = new URL(env.QINBAN_PUBLIC_ORIGIN || "");
  if (
    origin.protocol !== "https:" ||
    origin.origin !== env.QINBAN_PUBLIC_ORIGIN ||
    origin.username ||
    origin.password ||
    /(^|\.)example\.(com|test|invalid)$/.test(origin.hostname)
  )
    throw new Error();
} catch {
  problems.push(
    "QINBAN_PUBLIC_ORIGIN 必须为正式配置的 HTTPS origin（无路径或末尾斜线）。",
  );
}
try {
  const legal = publicLegalInformation(env);
  if (!legal.complete)
    problems.push("补齐公开运营方名称、支持邮箱和实际识谱服务提供方列表。");
} catch (error) {
  problems.push(error.message);
}
try {
  const apple = await loadAppleBillingConfiguration({ env, profile });
  if (!apple.available)
    problems.push(
      "Apple 内购未配置：需要应用、商品、环境、官方根证书与服务器 API 密钥。",
    );
} catch (error) {
  problems.push(error.message);
}
if (problems.length) {
  console.error(
    "iOS 发布配置尚未完成：\n" + problems.map((p) => "- " + p).join("\n"),
  );
  process.exitCode = 1;
} else
  console.log(
    "服务器配置静态检查通过。仍需 Xcode 编译、真机沙盒交易、通知联调、实际邮件及 Apple 审核验收。",
  );
