// @ts-check
// One JSON object per line on stderr, for failures an operator must be able to
// find later. Callers pass identifiers (request, owner, order ids) and the error;
// never request bodies, tokens, passwords or provider credentials.
// QINBAN_LOG=silent turns logging off (the test suite sets it).

/** @param {unknown} error */
function describe(error, withStack = false) {
  if (!(error instanceof Error))
    return { message: String(error).slice(0, 300) };
  const e = /** @type {Error & { code?: unknown }} */ (error);
  return {
    name: e.name,
    ...(typeof e.code === "string" ? { code: e.code } : {}),
    message: e.message.slice(0, 300),
    ...(withStack && e.stack ? { stack: e.stack.split("\n").slice(0, 8) } : {}),
  };
}

/**
 * @param {{ write?: (line: string) => void, now?: () => Date, silent?: boolean }} [options]
 */
export function createLogger({
  write = (line) => process.stderr.write(line + "\n"),
  now = () => new Date(),
  silent = process.env.QINBAN_LOG === "silent",
} = {}) {
  /** @param {"info" | "warn" | "error"} level */
  const emit =
    (level) =>
    /** @param {string} event @param {Record<string, unknown>} [fields] */
    (event, fields = {}) => {
      if (silent) return;
      const { error, ...rest } = fields;
      write(
        JSON.stringify({
          time: now().toISOString(),
          level,
          event,
          ...rest,
          ...(error !== undefined
            ? { error: describe(error, level === "error") }
            : {}),
        }),
      );
    };
  return { info: emit("info"), warn: emit("warn"), error: emit("error") };
}

export const log = createLogger();
