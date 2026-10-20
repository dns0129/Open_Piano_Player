import { capabilities as defaults, STATIC_NOTICE } from "./capabilities.js";

/** Local requests cross this interface. Static clients never issue /api calls. */
export function createApiClient({
  capabilities = defaults,
  fetchImpl = (...args) => fetch(...args),
  onStatus = () => {},
} = {}) {
  let status = null,
    refreshing;
  function available() {
    if (!capabilities.localServer)
      throw Object.assign(new Error(STATIC_NOTICE), {
        code: "STATIC_SITE",
        status: 503,
      });
  }
  async function refreshStatus() {
    available();
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const response = await fetchImpl("/api/status", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw Object.assign(new Error(data.error || "本机状态读取失败。"), {
          code: data.code,
          status: response.status,
        });
      status = data;
      onStatus(status);
      return data;
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }
  async function response(
    path,
    { body, signal, headers = {}, method, timeoutMs } = {},
    recovered = false,
  ) {
    available();
    if (typeof path !== "string" || !path.startsWith("/api/"))
      throw new Error("本机请求必须使用 /api/ 路径。");
    if (path === "/api/status") return refreshStatus();
    if (!status) await refreshStatus();
    const options = {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: { ...headers },
      signal:
        signal || (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined),
    };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(options.method))
      options.headers["X-CSRF-Token"] = status.csrfToken;
    const result = await fetchImpl(path, options);
    if (!result.ok) {
      const data = await result.json().catch(() => ({}));
      if (
        result.status === 403 &&
        !recovered &&
        ["CSRF", "SESSION_REQUIRED"].includes(data.code)
      ) {
        await refreshStatus();
        return response(
          path,
          { body, signal, headers, method, timeoutMs },
          true,
        );
      }
      throw Object.assign(
        new Error(data.error || data.message || "本机请求失败。"),
        { code: data.code, status: result.status },
      );
    }
    return result;
  }
  return {
    get status() {
      return status;
    },
    refreshStatus,
    async json(path, body, signal, options = {}) {
      if (path === "/api/status") return refreshStatus();
      return (await response(path, { ...options, body, signal })).json();
    },
    async blob(path, options = {}) {
      return (await response(path, options)).blob();
    },
    response,
  };
}
