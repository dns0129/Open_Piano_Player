// Only isolated, touching notes in the same written voice share a bow change.
// Rests, repeated pitches, large leaps, staccato and chords keep their attacks.
export function bowedConnections(notes) {
  const voices = new Map(), connections = new Map();
  for (const note of notes) {
    const key = `${note.hand || 'right'}:${note.voice ?? ''}`;
    if (!voices.has(key)) voices.set(key, []);
    voices.get(key).push(note);
  }
  for (const voice of voices.values()) {
    const groups = [];
    for (const note of [...voice].sort((a, b) => a.beat - b.beat)) {
      const last = groups.at(-1);
      if (last && Math.abs(last[0].beat - note.beat) < 1e-7) last.push(note);
      else groups.push([note]);
    }
    let soundingUntil = -Infinity;
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i], next = groups[i + 1];
      if (group.length === 1 && next?.length === 1 && soundingUntil <= group[0].beat + 1e-7) {
        const a = group[0], b = next[0], interval = Math.abs(a.midi - b.midi);
        if (Math.abs(a.beat + a.duration - b.beat) < 1e-7 && interval > 0 && interval <= 12
          && a.articulation !== 'staccato' && b.articulation !== 'staccato') {
          connections.set(a, { ...connections.get(a), next: b });
          connections.set(b, { ...connections.get(b), previous: a });
        }
      }
      soundingUntil = Math.max(soundingUntil, ...group.map(n => n.beat + n.duration));
    }
  }
  return connections;
}

export function bowedEnvelope(profile, duration, elapsed, { from = false, to = false } = {}) {
  const bow = profile.bowed;
  const longness = Math.max(0, Math.min(1, (duration - 0.12) / 0.65));
  return {
    attack: elapsed > 0 ? 0.006 : from ? bow.transition : bow.shortAttack + (profile.attack - bow.shortAttack) * longness,
    release: to ? bow.transition : bow.shortRelease + (profile.release - bow.shortRelease) * longness,
  };
}
