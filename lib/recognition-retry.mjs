/**
 * Classifies a failed model call and decides whether it may be retried automatically.
 * Retries are bounded per type; rate limits and missing balance/authorization never
 * retry (they pause the run instead), and an upstream Bad Request is not repeated.
 */
export const RETRY_LIMITS = Object.freeze({ connection: 2, timeout: 1, 'no-result': 1, 'bad-request': 0, 'rate-limit': 0, account: 0, cancelled: 0, other: 0 });

const CONNECTION_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE', 'EAI_AGAIN', 'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'NETEASE_TIMEOUT']);
const NO_RESULT_CODES = new Set(['INVALID_SCORE', 'INCOMPLETE_REGION', 'INVALID_REGION_RESULT', 'NO_STRUCTURED_RESULT']);
const ACCOUNT_CODES = new Set(['MODEL_BALANCE_REQUIRED', 'DEEPSEEK_AUTH_REQUIRED', 'PI_IMAGE_MODEL_REQUIRED']);

export function classifyRecognitionError(error, { cancelled = false } = {}) {
  if (cancelled) return 'cancelled';
  const code = typeof error?.code === 'string' ? error.code : '';
  const status = Number(error?.status ?? error?.statusCode ?? error?.upstreamStatus);
  const message = String(error?.message || '');
  if (error?.name === 'TimeoutError' || code === 'MODEL_TIMEOUT' || code === 'RECOGNITION_TIMEOUT') return 'timeout';
  if (code === 'MODEL_RATE_LIMIT' || status === 429) return 'rate-limit';
  if (ACCOUNT_CODES.has(code) || status === 401 || status === 402 || status === 403) return 'account';
  if (status === 400 || status === 413 || status === 422 && !NO_RESULT_CODES.has(code) || code === 'MODEL_BAD_REQUEST') return 'bad-request';
  if (NO_RESULT_CODES.has(code) || /未提交结构化乐谱|no structured/i.test(message)) return 'no-result';
  if (CONNECTION_CODES.has(code) || CONNECTION_CODES.has(error?.cause?.code) || status >= 500 && status < 600 || /fetch failed|socket hang up|network/i.test(message)) return 'connection';
  return 'other';
}

/** Backoff before retry `attempt` (1-based) of a given type, in milliseconds. */
export function retryDelay(type, attempt, base = 1000) {
  return type === 'connection' ? base * 2 ** (attempt - 1) : type === 'timeout' ? base : 0;
}
