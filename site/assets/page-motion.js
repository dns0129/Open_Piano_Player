/* Visual motion only. Playback, notes and score coordinates belong to home.js. */
const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function createFlowArtwork(host) {
  const svg = svgElement("svg", {
    viewBox: "0 0 1440 850",
    preserveAspectRatio: "none",
    "aria-hidden": "true",
    focusable: "false",
  });
  const defs = svgElement("defs");
  const gradient = svgElement("linearGradient", {
    id: "qinban-flow-gradient",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "0%",
  });
  for (const [offset, color, opacity] of [
    ["0%", "#A4735E", 0],
    ["15%", "#A4735E", 0.35],
    ["39%", "#234F3E", 0.24],
    ["75%", "#234F3E", 0.12],
    ["100%", "#A4735E", 0],
  ]) {
    gradient.append(
      svgElement("stop", {
        offset,
        "stop-color": color,
        "stop-opacity": opacity,
      }),
    );
  }
  defs.append(gradient);
  svg.append(defs);
  const sweep = svgElement("path", {
    class: "flow-sweep",
    stroke: "url(#qinban-flow-gradient)",
  });
  svg.append(sweep);
  const ribbons = Array.from({ length: 5 }, (_, index) => {
    const path = svgElement("path", {
      class: `flow-ribbon flow-ribbon-${index}`,
      stroke: "url(#qinban-flow-gradient)",
    });
    svg.append(path);
    return path;
  });
  const beads = Array.from({ length: 3 }, (_, index) => {
    const bead = svgElement("ellipse", {
      class: "flow-bead",
      rx: index === 1 ? 3.7 : 2.7,
      ry: 1.9,
    });
    svg.append(bead);
    return bead;
  });
  host.replaceChildren(svg);

  function yAt(x, time, index) {
    const u = x / 1440;
    const envelope = 0.8 + 0.2 * Math.sin(u * Math.PI);
    return (
      620 -
      u * 290 +
      index * 11 +
      Math.sin(u * 6.5 + time * 0.44 + index * 0.055) * 53 * envelope +
      Math.sin(u * 12.5 - time * 0.29) * 20 +
      Math.cos(u * 3.7 + time * 0.31) * 22
    );
  }

  function draw(time) {
    ribbons.forEach((path, index) => {
      const points = [];
      for (let step = 0; step <= 28; step += 1) {
        const x = -80 + step * (1600 / 28);
        points.push([x, yAt(x, time, index)]);
      }
      let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
      for (let step = 1; step < points.length - 1; step += 1) {
        const current = points[step];
        const next = points[step + 1];
        d += ` Q${current[0].toFixed(1)} ${current[1].toFixed(1)} ${((current[0] + next[0]) / 2).toFixed(1)} ${((current[1] + next[1]) / 2).toFixed(1)}`;
      }
      const last = points.at(-1);
      d += ` T${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
      path.setAttribute("d", d);
      if (index === 2) sweep.setAttribute("d", d);
    });
    beads.forEach((bead, index) => {
      const progress = (time * (0.026 + index * 0.005) + index * 0.28) % 1;
      const x = -50 + progress * 1440;
      const y = yAt(x, time, index + 1);
      bead.setAttribute("cx", x.toFixed(1));
      bead.setAttribute("cy", y.toFixed(1));
      bead.style.opacity = String(Math.sin(progress * Math.PI) * 0.55);
    });
  }

  draw(0);
  return { draw, svg };
}

/** Add independently pausable editorial motion without touching the audio clock. */
export function initPageMotion() {
  const root = document.documentElement;
  const hero = document.querySelector(".hero");
  if (!hero || root.dataset.pageMotion === "ready") return () => {};

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const artwork =
    hero.querySelector(".hero-flow-art") || document.createElement("div");
  artwork.classList.add("hero-flow-art");
  artwork.setAttribute("aria-hidden", "true");
  if (!artwork.isConnected) hero.prepend(artwork);
  const flow = createFlowArtwork(artwork);

  const paper = document.querySelector("#practice");
  const meterHost = paper?.querySelector(".paper-topline > span:first-child");
  const meter = document.createElement("span");
  meter.className = "music-meter";
  meter.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 5; index += 1) {
    const bar = document.createElement("i");
    bar.style.setProperty("--bar-index", String(index));
    meter.append(bar);
  }
  meterHost?.append(meter);

  const reveals = Array.from(
    document.querySelectorAll(
      ".scan-section .section-heading, .workflow-label, .workflow-steps, .comparison-desk, .real-entry, .arrange-section .section-heading, .arrange-workspace, .closing",
    ),
  );
  reveals.forEach((element, index) => {
    element.classList.add("motion-reveal");
    if (element.classList.contains("section-heading"))
      element.classList.add("motion-copy");
    element.style.setProperty(
      "--reveal-delay",
      `${Math.min(index % 3, 2) * 65}ms`,
    );
    if (
      reducedMotion.matches ||
      element.getBoundingClientRect().top < window.innerHeight * 0.94
    ) {
      element.classList.add("motion-visible");
    }
  });

  const revealObserver =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              entry.target.classList.add("motion-visible");
              revealObserver.unobserve(entry.target);
            }
          },
          { threshold: 0.06, rootMargin: "0px 0px -24px 0px" },
        )
      : null;
  for (const element of reveals) {
    if (!revealObserver) element.classList.add("motion-visible");
    else if (!element.classList.contains("motion-visible"))
      revealObserver.observe(element);
  }

  let visible = true;
  let frame = 0;
  let lastDraw = 0;
  let elapsed = 0;
  let lastTime = 0;
  let disposed = false;
  let musicPlaying = paper?.classList.contains("is-playing") || false;

  function animate(timestamp) {
    frame = 0;
    if (disposed || reducedMotion.matches || document.hidden || !visible)
      return;
    if (lastTime)
      elapsed += Math.min(timestamp - lastTime, 70) * (musicPlaying ? 1.3 : 1);
    lastTime = timestamp;
    // The flowing staff is intentionally inexpensive and independent of note RAFs.
    if (timestamp - lastDraw >= 1000 / 30) {
      flow.draw(elapsed / 1000);
      lastDraw = timestamp;
    }
    frame = requestAnimationFrame(animate);
  }

  function syncMotion() {
    root.classList.toggle("motion-paused", document.hidden);
    if (reducedMotion.matches) {
      for (const element of reveals) element.classList.add("motion-visible");
      root.classList.add("motion-settled");
    }
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    if (!disposed && !document.hidden && visible && !reducedMotion.matches) {
      frame = requestAnimationFrame(animate);
    }
  }

  const heroObserver =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            visible = entries[0]?.isIntersecting ?? true;
            syncMotion();
          },
          { rootMargin: "80px" },
        )
      : null;
  heroObserver?.observe(hero);

  const playingObserver = paper
    ? new MutationObserver(() => {
        musicPlaying = paper.classList.contains("is-playing");
        hero.classList.toggle("is-music-playing", musicPlaying);
      })
    : null;
  if (paper)
    playingObserver?.observe(paper, {
      attributes: true,
      attributeFilter: ["class"],
    });

  function revealFocused(event) {
    event.target.closest?.(".motion-reveal")?.classList.add("motion-visible");
  }

  document.addEventListener("focusin", revealFocused);
  document.addEventListener("visibilitychange", syncMotion);
  reducedMotion.addEventListener("change", syncMotion);
  root.classList.add("motion-ready");
  root.dataset.pageMotion = "ready";
  let secondIntroFrame = 0;
  const firstIntroFrame = requestAnimationFrame(() => {
    secondIntroFrame = requestAnimationFrame(() => {
      if (!disposed) root.classList.add("motion-entered");
    });
  });
  const settleTimer = window.setTimeout(
    () => root.classList.add("motion-settled"),
    1400,
  );
  syncMotion();

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    cancelAnimationFrame(firstIntroFrame);
    cancelAnimationFrame(secondIntroFrame);
    window.clearTimeout(settleTimer);
    revealObserver?.disconnect();
    heroObserver?.disconnect();
    playingObserver?.disconnect();
    document.removeEventListener("focusin", revealFocused);
    document.removeEventListener("visibilitychange", syncMotion);
    reducedMotion.removeEventListener("change", syncMotion);
    root.classList.remove(
      "motion-ready",
      "motion-entered",
      "motion-settled",
      "motion-paused",
    );
    delete root.dataset.pageMotion;
    for (const element of reveals)
      element.classList.remove(
        "motion-reveal",
        "motion-copy",
        "motion-visible",
      );
    meter.remove();
    flow.svg.remove();
  };
}
