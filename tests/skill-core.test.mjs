import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSkillCore, SKILL_CORE } from "../scripts/build-skill-core.mjs";

test("the Skill's generated core matches the current lib/ sources", async () => {
  assert.equal(
    await readFile(new URL("../" + SKILL_CORE, import.meta.url), "utf8"),
    await buildSkillCore(),
    "run node scripts/build-skill-core.mjs and commit the result",
  );
  assert.equal(
    await readFile(
      new URL(
        "../skills/piano-score-to-musicxml/scripts/written-evidence.mjs",
        import.meta.url,
      ),
      "utf8",
    ),
    await readFile(
      new URL("../lib/recognition-notation.mjs", import.meta.url),
      "utf8",
    ),
    "source evidence rules must be shared with the Skill; regenerate with build-skill-core",
  );
});
