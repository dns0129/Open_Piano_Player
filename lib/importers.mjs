import { XMLParser, XMLValidator } from 'fast-xml-parser';
import MidiPackage from '@tonejs/midi/build/Midi.js';
import { unzipSync, strFromU8 } from 'fflate';
import { validateScore } from './score.mjs';
import { normalizeNoteEffects } from './note-effects.mjs';
const { Midi } = MidiPackage;

const MAX_BYTES = 10 * 1024 * 1024;
const decoder = new TextDecoder();
const children = (nodes, key) => (nodes || []).flatMap(n => n[key] !== undefined ? [n[key]] : []);
const first = (nodes, key) => children(nodes, key)[0];
const nodeText = nodes => Array.isArray(nodes) ? nodes.map(n => n['#text'] ?? '').join('').trim() : String(nodes ?? '');
const value = (nodes, key, fallback = '') => nodeText(first(nodes, key)) || fallback;
const attr = (node, key) => node?.[':@']?.[`@_${key}`];
const round = n => Math.round(n * 1000000) / 1000000;
const stepMidi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const keyFifths = { Cb:-7,Gb:-6,Db:-5,Ab:-4,Eb:-3,Bb:-2,F:-1,C:0,G:1,D:2,A:3,E:4,B:5,'F#':6,'C#':7 };
const hasFineRhythm = score => score.notes.some(n => Math.abs(n.beat * 4 - Math.round(n.beat * 4)) > .001 || Math.abs(n.duration * 4 - Math.round(n.duration * 4)) > .001);
const rhythmWarning = '含连音或细分节奏；播放保留原始时值，支持3:2三连音。复杂节奏及独立声部请对照原谱核验。';

export async function importScore(data, filename = '乐谱.json') {
  if (data && typeof data.arrayBuffer === 'function') {
    filename = data.name || filename;
    data = await data.arrayBuffer();
  }
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('请选择非空且小于 10 MB 的乐谱文件。');
  const extension = filename.split('.').pop().toLowerCase();
  if (extension === 'mid' || extension === 'midi' || decoder.decode(bytes.slice(0, 4)) === 'MThd') return importMidi(bytes, filename);
  let input = typeof data === 'string' ? data : decoder.decode(bytes);
  if (extension === 'mxl' || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    let unpacked = 0;
    const files = unzipSync(bytes, { filter: file => {
      unpacked += file.originalSize;
      if (unpacked > 20 * 1024 * 1024) throw new Error('压缩乐谱解压后超过 20 MB，无法导入。');
      return /\.(xml|musicxml)$/i.test(file.name);
    } });
    let root;
    if (files['META-INF/container.xml']) {
      const container = new XMLParser({ ignoreAttributes: false }).parse(strFromU8(files['META-INF/container.xml']));
      const entries = container?.container?.rootfiles?.rootfile;
      root = (Array.isArray(entries) ? entries[0] : entries)?.['@_full-path'];
    }
    root ||= Object.keys(files).find(path => !path.startsWith('META-INF/') && /\.(xml|musicxml)$/i.test(path));
    if (!root || !files[root]) throw new Error('MXL 内没有可读取的 MusicXML 乐谱。');
    input = strFromU8(files[root]);
  }
  if (extension === 'json' || input.trim().startsWith('{')) {
    let raw;
    try { raw = JSON.parse(input); } catch { throw new Error('JSON 格式错误，请检查文件。'); }
    const score = validateScore(raw);
    return { score, warnings: hasFineRhythm(score) ? [rhythmWarning] : [] };
  }
  return importMusicXML(input, filename);
}

export function importMusicXML(input, filename = '乐谱.musicxml') {
  if (/<!ENTITY/i.test(input)) throw new Error('不支持含自定义实体的 XML 文件。');
  // MusicXML exports commonly have a PUBLIC DOCTYPE. Remove it; no network entities are resolved.
  input = input.replace(/<!DOCTYPE[^>]*(?:\[[\s\S]*?\]\s*)?>/gi, '');
  if (XMLValidator.validate(input) !== true) throw new Error('MusicXML 文件格式无效。');
  const doc = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false, trimValues: true }).parse(input);
  const root = first(doc, 'score-partwise');
  if (!root) throw new Error('目前支持 score-partwise 格式的 MusicXML，请从制谱软件重新导出。');
  const warnings = new Set();
  const notes = [];
  let tempo = null, timeSignature = null, keySignature = null, mode, durationBeats = 0;
  const measureMap = [];
  const work = first(root, 'work');
  const identity = first(root, 'identification');
  const composerNode = (identity || []).find(n => n.creator && attr(n, 'type') === 'composer');
  const title = value(work, 'work-title') || value(root, 'movement-title') || filename.replace(/\.[^.]+$/, '');
  const parts = children(root, 'part');
  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex];
    let divisions = 1, measureStart = 0, localTime = [4, 4], transposition = 0;
    const ties = new Map();
    for (const measureNode of part) {
      if (!measureNode.measure) continue;
      const measure = measureNode.measure;
      let cursor = 0, furthest = 0, previousStart = 0;
      for (const item of measure) {
        if (item.attributes) {
          const a = item.attributes;
          const d = Number(value(a, 'divisions', divisions));
          if (!Number.isFinite(d) || d <= 0) throw new Error('MusicXML 中 divisions 必须大于 0。');
          divisions = d;
          const time = first(a, 'time');
          if (time) {
            const next = [Number(value(time, 'beats')), Number(value(time, 'beat-type'))];
            if (!timeSignature) timeSignature = next;
            localTime = next;
          }
          const key = first(a, 'key');
          if (key) {
            const next = Number(value(key, 'fifths', 0));
            if (keySignature === null && ['major','minor'].includes(value(key,'mode'))) mode = value(key,'mode');
            if (keySignature === null) keySignature = next;
            else if (next !== keySignature) warnings.add('原谱有调号变化；音高保留，谱面统一使用起始调号并标注临时升降号。');
          }
          const transpose = first(a, 'transpose');
          if (transpose) { transposition = Number(value(transpose, 'chromatic', 0)) + 12 * Number(value(transpose, 'octave-change', 0)); warnings.add('移调乐器已转换为实际音高。'); }
        }
        const sounds = item.sound ? [item] : (item.direction || []).filter(n => n.sound);
        // A MusicXML metronome mark may carry the only tempo (without a sound element).
        if (!sounds.length && item.direction) {
          const metronome = children(item.direction, 'direction-type').flatMap(type => children(type, 'metronome'))[0];
          const perMinute = Number(value(metronome, 'per-minute', 0));
          const unit = { whole:4,half:2,quarter:1,eighth:.5,'16th':.25 }[value(metronome, 'beat-unit', 'quarter')] ?? 1;
          const bpm = perMinute * unit * (first(metronome, 'beat-unit-dot') !== undefined ? 1.5 : 1);
          if (bpm > 0) {
            if (tempo === null) tempo = bpm;
            else if (Math.abs(bpm - tempo) > .01) warnings.add('原谱有速度变化；练习播放统一使用起始速度，可手动调整。');
          }
        }
        for (const sound of sounds) {
          const next = Number(attr(sound, 'tempo'));
          if (next > 0) {
            if (tempo === null) tempo = next;
            else if (Math.abs(next - tempo) > 0.01) warnings.add('原谱有速度变化；练习播放统一使用起始速度，可手动调整。');
          }
        }
        if (item.backup) { cursor -= Number(value(item.backup, 'duration', 0)) / divisions; if (cursor < -0.0001) throw new Error('MusicXML 声部回退超出当前小节。'); }
        if (item.forward) { cursor += Number(value(item.forward, 'duration', 0)) / divisions; furthest = Math.max(furthest, cursor); }
        if (item.barline && first(item.barline, 'repeat')) warnings.add('反复记号未展开；当前按书写顺序播放，可用 A/B 循环练习。');
        if (!item.note) continue;
        const n = item.note;
        if (first(n, 'grace') !== undefined) { warnings.add('装饰音尚未纳入播放。'); continue; }
        const duration = Number(value(n, 'duration', 0)) / divisions;
        if (!Number.isFinite(duration) || duration <= 0) { warnings.add('没有有效时值的音符已跳过。'); continue; }
        const isChord = first(n, 'chord') !== undefined;
        const start = isChord ? previousStart : cursor;
        if (!isChord) { previousStart = start; cursor += duration; }
        furthest = Math.max(furthest, start + duration, cursor);
        if (first(n, 'rest') !== undefined) continue;
        const pitch = first(n, 'pitch');
        if (!pitch) { warnings.add('无固定音高的打击乐声部已跳过。'); continue; }
        const step = value(pitch, 'step');
        const octave = Number(value(pitch, 'octave'));
        const alter = Number(value(pitch, 'alter', 0));
        const midi = (octave + 1) * 12 + stepMidi[step] + alter + transposition;
        if (!Number.isInteger(midi) || midi < 21 || midi > 108) { warnings.add('超出 88 键钢琴范围或含微分音的音符已跳过。'); continue; }
        const staff = Number(value(n, 'staff', 0));
        const hand = staff ? (staff > 1 ? 'left' : 'right') : parts.length > 1 ? (partIndex > 0 ? 'left' : 'right') : midi < 60 ? 'left' : 'right';
        if (!staff && parts.length === 1) warnings.add('原文件未标注左右手，已按中央 C 分手，可在原制谱软件中添加双谱表后重新导入。');
        const voice = value(n, 'voice', '1');
        const tieNodes = n.filter(x => x.tie);
        const stop = tieNodes.some(t => attr(t, 'type') === 'stop');
        const begin = tieNodes.some(t => attr(t, 'type') === 'start');
        const tieKey = `${staff}:${voice}:${midi}`;
        const beat = round(measureStart + start);
        const notation=first(n,'notations')||[], arts=first(notation,'articulations')||[], ornaments=first(notation,'ornaments')||[];
        const expressionNode=(first(n,'play')||[]).find(p=>p['other-play'] && attr(p,'type')==='qinban-expression');
        let expression;
        if(expressionNode) {
          try { const parsed=JSON.parse(nodeText(expressionNode['other-play']));
            if(parsed && typeof parsed==='object'&&!Array.isArray(parsed)) expression={...normalizeNoteEffects(parsed),...(typeof parsed.id==='string'?{id:parsed.id}:{}),...(typeof parsed.voice==='string'?{voice:parsed.voice}:{}),...(typeof parsed.velocity==='number'?{velocity:parsed.velocity}:{})};
          } catch { warnings.add('有一个扩展演奏标记无法读取，已按标准 MusicXML 记号导入。'); }
        }
        const nativeEffects={};
        if(first(arts,'accent')!==undefined) nativeEffects.accent='accent';
        if(first(arts,'strong-accent')!==undefined) nativeEffects.accent='marcato';
        for(const type of ['staccato','tenuto']) if(first(arts,type)!==undefined) nativeEffects.articulation=type;
        if(first(ornaments,'trill-mark')!==undefined) nativeEffects.ornament='trill';
        if(first(ornaments,'inverted-mordent')!==undefined) nativeEffects.ornament='mordent-upper';
        if(first(ornaments,'mordent')!==undefined) nativeEffects.ornament='mordent-lower';
        const arpeggioNode=notation.find(p=>p.arpeggiate!==undefined);
        if(arpeggioNode) nativeEffects.arpeggio=attr(arpeggioNode,'direction')==='down'?'down':'up';
        const xmlVelocity=Number(attr(item,'dynamics'));
        if(Number.isFinite(xmlVelocity) && attr(item,'dynamics')!==undefined) nativeEffects.velocity=Math.max(0,Math.min(1,xmlVelocity/100*90/127));
        const tied = ties.get(tieKey);
        if (stop && tied && !expression && Math.abs(tied.beat + tied.duration - beat) < 0.001) tied.duration = round(tied.duration + duration);
        else {
          const note = { id: `xml-${notes.length}`, beat, duration: round(duration), midi, hand, voice, ...nativeEffects, ...expression };
          notes.push(note);
          if (begin) ties.set(tieKey, note);
        }
        if (stop && !begin) ties.delete(tieKey);
      }
      const expected = localTime[0] * 4 / localTime[1];
      // An implicit measure is an anacrusis/pickup, and does not consume a full bar.
      const measureLength = attr(measureNode, 'implicit') === 'yes' ? furthest : Math.max(furthest, expected);
      if (partIndex===0 && measureLength > 0) measureMap.push({beat:round(measureStart),duration:round(measureLength),timeSignature:[...localTime]});
      measureStart += measureLength;
      durationBeats = Math.max(durationBeats, measureStart);
    }
  }
  if (!notes.length) throw new Error('未找到 88 键钢琴范围内可播放的音符。');
  if (tempo !== null && (tempo < 20 || tempo > 300)) warnings.add('原始速度超出练习范围，已限制为 20–300 BPM。');
  const usableMap = measureMap.length && Math.abs(measureMap.at(-1).beat+measureMap.at(-1).duration-durationBeats)<.0001 && measureMap.every(b=>b.duration<=b.timeSignature[0]*4/b.timeSignature[1]+.0001);
  const score = validateScore({ ...(usableMap ? {measureMap}:{}), ...(mode?{mode}:{}), version: 1, title, composer: composerNode ? nodeText(composerNode.creator) : '未知', tempo: Math.max(20, Math.min(300, tempo ?? 90)), timeSignature: timeSignature ?? [4, 4], keySignature: keySignature ?? 0, source: { kind: 'musicxml', label: filename }, notes, durationBeats: round(durationBeats) });
  if (hasFineRhythm(score)) warnings.add(rhythmWarning);
  return { score, warnings: [...warnings] };
}

function midiDisplayTitle(name,filename){
  const fallback=filename.split(/[\\/]/).at(-1).replace(/\.[^.]+$/,'');
  const cjk=/[\u3400-\u9fff]/;
  if(name&&cjk.test(fallback)&&!cjk.test(name)&&/[\u0080-\u00ff]/.test(name)&&[...name].every(char=>char.charCodeAt(0)<=255)){
    const bytes=Uint8Array.from(name,char=>char.charCodeAt(0));
    for(const encoding of ['utf-8','gb18030'])try{
      const decoded=new TextDecoder(encoding,{fatal:true}).decode(bytes);
      if(cjk.test(decoded)&&fallback.normalize('NFKC').includes(decoded.normalize('NFKC')))return decoded;
    }catch{/* The filename must confirm a recovered legacy title. */}
  }
  return name || fallback;
}

export function importMidi(bytes, filename = '乐谱.mid') {
  let midi;
  try { midi = new Midi(bytes); } catch { throw new Error('MIDI 文件无效或已损坏。'); }
  const warnings = ['MIDI 只包含演奏事件；谱面按演奏事件重排（支持3:2三连音），播放保留原始时值。'];
  const tracks = midi.tracks.filter(track => track.notes.length && track.channel !== 9);
  if (midi.tracks.some(t => t.channel === 9 && t.notes.length)) warnings.push('打击乐通道已跳过。');
  if (!tracks.length) throw new Error('MIDI 中没有钢琴可播放的音符。');
  const ppq = midi.header.ppq;
  if (!Number.isFinite(ppq) || ppq <= 0) throw new Error('目前不支持 SMPTE 时间码 MIDI，请转换为 PPQ 格式。');
  const means = tracks.map(track => track.notes.reduce((sum, n) => sum + n.midi, 0) / track.notes.length);
  const min = Math.min(...means), max = Math.max(...means);
  const canSplit = tracks.length > 1 && max - min >= 8;
  const notes = [];
  let outOfRange = 0;
  tracks.forEach((track, i) => {
    for (const n of track.notes) {
      if (n.midi < 21 || n.midi > 108) { outOfRange++; continue; }
      notes.push({ id: `midi-${notes.length}`, beat: round(n.ticks / ppq), duration: Math.max(1 / 1024, round(n.durationTicks / ppq)), midi: n.midi, velocity: n.velocity, hand: canSplit ? (means[i] <= (min + max) / 2 ? 'left' : 'right') : n.midi < 60 ? 'left' : 'right' });
    }
  });
  warnings.push(canSplit ? '已按音轨平均音高区分左右手，请核对分手结果。' : '已按中央 C 区分左右手，请核对分手结果。');
  if (outOfRange) warnings.push(`已跳过 ${outOfRange} 个超出 88 键钢琴范围的音符。`);
  if (midi.header.tempos.length > 1) warnings.push('MIDI 有速度变化；练习播放统一使用起始速度。');
  if (midi.header.timeSignatures.length > 1) warnings.push('MIDI 有拍号变化；谱面统一使用起始拍号。');
  const key = midi.header.keySignatures[0];
  let fifths = keyFifths[key?.key] ?? 0;
  // @tonejs/midi decodes key using the written fifths' relative-major name,
  // even for minor. Its scale field supplies the mode separately.
  const rawTempo = midi.header.tempos[0]?.bpm ?? 90;
  if (rawTempo < 20 || rawTempo > 300) warnings.push('原始速度已限制为 20–300 BPM。');
  const durationBeats = round(Math.max(...notes.map(note => note.beat + note.duration),
    ...tracks.map(track => Number.isFinite(track.endOfTrackTicks) ? track.endOfTrackTicks / ppq : 0)));
  return { score: validateScore({ ...(key?{mode:key.scale==='minor'?'minor':'major'}:{}), version: 1, title: midiDisplayTitle(midi.name,filename), composer: 'MIDI 导入', tempo: Math.max(20, Math.min(300, rawTempo)), timeSignature: midi.header.timeSignatures[0]?.timeSignature ?? [4, 4], keySignature: fifths, source: { kind: 'midi', label: filename }, notes, durationBeats }), warnings };
}
