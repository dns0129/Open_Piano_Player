// Hand a generated file to the person. A desktop browser downloads it. On a
// phone or tablet the system share sheet is the dependable route: it saves to
// Files, prints, or opens the file in another app, where an <a download> would
// replace an installed web app with the file or be ignored by in-app browsers.

/** Touch-first device with a share sheet that takes files. */
export function sharesFiles(nav = globalThis.navigator) {
  return (
    typeof nav?.share === "function" &&
    typeof nav?.canShare === "function" &&
    Boolean(globalThis.matchMedia?.("(pointer: coarse)").matches)
  );
}

export function toFile(content, name, type) {
  return new File([content], name, { type });
}

function saveWithLink(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  // iOS reads the blob after the click returns; revoking at once cancels it.
  setTimeout(() => URL.revokeObjectURL(url), 60000).unref?.();
}

/**
 * Resolves to how the file left the page:
 * - "shared": the share sheet took it
 * - "cancelled": the person closed the share sheet
 * - "needs-tap": sharing must start from a fresh tap (the browser allows it
 *   only shortly after one); call again from a click handler
 * - "downloaded": a normal download was started
 */
export async function deliverFile(file, { nav = globalThis.navigator } = {}) {
  if (sharesFiles(nav) && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      if (error?.name === "NotAllowedError") return "needs-tap";
      // Anything else: fall back to a download.
    }
  }
  saveWithLink(file);
  return "downloaded";
}
