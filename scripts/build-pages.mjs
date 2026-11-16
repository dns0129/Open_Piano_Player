// Publishable GitHub Pages tree:
//   dist-pages/        marketing site from landing/ (project-site root)
//   dist-pages/app/    static practice app (Vite base /<repo>/app/)
//   dist-pages/site/   existing interactive homepage and guide
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "dist-pages");
const base = process.env.PAGES_BASE || "/Open_Piano_Player/app/";
if (!base.startsWith("/") || !base.endsWith("/")) {
  console.error(
    `PAGES_BASE must start and end with /, got ${JSON.stringify(base)}`,
  );
  process.exit(1);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const vite = spawnSync(
  process.execPath,
  [
    join(root, "node_modules/vite/bin/vite.js"),
    "build",
    "--base",
    base,
    "--outDir",
    "dist-pages/app",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VITE_STATIC_SITE: "1" },
  },
);
if (vite.status !== 0) process.exit(vite.status ?? 1);

for (const name of ["index.html", "css", "js", "fonts", "img", "audio"]) {
  await cp(join(root, "landing", name), join(out, name), { recursive: true });
}
await cp(join(root, "site"), join(out, "site"), { recursive: true });
await writeFile(join(out, ".nojekyll"), "");

const appHtml = await readFile(join(out, "app/index.html"), "utf8");
const landingHtml = await readFile(join(out, "index.html"), "utf8");
if (!appHtml.includes(base)) {
  console.error(`App index is missing base ${base}`);
  process.exit(1);
}
if (!landingHtml.includes('href="css/') || !landingHtml.includes('src="js/')) {
  console.error("Landing index is missing relative css/js links.");
  process.exit(1);
}
console.log(
  `Pages tree ready: landing at /, practice app at ${base}, guide at /site/`,
);
