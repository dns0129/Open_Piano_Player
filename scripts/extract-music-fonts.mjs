// Writes VexFlow's embedded Bravura/Academico fonts to src/fonts/ as plain woff2 files,
// which src/notation-fonts.js loads by URL. Rerun after upgrading vexflow; a test checks they match.
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Bravura } from "../node_modules/vexflow/build/esm/src/fonts/bravura.js";
import { Academico } from "../node_modules/vexflow/build/esm/src/fonts/academico.js";
import { AcademicoBold } from "../node_modules/vexflow/build/esm/src/fonts/academicobold.js";

export const MUSIC_FONTS = { Bravura, Academico, AcademicoBold };
export const fontBytes = (dataUrl) =>
  Buffer.from(dataUrl.slice(dataUrl.indexOf("base64,") + 7), "base64");

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  for (const [name, data] of Object.entries(MUSIC_FONTS))
    await writeFile(
      new URL(`../src/fonts/${name}.woff2`, import.meta.url),
      fontBytes(data),
    );
