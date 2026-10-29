// Lint with the TypeScript compiler already in devDependencies: report only names that
// are never defined (a typo or a missed import after moving code) and unused locals/imports.
// Type errors in the plain JavaScript files are deliberately ignored.
import ts from "typescript";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const REPORTED = new Map([
  [2304, "undefined name"],
  [2552, "undefined name"],
  [6133, "unused"],
  [6192, "unused import"],
  [6196, "unused"],
  [6198, "unused"],
]);

function collect(dir, pattern, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) collect(path, pattern, out);
    else if (pattern.test(name)) out.push(path);
  }
  return out;
}
const files = [
  ...collect(join(root, "src"), /\.js$/),
  ...collect(join(root, "lib"), /\.(mjs|ts)$/),
  join(root, "server.mjs"),
];
const program = ts.createProgram(files, {
  allowJs: true,
  checkJs: true,
  noEmit: true,
  noUnusedLocals: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  skipLibCheck: true,
  lib: ["lib.es2023.d.ts", "lib.dom.d.ts"],
  types: [],
});
const problems = [];
for (const file of program.getSourceFiles()) {
  if (!files.includes(file.fileName)) continue;
  for (const d of program.getSemanticDiagnostics(file)) {
    const kind = REPORTED.get(d.code);
    if (!kind) continue;
    const { line, character } = file.getLineAndCharacterOfPosition(d.start);
    problems.push(
      `${relative(root, file.fileName)}:${line + 1}:${character + 1}  ${kind}  ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
    );
  }
}
problems.sort();
for (const problem of problems) console.log(problem);
console.log(
  problems.length
    ? `\n${problems.length} problem(s) in ${files.length} files.`
    : `Lint passed: ${files.length} files.`,
);
process.exitCode = problems.length ? 1 : 0;
