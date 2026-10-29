import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHTML } from "../src/html.js";

test("escapeHTML neutralizes markup and attribute breakouts and renders missing values empty", () => {
  assert.equal(
    escapeHTML(`<img src=x onerror="a('b')">&`),
    "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;",
  );
  assert.equal(escapeHTML(null), "");
  assert.equal(escapeHTML(undefined), "");
  assert.equal(escapeHTML(0), "0");
});

test("browser code has a single HTML escaper", async () => {
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".js")) files.push(path);
    }
  };
  await walk(fileURLToPath(new URL("../src", import.meta.url)));
  const copies = [];
  for (const file of files)
    if (
      !file.endsWith("/src/html.js") &&
      (await readFile(file, "utf8")).includes('"&quot;"')
    )
      copies.push(file);
  assert.deepEqual(copies, [], "import escapeHTML from src/html.js instead");
});
