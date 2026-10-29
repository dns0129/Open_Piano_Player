// The one HTML escaper for markup built from strings. Every interpolated value
// that is not trusted markup must pass through it; null and undefined render empty.
const ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const escapeHTML = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);
