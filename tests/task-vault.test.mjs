import test from "node:test";
import assert from "node:assert/strict";
import { createTaskVault } from "../src/task-vault.js";
test("task recovery tokens migrate to private metadata and survive a fresh vault without localStorage", async () => {
  const original = JSON.stringify({ job: "private-token" }),
    legacy = new Map([["qinban-fullscore-jobs", original]]),
    data = new Map();
  const storage = {
      getItem: (k) => legacy.get(k),
      removeItem: (k) => legacy.delete(k),
    },
    metadata = {
      get: (k) => data.get(k),
      set: (k, v) => data.set(k, structuredClone(v)),
    };
  const vault = createTaskVault({ metadata, storage });
  await vault.initialize();
  assert.equal(legacy.size, 0);
  const fresh = createTaskVault({ metadata, storage });
  await fresh.initialize();
  assert.equal(fresh.get("job"), "private-token");
});
