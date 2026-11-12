import { isIOSApp, nativeBridge, createApplePurchases } from "./native.js";

// Resume unfinished purchases after any successful sign-in, without prompting for Apple credentials.
// The subscription page has its own visible coordinator, so it owns its transaction events.
export function attachNativePurchases(client) {
  if (!isIOSApp() || /\/subscription\.html$/.test(location.pathname))
    return () => {};
  let bridge;
  try {
    bridge = nativeBridge();
  } catch {
    return () => {};
  }
  const purchases = createApplePurchases({ client, bridge });
  let generation = -1;
  let disposed = false;
  let suspended = false;
  const eligible = () =>
    !disposed && !suspended && client.session?.user.state === "active";
  const report = (detail, epoch) => {
    if (eligible() && epoch === client.epoch)
      window.dispatchEvent(new CustomEvent("qinban:purchase-sync", { detail }));
  };
  const resume = () => {
    if (!eligible() || generation === client.epoch) return;
    generation = client.epoch;
    const epoch = generation;
    void purchases
      .syncTransactions()
      .then((result) => report(result, epoch))
      .catch((error) =>
        report({ synced: 0, failures: [error.message] }, epoch),
      );
  };
  const onTransaction = (event) => {
    if (!eligible()) return;
    const epoch = client.epoch;
    void purchases
      .submit(event.detail, epoch)
      .then(() => report({ synced: 1, failures: [] }, epoch))
      .catch((error) =>
        report({ synced: 0, failures: [error.message] }, epoch),
      );
  };
  const unsubscribe = client.subscribe(resume);
  window.addEventListener("qinban:transaction", onTransaction);
  const onPageHide = (event) => {
    if (event.persisted) suspended = true;
    else stop();
  };
  const onPageShow = (event) => {
    if (!event.persisted || disposed) return;
    suspended = false;
    generation = -1;
    resume();
  };
  const stop = () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    window.removeEventListener("qinban:transaction", onTransaction);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
  };
  // A cached page returns with the same JS objects. Suspend it while hidden and
  // keep its identity listener so sign-in after a BFCache restore still syncs.
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  resume();
  return stop;
}
