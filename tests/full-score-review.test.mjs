import test from 'node:test';
import assert from 'node:assert/strict';
import { FULL_SCORE_PDF_LIMIT_BYTES, validateFullScorePdfUpload, completePianoSystemRects, normalizeFullScoreRegionResult, fullScoreRegionIssues, fullScoreScopeIssues, fullScoreReviewSummary, assembleFullScoreReview } from '../lib/full-score-review.mjs';
import { normalizeSourceNotation, sourcePositionAtBeat } from '../src/source-notation.js';

test('automatic corrections and unresolved-source audits survive normalization and keep review blocked',()=>{
  const region={id:'unrelated-row',page:1,rect:{x:0,y:0,width:300,height:200}};
  const result={score:{notes:[],durationBeats:4},coverage:{complete:true,measureDurations:[4],measureCount:1},
    corrections:[{kind:'grace-timing',description:'explicit grace',evidence:'source notation'}],
    sourceHeadAudit:{detected:1,mapped:0,unmapped:[{id:'head',x:50,y:40,staff:1,pitch:0}]},
    tieAudit:{unresolved:[{description:'unmatched tie',noteIds:['n']}],reviewed:false}};
  const normalized=normalizeFullScoreRegionResult(region,result);
  assert.equal(normalized.corrections[0].kind,'grace-timing');
  const codes=fullScoreRegionIssues(normalized).map(e=>e.code);
  assert.ok(codes.includes('UNMAPPED_HEAD_REVIEW'));assert.ok(codes.includes('UNRESOLVED_TIE_REVIEW'));
});

// Deliberately unrelated to the bundled edition: three pages, a cover, 3/4
// meter, a one-beat pickup and a cross-page tie in a tiny invented test score.
function fixture() {
  const region = (id, page, duration, notes, rests, continuity) => ({
    id, page, system: 1, pageWidth: 480, pageHeight: 640,
    rect: { x: 20, y: 50, width: 400, height: 140 }, imageUrl: `blob:${id}`, assetId: id,
    selected: true, status: 'complete', reviewed: true, coverageComplete: true,
    durationBeats: duration, notes, rests, continuity,
    coverage: { complete: true, measureCount: 1, measureDurations: [duration] },
    score: { timeSignature: [3, 4], tempo: 96, keySignature: 0, composer: 'Test arranger' },
  });
  return {
    id: 'generic-pickup-test', title: '三拍练习曲', totalPages: 3, tempo: 96, timeSignature: [3, 4], keySignature: 0, source: { label: '测试上传 PDF' },
    pages: [{ page: 1, scanned: true, decision: 'exclude', excludeReason: 'not-score' }, { page: 2, scanned: true, decision: 'include' }, { page: 3, scanned: true, decision: 'include' }],
    regions: [
      region('pickup-page', 2, 1, [
        { id: 'high', midi: 72, beat: 0, duration: 1, hand: 'right', voice: 'right-1', x: 80, y: 85 },
        { id: 'low', midi: 48, beat: 0, duration: 1, hand: 'left', voice: 'left-1', x: 80, y: 155 },
      ], [], { tieIn: [], tieOut: [{ noteId: 'high' }] }),
      region('following-page', 3, 3, [
        { id: 'high', midi: 72, beat: 0, duration: 2, hand: 'right', voice: 'right-1', x: 90, y: 90 },
        { id: 'low', midi: 48, beat: 0, duration: 3, hand: 'left', voice: 'left-1', x: 90, y: 160 },
      ], [{ beat: 2, duration: 1, hand: 'right', voice: 'right-1' }], { tieIn: [{ noteId: 'high' }], tieOut: [] }),
    ],
  };
}

test('PDF size policy admits files above the old 20 MB limit and rejects invalid or oversized uploads', async () => {
  const large = new Blob(['%PDF-1.7\n', new Uint8Array(21 * 1024 * 1024)], { type: 'application/pdf' });
  assert.equal(await validateFullScorePdfUpload(large), large);
  assert.equal(FULL_SCORE_PDF_LIMIT_BYTES, 50 * 1024 * 1024);
  await assert.rejects(validateFullScorePdfUpload(new Blob(['a piano photograph'], { type: 'application/pdf' })), /内容不是 PDF/);
  await assert.rejects(validateFullScorePdfUpload(new Blob(['%PDF-', new Uint8Array(FULL_SCORE_PDF_LIMIT_BYTES)])), /不超过 50 MB/);
});

test('generic full-score review preserves pickup timing, all pages and cross-page tied playback', () => {
  const draft = fixture(), summary = fullScoreReviewSummary(draft);
  assert.equal(summary.canImport, true);
  assert.equal(summary.complete, true);
  const imported = assembleFullScoreReview(draft);
  assert.equal(imported.score.durationBeats, 4, 'one-beat pickup is not expanded into an empty 3/4 bar');
  assert.equal(imported.score.notes.length, 3, 'two visible tied heads become one sustained playback event');
  assert.deepEqual(imported.score.notes.filter(note => note.hand === 'right').map(note => [note.midi, note.beat, note.duration]), [[72, 0, 3]]);
  assert.deepEqual(imported.measureMap.map(measure => [measure.measure, measure.beat, measure.duration, measure.implicit]), [[1, 0, 1, true], [2, 1, 3, false]]);
  assert.equal(imported.sourceNotation.notes.length, 4, 'both printed tied heads remain available for source following');
  const layout = normalizeSourceNotation(imported.score, imported.sourceNotation);
  assert.equal(layout.systems.length, 2);
  assert.equal(sourcePositionAtBeat(layout, 1).systemIndex, 1);
  assert.equal(imported.reviewStatus.excludedPages[0].reason, 'not-score');
  assert.match(imported.score.title, /全谱$/);
});

test('full-rest systems retain their complete time without inventing a sounding note', () => {
  const draft = fixture();
  draft.regions[0].continuity.tieOut = [];
  const silent = draft.regions[1]; silent.notes = []; silent.continuity = { tieIn: [], tieOut: [] };
  silent.rests = [{ beat: 0, duration: 3, hand: 'right', voice: 'right-1' }, { beat: 0, duration: 3, hand: 'left', voice: 'left-1' }];
  assert.deepEqual(fullScoreRegionIssues(silent), []);
  assert.equal(fullScoreReviewSummary(draft).canImport, true);
  const imported = assembleFullScoreReview(draft);
  assert.equal(imported.score.notes.length, 2);
  assert.equal(imported.score.durationBeats, 4, 'three printed silent beats remain at the end');
  const layout = normalizeSourceNotation(imported.score, imported.sourceNotation);
  assert.equal(layout.systems[1].notes.length, 0);
  assert.equal(sourcePositionAtBeat(layout, 2).systemIndex, 1);
});

test('internal ties survive review edits and combine with cross-page ties without losing printed heads', () => {
  const draft = fixture(), region = draft.regions[1];
  region.notes[0].duration = 1;
  region.notes.push({ ...region.notes[0], id: 'continuation', beat: 1, x: 230 });
  region.internalTies = [{ fromNoteId: 'high', toNoteId: 'continuation' }];
  const raw = { score: { ...region.score, notes: region.notes, durationBeats: 3 }, positions: region.notes.map(note => ({ noteId: note.id, x: note.x, y: note.y, coordinateSpace: 'page' })), rests: region.rests, coverage: region.coverage, continuity: region.continuity, internalTies: region.internalTies };
  assert.deepEqual(normalizeFullScoreRegionResult(region, raw).internalTies, region.internalTies);
  assert.deepEqual(fullScoreRegionIssues(region), []);
  const imported = assembleFullScoreReview(draft);
  assert.deepEqual(imported.score.notes.filter(note => note.hand === 'right').map(note => [note.beat, note.duration]), [[0, 3]]);
  assert.equal(imported.sourceNotation.notes.filter(note => note.hand === 'right').length, 3);
  region.notes.at(-1).midi = 73;
  assert.ok(fullScoreRegionIssues(region).some(issue => issue.code === 'INVALID_INTERNAL_TIE'));
  assert.equal(fullScoreReviewSummary(draft).canImport, false);
});

test('system crops include actual ottava and ledger ink while keeping adjacent systems separate', () => {
  const width = 400, height = 640, data = new Uint8Array(width * height).fill(255);
  const paint = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) data[yy * width + xx] = 0; };
  const makeSystem = (index, upper, lower) => {
    const staffs = [upper, lower].map(top => ({ x: 30, width: 340, spacing: 4, lines: Array.from({ length: 5 }, (_, line) => top + line * 4) }));
    for (const staff of staffs) for (const y of staff.lines) paint(30, y, 340, 1);
    return { id: `generic-${index}`, rect: { x: 20, y: upper - 15, width: 360, height: lower + 26 - upper }, staffs };
  };
  const systems = [makeSystem(1, 80, 140), makeSystem(2, 300, 360), makeSystem(3, 480, 540)];
  paint(100, 267, 20, 6); // 8va text more than eight spaces above this staff.
  paint(160, 395, 7, 6);  // A low ledger note beyond the old fixed bottom margin.
  paint(200, 620, 30, 6); // Distant page footer is not part of the last system.
  const rects = completePianoSystemRects({ width, height, data }, { systems });
  const middle = rects[1].rect;
  assert.ok(middle.y <= 267);
  assert.ok(middle.y + middle.height >= 401);
  assert.ok(rects[0].rect.y + rects[0].rect.height <= middle.y);
  assert.ok(middle.y + middle.height <= rects[2].rect.y);
  assert.ok(rects[2].rect.y + rects[2].rect.height < 620);
});

test('a cover or unscanned page cannot disappear silently from full-document coverage', () => {
  const draft = fixture(); draft.pages[0].decision = 'pending';
  assert.ok(fullScoreScopeIssues(draft).some(issue => issue.code === 'PAGE_UNDECIDED'));
  assert.equal(fullScoreReviewSummary(draft).canImport, false);
  draft.pages.pop();
  assert.ok(fullScoreScopeIssues(draft).some(issue => issue.code === 'UNSCANNED_PAGES'));
  assert.throws(() => assembleFullScoreReview(draft));
});

test('failed, incomplete and unreviewed systems each prevent full-score import', () => {
  for (const change of [region => { region.status = 'failed'; }, region => { region.reviewed = false; }, region => { region.coverageComplete = false; }]) {
    const draft = fixture(); change(draft.regions[1]);
    assert.equal(fullScoreReviewSummary(draft).canImport, false);
    assert.throws(() => assembleFullScoreReview(draft));
  }
});

test('a manually added overlapping crop cannot duplicate the same music silently', () => {
  const draft = fixture();
  draft.regions.push({ ...structuredClone(draft.regions[0]), id: 'duplicate-crop', system: 2 });
  assert.ok(fullScoreScopeIssues(draft).some(issue => issue.code === 'OVERLAPPING_REGIONS'));
  assert.equal(fullScoreReviewSummary(draft).canImport, false);
  draft.regions.at(-1).selected = false; draft.regions.at(-1).excludeReason = 'not-score';
  assert.equal(fullScoreScopeIssues(draft).length, 0);
});

test('recognition result does not fabricate missing or wrong-coordinate-space source positions', () => {
  const region = fixture().regions[0];
  const recognized = normalizeFullScoreRegionResult(region, { score: { ...region.score, durationBeats: 1, notes: region.notes }, positions: [{ noteId: 'high', x: .1, y: .1, coordinateSpace: 'normalized' }], rests: [], coverage: region.coverage });
  assert.equal(recognized.reviewed, false, 'model completion is not human approval');
  assert.equal(recognized.notes[0].x, null);
  assert.equal(recognized.notes[1].y, null);
  assert.ok(fullScoreRegionIssues(recognized).some(issue => issue.code === 'MISSING_POSITION'));
  assert.throws(() => normalizeFullScoreRegionResult(region, { image: 'a piano photograph' }), /没有返回可编辑的音符/);
});

test('every added note needs a unique identity, piano-range pitch and a position inside its actual crop', () => {
  const draft = fixture(), region = draft.regions[0];
  region.notes.push({ ...region.notes[0], id: 'added', midi: 64, voice: 'right-2', x: null, y: null });
  assert.ok(fullScoreRegionIssues(region).some(issue => issue.code === 'MISSING_POSITION'));
  Object.assign(region.notes.at(-1), { x: 150, y: 105 });
  assert.equal(fullScoreRegionIssues(region).length, 0);
  region.notes.at(-1).x = 900;
  assert.ok(fullScoreRegionIssues(region).some(issue => issue.code === 'POSITION_OUTSIDE_IMAGE'));
  region.notes.at(-1).midi = 109;
  assert.ok(fullScoreRegionIssues(region).some(issue => issue.code === 'INVALID_MIDI'));
  region.notes.at(-1).id = region.notes[0].id;
  assert.ok(fullScoreRegionIssues(region).some(issue => issue.code === 'INVALID_NOTE_ID'));
});

test('deleting sounding events requires explicit rests rather than silently closing the timeline', () => {
  const draft = fixture(), region = draft.regions[1];
  region.notes = region.notes.filter(note => note.hand !== 'left');
  assert.ok(fullScoreRegionIssues(region).some(issue => issue.code === 'UNEXPLAINED_TIME'));
  region.rests.push({ beat: 0, duration: 3, hand: 'left', voice: 'left-1' });
  assert.equal(fullScoreRegionIssues(region).length, 0);
  assert.equal(assembleFullScoreReview(draft).score.durationBeats, 4);
});

test('polyphony must use distinct voices while ordinary equal-duration chords remain valid', () => {
  const region = fixture().regions[1];
  region.notes.push({ id: 'inner', midi: 67, beat: 1, duration: 1, hand: 'right', voice: 'right-1', x: 210, y: 100 });
  assert.ok(fullScoreRegionIssues(region).some(issue => issue.code === 'VOICE_OVERLAP'));
  region.notes.at(-1).voice = 'right-2';
  assert.equal(fullScoreRegionIssues(region).length, 0);
  region.notes.push({ ...region.notes[0], id: 'chord', midi: 76, x: 90, y: 75 });
  assert.equal(fullScoreRegionIssues(region).length, 0);
});

test('weak measures, tail rests and cross-line ties must agree with the original time ranges', () => {
  const draft = fixture();
  draft.regions[0].coverage.measureDurations = [3];
  assert.ok(fullScoreRegionIssues(draft.regions[0]).some(issue => issue.code === 'INVALID_MEASURE_DURATIONS'));
  draft.regions[0].coverage.measureDurations = [1];
  draft.regions[1].notes[0].midi = 73;
  assert.ok(fullScoreReviewSummary(draft).issues.some(issue => issue.code === 'BROKEN_CROSS_LINE_TIE'));
  assert.throws(() => assembleFullScoreReview(draft));
});

test('intentionally excluded music is named as a selected excerpt and never a complete score', () => {
  const draft = fixture();
  draft.pages[2].decision = 'exclude'; draft.pages[2].excludeReason = 'music';
  draft.regions[0].continuity.tieOut = [];
  const summary = fullScoreReviewSummary(draft);
  assert.equal(summary.canImport, true);
  assert.equal(summary.complete, false);
  const imported = assembleFullScoreReview(draft);
  assert.match(imported.score.title, /所选谱段$/);
  assert.equal(imported.reviewStatus.complete, false);
});

test('positionless digital results can be reviewed without inventing original-head coordinates',()=>{
  const raw={score:{durationBeats:4,timeSignature:[4,4],notes:[{id:'r',midi:60,beat:0,duration:4,hand:'right'},{id:'l',midi:48,beat:0,duration:4,hand:'left'}]},positions:[],positionlessSource:true,coverage:{complete:true,measureCount:1,measureDurations:[4]}};
  const base={id:'digital',page:1,system:1,selected:true,rect:{x:0,y:0,width:300,height:200}};
  const region=normalizeFullScoreRegionResult(base,raw);
  assert.deepEqual(fullScoreRegionIssues(region),[]);assert.equal(region.notes[0].x,null);
  const required=normalizeFullScoreRegionResult(base,{...raw,positionlessSource:false});
  assert.ok(fullScoreRegionIssues(required).some(issue=>issue.code==='MISSING_POSITION'));
});
