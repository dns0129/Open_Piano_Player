/* A brief pencil trace on the paper. Decoration only: no input is captured. */
let activeCleanup;

export function initPencilTrail() {
  activeCleanup?.();
  const canvas = document.createElement("canvas");
  canvas.className = "pencil-trail";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:10;contain:strict;mix-blend-mode:multiply;";
  document.body.append(canvas);
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    canvas.remove();
    return () => {};
  }

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(any-pointer: fine)");
  const removers = [];
  let width = 0;
  let height = 0;
  let frame = 0;
  let enabled = false;
  let disposed = false;
  let pressed = false;
  let previous = null;
  let segments = [];
  let serial = 0;

  function listen(target, event, handler) {
    target.addEventListener(event, handler, { passive: true });
    removers.push(() => target.removeEventListener(event, handler));
  }

  function watch(query) {
    if (query.addEventListener) listen(query, "change", updateAvailability);
    else {
      query.addListener(updateAvailability);
      removers.push(() => query.removeListener(updateAvailability));
    }
  }

  function clear() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    segments = [];
    previous = null;
    pressed = false;
    context.clearRect(0, 0, width, height);
  }

  function resize() {
    clear();
    width = window.innerWidth;
    height = window.innerHeight;
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
  }

  function updateAvailability() {
    enabled = !reducedMotion.matches && finePointer.matches && !document.hidden;
    canvas.hidden = !enabled;
    clear();
  }

  function suitable(event) {
    return (
      enabled &&
      !disposed &&
      (event.pointerType === "mouse" || event.pointerType === "pen")
    );
  }

  function addPoint(event, now, pointerId) {
    const point = { x: event.clientX, y: event.clientY, time: now, pointerId };
    if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) {
      previous = null;
      return;
    }
    if (
      !previous ||
      previous.pointerId !== pointerId ||
      now - previous.time > 140
    ) {
      previous = point;
      return;
    }
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1.5) return;
    // A pointer entering the window or a trackpad warp should not draw a slash
    // across the whole page. Ordinary fast strokes still spread slightly.
    if (distance > 200) {
      previous = point;
      return;
    }
    const speed = Math.min(3, distance / Math.max(8, now - previous.time));
    const nx = -dy / distance;
    const ny = dx / distance;
    const wobble = Math.sin(++serial * 2.39996) * (0.3 + speed * 0.45);
    const pressure = pressed
      ? Math.max(0.35, Math.min(1, event.pressure || 0.5))
      : 0;
    segments.push({
      ax: previous.x,
      ay: previous.y,
      bx: point.x,
      by: point.y,
      cx: (previous.x + point.x) / 2 + nx * wobble,
      cy: (previous.y + point.y) / 2 + ny * wobble,
      nx,
      ny,
      dx: dx / distance,
      dy: dy / distance,
      distance,
      speed,
      born: now,
      life: pressed ? 1050 : 760,
      width: 0.85 + Math.min(0.7, speed * 0.17) + pressure * 0.8,
      opacity: 0.16 + pressure * 0.22,
      copper: serial % 3 === 0,
      grain: serial % 2 === 0 && speed > 0.7,
      drift: Math.sin(serial * 1.717) * (2 + speed * 1.1),
    });
    if (segments.length > 240) segments.splice(0, segments.length - 240);
    previous = point;
  }

  function move(event) {
    if (!suitable(event)) return;
    // Reading buttons on every move also handles release outside the window;
    // no pointer capture or cancellation of the target's action is necessary.
    pressed = Boolean(event.buttons & 1);
    const now = performance.now();
    const samples = event.getCoalescedEvents?.() || [];
    if (samples.length) {
      for (const sample of samples) addPoint(sample, now, event.pointerId);
    } else addPoint(event, now, event.pointerId);
    if (!frame && segments.length) frame = requestAnimationFrame(paint);
  }

  function paint(now) {
    frame = 0;
    context.clearRect(0, 0, width, height);
    if (!enabled || disposed) return;
    segments = segments.filter((segment) => now - segment.born < segment.life);
    for (const segment of segments) {
      const remaining = Math.max(0, 1 - (now - segment.born) / segment.life);
      const fade = remaining * remaining;
      context.strokeStyle = "#234F3E";
      context.globalAlpha = segment.opacity * fade;
      context.lineWidth = segment.width;
      context.beginPath();
      context.moveTo(segment.ax, segment.ay);
      context.quadraticCurveTo(segment.cx, segment.cy, segment.bx, segment.by);
      context.stroke();

      if (segment.copper) {
        const length = Math.min(10, segment.distance * 0.55);
        const x = segment.cx + segment.nx * 1.6;
        const y = segment.cy + segment.ny * 1.6;
        context.strokeStyle = "#A4735E";
        context.globalAlpha = segment.opacity * 0.8 * fade;
        context.lineWidth = 0.65;
        context.beginPath();
        context.moveTo(
          x - (segment.dx * length) / 2,
          y - (segment.dy * length) / 2,
        );
        context.lineTo(
          x + (segment.dx * length) / 2,
          y + (segment.dy * length) / 2,
        );
        context.stroke();
      }

      if (segment.grain) {
        const x = segment.cx + segment.nx * segment.drift;
        const y = segment.cy + segment.ny * segment.drift;
        context.strokeStyle = "#1F2A22";
        context.globalAlpha = segment.opacity * 0.35 * fade;
        context.lineWidth = 0.45;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + segment.dx * 2.6, y + segment.dy * 2.6);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
    // No animation runs after the final mark has faded.
    if (segments.length) frame = requestAnimationFrame(paint);
  }

  function release() {
    pressed = false;
  }

  function leave(event) {
    if (event.relatedTarget === null) {
      release();
      previous = null;
    }
  }

  listen(window, "pointermove", move);
  listen(window, "pointerdown", (event) => {
    if (suitable(event)) pressed = Boolean(event.buttons & 1);
  });
  listen(window, "pointerup", release);
  listen(window, "pointercancel", () => {
    release();
    previous = null;
  });
  listen(window, "pointerout", leave);
  listen(window, "blur", clear);
  listen(window, "resize", resize);
  listen(document, "visibilitychange", updateAvailability);
  watch(reducedMotion);
  watch(finePointer);
  resize();
  updateAvailability();

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    clear();
    for (const remove of removers) remove();
    canvas.remove();
    if (activeCleanup === cleanup) activeCleanup = undefined;
  };
  activeCleanup = cleanup;
  return cleanup;
}
