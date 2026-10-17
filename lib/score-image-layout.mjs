/** Geometry only: no model calls, no browser dependency, and no song-specific coordinates. */
export function normalizeCropRect(rect, width, height) {
  if (![width, height].every(n => Number.isFinite(n) && n > 0) || !rect || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(rect[k])) || rect.width <= 0 || rect.height <= 0) throw new Error('请选择有效的谱面区域。');
  const x = Math.max(0, Math.floor(rect.x)), y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(Math.floor(width), Math.ceil(rect.x + rect.width)), bottom = Math.min(Math.floor(height), Math.ceil(rect.y + rect.height));
  if (right <= x || bottom <= y) throw new Error('所选区域不在谱面范围内。');
  return { x, y, width: right - x, height: bottom - y };
}

function grayData({ width, height, data }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 20 || height < 20 || !data || ![width * height, width * height * 4].includes(data.length)) throw new Error('谱面像素数据无效。');
  if (data.length === width * height) return data;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4, alpha = data[j + 3] / 255;
    gray[i] = (data[j] * .299 + data[j + 1] * .587 + data[j + 2] * .114) * alpha + 255 * (1 - alpha);
  }
  return gray;
}

function musicalInkEvidence(gray, width, height, staff, threshold) {
  const spacing = staff.spacing, blobs = [];
  const left = Math.max(0, Math.floor(staff.x + spacing * 3)), right = Math.min(width, Math.ceil(staff.x + staff.width - spacing));
  const top = Math.max(0, Math.floor(staff.lines[0] - spacing * 3)), bottom = Math.min(height, Math.ceil(staff.lines[4] + spacing * 3));
  const lineMargin = Math.max(.8, spacing * .12);
  let offLineInk = 0;
  for (let y = top; y < bottom; y++) {
    if (staff.lines.some(line => Math.abs(y - line) <= lineMargin)) continue;
    let start = -1;
    for (let x = left; x <= right; x++) {
      const dark = x < right && gray[y * width + x] < threshold;
      if (dark) { offLineInk++; if (start < 0) start = x; }
      if ((dark || start < 0) && x !== right) continue;
      if (start < 0) continue;
      const runWidth = x - start;
      if (runWidth >= spacing * .45 && runWidth <= spacing * 2.6) {
        const match = blobs.findLast(blob => y - blob.bottom <= spacing * .4 + 1 && start <= blob.right + spacing * .2 && x >= blob.left - spacing * .2);
        if (match) { match.left = Math.min(match.left, start); match.right = Math.max(match.right, x); match.bottom = y; }
        else blobs.push({ left: start, right: x, top: y, bottom: y });
      }
      start = -1;
    }
  }
  const noteLikeComponents = blobs.filter(blob => blob.bottom - blob.top + 1 >= spacing * .2 && blob.bottom - blob.top + 1 <= spacing * 2 && blob.right - blob.left <= spacing * 3).length;
  return { noteLikeComponents, offLineInk };
}

/** Detect long, regular horizontal five-line staffs, then pair nearby staffs into piano systems. */
export function detectScoreSystems(image, options = {}) {
  const { width, height } = image, gray = grayData(image);
  const threshold = options.inkThreshold ?? 150;
  // Long thin lines become gray after JPEG/PDF resampling. Keep the darker
  // threshold for note evidence, but recover those lines for geometry.
  const lineThreshold = options.lineThreshold ?? Math.max(threshold, 210);
  const minCoverage = options.minLineCoverage ?? .28;
  const minRun = options.minLineRun ?? .16;
  const bands = [];
  for (let y = 0; y < height; y++) {
    let count = 0, run = 0, longest = 0;
    for (let x = 0; x < width; x++) {
      if (gray[y * width + x] < lineThreshold) { count++; run++; longest = Math.max(longest, run); }
      else run = 0;
    }
    if (count / width < minCoverage || longest / width < minRun) continue;
    const previous = bands.at(-1);
    if (previous && y <= previous.bottom + 1) { previous.bottom = y; previous.rows.push({ y, count }); }
    else bands.push({ top: y, bottom: y, rows: [{ y, count }] });
  }
  for (const band of bands) {
    const total = band.rows.reduce((s, r) => s + r.count, 0);
    // Dense beams may touch a staff line. Its strongest horizontal rows locate the line,
    // while a weighted average of the whole dark band drifts toward the beam.
    const peak = Math.max(...band.rows.map(row => row.count));
    const strongest = band.rows.filter(row => row.count >= peak * .9);
    band.y = strongest.reduce((s, r) => s + r.y, 0) / strongest.length;
    band.support = total / band.rows.length / width;
  }
  const candidates = [];
  const maxSpacing = Math.max(8, Math.min(65, width * .04));
  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < Math.min(bands.length, i + 5); j++) {
      const spacing = bands[j].y - bands[i].y;
      if (spacing < 2 || spacing > maxSpacing) continue;
      const selected = [i, j]; let error = 0;
      for (let line = 2; line < 5; line++) {
        const expected = bands[i].y + spacing * line;
        let best = -1, delta = Infinity;
        for (let k = selected.at(-1) + 1; k < bands.length && bands[k].y <= expected + spacing * .3 + 1; k++) {
          const d = Math.abs(bands[k].y - expected);
          if (d < delta) { delta = d; best = k; }
        }
        if (best < 0 || delta > Math.max(1.5, spacing * .3 + 1)) break;
        selected.push(best); error += delta / spacing;
      }
      if (selected.length !== 5) continue;
      const fittedSpacing = (bands[selected[4]].y - bands[selected[0]].y) / 4;
      if (selected.some((index, line) => Math.abs(bands[index].y - bands[selected[0]].y - fittedSpacing * line) > Math.max(1.5, fittedSpacing * .18))) continue;
      const support = selected.reduce((s, k) => s + bands[k].support, 0) / 5;
      candidates.push({ indices: selected, spacing: fittedSpacing, score: support - error * .15 - (j - i - 1) * .015 });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.spacing - b.spacing);
  const used = new Set(), staffs = [], nonStaffLineGroups = [];
  for (const candidate of candidates) {
    if (candidate.indices.some(i => used.has(i))) continue;
    // A six-string TAB is not a five-line staff: never slide a 5-line window over it.
    const firstY = bands[candidate.indices[0]].y, lastY = bands[candidate.indices.at(-1)].y;
    const lineSupport = candidate.indices.reduce((sum, i) => sum + bands[i].support, 0) / 5;
    const extra = bands.findIndex((band, i) => !candidate.indices.includes(i) && band.support >= lineSupport * .85 && (Math.abs(band.y - (firstY - candidate.spacing)) < Math.max(1.5, candidate.spacing * .18) || Math.abs(band.y - (lastY + candidate.spacing)) < Math.max(1.5, candidate.spacing * .18)));
    if (extra >= 0) {
      const lines = [...candidate.indices, extra].map(i => bands[i].y).sort((a,b) => a-b);
      if (!nonStaffLineGroups.some(group => Math.abs(group.lines[0] - lines[0]) < candidate.spacing)) nonStaffLineGroups.push({ lines, lineCount: lines.length, spacing: candidate.spacing });
      continue;
    }
    candidate.indices.forEach(i => used.add(i));
    const lines = candidate.indices.map(i => bands[i].y), activeColumns = [];
    for (let x = 0; x < width; x++) {
      let support = 0;
      for (const index of candidate.indices) {
        const band = bands[index]; let dark = false;
        for (let y = band.top; y <= band.bottom; y++) if (gray[y * width + x] < lineThreshold) { dark = true; break; }
        if (dark) support++;
      }
      if (support >= 3) activeColumns.push(x);
    }
    if (!activeColumns.length) continue;
    const staff = { lines, spacing: candidate.spacing, x: activeColumns[0], width: activeColumns.at(-1) - activeColumns[0] + 1, lineThicknessRatio: Math.max(...candidate.indices.map(i => bands[i].bottom - bands[i].top + 1)) / candidate.spacing, confidence: Math.max(.4, Math.min(.99, candidate.score + .2)) };
    Object.assign(staff, musicalInkEvidence(gray, width, height, staff, threshold));
    staffs.push(staff);
  }
  staffs.sort((a, b) => a.lines[0] - b.lines[0]);
  const gaps = staffs.slice(0, -1).map((s, i) => (staffs[i + 1].lines[0] - s.lines[4]) / ((s.spacing + staffs[i + 1].spacing) / 2));
  const plausible = gaps.filter(g => g > .5 && g < 12);
  let pairLimit = Math.min(12, Math.max(7.8, plausible.length ? Math.min(...plausible) * 1.15 : 7.8));
  // A complete page can consistently alternate hand gaps and larger row gaps,
  // even when the distance between hands varies with ledger notes. Only widen
  // the limit when every proposed hand gap is smaller than every row gap.
  if (staffs.length >= 4 && staffs.length % 2 === 0) {
    const handGaps = gaps.filter((_, index) => index % 2 === 0);
    const rowGaps = gaps.filter((_, index) => index % 2 === 1);
    const widestHand = Math.max(...handGaps), narrowestRow = Math.min(...rowGaps);
    if (Math.min(...handGaps) > .4 && widestHand < 12 && narrowestRow - widestHand > .5) {
      pairLimit = Math.max(pairLimit, Math.min(12, (widestHand + narrowestRow) / 2));
    }
  }
  const groups = [];
  for (let i = 0; i < staffs.length; i++) {
    const current = staffs[i], next = staffs[i + 1];
    const gap = gaps[i], similarSpacing = next && Math.abs(current.spacing - next.spacing) / Math.max(current.spacing, next.spacing) < .2;
    const overlap = next ? Math.min(current.x + current.width, next.x + next.width) - Math.max(current.x, next.x) : 0;
    const paired = options.staffsPerSystem !== 1 && next && similarSpacing && gap > .4 && gap <= pairLimit && overlap > Math.min(current.width, next.width) * .7;
    groups.push(paired ? [current, staffs[++i]] : [current]);
  }
  const systems = groups.map((group, index) => {
    const first = group[0], last = group.at(-1), spacing = group.reduce((s, staff) => s + staff.spacing, 0) / group.length;
    const left = Math.min(...group.map(s => s.x)) - spacing * 4, right = Math.max(...group.map(s => s.x + s.width)) + spacing * 1.2;
    // First-system tempo/metronome marks commonly sit several spaces above the staff.
    // Preserve that musical header in the actual first crop, not only an optional preview.
    let top = first.lines[0] - spacing * (index === 0 ? 5.5 : 3.3), bottom = last.lines[4] + spacing * 2.6;
    if (index) top = Math.max(top, (groups[index - 1].at(-1).lines[4] + first.lines[0]) / 2);
    if (index < groups.length - 1) bottom = Math.min(bottom, (last.lines[4] + groups[index + 1][0].lines[0]) / 2);
    return { id: `system-${index + 1}`, index, rect: normalizeCropRect({ x: left, y: top, width: right - left, height: bottom - top }, width, height), staffs: group, confidence: group.reduce((s, staff) => s + staff.confidence, 0) / group.length };
  });
  const warnings = [];
  if (!systems.length) warnings.push('未能可靠找到五线谱行。可框选清晰区域，或先识别当前整页。');
  else if (systems.some(s => s.staffs.length === 1)) warnings.push('部分谱行只检测到单个谱表，请核对左右手是否被完整保留；可手动框选调整。');
  else warnings.push('自动分行仅依据谱线几何，请检查每块是否完整包含两只手、谱号和上下加线。');
  const firstStaff = staffs[0], contextBottom = firstStaff ? Math.max(0, Math.floor(firstStaff.lines[0] - firstStaff.spacing * 1.8)) : 0;
  const contextRect = contextBottom > 12 ? { x: 0, y: 0, width, height: contextBottom } : null;
  let darkPixels = 0;
  for (const value of gray) if (value < threshold) darkPixels++;
  const layout = { width, height, systems, staffs, nonStaffLineGroups, contextRect, warnings, darkFraction: darkPixels / gray.length };
  if (options.includeAssessment !== false) layout.assessment = assessScoreImage(null, { ...options, layout });
  return layout;
}

/** Geometric confidence is not instrument identity or a calibrated accuracy estimate. */
export function assessScoreImage(image, { layout, confirmedPiano = false, pianoSourceVerified = false, sourceLabel = '' } = {}) {
  layout ||= detectScoreSystems(image, { includeAssessment: false });
  const isValidStaff = staff => staff.lineThicknessRatio <= .42 && staff.offLineInk > 0 && staff.noteLikeComponents > 0;
  const validStaffs = layout.staffs.filter(isValidStaff);
  const musicalSymbols = validStaffs.reduce((sum, staff) => sum + staff.noteLikeComponents, 0);
  const hasStaffNotation = validStaffs.length > 0 && musicalSymbols >= 2;
  const grandSystems = layout.systems.filter(system => system.staffs.length === 2 && system.staffs.every(isValidStaff) && system.staffs.reduce((sum, staff) => sum + staff.noteLikeComponents, 0) >= 2);
  const hasGrandStaff = hasStaffNotation && grandSystems.length > 0;
  const nonStandardLines = Boolean(layout.nonStaffLineGroups?.length);
  const photographLike = layout.darkFraction > .36;
  const evidence = [];
  if (hasStaffNotation) evidence.push({ kind: 'staff-geometry', count: validStaffs.length });
  if (hasGrandStaff) evidence.push({ kind: 'paired-staff-geometry', count: grandSystems.length, instrumentProven: false });
  if (nonStandardLines) evidence.push({ kind: 'six-or-more-parallel-lines', count: layout.nonStaffLineGroups.length });
  let classification, reasonCode, message;
  if (nonStandardLines) { classification = 'non-piano-notation'; reasonCode = 'NON_PIANO_LINE_NOTATION'; message = '检测到六线或多线结构，可能是吉他谱；没有确认这是钢琴双手五线谱，请更换谱面。'; }
  else if (!hasStaffNotation || photographLike) { classification = 'not-score'; reasonCode = 'NO_STAFF_NOTATION'; message = '没有检测到可验证的五线谱和音符。钢琴照片、封面或无关图片不能用于识谱，请换成清晰谱面。'; }
  else if (!hasGrandStaff) { classification = 'staff-score-unverified'; reasonCode = 'GRAND_STAFF_UNCONFIRMED'; message = '检测到五线谱，但没有确认完整的钢琴双手谱表；请提供同时包含高低音谱表的钢琴谱。'; }
  else { classification = 'piano-grand-staff-candidate'; reasonCode = 'PIANO_INSTRUMENT_UNCONFIRMED'; message = '检测到含音符的双谱表，但几何不能证明乐器是钢琴。请对照谱头和来源确认这是钢琴双手谱。'; }
  const suitableGeometry = hasGrandStaff && !nonStandardLines && !photographLike;
  const verification = suitableGeometry && pianoSourceVerified === true ? 'source' : suitableGeometry && confirmedPiano === true ? 'user' : 'none';
  if (verification !== 'none') {
    classification = 'piano-score-verified'; reasonCode = verification === 'source' ? 'PIANO_SOURCE_VERIFIED' : 'PIANO_USER_CONFIRMED';
    message = verification === 'source' ? '检测到双谱表，钢琴独奏身份由可信来源栏目确认；音符仍需试听校对。' : '检测到双谱表，钢琴双手身份已由你对照来源确认；音符仍需试听校对。';
    evidence.push({ kind: verification === 'source' ? 'trusted-source-instrument' : 'user-instrument-confirmation', instrument: 'piano solo', ...(verification === 'source' ? { label: String(sourceLabel).slice(0, 300) } : {}) });
  }
  return { classification, reasonCode, message, hasStaffNotation, hasGrandStaff, pianoVerified: verification !== 'none', verification,
    canRequestOcr: verification !== 'none', canAutoRecognize: verification === 'source', evidence,
    confidence: { staff: hasStaffNotation ? Math.min(...validStaffs.map(s => s.confidence)) : 0, grandStaff: hasGrandStaff ? .8 : 0, instrument: verification === 'source' ? .9 : verification === 'user' ? .75 : 0 }, confidenceKind: 'heuristic-not-calibrated' };
}

export function planScoreImageChunks(layout, { selectedSystemIds } = {}) {
  if (!layout || !Number.isFinite(layout.width) || !Number.isFinite(layout.height)) throw new Error('谱面布局无效。');
  if (Array.isArray(selectedSystemIds) && !selectedSystemIds.length) return [];
  if (!layout.systems?.length) return [{ id: 'page-1', label: '当前整页（未自动分行）', rect: { x: 0, y: 0, width: layout.width, height: layout.height }, systemIndices: [], contextRect: layout.contextRect ?? null, page: 1, warnings: ['未检测到可靠谱行，需核对整页或手动选择范围。'] }];
  const ids = selectedSystemIds === undefined ? null : new Set(selectedSystemIds);
  return layout.systems.filter(s => !ids || ids.has(s.id)).map(s => ({ id: s.id, label: `第 ${s.index + 1} 行${s.staffs.length > 1 ? ' · 双手' : ' · 单谱表'}`, rect: s.rect, systemIndices: [s.index], contextRect: layout.contextRect ?? null, page: 1, warnings: [] }));
}
