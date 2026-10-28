import {assembleScoreTiming} from './score-timing.mjs';
import { validateScore } from './score.mjs';
import { normalizeOmrReview, omrReviewIssues } from './omr-review.mjs';
import {auditWrittenNotation,auditWrittenCoverage} from './recognition-notation.mjs';

const EPSILON = 0.00001;
const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const clean = (value, limit = 180) => String(value ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, limit);
const noteId = note => String(note?.id ?? note?.noteId ?? '');

export const FULL_SCORE_PDF_LIMIT_BYTES = 50 * 1024 * 1024;

export async function validateFullScorePdfUpload(file) {
  if (!(file instanceof Blob) || !file.size || file.size > FULL_SCORE_PDF_LIMIT_BYTES) throw new Error('请选择不超过 50 MB 的 PDF 文件。');
  const header = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
  if (!header.includes('%PDF-')) throw new Error('文件内容不是 PDF，请上传真正的钢琴谱 PDF。');
  return file;
}

/**
 * Preserve the actual ink around a detected grand staff, including ledger notes
 * and ottava text. Neighboring staves define each system's vertical partition;
 * the detected five-line box alone is not a safe musical-content boundary.
 */
export function completePianoSystemRects(image, layout) {
  const { width, height, data } = image || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || !data || ![width * height, width * height * 4].includes(data.length)) throw new Error('无法检查原谱边缘的音乐符号。');
  const systems = layout.systems || [], channels = data.length === width * height ? 1 : 4;
  const firstLine = system => system.staffs?.[0]?.lines?.[0] ?? system.rect.y;
  const lastLine = system => system.staffs?.at(-1)?.lines?.at(-1) ?? system.rect.y + system.rect.height;
  const dark = index => channels === 1 ? data[index] < 180 : data[index * 4 + 3] > 16 && (data[index * 4] + data[index * 4 + 1] + data[index * 4 + 2]) / 3 < 180;
  const separators=systems.slice(0,-1).map((system,index)=>{
    const next=systems[index+1],from=Math.ceil(lastLine(system)+1),to=Math.floor(firstLine(next));
    const left=Math.max(0,Math.floor(Math.min(system.rect.x,next.rect.x))),right=Math.min(width,Math.ceil(Math.max(system.rect.x+system.rect.width,next.rect.x+next.rect.width)));
    let run=-1,bestStart=-1,bestLength=0;
    for(let y=from;y<=to;y++){let ink=false;if(y<to)for(let x=left;x<right;x++)if(dark(y*width+x)){ink=true;break;}
      if(y<to&&!ink){if(run<0)run=y;}else if(run>=0){if(y-run>bestLength){bestStart=run;bestLength=y-run;}run=-1;}}
    return bestLength>=2?bestStart+bestLength/2:(lastLine(system)+firstLine(next))/2;
  });
  return systems.map((system, index) => {
    const spaces = (system.staffs || []).map(staff => staff.spacing || (staff.lines[4] - staff.lines[0]) / 4).filter(value => finitePositive(value));
    const spacing = spaces.length ? spaces.reduce((sum, value) => sum + value, 0) / spaces.length : 6;
    const partitionTop = index ? separators[index-1] : Math.max(0, firstLine(system) - spacing * 12);
    const partitionBottom = index < systems.length - 1 ? separators[index] : Math.min(height, lastLine(system) + spacing * 12);
    const left = Math.max(0, Math.floor(system.rect.x - spacing * .65)), right = Math.min(width, Math.ceil(system.rect.x + system.rect.width + spacing * .65));
    let inkTop = Math.max(0, Math.floor(partitionTop)), inkBottom = Math.min(height, Math.ceil(partitionBottom)), firstInk = -1, lastInk = -1;
    for (let y = inkTop; y < inkBottom; y++) {
      for (let x = left; x < right; x++) if (dark(y * width + x)) { if (firstInk < 0) firstInk = y; lastInk = y; break; }
    }
    // Retain the original geometry if an unusual raster has no detected ink.
    if (firstInk >= 0) { inkTop = Math.max(inkTop, Math.floor(firstInk - spacing * .7)); inkBottom = Math.min(inkBottom, Math.ceil(lastInk + spacing * .7 + 1)); }
    else { inkTop = Math.floor(system.rect.y); inkBottom = Math.ceil(system.rect.y + system.rect.height); }
    return { id: system.id, rect: { x: left, y: Math.max(0, inkTop), width: right - left, height: Math.min(height, inkBottom) - Math.max(0, inkTop) }, partition: { top: partitionTop, bottom: partitionBottom } };
  });
}

function finitePositive(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0; }

function measureDurations(region) {
  if (Array.isArray(region.coverage?.measureDurations)) return region.coverage.measureDurations;
  const meter = region.score?.timeSignature || [4, 4], length = meter[0] * 4 / meter[1], count = region.durationBeats / length;
  return Number.isInteger(count) && count > 0 ? Array(count).fill(length) : [];
}

function crossLineTies(regions) {
  const issues = [], pairs = [];
  for (const [index, region] of regions.entries()) {
    const incoming = Array.isArray(region.continuity?.tieIn) ? region.continuity.tieIn : [], outgoing = Array.isArray(region.continuity?.tieOut) ? region.continuity.tieOut : [];
    if (incoming.some(tie => !tie || typeof tie !== 'object') || outgoing.some(tie => !tie || typeof tie !== 'object')) issues.push({ code: 'INVALID_CROSS_LINE_TIE', regionId: region.id, message: '跨行延音包含无效引用，请清除后重新指定。' });
    if (!index && incoming.length) issues.push({ code: 'OPEN_INITIAL_TIE', regionId: region.id, message: '首行存在未连接的前向延音，请对照原图修正。' });
    if (index === regions.length - 1 && outgoing.length) issues.push({ code: 'OPEN_FINAL_TIE', regionId: region.id, message: '末行仍有接向缺失谱行的延音，不能当作完整全谱。' });
    const next = regions[index + 1]; if (!next) continue;
    const nextIncoming = Array.isArray(next.continuity?.tieIn) ? [...next.continuity.tieIn] : [];
    for (const tie of outgoing) {
      if (!tie || typeof tie !== 'object') continue;
      const from = region.notes?.find(note => note.id === (tie.noteId ?? tie.id));
      const targetIndex = nextIncoming.findIndex(candidate => {
        if (!candidate || typeof candidate !== 'object') return false;
        const to = next.notes?.find(note => note.id === (candidate.noteId ?? candidate.id));
        return from && to && from.midi === to.midi && from.hand === to.hand && Math.abs(from.beat + from.duration - region.durationBeats) < EPSILON && Math.abs(to.beat) < EPSILON;
      });
      if (targetIndex < 0) issues.push({ code: 'BROKEN_CROSS_LINE_TIE', regionId: region.id, message: '相邻谱行延音的音高、手别或起止拍不相接。' });
      else { const [target] = nextIncoming.splice(targetIndex, 1); pairs.push({ fromRegionId: region.id, fromId: from.id, toRegionId: next.id, toId: target.noteId ?? target.id }); }
    }
    if (nextIncoming.length) issues.push({ code: 'UNMATCHED_INCOMING_TIE', regionId: next.id, message: '此行有未接上前一行的延音引用。' });
  }
  return { issues, pairs };
}

/** Normalize one local-timeline result without inventing missing positions. */
export function normalizeFullScoreRegionResult(region, result) {
  if (!result || !result.score || !Array.isArray(result.score.notes)) throw new Error('此谱行没有返回可编辑的音符结果。');
  const positions = new Map((result.positions || []).map(position => [String(position.noteId ?? position.id), position]));
  return {
    ...region,
    status: 'complete', reviewed: false, dirty: false, positionlessSource: result.positionlessSource === true,
    score: { ...result.score, notes: result.score.notes.map(note => ({ ...note })) },
    notes: result.score.notes.map((note, index) => {
      const position = positions.get(noteId(note));
      const validSpace = !position?.coordinateSpace || position.coordinateSpace === 'page';
      return { ...note, id: noteId(note) || `${region.id}-note-${index + 1}`, x: validSpace && isNumber(position?.x) ? position.x : null, y: validSpace && isNumber(position?.y) ? position.y : null };
    }),
    durationBeats: result.score.durationBeats,
    coverageComplete: result.coverage?.complete === true,
    coverage: structuredClone(result.coverage || {}),
    rests: structuredClone(result.rests || []),
    warnings: (result.warnings || []).map(warning => clean(warning, 600)),
    checks: structuredClone(result.checks || []),
    notationRequired: result.notationRequired === true,
    verification: structuredClone(result.verification || null),
    continuity: structuredClone(result.continuity || {}),
    internalTies: structuredClone(result.internalTies || []),
    ...normalizeOmrReview(result),
    error: null,
  };
}

/** Validate edits against the actual crop, exact event times and piano range. */
export function fullScoreRegionIssues(region, { requireReviewed = false } = {}) {
  const issues = [];
  const add = (code, message, extra = {}) => issues.push({ code, message, regionId: region.id, page: region.page, ...extra });
  for(const problem of omrReviewIssues(region))add(problem.code,problem.message);
  if (region.status !== 'complete') add('REGION_INCOMPLETE', region.error || '此谱行尚未识别成功。');
  if (!region.coverageComplete) add('COVERAGE_UNCONFIRMED', '尚未确认此谱行的全部小节均已转写。');
  if (!isNumber(region.durationBeats) || region.durationBeats <= 0 || region.durationBeats > 20000) add('INVALID_REGION_DURATION', '谱行总拍数须为大于 0 的数，并包含末尾休止。');
  if (!Array.isArray(region.notes) || !region.notes.length && !(region.rests?.length)) add('EMPTY_REGION', '此谱行没有音符或明确休止，不能视为已识别。');
  const ids = new Set();
  const rect = region.rect;
  if (!rect || !['x', 'y', 'width', 'height'].every(key => isNumber(rect[key])) || rect.width <= 0 || rect.height <= 0) add('INVALID_REGION_RECT', '缺少有效的原图范围。');
  for (const [index, note] of (region.notes || []).entries()) {
    const id = noteId(note), label = `第 ${index + 1} 个音符`;
    if (!id || ids.has(id)) add('INVALID_NOTE_ID', `${label}的标识缺失或重复。`, { noteId: id });
    ids.add(id);
    if (!Number.isInteger(note.midi) || note.midi < 21 || note.midi > 108) add('INVALID_MIDI', `${label}的音高须在钢琴 MIDI 21–108 内。`, { noteId: id });
    if (!isNumber(note.beat) || note.beat < 0 || !isNumber(note.duration) || note.duration < 1 / 1024 || note.duration > 256) add('INVALID_NOTE_TIME', `${label}的拍点或时值无效。`, { noteId: id });
    else if (isNumber(region.durationBeats) && note.beat + note.duration > region.durationBeats + EPSILON) add('NOTE_OUTSIDE_TIMELINE', `${label}超出此谱行总拍数，请补齐总拍数或修正音符。`, { noteId: id });
    if (!['left', 'right'].includes(note.hand)) add('INVALID_HAND', `${label}尚未指定左右手。`, { noteId: id });
    if ((!isNumber(note.x) || !isNumber(note.y)) && !region.positionlessSource) add('MISSING_POSITION', `${label}缺少原图位置，请选中该音符并在原图上点击定位。`, { noteId: id });
    else if (isNumber(note.x) && isNumber(note.y) && rect && (note.x < rect.x - EPSILON || note.y < rect.y - EPSILON || note.x > rect.x + rect.width + EPSILON || note.y > rect.y + rect.height + EPSILON)) add('POSITION_OUTSIDE_IMAGE', `${label}的位置在当前谱行原图之外。`, { noteId: id });
  }
  const bars = measureDurations(region), meter = region.score?.timeSignature || [4, 4], barLength = meter[0] * 4 / meter[1];
  if (!bars.length || bars.some(duration => !isNumber(duration) || duration <= 0 || duration > barLength + EPSILON) || Math.abs(bars.reduce((sum, duration) => sum + duration, 0) - region.durationBeats) > EPSILON || region.coverage?.measureCount !== undefined && region.coverage.measureCount !== bars.length) add('INVALID_MEASURE_DURATIONS', '每小节实际拍数与本行总拍数不一致；弱起请填写实际时长，不能补成整小节。');
  const rests = region.rests || [];
  for (const rest of rests) if (!isNumber(rest.beat) || !isNumber(rest.duration) || rest.beat < 0 || rest.duration <= 0 || rest.beat + rest.duration > region.durationBeats + EPSILON || !['right', 'left'].includes(rest.hand)) add('INVALID_REST', '休止的拍点、时值或手别无效。');
  for (const hand of ['right', 'left']) {
    const events = [...(region.notes || []).map(note => ({ ...note, kind: 'note' })), ...rests.map(rest => ({ ...rest, kind: 'rest' }))].filter(event => event.hand === hand && isNumber(event.beat) && isNumber(event.duration));
    const intervals = events.map(event => [event.beat, event.beat + event.duration]).sort((a, b) => a[0] - b[0]);
    let cursor = 0, gap = false;
    for (const [start, end] of intervals) { if (start > cursor + EPSILON) gap = true; cursor = Math.max(cursor, end); }
    if (cursor < region.durationBeats - EPSILON) gap = true;
    if (gap) add('UNEXPLAINED_TIME', `${hand === 'right' ? '右' : '左'}手有未以音符或休止解释的时段，请在休止表中补充。`);
    for (const voice of new Set(events.map(event => event.voice || `${hand}-1`))) {
      const unique = [...new Map(events.filter(event => (event.voice || `${hand}-1`) === voice).map(event => [`${event.beat}:${event.duration}:${event.kind}`, event])).values()].sort((a, b) => a.beat - b.beat);
      let previous;
      for (const event of unique) {
        if (previous && event.beat < previous.beat + previous.duration - EPSILON) { add('VOICE_OVERLAP', '同声部时值重叠：和弦须同起点同长度，独立声部请填写不同 voice。'); break; }
        if (!previous || previous.beat + previous.duration < event.beat + event.duration) previous = event;
      }
    }
  }
  const noteMap = new Map((region.notes || []).map(note => [note.id, note]));
  const tiePairs = new Set();
  for (const tie of region.internalTies || []) {
    const from = noteMap.get(tie?.fromNoteId), to = noteMap.get(tie?.toNoteId), key = `${tie?.fromNoteId}:${tie?.toNoteId}`;
    if (!from || !to || from.id === to.id || from.midi !== to.midi || from.hand !== to.hand || Math.abs(from.beat + from.duration - to.beat) > EPSILON || tiePairs.has(key)) add('INVALID_INTERNAL_TIE', '行内延音的音高、手别或时间引用无效；请修正延音勾选，不能静默重弹或删除。');
    tiePairs.add(key);
  }
  if(region.notationRequired&&!region.score?.recognitionEvidence)add('WRITTEN_EVIDENCE_MISSING','新转录缺少原谱书写证据。');
  if(region.score?.recognitionEvidence)try{
    const score={...region.score,notes:region.notes,rests,durationBeats:region.durationBeats};
    for(const p of [...auditWrittenNotation(score,bars,region.internalTies,region.continuity).issues,...auditWrittenCoverage(score,rests)])add(p.code,p.message,p);
  }catch(error){add('INVALID_NOTATION',error.message);}
  if (requireReviewed && !region.reviewed) add('REVIEW_REQUIRED', '此谱行尚未逐行审核确认。');
  return issues;
}

/** Every page and detected row needs an explicit disposition, including covers. */
export function fullScoreScopeIssues(draft) {
  const issues = [];
  const totalPages = draft.totalPages;
  const pages = draft.pages || [];
  if (!Number.isInteger(totalPages) || totalPages < 1 || pages.length !== totalPages || new Set(pages.map(page => page.page)).size !== totalPages || pages.some(page => page.page < 1 || page.page > totalPages)) issues.push({ code: 'UNSCANNED_PAGES', message: 'PDF 还有页面未完成检查，不能当作完整全谱。' });
  for (const page of pages) {
    if (!page.scanned || !['include', 'exclude'].includes(page.decision)) issues.push({ code: 'PAGE_UNDECIDED', page: page.page, message: `第 ${page.page} 页需决定识别或排除，封面也不能静默跳过。` });
    if (page.decision === 'exclude' && !['not-score', 'music'].includes(page.excludeReason)) issues.push({ code: 'PAGE_EXCLUSION_REASON', page: page.page, message: `第 ${page.page} 页尚未说明排除原因。` });
    if (page.decision === 'include') {
      const regions = (draft.regions || []).filter(region => region.page === page.page);
      if (!regions.some(region => region.selected)) issues.push({ code: 'PAGE_WITHOUT_REGIONS', page: page.page, message: `第 ${page.page} 页没有选中可识别的双手谱行。` });
      for (const region of regions) if (!region.selected && !['not-score', 'music'].includes(region.excludeReason)) issues.push({ code: 'REGION_EXCLUSION_REASON', regionId: region.id, page: page.page, message: `第 ${page.page} 页第 ${region.system} 行尚未说明排除原因。` });
    }
  }
  if (!(draft.regions || []).some(region => region.selected && pages.some(page => page.page === region.page && page.decision === 'include'))) issues.push({ code: 'NO_SELECTED_REGIONS', message: '请至少保留一个完整的钢琴双手谱行。' });
  const regionIds = new Set();
  for (const region of draft.regions || []) {
    if (!region.id || regionIds.has(region.id)) issues.push({ code: 'DUPLICATE_REGION_ID', message: '谱行标识缺失或重复，请重新选择原图范围。' });
    regionIds.add(region.id);
  }
  for (const page of pages.filter(page => page.decision === 'include')) {
    const selected = (draft.regions || []).filter(region => region.page === page.page && region.selected && region.rect);
    for (let first = 0; first < selected.length; first++) for (let second = first + 1; second < selected.length; second++) {
      const a = selected[first].rect, b = selected[second].rect;
      const overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      if (overlap > Math.min(a.width * a.height, b.width * b.height) * .3) issues.push({ code: 'OVERLAPPING_REGIONS', page: page.page, message: `第 ${page.page} 页的选中谱行大幅重叠，可能重复识别同一小节。请替换或排除重复范围。` });
    }
  }
  return issues;
}

export function fullScoreReviewSummary(draft) {
  const includedPages = new Set((draft.pages || []).filter(page => page.decision === 'include').map(page => page.page));
  const selected = (draft.regions || []).filter(region => includedPages.has(region.page) && region.selected).sort((a, b) => a.page - b.page || a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const ties = crossLineTies(selected);
  const issues = [...fullScoreScopeIssues(draft), ...selected.flatMap(region => fullScoreRegionIssues(region, { requireReviewed: true })), ...ties.issues];
  const noteCount = selected.reduce((count, region) => count + (region.notes?.length || 0), 0);
  const durationBeats = selected.reduce((duration, region) => duration + (isNumber(region.durationBeats) ? region.durationBeats : 0), 0);
  if (noteCount > 10000) issues.push({ code: 'TOO_MANY_NOTES', message: '全谱超过当前 App 的 10,000 音符上限，请拆成明确命名的练习片段。' });
  if (durationBeats > 20000) issues.push({ code: 'TOO_LONG', message: '总长度超过当前 App 的 20,000 拍上限。' });
  const musicExcluded = (draft.pages || []).some(page => page.decision === 'exclude' && page.excludeReason === 'music') || (draft.regions || []).some(region => includedPages.has(region.page) && !region.selected && region.excludeReason === 'music');
  return { canImport: issues.length === 0, complete: issues.length === 0 && !musicExcluded, musicExcluded, issues, selected, selectedCount: selected.length, recognizedCount: selected.filter(region => region.status === 'complete').length, reviewedCount: selected.filter(region => region.reviewed).length, noteCount, durationBeats, includedPageCount: includedPages.size };
}

/** Build a portable score and original-image map only after explicit review. */
export function assembleFullScoreReview(draft) {
  const summary = fullScoreReviewSummary(draft);
  if (!summary.canImport) throw Object.assign(new Error(summary.issues[0]?.message || '全谱尚未完成校对。'), { issues: summary.issues });
  const firstScore = summary.selected.find(region => region.score)?.score || {};
  const title = clean(draft.title || firstScore.title || '导入的钢琴谱');
  const identity = clean(draft.id || Date.now().toString(36), 45).replace(/[^\w-]/g, '-');
  const written=summary.selected.every(r=>r.score?.recognitionEvidence);
  const timingParts = [], scoreNotes = [], systems = [], positions = [], measureMap = [], localIds = new Map(),rests=[];
  const evidence={version:1,notes:[],rests:[],clefs:[],keys:[],voices:[],graces:[],sources:[]};
  let startBeat = 0, measure = 1;
  for (const [systemIndex, region] of summary.selected.entries()) {
    const firstMeasure = measure;
    timingParts.push({score:{...region.score,notes:region.notes},offset:startBeat});
    let localBeat = 0;
    for (const [barIndex,duration] of measureDurations(region).entries()) { measureMap.push({ timeSignature: [...(region.coverage?.measureTimeSignatures?.[barIndex]||region.score.timeSignature)],...(written?{keySignature:region.score.measureMap?.[barIndex]?.keySignature??region.score.keySignature}:{}), measure: measure++, page: region.page, system: region.system, beat: startBeat + localBeat, duration, implicit: duration < (region.score?.timeSignature || [4, 4])[0] * 4 / (region.score?.timeSignature || [4, 4])[1] - EPSILON }); localBeat += duration; }
    systems.push({ id: region.id, assetId: region.assetId || region.id, page: region.page, system: region.system, rect: { ...region.rect }, imageUrl: region.imageUrl || '', pageWidth: region.pageWidth, pageHeight: region.pageHeight, firstMeasure, lastMeasure: measure - 1, startBeat, endBeat: startBeat + region.durationBeats });
    region.notes.forEach((note, index) => {
      const id = `r${systemIndex + 1}-n${index + 1}-${identity}`;
      localIds.set(`${region.id}:${note.id}`, id);
      scoreNotes.push({...(written?note:{}), id, midi: note.midi, beat: startBeat + note.beat, duration: note.duration, hand: note.hand, velocity: note.velocity ?? (note.hand === 'left' ? .55 : .78) });
      if (isNumber(note.x) && isNumber(note.y)) positions.push({ noteId: id, page: region.page, system: region.system, systemId: region.id, x: note.x, y: note.y, beat: startBeat + note.beat, duration: note.duration, midi: note.midi, hand: note.hand });
    });
    if(written){
      const e=region.score.recognitionEvidence;
      for(const [i,n]of e.notes.entries())if(!localIds.has(`${region.id}:${n.noteId}`))localIds.set(`${region.id}:${n.noteId}`,`r${systemIndex+1}-grace${i}-${identity}`);
      const rename=id=>localIds.get(`${region.id}:${id}`),restId=id=>`r${systemIndex+1}-${id}-${identity}`;
      evidence.notes.push(...e.notes.map(n=>({...n,noteId:rename(n.noteId)})));
      evidence.rests.push(...e.rests.map(r=>({...r,restId:restId(r.restId)})));
      for(const key of ['clefs','keys'])evidence[key].push(...e[key].map(k=>({...k,beat:k.beat+startBeat})));
      evidence.voices.push(...e.voices.map(v=>({...v,from:v.from+startBeat,to:v.to+startBeat})));
      evidence.graces.push(...(e.graces||[]).map(g=>({...g,noteId:rename(g.noteId),anchor:rename(g.anchor),beat:g.beat+startBeat})));
      evidence.sources.push({regionId:region.id,...e.source});
      rests.push(...(region.rests||[]).map(r=>({...r,id:restId(r.id),beat:r.beat+startBeat})));
    }
    startBeat += region.durationBeats;
  }
  const roots = new Map(scoreNotes.map(note => [note.id, note.id])), merged = new Map(scoreNotes.map(note => [note.id, note]));
  const mergeTie = (fromLocalId, toLocalId) => {
    const fromId = roots.get(localIds.get(fromLocalId)), toId = roots.get(localIds.get(toLocalId));
    const from = merged.get(fromId), to = merged.get(toId);
    if (!from || !to || fromId === toId || Math.abs(from.beat + from.duration - to.beat) > EPSILON) throw new Error('延音的播放时间不相接。');
    if(written){from.tieTo=toId;return;}
    from.duration += to.duration; merged.delete(toId);
    for (const [id, root] of roots) if (root === toId) roots.set(id, fromId);
  };
  for (const region of summary.selected) for (const tie of region.internalTies || []) mergeTie(`${region.id}:${tie.fromNoteId}`, `${region.id}:${tie.toNoteId}`);
  for (const pair of crossLineTies(summary.selected).pairs) mergeTie(`${pair.fromRegionId}:${pair.fromId}`, `${pair.toRegionId}:${pair.toId}`);
  for (const position of positions) position.noteId = roots.get(position.noteId);
  const scopeLabel = summary.complete ? '全谱 · 已逐行人工审核' : '所选片段 · 已排除部分谱面';
  const source = { kind: 'pdf-ai-reviewed', label: `${clean(draft.source?.label || '用户上传 PDF', 130)} · ${scopeLabel}`, ...(draft.source?.url ? { url: draft.source.url } : {}), ...(draft.source?.license ? { license: draft.source.license } : {}) };
  const score = validateScore({ version: 1, id: `full-score-${identity}`, title: `${title} · ${summary.complete ? '全谱' : '所选谱段'}`, composer: draft.composer || firstScore.composer || '未知', tempo: draft.tempo || firstScore.tempo || 90, timeSignature: draft.timeSignature || firstScore.timeSignature || [4, 4], keySignature: draft.keySignature ?? firstScore.keySignature ?? 0, source, ...assembleScoreTiming(timingParts), durationBeats: startBeat, measureMap,...(written?{recognitionEvidence:evidence,rests}:{}), notes: [...merged.values()].map(({fermata,...n})=>n) });
  return {
    score,
    sourceNotation: { version: 1, coordinateSpace: 'page', coordinateUnit: 'page-image-pixels', scoreId: score.id, title: score.title, source, pageCount: draft.totalPages, durationBeats: score.durationBeats, measureMap, systems, notes: positions,...(written?{rests:rests.flatMap(r=>(r.sourcePositions||[]).map(p=>({...p,restId:r.id,beat:r.beat,duration:r.duration,voice:r.voice,staff:r.staff})))}:{}), notePositionsComplete: summary.selected.every(r => r.notes.every(n => isNumber(n.x) && isNumber(n.y))) },
    measureMap,
    reviewStatus: { complete: summary.complete, reviewed: true, method: 'user-reviewed-every-selected-system', reviewedAt: new Date().toISOString(), totalPages: draft.totalPages, includedPages: summary.includedPageCount, regionCount: summary.selectedCount, noteCount: score.notes.length, reviewedRegionIds: summary.selected.map(region => region.id), excludedPages: (draft.pages || []).filter(page => page.decision === 'exclude').map(page => ({ page: page.page, reason: page.excludeReason })), excludedRegions: (draft.regions || []).filter(region => !region.selected).map(region => ({ id: region.id, page: region.page, system: region.system, reason: region.excludeReason })) },
  };
}
