// Formats (or with --check, verifies) the tracked JavaScript/TypeScript sources with Prettier.
// Only files in git are touched, so untracked work in progress never fails `npm run check`.
// .prettierignore lists generated and archived code and the model-input files handled separately.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import * as prettier from "prettier";

const SCOPE = [
  "src",
  "lib",
  "tests",
  "scripts",
  "skills",
  "server.mjs",
  "vite.config.mjs",
];
const check = process.argv.includes("--check");
const files = execFileSync("git", ["ls-files", "-z", "--", ...SCOPE], {
  encoding: "utf8",
})
  .split("\0")
  .filter((file) => /\.(?:[cm]?js|ts)$/.test(file));

const unformatted = [];
for (const file of files) {
  const info = await prettier.getFileInfo(file, {
    ignorePath: ".prettierignore",
  });
  if (info.ignored) continue;
  const source = await readFile(file, "utf8").catch(() => null);
  if (source === null) continue; // deleted in the working tree
  const options = await prettier.resolveConfig(file);
  const formatted = await prettier.format(source, {
    ...options,
    filepath: file,
  });
  if (formatted === source) continue;
  unformatted.push(file);
  if (!check) await writeFile(file, formatted);
}
if (check && unformatted.length) {
  for (const file of unformatted) console.log(`[warn] ${file}`);
  console.log(
    `${unformatted.length} file(s) need formatting; run npm run format.`,
  );
  process.exitCode = 1;
} else
  console.log(
    check
      ? `Formatting passed: ${files.length} tracked files.`
      : `Formatted ${unformatted.length} of ${files.length} tracked files.`,
  );
