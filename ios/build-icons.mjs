// Render the existing Qinban vector mark for iOS. No third-party artwork.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("./Qinban/Assets.xcassets/AppIcon.appiconset/", import.meta.url));
await mkdir(directory, { recursive: true });
const vector = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#214d3e"/><path d="M17 45V18h30v27M27 18v27m10-27v27" stroke="#fbf8ef" stroke-width="5"/><path d="M26 18v14m12-14v14" stroke="#214d3e" stroke-width="6"/></svg>',
);
await sharp(vector, { density: 1152 }).resize(1024, 1024).removeAlpha().png().toFile(directory + "AppIcon.png");
await writeFile(directory + "Contents.json", JSON.stringify({
  images: [{ filename: "AppIcon.png", idiom: "universal", platform: "ios", size: "1024x1024" }],
  info: { author: "xcode", version: 1 },
}, null, 2) + "\n");
