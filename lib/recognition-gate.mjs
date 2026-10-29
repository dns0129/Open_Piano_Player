/** One FIFO gate across jobs; aborting a queued call never spends a request. */
export function createRecognitionGate(limit = 100) {
  let active = 0;
  const queue = [];
  const pump = () => {
    while (active < limit && queue.length) {
      const next = queue.shift();
      if (next.signal.aborted) {
        next.reject(next.signal.reason);
        continue;
      }
      next.signal.removeEventListener("abort", next.abort);
      active++;
      next.resolve(() => {
        active--;
        pump();
      });
    }
  };
  return async function run(work, signal) {
    signal.throwIfAborted();
    const release = await new Promise((resolve, reject) => {
      const item = {
        resolve,
        reject,
        signal,
        abort() {
          const i = queue.indexOf(item);
          if (i >= 0) queue.splice(i, 1);
          reject(signal.reason);
        },
      };
      queue.push(item);
      signal.addEventListener("abort", item.abort, { once: true });
      pump();
    });
    try {
      signal.throwIfAborted();
      return await work();
    } finally {
      release();
    }
  };
}
