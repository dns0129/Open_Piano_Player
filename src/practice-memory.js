// Per-piece practice state: the tempo a player has worked up to, the passage
// they were looping and where they stopped. Scores themselves are not stored.
const STORAGE_KEY = "qinban-practice-memory-v1";
const LIMIT = 80;

export function createPracticeMemory({ persist = true, storage } = {}) {
  let entries = {};
  // Ids already reopened in this visit: the "welcome back" notice shows once.
  const announced = new Set();
  if (persist) {
    try {
      storage ??= globalThis.localStorage;
      const saved = JSON.parse(storage.getItem(STORAGE_KEY));
      if (saved && typeof saved === "object" && !Array.isArray(saved))
        entries = saved;
    } catch {
      /* Without storage the memory lasts for this visit. */
    }
  }
  const write = () => {
    if (!persist) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      /* Private mode or a full quota: keep the in-memory copy. */
    }
  };
  return {
    /** Saved state that still fits `score`, or null. */
    recall(score) {
      const entry = score?.id && entries[score.id];
      if (!entry) return null;
      const length = Number(score.durationBeats) || 0;
      const tempo = Math.round(Number(entry.tempo));
      if (!(tempo >= 20 && tempo <= 300)) return null;
      const within = (value) =>
        Number.isFinite(value) && value >= 0 && value <= length + 1e-6;
      // The last bars count as "finished": start again from the top.
      const beat =
        within(entry.beat) && entry.beat < length - 1e-3 ? entry.beat : 0;
      const loop = within(entry.loopStart) && within(entry.loopEnd);
      const announce = beat > 0 && !announced.has(score.id);
      announced.add(score.id);
      return {
        tempo,
        beat,
        loopStart: loop ? entry.loopStart : 0,
        loopEnd: loop ? entry.loopEnd : 0,
        announce,
      };
    },
    remember(score, { tempo, beat, loopStart, loopEnd }) {
      if (!score?.id) return;
      const next = {
        tempo: Math.round(Number(tempo)) || score.tempo,
        beat: Math.max(0, Number(beat) || 0),
        loopStart: Number(loopStart) || 0,
        loopEnd: Number(loopEnd) || 0,
        at: Date.now(),
      };
      const previous = entries[score.id];
      // Nothing to keep for a piece left untouched at its own tempo.
      if (!previous && next.beat === 0 && next.tempo === score.tempo) return;
      if (
        previous &&
        previous.tempo === next.tempo &&
        previous.beat === next.beat &&
        previous.loopStart === next.loopStart &&
        previous.loopEnd === next.loopEnd
      )
        return;
      announced.add(score.id);
      entries[score.id] = next;
      const ids = Object.keys(entries);
      if (ids.length > LIMIT)
        for (const id of ids
          .sort((a, b) => (entries[a].at || 0) - (entries[b].at || 0))
          .slice(0, ids.length - LIMIT))
          delete entries[id];
      write();
    },
  };
}
