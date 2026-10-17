import data from './hanting.json' with { type: 'json' };
import { validateScore } from '../score.mjs';
export const hantingScore = validateScore(data.score);
export const hantingNotation = data.notation;
const reference = new Map(hantingScore.notes.map(n => [n.id, n]));
export function hantingNotationMatched(score) {
  if (!score || score.id !== hantingScore.id || score.durationBeats !== hantingScore.durationBeats
      || score.keySignature !== hantingScore.keySignature || String(score.timeSignature) !== String(hantingScore.timeSignature)
      || score.notes?.length !== reference.size) return false;
  const seen = new Set();
  return score.notes.every(n => {
    const expected = reference.get(n.id);
    if (!expected || seen.has(n.id)) return false;
    seen.add(n.id);
    return ['midi','beat','duration','hand'].every(key => n[key] === expected[key]);
  });
}
