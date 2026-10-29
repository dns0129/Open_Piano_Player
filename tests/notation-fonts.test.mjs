import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MUSIC_FONTS, fontBytes } from "../scripts/extract-music-fonts.mjs";

test("the woff2 music fonts match the copies embedded in the installed vexflow", async () => {
  for (const [name, data] of Object.entries(MUSIC_FONTS))
    assert.ok(
      (
        await readFile(new URL(`../src/fonts/${name}.woff2`, import.meta.url))
      ).equals(fontBytes(data)),
      `src/fonts/${name}.woff2 differs; run node scripts/extract-music-fonts.mjs`,
    );
});
