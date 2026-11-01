import { tieChains } from "./note-effects.mjs";

const EPSILON = 1e-7;
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

/** Conservative, deterministic suggestions; written fingering always takes precedence. */
export function suggestPianoFingering(score) {
  const result = new Map();
  if (score.instrument === "guitar") return result;
  const chains = tieChains(score.notes);
  for (const note of score.notes)
    if (Number.isInteger(note.finger) && note.finger >= 1 && note.finger <= 5)
      result.set(note.id, { finger: note.finger, source: "written" });

  for (const hand of ["right", "left"]) {
    const direction = hand === "right" ? 1 : -1;
    const notes = score.notes
      .filter((n) => n.hand === hand && chains.get(n.id)?.head.id === n.id)
      .sort((a, b) => a.beat - b.beat || a.midi - b.midi);
    let active = [],
      previous = null;
    for (let i = 0; i < notes.length;) {
      let end = i + 1;
      while (
        end < notes.length &&
        Math.abs(notes[end].beat - notes[i].beat) < EPSILON
      )
        end++;
      const group = notes.slice(i, end),
        beat = group[0].beat;
      active = active.filter((n) => n.end > beat + EPSILON);
      const combined =
        active.length + group.length > 5
          ? []
          : [
              ...active,
              ...group.map((n) => ({
                midi: n.midi,
                finger: result.get(n.id)?.finger,
                note: n,
              })),
            ].sort((a, b) => a.midi - b.midi);
      // Ambiguous unisons, wide reaches and more than five held keys are not guessed.
      const possible =
        combined.length > 0 &&
        combined.at(-1).midi - combined[0].midi <= 12 &&
        combined.every(
          (n, index) => !index || n.midi !== combined[index - 1].midi,
        ) &&
        active.every((n) => n.finger);
      let best = null,
        bestCost = Infinity;
      if (possible) {
        const next = notes[end];
        const nextDirection =
          next && next.beat - beat <= 2
            ? Math.sign((next.midi - group.at(-1).midi) * direction)
            : 0;
        function choose(index, chosen) {
          if (index === combined.length) {
            const current = combined.map((n, j) => ({
              ...n,
              finger: chosen[j],
            }));
            const attacks = current.filter((n) => n.note);
            let cost = 0;
            for (const n of attacks) {
              if (n.finger === 1 && BLACK_KEYS.has(n.midi % 12)) cost += 0.7;
              if (
                previous &&
                beat - previous.beat <= 4 &&
                attacks.length === 1
              ) {
                const distance = (n.midi - previous.midi) * direction;
                if (!distance) cost += Math.abs(n.finger - previous.finger) * 4;
                else if (Math.abs(distance) <= 5) {
                  const change = n.finger - previous.finger;
                  const target =
                    Math.sign(distance) * (Math.abs(distance) <= 2 ? 1 : 2);
                  cost += Math.abs(change - target);
                  if (Math.sign(change) !== Math.sign(distance))
                    cost +=
                      (distance > 0 &&
                        n.finger === 1 &&
                        previous.finger >= 3) ||
                      (distance < 0 && previous.finger === 1 && n.finger >= 3)
                        ? 1
                        : 5;
                } else cost += Math.abs(n.finger - 3) * 0.15;
              } else if (!previous && attacks.length === 1) {
                const preferred =
                  nextDirection < 0 ? 5 : nextDirection > 0 ? 1 : 3;
                cost += Math.abs(n.finger - preferred) * 0.8;
              }
            }
            if (attacks.length > 1) {
              cost +=
                Math.abs(attacks[0].finger - (hand === "right" ? 1 : 5)) * 0.15;
              cost +=
                Math.abs(attacks.at(-1).finger - (hand === "right" ? 5 : 1)) *
                0.15;
              const low = attacks[0].midi,
                span = attacks.at(-1).midi - low;
              for (const attack of attacks) {
                const fraction = (attack.midi - low) / span;
                const ideal =
                  hand === "right" ? 1 + 4 * fraction : 5 - 4 * fraction;
                cost += Math.abs(attack.finger - ideal) * 0.2;
              }
            }
            if (cost < bestCost) {
              bestCost = cost;
              best = current;
            }
            return;
          }
          const item = combined[index];
          for (let f = 1; f <= 5; f++) {
            if (item.finger && item.finger !== f) continue;
            if (index && (f - chosen[index - 1]) * direction <= 0) continue;
            choose(index + 1, [...chosen, f]);
          }
        }
        choose(0, []);
      }
      if (best)
        for (const item of best) {
          if (item.note && !result.has(item.note.id))
            result.set(item.note.id, {
              finger: item.finger,
              source: "suggested",
            });
        }
      for (const note of group)
        active.push({
          midi: note.midi,
          // Explicit changes within a tie are shown, but their exact release
          // timing is ambiguous; do not guess other fingers while it is held.
          finger: chains
            .get(note.id)
            ?.members.slice(1)
            .some((member) => member.finger !== undefined)
            ? undefined
            : result.get(note.id)?.finger,
          end: chains.get(note.id)?.end ?? note.beat + note.duration,
        });
      if (group.length === 1 && result.has(group[0].id))
        previous = {
          midi: group[0].midi,
          beat,
          finger: result.get(group[0].id).finger,
        };
      else previous = null;
      i = end;
    }
  }
  return result;
}
