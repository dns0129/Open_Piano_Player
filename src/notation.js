import { scrollBehavior } from './ui.js';
import {createDisplayRepresentation,createPerformanceTimeline} from '../lib/score-representations.ts';
import { Renderer, Stave, StaveNote, StaveConnector, Voice, Formatter, Accidental, Dot, StaveTie, Beam, Tuplet, Annotation, Fraction, VexFlow, Barline, Articulation, Ornament, Modifier, GraceNote, GraceNoteGroup } from 'vexflow/bravura';
import { beatsPerMeasure, KEY_NAMES, midiName, scoreMeasureBounds, scoreMeasureIndex, scoreKeySignature } from '../lib/score.mjs';
import { spellMidi, numberedPitch, planSystems } from '../lib/notation-layout.mjs';
import { tonalityLabel } from '../lib/score-arrangement.mjs';
import { tieChains, effectLabels, ornamentAccidental } from '../lib/note-effects.mjs';

const NS = 'http://www.w3.org/2000/svg';
let fontsLoaded = false;
// VexFlow registers embedded FontFace objects; await these local faces before measuring glyphs.
export const fontsReady = typeof document !== 'undefined' && document.fonts
  ? Promise.all([document.fonts.load('32px Bravura'), document.fonts.load('12px Academico')]).then(() => { VexFlow.setFonts('Bravura', 'Academico'); fontsLoaded = true; })
  : Promise.resolve().then(() => { fontsLoaded = true; });
const symbol = accidental => ({ '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' })[accidental] || '';
import {notationDuration,notationTupletPlans,descriptorTuplets,dotFactor,RHYTHM_EPSILON,closeRhythm as closeTo} from '../lib/notation-rhythm.mjs';
export {notationDuration,notationTupletGroups} from '../lib/notation-rhythm.mjs';
import {notationMeasureSegments} from '../lib/notation-segments.mjs';
export {notationMeasureSegments} from '../lib/notation-segments.mjs';

function hasMergedVoices(score) {
  for (const hand of ['right', 'left']) {
    let previousBeat = -1, previousEnd = -1;
    for (const note of score.notes.filter(note => (note.staff || (note.hand==='left'?2:1)) === (hand==='left'?2:1)).sort((a, b) => a.beat - b.beat)) {
      if (note.beat > previousBeat + RHYTHM_EPSILON && note.beat < previousEnd - RHYTHM_EPSILON) return true;
      previousBeat = note.beat; previousEnd = Math.max(previousEnd, note.beat + note.duration);
    }
  }
  return false;
}
function svgElement(name, attrs = {}, content) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (content !== undefined) node.textContent = content;
  return node;
}
const css = `
.notation-root{width:100%;min-width:0;color:#273235;--score-accent:#2b796b}
.notation-systems{display:flex;flex-direction:column;gap:16px;width:100%;min-width:0}
.notation-system{position:relative;width:100%;min-width:0;margin:0;background:transparent}
.notation-system>svg{display:block;width:100%;height:auto;overflow:visible}
.notation-measure{cursor:pointer}
.notation-measure-shade{fill:transparent;stroke:none;pointer-events:all;transition:fill .12s}
.notation-measure.is-current>.notation-measure-shade{fill:#e8f1e5;fill-opacity:.52}
.notation-measure-label{font:10px system-ui;fill:#8d978e;pointer-events:none}
.notation-hit{fill:transparent;cursor:pointer;outline:none;stroke:none;pointer-events:all}
.notation-hit:hover,.notation-hit:focus{fill:#dbeee6;fill-opacity:.7;stroke:#659c89;stroke-width:1}
.notation-hit.is-active{fill:#a9d5bf;fill-opacity:.55}
.notation-roll-note.is-active{stroke:#244e3b;stroke-width:2;filter:brightness(1.12)}
.notation-cursor{stroke:#2b796b;stroke-width:1.65;pointer-events:none;opacity:0}
.notation-pitch{pointer-events:none;fill:#263b35;font-family:Georgia,'Songti SC',serif;font-weight:600}
.notation-rest{fill:#8d9891}.notation-barline{stroke:#657064;stroke-width:1;pointer-events:none}
.notation-help{font:11px/1.6 system-ui;color:#87918b;margin:8px 0 17px}
.notation-error{padding:24px;color:#96563d;font:13px/1.6 system-ui}
@media print{.notation-system{break-inside:avoid;page-break-inside:avoid}.notation-measure-shade,.notation-hit{fill:transparent!important;stroke:none!important}.notation-cursor{display:none!important}.notation-help{color:#666}.notation-systems{gap:14px}}
`;
function installStyles() {
  let style = document.getElementById('pianola-notation-styles');
  if (!style) { style = document.createElement('style'); style.id = 'pianola-notation-styles'; document.head.append(style); }
  if (style.textContent !== css) style.textContent = css;
}

/** One SVG per continuous system. Adjacent bars share staff-line coordinates and barlines. */
export function renderNotation(container, score, options = {}) {
  score=createDisplayRepresentation(score).score;
  installStyles();
  const { mode = 'staff', onSeek = () => {}, showNoteNames = false } = options;
  const chains=tieChains(score.notes), chain=n=>chains.get(n.id);
  const sameTie=(a,b)=>a.id===b.id || (chain(a)?.head.id===chain(b)?.head.id && a.midi===b.midi && !!chain(a));
  const sounding=mode==='roll'?createPerformanceTimeline(score).notes:null;
  const hasEffects=score.notes.some(n=>effectLabels(n).length);
  const barLength = beatsPerMeasure(score), measureCount = score.measureMap?.length || Math.max(1, Math.ceil(score.durationBeats / barLength));
  const root = document.createElement('div'); root.className = 'notation-root'; root.dataset.mode = mode;
  const help = document.createElement('p'); help.className = 'notation-help';
  help.textContent = mode === 'roll'
    ? (score.instrument === 'guitar' ? '吉他音高卷帘 · 横向为时间，纵向为实际音高。条带长度保留精确时值，点击音符定位。' : '钢琴卷帘 · 横向为时间，纵向为实际音高；绿色为右手，蓝色为左手。条带长度保留精确时值，点击音符定位。')
    : mode === 'numbered'
    ? `1 = ${KEY_NAMES[score.keySignature + 7].replace('b', '♭').replace('#', '♯')} · ${score.timeSignature.join('/')} · 上行为右手，下行为左手；上下点表示八度，下划线表示短时值。点击音符定位。`
    : '高音谱表为右手，低音谱表为左手。点击音符定位，播放位置会沿连续谱面前进。';
  if (mode === 'numbered' && score.mode === 'minor') help.textContent += ` ${tonalityLabel(score)} · 以 6 为小调主音。`;
  if (options.onSelectNotes) help.textContent = '点击谱面选择音符；和弦内的单音也可在下方逐个选择。';
  if (mode !== 'roll' && hasMergedVoices(score)) help.textContent += ' 复声部合并为和弦及延音线；精确起止可切换钢琴卷帘查看。';
  // Explain tuplets and MIDI clean-up only for scores that actually have them.
  if (mode !== 'roll' && score.notes.some(note => descriptorTuplets(notationDuration(note.duration, note.rhythm)).length)) help.textContent += ' 三连音等连音用括号里的数字标出。';
  if (mode !== 'roll' && score.source?.kind === 'midi') help.textContent += ' MIDI 里细小的松键间隙在谱面上已合并，播放仍按原始演奏。';
  if(score.tempoMap?.length)help.textContent+=' 速度变化：'+score.tempoMap.map(e=>`第${e.beat}拍 ♩=${e.bpm}${e.curve==='linear'?' 渐变至下一点':''}`).join('；')+'。';
  if(score.fermatas?.length)help.textContent+=' 停留：'+score.fermatas.map(e=>`第${e.beat}拍额外${e.holdBeats}拍`).join('；')+'。';
  const systemsHost = document.createElement('div'); systemsHost.className = 'notation-systems'; root.append(help, systemsHost); container.replaceChildren(root);
  let systems = [], measures = [], beatNow = 0, currentIndex = -1, destroyed = false, layoutWidth = 0, resizeFrame = 0, scrollFrame = 0, visibilityObserver;
  const cache = new Map();
  const segments = (index, hand) => { const key = `${index}:${hand}`; if (!cache.has(key)) cache.set(key, notationMeasureSegments(score, index, hand)); return cache.get(key); };

  function systemDimensions(system) {
    if (mode === 'roll') {
      const start=system.bars[0].start,end=system.bars.at(-1).end;
      const notes=sounding.filter(n=>n.beat<end&&n.beat+n.duration>start);
      const low=Math.max(21,Math.min(60,...notes.map(n=>n.midi))-2),high=Math.min(108,Math.max(72,...notes.map(n=>n.midi))+2);
      return {low,high,height:(high-low+1)*9+50};
    }
    if (mode === 'numbered') {
      const maxChord = Math.max(1, ...system.bars.flatMap(i => ['right', 'left'].flatMap(h => segments(i.index, h).map(s => new Set(s.notes.map(n => n.midi)).size))));
      const rowHeight = Math.max(105, maxChord * 31 + 48)+(hasEffects?24:0);
      return { maxChord, rowHeight, height: rowHeight * 2 + 20 };
    }
    const upper = system.bars.flatMap(i => segments(i.index, 'right').flatMap(s => s.notes)), lower = system.bars.flatMap(i => segments(i.index, 'left').flatMap(s => s.notes));
    const topExtra = Math.max(0, Math.ceil((Math.max(77, ...upper.map(n => n.midi)) - 77) / 12) * 36), bottomExtra = Math.max(0, Math.ceil((43 - Math.min(43, ...lower.map(n => n.midi))) / 12) * 36);
    const effectExtra=hasEffects?22:0;
    return { topY: 28 + topExtra+effectExtra, bottomY: 137 + topExtra+effectExtra, height: 243 + topExtra + bottomExtra+effectExtra };
  }

  function seekable(rect, segment) {
    const { beat, duration, notes } = segment;
    rect.classList.add('notation-hit'); rect.setAttribute('tabindex', '0'); rect.setAttribute('role', 'button'); rect.dataset.beat = beat;rect.dataset.duration=duration;rect.dataset.noteIds=notes.map(n=>n.id).join(' ');
    rect.setAttribute('aria-label', `定位第 ${scoreMeasureIndex(score,beat) + 1} 小节，${notes.length ? notes.map(n => midiName(n.midi)).join('、') : '休止'}，第 ${(beat - scoreMeasureBounds(score,scoreMeasureIndex(score,beat)).start + 1).toFixed(2).replace(/\.00$/, '')} 拍`);
    const select = () => { if (options.onSelectNotes && notes.length) options.onSelectNotes(notes.map(n => n.id)); else onSeek(beat); };
    rect.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); select(); });
    rect.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); select(); } });
    return { rect, beat, end: beat + duration, notes };
  }
  function prepareMeasure(info, group, height) {
    group.classList.add('notation-measure'); group.dataset.measure = info.index; group.dataset.keySignature = scoreKeySignature(score,info.index); group.dataset.x = info.x; group.dataset.width = info.width;
    group.addEventListener('click', event => {
      if (event.defaultPrevented || event.target?.closest?.('.notation-hit')) return;
      onSeek(info.start);
    }); info.group = group;
    group.insertBefore(svgElement('rect', { x: info.x, y: 19, width: info.width, height: height - 32, class: 'notation-measure-shade' }), group.firstChild);
    group.append(svgElement('text', { x: info.x + 5, y: 14, class: 'notation-measure-label' }, String(info.index + 1)));
  }
  function makeVoice(info, hand, stave) {
    const clef = hand === 'right' ? 'treble' : 'bass', keySignature=scoreKeySignature(score,info.index);
    const objects = segments(info.index, hand).map(segment => {
      const { glyph: duration, dots } = notationDuration(segment.duration,segment.rhythm), pitches = [...new Map(segment.notes.map(n => [n.midi, n])).values()];
      const keys = pitches.length ? pitches.map(n => { const p = n.pitch?{letter:n.pitch.step,accidental:n.pitch.alter,octave:n.pitch.octave}:spellMidi(n.midi,keySignature); return `${p.letter.toLowerCase()}${['bb', 'b', '', '#', '##'][p.accidental + 2]}/${p.octave}`; }) : [clef === 'treble' ? 'b/4' : 'd/3'];
      const note = new StaveNote({ clef, keys, duration: duration + (pitches.length ? '' : 'r'), dots, autoStem: true }).setStave(stave);
      for(let i=0;i<dots;i++) Dot.buildAndAttach([note], { all: true });
      if (showNoteNames && pitches.length) note.addModifier(new Annotation(pitches.map(n => midiName(n.midi, keySignature < 0)).join(' ')).setFont('Arial', 8).setVerticalJustification('top'));
      const chordMarks=new Set();
      pitches.forEach((n,index)=>{
        if(!closeTo(n.beat,segment.beat) || (chain(n)&&chain(n).head.id!==n.id)) return;
        if(n.grace){
          const graces=n.grace.notes.map(g=>{const p=g.pitch?{letter:g.pitch.step,accidental:g.pitch.alter,octave:g.pitch.octave}:spellMidi(g.midi,keySignature);const grace=new GraceNote({clef,keys:[`${p.letter.toLowerCase()}${['bb','b','','#','##'][p.accidental+2]}/${p.octave}`],duration:'16',slash:n.grace.slash});if(p.accidental)grace.addModifier(new Accidental(['bb','b','','#','##'][p.accidental+2]),0);return grace;});
          note.addModifier(new GraceNoteGroup(graces,true).beamNotes(),index);
        }
        if(n.fermata)note.addModifier(new Annotation(`𝄐 +${n.fermata.holdBeats}拍`).setFont('Arial',10).setVerticalJustification('top'));
        if(n.accent&&!chordMarks.has(n.accent)){note.addModifier(new Articulation(n.accent==='accent'?'a>':'a^').setPosition(Modifier.Position.ABOVE),index);chordMarks.add(n.accent);}
        if(n.articulation&&!chordMarks.has(n.articulation)){note.addModifier(new Articulation(n.articulation==='staccato'?'a.':'a-').setPosition(Modifier.Position.ABOVE),index);chordMarks.add(n.articulation);}
        if(n.ornament) {
          const ornament=new Ornament(({trill:'tr','mordent-upper':'mordent','mordent-lower':'mordentInverted'})[n.ornament]), accidental=ornamentAccidental(n,keySignature);
          if(accidental) n.ornament==='mordent-lower'?ornament.setLowerAccidental(accidental):ornament.setUpperAccidental(accidental);
          note.addModifier(ornament,index);
        }
      });
      return { ...segment, pitches, note, stave, info, hand };
    });
    // Attach each ratio before adding tickables, so VexFlow formats the
    // actual fractional durations, including nested and partial groups.
    const tuplets = notationTupletPlans(objects).map(plan => new Tuplet(plan.indices.map(index => objects[index].note), {numNotes:plan.actual,notesOccupied:plan.normal,bracketed:true,ratioed:plan.actual!==3||plan.normal!==2}));
    const voice = new Voice({ numBeats: info.timeSignature[0], beatValue: info.timeSignature[1] }).setMode(Voice.Mode.SOFT).addTickables(objects.map(n => n.note));
    Accidental.applyAccidentals([voice], KEY_NAMES[keySignature + 7]);
    let beams = [];
    try { beams = Beam.generateBeams(objects.map(n => n.note), { groups: [new Fraction(info.timeSignature[1] === 8 && info.timeSignature[0] % 3 === 0 ? 3 : 1, info.timeSignature[1])] }); } catch { /* Isolated flagged notes remain valid. */ }
    return { voice, objects, beams, tuplets, stave };
  }
  function drawStaffTies(objects, context, system) {
    for (let i = 1; i < objects.length; i++) {
      const a = objects[i - 1], b = objects[i], common = b.pitches.filter(n => a.pitches.some(p => sameTie(p,n)));
      if (common.length) new StaveTie({ firstNote: a.note, lastNote: b.note, firstIndexes: common.map(n => a.pitches.findIndex(p => p.midi === n.midi)), lastIndexes: common.map(n => b.pitches.findIndex(p => p.midi === n.midi)) }).setContext(context).draw();
    }
    const first = objects[0], last = objects.at(-1);
    const before = first?.pitches.filter(n => (chain(n)?.start??n.beat) < scoreMeasureBounds(score,system.firstMeasure).start - .001) || [];
    const after = last?.pitches.filter(n => (chain(n)?.end??n.beat+n.duration) > scoreMeasureBounds(score,system.lastMeasure).end + .001) || [];
    if (before.length) {
      const indexes = before.map(n => first.pitches.findIndex(p => p.midi === n.midi));
      new StaveTie({ lastNote: first.note, firstIndexes: indexes, lastIndexes: indexes }).setContext(context).draw();
    }
    if (after.length) {
      const indexes = after.map(n => last.pitches.findIndex(p => p.midi === n.midi));
      new StaveTie({ firstNote: last.note, firstIndexes: indexes, lastIndexes: indexes }).setContext(context).draw();
    }
  }
  function drawStaff(system) {
    const { topY, bottomY, height } = system.dimensions;
    const renderer = new Renderer(system.host, Renderer.Backends.SVG); renderer.resize(system.width, height);
    const context = renderer.getContext(); context.setFillStyle('#283b34'); context.setStrokeStyle('#46534b');
    const allRight = [], allLeft = [], rendered = [];
    for (let position = 0; position < system.bars.length; position++) {
      const info = system.bars[position], group = context.openGroup('notation-measure', `measure-${info.index}`);
      const top = new Stave(info.x, topY, info.width).setBegBarType(Barline.type.NONE).setEndBarType(Barline.type.NONE), bottom = new Stave(info.x, bottomY, info.width).setBegBarType(Barline.type.NONE).setEndBarType(Barline.type.NONE);
      const key=scoreKeySignature(score,info.index),previousKey=info.index?scoreKeySignature(score,info.index-1):key;
      if(position===0){top.addClef('treble');bottom.addClef('bass');}
      if(position===0||key!==previousKey){
        const cancel=key!==previousKey?KEY_NAMES[previousKey+7]:undefined;
        top.addKeySignature(KEY_NAMES[key+7],cancel);bottom.addKeySignature(KEY_NAMES[key+7],cancel);
      }
      if(info.index===0||info.timeSignature.join('/')!==scoreMeasureBounds(score,info.index-1).timeSignature.join('/')){top.addTimeSignature(info.timeSignature.join('/'));bottom.addTimeSignature(info.timeSignature.join('/'));}
      const noteStartX = Math.max(top.getNoteStartX(), bottom.getNoteStartX()) + (position ? 8 : 0); top.setNoteStartX(noteStartX); bottom.setNoteStartX(noteStartX);
      top.setContext(context).draw(); bottom.setContext(context).draw();
      if (position === 0) { new StaveConnector(top, bottom).setType('brace').setContext(context).draw(); new StaveConnector(top, bottom).setType('singleLeft').setContext(context).draw(); }
      const right = makeVoice(info, 'right', top), left = makeVoice(info, 'left', bottom);
      // Tick contexts are local. StaveNote adds its stave's absolute noteStartX exactly once.
      new Formatter().joinVoices([right.voice]).joinVoices([left.voice]).formatToStave([right.voice, left.voice], top);
      for (const v of [right, left]) { v.voice.draw(context, v.stave); v.beams.forEach(b => b.setContext(context).draw()); v.tuplets.forEach(tuplet => tuplet.setContext(context).draw()); }
      allRight.push(...right.objects); allLeft.push(...left.objects); rendered.push(...right.objects, ...left.objects); context.closeGroup(); prepareMeasure(info, group, height);
      group.append(svgElement('line', { x1: info.endX, x2: info.endX, y1: top.getYForLine(0), y2: bottom.getYForLine(4), class: 'notation-barline' }));
      if (info.index === measureCount - 1) group.append(svgElement('line', { x1: info.endX - 4, x2: info.endX - 4, y1: top.getYForLine(0), y2: bottom.getYForLine(4), class: 'notation-barline', 'stroke-width': 2 }));
      info.anchors = [];
    }
    drawStaffTies(allRight, context, system); drawStaffTies(allLeft, context, system);
    const svg = system.host.querySelector('svg'); svg.setAttribute('viewBox', `0 0 ${system.width} ${height}`); svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.removeProperty('width'); svg.style.removeProperty('height'); svg.setAttribute('aria-label', `第 ${system.firstMeasure + 1} 至 ${system.lastMeasure + 1} 小节连续钢琴五线谱`);
    // VexFlow's beams and tuplet brackets are outside the individual note SVG
    // groups. Keep every seek target above the entire printed score so those
    // glyphs cannot intercept a note click and redirect it to its bar's start.
    const hitLayer = svgElement('g', { class: 'notation-hit-layer' }); svg.append(hitLayer);
    for (const item of rendered) {
      const ys = item.note.getYs(), x = item.note.getAbsoluteX(), y = Math.min(...ys) - 17;
      const attacks=item.pitches.filter(n=>closeTo(n.beat,item.beat));
      const marks=svgElement('g',{class:'notation-effects','pointer-events':'none','aria-label':attacks.flatMap(effectLabels).join('、')});
      const dynamics=[...new Set(attacks.map(n=>n.dynamic).filter(Boolean))];
      if(dynamics.length) marks.append(svgElement('text',{x,y:item.stave.getYForLine(4)+30,'font-family':'Georgia,serif','font-style':'italic','font-weight':'bold','font-size':15,'text-anchor':'middle',class:'notation-dynamic'},dynamics.join('/')));
      const arp=attacks.find(n=>n.arpeggio);
      if(arp){const arpYs=item.pitches.map((n,i)=>n.arpeggio&&closeTo(n.beat,item.beat)?ys[i]:null).filter(v=>v!==null), top=Math.min(...arpYs)-9,bottom=Math.max(...arpYs)+9,ax=x-22;let d=`M ${ax} ${top}`;for(let yy=top;yy<bottom;yy+=8)d+=` q -5 2 0 4 q 5 2 0 4`;marks.append(svgElement('path',{d,fill:'none',stroke:'#46534b','stroke-width':1.2,class:'notation-arpeggio'}));const ay=arp.arpeggio==='up'?top-2:bottom+2;marks.append(svgElement('path',{d:`M ${ax-3} ${ay+(arp.arpeggio==='up'?4:-4)} L ${ax} ${ay} L ${ax+3} ${ay+(arp.arpeggio==='up'?4:-4)}`,fill:'none',stroke:'#46534b','stroke-width':1.2}));}
      if(attacks.some(n=>effectLabels(n).length)) svg.append(marks);
      const hit = svgElement('rect', { x: x - 11, y, width: 29, height: Math.max(43, Math.max(...ys) - y + 20), rx: 4 }); hitLayer.append(hit); item.info.hits.push(seekable(hit, item));
      const noteGroup = item.note.getSVGElement(); if (noteGroup) noteGroup.style.pointerEvents = 'none'; item.info.anchors.push({ beat: item.beat, x });
    }
    for (const info of system.bars) { info.anchors = [...new Map(info.anchors.map(a => [a.beat, a])).values()].sort((a, b) => a.beat - b.beat); info.anchors.push({ beat: info.end, x: info.endX - 3 }); }
    system.cursor = svgElement('line', { x1: 0, x2: 0, y1: topY + 17, y2: bottomY + 93, class: 'notation-cursor' }); svg.append(system.cursor);
  }
  function drawNumberedTies(events, svg, system) {
    const arc = (x1, y1, x2, y2) => svg.append(svgElement('path', { d: `M ${x1} ${y1 - 29} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) - 44} ${x2} ${y2 - 29}`, fill: 'none', stroke: '#637c68', 'stroke-width': 1.1, 'pointer-events': 'none', class: 'notation-tie' }));
    for (let i = 1; i < events.length; i++) { const a = events[i - 1], b = events[i]; for (const p of b.pitches) { const prev = a.pitches.find(n => sameTie(n,p)); if (prev) arc(a.x + 8, prev.y, b.x - 8, p.y); } }
    const first = events[0], last = events.at(-1);
    if (first) for (const p of first.pitches) if ((chain(p)?.start??p.beat) < scoreMeasureBounds(score,system.firstMeasure).start - .001) arc(system.bars[0].x + 33, p.y, first.x - 8, p.y);
    if (last) for (const p of last.pitches) if ((chain(p)?.end??p.beat+p.duration) > scoreMeasureBounds(score,system.lastMeasure).end + .001) arc(last.x + 8, p.y, system.width - 17, p.y);
  }
  function drawNumbered(system) {
    const { maxChord, rowHeight, height } = system.dimensions;
    const svg = svgElement('svg', { viewBox: `0 0 ${system.width} ${height}`, 'aria-label': `第 ${system.firstMeasure + 1} 至 ${system.lastMeasure + 1} 小节连续双手简谱` }); system.host.append(svg);
    const events = { right: [], left: [] }, baselines = [52 + (maxChord - 1) * 31+(hasEffects?24:0), 52 + (maxChord - 1) * 31 + rowHeight+(hasEffects?24:0)];
    for (const [hand, row] of [['right', 0], ['left', 1]]) svg.append(svgElement('text', { x: 17, y: baselines[row], 'font-size': 11, fill: '#8c978d', class: 'notation-row-label' }, hand === 'right' ? '右手' : '左手'));
    for (let position = 0; position < system.bars.length; position++) {
      const info = system.bars[position], group = svgElement('g'); svg.append(group); prepareMeasure(info, group, height);
      const key=scoreKeySignature(score,info.index),keyChange=info.index>0&&key!==scoreKeySignature(score,info.index-1);
      if(position===0||keyChange)group.append(svgElement('text',{x:info.x+5,y:32,'font-size':11,class:'notation-key-label'},`1 = ${KEY_NAMES[key+7].replace('b','♭').replace('#','♯')}`));
      const musicStart = info.x + (position ? (keyChange?58:10) : 45), musicEnd = info.endX - 12, span = Math.max(20, musicEnd - musicStart - 17);
      info.anchors = [{ beat: info.start, x: musicStart + 9 }, { beat: info.end, x: info.endX - 2 }];
      for (const [hand, row] of [['right', 0], ['left', 1]]) {
        const baseline = baselines[row]; group.append(svgElement('line', { x1: info.endX, x2: info.endX, y1: baseline - (maxChord - 1) * 31 - 34, y2: baseline + 23, class: 'notation-barline' }));
        const measureEvents = [];
        for (const segment of segments(info.index, hand)) {
          const engraving = notationDuration(segment.duration,segment.rhythm);
          const x = musicStart + 9 + (segment.beat - info.start) / info.length * span, durationWidth = Math.max(24, segment.duration / info.length * span);
          const pitches = [...new Map(segment.notes.map(n => [n.midi, n])).values()].sort((a, b) => a.midi - b.midi);
          const labels=[...new Set(pitches.filter(n=>closeTo(n.beat,segment.beat)).flatMap(effectLabels).filter(l=>l!=='延音线'))];
          if(labels.length) group.append(svgElement('text',{x,y:baseline-(pitches.length-1)*31-42,'font-size':11,'text-anchor':'middle',fill:'#52714e',class:'notation-effects','pointer-events':'none'},labels.join(' ')));
          const hit = svgElement('rect', { x: x - 14, y: baseline - (pitches.length - 1) * 31 - 32, width: Math.max(27, durationWidth - 3), height: Math.max(57, pitches.length * 31 + 22), rx: 4 }); group.append(hit); info.hits.push(seekable(hit, segment));
          const event = { x, pitches: [], beat: segment.beat, duration: segment.duration, rhythm:segment.rhythm }; events[hand].push(event); measureEvents.push(event);
          (pitches.length ? pitches : [null]).forEach((note, j) => {
            const y = baseline - j * 31, p = note ? numberedPitch(note.midi, key, note.pitch) : null;
            group.append(svgElement('text', { x, y, class: `notation-pitch${note ? '' : ' notation-rest'}`, 'font-size': 25, 'text-anchor': 'middle' }, p ? String(p.degree) : '0'));
            if (p?.accidental) group.append(svgElement('text', { x: x - 15, y: y - 8, 'font-size': 16, class: 'notation-pitch' }, symbol(p.accidental)));
            if (p?.octave) for (let k = 0; k < Math.min(4, Math.abs(p.octave)); k++) group.append(svgElement('circle', { cx: x, cy: p.octave > 0 ? y - 26 - k * 5 : y + 10 + k * 5, r: 1.45, fill: '#263b35', 'pointer-events': 'none' }));
            const underlineCount = Math.max(0, Math.round(Math.log2(1 / (engraving.printedBeats / dotFactor(engraving.dots)))));
            for (let k = 0; k < underlineCount; k++) group.append(svgElement('line', { x1: x - 8, x2: x + 8, y1: y + 4 + k * 4, y2: y + 4 + k * 4, stroke: '#263b35', 'stroke-width': 1.5, 'pointer-events': 'none' }));
            for(let dot=0;dot<engraving.dots;dot++) group.append(svgElement('circle', { cx: x + Math.max(0,engraving.printedBeats/dotFactor(engraving.dots)-1)*segment.duration/engraving.printedBeats/info.length*span + 13+dot*5, cy: y - 8, r: 1.8, fill: '#263b35', 'pointer-events': 'none',class:'notation-duration-dot' }));
            if (engraving.printedBeats/dotFactor(engraving.dots) >= 2) for (let k = 1; k < engraving.printedBeats/dotFactor(engraving.dots); k++) group.append(svgElement('text', { x: x + k*segment.duration/engraving.printedBeats / info.length * span, y, class: 'notation-pitch', 'font-size': 21, 'text-anchor': 'middle' }, '—'));
            if (showNoteNames && note) group.append(svgElement('text', { x, y: y + 28, 'font-size': 9, 'text-anchor': 'middle', fill: '#9aa69c', 'pointer-events': 'none' }, midiName(note.midi, key < 0)));
            if (note) event.pitches.push({ ...note, y });
          });
        }
        for (const plan of notationTupletPlans(measureEvents)) {
          const {indices,actual,normal,level}=plan;const label=actual===3&&normal===2?'3':`${actual}:${normal}`;
          const first = measureEvents[indices[0]], last = measureEvents[indices.at(-1)], y = baseline - (maxChord - 1) * 31 - 39-level*17;
          const bracket = svgElement('g', { class: 'notation-tuplet', 'aria-label': `${actual}比${normal}连音，可含音符与休止符`, 'pointer-events': 'none' });
          bracket.append(svgElement('path', { d: `M ${first.x - 9} ${y + 5} V ${y} H ${last.x + 9} V ${y + 5}`, fill: 'none', stroke: '#637c68', 'stroke-width': 1 }));
          bracket.append(svgElement('rect', { x: (first.x + last.x) / 2 - label.length*4, y: y - 7, width: label.length*8, height: 13, fill: '#fff' }));
          bracket.append(svgElement('text', { x: (first.x + last.x) / 2, y: y + 4, 'text-anchor': 'middle', 'font-size': 13, fill: '#46644f' }, label));
          group.append(bracket);
        }
      }
    }
    drawNumberedTies(events.right, svg, system); drawNumberedTies(events.left, svg, system);
    system.cursor = svgElement('line', { x1: 0, x2: 0, y1: 22, y2: height - 15, class: 'notation-cursor' }); svg.append(system.cursor);
  }
  function drawRoll(system) {
    const {low,high,height}=system.dimensions;
    const svg=svgElement('svg',{viewBox:`0 0 ${system.width} ${height}`,'aria-label':`第 ${system.firstMeasure+1} 至 ${system.lastMeasure+1} 小节钢琴卷帘`});system.host.append(svg);
    const top=26,row=9;
    for(const info of system.bars){
      const group=svgElement('g');svg.append(group);prepareMeasure(info,group,height);
      const x0=info.x+(info===system.bars[0]?43:8),x1=info.endX-5,span=x1-x0;
      info.anchors=[{beat:info.start,x:x0},{beat:info.end,x:x1}];
      for(let midi=low;midi<=high;midi++){
        const y=top+(high-midi)*row;
        group.append(svgElement('rect',{x:x0,y,width:span,height:row,fill:[1,3,6,8,10].includes(midi%12)?'#edf1ed':'#fafbf7','pointer-events':'none'}));
        if(midi%12===0&&info===system.bars[0]) group.append(svgElement('text',{x:info.x+3,y:y+8,'font-size':8,fill:'#7d8a80','pointer-events':'none'},midiName(midi)));
      }
      for(let beat=0;beat<info.length-1e-7;beat++)group.append(svgElement('line',{x1:x0+beat/info.length*span,x2:x0+beat/info.length*span,y1:top,y2:height-23,stroke:'#d7dfd6','stroke-width':.7,'pointer-events':'none'}));
      group.append(svgElement('line',{x1:info.endX,x2:info.endX,y1:top,y2:height-23,class:'notation-barline'}));
      for(const n of sounding.filter(n=>n.beat<info.end-1e-7&&n.beat+n.duration>info.start+1e-7)){
        const start=Math.max(n.beat,info.start),end=Math.min(n.beat+n.duration,info.end);
        const rect=svgElement('rect',{x:x0+(start-info.start)/info.length*span,y:top+(high-n.midi)*row+.8,width:Math.max(1,(end-start)/info.length*span),height:7.4,rx:1.8,class:'notation-roll-note','data-note-id':n.id,'data-midi':n.midi,'data-hand':n.hand,'data-start':n.beat,'data-duration':n.duration,style:`fill:${n.hand==='right'?'#549b77':'#6594ba'};fill-opacity:.9`});
        group.append(rect);info.hits.push(seekable(rect,{beat:n.beat,duration:n.duration,notes:n.sourceIds.map(id=>score.notes.find(p=>p.id===id)||n)}));
      }
    }
    system.cursor=svgElement('line',{x1:0,x2:0,y1:top,y2:height-22,class:'notation-cursor'});svg.append(system.cursor);
  }
  function update(system) {
    if (!system?.drawn) return;
    const activeIndex = Math.min(measureCount - 1, scoreMeasureIndex(score,beatNow)); let activeInfo;
    for (const info of system.bars) {
      const active = info.index === activeIndex && beatNow < score.durationBeats; info.group?.classList.toggle('is-current', active);
      for (const hit of info.hits) hit.rect.classList.toggle('is-active', active && hit.notes.length > 0 && beatNow >= hit.beat - .0001 && beatNow < hit.end - .0001);
      if (active) activeInfo = info;
    }
    if (system.cursor) {
      system.cursor.style.opacity = activeInfo ? '1' : '0';
      if (activeInfo?.anchors.length) {
        const anchors = activeInfo.anchors; let a = anchors[0], b = anchors.at(-1);
        for (let i = 0; i < anchors.length - 1; i++) if (beatNow >= anchors[i].beat && beatNow < anchors[i + 1].beat) { a = anchors[i]; b = anchors[i + 1]; break; }
        const ratio = Math.max(0, Math.min(1, (beatNow - a.beat) / (b.beat - a.beat || 1))), x = a.x + (b.x - a.x) * ratio; system.cursor.setAttribute('x1', x); system.cursor.setAttribute('x2', x);
      }
    }
  }
  function paint(system) {
    if (!system || system.drawn || destroyed) return;
    if (mode === 'staff' && !fontsLoaded) { system.pending = true; return; } system.drawn = true;
    try { if (system.layoutError) throw system.layoutError; mode === 'roll' ? drawRoll(system) : mode === 'numbered' ? drawNumbered(system) : drawStaff(system); }
    catch (error) { system.host.replaceChildren(); const message = document.createElement('p'); message.className = 'notation-error'; message.textContent = `此行暂不能准确排版，可切换钢琴卷帘查看全部音符和精确时值。${error.message}`; system.host.append(message); console.error('Score engraving failed:', error); }
    system.host.style.minHeight = '0'; update(system);
  }
  function rebuild() {
    if (destroyed) return; visibilityObserver?.disconnect(); layoutWidth = Math.max(240, Math.floor(container.clientWidth || 800)); systems = planSystems(score, layoutWidth, mode); measures = []; systemsHost.replaceChildren();
    visibilityObserver = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { const system = systems[Number(entry.target.dataset.system)]; if (system?.host === entry.target) paint(system); visibilityObserver.unobserve(entry.target); } }, { rootMargin: '700px' }) : null;
    for (const system of systems) {
      try { system.dimensions = systemDimensions(system); }
      catch (error) { system.dimensions = { height: mode === 'staff' ? 243 : 230 }; system.layoutError = error; }
      // Reserve the real SVG ratio before lazy drawing. Otherwise ledger lines
      // and chords change earlier systems' heights after following a later bar.
      const host = document.createElement('div'); host.className = 'notation-system'; host.dataset.system = system.index; host.dataset.firstMeasure = system.firstMeasure; host.dataset.lastMeasure = system.lastMeasure; host.style.aspectRatio = `${system.width} / ${system.dimensions.height}`;
      system.host = host; system.drawn = false; system.cursor = null; systemsHost.append(host);
      for (const info of system.bars) { info.system = system; info.group = null; info.hits = []; info.anchors = []; measures[info.index] = info; }
      if (options.renderAll || system.index < 3 || !visibilityObserver) paint(system); else visibilityObserver.observe(host);
    }
    const index = Math.min(measureCount - 1, scoreMeasureIndex(score,beatNow)); paint(measures[index]?.system); update(measures[index]?.system);
    // A scrollbar or window resize can rebuild the layout after the first seek.
    // Follow the new system, rather than retaining a target in the removed DOM.
    if (currentIndex >= 0 && options.autoScroll !== false) follow(measures[index]);
  }
  function follow(info) {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      if (destroyed) return;
      const bounds = info.system.host.getBoundingClientRect(), viewport = container.getBoundingClientRect();
      if (bounds.top < viewport.top + 14 || bounds.bottom > viewport.bottom - 14) container.scrollTo({ top: Math.max(0, container.scrollTop + bounds.top - viewport.top - Math.max(12, (container.clientHeight - bounds.height) / 2)), behavior: scrollBehavior() });
    });
  }
  rebuild();
  if (mode === 'staff' && !fontsLoaded) fontsReady.then(() => { if (!destroyed) for (const system of systems) if (system.pending) paint(system); }).catch(error => { if (destroyed) return; const message = document.createElement('p'); message.className = 'notation-error'; message.textContent = '乐谱字体加载失败，请刷新页面后重试。'; systemsHost.replaceChildren(message); console.error('Music fonts could not load:', error); });
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (destroyed || Math.abs(container.clientWidth - layoutWidth) < 8) return; cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(rebuild); }) : null; resizeObserver?.observe(container);
  const beforePrint = () => { if (Math.abs(container.clientWidth - layoutWidth) >= 8) rebuild(); for (const system of systems) paint(system); }; window.addEventListener('beforeprint', beforePrint);
  return {
    setBeat(beat) {
      if (destroyed) return; beatNow = Math.max(0, Math.min(score.durationBeats, Number(beat) || 0));
      const index = Math.min(measureCount - 1, scoreMeasureIndex(score,beatNow)), previous = measures[currentIndex], info = measures[index];
      if (previous && previous.system !== info.system) update(previous.system); paint(info.system); update(info.system);
      if (index !== currentIndex && options.autoScroll !== false) follow(info); currentIndex = index;
    },
    destroy() { destroyed = true; cancelAnimationFrame(resizeFrame); cancelAnimationFrame(scrollFrame); visibilityObserver?.disconnect(); resizeObserver?.disconnect(); window.removeEventListener('beforeprint', beforePrint); root.remove(); },
  };
}
