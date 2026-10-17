/** All score time is measured in quarter-note beats, independent of tempo. */
export const KEY_NAMES = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const text = (value, fallback, max = 200) => String(value ?? fallback).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max);
const number = (value, name, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} 必须在 ${min}–${max} 之间。`);
  return value;
};

export function validateScore(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('乐谱内容必须是一个对象。');
  if (raw.version !== undefined && raw.version !== 1) throw new Error('目前只支持 version: 1 的练习乐谱。');
  if (!Array.isArray(raw.notes) || !raw.notes.length || raw.notes.length > 10000) throw new Error('乐谱须包含 1–10000 个音符。');
  const tempo = number(raw.tempo ?? 90, '速度', 20, 300);
  const ts = raw.timeSignature ?? [4, 4];
  if (!Array.isArray(ts) || ts.length !== 2 || !Number.isInteger(ts[0]) || ts[0] < 1 || ts[0] > 16 || ![1, 2, 4, 8, 16].includes(ts[1])) throw new Error('拍号格式无效，例如 [4,4] 或 [6,8]。');
  const keySignature = number(raw.keySignature ?? 0, '调号', -7, 7);
  if (!Number.isInteger(keySignature)) throw new Error('调号必须为 -7 到 7 的整数（降号为负，升号为正）。');
  const ids = new Set();
  const notes = raw.notes.map((note, index) => {
    if (!note || typeof note !== 'object') throw new Error(`第 ${index + 1} 个音符格式无效。`);
    const midi = number(note.midi, `第 ${index + 1} 个音符的 MIDI 音高`, 21, 108);
    if (!Number.isInteger(midi)) throw new Error('钢琴音高必须为 MIDI 整数。');
    const beat = number(note.beat, '起始拍', 0, 20000);
    const duration = number(note.duration, '时值', 1 / 1024, 256);
    if (beat + duration > 20000) throw new Error('乐谱总长度不能超过 20000 拍。');
    if (!['right', 'left'].includes(note.hand)) throw new Error('音符 hand 必须是 right 或 left。');
    let id = text(note.id, `n${index}`, 80);
    if (!id || ids.has(id)) id = `note-${index}-${ids.size}`;
    ids.add(id);
    return { id, beat, duration, midi, hand: note.hand, velocity: number(note.velocity ?? (note.hand === 'left' ? 0.55 : 0.78), '力度', 0, 1) };
  }).sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  const end = Math.max(...notes.map(n => n.beat + n.duration));
  // Adding a rational tuplet to a row offset can differ from its total by a few
  // machine ulps. Preserve the declared bar length; real overruns still fail.
  const durationTolerance = Number.EPSILON * Math.max(1, end) * 8;
  const durationBeats = raw.durationBeats === undefined ? end : number(raw.durationBeats, '乐谱总拍数', Math.max(0,end-durationTolerance), 20000);
  const source = raw.source && typeof raw.source === 'object' ? raw.source : {};
  const normalizedSource = { kind: text(source.kind, 'imported', 40), label: text(source.label, '用户导入') };
  if (source.url && /^https?:\/\//i.test(source.url)) normalizedSource.url = text(source.url, '', 2000);
  if (source.license) normalizedSource.license = text(source.license, '', 300);
  let measureMap;
  if(raw.measureMap!==undefined){
    if(!Array.isArray(raw.measureMap)||!raw.measureMap.length||raw.measureMap.length>10000)throw new Error('小节时间轴无效。');
    let cursor=0;measureMap=raw.measureMap.map((bar,index)=>{const beat=number(bar.beat,'小节起拍',0,20000),duration=number(bar.duration,'小节时长',1/1024,256),meter=bar.timeSignature||ts;if(Math.abs(beat-cursor)>1e-4||!Array.isArray(meter)||meter.length!==2||!Number.isInteger(meter[0])||meter[0]<1||meter[0]>16||![1,2,4,8,16].includes(meter[1])||duration>meter[0]*4/meter[1]+1e-4)throw new Error('小节时间轴或拍号不连续。');cursor=beat+duration;return {...bar,measure:index+1,beat,duration,timeSignature:[...meter]};});
    if(Math.abs(cursor-durationBeats)>1e-4)throw new Error('小节时间轴未覆盖完整乐谱。');
  }
  return { ...(measureMap?{measureMap}:{}), version: 1, id: text(raw.id, `score-${Date.now().toString(36)}`, 100), title: text(raw.title, '未命名乐谱'), composer: text(raw.composer, '未知'), tempo, timeSignature: [...ts], keySignature, source: normalizedSource, notes, durationBeats };
}

export function transposeScore(score, semitones) {
  if (!Number.isInteger(semitones) || Math.abs(semitones) > 24) throw new Error('移调范围为上下 24 个半音。');
  const fifths = ((score.keySignature + semitones * 7 + 6) % 12 + 12) % 12 - 6;
  return validateScore({ ...score, keySignature: fifths, notes: score.notes.map(n => ({ ...n, midi: n.midi + semitones })) });
}

export function midiName(midi, flats = false) {
  return `${(flats ? ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'] : ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'])[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export const beatsPerMeasure = score => score.timeSignature[0] * 4 / score.timeSignature[1];

export function scoreMeasureBounds(score,index){const b=score.measureMap?.[index];const length=beatsPerMeasure(score);return b?{start:b.beat,end:b.beat+b.duration,length:b.duration,timeSignature:b.timeSignature||score.timeSignature}:{start:index*length,end:(index+1)*length,length,timeSignature:score.timeSignature};}
export function scoreMeasureIndex(score,beat){if(!score.measureMap?.length)return Math.min(Math.max(0,Math.floor(beat/beatsPerMeasure(score))),Math.max(0,Math.ceil(score.durationBeats/beatsPerMeasure(score))-1));let lo=0,hi=score.measureMap.length-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(score.measureMap[m].beat<=beat+1e-7)lo=m;else hi=m-1;}return lo;}
