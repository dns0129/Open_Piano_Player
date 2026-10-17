import {DEEPSEEK_RECOGNITION} from './deepseek-vision.mjs';
// Fixed provider policies shared by recognition and independent rereads.
export const SCORE_RECOGNITION = Object.freeze({
  engine: 'pi', model: 'gpt-6.1-sol', reasoningEffort: 'high',
  timeoutMs: 600000, maxTokens: 60000, localOmr: false,
});

export function recognitionEngine(value) {
  if(value==='deepseek')return 'deepseek';
  if (value === undefined || value === 'pi' || value === 'auto') return 'pi';
  const local = ['audiveris', 'omr'].includes(value);
  throw Object.assign(new Error(local
    ? '本机 OMR 已停用；谱面识别统一使用 GPT-6.1 Sol high。'
    : '识谱引擎无效。'), {code: local ? 'LOCAL_OMR_DISABLED' : 'INVALID_RECOGNITION_ENGINE', status: 422, public: true, expose: true});
}

/** Fail before transmission if an SDK/provider changes the pinned request. */
export function recognitionStream(streamSimple, onRequest = () => {}) {
  return (model, context, options = {}) => {
    if (model.id !== SCORE_RECOGNITION.model) throw new Error('Recognition model mismatch');
    return streamSimple(model, context, {
      ...options, reasoning: SCORE_RECOGNITION.reasoningEffort, transport: 'sse',
      timeoutMs: SCORE_RECOGNITION.timeoutMs, maxRetries: 0, maxTokens: SCORE_RECOGNITION.maxTokens,
      onPayload: payload => {
        if (payload.model !== SCORE_RECOGNITION.model || payload.reasoning?.effort !== SCORE_RECOGNITION.reasoningEffort) {
          throw new Error('Recognition request model/reasoning mismatch');
        }
        onRequest({model: payload.model, reasoningEffort: payload.reasoning.effort});
      },
    });
  };
}

export const recognitionPolicy=engine=>engine==='deepseek'?DEEPSEEK_RECOGNITION:SCORE_RECOGNITION;
