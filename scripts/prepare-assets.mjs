import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { prepareAudioModel } from "./prepare-audio-model.mjs";
import { preparePianoAssets } from "./prepare-piano-assets.mjs";
import { prepareStringAssets } from "./prepare-instrument-assets.mjs";
const root = new URL("../", import.meta.url);
for (const name of ["wasm", "standard_fonts", "cmaps"]) {
  const destination = new URL(`public/pdfjs/${name}`, root);
  await mkdir(destination, { recursive: true });
  await cp(
    fileURLToPath(new URL(`node_modules/pdfjs-dist/${name}`, root)),
    fileURLToPath(destination),
    { recursive: true },
  );
}
await prepareAudioModel();
await preparePianoAssets();
await prepareStringAssets();
