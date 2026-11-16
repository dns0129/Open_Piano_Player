// GitHub Pages layout: landing/ is the site root, Vite already wrote the
// static app to dist-pages/app, and the interactive guide stays at /site/.
import { access, cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist-pages");
const landing = join(root, "landing");

await access(join(out, "app", "index.html"));
await mkdir(out, { recursive: true });
await cp(join(landing, "index.html"), join(out, "index.html"));
for (const dir of ["css", "js", "img", "fonts", "audio"]) {
  await cp(join(landing, dir), join(out, dir), { recursive: true });
}
await cp(join(root, "site"), join(out, "site"), { recursive: true });
await writeFile(join(out, ".nojekyll"), "");
