/** Recovery credentials are private IndexedDB metadata, never UI preferences. */
export function createTaskVault({
  metadata,
  storage = globalThis.localStorage,
} = {}) {
  let tokens = {},
    initialization;
  const valid = (data) =>
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Object.entries(data).every(
      ([id, token]) =>
        /^[A-Za-z0-9_-]{1,80}$/.test(id) &&
        typeof token === "string" &&
        token.length <= 300,
    );
  return {
    initialize() {
      return (initialization ||= (async () => {
        tokens = (await metadata.get("recognition-tokens")) || {};
        const raw = storage?.getItem("qinban-fullscore-jobs");
        if (raw) {
          const legacy = JSON.parse(raw);
          if (!valid(legacy))
            throw new Error("旧识谱恢复凭据格式无效，原数据已保留。");
          tokens = { ...legacy, ...tokens };
          await metadata.set("recognition-tokens", tokens);
          storage.removeItem("qinban-fullscore-jobs");
        }
        if (!valid(tokens)) throw new Error("识谱恢复凭据格式无效。");
      })().catch((e) => {
        initialization = null;
        throw e;
      }));
    },
    get(id) {
      return tokens[id];
    },
    ids() {
      return Object.keys(tokens);
    },
    async set(id, token) {
      tokens = { ...tokens, [id]: token };
      await metadata.set("recognition-tokens", tokens);
    },
    async remove(id) {
      const next = { ...tokens };
      delete next[id];
      await metadata.set("recognition-tokens", next);
      tokens = next;
    },
  };
}
