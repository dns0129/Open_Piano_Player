// Formats files whose template literals are part of the model-input fingerprint
// (see .prettierignore): Prettier formats the code, then every outermost template
// literal is put back exactly as it was, so the text sent to the model is unchanged.
// Usage: node scripts/format-keep-templates.mjs lib/ai.mjs ...
import { readFile, writeFile } from "node:fs/promises";
import * as prettier from "prettier";
import ts from "typescript";

function templates(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = [];
  (function visit(node) {
    if (ts.isTemplateExpression(node)) {
      found.push({
        start: node.getStart(source),
        end: node.end,
        text: node.getText(source),
      });
      return;
    }
    ts.forEachChild(node, visit);
  })(source);
  return found;
}

export async function formatKeepingTemplates(file, original) {
  const options = await prettier.resolveConfig(file);
  const formatted = await prettier.format(original, {
    ...options,
    filepath: file,
  });
  const before = templates(file, original),
    after = templates(file, formatted);
  if (before.length !== after.length)
    throw Error(`${file}: template literal count changed while formatting`);
  let result = formatted;
  for (let i = after.length - 1; i >= 0; i--)
    result =
      result.slice(0, after[i].start) +
      before[i].text +
      result.slice(after[i].end);
  const check = templates(file, result).map((t) => t.text);
  if (JSON.stringify(check) !== JSON.stringify(before.map((t) => t.text)))
    throw Error(`${file}: template literals could not be restored exactly`);
  return result;
}

for (const file of process.argv.slice(2)) {
  const original = await readFile(file, "utf8");
  await writeFile(file, await formatKeepingTemplates(file, original));
}
