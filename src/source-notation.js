import { beatsPerMeasure, midiName } from '../lib/score.mjs';

const NS = 'http://www.w3.org/2000/svg';
const EPSILON = 0.00001;
const finite = value => value !== null && value !== '' && Number.isFinite(Number(value));
const number = (value, fallback) => finite(value) ? Number(value) : fallback;
const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

function sourceSystemKey(page, system) { return `${page}:${system}`; }

/**
 * The image is a crop of `rect` from its original PDF page, using PDF points and
 * a top-left origin. `notes` contains visible note heads, not inferred notes.
 * A tied note may therefore have several heads with the same noteId.
 *
 * Normalization is independent of the DOM so source coordinates can be checked
 * before the original-score renderer is mounted.
 */
export function normalizeSourceNotation(score, manifest) {
  if (!manifest || !Array.isArray(manifest.systems) || !manifest.systems.length) {
    throw new Error('原谱缺少逐行图片及坐标，无法显示原谱跟随。');
  }
  const barLength = beatsPerMeasure(score);
  const durationBeats = number(score.durationBeats, 0);
  const coordinateSpace = manifest.coordinateSpace || 'page';
  const measureMap = Array.isArray(manifest.measureMap) ? manifest.measureMap.map((measure,index) => ({
    measure: number(measure.measure,index+1), beat:number(measure.beat ?? measure.startBeat,NaN),
    duration:number(measure.duration,number(measure.endBeat,NaN)-number(measure.startBeat,NaN)),
  })) : [];
  let measureEnd=0;
  for(const measure of measureMap){
    if(!Number.isFinite(measure.beat)||!Number.isFinite(measure.duration)||measure.duration<=0||Math.abs(measure.beat-measureEnd)>EPSILON)
      throw new Error('原谱的小节时间轴有缺口或重叠，无法准确定位。');
    measureEnd=measure.beat+measure.duration;
  }
  if(measureMap.length&&Math.abs(measureEnd-durationBeats)>EPSILON)throw new Error('原谱小节时间轴未覆盖全部时长。');
  if (!['page', 'system'].includes(coordinateSpace)) throw new Error('原谱坐标类型不受支持。');
  const systems = manifest.systems.map((source, index) => {
    const rect = source.rect || {};
    const x = number(rect.x, NaN), y = number(rect.y, NaN);
    const width = number(rect.width, NaN), height = number(rect.height, NaN);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      throw new Error(`原谱第 ${index + 1} 行缺少有效的裁切范围。`);
    }
    const page = number(source.page, 1);
    const system = number(source.system ?? source.index, index + 1);
    const id = String(source.id || `p${page}-s${system}`);
    const startBeat = number(source.startBeat, finite(source.firstMeasure) ? (Number(source.firstMeasure) - 1) * barLength : NaN);
    const endBeat = number(source.endBeat, finite(source.lastMeasure) ? Number(source.lastMeasure) * barLength : NaN);
    if (!finite(startBeat) || !finite(endBeat) || endBeat <= startBeat || startBeat < -EPSILON || endBeat > durationBeats + EPSILON) {
      throw new Error(`原谱第 ${index + 1} 行的播放范围无效。`);
    }
    if (typeof source.imageUrl !== 'string' || !source.imageUrl.trim()) throw new Error(`原谱第 ${index + 1} 行缺少谱面图片。`);
    return {
      id, index, page, system, imageUrl: source.imageUrl, rect: { x, y, width, height }, startBeat, endBeat,
      firstMeasure: number(source.firstMeasure, Math.floor((startBeat + EPSILON) / barLength) + 1),
      lastMeasure: number(source.lastMeasure, Math.ceil((endBeat - EPSILON) / barLength)),
      musicStartX: number(source.musicStartX, coordinateSpace === 'page' ? x + 4 : 4) - (coordinateSpace === 'page' ? x : 0),
      musicEndX: number(source.musicEndX, coordinateSpace === 'page' ? x + width - 4 : width - 4) - (coordinateSpace === 'page' ? x : 0),
      notes: [], anchors: [],
    };
  });
  for (let index = 1; index < systems.length; index++) {
    if (systems[index].startBeat < systems[index - 1].endBeat - EPSILON) throw new Error('原谱各行的播放范围相互重叠。');
  }
  const byId = new Map(systems.map(system => [system.id, system]));
  if (byId.size !== systems.length) throw new Error('原谱行标识重复，无法定位音符。');
  const byPageSystem = new Map(systems.map(system => [sourceSystemKey(system.page, system.system), system]));
  const scoreNotes = new Map((score.notes || []).map(note => [String(note.id), note]));
  const heads = manifest.notes ?? manifest.heads;
  if (!Array.isArray(heads) || !heads.length) throw new Error('原谱缺少已校对的音符位置，无法跟谱。');
  const notes = heads.map((head, index) => {
    const source = { ...head, ...(head.source || {}) };
    const scoreNote = scoreNotes.get(String(head.noteId ?? head.id));
    const page = number(source.page, 1);
    const system = byId.get(String(source.systemId ?? source.system)) || byPageSystem.get(sourceSystemKey(page, source.system));
    if (!system) throw new Error(`原谱第 ${index + 1} 个音头没有对应的谱行。`);
    const beat = number(head.beat, scoreNote?.beat), duration = number(head.duration, scoreNote?.duration);
    const x = number(source.x, NaN) - (coordinateSpace === 'page' ? system.rect.x : 0);
    const y = number(source.y, NaN) - (coordinateSpace === 'page' ? system.rect.y : 0);
    if (![beat, duration, x, y].every(Number.isFinite) || duration <= 0 || beat < system.startBeat - EPSILON || beat >= system.endBeat + EPSILON) {
      throw new Error(`原谱第 ${index + 1} 个音头的坐标或拍位无效。`);
    }
    if (x < -2 || y < -2 || x > system.rect.width + 2 || y > system.rect.height + 2) {
      throw new Error(`原谱第 ${index + 1} 个音头位于谱行图片之外。`);
    }
    const midi = number(head.midi, scoreNote?.midi);
    const hand = head.hand ?? scoreNote?.hand;
    if (!Number.isInteger(midi) || midi < 0 || midi > 127 || !['right', 'left'].includes(hand)) throw new Error(`原谱第 ${index + 1} 个音头缺少有效音高或手别。`);
    const note = {
      id: String(head.id || `source-head-${index + 1}`), noteId: String(head.noteId ?? scoreNote?.id ?? head.id ?? ''),
      beat, duration, endBeat: Math.min(beat + duration, system.endBeat), midi, hand, x, y,
      width: Math.max(3, number(source.width, 7)), height: Math.max(3, number(source.height, 5)),
      systemIndex: system.index,
    };
    const measure = measureMap.find(item => beat>=item.beat-EPSILON&&beat<item.beat+item.duration-EPSILON);
    note.measure = measure?.measure ?? Math.floor((beat+EPSILON)/barLength)+1;
    note.beatInMeasure = measure ? beat-measure.beat : beat%barLength;
    system.notes.push(note);
    return note;
  });
  for (const system of systems) {
    system.notes.sort((a, b) => a.beat - b.beat || a.x - b.x || a.y - b.y);
    const groups = new Map();
    for (const note of system.notes) {
      const key = Math.round(note.beat * 1000000) / 1000000;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(note.x);
    }
    system.anchors = [...groups].map(([beat, xs]) => {
      xs.sort((a, b) => a - b);
      // Chord heads are slightly displaced horizontally. Their median keeps the
      // playback cursor at the shared rhythmic onset rather than at one hand.
      const middle = Math.floor(xs.length / 2);
      return { beat, x: xs.length % 2 ? xs[middle] : (xs[middle - 1] + xs[middle]) / 2 };
    }).sort((a, b) => a.beat - b.beat);
    if (!system.anchors.length || system.anchors[0].beat > system.startBeat + EPSILON) system.anchors.unshift({ beat: system.startBeat, x: system.musicStartX });
    system.anchors.push({ beat: system.endBeat, x: Math.max(system.musicEndX, system.anchors.at(-1).x) });
  }
  return { coordinateSpace: 'system', systems, notes, durationBeats, barLength, measureMap };
}

/** Returns an original-system cursor position in the image's PDF-point space. */
export function sourcePositionAtBeat(layout, inputBeat) {
  const beat = clamp(number(inputBeat, 0), 0, layout.durationBeats);
  if (beat >= layout.durationBeats - EPSILON) return null;
  let low = 0, high = layout.systems.length - 1, system;
  while (low <= high) {
    const middle = (low + high) >> 1, candidate = layout.systems[middle];
    if (beat < candidate.startBeat - EPSILON) high = middle - 1;
    else if (beat >= candidate.endBeat - EPSILON) low = middle + 1;
    else { system = candidate; break; }
  }
  if (!system) return null;
  const anchors = system.anchors;
  let first = anchors[0], last = anchors.at(-1);
  low = 0; high = anchors.length - 2;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (beat < anchors[middle].beat - EPSILON) high = middle - 1;
    else if (beat >= anchors[middle + 1].beat - EPSILON) low = middle + 1;
    else { first = anchors[middle]; last = anchors[middle + 1]; break; }
  }
  const ratio = clamp((beat - first.beat) / (last.beat - first.beat || 1), 0, 1);
  return { systemIndex: system.index, x: clamp(first.x + (last.x - first.x) * ratio, 0, system.rect.width), beat };
}

const css = `
.source-notation-root{width:100%;min-width:0;color:#273235;--source-right:#2b796b;--source-left:#476a9b}
.source-notation-help{font:11px/1.6 system-ui;color:#87918b;margin:8px 0 17px}
.source-notation-systems{display:flex;flex-direction:column;gap:18px;width:100%;min-width:0}
.source-notation-system{position:relative;width:100%;min-width:0;margin:0;background:transparent}
.source-notation-caption{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0 0 5px;font:10px/1.5 system-ui;color:#87918b}
.source-notation-system svg{display:block;width:100%;height:auto;background:#fff;overflow:visible}
.source-notation-image{pointer-events:none}
.source-notation-hit{fill:transparent;stroke:none;cursor:pointer;outline:none;transition:fill .08s}
.source-notation-hit:hover,.source-notation-hit:focus{fill:#c7e2d5;fill-opacity:.6;stroke:#659c89;stroke-width:.7}
.source-notation-hit.is-active{fill:var(--source-right);fill-opacity:.37}
.source-notation-hit.is-active[data-hand="left"]{fill:var(--source-left);fill-opacity:.37}
.source-notation-cursor{stroke:var(--source-right);stroke-width:1.3;opacity:0;pointer-events:none}
.source-notation-system.is-current .source-notation-caption{color:#2b796b}
.source-notation-image-error{display:none;padding:20px;font:12px/1.6 system-ui;color:#96563d}
.source-notation-system.has-image-error .source-notation-image-error{display:block}
@media(prefers-reduced-motion:reduce){.source-notation-hit{transition:none}}
@media print{.source-notation-system{break-inside:avoid;page-break-inside:avoid}.source-notation-hit{fill:transparent!important;stroke:none!important}.source-notation-cursor{display:none!important}.source-notation-caption,.source-notation-help{color:#666}}
`;

function svgElement(name, attributes = {}, content) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (content !== undefined) node.textContent = content;
  return node;
}

function installStyles() {
  let style = document.getElementById('pianola-source-notation-styles');
  if (!style) { style = document.createElement('style'); style.id = 'pianola-source-notation-styles'; document.head.append(style); }
  if (style.textContent !== css) style.textContent = css;
}

/**
 * Display verified source-system crops as one continuous score with timed
 * overlays. Its lifecycle matches renderNotation: setBeat(beat), destroy().
 */
export function renderSourceNotation(container, score, options = {}) {
  const layout = normalizeSourceNotation(score, options.sourceNotation ?? score.sourceNotation);
  installStyles();
  const onSeek = typeof options.onSeek === 'function' ? options.onSeek : () => {};
  const autoScroll = options.autoScroll ?? options.follow ?? true;
  const hands = { rightEnabled: options.rightEnabled !== false, leftEnabled: options.leftEnabled !== false };
  const root = document.createElement('div'); root.className = 'source-notation-root'; root.dataset.mode = 'source';
  const help = document.createElement('p'); help.className = 'source-notation-help';
  help.textContent = '原始钢琴谱逐行连续显示，绿色为右手，蓝色为左手。点击音符定位，播放时沿原谱跟随。';
  const host = document.createElement('div'); host.className = 'source-notation-systems';
  root.append(help, host); container.replaceChildren(root);
  let destroyed = false, beatNow = 0, currentIndex = -1, activeElements = [], scrollFrame = 0;
  const systemViews = [];

  for (const system of layout.systems) {
    const section = document.createElement('figure'); section.className = 'source-notation-system'; section.dataset.system = system.id;
    section.dataset.page = String(system.page); section.dataset.firstMeasure = String(system.firstMeasure); section.dataset.lastMeasure = String(system.lastMeasure);
    const caption = document.createElement('figcaption'); caption.className = 'source-notation-caption';
    const range = document.createElement('span'); range.textContent = `第 ${system.firstMeasure}–${system.lastMeasure} 小节`;
    const origin = document.createElement('span'); origin.textContent = `原谱第 ${system.page} 页 · 第 ${system.system} 行`;
    caption.append(range, origin);
    const svg = svgElement('svg', {
      viewBox: `0 0 ${system.rect.width} ${system.rect.height}`,
      'aria-label': `原钢琴谱第 ${system.page} 页，第 ${system.system} 行，第 ${system.firstMeasure} 至 ${system.lastMeasure} 小节`,
    });
    const image = svgElement('image', { href: system.imageUrl, x: 0, y: 0, width: system.rect.width, height: system.rect.height, preserveAspectRatio: 'none', class: 'source-notation-image' });
    image.setAttribute('aria-hidden', 'true');
    const imageError = document.createElement('p'); imageError.className = 'source-notation-image-error'; imageError.setAttribute('role', 'alert'); imageError.textContent = `原谱第 ${system.page} 页第 ${system.system} 行图片加载失败，请刷新页面。`;
    image.addEventListener('error', () => { if (!destroyed) section.classList.add('has-image-error'); });
    svg.append(image);
    const elements = system.notes.map(note => {
      const width = note.width + 4, height = note.height + 5;
      const rect = svgElement('rect', {
        x: Math.max(0, note.x - width / 2), y: Math.max(0, note.y - height / 2),
        width: Math.min(width, system.rect.width), height: Math.min(height, system.rect.height), rx: 1.5,
        class: 'source-notation-hit', tabindex: '0', role: 'button',
        'data-beat': note.beat, 'data-note-id': note.noteId, 'data-head-id': note.id, 'data-hand': note.hand,
        'aria-label': `定位第 ${note.measure} 小节，${note.hand === 'right' ? '右手' : '左手'} ${midiName(note.midi)}，第 ${Number((note.beatInMeasure + 1).toFixed(3))} 拍`,
      });
      const seek = () => onSeek(note.beat);
      rect.addEventListener('click', seek);
      rect.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); seek(); } });
      svg.append(rect);
      return { note, rect };
    });
    const cursor = svgElement('line', { x1: 0, x2: 0, y1: 2, y2: system.rect.height - 2, class: 'source-notation-cursor', 'aria-hidden': 'true' });
    svg.append(cursor); section.append(caption, svg, imageError); host.append(section);
    systemViews.push({ section, cursor, elements });
  }

  function follow(view) {
    if (!view || destroyed) return;
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      if (destroyed) return;
      const bounds = view.section.getBoundingClientRect(), viewport = container.getBoundingClientRect();
      if (bounds.top < viewport.top + 14 || bounds.bottom > viewport.bottom - 14) {
        const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        container.scrollTo({ top: Math.max(0, container.scrollTop + bounds.top - viewport.top - Math.max(12, (container.clientHeight - bounds.height) / 2)), behavior: reducedMotion ? 'instant' : 'smooth' });
      }
    });
  }

  function update(forceHands = false) {
    const position = sourcePositionAtBeat(layout, beatNow);
    const nextIndex = position?.systemIndex ?? -1;
    for (const element of activeElements) element.rect.classList.remove('is-active');
    activeElements = [];
    if (currentIndex !== nextIndex) {
      const previous = systemViews[currentIndex];
      if (previous) { previous.cursor.style.opacity = '0'; previous.section.classList.remove('is-current'); }
    }
    const view = systemViews[nextIndex];
    if (view && position) {
      view.section.classList.add('is-current'); view.cursor.style.opacity = '1';
      view.cursor.setAttribute('x1', position.x); view.cursor.setAttribute('x2', position.x);
      for (const element of view.elements) {
        const { note } = element;
        if (hands[`${note.hand}Enabled`] && beatNow >= note.beat - EPSILON && beatNow < note.endBeat - EPSILON) {
          element.rect.classList.add('is-active'); activeElements.push(element);
        }
      }
      if (!forceHands && currentIndex !== nextIndex && autoScroll) follow(view);
    }
    currentIndex = nextIndex;
  }

  return {
    setBeat(beat) { if (!destroyed) { beatNow = clamp(number(beat, 0), 0, layout.durationBeats); update(); } },
    setHands(next = {}) {
      if (destroyed) return;
      if (typeof next.rightEnabled === 'boolean') hands.rightEnabled = next.rightEnabled;
      if (typeof next.leftEnabled === 'boolean') hands.leftEnabled = next.leftEnabled;
      update(true);
    },
    destroy() { if (!destroyed) { destroyed = true; cancelAnimationFrame(scrollFrame); activeElements = []; root.remove(); } },
  };
}
