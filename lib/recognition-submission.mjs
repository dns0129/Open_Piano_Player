import {decodeCompactRegion} from './recognition-wire.mjs';
import {validateRegionResult} from './score-region.mjs';

export const MAX_RECOGNITION_CALLS = 2; // First read + at most one repair/fallback.
const hint = '仅按原图核对这些位置；不要为凑拍补写音符或休止。不确定时保留疑点并请求清晰来源。';

export function recognitionIssues(error) {
  return error.issues || [{code: error.code || 'INVALID_REGION_SCORE', path: 'score', message: error.expose ? error.message : '音符、时值或演奏字段不符合乐谱约束，请核对原图。'}];
}

// The same acceptance seam is used by tool and JSON adapters. Invalid but
// decodable musical data remains available for manual correction, never passed.
export function createRegionSubmission(request, {onSubmission = async () => {}} = {}) {
  let accepted, candidate, attempts = 0, lastError;
  const history = [];
  return {
    get attempts() { return attempts; },
    get result() { return accepted; },
    get exhausted() { return attempts >= MAX_RECOGNITION_CALLS; },
    get history() { return structuredClone(history); },
    async submit(raw) {
      if (accepted || attempts >= MAX_RECOGNITION_CALLS) return {isError: true, terminate: true, content: [{type:'text',text:'本次提交已结束；已保留结果，不能继续自动补救。'}]};
      attempts++;
      let issues = [];
      try {
        const decoded = decodeCompactRegion(raw, request);
        const checked = validateRegionResult(decoded, request.region, request.metadata, {requirePositions:request.pass !== 'verify'});
        if(request.requireNotation&&!checked.score.recognitionEvidence){checked.checks.errors.push({code:'WRITTEN_EVIDENCE_MISSING',message:'新识别缺少原谱音名、谱号和休止证据；保留为待校对结果。'});checked.checks.passed=false;checked.reviewStatus='needs-correction';}
        candidate = {...decoded, ...checked,notationRequired:request.requireNotation===true};
        issues = checked.checks.errors.map(issue => ({path: issue.noteId ? `notes.${issue.noteId}` : issue.measure ? `bars[${issue.measure - 1}]` : 'coverage', ...issue}));
        if (!issues.length) accepted = candidate;
      } catch (error) { lastError = error; issues = recognitionIssues(error); }
      const record = {attempt: attempts, stage: attempts === 1 ? 'first' : 'repair', recordedAt:new Date().toISOString(), raw:structuredClone(raw), accepted:!!accepted, issues};
      history.push(record);
      await onSubmission(record);
      return {
        content:[{type:'text',text: accepted ? '谱行结构已接收；仍需对照原图确认音符。' : JSON.stringify({issues,remainingRepairs:MAX_RECOGNITION_CALLS-attempts,instruction:hint})}],
        details:{accepted:!!accepted,issues}, isError:!accepted,
        terminate:!!accepted || attempts >= MAX_RECOGNITION_CALLS || lastError?.code==='INCOMPLETE_REGION',
      };
    },
    finish() {
      if (accepted || candidate) return {...(accepted || candidate), submissionAudit:structuredClone(history)};
      throw Object.assign(new Error(lastError?.message || '模型没有提交可保存的完整谱行。'), {
        code: lastError?.code || 'NO_REGION_RESULT', expose:true, status:422,
        issues: lastError ? recognitionIssues(lastError) : [], submissionAudit:structuredClone(history),
      });
    },
  };
}
