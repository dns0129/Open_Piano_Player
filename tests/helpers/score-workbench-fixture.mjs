export function workbenchFixture() {
  const systems = Array.from({ length: 4 }, (_, i) => ({
    id: "row-" + i,
    page: Math.floor(i / 2) + 1,
    system: (i % 2) + 1,
    startBeat: i * 4,
    endBeat: i * 4 + 4,
    rect: { x: 20, y: 50 + (i % 2) * 330, width: 800, height: 250 },
    pageWidth: 850,
    pageHeight: 1150,
    staffLines: {
      right: [115, 125, 135, 145, 155].map((y) => y + (i % 2) * 330),
      left: [205, 215, 225, 235, 245].map((y) => y + (i % 2) * 330),
    },
  }));
  const score = {
    id: "workbench-score",
    title: "整页对照练习曲",
    tempo: 96,
    keySignature: 0,
    timeSignature: [4, 4],
    durationBeats: 16,
    notes: systems.flatMap((s, i) => [
      {
        id: "a" + i,
        midi: 72,
        beat: i * 4,
        duration: 1,
        hand: "right",
        voice: "right-1",
      },
      {
        id: "b" + i,
        midi: 74,
        beat: i * 4 + 2,
        duration: 1,
        hand: "right",
        voice: "right-1",
      },
      {
        id: "l" + i,
        midi: 48,
        beat: i * 4,
        duration: 4,
        hand: "left",
        voice: "left-1",
      },
    ]),
    rests: [],
  };
  const image = (s) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="250"><rect width="800" height="250" fill="white"/><g stroke="#34483d">${[65, 75, 85, 95, 105, 155, 165, 175, 185, 195].map((y) => `<path d="M20 ${y}H780"/>`).join("")}<path d="M20 65V195M400 65V195M780 65V195"/></g><g fill="#34483d"><ellipse cx="140" cy="80" rx="8" ry="5"/><ellipse cx="460" cy="70" rx="8" ry="5"/><ellipse cx="140" cy="180" rx="8" ry="5"/></g><g stroke="#34483d"><path d="M148 80V40M468 70V30M132 180V220"/></g><text x="25" y="28" font-size="16">${score.title} · 第 ${s.system} 行</text></svg>`)}`;
  const notation = {
    version: 1,
    coordinateSpace: "page",
    scoreId: score.id,
    systems: systems.map((s) => ({ ...s, imageUrl: image(s) })),
    notes: systems.flatMap((s, i) =>
      [
        { noteId: "a" + i, x: 160, y: s.rect.y + 80, beat: i * 4 },
        { noteId: "b" + i, x: 480, y: s.rect.y + 70, beat: i * 4 + 2 },
        { noteId: "l" + i, x: 160, y: s.rect.y + 180, beat: i * 4 },
      ].map((n) => ({
        ...n,
        systemId: s.id,
        page: s.page,
        system: s.system,
        duration: score.notes.find((v) => v.id === n.noteId).duration,
        midi: score.notes.find((v) => v.id === n.noteId).midi,
        hand: score.notes.find((v) => v.id === n.noteId).hand,
      })),
    ),
  };
  return { score, sourceRecord: { notation, assets: [] } };
}
