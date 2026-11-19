/* 琴伴 promo site: red-pencil marks shared by the homepage and the guide. */
window.Paper = (() => {
  "use strict";

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SVGNS = "http://www.w3.org/2000/svg";
  const f1 = (v) => v.toFixed(1);
  // Same wobble on every visit.
  const seeded = (seed) => () =>
    (seed = (seed * 16807) % 2147483647) / 2147483647;

  // A smooth path through points (Catmull-Rom as cubic Béziers).
  function smooth(pts) {
    let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [p0, p1, p2, p3] = [
        pts[i - 1] || pts[i],
        pts[i],
        pts[i + 1],
        pts[i + 2] || pts[i + 1],
      ];
      d +=
        `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ` +
        `${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
    }
    return d;
  }
  // A loose loop drawn around a box: a bit more than one turn, opening slightly as it goes.
  function ringPath([x0, y0, x1, y1], rnd) {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = (x1 - x0) / 2 + 3;
    const ry = (y1 - y0) / 2 + 3;
    const start = -2.5 + rnd() * 0.5;
    const pts = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const a = start + t * Math.PI * 2.16;
      const k = 1.03 + 0.09 * t + (rnd() - 0.5) * 0.03;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return smooth(pts);
  }
  // A curved arrow: the shaft, then the head.
  function arrowPaths([ax, ay], [bx, by], rnd) {
    const bend = (0.16 + rnd() * 0.1) * (rnd() < 0.5 ? -1 : 1);
    const mx = (ax + bx) / 2 - (by - ay) * bend;
    const my = (ay + by) / 2 + (bx - ax) * bend;
    const ang = Math.atan2(by - my, bx - mx);
    const h = Math.min(12, Math.hypot(bx - ax, by - ay) * 0.4);
    const tip = (s) =>
      `${f1(bx - h * Math.cos(ang + s))} ${f1(by - h * Math.sin(ang + s))}`;
    return [
      `M${f1(ax)} ${f1(ay)}Q${f1(mx)} ${f1(my)} ${f1(bx)} ${f1(by)}`,
      `M${tip(0.5)}L${f1(bx)} ${f1(by)}L${tip(-0.42)}`,
    ];
  }
  // A slightly wavy underline from x0 to x1 at y.
  function underlinePath([x0, x1, y], rnd) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push([x0 + (x1 - x0) * t, y + (rnd() - 0.5) * 3 + t * 2]);
    }
    return smooth(pts);
  }

  // A layer lying exactly over the host's image (or the host itself), kept in place on resize.
  function overlay(host) {
    const target = $(":scope > img", host) || host;
    const over = document.createElement("div");
    over.className = "over";
    host.appendChild(over);
    const fit = () => {
      if (target === host) over.style.inset = "0";
      else
        Object.assign(over.style, {
          left: `${target.offsetLeft}px`,
          top: `${target.offsetTop}px`,
          width: `${target.offsetWidth}px`,
          height: `${target.offsetHeight}px`,
        });
    };
    fit();
    return { over, target, fit };
  }

  // Marks are fractions of the marked image (or element): ring = [x0, y0, x1, y1] around something,
  // under = [x0, x1, y], text = [x, y] of a note's top-left corner (top-right with right: true),
  // arrow = from → to. Values outside 0–1 sit in the margin. They are drawn in order once the
  // host scrolls into view, like a teacher going over the page.
  function annotate(host, marks, seed = 1) {
    const layer = overlay(host);
    const { over, target } = layer;
    const svg = document.createElementNS(SVGNS, "svg");
    svg.classList.add("marks");
    over.appendChild(svg);
    const path = (delay) => {
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("pathLength", "1");
      p.style.setProperty("--d", `${delay}s`);
      svg.appendChild(p);
      return p;
    };
    let delay = 0.2;
    const parts = marks.map((m) => {
      const part = { m };
      if (m.ring) {
        part.ring = path(delay);
        delay += 0.75;
      }
      if (m.under) {
        part.under = path(delay);
        delay += 0.5;
      }
      if (m.text) {
        part.text = document.createElement("span");
        part.text.className = "mark-text";
        part.text.textContent = m.text;
        if (m.right) part.text.style.right = `${(1 - m.at[0]) * 100}%`;
        else part.text.style.left = `${m.at[0] * 100}%`;
        part.text.style.top = `${m.at[1] * 100}%`;
        part.text.style.setProperty("--r", `${m.r ?? -2}deg`);
        part.text.style.setProperty("--d", `${delay}s`);
        over.appendChild(part.text);
        delay += 0.7;
      }
      if (m.arrow) {
        part.arrow = [path(delay), path(delay + 0.45)];
        delay += 0.8;
      }
      return part;
    });
    const draw = () => {
      layer.fit();
      const w = over.clientWidth || target.offsetWidth;
      const h = over.clientHeight || target.offsetHeight;
      if (!w || !h) return;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      over.style.fontSize = `${clamp(w * 0.019, 12, 22)}px`;
      const rnd = seeded(seed * 97 + 13);
      const px = ([x, y]) => [x * w, y * h];
      for (const { m, ring, under, arrow } of parts) {
        if (ring)
          ring.setAttribute(
            "d",
            ringPath([...px(m.ring), ...px(m.ring.slice(2))], rnd),
          );
        if (under)
          under.setAttribute(
            "d",
            underlinePath(
              [m.under[0] * w, m.under[1] * w, m.under[2] * h],
              rnd,
            ),
          );
        if (arrow) {
          const [shaft, head] = arrowPaths(px(m.arrow[0]), px(m.arrow[1]), rnd);
          arrow[0].setAttribute("d", shaft);
          arrow[1].setAttribute("d", head);
        }
      }
    };
    draw();
    new ResizeObserver(draw).observe(target);
    if (reduceMotion || !("IntersectionObserver" in window))
      over.classList.add("drawn");
    else {
      const io = new IntersectionObserver(
        ([e]) => {
          if (!e.isIntersecting) return;
          over.classList.add("drawn");
          io.disconnect();
        },
        { threshold: 0.45 },
      );
      io.observe(host);
    }
    return layer;
  }

  // Marks every [data-notes] element that has an entry in `marks`; returns host → layer.
  function annotateAll(marks) {
    const layers = new Map();
    $$("[data-notes]").forEach((host, i) => {
      const list = marks[host.dataset.notes];
      if (!list) return;
      try {
        layers.set(host, annotate(host, list, i + 1));
      } catch (err) {
        console.error("annotate failed", err);
      }
    });
    return layers;
  }

  return { annotate, annotateAll, overlay };
})();
