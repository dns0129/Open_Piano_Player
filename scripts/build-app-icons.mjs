// Home-screen icons for iPad/iPhone "Add to Home Screen" and the web manifests.
// iOS ignores SVG icons and fills transparent corners with black, so the PNGs
// are full-bleed squares; the glyph stays inside the maskable safe zone.
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#214d3e"/><path d="M17 45V18h30v27M27 18v27m10-27v27" stroke="#fbf8ef" stroke-width="5"/><path d="M26 18v14m12-14v14" stroke="#214d3e" stroke-width="6"/></svg>',
);
for (const [file, size] of [
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
])
  await sharp(svg, { density: (72 * size) / 64 })
    .resize(size, size)
    .png()
    .toFile(root + file);
