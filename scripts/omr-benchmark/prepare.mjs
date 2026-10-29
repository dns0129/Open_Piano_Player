import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { createCanvas, loadImage } from "@napi-rs/canvas";
const root = ".local/omr-benchmark-20261017";
const { default: createVerovioModule } = await import(
  "../../" + root + "/tooling/node_modules/verovio/dist/verovio-module.mjs"
);
const { VerovioToolkit } = await import(
  "../../" + root + "/tooling/node_modules/verovio/dist/verovio.mjs"
);
const module = await createVerovioModule(),
  tk = new VerovioToolkit(module);
const sources = JSON.parse(await readFile(root + "/corpus-sources.json")),
  manifest = [];
for (const s of sources) {
  const folder = root + "/" + s.id,
    bytes = await readFile(folder + "/source.mxl"),
    files = unzipSync(bytes),
    container = strFromU8(files["META-INF/container.xml"]),
    path = container.match(/full-path="([^"]+)"/)[1];
  let xml = strFromU8(files[path]);
  await writeFile(folder + "/source.musicxml", xml);
  tk.setOptions({
    inputFrom: "musicxml",
    pageWidth: 2100,
    pageHeight: 2970,
    scale: 40,
    adjustPageHeight: false,
    breaks: "auto",
    header: "none",
    footer: "none",
    svgViewBox: true,
    svgHtml5: true,
  });
  if (!tk.loadData(xml)) throw Error(s.id + " failed render");
  const count = tk.getPageCount(),
    pages = [];
  for (let n = 1; n <= count; n++) {
    const svg = tk
      .renderToSVG(n)
      .replace(
        /<(path|ellipse|polygon|polyline|rect)(\s)/g,
        '<$1 stroke="#000"$2',
      );
    await writeFile(folder + `/page-${n}.svg`, svg);
    const im = await loadImage(Buffer.from(svg)),
      c = createCanvas(1680, Math.round((im.height / im.width) * 1680));
    c.getContext("2d").fillStyle = "#fff";
    c.getContext("2d").fillRect(0, 0, c.width, c.height);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    const png = c.toBuffer("image/png");
    await writeFile(folder + `/page-${n}.png`, png);
    pages.push({
      page: n,
      width: c.width,
      height: c.height,
      path: `page-${n}.png`,
      sha256: createHash("sha256").update(png).digest("hex"),
    });
  }
  manifest.push({
    ...s,
    pages,
    rendererVersion: tk.getVersion(),
    inputKind:
      "Rasterized clean engraving from pinned source MusicXML; identical pixels for both recognizers",
  });
  console.log(s.id, count);
}
await writeFile(
  root + "/manifest-draft.json",
  JSON.stringify(manifest, null, 2),
);
tk.destroy();
