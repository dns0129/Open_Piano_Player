import { readScoreDocument, toPracticeScore } from './score-document.ts';
import { validateCloudBundle } from './cloud-library-format.mjs';
import { guitarTabNotes, GUITAR_TUNING } from './guitar.mjs';

const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const rhythms = new Map([[.5, { type: 'eighth', dots: 0 }], [1, { type: 'quarter', dots: 0 }], [1.5, { type: 'quarter', dots: 1 }], [2, { type: 'half', dots: 0 }], [4, { type: 'whole', dots: 0 }]]);

/** Explicit authored bars, not a guessed transcription or a piano accompaniment.
 * Every entry must fit a complete 4/4 bar and the app's first-position fingering.
 */
export function guitarBeginnerBundle(edition) {
  const notes = [], rests = [];
  if (!edition.bars?.length) throw Error('入门乐谱须包含小节。');
  for (const [bar, text] of edition.bars.entries()) {
    let offset = 0;
    for (const token of text.trim().split(/\s+/)) {
      const match = /^(R|[A-G][2-4])(?::(0\.5|1|1\.5|2|4))?$/.exec(token);
      if (!match) throw Error(`${edition.id} 第${bar + 1}小节音符格式无效：${token}`);
      const duration = Number(match[2] || 1), beat = bar * 4 + offset;
      const common = { id: `${edition.id}-${notes.length + rests.length}`, beat, duration, hand: 'right', staff: 1, voice: '1', rhythm: rhythms.get(duration) };
      if (match[1] === 'R') rests.push({ ...common, provenance: 'edited' });
      else {
        const step = match[1][0], octave = Number(match[1][1]);
        notes.push({ ...common, midi: (octave + 1) * 12 + semitones[step], velocity: offset === 0 ? .75 : .65, pitch: { step, alter: 0, octave, provenance: 'edited' } });
      }
      offset += duration;
    }
    if (offset !== 4) throw Error(`${edition.id} 第${bar + 1}小节必须是4拍，实际为${offset}拍。`);
  }
  const document = readScoreDocument({
    version: 1, instrument: 'guitar', id: edition.id, title: edition.title, composer: edition.composer,
    tempo: edition.tempo, timeSignature: [4, 4], keySignature: 0, mode: 'major',
    notes, rests, durationBeats: edition.bars.length * 4,
    source: {
      kind: edition.kind === 'original' ? 'original-guitar-study' : 'guitar-beginner-arrangement',
      label: `吉他入门 · 第1批 · ${edition.focus}`,
      url: edition.sourceUrl,
      license: edition.credit,
    },
  });
  const score = toPracticeScore(document), fingering = guitarTabNotes(score);
  if (fingering.some(n => !n.fingering || n.fingering.fret > 3 || GUITAR_TUNING[n.fingering.string - 1] + n.fingering.fret !== n.midi))
    throw Error(`${edition.id} 无法全部使用标准调弦0–3品演奏。`);
  return validateCloudBundle({ document, score,
    warnings: ['吉他入门教学版，标准调弦；六线谱指法为自动建议。传统曲目为单音教学编配，主题节选已在标题标明。'],
    reviewStatus: { method: 'authored-beginner-edition', humanConfirmed: false, checks: { completeBars: true, standardTuning: true, maxFret: 3, allNotesPlayable: true } },
  });
}
