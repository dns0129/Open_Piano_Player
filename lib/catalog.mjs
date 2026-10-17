import { hantingScore } from './scores/hanting.mjs';
import { validateScore } from './score.mjs';
import { bumblebeeYeungScore } from './scores/bumblebee-yeung.mjs';
import { goldenHourScore } from './scores/golden-hour.mjs';

function arranged({ id, title, composer, tempo = 84, meter = [4, 4], key = 0, melody, bass, url, description }) {
  let beat = 0;
  const notes = [];
  for (const [midi, duration] of melody) {
    if (midi !== null) notes.push({ id: `${id}-r${notes.length}`, beat, duration, midi, hand: 'right', velocity: 0.8 });
    beat += duration;
  }
  const bar = meter[0] * 4 / meter[1];
  for (let i = 0; i < Math.ceil(beat / bar); i++) {
    const chord = bass[i % bass.length];
    for (let j = 0; j < chord.length; j++) {
      // Sparse broken chords are intentionally easier than the source's accompaniment.
      const position = i * bar + j * bar / chord.length;
      if (position < beat) notes.push({ id: `${id}-l${i}-${j}`, beat: position, duration: Math.min(bar / chord.length, beat - position), midi: chord[j], hand: 'left', velocity: 0.5 });
    }
  }
  return { ...validateScore({ version: 1, id, title, composer, tempo, timeSignature: meter, keySignature: key, notes, durationBeats: beat, source: { kind: 'public-domain-arrangement', label: '公共领域旋律 · 本应用简易双手编配，非原版全曲', url, license: '原作公共领域；本应用简易编配 CC0' } }), description };
}

const quarter = pitches => pitches.map(midi => [midi, 1]);

export const library = [
  arranged({
    id: 'twinkle', title: '小星星', composer: '法国传统民谣', tempo: 84,
    melody: [
      ...quarter([60, 60, 67, 67, 69, 69]), [67, 2], ...quarter([65, 65, 64, 64, 62, 62]), [60, 2],
      ...quarter([67, 67, 65, 65, 64, 64]), [62, 2], ...quarter([67, 67, 65, 65, 64, 64]), [62, 2],
      ...quarter([60, 60, 67, 67, 69, 69]), [67, 2], ...quarter([65, 65, 64, 64, 62, 62]), [60, 2],
    ],
    bass: [[48, 55], [53, 48], [53, 55], [48, 43], [48, 55], [53, 55], [48, 55], [53, 55], [48, 55], [53, 48], [53, 55], [48, 43]],
    url: 'https://imslp.org/wiki/Ah!_vous_dirai-je,_maman_(Traditional)',
    description: '从熟悉的旋律开始 · C 大调 · 左手双音分解',
  }),
  arranged({
    id: 'ode-to-joy', title: '欢乐颂', composer: 'Ludwig van Beethoven', tempo: 92,
    melody: [
      ...quarter([64,64,65,67,67,65,64,62,60,60,62,64]), [64,1.5],[62,.5],[62,2],
      ...quarter([64,64,65,67,67,65,64,62,60,60,62,64]), [62,1.5],[60,.5],[60,2],
    ],
    bass: [[48,55],[48,55],[53,48],[55,47],[48,55],[48,55],[53,55],[48,43]],
    url: 'https://imslp.org/wiki/Symphony_No.9,_Op.125_(Beethoven,_Ludwig_van)',
    description: '第九交响曲主题节选 · C 大调 · 附点节奏',
  }),
  arranged({
    id: 'fur-elise', title: '致爱丽丝 · 开头', composer: 'Ludwig van Beethoven', tempo: 68, meter: [3, 8], key: 0,
    // A-minor theme simplified into complete 3/8 measures; no claim of Urtext fidelity.
    melody: [
      [76,.5],[75,.5],[76,.5], [75,.5],[76,.5],[71,.5], [74,.5],[72,.5],[69,.5],
      [null,.5],[60,.5],[64,.5], [69,.5],[71,.5],[null,.5], [64,.5],[68,.5],[71,.5],
      [72,.5],[null,.5],[64,.5], [76,.5],[75,.5],[76,.5], [75,.5],[76,.5],[71,.5],
      [74,.5],[72,.5],[69,1.5],
    ],
    bass: [[45],[52],[45],[45,52,57],[40],[40,52,56],[45],[45],[40],[45],[45]],
    url: 'https://imslp.org/wiki/F%C3%BCr_Elise,_WoO_59_(Beethoven,_Ludwig_van)',
    description: '主题开头简化节选 · a 小调 · 升降音练习',
  }),
  arranged({
    id: 'mary-lamb', title: '玛丽有只小羊羔', composer: '传统童谣', tempo: 88,
    melody: [
      ...quarter([64,62,60,62,64,64]),[64,2],...quarter([62,62]),[62,2],...quarter([64,67]),[67,2],
      ...quarter([64,62,60,62,64,64,64,64,62,62,64,62]),[60,4],
    ],
    bass: [[48,55],[48,55],[55,50],[48,55],[48,55],[48,55],[55,50],[48,43]],
    url: 'https://www.loc.gov/item/ihas.200000434/',
    description: '入门双手协调 · C 大调 · 四分与二分音符',
  }),
  { ...hantingScore, description: '完整6页95小节 · 已逐行校对 · 原谱跟随练习' },
  { ...bumblebeeYeungScore, description: '原PDF完整转写 · 7页105小节 · 原谱跟随练习' },
  { ...goldenHourScore, description: '网易云9页55小节逐音转写 · E 大调 12/8 · 待对照原谱校对' },
];

export function findLibraryScores(query) {
  const q = String(query).toLowerCase().replace(/\s/g, '');
  const aliases = { twinkle: ['twinkle','littlestar','小星星'], 'ode-to-joy': ['欢乐颂','odetojoy','ode'], 'fur-elise': ['致爱丽丝','献给爱丽丝','furelise','für elise'], 'mary-lamb': ['小羊羔','mary'], 'bumblebee-yeung-complete': ['野蜂飞舞','flightofthebumblebee','bumblebee','hummelflug','levoldubourdon','полётшмеля'], 'golden-hour-netease-664959': ['goldenhour','jvke','黄金时刻'] };
  return library.filter(s => `${s.title}${s.composer}`.toLowerCase().replace(/\s/g, '').includes(q) || aliases[s.id]?.some(alias => alias.replace(/\s/g,'').includes(q) || q.includes(alias.replace(/\s/g,''))));
}
