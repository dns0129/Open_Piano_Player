import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderSourceNotation } from "../src/source-notation.js";
test("positionless original images remain viewable without fabricated cursor or seek controls", (t) => {
  const dom = new JSDOM('<div id="score"></div>');
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  t.after(() => {
    globalThis.document = previous;
    dom.window.close();
  });
  const host = document.querySelector("#score");
  const renderer = renderSourceNotation(
    host,
    {},
    {
      sourceNotation: {
        notePositionsComplete: false,
        notes: [],
        systems: [
          { page: 1, system: 1, imageUrl: "blob:original-one" },
          { page: 2, system: 1, imageUrl: "blob:original-two" },
        ],
      },
    },
  );
  assert.equal(host.querySelectorAll("img").length, 2);
  assert.match(host.textContent, /尚无逐音定位/);
  renderer.setBeat(10);
  renderer.setHands({ leftEnabled: false });
  assert.equal(
    host.querySelectorAll(".source-notation-cursor,.source-notation-hit")
      .length,
    0,
  );
  renderer.destroy();
  assert.equal(host.childElementCount, 0);
});
