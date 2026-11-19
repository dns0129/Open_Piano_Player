// One score, three readings. The audio transport owns time; this class only
// engraves and projects that beat onto real notehead positions.
const SVG_NS = "http://www.w3.org/2000/svg";
const EPSILON = 0.00001;
const INK = "#1f2a22";
const GREEN = "#234f3e";
const COPPER = "#a4735e";
const PITCHES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
const KEYS = ["c", "c", "d", "d", "e", "f", "f", "g", "g", "a", "a", "b"];
const DEGREES = [
  "1",
  "♯1",
  "2",
  "♯2",
  "3",
  "4",
  "♯4",
  "5",
  "♯5",
  "6",
  "♯6",
  "7",
];
const SHARPS = new Set([1, 3, 6, 8, 10]);
const DURATIONS = [
  [4, "w", 0],
  [3.5, "h", 2],
  [3, "h", 1],
  [2, "h", 0],
  [1.75, "q", 2],
  [1.5, "q", 1],
  [1, "q", 0],
  [0.875, "8", 2],
  [0.75, "8", 1],
  [0.5, "8", 0],
  [0.4375, "16", 2],
  [0.375, "16", 1],
  [0.25, "16", 0],
  [0.1875, "32", 1],
  [0.125, "32", 0],
  [0.0625, "64", 0],
];
const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
const noteName = (midi) => `${PITCHES[midi % 12]}${Math.floor(midi / 12) - 1}`;
const svgNode = (name, attributes = {}, text) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
};

// Split an overlapping hand into successive sounding chords. Notes retained
// across adjacent pieces are tied by their original event ID after engraving.
// This preserves Bach's held bass notes instead of accidentally serializing them.
function segmentsFor(notes, hand, start, end) {
  const source = notes.filter(
    (note) =>
      note.hand === hand &&
      note.beat < end - EPSILON &&
      note.beat + note.duration > start + EPSILON,
  );
  const cuts = [
    ...new Set([
      start,
      end,
      ...source.flatMap((note) => [
        Math.max(start, note.beat),
        Math.min(end, note.beat + note.duration),
      ]),
    ]),
  ].sort((a, b) => a - b);
  const segments = [];
  for (let index = 0; index < cuts.length - 1; index++) {
    let beat = cuts[index];
    let remaining = cuts[index + 1] - beat;
    const active = source
      .filter(
        (note) =>
          note.beat <= beat + EPSILON &&
          note.beat + note.duration > beat + EPSILON,
      )
      .sort((a, b) => a.midi - b.midi);
    while (remaining > EPSILON) {
      const duration = DURATIONS.find(
        ([length]) => length <= remaining + EPSILON,
      );
      if (!duration) throw new Error("示例包含暂不支持的细分时值。");
      segments.push({
        beat,
        duration: duration[0],
        code: duration[1],
        dots: duration[2],
        hand,
        notes: active,
      });
      beat += duration[0];
      remaining -= duration[0];
    }
  }
  return segments;
}

export class PracticeScore {
  constructor(host, options = {}) {
    if (!host) throw new Error("PracticeScore needs a score host.");
    this.host = host;
    this.options = options;
    this.score = options.score;
    this.view = options.view || "staff";
    this.interactive = options.interactive !== false;
    this.firstMeasure = options.firstMeasure ?? this.score?.firstMeasure ?? 1;
    this.state = {
      beat: 0,
      playing: false,
      hand: "both",
      loop: null,
      activeNotes: [],
    };
    this.systems = [];
    this.marks = [];
    this.selection = null;
    this.selectedMeasureBeat = null;
    this.destroyed = false;
    this.fontReady = false;
    this.lastSystem = -1;
    this.lastLoopKey = "";
    this.timers = new Set();
    this.host.classList.add("score-surface");
    if (options.compact) this.host.classList.add("compact-score");
    if (options.fixedWidth) this.host.style.minHeight = "0";
    const loading = document.createElement("p");
    loading.className = "render-loading";
    loading.textContent = "正在铺开乐谱…";
    this.host.replaceChildren(loading);
    this.ready = Promise.resolve(document.fonts?.load('30px "Bravura"')).then(
      () => {
        if (this.destroyed) return;
        this.fontReady = true;
        this.render();
      },
    );
    if (typeof ResizeObserver !== "undefined" && !options.fixedWidth) {
      this.observer = new ResizeObserver(() => {
        const width = Math.round(this.host.clientWidth);
        if (this.fontReady && width > 0 && width !== this.measuredWidth)
          this.render();
      });
      this.observer.observe(host);
    }
  }

  setScore(score) {
    this.score = score;
    this.firstMeasure = score.firstMeasure ?? this.options.firstMeasure ?? 1;
    if (this.fontReady) this.render();
    return this;
  }

  setView(view) {
    if (!["staff", "numbered", "roll"].includes(view)) return this;
    if (view !== this.view) {
      this.view = view;
      if (this.fontReady) this.render();
    }
    return this;
  }

  render() {
    if (this.destroyed || !this.score) return;
    const VF = window.VexFlow;
    if (this.view === "staff" && !VF) {
      this.host.textContent = "乐谱组件未就绪，请刷新后重试。";
      return;
    }
    VF?.setFonts?.("Bravura", "serif");
    this.measuredWidth = Math.round(this.host.clientWidth);
    const hostWidth = Math.max(260, this.measuredWidth || 620);
    this.width =
      this.options.fixedWidth ||
      (this.options.compact ? Math.max(hostWidth, 450) : hostWidth);
    this.height = this.options.compact ? 208 : hostWidth < 540 ? 210 : 224;
    this.perSystem =
      this.options.perSystem ||
      (this.options.compact
        ? 1
        : hostWidth >= 760
          ? 4
          : hostWidth >= 540
            ? 2
            : 1);
    this.systems = [];
    this.marks = [];
    this.staffSegments = [];
    this.lastSystem = -1;
    this.lastLoopKey = "";
    const pages = document.createElement("div");
    pages.className = "score-pages";
    this.host.replaceChildren(pages);
    const totalBars = Math.ceil(this.score.beats / 4);
    for (let bar = 0; bar < totalBars; bar += this.perSystem) {
      const count = Math.min(this.perSystem, totalBars - bar);
      const element = document.createElement("div");
      element.className = "score-system";
      element.style.width = `${this.width}px`;
      element.style.height = `${this.height}px`;
      element.dataset.startBeat = String(bar * 4);
      pages.append(element);
      const system = {
        index: this.systems.length,
        element,
        width: this.width,
        startBeat: bar * 4,
        endBeat: Math.min(this.score.beats, (bar + count) * 4),
        count,
        measures: [],
        anchors: [],
      };
      this.systems.push(system);
      if (this.view === "staff") this.drawStaff(system, bar);
      else if (this.view === "numbered") this.drawNumbered(system, bar);
      else this.drawRoll(system, bar);
      system.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
      system.svg.setAttribute(
        "aria-label",
        `${this.score.title}，第 ${this.firstMeasure + bar} 至 ${this.firstMeasure + bar + count - 1} 小节，${this.view === "staff" ? "双手五线谱" : this.view === "numbered" ? "简谱" : "钢琴卷帘"}`,
      );
      system.overlay = svgNode("g", { class: "score-overlays" });
      system.svg.append(system.overlay);
      this.addMeasureLabels(system, bar);
      if (!this.options.fixedWidth) {
        system.playhead = document.createElement("div");
        system.playhead.className = "playhead";
        system.playhead.setAttribute("aria-hidden", "true");
        system.element.append(system.playhead);
      }
      // At an onset, a real notehead wins over a trailing barline anchor.
      const unique = new Map();
      for (const anchor of system.anchors.sort(
        (a, b) => a.beat - b.beat || a.priority - b.priority,
      ))
        unique.set(anchor.beat, anchor);
      system.anchors = [...unique.values()].sort((a, b) => a.beat - b.beat);
    }
    if (this.view === "staff") this.drawTies();
    this.syncHits();
    this.update(this.state);
    if (this.selectedMeasureBeat !== null) this.drawMeasureSelection(false);
  }

  drawStaff(system, firstBar) {
    const {
      Renderer,
      Stave,
      StaveNote,
      Voice,
      Formatter,
      Beam,
      StaveConnector,
      Dot,
      Accidental,
    } = window.VexFlow;
    const renderer = new Renderer(system.element, Renderer.Backends.SVG);
    renderer.resize(system.width, this.height);
    const context = renderer.getContext();
    system.context = context;
    system.svg = system.element.querySelector("svg");
    // VexFlow emits its music family as an SVG presentation attribute and its
    // glyph <text> nodes inherit that family. A normal `.score-surface svg`
    // CSS rule outranks the attribute and otherwise turns SMuFL into tofu.
    // Keep the music face explicit; labels added later still choose their own.
    system.svg.style.fontFamily = "Bravura, serif";
    const topY = this.height < 224 ? 0 : 7;
    const bassY = this.height < 224 ? 94 : 105;
    const firstExtra = firstBar === 0 ? 80 : 49;
    const barWidth = (system.width - 14 - firstExtra) / system.count;
    let x = 9;
    const highlights = svgNode("g");
    system.svg.prepend(highlights);
    for (let bar = 0; bar < system.count; bar++) {
      const start = (firstBar + bar) * 4;
      const width = barWidth + (bar === 0 ? firstExtra : 0);
      const treble = new Stave(x, topY, width);
      const bass = new Stave(x, bassY, width);
      if (bar === 0) {
        treble.addClef("treble");
        bass.addClef("bass");
        if (firstBar === 0) {
          treble.addTimeSignature("4/4");
          bass.addTimeSignature("4/4");
        }
      }
      context.setFillStyle(INK).setStrokeStyle(INK);
      treble.setContext(context).draw();
      bass.setContext(context).draw();
      if (bar === 0) {
        new StaveConnector(treble, bass)
          .setType("brace")
          .setContext(context)
          .draw();
        new StaveConnector(treble, bass)
          .setType("singleLeft")
          .setContext(context)
          .draw();
      }
      new StaveConnector(treble, bass)
        .setType("singleRight")
        .setContext(context)
        .draw();
      const handSegments = ["right", "left"].map((hand) =>
        segmentsFor(this.score.notes, hand, start, start + 4),
      );
      const tickables = handSegments.map((segments, handIndex) =>
        segments.map((segment) => {
          const keys = segment.notes.length
            ? segment.notes.map(
                (note) =>
                  `${KEYS[note.midi % 12]}/${Math.floor(note.midi / 12) - 1}`,
              )
            : [handIndex ? "d/3" : "b/4"];
          const note = new StaveNote({
            keys,
            duration: segment.code + (segment.notes.length ? "" : "r"),
            dots: segment.dots,
            clef: handIndex ? "bass" : "treble",
            autoStem: true,
          });
          note.setStyle({
            fillStyle: handIndex ? COPPER : INK,
            strokeStyle: handIndex ? COPPER : INK,
          });
          segment.notes.forEach((source, index) => {
            if (SHARPS.has(source.midi % 12))
              note.addModifier(new Accidental("#"), index);
          });
          for (let dot = 0; dot < segment.dots; dot++)
            Dot.buildAndAttach([note], { all: true });
          segment.vf = note;
          segment.context = context;
          segment.system = system;
          return note;
        }),
      );
      const voices = tickables.map((notes) =>
        new Voice({ numBeats: 4, beatValue: 4 }).addTickables(notes),
      );
      // Both staves share a formatter so simultaneous events share their x.
      new Formatter()
        .joinVoices([voices[0]])
        .joinVoices([voices[1]])
        .formatToStave(voices, treble);
      const beams = tickables.map((notes) =>
        Beam.generateBeams(notes, {
          groups: [new window.VexFlow.Fraction(1, 4)],
        }),
      );
      voices[0].draw(context, treble);
      voices[1].draw(context, bass);
      beams.forEach((handBeams, handIndex) => {
        for (const beam of handBeams) {
          const hand = handIndex ? "left" : "right";
          const color = handIndex ? COPPER : INK;
          beam.setStyle({ fillStyle: color, strokeStyle: color });
          beam.setContext(context).draw();
          const element = beam.getSVGElement();
          if (element) {
            element.classList.add("score-note", `hand-${hand}`);
            this.marks.push({
              el: element,
              ids: [],
              notes: [],
              hand,
              beat: start,
              endBeat: start + 4,
              system,
              isRest: true,
            });
          }
        }
      });
      for (const segments of handSegments) {
        for (const segment of segments) {
          const note = segment.vf;
          const noteX = (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;
          if (!Number.isFinite(noteX))
            throw new Error("Unable to measure the engraved notehead.");
          system.anchors.push({
            beat: segment.beat,
            x: noteX,
            priority: segment.notes.length
              ? segment.hand === "right"
                ? 3
                : 2
              : 1,
          });
          const group = note.getSVGElement();
          group.classList.add("score-note", `hand-${segment.hand}`);
          group.dataset.hand = segment.hand;
          // Rests must follow hand muting too, but are never audition targets.
          if (!segment.notes.length) {
            this.marks.push({
              el: group,
              ids: [],
              notes: [],
              hand: segment.hand,
              beat: segment.beat,
              endBeat: segment.beat + segment.duration,
              system,
              x: noteX,
              y: note.getYs()[0],
              isRest: true,
            });
            continue;
          }
          const ys = note.getYs();
          const y = ys.reduce((sum, value) => sum + value, 0) / ys.length;
          const mark = this.addMark({
            el: group,
            notes: segment.notes,
            hand: segment.hand,
            beat: segment.beat,
            endBeat: segment.beat + segment.duration,
            system,
            x: noteX,
            y,
            ys,
          });
          const halo = svgNode("ellipse", {
            cx: noteX,
            cy: y,
            rx: 15,
            ry: Math.max(12, (Math.max(...ys) - Math.min(...ys)) / 2 + 12),
            class: `note-halo hand-${segment.hand}`,
          });
          highlights.append(halo);
          mark.halo = halo;
          this.staffSegments.push(segment);
        }
      }
      const highlight = svgNode("rect", {
        x: x + 1,
        y: 25,
        width: width - 2,
        height: this.height - 45,
        rx: 1,
        class: "measure-highlight",
      });
      highlights.prepend(highlight);
      system.measures.push({
        beat: start,
        number: this.firstMeasure + firstBar + bar,
        x,
        width,
        highlight,
      });
      system.anchors.push({ beat: start + 4, x: x + width - 5, priority: 0 });
      x += width;
    }
    for (const glyph of system.svg.querySelectorAll("text")) {
      if (/[\uE000-\uF8FF]/u.test(glyph.textContent)) {
        glyph.style.fontFamily = "Bravura";
        glyph.classList.add("music-glyph");
      }
    }
  }

  drawTies() {
    const previous = new Map();
    for (const segment of this.staffSegments.sort((a, b) => a.beat - b.beat)) {
      segment.notes.forEach((note, index) => {
        const prior = previous.get(note.id);
        if (
          prior &&
          Math.abs(prior.segment.beat + prior.segment.duration - segment.beat) <
            EPSILON
        ) {
          const color = note.hand === "left" ? COPPER : INK;
          const draw = (context, options) => {
            const tie = new window.VexFlow.StaveTie(options);
            tie
              .setStyle({ fillStyle: color, strokeStyle: color })
              .setContext(context)
              .draw();
            const element = tie.getSVGElement();
            if (element) {
              element.classList.add("score-note", `hand-${note.hand}`);
              this.marks.push({
                el: element,
                ids: [],
                notes: [],
                hand: note.hand,
                beat: segment.beat,
                endBeat: segment.beat + segment.duration,
                isRest: true,
              });
            }
          };
          if (prior.segment.system === segment.system) {
            draw(segment.context, {
              firstNote: prior.segment.vf,
              lastNote: segment.vf,
              firstIndexes: [prior.index],
              lastIndexes: [index],
            });
          } else {
            draw(prior.segment.context, {
              firstNote: prior.segment.vf,
              lastNote: null,
              firstIndexes: [prior.index],
              lastIndexes: [prior.index],
            });
            draw(segment.context, {
              firstNote: null,
              lastNote: segment.vf,
              firstIndexes: [index],
              lastIndexes: [index],
            });
          }
        }
        previous.set(note.id, { segment, index });
      });
    }
  }

  prepareSimpleSystem(system, firstBar) {
    system.svg = svgNode("svg", { width: system.width, height: this.height });
    system.element.append(system.svg);
    const left = 43;
    const right = 14;
    const width = (system.width - left - right) / system.count;
    for (let bar = 0; bar < system.count; bar++) {
      const x = left + bar * width;
      const beat = (firstBar + bar) * 4;
      const highlight = svgNode("rect", {
        x,
        y: 29,
        width,
        height: this.height - 58,
        class: "measure-highlight",
      });
      system.svg.append(highlight);
      system.measures.push({
        x,
        width,
        beat,
        number: this.firstMeasure + firstBar + bar,
        highlight,
      });
      system.anchors.push(
        { beat, x: x + 17, priority: 0 },
        { beat: beat + 4, x: x + width - 4, priority: 0 },
      );
      system.svg.append(
        svgNode("line", {
          x1: x,
          y1: 39,
          x2: x,
          y2: this.height - 34,
          stroke: "#d6d6c8",
          "stroke-width": 1,
        }),
      );
    }
    system.svg.append(
      svgNode("line", {
        x1: system.width - right,
        y1: 39,
        x2: system.width - right,
        y2: this.height - 34,
        stroke: "#b5bcab",
        "stroke-width": 1,
      }),
    );
  }

  drawNumbered(system, firstBar) {
    this.prepareSimpleSystem(system, firstBar);
    system.svg.append(
      svgNode("text", { x: 9, y: 63, fill: GREEN, "font-size": 9 }, "右手"),
      svgNode("text", { x: 9, y: 139, fill: COPPER, "font-size": 9 }, "左手"),
    );
    if (firstBar === 0)
      system.svg.append(
        svgNode(
          "text",
          { x: 48, y: 33, fill: "#71766a", "font-size": 9 },
          "1 = C　4/4",
        ),
      );
    for (const measure of system.measures) {
      for (const hand of ["right", "left"]) {
        const groups = new Map();
        for (const note of this.score.notes.filter(
          (n) =>
            n.hand === hand &&
            n.beat >= measure.beat &&
            n.beat < measure.beat + 4,
        )) {
          if (!groups.has(note.beat)) groups.set(note.beat, []);
          groups.get(note.beat).push(note);
        }
        const span = measure.width - 32;
        for (const [beat, notes] of groups) {
          const x = measure.x + 17 + ((beat - measure.beat) / 4) * span;
          const y = hand === "right" ? 78 : 154;
          const group = svgNode("g", {
            class: `score-note hand-${hand}`,
            "data-hand": hand,
          });
          const sorted = [...notes].sort((a, b) => a.midi - b.midi);
          sorted.forEach((note, index) => {
            const noteY = y - index * 23;
            group.append(
              svgNode(
                "text",
                {
                  x,
                  y: noteY,
                  "text-anchor": "middle",
                  fill: "currentColor",
                  "font-size": 22,
                  "font-family": "Georgia, serif",
                },
                DEGREES[note.midi % 12],
              ),
            );
            const octave = Math.floor(note.midi / 12) - 5;
            for (let dot = 0; dot < Math.abs(octave); dot++)
              group.append(
                svgNode("circle", {
                  cx: x + (dot - (Math.abs(octave) - 1) / 2) * 5,
                  cy: octave > 0 ? noteY - 27 : noteY + 10,
                  r: 1.4,
                  fill: "currentColor",
                }),
              );
            const duration = DURATIONS.find(
              ([length]) => Math.abs(length - note.duration) < EPSILON,
            );
            for (let dot = 0; dot < (duration?.[2] || 0); dot++)
              group.append(
                svgNode("circle", {
                  cx: x + 13 + dot * 5,
                  cy: noteY - 4,
                  r: 1.5,
                  fill: "currentColor",
                }),
              );
            const underlines =
              note.duration < 1 ? (note.duration < 0.5 ? 2 : 1) : 0;
            for (let line = 0; line < underlines; line++)
              group.append(
                svgNode("line", {
                  x1: x - 8,
                  x2: x + 8,
                  y1: noteY + 3 + line * 4,
                  y2: noteY + 3 + line * 4,
                  stroke: "currentColor",
                  "stroke-width": 1.2,
                }),
              );
            for (
              let dash = 1;
              dash < Math.floor(note.duration + EPSILON);
              dash++
            )
              group.append(
                svgNode(
                  "text",
                  {
                    x: x + (dash / 4) * span,
                    y: noteY - 2,
                    "text-anchor": "middle",
                    fill: "currentColor",
                    "font-size": 15,
                  },
                  "—",
                ),
              );
          });
          system.svg.append(group);
          this.addMark({
            el: group,
            notes,
            hand,
            beat,
            endBeat: Math.max(...notes.map((n) => n.beat + n.duration)),
            system,
            x,
            y: y - 10 - ((notes.length - 1) * 23) / 2,
          });
          system.anchors.push({ beat, x, priority: hand === "right" ? 3 : 2 });
        }
      }
    }
  }

  drawRoll(system, firstBar) {
    this.prepareSimpleSystem(system, firstBar);
    const midis = this.score.notes.map((note) => note.midi);
    const bottom = Math.min(...midis) - 1;
    const top = Math.max(...midis) + 1;
    const yFor = (midi) =>
      42 + ((top - midi) / (top - bottom)) * (this.height - 86);
    for (let midi = bottom; midi <= top; midi++) {
      const y = yFor(midi);
      if (midi % 12 === 0) {
        system.svg.append(
          svgNode("line", {
            x1: 40,
            x2: system.width - 14,
            y1: y,
            y2: y,
            stroke: "#c9cebf",
            "stroke-width": 0.6,
          }),
          svgNode(
            "text",
            { x: 6, y: y + 3, fill: "#71766a", "font-size": 8 },
            noteName(midi),
          ),
        );
      }
    }
    const beatWidth = (system.width - 43 - 14) / (system.count * 4);
    for (const note of this.score.notes.filter(
      (n) => n.beat < system.endBeat && n.beat + n.duration > system.startBeat,
    )) {
      const beat = Math.max(note.beat, system.startBeat);
      const endBeat = Math.min(note.beat + note.duration, system.endBeat);
      const x = 43 + (beat - system.startBeat) * beatWidth;
      const y = yFor(note.midi);
      const group = svgNode("g", {
        class: `score-note hand-${note.hand}`,
        "data-hand": note.hand,
      });
      const rectangle = svgNode("rect", {
        x,
        y: y - 3.5,
        width: Math.max(3, (endBeat - beat) * beatWidth - 1),
        height: 7,
        rx: 2,
        fill: note.hand === "left" ? COPPER : GREEN,
        opacity: 0.6,
      });
      group.append(rectangle);
      system.svg.append(group);
      const mark = this.addMark({
        el: group,
        notes: [note],
        hand: note.hand,
        beat,
        endBeat,
        system,
        x,
        y,
      });
      mark.rollRectangle = rectangle;
      system.anchors.push({ beat, x, priority: note.hand === "right" ? 3 : 2 });
    }
    // The piano roll is a true proportional timeline, including its final beat.
    system.anchors.push({
      beat: system.endBeat,
      x: system.width - 14,
      priority: 4,
    });
  }

  addMark(mark) {
    mark.ids = mark.notes.map((note) => note.id);
    mark.el.dataset.noteIds = mark.ids.join(" ");
    mark.el.dataset.beat = String(mark.beat);
    mark.el.dataset.noteX = String(mark.x);
    this.marks.push(mark);
    return mark;
  }

  addMeasureLabels(system) {
    for (const measure of system.measures) {
      const x = measure.x + 14;
      const label = svgNode(
        "text",
        {
          x,
          y: 15,
          fill: "#71766a",
          "font-size": 10,
          "font-family": "Georgia, serif",
          "text-anchor": "middle",
        },
        measure.number,
      );
      system.overlay.append(label);
      if (this.interactive && this.options.onMeasure) {
        const hit = svgNode("rect", {
          x: Math.max(0, x - 22),
          y: 0,
          width: 44,
          height: 44,
          rx: 3,
          class: "note-hit measure-hit",
          role: "button",
          tabindex: 0,
          "aria-label": `跳到第 ${measure.number} 小节`,
          "data-measure": measure.number,
        });
        this.bindAction(hit, () =>
          this.options.onMeasure(measure.number, measure.beat),
        );
        system.overlay.append(hit);
      }
    }
  }

  bindAction(element, action) {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      action();
    });
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        action();
      }
    });
  }

  syncHits() {
    for (const mark of this.marks) {
      const selected = Boolean(
        this.selection && mark.ids.includes(this.selection.id),
      );
      const enabled =
        !mark.isRest && (this.interactive || selected) && this.options.onNote;
      if (enabled && !mark.hit) {
        const bar = this.firstMeasure + Math.floor(mark.notes[0].beat / 4);
        const beat = (mark.notes[0].beat % 4) + 1;
        mark.hit = svgNode("rect", {
          x: mark.x - 22,
          y: mark.y - 22,
          width: 44,
          height: 44,
          rx: 4,
          class: "note-hit",
          role: "button",
          tabindex: 0,
          "data-note-ids": mark.ids.join(" "),
          "aria-label": `${mark.hand === "left" ? "左手" : "右手"} ${mark.notes.map((note) => noteName(note.midi)).join("、")}，第 ${bar} 小节，第 ${beat} 拍，点击试听`,
        });
        this.bindAction(mark.hit, () => this.options.onNote(mark.notes));
        mark.system.overlay.append(mark.hit);
      } else if (!enabled && mark.hit) {
        mark.hit.remove();
        mark.hit = null;
      }
      if (mark.hit) {
        mark.hit.classList.toggle(
          "is-selected",
          selected && !this.selection.corrected,
        );
        mark.hit.classList.toggle(
          "is-corrected",
          selected && this.selection.corrected,
        );
        if (selected)
          mark.hit.setAttribute(
            "aria-label",
            `${this.selection.corrected ? this.options.selectionCorrectedLabel || "已校正音符" : this.options.selectionLabel || "示例疑点，点此校正"}：${mark.notes.map((note) => noteName(note.midi)).join("、")}`,
          );
      }
    }
  }

  selectNote(id, { corrected = false } = {}) {
    this.selection = id ? { id, corrected } : null;
    this.syncHits();
    return this;
  }

  selectMeasure(beat) {
    this.selectedMeasureBeat =
      Math.floor(clamp(Number(beat) || 0, 0, this.score.beats - EPSILON) / 4) *
      4;
    if (this.measureSelectionTimer) {
      clearTimeout(this.measureSelectionTimer);
      this.timers.delete(this.measureSelectionTimer);
    }
    this.drawMeasureSelection(true);
    this.measureSelectionTimer = setTimeout(() => {
      this.host
        .querySelectorAll(".measure-selection")
        .forEach((node) => node.remove());
      this.selectedMeasureBeat = null;
      this.timers.delete(this.measureSelectionTimer);
      this.measureSelectionTimer = null;
    }, 1800);
    this.timers.add(this.measureSelectionTimer);
    return this;
  }

  drawMeasureSelection(animate) {
    this.host
      .querySelectorAll(".measure-selection")
      .forEach((node) => node.remove());
    const system = this.systems.find(
      (candidate) =>
        this.selectedMeasureBeat >= candidate.startBeat &&
        this.selectedMeasureBeat < candidate.endBeat,
    );
    const measure = system?.measures.find(
      (candidate) => candidate.beat === this.selectedMeasureBeat,
    );
    if (!measure) return;
    const x1 = measure.x + 3;
    const x2 = measure.x + measure.width - 3;
    const y = this.height - 28;
    const path = svgNode("path", {
      class: "loop-mark measure-selection",
      "aria-hidden": "true",
      "data-selected-beat": this.selectedMeasureBeat,
      d: `M ${x1} ${y - 3} L ${x1} ${y} Q ${(x1 + x2) / 2} ${y + 2} ${x2} ${y} L ${x2} ${y - 3}`,
    });
    path.style.stroke = GREEN;
    path.style.animationDuration = "300ms";
    if (!animate) path.style.animation = "none";
    system.overlay.append(path);
  }

  flashNotes(ids) {
    const wanted = new Set(ids);
    const selected = this.marks.filter((mark) =>
      mark.ids.some((id) => wanted.has(id)),
    );
    selected.forEach((mark) => mark.el.classList.add("changed-flash"));
    const timer = setTimeout(() => {
      selected.forEach((mark) => mark.el.classList.remove("changed-flash"));
      this.timers.delete(timer);
    }, 1700);
    this.timers.add(timer);
    return this;
  }

  xAt(system, beat) {
    const anchors = system.anchors;
    if (!anchors.length) return 0;
    if (beat <= anchors[0].beat) return anchors[0].x;
    for (let index = 1; index < anchors.length; index++) {
      const a = anchors[index - 1],
        b = anchors[index];
      if (beat <= b.beat)
        return a.x + ((beat - a.beat) / (b.beat - a.beat)) * (b.x - a.x);
    }
    return anchors[anchors.length - 1].x;
  }

  update(state) {
    this.state = { ...this.state, ...state };
    if (!this.systems.length || this.destroyed) return;
    const beat = clamp(Number(this.state.beat) || 0, 0, this.score.beats);
    const activeIds = new Set(
      (this.state.activeNotes || []).map((note) =>
        typeof note === "string" ? note : note.id,
      ),
    );
    for (const mark of this.marks) {
      const muted = this.state.hand !== "both" && this.state.hand !== mark.hand;
      const inSegment =
        beat >= mark.beat - EPSILON && beat < mark.endBeat - EPSILON;
      const active =
        !muted &&
        mark.ids.some((id) => activeIds.has(id)) &&
        (!this.state.playing || inSegment);
      mark.el.classList.toggle("is-muted", muted);
      mark.el.classList.toggle("is-active", active);
      mark.halo?.classList.toggle("is-active", active);
      if (mark.rollRectangle)
        mark.rollRectangle.setAttribute("opacity", active ? "1" : "0.6");
    }
    const current =
      this.systems.find(
        (system) => beat >= system.startBeat && beat < system.endBeat,
      ) || this.systems[this.systems.length - 1];
    for (const system of this.systems) {
      system.measures.forEach((measure) =>
        measure.highlight.classList.toggle(
          "is-current",
          beat >= measure.beat && beat < measure.beat + 4,
        ),
      );
      if (system.playhead) {
        system.playhead.hidden = system !== current;
        if (system === current) {
          const x = this.xAt(system, beat);
          system.playhead.style.transform = `translateX(${x}px)`;
          system.playhead.dataset.beat = String(beat);
          system.playhead.dataset.x = String(x);
        }
      }
    }
    if (current.index !== this.lastSystem && !this.options.fixedWidth) {
      // Only this score's own horizontal scroll position moves; the page never
      // scrolls vertically or steals touch focus when a new system starts.
      this.host.scrollLeft = current.index * this.width;
      this.lastSystem = current.index;
    }
    if (
      this.options.compact &&
      this.state.playing &&
      !this.options.fixedWidth
    ) {
      const x = this.xAt(current, beat);
      const left =
        current.index * this.width +
        Math.max(0, x - this.host.clientWidth + 35);
      this.host.scrollLeft = left;
    }
    const loopKey = JSON.stringify(this.state.loop || null);
    if (loopKey !== this.lastLoopKey) {
      this.lastLoopKey = loopKey;
      this.drawLoop(this.state.loop);
    }
    return this;
  }

  drawLoop(loop) {
    for (const system of this.systems) {
      system.svg
        .querySelectorAll(".loop-mark:not(.measure-selection),.loop-tag")
        .forEach((node) => node.remove());
      if (!loop || loop.end <= system.startBeat || loop.start >= system.endBeat)
        continue;
      const start = Math.max(loop.start, system.startBeat);
      const end = Math.min(loop.end, system.endBeat);
      const first = system.measures.find(
        (measure) => start >= measure.beat && start < measure.beat + 4,
      );
      const last = [...system.measures]
        .reverse()
        .find((measure) => end > measure.beat && end <= measure.beat + 4);
      const x1 = first ? first.x + 2 : this.xAt(system, start) - 10;
      const x2 = last ? last.x + last.width - 2 : this.xAt(system, end);
      const y = this.height - 15;
      system.overlay.append(
        svgNode("path", {
          d: `M ${x1} ${y - 5} L ${x1} ${y} Q ${(x1 + x2) / 2} ${y + 3} ${x2} ${y} L ${x2} ${y - 5}`,
          class: "loop-mark",
        }),
      );
      if (loop.start >= system.startBeat && loop.start < system.endBeat)
        system.overlay.append(
          svgNode(
            "text",
            { x: x1 + 4, y: y - 6, class: "loop-tag" },
            "循环起点",
          ),
        );
      if (loop.end > system.startBeat && loop.end <= system.endBeat)
        system.overlay.append(
          svgNode(
            "text",
            { x: x2 - 4, y: y - 6, "text-anchor": "end", class: "loop-tag" },
            "回到第 2 小节",
          ),
        );
    }
  }

  getGeometry() {
    return {
      view: this.view,
      width: this.width,
      perSystem: this.perSystem,
      selectedMeasureBeat: this.selectedMeasureBeat,
      systems: this.systems.map((system) => ({
        index: system.index,
        startBeat: system.startBeat,
        endBeat: system.endBeat,
        width: system.width,
        measures: system.measures.map(({ beat, number, x, width }) => ({
          beat,
          number,
          x,
          width,
        })),
        anchors: system.anchors.map(({ beat, x }) => ({ beat, x })),
      })),
      notes: this.marks
        .filter((mark) => !mark.isRest)
        .map((mark) => ({
          ids: [...mark.ids],
          hand: mark.hand,
          beat: mark.beat,
          endBeat: mark.endBeat,
          x: mark.x,
          y: mark.y,
          system: mark.system.index,
        })),
    };
  }

  destroy() {
    this.destroyed = true;
    this.observer?.disconnect();
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.host.replaceChildren();
  }
}
