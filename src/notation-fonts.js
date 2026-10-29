// Music fonts for the on-screen notation. They load as hashed woff2 files instead of the
// base64 copies inside "vexflow/bravura": the browser caches them across releases and
// about 290 KB (gzip) of font data stays out of the startup JavaScript. Printing
// inlines the same files as data URLs (musicFontDataURL below).
// Regenerate src/fonts/ with scripts/extract-music-fonts.mjs after upgrading vexflow.
import { Font, VexFlow } from "vexflow/core";

// Glyph metrics follow the configured family; the faces themselves load below.
VexFlow.setFonts("Bravura", "Academico");

// Literal new URL(...) calls let Vite emit hashed files; kept in a function so
// bundles without import.meta (tests) never evaluate them.
const fontURL = (name) =>
  ({
    Bravura: () => new URL("./fonts/Bravura.woff2", import.meta.url).href,
    Academico: () => new URL("./fonts/Academico.woff2", import.meta.url).href,
    AcademicoBold: () =>
      new URL("./fonts/AcademicoBold.woff2", import.meta.url).href,
  })[name]();

export const musicFontsReady =
  typeof FontFace !== "undefined" &&
  typeof document !== "undefined" &&
  document.fonts
    ? Promise.allSettled([
        Font.load("Bravura", fontURL("Bravura"), { display: "block" }),
        Font.load("Academico", fontURL("Academico"), { display: "swap" }),
        Font.load("Academico", fontURL("AcademicoBold"), {
          display: "swap",
          weight: "bold",
        }),
      ]).then(() => {
        VexFlow.setFonts("Bravura", "Academico");
      })
    : Promise.resolve();

const dataURLs = new Map();
/**
 * The font as a data: URL, for SVG that is drawn as an image (printing and PDF export)
 * and so cannot load external fonts. Served from the HTTP cache after the first load.
 * @param {"Bravura" | "Academico"} name
 */
export function musicFontDataURL(name) {
  if (!dataURLs.has(name))
    dataURLs.set(
      name,
      fetch(fontURL(name))
        .then((response) => {
          if (!response.ok) throw new Error(`${name} 字体加载失败。`);
          return response.blob();
        })
        .then(
          (blob) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(new Blob([blob], { type: "font/woff2" }));
            }),
        )
        .catch((error) => {
          dataURLs.delete(name);
          throw error;
        }),
    );
  return dataURLs.get(name);
}
