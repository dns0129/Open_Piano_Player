import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  mountPracticeLayout,
  practicePresentation,
  practiceLayout,
} from "../src/practice-layout.js";

function setup(width = 1194, height = 834, storage) {
  const dom = new JSDOM(
    `<div class="app-shell has-practice"><header class="app-header"></header><main><div class="practice-layout-bar">${["topbar", "sidebar", "keyboard", "focus"].map((panel) => `<button data-layout="${panel}">${panel}</button>`).join("")}</div><aside id="practice-sidebar"><button data-layout-close>Close</button><input value="96"></aside><section class="score-stage"><div id="notation">score</div></section><section class="playback-dock"><button id="play">Pause</button><input id="seek" value="48"></section><button class="layout-restore" data-layout="focus">Restore</button></main><nav class="mobile-nav"></nav></div>`,
    { url: "https://qinban.test", pretendToBeVisual: true },
  );
  const { window } = dom;
  window.HTMLElement.prototype.getClientRects = () => [{}];
  window.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  window.cancelAnimationFrame = () => {};
  const shell = window.document.querySelector(".app-shell");
  const resize = (w, h) => {
    window.innerWidth = w;
    window.innerHeight = h;
    window.dispatchEvent(new window.Event("resize"));
  };
  resize(width, height);
  let dispose = mountPracticeLayout(shell, { storage, viewport: window });
  return {
    window,
    shell,
    resize,
    click: (panel) => shell.querySelector(`[data-layout="${panel}"]`).click(),
    remount: () => {
      dispose();
      dispose = mountPracticeLayout(shell, { storage, viewport: window });
    },
    close: () => {
      dispose();
      dom.window.close();
    },
  };
}

test("iPad portrait and iPhone landscape use the whole score; phones have no default side panel or keyboard", () => {
  assert.equal(practicePresentation(834, 1194), "portrait");
  assert.equal(practiceLayout("portrait").focus, true);
  assert.equal(practiceLayout(practicePresentation(1194, 834)).focus, false);
  assert.equal(practicePresentation(390, 844), "phone");
  assert.equal(practicePresentation(844, 390), "phone-landscape");
  assert.equal(practiceLayout(practicePresentation(844, 390)).focus, true);
  assert.equal(practiceLayout("phone").keyboard, false);
});

test("short desktop windows fold the keyboard by default but keep a saved choice", () => {
  assert.equal(practiceLayout("desktop", {}, { short: true }).keyboard, false);
  assert.equal(practiceLayout("desktop", {}, { short: true }).sidebar, true);
  assert.equal(
    practiceLayout("desktop", { desktop: { keyboard: true } }, { short: true })
      .keyboard,
    true,
  );
  assert.equal(practiceLayout("desktop").keyboard, true);
});

test("folding panels and rotating keep the same player, score DOM and current beat", () => {
  const t = setup();
  try {
    const score = t.shell.querySelector("#notation"),
      play = t.shell.querySelector("#play"),
      seek = t.shell.querySelector("#seek");
    let played = 0;
    play.onclick = () => played++;
    t.click("topbar");
    t.click("sidebar");
    t.click("keyboard");
    for (const panel of ["topbar", "sidebar", "keyboard"])
      assert.ok(t.shell.classList.contains(`${panel}-hidden`));
    t.resize(834, 1194);
    assert.ok(t.shell.classList.contains("is-focus"));
    play.click();
    assert.equal(played, 1);
    assert.equal(seek.value, "48");
    assert.equal(t.shell.querySelector("#notation"), score);
    t.resize(1194, 834);
    assert.ok(!t.shell.classList.contains("is-focus"));
    for (const panel of ["topbar", "sidebar", "keyboard"])
      assert.ok(
        t.shell.classList.contains(`${panel}-hidden`),
        "landscape choices are retained",
      );
    t.remount();
    assert.ok(
      t.shell.classList.contains("keyboard-hidden"),
      "a full app render restores layout preferences",
    );
  } finally {
    t.close();
  }
});

test("leaving portrait focus is reversible and does not change the landscape layout", () => {
  const t = setup(834, 1194);
  try {
    assert.ok(t.shell.classList.contains("is-focus"));
    t.shell.querySelector(".layout-restore").click();
    assert.ok(!t.shell.classList.contains("is-focus"));
    t.click("keyboard");
    t.resize(1194, 834);
    assert.ok(!t.shell.classList.contains("keyboard-hidden"));
    t.click("keyboard");
    t.resize(834, 1194);
    assert.ok(!t.shell.classList.contains("is-focus"));
    assert.ok(!t.shell.classList.contains("keyboard-hidden"));
    t.remount();
    assert.ok(!t.shell.classList.contains("is-focus"));
  } finally {
    t.close();
  }
});

test("phone settings drawer traps keyboard focus and restores accessible background on Escape", () => {
  const t = setup(390, 844);
  try {
    const side = t.shell.querySelector("#practice-sidebar");
    t.click("sidebar");
    assert.equal(side.getAttribute("role"), "dialog");
    assert.equal(side.getAttribute("aria-modal"), "true");
    assert.equal(t.shell.querySelector(".score-stage").inert, true);
    const first = side.querySelector("button"),
      last = side.querySelector("input");
    last.focus();
    t.window.document.dispatchEvent(
      new t.window.KeyboardEvent("keydown", { key: "Tab", cancelable: true }),
    );
    assert.equal(t.window.document.activeElement, first);
    t.window.document.dispatchEvent(
      new t.window.KeyboardEvent("keydown", { key: "Escape" }),
    );
    assert.ok(t.shell.classList.contains("sidebar-hidden"));
    assert.equal(side.hasAttribute("aria-modal"), false);
    assert.equal(t.shell.querySelector(".score-stage").inert, false);
  } finally {
    t.close();
  }
});

test("corrupt preferences and unavailable storage do not prevent reading a score", () => {
  for (const raw of [
    "null",
    "[]",
    '"invalid"',
    '{"portrait":{"focus":"false"}}',
  ]) {
    const t = setup(834, 1194, {
      getItem: () => raw,
      setItem: () => {
        throw Error("quota");
      },
    });
    try {
      assert.ok(t.shell.classList.contains("is-focus"));
      t.click("focus");
      assert.ok(!t.shell.classList.contains("is-focus"));
    } finally {
      t.close();
    }
  }
});
