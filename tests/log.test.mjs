import test from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "../lib/log.mjs";
import { createHostedServer } from "../lib/accounts/http.mjs";

const capture = () => {
  const lines = [];
  return {
    lines,
    log: createLogger({
      write: (line) => lines.push(JSON.parse(line)),
      now: () => new Date("2026-10-29T00:00:00Z"),
      silent: false,
    }),
  };
};

test("log lines are single JSON objects with the error reduced to name, code and message", () => {
  const { lines, log } = capture();
  log.warn("payment.query-failed", {
    orderId: "o1",
    error: Object.assign(new Error("upstream 503"), { code: "UPSTREAM" }),
  });
  log.error("maintenance.cleanup-failed", { error: new Error("disk full") });
  assert.deepEqual(lines[0], {
    time: "2026-10-29T00:00:00.000Z",
    level: "warn",
    event: "payment.query-failed",
    orderId: "o1",
    error: { name: "Error", code: "UPSTREAM", message: "upstream 503" },
  });
  assert.ok(Array.isArray(lines[1].error.stack), "errors keep a short stack");
  const quiet = createLogger({ write: () => assert.fail(), silent: true });
  quiet.error("ignored");
});

test("an unexpected hosted-server failure is logged under the request id returned to the client", async (t) => {
  const { lines, log } = capture();
  const server = createHostedServer({
    profile: "local",
    log,
    identity: {
      session: async () => {
        throw new Error("database unavailable");
      },
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/session`, {
    headers: { cookie: "qinban_dev_account=abc" },
  });
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, "http.internal-error");
  assert.equal(lines[0].requestId, body.requestId);
  assert.equal(lines[0].path, "/api/v1/session");
  assert.equal(lines[0].error.message, "database unavailable");
});
