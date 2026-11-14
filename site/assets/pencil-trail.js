/*
 * Two pigments in moving water. Original, dependency-free implementation of
 * semi-Lagrangian advection, pressure projection and vorticity confinement.
 * The canvas is decoration: it never captures, cancels or replaces an input.
 * Public name retained for the homepage's existing initialization contract.
 */
let activeCleanup;

const TAIL_MS = 5500;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * .5 + .5;
  gl_Position = vec4(aPosition, 0., 1.);
}`;

const FRAGMENT_HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
`;

const FLUID_SHADERS = {
  advect: `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uVelocityTexel;
uniform float uDt;
uniform float uDissipation;
void main() {
  vec2 previous = vUv - uDt * texture(uVelocity, vUv).xy * uVelocityTexel;
  outColor = texture(uSource, previous) * exp(-uDissipation * uDt);
}`,
  splat: `
uniform sampler2D uSource;
uniform vec2 uPoint;
uniform vec2 uImpulse;
uniform vec2 uNormal;
uniform float uAspect;
uniform float uRadius;
uniform float uSpin;
uniform float uAmount;
uniform float uPigment;
void main() {
  vec2 p = (vUv - uPoint) * vec2(uAspect, 1.);
  float spot = exp(-dot(p, p) / (uRadius * uRadius));
  vec4 base = texture(uSource, vUv);
  if (uPigment < .5) {
    vec2 tangent = vec2(-p.y / uAspect, p.x) / uRadius;
    vec2 force = uImpulse + tangent * uSpin;
    outColor = vec4(clamp(base.xy + force * spot, -320., 320.), 0., 1.);
  } else {
    // Copper enters along one bank of the green stream; advection folds both
    // pigments into veins as the water turns over.
    float bank = smoothstep(-.18, .8, dot(p, uNormal) / uRadius);
    vec2 pigment = mix(vec2(1., .035), vec2(.16, .84), bank);
    outColor = vec4(min(base.xy + pigment * spot * uAmount, vec2(18.)), 0., 1.);
  }
}`,
  curl: `
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float left = texture(uVelocity, vUv - vec2(uTexel.x, 0.)).y;
  float right = texture(uVelocity, vUv + vec2(uTexel.x, 0.)).y;
  float bottom = texture(uVelocity, vUv - vec2(0., uTexel.y)).x;
  float top = texture(uVelocity, vUv + vec2(0., uTexel.y)).x;
  outColor = vec4(.5 * (right - left - top + bottom), 0., 0., 1.);
}`,
  vorticity: `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uDt;
void main() {
  float left = texture(uCurl, vUv - vec2(uTexel.x, 0.)).x;
  float right = texture(uCurl, vUv + vec2(uTexel.x, 0.)).x;
  float bottom = texture(uCurl, vUv - vec2(0., uTexel.y)).x;
  float top = texture(uCurl, vUv + vec2(0., uTexel.y)).x;
  float center = texture(uCurl, vUv).x;
  vec2 force = .5 * vec2(abs(top) - abs(bottom), abs(left) - abs(right));
  force /= length(force) + .0001;
  force *= 15. * center;
  vec2 velocity = texture(uVelocity, vUv).xy + force * uDt;
  outColor = vec4(clamp(velocity, -320., 320.), 0., 1.);
}`,
  divergence: `
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  vec2 center = texture(uVelocity, vUv).xy;
  float left = texture(uVelocity, vUv - vec2(uTexel.x, 0.)).x;
  float right = texture(uVelocity, vUv + vec2(uTexel.x, 0.)).x;
  float bottom = texture(uVelocity, vUv - vec2(0., uTexel.y)).y;
  float top = texture(uVelocity, vUv + vec2(0., uTexel.y)).y;
  if (vUv.x < uTexel.x) left = -center.x;
  if (vUv.x > 1. - uTexel.x) right = -center.x;
  if (vUv.y < uTexel.y) bottom = -center.y;
  if (vUv.y > 1. - uTexel.y) top = -center.y;
  outColor = vec4(.5 * (right - left + top - bottom), 0., 0., 1.);
}`,
  damp: `
uniform sampler2D uSource;
void main() { outColor = texture(uSource, vUv) * .72; }
`,
  pressure: `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
void main() {
  float left = texture(uPressure, vUv - vec2(uTexel.x, 0.)).x;
  float right = texture(uPressure, vUv + vec2(uTexel.x, 0.)).x;
  float bottom = texture(uPressure, vUv - vec2(0., uTexel.y)).x;
  float top = texture(uPressure, vUv + vec2(0., uTexel.y)).x;
  float divergence = texture(uDivergence, vUv).x;
  outColor = vec4((left + right + bottom + top - divergence) * .25, 0., 0., 1.);
}`,
  project: `
uniform sampler2D uVelocity;
uniform sampler2D uPressure;
uniform vec2 uTexel;
void main() {
  float left = texture(uPressure, vUv - vec2(uTexel.x, 0.)).x;
  float right = texture(uPressure, vUv + vec2(uTexel.x, 0.)).x;
  float bottom = texture(uPressure, vUv - vec2(0., uTexel.y)).x;
  float top = texture(uPressure, vUv + vec2(0., uTexel.y)).x;
  vec2 velocity = texture(uVelocity, vUv).xy - .5 * vec2(right - left, top - bottom);
  if (vUv.x < uTexel.x || vUv.x > 1. - uTexel.x) velocity.x = 0.;
  if (vUv.y < uTexel.y || vUv.y > 1. - uTexel.y) velocity.y = 0.;
  outColor = vec4(velocity, 0., 1.);
}`,
  display: `
uniform sampler2D uDye;
uniform vec2 uTexel;
uniform float uFade;
void main() {
  vec2 dye = max(texture(uDye, vUv).xy, vec2(0.));
  float density = dye.x + dye.y;
  float copper = dye.y / (density + .0001);
  vec3 color = mix(vec3(.115, .30, .225), vec3(.64, .365, .225), copper);
  vec2 nextDye = texture(uDye, vUv + uTexel).xy;
  float edge = clamp(abs(density - nextDye.x - nextDye.y) * 2.5, 0., 1.);
  color += vec3(.22, .18, .11) * edge * .5;
  float alpha = .59 * (1. - exp(-density * .68));
  alpha *= smoothstep(.015, .09, density) * uFade;
  // The browser compositor expects premultiplied RGB for this WebGL surface.
  outColor = vec4(color * alpha, alpha);
}`,
};

function createFluidRenderer(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "low-power",
  });
  if (!gl) throw new Error("webgl-unavailable");
  const targets = new Set();
  const programs = new Map();
  const shaders = new Set();
  let buffer;
  let vao;
  let velocity;
  let dye;
  let pressure;
  let curl;
  let divergence;
  let width = 1;
  let height = 1;
  let simWidth = 1;
  let simHeight = 1;
  let dyeWidth = 1;
  let dyeHeight = 1;
  const lowPower = (navigator.hardwareConcurrency || 4) <= 4;
  const simSize = lowPower ? 96 : 128;
  const dyeSize = lowPower ? 320 : 480;
  const pressureIterations = lowPower ? 10 : 14;

  function destroyTargets() {
    for (const target of targets) {
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.framebuffer);
    }
    targets.clear();
  }

  function dispose() {
    destroyTargets();
    for (const { program } of programs.values()) gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
    programs.clear();
    shaders.clear();
    if (buffer) gl.deleteBuffer(buffer);
    if (vao) gl.deleteVertexArray(vao);
  }

  function compile(type, source) {
    const shader = gl.createShader(type);
    shaders.add(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`ink-shader: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }

  function target(w, h) {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    const result = { texture, framebuffer, width: w, height: h };
    targets.add(result);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      w,
      h,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("float-framebuffer-unavailable");
    }
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return result;
  }

  function pair(w, h) {
    return {
      read: target(w, h),
      write: target(w, h),
      swap() {
        [this.read, this.write] = [this.write, this.read];
      },
    };
  }

  function pass(name, destination, uniforms) {
    const entry = programs.get(name);
    gl.useProgram(entry.program);
    gl.bindVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination?.framebuffer || null);
    gl.viewport(
      0,
      0,
      destination?.width || canvas.width,
      destination?.height || canvas.height,
    );
    let unit = 0;
    for (const [name, value] of Object.entries(uniforms)) {
      if (!entry.uniforms.has(name)) {
        entry.uniforms.set(name, gl.getUniformLocation(entry.program, name));
      }
      const location = entry.uniforms.get(name);
      if (location === null) continue;
      if (value?.texture) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, value.texture);
        gl.uniform1i(location, unit++);
      } else if (Array.isArray(value)) gl.uniform2fv(location, value);
      else gl.uniform1f(location, value);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function clear() {
    gl.clearColor(0, 0, 0, 0);
    for (const target of targets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function resize(w, h, pixelWidth, pixelHeight) {
    width = w;
    height = h;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const aspect = width / height;
    const dimension = (size) =>
      aspect >= 1
        ? [Math.round(size * Math.min(aspect, 3)), size]
        : [size, Math.round(size / Math.max(aspect, 1 / 3))];
    [simWidth, simHeight] = dimension(simSize);
    [dyeWidth, dyeHeight] = dimension(dyeSize);
    destroyTargets();
    velocity = pair(simWidth, simHeight);
    pressure = pair(simWidth, simHeight);
    dye = pair(dyeWidth, dyeHeight);
    curl = target(simWidth, simHeight);
    divergence = target(simWidth, simHeight);
    clear();
  }

  function splat(point) {
    const length = Math.hypot(point.dx, point.dy) || 1;
    const uniforms = {
      uPoint: [point.x / width, 1 - point.y / height],
      uImpulse: [
        clamp((point.dx / width) * simWidth * 14, -240, 240),
        clamp((-point.dy / height) * simHeight * 14, -240, 240),
      ],
      uNormal: [point.dy / length, point.dx / length],
      uAspect: width / height,
      uRadius: point.radius / height,
      uSpin: point.spin,
      uAmount: point.amount,
    };
    pass("splat", velocity.write, {
      ...uniforms,
      uSource: velocity.read,
      uPigment: 0,
    });
    velocity.swap();
    pass("splat", dye.write, { ...uniforms, uSource: dye.read, uPigment: 1 });
    dye.swap();
  }

  function step(dt, fade, points) {
    const texel = [1 / simWidth, 1 / simHeight];
    pass("advect", velocity.write, {
      uVelocity: velocity.read,
      uSource: velocity.read,
      uVelocityTexel: texel,
      uDt: dt,
      uDissipation: 0.34,
    });
    velocity.swap();
    for (const point of points) splat(point);
    pass("curl", curl, { uVelocity: velocity.read, uTexel: texel });
    pass("vorticity", velocity.write, {
      uVelocity: velocity.read,
      uCurl: curl,
      uTexel: texel,
      uDt: dt,
    });
    velocity.swap();
    pass("divergence", divergence, { uVelocity: velocity.read, uTexel: texel });
    pass("damp", pressure.write, { uSource: pressure.read });
    pressure.swap();
    for (let i = 0; i < pressureIterations; i++) {
      pass("pressure", pressure.write, {
        uPressure: pressure.read,
        uDivergence: divergence,
        uTexel: texel,
      });
      pressure.swap();
    }
    pass("project", velocity.write, {
      uVelocity: velocity.read,
      uPressure: pressure.read,
      uTexel: texel,
    });
    velocity.swap();
    pass("advect", dye.write, {
      uVelocity: velocity.read,
      uSource: dye.read,
      uVelocityTexel: texel,
      uDt: dt,
      uDissipation: 0.67,
    });
    dye.swap();
    pass("display", null, {
      uDye: dye.read,
      uTexel: [1 / dyeWidth, 1 / dyeHeight],
      uFade: fade,
    });
  }

  try {
    if (!gl.getExtension("EXT_color_buffer_float"))
      throw new Error("float-buffer-unavailable");
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    for (const [name, source] of Object.entries(FLUID_SHADERS)) {
      const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_HEADER + source);
      const program = gl.createProgram();
      programs.set(name, { program, uniforms: new Map() });
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`ink-program: ${gl.getProgramInfoLog(program)}`);
      }
    }
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  } catch (error) {
    dispose();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    throw error;
  }
  return { kind: "webgl2", resize, step, clear, dispose };
}

/* On devices without float framebuffers, flowing ribbons follow a smooth curl
 * field. This is intentionally a full-size ink treatment, not a dot cursor. */
function createCanvasRenderer(canvas) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return null;
  let width = 1;
  let height = 1;
  let time = 0;
  let serial = 0;
  let ribbons = [];

  function clear() {
    ribbons = [];
    context.clearRect(0, 0, width, height);
  }

  function seed(point) {
    const length = Math.hypot(point.dx, point.dy) || 1;
    for (let bank = -1; bank <= 1; bank++) {
      const offset = bank * point.radius * 0.34;
      const x = point.x - (point.dy / length) * offset;
      const y = point.y + (point.dx / length) * offset;
      ribbons.push({
        x,
        y,
        vx: point.dx * 5 + point.spin * bank * 0.8,
        vy: point.dy * 5 - point.spin * 0.5,
        age: 0,
        life: 3.3 + (serial % 4) * 0.15,
        radius: point.radius * (bank === 0 ? 0.52 : 0.35),
        opacity: point.amount * 0.17,
        phase: ++serial * 2.39996,
        copper: bank === 1,
        points: [{ x, y }],
      });
    }
    if (ribbons.length > 120) ribbons.splice(0, ribbons.length - 120);
  }

  function drawRibbon(ribbon, fade) {
    const points = ribbon.points;
    const remain = Math.max(0, 1 - ribbon.age / ribbon.life);
    const alpha = ribbon.opacity * Math.pow(remain, 0.8) * fade;
    if (points.length < 2 || alpha < 0.002) return;
    const left = [];
    const right = [];
    for (let i = 0; i < points.length; i++) {
      const previous = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const length = Math.hypot(dx, dy) || 1;
      const progress = i / (points.length - 1);
      const spread =
        ribbon.radius *
        Math.sin(Math.PI * (0.08 + progress * 0.84)) *
        (1 + ribbon.age * 0.16);
      left.push({
        x: points[i].x - (dy / length) * spread,
        y: points[i].y + (dx / length) * spread,
      });
      right.push({
        x: points[i].x + (dy / length) * spread,
        y: points[i].y - (dx / length) * spread,
      });
    }
    const outline = left.concat(right.reverse());
    context.beginPath();
    context.moveTo(
      (outline[0].x + outline.at(-1).x) / 2,
      (outline[0].y + outline.at(-1).y) / 2,
    );
    for (let i = 0; i < outline.length; i++) {
      const next = outline[(i + 1) % outline.length];
      context.quadraticCurveTo(
        outline[i].x,
        outline[i].y,
        (outline[i].x + next.x) / 2,
        (outline[i].y + next.y) / 2,
      );
    }
    context.closePath();
    const head = points.at(-1);
    const start = points[0];
    const gradient = context.createLinearGradient(
      start.x,
      start.y,
      head.x + 0.01,
      head.y + 0.01,
    );
    const rgb = ribbon.copper ? "164,99,66" : "35,79,62";
    gradient.addColorStop(0, `rgba(${rgb},0)`);
    gradient.addColorStop(0.35, `rgba(${rgb},${alpha * 0.7})`);
    gradient.addColorStop(0.8, `rgba(${rgb},${alpha})`);
    gradient.addColorStop(1, `rgba(${rgb},${alpha * 0.35})`);
    context.fillStyle = gradient;
    context.fill();
  }

  function step(dt, fade, points) {
    time += dt;
    for (const point of points) seed(point);
    context.clearRect(0, 0, width, height);
    ribbons = ribbons.filter((ribbon) => ribbon.age < ribbon.life);
    for (const ribbon of ribbons) {
      ribbon.age += dt;
      // Analytic derivatives of a smooth potential form a divergence-free
      // curl field: each plume can turn without collapsing onto one point.
      const a = ribbon.x * 0.009 + time * 0.4;
      const b = ribbon.y * 0.009 - time * 0.3;
      const c = ribbon.x * 0.014 + ribbon.y * 0.011 + time * 0.55;
      const vx = 72 * Math.sin(a) * Math.cos(b) + 34 * Math.cos(c);
      const vy = -72 * Math.cos(a) * Math.sin(b) - 44 * Math.cos(c);
      const turn = Math.sin(ribbon.age * 2.4 + ribbon.phase) * 25;
      const ease = 1 - Math.exp(-dt * 1.8);
      ribbon.vx += (vx + turn - ribbon.vx) * ease;
      ribbon.vy += (vy - turn - ribbon.vy) * ease;
      ribbon.x += ribbon.vx * dt;
      ribbon.y += ribbon.vy * dt;
      ribbon.points.push({ x: ribbon.x, y: ribbon.y });
      if (ribbon.points.length > 42) ribbon.points.shift();
      drawRibbon(ribbon, fade);
    }
  }

  return {
    kind: "canvas2d",
    resize(w, h, pixelWidth, pixelHeight) {
      width = w;
      height = h;
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      context.setTransform(
        pixelWidth / width,
        0,
        0,
        pixelHeight / height,
        0,
        0,
      );
      clear();
    },
    clear,
    step,
    dispose: clear,
  };
}

export function initPencilTrail() {
  activeCleanup?.();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(any-pointer: fine)");
  const lowPower = (navigator.hardwareConcurrency || 4) <= 4;
  const removers = [];
  let canvas;
  let renderer;
  let width = 1;
  let height = 1;
  let frame = 0;
  let lastFrame = 0;
  let lastInput = 0;
  let enabled = false;
  let disposed = false;
  let previous = null;
  let points = [];
  let serial = 0;

  function makeCanvas() {
    const element = document.createElement("canvas");
    element.className = "pencil-trail ink-flow";
    element.setAttribute("aria-hidden", "true");
    element.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:10;contain:strict;mix-blend-mode:multiply;";
    element.dataset.inkState = "idle";
    element.hidden = !enabled;
    document.body.append(element);
    return element;
  }

  function listen(target, event, handler) {
    target.addEventListener(event, handler, { passive: true });
    removers.push(() => target.removeEventListener(event, handler));
  }

  function setState(state) {
    if (canvas.dataset.inkState !== state) canvas.dataset.inkState = state;
  }

  function clear() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    points = [];
    previous = null;
    renderer?.clear();
    setState(enabled ? "idle" : "disabled");
  }

  function useFallback(reason) {
    renderer?.dispose();
    renderer = null;
    const old = canvas;
    canvas = makeCanvas();
    old.remove();
    renderer = createCanvasRenderer(canvas);
    canvas.dataset.renderer = renderer?.kind || "unavailable";
    canvas.dataset.fallbackReason = reason;
    if (!renderer) canvas.hidden = true;
  }

  function initializeRenderer() {
    if (renderer || disposed) return;
    try {
      renderer = createFluidRenderer(canvas);
      canvas.dataset.renderer = renderer.kind;
      const surface = canvas;
      const onLost = (event) => {
        event.preventDefault();
        if (disposed || canvas !== surface) return;
        clear();
        useFallback("context-lost");
        resize();
      };
      surface.addEventListener("webglcontextlost", onLost);
      removers.push(() =>
        surface.removeEventListener("webglcontextlost", onLost),
      );
    } catch (error) {
      useFallback(
        error.message.startsWith("ink-") ? "shader-unavailable" : error.message,
      );
    }
  }

  function resize() {
    clear();
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    // Keep the same fluid field, but spend fewer display pixels on modest CPUs
    // and software GPUs. Text and the musical score retain their native DPI.
    const pixelBudget = lowPower ? 800000 : 1800000;
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      lowPower ? 1 : 1.25,
      Math.sqrt(pixelBudget / (width * height)),
    );
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (!renderer) return;
    try {
      renderer.resize(
        width,
        height,
        Math.max(1, Math.round(width * ratio)),
        Math.max(1, Math.round(height * ratio)),
      );
    } catch (error) {
      useFallback("framebuffer-unavailable");
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      renderer?.resize(
        width,
        height,
        Math.max(1, Math.round(width * ratio)),
        Math.max(1, Math.round(height * ratio)),
      );
    }
  }

  function updateAvailability() {
    enabled = !reducedMotion.matches && finePointer.matches && !document.hidden;
    if (enabled && !renderer) {
      initializeRenderer();
      resize();
    }
    canvas.hidden = !enabled || !renderer;
    clear();
  }

  function suitable(event) {
    return (
      enabled &&
      renderer &&
      !disposed &&
      (event.pointerType === "mouse" || event.pointerType === "pen")
    );
  }

  function addPoint(event, down = false) {
    if (!suitable(event)) return;
    const now = performance.now();
    const next = {
      x: event.clientX,
      y: event.clientY,
      time: now,
      pointerId: event.pointerId,
    };
    if (next.x < 0 || next.x > width || next.y < 0 || next.y > height) {
      previous = null;
      return;
    }
    if (
      previous &&
      (previous.pointerId !== next.pointerId || now - previous.time > 260)
    )
      previous = null;
    const dx = previous ? next.x - previous.x : 0;
    const dy = previous ? next.y - previous.y : 0;
    const distance = Math.hypot(dx, dy);
    if (distance > 280) {
      previous = next;
      return;
    }
    if (!down && previous && distance < 1.5) return;
    const speed = Math.min(
      4,
      distance / Math.max(8, previous ? now - previous.time : 16),
    );
    const pressed = down || Boolean(event.buttons & 1);
    const pressure = pressed ? Math.max(0.4, event.pressure || 0.5) : 0;
    const count = Math.max(1, Math.min(5, Math.ceil(distance / 24)));
    const start = previous || next;
    const turn =
      previous?.dx !== undefined ? previous.dx * dy - previous.dy * dx : 0;
    const spin =
      (turn ? Math.sign(turn) : Math.sin(++serial * 1.618) >= 0 ? 1 : -1) *
      (20 + speed * 11 + pressure * 20);
    for (let i = 1; i <= count; i++) {
      points.push({
        x: start.x + (dx * i) / count,
        y: start.y + (dy * i) / count,
        dx: dx / count,
        dy: dy / count,
        radius: 34 + speed * 8 + pressure * 24,
        amount: (0.58 + speed * 0.12 + pressure * 0.7) / Math.sqrt(count),
        spin,
      });
    }
    if (points.length > 16) points.splice(0, points.length - 16);
    previous = { ...next, dx, dy };
    lastInput = now;
    setState("flowing");
    if (!frame) frame = requestAnimationFrame(paint);
  }

  function paint(now) {
    frame = 0;
    if (!enabled || disposed || !renderer) return;
    const elapsed = now - lastInput;
    if (elapsed >= TAIL_MS) {
      clear();
      return;
    }
    const dt = lastFrame
      ? clamp((now - lastFrame) / 1000, 1 / 120, 1 / 30)
      : 1 / 60;
    lastFrame = now;
    const fade = 1 - clamp((elapsed - 3000) / (TAIL_MS - 3000), 0, 1);
    // A bounded queue keeps fast pointers from monopolizing slower GPUs.
    const batch = points.splice(0, 8);
    renderer.step(dt, fade, batch);
    frame = requestAnimationFrame(paint);
  }

  canvas = makeCanvas();
  listen(window, "pointermove", (event) => addPoint(event));
  listen(window, "pointerdown", (event) => addPoint(event, true));
  listen(window, "pointercancel", () => {
    previous = null;
  });
  listen(window, "pointerout", (event) => {
    if (event.relatedTarget === null) previous = null;
  });
  listen(window, "blur", clear);
  listen(window, "resize", resize);
  listen(document, "visibilitychange", updateAvailability);
  for (const query of [reducedMotion, finePointer]) {
    if (query.addEventListener) listen(query, "change", updateAvailability);
    else {
      query.addListener(updateAvailability);
      removers.push(() => query.removeListener(updateAvailability));
    }
  }
  updateAvailability();

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    enabled = false;
    clear();
    for (const remove of removers) remove();
    renderer?.dispose();
    canvas.remove();
    if (activeCleanup === cleanup) activeCleanup = undefined;
  };
  activeCleanup = cleanup;
  return cleanup;
}
