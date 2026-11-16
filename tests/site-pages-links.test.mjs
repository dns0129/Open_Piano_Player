import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  publishedPagesFile,
  readPublishedPagesFile,
} from "../lib/pages-links.mjs";

test("this repository's Pages links map onto dist-pages, including /app/", () => {
  const root = resolve("/tmp/qinban-dist-pages");
  assert.equal(
    publishedPagesFile(
      "https://dns0129.github.io/Open_Piano_Player/app/",
      root,
    ),
    resolve(root, "app/index.html"),
  );
  assert.equal(
    publishedPagesFile("https://dns0129.github.io/Open_Piano_Player/", root),
    resolve(root, "index.html"),
  );
  assert.equal(
    publishedPagesFile(
      "https://dns0129.github.io/Open_Piano_Player/site/guide.html",
      root,
    ),
    resolve(root, "site/guide.html"),
  );
});

test("already-live and local links are not rewritten onto the Pages build", () => {
  const root = resolve("/tmp/qinban-dist-pages");
  assert.equal(
    publishedPagesFile("https://github.com/dns0129/Open_Piano_Player", root),
    null,
  );
  assert.equal(
    publishedPagesFile("http://127.0.0.1:8817/guide.html", root),
    null,
  );
  assert.equal(publishedPagesFile("guide.html", root), null);
  assert.equal(
    publishedPagesFile(
      "https://dns0129.github.io/Open_Piano_Player/../secret",
      root,
    ),
    null,
  );
});

test("a directory Pages link reads the built index.html", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "qinban-pages-"));
  await mkdir(resolve(root, "app"), { recursive: true });
  const page = "<!doctype html><html><title>app</title></html>";
  await writeFile(resolve(root, "app/index.html"), page);
  const file = publishedPagesFile(
    "https://dns0129.github.io/Open_Piano_Player/app",
    root,
  );
  assert.equal((await readPublishedPagesFile(file)).toString("utf8"), page);
  assert.equal(
    (
      await readFile(
        publishedPagesFile(
          "https://dns0129.github.io/Open_Piano_Player/app/",
          root,
        ),
      )
    ).toString("utf8"),
    page,
  );
});
