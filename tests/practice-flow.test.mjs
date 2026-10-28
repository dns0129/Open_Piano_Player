import test from "node:test";
import assert from "node:assert/strict";
import { boot, until } from "./app-harness.mjs";

const musicxml = `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>流程测试曲</work-title></work><identification><creator type="composer">Tester</creator></identification><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes><note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><staff>1</staff></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><staff>1</staff></note><backup><duration>4</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><staff>2</staff></note></measure></part></score-partwise>`;

// Import through the real file input, then export through the export dialog;
// the parsers and exporters are loaded on demand along the way.
test("a MusicXML import reaches the practice room and exports as MusicXML and MIDI", async (t) => {
  const { w, doc } = await boot(t, { staticSite: true });
  const downloads = [];
  w.URL.createObjectURL = (blob) => {
    downloads.push(blob);
    return "blob:fixture";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    downloads.at(-1).fileName = this.download;
  };

  const input = doc.querySelector("#file-input");
  const file = new w.File([musicxml], "flow.musicxml", {
    type: "application/vnd.recordare.musicxml+xml",
  });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new w.Event("change"));
  await until(
    () =>
      doc.querySelector(".score-document-heading h1")?.textContent ===
      "流程测试曲",
    "导入后练习室应显示新曲",
  );
  assert.match(
    doc.querySelector('.main-nav [data-nav="library"] small')?.textContent ||
      "",
    /^1$/,
    "曲库计数应包含新导入的曲目",
  );

  doc.querySelector("[data-export]").click();
  doc.querySelector('[data-format="xml"]').click();
  await until(() => downloads.length === 1, "应生成 MusicXML 文件");
  assert.equal(downloads[0].fileName, "流程测试曲.musicxml");
  const xml = await downloads[0].text();
  assert.match(xml, /<score-partwise/);
  assert.match(xml, /流程测试曲/);

  doc.querySelector("[data-export]").click();
  doc.querySelector('[data-format="midi"]').click();
  await until(() => downloads.length === 2, "应生成 MIDI 文件");
  assert.equal(downloads[1].fileName, "流程测试曲.mid");
  const header = new Uint8Array(await downloads[1].arrayBuffer()).slice(0, 4);
  assert.equal(String.fromCharCode(...header), "MThd");
});
