import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { SCORE_RECOGNITION } from "./recognition-policy.mjs";

export const provider = "openai-codex";
export const defaultModel = SCORE_RECOGNITION.model;
let lastVerification = null;

function expiryOf(token) {
  try {
    return (
      Number(
        JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
          .exp,
      ) * 1000
    );
  } catch {
    return 0;
  }
}

// Shared login files are read only. Never copy their tokens into browser settings or logs.
export async function sharedCredential({
  baseHome = homedir(),
  codexHome = process.env.CODEX_HOME,
} = {}) {
  const paths = [
    {
      path: resolve(baseHome, ".pi/agent/auth.json"),
      source: "本机 Pi 登录",
      pi: true,
    },
    {
      path: resolve(codexHome || resolve(baseHome, ".codex"), "auth.json"),
      source: "本机 Codex 登录",
    },
  ];
  for (const entry of paths) {
    try {
      const data = JSON.parse(await readFile(entry.path, "utf8"));
      const stored = entry.pi ? data[provider] : null;
      const access = entry.pi
        ? stored?.type === "oauth" && stored.access
        : data.auth_mode !== "apikey" && data.tokens?.access_token;
      const expires = access && expiryOf(access);
      if (access && expires > Date.now() + 60000)
        return {
          source: entry.source,
          credential: { type: "oauth", access, refresh: "", expires },
        };
    } catch {
      /* Try the next existing login without revealing file contents. */
    }
  }
  throw Object.assign(
    new Error(
      "未找到有效的 ChatGPT 订阅登录。请先在本机 Codex 或 Pi 登录 ChatGPT，再刷新连接状态。",
    ),
    { code: "PI_NOT_CONNECTED" },
  );
}

export const credentials = {
  async read(id) {
    return id === provider ? (await sharedCredential()).credential : undefined;
  },
  async list() {
    try {
      await sharedCredential();
      return [{ providerId: provider, type: "oauth" }];
    } catch {
      return [];
    }
  },
  async modify() {
    throw new Error("共享订阅登录为只读，请在 Codex 或 Pi 中重新登录。");
  },
  async delete() {
    throw new Error("请在 Codex 或 Pi 中管理共享订阅登录。");
  },
};
export const models = createModels({ credentials });
models.setProvider(openaiCodexProvider());

export function markVerified(model) {
  lastVerification = { model, at: new Date().toISOString() };
}
export async function authStatus(selectedModel = defaultModel) {
  const catalog = models.getModels(provider).map((m) => ({
    id: m.id,
    name: m.name,
    image: m.input?.includes("image") || false,
  }));
  const base = {
    model: selectedModel,
    provider,
    models: catalog,
    billing: "ChatGPT / Codex 订阅额度",
    lastVerification,
  };
  try {
    return {
      ...base,
      available: true,
      source: (await sharedCredential()).source,
    };
  } catch (error) {
    return { ...base, available: false, message: publicError(error) };
  }
}

export function publicError(error) {
  const s = String(error?.message || error);
  if (/PI_NOT_CONNECTED/.test(error?.code || ""))
    return "未找到有效的 ChatGPT 订阅登录。请先在本机 Codex 或 Pi 登录 ChatGPT，再刷新连接状态。";
  if (/overload|servers.*busy|\b503\b|\b502\b/i.test(s))
    return "GPT-6.1 Sol 服务繁忙，请稍后重试。";
  if (/429|quota|rate.limit|usage.limit/i.test(s))
    return "模型额度或调用速率达到限制，请稍后重试，或检查所选服务的用量。";
  if (/401|403|unauthorized|token.*expired/i.test(s))
    return "模型登录已失效，或账户无所选模型权限，请检查登录或密钥。";
  if (/abort|timeout|timed.out/i.test(s))
    return "本次生成已取消或超时，可以重试。";
  if (/fetch|ENOTFOUND|ECONN|network/i.test(s))
    return "连接模型服务失败，请检查网络后重试。";
  // Upstream error bodies are not safe user-facing text: never echo them.
  if (error?.public === true) return s.slice(0, 500);
  return "本次请求未完成。请检查输入并重试。";
}
