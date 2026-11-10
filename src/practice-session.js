// What a device does around a practice session, outside the page itself:
// keep the screen awake while the score is on the stand, and answer the
// lock-screen, headset and keyboard media buttons.
export function createPracticeSession({
  onPlay,
  onPause,
  onRestart,
  nav = globalThis.navigator,
  doc = globalThis.document,
} = {}) {
  const canKeepAwake = typeof nav?.wakeLock?.request === "function";
  const media = nav?.mediaSession;
  let wanted = false,
    lock = null,
    requesting = false,
    shownTitle;

  async function syncLock() {
    if (!canKeepAwake) return;
    try {
      if (wanted && !lock && !requesting && doc?.visibilityState !== "hidden") {
        requesting = true;
        const acquired = await nav.wakeLock.request("screen");
        requesting = false;
        // The browser releases the lock itself when the page is hidden.
        acquired.addEventListener?.("release", () => {
          if (lock === acquired) lock = null;
        });
        lock = acquired;
        if (!wanted) void syncLock();
      } else if (!wanted && lock) {
        const held = lock;
        lock = null;
        await held.release();
      }
    } catch {
      // Low battery or a denied request: the screen follows the system timeout.
      requesting = false;
    }
  }
  // A released lock is not restored by the browser when the page returns.
  doc?.addEventListener?.("visibilitychange", () => void syncLock());

  if (media?.setActionHandler) {
    for (const [action, handler] of [
      ["play", onPlay],
      ["pause", onPause],
      ["previoustrack", onRestart],
    ]) {
      try {
        media.setActionHandler(action, handler ? () => handler() : null);
      } catch {
        /* This browser does not offer the action. */
      }
    }
  }

  return {
    canKeepAwake,
    update({ active, playing, keepAwake, title, artist }) {
      wanted = Boolean(active && (playing || keepAwake));
      void syncLock();
      if (!media) return;
      try {
        media.playbackState = playing ? "playing" : "paused";
        if (title !== shownTitle && typeof MediaMetadata === "function") {
          shownTitle = title;
          media.metadata = new MediaMetadata({
            title: title || "琴伴",
            artist: artist || "",
            album: "琴伴练习室",
          });
        }
      } catch {
        /* Media metadata is a convenience only. */
      }
    },
  };
}
