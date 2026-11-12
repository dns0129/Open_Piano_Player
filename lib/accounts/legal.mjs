// @ts-check
// Only explicitly public operator information is included in this response.
export function publicLegalInformation(env = process.env) {
  const operatorName = String(env.QINBAN_OPERATOR_NAME || "")
    .trim()
    .slice(0, 200);
  const contactEmail = String(env.QINBAN_SUPPORT_EMAIL || "").trim();
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
    throw Error("QINBAN_SUPPORT_EMAIL must be a valid public support address");
  let processors = [];
  if (env.QINBAN_PRIVACY_PROCESSORS) {
    try {
      processors = JSON.parse(env.QINBAN_PRIVACY_PROCESSORS);
    } catch {
      throw Error("QINBAN_PRIVACY_PROCESSORS must be a JSON array");
    }
    if (
      !Array.isArray(processors) ||
      processors.length > 20 ||
      processors.some(
        (p) =>
          typeof p?.name !== "string" ||
          !p.name.trim() ||
          p.name.length > 200 ||
          typeof p.purpose !== "string" ||
          !p.purpose.trim() ||
          p.purpose.length > 500 ||
          typeof p.privacyUrl !== "string" ||
          !/^https:\/\//.test(p.privacyUrl),
      )
    )
      throw Error("Privacy processors need name, purpose and HTTPS privacyUrl");
    processors = processors.map(({ name, purpose, privacyUrl }) => ({
      name,
      purpose,
      privacyUrl,
    }));
  }
  return {
    version: "2026-11-12",
    operatorName,
    contactEmail,
    processors,
    complete: Boolean(operatorName && contactEmail && processors.length),
  };
}
