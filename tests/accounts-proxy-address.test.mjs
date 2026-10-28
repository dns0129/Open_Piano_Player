import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHostedServer, clientAddress } from "../lib/accounts/http.mjs";

const request = (remoteAddress, forwarded) => ({
  socket: { remoteAddress },
  headers: forwarded === undefined ? {} : { "x-forwarded-for": forwarded },
});

test("client address uses the last X-Forwarded-For hop only from the loopback proxy", () => {
  assert.equal(
    clientAddress(request("127.0.0.1", "198.51.100.7, 203.0.113.9"), {
      trustProxy: true,
    }),
    "203.0.113.9",
  );
  assert.equal(
    clientAddress(request("::ffff:127.0.0.1", "203.0.113.9"), {
      trustProxy: true,
    }),
    "203.0.113.9",
  );
  assert.equal(
    clientAddress(request("127.0.0.1"), { trustProxy: true }),
    "127.0.0.1",
  );
  assert.equal(
    clientAddress(request("198.51.100.7", "203.0.113.9"), { trustProxy: true }),
    "198.51.100.7",
  );
  assert.equal(clientAddress(request("127.0.0.1", "203.0.113.9")), "127.0.0.1");
});

test("production sign-in codes are rate limited by the proxied client, not the proxy", async (t) => {
  const seen = [];
  const identity = {
    csrf: () => "login-csrf",
    code: async (input) => {
      seen.push(input.ip);
      return { challengeId: "c" };
    },
  };
  const server = createHostedServer({
    identity,
    profile: "production",
    origin: "https://piano.example",
  });
  t.after(() => new Promise((r) => server.close(r)));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  // fetch() cannot set Host, which the production origin check requires.
  const send = (forwarded) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: server.address().port,
          path: "/api/v1/auth/code",
          method: "POST",
          headers: {
            host: "piano.example",
            "x-forwarded-proto": "https",
            "x-forwarded-for": forwarded,
            "content-type": "application/json",
            "x-csrf-token": "login-csrf",
            cookie: "__Host-qinban_login=nonce",
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify({ email: "a@example.test" }));
    });
  assert.equal(await send("203.0.113.9"), 202);
  assert.equal(await send("spoofed, 198.51.100.7"), 202);
  assert.deepEqual(seen, ["203.0.113.9", "198.51.100.7"]);
});
